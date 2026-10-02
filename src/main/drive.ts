// Thin wrapper over the Drive v3 REST API. Every exported function is callable from the renderer
// (see DRIVE_METHODS in preload), so keep arguments and results plain data.
import { openAsBlob } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { clearAccessToken, getAccessToken } from './auth'
import { FOLDER_MIME, type Crumb, type DriveFile, type DriveView, type UploadProgress } from '../shared/types'

const FILE_FIELDS =
  'id,name,mimeType,modifiedTime,size,webViewLink,parents,starred,owners(displayName,me),' +
  'shortcutDetails(targetId,targetMimeType),' +
  'capabilities(canRename,canTrash,canCopy,canAddChildren,canUntrash,canDelete)'
const ALL_DRIVES = { supportsAllDrives: 'true' }
const MAX_PAGES = 5

interface RequestOptions {
  method?: string
  params?: Record<string, string>
  body?: unknown
}

async function api(path: string, { method = 'GET', params = {}, body }: RequestOptions = {}, retried = false): Promise<any> {
  const shared = path.startsWith('files') ? ALL_DRIVES : {}
  const url = `https://www.googleapis.com/drive/v3/${path}?${new URLSearchParams({ ...shared, ...params })}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      ...(body !== undefined && { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (res.status === 401 && !retried) {
    clearAccessToken()
    return api(path, { method, params, body }, true)
  }
  if (res.status === 204) return null
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? `Drive error ${res.status}`)
  return json
}

function assertId(id: string) {
  if (!/^[\w-]+$/.test(id)) throw new Error(`Bad Drive id: ${id}`)
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

async function listFiles(q: string, orderBy?: string, maxPages = MAX_PAGES): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined
  for (let page = 0; page < maxPages; page++) {
    const res = await api('files', {
      params: {
        q,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        pageSize: '1000',
        includeItemsFromAllDrives: 'true',
        corpora: 'allDrives',
        ...(orderBy && { orderBy }),
        ...(pageToken && { pageToken })
      }
    })
    files.push(...res.files)
    pageToken = res.nextPageToken
    if (!pageToken) break
  }
  return files
}

// ---- Reading ----

export function listFolder(folderId: string): Promise<DriveFile[]> {
  assertId(folderId)
  return listFiles(`${quote(folderId)} in parents and trashed = false`, 'folder,name_natural', 50)
}

export async function listView(view: DriveView): Promise<DriveFile[]> {
  switch (view) {
    case 'shared-drives': {
      const res = await api('drives', { params: { pageSize: '100', fields: 'drives(id,name)' } })
      return res.drives.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name, mimeType: FOLDER_MIME }))
    }
    case 'shared-with-me':
      return listFiles('sharedWithMe = true and trashed = false')
    case 'recent':
      return listFiles(
        `viewedByMeTime > '2000-01-01T00:00:00' and trashed = false and mimeType != '${FOLDER_MIME}'`,
        'viewedByMeTime desc',
        1
      ).then((files) => files.slice(0, 200))
    case 'starred':
      return listFiles('starred = true and trashed = false')
    case 'trash':
      return listFiles("trashed = true and 'me' in owners")
  }
}

export async function getFile(fileId: string): Promise<DriveFile> {
  assertId(fileId)
  return api(`files/${fileId}`, { params: { fields: FILE_FIELDS } })
}

let myDriveId: string | undefined

/** Forgets per-account caches; call when the active profile changes. */
export function resetCaches() {
  myDriveId = undefined
  parentCache.clear()
}
const myDriveRootId = async () => (myDriveId ??= (await api('files/root', { params: { fields: 'id' } })).id as string)

/** The folder's real location, e.g. My Drive › School › Econ, by walking up its parents. */
export async function resolvePath(folderId: string): Promise<Crumb[]> {
  assertId(folderId)
  const rootId = await myDriveRootId()
  const crumbs: Crumb[] = []
  let current: { id: string; name: string; parents?: string[]; driveId?: string } = await api(`files/${folderId}`, {
    params: { fields: 'id,name,parents,driveId' }
  })
  for (let depth = 0; depth < 50; depth++) {
    if (current.id === rootId || current.id === 'root') {
      crumbs.unshift({ id: 'root', name: 'My Drive' })
      break
    }
    if (current.driveId && current.id === current.driveId) {
      const drive = await api(`drives/${current.id}`, { params: { fields: 'name' } })
      crumbs.unshift({ id: current.id, name: drive.name })
      break
    }
    crumbs.unshift({ id: current.id, name: current.name })
    if (!current.parents?.length) break
    try {
      current = await api(`files/${current.parents[0]}`, { params: { fields: 'id,name,parents,driveId' } })
    } catch {
      break // Parent isn't visible to us (e.g. a folder someone shared with us).
    }
  }
  return crumbs
}

const parentCache = new Map<string, string[]>()
async function parentsOf(id: string): Promise<string[]> {
  if (!parentCache.has(id)) {
    const res = await api(`files/${id}`, { params: { fields: 'parents' } }).catch(() => ({}))
    parentCache.set(id, res.parents ?? [])
  }
  return parentCache.get(id)!
}
async function isWithin(parents: string[], folderId: string, depth = 0): Promise<boolean> {
  if (depth > 30) return false
  for (const p of parents) {
    if (p === folderId) return true
    if (await isWithin(await parentsOf(p), folderId, depth + 1)) return true
  }
  return false
}

/** Full-text search across Drive, optionally limited to everything inside one folder (at any depth). */
export async function search(query: string, withinFolderId: string | null): Promise<DriveFile[]> {
  const results = await listFiles(`fullText contains ${quote(query)} and trashed = false`, undefined, 1)
  if (!withinFolderId) return results
  assertId(withinFolderId)
  const target = withinFolderId === 'root' ? await myDriveRootId() : withinFolderId
  const keep = await Promise.all(results.map((f) => isWithin(f.parents ?? [], target)))
  return results.filter((_, i) => keep[i])
}

// ---- Changing ----

export function create(name: string, mimeType: string, parentId: string): Promise<DriveFile> {
  assertId(parentId)
  return api('files', { method: 'POST', params: { fields: FILE_FIELDS }, body: { name, mimeType, parents: [parentId] } })
}

const update = (fileId: string, body: object, params: Record<string, string> = {}) => {
  assertId(fileId)
  return api(`files/${fileId}`, { method: 'PATCH', params: { fields: FILE_FIELDS, ...params }, body })
}

export const rename = (fileId: string, name: string): Promise<DriveFile> => update(fileId, { name })
export const setStarred = (fileId: string, starred: boolean): Promise<DriveFile> => update(fileId, { starred })
export const trash = (fileId: string): Promise<DriveFile> => update(fileId, { trashed: true })
export const restore = (fileId: string): Promise<DriveFile> => update(fileId, { trashed: false })

export async function deleteForever(fileId: string): Promise<void> {
  assertId(fileId)
  await api(`files/${fileId}`, { method: 'DELETE' })
}

export async function move(fileId: string, targetFolderId: string): Promise<DriveFile> {
  assertId(targetFolderId)
  if (fileId === targetFolderId) throw new Error("Can't move a folder into itself.")
  const { parents = [] } = await api(`files/${fileId}`, { params: { fields: 'parents' } })
  parentCache.delete(fileId)
  return update(fileId, {}, { addParents: targetFolderId, removeParents: parents.join(',') })
}

export function copy(fileId: string, targetFolderId: string, name?: string): Promise<DriveFile> {
  assertId(fileId)
  assertId(targetFolderId)
  return api(`files/${fileId}/copy`, {
    method: 'POST',
    params: { fields: FILE_FIELDS },
    body: { parents: [targetFolderId], ...(name && { name }) }
  })
}

// ---- Uploading ----

async function countFiles(path: string): Promise<number> {
  if (!(await stat(path)).isDirectory()) return 1
  const entries = await readdir(path)
  let n = 0
  for (const e of entries) if (!e.startsWith('.')) n += await countFiles(join(path, e))
  return n
}

async function uploadFile(path: string, parentId: string) {
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: basename(path), parents: [parentId] })
  })
  const location = init.headers.get('location')
  if (!init.ok || !location) throw new Error(`Upload of ${basename(path)} failed (${init.status})`)
  const res = await fetch(location, { method: 'PUT', body: await openAsBlob(path) })
  if (!res.ok) throw new Error(`Upload of ${basename(path)} failed (${res.status})`)
}

/** Uploads local files and folders (recursively, skipping dotfiles) into a Drive folder. */
export async function uploadPaths(paths: string[], parentId: string, onProgress: (p: UploadProgress) => void) {
  assertId(parentId)
  const progress = { done: 0, total: 0 }
  for (const p of paths) progress.total += await countFiles(p)
  onProgress(progress)

  async function upload(path: string, into: string) {
    if ((await stat(path)).isDirectory()) {
      const folder = await create(basename(path), FOLDER_MIME, into)
      for (const e of await readdir(path)) if (!e.startsWith('.')) await upload(join(path, e), folder.id)
    } else {
      await uploadFile(path, into)
      progress.done++
      onProgress(progress)
    }
  }
  for (const p of paths) await upload(p, parentId)
}
