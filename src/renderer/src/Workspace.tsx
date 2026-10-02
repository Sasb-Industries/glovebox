import { useCallback, useEffect, useRef, useState } from 'react'
import type { DriveFile, Profile } from '../../shared/types'
import { ExplorerArea, type ExplorerAreaHandle } from './ExplorerArea'
import { SECTION_LABELS, type Section } from './location'
import { cleanTitle, describeUrl, iconUrl, openUrlFor } from './files'

interface Tab {
  key: string
  fileId: string | null
  title: string
  mimeType: string
  url: string
}

const FILES = 'files'

interface Props {
  profile: Profile
  partition: string
  refreshKey: number
  onAuthError: (e: unknown) => boolean
  onSignOut: () => void
}

/** The rail (Files + doc tabs) and whichever view is active: the explorer or one doc. */
export function Workspace({ profile, partition, refreshKey, onAuthError, onSignOut }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string>(FILES)
  const [flashing, setFlashing] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('my-drive')
  const explorer = useRef<ExplorerAreaHandle>(null)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('railCollapsed') === '1')

  useEffect(() => localStorage.setItem('railCollapsed', collapsed ? '1' : '0'), [collapsed])

  /** Opens a tab, or focuses (and flashes) the one already showing this file. */
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const openTab = useCallback((tab: Omit<Tab, 'key'>, forceNew = false) => {
    const existing = !forceNew && tab.fileId && tabsRef.current.find((t) => t.fileId === tab.fileId)
    if (existing) {
      setActive(existing.key)
      setFlashing(existing.key)
      return
    }
    const key = `${tab.fileId ?? 'url'}:${crypto.randomUUID()}`
    setTabs((ts) => [...ts, { ...tab, key }])
    setActive(key)
  }, [])

  const openFile = useCallback(
    (file: DriveFile, forceNew: boolean) =>
      openTab({ fileId: file.id, title: file.name, mimeType: file.mimeType, url: openUrlFor(file) }, forceNew),
    [openTab]
  )

  // Google links clicked inside documents.
  useEffect(
    () => window.glovebox.onOpenUrl((url) => openTab({ ...describeUrl(url), title: 'Loading…', url })),
    [openTab]
  )

  useEffect(() => {
    if (!flashing) return
    const t = setTimeout(() => setFlashing(null), 700)
    return () => clearTimeout(t)
  }, [flashing])

  function closeTab(key: string) {
    const index = tabs.findIndex((t) => t.key === key)
    const rest = tabs.filter((t) => t.key !== key)
    setTabs(rest)
    if (active === key) setActive(rest[Math.min(index, rest.length - 1)]?.key ?? FILES)
  }

  /** From a document, Files goes back to the explorer; in the explorer, it picks the section. */
  async function onFilesClick(e: React.MouseEvent) {
    if (active !== FILES) return setActive(FILES)
    const rect = e.currentTarget.getBoundingClientRect()
    const choice = await window.glovebox.popupMenu(
      (Object.keys(SECTION_LABELS) as Section[]).map((s) => ({ id: s, label: SECTION_LABELS[s], checked: s === section })),
      { x: Math.round(rect.left), y: Math.round(rect.bottom + 2) }
    )
    if (choice) explorer.current?.goToSection(choice as Section)
  }

  const closeTabsFor = useCallback((fileIds: string[]) => {
    const gone = new Set(fileIds)
    setTabs((ts) => ts.filter((t) => !t.fileId || !gone.has(t.fileId)))
  }, [])

  const setTitle = useCallback(
    (key: string, title: string) => setTabs((ts) => ts.map((t) => (t.key === key ? { ...t, title } : t))),
    []
  )

  return (
    <div className={`workspace ${collapsed ? 'rail-collapsed' : ''}`}>
      <nav className="rail">
        <button
          className={`rail-item ${active === FILES ? 'active' : ''}`}
          onClick={onFilesClick}
          title={`${SECTION_LABELS[section]} — click to switch`}
        >
          <img src={iconUrl('application/vnd.google-apps.folder')} alt="" />
          <span className="rail-label">{SECTION_LABELS[section]}</span>
          <span className="rail-chevron">▾</span>
        </button>
        <div className="rail-divider" />
        <div className="rail-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.key}
              className={`rail-item ${active === tab.key ? 'active' : ''} ${flashing === tab.key ? 'flash' : ''}`}
              onClick={() => setActive(tab.key)}
              onAuxClick={(e) => e.button === 1 && closeTab(tab.key)}
              title={tab.title}
            >
              <img src={iconUrl(tab.mimeType)} alt="" />
              <span className="rail-label">{tab.title}</span>
              <button
                className="rail-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.key)
                }}
                title="Close"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="rail-footer">
          <button className="rail-item" onClick={() => setCollapsed((c) => !c)} title="Collapse sidebar">
            <span className="rail-glyph">{collapsed ? '»' : '«'}</span>
            <span className="rail-label">Collapse</span>
          </button>
          <button className="rail-item" onClick={onSignOut} title={`Signed in as ${profile.email} — click to sign out`}>
            <span className="rail-glyph avatar">{(profile.name || profile.email)[0].toUpperCase()}</span>
            <span className="rail-label">Sign out</span>
          </button>
        </div>
      </nav>

      <main className="content">
        <div className="view" hidden={active !== FILES}>
          <ExplorerArea ref={explorer} onSectionChange={setSection} refreshKey={refreshKey} onOpen={openFile} onRemoved={closeTabsFor} onAuthError={onAuthError} />
        </div>
        {tabs.map((tab) => (
          <DocView
            key={tab.key}
            tab={tab}
            partition={partition}
            visible={active === tab.key}
            onTitle={(title) => setTitle(tab.key, title)}
          />
        ))}
      </main>
    </div>
  )
}

function DocView(props: { tab: Tab; partition: string; visible: boolean; onTitle: (title: string) => void }) {
  const { tab, partition, visible, onTitle } = props
  const ref = useRef<HTMLWebViewElement>(null)
  const onTitleRef = useRef(onTitle)
  onTitleRef.current = onTitle

  useEffect(() => {
    const el = ref.current!
    const handler = (e: Event) => {
      const title = cleanTitle((e as unknown as { title: string }).title)
      if (title) onTitleRef.current(title)
    }
    el.addEventListener('page-title-updated', handler)
    return () => el.removeEventListener('page-title-updated', handler)
  }, [])

  // Kept mounted (not display:none) while hidden, so the document keeps its state.
  return (
    <div className={`view doc-view ${visible ? '' : 'offscreen'}`}>
      {/* allowpopups must be the string "true"; popups are routed by the main process (routeLink). */}
      <webview ref={ref} src={tab.url} partition={partition} {...{ allowpopups: 'true' as unknown as boolean }} />
    </div>
  )
}
