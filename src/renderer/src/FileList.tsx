import { useEffect, useRef } from 'react'
import type { DriveFile } from '../../shared/types'
import { displayMime, formatModified, formatSize, iconUrl, isFolder, isShortcut, ownerName } from './files'

export type SortKey = 'name' | 'modified' | 'owner' | 'size'
export interface Sort {
  key: SortKey
  asc: boolean
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'modified', label: 'Date modified' },
  { key: 'owner', label: 'Owner' },
  { key: 'size', label: 'Size' }
]

/** Props that make an element accept drops (files from the list or from the OS). */
export type DropProps = (targetId: string) => React.HTMLAttributes<HTMLElement> & { 'data-drop-target'?: boolean }

interface Props {
  files: DriveFile[]
  selection: Set<string>
  onSelect: (selection: Set<string>, anchor: string | null) => void
  anchor: string | null
  sort: Sort
  /** False while showing Google's own order (Recent, search results). */
  showSort: boolean
  onSort: (sort: Sort) => void
  cutIds: Set<string>
  renamingId: string | null
  onRename: (file: DriveFile, name: string | null) => void
  onOpen: (file: DriveFile, forceNew: boolean) => void
  onContextMenu: (e: React.MouseEvent, file: DriveFile | null) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  dropProps: DropProps
  /** Accepts drops on the list background (uploads into the current folder). */
  backgroundDrop: React.HTMLAttributes<HTMLElement>
  message: React.ReactNode
}

export const DRAG_TYPE = 'application/x-glovebox-files'

export function FileList(props: Props) {
  const { files, selection, onSelect, anchor, sort, onSort, cutIds, renamingId } = props

  function onRowClick(e: React.MouseEvent, file: DriveFile) {
    e.stopPropagation()
    if (e.shiftKey && anchor) {
      const [a, b] = [files.findIndex((f) => f.id === anchor), files.findIndex((f) => f.id === file.id)]
      const range = files.slice(Math.min(a, b), Math.max(a, b) + 1).map((f) => f.id)
      onSelect(new Set(range), anchor)
    } else if (e.metaKey || e.ctrlKey) {
      const next = new Set(selection)
      if (next.has(file.id)) next.delete(file.id)
      else next.add(file.id)
      onSelect(next, file.id)
    } else {
      onSelect(new Set([file.id]), file.id)
    }
  }

  function onDragStart(e: React.DragEvent, file: DriveFile) {
    const ids = selection.has(file.id) ? [...selection] : [file.id]
    if (!selection.has(file.id)) onSelect(new Set([file.id]), file.id)
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className="file-list"
      tabIndex={0}
      onKeyDown={props.onKeyDown}
      onClick={() => onSelect(new Set(), null)}
      onContextMenu={(e) => props.onContextMenu(e, null)}
      {...props.backgroundDrop}
    >
      <div className="file-row file-header">
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            className={`col col-${col.key}`}
            onClick={(e) => {
              e.stopPropagation()
              onSort({ key: col.key, asc: sort.key === col.key ? !sort.asc : true })
            }}
          >
            {col.label}
            {props.showSort && sort.key === col.key && <span className="sort-arrow">{sort.asc ? '▲' : '▼'}</span>}
          </button>
        ))}
      </div>
      {props.message}
      {files.map((file) => (
        <div
          key={file.id}
          className={`file-row ${selection.has(file.id) ? 'selected' : ''} ${cutIds.has(file.id) ? 'cut' : ''}`}
          draggable={renamingId !== file.id}
          onDragStart={(e) => onDragStart(e, file)}
          onClick={(e) => onRowClick(e, file)}
          onDoubleClick={(e) => props.onOpen(file, e.metaKey || e.ctrlKey)}
          onAuxClick={(e) => e.button === 1 && props.onOpen(file, true)}
          onContextMenu={(e) => {
            e.stopPropagation()
            props.onContextMenu(e, file)
          }}
          {...(isFolder(file) ? props.dropProps(file.id) : {})}
        >
          <span className="col col-name">
            <img src={iconUrl(displayMime(file))} alt="" draggable={false} />
            {renamingId === file.id ? (
              <RenameInput name={file.name} onDone={(name) => props.onRename(file, name)} />
            ) : (
              <span className="file-name">{file.name}</span>
            )}
            {isShortcut(file) && (
              <span className="badge" title="Shortcut">
                ↗
              </span>
            )}
            {file.starred && <span className="badge star">★</span>}
          </span>
          <span className="col col-modified">{formatModified(file.modifiedTime)}</span>
          <span className="col col-owner">{ownerName(file)}</span>
          <span className="col col-size">{formatSize(file.size)}</span>
        </div>
      ))}
    </div>
  )
}

/** Inline rename, like F2 in Explorer. Enter or clicking away saves; Escape cancels. */
function RenameInput({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const finish = (value: string | null) => {
    if (done.current) return
    done.current = true
    onDone(value?.trim() && value.trim() !== name ? value.trim() : null)
  }
  useEffect(() => {
    const input = ref.current!
    input.focus()
    // Select the name without its extension, like Explorer and Finder.
    const dot = name.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : name.length)
  }, [name])
  return (
    <input
      ref={ref}
      className="rename-input"
      defaultValue={name}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(e.currentTarget.value)
        if (e.key === 'Escape') finish(null)
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  )
}
