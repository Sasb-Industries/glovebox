// Windows and sessions. Every window belongs to the active profile; switching profile closes them
// all and reopens that profile's windows. Each window reports its doc tabs here so they can be
// restored (at launch when the preference is on, and always when switching back to a profile).
import { app, BrowserWindow, nativeTheme, screen } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as auth from './auth'
import * as drive from './drive'
import { getPrefs } from './prefs'
import type { TabState, WindowInit } from '../shared/types'

interface SavedWindow {
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

export function createWindow(init: WindowInit = { tabs: [], activeIndex: -1 }, bounds?: Partial<Electron.Rectangle>) {
  const win = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Glovebox',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      webviewTag: true
    }
  })
  pendingInit.set(win.webContents.id, init)
  live.set(win.id, { bounds: win.getBounds(), tabs: init.tabs, activeIndex: init.activeIndex })
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
  pendingInit.get(webContentsId) ?? { tabs: [], activeIndex: -1 }

export function updateWindow(win: BrowserWindow, tabs: TabState[], activeIndex: number) {
  live.set(win.id, { ...live.get(win.id)!, tabs, activeIndex })
  // A window reloaded (e.g. Cmd+R) should come back with its tabs.
  pendingInit.set(win.webContents.id, { tabs, activeIndex })
  saveSoon()
}

/** Opens a new window holding these tabs, centred on a screen point if given. */
export function openTabsInNewWindow(tabs: TabState[], at?: { x: number; y: number }) {
  const width = 1100
  const height = 760
  const bounds = at ? { x: Math.round(at.x - width / 2), y: Math.round(at.y - 20), width, height } : { width, height }
  if (at) {
    const area = screen.getDisplayNearestPoint(at).workArea
    bounds.x = Math.max(area.x, Math.min(bounds.x!, area.x + area.width - width))
    bounds.y = Math.max(area.y, Math.min(bounds.y!, area.y + area.height - height))
  }
  createWindow({ tabs, activeIndex: tabs.length - 1 }, bounds)
}

/** Opens the active profile's saved windows, or one empty window. */
export function openProfileWindows(restore: boolean) {
  const profile = auth.getProfile()
  const saved = profile && restore ? (readSessions()[profile.id] ?? []) : []
  if (!saved.length) return void createWindow()
  for (const w of saved) createWindow({ tabs: w.tabs, activeIndex: w.activeIndex }, w.bounds)
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

export const restoreAtLaunch = () => getPrefs().restoreTabs
