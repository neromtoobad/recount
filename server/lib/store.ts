import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.ts';
import type { Summary } from './summary.ts';
import type { Analysis, PU } from './types.ts';

export type Election = {
  slug: string;
  title: string;
  // Election day, YYYY-MM-DD.
  date: string | null;
  pus: PU[];
  analyses: Map<string, Analysis>;
  summary: Summary;
};

// Every analysis of an election, held in memory and reloaded whenever the summary is
// rebuilt (the batch runner's ingest rebuilds it), so the query endpoints stay fast.
const cache = new Map<string, { mtime: number; election: Promise<Election> }>();

export async function loadElection(slug: string): Promise<Election | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const dir = path.join(DATA_DIR, slug);
  const stat = await fs.stat(path.join(dir, 'summary.json')).catch(() => null);
  if (!stat) return null;
  const hit = cache.get(slug);
  if (hit && hit.mtime === stat.mtimeMs) return hit.election;
  const election = read(slug, dir);
  cache.set(slug, { mtime: stat.mtimeMs, election });
  election.catch(() => cache.delete(slug));
  return election;
}

async function read(slug: string, dir: string): Promise<Election> {
  const index = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8')) as { election: { title?: string; date?: string }; pus: PU[] };
  const summary = JSON.parse(await fs.readFile(path.join(dir, 'summary.json'), 'utf8')) as Summary;
  const files = await fs.readdir(path.join(dir, 'analysis')).catch(() => [] as string[]);
  const analyses = new Map<string, Analysis>();
  for (let i = 0; i < files.length; i += 200) {
    const batch = await Promise.all(files.slice(i, i + 200).map((f) =>
      fs.readFile(path.join(dir, 'analysis', f), 'utf8').then((t) => JSON.parse(t) as Analysis).catch(() => null)));
    for (const a of batch) if (a) analyses.set(a.pu.id, a);
  }
  return { slug, title: index.election.title ?? slug, date: index.election.date ?? null, pus: index.pus, analyses, summary };
}
