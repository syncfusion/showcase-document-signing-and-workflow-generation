#!/usr/bin/env node
// Evidence runner (factory/standards/app-source-baseline.md, "Browser evidence"; workflow 2.16.0).
// Runs an app's phase checks from one plan file: build once, serve the build once, run the serial checks,
// then the rest a few at a time, each into its own log; a check expected to fail (a negative run) passes
// when it fails. With --reuse <phase>, checks marked reusable are not run again: their passing logs from
// that phase are listed with `reusedFrom`, and `factory.mjs submit` accepts them only while the log and the
// app's source are exactly what that phase recorded.
//
// Usage (from frontend/react):
//   node run-evidence.mjs --plan evidence-plan.json --phase build [--concurrency 3] [--only a,b] [--reuse build]
// Writes <logDir>/<phase>-run-summary.json (every step, exit code, duration; paths relative to the app folder,
// so it can be committed) and <logDir>/<phase>-checks.json
// (the `checks` list for validation/<phase>-evidence.json). Exit code 0 = every check met its expectation.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const plan = JSON.parse(readFileSync(option('plan') ?? 'evidence-plan.json', 'utf8'));
const phase = option('phase') ?? plan.phase;
if (!phase) throw new Error('--phase is required');
const concurrency = Math.max(1, Number(option('concurrency') ?? plan.concurrency ?? 3));
const reuse = option('reuse');
const only = option('only')?.split(',');
const logDir = resolve(plan.logDir ?? '../../validation/logs');
const appDir = resolve(plan.appDir ?? '../..'); // paths in the evidence file are relative to the app folder
mkdirSync(logDir, { recursive: true });
const fill = text => String(text).replaceAll('{phase}', phase);
const steps = plan.steps.filter(step => !step.phases || step.phases.includes(phase)).filter(step => !only || only.includes(step.name))
  .map(step => ({ ...step, command: fill(step.command), log: join(logDir, fill(step.log)) }));

const run = (command, logPath, env = {}) => new Promise(done => {
  const started = Date.now();
  const out = logPath ? createWriteStream(logPath) : null; let stderr = '';
  // A text log names its command and ends with the exit code, so a silent success (tsc) is not an empty
  // log, which factory.mjs submit refuses. A JSON log stays the command's own output.
  const text = logPath && !/\.json$/.test(logPath);
  if (out && text) out.write(`$ ${command}  (${new Date().toISOString()})\n`);
  const child = spawn('/bin/sh', ['-c', command], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => out ? out.write(chunk) : null);
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('close', code => {
    const finish = () => done({ code, ms: Date.now() - started, stderr: stderr.slice(-4000) });
    // A log that is not JSON (a command's text output) also keeps stderr, so a failure explains itself.
    if (out) { if (text) out.write(stderr + `exit ${code}\n`); out.end(finish); } else finish();
  });
});

const summary = { phase, startedAt: new Date().toISOString(), concurrency, reuse: reuse ?? null, steps: [] };
const t0 = Date.now();
let server = null;
try {
  // Build only when a check that runs needs the build (served, or reading dist/).
  if (plan.build && steps.some(step => (step.needsServer || step.needsBuild) && !(reuse && step.reusable))) {
    const r = await run(plan.build, join(logDir, phase + '-build.log'));
    summary.steps.push({ name: 'build', command: plan.build, log: join(logDir, phase + '-build.log'), exit: r.code, ms: r.ms });
    if (r.code) throw new Error('build failed (' + phase + '-build.log)');
  }
  if (plan.serve && steps.some(step => step.needsServer && !(reuse && step.reusable))) {
    // The built app, not the dev server: faster loads, and nothing can stop it part-way. Refuse a port that
    // already answers: a server left over from an earlier run served a stale index.html whose scripts no
    // longer existed, and every browser check failed against it (real-estate-portfolio, 2026-10-10).
    if (await fetch(plan.serve.health).then(res => res.ok, () => false)) throw new Error('port already in use: ' + plan.serve.health + ' answers before the build is served; stop the other server');
    server = spawn('/bin/sh', ['-c', 'exec ' + plan.serve.command], { env: { ...process.env, ...(plan.serve.env ?? {}) }, stdio: 'ignore' });
    for (let i = 0; i < 60; i++) {
      if (await fetch(plan.serve.health).then(res => res.ok, () => false)) break;
      if (i === 59) throw new Error('server did not answer ' + plan.serve.health);
      await new Promise(r => setTimeout(r, 500));
    }
  }
  const record = async step => {
    if (reuse && step.reusable) {
      const from = join(logDir, step.log.split('/').pop().replace(new RegExp('^' + phase + '-'), reuse + '-'));
      const exists = existsSync(from) && statSync(from).size > 0;
      summary.steps.push({ name: step.name, command: step.command, log: from, reusedFrom: reuse, exit: exists ? 0 : null, ms: 0,
        met: exists, note: exists ? 'reused' : 'no log to reuse' });
      return;
    }
    const r = await run(step.command, step.log, step.env);
    // A negative run proves something only if the check ran and reported its failures: a crash also exits
    // non-zero, so the log must be non-empty (and parse, when it is JSON). Its stderr is always kept.
    const reported = () => { try { const body = readFileSync(step.log, 'utf8'); if (!body.trim()) return false; if (/\.json$/.test(step.log)) JSON.parse(body); return true; } catch { return false; } };
    const met = step.expect === 'fail' ? r.code !== 0 && reported() : r.code === 0;
    summary.steps.push({ name: step.name, command: step.command, log: step.log, exit: r.code, ms: r.ms, met, expect: step.expect ?? 'pass',
      ...(met && step.expect !== 'fail' ? {} : { stderr: r.stderr }) });
    process.stderr.write(`${met ? 'ok  ' : 'FAIL'} ${step.name} (${(r.ms / 1000).toFixed(1)} s)\n`);
  };
  for (const step of steps.filter(step => step.serial)) await record(step);
  const queue = steps.filter(step => !step.serial);
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => { while (queue.length) await record(queue.shift()); }));
} finally {
  if (server) server.kill();
}
summary.durationMs = Date.now() - t0;
const order = name => plan.steps.findIndex(step => step.name === name);
summary.steps.sort((a, b) => order(a.name) - order(b.name));
// The summary is committed with the evidence, so it names logs relative to the app folder and rewrites any
// absolute repository or home path a command printed (workflow 2.18.2: run summaries held the machine's
// absolute paths, so executive-kpi-analytics kept them out of git).
const repoRoot = resolve(appDir, '../..');
const portable = text => String(text).replaceAll(repoRoot + '/', '').replaceAll(repoRoot, '.').replaceAll(homedir(), '~');
const written = { ...summary, steps: summary.steps.map(step => ({ ...step, log: relative(appDir, step.log),
  ...(step.stderr ? { stderr: portable(step.stderr) } : {}) })) };
writeFileSync(join(logDir, phase + '-run-summary.json'), JSON.stringify(written, null, 2) + '\n');
const checks = summary.steps.filter(step => step.name !== 'build').map(step => ({
  name: plan.steps.find(s => s.name === step.name)?.title ?? step.name, command: step.command, result: step.met ? 'passed' : 'failed',
  log: relative(appDir, step.log), ...(step.reusedFrom ? { reusedFrom: step.reusedFrom } : {}),
  // A negative run keeps its expectation (workflow 2.19.1), so the browser evidence gate can tell a proof
  // that the earlier source fails from a failing run recorded as passed.
  ...(step.expect === 'fail' ? { expect: 'fail' } : {}) }));
writeFileSync(join(logDir, phase + '-checks.json'), JSON.stringify(checks, null, 2) + '\n');
process.stderr.write(`${summary.steps.filter(s => !s.met && s.name !== 'build').length ? 'FAILED' : 'passed'}: ${checks.length} checks in ${(summary.durationMs / 60000).toFixed(1)} min (${concurrency} at a time)\n`);
process.exitCode = summary.steps.some(s => s.name !== 'build' && !s.met) ? 1 : 0;
