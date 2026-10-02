export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
  webViewLink?: string
  parents?: string[]
  starred?: boolean
  owners?: { displayName: string; me: boolean }[]
  shortcutDetails?: { targetId: string; targetMimeType: string }
  capabilities?: {
    canRename?: boolean
    canTrash?: boolean
    canCopy?: boolean
    canAddChildren?: boolean
    canUntrash?: boolean
    canDelete?: boolean
  }
}

export interface Crumb {
  id: string
  name: string
}

/** Lists in the nav pane that aren't folders. */
export type DriveView = 'shared-drives' | 'shared-with-me' | 'recent' | 'starred' | 'trash'

export interface Profile {
  id: string
  email: string
  name: string
}

export type AppStatus =
  | { kind: 'needs-credentials' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; profile: Profile; webSignedIn: boolean }

export interface MenuItem {
  id?: string
  label?: string
  enabled?: boolean
  /** Shown as a hint only; menus don't register shortcuts. */
  accelerator?: string
  /** Shows a check mark when true. */
  checked?: boolean
  type?: 'separator'
}

export interface UploadProgress {
  done: number
  total: number
}

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'

/** Thrown (by message) when the stored Google sign-in has expired and the user must reconnect. */
export const RECONNECT = 'GLOVEBOX_RECONNECT'

/** Functions in main/drive.ts the renderer may call (via window.glovebox.drive). */
export const DRIVE_METHODS = [
  'listFolder',
  'listView',
  'getFile',
  'resolvePath',
  'search',
  'create',
  'rename',
  'setStarred',
  'trash',
  'restore',
  'deleteForever',
  'move',
  'copy'
] as const
