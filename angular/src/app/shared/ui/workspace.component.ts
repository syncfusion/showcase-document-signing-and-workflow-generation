// Workspace bar, "document not found" state and the phone bottom sheet (ports of Workspace.tsx and MobileSheet.tsx).
import { Component, DestroyRef, ElementRef, effect, inject, input, output, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { LucideArrowLeft, LucideFileQuestionMark, LucideX } from '@lucide/angular';

/** Back link, page heading with one line of meta, then the page's actions (projected). */
@Component({
  selector: 'app-workspace-bar',
  imports: [RouterLink, LucideArrowLeft],
  template: `
    <header class="workspace-bar">
      <a routerLink="/" class="e-btn e-flat icon-btn" aria-label="Back to dashboard" title="Back to dashboard"><svg lucideArrowLeft [size]="18" aria-hidden="true"></svg></a>
      <div class="workspace-title">
        <h1>{{ title() }}</h1>
        @if (meta()) { <div class="workspace-meta">{{ meta() }}</div> }
      </div>
      <div class="workspace-actions"><ng-content /></div>
    </header>`,
  host: { style: 'display: contents' },
})
export class WorkspaceBarComponent {
  readonly title = input.required<string>();
  readonly meta = input<string>('');
}

@Component({
  selector: 'app-document-not-found',
  imports: [RouterLink, WorkspaceBarComponent, LucideFileQuestionMark],
  template: `
    <div class="workspace">
      <app-workspace-bar title="Document not found" />
      <div class="state error" role="alert">
        <svg lucideFileQuestionMark [size]="28" aria-hidden="true"></svg>
        <p class="state-title">This document isn't in the sample set</p>
        <p>It may have been an upload from an earlier tab. <a routerLink="/documents">Go to Documents</a></p>
      </div>
    </div>`,
  host: { style: 'display: contents' },
})
export class DocumentNotFoundComponent {}

/** Modal bottom sheet: Escape closes, focus moves in and returns to the opener. */
@Component({
  selector: 'app-mobile-sheet',
  imports: [ButtonModule, LucideX],
  template: `
    @if (open()) {
      <div class="sheet-backdrop" (click)="closed.emit()">
        <div #sheet class="sheet" role="dialog" aria-modal="true" [attr.aria-label]="title()" tabindex="-1" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2>{{ title() }}</h2>
            <button ejs-button cssClass="e-flat icon-btn" (click)="closed.emit()" [attr.aria-label]="'Close ' + title()"><svg lucideX [size]="18" aria-hidden="true"></svg></button>
          </div>
          <ng-content />
        </div>
      </div>
    }`,
  host: { style: 'display: contents' },
})
export class MobileSheetComponent {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly closed = output<void>();
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');
  private opener: HTMLElement | null = null;

  constructor() {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && this.open()) this.closed.emit(); };
    window.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('keydown', onKey));
    effect(() => {
      if (this.open()) {
        this.opener = document.activeElement as HTMLElement | null;
        queueMicrotask(() => this.sheet()?.nativeElement.focus());
      } else if (this.opener) { this.opener.focus(); this.opener = null; }
    });
  }
}
