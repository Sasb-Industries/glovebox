import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { FOLDER_MIME, type DriveFile, type MenuItem, type UploadProgress } from '../../shared/types'
import { DRAG_TYPE, FileList, type DropProps, type Sort } from './FileList'
import { isFolder, isShortcut, NEW_GOOGLE_FILES, ownerName } from './files'
import { Icon } from './icons'
import { isMac, useBindings } from './prefs'
import { findShortcut, keyPressFrom, type ShortcutId } from '../../shared/shortcuts'
import { folderOf, SECTION_LABELS, sectionOf, sectionRoot, type Location, type Section } from './location'

const drive = window.glovebox.drive
const TRASH_ACCELERATOR = isMac ? 'Cmd+Backspace' : 'Delete'
const SEPARATOR: MenuItem = { type: 'separator' }

const sortValue: Record<Sort['key'], (f: DriveFile) => string | number> = {
  name: (f) => f.name.toLowerCase(),
  modified: (f) => f.modifiedTime ?? '',
  owner: (f) => ownerName(f).toLowerCase(),
  size: (f) => Number(f.size ?? -1)
}

const plural = (n: number, word = 'item') => `${n} ${word}${n === 1 ? '' : 's'}`
const errorText = (e: unknown) =>
  String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export interface ExplorerHandle {
  goToSection: (section: Section) => void
  /** Handles files dropped on this explorer's dock tab: moves or uploads them into its folder. */
  receiveDrop: (data: DataTransfer) => void
}

export type Clipboard = { mode: 'cut' | 'copy'; files: DriveFile[] } | null

interface Props {
  ref: React.Ref<ExplorerHandle>
  initial: Location
  onLocationChange: (location: Location) => void
  /** Shared between all explorers so you can cut in one and paste in another. */
  clipboard: Clipboard
  setClipboard: (clipboard: Clipboard) => void
  /** Called after any change to Drive, so every explorer refreshes. */
  onChanged: () => void
  /** In split view: closes this side, leaving its tab in the dock. */
  onCloseSide?: () => void
  refreshKey: number
  onOpen: (file: DriveFile, forceNew: boolean) => void
  /** Files that were trashed or deleted, so their tabs can close. */
  onRemoved: (fileIds: string[]) => void
  onAuthError: (e: unknown) => boolean
}

export function Explorer(props: Props) {
  const { ref, initial, onLocationChange, clipboard, setClipboard, onChanged, onCloseSide, refreshKey, onOpen, onRemoved, onAuthError } = props
  const [location, setLocation] = useState<Location>(initial)
  const [back, setBack] = useState<Location[]>([])
  const [forward, setForward] = useState<Location[]>([])
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [upload, setUpload] = useState<UploadProgress | null>(null)
  const [searchText, setSearchText] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const bindings = useBindings()
  const loadedLocation = useRef<Location | null>(null)

  const folder = folderOf(location)
  const section = sectionOf(location)
  useEffect(() => onLocationChange(location), [location, onLocationChange])
  useImperativeHandle(ref, () => ({
    goToSection: (s) => navigate(sectionRoot(s)),
    receiveDrop: (data) => (folder ? dropInto(data, folder.id) : notify("Files can't be dropped here.", true))
  }))
  const reload = () => setReloads((r) => r + 1)

  useEffect(() => {
    let cancelled = false
    const moved = loadedLocation.current !== location
    loadedLocation.current = location
    if (moved) {
      setFiles(null)
      setSelection(new Set())
    }
    setError(null)
    const request =
      location.kind === 'folder'
        ? drive.listFolder(location.path[location.path.length - 1].id)
        : location.kind === 'view'
          ? drive.listView(location.view)
          : drive.search(location.query, location.within?.id ?? null)
    request.then(
      (list) => !cancelled && setFiles(list),
      (e) => !cancelled && !onAuthError(e) && setError(errorText(e))
    )
    return () => void (cancelled = true)
  }, [location, refreshKey, reloads, onAuthError])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), notice.error ? 8000 : 4000)
    return () => clearTimeout(t)
  }, [notice])

  // Recent and search results keep Google's order until a column is clicked.
  const effectiveSort: Sort | null =
    sort ?? ((location.kind === 'view' && location.view === 'recent') || location.kind === 'search' ? null : { key: 'name', asc: true })

  const sorted = useMemo(() => {
    if (!files || !effectiveSort) return files ?? []
    const value = sortValue[effectiveSort.key]
    return [...files].sort((a, b) => {
      if (isFolder(a) !== isFolder(b)) return isFolder(a) ? -1 : 1
      const [x, y] = [value(a), value(b)]
      return (x < y ? -1 : x > y ? 1 : 0) * (effectiveSort.asc ? 1 : -1)
    })
  }, [files, effectiveSort?.key, effectiveSort?.asc])

  const selected = sorted.filter((f) => selection.has(f.id))

  // ---- Navigation ----

  function navigate(next: Location) {
    setBack((b) => [...b, location])
    setForward([])
    setLocation(next)
    setSort(null)
    setRenamingId(null)
    if (next.kind !== 'search') setSearchText('')
    listRef.current?.querySelector<HTMLElement>('.file-list')?.focus()
  }
  function goBack() {
    if (!back.length) return
    setForward((f) => [location, ...f])
    setLocation(back[back.length - 1])
    setBack((b) => b.slice(0, -1))
  }
  function goForward() {
    if (!forward.length) return
    setBack((b) => [...b, location])
    setLocation(forward[0])
    setForward((f) => f.slice(1))
  }
  const canGoUp = location.kind === 'folder' && location.path.length > 1
  const goUp = () => canGoUp && navigate({ ...location, path: location.path.slice(0, -1) })

  async function openFile(file: DriveFile, forceNew = false) {
    let target = file
    if (isShortcut(file)) {
      const ok = await attempt(async () => (target = await drive.getFile(file.shortcutDetails!.targetId)))
      if (!ok) return
    }
    if (!isFolder(target)) return onOpen(target, forceNew)
    if (location.kind === 'folder' && target === file)
      return navigate({ ...location, path: [...location.path, { id: target.id, name: target.name }] })
    if (location.kind === 'view' && location.view === 'shared-drives')
      return navigate({ kind: 'folder', path: [{ id: target.id, name: target.name }], section })
    // Shortcuts, search results, Starred etc.: jump to the folder's real location.
    await attempt(async () => {
      const path = await drive.resolvePath(target.id)
      navigate({ kind: 'folder', path, section: path[0].id === 'root' ? 'my-drive' : section })
    })
  }

  // ---- Changing things ----

  const notify = (text: string, isError = false) => setNotice({ text, error: isError })

  /** Runs a Drive change, reports errors, and refreshes the list. Returns whether it succeeded. */
  async function attempt(fn: () => Promise<unknown>, success?: string, refresh = false) {
    try {
      await fn()
      if (success) notify(success)
      return true
    } catch (e) {
      if (!onAuthError(e)) notify(errorText(e), true)
      return false
    } finally {
      if (refresh) onChanged()
    }
  }
  const change = (fn: () => Promise<unknown>, success?: string) => attempt(fn, success, true)

  async function each(list: DriveFile[], fn: (f: DriveFile) => Promise<unknown>) {
    for (const f of list) await fn(f)
  }

  function moveIds(ids: string[], targetId: string) {
    // Dropping onto the folder being viewed: anything already listed here stays put.
    const here = targetId === folder?.id ? new Set(files?.map((f) => f.id)) : new Set<string>()
    const toMove = ids.filter((id) => id !== targetId && !here.has(id))
    if (!toMove.length) return
    change(async () => {
      for (const id of toMove) await drive.move(id, targetId)
    }, `Moved ${plural(toMove.length)}`)
  }

  function copyToClipboard(list: DriveFile[]) {
    const copyable = list.filter((f) => !isFolder(f))
    if (copyable.length < list.length) notify("Folders can't be copied in Google Drive — use Cut instead.", true)
    if (copyable.length) setClipboard({ mode: 'copy', files: copyable })
  }

  function paste(targetId: string) {
    if (!clipboard) return
    const { mode, files: items } = clipboard
    change(async () => {
      if (mode === 'cut') {
        await each(items, (f) => drive.move(f.id, targetId))
        setClipboard(null)
      } else {
        await each(items, (f) => drive.copy(f.id, targetId, f.parents?.includes(targetId) ? `Copy of ${f.name}` : undefined))
      }
    }, `${mode === 'cut' ? 'Moved' : 'Copied'} ${plural(items.length)}`)
  }

  async function uploadPaths(paths: string[], targetId: string) {
    if (!paths.length) return
    const stop = window.glovebox.onUploadProgress((p) => setUpload({ ...p }))
    await change(() => window.glovebox.upload(paths, targetId), 'Upload complete')
    stop()
    setUpload(null)
  }

  async function newFolder() {
    if (!folder) return
    await change(async () => {
      const created = await drive.create('New folder', FOLDER_MIME, folder.id)
      setSelection(new Set([created.id]))
      setRenamingId(created.id)
    })
  }

  function newGoogleFile(mimeType: string) {
    const type = NEW_GOOGLE_FILES.find((t) => t.mimeType === mimeType)!
    change(async () => onOpen(await drive.create(type.name, mimeType, folder?.id ?? 'root'), false))
  }

  function rename(file: DriveFile, name: string | null) {
    setRenamingId(null)
    if (name) change(() => drive.rename(file.id, name))
    listRef.current?.querySelector<HTMLElement>('.file-list')?.focus()
  }

  async function deleteForever(list: DriveFile[]) {
    const ok = await window.glovebox.confirm(
      `Delete ${list.length === 1 ? `“${list[0].name}”` : plural(list.length)} forever?`,
      "This can't be undone.",
      'Delete forever'
    )
    if (ok && (await change(() => each(list, (f) => drive.deleteForever(f.id)), `Deleted ${plural(list.length)} forever`)))
      onRemoved(list.map((f) => f.id))
  }

  async function trashSelected(list: DriveFile[]) {
    if (location.kind === 'view' && location.view === 'trash') return deleteForever(list)
    if (await change(() => each(list, (f) => drive.trash(f.id)), `Moved ${plural(list.length)} to Trash`))
      onRemoved(list.map((f) => f.id))
  }

  async function doAction(action: string, list: DriveFile[]) {
    const allStarred = list.every((f) => f.starred)
    if (action.startsWith('new:')) return newGoogleFile(action.slice(4))
    switch (action) {
      case 'open':
        if (list.length === 1) return openFile(list[0])
        return list.filter((f) => !isFolder(f)).forEach((f) => onOpen(f, false))
      case 'open-new-tab':
        return onOpen(list[0], true)
      case 'cut':
        return setClipboard({ mode: 'cut', files: list })
      case 'copy':
        return copyToClipboard(list)
      case 'paste':
        return folder && paste(folder.id)
      case 'paste-into':
        return paste(list[0].id)
      case 'rename':
        return setRenamingId(list[0].id)
      case 'make-copy':
        return change(
          () => each(list, (f) => drive.copy(f.id, f.parents?.[0] ?? 'root', `Copy of ${f.name}`)),
          `Copied ${plural(list.length)}`
        )
      case 'copy-link':
        await navigator.clipboard.writeText(list.map((f) => f.webViewLink).filter(Boolean).join('\n'))
        return notify(list.length === 1 ? 'Link copied' : 'Links copied')
      case 'star':
        return change(() => each(list, (f) => drive.setStarred(f.id, !allStarred)))
      case 'trash':
        return trashSelected(list)
      case 'restore':
        return change(() => each(list, (f) => drive.restore(f.id)), `Restored ${plural(list.length)}`)
      case 'delete-forever':
        return deleteForever(list)
      case 'new-folder':
        return newFolder()
      case 'upload-files':
      case 'upload-folder':
        return folder && uploadPaths(await window.glovebox.pickPaths(action === 'upload-files' ? 'files' : 'folder'), folder.id)
      case 'refresh':
        return reload()
    }
  }

  // ---- Menus ----

  const uploadItems: MenuItem[] = [
    { id: 'upload-files', label: 'Upload files…', enabled: !!folder },
    { id: 'upload-folder', label: 'Upload folder…', enabled: !!folder }
  ]

  function fileMenu(list: DriveFile[]): MenuItem[] {
    if (location.kind === 'view' && location.view === 'trash')
      return [
        { id: 'restore', label: 'Restore' },
        { id: 'delete-forever', label: 'Delete forever', accelerator: TRASH_ACCELERATOR }
      ]
    if (location.kind === 'view' && location.view === 'shared-drives') return [{ id: 'open', label: 'Open' }]
    const single = list.length === 1 ? list[0] : null
    const anyFolder = list.some(isFolder)
    return [
      { id: 'open', label: 'Open', accelerator: 'Enter' },
      ...(single && !isFolder(single) ? [{ id: 'open-new-tab', label: 'Open in new tab' }] : []),
      SEPARATOR,
      { id: 'cut', label: 'Cut', accelerator: 'CmdOrCtrl+X' },
      { id: 'copy', label: 'Copy', accelerator: 'CmdOrCtrl+C', enabled: !anyFolder },
      ...(single && isFolder(single) && clipboard ? [{ id: 'paste-into', label: 'Paste into folder' }] : []),
      SEPARATOR,
      { id: 'rename', label: 'Rename', accelerator: 'F2', enabled: !!single && single.capabilities?.canRename !== false },
      { id: 'make-copy', label: 'Make a copy', enabled: !anyFolder },
      { id: 'copy-link', label: single ? 'Copy link' : 'Copy links' },
      { id: 'star', label: list.every((f) => f.starred) ? 'Remove from Starred' : 'Add to Starred' },
      SEPARATOR,
      {
        id: 'trash',
        label: 'Move to Trash',
        accelerator: TRASH_ACCELERATOR,
        enabled: list.every((f) => f.capabilities?.canTrash !== false)
      }
    ]
  }

  const backgroundMenu = (): MenuItem[] => [
    { id: 'new-folder', label: 'New folder', enabled: !!folder },
    { id: 'paste', label: 'Paste', accelerator: 'CmdOrCtrl+V', enabled: !!folder && !!clipboard },
    SEPARATOR,
    ...uploadItems,
    SEPARATOR,
    { id: 'refresh', label: 'Refresh' }
  ]

  const newMenu = (): MenuItem[] => [
    { id: 'new-folder', label: 'Folder', enabled: !!folder },
    SEPARATOR,
    ...NEW_GOOGLE_FILES.map((t) => ({ id: `new:${t.mimeType}`, label: t.label })),
    SEPARATOR,
    ...uploadItems
  ]

  async function onContextMenu(e: React.MouseEvent, file: DriveFile | null) {
    e.preventDefault()
    let list = selected
    if (file && !selection.has(file.id)) {
      setSelection(new Set([file.id]))
      setAnchor(file.id)
      list = [file]
    }
    const choice = await window.glovebox.popupMenu(file ? fileMenu(list) : backgroundMenu())
    if (choice) doAction(choice, file ? list : [])
  }

  async function onNewClick(e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect()
    const choice = await window.glovebox.popupMenu(newMenu(), { x: Math.round(rect.left), y: Math.round(rect.bottom + 4) })
    if (choice) doAction(choice, [])
  }

  // ---- Keyboard ----

  function onKeyDown(e: React.KeyboardEvent) {
    const action = findShortcut(bindings, keyPressFrom(e), isMac, 'explorer')
    const newType = (mime: string) => () => newGoogleFile(mime)
    const handlers: Partial<Record<ShortcutId, () => unknown>> = {
      open: () => selected.length && doAction('open', selected),
      rename: () => selected.length === 1 && setRenamingId(selected[0].id),
      trash: () => selected.length && trashSelected(selected),
      cut: () => selected.length && setClipboard({ mode: 'cut', files: selected }),
      copy: () => selected.length && copyToClipboard(selected),
      paste: () => folder && paste(folder.id),
      'select-all': () => setSelection(new Set(sorted.map((f) => f.id))),
      up: goUp,
      back: goBack,
      forward: goForward,
      refresh: reload,
      search: () => searchRef.current?.focus(),
      'new-folder': newFolder,
      'new-doc': newType('application/vnd.google-apps.document'),
      'new-sheet': newType('application/vnd.google-apps.spreadsheet'),
      'new-slides': newType('application/vnd.google-apps.presentation'),
      'new-form': newType('application/vnd.google-apps.form')
    }
    const handler = action && handlers[action]
    if (handler) handler()
    else if (e.key === 'Escape') setSelection(new Set())
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const i = sorted.findIndex((f) => f.id === anchor)
      const next = sorted[e.key === 'ArrowDown' ? Math.min(i + 1, sorted.length - 1) : Math.max(i - 1, 0)]
      if (next) {
        setSelection(new Set([next.id]))
        setAnchor(next.id)
      }
    } else return
    e.preventDefault()
  }

  // ---- Drag and drop ----

  const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE) || e.dataTransfer.types.includes('Files')

  const dropProps: DropProps = (targetId) => ({
    'data-drop-target': dropTarget === targetId,
    onDragOver: (e) => {
      if (!accepts(e)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_TYPE) ? 'move' : 'copy'
      setDropTarget(targetId)
    },
    onDragLeave: () => setDropTarget((t) => (t === targetId ? null : t)),
    onDrop: (e) => {
      if (!accepts(e)) return // e.g. a dock tab being dropped for split view
      e.preventDefault()
      e.stopPropagation()
      setDropTarget(null)
      dropInto(e.dataTransfer, targetId)
    }
  })

  function dropInto(data: DataTransfer, targetId: string) {
    const internal = data.getData(DRAG_TYPE)
    if (internal) return moveIds(JSON.parse(internal), targetId)
    uploadPaths([...data.files].map((f) => window.glovebox.pathForFile(f)).filter(Boolean), targetId)
  }

  // ---- Rendering ----

  const emptyText =
    location.kind === 'search'
      ? 'No results.'
      : location.kind === 'view' && location.view === 'trash'
        ? 'Trash is empty.'
        : location.kind === 'view' && location.view === 'shared-drives'
          ? "You don't have any shared drives."
          : 'This folder is empty.'
  const message = error ? (
    <p className="list-message error">{error}</p>
  ) : !files ? (
    <p className="list-message muted">Loading…</p>
  ) : files.length === 0 ? (
    <p className="list-message muted">{emptyText}</p>
  ) : null

  return (
    <div className="explorer" ref={listRef}>
      <section className="explorer-main">
        <header className="toolbar">
          <button onClick={goBack} disabled={!back.length} title="Back (Alt+←)">
            <Icon name="back" size={18} />
          </button>
          <button onClick={goForward} disabled={!forward.length} title="Forward (Alt+→)">
            <Icon name="forward" size={18} />
          </button>
          <button onClick={goUp} disabled={!canGoUp} title="Up (Backspace)">
            <Icon name="up" size={18} />
          </button>
          <button onClick={reload} title="Refresh">
            <Icon name="refresh" size={18} />
          </button>
          <button className="new-button" onClick={onNewClick} title="New file, folder or upload">
            <Icon name="add" size={18} />
          </button>
          <div className="breadcrumb">
            {location.kind === 'folder' ? (
              location.path.map((crumb, i) => (
                <span key={crumb.id + i}>
                  {i > 0 && <span className="crumb-sep">›</span>}
                  <button
                    className="crumb"
                    onClick={() => i < location.path.length - 1 && navigate({ ...location, path: location.path.slice(0, i + 1) })}
                    {...dropProps(crumb.id)}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))
            ) : (
              <span className="crumb">
                {location.kind === 'view' ? SECTION_LABELS[location.view] : `Search results for “${location.query}”`}
              </span>
            )}
          </div>
          <label className="search">
            <Icon name="search" />
            <input
              ref={searchRef}
              placeholder={folder ? `Search ${folder.name}` : 'Search Drive'}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchText.trim()) {
                  const within = location.kind === 'search' ? location.within : folder
                  const from = location.kind === 'search' ? location.from : location
                  navigate({ kind: 'search', query: searchText.trim(), within, from })
                } else if (e.key === 'Escape') {
                  setSearchText('')
                  if (location.kind === 'search') navigate(location.from)
                }
              }}
            />
          </label>
          {onCloseSide && (
            <button className="close-side" onClick={onCloseSide} title="Close this side (the tab stays in the dock)">
              ×
            </button>
          )}
        </header>

        {location.kind === 'search' && (
          <div className="search-scope">
            {location.within ? (
              <>
                Searching in <b>{location.within.name}</b> and its subfolders.
                <button onClick={() => navigate({ ...location, within: null })}>Search all of Drive</button>
              </>
            ) : (
              <>Searching all of Drive.</>
            )}
          </div>
        )}

        <FileList
          files={sorted}
          selection={selection}
          anchor={anchor}
          onSelect={(s, a) => {
            setSelection(s)
            setAnchor(a)
          }}
          sort={effectiveSort ?? { key: 'name', asc: true }}
          showSort={!!effectiveSort}
          onSort={setSort}
          cutIds={new Set(clipboard?.mode === 'cut' ? clipboard.files.map((f) => f.id) : [])}
          renamingId={renamingId}
          onRename={rename}
          onOpen={openFile}
          onContextMenu={onContextMenu}
          onKeyDown={onKeyDown}
          dropProps={dropProps}
          backgroundDrop={folder ? dropProps(folder.id) : {}}
          message={message}
        />

        <footer className="status-bar">
          <span>
            {files ? plural(files.length) : ''}
            {selection.size > 0 && ` · ${selection.size} selected`}
          </span>
          <span className={notice?.error ? 'error' : ''}>
            {upload ? `Uploading ${Math.min(upload.done + 1, upload.total)} of ${plural(upload.total, 'file')}…` : notice?.text}
          </span>
        </footer>
      </section>
    </div>
  )
}
