// Prepare and Design: the field palette and its defaults (copied from the React reference; icons are chosen by key in the template).
import type { FieldBase } from '../../shared/domain/types';

export interface FieldDef {
  key: string;
  label: string;
  base: FieldBase;
  semantic: string;
  readOnly?: boolean;
  defaultValue?: string;
  /** Overrides DEFAULT_SIZE[base] (form-field units: CSS px at 100% zoom). */
  size?: { W: number; H: number };
}

export const PALETTE: { group: string; items: FieldDef[] }[] = [
  { group: 'Signature', items: [
    { key: 'signature', label: 'Signature', base: 'SignatureField', semantic: 'signature' },
    { key: 'initials', label: 'Initials', base: 'InitialField', semantic: 'initials' },
  ] },
  { group: 'Signer details', items: [
    { key: 'name', label: 'Name', base: 'Textbox', semantic: 'name', readOnly: true },
    { key: 'email', label: 'Email', base: 'Textbox', semantic: 'email', readOnly: true },
    { key: 'title', label: 'Title', base: 'Textbox', semantic: 'title' },
    { key: 'company', label: 'Company', base: 'Textbox', semantic: 'company' },
    { key: 'dateSigned', label: 'Date signed', base: 'Textbox', semantic: 'dateSigned', readOnly: true },
  ] },
  { group: 'Inputs', items: [
    { key: 'text', label: 'Text box', base: 'Textbox', semantic: 'text' },
    { key: 'date', label: 'Editable date', base: 'Textbox', semantic: 'date' },
    { key: 'checkbox', label: 'Checkbox', base: 'CheckBox', semantic: 'checkbox' },
    { key: 'radio', label: 'Radio', base: 'RadioButton', semantic: 'radio' },
    { key: 'dropdown', label: 'Dropdown', base: 'DropDown', semantic: 'dropdown' },
  ] },
  { group: 'Content', items: [
    { key: 'image', label: 'Image', base: 'Textbox', semantic: 'image', readOnly: true, size: { W: 96, H: 96 } },
    { key: 'label', label: 'Label', base: 'Textbox', semantic: 'label', readOnly: true, defaultValue: 'Label' },
    { key: 'hyperlink', label: 'Hyperlink', base: 'Textbox', semantic: 'hyperlink', readOnly: true, defaultValue: 'https://' },
  ] },
];

export const SEMANTIC_LABEL: Record<string, string> = Object.fromEntries(PALETTE.flatMap((g) => g.items.map((i) => [i.semantic, i.label])));

export const DEFAULT_SIZE: Record<FieldBase, { W: number; H: number }> = {
  SignatureField: { W: 150, H: 44 },
  InitialField: { W: 90, H: 44 },
  Textbox: { W: 160, H: 24 },
  CheckBox: { W: 22, H: 22 },
  RadioButton: { W: 22, H: 22 },
  DropDown: { W: 160, H: 24 },
};
export const sizeOf = (def: FieldDef) => def.size ?? DEFAULT_SIZE[def.base];

/** The viewer's standard PDF fonts, minus the symbol fonts. */
export const TEXT_FONTS = ['Helvetica', 'Times New Roman', 'Courier'];
/** Printed date patterns (the picker itself always shows MM/dd/yyyy). */
export const DATE_FORMATS = ['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'MMM d, yyyy', 'd MMMM yyyy'];
export const DEFAULT_FORMAT = { fontFamily: 'Helvetica', fontSize: 10, fontStyle: 0, alignment: 'Left' as const };

export type EditableKind = 'date' | 'text' | 'image' | 'checkbox' | null;
export function editableKind(semantic: string | undefined, base: FieldBase | undefined): EditableKind {
  if (semantic === 'image') return 'image';
  if (semantic === 'date' || semantic === 'dateSigned') return 'date';
  if (base === 'CheckBox') return 'checkbox';
  if (['text', 'title', 'company', 'name', 'email', 'label', 'hyperlink'].includes(semantic ?? '')) return 'text';
  return null;
}
