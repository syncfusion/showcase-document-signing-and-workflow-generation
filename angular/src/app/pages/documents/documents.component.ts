// Documents (port of DocumentsPage.tsx): Grid with workflow-order status sort and a phone layout.
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { GridModule, SortService } from '@syncfusion/ej2-angular-grids';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { LucideArrowRight, LucideFileText } from '@lucide/angular';
import { catalog } from '../../shared/data/catalog';
import { nextStepHref, nextStepLabel, STATUS_ORDER } from '../../shared/domain/rules';
import type { DocumentStatus } from '../../shared/domain/types';
import { fileSize } from '../../shared/format/format';
import { StatusBadgeComponent } from '../../shared/ui/badges.component';

/** Status sorts in workflow order (Draft, Ready to sign, Completed); same EJ2 column property the reference uses. */
const byStatus = (a: DocumentStatus, b: DocumentStatus) => STATUS_ORDER[a] - STATUS_ORDER[b];

@Component({
  selector: 'app-documents',
  imports: [GridModule, ButtonModule, StatusBadgeComponent, LucideArrowRight, LucideFileText],
  providers: [SortService],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Documents</h1>
        <p>Every sample document and where it stands. Sort by any column.</p>
      </header>
      <section class="e-card app-card grid-card" aria-label="Documents">
        <div class="e-card-content">
          <ejs-grid id="documents-grid" [dataSource]="rows" [allowSorting]="true" [allowSelection]="false" [allowTextWrap]="true">
            <e-columns>
              <e-column field="name" headerText="Document">
                <ng-template #template let-data>
                  <span class="doc-name-cell"><svg lucideFileText [size]="15" aria-hidden="true"></svg>
                    <span>{{ data.name }}<span class="phone-only"><app-status-badge [status]="data.status" /></span></span></span>
                </ng-template>
              </e-column>
              <e-column field="pages" headerText="Pages" width="90" textAlign="Right" format="N0" hideAtMedia="(min-width: 640px)"></e-column>
              <e-column field="sizeBytes" headerText="Size" width="100" textAlign="Right" hideAtMedia="(min-width: 640px)">
                <ng-template #template let-data><span>{{ data.size }}</span></ng-template>
              </e-column>
              <e-column field="status" headerText="Status" width="150" [sortComparer]="byStatus" hideAtMedia="(min-width: 640px)">
                <ng-template #template let-data><app-status-badge [status]="data.status" /></ng-template>
              </e-column>
              <e-column field="action" headerText="Action" width="170" [allowSorting]="false">
                <ng-template #template let-data>
                  @if (data.action) {
                    <button ejs-button cssClass="e-flat e-primary row-action" (click)="open(data.href)" [attr.aria-label]="data.action + ': ' + data.name">
                      {{ data.action }}<svg lucideArrowRight [size]="14" aria-hidden="true"></svg>
                    </button>
                  } @else { <span class="muted">No action needed</span> }
                </ng-template>
              </e-column>
            </e-columns>
          </ejs-grid>
        </div>
      </section>
    </div>`,
})
export class DocumentsComponent {
  private readonly router = inject(Router);
  protected readonly byStatus = byStatus as never;
  protected readonly rows = catalog.documents.map((d) => ({ ...d, size: fileSize(d.sizeBytes), action: nextStepLabel(catalog, d), href: nextStepHref(catalog, d) }));
  protected open(href: string): void { void this.router.navigateByUrl(href); }
}
