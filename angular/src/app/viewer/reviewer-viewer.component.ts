// Read-only review of a signed PDF (port of ReviewerViewer.tsx), loaded with @defer inside Completed.
import { Component, input, output } from '@angular/core';
import { FormDesignerService, FormFieldsService, MagnificationService, NavigationService, PdfViewerModule, ToolbarService } from '@syncfusion/ej2-angular-pdfviewer';
import { assetUrl } from '../shared/assets';

@Component({
  selector: 'app-reviewer-viewer',
  imports: [PdfViewerModule],
  providers: [ToolbarService, MagnificationService, NavigationService, FormFieldsService, FormDesignerService],
  template: `
    <ejs-pdfviewer id="signflow-completed-viewer" [documentPath]="documentUrl()" [resourceUrl]="resourceUrl" height="100%"
      [toolbarSettings]="toolbarSettings" contextMenuOption="None" [enableNavigationToolbar]="false" [enableAnnotationToolbar]="false"
      [isFormDesignerToolbarVisible]="false" (documentLoad)="loaded.emit()" (documentLoadFailed)="loadFailed.emit()"></ejs-pdfviewer>`,
  host: { style: 'display: contents' },
})
export class ReviewerViewerComponent {
  readonly documentUrl = input.required<string>();
  readonly loaded = output<void>();
  readonly loadFailed = output<void>();
  protected readonly resourceUrl = assetUrl('/ej2-pdfviewer-lib');
  protected readonly toolbarSettings = { toolbarItems: ['PageNavigationTool', 'MagnificationTool'] } as never;
}
