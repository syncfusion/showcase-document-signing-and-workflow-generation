export interface DocumentMeta {
  id: string
  name: string
  path: string
  pages: number
  sizeLabel: string
}

export const DOCUMENTS: DocumentMeta[] = [
  { id: 'mutual-nda', name: 'Mutual Non-Disclosure Agreement', path: '/documents/mutual-nda.pdf', pages: 1, sizeLabel: '4 KB' },
  { id: 'offer-letter', name: 'Employment Offer Letter', path: '/documents/offer-letter.pdf', pages: 1, sizeLabel: '4 KB' },
  { id: 'rental-agreement', name: 'Residential Lease Agreement', path: '/documents/rental-agreement.pdf', pages: 1, sizeLabel: '4 KB' },
  { id: 'sales-quote', name: 'Sales Quote', path: '/documents/sales-quote.pdf', pages: 1, sizeLabel: '3 KB' },
  { id: 'consent-form', name: 'Consent & Release Form', path: '/documents/consent-form.pdf', pages: 1, sizeLabel: '3 KB' },
  { id: 'vendor-services-agreement', name: 'Master Services Agreement', path: '/documents/vendor-services-agreement.pdf', pages: 2, sizeLabel: '5 KB' },
]

export function getDocument(id: string | undefined): DocumentMeta {
  return DOCUMENTS.find((d) => d.id === id) ?? DOCUMENTS[0]
}
