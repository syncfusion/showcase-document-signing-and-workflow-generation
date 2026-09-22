const docSigningMountPath = '/Doc-signing-and-workflow/react';

/**
 * Keep one build usable both through the GCP vanity path and directly
 * from the Azure App Service root.
 *
 * Note: `/Doc-signing-and-workflow/` (no `/react` suffix) is a separate
 * landing page served by a different service. This React app is mounted
 * only under `/Doc-signing-and-workflow/react/`.
 */
export function getPublicBasePath(pathname = window.location.pathname) {
  return pathname === docSigningMountPath ||
    pathname.startsWith(`${docSigningMountPath}/`)
    ? docSigningMountPath
    : '/';
}

/**
 * Same as `getPublicBasePath` but returns an empty string at the Azure root
 * (instead of `/`). Use this when concatenating with an already-rooted asset
 * path, e.g. `window.location.origin + getAssetBasePath() + '/documents/x.pdf'`,
 * so you don't produce a `//` double-slash when the app is served from the root.
 */
export function getAssetBasePath(pathname = window.location.pathname) {
  const base = getPublicBasePath(pathname);
  return base === '/' ? '' : base;
}
