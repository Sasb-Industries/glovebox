import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { PrefsProvider } from './prefs'
import { TitleBar } from './TitleBar'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <TitleBar />
      <div className="window-body">
        <App />
      </div>
    </PrefsProvider>
  </StrictMode>
)
