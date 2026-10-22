// Status and validation badges: tone plus icon and label (port of the reference's StatusBadge.tsx).
import { Component, computed, input } from '@angular/core';
import { LucideCheck, LucideFilePen, LucidePenLine, LucideShieldAlert, LucideShieldCheck, LucideShieldX } from '@lucide/angular';
import type { DocumentStatus } from '../domain/types';
import type { SignatureValidation } from '../signing/secureSign';

@Component({
  selector: 'app-status-badge',
  imports: [LucideCheck, LucideFilePen, LucidePenLine],
  template: `
    <span [class]="'status-badge tone-' + tone()">
      @switch (status()) {
        @case ('Draft') { <svg lucideFilePen [size]="12" aria-hidden="true"></svg> }
        @case ('Ready to sign') { <svg lucidePenLine [size]="12" aria-hidden="true"></svg> }
        @default { <svg lucideCheck [size]="12" aria-hidden="true"></svg> }
      }
      {{ status() }}
    </span>`,
  host: { style: 'display: contents' },
})
export class StatusBadgeComponent {
  readonly status = input.required<DocumentStatus>();
  protected readonly tone = computed(() => ({ Draft: 'info', 'Ready to sign': 'warning', Completed: 'success' } as const)[this.status()]);
}

@Component({
  selector: 'app-validation-badge',
  imports: [LucideShieldAlert, LucideShieldCheck, LucideShieldX],
  template: `
    <span [class]="'status-badge tone-' + tone()" title="Digital signature validation">
      @switch (validation().status) {
        @case ('valid') { <svg lucideShieldCheck [size]="13" aria-hidden="true"></svg> }
        @case ('invalid') { <svg lucideShieldX [size]="13" aria-hidden="true"></svg> }
        @default { <svg lucideShieldAlert [size]="13" aria-hidden="true"></svg> }
      }
      <span class="sr-only">Signature </span>{{ validation().statusLabel }}
    </span>`,
  host: { style: 'display: contents' },
})
export class ValidationBadgeComponent {
  readonly validation = input.required<Pick<SignatureValidation, 'status' | 'statusLabel'>>();
  protected readonly tone = computed(() => (this.validation().status === 'valid' ? 'success' : this.validation().status === 'invalid' ? 'danger' : 'warning'));
}
