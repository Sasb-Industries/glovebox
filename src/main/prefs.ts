import { app, BrowserWindow, nativeTheme } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_PREFS, type Prefs } from '../shared/types'
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
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('prefs-changed', prefs)
  return prefs
}

export const applyTheme = () => void (nativeTheme.themeSource = getPrefs().theme)

export const getBindings = (): Bindings => ({
  ...defaultBindings(process.platform === 'darwin'),
  ...(getPrefs().shortcuts as Partial<Bindings>)
})
