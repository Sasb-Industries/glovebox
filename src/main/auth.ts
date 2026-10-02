// Drive API sign-in: OAuth in the system browser (loopback redirect + PKCE), as Google requires
// for desktop apps. See docs/adr/0002-two-step-sign-in.md.
import { app, safeStorage, shell } from 'electron'
import { createServer } from 'node:http'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECONNECT, type Profile, type ProfileList } from '../shared/types'

const CLIENT_ID = import.meta.env.GLOVEBOX_GOOGLE_CLIENT_ID
const CLIENT_SECRET = import.meta.env.GLOVEBOX_GOOGLE_CLIENT_SECRET
const SCOPE = 'https://www.googleapis.com/auth/drive'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface StoredProfile extends Profile {
  refreshToken: string // base64; encrypted with safeStorage when available
  encrypted: boolean
}

interface Store {
  activeId: string | null
  profiles: StoredProfile[]
}

const storePath = () => join(app.getPath('userData'), 'profiles.json')
const legacyPath = () => join(app.getPath('userData'), 'profile.json')
const accessTokens = new Map<string, { value: string; expiresAt: number }>()

export const hasCredentials = () => Boolean(CLIENT_ID && CLIENT_SECRET)

function readStore(): Store {
  if (existsSync(storePath())) return JSON.parse(readFileSync(storePath(), 'utf8'))
  // Before multiple profiles, the single profile lived in profile.json.
  if (existsSync(legacyPath())) {
    const legacy: StoredProfile = JSON.parse(readFileSync(legacyPath(), 'utf8'))
    const store = { activeId: legacy.id, profiles: [legacy] }
    writeStore(store)
    rmSync(legacyPath())
    return store
  }
  return { activeId: null, profiles: [] }
}

const writeStore = (store: Store) => writeFileSync(storePath(), JSON.stringify(store, null, 2))
const publicProfile = ({ id, email, name }: StoredProfile): Profile => ({ id, email, name })

export function listProfiles(): ProfileList {
  const { activeId, profiles } = readStore()
  return { activeId, profiles: profiles.map(publicProfile) }
}

export function getProfile(): Profile | null {
  const { activeId, profiles } = readStore()
  const active = profiles.find((p) => p.id === activeId)
  return active ? publicProfile(active) : null
}

export function setActiveProfile(id: string) {
  const store = readStore()
  if (store.profiles.some((p) => p.id === id)) writeStore({ ...store, activeId: id })
}

/** Forgets a profile. If it was active, the next remaining profile (if any) becomes active. */
export function removeProfile(id: string) {
  const store = readStore()
  const profiles = store.profiles.filter((p) => p.id !== id)
  writeStore({ profiles, activeId: store.activeId === id ? (profiles[0]?.id ?? null) : store.activeId })
  accessTokens.delete(id)
}

const base64url = (buf: Buffer) => buf.toString('base64url')

/** Signs in with Google and makes that account the active profile (adding it if it's new). */
export async function signIn(): Promise<Profile> {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))
  const { code, redirectUri } = await waitForCode(state, challenge)

  const tokens = await postToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  })
  if (!tokens.refresh_token) throw new Error('Google did not return a refresh token.')

  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  })
  const { user } = await res.json()

  // Reconnecting an existing account keeps its id, and therefore its web session partition.
  const store = readStore()
  const existing = store.profiles.find((p) => p.email === user.emailAddress)
  const id = existing?.id ?? randomUUID()
  const encrypted = safeStorage.isEncryptionAvailable()
  const refreshToken = encrypted
    ? safeStorage.encryptString(tokens.refresh_token).toString('base64')
    : Buffer.from(tokens.refresh_token).toString('base64')
  const profile: StoredProfile = { id, email: user.emailAddress, name: user.displayName, refreshToken, encrypted }
  writeStore({ activeId: id, profiles: [...store.profiles.filter((p) => p.id !== id), profile] })
  accessTokens.set(id, { value: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 })
  return publicProfile(profile)
}

/** An access token for the active profile. */
export async function getAccessToken(): Promise<string> {
  const { activeId, profiles } = readStore()
  const stored = profiles.find((p) => p.id === activeId)
  if (!stored) throw new Error(RECONNECT)
  const cached = accessTokens.get(stored.id)
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.value
  const raw = Buffer.from(stored.refreshToken, 'base64')
  let refreshToken: string
  try {
    refreshToken = stored.encrypted ? safeStorage.decryptString(raw) : raw.toString()
  } catch {
    // The OS keychain entry isn't readable (e.g. a token saved by a dev build, read by the installed app).
    throw new Error(RECONNECT)
  }
  const tokens = await postToken({ grant_type: 'refresh_token', refresh_token: refreshToken })
  accessTokens.set(stored.id, { value: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 })
  return tokens.access_token
}

export function clearAccessToken() {
  const id = readStore().activeId
  if (id) accessTokens.delete(id)
}

async function postToken(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!, ...params })
  })
  const body = await res.json()
  // invalid_grant = the refresh token expired or was revoked (weekly in Testing mode).
  if (body.error === 'invalid_grant') throw new Error(RECONNECT)
  if (!res.ok) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error}`)
  return body as { access_token: string; expires_in: number; refresh_token?: string }
}

/** Opens Google's consent page in the system browser and waits for it to redirect back to us. */
function waitForCode(state: string, challenge: string): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let redirectUri = ''
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Sign-in timed out. Try again.'))
    }, 5 * 60_000)

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', redirectUri)
      if (url.pathname !== '/') return res.writeHead(404).end()
      const code = url.searchParams.get('code')
      const ok = code && url.searchParams.get('state') === state
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(
        `<body style="font-family:system-ui;display:grid;place-items:center;height:90vh">` +
          `<h2>${ok ? 'Signed in. You can close this tab and return to Glovebox.' : 'Sign-in was cancelled.'}</h2></body>`
      )
      clearTimeout(timeout)
      server.close()
      if (ok) resolve({ code, redirectUri })
      else reject(new Error(url.searchParams.get('error') ?? 'Sign-in was cancelled.'))
    })

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      redirectUri = `http://127.0.0.1:${port}`
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.search = new URLSearchParams({
        client_id: CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent select_account'
      }).toString()
      shell.openExternal(authUrl.toString())
    })
  })
}
