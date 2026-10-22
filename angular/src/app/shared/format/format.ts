// One formatting module for every number and date a showcase shows (design-system.md, "Number
// formatting", workflow 2.18.0). Copy to src/domain/format.ts. Each place has its form:
//   KPI card value, chart axis  -> compactMoney: $6.89M, $12.4M, $1.2B (full value below a million)
//   tooltip, Grid cell, Pivot   -> money: $1,691,064     counts -> count: 12,500
//   ratio                       -> percent: 39.8%        months -> monthLabel: Sep 2026
// From executive-kpi-analytics (2026-10-10): KPI cards and axes were compact, but tooltips, Grid cells
// and Pivot totals showed raw digits ("1691064") until each was fixed by hand.
// Erasable TypeScript only (no enums), so Node's type stripping can run the tests directly.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fixed = (digits: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Full money with separators: tooltips, Grid and Pivot cells, sentences. $1,691,064 */
export const money = (value: number): string => usd.format(value);

/** Counts with separators. 12,500 */
export const count = (value: number): string => whole.format(value);

/** A ratio (0.398) as a percentage. 39.8% */
export const percent = (ratio: number, digits = 1): string =>
  new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: digits }).format(ratio);

/**
 * Money in millions or billions with three significant figures: KPI cards and chart axes. $6.89M,
 * $12.4M, $125M, $1.2B. Values under a million stay full ($845,200). Intl rounds the decimal value, so
 * 2,295,000 reads $2.30M (toFixed(2) gives 2.29).
 */
export function compactMoney(value: number): string {
  const sign = value < 0 ? '-' : '', absolute = Math.abs(value);
  if (absolute >= 1e9) return `${sign}$${fixed(absolute >= 1e10 ? 0 : 1).format(absolute / 1e9)}B`;
  if (absolute >= 1e6) return `${sign}$${fixed(absolute < 1e7 ? 2 : absolute < 1e8 ? 1 : 0).format(absolute / 1e6)}M`;
  return money(value);
}

const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** 'YYYY-MM' as a chart or preset label. Sep 2026 */
export const monthLabel = (month: string): string => monthFormat.format(new Date(`${month}-01T00:00:00Z`));

/** A date in prose and tooltips. Sep 15, 2026 */
export const dateLabel = (date: Date): string => dayFormat.format(date);

/** Display format for Syncfusion date pickers (format="..."): en-US. */
export const DATE_FORMAT = 'MM/dd/yyyy';

/** Syncfusion format strings for Grid columns (format=) and Pivot formatSettings. */
export const SYNCFUSION_FORMATS = { money: 'C0', count: 'N0', percent: 'P1' } as const;

// ---- App additions (app-plan.md, "Number formats") ----

/** File size from bytes: whole KB below 1 MB, one-decimal MB above. 4 KB, 1.2 MB */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${fixed(1).format(bytes / (1024 * 1024))} MB`;
  return `${whole.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

const timeFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long' });

/** An audit timestamp in the visitor's local time zone, zone named. Oct 7, 2026, 6:46:54 AM GMT+5:30 */
export const auditTime = (iso: string): string => timeFormat.format(new Date(iso));
