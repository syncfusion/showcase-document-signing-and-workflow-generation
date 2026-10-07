import { DOCUMENTS, getDocument, type DocumentMeta } from './documents'
import { RECIPIENTS, type Recipient } from './recipients'
import { getSessionDocument, type PreparedDoc, type PreparedField } from './sessionStore'
import type { DocumentStatus } from './activity'

// Pre-seeded sample documents shown under "Sample activity" (Dashboard) and on the Documents grid.
// Each sample opens under its own id (`sample-<documentId>`), separate from the plain document id
// that Create New Document / Template uses, so the seeded progress (and any edits the user makes
// to it) never leaks into a fresh document started from the same PDF.
//   Draft         -> Prepare & Design with part of the work done (recipients + signature fields).
//   Ready to sign -> Sign screen directly, every field placed and assigned to the one pending signer.
// Field bounds are Syncfusion form-field units: CSS px at 100% zoom (= PDF point x 96/72), measured
// from the signature lines in public/documents/*.pdf (each has ~52pt of clear space above the
// line for the field); each field sits just above its line.

export interface SampleDoc {
  id: string
  documentId: string
  status: Exclude<DocumentStatus, 'Completed'>
  recipients: Recipient[]
  fields: PreparedField[]
}

const [ALEX, MAYA] = RECIPIENTS
const PREPARED_AT = '2026-10-06T09:30:00.000Z'

const sig = (name: string, X: number, Y: number, recipientId?: string, pageIndex = 0): PreparedField => ({
  base: 'SignatureField', semantic: 'signature', name, isRequired: true, recipientId, pageIndex,
  bounds: { X, Y, Width: 200, Height: 40 },
})
const date = (name: string, X: number, Y: number, recipientId?: string, pageIndex = 0): PreparedField => ({
  base: 'Textbox', semantic: 'date', name, isRequired: true, recipientId, pageIndex,
  bounds: { X, Y, Width: 100, Height: 24 },
})

export const SAMPLES: SampleDoc[] = [
  // ---- Drafts: recipients added, signature fields placed; one still unassigned, no dates yet ----
  {
    id: 'sample-vendor-services-agreement',
    documentId: 'vendor-services-agreement',
    status: 'Draft',
    recipients: [ALEX, MAYA],
    // Signature lines are on page 2 at y = 178pt (left block x 54pt, right block x 306pt).
    fields: [sig('Signature 1', 72, 191, ALEX.id, 1), sig('Signature 2', 408, 191, undefined, 1)],
  },
  {
    id: 'sample-rental-agreement',
    documentId: 'rental-agreement',
    status: 'Draft',
    recipients: [ALEX, MAYA],
    // Signature lines at y = 692pt: landlord's agent (left), tenant (right).
    fields: [sig('Signature 1', 72, 877, ALEX.id), sig('Signature 2', 408, 877)],
  },
  {
    id: 'sample-consent-form',
    documentId: 'consent-form',
    status: 'Draft',
    recipients: [MAYA, ALEX],
    // Signature lines at y = 555pt: participant (left), witness (right).
    fields: [sig('Signature 1', 72, 694, MAYA.id), sig('Signature 2', 408, 694)],
  },
  // ---- Ready to sign: only Alex Norman (you) is still pending ----
  {
    id: 'sample-mutual-nda',
    documentId: 'mutual-nda',
    status: 'Ready to sign',
    recipients: [ALEX, MAYA],
    // Party A block (left), signature line at y = 700pt.
    fields: [sig('Signature 1', 72, 888, ALEX.id), date('Editable date 1', 282, 904, ALEX.id)],
  },
  {
    id: 'sample-sales-quote',
    documentId: 'sales-quote',
    status: 'Ready to sign',
    recipients: [ALEX, MAYA],
    // Vendor block (right), signature line at y = 519pt.
    fields: [sig('Signature 1', 408, 646, ALEX.id), date('Editable date 1', 614, 662, ALEX.id)],
  },
]

export function getSample(id: string | undefined): SampleDoc | null {
  return (id && SAMPLES.find((s) => s.id === id)) || null
}
export function getSampleFor(documentId: string): SampleDoc | null {
  return SAMPLES.find((s) => s.documentId === documentId) ?? null
}

// Where a sample row opens: Draft -> Prepare, Ready to sign -> Sign, Completed -> signed copy.
export function sampleHref(documentId: string, status: DocumentStatus): string {
  if (status === 'Completed') return `/completed/${documentId}`
  const sample = getSampleFor(documentId)
  if (!sample) return `/prepare/${documentId}`
  return status === 'Ready to sign' ? `/sign/${sample.id}` : `/prepare/${sample.id}`
}

// Resolve any route id to the document to show: a session upload/template, a sample (the bundled
// PDF under the sample's id), or a bundled document.
export function resolveDocument(id: string | undefined): DocumentMeta {
  const session = getSessionDocument(id)
  if (session) return session
  const sample = getSample(id)
  if (sample) return { ...getDocument(sample.documentId), id: sample.id }
  return DOCUMENTS.find((d) => d.id === id) ?? getDocument(id)
}

// ---- Draft progress for a sample: the seed until the user edits it, then their edits (session) ----
export interface SampleDraft { fields: PreparedField[]; recipients: Recipient[] }
const draftKey = (id: string) => `signflow.sampleDraft.v2.${id}`

export function getSampleDraft(id: string | undefined): SampleDraft | null {
  const sample = getSample(id)
  if (!sample || sample.status !== 'Draft') return null
  try {
    const raw = sessionStorage.getItem(draftKey(sample.id))
    if (raw) return JSON.parse(raw) as SampleDraft
  } catch { /* ignore */ }
  return { fields: sample.fields, recipients: sample.recipients }
}
export function saveSampleDraft(id: string, draft: SampleDraft) {
  try { sessionStorage.setItem(draftKey(id), JSON.stringify(draft)) } catch { /* ignore */ }
}

// The hand-off a "Ready to sign" sample opens with on the Sign screen.
export function getSamplePrepared(id: string | undefined): PreparedDoc | null {
  const sample = getSample(id)
  if (!sample || sample.status !== 'Ready to sign') return null
  return { documentId: sample.id, fields: sample.fields, recipients: sample.recipients, preparedAt: PREPARED_AT }
}
