// Prepare and Design (port of PreparePage.tsx): place, assign and edit fields, then hand off to Sign. The viewer
// logic is the reference's, line for line where it talks to the viewer; React state becomes signals and fields.
import { Component, DestroyRef, OnInit, ViewChild, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { ColorPickerModule, NumericTextBoxModule, TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { DatePickerModule } from '@syncfusion/ej2-angular-calendars';
import { Internationalization } from '@syncfusion/ej2-base';
import {
  LucideBold, LucideBriefcase, LucideBuilding, LucideCalendar, LucideCalendarClock, LucideCheck, LucideChevronDown, LucideCircleDot,
  LucideImage, LucideItalic, LucideLayoutGrid, LucideLink2, LucideMail, LucideMousePointerClick, LucidePencilLine, LucidePenTool, LucidePlus,
  LucideSquareCheck, LucideSquareUser, LucideTag, LucideTextAlignCenter, LucideTextAlignEnd, LucideTextAlignStart, LucideTrash,
  LucideTriangleAlert, LucideType, LucideUnderline, LucideUser,
} from '@lucide/angular';
import { catalog } from '../../shared/data/catalog';
import { initialsOf, nextColorSlot, readiness, recipientsOf, resolveDocument, sampleById } from '../../shared/domain/rules';
import type { FieldBase, PreparedField, Recipient, TextFormat } from '../../shared/domain/types';
import { sessionStore } from '../../shared/session/sessionStore';
import { assetUrl } from '../../shared/assets';
import { DATE_FORMAT } from '../../shared/format/format';
import { IMAGE_PLACEHOLDER_STROKE, PDF_INK, recipientColor, tint } from '../../shared/palette';
import { mediaQuery } from '../../state/media';
import { LoadingComponent } from '../../shared/ui/loading.component';
import { DocumentNotFoundComponent, MobileSheetComponent, WorkspaceBarComponent } from '../../shared/ui/workspace.component';
import { DESIGNER_VIEWER_ID, DesignerViewerComponent } from '../../viewer/designer-viewer.component';
import { DATE_FORMATS, DEFAULT_FORMAT, PALETTE, SEMANTIC_LABEL, TEXT_FONTS, editableKind, sizeOf, type FieldDef } from './fields';

interface LiveFormField { id: string; name: string; type: string; isRequired?: boolean; customData?: { recipientId?: string; semantic?: string } }
type Bounds = { X: number; Y: number; Width: number; Height: number };

const FONT_STYLE = { None: 0, Bold: 1, Italic: 2, Underline: 4 } as const;
const intl = new Internationalization();
const IMAGE_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${IMAGE_PLACEHOLDER_STROKE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">` +
  '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15l-5-5L5 21"/></svg>',
);
const DEFAULT_DOC = catalog.documents[0]?.id;
const colorOf = (r: Pick<Recipient, 'colorSlot'> | undefined) => (r ? recipientColor(r.colorSlot) : '');
const boundsOf = (b: any, fallback: Bounds): Bounds => ({
  X: b?.X ?? b?.x ?? fallback.X, Y: b?.Y ?? b?.y ?? fallback.Y,
  Width: b?.Width ?? b?.width ?? fallback.Width, Height: b?.Height ?? b?.height ?? fallback.Height,
});
/** Sample drafts open with their saved progress: the tab's edits, else the catalogue seed. */
function sampleDraft(id: string | undefined) {
  const s = sampleById(catalog, id);
  if (!s || s.status !== 'Draft') return null;
  return sessionStore.getSampleDraft(s.id) ?? { fields: s.fields, recipients: recipientsOf(catalog, s.recipientIds) };
}

@Component({
  selector: 'app-prepare',
  imports: [NgTemplateOutlet, ButtonModule, CheckBoxModule, ColorPickerModule, NumericTextBoxModule, TextBoxModule, DropDownListModule, DatePickerModule,
    LoadingComponent, DocumentNotFoundComponent, MobileSheetComponent, WorkspaceBarComponent, DesignerViewerComponent,
    LucideBold, LucideBriefcase, LucideBuilding, LucideCalendar, LucideCalendarClock, LucideCheck, LucideChevronDown, LucideCircleDot,
    LucideImage, LucideItalic, LucideLayoutGrid, LucideLink2, LucideMail, LucideMousePointerClick, LucidePencilLine, LucidePenTool, LucidePlus,
    LucideSquareCheck, LucideSquareUser, LucideTag, LucideTextAlignCenter, LucideTextAlignEnd, LucideTextAlignStart, LucideTrash,
    LucideTriangleAlert, LucideType, LucideUnderline, LucideUser],
  templateUrl: './prepare.component.html',
  host: { style: 'display: contents' },
})
export class PrepareComponent implements OnInit {
  readonly documentId = input<string>();
  @ViewChild('designer') private designer?: DesignerViewerComponent;
  private readonly router = inject(Router);

  protected readonly id = computed(() => this.documentId() ?? DEFAULT_DOC);
  protected readonly doc = computed(() => resolveDocument(catalog, this.id(), (id) => sessionStore.getDocument(id)));
  protected readonly url = computed(() => assetUrl(this.doc()?.path ?? ''));
  protected readonly narrow = mediaQuery('(max-width: 1023.98px)');

  protected readonly recipients = signal<Recipient[]>([]);
  protected readonly activeRecipientId = signal('');
  protected readonly showAddRecip = signal(false);
  protected readonly fields = signal<LiveFormField[]>([]);
  protected readonly selectedFieldId = signal<string | null>(null);
  protected readonly documentReady = signal(false);
  protected readonly failed = signal(false);
  protected readonly attempts = signal([0]);
  protected readonly openSheet = signal<'palette' | 'inspector' | null>(null);
  protected readonly newRecip = { name: '', email: '', role: 'Signer' };

  // Fields the viewer's event handlers read, so they never see stale state.
  private readonly layout = new Map<string, PreparedField>();
  private readonly imageData = new Map<string, string>();
  private pending: FieldDef | null = null;
  private pendingBounds: Bounds | null = null;
  private pendingPage = 0;
  private placeCounter = 0;
  private nameSeq = 0;
  private suppressClick = false;
  private moving = false;
  private readonly restore = new Map<string, PreparedField>();
  private restoreStarted = false;
  private imageTarget: string | null = null;

  protected readonly palette = PALETTE;
  protected readonly textFonts = TEXT_FONTS;
  protected readonly dateFormat = DATE_FORMAT;
  protected readonly fontStyles = [
    { flag: FONT_STYLE.Bold, label: 'Bold', icon: 'bold' }, { flag: FONT_STYLE.Italic, label: 'Italic', icon: 'italic' }, { flag: FONT_STYLE.Underline, label: 'Underline', icon: 'underline' },
  ];
  protected readonly aligns: { value: NonNullable<TextFormat['alignment']>; label: string }[] = [
    { value: 'Left', label: 'Align left' }, { value: 'Center', label: 'Align center' }, { value: 'Right', label: 'Align right' },
  ];
  protected readonly selected = computed(() => this.fields().find((f) => f.id === this.selectedFieldId()) ?? null);
  protected readonly check = computed(() => readiness(this.recipients().length, this.fields().map((f) => ({ semantic: f.customData?.semantic ?? '', recipientId: f.customData?.recipientId }))));
  protected readonly ledger = computed(() => this.recipients().map((r) => ({ r, list: this.fields().filter((f) => f.customData?.recipientId === r.id) })));
  protected readonly unassigned = computed(() => this.fields().filter((f) => !f.customData?.recipientId));
  protected readonly firstTodo = computed(() => this.check().items.find((i) => !i.done)?.label ?? '');

  constructor() {
    const destroy = inject(DestroyRef);
    // The viewer re-renders fields on zoom, scroll and paging: re-apply images and labels.
    const repaint = window.setInterval(() => this.layout.forEach((entry, id) => {
      this.syncFieldName(id);
      if (entry.imageData || entry.semantic === 'image') { const el = document.getElementById(id); if (el && !el.style.backgroundImage) this.paintImage(id); }
    }), 500);
    // Sample-draft edits are kept for the tab once their restore has finished.
    const autosave = window.setInterval(() => {
      const s = sampleById(catalog, this.id());
      if (s?.status !== 'Draft' || !this.restoreStarted || this.restore.size > 0) return;
      this.syncLayoutFromViewer();
      sessionStore.saveSampleDraft(s.id, { fields: [...this.layout.values()], recipients: this.recipients() });
    }, 1000);
    // Delete / Backspace removes the selected field (unless typing in an input outside the viewer).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const ae = document.activeElement as HTMLElement | null;
      const tag = (ae?.tagName || '').toLowerCase();
      const inViewer = !!ae && !!document.getElementById(DESIGNER_VIEWER_ID)?.contains(ae);
      if (!inViewer && (tag === 'input' || tag === 'textarea' || tag === 'select' || ae?.isContentEditable)) return;
      const id = this.selectedFieldId();
      if (id) { e.preventDefault(); try { this.fd()?.deleteFormField(id, true); } catch { /* best effort */ } }
    };
    // Double-click a placed field to edit it in the inspector; the viewer's own properties dialog is suppressed.
    const findFieldId = (target: EventTarget | null) => {
      let el = target as HTMLElement | null;
      while (el) { if (el.id && this.layout.has(el.id)) return el.id; el = el.parentElement; }
      return null;
    };
    const onDbl = (e: MouseEvent) => {
      if (!document.querySelector('.prepare-canvas')?.contains(e.target as Node)) return;
      const id = findFieldId(e.target) || this.selectedFieldId();
      if (id && this.layout.has(id)) { e.stopImmediatePropagation(); e.preventDefault(); this.openFieldEditor(id); }
    };
    const kill = () => {
      const el = document.getElementById(`${DESIGNER_VIEWER_ID}_properties_window`) as any;
      if (el?.classList.contains('e-popup-open')) { try { el.ej2_instances?.[0]?.hide(); } catch { el.style.display = 'none'; } }
    };
    const obs = new MutationObserver(kill);
    obs.observe(document.body, { childList: true });
    window.addEventListener('keydown', onKey);
    document.addEventListener('dblclick', onDbl, true);
    destroy.onDestroy(() => {
      window.clearInterval(repaint); window.clearInterval(autosave);
      window.removeEventListener('keydown', onKey); document.removeEventListener('dblclick', onDbl, true); obs.disconnect();
    });
  }

  /** Recipients come from New document's setup, else a sample draft, else the catalogue defaults (route input is set by now). */
  ngOnInit(): void {
    const id = this.id();
    const list = (id && sessionStore.getDraftSetup(id)?.recipients) || sampleDraft(id)?.recipients || catalog.recipients;
    this.recipients.set(list);
    this.activeRecipientId.set(list[0]?.id ?? '');
    document.title = `${this.doc()?.name ?? 'Prepare and Design'} · SignFlow`;
  }

  private viewer(): any { return this.designer?.instance() ?? null; }
  private fd(): any { return this.viewer()?.formDesigner ?? null; }
  private activeColor(): string { return colorOf(this.recipients().find((r) => r.id === this.activeRecipientId())); }

  // ---- Field chrome helpers ----
  private paintImage(fieldId: string): void {
    const real = this.imageData.get(fieldId);
    const isImage = this.layout.get(fieldId)?.semantic === 'image';
    const url = real ?? (isImage ? IMAGE_PLACEHOLDER : null);
    const el = url ? document.getElementById(fieldId) : null;
    if (!el || !url) return;
    Object.assign(el.style, { backgroundImage: `url("${url}")`, backgroundSize: real ? 'contain' : '42%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' });
    const inner = el.querySelector('input, textarea') as HTMLElement | null;
    if (inner) inner.style.background = 'transparent';
  }
  /** Hide the designer's name label once a field has a value or image (show only the value). */
  private syncFieldName(fieldId: string): void {
    const lbl = document.getElementById(`${fieldId}_designer_name`);
    if (!lbl) return;
    const entry = this.layout.get(fieldId);
    const el = document.getElementById(fieldId) as HTMLElement | null;
    const inputEl = el && ((el.matches('input, textarea') ? el : el.querySelector('input, textarea')) as HTMLInputElement | null);
    const filled = !!(inputEl?.value.trim() || entry?.value || entry?.imageData || entry?.semantic === 'image');
    lbl.style.display = filled ? 'none' : '';
  }

  // ---- Viewer events ----
  protected onLoaded(): void {
    this.documentReady.set(true);
    if (this.restoreStarted) return;
    this.restoreStarted = true;
    // Sample drafts recreate their saved fields once the PDF has loaded; other documents start empty.
    const draft = sampleDraft(this.id());
    const fd = this.fd();
    if (!draft?.fields.length || !fd) return;
    for (const pf of draft.fields) {
      this.restore.set(pf.name, pf);
      const seq = Number(/(\d+)$/.exec(pf.name)?.[1]);
      if (seq > this.nameSeq) this.nameSeq = seq;
    }
    for (const pf of draft.fields) {
      const opts: Record<string, unknown> = { name: pf.name, bounds: pf.bounds, pageNumber: pf.pageIndex + 1, isRequired: pf.isRequired, customData: { semantic: pf.semantic, recipientId: pf.recipientId } };
      if (pf.isReadOnly) opts['isReadOnly'] = true;
      if (pf.value) opts['value'] = pf.value;
      const fmt = pf.format;
      if (fmt?.fontFamily) opts['fontFamily'] = fmt.fontFamily;
      if (fmt?.fontSize) opts['fontSize'] = fmt.fontSize;
      if (fmt?.alignment) opts['alignment'] = fmt.alignment;
      if (fmt?.color) opts['color'] = fmt.color;
      try { fd.addFormField(pf.base, opts); } catch { this.restore.delete(pf.name); }
    }
  }

  protected onFieldAdd(args: { field: LiveFormField }): void {
    const field = args?.field;
    if (!field?.id) return;
    this.fields.update((prev) => (prev.some((f) => f.id === field.id) ? prev : [...prev, field]));
    const restored = this.restore.get(field.name);
    if (restored) {
      this.restore.delete(field.name);
      this.layout.set(field.id, { ...restored });
      const color = colorOf(this.recipients().find((r) => r.id === restored.recipientId));
      if (color) {
        const patch: Record<string, unknown> = { borderColor: color, backgroundColor: tint(color, restored.base === 'SignatureField' || restored.base === 'InitialField' ? 0.2 : 0.14) };
        if (!restored.format?.color) patch['color'] = color;
        try { this.fd()?.updateFormField(field.id, patch); } catch { /* best effort */ }
      }
      if (restored.format?.fontStyle) { try { this.fd()?.updateFormField(field.id, { fontStyle: restored.format.fontStyle }); } catch { /* best effort */ } }
      if (restored.imageData) this.imageData.set(field.id, restored.imageData);
      this.fields.update((prev) => prev.map((f) => (f.id === field.id ? { ...f, customData: { semantic: restored.semantic, recipientId: restored.recipientId } } : f)));
      window.setTimeout(() => { this.paintImage(field.id); this.syncFieldName(field.id); }, 0);
      return;
    }
    const def = this.pending;
    if (def) {
      const recipientId = this.activeRecipientId() || undefined;
      const color = this.activeColor();
      const name = `${def.label} ${(this.nameSeq += 1)}`;
      const patch: Record<string, unknown> = { name, tooltip: def.label, isRequired: !def.readOnly, customData: { semantic: def.semantic, recipientId } };
      this.layout.set(field.id, {
        base: def.base, semantic: def.semantic, name, isRequired: !def.readOnly, recipientId,
        bounds: this.pendingBounds ?? { X: 120, Y: 300, Width: 150, Height: 30 }, pageIndex: this.pendingPage, isReadOnly: def.readOnly,
      });
      if (def.readOnly) patch['isReadOnly'] = true;
      if (def.defaultValue) patch['value'] = def.defaultValue;
      if (color) { patch['borderColor'] = color; patch['backgroundColor'] = tint(color, def.base === 'SignatureField' || def.base === 'InitialField' ? 0.2 : 0.14); }
      try { this.fd()?.updateFormField(field.id, patch); } catch { /* best effort */ }
      if (def.semantic === 'image') window.setTimeout(() => { this.paintImage(field.id); this.syncFieldName(field.id); }, 0);
      this.fields.update((prev) => prev.map((f) => (f.id === field.id ? { ...f, name, isRequired: !def.readOnly, customData: { semantic: def.semantic, recipientId } } : f)));
      this.selectedFieldId.set(field.id);
      window.setTimeout(() => { try { this.fd()?.selectFormField(field.id); } catch { /* best effort */ } }, 60);
    }
    this.pending = null;
  }
  protected onFieldRemove(args: { field: LiveFormField }): void {
    const id = args?.field?.id;
    if (!id) return;
    this.layout.delete(id);
    this.fields.update((prev) => prev.filter((f) => f.id !== id));
    if (this.selectedFieldId() === id) this.selectedFieldId.set(null);
  }
  protected onFieldSelect(args: { field: LiveFormField }): void {
    const id = args?.field?.id;
    if (!id) return;
    this.selectedFieldId.set(id);
    window.setTimeout(() => this.paintImage(id), 0);
    if (this.narrow()) this.openSheet.set('inspector');
  }
  protected onFieldUnselect(args: { field: LiveFormField }): void {
    const id = args?.field?.id;
    if (!id || this.moving) return;
    if (this.selectedFieldId() === id) this.selectedFieldId.set(null);
  }
  protected onFieldPropertiesChange(args: { newValue: any }): void {
    const nv = args?.newValue;
    if (!nv?.id) return;
    this.fields.update((prev) => prev.map((f) => (f.id === nv.id ? { ...f, ...nv } : f)));
    const entry = this.layout.get(nv.id);
    if (entry && nv.bounds) entry.bounds = boundsOf(nv.bounds, entry.bounds);
    window.setTimeout(() => this.paintImage(nv.id), 0);
  }
  /** Dragging or resizing fires formFieldMove / formFieldResize on mouse-up: read the live bounds then. */
  protected onFieldGeometryChange(args: { field?: { id?: string }; currentPosition?: Bounds }): void {
    const id = args?.field?.id;
    if (!id) return;
    window.setTimeout(() => {
      const ff: any = (this.viewer()?.formFieldCollections || []).find((c: any) => c.id === id);
      const entry = this.layout.get(id);
      if (entry) {
        if (ff?.bounds) entry.bounds = boundsOf(ff.bounds, entry.bounds);
        else if (args.currentPosition) entry.bounds = { ...args.currentPosition };
        if (Number.isInteger(ff?.pageIndex) && ff.pageIndex >= 0) entry.pageIndex = ff.pageIndex;
      }
      this.fields.update((prev) => [...prev]);
    }, 0);
  }
  private syncLayoutFromViewer(): void {
    for (const ff of (this.viewer()?.formFieldCollections || []) as any[]) {
      const entry = this.layout.get(ff.id);
      if (!entry) continue;
      if (ff.bounds) entry.bounds = boundsOf(ff.bounds, entry.bounds);
      if (Number.isInteger(ff.pageIndex) && ff.pageIndex >= 0) entry.pageIndex = ff.pageIndex;
    }
  }

  // ---- Placement ----
  protected paletteClick(def: FieldDef): void {
    if (this.suppressClick) { this.suppressClick = false; return; }
    const fd = this.fd();
    if (!fd || !this.documentReady()) return;
    this.pending = def;
    const n = this.placeCounter++;
    const size = sizeOf(def);
    const bounds = { X: 120 + (n % 4) * 26, Y: 300 + (n % 8) * 46, Width: size.W, Height: size.H };
    this.pendingBounds = bounds;
    // Click (or Enter) places on the page in view (1-based pageNumber).
    const pageNumber = Math.max(1, Number(this.viewer()?.currentPageNumber) || 1);
    this.pendingPage = pageNumber - 1;
    try { fd.addFormField(def.base, { bounds, pageNumber }); } catch { /* best effort */ }
    if (this.narrow()) this.openSheet.set(null);
  }
  private pxPerUnit(idx: number): number {
    const el = document.getElementById(`${DESIGNER_VIEWER_ID}_pageDiv_${idx}`);
    const info: any = this.viewer()?.getPageInfo?.(idx);
    if (el && info?.width) { const w = el.getBoundingClientRect().width; const uw = info.width * (96 / 72); if (w > 0 && uw > 0) return w / uw; }
    return (this.viewer()?.magnificationModule?.zoomFactor as number) || 1;
  }
  /** Viewport point -> page index and form-field units, geometrically (the viewer's lookup returns 1 for every page). */
  private screenToPdf(clientX: number, clientY: number) {
    const pages = Array.from(document.querySelectorAll(`[id*="${DESIGNER_VIEWER_ID}_pageDiv_"]`)) as HTMLElement[];
    let idx = pages.findIndex((p) => { const r = p.getBoundingClientRect(); return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom; });
    if (idx === -1) {
      let best = Infinity;
      pages.forEach((p, i) => { const r = p.getBoundingClientRect(); const d = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0; if (d < best) { best = d; idx = i; } });
    }
    const target = idx >= 0 ? pages[idx] : null;
    if (!target) return { pageIndex: 0, X: 100, Y: 120 };
    const r = target.getBoundingClientRect();
    const info: any = this.viewer()?.getPageInfo?.(idx);
    const uw = ((info?.width as number) || 612) * (96 / 72);
    const uh = ((info?.height as number) || 792) * (96 / 72);
    return { pageIndex: idx, X: r.width > 0 ? ((clientX - r.left) / r.width) * uw : 0, Y: r.height > 0 ? ((clientY - r.top) / r.height) * uh : 0 };
  }
  private placeFieldAt(def: FieldDef, clientX: number, clientY: number): void {
    if (!this.documentReady()) return;
    const loc = this.screenToPdf(clientX, clientY);
    const r = document.getElementById(`${DESIGNER_VIEWER_ID}_pageDiv_${loc.pageIndex}`)?.getBoundingClientRect();
    if (!r || clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return;
    this.pending = def;
    const size = sizeOf(def);
    const info: any = this.viewer()?.getPageInfo?.(loc.pageIndex);
    const uw = ((info?.width as number) || 612) * (96 / 72);
    const uh = ((info?.height as number) || 792) * (96 / 72);
    const bounds = {
      X: Math.min(Math.max(2, loc.X - size.W / 2), Math.max(2, uw - size.W - 2)),
      Y: Math.min(Math.max(2, loc.Y - size.H / 2), Math.max(2, uh - size.H - 2)),
      Width: size.W, Height: size.H,
    };
    this.pendingBounds = bounds;
    this.pendingPage = loc.pageIndex;
    try { this.fd()?.addFormField(def.base, { bounds, pageNumber: loc.pageIndex + 1 }); } catch { /* best effort */ }
  }
  /** Pointer drag with our own ghost, dropped exactly under the cursor; Escape cancels. */
  protected beginDrag(e: MouseEvent, def: FieldDef): void {
    if (!this.documentReady() || e.button !== 0) return;
    const startX = e.clientX, startY = e.clientY;
    let dragging = false;
    let ghost: HTMLDivElement | null = null;
    const size = sizeOf(def);
    const end = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('keydown', key);
      document.body.style.cursor = '';
      ghost?.remove(); ghost = null;
    };
    const move = (ev: MouseEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        dragging = true;
        const px = this.pxPerUnit(0);
        const color = this.activeColor() || recipientColor(1);
        ghost = document.createElement('div');
        ghost.className = 'prepare-ghost';
        ghost.textContent = def.label;
        Object.assign(ghost.style, { width: `${Math.max(40, size.W * px)}px`, height: `${Math.max(22, size.H * px)}px`, color, background: tint(color, 0.16), borderColor: color });
        document.body.appendChild(ghost);
        document.body.style.cursor = 'copy';
      }
      if (ghost) { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; }
    };
    const up = (ev: MouseEvent) => {
      const wasDragging = dragging;
      end();
      if (wasDragging) {
        this.suppressClick = true;
        window.setTimeout(() => { this.suppressClick = false; }, 0);
        this.placeFieldAt(def, ev.clientX, ev.clientY);
      }
    };
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { dragging = false; end(); } };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('keydown', key);
  }

  // ---- Inspector ----
  protected entryOf(id: string): PreparedField | undefined { return this.layout.get(id); }
  protected fieldLabel(f: LiveFormField): string { return f.customData?.semantic ? SEMANTIC_LABEL[f.customData.semantic] ?? f.type : f.name || f.type; }
  protected kindOf(id: string) { return editableKind(this.layout.get(id)?.semantic, this.layout.get(id)?.base as FieldBase | undefined); }
  protected liveBounds(id: string): Bounds | null {
    const entry = this.layout.get(id);
    const ff: any = (this.viewer()?.formFieldCollections || []).find((c: any) => c.id === id);
    return ff?.bounds ? boundsOf(ff.bounds, entry?.bounds ?? { X: 0, Y: 0, Width: 0, Height: 0 }) : entry?.bounds ?? null;
  }
  protected round(n: number): number { return Math.round(n); }
  /** updateFormField with bounds or style props deselects the field: suppress that, apply in order, reselect. */
  private updateKeepingSelection(id: string, patches: Record<string, unknown>[]): void {
    const focused = document.activeElement as HTMLElement | null;
    this.moving = true;
    for (const p of patches) { try { this.fd()?.updateFormField(id, p); } catch { /* best effort */ } }
    this.fields.update((prev) => [...prev]);
    window.setTimeout(() => {
      try { this.fd()?.selectFormField(id); } catch { /* best effort */ }
      this.moving = false;
      focused?.focus();
      this.paintImage(id); this.syncFieldName(id);
    }, 0);
  }
  protected assign(r: Recipient): void {
    const sel = this.selected();
    if (!sel) return;
    const color = colorOf(r);
    this.fd()?.updateFormField(sel.id, { customData: { semantic: sel.customData?.semantic, recipientId: r.id }, borderColor: color, color: this.layout.get(sel.id)?.format?.color ?? color });
    const entry = this.layout.get(sel.id);
    if (entry) entry.recipientId = r.id;
    this.fields.update((prev) => prev.map((f) => (f.id === sel.id ? { ...f, customData: { semantic: f.customData?.semantic, recipientId: r.id } } : f)));
  }
  protected rename(name: string): void {
    const sel = this.selected();
    if (!sel) return;
    try { this.fd()?.updateFormField(sel.id, { name }); } catch { /* best effort */ }
    const entry = this.layout.get(sel.id);
    if (entry) entry.name = name;
    this.fields.update((prev) => prev.map((f) => (f.id === sel.id ? { ...f, name } : f)));
  }
  protected setRequired(isRequired: boolean): void {
    const sel = this.selected();
    if (!sel) return;
    try { this.fd()?.updateFormField(sel.id, { isRequired }); } catch { /* best effort */ }
    const entry = this.layout.get(sel.id);
    if (entry) entry.isRequired = isRequired;
    this.fields.update((prev) => prev.map((f) => (f.id === sel.id ? { ...f, isRequired } : f)));
  }
  protected setValue(id: string, value: string): void {
    // A read-only field accepts a value only with isReadOnly in the same patch (reference finding).
    try { this.fd()?.updateFormField(id, { value, isReadOnly: false }); } catch { /* best effort */ }
    const entry = this.layout.get(id);
    if (entry) { entry.value = value; entry.isReadOnly = false; }
    this.syncFieldName(id);
  }
  protected dateOf(id: string) { return { format: this.layout.get(id)?.dateFormat ?? DATE_FORMATS[0], iso: this.layout.get(id)?.dateISO }; }
  protected dateValue(id: string): Date | null { const iso = this.dateOf(id).iso; return iso ? new Date(iso) : null; }
  protected dateFormats(id: string) {
    const iso = this.dateOf(id).iso;
    return DATE_FORMATS.map((f) => ({ value: f, text: iso ? `${f} (${intl.formatDate(new Date(iso), { format: f })})` : f }));
  }
  protected setDate(id: string, date: Date | null, format = this.dateOf(id).format): void {
    const entry = this.layout.get(id);
    if (entry) { entry.dateFormat = format; entry.dateISO = date ? date.toISOString() : undefined; }
    this.setValue(id, date ? intl.formatDate(date, { format }) : '');
  }
  protected formatOf(id: string) {
    const entry = this.layout.get(id);
    const rc = colorOf(this.recipients().find((r) => r.id === entry?.recipientId));
    return { ...DEFAULT_FORMAT, color: rc || PDF_INK, ...(entry?.format ?? {}) } as { fontFamily: string; fontSize: number; fontStyle: number; alignment: TextFormat['alignment']; color: string };
  }
  protected applyFormat(id: string, change: Partial<TextFormat>): void {
    const entry = this.layout.get(id);
    if (!entry) return;
    entry.format = { ...(entry.format ?? {}), ...change };
    const patches: Record<string, unknown>[] = [];
    const patch: Record<string, unknown> = {};
    if (change.fontFamily) patch['fontFamily'] = change.fontFamily;
    if (change.alignment) patch['alignment'] = change.alignment;
    if (change.color) patch['color'] = change.color;
    if (change.fontSize) {
      patch['fontSize'] = change.fontSize;
      // Grow the box so a larger size is not clipped (px at 100% zoom ~ pt x 96/72).
      const need = Math.ceil(change.fontSize * (96 / 72) * 1.3 + 8);
      const b = this.liveBounds(id);
      if (b && b.Height < need) { patch['bounds'] = { ...b, Height: need }; entry.bounds = { ...b, Height: need }; }
    }
    if (change.fontStyle !== undefined) {
      // The viewer only adds style flags; None is its one reset. Clear, then apply.
      patches.push({ fontStyle: FONT_STYLE.None });
      if (change.fontStyle) patch['fontStyle'] = change.fontStyle;
    }
    if (Object.keys(patch).length) patches.push(patch);
    this.updateKeepingSelection(id, patches);
  }
  protected toggleStyle(id: string, flag: number): void {
    const cur = this.formatOf(id).fontStyle;
    this.applyFormat(id, { fontStyle: (cur & flag) !== 0 ? cur & ~flag : cur | flag });
  }
  protected styleOn(id: string, flag: number): boolean { return (this.formatOf(id).fontStyle & flag) !== 0; }
  protected moveField(id: string, axis: 'X' | 'Y', raw: number | null | undefined): void {
    const cur = this.liveBounds(id);
    if (!cur || raw == null || !Number.isFinite(raw)) return;
    const next = { ...cur, [axis]: Math.max(0, Math.round(raw)) };
    const entry = this.layout.get(id);
    if (entry) entry.bounds = next;
    this.updateKeepingSelection(id, [{ bounds: next }]);
  }
  protected openFieldEditor(id: string): void {
    const kind = this.kindOf(id);
    if (!kind) return;
    if (kind === 'image') { this.imageTarget = id; document.getElementById('prepare-image-input')?.click(); return; }
    if (kind === 'checkbox') {
      const ff: any = (this.viewer()?.formFieldCollections || []).find((c: any) => c.id === id);
      try { this.fd()?.updateFormField(id, { isChecked: !(ff?.isChecked ?? ff?.value) }); } catch { /* best effort */ }
      return;
    }
    this.selectedFieldId.set(id);
    if (this.narrow()) this.openSheet.set('inspector');
    window.setTimeout(() => {
      const target = document.querySelector<HTMLInputElement>(kind === 'date' ? '.prepare-datepicker input' : '#prepare-field-value');
      target?.focus(); target?.select();
    }, 60);
  }
  protected onImagePicked(e: Event): void {
    const inputEl = e.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    const id = this.imageTarget;
    this.imageTarget = null;
    if (!file || !id) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      this.imageData.set(id, url);
      const entry = this.layout.get(id);
      if (entry) entry.imageData = url;
      this.paintImage(id); this.syncFieldName(id);
    };
    reader.readAsDataURL(file);
  }
  protected deleteSelected(): void { const sel = this.selected(); if (sel) this.fd()?.deleteFormField(sel.id, true); }
  protected focusField(id: string): void { this.fd()?.selectFormField(id); }
  protected addRecipient(): void {
    const { name, email, role } = this.newRecip;
    if (!name.trim()) return;
    const r: Recipient = { id: `r-${Math.random().toString(36).slice(2, 8)}`, name: name.trim(), role: role.trim() || 'Signer', initials: initialsOf(name), email: email.trim(), colorSlot: nextColorSlot(this.recipients().length) };
    this.recipients.update((prev) => [...prev, r]);
    this.activeRecipientId.set(r.id);
    this.showAddRecip.set(false);
    Object.assign(this.newRecip, { name: '', email: '', role: 'Signer' });
  }
  protected send(): void {
    const doc = this.doc();
    if (!doc) return;
    this.syncLayoutFromViewer();
    sessionStore.savePrepared({ documentId: doc.id, fields: [...this.layout.values()], recipients: this.recipients(), preparedAt: new Date().toISOString() });
    void this.router.navigateByUrl(`/sign/${doc.id}`);
  }
  protected retry(): void {
    this.failed.set(false); this.documentReady.set(false); this.restoreStarted = false; this.layout.clear(); this.fields.set([]);
    this.attempts.update((a) => [a[0] + 1]);
  }
  protected rc(r: Pick<Recipient, 'colorSlot'>): string { return `var(--app-recipient-${r.colorSlot})`; }
}
