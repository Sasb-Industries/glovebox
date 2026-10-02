// Software updates from GitHub Releases. Checks at launch and daily.
// Windows installs in place (electron-updater). macOS can't replace an unsigned app, so it downloads
// the new .dmg and opens it for the user to drag into Applications.
import { app, BrowserWindow, shell } from 'electron'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { autoUpdater } from 'electron-updater'
import * as windows from './windows'
import type { UpdateState } from '../shared/types'

const REPO = 'Sasb-Industries/glovebox'
const DAY = 24 * 60 * 60 * 1000

let state: UpdateState = { status: app.isPackaged ? 'idle' : 'dev', current: app.getVersion() }
let latestAssets: { name: string; browser_download_url: string; size: number }[] = []

function set(changes: Partial<UpdateState>) {
  state = { ...state, ...changes }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update-state', state)
}

export const getState = () => state

/** "0.10.0" > "0.9.3" */
function isNewer(latest: string, current: string) {
  const [a, b] = [latest, current].map((v) => v.split('.').map((n) => parseInt(n, 10) || 0))
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  return false
}

export async function check() {
  if (!app.isPackaged || ['downloading', 'ready'].includes(state.status)) return
  set({ status: 'checking', error: undefined })
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (res.status === 404) return set({ status: 'up-to-date' })
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
    const release = await res.json()
    const latest = String(release.tag_name).replace(/^v/, '')
    latestAssets = release.assets
    set(isNewer(latest, state.current) ? { status: 'available', latest, releaseUrl: release.html_url } : { status: 'up-to-date', latest })
  } catch (e) {
    set({ status: 'error', error: (e as Error).message })
  }
}

export async function install() {
  if (state.status !== 'available') return
  set({ status: 'downloading', progress: 0 })
  try {
    if (process.platform === 'win32') await downloadWindows()
    else await downloadMac()
  } catch (e) {
    set({ status: 'error', error: (e as Error).message })
  }
}

let listening = false
async function downloadWindows() {
  autoUpdater.autoDownload = false
  if (!listening) autoUpdater.on('download-progress', (p) => set({ progress: Math.round(p.percent) }))
  listening = true
  await autoUpdater.checkForUpdates()
  await autoUpdater.downloadUpdate()
  set({ status: 'ready' })
}

async function downloadMac() {
  const asset =
    latestAssets.find((a) => a.name.endsWith(`-${process.arch}.dmg`)) ?? latestAssets.find((a) => a.name.endsWith('.dmg'))
  if (!asset) throw new Error('This release has no macOS download.')
  const res = await fetch(asset.browser_download_url)
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const file = join(app.getPath('downloads'), asset.name)
  let received = 0
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    set({ progress: Math.round((received / asset.size) * 100) })
  })
  await pipeline(body, createWriteStream(file))
  set({ status: 'ready', downloadedFile: file })
  await shell.openPath(file)
}

/** Windows: quit and install. macOS: reopen the downloaded .dmg. Either way, tabs come back next launch. */
export function restartToUpdate() {
  if (process.platform === 'win32') {
    windows.restoreOnNextLaunch()
    autoUpdater.quitAndInstall()
  } else if (state.downloadedFile) {
    shell.openPath(state.downloadedFile)
  }
}

export function startChecking() {
  setTimeout(check, 10_000)
  setInterval(check, DAY)
}
