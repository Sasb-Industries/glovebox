import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { DriveFile } from '../../shared/types'
import { Explorer, type Clipboard, type ExplorerHandle } from './Explorer'
import { DRAG_TYPE } from './FileList'
import { iconUrl } from './files'
import { MY_DRIVE, SECTION_LABELS, sectionOf, type Location, type Section } from './location'

/** One folder tab in the dock; each is its own explorer with its own history. */
interface FolderTab {
  id: string
  initial: Location
}
type Side = 'left' | 'right'

const DOCK_TYPE = 'application/x-glovebox-dock-tab'
/** How long a dragged file must hover a dock tab before that tab opens. */
const HOVER_OPEN_MS = 500
/** Dropping a dock tab within this fraction of either edge opens split view on that side. */
const EDGE_ZONE = 0.3

export interface ExplorerAreaHandle {
  goToSection: (section: Section) => void
}

interface Props {
  ref: React.Ref<ExplorerAreaHandle>
  onSectionChange: (section: Section) => void
  refreshKey: number
  onOpen: (file: DriveFile, forceNew: boolean) => void
  onRemoved: (fileIds: string[]) => void
  onAuthError: (e: unknown) => boolean
}

const tabLabel = (loc: Location | undefined) =>
  !loc
    ? 'My Drive'
    : loc.kind === 'folder'
      ? loc.path[loc.path.length - 1].name
      : loc.kind === 'view'
        ? SECTION_LABELS[loc.view]
        : `“${loc.query}”`

/** The explorer view: one or two explorer panes plus the floating dock of folder tabs. */
export function ExplorerArea({ ref, onSectionChange, refreshKey, ...explorerProps }: Props) {
  const nextId = useRef(1)
  const newTab = (initial: Location = MY_DRIVE): FolderTab => ({ id: `folder-${nextId.current++}`, initial })

  const [tabs, setTabs] = useState<FolderTab[]>(() => [newTab()])
  const [panes, setPanes] = useState<{ left: string; right: string | null }>(() => ({ left: tabs[0].id, right: null }))
  const [focused, setFocused] = useState<Side>('left')
  const [locations, setLocations] = useState<Record<string, Location>>({})
  const [clipboard, setClipboard] = useState<Clipboard>(null)
  const [changes, setChanges] = useState(0)
  const [splitPreview, setSplitPreview] = useState<Side | null>(null)
  const explorers = useRef(new Map<string, ExplorerHandle>())
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const focusedTab = (focused === 'right' && panes.right) || panes.left
  const split = panes.right !== null

  const section = sectionOf(locations[focusedTab] ?? MY_DRIVE)
  useEffect(() => onSectionChange(section), [section, onSectionChange])
  useImperativeHandle(ref, () => ({ goToSection: (s) => explorers.current.get(focusedTab)?.goToSection(s) }))

  const onChanged = useCallback(() => setChanges((c) => c + 1), [])
  const locationSetters = useRef(new Map<string, (loc: Location) => void>())
  const onLocationChangeFor = (id: string) => {
    if (!locationSetters.current.has(id))
      locationSetters.current.set(id, (loc) => setLocations((all) => ({ ...all, [id]: loc })))
    return locationSetters.current.get(id)!
  }

  // ---- Showing tabs ----

  const sideOf = (id: string): Side | null => (panes.left === id ? 'left' : panes.right === id ? 'right' : null)

  /** Shows a tab: focuses it if visible, otherwise puts it in a pane (the other pane while dragging files). */
  function showTab(id: string, whileDragging = false) {
    const visible = sideOf(id)
    if (visible) return setFocused(visible)
    const side: Side = split && whileDragging ? (focused === 'left' ? 'right' : 'left') : focused
    setPanes((p) => ({ ...p, [side]: id }))
    if (!whileDragging) setFocused(side)
  }

  function addTab() {
    const tab = newTab()
    setTabs((t) => [...t, tab])
    setPanes((p) => ({ ...p, [focused]: tab.id }))
  }

  function closeTab(id: string) {
    const index = tabs.findIndex((t) => t.id === id)
    const rest = tabs.filter((t) => t.id !== id)
    if (!rest.length) return
    setTabs(rest)
    explorers.current.delete(id)
    if (panes.right === id) setPanes({ left: panes.left, right: null })
    else if (panes.left === id)
      setPanes(panes.right ? { left: panes.right, right: null } : { left: rest[Math.min(index, rest.length - 1)].id, right: null })
    setFocused('left')
  }

  /** Puts `id` on `side`, with the currently shown tab (or another one) on the other side. */
  function openSplit(id: string, side: Side) {
    const other: Side = side === 'left' ? 'right' : 'left'
    let partner = panes[focused] !== id ? panes[focused] : (panes[other] ?? tabs.find((t) => t.id !== id)?.id)
    if (!partner || partner === id) {
      const tab = newTab()
      setTabs((t) => [...t, tab])
      partner = tab.id
    }
    setPanes(side === 'left' ? { left: id, right: partner } : { left: partner, right: id })
    setFocused(side)
  }

  function closeSplit() {
    setPanes({ left: focusedTab, right: null })
    setFocused('left')
  }

  async function onDockMenu(e: React.MouseEvent, id: string) {
    e.preventDefault()
    const choice = await window.glovebox.popupMenu([
      { id: 'split-left', label: 'Open in split view (left)' },
      { id: 'split-right', label: 'Open in split view (right)' },
      ...(split ? [{ id: 'unsplit', label: 'Close split view' }] : []),
      { type: 'separator' },
      { id: 'close', label: 'Close tab' }
    ])
    if (choice === 'split-left') openSplit(id, 'left')
    if (choice === 'split-right') openSplit(id, 'right')
    if (choice === 'unsplit') closeSplit()
    if (choice === 'close') closeTab(id)
  }

  // ---- Dragging ----

  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE) || e.dataTransfer.types.includes('Files')
  const isDockDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DOCK_TYPE)

  /** Dock tabs accept dragged files: hovering opens the tab, dropping moves/uploads into its folder. */
  const dockTabDropProps = (id: string): React.HTMLAttributes<HTMLElement> => ({
    onDragEnter: (e) => {
      if (!isFileDrag(e)) return
      clearTimeout(hoverTimer.current)
      hoverTimer.current = setTimeout(() => showTab(id, true), HOVER_OPEN_MS)
    },
    onDragOver: (e) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_TYPE) ? 'move' : 'copy'
    },
    onDragLeave: () => clearTimeout(hoverTimer.current),
    onDrop: (e) => {
      clearTimeout(hoverTimer.current)
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.stopPropagation()
      explorers.current.get(id)?.receiveDrop(e.dataTransfer)
    }
  })

  function edgeOf(e: React.DragEvent): Side | null {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    return x < EDGE_ZONE ? 'left' : x > 1 - EDGE_ZONE ? 'right' : null
  }

  // Dragging a dock tab to the left/right edge previews and opens split view, like Windows snap.
  const areaDropProps: React.HTMLAttributes<HTMLElement> = {
    onDragOver: (e) => {
      if (!isDockDrag(e)) return
      const edge = edgeOf(e)
      setSplitPreview(edge)
      if (edge) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setSplitPreview(null)
    },
    onDrop: (e) => {
      setSplitPreview(null)
      const id = e.dataTransfer.getData(DOCK_TYPE)
      const edge = edgeOf(e)
      if (id && edge) {
        e.preventDefault()
        openSplit(id, edge)
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
      e.preventDefault()
      addTab()
    }
  }

  return (
    <div className={`explorer-area ${split ? 'split' : ''}`} onKeyDown={onKeyDown} {...areaDropProps}>
      <div className="panes">
        {tabs.map((tab) => {
          const side = sideOf(tab.id)
          return (
            <div
              key={tab.id}
              className={`pane ${side ?? ''} ${side === focused ? 'focused' : ''}`}
              hidden={!side}
              style={{ order: side === 'right' ? 2 : 1 }}
              onMouseDownCapture={() => side && setFocused(side)}
            >
              <Explorer
                ref={(handle) => {
                  if (handle) explorers.current.set(tab.id, handle)
                }}
                initial={tab.initial}
                onLocationChange={onLocationChangeFor(tab.id)}
                clipboard={clipboard}
                setClipboard={setClipboard}
                onChanged={onChanged}
                refreshKey={refreshKey + changes}
                {...explorerProps}
              />
            </div>
          )
        })}
      </div>

      {splitPreview && <div className={`split-preview ${splitPreview}`} />}

      <div className="dock">
        {tabs.length > 1 &&
          tabs.map((tab) => {
            const side = sideOf(tab.id)
            const label = tabLabel(locations[tab.id])
            return (
              <div
                key={tab.id}
                className={`dock-tab ${side ? 'visible' : ''} ${tab.id === focusedTab ? 'active' : ''}`}
                title={`${label} — drag to a side for split view`}
                draggable
                onClick={() => showTab(tab.id)}
                onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
                onContextMenu={(e) => onDockMenu(e, tab.id)}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DOCK_TYPE, tab.id)
                  e.dataTransfer.effectAllowed = 'move'
                  const icon = e.currentTarget.querySelector('img')
                  if (icon) e.dataTransfer.setDragImage(icon, 8, 8)
                }}
                onDragEnd={() => setSplitPreview(null)}
                {...dockTabDropProps(tab.id)}
              >
                <img src={iconUrl('application/vnd.google-apps.folder')} alt="" draggable={false} />
                <span className="dock-label">{label}</span>
                <button
                  className="dock-close"
                  title="Close tab"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
        <button className="dock-add" onClick={addTab} title="New folder tab (Ctrl/Cmd+T)">
          +
        </button>
      </div>
    </div>
  )
}
