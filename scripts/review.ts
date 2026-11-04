// Second look: Muse Spark re-reads the entries behind each numeric flag and says whether the
// problem is on the paper or in the first reading. Writes the result into each analysis and
// sends it to the hosted site.
// Usage: npx tsx scripts/review.ts <slug> [--limit 20] [--concurrency 8] [--no-push]
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import { DATA_DIR } from '../server/lib/config.ts';
import { reviewable, reviewSheet } from '../server/lib/review.ts';
import { pushAnalyses } from '../server/lib/worker.ts';
import type { Analysis } from '../server/lib/types.ts';

const slug = process.argv[2];
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const limit = Number(arg('--limit') ?? Infinity), push = !process.argv.includes('--no-push');
const dir = path.join(DATA_DIR, slug, 'analysis');

const all: Analysis[] = [];
for (const f of await fs.readdir(dir)) all.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')));
// Serious flags first, so the sheets that matter most are covered if the run is cut short.
const rank = (a: Analysis) => Math.min(...a.flags.map((f) => ({ high: 0, medium: 1, low: 2 })[f.severity]));
const todo = all.filter((a) => reviewable(a) && !a.review).sort((p, q) => rank(p) - rank(q)).slice(0, limit);
console.log(`${slug}: ${all.filter(reviewable).length} sheets with numeric flags, ${todo.length} to review`);

const tally = { on_sheet: 0, misread: 0, unclear: 0 };
let done = 0, failed = 0, batch: Analysis[] = [];
const started = Date.now();
const flush = async () => { if (push && batch.length) { const b = batch; batch = []; await pushAnalyses(slug, b).catch((e) => console.log(`push failed: ${e.message}`)); } };
const run = pLimit(Number(arg('--concurrency') ?? 8));
await Promise.all(todo.map((a) => run(async () => {
  try {
    a.review = await reviewSheet(a);
    for (const it of a.review.items) tally[it.verdict]++;
    await fs.writeFile(path.join(dir, `${a.pu.id}.json`), JSON.stringify(a));
    batch.push(a);
    if (batch.length >= 20) await flush();
  } catch (err) {
    failed++;
    console.log(`${a.pu.puCode} failed: ${(err as Error).message}`);
  }
  if (++done % 10 === 0 || done === todo.length) {
    console.log(`${done}/${todo.length} · on sheet ${tally.on_sheet} · misread ${tally.misread} · unclear ${tally.unclear} · ${failed} failed · ${(done / ((Date.now() - started) / 60000)).toFixed(1)}/min`);
  }
})));
await flush();
