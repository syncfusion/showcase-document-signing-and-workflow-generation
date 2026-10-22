// Completed (port of CompletedPage.tsx): the shipped pre-signed sample, re-validated live in the browser, with the
// audit log recorded when it was signed and its fingerprint compared.
import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { LucideDownload, LucideListChecks, LucideTriangleAlert } from '@lucide/angular';
import { catalog } from '../../shared/data/catalog';
import { completedFor } from '../../shared/domain/rules';
import type { CompletedSampleAudit } from '../../shared/domain/types';
import { assetUrl } from '../../shared/assets';
import { downloadUrl } from '../../shared/download';
import { auditTime } from '../../shared/format/format';
import { sha256Hex, toArrayBuffer, validateSignedPdf, type SignatureValidation } from '../../shared/signing/secureSign';
import { mediaQuery } from '../../state/media';
import { LoadingComponent } from '../../shared/ui/loading.component';
import { DocumentNotFoundComponent, MobileSheetComponent, WorkspaceBarComponent } from '../../shared/ui/workspace.component';
import { SignatureReportComponent } from '../../shared/ui/signature-report.component';
import { ValidationBadgeComponent } from '../../shared/ui/badges.component';
import { ReviewerViewerComponent } from '../../viewer/reviewer-viewer.component';

const DEFAULT_ID = catalog.completedSamples[0]?.documentId;
interface Loaded { url: string; fileName: string; sha256: string; validation: SignatureValidation; audit: CompletedSampleAudit }

@Component({
  selector: 'app-completed',
  imports: [NgTemplateOutlet, ButtonModule, LoadingComponent, DocumentNotFoundComponent, MobileSheetComponent, WorkspaceBarComponent,
    SignatureReportComponent, ValidationBadgeComponent, ReviewerViewerComponent, LucideDownload, LucideListChecks, LucideTriangleAlert],
  template: `
    @if (doc(); as doc) {
      <div class="workspace">
        <app-workspace-bar [title]="loaded()?.audit?.documentName ?? doc.name" [meta]="loaded() ? 'Signed by ' + loaded()!.audit.signerName + ' · ' + time(loaded()!.audit.signedAt) : 'Completed'">
          @if (loaded(); as l) { <app-validation-badge [validation]="l.validation" /> }
          <button ejs-button cssClass="e-primary app-btn" [disabled]="!loaded()" (click)="download()" [title]="loaded() ? 'Download ' + loaded()!.fileName : ''"><svg lucideDownload [size]="15" aria-hidden="true"></svg> Download</button>
        </app-workspace-bar>
        <div class="workspace-body">
          <div class="viewer-area" [class.loading]="!viewerReady()">
            @if (loaded(); as l) {
              @if (!failure()) {
                @defer (on immediate) {
                  <app-reviewer-viewer [documentUrl]="l.url" (loaded)="viewerReady.set(true)" (loadFailed)="error.set('The signed copy could not be opened.')" />
                }
              }
            }
            @if (!viewerReady() && !failure()) { <app-loading variant="overlay" label="Validating the signed copy…" /> }
            @if (failure()) {
              <div class="viewer-error" role="alert">
                <svg lucideTriangleAlert [size]="28" aria-hidden="true"></svg>
                <p>{{ failure() }}</p>
                @if (sample()) { <button ejs-button cssClass="e-primary" (click)="retry()">Try again</button> }
              </div>
            }
          </div>
          @if (!narrow() && loaded()) { <aside class="side-panel" aria-label="Validation and audit log"><ng-container *ngTemplateOutlet="report" /></aside> }
        </div>
        @if (narrow() && loaded()) {
          <div class="mobile-bar">
            <button ejs-button cssClass="e-outline app-btn" (click)="sheetOpen.set(true)"><svg lucideListChecks [size]="16" aria-hidden="true"></svg> Validation and audit log</button>
          </div>
          <app-mobile-sheet [open]="sheetOpen()" title="Validation and audit log" (closed)="sheetOpen.set(false)"><ng-container *ngTemplateOutlet="report" /></app-mobile-sheet>
        }
      </div>
      <ng-template #report>
        @if (loaded(); as l) { <app-signature-report [validation]="l.validation" [audit]="l.audit.entries" [sha256]="l.sha256" [recordedSha256]="l.audit.sha256" /> }
      </ng-template>
    } @else {
      <app-document-not-found />
    }`,
  host: { style: 'display: contents' },
})
export class CompletedComponent {
  readonly documentId = input<string>();
  private readonly id = computed(() => this.documentId() ?? DEFAULT_ID);
  protected readonly doc = computed(() => catalog.documents.find((d) => d.id === this.id()) ?? null);
  protected readonly sample = computed(() => completedFor(catalog, this.id()));
  protected readonly loaded = signal<Loaded | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly viewerReady = signal(false);
  protected readonly sheetOpen = signal(false);
  private readonly attempt = signal(0);
  protected readonly narrow = mediaQuery('(max-width: 1023.98px)');
  protected readonly failure = computed(() => (this.doc() && !this.sample() ? 'This document has no signed copy yet.' : this.error()));
  protected readonly time = auditTime;

  constructor() {
    let url: string | null = null;
    effect((onCleanup) => {
      const sample = this.sample();
      this.attempt();
      document.title = `${this.doc()?.name ?? 'Completed'} · SignFlow`;
      if (!sample) return;
      let cancelled = false;
      onCleanup(() => { cancelled = true; });
      (async () => {
        try {
          const [pdfRes, auditRes] = await Promise.all([fetch(assetUrl(sample.pdfPath)), fetch(assetUrl(sample.auditPath))]);
          if (!pdfRes.ok || !auditRes.ok) throw new Error('The signed copy could not be loaded.');
          const bytes = new Uint8Array(await pdfRes.arrayBuffer());
          const audit = (await auditRes.json()) as CompletedSampleAudit;
          const [sha256, validation] = await Promise.all([sha256Hex(bytes), validateSignedPdf(bytes)]);
          if (cancelled) return;
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' }));
          this.loaded.set({ url, fileName: `${audit.documentName}.pdf`, sha256, validation, audit });
        } catch (err) {
          if (!cancelled) this.error.set(err instanceof Error ? err.message : 'The signed copy could not be loaded.');
        }
      })();
    });
    inject(DestroyRef).onDestroy(() => { if (url) URL.revokeObjectURL(url); });
  }

  protected retry(): void { this.error.set(null); this.loaded.set(null); this.viewerReady.set(false); this.attempt.update((n) => n + 1); }
  protected download(): void { const l = this.loaded(); if (l) downloadUrl(l.url, l.fileName); }
}
