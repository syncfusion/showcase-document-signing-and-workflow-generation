import { createRoot } from 'react-dom/client'
import { registerLicense } from '@syncfusion/ej2-base'
import '@syncfusion/ej2-tailwind3-theme/styles/tailwind3-lite.css'
import './index.css'
import App from './App.tsx'

const licenseKey = import.meta.env.VITE_SYNCFUSION_LICENSE_KEY
if (licenseKey) {
  registerLicense(licenseKey)
}

// No StrictMode: Syncfusion's EJ2 React wrappers (PdfViewer, Splitter, ...) do imperative DOM
// setup on mount, and StrictMode's dev-only double-invoke of mount effects breaks that setup on
// the second pass — Syncfusion's own docs call this out explicitly for Next.js (reactStrictMode:
// false) and the same root cause applies here.
// Preload signature typography fonts so typed signatures render in them (canvas needs them loaded).
if ('fonts' in document) {
  ;['Priestacy', 'Runethia', 'Rustic Roadway', 'Symphonie Calligraphy'].forEach((f) => {
    try { (document as any).fonts.load(`32px "${f}"`) } catch { /* ignore */ }
  })
}

createRoot(document.getElementById('root')!).render(<App />)
