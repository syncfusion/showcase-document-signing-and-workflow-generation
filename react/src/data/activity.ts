export type DocumentStatus = 'Draft' | 'Ready to sign' | 'Completed'

export interface ActivityRow {
  documentId: string
  status: DocumentStatus
}

// Draft and Ready-to-sign rows open pre-seeded samples (see samples.ts).
export const ACTIVITY: ActivityRow[] = [
  { documentId: 'vendor-services-agreement', status: 'Draft' },
  { documentId: 'mutual-nda', status: 'Ready to sign' },
  { documentId: 'offer-letter', status: 'Completed' },
  { documentId: 'rental-agreement', status: 'Draft' },
  { documentId: 'sales-quote', status: 'Ready to sign' },
  { documentId: 'consent-form', status: 'Draft' },
]
