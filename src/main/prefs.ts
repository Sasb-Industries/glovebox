import { app, BrowserWindow, nativeTheme } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DARK_THEMES, DEFAULT_PREFS, THEME_BACKGROUNDS, THEME_TITLEBAR, TITLEBAR_HEIGHT, type Prefs } from '../shared/types'
import { defaultBindings, type Bindings } from '../shared/shortcuts'

const prefsPath = () => join(app.getPath('userData'), 'prefs.json')
let prefs: Prefs | null = null

export function getPrefs(): Prefs {
  prefs ??= { ...DEFAULT_PREFS, ...(existsSync(prefsPath()) ? JSON.parse(readFileSync(prefsPath(), 'utf8')) : {}) }
  return prefs!
}

export function setPrefs(changes: Partial<Prefs>): Prefs {
  prefs = { ...getPrefs(), ...changes }
  writeFileSync(prefsPath(), JSON.stringify(prefs, null, 2))
  applyTheme()
  updateTitleBars()
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('prefs-changed', prefs)
  return prefs
}

/** Custom themes are CSS; native menus and scrollbars follow the nearest system theme. */
export function applyTheme() {
  const { theme } = getPrefs()
  nativeTheme.themeSource = theme === 'system' ? 'system' : DARK_THEMES.includes(theme) ? 'dark' : 'light'
}

const resolvedTheme = () => {
  const { theme } = getPrefs()
  return theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme
}

/** Windows/Linux caption buttons drawn over our title bar, coloured to match the theme. */
export const titleBarOverlay = () => ({ ...THEME_TITLEBAR[resolvedTheme()], height: TITLEBAR_HEIGHT })

export function updateTitleBars() {
  if (process.platform === 'darwin') return
  for (const win of BrowserWindow.getAllWindows()) win.setTitleBarOverlay(titleBarOverlay())
}

export function windowBackground() {
  const { theme } = getPrefs()
  if (theme === 'system') return nativeTheme.shouldUseDarkColors ? THEME_BACKGROUNDS.dark : THEME_BACKGROUNDS.light
  return THEME_BACKGROUNDS[theme]
}

export const getBindings = (): Bindings => ({
  ...defaultBindings(process.platform === 'darwin'),
  ...(getPrefs().shortcuts as Partial<Bindings>)
})
