// Pre-signed sample documents shown as "Completed" in the gallery. Each was produced by running
// SignFlow's own flow (Prepare → Sign → PKI seal with the SignFlow demo CA), signer persona
// Alex Norman — fictional. The sidecar JSON is the audit log recorded at signing time plus the
// document fingerprint, which the Completed view re-checks against the bytes it loads.
import type { AuditEntry } from '../features/sign/SignatureReport'

export interface CompletedSample {
  documentId: string
  pdfPath: string
  auditPath: string
}

export interface CompletedSampleAudit {
  documentName: string
  signerName: string
  signedAt: string
  sha256: string
  entries: AuditEntry[]
}

export const COMPLETED_SAMPLES: Record<string, CompletedSample> = {
  'offer-letter': {
    documentId: 'offer-letter',
    pdfPath: '/documents/signed/offer-letter-signed.pdf',
    auditPath: '/documents/signed/offer-letter-signed.audit.json',
  },
}

export const getCompletedSample = (documentId?: string) =>
  (documentId && COMPLETED_SAMPLES[documentId]) || null
