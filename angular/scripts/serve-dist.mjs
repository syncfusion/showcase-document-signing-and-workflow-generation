// Check helper only (not a hosting server; the port is source-only): serves the production build in
// dist/doc-signing-and-workflow/browser with an index.html fallback, so the browser check and the parity
// journeys run against built files. Usage: PORT=5180 node scripts/serve-dist.mjs
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist', 'doc-signing-and-workflow', 'browser');
const port = Number(process.env.PORT ?? 5180);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.wasm': 'application/wasm', '.pfx': 'application/x-pkcs12', '.cer': 'application/pkix-cert',
  '.crl': 'application/pkix-crl', '.key': 'application/octet-stream',
};

createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  let file = resolve(root, '.' + normalize(pathname));
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) {
    // A missing file with an extension is a 404; a route without one gets the app.
    if (extname(pathname)) { res.writeHead(404).end(); return; }
    file = join(root, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} on http://127.0.0.1:${port}/`));
