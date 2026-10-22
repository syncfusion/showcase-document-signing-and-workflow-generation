import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './state/theme.service';
import { LoadingComponent } from './shared/ui/loading.component';
import { catalogResult } from './shared/data/catalog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingComponent],
  template: `
    <!-- Startup screen until the Syncfusion theme has loaded; the page mounts underneath so its code downloads meanwhile. -->
    @if (!theme.ready()) { <app-loading variant="screen" label="Loading SignFlow…" /> }
    @if (catalog.ok) {
      <router-outlet />
    } @else {
      <div class="state error" role="alert">
        <p class="state-title">The sample catalogue could not be loaded</p>
        <p>{{ catalog.errors.slice(0, 3).join(' ') }}</p>
      </div>
    }`,
  host: { style: 'display: block; height: 100%' },
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly catalog = catalogResult;
}
