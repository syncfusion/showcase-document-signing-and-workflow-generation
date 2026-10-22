// Templates (port of TemplatesPage.tsx).
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { LucideArrowRight, LucideFileText, LucidePlus, LucideSparkles } from '@lucide/angular';
import { catalog } from '../../shared/data/catalog';
import { sessionStore } from '../../shared/session/sessionStore';
import { count, fileSize } from '../../shared/format/format';

@Component({
  selector: 'app-templates',
  imports: [ButtonModule, LucideArrowRight, LucideFileText, LucidePlus, LucideSparkles],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Templates</h1>
        <p>Predefined documents to start from, plus any you create in this tab. Pick one to open it in Prepare and Design and place its fields.</p>
      </header>
      <div class="card-grid">
        <button type="button" class="card-link template-create" (click)="go('/new?mode=template')">
          <div class="e-card app-card action-card">
            <div class="e-card-content">
              <span class="action-icon" aria-hidden="true"><svg lucidePlus [size]="18"></svg></span>
              <span class="action-title">Create template<svg lucideArrowRight [size]="16" aria-hidden="true"></svg></span>
              <p class="action-desc">Upload a PDF or pick a starter, add signer roles, then design its fields.</p>
            </div>
          </div>
        </button>
        @for (doc of created; track doc.id) {
          <section class="e-card app-card" [attr.aria-labelledby]="'tpl-' + doc.id">
            <div class="e-card-header"><div class="e-card-header-caption">
              <span class="eyebrow" style="margin: 0"><svg lucideSparkles [size]="12" aria-hidden="true"></svg> Created in this tab</span>
              <h2 class="e-card-header-title" [id]="'tpl-' + doc.id">{{ doc.name }}</h2>
            </div></div>
            <div class="e-card-content">
              <p class="action-desc">Your template: reopen it to place or edit its fields.</p>
              <p class="page-note">{{ count(doc.pages) }} page{{ doc.pages === 1 ? '' : 's' }} · {{ fileSize(doc.sizeBytes) }}</p>
            </div>
            <div class="e-card-actions">
              <button ejs-button cssClass="e-outline app-btn" (click)="go('/prepare/' + doc.id)" [attr.aria-label]="'Use template: ' + doc.name">Use template<svg lucideArrowRight [size]="14" aria-hidden="true"></svg></button>
            </div>
          </section>
        }
        @for (t of templates; track t.id) {
          <section class="e-card app-card" [attr.aria-labelledby]="'tpl-' + t.id">
            <div class="e-card-header"><div class="e-card-header-caption">
              <span class="eyebrow" style="margin: 0"><svg lucideFileText [size]="12" aria-hidden="true"></svg> {{ t.category }}</span>
              <h2 class="e-card-header-title" [id]="'tpl-' + t.id">{{ t.name }}</h2>
            </div></div>
            <div class="e-card-content">
              <p class="action-desc">{{ t.description }}</p>
              <p class="page-note">Suggested fields: {{ t.suggestedFields }}</p>
            </div>
            <div class="e-card-actions">
              <button ejs-button cssClass="e-outline app-btn" (click)="go('/prepare/' + t.documentId)" [attr.aria-label]="'Use template: ' + t.name">Use template<svg lucideArrowRight [size]="14" aria-hidden="true"></svg></button>
            </div>
          </section>
        }
      </div>
    </div>`,
})
export class TemplatesComponent {
  private readonly router = inject(Router);
  protected readonly created = sessionStore.listDocuments('template');
  protected readonly templates = catalog.templates;
  protected readonly count = count;
  protected readonly fileSize = fileSize;
  protected go(url: string): void { void this.router.navigateByUrl(url); }
}
