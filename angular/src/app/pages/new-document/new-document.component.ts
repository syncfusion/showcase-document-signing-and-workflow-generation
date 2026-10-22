// New document / New template (port of NewDocumentPage.tsx): choose a PDF (upload or starter) and recipients, then
// continue to Prepare and Design. Uploads stay in this tab as blob: URLs (data-contract.md).
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { LucideArrowRight, LucideCheck, LucideCloudUpload, LucideFileText, LucidePlus, LucideTrash } from '@lucide/angular';
import { catalog } from '../../shared/data/catalog';
import { initialsOf, nextColorSlot } from '../../shared/domain/rules';
import type { DocumentMeta, Recipient, SessionDocument } from '../../shared/domain/types';
import { sessionStore } from '../../shared/session/sessionStore';
import { fileSize } from '../../shared/format/format';
import { WorkspaceBarComponent } from '../../shared/ui/workspace.component';

interface DraftRecipient { id: string; name: string; email: string; role: string; colorSlot: number }
const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

/** Page count of an uploaded PDF, read with the PDF library (loaded only when a file is chosen). */
async function countPages(bytes: Uint8Array): Promise<number | null> {
  try {
    const { PdfDocument } = await import('@syncfusion/ej2-pdf');
    const doc = new PdfDocument(bytes);
    const n = doc.pageCount;
    doc.destroy();
    return n;
  } catch { return null; }
}

@Component({
  selector: 'app-new-document',
  imports: [ButtonModule, TextBoxModule, WorkspaceBarComponent, LucideArrowRight, LucideCheck, LucideCloudUpload, LucideFileText, LucidePlus, LucideTrash],
  template: `
    <div class="workspace">
      <app-workspace-bar [title]="title()" [meta]="mode() === 'template'
        ? 'Create a reusable template: pick a file or a starter, add signer roles, then design its fields.'
        : 'Pick a document, add recipients, then place fields and send for signing.'" />
      <div class="new-body">
        <div class="new-grid">
          <section class="e-card app-card" aria-labelledby="step-1">
            <div class="e-card-header"><div class="e-card-header-caption">
              <h2 class="e-card-header-title" id="step-1"><span class="step-num" aria-hidden="true">1</span> Choose a document</h2>
            </div></div>
            <div class="e-card-content new-step">
              <div [class]="'dropzone' + (dragOver() ? ' is-over' : '')" role="button" tabindex="0" aria-label="Browse for a PDF from your device"
                (click)="fileInput.click()" (keydown.enter)="$event.preventDefault(); fileInput.click()" (keydown.space)="$event.preventDefault(); fileInput.click()"
                (dragover)="$event.preventDefault(); dragOver.set(true)" (dragleave)="dragOver.set(false)" (drop)="onDrop($event)">
                <svg lucideCloudUpload [size]="26" aria-hidden="true"></svg>
                <span class="dropzone-title">{{ reading() ? 'Reading the PDF…' : 'Browse from your device' }}</span>
                <span class="dropzone-hint">Drag a PDF here, or choose to browse. It stays in this tab only.</span>
                <input #fileInput type="file" accept="application/pdf,.pdf" hidden aria-label="PDF file" (change)="onPicked($event)" />
              </div>
              @if (fileError()) { <p class="error-text" role="alert">{{ fileError() }}</p> }
              <div class="divider-label"><span>or start from a predefined document</span></div>
              <div class="starter-list" role="group" aria-label="Predefined documents">
                @for (d of documents; track d.id) {
                  <button type="button" [class]="'starter' + (chosen()?.id === d.id ? ' is-active' : '')" [attr.aria-pressed]="chosen()?.id === d.id" (click)="choose(d)">
                    <svg lucideFileText [size]="16" aria-hidden="true"></svg><span class="starter-name">{{ d.name }}</span>
                    @if (chosen()?.id === d.id) { <svg lucideCheck [size]="15" aria-hidden="true" class="starter-check"></svg> }
                  </button>
                }
              </div>
              @if (chosen(); as c) {
                <p class="chosen" role="status"><svg lucideFileText [size]="15" aria-hidden="true"></svg> Selected: <strong>{{ c.name }}</strong> · {{ c.pages }} page{{ c.pages === 1 ? '' : 's' }} · {{ size(c.sizeBytes) }}</p>
              }
            </div>
          </section>

          <section class="e-card app-card" aria-labelledby="step-2">
            <div class="e-card-header"><div class="e-card-header-caption">
              <h2 class="e-card-header-title" id="step-2"><span class="step-num" aria-hidden="true">2</span> {{ mode() === 'template' ? 'Add signer roles' : 'Add recipients' }}</h2>
            </div></div>
            <div class="e-card-content new-step">
              <ul class="recip-rows">
                @for (r of recipients(); track r.id; let i = $index) {
                  <li class="recip-row" [style.--rc]="'var(--app-recipient-' + r.colorSlot + ')'">
                    <span class="avatar recip-avatar" aria-hidden="true">{{ r.name.trim() ? initials(r.name) : i + 1 }}</span>
                    <ejs-textbox class="recip-name" placeholder="Full name" [value]="r.name" (input)="update(r.id, { name: $any($event).value ?? '' })" [htmlAttributes]="{ 'aria-label': 'Recipient ' + (i + 1) + ' full name' }"></ejs-textbox>
                    <ejs-textbox class="recip-email" placeholder="Email address" type="email" [value]="r.email" (input)="update(r.id, { email: $any($event).value ?? '' })" [htmlAttributes]="{ 'aria-label': 'Recipient ' + (i + 1) + ' email' }"></ejs-textbox>
                    <ejs-textbox class="recip-role" placeholder="Role" [value]="r.role" (input)="update(r.id, { role: $any($event).value ?? '' })" [htmlAttributes]="{ 'aria-label': 'Recipient ' + (i + 1) + ' role' }"></ejs-textbox>
                    <button ejs-button cssClass="e-flat icon-btn" class="recip-remove" [disabled]="recipients().length <= 1" (click)="remove(r.id)" [attr.aria-label]="'Remove recipient ' + (i + 1)" title="Remove recipient"><svg lucideTrash [size]="15" aria-hidden="true"></svg></button>
                  </li>
                }
              </ul>
              <button ejs-button cssClass="e-outline app-btn" (click)="add()"><svg lucidePlus [size]="14" aria-hidden="true"></svg> Add recipient</button>
            </div>
          </section>
        </div>
      </div>
      <footer class="new-footer">
        <span class="progress-text" role="status">{{ canContinue() ? 'Ready: you’ll place fields next.' : 'Choose a document and add at least one recipient.' }}</span>
        <button ejs-button cssClass="e-primary app-btn" [disabled]="!canContinue()" (click)="next()">Continue to design <svg lucideArrowRight [size]="16" aria-hidden="true"></svg></button>
      </footer>
    </div>`,
  host: { style: 'display: contents' },
})
export class NewDocumentComponent {
  /** Query parameter ?mode=template (component input binding). */
  readonly mode = input<string>();
  private readonly router = inject(Router);
  protected readonly kind = computed<SessionDocument['kind']>(() => (this.mode() === 'template' ? 'template' : 'document'));
  protected readonly title = computed(() => (this.kind() === 'template' ? 'New template' : 'New document'));
  protected readonly documents = catalog.documents;
  protected readonly chosen = signal<DocumentMeta | SessionDocument | null>(null);
  protected readonly dragOver = signal(false);
  protected readonly fileError = signal<string | null>(null);
  protected readonly reading = signal(false);
  protected readonly recipients = signal<DraftRecipient[]>(catalog.recipients.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, colorSlot: r.colorSlot })));
  protected readonly named = computed(() => this.recipients().filter((r) => r.name.trim()));
  protected readonly canContinue = computed(() => !!this.chosen() && this.named().length > 0);
  protected readonly initials = initialsOf;
  protected readonly size = fileSize;

  constructor() { queueMicrotask(() => { document.title = `${this.title()} · SignFlow`; }); }

  private async accept(file: File | undefined): Promise<void> {
    if (!file) return;
    this.fileError.set(null);
    if ((file.type && file.type !== 'application/pdf') || !/\.pdf$/i.test(file.name)) { this.fileError.set('Only PDF files can be added.'); return; }
    this.reading.set(true);
    const pages = await countPages(new Uint8Array(await file.arrayBuffer()));
    this.reading.set(false);
    if (pages === null) { this.fileError.set(`${file.name} could not be read as a PDF.`); return; }
    const doc: SessionDocument = { id: newId('upload'), name: file.name.replace(/\.pdf$/i, ''), path: URL.createObjectURL(file), pages, sizeBytes: file.size, kind: this.kind(), createdAt: new Date().toISOString() };
    sessionStore.addDocument(doc);
    this.chosen.set(doc);
  }
  protected onDrop(e: DragEvent): void { e.preventDefault(); this.dragOver.set(false); void this.accept(e.dataTransfer?.files?.[0]); }
  protected onPicked(e: Event): void { const el = e.target as HTMLInputElement; void this.accept(el.files?.[0]); el.value = ''; }
  protected choose(d: DocumentMeta): void { this.chosen.set(d); this.fileError.set(null); }
  protected update(id: string, patch: Partial<DraftRecipient>): void { this.recipients.update((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r))); }
  protected add(): void { this.recipients.update((prev) => [...prev, { id: newId('r'), name: '', email: '', role: 'Signer', colorSlot: nextColorSlot(prev.length) }]); }
  protected remove(id: string): void { this.recipients.update((prev) => prev.filter((r) => r.id !== id)); }
  protected next(): void {
    const chosen = this.chosen();
    if (!chosen) return;
    const list: Recipient[] = this.named().map((r) => ({ id: r.id, name: r.name.trim(), role: r.role.trim() || 'Signer', initials: initialsOf(r.name), email: r.email.trim(), colorSlot: r.colorSlot }));
    // A starter chosen as a template gets its own session copy, so it shows on the Templates page.
    let targetId = chosen.id;
    if (this.kind() === 'template' && !('kind' in chosen && chosen.kind === 'template')) {
      targetId = newId('tpl');
      sessionStore.addDocument({ id: targetId, name: chosen.name, path: chosen.path, pages: chosen.pages, sizeBytes: chosen.sizeBytes, kind: 'template', createdAt: new Date().toISOString() });
    }
    sessionStore.saveDraftSetup({ documentId: targetId, recipients: list });
    void this.router.navigateByUrl(`/prepare/${targetId}`);
  }
}
