// Sends every local analysis of an election to the hosted site.
// Usage: npx tsx scripts/push.ts <slug>
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../server/lib/config.ts';
import { pushAnalyses } from '../server/lib/worker.ts';

const slug = process.argv[2];
const dir = path.join(DATA_DIR, slug, 'analysis');
const files = await fs.readdir(dir);
for (let i = 0; i < files.length; i += 50) {
  const batch = await Promise.all(files.slice(i, i + 50).map(async (f) => JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'))));
  await pushAnalyses(slug, batch);
  console.log(`${Math.min(i + 50, files.length)}/${files.length}`);
}
