import { clearAccessToken, getAccessToken } from './auth'
import type { DriveFile } from '../shared/types'

const FILE_FIELDS =
  'id,name,mimeType,modifiedTime,size,webViewLink,owners(displayName,me),shortcutDetails(targetId,targetMimeType)'

async function api(path: string, params: Record<string, string>, retried = false): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/${path}?${new URLSearchParams(params)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await getAccessToken()}` } })
  if (res.status === 401 && !retried) {
    clearAccessToken()
    return api(path, params, true)
  }
  const body = await res.json()
  if (!res.ok) throw new Error(`Drive: ${body.error?.message ?? res.status}`)
  return body
}

function assertId(id: string) {
  if (!/^[\w-]+$/.test(id)) throw new Error(`Bad Drive id: ${id}`)
}

export async function listFolder(folderId: string): Promise<DriveFile[]> {
  assertId(folderId)
  const files: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const page = await api('files', {
      q: `'${folderId}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      orderBy: 'folder,name_natural',
      pageSize: '1000',
      ...(pageToken && { pageToken })
    })
    files.push(...page.files)
    pageToken = page.nextPageToken
  } while (pageToken)
  return files
}

export async function getFile(fileId: string): Promise<DriveFile> {
  assertId(fileId)
  return api(`files/${fileId}`, { fields: FILE_FIELDS })
}
