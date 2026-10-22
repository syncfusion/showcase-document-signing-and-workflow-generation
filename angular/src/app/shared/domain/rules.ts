// Pure business rules (contracts/data-contract.md, "Queries and commands"). No framework, no storage.
import type { Catalog, CatalogDocument, DocumentMeta, DocumentStatus, PreparedField, Recipient, Sample, SessionDocument } from './types';

export const STATUS_ORDER: Record<DocumentStatus, number> = { Draft: 0, 'Ready to sign': 1, Completed: 2 };

export const sampleById = (c: Catalog, id: string | undefined): Sample | null => (id && c.samples.find((s) => s.id === id)) || null;
export const sampleFor = (c: Catalog, documentId: string): Sample | null => c.samples.find((s) => s.documentId === documentId) ?? null;
export const completedFor = (c: Catalog, documentId: string | undefined) => (documentId && c.completedSamples.find((s) => s.documentId === documentId)) || null;
export const recipientsOf = (c: Catalog, ids: string[]): Recipient[] => ids.map((id) => c.recipients.find((r) => r.id === id)).filter((r): r is Recipient => !!r);

/** Where a document's next step opens: Draft -> Prepare, Ready to sign -> Sign, Completed -> its signed copy. */
export function nextStepHref(c: Catalog, doc: CatalogDocument): string {
  if (doc.status === 'Completed') return `/completed/${doc.id}`;
  const sample = sampleFor(c, doc.id);
  if (!sample) return `/prepare/${doc.id}`;
  return doc.status === 'Ready to sign' ? `/sign/${sample.id}` : `/prepare/${sample.id}`;
}

/** The action label shown beside a document. */
export function nextStepLabel(c: Catalog, doc: CatalogDocument): string | null {
  if (doc.status === 'Completed') return completedFor(c, doc.id) ? 'View signed copy' : null;
  return doc.status === 'Ready to sign' ? 'Sign now' : 'Continue draft';
}

/** Resolves a route id: a session document, else a sample (its document under the sample id), else a catalogue document. */
export function resolveDocument(c: Catalog, id: string | undefined, session: (id: string) => SessionDocument | null): DocumentMeta | null {
  if (!id) return null;
  const own = session(id);
  if (own) return own;
  const sample = sampleById(c, id);
  if (sample) {
    const doc = c.documents.find((d) => d.id === sample.documentId);
    return doc ? { id: sample.id, name: doc.name, path: doc.path, pages: doc.pages, sizeBytes: doc.sizeBytes } : null;
  }
  const doc = c.documents.find((d) => d.id === id);
  return doc ? { id: doc.id, name: doc.name, path: doc.path, pages: doc.pages, sizeBytes: doc.sizeBytes } : null;
}

export interface ChecklistItem { label: string; done: boolean }

/** Prepare's readiness checklist: recipients, fields, a signature field, every field assigned. */
export function readiness(recipientCount: number, fields: Pick<PreparedField, 'semantic' | 'recipientId'>[]): { items: ChecklistItem[]; ready: boolean } {
  const unassigned = fields.filter((f) => !f.recipientId).length;
  const hasSignature = fields.some((f) => f.semantic === 'signature');
  const items: ChecklistItem[] = [
    { label: `${recipientCount} recipient${recipientCount === 1 ? '' : 's'} added`, done: recipientCount > 0 },
    { label: fields.length > 0 ? `${fields.length} field${fields.length === 1 ? '' : 's'} placed` : 'Place fields on the document', done: fields.length > 0 },
    { label: hasSignature ? 'Signature field placed' : 'Add a signature field', done: hasSignature },
    { label: fields.length > 0 && unassigned === 0 ? 'All fields assigned' : 'Assign every field to a recipient', done: fields.length > 0 && unassigned === 0 },
  ];
  return { items, ready: items.every((i) => i.done) };
}

export interface LiveField { name: string; type?: string; value?: unknown; isRequired?: boolean; isReadOnly?: boolean; isChecked?: boolean; isSelected?: boolean }

/** A field counts as filled when checked, selected or holding a non-empty value. */
export const isFieldFilled = (f: LiveField): boolean =>
  Boolean(f.isChecked) || Boolean(f.isSelected) || (typeof f.value === 'string' ? f.value.length > 0 : Boolean(f.value));

/** Sign's completion gate: required fields, or all fields when none is required. */
export function completion(fields: LiveField[]): { done: number; total: number; complete: boolean } {
  const required = fields.filter((f) => f.isRequired);
  const gate = required.length ? required : fields;
  const done = gate.filter(isFieldFilled).length;
  return { done, total: gate.length, complete: gate.length > 0 && done === gate.length };
}

export const initialsOf = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || 'R';

/** Recipient colour slots cycle through the eight chart series. */
export const nextColorSlot = (count: number): number => (count % 8) + 1;

export const safeFileName = (name: string): string => `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'document'}.pdf`;
