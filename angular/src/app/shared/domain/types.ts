// Catalogue and session models (contracts/data-contract.md). Framework-free: the Angular port reuses them.

export type DocumentStatus = 'Draft' | 'Ready to sign' | 'Completed';
export const DOCUMENT_STATUSES: readonly DocumentStatus[] = ['Draft', 'Ready to sign', 'Completed'];

export type FieldBase = 'SignatureField' | 'InitialField' | 'Textbox' | 'CheckBox' | 'RadioButton' | 'DropDown';
export const FIELD_BASES: readonly FieldBase[] = ['SignatureField', 'InitialField', 'Textbox', 'CheckBox', 'RadioButton', 'DropDown'];

export interface DocumentMeta {
  id: string;
  name: string;
  /** App-relative path under public/, or a blob: URL for a session upload. */
  path: string;
  pages: number;
  sizeBytes: number;
}

export interface CatalogDocument extends DocumentMeta {
  status: DocumentStatus;
}

export interface Template {
  id: string;
  documentId: string;
  name: string;
  category: string;
  description: string;
  suggestedFields: string;
}

export interface Recipient {
  id: string;
  name: string;
  role: string;
  initials: string;
  email: string;
  /** Chart-series slot 1-8 (categorical colour). */
  colorSlot: number;
}

export interface FieldBounds { X: number; Y: number; Width: number; Height: number }

/** Text-field typography. fontStyle is the viewer's bit flags: Bold=1, Italic=2, Underline=4. */
export interface TextFormat {
  fontFamily?: string;
  fontSize?: number;
  fontStyle?: number;
  alignment?: 'Left' | 'Center' | 'Right' | 'Justify';
  color?: string;
}

export interface PreparedField {
  base: FieldBase;
  semantic: string;
  name: string;
  isRequired: boolean;
  recipientId?: string;
  pageIndex: number;
  bounds: FieldBounds;
  value?: string;
  dateFormat?: string;
  dateISO?: string;
  imageData?: string;
  isReadOnly?: boolean;
  format?: TextFormat;
}

export interface Sample {
  id: string;
  documentId: string;
  status: Exclude<DocumentStatus, 'Completed'>;
  recipientIds: string[];
  preparedAt: string;
  fields: PreparedField[];
}

export interface CompletedSample {
  documentId: string;
  pdfPath: string;
  auditPath: string;
}

export interface Catalog {
  schemaVersion: 1;
  documents: CatalogDocument[];
  templates: Template[];
  recipients: Recipient[];
  samples: Sample[];
  completedSamples: CompletedSample[];
}

export interface AuditEntry {
  at: string;
  actor: string;
  email?: string;
  action: string;
  detail?: string;
}

export interface CompletedSampleAudit {
  documentName: string;
  signerName: string;
  signedAt: string;
  sha256: string;
  entries: AuditEntry[];
}

/** A document created in this tab: an upload, or a starter registered as a template. */
export interface SessionDocument extends DocumentMeta {
  kind: 'document' | 'template';
  createdAt: string;
}

/** The hand-off from Prepare to Sign. */
export interface PreparedDoc {
  documentId: string;
  fields: PreparedField[];
  recipients: Recipient[];
  preparedAt: string;
}

export interface SampleDraft { fields: PreparedField[]; recipients: Recipient[] }
export interface DraftSetup { documentId: string; recipients: Recipient[] }
