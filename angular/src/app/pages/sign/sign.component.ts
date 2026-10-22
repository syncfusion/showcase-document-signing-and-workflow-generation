// Sign (port of SignPage.tsx): complete the fields, Submit seals through the shared sealDocument(), Download.
import { Component, DestroyRef, ViewChild, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { LucideCheck, LucideDownload, LucideListChecks, LucidePenLine, LucideTriangleAlert, LucideType } from '@lucide/angular';
import { catalog } from '../../shared/data/catalog';
import { completion, isFieldFilled, recipientsOf, resolveDocument, safeFileName, sampleById, type LiveField } from '../../shared/domain/rules';
import type { PreparedDoc } from '../../shared/domain/types';
import { sessionStore } from '../../shared/session/sessionStore';
import { assetUrl } from '../../shared/assets';
import { downloadUrl } from '../../shared/download';
import { sealDocument, type SealedDocument } from '../../shared/signing/sealDocument';
import { toArrayBuffer } from '../../shared/signing/secureSign';
import { mediaQuery } from '../../state/media';
import { LoadingComponent } from '../../shared/ui/loading.component';
import { DocumentNotFoundComponent, MobileSheetComponent, WorkspaceBarComponent } from '../../shared/ui/workspace.component';
import { SignatureReportComponent } from '../../shared/ui/signature-report.component';
import { ValidationBadgeComponent } from '../../shared/ui/badges.component';
import { SignerViewerComponent } from '../../viewer/signer-viewer.component';

/** The first ready-to-sign sample opens when no id is given (app-plan.md, routes). */
const DEFAULT_ID = catalog.samples.find((s) => s.status === 'Ready to sign')?.id;

function samplePrepared(id: string): PreparedDoc | null {
  const s = sampleById(catalog, id);
  if (!s || s.status !== 'Ready to sign') return null;
  return { documentId: s.id, fields: s.fields, recipients: recipientsOf(catalog, s.recipientIds), preparedAt: s.preparedAt };
}
interface Sealed extends SealedDocument { url: string; fileName: string }

@Component({
  selector: 'app-sign',
  imports: [NgTemplateOutlet, ButtonModule, LoadingComponent, DocumentNotFoundComponent, MobileSheetComponent, WorkspaceBarComponent, SignatureReportComponent,
    ValidationBadgeComponent, SignerViewerComponent, LucideCheck, LucideDownload, LucideListChecks, LucidePenLine, LucideTriangleAlert, LucideType],
  template: `
    @if (doc(); as doc) {
      <div class="workspace">
        <app-workspace-bar [title]="doc.name" [meta]="(sealed() ? 'Signed and digitally sealed · ' : 'Waiting for your signature · ') + signer().name">
          @if (sealed(); as s) { <app-validation-badge [validation]="s.validation" /> }
          @else {
            <span class="progress-text" role="status" aria-live="polite">
              @if (error()) { <span class="error-text">Signing failed: {{ error() }}. Your fields are unchanged; try Submit again.</span> }
              @else { {{ progress().done }} of {{ progress().total }} fields completed }
            </span>
            <button ejs-button cssClass="e-primary" [disabled]="!loaded() || !progress().complete || submitting()" (click)="submit()">{{ submitting() ? 'Signing securely…' : 'Submit' }}</button>
          }
          <button ejs-button [cssClass]="'app-btn ' + (sealed() ? 'e-primary' : 'e-outline')" [disabled]="!sealed()" (click)="download()"
            [title]="sealed() ? 'Download ' + sealed()!.fileName : 'Available after you submit'"><svg lucideDownload [size]="15" aria-hidden="true"></svg> Download</button>
        </app-workspace-bar>
        <div class="workspace-body">
          <div class="viewer-area" [class.loading]="!loaded()">
            @if (!failed()) {
              @for (key of attempts(); track key) {
                @defer (on immediate) {
                  <app-signer-viewer #viewer [documentUrl]="url()" [fields]="prepared()?.fields ?? []"
                    (loaded)="onLoaded()" (loadFailed)="failed.set(true)" (fieldsChanged)="fields.set($event)" />
                }
              }
            }
            @if (!loaded() && !failed()) { <app-loading variant="overlay" label="Loading document…" /> }
            @if (failed()) {
              <div class="viewer-error" role="alert">
                <svg lucideTriangleAlert [size]="28" aria-hidden="true"></svg>
                <p>We couldn't open {{ doc.name }}.</p>
                <button ejs-button cssClass="e-primary" (click)="retry()">Try again</button>
              </div>
            }
          </div>
          @if (!narrow()) {
            <aside class="side-panel" [attr.aria-label]="sealed() ? 'Validation and audit log' : 'Fields to complete'">
              <ng-container *ngTemplateOutlet="panel" />
            </aside>
          }
        </div>
        @if (narrow()) {
          <div class="mobile-bar">
            <button ejs-button cssClass="e-outline app-btn" (click)="sheetOpen.set(true)"><svg lucideListChecks [size]="16" aria-hidden="true"></svg>
              {{ sealed() ? 'Validation and audit log' : 'Fields to complete (' + progress().done + '/' + progress().total + ')' }}</button>
          </div>
          <app-mobile-sheet [open]="sheetOpen()" [title]="sealed() ? 'Validation and audit log' : 'Fields to complete'" (closed)="sheetOpen.set(false)">
            <ng-container *ngTemplateOutlet="panel" />
          </app-mobile-sheet>
        }
      </div>
      <ng-template #panel>
        @if (sealed(); as s) {
          <app-signature-report [validation]="s.validation" [audit]="s.audit" [sha256]="s.sha256" />
        } @else {
          <h2 class="panel-eyebrow">Fields to complete</h2>
          <ul class="field-list">
            @for (f of actionable(); track f.name) {
              <li>
                <button type="button" [class]="'field-item' + (filled(f) ? ' is-done' : '')" (click)="focus(f.name)">
                  <span class="field-dot" aria-hidden="true">@if (filled(f)) { <svg lucideCheck [size]="11"></svg> }</span>
                  @if (isSig(f)) { <svg lucidePenLine [size]="14" aria-hidden="true"></svg> } @else { <svg lucideType [size]="14" aria-hidden="true"></svg> }
                  <span>{{ f.name }}</span>
                  <span class="sr-only">{{ filled(f) ? ', completed' : ', to do' }}</span>
                  @if (f.isRequired) { <span class="field-req">Required</span> }
                </button>
              </li>
            }
          </ul>
          <p class="field-hint">Choose a field to jump to it. In the signature dialog, Type and Upload work without drawing.</p>
        }
      </ng-template>
    } @else {
      <app-document-not-found />
    }`,
  host: { style: 'display: contents' },
})
export class SignComponent {
  readonly documentId = input<string>();
  @ViewChild('viewer') private viewer?: SignerViewerComponent;

  private readonly id = computed(() => this.documentId() ?? DEFAULT_ID);
  protected readonly doc = computed(() => resolveDocument(catalog, this.id(), (id) => sessionStore.getDocument(id)));
  /** A document sent from Prepare in this tab wins; a Ready-to-sign sample falls back to its seed. */
  protected readonly prepared = computed(() => { const id = this.id(); return id ? sessionStore.getPrepared(id) ?? samplePrepared(id) : null; });
  protected readonly signer = computed(() => this.prepared()?.recipients[0] ?? catalog.recipients[0]);
  protected readonly url = computed(() => assetUrl(this.doc()?.path ?? ''));
  protected readonly fields = signal<LiveField[]>([]);
  protected readonly progress = computed(() => completion(this.fields()));
  protected readonly actionable = computed(() => this.fields().filter((f) => !f.isReadOnly));
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly attempts = signal([0]);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sealed = signal<Sealed | null>(null);
  protected readonly sheetOpen = signal(false);
  protected readonly narrow = mediaQuery('(max-width: 1023.98px)');
  private openedAt: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { const s = this.sealed(); if (s) URL.revokeObjectURL(s.url); });
  }

  protected filled = isFieldFilled;
  protected isSig = (f: LiveField) => /signature|initial/i.test(`${f.name} ${f.type ?? ''}`);
  protected focus(name: string): void { this.viewer?.focusField(name); this.sheetOpen.set(false); }
  protected onLoaded(): void { this.loaded.set(true); this.openedAt ??= new Date().toISOString(); }
  protected retry(): void { this.failed.set(false); this.loaded.set(false); this.attempts.update((a) => [a[0] + 1]); }

  protected async submit(): Promise<void> {
    const viewer = this.viewer, doc = this.doc();
    if (!viewer || !doc) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      viewer.clearChrome();
      await new Promise((r) => setTimeout(r, 200));
      const savedBlob = await viewer.saveAsBlob();
      if (!savedBlob) throw new Error('The viewer could not export the document.');
      const result = await sealDocument({ savedBlob, documentName: doc.name, signer: this.signer(), prepared: this.prepared(), openedAt: this.openedAt, completed: this.progress() });
      const url = URL.createObjectURL(new Blob([toArrayBuffer(result.bytes)], { type: 'application/pdf' }));
      this.sealed.set({ ...result, url, fileName: safeFileName(doc.name) });
      viewer.load(url);
    } catch (err) {
      console.error('Sealing failed', err);
      this.error.set(err instanceof Error ? err.message : 'Signing failed');
    } finally {
      this.submitting.set(false);
    }
  }
  protected download(): void { const s = this.sealed(); if (s) downloadUrl(s.url, s.fileName); }
}
