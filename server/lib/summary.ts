import fs from 'node:fs/promises';
import path from 'node:path';
import { duplicateSerials } from './checks.ts';
import type { Analysis, Flag, PU } from './types.ts';
import { DATA_DIR } from './config.ts';

const SEV_RANK = { high: 3, medium: 2, low: 1 } as const;

// A few sheets spell a party's full name instead of its ballot acronym.
const PARTY_ALIAS: Record<string, string> = { ACCORD: 'A' };
export const partyName = (raw: string) => {
  const k = raw.toUpperCase().replace(/[^A-Z]/g, '');
  return PARTY_ALIAS[k] ?? k;
};

export type PURow = {
  id: string;
  puCode: string;
  name: string;
  lga: string;
  ward: string;
  status: 'clean' | 'flagged' | 'missing' | 'error' | 'pending';
  severity: Flag['severity'] | null;
  flags: string[];
  validVotes: number | null;
  leader: string | null;
};

export type Summary = {
  slug: string;
  title: string;
  totals: {
    pollingUnits: number;
    sheets: number;
    analysed: number;
    errors: number;
    clean: number;
    flagged: number;
    highSeverity: number;
  };
  flagCounts: Record<string, { count: number; title: string; severity: Flag['severity'] }>;
  tally: { party: string; votes: number; cleanVotes: number }[];
  declared: { party: string; votes: number }[] | null;
  lgas: {
    name: string;
    pollingUnits: number;
    analysed: number;
    flagged: number;
    tally: Record<string, number>;
  }[];
  duplicates: { serial: string; puCodes: string[] }[];
  // Sheets uploaded to IReV per hour (UTC hour start), from polling day until the last upload.
  uploads: { t: string; n: number }[];
  replaced: number;
  updatedAt: string;
};

export async function buildSummary(slug: string): Promise<Summary> {
  const dir = path.join(DATA_DIR, slug);
  const index = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8')) as {
    election: { title?: string }; pus: PU[];
  };
  const analyses = new Map<string, Analysis>();
  for (const f of await fs.readdir(path.join(dir, 'analysis')).catch(() => [])) {
    const a = JSON.parse(await fs.readFile(path.join(dir, 'analysis', f), 'utf8')) as Analysis;
    analyses.set(a.pu.id, a);
  }

  // Duplicate serials are a cross-sheet check, so they are added after per-sheet checks.
  const dupes = duplicateSerials([...analyses.values()].map((a) => ({ pu: a.pu, read: a.read })));
  const dupeByPu = new Map<string, string>();
  for (const [sn, codes] of dupes) for (const c of codes) dupeByPu.set(c, sn);
  for (const a of analyses.values()) {
    const sn = dupeByPu.get(a.pu.puCode);
    if (sn && !a.flags.some((f) => f.code === 'duplicate')) {
      const others = dupes.get(sn)!.filter((c) => c !== a.pu.puCode);
      a.flags.push({
        code: 'duplicate', severity: 'high', title: 'Same sheet under another polling unit',
        detail: `Serial number ${sn} also appears on ${others.join(', ')}.`,
      });
    }
  }

  const flagCounts: Summary['flagCounts'] = {};
  const tally = new Map<string, { votes: number; cleanVotes: number }>();
  const lgas = new Map<string, Summary['lgas'][number]>();
  const rows: PURow[] = [];
  let errors = 0, sheetsRead = 0, clean = 0, flagged = 0, high = 0;

  for (const pu of index.pus) {
    const lga = lgas.get(pu.lga) ?? { name: pu.lga, pollingUnits: 0, analysed: 0, flagged: 0, tally: {} };
    lgas.set(pu.lga, lga);
    lga.pollingUnits++;

    const a = analyses.get(pu.id);
    const row: PURow = {
      id: pu.id, puCode: pu.puCode, name: pu.name, lga: pu.lga, ward: pu.ward,
      status: 'pending', severity: null, flags: [], validVotes: null, leader: null,
    };
    rows.push(row);
    if (!a) continue;
    if (a.error) { errors++; row.status = 'error'; continue; }
    if (pu.sheetUrl) sheetsRead++;

    lga.analysed++;
    row.flags = a.flags.map((f) => f.code);
    const worst = a.flags.reduce<Flag | null>((w, f) => (!w || SEV_RANK[f.severity] > SEV_RANK[w.severity] ? f : w), null);
    row.severity = worst?.severity ?? null;
    // Low-severity notes (a blank name line, a replaced upload) don't make a sheet "flagged".
    const serious = a.flags.some((f) => f.severity !== 'low');
    row.status = !a.read ? 'missing' : serious ? 'flagged' : 'clean';
    if (serious) { flagged++; lga.flagged++; } else clean++;
    if (worst?.severity === 'high') high++;
    for (const f of a.flags) {
      flagCounts[f.code] ??= { count: 0, title: f.title, severity: f.severity };
      flagCounts[f.code].count++;
    }

    if (a.read) {
      const isClean = !a.flags.some((f) => f.severity === 'high');
      let best: { party: string; votes: number } | null = null;
      for (const p of a.read.parties) {
        const n = p.figures ?? 0;
        const name = partyName(p.party);
        if (!name) continue;
        const t = tally.get(name) ?? { votes: 0, cleanVotes: 0 };
        t.votes += n;
        if (isClean) t.cleanVotes += n;
        tally.set(name, t);
        lga.tally[name] = (lga.tally[name] ?? 0) + n;
        if (!best || n > best.votes) best = { party: name, votes: n };
      }
      row.validVotes = a.read.summary.totalValid.value;
      row.leader = best && best.votes > 0 ? best.party : null;
    }
  }

  const declared = await fs.readFile(path.join(dir, 'declared.json'), 'utf8').then(JSON.parse).catch(() => null);
  const summary: Summary = {
    slug,
    title: index.election.title ?? slug,
    totals: {
      pollingUnits: index.pus.length,
      sheets: index.pus.filter((p) => p.sheetUrl).length,
      analysed: sheetsRead,
      errors, clean, flagged, highSeverity: high,
    },
    flagCounts,
    tally: [...tally].map(([party, t]) => ({ party, ...t })).sort((a, b) => b.votes - a.votes),
    declared,
    lgas: [...lgas.values()].sort((a, b) => a.name.localeCompare(b.name)),
    duplicates: [...dupes].map(([serial, puCodes]) => ({ serial, puCodes })),
    uploads: uploadHistogram(index.pus),
    replaced: index.pus.filter((p) => p.oldSheets.length > 0).length,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(path.join(dir, 'summary.json'), JSON.stringify(summary));
  await fs.writeFile(path.join(dir, 'rows.json'), JSON.stringify(rows));
  // Persist the cross-sheet duplicate flags so the per-PU view shows them too.
  for (const a of analyses.values()) {
    if (dupeByPu.has(a.pu.puCode)) {
      await fs.writeFile(path.join(dir, 'analysis', `${a.pu.id}.json`), JSON.stringify(a));
    }
  }
  return summary;
}

function uploadHistogram(pus: PU[]) {
  const hours = pus.filter((p) => p.sheetUrl && p.uploadedAt).map((p) => Math.floor(Date.parse(p.uploadedAt!) / 3_600_000));
  if (!hours.length) return [];
  const counts = new Map<number, number>();
  for (const h of hours) counts.set(h, (counts.get(h) ?? 0) + 1);
  const first = Math.min(...hours), last = Math.max(...hours);
  const out = [];
  for (let h = first; h <= last; h++) out.push({ t: new Date(h * 3_600_000).toISOString(), n: counts.get(h) ?? 0 });
  return out;
}
