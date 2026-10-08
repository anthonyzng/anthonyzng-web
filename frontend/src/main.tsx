import '@fontsource-variable/inter'
import '@fontsource-variable/noto-sans-tc'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
// The brush face of the light contact screen: Latin only ("Contact me", the channel names); Chinese falls back to Noto Sans TC.
import '@fontsource/ma-shan-zheng/latin-400.css'
import 'lenis/dist/lenis.css'
import './index.css'
import './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
