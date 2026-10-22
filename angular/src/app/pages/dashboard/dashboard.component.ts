// Dashboard (port of DashboardPage.tsx).
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowRight, LucideFilePlusCorner, LucideFileText, LucideLayoutTemplate, LucideUsers } from '@lucide/angular';
import { catalog } from '../../shared/data/catalog';
import { nextStepHref } from '../../shared/domain/rules';
import { sessionStore } from '../../shared/session/sessionStore';
import { count } from '../../shared/format/format';
import { StatusBadgeComponent } from '../../shared/ui/badges.component';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, StatusBadgeComponent, LucideArrowRight, LucideFilePlusCorner, LucideFileText, LucideLayoutTemplate, LucideUsers],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="eyebrow">SignFlow workspace</div>
        <h1>Prepare, place fields, and send for signature</h1>
        <p>Upload a document or start from a template, add recipients, drag fields onto the page, and sign. Everything stays in this browser tab; nothing is uploaded.</p>
      </header>
      <div class="card-grid">
        @for (a of actions; track a.to) {
          <a [routerLink]="a.to" class="card-link">
            <div class="e-card app-card action-card">
              <div class="e-card-content">
                <span class="action-icon" aria-hidden="true">
                  @switch (a.icon) {
                    @case ('new') { <svg lucideFilePlusCorner [size]="18"></svg> }
                    @case ('templates') { <svg lucideLayoutTemplate [size]="18"></svg> }
                    @default { <svg lucideFileText [size]="18"></svg> }
                  }
                </span>
                <span class="action-title">{{ a.title }}<svg lucideArrowRight [size]="16" aria-hidden="true"></svg></span>
                <p class="action-desc">{{ a.desc }}</p>
              </div>
            </div>
          </a>
        }
      </div>
      <div class="card-grid">
        @for (k of counts; track k.title) {
          <div class="e-card app-card kpi-card">
            <div class="kpi-title">{{ k.title }}</div>
            <div class="kpi-value">{{ k.value }}</div>
            <div class="kpi-note">{{ k.note }}</div>
            <span class="kpi-icon" aria-hidden="true">
              @switch (k.icon) {
                @case ('templates') { <svg lucideLayoutTemplate [size]="18"></svg> }
                @case ('docs') { <svg lucideFileText [size]="18"></svg> }
                @default { <svg lucideUsers [size]="18"></svg> }
              }
            </span>
          </div>
        }
      </div>
      <section class="e-card app-card" aria-labelledby="activity-title">
        <div class="e-card-header"><div class="e-card-header-caption">
          <h2 class="e-card-header-title" id="activity-title">Sample activity</h2>
          <div class="e-card-sub-title">Open a document to continue where it stands.</div>
        </div></div>
        <div class="e-card-content">
          <ul class="activity-list">
            @for (d of documents; track d.id) {
              <li>
                <a class="activity-row" [routerLink]="d.href">
                  <span class="activity-icon" aria-hidden="true"><svg lucideFileText [size]="15"></svg></span>
                  <span class="activity-name">{{ d.name }}</span>
                  <app-status-badge [status]="d.status" />
                  <svg lucideArrowRight [size]="15" class="activity-arrow" aria-hidden="true"></svg>
                </a>
              </li>
            }
          </ul>
        </div>
      </section>
    </div>`,
})
export class DashboardComponent {
  protected readonly actions = [
    { to: '/new', icon: 'new', title: 'Create new document', desc: 'Upload a PDF or pick a starter, add recipients, place fields and send.' },
    { to: '/templates', icon: 'templates', title: 'Browse templates', desc: 'Start from a reusable template, or create a new one.' },
    { to: '/documents', icon: 'docs', title: 'View documents', desc: 'See every document and where it stands.' },
  ];
  // The count matches the Templates page: predefined plus created in this tab (app-plan.md, Metric definitions).
  protected readonly counts = [
    { title: 'Templates available', value: count(catalog.templates.length + sessionStore.listDocuments('template').length), note: 'Predefined and created in this tab', icon: 'templates' },
    { title: 'Sample documents', value: count(catalog.documents.length), note: 'Ready to prepare or sign', icon: 'docs' },
    { title: 'Recipients configured', value: count(catalog.recipients.length), note: 'Default signers for new documents', icon: 'users' },
  ];
  protected readonly documents = catalog.documents.map((d) => ({ ...d, href: nextStepHref(catalog, d) }));
}
