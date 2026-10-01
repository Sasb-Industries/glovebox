import { contextBridge, ipcRenderer } from 'electron'
import type { AppStatus, DriveFile, Profile } from '../shared/types'

const api = {
  status: (): Promise<AppStatus> => ipcRenderer.invoke('app:status'),
  signIn: (): Promise<Profile> => ipcRenderer.invoke('auth:sign-in'),
  signOut: (): Promise<void> => ipcRenderer.invoke('auth:sign-out'),
  listFolder: (folderId: string): Promise<DriveFile[]> => ipcRenderer.invoke('drive:list', folderId),
  getFile: (fileId: string): Promise<DriveFile> => ipcRenderer.invoke('drive:file', fileId),
  /** Google links clicked inside a document, to open as tabs. Returns an unsubscribe function. */
  onOpenUrl: (callback: (url: string) => void) => {
    const listener = (_e: unknown, url: string) => callback(url)
    ipcRenderer.on('open-url', listener)
    return () => void ipcRenderer.removeListener('open-url', listener)
  }
}

contextBridge.exposeInMainWorld('glovebox', api)

export type GloveboxApi = typeof api
