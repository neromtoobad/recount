// Joins index.part-*.json slices written by index-irev.mjs into one index.json.
// Usage: node scripts/merge-index.mjs <slug>
import fs from 'node:fs/promises';
import path from 'node:path';

const dir = path.join('data', process.argv[2]);
const parts = (await fs.readdir(dir)).filter((f) => /^index\.part-\d+\.json$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
const pus = [];
let election;
for (const f of parts) {
  const j = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
  election ??= j.election;
  pus.push(...j.pus);
}
const seen = new Set();
const unique = pus.filter((p) => !seen.has(p.id) && seen.add(p.id));
await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify({ election: { ...election, pus: unique.length, indexedAt: new Date().toISOString() }, pus: unique }, null, 1));
console.log(`${parts.length} parts, ${unique.length} PUs`);
