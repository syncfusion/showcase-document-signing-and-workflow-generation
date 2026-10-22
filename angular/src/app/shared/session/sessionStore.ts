// Per-tab session state (contracts/data-contract.md, "Public and customer behavior"): memory first,
// mirrored to sessionStorage under versioned keys so a same-tab reload keeps it. A failed write (quota,
// storage blocked) is ignored and the page keeps working from memory.
import type { DraftSetup, PreparedDoc, SampleDraft, SessionDocument } from '../domain/types';

export const KEY_PREFIX = 'signflow.v2.';
export const THEME_KEY = `${KEY_PREFIX}theme`;

/** Keys written by the earlier version of this sample; removed on load so old drafts never resurface. */
const LEGACY = [/^signflow\.prepared\./, /^signflow\.sessionDocs$/, /^signflow\.sampleDraft\.v2\./];
const LEGACY_LOCAL = ['signflow-theme'];

export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; key(i: number): string | null; readonly length: number }

export function removeLegacyKeys(session: KeyValueStore | null, local: KeyValueStore | null): string[] {
  const removed: string[] = [];
  if (session) {
    const keys: string[] = [];
    for (let i = 0; i < session.length; i++) { const k = session.key(i); if (k) keys.push(k); }
    for (const k of keys) if (LEGACY.some((re) => re.test(k))) { session.removeItem(k); removed.push(k); }
  }
  if (local) for (const k of LEGACY_LOCAL) if (local.getItem(k) !== null) { local.removeItem(k); removed.push(k); }
  return removed;
}

const safe = <T>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };
const storage = (): KeyValueStore | null => safe(() => window.sessionStorage, null);

function read<T>(key: string): T | null {
  const raw = safe(() => storage()?.getItem(KEY_PREFIX + key) ?? null, null);
  if (!raw) return null;
  return safe(() => JSON.parse(raw) as T, null);
}
function write(key: string, value: unknown) { safe(() => storage()?.setItem(KEY_PREFIX + key, JSON.stringify(value)), undefined); }

const mem = {
  prepared: new Map<string, PreparedDoc>(),
  drafts: new Map<string, DraftSetup>(),
  docs: null as Map<string, SessionDocument> | null,
};

function docs(): Map<string, SessionDocument> {
  if (!mem.docs) mem.docs = new Map((read<SessionDocument[]>('sessionDocs') ?? []).map((d) => [d.id, d]));
  return mem.docs;
}

export const sessionStore = {
  savePrepared(doc: PreparedDoc) { mem.prepared.set(doc.documentId, doc); write(`prepared.${doc.documentId}`, doc); },
  getPrepared(id: string): PreparedDoc | null {
    const hit = mem.prepared.get(id) ?? read<PreparedDoc>(`prepared.${id}`);
    if (hit) mem.prepared.set(id, hit);
    return hit;
  },
  addDocument(doc: SessionDocument) { docs().set(doc.id, doc); write('sessionDocs', [...docs().values()]); },
  getDocument(id: string): SessionDocument | null { return docs().get(id) ?? null; },
  listDocuments(kind?: SessionDocument['kind']): SessionDocument[] { return [...docs().values()].filter((d) => !kind || d.kind === kind); },
  saveDraftSetup(d: DraftSetup) { mem.drafts.set(d.documentId, d); write(`draftSetup.${d.documentId}`, d); },
  getDraftSetup(id: string): DraftSetup | null { return mem.drafts.get(id) ?? read<DraftSetup>(`draftSetup.${id}`); },
  saveSampleDraft(id: string, d: SampleDraft) { write(`sampleDraft.${id}`, d); },
  getSampleDraft(id: string): SampleDraft | null { return read<SampleDraft>(`sampleDraft.${id}`); },
};
