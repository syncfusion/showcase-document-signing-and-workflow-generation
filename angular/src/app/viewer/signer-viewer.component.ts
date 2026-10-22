// The signer's PDF Viewer (port of SignerViewer.tsx), loaded with @defer inside the Sign page. Same viewer
// configuration and element id as the reference, so the signature dialog enhancements work unchanged. APIs from the
// Angular PDF Viewer skill (api-methods.md, form-field-settings.md, events.md); typeSignatureFonts is the
// official-documentation fallback the plan records.
import { Component, DestroyRef, ViewChild, inject, input, output } from '@angular/core';
import {
  AnnotationService, BookmarkViewService, FormDesignerService, FormFieldsService, MagnificationService, NavigationService,
  PdfViewerComponent, PdfViewerModule, ToolbarService,
} from '@syncfusion/ej2-angular-pdfviewer';
import { assetUrl } from '../shared/assets';
import type { PreparedField } from '../shared/domain/types';
import type { LiveField } from '../shared/domain/rules';
import { installSignatureDialogEnhancements } from './signatureDialog';
import { TYPE_SIGNATURE_FONTS, TYPE_SIGNATURE_FONT_LIST, todayIn } from './viewerShared';

export const SIGNER_VIEWER_ID = 'signflow-sign-viewer';

@Component({
  selector: 'app-signer-viewer',
  imports: [PdfViewerModule],
  providers: [ToolbarService, MagnificationService, NavigationService, BookmarkViewService, AnnotationService, FormFieldsService, FormDesignerService],
  template: `
    <ejs-pdfviewer #viewer [id]="viewerId" [documentPath]="documentUrl()" [resourceUrl]="resourceUrl" height="100%"
      [isFormDesignerToolbarVisible]="false" [toolbarSettings]="toolbarSettings" contextMenuOption="None"
      [enableNavigationToolbar]="false" [enableAnnotationToolbar]="false"
      [signatureFieldSettings]="fontSettings" [initialFieldSettings]="fontSettings" [handWrittenSignatureSettings]="fontSettings"
      (documentLoad)="handleLoad()" (documentLoadFailed)="loadFailed.emit()"
      (formFieldFocusOut)="refresh()" (formFieldPropertiesChange)="refresh()"></ejs-pdfviewer>`,
  host: { style: 'display: contents' },
})
export class SignerViewerComponent {
  readonly documentUrl = input.required<string>();
  /** Fields designed in Prepare (or a Ready-to-sign sample's seed), recreated after load. */
  readonly fields = input<PreparedField[]>([]);
  readonly loaded = output<void>();
  readonly loadFailed = output<void>();
  readonly fieldsChanged = output<LiveField[]>();
  @ViewChild('viewer') private viewerRef?: PdfViewerComponent;

  protected readonly viewerId = SIGNER_VIEWER_ID;
  protected readonly resourceUrl = assetUrl('/ej2-pdfviewer-lib');
  protected readonly toolbarSettings = { toolbarItems: ['PageNavigationTool', 'MagnificationTool'] } as never;
  protected readonly fontSettings = { typeSignatureFonts: TYPE_SIGNATURE_FONTS } as never;
  private seeded = false;

  constructor() {
    // Field events do not fire for every commit (reference finding), so the collection is polled.
    const timer = window.setInterval(() => this.refresh(), 800);
    const uninstall = installSignatureDialogEnhancements(SIGNER_VIEWER_ID, TYPE_SIGNATURE_FONT_LIST, { allowResign: true });
    inject(DestroyRef).onDestroy(() => { window.clearInterval(timer); uninstall(); });
  }

  private viewer(): any { return this.viewerRef as any; }
  private designer(): any { return this.viewer()?.formDesigner; }

  /** retrieveFormFields() returns the same objects mutated in place: copy so the page sees a change. */
  fieldsNow(): LiveField[] {
    const list = this.viewer()?.retrieveFormFields?.() as LiveField[] | undefined;
    return Array.isArray(list) ? list.map((f) => ({ ...f })) : [];
  }
  protected refresh(): void { this.fieldsChanged.emit(this.fieldsNow()); }
  focusField(name: string): void { try { this.viewer()?.focusFormField(name); } catch { /* not rendered yet */ } }
  /** Clears the recipient-colour chrome before export: saveAsBlob bakes each field's appearance in. */
  clearChrome(): void {
    for (const f of (this.viewer()?.retrieveFormFields?.() ?? []) as Array<{ id?: string }>) {
      if (!f?.id) continue;
      try { this.designer()?.updateFormField(f.id, { borderColor: 'transparent', backgroundColor: 'transparent' }); } catch { /* still exported */ }
    }
  }
  async saveAsBlob(): Promise<Blob | undefined> { return Promise.resolve(this.viewer()?.saveAsBlob()); }
  load(url: string): void { this.viewer()?.load(url, null); }

  protected handleLoad(): void {
    this.loaded.emit();
    if (this.seeded) return;
    this.seeded = true;
    for (const pf of this.fields()) {
      try {
        const opts: Record<string, unknown> = {
          name: pf.name, bounds: pf.bounds, pageNumber: pf.pageIndex + 1, isRequired: pf.isRequired,
          customData: { semantic: pf.semantic, recipientId: pf.recipientId },
        };
        if (pf.isReadOnly) opts['isReadOnly'] = true;
        if (pf.value) opts['value'] = pf.value;
        else if (pf.semantic === 'date' || pf.semantic === 'dateSigned') opts['value'] = todayIn(pf.dateFormat);
        const fmt = pf.format;
        if (fmt?.fontFamily) opts['fontFamily'] = fmt.fontFamily;
        if (fmt?.fontSize) opts['fontSize'] = fmt.fontSize;
        if (fmt?.alignment) opts['alignment'] = fmt.alignment;
        if (fmt?.color) opts['color'] = fmt.color;
        this.designer()?.addFormField(pf.base, opts);
        if (fmt?.fontStyle) {
          const { name } = pf, style = fmt.fontStyle;
          window.setTimeout(() => {
            const ff = (this.viewer()?.formFieldCollections || []).find((c: any) => c?.name === name);
            if (ff) { try { this.designer()?.updateFormField(ff.id, { fontStyle: style }); } catch { /* best effort */ } }
          }, 300);
        }
        if (pf.imageData) {
          const { name } = pf, data = pf.imageData;
          window.setTimeout(() => {
            const ff = (this.viewer()?.formFieldCollections || []).find((c: any) => c?.name === name);
            const el = ff && document.getElementById(ff.id);
            if (!el) return;
            Object.assign(el.style, { backgroundImage: `url("${data}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' });
            const inner = el.querySelector('input, textarea') as HTMLElement | null;
            if (inner) inner.style.background = 'transparent';
          }, 300);
        }
      } catch { /* one field failing does not stop the others */ }
    }
    window.setTimeout(() => this.refresh(), 200);
  }
}
