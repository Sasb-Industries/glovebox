import { FOLDER_MIME, SHORTCUT_MIME, type DriveFile } from '../../shared/types'

/** Drive's own file-type icon for any MIME type. */
export const iconUrl = (mimeType: string) =>
  `https://drive-thirdparty.googleusercontent.com/32/type/${mimeType}`

export const isFolder = (f: DriveFile) => f.mimeType === FOLDER_MIME
export const isShortcut = (f: DriveFile) => f.mimeType === SHORTCUT_MIME
/** The type a file looks like in lists: shortcuts show their target's icon. */
export const displayMime = (f: DriveFile) => f.shortcutDetails?.targetMimeType ?? f.mimeType

// Office files open in Google's editors (Office-editing mode), matching Drive.
const OFFICE_EDITORS: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheets',
  'application/vnd.ms-excel': 'spreadsheets',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'application/vnd.ms-powerpoint': 'presentation'
}

export function openUrlFor(f: DriveFile): string {
  const editor = OFFICE_EDITORS[f.mimeType]
  if (editor) return `https://docs.google.com/${editor}/d/${f.id}/edit?rtpof=true`
  return f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`
}

const URL_MIMES: [RegExp, string][] = [
  [/\/document\//, 'application/vnd.google-apps.document'],
  [/\/spreadsheets\//, 'application/vnd.google-apps.spreadsheet'],
  [/\/presentation\//, 'application/vnd.google-apps.presentation'],
  [/\/forms\//, 'application/vnd.google-apps.form'],
  [/\/drawings\//, 'application/vnd.google-apps.drawing']
]

/** Best guess at a file's id and type from a Google URL (for links clicked inside documents). */
export function describeUrl(url: string): { fileId: string | null; mimeType: string } {
  const fileId = url.match(/\/d\/([\w-]+)/)?.[1] ?? null
  const mimeType = URL_MIMES.find(([re]) => re.test(url))?.[1] ?? 'application/octet-stream'
  return { fileId, mimeType }
}

/** "Essay - Google Docs" → "Essay" */
export const cleanTitle = (title: string) =>
  title.replace(/ - Google (Docs|Sheets|Slides|Forms|Drawings|Drive)$/, '')

export function formatModified(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== today.getFullYear() && { year: 'numeric' })
  })
}

export function formatSize(size?: string): string {
  if (!size) return '—'
  let n = Number(size)
  for (const unit of ['bytes', 'KB', 'MB', 'GB']) {
    if (n < 1024 || unit === 'GB') return unit === 'bytes' ? `${n} bytes` : `${n.toFixed(n < 10 ? 1 : 0)} ${unit}`
    n /= 1024
  }
  return ''
}

export const ownerName = (f: DriveFile) => {
  const owner = f.owners?.[0]
  return !owner ? '—' : owner.me ? 'me' : owner.displayName
}
