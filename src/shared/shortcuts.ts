// Keyboard shortcuts: definitions, defaults (modelled on Chrome and Google Drive), and matching.
// Bindings are strings like "Mod+T", where Mod is Cmd on macOS and Ctrl elsewhere.

export const SHORTCUTS = [
  // App scope: work everywhere, including while typing in a Google document.
  { id: 'next-tab', label: 'Next tab', scope: 'app', mac: 'Ctrl+Tab', other: 'Ctrl+Tab' },
  { id: 'prev-tab', label: 'Previous tab', scope: 'app', mac: 'Ctrl+Shift+Tab', other: 'Ctrl+Shift+Tab' },
  { id: 'close-tab', label: 'Close tab', scope: 'app', mac: 'Mod+W', other: 'Mod+W' },
  { id: 'files', label: 'Go to Files', scope: 'app', mac: 'Mod+1', other: 'Mod+1' },
  // Explorer scope: only while the file list has focus.
  { id: 'new-folder-tab', label: 'New folder tab', scope: 'explorer', mac: 'Mod+T', other: 'Mod+T' },
  { id: 'open', label: 'Open', scope: 'explorer', mac: 'Enter', other: 'Enter' },
  { id: 'rename', label: 'Rename', scope: 'explorer', mac: 'F2', other: 'F2' },
  { id: 'trash', label: 'Move to Trash', scope: 'explorer', mac: 'Mod+Backspace', other: 'Delete' },
  { id: 'cut', label: 'Cut', scope: 'explorer', mac: 'Mod+X', other: 'Mod+X' },
  { id: 'copy', label: 'Copy', scope: 'explorer', mac: 'Mod+C', other: 'Mod+C' },
  { id: 'paste', label: 'Paste', scope: 'explorer', mac: 'Mod+V', other: 'Mod+V' },
  { id: 'select-all', label: 'Select all', scope: 'explorer', mac: 'Mod+A', other: 'Mod+A' },
  { id: 'up', label: 'Up one folder', scope: 'explorer', mac: 'Backspace', other: 'Backspace' },
  { id: 'back', label: 'Back', scope: 'explorer', mac: 'Mod+[', other: 'Alt+ArrowLeft' },
  { id: 'forward', label: 'Forward', scope: 'explorer', mac: 'Mod+]', other: 'Alt+ArrowRight' },
  { id: 'refresh', label: 'Refresh', scope: 'explorer', mac: 'F5', other: 'F5' },
  { id: 'search', label: 'Search', scope: 'explorer', mac: '/', other: '/' },
  { id: 'new-folder', label: 'New folder', scope: 'explorer', mac: 'Shift+F', other: 'Shift+F' },
  { id: 'new-doc', label: 'New Google Doc', scope: 'explorer', mac: 'Shift+T', other: 'Shift+T' },
  { id: 'new-sheet', label: 'New Google Sheet', scope: 'explorer', mac: 'Shift+S', other: 'Shift+S' },
  { id: 'new-slides', label: 'New Google Slides', scope: 'explorer', mac: 'Shift+P', other: 'Shift+P' },
  { id: 'new-form', label: 'New Google Form', scope: 'explorer', mac: 'Shift+O', other: 'Shift+O' }
] as const

export type ShortcutId = (typeof SHORTCUTS)[number]['id']
export type Bindings = Record<ShortcutId, string>

export const defaultBindings = (isMac: boolean) =>
  Object.fromEntries(SHORTCUTS.map((s) => [s.id, isMac ? s.mac : s.other])) as Bindings

/** A key press, from a DOM KeyboardEvent or Electron's before-input-event. */
export interface KeyPress {
  key: string
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}

export const keyPressFrom = (e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }) => ({
  key: e.key,
  ctrl: e.ctrlKey,
  meta: e.metaKey,
  alt: e.altKey,
  shift: e.shiftKey
})

const normKey = (key: string) => (key.length === 1 ? key.toUpperCase() : key)

export function matches(binding: string | undefined, k: KeyPress, isMac: boolean): boolean {
  if (!binding) return false
  const parts = binding.split('+')
  const key = parts.pop()!
  const want = { ctrl: false, meta: false, alt: false, shift: false }
  for (const p of parts) {
    if (p === 'Mod') want[isMac ? 'meta' : 'ctrl'] = true
    else if (p === 'Ctrl') want.ctrl = true
    else if (p === 'Meta') want.meta = true
    else if (p === 'Alt') want.alt = true
    else if (p === 'Shift') want.shift = true
  }
  // Shifted punctuation (e.g. "?") reports shift; only enforce shift for named keys and letters.
  const shiftMatters = key.length > 1 || /[A-Z]/i.test(key)
  return (
    want.ctrl === k.ctrl &&
    want.meta === k.meta &&
    want.alt === k.alt &&
    (!shiftMatters || want.shift === k.shift) &&
    normKey(k.key) === normKey(key)
  )
}

export function findShortcut(bindings: Bindings, k: KeyPress, isMac: boolean, scope?: 'app' | 'explorer') {
  return SHORTCUTS.find((s) => (!scope || s.scope === scope) && matches(bindings[s.id], k, isMac))?.id
}

/** Turns a key press into a binding string, or null for a bare modifier press. */
export function bindingFrom(k: KeyPress, isMac: boolean): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(k.key)) return null
  const parts: string[] = []
  if (isMac ? k.meta : k.ctrl) parts.push('Mod')
  if (isMac ? k.ctrl : k.meta) parts.push(isMac ? 'Ctrl' : 'Meta')
  if (k.alt) parts.push('Alt')
  if (k.shift) parts.push('Shift')
  parts.push(normKey(k.key === ' ' ? 'Space' : k.key))
  return parts.join('+')
}

const MAC_SYMBOLS: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' }
const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Backspace: '⌫',
  Enter: '↵',
  Delete: 'Del'
}

/** "Mod+Shift+T" → "⌘⇧T" on macOS, "Ctrl+Shift+T" elsewhere. */
export function formatBinding(binding: string, isMac: boolean): string {
  if (!binding) return '—'
  const parts = binding.split('+')
  const key = parts.pop()!
  const keyName = KEY_NAMES[key] ?? key
  if (isMac) return parts.map((p) => MAC_SYMBOLS[p] ?? p).join('') + keyName
  return [...parts.map((p) => (p === 'Mod' ? 'Ctrl' : p === 'Meta' ? 'Win' : p)), keyName].join('+')
}
