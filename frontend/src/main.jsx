import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// HashRouter (not BrowserRouter): the app is served from S3/CloudFront with
// no server-side routing, and hash fragments never hit the server — so this
// avoids needing a distribution-wide SPA-fallback rewrite, which would
// otherwise also clobber genuine API 404s (see terraform/modules/frontend).
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
