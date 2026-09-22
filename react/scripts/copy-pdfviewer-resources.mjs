// Copies the PDF Viewer's WASM resources (pdfium.js/pdfium.wasm) from the installed package
// into public/, where the standalone client-side viewer loads them from at runtime.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(root, 'node_modules', '@syncfusion', 'ej2-pdfviewer', 'dist', 'ej2-pdfviewer-lib')
const dest = join(root, 'public', 'ej2-pdfviewer-lib')

if (!existsSync(src)) {
  console.warn('[copy-pdfviewer-resources] Source not found, skipping:', src)
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('[copy-pdfviewer-resources] Copied PDF Viewer WASM resources to public/ej2-pdfviewer-lib')
