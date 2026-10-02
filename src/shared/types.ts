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

export type Theme = 'system' | 'light' | 'dim' | 'dark' | 'pastel'

/** Window background per theme, so new windows don't flash the wrong colour. */
export const THEME_BACKGROUNDS: Record<Exclude<Theme, 'system'>, string> = {
  light: '#ffffff',
  dim: '#2a2d33',
  dark: '#1c1c1e',
  pastel: '#fffdf8'
}

export interface Prefs {
  /** Reopen the previous windows and tabs at launch. Off by default: a fresh start. */
  restoreTabs: boolean
  /** Open each file in its own window instead of a tab. */
  openInOwnWindow: boolean
  theme: Theme
  /** Only the user's changes; everything else uses the platform defaults. */
  shortcuts: Partial<Record<string, string>>
}

export const DEFAULT_PREFS: Prefs = { restoreTabs: false, openInOwnWindow: false, theme: 'system', shortcuts: {} }

/** A document tab as saved in sessions and moved between windows. */
export interface TabState {
  fileId: string | null
  title: string
  mimeType: string
  url: string
}

export interface WindowInit {
  /** 'main': the rail, explorer and tabs. 'doc': a single document filling the window, nothing else. */
  kind: 'main' | 'doc'
  tabs: TabState[]
  /** Index of the tab to show, or -1 for Files. */
  activeIndex: number
}

export interface ProfileList {
  profiles: Profile[]
  activeId: string | null
}
