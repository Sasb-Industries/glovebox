import { useCallback, useEffect, useRef, useState } from 'react'
import type { DriveFile, MenuItem, Profile, TabState, WindowInit } from '../../shared/types'
import { findShortcut, keyPressFrom, type ShortcutId } from '../../shared/shortcuts'
import { ExplorerArea, type ExplorerAreaHandle } from './ExplorerArea'
import { SECTION_LABELS, type Section } from './location'
import { cleanTitle, describeUrl, iconUrl, openUrlFor } from './files'
import { isMac, useBindings, usePrefs } from './prefs'
import { Settings } from './Settings'

interface Tab extends TabState {
  key: string
  /** Restored tabs don't load their document until first shown. */
  loaded: boolean
}

const FILES = 'files'
const SETTINGS = 'settings'
const DOC_TAB_TYPE = 'application/x-glovebox-doc-tab'
/** Identifies this window in drag data, to tell reordering apart from moving between windows. */
const WINDOW_ID = crypto.randomUUID()

const newKey = (tab: TabState) => `${tab.fileId ?? 'url'}:${crypto.randomUUID()}`
const toState = ({ fileId, title, mimeType, url }: Tab): TabState => ({ fileId, title, mimeType, url })

interface Props {
  init: WindowInit
  profile: Profile
  partition: string
  refreshKey: number
  onAuthError: (e: unknown) => boolean
}

/** The rail (Files + doc tabs) and whichever view is active: the explorer, settings, or one doc. */
export function Workspace({ init, profile, partition, refreshKey, onAuthError }: Props) {
  const prefs = usePrefs()
  const bindings = useBindings()
  // Tabs this window starts with (restored, or a window reloaded).
  const [tabs, setTabs] = useState<Tab[]>(() =>
    init.tabs.map((t, i) => ({ ...t, key: newKey(t), loaded: i === init.activeIndex }))
  )
  const [active, setActiveKey] = useState<string>(() => tabs[init.activeIndex]?.key ?? FILES)
  const [flashing, setFlashing] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('my-drive')
  const [dropBefore, setDropBefore] = useState<string | null>(null)
  const explorer = useRef<ExplorerAreaHandle>(null)
  const draggedLocally = useRef(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('railCollapsed') === '1')

  useEffect(() => localStorage.setItem('railCollapsed', collapsed ? '1' : '0'), [collapsed])

  // Report tabs to the main process for sessions and restore.
  useEffect(() => {
    window.glovebox.updateWindow(tabs.map(toState), tabs.findIndex((t) => t.key === active))
  }, [tabs, active])

  function activate(key: string) {
    setActiveKey(key)
    setTabs((ts) => (ts.some((t) => t.key === key && !t.loaded) ? ts.map((t) => (t.key === key ? { ...t, loaded: true } : t)) : ts))
  }

  /** Opens a tab, or focuses (and flashes) the one already showing this file. */
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const openTab = useCallback(
    (tab: TabState, forceNew = false) => {
      const existing = !forceNew && tab.fileId && tabsRef.current.find((t) => t.fileId === tab.fileId)
      if (existing) {
        activate(existing.key)
        setFlashing(existing.key)
        return
      }
      if (prefs.openInOwnWindow) return void window.glovebox.openDocWindow(tab)
      const key = newKey(tab)
      setTabs((ts) => [...ts, { ...tab, key, loaded: true }])
      setActiveKey(key)
    },
    [prefs.openInOwnWindow]
  )

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

  function removeTab(key: string) {
    const index = tabs.findIndex((t) => t.key === key)
    const rest = tabs.filter((t) => t.key !== key)
    setTabs(rest)
    if (active === key) {
      const next = rest[Math.min(index, rest.length - 1)]?.key ?? FILES
      activate(next)
    }
    return rest
  }

  const closeTabsFor = useCallback((fileIds: string[]) => {
    const gone = new Set(fileIds)
    setTabs((ts) => ts.filter((t) => !t.fileId || !gone.has(t.fileId)))
  }, [])

  const setTitle = useCallback(
    (key: string, title: string) => setTabs((ts) => ts.map((t) => (t.key === key ? { ...t, title } : t))),
    []
  )

  // ---- Shortcuts that work everywhere ----

  function runShortcut(id: ShortcutId) {
    const order = [FILES, ...tabs.map((t) => t.key)]
    const i = Math.max(0, order.indexOf(active))
    if (id === 'next-tab') activate(order[(i + 1) % order.length])
    if (id === 'prev-tab') activate(order[(i - 1 + order.length) % order.length])
    if (id === 'files') activate(FILES)
    if (id === 'close-tab') {
      if (active === FILES) explorer.current?.closeFolderTab()
      else if (active === SETTINGS) activate(FILES)
      else removeTab(active)
    }
  }
  const runShortcutRef = useRef(runShortcut)
  runShortcutRef.current = runShortcut

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const id = findShortcut(bindings, keyPressFrom(e), isMac, 'app')
      if (!id) return
      e.preventDefault()
      runShortcutRef.current(id)
    }
    window.addEventListener('keydown', onKeyDown)
    const stop = window.glovebox.onShortcut((id) => runShortcutRef.current(id))
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      stop()
    }
  }, [bindings])

  // ---- Rail menus ----

  /** From a document, Files goes back to the explorer; in the explorer, it picks the section. */
  async function onFilesClick(e: React.MouseEvent) {
    if (active !== FILES) return activate(FILES)
    const rect = e.currentTarget.getBoundingClientRect()
    const choice = await window.glovebox.popupMenu(
      (Object.keys(SECTION_LABELS) as Section[]).map((s) => ({ id: s, label: SECTION_LABELS[s], checked: s === section })),
      { x: Math.round(rect.left), y: Math.round(rect.bottom + 2) }
    )
    if (choice) explorer.current?.goToSection(choice as Section)
  }

  async function onProfileClick(e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect()
    const { profiles } = await window.glovebox.listProfiles()
    const items: MenuItem[] = [
      ...profiles.map((p) => ({ id: `switch:${p.id}`, label: p.email, checked: p.id === profile.id })),
      { type: 'separator' },
      { id: 'add', label: 'Add another account…' },
      { id: 'sign-out', label: `Sign out of ${profile.email}` }
    ]
    const choice = await window.glovebox.popupMenu(items, { x: Math.round(rect.left), y: Math.round(rect.top - 8) })
    if (choice?.startsWith('switch:')) window.glovebox.switchProfile(choice.slice(7))
    if (choice === 'add') window.glovebox.signIn()
    if (choice === 'sign-out') signOut(profile)
  }

  // ---- Dragging tabs: reorder, move to another window, or out into a new window ----

  function onTabDragStart(e: React.DragEvent, tab: Tab) {
    draggedLocally.current = false
    e.dataTransfer.setData(DOC_TAB_TYPE, JSON.stringify({ windowId: WINDOW_ID, key: tab.key, tab: toState(tab) }))
    e.dataTransfer.effectAllowed = 'move'
  }

  function onTabDragEnd(e: React.DragEvent, tab: Tab) {
    setDropBefore(null)
    if (draggedLocally.current) return
    if (e.dataTransfer.dropEffect === 'move') {
      // Dropped on another window's rail: it took the tab.
      if (!removeTab(tab.key).length) window.glovebox.closeWindowIfOthers()
      return
    }
    const outside =
      e.screenX < window.screenX ||
      e.screenX > window.screenX + window.outerWidth ||
      e.screenY < window.screenY ||
      e.screenY > window.screenY + window.outerHeight
    if (outside) {
      window.glovebox.openDocWindow(toState(tab), { x: e.screenX, y: e.screenY })
      removeTab(tab.key)
    }
  }

  const tabDropProps = (beforeKey: string | null): React.HTMLAttributes<HTMLElement> => ({
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(DOC_TAB_TYPE)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setDropBefore(beforeKey ?? 'end')
    },
    onDrop: (e) => {
      const raw = e.dataTransfer.getData(DOC_TAB_TYPE)
      if (!raw) return
      e.preventDefault()
      e.stopPropagation()
      setDropBefore(null)
      const { windowId, key, tab } = JSON.parse(raw) as { windowId: string; key: string; tab: TabState }
      const insert = (list: Tab[], item: Tab) => {
        const at = beforeKey ? list.findIndex((t) => t.key === beforeKey) : -1
        return at < 0 ? [...list, item] : [...list.slice(0, at), item, ...list.slice(at)]
      }
      if (windowId === WINDOW_ID) {
        draggedLocally.current = true
        if (key === beforeKey) return
        setTabs((ts) => {
          const moving = ts.find((t) => t.key === key)
          return moving ? insert(ts.filter((t) => t.key !== key), moving) : ts
        })
      } else {
        const added: Tab = { ...tab, key: newKey(tab), loaded: true }
        setTabs((ts) => insert(ts, added))
        setActiveKey(added.key)
      }
    }
  })

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
        <div className="rail-tabs" {...tabDropProps(null)} onDragLeave={() => setDropBefore(null)}>
          {tabs.map((tab) => (
            <div
              key={tab.key}
              className={`rail-item ${active === tab.key ? 'active' : ''} ${flashing === tab.key ? 'flash' : ''} ${dropBefore === tab.key ? 'drop-before' : ''}`}
              onClick={() => activate(tab.key)}
              onAuxClick={(e) => e.button === 1 && removeTab(tab.key)}
              title={tab.title}
              draggable
              onDragStart={(e) => onTabDragStart(e, tab)}
              onDragEnd={(e) => onTabDragEnd(e, tab)}
              {...tabDropProps(tab.key)}
            >
              <img src={iconUrl(tab.mimeType)} alt="" draggable={false} />
              <span className="rail-label">{tab.title}</span>
              <button
                className="rail-close"
                onClick={(e) => {
                  e.stopPropagation()
                  removeTab(tab.key)
                }}
                title="Close"
              >
                ×
              </button>
            </div>
          ))}
          {dropBefore === 'end' && <div className="drop-end" />}
        </div>
        <div className="rail-footer">
          <button className="rail-item" onClick={() => setCollapsed((c) => !c)} title="Collapse sidebar">
            <span className="rail-glyph">{collapsed ? '»' : '«'}</span>
            <span className="rail-label">Collapse</span>
          </button>
          <button className={`rail-item ${active === SETTINGS ? 'active' : ''}`} onClick={() => activate(SETTINGS)} title="Settings">
            <span className="rail-glyph">⚙</span>
            <span className="rail-label">Settings</span>
          </button>
          <button className="rail-item" onClick={onProfileClick} title={`${profile.email} — switch account`}>
            <span className="rail-glyph avatar">{(profile.name || profile.email)[0].toUpperCase()}</span>
            <span className="rail-label">{profile.name || profile.email}</span>
          </button>
        </div>
      </nav>

      <main className="content">
        <div className="view" hidden={active !== FILES}>
          <ExplorerArea
            ref={explorer}
            onSectionChange={setSection}
            refreshKey={refreshKey}
            onOpen={openFile}
            onRemoved={closeTabsFor}
            onAuthError={onAuthError}
          />
        </div>
        {active === SETTINGS && (
          <div className="view">
            <Settings profile={profile} onSignOut={signOut} />
          </div>
        )}
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

async function signOut(profile: Profile) {
  const ok = await window.glovebox.confirm(
    `Sign out of ${profile.email}?`,
    'Glovebox will forget this account and its open tabs. Your files in Google Drive are not affected.',
    'Sign out'
  )
  if (ok) await window.glovebox.removeProfile(profile.id)
}

export function DocView(props: { tab: Tab; partition: string; visible: boolean; onTitle: (title: string) => void }) {
  const { tab, partition, visible, onTitle } = props
  const ref = useRef<HTMLWebViewElement>(null)
  const onTitleRef = useRef(onTitle)
  onTitleRef.current = onTitle

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = (e: Event) => {
      const title = cleanTitle((e as unknown as { title: string }).title)
      if (title) onTitleRef.current(title)
    }
    el.addEventListener('page-title-updated', handler)
    return () => el.removeEventListener('page-title-updated', handler)
  }, [tab.loaded])

  if (!tab.loaded) return null
  // Kept mounted (not display:none) while hidden, so the document keeps its state.
  return (
    <div className={`view doc-view ${visible ? '' : 'offscreen'}`}>
      {/* allowpopups must be the string "true"; popups are routed by the main process (routeLink). */}
      <webview ref={ref} src={tab.url} partition={partition} {...{ allowpopups: 'true' as unknown as boolean }} />
    </div>
  )
}
