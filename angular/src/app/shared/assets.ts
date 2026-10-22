// Absolute URL of a file under public/. The port is source-only and runs at '/', so there is no publish prefix
// (publishing-base-path.md, "Non-React platforms"). blob:, data: and http(s): URLs pass through unchanged.
export function assetUrl(path: string): string {
  if (/^(blob:|data:|https?:)/.test(path)) return path;
  return `${window.location.origin}/${path.replace(/^\//, '')}`;
}
