import { buildSummary } from '../server/lib/summary.ts';
for (const slug of process.argv.slice(2)) {
  const s = await buildSummary(slug);
  console.log(slug, s.totals);
}
