import { useEffect, useState } from 'react'
import type { Prefs, Profile, Theme } from '../../shared/types'
import { bindingFrom, defaultBindings, formatBinding, keyPressFrom, SHORTCUTS, type ShortcutId } from '../../shared/shortcuts'
import { isMac, setPrefs, useBindings, usePrefs } from './prefs'
import { useUpdateState } from './updates'

const THEME_GROUPS: { label: string; themes: [Theme, string][] }[] = [
  {
    label: 'Glovebox',
    themes: [
      ['system', 'Match system'],
      ['light', 'Light'],
      ['dim', 'Dim'],
      ['dark', 'Dark'],
      ['pastel', 'Pastel']
    ]
  },
  {
    label: 'Catppuccin',
    themes: [
      ['latte', 'Latte'],
      ['frappe', 'Frappé'],
      ['macchiato', 'Macchiato'],
      ['mocha', 'Mocha']
    ]
  }
]

interface Props {
  profile: Profile
  onSignOut: (profile: Profile) => Promise<void>
}

export function Settings({ profile, onSignOut }: Props) {
  const prefs = usePrefs()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const loadProfiles = () => void window.glovebox.listProfiles().then((l) => setProfiles(l.profiles))
  useEffect(loadProfiles, [])

  return (
    <div className="settings">
      <h1>Settings</h1>

      <section>
        <h2>Accounts</h2>
        {profiles.map((p) => (
          <div key={p.id} className="settings-row">
            <span className="avatar-dot">{(p.name || p.email)[0].toUpperCase()}</span>
            <span className="grow">
              <span>
                {p.email}
                {p.id === profile.id && <span className="muted"> · current</span>}
              </span>
            </span>
            {p.id !== profile.id && <button onClick={() => window.glovebox.switchProfile(p.id)}>Switch</button>}
            <button onClick={() => onSignOut(p).then(loadProfiles)}>Sign out</button>
          </div>
        ))}
        <button className="link" onClick={() => window.glovebox.signIn()}>
          + Add another account
        </button>
      </section>

      <section>
        <h2>General</h2>
        <Toggle
          label="Restore tabs when Glovebox opens"
          hint="Off: Glovebox always starts fresh. Restored tabs load when you click them."
          checked={prefs.restoreTabs}
          onChange={(restoreTabs) => setPrefs({ restoreTabs })}
        />
        <Toggle
          label="Open files in their own window"
          hint="Like double-clicking a Word file in Windows Explorer, instead of opening a tab."
          checked={prefs.openInOwnWindow}
          onChange={(openInOwnWindow) => setPrefs({ openInOwnWindow })}
        />
      </section>

      <section>
        <h2>Appearance</h2>
        {THEME_GROUPS.map((group) => (
          <div key={group.label} className="theme-group">
            <span className="theme-group-label">{group.label}</span>
            <div className="segmented">
              {group.themes.map(([theme, label]) => (
                <button key={theme} className={prefs.theme === theme ? 'on' : ''} onClick={() => setPrefs({ theme })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <ShortcutEditor prefs={prefs} />

      <SoftwareUpdates />
    </div>
  )
}

function Toggle(props: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="settings-row toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="grow">
        {props.label}
        <span className="hint">{props.hint}</span>
      </span>
    </label>
  )
}

/** Click Change, press the new keys. A key already used elsewhere moves to the new action. */
function ShortcutEditor({ prefs }: { prefs: Prefs }) {
  const bindings = useBindings()
  const [capturing, setCapturing] = useState<ShortcutId | null>(null)
  const [note, setNote] = useState<string | null>(null)

  function save(id: ShortcutId, binding: string) {
    const next = { ...bindings, [id]: binding }
    const taken = SHORTCUTS.filter((s) => s.id !== id && next[s.id] === binding)
    for (const s of taken) next[s.id] = ''
    setNote(taken.length ? `Removed ${formatBinding(binding, isMac)} from “${taken.map((s) => s.label).join('”, “')}”.` : null)
    // Store only what differs from the defaults.
    const defaults = defaultBindings(isMac)
    const shortcuts = Object.fromEntries(SHORTCUTS.filter((s) => next[s.id] !== defaults[s.id]).map((s) => [s.id, next[s.id]]))
    setPrefs({ shortcuts })
    setCapturing(null)
  }

  function onCaptureKey(e: React.KeyboardEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!capturing) return
    if (e.key === 'Escape') return setCapturing(null)
    const binding = bindingFrom(keyPressFrom(e), isMac)
    if (binding) save(capturing, binding)
  }

  return (
    <section>
      <h2>Keyboard shortcuts</h2>
      <p className="hint">
        Click Change, then press the keys you want. Escape cancels. Tab switching and closing work even while you're typing in a
        document; the rest work in the file list.
      </p>
      <div className="shortcut-table">
        {SHORTCUTS.map((s) => (
          <div key={s.id} className="settings-row">
            <span className="grow">{s.label}</span>
            {capturing === s.id ? (
              <button className="capture" autoFocus onKeyDown={onCaptureKey} onBlur={() => setCapturing(null)}>
                Press keys…
              </button>
            ) : (
              <kbd>{formatBinding(bindings[s.id], isMac)}</kbd>
            )}
            <button onClick={() => setCapturing(s.id)}>Change</button>
          </div>
        ))}
      </div>
      {note && <p className="hint">{note}</p>}
      <button
        disabled={!Object.keys(prefs.shortcuts).length}
        onClick={() => {
          setPrefs({ shortcuts: {} })
          setNote(null)
        }}
      >
        Reset to defaults
      </button>
    </section>
  )
}

function SoftwareUpdates() {
  const update = useUpdateState()
  if (!update) return null
  const { status, current, latest, progress, error } = update
  return (
    <section>
      <h2>Software updates</h2>
      <div className="settings-row">
        <span className="grow">
          <span>Glovebox {current}</span>
          <span className="hint">
            {status === 'dev' && 'Running from source — updates come from git pull, not here.'}
            {status === 'idle' && 'Checks for updates once a day.'}
            {status === 'checking' && 'Checking…'}
            {status === 'up-to-date' && "You're up to date."}
            {status === 'available' && `Version ${latest} is available.`}
            {status === 'downloading' && `Downloading ${latest}… ${progress ?? 0}%`}
            {status === 'ready' &&
              (isMac
                ? `Version ${latest} is in your Downloads folder. Drag Glovebox into Applications, replacing the old one, then reopen it.`
                : `Version ${latest} is ready.`)}
            {status === 'error' && `Couldn't check for updates: ${error}`}
          </span>
        </span>
        {status === 'available' && (
          <button className="primary" onClick={() => window.glovebox.installUpdate()}>
            {isMac ? 'Download' : 'Download and install'}
          </button>
        )}
        {status === 'ready' && (
          <button className="primary" onClick={() => window.glovebox.restartToUpdate()}>
            {isMac ? 'Open installer' : 'Restart to update'}
          </button>
        )}
        {['idle', 'up-to-date', 'error'].includes(status) && (
          <button onClick={() => window.glovebox.checkForUpdates()}>Check for updates</button>
        )}
      </div>
    </section>
  )
}
