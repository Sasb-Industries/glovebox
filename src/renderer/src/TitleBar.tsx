import { useEffect, useState } from 'react'

/** Glovebox's own title bar (the native one is hidden so this can follow the theme). Drag to move the window. */
export function TitleBar() {
  const [title, setTitle] = useState(document.title)
  useEffect(() => {
    const observer = new MutationObserver(() => setTitle(document.title))
    observer.observe(document.querySelector('title')!, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return <div className="titlebar">{title}</div>
}
