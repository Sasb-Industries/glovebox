// Windows and sessions. Every window belongs to the active profile; switching profile closes them
// all and reopens that profile's windows. Each window reports its doc tabs here so they can be
// restored (at launch when the preference is on, and always when switching back to a profile).
import { app, BrowserWindow, nativeImage, screen } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as auth from './auth'
import * as drive from './drive'
import { getPrefs, titleBarOverlay, windowBackground } from './prefs'
import type { TabState, WindowInit } from '../shared/types'

interface SavedWindow {
  kind: 'main' | 'doc'
  bounds: Electron.Rectangle
  tabs: TabState[]
  activeIndex: number
}

const sessionsPath = () => join(app.getPath('userData'), 'sessions.json')
const readSessions = (): Record<string, SavedWindow[]> =>
  existsSync(sessionsPath()) ? JSON.parse(readFileSync(sessionsPath(), 'utf8')) : {}

/** State of each open window (and of the last window after it closes), keyed by BrowserWindow id. */
const live = new Map<number, SavedWindow>()
const pendingInit = new Map<number, WindowInit>() // webContents id → tabs to open with
/** While true, closing windows keeps them in the saved session (quitting, switching profile). */
let keepingSession = false

export function saveSession() {
  const profile = auth.getProfile()
  if (!profile) return
  writeFileSync(sessionsPath(), JSON.stringify({ ...readSessions(), [profile.id]: [...live.values()] }, null, 2))
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
const saveSoon = () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveSession, 500)
}

export function createWindow(init: WindowInit = { kind: 'main', tabs: [], activeIndex: -1 }, bounds?: Partial<Electron.Rectangle>) {
  const win = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Glovebox',
    backgroundColor: windowBackground(),
    autoHideMenuBar: true, // Windows: the menu bar appears with Alt.
    // Glovebox draws its own themed title bar; macOS keeps its traffic lights, Windows its caption buttons.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 12, y: 9 } }
      : { titleBarOverlay: titleBarOverlay() }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      webviewTag: true
    }
  })
  pendingInit.set(win.webContents.id, init)
  live.set(win.id, { kind: init.kind, bounds: win.getBounds(), tabs: init.tabs, activeIndex: init.activeIndex })
  if (init.kind === 'doc' && init.tabs[0]) setDocIcon(win, init.tabs[0].mimeType)
  const trackBounds = () => {
    live.set(win.id, { ...live.get(win.id)!, bounds: win.getBounds() })
    saveSoon()
  }
  win.once('ready-to-show', () => win.show())
  win.on('moved', trackBounds)
  win.on('resized', trackBounds)
  win.on('closed', () => {
    // Closing the last window quits the app, so its entry stays for "restore tabs".
    if (keepingSession || BrowserWindow.getAllWindows().length === 0) return
    live.delete(win.id)
    saveSoon()
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

/** Called by each window's renderer on load. */
export const takeInit = (webContentsId: number): WindowInit =>
  pendingInit.get(webContentsId) ?? { kind: 'main', tabs: [], activeIndex: -1 }

export function updateWindow(win: BrowserWindow, tabs: TabState[], activeIndex: number) {
  live.set(win.id, { ...live.get(win.id)!, tabs, activeIndex })
  // A window reloaded (e.g. Cmd+R) should come back with its tabs.
  pendingInit.set(win.webContents.id, { kind: live.get(win.id)!.kind, tabs, activeIndex })
  saveSoon()
}

/** Windows taskbar: show the document type's icon (Docs, Sheets…) instead of Glovebox's. */
async function setDocIcon(win: BrowserWindow, mimeType: string) {
  if (process.platform === 'darwin') return // macOS windows have no per-window icon.
  try {
    const res = await fetch(`https://drive-thirdparty.googleusercontent.com/64/type/${mimeType}`)
    const icon = nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer()))
    if (!win.isDestroyed() && !icon.isEmpty()) win.setIcon(icon)
  } catch {
    // Keep the app icon.
  }
}

/** Opens a document in its own window (just the document), centred on a screen point if given. */
export function openDocWindow(tab: TabState, at?: { x: number; y: number }) {
  const width = 1100
  const height = 760
  const bounds = at ? { x: Math.round(at.x - width / 2), y: Math.round(at.y - 20), width, height } : { width, height }
  if (at) {
    const area = screen.getDisplayNearestPoint(at).workArea
    bounds.x = Math.max(area.x, Math.min(bounds.x!, area.x + area.width - width))
    bounds.y = Math.max(area.y, Math.min(bounds.y!, area.y + area.height - height))
  }
  createWindow({ kind: 'doc', tabs: [tab], activeIndex: 0 }, bounds)
}

/** Opens the active profile's saved windows, or one empty window. */
export function openProfileWindows(restore: boolean) {
  const profile = auth.getProfile()
  const saved = profile && restore ? (readSessions()[profile.id] ?? []) : []
  if (!saved.length) return void createWindow()
  // Make sure there's a files window, even if only document windows were open.
  if (!saved.some((w) => w.kind !== 'doc')) createWindow()
  for (const w of saved) createWindow({ kind: w.kind ?? 'main', tabs: w.tabs, activeIndex: w.activeIndex }, w.bounds)
}

/** Closes every window (keeping its session) and reopens as the now-active profile.
 *  Callers save the previous profile's session before changing the active profile. */
export function reopenForActiveProfile() {
  clearTimeout(saveTimer)
  keepingSession = true
  for (const win of BrowserWindow.getAllWindows()) win.destroy()
  live.clear()
  keepingSession = false
  drive.resetCaches()
  // Switching back to a profile always brings its tabs back.
  openProfileWindows(true)
}

export function prepareToQuit() {
  clearTimeout(saveTimer)
  saveSession()
  keepingSession = true
}

const restoreFlagPath = () => join(app.getPath('userData'), 'restore-next-launch')

/** An update restart always brings tabs back, whatever the restore preference. */
export function restoreOnNextLaunch() {
  writeFileSync(restoreFlagPath(), '')
  prepareToQuit()
}

export function restoreAtLaunch() {
  const flagged = existsSync(restoreFlagPath())
  if (flagged) rmSync(restoreFlagPath())
  return flagged || getPrefs().restoreTabs
}
