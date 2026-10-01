// Drive API sign-in: OAuth in the system browser (loopback redirect + PKCE), as Google requires
// for desktop apps. See docs/adr/0002-two-step-sign-in.md.
import { app, safeStorage, shell } from 'electron'
import { createServer } from 'node:http'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECONNECT, type Profile } from '../shared/types'

const CLIENT_ID = import.meta.env.GLOVEBOX_GOOGLE_CLIENT_ID
const CLIENT_SECRET = import.meta.env.GLOVEBOX_GOOGLE_CLIENT_SECRET
const SCOPE = 'https://www.googleapis.com/auth/drive'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface StoredProfile extends Profile {
  refreshToken: string // base64; encrypted with safeStorage when available
  encrypted: boolean
}

const profilePath = () => join(app.getPath('userData'), 'profile.json')
let accessToken: { value: string; expiresAt: number } | null = null

export const hasCredentials = () => Boolean(CLIENT_ID && CLIENT_SECRET)

function readStored(): StoredProfile | null {
  if (!existsSync(profilePath())) return null
  return JSON.parse(readFileSync(profilePath(), 'utf8'))
}

export function getProfile(): Profile | null {
  const stored = readStored()
  return stored && { id: stored.id, email: stored.email, name: stored.name }
}

export function signOut() {
  rmSync(profilePath(), { force: true })
  accessToken = null
}

const base64url = (buf: Buffer) => buf.toString('base64url')

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
  accessToken = { value: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 }

  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  })
  const { user } = await res.json()

  // Reconnecting the same account keeps its id, and therefore its web session partition.
  const previous = readStored()
  const id = previous && previous.email === user.emailAddress ? previous.id : randomUUID()
  const encrypted = safeStorage.isEncryptionAvailable()
  const refreshToken = encrypted
    ? safeStorage.encryptString(tokens.refresh_token).toString('base64')
    : Buffer.from(tokens.refresh_token).toString('base64')
  const profile: StoredProfile = { id, email: user.emailAddress, name: user.displayName, refreshToken, encrypted }
  writeFileSync(profilePath(), JSON.stringify(profile, null, 2))
  return { id, email: profile.email, name: profile.name }
}

export async function getAccessToken(): Promise<string> {
  if (accessToken && accessToken.expiresAt - 60_000 > Date.now()) return accessToken.value
  const stored = readStored()
  if (!stored) throw new Error(RECONNECT)
  const raw = Buffer.from(stored.refreshToken, 'base64')
  const refreshToken = stored.encrypted ? safeStorage.decryptString(raw) : raw.toString()
  const tokens = await postToken({ grant_type: 'refresh_token', refresh_token: refreshToken })
  accessToken = { value: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 }
  return accessToken.value
}

export function clearAccessToken() {
  accessToken = null
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
        prompt: 'consent'
      }).toString()
      shell.openExternal(authUrl.toString())
    })
  })
}
