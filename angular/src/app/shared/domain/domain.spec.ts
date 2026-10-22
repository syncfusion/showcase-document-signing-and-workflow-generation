import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import raw from '../data/catalog.json';
import { validateCatalog } from './validate';
import { completion, nextStepHref, nextStepLabel, readiness, resolveDocument, safeFileName } from './rules';
import { removeLegacyKeys, type KeyValueStore } from '../session/sessionStore';
import { count, fileSize } from '../format/format';
import type { Catalog } from './types';

const result = validateCatalog(raw);
const catalog = (result.ok ? result.catalog : null) as Catalog;
const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(raw));

describe('catalogue fixture', () => {
  it('validates', () => { expect(result).toMatchObject({ ok: true }); });
  it('has the contracted counts', () => {
    expect(catalog.documents).toHaveLength(6);
    expect(catalog.templates).toHaveLength(6);
    expect(catalog.recipients).toHaveLength(2);
    expect(catalog.samples).toHaveLength(5);
    expect(catalog.completedSamples).toHaveLength(1);
  });
  it('has the contracted status mix and page total', () => {
    const by = (s: string) => catalog.documents.filter((d) => d.status === s).length;
    expect([by('Draft'), by('Ready to sign'), by('Completed')]).toEqual([3, 2, 1]);
    expect(catalog.documents.reduce((n, d) => n + d.pages, 0)).toBe(7);
  });
  it('points at files that exist', () => {
    const pub = (p: string) => fileURLToPath(new URL(`../../../../public${p}`, import.meta.url));
    for (const d of catalog.documents) expect(existsSync(pub(d.path)), d.path).toBe(true);
    for (const c of catalog.completedSamples) { expect(existsSync(pub(c.pdfPath))).toBe(true); expect(existsSync(pub(c.auditPath))).toBe(true); }
  });
  it('dates the samples around demo-today (2026-10-22)', () => {
    for (const s of catalog.samples) expect(s.preparedAt.slice(0, 7)).toBe('2026-10');
  });
});

describe('catalogue validator rejects', () => {
  const failsWith = (mutate: (c: any) => void, text: RegExp) => {
    const c = clone(); mutate(c);
    const r = validateCatalog(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(text);
  };
  it('a duplicate document id', () => failsWith((c) => { c.documents[1].id = c.documents[0].id; }, /Duplicate documents id/));
  it('an unknown recipient on a field', () => failsWith((c) => { c.samples[0].fields[0].recipientId = 'nobody'; }, /unknown recipient/));
  it('a pageIndex outside the document', () => failsWith((c) => { c.samples[3].fields[0].pageIndex = 1; }, /outside the document/));
  it('a colour slot of 9', () => failsWith((c) => { c.recipients[0].colorSlot = 9; }, /colorSlot 9/));
  it('a missing schemaVersion', () => failsWith((c) => { delete c.schemaVersion; }, /schemaVersion/));
});

describe('rules', () => {
  const doc = (id: string) => catalog.documents.find((d) => d.id === id)!;
  it('routes each status to its next step', () => {
    expect(nextStepHref(catalog, doc('vendor-services-agreement'))).toBe('/prepare/sample-vendor-services-agreement');
    expect(nextStepHref(catalog, doc('mutual-nda'))).toBe('/sign/sample-mutual-nda');
    expect(nextStepHref(catalog, doc('offer-letter'))).toBe('/completed/offer-letter');
    expect(nextStepLabel(catalog, doc('mutual-nda'))).toBe('Sign now');
    expect(nextStepLabel(catalog, doc('rental-agreement'))).toBe('Continue draft');
    expect(nextStepLabel(catalog, doc('offer-letter'))).toBe('View signed copy');
  });
  it('resolves route ids', () => {
    const none = () => null;
    expect(resolveDocument(catalog, 'sample-mutual-nda', none)).toMatchObject({ id: 'sample-mutual-nda', name: 'Mutual Non-Disclosure Agreement' });
    expect(resolveDocument(catalog, 'sales-quote', none)).toMatchObject({ id: 'sales-quote' });
    expect(resolveDocument(catalog, 'missing', none)).toBeNull();
  });
  it('reports the services-agreement draft as not ready', () => {
    const s = catalog.samples.find((x) => x.id === 'sample-vendor-services-agreement')!;
    const r = readiness(s.recipientIds.length, s.fields);
    expect(r.ready).toBe(false);
    expect(r.items[3]).toEqual({ label: 'Assign every field to a recipient', done: false });
  });
  it('counts NDA completion: date pre-filled, then signed', () => {
    const fields = [{ name: 'Signature 1', isRequired: true, value: '' }, { name: 'Editable date 1', isRequired: true, value: 'Oct 22, 2026' }];
    expect(completion(fields)).toEqual({ done: 1, total: 2, complete: false });
    fields[0].value = 'data:image/png;base64,AAA';
    expect(completion(fields)).toEqual({ done: 2, total: 2, complete: true });
  });
  it('counts all fields when none is required', () => {
    expect(completion([{ name: 'a', isChecked: true }, { name: 'b' }])).toEqual({ done: 1, total: 2, complete: false });
  });
  it('makes safe download names', () => { expect(safeFileName('Consent & Release: Form')).toBe('Consent & Release  Form.pdf'); });
});

describe('session keys', () => {
  it('removes keys from the earlier version only', () => {
    const make = (init: Record<string, string>): KeyValueStore & { data: Record<string, string> } => {
      const data = { ...init };
      return { data, get length() { return Object.keys(data).length; }, key: (i) => Object.keys(data)[i] ?? null,
        getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
    };
    const session = make({ 'signflow.prepared.x': '1', 'signflow.sessionDocs': '[]', 'signflow.sampleDraft.v2.y': '{}', 'signflow.v2.prepared.x': '1' });
    const local = make({ 'signflow-theme': 'dark', 'signflow.v2.theme': 'dark' });
    removeLegacyKeys(session, local);
    expect(Object.keys(session.data)).toEqual(['signflow.v2.prepared.x']);
    expect(Object.keys(local.data)).toEqual(['signflow.v2.theme']);
  });
});

describe('format', () => {
  it('formats counts and file sizes', () => {
    expect(count(12500)).toBe('12,500');
    expect(fileSize(3520)).toBe('3 KB');
    expect(fileSize(110134)).toBe('108 KB');
    expect(fileSize(1572864)).toBe('1.5 MB');
  });
});
