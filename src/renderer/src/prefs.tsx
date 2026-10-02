import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Prefs } from '../../shared/types'
import { defaultBindings, type Bindings } from '../../shared/shortcuts'

export const isMac = navigator.userAgent.includes('Mac')

const PrefsContext = createContext<Prefs | null>(null)

/** Loads preferences from the main process and keeps every window in sync when they change. */
export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  useEffect(() => {
    window.glovebox.getPrefs().then(setPrefs)
    return window.glovebox.onPrefsChanged(setPrefs)
  }, [])
  return prefs && <PrefsContext.Provider value={prefs}>{children}</PrefsContext.Provider>
}

export const usePrefs = () => useContext(PrefsContext)!
export const setPrefs = (changes: Partial<Prefs>) => window.glovebox.setPrefs(changes)

export function useBindings(): Bindings {
  const { shortcuts } = usePrefs()
  return useMemo(() => ({ ...defaultBindings(isMac), ...shortcuts }) as Bindings, [shortcuts])
}
