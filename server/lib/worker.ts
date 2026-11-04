import fs from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import { analyzePU } from './analyze.ts';
import { buildSummary } from './summary.ts';
import { DATA_DIR } from './config.ts';
import type { PU } from './types.ts';

export type RunOpts = { limit?: number; lga?: string; concurrency?: number; retryErrors?: boolean; push?: boolean; log?: (m: string) => void };

// With PUSH_URL and INGEST_TOKEN set, each analysis is also sent to the hosted site.
export async function pushAnalyses(slug: string, items: unknown[]) {
  const base = process.env.PUSH_URL?.replace(/\/$/, '');
  if (!base) throw new Error('PUSH_URL not set');
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(`${base}/api/ingest/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.INGEST_TOKEN}` },
        body: JSON.stringify(items),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`ingest ${res.status}`);
      return;
    } catch (err) {
      if (i >= 4) throw err;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

// Ask the image proxy to fetch a sheet before Meta does, so Meta's fetch is a cache hit.
async function warm(url: string) {
  const base = process.env.IMAGE_PROXY_BASE?.replace(/\/$/, '');
  if (!base) return;
  await fetch(`${base}/img/warm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ u: url }), signal: AbortSignal.timeout(90_000),
  }).catch(() => {});
}

// Reads every not-yet-analysed sheet of one election, one JSON file per PU, so a run
// can stop and resume. The summary is rebuilt every 100 sheets so the site fills in live.
export async function runElection(slug: string, opts: RunOpts = {}) {
  const log = opts.log ?? console.log;
  const dir = path.join(DATA_DIR, slug);
  const outDir = path.join(dir, 'analysis');
  await fs.mkdir(outDir, { recursive: true });
  const { pus } = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8')) as { pus: PU[] };

  const done = new Set<string>();
  for (const f of await fs.readdir(outDir)) {
    if (!opts.retryErrors) { done.add(f.replace('.json', '')); continue; }
    const a = JSON.parse(await fs.readFile(path.join(outDir, f), 'utf8'));
    if (!a.error) done.add(f.replace('.json', ''));
  }
  const todo = pus
    .filter((p) => !done.has(p.id))
    .filter((p) => !opts.lga || p.lga === opts.lga.toUpperCase())
    .slice(0, opts.limit ?? Infinity);
  log(`[${slug}] ${todo.length} to analyse (${done.size} done already)`);

  const run = pLimit(opts.concurrency ?? 6);
  let n = 0, errors = 0;
  const started = Date.now();
  let summarising: Promise<unknown> = Promise.resolve();
  await Promise.all(todo.map((pu) => run(async () => {
    if (pu.sheetUrl) await warm(pu.sheetUrl);
    const a = await analyzePU(pu);
    if (a.error) errors++;
    await fs.writeFile(path.join(outDir, `${pu.id}.json`), JSON.stringify(a));
    if (opts.push) await pushAnalyses(slug, [a]).catch((err) => log(`[${slug}] push failed for ${pu.puCode}: ${err.message}`));
    n++;
    if (n % 25 === 0 || n === todo.length) {
      log(`[${slug}] ${n}/${todo.length} (${errors} errors, ${(n / ((Date.now() - started) / 60000)).toFixed(1)}/min)`);
    }
    if (n % 100 === 0) summarising = summarising.then(() => buildSummary(slug));
  })));
  await summarising;
  await buildSummary(slug);
  log(`[${slug}] finished`);
}

// On a fresh volume, copy the bundled indexes in so the worker has something to read.
export async function seedDataDir(bundled = 'data') {
  if (path.resolve(bundled) === path.resolve(DATA_DIR)) return;
  for (const slug of await fs.readdir(bundled)) {
    for (const file of ['index.json', 'declared.json', 'demo-check.json']) {
      const from = path.join(bundled, slug, file), to = path.join(DATA_DIR, slug, file);
      const exists = await fs.access(to).then(() => true, () => false);
      const source = await fs.access(from).then(() => true, () => false);
      if (source && !exists) {
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.copyFile(from, to);
      }
    }
    const hasSummary = await fs.access(path.join(DATA_DIR, slug, 'summary.json')).then(() => true, () => false);
    const hasIndex = await fs.access(path.join(DATA_DIR, slug, 'index.json')).then(() => true, () => false);
    if (hasIndex && !hasSummary) await buildSummary(slug);
  }
}
