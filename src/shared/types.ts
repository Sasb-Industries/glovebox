export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size?: string
  webViewLink?: string
  owners?: { displayName: string; me: boolean }[]
  shortcutDetails?: { targetId: string; targetMimeType: string }
}

export interface Profile {
  id: string
  email: string
  name: string
}

export type AppStatus =
  | { kind: 'needs-credentials' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; profile: Profile; webSignedIn: boolean }

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'

/** Thrown (by message) when the stored Google sign-in has expired and the user must reconnect. */
export const RECONNECT = 'GLOVEBOX_RECONNECT'
