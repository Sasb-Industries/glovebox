/// <reference types="vite/client" />
import type { GloveboxApi } from '../../preload'

declare global {
  interface Window {
    glovebox: GloveboxApi
  }
}
