import type { Recipient } from './recipients'

export interface PreparedField {
  base: string
  semantic?: string
  name: string
  isRequired: boolean
  recipientId?: string
  bounds: { X: number; Y: number; Width: number; Height: number }
  pageIndex: number
  value?: string       // default text/date the drafter set
  imageData?: string   // data URL for image fields
  isReadOnly?: boolean // e.g. Image/Label/Hyperlink — drafter-set content, not signer-editable
}

// In-memory session store handing a prepared document from Prepare & Design to Sign.
// Mirrored to sessionStorage so it survives a same-tab refresh. No DB (per project decision).
export interface PreparedDoc {
  documentId: string
  fields: PreparedField[]
  recipients: Recipient[]
  preparedAt: string
}

const mem: Record<string, PreparedDoc> = {}
const key = (id: string) => `signflow.prepared.${id}`

export function savePreparedDoc(doc: PreparedDoc) {
  mem[doc.documentId] = doc
  try { sessionStorage.setItem(key(doc.documentId), JSON.stringify(doc)) } catch { /* ignore */ }
}

export function getPreparedDoc(id: string): PreparedDoc | null {
  if (mem[id]) return mem[id]
  try {
    const raw = sessionStorage.getItem(key(id))
    if (raw) { const doc = JSON.parse(raw) as PreparedDoc; mem[id] = doc; return doc }
  } catch { /* ignore */ }
  return null
}

// ---- Session documents (uploaded from device or created this session) ----
// In-memory, mirrored to sessionStorage so created documents/templates survive a same-tab
// refresh. Note: uploaded PDFs use blob: URLs that the browser invalidates on reload, so an
// uploaded file's blob won't reopen after a hard refresh — starter-based ones (bundled asset
// path) do. This is the "session memory only, no DB" persistence the project settled on.
export interface SessionDocument {
  id: string
  name: string
  path: string
  pages: number
  sizeLabel: string
  kind?: 'document' | 'template'
  createdAt?: string
}
const docsMem: Record<string, SessionDocument> = {}
const DOCS_KEY = 'signflow.sessionDocs'
let docsHydrated = false

function persistDocs() {
  try { sessionStorage.setItem(DOCS_KEY, JSON.stringify(Object.values(docsMem))) } catch { /* ignore */ }
}
function hydrateDocs() {
  if (docsHydrated) return
  docsHydrated = true
  try {
    const raw = sessionStorage.getItem(DOCS_KEY)
    if (raw) for (const d of JSON.parse(raw) as SessionDocument[]) { if (!docsMem[d.id]) docsMem[d.id] = d }
  } catch { /* ignore */ }
}

export function addSessionDocument(doc: SessionDocument) {
  hydrateDocs()
  docsMem[doc.id] = doc
  persistDocs()
}
export function getSessionDocument(id: string | undefined): SessionDocument | null {
  hydrateDocs()
  return (id && docsMem[id]) || null
}
export function listSessionDocuments(kind?: 'document' | 'template'): SessionDocument[] {
  hydrateDocs()
  return Object.values(docsMem).filter((d) => !kind || d.kind === kind)
}

// ---- Draft setup (recipients chosen in the Create flow, read by Prepare) ----
export interface DraftSetup { documentId: string; recipients: Recipient[] }
const draftMem: Record<string, DraftSetup> = {}
export function saveDraftSetup(d: DraftSetup) { draftMem[d.documentId] = d }
export function getDraftSetup(id: string | undefined): DraftSetup | null {
  return (id && draftMem[id]) || null
}
