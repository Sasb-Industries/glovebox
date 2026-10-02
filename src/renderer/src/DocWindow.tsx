import { useEffect, useRef, useState } from 'react'
import type { TabState } from '../../shared/types'
import { findShortcut, keyPressFrom } from '../../shared/shortcuts'
import { describeUrl } from './files'
import { isMac, useBindings } from './prefs'
import { DocView } from './Workspace'

const TYPE_NAMES: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Docs',
  'application/vnd.google-apps.spreadsheet': 'Google Sheets',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/vnd.google-apps.form': 'Google Forms',
  'application/vnd.google-apps.drawing': 'Google Drawings'
}

/** A window holding one document and nothing else, like a Word window. */
export function DocWindow({ initial, partition }: { initial: TabState; partition: string }) {
  const [tab, setTab] = useState({ ...initial, key: 'doc', loaded: true })
  const bindings = useBindings()

  // The window title reads like Word's: "Essay - Google Docs".
  useEffect(() => {
    const type = TYPE_NAMES[tab.mimeType] ?? describeUrlType(tab.url)
    document.title = type ? `${tab.title} - ${type}` : tab.title
  }, [tab.title, tab.mimeType, tab.url])

  useEffect(() => window.glovebox.updateWindow([tab], 0), [tab])

  // Google links inside the document open as their own document windows.
  useEffect(() => window.glovebox.onOpenUrl((url) => window.glovebox.openDocWindow({ ...describeUrl(url), title: 'Loading…', url })), [])

  // "Close tab" closes the window; the other tab shortcuts have nothing to do here.
  const bindingsRef = useRef(bindings)
  bindingsRef.current = bindings
  useEffect(() => {
    const run = (id: string | undefined) => id === 'close-tab' && window.close()
    const onKeyDown = (e: KeyboardEvent) => run(findShortcut(bindingsRef.current, keyPressFrom(e), isMac, 'app'))
    window.addEventListener('keydown', onKeyDown)
    const stop = window.glovebox.onShortcut(run)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      stop()
    }
  }, [])

  return (
    <div className="doc-window">
      <DocView tab={tab} partition={partition} visible onTitle={(title) => setTab((t) => ({ ...t, title }))} />
    </div>
  )
}

const describeUrlType = (url: string) => TYPE_NAMES[describeUrl(url).mimeType]
