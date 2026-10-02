import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GLOVEBOX_* values from .env are baked into the main process at build time.
  main: { envPrefix: 'GLOVEBOX_' },
  preload: {
    build: {
      rollupOptions: { input: { index: 'src/preload/index.ts', webview: 'src/preload/webview.ts' } }
    }
  },
  renderer: { plugins: [react()] }
})
