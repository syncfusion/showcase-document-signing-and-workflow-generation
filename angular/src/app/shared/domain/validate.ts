// Catalogue validation at load (contracts/data-contract.md, "Invalid examples the validator rejects").
import { DOCUMENT_STATUSES, FIELD_BASES, type Catalog } from './types';

export type CatalogResult = { ok: true; catalog: Catalog } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isInt = (v: unknown, min: number) => Number.isInteger(v) && (v as number) >= min;
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

export function validateCatalog(raw: unknown): CatalogResult {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  if (!isObj(raw)) return { ok: false, errors: ['The catalogue is not an object.'] };
  if (raw.schemaVersion !== 1) err(`Unsupported schemaVersion ${String(raw.schemaVersion)} (expected 1).`);
  const arr = (key: string): Record<string, unknown>[] => {
    const v = raw[key];
    if (!Array.isArray(v)) { err(`"${key}" must be an array.`); return []; }
    return v.filter((item, i) => (isObj(item) ? true : (err(`${key}[${i}] is not an object.`), false))) as Record<string, unknown>[];
  };
  const unique = (list: Record<string, unknown>[], key: string) => {
    const seen = new Set<string>();
    list.forEach((item, i) => {
      if (!isStr(item.id)) err(`${key}[${i}] has no id.`);
      else if (seen.has(item.id)) err(`Duplicate ${key} id "${item.id}".`);
      else seen.add(item.id);
    });
    return seen;
  };

  const documents = arr('documents');
  const templates = arr('templates');
  const recipients = arr('recipients');
  const samples = arr('samples');
  const completed = arr('completedSamples');

  const docIds = unique(documents, 'documents');
  const pagesById = new Map<string, number>();
  documents.forEach((d) => {
    const at = `Document "${String(d.id)}"`;
    if (!isStr(d.name)) err(`${at} has no name.`);
    if (!isStr(d.path) || !String(d.path).startsWith('/documents/')) err(`${at} has an invalid path.`);
    if (!isInt(d.pages, 1)) err(`${at} has an invalid page count.`);
    if (!isInt(d.sizeBytes, 1)) err(`${at} has an invalid size.`);
    if (!DOCUMENT_STATUSES.includes(d.status as never)) err(`${at} has an unknown status "${String(d.status)}".`);
    if (isStr(d.id) && isInt(d.pages, 1)) pagesById.set(d.id, d.pages as number);
  });

  unique(templates, 'templates');
  templates.forEach((t) => {
    if (!docIds.has(String(t.documentId))) err(`Template "${String(t.id)}" references unknown document "${String(t.documentId)}".`);
    for (const key of ['name', 'category', 'description', 'suggestedFields']) if (!isStr(t[key])) err(`Template "${String(t.id)}" has no ${key}.`);
  });

  const recipientIds = unique(recipients, 'recipients');
  recipients.forEach((r) => {
    for (const key of ['name', 'role', 'initials', 'email']) if (!isStr(r[key])) err(`Recipient "${String(r.id)}" has no ${key}.`);
    if (!isInt(r.colorSlot, 1) || (r.colorSlot as number) > 8) err(`Recipient "${String(r.id)}" has colorSlot ${String(r.colorSlot)} (expected 1-8).`);
  });

  unique(samples, 'samples');
  samples.forEach((s) => {
    const at = `Sample "${String(s.id)}"`;
    const pages = pagesById.get(String(s.documentId));
    if (pages === undefined) err(`${at} references unknown document "${String(s.documentId)}".`);
    if (s.status !== 'Draft' && s.status !== 'Ready to sign') err(`${at} has status "${String(s.status)}" (Draft or Ready to sign).`);
    if (!Array.isArray(s.recipientIds) || s.recipientIds.some((id) => !recipientIds.has(String(id)))) err(`${at} lists an unknown recipient.`);
    if (!isStr(s.preparedAt) || Number.isNaN(Date.parse(String(s.preparedAt)))) err(`${at} has an invalid preparedAt.`);
    if (!Array.isArray(s.fields)) { err(`${at} has no fields.`); return; }
    const names = new Set<string>();
    (s.fields as unknown[]).forEach((f, i) => {
      if (!isObj(f)) { err(`${at} field ${i} is not an object.`); return; }
      const fat = `${at} field "${String(f.name)}"`;
      if (!FIELD_BASES.includes(f.base as never)) err(`${fat} has unknown type "${String(f.base)}".`);
      if (!isStr(f.semantic)) err(`${fat} has no semantic.`);
      if (!isStr(f.name) || names.has(String(f.name))) err(`${fat} has a missing or duplicate name.`);
      names.add(String(f.name));
      if (typeof f.isRequired !== 'boolean') err(`${fat} has no isRequired.`);
      if (f.recipientId !== undefined && !recipientIds.has(String(f.recipientId))) err(`${fat} references unknown recipient "${String(f.recipientId)}".`);
      if (!isInt(f.pageIndex, 0) || (pages !== undefined && (f.pageIndex as number) >= pages)) err(`${fat} has pageIndex ${String(f.pageIndex)} outside the document.`);
      const b = f.bounds;
      if (!isObj(b) || !['X', 'Y', 'Width', 'Height'].every((k) => isNum(b[k]))) err(`${fat} has invalid bounds.`);
    });
  });

  completed.forEach((c, i) => {
    if (!docIds.has(String(c.documentId))) err(`completedSamples[${i}] references unknown document "${String(c.documentId)}".`);
    if (!isStr(c.pdfPath) || !isStr(c.auditPath)) err(`completedSamples[${i}] needs pdfPath and auditPath.`);
  });

  return errors.length ? { ok: false, errors } : { ok: true, catalog: raw as unknown as Catalog };
}
