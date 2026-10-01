import { useEffect, useMemo, useState } from 'react'
import type { DriveFile } from '../../shared/types'
import { displayMime, formatModified, formatSize, iconUrl, isFolder, isShortcut, ownerName } from './files'

interface Crumb {
  id: string
  name: string
}
type SortKey = 'name' | 'modified' | 'owner' | 'size'

const ROOT: Crumb[] = [{ id: 'root', name: 'My Drive' }]

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'modified', label: 'Date modified' },
  { key: 'owner', label: 'Owner' },
  { key: 'size', label: 'Size' }
]

const sortValue: Record<SortKey, (f: DriveFile) => string | number> = {
  name: (f) => f.name.toLowerCase(),
  modified: (f) => f.modifiedTime,
  owner: (f) => ownerName(f).toLowerCase(),
  size: (f) => Number(f.size ?? -1)
}

interface Props {
  refreshKey: number
  onOpen: (file: DriveFile, forceNew: boolean) => void
  onAuthError: (e: unknown) => boolean
}

export function Explorer({ refreshKey, onOpen, onAuthError }: Props) {
  const [path, setPath] = useState<Crumb[]>(ROOT)
  const [back, setBack] = useState<Crumb[][]>([])
  const [forward, setForward] = useState<Crumb[][]>([])
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true })
  const [reloads, setReloads] = useState(0)

  const folderId = path[path.length - 1].id

  useEffect(() => {
    let cancelled = false
    setFiles(null)
    setError(null)
    setSelected(null)
    window.glovebox.listFolder(folderId).then(
      (list) => !cancelled && setFiles(list),
      (e) => !cancelled && !onAuthError(e) && setError(String(e.message))
    )
    return () => void (cancelled = true)
  }, [folderId, refreshKey, reloads, onAuthError])

  const sorted = useMemo(() => {
    if (!files) return []
    const value = sortValue[sort.key]
    return [...files].sort((a, b) => {
      if (isFolder(a) !== isFolder(b)) return isFolder(a) ? -1 : 1
      const [x, y] = [value(a), value(b)]
      return (x < y ? -1 : x > y ? 1 : 0) * (sort.asc ? 1 : -1)
    })
  }, [files, sort])

  function navigate(next: Crumb[]) {
    setBack((b) => [...b, path])
    setForward([])
    setPath(next)
  }
  function goBack() {
    setForward((f) => [path, ...f])
    setPath(back[back.length - 1])
    setBack((b) => b.slice(0, -1))
  }
  function goForward() {
    setBack((b) => [...b, path])
    setPath(forward[0])
    setForward((f) => f.slice(1))
  }
  const goUp = () => path.length > 1 && navigate(path.slice(0, -1))

  async function open(file: DriveFile, forceNew = false) {
    if (isShortcut(file)) {
      try {
        file = await window.glovebox.getFile(file.shortcutDetails!.targetId)
      } catch (e) {
        if (!onAuthError(e)) setError(String((e as Error).message))
        return
      }
    }
    if (isFolder(file)) navigate([...path, { id: file.id, name: file.name }])
    else onOpen(file, forceNew)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const file = sorted.find((f) => f.id === selected)
    if (e.key === 'Enter' && file) open(file, e.metaKey || e.ctrlKey)
    else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) goUp()
    else if (e.altKey && e.key === 'ArrowLeft' && back.length) goBack()
    else if (e.altKey && e.key === 'ArrowRight' && forward.length) goForward()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const i = sorted.findIndex((f) => f.id === selected)
      const next = e.key === 'ArrowDown' ? Math.min(i + 1, sorted.length - 1) : Math.max(i - 1, 0)
      if (sorted[next]) setSelected(sorted[next].id)
    } else return
    e.preventDefault()
  }

  return (
    <div className="explorer">
      <aside className="nav-pane">
        <button className="nav-item active" onClick={() => navigate(ROOT)}>
          <img src={iconUrl('application/vnd.google-apps.folder')} alt="" />
          My Drive
        </button>
      </aside>

      <section className="explorer-main">
        <header className="toolbar">
          <button onClick={goBack} disabled={!back.length} title="Back (Alt+←)">
            ←
          </button>
          <button onClick={goForward} disabled={!forward.length} title="Forward (Alt+→)">
            →
          </button>
          <button onClick={goUp} disabled={path.length < 2} title="Up (Backspace)">
            ↑
          </button>
          <button onClick={() => setReloads((r) => r + 1)} title="Refresh">
            ⟳
          </button>
          <div className="breadcrumb">
            {path.map((crumb, i) => (
              <span key={crumb.id + i}>
                {i > 0 && <span className="crumb-sep">›</span>}
                <button className="crumb" onClick={() => i < path.length - 1 && navigate(path.slice(0, i + 1))}>
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
        </header>

        <div className="file-list" tabIndex={0} onKeyDown={onKeyDown}>
          <div className="file-row file-header">
            {COLUMNS.map((col) => (
              <button
                key={col.key}
                className={`col col-${col.key}`}
                onClick={() => setSort((s) => ({ key: col.key, asc: s.key === col.key ? !s.asc : true }))}
              >
                {col.label}
                {sort.key === col.key && <span className="sort-arrow">{sort.asc ? '▲' : '▼'}</span>}
              </button>
            ))}
          </div>
          {error && <p className="list-message error">{error}</p>}
          {!error && !files && <p className="list-message muted">Loading…</p>}
          {files?.length === 0 && <p className="list-message muted">This folder is empty.</p>}
          {sorted.map((file) => (
            <div
              key={file.id}
              className={`file-row ${selected === file.id ? 'selected' : ''}`}
              onClick={() => setSelected(file.id)}
              onDoubleClick={(e) => open(file, e.metaKey || e.ctrlKey)}
              onAuxClick={(e) => e.button === 1 && open(file, true)}
            >
              <span className="col col-name">
                <img src={iconUrl(displayMime(file))} alt="" />
                <span className="file-name">{file.name}</span>
                {isShortcut(file) && <span className="shortcut-badge" title="Shortcut">↗</span>}
              </span>
              <span className="col col-modified">{formatModified(file.modifiedTime)}</span>
              <span className="col col-owner">{ownerName(file)}</span>
              <span className="col col-size">{formatSize(file.size)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
