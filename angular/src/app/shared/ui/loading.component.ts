import { Component, input } from '@angular/core';

/** The one loading indicator (port of the reference's LoadingState): `screen`, `overlay` or in-page. Styles in index.html. */
@Component({
  selector: 'app-loading',
  template: `
    <div [class]="'app-loading' + (variant() === 'page' ? '' : ' app-loading--' + variant())" role="status" aria-live="polite">
      <div class="app-loading__ring" aria-hidden="true"></div>
      <div>{{ label() }}</div>
    </div>`,
  host: { style: 'display: contents' },
})
export class LoadingComponent {
  readonly label = input.required<string>();
  readonly variant = input<'screen' | 'overlay' | 'page'>('page');
}
