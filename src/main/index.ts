import { app, BrowserWindow, ipcMain, nativeTheme, session, shell, type WebContents } from 'electron'
import { join } from 'node:path'
import * as auth from './auth'
import * as drive from './drive'
import type { AppStatus } from '../shared/types'

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
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
  win.once('ready-to-show', () => win.show())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

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
ipcMain.handle('auth:sign-in', () => auth.signIn())
ipcMain.handle('auth:sign-out', async () => {
  const profile = auth.getProfile()
  auth.signOut()
  if (profile) await session.fromPartition(partitionFor(profile.id)).clearStorageData()
})
ipcMain.handle('drive:list', (_e, folderId: string) => drive.listFolder(folderId))
ipcMain.handle('drive:file', (_e, fileId: string) => drive.getFile(fileId))

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
