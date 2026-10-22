import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The port shares the reference's data and assets byte for byte (port data-contract.md).
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const same = (angular: string, react: string) => expect(readFileSync(here(angular)).equals(readFileSync(here(react)))).toBe(true);

describe('shared with the React reference', () => {
  it('uses the same catalogue', () => same('./data/catalog.json', '../../../../react/src/data/catalog.json'));
  it('ships the same signed sample', () => {
    same('../../../public/documents/signed/offer-letter-signed.pdf', '../../../../react/public/documents/signed/offer-letter-signed.pdf');
    same('../../../public/documents/signed/offer-letter-signed.audit.json', '../../../../react/public/documents/signed/offer-letter-signed.audit.json');
  });
  it('ships the same watermark and demo signer certificate', () => {
    same('../../../public/branding/watermark.jpg', '../../../../react/public/branding/watermark.jpg');
    same('../../../public/certs/signflow-demo-signer.pfx', '../../../../react/public/certs/signflow-demo-signer.pfx');
  });
});
