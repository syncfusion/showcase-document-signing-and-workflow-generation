// Top bar for Dashboard, Documents and Templates (port of Shell.tsx; app-plan.md, D2). Below 640px links keep icons and names.
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppBarModule } from '@syncfusion/ej2-angular-navigations';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { LucideFileText, LucideLayoutDashboard, LucideLayoutTemplate, LucideMoon, LucideSun } from '@lucide/angular';
import { ThemeService } from '../state/theme.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppBarModule, ButtonModule, LucideFileText, LucideLayoutDashboard, LucideLayoutTemplate, LucideMoon, LucideSun],
  template: `
    <div class="app-shell">
      <ejs-appbar colorMode="Inherit" cssClass="app-topbar">
        <a routerLink="/" class="app-brand" aria-label="SignFlow dashboard">
          <span class="app-brand-mark" aria-hidden="true">S</span><span>SignFlow</span>
        </a>
        <nav aria-label="Main">
          <ul class="app-nav" (keydown)="onNavKey($event)">
            <li><a routerLink="/" routerLinkActive #d="routerLinkActive" [routerLinkActiveOptions]="{ exact: true }" [attr.aria-current]="d.isActive ? 'page' : null" title="Dashboard"><svg lucideLayoutDashboard [size]="16" aria-hidden="true"></svg><span>Dashboard</span></a></li>
            <li><a routerLink="/documents" routerLinkActive #o="routerLinkActive" [attr.aria-current]="o.isActive ? 'page' : null" title="Documents"><svg lucideFileText [size]="16" aria-hidden="true"></svg><span>Documents</span></a></li>
            <li><a routerLink="/templates" routerLinkActive #t="routerLinkActive" [attr.aria-current]="t.isActive ? 'page' : null" title="Templates"><svg lucideLayoutTemplate [size]="16" aria-hidden="true"></svg><span>Templates</span></a></li>
          </ul>
        </nav>
        <div class="app-topbar-spacer"></div>
        <button ejs-button cssClass="e-flat icon-btn" (click)="theme.toggle()" [attr.aria-label]="label()" [title]="label()">
          @if (theme.theme() === 'dark') { <svg lucideSun [size]="18" aria-hidden="true"></svg> } @else { <svg lucideMoon [size]="18" aria-hidden="true"></svg> }
        </button>
      </ejs-appbar>
      <main class="app-main" id="main"><router-outlet /></main>
    </div>`,
  host: { style: 'display: contents' },
})
export class ShellComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly label = computed(() => `Switch to ${this.theme.theme() === 'dark' ? 'light' : 'dark'} theme`);
  /** Left/right arrows move between the top-bar links (navigation-placement.md, top pattern). */
  protected onNavKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const links = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLAnchorElement>('a'));
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault();
    links[(i + (e.key === 'ArrowRight' ? 1 : links.length - 1)) % links.length].focus();
  }
}
