import { DestroyRef, inject, signal } from '@angular/core';

/** A signal that follows a media query (side panels become sheets below 1024px). Call in an injection context. */
export function mediaQuery(query: string) {
  const list = window.matchMedia(query);
  const matches = signal(list.matches);
  const onChange = () => matches.set(list.matches);
  list.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => list.removeEventListener('change', onChange));
  return matches.asReadonly();
}
