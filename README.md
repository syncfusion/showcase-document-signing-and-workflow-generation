# SignFlow

A working e-signature workflow built with the Syncfusion React PDF Viewer. Prepare documents,
place signature and form fields, sign, and download the flattened PDF — entirely in the browser.
Client-side only, standalone mode, no backend or database. Doubles as an evaluation showcase for
the Syncfusion React EJ2 PDF Viewer SDK.

## Getting started

> Requires Node.js 18+.

```bash
npm install
npm run dev
```

The Vite dev server starts on `http://localhost:5173` and serves the app under
`/Doc-signing-and-workflow/react/` (matching the configured `base` in `vite.config.ts`).

## Features

- **Dashboard** — overview of templates, sample documents, recipients, and recent activity with
  quick links to create a document or template.
- **Documents** — browse documents and their signing status.
- **Templates** — gallery of reusable templates with signer roles and fields.
- **Create flow** (`/new`) — pick an uploaded PDF or a starter document, add recipients, then
  continue to the design step. Supports a `?mode=template` query to start a template instead.
- **Prepare & Design** (`/prepare/:documentId`) — drag signature, initials, drawing, text, date,
  checkbox, radio, dropdown, image, label, and hyperlink fields onto the document and assign each
  to a recipient. Drafts autosave to `sessionStorage`.
- **Sign** (`/sign/:documentId`) — recipient-side view to complete the assigned fields. The signed
  output is produced via `PdfViewer.saveAsBlob()`.
- **Completed** (`/completed`) — signed-document confirmation with an audit trail timeline.
- **Theming** — light/dark mode toggle (persisted to `localStorage`, respects system preference).

The full document-handoff flow (Prepare → Sign → Completed) is wired through an in-memory session
store mirrored to `sessionStorage` so it survives a same-tab refresh. No data leaves the browser.

## Syncfusion license key

This app calls `registerLicense()` at bootstrap ([src/main.tsx](src/main.tsx)) using the
`VITE_SYNCFUSION_LICENSE_KEY` environment variable — the key itself is never hardcoded.

1. Copy `.env.example` to `.env`.
2. Get a license key from the [Syncfusion License & Downloads page](https://www.syncfusion.com/account/downloads)
   (a free Community license covers qualifying individuals/organizations) and paste it into `.env`
   as `VITE_SYNCFUSION_LICENSE_KEY`.
3. Restart `npm run dev` after changing `.env`.

Running with an empty key works but shows the Syncfusion trial/evaluation banner.

## PDF Viewer resources

The PDF Viewer renders PDFs in a Web Worker using the bundled `pdfium` WASM. On `npm install`, the
`postinstall` script ([scripts/copy-pdfviewer-resources.mjs](scripts/copy-pdfviewer-resources.mjs))
copies `pdfium.js` / `pdfium.wasm` from `@syncfusion/ej2-pdfviewer` into `public/ej2-pdfviewer-lib/`,
where the viewer loads them at runtime. If those files are missing, re-run `npm install` or the
script directly.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check (`tsc -b`) and build for production into `dist/`
- `npm start` — serve the production build via the standalone Node server ([server.mjs](server.mjs))
- `npm run preview` — preview the production build via Vite's built-in preview server
- `npm run lint` — run oxlint

## Production deployment

`npm start` runs [server.mjs](server.mjs), a minimal static file server that:

- Serves the built `dist/` directory under the base path `/Doc-signing-and-workflow/react/`.
- Redirects `/` → `/Doc-signing-and-workflow/react/`.
- Falls back to `index.html` for client-side routes (React Router), while real missing assets
  (JS/CSS/images) correctly return 404.
- Listens on `0.0.0.0:5174` by default; override with `PORT=xxxx npm start`.

```bash
npm run build
npm start
# → http://localhost:5174/Doc-signing-and-workflow/react/
```

> Always run `npm run build` before `npm start` — `server.mjs` serves `dist/` only and exits with an
> error if `dist/index.html` is missing.

The base path (`/Doc-signing-and-workflow/react/`) is shared between `vite.config.ts` (`base`),
`server.mjs` (`publicPath`), and [src/basePath.ts](src/basePath.ts) so the same build works through
the GCP vanity path or directly from the Azure App Service root.

## Project structure

```
index.html               Vite entry HTML
vite.config.ts           base = '/Doc-signing-and-workflow/react/'
server.mjs               Standalone Node static server for the built app
src/
  main.tsx               Bootstrap: registerLicense(), theme, <App />
  App.tsx                Routes (AppShell + feature pages)
  basePath.ts            Resolves the public base path at runtime (vanity vs root)
  app/
    AppShell.tsx         Top app bar, nav, theme toggle
  components/
    MobileSheet.tsx      Bottom sheet for mobile-responsive pages
  hooks/
    useTheme.ts          light/dark theme state (localStorage + system pref)
    useIsMobile.ts       viewport breakpoint hook
  data/
    documents.ts         Sample document metadata (paths, pages, sizes)
    templates.ts         Starter templates
    recipients.ts        Sample recipients + color palette
    sessionStore.ts      In-memory + sessionStorage handoff (Prepare→Sign→Completed)
    activity.ts          Dashboard activity feed
    evaluationAreas.ts   Showcase evaluation checklist data
  features/
    dashboard/           Overview + quick actions
    documents/           Documents grid
    templates/           Templates gallery
    create/              Create document/template flow
    prepare/             Field designer (drag fields onto the PDF)
    sign/                Recipient signing view
    completed/           Signed confirmation + audit trail
    showcase/            Evaluation showcase hub
public/
  favicon.ico
  documents/             Sample PDFs loaded by the viewer
  ej2-pdfviewer-lib/     pdfium.js + pdfium.wasm (copied at install)
scripts/
  copy-pdfviewer-resources.mjs   postinstall: copies pdfium WASM into public/
```

## Stack

React 19 + Vite + TypeScript, Syncfusion EJ2 React components (PDF Viewer, Navigations, Layouts,
Inputs, Grids, Popups, Notifications, Buttons, Dropdowns, Calendars, Barcode Generator), the
Syncfusion JS PDF library for client-side document operations, React Router, and Lucide icons.
Everything runs client-side — no server, no database.
