#!/usr/bin/env node
// Behaviour checks for a running React showcase (factory/standards/app-source-baseline.md,
// "Browser evidence"). Proves what a DOM-presence check cannot: nothing failed to load, nothing
// overlaps the sidebar, no trial banner, controls re-measure after the sidebar docks, map markers
// survive a zoom, colours follow design-system.md "Colour semantics" (config colourRules), numbers carry
// their separators, text in controls reads in both themes, the layout holds still while it loads, a map
// shape that looks clickable does something, each CTA lands on the page it names, a date range picker's
// presets all show without scrolling, and, with config
// `loading`, nothing is blank while a page loads on a slow network (served build only).
//
// Usage (from frontend/react, with the dev or preview server running):
//   npx playwright install chromium        # once per machine
//   node browser-check.mjs --config browser-check.config.json > ../../validation/logs/browser-check.json
// Exit code 0 = every check passed. Screenshots land in the config's screenshotDir.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyColour } from './colour-tones.mjs';

const args = process.argv.slice(2);
const configPath = args[args.indexOf('--config') + 1] ?? 'browser-check.config.json';
const config = JSON.parse(readFileSync(configPath, 'utf8'));
// Narrow a run from the command line (workflow 2.16.0): --routes a,b --viewports wide,phone --themes light,
// --concurrency N (theme x size combinations at once, default 2), --action-timeout ms (how long a missing
// element is waited for; a negative run against old source passes 5000 so expected failures are quick),
// --screenshots dir (overrides the config's screenshotDir, workflow 2.18.4: a package pass run with the
// validate config overwrote validate's accepted screenshots; use browser-check.package.config.json, or this).
const option = name => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const pick = (list, value) => value ? list.filter(item => value.split(',').includes(item.name)) : list;
let {
  baseUrl, routes, themes = { light: {}, dark: {} },
  viewports = [{ name: 'wide', width: 1440, height: 900 }, { name: 'docked-edge', width: 1024, height: 800 },
    { name: 'drawer-edge', width: 1023, height: 800 }, { name: 'phone', width: 390, height: 844 }],
  sidebar = '#app-shell-sidebar', menuButton = '#app-shell-menu-button',
  screenshotDir = '../../validation/screenshots/unnamed-phase', allowTrialBanner = false, ignoreRequests = ['favicon'],
  colourRules = [], loading = null, themeSwitch = null,
  // Workflow 2.18.0: the most layout shift a route may show after it starts loading (the web-vitals "good"
  // line), and the widest a filter or form field may be at 1280px and up.
  maxLayoutShift = 0.1, maxShiftCount = 4, maxFieldWidth = 360,
  // The Tailwind 3 theme's default primary (indigo) in light and dark; an app maps the theme's primary to
  // its brand, so none of these should be drawn outside charts. Set to [] for an app whose brand is indigo.
  themeAccentDefaults = ['#4f46e5', '#6366f1', '#4338ca', '#818cf8', '#3730a3', '#a5b4fc', '#e0e7ff', '#312e81', '#1e1b4b']
} = config;
routes = pick(routes, option('routes')); viewports = pick(viewports, option('viewports'));
if (option('screenshots')) screenshotDir = option('screenshots');
if (option('themes')) themes = Object.fromEntries(Object.entries(themes).filter(([name]) => option('themes').split(',').includes(name)));
const concurrency = Math.max(1, Number(option('concurrency') ?? config.concurrency ?? 2));
const actionTimeoutMs = Number(option('action-timeout') ?? config.actionTimeoutMs ?? 30000);
const startedAt = Date.now();

// Ready, not a fixed wait (workflow 2.16.0): after a load or a click, continue once the page has stopped
// changing (element count, text, page height, and the heights of chart points, rows, cards and
// appointments, which grow while they animate) for two polls in a row with no "Loading" indicator, capped at
// the route's settleMs x 2 (at least 2 s). A fixed 0.8-2.5 s wait after each of 48 loads was most of the
// real-estate-portfolio browser check's 11.5 minutes.
async function settle(page, capMs) {
  const start = Date.now(); let last = null, stable = 0;
  await page.waitForTimeout(120);
  while (Date.now() - start < capMs) {
    const snap = await page.evaluate(() => {
      const loading = [...document.querySelectorAll('[role="status"], .e-spinner-pane:not(.e-spin-hide)')]
        .filter(el => el.offsetParent && /loading/i.test(el.textContent || 'loading')).length;
      const grown = [...document.querySelectorAll('[id*="_Series_"][id*="_Point_"], .e-appointment, .e-card, .e-row')]
        .reduce((sum, el) => sum + Math.round(el.getBoundingClientRect().height), 0);
      return [document.getElementsByTagName('*').length, document.body.innerText.length, document.documentElement.scrollHeight, grown, loading].join('|');
    }).catch(() => null);
    stable = snap && snap === last && snap.endsWith('|0') ? stable + 1 : 0;
    if (stable >= 2) break;
    last = snap; await page.waitForTimeout(200);
  }
  return Date.now() - start;
}
const settleCap = route => Math.max(2 * (route.settleMs ?? 800), 2000);
// A small worker pool: each theme x size combination has its own browser context.
async function runPool(items, limit, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => { while (queue.length) await worker(queue.shift()); }));
}
const MEASURED = '.e-chart, .e-accumulationchart, .e-maps, .e-grid, .e-schedule, .e-kanban, .e-gantt, .e-dashboardlayout';
mkdirSync(screenshotDir, { recursive: true });

// Layout shift (workflow 2.18.0): every page records its layout shifts not caused by input, so a route can
// fail one that jumps while it loads. From executive-kpi-analytics (2026-10-10): a fixed Dashboard Layout
// re-measured its panels and the chart refreshed from a ResizeObserver, so the overview jumped on load.
// A shift whose previous frame was covered by the startup frame (#app-boot) is not seen: the theme lands
// and #app-boot goes in one frame (workflow 2.18.1). Record when it goes; those shifts are left out.
const recordShifts = () => {
  window.__bcShifts = [];
  window.__bcBootGone = null;
  try {
    new MutationObserver(records => { for (const record of records) for (const node of record.removedNodes)
      if (node.id === 'app-boot' && window.__bcBootGone == null) window.__bcBootGone = performance.now(); }).observe(document, { childList: true, subtree: true });
  } catch { /* no document yet */ }
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput && entry.value >= 0.001) window.__bcShifts.push({ value: entry.value, at: entry.startTime,
        sources: (entry.sources ?? []).map(s => s.node && (s.node.id || s.node.className?.toString?.().split(' ')[0] || s.node.nodeName)).filter(Boolean).slice(0, 3) });
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* not supported */ }
};

// Route actions (workflow 2.18.0), replayed after every reload: `navigate` clicks the shell link with that
// accessible name (opening the drawer when the link is hidden), for apps whose pages are views rather than
// URLs; `click` presses each named button (or link); `expectHeading` then requires that page heading, so a
// CTA ("Ask AI for decision support") is proved to land on the page it names. From executive-kpi-analytics,
// whose "Ask AI Insights" button opened KPI Drilldowns.
async function routeActions(page, route, problems, report = true) {
  if (route.navigate) {
    try {
      const link = page.getByRole('link', { name: route.navigate }).first();
      if (!await link.isVisible()) await page.locator(menuButton).click({ timeout: 5000 });
      await page.evaluate(() => { window.__bcShifts = []; });
      await link.click({ timeout: 5000 });
      await settle(page, settleCap(route));
    } catch (error) { if (report) problems.push({ check: 'route navigation failed: ' + route.navigate, detail: error.message.split('\n')[0] }); }
  }
  for (const name of route.click ?? []) {
    try {
      const button = page.getByRole('button', { name }).first();
      const target = await button.count() ? button : page.getByRole('link', { name }).first();
      await page.evaluate(() => { window.__bcShifts = []; });
      await target.click({ timeout: 5000 }); await settle(page, 2000);
    } catch (error) { if (report) problems.push({ check: 'route click failed: ' + name, detail: error.message.split('\n')[0] }); }
  }
  if (!report) return;
  if (route.expectHeading) {
    const heading = page.getByRole('heading', { name: route.expectHeading, exact: true }).first();
    if (!await heading.isVisible().catch(() => false)) {
      const shown = await page.evaluate(() => document.querySelector('main h1, h1')?.textContent?.trim() ?? '');
      problems.push({ check: 'CTA landed on the wrong page', detail: `expected the "${route.expectHeading}" page after ${[route.navigate, ...(route.click ?? [])].filter(Boolean).join(' → ')}, found "${shown}"; route the action to the page its label names, or rename it` });
    }
  }
  // A mouse click (a shell link or a CTA) must not leave a focus ring: focusing the page heading from code
  // drew an outline on every page change in executive-kpi-analytics (`h1:focus`, not `:focus-visible`).
  if (route.navigate || route.click?.length) {
    const stray = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.matches(':focus-visible')) return null;
      const cs = getComputedStyle(el);
      return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"` : null;
    });
    if (stray) problems.push({ check: 'focus ring after a mouse click', detail: `${stray} shows an outline after a mouse action; style programmatic focus with :focus-visible, or do not move focus` });
  }
}

const results = [];
const browser = await chromium.launch();
// A packaged build carries the website team's visitor analytics (publishing-base-path.md, workflow 2.19.0).
// A check run is not a visit: every context answers its requests here, so none reaches the analytics
// service, and the count shows the script ran. 200 with a body: Playwright reports an empty 204 as a
// failed (aborted) request.
const ANALYTICS = 'https://analytics.syncfusion.com/**';
let analyticsRequests = 0;
const newContext = browser.newContext.bind(browser);
browser.newContext = async options => {
  const context = await newContext(options);
  await context.route(ANALYTICS, route => { analyticsRequests++;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: 'ok' }); });
  return context;
};
try {
  const combos = Object.entries(themes).flatMap(([themeName, theme]) => viewports.map(viewport => [themeName, theme, viewport]));
  await runPool(combos, concurrency, async ([themeName, theme, viewport]) => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      if (theme.localStorage) await context.addInitScript(entries => {
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      }, theme.localStorage);
      await context.addInitScript(recordShifts);
      const page = await context.newPage();
      page.setDefaultTimeout(actionTimeoutMs);
      for (const route of routes) {
        const problems = [];
        const consoleErrors = [], failed = [];
        page.removeAllListeners('console'); page.removeAllListeners('pageerror');
        page.removeAllListeners('requestfailed'); page.removeAllListeners('response');
        page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        page.on('pageerror', error => consoleErrors.push(error.message));
        page.on('requestfailed', request => failed.push(request.url() + ' ' + (request.failure()?.errorText ?? '')));
        page.on('response', response => {
          if (response.status() >= 400) { failed.push(response.url() + ' ' + response.status()); return; }
          // A file URL answered with an HTML page is a soft 404 (it returns 200), e.g. a sample PDF
          // that no longer exists: the PDF Viewer then reports "File Corrupted".
          const type = response.headers()['content-type'] ?? '';
          if (/\.(pdf|png|jpe?g|gif|svg|webp|js|mjs|css|json|woff2?|ttf|docx?|xlsx?|pptx?)(\?|$)/i.test(new URL(response.url()).pathname) && type.startsWith('text/html'))
            failed.push(response.url() + ' served text/html instead of the file');
        });

        const url = new URL(route.path, baseUrl);
        for (const [key, value] of Object.entries(theme.query ?? {})) url.searchParams.set(key, value);
        await page.goto(url.href, { waitUntil: 'networkidle' });
        await settle(page, settleCap(route));
        // A view behind a shell link or a button (a board behind "Workflow Board"), and a CTA's destination.
        await routeActions(page, route, problems);
        // Back to this route's view after a reload (the map passes reload to reset the view).
        const reopen = async () => { await page.goto(url.href, { waitUntil: 'networkidle' }); await settle(page, settleCap(route)); await routeActions(page, route, problems, false); };

        // Layout shift while the page loads (workflow 2.18.0): charts that refresh from a ResizeObserver, a
        // fixed Dashboard Layout that re-measures, a chart mounted before its width is known.
        // Two signs: a large total (the web-vitals line, 0.1), or a layout that keeps moving (more than
        // `maxShiftCount` separate shifts: executive-kpi-analytics's Dashboard Layout moved its brief panel 7 times
        // in 100 ms). A large first shift right after the startup frame goes is often the theme arriving after
        // #app-boot was removed: the same app's fixed version showed native selects for 300 ms, then jumped.
        if (route.layoutShift !== false) {
          // Shifts before #app-boot went, or in the first frames after (its removal and the theme landing share a
          // frame; 100 ms covers a busy main thread), happened under the startup frame.
          const shifts = await page.evaluate(() => (window.__bcShifts ?? []).filter(s => window.__bcBootGone == null
            ? !document.getElementById('app-boot') : s.at > window.__bcBootGone + 100));
          const total = shifts.reduce((sum, entry) => sum + entry.value, 0);
          if (total > maxLayoutShift || shifts.length > maxShiftCount) problems.push({ check: 'layout shifts while loading', detail: `${shifts.length} shift(s), cumulative ${total.toFixed(3)} (limits ${maxLayoutShift} and ${maxShiftCount} shifts), largest at ${Math.round(shifts.reduce((a, b) => b.value > a.value ? b : a, { value: 0, at: 0 }).at)} ms, from ${[...new Set(shifts.flatMap(s => s.sources))].slice(0, 4).join(', ') || 'unnamed elements'}; keep #app-boot until the theme stylesheet has applied, size charts before they mount, and lay out a fixed dashboard with CSS grid rather than a Dashboard Layout that re-measures` });
        }

        const state = await page.evaluate(({ sidebar, measured, maxFieldWidth }) => {
          const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
          const nav = document.querySelector(sidebar);
          const navBox = nav ? box(nav) : null;
          const navVisible = !!navBox && navBox.right > 1 && navBox.width > 1;
          const banner = /trial version of Syncfusion/i.test(document.body.innerText);
          // An open Syncfusion dialog nobody asked for (an error, a "File Corrupted" notice) blocks the page.
          const dialogs = [...document.querySelectorAll('.e-dialog')].filter(d => getComputedStyle(d).display !== 'none' && d.getBoundingClientRect().width > 0)
            .map(d => d.innerText.trim().replace(/\s+/g, ' ').slice(0, 120));
          // Only images with an address count: controls such as the PDF Viewer create empty <img> placeholders.
          const brokenImages = [...document.images].filter(img => (img.currentSrc || img.getAttribute('src')) && img.complete && img.naturalWidth === 0).map(img => img.currentSrc || img.src);
          const controls = [...document.querySelectorAll(measured)].filter(el => !el.parentElement?.closest(measured));
          // A control that starts left of the sidebar's right edge is drawn under or over it.
          const overlapping = navVisible ? controls.filter(el => box(el).left < navBox.right - 1 && box(el).width > 0).map(el => el.id || el.className.split(' ')[0]) : [];
          // A board squeezed into a narrow screen still "fits", so nothing overflows: catch the
          // cards themselves getting too narrow to read (text one letter per line).
          const squeezed = [...document.querySelectorAll('.e-kanban .e-card')].filter(card => { const w = card.getBoundingClientRect().width; return w > 0 && w < 120; }).length;
          // Kanban keys each card by cardSettings.headerField. A field that repeats (a property name)
          // gives two cards one id, and a drag moves the wrong card: real-estate-portfolio, 2026-10-07.
          const kanbanDuplicates = [...document.querySelectorAll('.e-kanban')].flatMap(board => {
            const ids = [...board.querySelectorAll('.e-card[data-id]')].map(card => card.getAttribute('data-id'));
            const repeated = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
            return repeated.length ? [`${board.id || 'kanban'}: ${ids.length} cards, ${new Set(ids).size} distinct ids (${repeated.slice(0, 3).join(', ')}…)`] : [];
          });
          // Cards (syncfusion-component-patterns.md, "Syncfusion first"): a card with no surface (transparent,
          // no border, no shadow) reads as flat page text; text clipped inside a card is cut off. From
          // real-estate-portfolio (2026-10-08): KPI cards lost their styles when their CSS class was removed,
          // and the theme's 20px line for <p> in card content cut "23 Pending".
          const cardLike = [...document.querySelectorAll('.e-card, [class*="card"]')].filter(el => !el.closest('.e-kanban')
            && ([...el.classList].some(c => c === 'e-card' || /(^|-)card$/.test(c))) && el.getBoundingClientRect().width > 0);
          const flatCards = cardLike.filter(el => { const cs = getComputedStyle(el);
            return cs.backgroundColor === 'rgba(0, 0, 0, 0)' && parseFloat(cs.borderTopWidth) === 0 && cs.boxShadow === 'none'; })
            .map(el => el.getAttribute('aria-label') || el.className.split(' ').find(c => /card/.test(c)));
          const clippedText = cardLike.flatMap(card => [...card.querySelectorAll('*')].filter(el => {
              if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
              const cs = getComputedStyle(el); return cs.overflow === 'hidden' && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0;
            }).map(el => `"${el.textContent.trim().slice(0, 30)}" (${el.clientHeight}px box, ${el.scrollHeight}px text)`));
          // A Grid wider than its card at desktop width hides columns behind a scrollbar: real-estate-portfolio's
          // lease schedule summed 950px of fixed columns in a 740px card and hid Status (2026-10-08).
          // A PivotView's own grid scrolls inside its panel by design (syncfusion-component-patterns.md, "Grid and Pivot").
          const wideGrids = innerWidth >= 1024 ? [...document.querySelectorAll('.e-grid')].filter(g => !g.parentElement?.closest('.e-grid') && !g.closest('.e-pivotview'))
            .map(g => { const c = g.querySelector('.e-gridcontent .e-content') ?? g.querySelector('.e-content'); return c && c.scrollWidth > c.clientWidth + 1 ? `${g.id || 'grid'}: ${c.scrollWidth - c.clientWidth}px wider than its container` : null; }).filter(Boolean) : [];
          // A Scheduler with events in its current view must draw them: laid out before the theme bundle
          // loaded, real-estate-portfolio's Month view held 45 events and drew none in about 1 cold load in 3.
          const emptySchedules = [...document.querySelectorAll('.e-schedule')].map(s => { const inst = s.ej2_instances?.[0];
            let inView = 0; try { inView = inst?.getCurrentViewEvents?.()?.length ?? 0; } catch { inView = 0; }
            return inView > 0 && !s.querySelector('.e-appointment') ? `${s.id || 'schedule'}: ${inView} events in view, none drawn` : null; }).filter(Boolean);
          // Numbers carry their separators (design-system.md, "Number formatting"): a whole Grid cell, Pivot value
          // or card figure of five or more digits with none ("$1691064", "12500") reads as raw data. Columns
          // that hold identifiers (ID, code, ZIP, phone, year) are skipped. From executive-kpi-analytics, whose
          // Grid revenue and Pivot totals showed raw digits.
          const RAW = /^[-−(]?[$€£¥]?\s?\d{5,}(\.\d+)?\s?[%)]?$/, ID_HEADER = /\b(id|code|zip|postal|phone|year|no\.?|number|sku|account|ref(erence)?)\b|#/i;
          const headerOf = cell => { const grid = cell.closest('.e-grid'), index = cell.getAttribute('aria-colindex');
            return (index && grid?.querySelector(`.e-headercell[aria-colindex="${index}"]`)?.textContent?.trim()) || ''; };
          const ownText = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
          const ungrouped = [
            ...[...document.querySelectorAll('.e-grid .e-rowcell')].filter(cell => RAW.test(cell.textContent.trim()) && !ID_HEADER.test(headerOf(cell)))
              .map(cell => `${cell.closest('.e-grid').id || 'grid'} ${headerOf(cell) || 'cell'}: ${cell.textContent.trim()}`),
            ...[...document.querySelectorAll('.e-pivotview .e-valuescontent, .e-pivotview .e-cellvalue')].filter(cell => RAW.test(cell.textContent.trim()))
              .map(cell => `${cell.closest('.e-pivotview').id || 'pivot'}: ${cell.textContent.trim()}`),
            ...[...document.querySelectorAll('.e-card *')].filter(el => !el.closest('.e-grid, .e-pivotview, .e-chart, .e-accumulationchart, .e-maps') && RAW.test(ownText(el)))
              .map(el => `card: ${ownText(el)}`)
          ];
          // Fields sized to their content (syncfusion-component-patterns.md, "Filter bar"): at 1280px and up a
          // period picker or dropdown stretched across the page is hard to scan. executive-kpi-analytics's
          // filters each took a third of the row. `data-wide-field` on a container marks a deliberate exception.
          const fields = [...document.querySelectorAll('.e-input-group, .e-float-input.e-control-wrapper')]
            .filter(el => !el.closest('.e-grid, .e-pivotview, .e-dialog, .e-aiassistview, .e-toolbar, .e-kanban, .e-schedule, .e-gantt, .e-popup, [data-wide-field]') && el.getBoundingClientRect().width > 0);
          fields.forEach((el, i) => el.setAttribute('data-bc-field', String(i)));
          const stretched = innerWidth >= 1280 ? fields.filter(el => el.getBoundingClientRect().width > maxFieldWidth)
            .map(el => `${(el.querySelector('input')?.getAttribute('aria-label') || el.closest('label')?.textContent || el.querySelector('input')?.id || 'field').trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().width)}px`) : [];
          return { navVisible, banner, dialogs, brokenImages, overlapping, squeezed, kanbanDuplicates, flatCards, clippedText, wideGrids, emptySchedules, ungrouped: [...new Set(ungrouped)], stretched, horizontalScroll: document.documentElement.scrollWidth > innerWidth + 1, controls: controls.length };
        }, { sidebar, measured: MEASURED, maxFieldWidth });

        // Without a key the trial banner covers the header; when it is explicitly allowed, take it
        // out of the way so the remaining checks can still interact.
        if (state.banner && allowTrialBanner) await page.evaluate(() => document.querySelector('.sf-license-validation-banner')?.remove());

        const relevantFailures = failed.filter(entry => !ignoreRequests.some(skip => entry.includes(skip)));
        if (consoleErrors.length) problems.push({ check: 'console errors', detail: consoleErrors.slice(0, 5) });
        if (relevantFailures.length) problems.push({ check: 'failed requests', detail: relevantFailures.slice(0, 5) });
        if (state.brokenImages.length) problems.push({ check: 'broken images (map tiles?)', detail: state.brokenImages.slice(0, 5) });
        if (state.dialogs.length && !route.expectDialog) problems.push({ check: 'unexpected dialog open', detail: state.dialogs });
        if (state.banner && !allowTrialBanner) problems.push({ check: 'trial license banner', detail: 'register VITE_SYNCFUSION_LICENSE_KEY' });
        if (state.overlapping.length) problems.push({ check: 'overlaps the sidebar', detail: state.overlapping });
        if (state.emptySchedules.length) problems.push({ check: 'scheduler events not drawn', detail: state.emptySchedules.join('; ') + '; mount the Scheduler once the theme bundle has loaded (or call refreshEvents())' });
        if (state.wideGrids.length) problems.push({ check: 'grid wider than its container', detail: state.wideGrids.join('; ') + '; let wrapping text columns share the width, trim fixed widths, or give the Grid the full row below a breakpoint' });
        if (state.flatCards.length) problems.push({ check: 'cards without a surface', detail: state.flatCards.slice(0, 4).join('; ') + ': transparent, no border, no shadow; use the Syncfusion Card (e-card), which the theme draws' });
        if (state.clippedText.length) problems.push({ check: 'text cut off in a card', detail: state.clippedText.slice(0, 4).join('; ') + '; give it a div (the theme sets card <p> to a 20px line with hidden overflow) or its own line height' });
        if (state.kanbanDuplicates.length) problems.push({ check: 'Kanban card ids not unique', detail: state.kanbanDuplicates.join('; ') + '; set cardSettings.headerField to the record id and draw the title with a card template' });
        if (state.squeezed) problems.push({ check: 'Kanban cards squeezed under 120px', detail: state.squeezed + ' card(s); give the board a min-width inside an overflow-x container' });
        if (state.horizontalScroll) problems.push({ check: 'horizontal scroll', detail: 'page wider than the viewport' });
        if (state.ungrouped.length && route.numbers !== false) problems.push({ check: 'numbers without thousands separators', detail: state.ungrouped.slice(0, 5).join('; ') + '; format money and counts with en-US grouping (Grid format/valueAccessor, Pivot formatSettings, the app\'s format module)' });
        if (state.stretched.length && route.fieldWidth !== false) problems.push({ check: 'input stretched across the page', detail: state.stretched.slice(0, 4).join('; ') + `; give each filter field a width for its content (${maxFieldWidth}px at most), see "Filter bar"` });

        // Maps redraws its markers on every zoom and pan (a wheel or trackpad over the map). React
        // marker templates come back empty after that redraw: the wrappers stay, sized 0x0. Zoom in and
        // back out over each map with markers; every marker drawn before must still be drawn.
        if (route.zoomMaps !== false) {
          const drawnMarkers = id => page.evaluate(id => [...document.querySelectorAll('#' + CSS.escape(id) + ' [id*="_MarkerIndex_"][id*="_dataIndex_"]')]
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length, id);
          for (const id of await page.evaluate(() => [...document.querySelectorAll('.e-maps[id]')].map(map => map.id))) {
            const before = await drawnMarkers(id);
            if (!before) continue;
            const map = page.locator('#' + id);
            await map.scrollIntoViewIfNeeded();
            const box = await map.boundingBox();
            if (!box) continue;
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            for (const delta of [-200, 200]) { await page.mouse.wheel(0, delta); await page.waitForTimeout(800); }
            const after = await drawnMarkers(id);
            if (after < before) problems.push({ check: 'map markers vanish after zoom', detail: `${id}: ${before} drawn before, ${after} after zooming in and out; use native marker shapes (colorValuePath, width/heightValuePath, border), not a React template` });

            // Frame the data (syncfusion-component-patterns.md, "Maps: frame the data"). Reload so the map
            // is at its starting view, then: the markers fill a fair part of it; zooming out cannot reach
            // a view where they shrink to a corner (the world for one country's data); and zooming in on
            // any cluster or overlap separates every marker.
            await reopen();
            await map.scrollIntoViewIfNeeded();
            const view = () => page.evaluate(id => {
              const m = document.getElementById(id), mr = m.getBoundingClientRect();
              const shown = [...m.querySelectorAll('[id*="_MarkerIndex_"][id*="_dataIndex_"]')]
                .filter(el => !el.id.includes('_datalabel_') && getComputedStyle(el).visibility !== 'hidden')
                .map(el => ({ cluster: el.id.includes('_cluster_'), r: el.getBoundingClientRect() }))
                .filter(({ r }) => r.width > 0 && r.height > 0 && r.right > mr.left && r.left < mr.right && r.bottom > mr.top && r.top < mr.bottom);
              const overlap = shown.filter((a, i) => shown.some((b, j) => j !== i && a.r.left < b.r.right && b.r.left < a.r.right && a.r.top < b.r.bottom && b.r.top < a.r.bottom));
              const xs = shown.map(({ r }) => r.left + r.width / 2), ys = shown.map(({ r }) => r.top + r.height / 2);
              return { count: shown.length, clusters: shown.filter(s => s.cluster).length, overlapping: overlap.length,
                span: shown.length > 1 ? Math.max((Math.max(...xs) - Math.min(...xs)) / mr.width, (Math.max(...ys) - Math.min(...ys)) / mr.height) : 1 };
            }, id);
            const start = await view();
            const pct = v => Math.round(v * 100) + '%';
            if (start.count > 1 && start.span < 0.25)
              problems.push({ check: 'map does not frame its data', detail: `${id}: the markers span ${pct(start.span)} of the map at its starting view; open framed to the data (zoomSettings.shouldZoomInitially) or the region (a GeoJSON layer of just that region)` });
            if (start.count > 1) {
              const box2 = await map.boundingBox();
              await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
              for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(250); }
              await page.waitForTimeout(600);
              const out = await view();
              if (out.span < 0.25)
                problems.push({ check: 'map zooms out past its data', detail: `${id}: zoomed out, the markers span ${pct(out.span)} of the map (${pct(start.span)} at the start); set minZoom to the starting zoom level` });
              await reopen();
              await map.scrollIntoViewIfNeeded();
            }
            // Every cluster or overlap at the starting view must separate at full zoom. Zoom straight to the
            // map's maxZoom on that marker's own coordinates, read from its data (an element id names its
            // data index; a cluster's names its first member). Wheel steps drift off the map, and
            // pointToLatLong returns wrong coordinates on tile layers.
            const spots = await page.evaluate(id => {
              const m = document.getElementById(id), mr = m.getBoundingClientRect(), maps = m.ej2_instances?.[0];
              if (!maps) return [];
              const shown = [...m.querySelectorAll('[id*="_MarkerIndex_"][id*="_dataIndex_"]')]
                .filter(el => !el.id.includes('_datalabel_') && getComputedStyle(el).visibility !== 'hidden')
                .map(el => ({ id: el.id, cluster: el.id.includes('_cluster_'), r: el.getBoundingClientRect() }))
                .filter(({ r }) => r.width > 0 && r.right > mr.left && r.left < mr.right && r.bottom > mr.top && r.top < mr.bottom);
              const hit = (a, b) => a.r.left < b.r.right && b.r.left < a.r.right && a.r.top < b.r.bottom && b.r.top < a.r.bottom;
              return shown.filter((s, i) => s.cluster || shown.some((o, j) => j !== i && hit(s, o))).map(s => {
                const [, layer, marker, index] = s.id.match(/LayerIndex_(\d+)_MarkerIndex_(\d+)_dataIndex_(\d+)/).map(Number);
                const settings = maps.layers[layer].markerSettings[marker], row = settings.dataSource?.[index];
                const lat = row?.[settings.latitudeValuePath || 'latitude'], lon = row?.[settings.longitudeValuePath || 'longitude'];
                return Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon, element: id + '_LayerIndex_' + layer + '_MarkerIndex_' + marker + '_dataIndex_' + index } : null;
              }).filter(Boolean);
            }, id);
            const stacked = [];
            for (const spot of spots) {
              await page.evaluate(([id, spot]) => { const maps = document.getElementById(id).ej2_instances[0]; maps.zoomByPosition({ latitude: spot.latitude, longitude: spot.longitude }, maps.zoomSettings.maxZoom); }, [id, spot]);
              await page.waitForTimeout(1200);
              const onScreen = await page.evaluate(([id, element]) => { const m = document.getElementById(id).getBoundingClientRect(), el = document.getElementById(element); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.left < m.right && r.right > m.left && r.top < m.bottom && r.bottom > m.top; }, [id, spot.element]);
              const deep = await view();
              if (!onScreen) stacked.push(`could not zoom to the marker at ${spot.latitude.toFixed(3)}, ${spot.longitude.toFixed(3)}`);
              else if (deep.clusters || deep.overlapping) stacked.push(`${deep.clusters} cluster(s) and ${deep.overlapping} overlapping marker(s) near ${spot.latitude.toFixed(3)}, ${spot.longitude.toFixed(3)}`);
            }
            if (stacked.length)
              problems.push({ check: 'map markers stay stacked at full zoom', detail: `${id}: at maxZoom, ${stacked.slice(0, 3).join('; ')}; raise maxZoom until the closest markers separate (about 14 for points inside a city)` });
            await reopen();
          }
        }

        // Chart tooltips read correctly (syncfusion-component-patterns.md, "Charts: tooltips"). Hover up to
        // six points of each chart and read its tooltip: a share over 100%, a raw number of five or more
        // digits without separators, or an unfilled template ("${", "undefined", "NaN") is wrong. From
        // real-estate-portfolio, whose donut tooltip printed the valuation with a % sign ("Office: 2295000000%"),
        // and executive-kpi-analytics, whose revenue tooltips read "1691064" (workflow 2.18.0: five digits).
        if (route.chartTooltips !== false) {
          for (const id of await page.evaluate(() => [...document.querySelectorAll('.e-chart[id], .e-accumulationchart[id]')].map(chart => chart.id))) {
            const points = await page.evaluate(id => [...document.querySelectorAll(`#${CSS.escape(id)} [id^="${id}_Series_"][id*="_Point_"]`)]
              .filter(el => /_Point_\d+$/.test(el.id)).slice(0, 6).map(el => el.id), id);
            const wrong = [];
            for (const pointId of points) {
              const spot = await page.evaluate(pointId => {
                const el = document.getElementById(pointId);
                el.scrollIntoView({ block: 'center' });
                // A slice's bounding-box centre can fall in the donut hole, and a point on its outline can miss
                // it: take an outline point and step 15% toward the centre of all the series' slices.
                if (el.getTotalLength && el.tagName.toLowerCase() === 'path' && el.getAttribute('d')?.includes('A')) {
                  const all = [...document.querySelectorAll(`[id^="${pointId.replace(/_Point_\d+$/, '_Point_')}"]`)].map(s => s.getBoundingClientRect());
                  const cx = (Math.min(...all.map(r => r.left)) + Math.max(...all.map(r => r.right))) / 2, cy = (Math.min(...all.map(r => r.top)) + Math.max(...all.map(r => r.bottom))) / 2;
                  const p = el.getPointAtLength(el.getTotalLength() * 0.25), m = el.getScreenCTM();
                  const x = p.x * m.a + m.e, y = p.y * m.d + m.f;
                  return { x: x + (cx - x) * 0.15, y: y + (cy - y) * 0.15 };
                }
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
              }, pointId);
              if (!spot) continue;
              await page.mouse.move(spot.x, spot.y);
              await page.waitForTimeout(700);
              const text = await page.evaluate(id => document.getElementById(id + '_tooltip')?.textContent?.trim() ?? '', id);
              if (!text) continue;
              const shares = [...text.matchAll(/(-?\d[\d,]*(?:\.\d+)?)\s*%/g)].map(m => parseFloat(m[1].replace(/,/g, '')));
              if (shares.some(v => v > 100) || /(?<![\d.,])\d{5,}(?![\d,])/.test(text) || /\$\{|undefined|NaN/.test(text)) wrong.push(text.slice(0, 80));
            }
            if (wrong.length) problems.push({ check: 'chart tooltip reads wrong', detail: `${id}: ${[...new Set(wrong)].slice(0, 3).join(' | ')}; show shares with point.percentage and money as formatted text (tooltipMappingName)` });
          }
          await page.mouse.move(0, 0);
        }

        // Pie and donut slices run largest first (syncfusion-component-patterns.md, "Charts"): read each
        // pie series' visible points in drawing order from the chart; a final "Other" slice may break the
        // order. From real-estate-portfolio, whose donut drew Retail (11.2%) before Multi-Family (17.1%).
        const pies = await page.evaluate(() => [...document.querySelectorAll('.e-accumulationchart[id]')].flatMap(chart => {
          const inst = chart.ej2_instances?.[0];
          return (inst?.visibleSeries ?? []).filter(s => s.type === 'Pie').map(s => ({ id: chart.id,
            labels: s.dataLabel?.visible === true || !!s.dataLabel?.template,
            points: s.points.filter(p => p.visible !== false).map(p => ({ x: String(p.x), y: Number(p.y) })) }));
        }));
        for (const pie of pies) {
          // Pie and donut charts show their values (syncfusion-component-patterns.md, "Charts"); the
          // legend names the categories, the labels give each slice's share or value.
          if (route.pieValues !== false && !pie.labels)
            problems.push({ check: 'pie values not shown', detail: `${pie.id}: no data labels; show each slice's share or value (dataLabel visible, inside the slice if outside labels do not fit)` });
          const points = pie.points.length > 1 && /^other\b/i.test(pie.points.at(-1).x) ? pie.points.slice(0, -1) : pie.points;
          if (points.some((p, i) => i > 0 && p.y > points[i - 1].y))
            problems.push({ check: 'pie slices not largest first', detail: `${pie.id}: ${pie.points.map(p => p.x).join(', ')}; sort the data by value, descending (an "Other" slice last)` });
        }

        // Chart data labels are whole: none cut with an ellipsis, none drawn past the chart's own edge, where
        // the SVG clips it. From real-estate-portfolio, whose donut's outside labels read "Multi..." and, at
        // 1024 px, "ulti-Family" and "ndustrial" (textContent was whole; the drawing was clipped).
        const clipped = await page.evaluate(() => [...document.querySelectorAll('.e-chart[id], .e-accumulationchart[id]')].flatMap(chart => {
          // The chart's own drawing surface (<id>_svg); a chart holds other small svgs (legend icons).
          const svg = document.getElementById(chart.id + '_svg') ?? chart.querySelector('svg'); if (!svg) return [];
          const box = svg.getBoundingClientRect();
          return [...chart.querySelectorAll('text[id*="_datalabel_"]')].filter(t => getComputedStyle(t).visibility !== 'hidden' && t.getBoundingClientRect().width > 0)
            .filter(t => { const r = t.getBoundingClientRect(); return /\.\.\.|…/.test(t.textContent) || r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1; })
            .map(t => `${chart.id}: "${t.textContent.trim()}"`);
        }));
        // A label drawn inside a slice reads on the slice: 4.5:1 against its fill. The chart's own ink choice
        // put white on #3b82f6 (3.7:1) in real-estate-portfolio's donut.
        const faint = await page.evaluate(() => {
          const rgb = c => { const m = c.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
            const n = c.match(/[\d.]+/g); return n ? n.slice(0, 3).map(Number) : null; };
          const lum = c => { const v = rgb(c).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
          return [...document.querySelectorAll('.e-accumulationchart[id]')].flatMap(chart => {
            const inst = chart.ej2_instances?.[0];
            return (inst?.visibleSeries ?? []).filter(s => s.dataLabel?.visible && s.dataLabel?.position === 'Inside').flatMap(s =>
              [...chart.querySelectorAll(`text[id^="${chart.id}_datalabel_Series_${s.index}_text_"]`)].filter(t => getComputedStyle(t).visibility !== 'hidden').map(t => {
                const slice = document.getElementById(`${chart.id}_Series_${s.index}_Point_${t.id.match(/(\d+)$/)[1]}`);
                const ink = t.getAttribute('fill') || getComputedStyle(t).fill, fill = slice?.getAttribute('fill');
                if (!fill || !rgb(ink) || !rgb(fill)) return null;
                const [a, b] = [lum(ink), lum(fill)].sort((x, y) => y - x), ratio = (a + 0.05) / (b + 0.05);
                return ratio < 4.5 ? `${chart.id}: "${t.textContent.trim()}" ${ink} on ${fill} ${ratio.toFixed(2)}:1` : null;
              }).filter(Boolean));
          });
        });
        if (faint.length) problems.push({ check: 'slice labels hard to read', detail: faint.slice(0, 4).join('; ') + '; set each label\'s ink in textRender to white or near-black, whichever reads better on the slice' });

        // Legend text is whole (workflow 2.18.2): no "…", inside the chart's drawing surface, and inside the clip
        // rectangle Syncfusion gives the legend (a clipPath on the legend group, in SVG units). At 390px
        // executive-kpi-analytics's legend read "Revenue targe": the text element was complete and inside the SVG,
        // but ran 7px past the legend's clip rectangle.
        const legends = await page.evaluate(() => [...document.querySelectorAll('.e-chart[id], .e-accumulationchart[id]')].flatMap(chart => {
          const svg = document.getElementById(chart.id + '_svg') ?? chart.querySelector('svg'); if (!svg) return [];
          const box = svg.getBoundingClientRect();
          const clipBox = el => {
            for (let g = el.parentElement; g && g !== svg; g = g.parentElement) {
              const ref = (getComputedStyle(g).clipPath.match(/url\("?#([^")]+)/) ?? (g.getAttribute('clip-path') ?? '').match(/url\(#([^)]+)\)/))?.[1];
              const rect = ref && document.getElementById(ref)?.querySelector('rect');
              if (!rect) continue;
              const m = g.getScreenCTM?.() ?? svg.getScreenCTM(), x = Number(rect.getAttribute('x')) || 0, y = Number(rect.getAttribute('y')) || 0;
              return { left: m.e + x * m.a, right: m.e + (x + Number(rect.getAttribute('width'))) * m.a, top: m.f + y * m.d, bottom: m.f + (y + Number(rect.getAttribute('height'))) * m.d };
            }
            return null;
          };
          return [...chart.querySelectorAll('text[id*="legend_text"]')].filter(t => getComputedStyle(t).visibility !== 'hidden' && t.getBoundingClientRect().width > 0)
            .filter(t => { const r = t.getBoundingClientRect(), c = clipBox(t);
              return /\.\.\.|…/.test(t.textContent) || r.left < box.left - 1 || r.right > box.right + 1 || r.bottom > box.bottom + 1
                || (c && (r.left < c.left - 1 || r.right > c.right + 1)); })
            .map(t => `${chart.id}: "${t.textContent.trim()}"`);
        }));
        if (legends.length && route.legends !== false) problems.push({ check: 'chart legend cut off', detail: legends.slice(0, 4).join('; ') + '; let legend labels wrap (legendSettings textWrap: \'Wrap\' with a maximumLabelWidth; a label needs a space to wrap), raise the legend padding (legendSettings padding: 16) when only its last letters are shaved, never a legend width, or give it its own row' });

        // A legend above or below its chart sits under the chart's centre (workflow 2.19.2): a legend
        // `width` makes Syncfusion lay the items out from the left of that box, and alignment: 'Center' does
        // not move them back. real-estate-portfolio's value chart legend sat 346px left of centre at 1023px.
        // routes[].legendCentre: false skips a page; an array of chart ids skips those charts.
        if (route.legendCentre !== false) {
          const skip = Array.isArray(route.legendCentre) ? route.legendCentre : [];
          const offCentre = await page.evaluate(skip => [...document.querySelectorAll('.e-chart[id], .e-accumulationchart[id]')].flatMap(chart => {
            if (skip.includes(chart.id)) return [];
            const svg = document.getElementById(chart.id + '_svg') ?? chart.querySelector('svg'); if (!svg) return [];
            const box = svg.getBoundingClientRect(); if (box.width < 2 || box.height < 2) return [];
            const rects = [...chart.querySelectorAll('[id*="legend_shape"], text[id*="legend_text"]')]
              .filter(el => getComputedStyle(el).visibility !== 'hidden').map(el => el.getBoundingClientRect()).filter(r => r.width > 0);
            if (!rects.length) return [];
            const top = Math.min(...rects.map(r => r.top)), bottom = Math.max(...rects.map(r => r.bottom));
            const middle = ((top + bottom) / 2 - box.top) / box.height;
            if (middle > 0.3 && middle < 0.7) return []; // a legend at the left or right
            const left = Math.min(...rects.map(r => r.left)), right = Math.max(...rects.map(r => r.right));
            const offset = (left + right) / 2 - (box.left + box.right) / 2, allowed = Math.max(12, box.width * 0.05);
            return Math.abs(offset) > allowed ? [`${chart.id}: ${Math.round(Math.abs(offset))}px ${offset < 0 ? 'left' : 'right'} of the chart's centre (allowed ${Math.round(allowed)}px)`] : [];
          }), skip);
          if (offCentre.length) problems.push({ check: 'chart legend off centre', detail: offCentre.slice(0, 4).join('; ') + '; remove the legend width (legendSettings width) and give it padding instead; routes[].legendCentre opts a chart out' });
        }

        if (clipped.length) problems.push({ check: 'chart labels cut off', detail: clipped.slice(0, 4).join('; ') + '; give the chart room (radius, margin), wrap the label, or drop slice labels and let the legend name the categories' });

        // Colour semantics (design-system.md): config `colourRules` per route. "categorical" fails an
        // element drawn in a status tone: either theme's token, or any colour whose hue reads as one
        // (colour-tones.mjs: red, orange to yellow, lime to green). "banded" reads a number from each
        // element and fails one whose colour is not its band's tone. Tones come from the page's tokens for
        // the current theme, or from `tones` in the rule (for markers on light map tiles).
        for (const rule of colourRules.filter(r => r.route === route.name && (!r.viewports || r.viewports.includes(viewport.name)))) {
          const outcome = await page.evaluate(([rule, classifierSource]) => {
            const classify = new Function('return (' + classifierSource + ')')();
            const probe = document.createElement('span'); document.body.appendChild(probe);
            const rgb = value => { probe.style.color = ''; probe.style.color = value; return getComputedStyle(probe).color; };
            const tone = name => rule.tones?.[name] ? rgb(rule.tones[name]) : rgb(`var(--color-sf-fg-${name}-primary)`);
            const status = { success: tone('success'), warning: tone('warning'), danger: tone('danger') };
            // A category drawn in either theme's status tone is wrong (a hard-coded light green shows up
            // in dark mode too), so read the other theme's tones as well, then switch straight back.
            const root = document.documentElement, theme = root.getAttribute('data-theme'), dark = root.classList.contains('dark');
            root.setAttribute('data-theme', theme === 'dark' ? 'light' : 'dark'); root.classList.toggle('dark', !dark);
            const otherStatus = [tone('success'), tone('warning'), tone('danger')];
            if (theme === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
            root.classList.toggle('dark', dark);
            const elements = [...document.querySelectorAll(rule.selector)];
            const property = rule.property ?? 'color';
            const colourOf = el => rgb(getComputedStyle(el)[property]);
            const wrong = [];
            for (const el of elements) {
              const colour = colourOf(el);
              if (rule.kind === 'categorical') {
                const hit = Object.entries(status).find(([, value]) => value === colour)?.[0]
                  ?? (otherStatus.includes(colour) ? 'the other theme\'s status tone' : null)
                  ?? (classify(colour) ? `a ${classify(colour)} hue (${colour})` : null);
                if (hit) wrong.push(`${(el.textContent || el.id).trim().slice(0, 30)} uses ${hit}`);
              } else {
                const source = rule.value?.startsWith('attribute:') ? el.getAttribute(rule.value.slice(10)) : el.textContent;
                const number = parseFloat(String(source ?? '').replace(/[^0-9.-]+/g, ' ').trim().split(' ')[0]);
                if (Number.isNaN(number)) { wrong.push('no number in "' + String(source).slice(0, 30) + '"'); continue; }
                const band = rule.bands.find(b => b.min === undefined || number >= b.min);
                if (colour !== tone(band.tone)) wrong.push(`${number} is not ${band.tone}`);
              }
            }
            probe.remove();
            return { count: elements.length, wrong };
          }, [rule, classifyColour.toString()]);
          if (!outcome.count) problems.push({ check: 'colour rule matched nothing: ' + rule.name, detail: rule.selector });
          else if (outcome.wrong.length) problems.push({ check: 'colour rule: ' + rule.name, detail: outcome.wrong.slice(0, 6) });
        }

        // Text in controls reads in this theme (design-system.md, "Interaction states"): Grid and Pivot cells,
        // dropdown and input text, chart and map labels, AI AssistView and Card text, 4.5:1 against what is
        // drawn behind it (3:1 for large text). The background is read at the text's centre, so a map label is
        // judged against its shape's fill. From executive-kpi-analytics: grid text, map labels and dropdowns
        // that stayed light-theme ink on dark surfaces. Once per theme, at the first size.
        if (viewport === viewports[0] && route.contrast !== false) {
          const faintText = await page.evaluate(selector => {
            const probe = document.createElement('span'); document.body.appendChild(probe);
            const parse = value => { probe.style.color = ''; probe.style.color = value; const m = getComputedStyle(probe).color.match(/[\d.]+/g);
              return m ? { rgb: m.slice(0, 3).map(Number), alpha: m[3] === undefined ? 1 : Number(m[3]) } : null; };
            const lum = rgb => { const v = rgb.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
            const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon']);
            const behind = (el, x, y) => {
              for (const under of document.elementsFromPoint(x, y)) {
                if (under === el || el.contains(under) || under.tagName.toLowerCase() === 'text' || under.tagName.toLowerCase() === 'tspan') continue;
                if (SHAPES.has(under.tagName.toLowerCase())) {
                  const cs = getComputedStyle(under), fill = under.getAttribute('fill') || cs.fill;
                  if (!fill || fill === 'none' || fill === 'transparent' || /url\(/.test(fill) || Number(cs.fillOpacity) * Number(cs.opacity) < 0.5) continue;
                  const colour = parse(fill); if (colour && colour.alpha >= 0.5) return colour.rgb; continue;
                }
                const colour = parse(getComputedStyle(under).backgroundColor);
                if (colour && colour.alpha >= 0.5) return colour.rgb;
              }
              return parse(getComputedStyle(document.body).backgroundColor)?.rgb ?? [255, 255, 255];
            };
            const seen = new Set(), faint = [];
            // Text only (workflow 2.19.1): an SVG shape that carries a text node is not text. A Maps cluster circle
            // holds the ids it groups ("15,16,17,18,23") and was judged as text against the map tile.
            const isText = node => !(node instanceof SVGElement) || ['text', 'tspan'].includes(node.tagName.toLowerCase());
            const candidates = [...document.querySelectorAll(selector)].flatMap(el => el.matches('text, input') ? [el]
              : [el, ...el.querySelectorAll('*')].filter(node => isText(node) && [...node.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())));
            for (const el of candidates.slice(0, 400)) {
              const text = (el.tagName.toLowerCase() === 'input' ? el.value : el.textContent).trim();
              const r = el.getBoundingClientRect();
              if (!text || seen.has(text) || r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
              const cs = getComputedStyle(el);
              // Disabled controls, decorative separators and hidden text are exempt; a tooltip left by an earlier hover is transient.
              if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.2 || el.closest('[aria-disabled="true"], .e-disabled, :disabled, [aria-hidden="true"], .e-breadcrumb-separator, [id$="_tooltip"], .e-tooltip-wrap')) continue;
              const isSvg = el instanceof SVGElement;
              const ink = parse(isSvg ? (el.getAttribute('fill') || cs.fill) : cs.color);
              if (!ink || ink.alpha < 0.2) continue;
              seen.add(text);
              // The element's own fill is its background (workflow 2.19.1): the Grid pager's current page and the
              // Scheduler's today badge are white on the accent, which the elements under them do not show.
              const own = isSvg ? null : parse(cs.backgroundColor);
              const back = own && own.alpha >= 0.5 ? own.rgb : behind(el, r.left + r.width / 2, r.top + r.height / 2);
              const [a, b] = [lum(ink.rgb), lum(back)].sort((x, y) => y - x), ratio = (a + 0.05) / (b + 0.05);
              const size = parseFloat(isSvg ? (el.getAttribute('font-size') || cs.fontSize) : cs.fontSize), bold = Number(cs.fontWeight) >= 700;
              const needed = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
              if (ratio < needed) faint.push(`"${text.slice(0, 24)}" ${ratio.toFixed(2)}:1`);
            }
            probe.remove();
            return faint;
          }, route.contrastSelector ?? config.contrastSelector ?? '.e-grid .e-rowcell, .e-grid .e-headercell, .e-pivotview td, .e-pivotview th, .e-ddl input, .e-input-group input, .e-maps text, .e-chart text, .e-accumulationchart text, .e-aiassistview, .e-breadcrumb, .e-card');
          if (faintText.length) problems.push({ check: 'low-contrast text in a control', detail: faintText.slice(0, 6).join('; ') + '; give the control\'s text a token that reads on its surface in this theme (charts and maps: the Tailwind3/Tailwind3Dark theme, labels: textStyle colour from the palette module)' });
        }

        // Fields keep their width when the window widens (syncfusion-component-patterns.md, "Filter bar"): at the
        // first size of 1280px or more, widen the window to 1920px; a field that grows by more than a fifth is
        // stretched across the row. executive-kpi-analytics's filters were 268px at 1440 (flex: 1 1 180px) and grew
        // with every wider screen; the fixed 230/190/200px fields do not.
        if (viewport === viewports[0] && viewport.width >= 1280 && route.fieldWidth !== false) {
          const widths = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-bc-field]')].map(el => [el.getAttribute('data-bc-field'),
            { width: el.getBoundingClientRect().width, name: (el.querySelector('input')?.getAttribute('aria-label') || el.closest('label')?.textContent || el.querySelector('input')?.id || 'field').trim().slice(0, 30) }])));
          const narrow = await widths();
          if (Object.keys(narrow).length) {
            await page.setViewportSize({ width: 1920, height: viewport.height }); await page.waitForTimeout(600);
            const wide = await widths();
            await page.setViewportSize({ width: viewport.width, height: viewport.height }); await settle(page, 2000);
            const grown = Object.entries(wide).filter(([i, w]) => narrow[i] && w.width > narrow[i].width * 1.2 + 4).map(([i, w]) => `${w.name} ${Math.round(narrow[i].width)}px at ${viewport.width}, ${Math.round(w.width)}px at 1920`);
            if (grown.length) problems.push({ check: 'input stretched across the page', detail: grown.slice(0, 4).join('; ') + '; give each filter field a fixed width for its content (period 230px, select 200px), see "Filter bar"' });
          }
        }

        // A map shape that looks clickable does something (syncfusion-component-patterns.md, "Maps: clickable
        // shapes"): with shape selection on, clicking the largest shape must change the page outside the map
        // (a shared filter, a detail panel) or its address. From executive-kpi-analytics: the hand cursor over
        // each country, and a click that only highlighted it. Once per theme, at the first size.
        if (viewport === viewports[0] && route.mapClick !== false) {
          for (const id of await page.evaluate(() => [...document.querySelectorAll('.e-maps[id]')].filter(map => {
            const inst = map.ej2_instances?.[0];
            return (inst?.layers ?? []).some(layer => layer.selectionSettings?.enable) || [...map.querySelectorAll('[id*="_shapeIndex_"]')].some(el => getComputedStyle(el).cursor === 'pointer');
          }).map(map => map.id))) {
            const target = await page.evaluate(id => {
              const map = document.getElementById(id); map.scrollIntoView({ block: 'center' });
              const shapes = [...map.querySelectorAll('[id*="_LayerIndex_"][id*="_shapeIndex_"]')].filter(el => !/label/i.test(el.id) && ['path', 'polygon'].includes(el.tagName.toLowerCase()))
                .map(el => ({ el, r: el.getBoundingClientRect() })).filter(({ r }) => r.width > 4 && r.height > 4).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
              for (const { el, r } of shapes) { const x = r.left + r.width / 2, y = r.top + r.height / 2; if (document.elementFromPoint(x, y) === el) return { x, y, name: el.id }; }
              return null;
            }, id);
            if (!target) continue;
            const outside = () => page.evaluate(id => { const main = document.querySelector('main') ?? document.body, map = document.getElementById(id);
              return location.href + '|' + main.innerText.replace(map?.innerText ?? '', ''); }, id);
            const before = await outside();
            await page.mouse.click(target.x, target.y); await settle(page, 2000);
            if (await outside() === before) problems.push({ check: 'map click changes nothing', detail: `${id}: clicking a shape (${target.name}) changed nothing outside the map; apply the shape as the page's filter (as the list beside it does), or turn shape selection and the pointer off` });
            await reopen();
          }
        }

        // Date presets visible (period-selection.md, workflow 2.18.4): open each DateRangePicker that has
        // presets; its preset list must show every entry without scrolling. Tailwind 3 caps the list at 192px
        // (five rows), so executive-kpi-analytics's six presets put "Full data" and "Custom Range" behind a
        // scroll. Once per theme, at the first size.
        if (viewport === viewports[0] && route.datePresets !== false) {
          const icons = await page.locator('.e-date-range-wrapper .e-range-icon').count();
          for (let i = 0; i < icons; i++) {
            const icon = page.locator('.e-date-range-wrapper .e-range-icon').nth(i);
            if (!(await icon.isVisible().catch(() => false))) continue;
            await icon.click().catch(() => {});
            const list = page.locator('.e-daterangepicker.e-popup-open .e-presets').first();
            if (await list.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) {
              await page.waitForTimeout(400); // the popup animates open
              const size = await list.evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight, items: el.querySelectorAll('li').length }));
              if (size.scroll > size.client + 1) problems.push({ check: 'date presets hidden behind a scroll', detail: `range picker ${i + 1}: ${size.items} entries in ${size.client}px of ${size.scroll}px; keep the preset list short and lift the theme's 192px cap (.e-daterangepicker.e-popup .e-presets { max-height: none; }), or use a period-list DropDownList (period-selection.md)` });
            }
            await page.keyboard.press('Escape'); await settle(page, 1000);
          }
        }

        // Clickables (design-system.md, "Interaction states"): every button, link and role="button" the app
        // draws shows the pointer, and hovering it changes more than its opacity. Tailwind 4's preflight
        // sets buttons to cursor: default; real-estate-portfolio's "Sample AI Advisor" button showed the arrow
        // and only faded to 90% on hover (2026-10-08). Syncfusion data controls keep their own cursors.
        // Once per theme, at the first size.
        if (viewport === viewports[0] && route.clickables !== false) {
          const SYNCFUSION_OWNED = '.e-schedule, .e-kanban, .e-grid, .e-pdfviewer, .e-maps, .e-chart, .e-accumulationchart, .e-ddl, .e-popup, .e-toolbar, .e-aiassistview, .e-dialog';
          const clickables = await page.evaluate(owned => [...document.querySelectorAll('button, a[href], [role="button"]')]
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && !el.disabled && !el.closest(owned); })
            .map((el, i) => { el.setAttribute('data-bc-click', String(i)); return { i, name: (el.getAttribute('aria-label') || el.textContent.trim() || el.className).slice(0, 40), cursor: getComputedStyle(el).cursor,
              // The current page's link, the selected item (aria-current) or a pressed toggle is a state, not
              // an action: it need not change on hover.
              current: (el.getAttribute('aria-current') ?? 'false') !== 'false' || el.getAttribute('aria-pressed') === 'true' }; }), SYNCFUSION_OWNED);
          const arrow = clickables.filter(c => c.cursor !== 'pointer').map(c => c.name);
          if (arrow.length) problems.push({ check: 'clickable without a pointer', detail: arrow.slice(0, 5).join('; ') + '; add cursor: pointer for buttons in the base layer (Tailwind 4 sets cursor: default)' });
          const faint = [];
          for (const c of clickables.filter(c => !c.current).slice(0, 12)) {
            const target = page.locator(`[data-bc-click="${c.i}"]`);
            const look = () => target.evaluate(el => { const cs = getComputedStyle(el); return [cs.backgroundColor, cs.borderTopColor, cs.color, cs.boxShadow, cs.textDecorationLine, cs.outlineStyle].join('|'); });
            try {
              await page.mouse.move(0, 0); await page.waitForTimeout(150);
              const before = await look(); await target.hover({ timeout: 2000 }); await page.waitForTimeout(250);
              if (await look() === before) faint.push(c.name);
            } catch { /* covered or detached: not this rule's concern */ }
          }
          await page.mouse.move(0, 0);
          if (faint.length) problems.push({ check: 'no visible hover state', detail: faint.slice(0, 5).join('; ') + '; on hover change the background, border, colour or shadow (opacity alone is too faint)' });
        }

        // Accent and focus (design-system.md, "Interaction states"), once per theme at the first size:
        // - no theme-default accent (indigo in Tailwind 3) drawn outside charts: the theme's primary follows
        //   the app's brand;
        // - a mouse click on a Grid cell or a board card draws no focus ring or selection border;
        // - every element Tab reaches looks different from its unfocused self.
        // From real-estate-portfolio (2026-10-08): violet rings on every clicked cell and card, and Kanban
        // cards, card lists and the board took keyboard focus with nothing drawn.
        if (viewport === viewports[0] && route.focus !== false) {
          const accent = await page.evaluate(([list, owned]) => {
            const rgb = list.map(h => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`);
            const hits = new Set();
            for (const el of document.querySelectorAll('body *')) {
              if (el.closest(owned)) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
              const borders = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderLeftWidth) > 0;
              for (const [prop, value] of [['color', cs.color], ['background', cs.backgroundColor], ['border', borders ? cs.borderTopColor : ''], ['outline', cs.outlineStyle !== 'none' ? cs.outlineColor : ''], ['shadow', cs.boxShadow], ['fill', cs.fill], ['stroke', cs.stroke]])
                if (value && rgb.some(c => value.includes(c))) hits.add(`${(el.id || el.getAttribute("class") || el.tagName).split(' ').slice(0, 2).join('.')} ${prop}`);
            }
            return [...hits];
          }, [themeAccentDefaults, '.e-chart, .e-accumulationchart, .e-stockchart, .e-maps']);
          if (accent.length) problems.push({ check: 'theme default accent drawn', detail: accent.slice(0, 5).join('; ') + '; map the theme\'s --color-sf-primary variables to the app\'s brand for both themes' });
          const ring = el => { const cs = getComputedStyle(el); return [cs.outlineStyle !== 'none' ? cs.outlineColor + ' ' + cs.outlineWidth : 'none', cs.boxShadow, cs.borderTopColor].join('|'); };
          const clicked = [];
          for (const target of ['.e-grid .e-row .e-rowcell', '.e-kanban .e-card']) {
            const handle = page.locator(target).first(); if (!await handle.count()) continue;
            try {
              await handle.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0); const before = await handle.evaluate(ring);
              await handle.click({ timeout: 3000 }); await page.mouse.move(0, 0); await page.waitForTimeout(300);
              const after = await handle.evaluate(ring);
              if (after !== before) clicked.push(`${target}: ${before.slice(0, 60)} -> ${after.slice(0, 60)}`);
            } catch { /* covered or detached */ }
          }
          // Pressed: the theme gives `.e-card:active` a primary border, so pressing any control inside a Card
          // (a DropDownList opens on mousedown) lit the whole panel. Hold the mouse on the first control in up
          // to four Cards (not board cards) and compare the Card's border, shadow and outline.
          const pressTargets = await page.evaluate(() => [...document.querySelectorAll('.e-card')]
            .filter(card => !card.closest('.e-kanban') && !card.parentElement?.closest('.e-card'))
            .map(card => card.querySelector('.e-ddl, .e-input-group, button, [role="combobox"], [role="button"]'))
            .filter(control => control && control.getBoundingClientRect().width > 4).slice(0, 4)
            .map((control, i) => { control.setAttribute('data-bc-press', String(i)); return i; }));
          for (const i of pressTargets) {
            const control = page.locator(`[data-bc-press="${i}"]`); const card = control.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " e-card ")][last()]');
            try {
              await control.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0); const before = await card.evaluate(ring);
              const box = await control.boundingBox(); if (!box) continue;
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(150);
              const during = await card.evaluate(ring); await page.mouse.up(); await page.keyboard.press('Escape'); await page.mouse.move(0, 0);
              if (during !== before) clicked.push(`card around ${(await control.evaluate(el => el.id || el.getAttribute('aria-label') || el.className.toString().split(' ')[0]))} while pressed: ${before.slice(0, 50)} -> ${during.slice(0, 50)}`);
            } catch { /* covered or detached */ }
          }
          if (clicked.length) problems.push({ check: 'focus ring on a mouse click', detail: clicked.join('; ') + '; show focus rings for :focus-visible only, and keep a selection that does nothing unstyled' });
          // Keyboard: snapshot every focusable element unfocused, then Tab through up to 30 stops.
          await page.evaluate(() => { document.activeElement?.blur?.(); window.__bcLook = new Map();
            for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')) { const cs = getComputedStyle(el);
              window.__bcLook.set(el, [cs.outlineStyle, cs.outlineColor, cs.outlineWidth, cs.boxShadow, cs.borderTopColor, cs.backgroundColor, cs.textDecorationLine].join('|')); } });
          await page.mouse.move(0, 0);
          const invisible = [];
          for (let i = 0; i < 30; i++) {
            await page.keyboard.press('Tab');
            const seen = await page.evaluate(() => { const el = document.activeElement; if (!el || el === document.body || !window.__bcLook.has(el)) return null;
              const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; const cs = getComputedStyle(el);
              const now = [cs.outlineStyle, cs.outlineColor, cs.outlineWidth, cs.boxShadow, cs.borderTopColor, cs.backgroundColor, cs.textDecorationLine].join('|');
              return now === window.__bcLook.get(el) ? (el.id || el.getAttribute('aria-label') || el.className?.toString() || el.tagName).split(' ').slice(0, 2).join('.').slice(0, 50) : null; });
            if (seen && !invisible.includes(seen)) invisible.push(seen);
          }
          if (invisible.length) problems.push({ check: 'keyboard focus not visible', detail: invisible.slice(0, 5).join('; ') + '; give :focus-visible an outline in the brand tone' });
          await page.keyboard.press('Escape'); await page.mouse.move(0, 0);
        }

        // Form controls (syncfusion-component-patterns.md, "Editors"): every visible input, select and text
        // area has an accessible name (a label, aria-label or aria-labelledby; never "undefined"), on the page
        // and inside each editor `routes[].open` opens: [{ "dblclick" | "click": "<selector>", "dialog":
        // "<selector>" }]. From real-estate-portfolio (2026-10-08): Kanban's default card dialog had a text
        // area exposed as "undefined", and the Scheduler's generic editor had no field for the visit's data.
        if (viewport === viewports[0]) {
          const unnamedControls = scope => page.evaluate(scope => {
            const root = scope ? document.querySelector(scope) : document;
            if (!root) return null;
            const nameOf = el => (el.labels?.[0]?.textContent || el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') ?? '')
              .split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ') || el.getAttribute('title') || '').trim();
            return [...root.querySelectorAll('input, select, textarea')]
              .filter(el => el.type !== 'hidden' && !el.matches('.e-ddl-hidden, .e-numeric-hidden, [aria-hidden="true"]') && el.offsetParent
                && el.getBoundingClientRect().width > 4)
              .filter(el => { const name = nameOf(el); return !name || /^(undefined|null)$/i.test(name); })
              .map(el => (el.id || el.getAttribute('name') || el.className.toString().split(' ')[0] || el.tagName).slice(0, 40));
          }, scope);
          const missing = (await unnamedControls(null)) ?? [];
          for (const opener of route.open ?? []) {
            try {
              const target = page.locator(opener.dblclick ?? opener.click).first();
              await target.scrollIntoViewIfNeeded();
              if (opener.dblclick) await target.dblclick({ timeout: 5000 }); else await target.click({ timeout: 5000 });
              await page.waitForSelector(opener.dialog, { state: 'visible', timeout: 5000 }); await page.waitForTimeout(400);
              const inDialog = await unnamedControls(opener.dialog);
              if (inDialog?.length) missing.push(...inDialog.map(name => `${opener.dialog} ${name}`));
              // Close the editor and make sure it is gone: Escape sometimes arrived while a Kanban dialog was still
              // opening, and its overlay then covered the page for every later step (real-estate-portfolio,
              // 2026-10-09: "e-dlg-overlay … intercepts pointer events" on the menu button). Fall back to the
              // dialog's own close or Cancel button; a dialog that will not close is a finding.
              const closed = () => page.waitForSelector(opener.dialog, { state: 'hidden', timeout: 3000 }).then(() => true, () => false);
              await page.keyboard.press('Escape');
              if (!await closed()) {
                await page.locator(`${opener.dialog} .e-dlg-closeicon-btn, ${opener.dialog} button:has-text("Cancel")`).first().click({ timeout: 3000 }).catch(() => {});
                if (!await closed()) problems.push({ check: 'editor did not close', detail: `${opener.dialog} still open after Escape and its close button` });
              }
            } catch (error) { problems.push({ check: 'editor did not open', detail: `${opener.dblclick ?? opener.click}: ${error.message.split('\n')[0]}` }); }
          }
          if (missing.length) problems.push({ check: 'form control without an accessible name', detail: missing.slice(0, 6).join('; ') + '; give each input a visible <label for>, or aria-label' });
        }

        // Wide screens: dock the sidebar, then every measured control must fit its new container.
        if (viewport.width >= 1024 && state.navVisible && route.toggleSidebar !== false && await page.locator(menuButton).count()) {
          for (const step of ['after collapse', 'after expand']) {
            try { await page.locator(menuButton).click({ timeout: Math.max(5000, Math.min(actionTimeoutMs, 15000)) }); }
            catch (error) {
              // Name what covers the button (Playwright's "… intercepts pointer events" line), not only the timeout.
              const why = error.message.split('\n').filter(line => /intercepts pointer events|not stable|not visible|not enabled/.test(line)).at(-1)?.trim();
              problems.push({ check: 'menu button not clickable ' + step, detail: error.message.split('\n')[0] + (why ? ' — ' + why : '') }); break;
            }
            await page.waitForTimeout(1200);
            const sizes = await page.evaluate(measured => [...document.querySelectorAll(measured)]
              .filter(el => !el.parentElement?.closest(measured))
              .map(el => { // Charts and Maps draw into their own svg; every other control is measured by its box.
                const svg = el.matches('.e-chart, .e-accumulationchart, .e-maps') ? el.querySelector('svg') : null; const parent = el.parentElement.getBoundingClientRect();
                return { id: el.id || el.className.split(' ')[0], width: Math.round((svg ?? el).getBoundingClientRect().width), container: Math.round(parent.width) }; }), MEASURED);
            const stale = sizes.filter(size => size.width > size.container + 2 || size.width < size.container * 0.8);
            if (stale.length) problems.push({ check: 'control did not re-measure ' + step, detail: stale });
          }
        }

        const shot = join(screenshotDir, [route.name, themeName, viewport.name].join('-') + '.png');
        await page.screenshot({ path: shot, fullPage: true });
        results.push({ route: route.name, theme: themeName, viewport: viewport.name, controls: state.controls,
          trialBanner: state.banner, screenshot: shot, passed: problems.length === 0, problems });
      }
      await context.close();
  });
  // Parallel workers finish in any order; report in theme, size, route order.
  const order = (list, value) => list.indexOf(value);
  results.sort((a, b) => order(Object.keys(themes), a.theme) - order(Object.keys(themes), b.theme)
    || order(viewports.map(v => v.name), a.viewport) - order(viewports.map(v => v.name), b.viewport)
    || order(routes.map(r => r.name), a.route) - order(routes.map(r => r.name), b.route));

  // Theme switch (syncfusion-component-patterns.md, "Charts"): with config `themeSwitch: { button: "<accessible
  // name regex>" }`, each route loads in one theme, the app's own toggle switches it, and every chart's axis,
  // legend and title text must match a fresh load of the target theme. Syncfusion 35.1.37 keeps the first
  // theme's text colours when `theme` changes on a live chart: real-estate-portfolio's NOI axis labels stayed
  // #FFFFFFE6 on a white card after dark -> light (2026-10-08, 5 of 5 runs).
  if (themeSwitch) {
    const viewport = viewports[0] ?? { name: 'wide', width: 1440, height: 900 };
    const names = Object.keys(themes);
    const chartText = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.e-chart[id], .e-accumulationchart[id], .e-stockchart[id]')].map(c => [c.id,
      [...new Set([...c.querySelectorAll('text[id*="AxisLabel"], text[id*="AxisTitle"], text[id*="_legend_text"], text[id*="_ChartTitle"]')].map(t => t.getAttribute('fill')))].sort().join(',')])));
    const open = async themeName => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const theme = themes[themeName];
      // Only the first load takes the stored theme; after the toggle the app's own choice stands.
      if (theme.localStorage) await context.addInitScript(entries => {
        if (sessionStorage.getItem('__bc_theme')) return; sessionStorage.setItem('__bc_theme', '1');
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      }, theme.localStorage);
      return { context, page: await context.newPage() };
    };
    for (const route of routes.filter(r => r.themeSwitch !== false)) {
      for (const from of names) for (const to of names.filter(n => n !== from)) {
        const problems = [];
        const url = new URL(route.path, baseUrl).href;
        const a = await open(from); await a.page.goto(url, { waitUntil: 'networkidle' }); await settle(a.page, settleCap(route));
        await routeActions(a.page, route, [], false);
        const before = await chartText(a.page);
        if (!Object.keys(before).length) { await a.context.close(); continue; }
        try { await a.page.getByRole('button', { name: new RegExp(themeSwitch.button, 'i') }).first().click({ timeout: 5000 }); }
        catch (error) { problems.push({ check: 'theme toggle not found', detail: error.message.split('\n')[0] }); }
        await settle(a.page, Math.max(2 * (themeSwitch.settleMs ?? 2500), 4000));
        const switched = await chartText(a.page); await a.context.close();
        const b = await open(to); await b.page.goto(url, { waitUntil: 'networkidle' }); await settle(b.page, settleCap(route));
        await routeActions(b.page, route, [], false);
        const fresh = await chartText(b.page); await b.context.close();
        const stale = Object.keys(fresh).filter(id => switched[id] !== undefined && switched[id] !== fresh[id]);
        if (stale.length) problems.push({ check: 'chart text kept the old theme', detail: stale.map(id => `${id}: ${switched[id]} after the switch, ${fresh[id]} on a fresh load`).join('; ') + '; re-create the chart when the theme changes (key={theme})' });
        results.push({ route: route.name, theme: `${from}->${to}`, viewport: 'theme-switch', charts: Object.keys(fresh).length, passed: problems.length === 0, problems });
      }
    }
  }

  // Loading states (app-source-baseline.md, "Loading states"): run against the served production build
  // (server.mjs or vite preview), never the dev server. Each route loads on a throttled network with an
  // empty cache and is sampled every `sampleMs` from the first parsed body until it settles. Every sample must
  // show either a loading indicator (a visible role="status" / progressbar / aria-busy region, or a
  // Syncfusion spinner), a message (role="alert"), or the page: a visible <main> heading with every
  // stylesheet loaded; a visible PDF Viewer must have a page drawn or an indicator. Large same-origin
  // scripts, stylesheets and wasm must arrive compressed. From real-estate-portfolio on Azure (2026-10-07):
  // blank for 2.5 s, then an unstyled page until a 4.8 MB uncompressed theme bundle arrived.
  if (loading) {
    const NETWORKS = { fast3g: { latency: 563, downloadThroughput: 188743, uploadThroughput: 86400 },
      slow4g: { latency: 150, downloadThroughput: 1258291, uploadThroughput: 86400 } };
    // latencyMs: the host's first-byte wait (about 1200 for Azure App Service reached from another continent,
    // where every request of real-estate-portfolio waited 1.1-1.3 s, 2026-10-09).
    const network = { ...(typeof loading.network === 'object' ? loading.network : NETWORKS[loading.network ?? 'fast3g']),
      ...(loading.latencyMs != null ? { latency: loading.latencyMs } : {}) };
    // The app frame (workflow 2.17.0): a header or navigation, the shell's or index.html's static #app-boot.
    const frameSelector = loading.frame ?? '#app-boot .boot-head, #app-boot nav, #app-boot ul, .app-shell-header, header, nav, [role="navigation"]';
    const { sampleMs = 250, timeoutMs = 90000, minCompressKb = 100 } = loading;
    const viewport = loading.viewport ?? viewports[0];
    const origin = new URL(baseUrl).origin;
    for (const [themeName, theme] of Object.entries(themes)) {
      for (const route of routes) {
        // A view reached through the shell (`navigate`) or a CTA has no address of its own: the navigation
        // pass below covers it.
        if (route.loading === false || route.navigate || route.click?.length) continue;
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        if (theme.localStorage) await context.addInitScript(entries => {
          for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
        }, theme.localStorage);
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await cdp.send('Network.emulateNetworkConditions', { offline: false, ...network });
        const uncompressed = [];
        page.on('response', async response => {
          const url = new URL(response.url());
          if (url.origin !== origin || response.status() !== 200 || !/\.(m?js|css|wasm|json|svg|html?)$/i.test(url.pathname)) return;
          if (response.headers()['content-encoding']) return;
          try { const kb = Math.round((await response.body()).length / 1024); if (kb >= minCompressKb) uncompressed.push(`${url.pathname.split('/').pop()} ${kb} KB`); } catch { /* body gone after navigation */ }
        });
        const t0 = Date.now();
        const url = new URL(route.path, baseUrl);
        for (const [key, value] of Object.entries(theme.query ?? {})) url.searchParams.set(key, value);
        page.goto(url.href, { waitUntil: 'commit', timeout: timeoutMs }).catch(() => {});
        const samples = []; let settledSince = 0;
        while (Date.now() - t0 < timeoutMs) {
          await page.waitForTimeout(sampleMs);
          const s = await page.evaluate(frameSel => {
            if (!document.body) return null;
            const shown = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
              return r.width >= 16 && r.height >= 16 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 && r.bottom > 0 && r.top < innerHeight; };
            const indicator = [...document.querySelectorAll('[role="status"], [role="progressbar"], [aria-busy="true"], .e-spinner-pane.e-spin-show')].some(shown);
            const message = [...document.querySelectorAll('[role="alert"]')].some(el => shown(el) && el.innerText.trim());
            const heading = [...document.querySelectorAll('main h1, [role="main"] h1')].some(shown);
            // A <link> has a `sheet` as soon as it is inserted, before its file arrives: a loading sheet has no
            // rules yet (workflow 2.18.1). A cross-origin sheet hides its rules; count it as loaded.
            const loading = l => { if (!l.sheet) return true; try { return l.sheet.cssRules.length === 0; } catch { return false; } };
            const pendingSheets = [...document.querySelectorAll('link[rel="stylesheet"]')].filter(l => !l.disabled && loading(l)).map(l => l.href.split('/').pop());
            const frame = [...document.querySelectorAll(frameSel)].some(shown);
            // Loading indicators per area (a card, or the page): the app's own (role="status" with "Loading") and
            // Syncfusion's built-in spinners, which show through a translucent overlay (the PDF Viewer's own
            // spinner under "Loading document…" in real-estate-portfolio, 2026-10-10).
            const perArea = new Map();
            for (const el of [...document.querySelectorAll('[role="status"], .e-spinner-pane.e-spin-show')]) {
              if (!shown(el) || (el.matches('[role="status"]') && !/loading/i.test(el.innerText))) continue;
              if (el.closest('[role="status"]') !== el && el.matches('.e-spinner-pane') && el.closest('[role="status"]')) continue;
              const area = el.closest('.e-card, main, #app-boot') ?? document.body;
              perArea.set(area, (perArea.get(area) ?? 0) + 1);
            }
            const loadingCount = Math.max(0, ...perArea.values());
            const blankViewers = [...document.querySelectorAll('.e-pdfviewer')].filter(shown)
              .filter(v => !v.querySelector('.e-pv-page-div canvas, .e-pv-page-div img[src]')).length;
            return { indicator, message, heading, pendingSheets, blankViewers, frame, loadingCount };
          }, frameSelector).catch(() => null);
          if (!s) continue;
          const at = Date.now() - t0;
          const state = s.indicator || s.message ? 'indicator'
            : !s.heading ? 'blank'
            : s.pendingSheets.length ? 'unstyled'
            : s.blankViewers ? 'document blank' : 'content';
          samples.push({ at, state, sheets: s.pendingSheets, frame: s.frame, loadingCount: s.loadingCount });
          settledSince = state === 'content' ? (settledSince || at) : 0;
          if (settledSince && at - settledSince >= 1500) break;
        }
        // Collapse the samples into runs, e.g. "blank 0-2250 ms".
        const runs = [];
        for (const sample of samples) {
          const last = runs.at(-1);
          if (last && last.state === sample.state) last.to = sample.at; else runs.push({ state: sample.state, from: sample.at, to: sample.at, sheets: sample.sheets });
        }
        const problems = [];
        const bad = runs.filter(r => r.state !== 'indicator' && r.state !== 'content');
        if (bad.length) problems.push({ check: 'page blank while loading', detail: bad.map(r => `${r.state} ${r.from}-${r.to} ms${r.state === 'unstyled' ? ' (' + r.sheets.join(', ') + ' still loading)' : ''}`).join('; ') + '; show a loading indicator (index.html, the route Suspense fallback, heavy controls) until the content and its stylesheets are ready' });
        if (!samples.some(sample => sample.state === 'content')) problems.push({ check: 'page never finished loading', detail: `no settled content within ${timeoutMs} ms` });
        // Frame first (workflow 2.17.0): the first thing shown is the app's frame with the page's loading
        // indicator, not a full-window splash. real-estate-portfolio showed "Loading Real Estate Portfolio…"
        // alone for the first second on Azure (2026-10-09).
        const firstShown = samples.find(sample => sample.state !== 'blank');
        if (loading.requireFrame !== false && firstShown && !firstShown.frame)
          problems.push({ check: 'no frame at first paint', detail: `${firstShown.state} at ${firstShown.at} ms without the app's header or navigation; draw the frame and the page's loading text from index.html (#app-boot, template factory/templates/react/loading/index.loading.html)` });
        // One indicator per area (workflow 2.17.1): real-estate-portfolio's viewer panel showed "Loading document
        // viewer…" and "Loading document…" together for about 2 s.
        const doubled = samples.find(sample => sample.loadingCount > 1);
        if (doubled) problems.push({ check: 'more than one loading indicator', detail: `${doubled.loadingCount} in one area at ${doubled.at} ms; show one indicator per area (a lazy control's fallback under an existing overlay draws nothing; hide a Syncfusion control's own spinner, .e-spinner-pane, while the app's overlay covers it)` });
        if (uncompressed.length) problems.push({ check: 'assets not compressed', detail: uncompressed.slice(0, 6).join('; ') + '; serve Brotli or gzip (precompressed copies from the build, Content-Encoding by Accept-Encoding)' });
        const first = state => samples.find(sample => sample.state === state)?.at ?? null;
        results.push({ route: route.name, theme: themeName, viewport: 'loading-' + (loading.network ?? 'custom'),
          timings: { firstIndicatorMs: first('indicator'), firstFrameMs: samples.find(sample => sample.frame)?.at ?? null, contentMs: first('content'), latencyMs: network.latency },
          runs: runs.map(({ sheets, ...r }) => r),
          passed: problems.length === 0, problems });
        await context.close();
      }
      // Page changes (workflow 2.17.1): open the first route, then click each other route's link in the shell.
      // React Router runs a page change as a transition, and React then keeps the previous page, without an
      // indicator, while the next page's code downloads (real-estate-portfolio, 2026-10-10: about 1.4 s on
      // every page at 1.2 s per request) unless the route's Suspense boundary is new for each page.
      if (loading.navigation !== false && routes.length > 1) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        if (theme.localStorage) await context.addInitScript(entries => {
          for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
        }, theme.localStorage);
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await cdp.send('Network.emulateNetworkConditions', { offline: false, ...network });
        const problems = [], timings = [];
        const look = () => page.evaluate(() => {
          const shown = el => { const r = el.getBoundingClientRect(); return r.width >= 16 && r.height >= 16 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden'; };
          return { heading: document.querySelector('main h1, [role="main"] h1, h1')?.innerText ?? '',
            indicator: [...document.querySelectorAll('[role="status"], [role="progressbar"], .e-spinner-pane.e-spin-show')].some(shown) };
        }).catch(() => null);
        await page.goto(new URL(routes[0].path, baseUrl).href, { waitUntil: 'networkidle', timeout: timeoutMs }).catch(() => {});
        await page.waitForFunction(() => !!document.querySelector('main h1, h1') && !document.getElementById('app-boot'), null, { timeout: timeoutMs }).catch(() => {});
        for (const route of routes.slice(1).filter(r => r.loading !== false && !r.click?.length)) {
          const target = route.path.replace(/^\.?\//, '').replace(/\/$/, '');
          const link = route.navigate ? page.getByRole('link', { name: route.navigate }).first() : page.locator(`a[href$="/${target}"]`).first();
          if (!await link.count()) continue;
          const before = (await look())?.heading;
          const t0 = Date.now(); await link.click({ timeout: 10000 }).catch(() => {});
          let stale = null, done = null;
          while (Date.now() - t0 < timeoutMs) {
            await page.waitForTimeout(100);
            const s = await look(); if (!s) continue;
            const at = Date.now() - t0;
            if (s.heading && s.heading !== before && !s.indicator) { done = at; break; }
            if (!s.indicator && s.heading === before && at > 500 && stale == null) stale = at;
          }
          timings.push({ route: route.name, newPageMs: done });
          if (stale != null) problems.push({ check: 'no indicator while navigating', detail: `${route.name}: the previous page ("${before}") still shown without an indicator ${stale} ms after the click; key the route Suspense boundary by the page so each page change shows "Loading <page>…"` });
        }
        results.push({ route: 'navigation', theme: themeName, viewport: 'loading-navigation', timings, passed: problems.length === 0, problems });
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
const failedCount = results.filter(result => !result.passed).length;
process.stdout.write(JSON.stringify({ checkedAt: new Date().toISOString(), baseUrl, durationMs: Date.now() - startedAt, concurrency, passed: failedCount === 0, failed: failedCount, total: results.length, analyticsRequests, results }, null, 2) + '\n');
process.exitCode = failedCount ? 1 : 0;
