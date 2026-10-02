import { useEffect, useState } from 'react'
import type { UpdateState } from '../../shared/types'

/** Live software-update state from the main process. */
export function useUpdateState() {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    window.glovebox.getUpdateState().then(setState)
    return window.glovebox.onUpdateState(setState)
  }, [])
  return state
}

export const updateWaiting = (s: UpdateState | null) => s?.status === 'available' || s?.status === 'ready'
