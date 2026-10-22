// Light or dark, kept in localStorage under the reference's key (design/DESIGN.md). index.html applies the stored
// choice before Angular starts; this service owns it after.
import { Injectable, signal } from '@angular/core';
import { THEME_KEY } from '../shared/session/sessionStore';

export type Theme = 'light' | 'dark';
declare global { interface Window { __sfThemeReady?: boolean } }

function apply(theme: Theme): void {
  const root = document.documentElement;
  root.dataset['theme'] = theme;
  // The Tailwind 3 bundle carries both themes; its dark variables are scoped to .e-dark-mode.
  root.classList.toggle('e-dark-mode', theme === 'dark');
}
const themeLink = () => document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="tailwind3.css"]');

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light');
  /** True once the theme stylesheet's load (or error) event fired; index.html records an early load on window. */
  readonly ready = signal(!themeLink() || window.__sfThemeReady === true);

  constructor() {
    apply(this.theme());
    if (!this.ready()) {
      const link = themeLink();
      const done = () => this.ready.set(true);
      link?.addEventListener('load', done, { once: true });
      link?.addEventListener('error', done, { once: true });
      if (window.__sfThemeReady) done();
    }
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable: the choice lasts until a reload */ }
    this.theme.set(next);
    apply(next);
  }
}
