export interface TemplateMeta {
  id: string
  documentId: string
  name: string
  category: string
  description: string
  suggestedFields: string
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'mutual-nda',
    documentId: 'mutual-nda',
    name: 'Mutual Non-Disclosure Agreement',
    category: 'NDA',
    description: 'Two-way confidentiality agreement for early-stage business discussions.',
    suggestedFields: 'Two-party signatures',
  },
  {
    id: 'offer-letter',
    documentId: 'offer-letter',
    name: 'Employment Offer Letter',
    category: 'Offer letter',
    description: 'Role, compensation, and equity offer with acceptance signature block.',
    suggestedFields: 'Signature + printed name',
  },
  {
    id: 'rental-agreement',
    documentId: 'rental-agreement',
    name: 'Residential Lease Agreement',
    category: 'Rental agreement',
    description: 'Landlord and tenant lease with a rent schedule and dual signature blocks.',
    suggestedFields: 'Landlord + tenant signatures',
  },
  {
    id: 'sales-quote',
    documentId: 'sales-quote',
    name: 'Sales Quote',
    category: 'Sales contract',
    description: 'Itemized quote with pricing summary and customer acceptance signature.',
    suggestedFields: 'Customer + vendor signatures',
  },
  {
    id: 'consent-form',
    documentId: 'consent-form',
    name: 'Consent & Release Form',
    category: 'Consent form',
    description: 'Participation and media release consent with checkbox acknowledgements.',
    suggestedFields: 'Checkboxes + participant signature',
  },
  {
    id: 'vendor-services-agreement',
    documentId: 'vendor-services-agreement',
    name: 'Master Services Agreement',
    category: 'Sales contract',
    description: 'Vendor MSA with statement of work, fees, and company + vendor signature blocks.',
    suggestedFields: 'Company + vendor signatures',
  },
]
