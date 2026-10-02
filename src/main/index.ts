import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, session, shell, type WebContents } from 'electron'
import { join } from 'node:path'
import * as auth from './auth'
import * as drive from './drive'
import { applyTheme, getBindings, getPrefs, setPrefs, updateTitleBars } from './prefs'
import * as windows from './windows'
import { findShortcut } from '../shared/shortcuts'
import { DRIVE_METHODS, type AppStatus, type MenuItem, type Prefs, type TabState } from '../shared/types'

// Present as plain Chrome so Google's editors treat us as a supported browser.
const isMac = process.platform === 'darwin'
const CHROME_UA = `Mozilla/5.0 (${isMac ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`
app.userAgentFallback = CHROME_UA

// Google's sign-in pages detect embedded Chromium ("This browser or app may not be secure") but
// accept Firefox. While a webview is on accounts.google.com, every request it makes presents as
// Firefox without Chromium's client hints; preload/webview.ts hides the matching JS APIs.
const FIREFOX_UA = `Mozilla/5.0 (${isMac ? 'Macintosh; Intel Mac OS X 10.15' : 'Windows NT 10.0; Win64; x64'}; rv:140.0) Gecko/20100101 Firefox/140.0`
const isGoogleSignIn = (url: string) => URL.parse(url)?.hostname === 'accounts.google.com'
const onSignInPage = new Set<number>() // webContents ids

app.on('session-created', (ses) => {
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!isGoogleSignIn(details.url) && !onSignInPage.has(details.webContentsId ?? -1))
      return callback({ requestHeaders: details.requestHeaders })
    const headers = details.requestHeaders
    for (const name of Object.keys(headers)) if (name.toLowerCase().startsWith('sec-ch-ua')) delete headers[name]
    headers['User-Agent'] = FIREFOX_UA
    callback({ requestHeaders: headers })
  })
})

const partitionFor = (profileId: string) => `persist:profile-${profileId}`
const GOOGLE_EDITOR_HOSTS = new Set(['docs.google.com', 'drive.google.com'])

/** Google file links become Glovebox tabs; everything else opens in the system browser. */
function routeLink(rawUrl: string, host: WebContents) {
  let url = new URL(rawUrl)
  // Links inside Docs go through google.com/url?q=<real url>.
  if (url.hostname.endsWith('google.com') && url.pathname === '/url' && url.searchParams.get('q')) {
    url = new URL(url.searchParams.get('q')!)
  }
  if (GOOGLE_EDITOR_HOSTS.has(url.hostname)) host.send('open-url', url.toString())
  else if (['https:', 'http:', 'mailto:'].includes(url.protocol)) shell.openExternal(url.toString())
}

app.on('web-contents-created', (_event, contents) => {
  // Only allow webviews that load into a profile's session, with our preload and no Node access.
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.preload = join(__dirname, '../preload/webview.js')
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    if (!params.partition?.startsWith('persist:profile-')) event.preventDefault()
  })
  if (contents.getType() === 'webview') {
    // App shortcuts (switch/close tabs) still work while typing in a document.
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const press = { key: input.key, ctrl: input.control, meta: input.meta, alt: input.alt, shift: input.shift }
      const action = findShortcut(getBindings(), press, isMac, 'app')
      if (action && contents.hostWebContents) {
        event.preventDefault()
        contents.hostWebContents.send('shortcut', action)
      }
    })
    // Keep the page's own navigator.userAgent consistent with the headers above.
    contents.on('did-start-navigation', (event) => {
      if (!event.isMainFrame || event.isSameDocument) return
      const signIn = isGoogleSignIn(event.url)
      if (signIn) onSignInPage.add(contents.id)
      else onSignInPage.delete(contents.id)
      contents.setUserAgent(signIn ? FIREFOX_UA : CHROME_UA)
    })
    contents.once('destroyed', () => onSignInPage.delete(contents.id))
    contents.setWindowOpenHandler(({ url }) => {
      if (contents.hostWebContents) routeLink(url, contents.hostWebContents)
      return { action: 'deny' }
    })
  }
  // The app's own pages never navigate away.
  if (contents.getType() === 'window') contents.on('will-navigate', (event) => event.preventDefault())
})

async function webSignedIn(profileId: string) {
  const cookies = await session.fromPartition(partitionFor(profileId)).cookies.get({ name: 'SID' })
  return cookies.some((c) => c.domain?.endsWith('google.com'))
}

ipcMain.handle('app:status', async (): Promise<AppStatus> => {
  if (!auth.hasCredentials()) return { kind: 'needs-credentials' }
  const profile = auth.getProfile()
  if (!profile) return { kind: 'signed-out' }
  return { kind: 'signed-in', profile, webSignedIn: await webSignedIn(profile.id) }
})
// Signing in to a different account than the active one switches the whole app to it.
ipcMain.handle('auth:sign-in', async () => {
  const before = auth.getProfile()?.id
  windows.saveSession()
  const profile = await auth.signIn()
  if (before && before !== profile.id) setImmediate(windows.reopenForActiveProfile)
  return profile
})
ipcMain.handle('profiles:list', () => auth.listProfiles())
ipcMain.handle('profiles:switch', (_e, id: string) => {
  if (id === auth.getProfile()?.id) return
  windows.saveSession()
  auth.setActiveProfile(id)
  windows.reopenForActiveProfile()
})
ipcMain.handle('profiles:remove', async (_e, id: string) => {
  const wasActive = auth.getProfile()?.id === id
  if (wasActive) windows.saveSession()
  auth.removeProfile(id)
  await session.fromPartition(partitionFor(id)).clearStorageData()
  if (wasActive) windows.reopenForActiveProfile()
})

ipcMain.handle('prefs:get', () => getPrefs())
ipcMain.handle('prefs:set', (_e, changes: Partial<Prefs>) => setPrefs(changes))

ipcMain.handle('window:init', (e) => windows.takeInit(e.sender.id))
ipcMain.on('window:update', (e, tabs: TabState[], activeIndex: number) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (win) windows.updateWindow(win, tabs, activeIndex)
})
ipcMain.handle('window:open-doc', (_e, tab: TabState, at?: { x: number; y: number }) => windows.openDocWindow(tab, at))
/** Closes the sender's window unless it's the last one. */
ipcMain.handle('window:close-if-others', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (win && BrowserWindow.getAllWindows().length > 1) win.close()
})
ipcMain.handle('drive', (_e, method: string, ...args: unknown[]) => {
  if (!(DRIVE_METHODS as readonly string[]).includes(method)) throw new Error(`Unknown Drive method: ${method}`)
  return (drive as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args)
})
ipcMain.handle('drive:upload', (e, paths: string[], parentId: string) =>
  drive.uploadPaths(paths, parentId, (progress) => e.sender.send('upload-progress', progress))
)

/** Native context menu; resolves with the chosen item's id, or null if dismissed. */
ipcMain.handle('menu:popup', (e, items: MenuItem[], position?: { x: number; y: number }) => {
  const window = BrowserWindow.fromWebContents(e.sender)!
  return new Promise<string | null>((resolve) => {
    let chosen: string | null = null
    const menu = Menu.buildFromTemplate(
      items.map((item) =>
        item.type === 'separator'
          ? { type: 'separator' }
          : {
              label: item.label,
              ...(item.checked !== undefined && { type: 'checkbox' as const, checked: item.checked }),
              enabled: item.enabled ?? true,
              accelerator: item.accelerator,
              registerAccelerator: false,
              click: () => (chosen = item.id ?? null)
            }
      )
    )
    // Menu click handlers run before the close callback.
    menu.popup({ window, ...position, callback: () => resolve(chosen) })
  })
})

ipcMain.handle('dialog:pick', async (e, kind: 'files' | 'folder') => {
  const window = BrowserWindow.fromWebContents(e.sender)!
  const result = await dialog.showOpenDialog(window, {
    properties: kind === 'files' ? ['openFile', 'multiSelections'] : ['openDirectory', 'multiSelections']
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('dialog:confirm', async (e, message: string, detail: string, confirmLabel: string) => {
  const window = BrowserWindow.fromWebContents(e.sender)!
  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    message,
    detail,
    buttons: [confirmLabel, 'Cancel'],
    defaultId: 1,
    cancelId: 1
  })
  return response === 0
})

/** A minimal menu: no Cmd+W "Close Window" (Glovebox uses it to close tabs), but keep Edit for text fields. */
function buildMenu() {
  const dev = !app.isPackaged
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(dev ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }, { type: 'separator' as const }] : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'New Files Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => windows.createWindow() },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  applyTheme()
  nativeTheme.on('updated', updateTitleBars) // "Match system" follows the OS live.
  buildMenu()
  windows.openProfileWindows(windows.restoreAtLaunch())
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && windows.openProfileWindows(false))
})
app.on('before-quit', windows.prepareToQuit)
// Closing the last window quits, on macOS too: reopening is always a fresh start (unless restoring).
app.on('window-all-closed', () => app.quit())
