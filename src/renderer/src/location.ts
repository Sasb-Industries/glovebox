import type { Crumb, DriveView } from '../../shared/types'

/** Where an explorer is looking: a real folder, one of the nav pane's lists, or search results. */
export type Location =
  | { kind: 'folder'; path: Crumb[] }
  | { kind: 'view'; view: DriveView }
  | { kind: 'search'; query: string; within: Crumb | null; from: Location }

export const MY_DRIVE: Location = { kind: 'folder', path: [{ id: 'root', name: 'My Drive' }] }

export const VIEW_LABELS: Record<DriveView, string> = {
  'shared-drives': 'Shared drives',
  'shared-with-me': 'Shared with me',
  recent: 'Recent',
  starred: 'Starred',
  trash: 'Trash'
}

/** The folder new files, pastes and uploads go into, if the location is a folder. */
export const folderOf = (loc: Location): Crumb | null => (loc.kind === 'folder' ? loc.path[loc.path.length - 1] : null)
