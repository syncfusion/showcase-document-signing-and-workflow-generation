// Signature validation and audit log (port of SignatureReport.tsx), shared by Sign and Completed.
import { Component, input } from '@angular/core';
import { LucideCheck, LucideMinus, LucideX } from '@lucide/angular';
import type { CheckResult, SignatureValidation } from '../signing/secureSign';
import type { AuditEntry } from '../domain/types';
import { auditTime } from '../format/format';
import { ValidationBadgeComponent } from './badges.component';

@Component({
  selector: 'app-signature-report',
  imports: [ValidationBadgeComponent, LucideCheck, LucideMinus, LucideX],
  template: `
    <div class="report">
      <section aria-labelledby="validation-title">
        <h2 class="panel-eyebrow" id="validation-title">Signature validation</h2>
        <app-validation-badge [validation]="validation()" />
        <ul class="check-list" style="margin-top: var(--sf-space-3)">
          @for (row of rows(); track row.label) {
            <li [class]="'check-row tone-' + tone(row.check)">
              <span class="check-icon" aria-hidden="true">
                @if (row.check.ok === true) { <svg lucideCheck [size]="11"></svg> } @else if (row.check.ok === false) { <svg lucideX [size]="11"></svg> } @else { <svg lucideMinus [size]="11"></svg> }
              </span>
              <span><strong>{{ row.label }}</strong><span class="sr-only">: {{ state(row.check) }}.</span><span class="check-detail">{{ row.check.detail }}</span></span>
            </li>
          }
        </ul>
      </section>
      @if (validation().trustNote) { <p class="trust-note">{{ validation().trustNote }}</p> }
      <section aria-labelledby="audit-title">
        <h2 class="panel-eyebrow" id="audit-title">Audit log</h2>
        <ol class="audit-list">
          @for (e of audit(); track $index) {
            <li class="audit-entry">
              <span class="audit-action">{{ e.action }}</span>
              <span class="audit-actor">{{ e.actor }}{{ e.email ? ' · ' + e.email : '' }}</span>
              <time class="audit-time" [attr.datetime]="e.at" [title]="e.at">{{ time(e.at) }}</time>
              @if (e.detail) { <span class="audit-detail">{{ e.detail }}</span> }
            </li>
          }
        </ol>
      </section>
      <div class="fingerprint">
        <span class="panel-eyebrow" style="margin: 0">Document SHA-256</span>
        <code>{{ sha256() }}</code>
        @if (recordedSha256()) {
          @if (recordedSha256() === sha256()) { <span class="tone-success">Matches the fingerprint recorded at signing</span> }
          @else { <span class="tone-danger">Differs from the fingerprint recorded at signing ({{ recordedSha256()!.slice(0, 12) }}…)</span> }
        }
      </div>
    </div>`,
})
export class SignatureReportComponent {
  readonly validation = input.required<SignatureValidation>();
  readonly audit = input.required<AuditEntry[]>();
  readonly sha256 = input.required<string>();
  readonly recordedSha256 = input<string | undefined>(undefined);
  protected rows() {
    const v = this.validation();
    return [
      { label: 'Document integrity', check: v.integrity }, { label: 'Cryptographic signature', check: v.signature },
      { label: 'Signer identity and trust', check: v.identity }, { label: 'Timestamp', check: v.timestamp }, { label: 'Revocation', check: v.revocation },
    ];
  }
  protected tone = (c: CheckResult) => (c.ok === true ? 'success' : c.ok === false ? 'danger' : 'neutral');
  protected state = (c: CheckResult) => (c.ok === true ? 'passed' : c.ok === false ? 'failed' : 'not checked');
  protected time = auditTime;
}
