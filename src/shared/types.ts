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

export type Theme = 'system' | 'light' | 'dim' | 'dark' | 'pastel' | 'latte' | 'frappe' | 'macchiato' | 'mocha'

/** Themes drawn on a dark background (native menus and scrollbars follow suit). */
export const DARK_THEMES: Theme[] = ['dark', 'frappe', 'macchiato', 'mocha']

/** Title bar colours per theme (the sidebar colour and text colour), for the Windows caption buttons. */
export const THEME_TITLEBAR: Record<Exclude<Theme, 'system'>, { color: string; symbolColor: string }> = {
  light: { color: '#f3f3f5', symbolColor: '#1d1d1f' },
  dim: { color: '#d7dae0', symbolColor: '#1f2228' },
  dark: { color: '#141416', symbolColor: '#ececf0' },
  pastel: { color: '#ede0fb', symbolColor: '#3b3450' },
  latte: { color: '#e6e9ef', symbolColor: '#4c4f69' },
  frappe: { color: '#292c3c', symbolColor: '#c6d0f5' },
  macchiato: { color: '#1e2030', symbolColor: '#cad3f5' },
  mocha: { color: '#181825', symbolColor: '#cdd6f4' }
}

/** Height of Glovebox's own title bar (the native one is hidden). */
export const TITLEBAR_HEIGHT = 32

/** Window background per theme, so new windows don't flash the wrong colour. */
export const THEME_BACKGROUNDS: Record<Exclude<Theme, 'system'>, string> = {
  light: '#ffffff',
  dim: '#e4e6ea',
  dark: '#1c1c1e',
  pastel: '#fffdf7',
  latte: '#eff1f5',
  frappe: '#303446',
  macchiato: '#24273a',
  mocha: '#1e1e2e'
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

export interface UpdateState {
  status: 'dev' | 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error'
  current: string
  latest?: string
  releaseUrl?: string
  /** 0–100 while downloading. */
  progress?: number
  /** macOS: the downloaded .dmg. */
  downloadedFile?: string
  error?: string
}

export interface ProfileList {
  profiles: Profile[]
  activeId: string | null
}
