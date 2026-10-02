import type { Crumb, DriveView } from '../../shared/types'

/** The top-level areas of Drive, picked from the rail's Files menu. */
export type Section = 'my-drive' | DriveView

/** Where an explorer is looking: a real folder, one of the section lists, or search results. */
export type Location =
  | { kind: 'folder'; path: Crumb[]; section: Section }
  | { kind: 'view'; view: DriveView }
  | { kind: 'search'; query: string; within: Crumb | null; from: Location }

export const MY_DRIVE: Location = { kind: 'folder', path: [{ id: 'root', name: 'My Drive' }], section: 'my-drive' }

export const SECTION_LABELS: Record<Section, string> = {
  'my-drive': 'My Drive',
  'shared-drives': 'Shared drives',
  'shared-with-me': 'Shared with me',
  recent: 'Recent',
  starred: 'Starred',
  trash: 'Trash'
}

export const sectionOf = (loc: Location): Section =>
  loc.kind === 'folder' ? loc.section : loc.kind === 'view' ? loc.view : sectionOf(loc.from)

export const sectionRoot = (section: Section): Location =>
  section === 'my-drive' ? MY_DRIVE : { kind: 'view', view: section }

/** The folder new files, pastes and uploads go into, if the location is a folder. */
export const folderOf = (loc: Location): Crumb | null => (loc.kind === 'folder' ? loc.path[loc.path.length - 1] : null)
