import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  DRIVE_METHODS,
  type AppStatus,
  type MenuItem,
  type Prefs,
  type Profile,
  type ProfileList,
  type TabState,
  type UploadProgress,
  type WindowInit
} from '../shared/types'
import type { ShortcutId } from '../shared/shortcuts'
import type * as DriveModule from '../main/drive'

type Drive = { [K in (typeof DRIVE_METHODS)[number]]: (typeof DriveModule)[K] }

const subscribe = <T>(channel: string, callback: (value: T) => void) => {
  const listener = (_e: unknown, value: T) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => void ipcRenderer.removeListener(channel, listener)
}

const api = {
  status: (): Promise<AppStatus> => ipcRenderer.invoke('app:status'),
  signIn: (): Promise<Profile> => ipcRenderer.invoke('auth:sign-in'),
  listProfiles: (): Promise<ProfileList> => ipcRenderer.invoke('profiles:list'),
  switchProfile: (id: string): Promise<void> => ipcRenderer.invoke('profiles:switch', id),
  removeProfile: (id: string): Promise<void> => ipcRenderer.invoke('profiles:remove', id),

  getPrefs: (): Promise<Prefs> => ipcRenderer.invoke('prefs:get'),
  setPrefs: (changes: Partial<Prefs>): Promise<Prefs> => ipcRenderer.invoke('prefs:set', changes),
  onPrefsChanged: (callback: (prefs: Prefs) => void) => subscribe('prefs-changed', callback),
  /** App shortcuts pressed while a document had focus. */
  onShortcut: (callback: (id: ShortcutId) => void) => subscribe('shortcut', callback),

  initWindow: (): Promise<WindowInit> => ipcRenderer.invoke('window:init'),
  updateWindow: (tabs: TabState[], activeIndex: number) => ipcRenderer.send('window:update', tabs, activeIndex),
  /** Opens a document in its own window, with nothing but the document. */
  openDocWindow: (tab: TabState, at?: { x: number; y: number }): Promise<void> => ipcRenderer.invoke('window:open-doc', tab, at),
  closeWindowIfOthers: (): Promise<void> => ipcRenderer.invoke('window:close-if-others'),

  drive: Object.fromEntries(
    DRIVE_METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke('drive', method, ...args)])
  ) as Drive,
  upload: (paths: string[], parentId: string): Promise<void> => ipcRenderer.invoke('drive:upload', paths, parentId),
  onUploadProgress: (callback: (p: UploadProgress) => void) => subscribe('upload-progress', callback),

  popupMenu: (items: MenuItem[], position?: { x: number; y: number }): Promise<string | null> =>
    ipcRenderer.invoke('menu:popup', items, position),
  pickPaths: (kind: 'files' | 'folder'): Promise<string[]> => ipcRenderer.invoke('dialog:pick', kind),
  confirm: (message: string, detail: string, confirmLabel: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirm', message, detail, confirmLabel),
  /** Local path of a file dropped in from the OS. */
  pathForFile: (file: File) => webUtils.getPathForFile(file),

  /** Google links clicked inside a document, to open as tabs. Returns an unsubscribe function. */
  onOpenUrl: (callback: (url: string) => void) => subscribe('open-url', callback)
}

contextBridge.exposeInMainWorld('glovebox', api)

export type GloveboxApi = typeof api
