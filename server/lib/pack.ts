import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import { DATA_DIR } from './config.ts';
import { listCopies, publicCopy } from './copies.ts';
import { isSheetUrl } from './image.ts';
import { unitReports } from './incidents.ts';
import type { Election } from './store.ts';
import { partyName } from './summary.ts';

// An evidence pack for one polling unit, a ward or an LGA: everything Recount holds, with
// SHA-256 fingerprints of the files as INEC published them, so a lawyer, observer or
// court registry can confirm later that the IReV file and each citizen photo are unchanged.

const hashFile = (slug: string) => path.join(DATA_DIR, slug, 'hashes.json');
const hashes = new Map<string, Promise<Record<string, { sha256: string; bytes: number; at: string }>>>();
const loadHashes = (slug: string) => {
  if (!hashes.has(slug)) hashes.set(slug, fs.readFile(hashFile(slug), 'utf8').then((t) => JSON.parse(t)).catch(() => ({})));
  return hashes.get(slug)!;
};

// Fingerprint of the original file at its IReV address, fetched once and remembered.
async function fingerprint(slug: string, url: string) {
  const h = await loadHashes(slug);
  if (h[url]) return h[url];
  if (!isSheetUrl(url)) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!res?.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  h[url] = { sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length, at: new Date().toISOString() };
  await fs.writeFile(hashFile(slug), JSON.stringify(h)).catch(() => undefined);
  return h[url];
}

export type PackScope = { pu?: string; lga?: string; ward?: string };

export async function buildPack(e: Election, scope: PackScope, origin: string) {
  const pus = e.pus.filter((p) => (scope.pu ? p.id === scope.pu : (!scope.lga || p.lga === scope.lga) && (!scope.ward || p.ward === scope.ward)));
  if (!pus.length || pus.length > 400) return null;
  const copies = await listCopies(e.slug);
  const limit = pLimit(8);
  // Situation-room reports from election day and the day after, Lagos time.
  const day: [string, string] | undefined = e.date
    ? [new Date(`${e.date}T00:00:00+01:00`).toISOString(), new Date(Date.parse(`${e.date}T00:00:00+01:00`) + 2 * 86_400_000).toISOString()]
    : undefined;
  const units = await Promise.all(pus.map((pu) => limit(async () => {
    const a = e.analyses.get(pu.id);
    const r = a?.read;
    const votes: Record<string, number> = {};
    for (const p of r?.parties ?? []) if (p.figures !== null) votes[partyName(p.party)] = (votes[partyName(p.party)] ?? 0) + p.figures;
    const mine = copies.filter((c) => c.puId === pu.id);
    return {
      puId: pu.id, puCode: pu.puCode, name: pu.name.trim(), ward: pu.ward, lga: pu.lga,
      recountUrl: `${origin}/${e.slug}/pu/${pu.id}`,
      irev: pu.sheetUrl ? {
        url: pu.sheetUrl, uploadedAt: pu.uploadedAt, file: await fingerprint(e.slug, pu.sheetUrl),
        earlierVersions: await Promise.all(pu.oldSheets.map(async (o) => ({ url: o.url, uploadedAt: o.uploadedAt, file: await fingerprint(e.slug, o.url) }))),
      } : null,
      reading: r ? {
        model: a!.model, readAt: a!.analyzedAt, serialNumber: r.serialNumber, votes,
        summary: Object.fromEntries(Object.entries(r.summary).map(([k, f]) => [k, f.value])),
        alteredEntries: r.alterations.map((x) => `${x.entry}: ${x.what}`),
        stamped: r.stamped, presidingOfficerSigned: r.presidingOfficerSigned, imageQuality: r.imageQuality,
      } : null,
      flags: (a?.flags ?? []).map((f) => ({ severity: f.severity, title: f.title, detail: f.detail })),
      reports: day ? (await unitReports(pu.puCode, day)).map((r) => ({ kind: r.kind, label: r.label, reporters: r.reporters, corroborated: r.corroborated, first: r.first, last: r.last })) : [],
      copies: mine.map((c) => {
        const p = publicCopy(e, c, origin);
        return { id: c.id, role: c.role, party: c.party, kind: c.kind, takenAt: c.takenAt, uploadedAt: c.uploadedAt, sha256: c.sha, standing: p.standing, aiSummary: c.ai?.summary ?? null, diffs: c.ai?.diffs ?? p.typedCheck?.diffs ?? [], imageUrl: p.imageUrl };
      }),
    };
  })));

  const totals: Record<string, number> = {};
  for (const u of units) for (const [p, n] of Object.entries(u.reading?.votes ?? {})) totals[p] = (totals[p] ?? 0) + n;
  const body = {
    kind: 'recount-evidence-pack', version: 1,
    generatedAt: new Date().toISOString(),
    election: { slug: e.slug, title: e.title },
    scope: scope.pu ? { type: 'polling unit', puCode: units[0].puCode, name: units[0].name, ward: units[0].ward, lga: units[0].lga }
      : scope.ward ? { type: 'ward', ward: scope.ward, lga: scope.lga } : { type: 'LGA', lga: scope.lga },
    counts: {
      units: units.length, withSheet: units.filter((u) => u.irev).length, read: units.filter((u) => u.reading).length,
      flagged: units.filter((u) => u.flags.length).length, serious: units.filter((u) => u.flags.some((f) => f.severity === 'high')).length,
      replaced: units.filter((u) => u.irev?.earlierVersions.length).length,
      copies: units.reduce((t, u) => t + u.copies.length, 0), copiesDisagree: units.reduce((t, u) => t + u.copies.filter((c) => c.standing === 'disagrees').length, 0),
    },
    totalsFromSheets: Object.fromEntries(Object.entries(totals).sort((a, b) => b[1] - a[1])),
    units,
    method: [
      'IReV files are fetched from the address INEC published and fingerprinted with SHA-256 as received. Anyone can download the same address and compare.',
      'Figures are read from each sheet by Meta Muse Spark and checked against the sheet\'s own totals. Stamps are located with SAM 3.1.',
      'Situation-room reports are what people at the unit said they saw, chosen from a fixed list. They carry no name or number; two different reporters within three hours mark a report confirmed.',
      'Citizen copies are photos uploaded to Recount. They are re-encoded on arrival, which removes location data; the fingerprint is of the stored file.',
    ],
    limits: 'Recount is independent and unofficial. Machine reading can misread handwriting: check every figure against the sheet image before relying on it. A flag means the sheet needs a look, not that the result is false. Only INEC declares results and only the courts decide disputes.',
  };
  const manifestSha256 = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return { ...body, manifestSha256 };
}
