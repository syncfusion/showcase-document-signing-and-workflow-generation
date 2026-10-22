// The sample catalogue, validated once at load (contracts/data-contract.md). An invalid catalogue is
// reported by the shell's error state, never a blank page.
import raw from './catalog.json';
import { validateCatalog, type CatalogResult } from '../domain/validate';

export const catalogResult: CatalogResult = validateCatalog(raw);

import type { Catalog } from '../domain/types';
const EMPTY: Catalog = { schemaVersion: 1, documents: [], templates: [], recipients: [], samples: [], completedSamples: [] };
/** The validated catalogue (App shows the error state instead of any page when it is invalid). */
export const catalog: Catalog = catalogResult.ok ? catalogResult.catalog : EMPTY;
