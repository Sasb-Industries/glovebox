import { app, BrowserWindow, ipcMain, nativeTheme, session, shell, type WebContents } from 'electron'
import { join } from 'node:path'
import * as auth from './auth'
import * as drive from './drive'
import type { AppStatus } from '../shared/types'

// Google refuses web sign-in from browsers that identify as Electron, so present as plain Chrome.
const platformUA =
  process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64'
app.userAgentFallback = `Mozilla/5.0 (${platformUA}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`

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
  // Only allow webviews that load into a profile's session, with no Node access.
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    if (!params.partition?.startsWith('persist:profile-')) event.preventDefault()
  })
  if (contents.getType() === 'webview') {
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
