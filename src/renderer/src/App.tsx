import { useCallback, useEffect, useState } from 'react'
import { RECONNECT, type AppStatus, type WindowInit } from '../../shared/types'
import { DocWindow } from './DocWindow'
import { Workspace } from './Workspace'

export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [webLoginSkipped, setWebLoginSkipped] = useState(false)

  const [init, setInit] = useState<WindowInit | null>(null)

  const refreshStatus = useCallback(() => window.glovebox.status().then(setStatus), [])
  useEffect(() => void refreshStatus(), [refreshStatus])
  useEffect(() => void window.glovebox.initWindow().then(setInit), [])

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      await window.glovebox.signIn()
      setNeedsReconnect(false)
      setRefreshKey((k) => k + 1)
      await refreshStatus()
    } catch (e) {
      setError(String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(false)
    }
  }

  /** Returns true when the error was an expired sign-in (handled by showing the reconnect banner). */
  const onAuthError = useCallback((e: unknown) => {
    const expired = String((e as Error)?.message).includes(RECONNECT)
    if (expired) setNeedsReconnect(true)
    return expired
  }, [])

  if (!status || !init) return null

  if (status.kind === 'needs-credentials')
    return (
      <Card title="Google credentials missing">
        <p>
          Glovebox needs your own Google Cloud OAuth client. Follow <code>docs/google-cloud-setup.md</code>, put the
          Client ID and secret in a <code>.env</code> file in the repo root, then restart <code>npm run dev</code>.
        </p>
      </Card>
    )

  if (status.kind === 'signed-out')
    return (
      <Card title="Welcome to Glovebox">
        <p>The file explorer Google Drive forgot to ship.</p>
        <button className="primary" onClick={signIn} disabled={busy}>
          {busy ? 'Waiting for your browser…' : 'Sign in with Google'}
        </button>
        {busy && <p className="muted">Finish signing in in the browser window that just opened.</p>}
        {error && <p className="error">{error}</p>}
      </Card>
    )

  if (init.kind === 'doc' && init.tabs[0])
    return <DocWindow initial={init.tabs[0]} partition={partitionFor(status.profile.id)} />

  if (!status.webSignedIn && !webLoginSkipped)
    return (
      <WebLogin
        email={status.profile.email}
        partition={partitionFor(status.profile.id)}
        onDone={refreshStatus}
        onSkip={() => setWebLoginSkipped(true)}
      />
    )

  return (
    <div className="app">
      {needsReconnect && (
        <div className="banner">
          Your Google sign-in expired (this happens weekly while Glovebox is in Testing mode).
          <button className="primary" onClick={signIn} disabled={busy}>
            {busy ? 'Waiting for your browser…' : 'Reconnect'}
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      )}
      <Workspace
        init={init}
        profile={status.profile}
        partition={partitionFor(status.profile.id)}
        refreshKey={refreshKey}
        onAuthError={onAuthError}
      />
    </div>
  )
}

export const partitionFor = (profileId: string) => `persist:profile-${profileId}`

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="center">
      <div className="card">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  )
}

/** Step 2 of sign-in: a normal Google web login so the editors load inside Glovebox. */
function WebLogin(props: { email: string; partition: string; onDone: () => void; onSkip: () => void }) {
  const { email, partition, onDone, onSkip } = props
  const ref = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return
      el.addEventListener('did-navigate', (e) => {
        if (new URL((e as unknown as { url: string }).url).hostname === 'drive.google.com') onDone()
      })
    },
    [onDone]
  )
  const src = `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent('https://drive.google.com/drive/my-drive')}&Email=${encodeURIComponent(email)}`
  return (
    <div className="weblogin">
      <div className="weblogin-bar">
        <span>
          One more step: sign in to Google as <b>{email}</b> so your documents open inside Glovebox.
        </span>
        <button onClick={onSkip}>Skip</button>
      </div>
      <webview ref={ref} src={src} partition={partition} />
    </div>
  )
}
