// The form designer's PDF Viewer (port of DesignerViewer.tsx), loaded with @defer inside Prepare and Design.
// Placement and editing are driven by the page's palette and inspector, so the viewer shows only page navigation
// and zoom. APIs from the Angular PDF Viewer skill (form-field-settings.md documents designerMode,
// form-field-events.md, api-methods.md).
import { Component, DestroyRef, ViewChild, inject, input, output } from '@angular/core';
import {
  AnnotationService, FormDesignerService, FormFieldsService, LinkAnnotationService, MagnificationService, NavigationService,
  PdfViewerComponent, PdfViewerModule, TextSelectionService, ToolbarService,
} from '@syncfusion/ej2-angular-pdfviewer';
import { assetUrl } from '../shared/assets';
import { installSignatureDialogEnhancements } from './signatureDialog';
import { TYPE_SIGNATURE_FONTS, TYPE_SIGNATURE_FONT_LIST } from './viewerShared';

export const DESIGNER_VIEWER_ID = 'signflow-pdf-viewer';

@Component({
  selector: 'app-designer-viewer',
  imports: [PdfViewerModule],
  providers: [ToolbarService, MagnificationService, NavigationService, AnnotationService, LinkAnnotationService, TextSelectionService, FormFieldsService, FormDesignerService],
  template: `
    <ejs-pdfviewer #viewer [id]="viewerId" [documentPath]="documentUrl()" [resourceUrl]="resourceUrl" height="100%"
      [isFormDesignerToolbarVisible]="false" [designerMode]="true" [toolbarSettings]="toolbarSettings" contextMenuOption="None"
      [enableNavigationToolbar]="false" [enableAnnotationToolbar]="false"
      [signatureFieldSettings]="fontSettings" [initialFieldSettings]="fontSettings" [handWrittenSignatureSettings]="fontSettings"
      (documentLoad)="loaded.emit()" (documentLoadFailed)="loadFailed.emit()"
      (formFieldAdd)="fieldAdd.emit($event)" (formFieldRemove)="fieldRemove.emit($event)"
      (formFieldSelect)="fieldSelect.emit($event)" (formFieldUnselect)="fieldUnselect.emit($event)"
      (formFieldPropertiesChange)="fieldPropertiesChange.emit($event)"
      (formFieldMove)="fieldGeometryChange.emit($event)" (formFieldResize)="fieldGeometryChange.emit($event)"></ejs-pdfviewer>`,
  host: { style: 'display: contents' },
})
export class DesignerViewerComponent {
  readonly documentUrl = input.required<string>();
  readonly loaded = output<void>();
  readonly loadFailed = output<void>();
  readonly fieldAdd = output<any>();
  readonly fieldRemove = output<any>();
  readonly fieldSelect = output<any>();
  readonly fieldUnselect = output<any>();
  readonly fieldPropertiesChange = output<any>();
  readonly fieldGeometryChange = output<any>();
  @ViewChild('viewer') private viewerRef?: PdfViewerComponent;

  protected readonly viewerId = DESIGNER_VIEWER_ID;
  protected readonly resourceUrl = assetUrl('/ej2-pdfviewer-lib');
  protected readonly toolbarSettings = { toolbarItems: ['PageNavigationTool', 'MagnificationTool'] } as never;
  protected readonly fontSettings = { typeSignatureFonts: TYPE_SIGNATURE_FONTS } as never;

  constructor() {
    const uninstall = installSignatureDialogEnhancements(DESIGNER_VIEWER_ID, TYPE_SIGNATURE_FONT_LIST);
    inject(DestroyRef).onDestroy(uninstall);
  }

  /** The live viewer instance; the page drives the form designer through it. */
  instance(): any { return this.viewerRef ?? null; }
}
