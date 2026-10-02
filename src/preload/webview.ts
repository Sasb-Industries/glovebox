// Runs in every document webview. On Google's sign-in pages Glovebox presents as Firefox (see
// main/index.ts), so hide the Chromium-only APIs that would contradict that.
import { contextBridge } from 'electron'

if (location.hostname === 'accounts.google.com') {
  contextBridge.executeInMainWorld({
    func: () => {
      Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined })
      Object.defineProperty(Navigator.prototype, 'vendor', { get: () => '' })
      delete (window as { chrome?: unknown }).chrome
    }
  })
}
