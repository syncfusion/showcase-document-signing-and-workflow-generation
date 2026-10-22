// Colour values for what Syncfusion Charts and Maps draw in SVG, which takes values, not CSS variables.
// Mirrors factory/standards/bds-sales-crm.tokens.css 1.3.0 (tests keep them in step); HTML elements use
// the CSS tokens directly. Copy into the app (for example src/styles/palette.ts); if the app's tokens.css
// differs from the factory baseline, change both together.
//
// The rule (factory/standards/design-system.md, "Colour semantics"): colour that judges uses the status
// tones; colour that only tells categories apart uses `series`, never green, amber or red. Charts take
// `theme={chartTheme(theme)}` for the frame and their data colours from here.

export type AppTheme = 'light' | 'dark';
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface Palette {
  success: string;
  warning: string;
  danger: string;
  info: string;
  neutral: string;
  /** A budget, target or last-year line: judges nothing; draw it dashed. */
  reference: string;
  /** Eight vivid category colours: blue, teal, fuchsia, slate, sky, cyan, purple, indigo (the same family per slot in both themes). */
  series: [string, string, string, string, string, string, string, string];
}

const PALETTES: Record<AppTheme, Palette> = {
  light: {
    success: '#027a48', warning: '#b54708', danger: '#b42318', info: '#175cd3', neutral: '#667085', reference: '#667085',
    series: ['#3b82f6', '#0d9488', '#a21caf', '#334155', '#0369a1', '#0891b2', '#a855f7', '#4f46e5']
  },
  dark: {
    success: '#86efac', warning: '#fbbf24', danger: '#fca5a5', info: '#93c5fd', neutral: '#94a3b8', reference: '#94a3b8',
    series: ['#3b82f6', '#2dd4bf', '#e879f9', '#64748b', '#0ea5e9', '#22d3ee', '#a855f7', '#6366f1']
  }
};

export const palette = (theme: AppTheme): Palette => PALETTES[theme];

/** Map tiles stay light in dark mode, so markers drawn on them keep the light-theme tones. */
export const markerTones: Palette = PALETTES.light;

/** The Syncfusion chart theme for the frame (axis labels, gridlines, tooltip, legend text). */
export const chartTheme = (theme: AppTheme): 'Tailwind3' | 'Tailwind3Dark' => (theme === 'dark' ? 'Tailwind3Dark' : 'Tailwind3');

/**
 * The band a value falls in, from the plan's "Colour semantics" (for example occupancy:
 * [{ min: 95, tone: 'success' }, { min: 90, tone: 'warning' }, { tone: 'danger' }]). Bands are checked in
 * order; the last has no `min`.
 */
export interface Band { min?: number; tone: Tone; label?: string }
export function bandFor(value: number, bands: Band[]): Band {
  return bands.find((band) => band.min === undefined || value >= band.min) ?? bands[bands.length - 1];
}

/** Tone classes as whole literals, so Tailwind sees them. */
export const TONE_TEXT: Record<Tone, string> = {
  success: 'text-[var(--color-sf-fg-success-primary)]',
  warning: 'text-[var(--color-sf-fg-warning-primary)]',
  danger: 'text-[var(--color-sf-fg-danger-primary)]',
  info: 'text-[var(--color-sf-fg-info-primary)]',
  neutral: 'text-[var(--color-sf-fg-neutral-primary)]'
};

export const TONE_BADGE: Record<Tone, string> = {
  success: 'bg-[var(--color-sf-bg-success-primary)] text-[var(--color-sf-fg-success-primary)]',
  warning: 'bg-[var(--color-sf-bg-warning-primary)] text-[var(--color-sf-fg-warning-primary)]',
  danger: 'bg-[var(--color-sf-bg-danger-primary)] text-[var(--color-sf-fg-danger-primary)]',
  info: 'bg-[var(--color-sf-bg-info-primary)] text-[var(--color-sf-fg-info-primary)]',
  neutral: 'bg-[var(--color-sf-bg-neutral-primary)] text-[var(--color-sf-fg-neutral-primary)]'
};

// ---- App additions (app-plan.md, "Colour semantics") ----
// Recipient colours are categories: chart series 1-8. They tint PDF form fields, which sit on the white
// PDF page in both themes, so the light-theme tones are used (cleared before export).
export const recipientColor = (slot: number): string => PALETTES.light.series[(Math.max(1, slot) - 1) % 8];
/** Default ink for text a drafter types into a PDF field. */
export const PDF_INK = '#000000';
/** Stroke of the placeholder drawn in an empty Image field while designing (not written into the PDF). */
export const IMAGE_PLACEHOLDER_STROKE = '#8a84b8';
/** rgba() of a hex colour, for field tints drawn by the viewer. */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`;
}
