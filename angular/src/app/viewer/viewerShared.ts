// Shared by the designer, signer and reviewer viewers.
import { Internationalization } from '@syncfusion/ej2-base';

/** Four OFL handwriting faces, self-hosted (app-plan.md, F1). The viewer takes exactly four (keys 0-3). */
export const TYPE_SIGNATURE_FONT_LIST = ['Caveat', 'Dancing Script', 'Pacifico', 'Sacramento'];
export const TYPE_SIGNATURE_FONTS: Record<number, string> = { 0: 'Caveat', 1: 'Dancing Script', 2: 'Pacifico', 3: 'Sacramento' };

/** Typed signatures render on a canvas, which needs the fonts loaded first. */
export function preloadSignatureFonts() {
  if (!('fonts' in document)) return;
  for (const f of TYPE_SIGNATURE_FONT_LIST) { try { void document.fonts.load(`32px "${f}"`); } catch { /* ignore */ } }
}

const intl = new Internationalization();
/** Today's date in a field's printed format (default `MMM d, yyyy`, en-US). */
export const todayIn = (format = 'MMM d, yyyy'): string => intl.formatDate(new Date(), { format });
