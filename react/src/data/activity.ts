export type DocumentStatus = 'Draft' | 'Ready to send' | 'Completed'

export interface ActivityRow {
  documentId: string
  status: DocumentStatus
}

export const ACTIVITY: ActivityRow[] = [
  { documentId: 'vendor-services-agreement', status: 'Draft' },
  { documentId: 'mutual-nda', status: 'Ready to send' },
  { documentId: 'offer-letter', status: 'Completed' },
  { documentId: 'rental-agreement', status: 'Draft' },
]
