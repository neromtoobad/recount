import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.ts';
import { toJpeg } from './image.ts';
import type { Election } from './store.ts';
import { partyName } from './summary.ts';

// Citizen copies: photos of a polling unit's result taken at the unit itself, by voters,
// party agents, observers and journalists. Usually the EC60E poster INEC pastes up after
// counting, or an agent's copy of the EC8A. Each one is an independent, timestamped record
// to hold the IReV upload against, which matters most when uploads are late or replaced.

export type Role = 'voter' | 'agent' | 'observer' | 'journalist' | 'demo';
export type Kind = 'ec60e' | 'ec8a' | 'other';

export type AiResult = {
  at: string;
  // matches / altered / different_sheet / unclear compare the photo with the IReV sheet;
  // the others say why no comparison was possible.
  verdict: 'matches' | 'altered' | 'different_sheet' | 'unclear' | 'not_a_sheet' | 'no_match' | 'no_original' | 'other_unit';
  summary: string;
  matchedPuCode: string | null;
  votes: Record<string, number>;
  totalValid: number | null;
  diffs: { field: string; copy: number | null; irev: number | null }[];
};

export type Copy = {
  id: string;
  slug: string;
  puId: string;
  puCode: string;
  role: Role;
  party: string | null;
  kind: Kind;
  takenAt: string | null;
  uploadedAt: string;
  typed: { votes: Record<string, number>; totalValid: number | null } | null;
  sha: string;
  status: 'pending' | 'checked';
  ai: AiResult | null;
};

const dirOf = (slug: string) => path.join(DATA_DIR, slug, 'copies');
const ROLES: Role[] = ['voter', 'agent', 'observer', 'journalist'];
const KINDS: Kind[] = ['ec60e', 'ec8a', 'other'];

export async function listCopies(slug: string): Promise<Copy[]> {
  const files = await fs.readdir(dirOf(slug)).catch(() => [] as string[]);
  const out = await Promise.all(files.filter((f) => f.endsWith('.json')).map((f) =>
    fs.readFile(path.join(dirOf(slug), f), 'utf8').then((t) => JSON.parse(t) as Copy).catch(() => null)));
  return out.filter((c): c is Copy => !!c).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export const readCopy = (slug: string, id: string) =>
  /^[a-f0-9]{16}$/.test(id) ? fs.readFile(path.join(dirOf(slug), `${id}.json`), 'utf8').then((t) => JSON.parse(t) as Copy).catch(() => null) : Promise.resolve(null);

const writeCopy = async (c: Copy) => {
  await fs.mkdir(dirOf(c.slug), { recursive: true });
  await fs.writeFile(path.join(dirOf(c.slug), `${c.id}.json`), JSON.stringify(c));
};

export const copyImage = (slug: string, id: string) =>
  /^[a-f0-9]{16}$/.test(id) ? fs.readFile(path.join(dirOf(slug), `${id}.jpg`)).catch(() => null) : Promise.resolve(null);

// A photo is shown publicly only once the AI has confirmed it is a result sheet, so the
// upload form can't be used to publish anything else.
export const isPublic = (c: Copy) => c.status === 'checked' && !!c.ai && c.ai.verdict !== 'not_a_sheet';

export type NewCopy = {
  image: Buffer; puId: string; role: string; party?: string; kind?: string;
  takenAt?: string; votes?: Record<string, unknown>; totalValid?: unknown; demo?: boolean;
};

export async function addCopy(e: Election, input: NewCopy): Promise<{ copy: Copy; duplicate: boolean } | { error: string }> {
  const pu = e.pus.find((p) => p.id === input.puId);
  if (!pu) return { error: 'choose a polling unit' };
  const role = input.demo ? 'demo' : ROLES.includes(input.role as Role) ? (input.role as Role) : null;
  if (!role) return { error: 'say who took the photo' };

  // Re-encoding drops EXIF, including any GPS position the phone wrote into the photo.
  const jpg = await toJpeg(input.image).catch(() => null);
  if (!jpg) return { error: 'that file is not a photo we can read' };
  const sha = crypto.createHash('sha256').update(jpg).digest('hex');
  const existing = (await listCopies(e.slug)).find((c) => c.sha === sha);
  if (existing) return { copy: existing, duplicate: true };

  const votes: Record<string, number> = {};
  for (const [p, v] of Object.entries(input.votes ?? {})) {
    const n = Number(v);
    if (String(v).trim() !== '' && Number.isInteger(n) && n >= 0 && n < 100_000) votes[partyName(p)] = n;
  }
  const tv = Number(input.totalValid);
  const typed = Object.keys(votes).length ? { votes, totalValid: Number.isInteger(tv) && tv >= 0 ? tv : null } : null;
  const taken = input.takenAt ? Date.parse(input.takenAt) : NaN;

  const copy: Copy = {
    id: crypto.randomBytes(8).toString('hex'),
    slug: e.slug, puId: pu.id, puCode: pu.puCode, role,
    party: role === 'agent' && input.party ? partyName(input.party) || null : null,
    kind: KINDS.includes(input.kind as Kind) ? (input.kind as Kind) : 'other',
    takenAt: Number.isNaN(taken) || taken > Date.now() + 3_600_000 ? null : new Date(taken).toISOString(),
    uploadedAt: new Date().toISOString(),
    typed, sha, status: 'pending', ai: null,
  };
  await fs.mkdir(dirOf(e.slug), { recursive: true });
  await fs.writeFile(path.join(dirOf(e.slug), `${copy.id}.jpg`), jpg);
  await writeCopy(copy);
  return { copy, duplicate: false };
}

export async function setResult(slug: string, id: string, ai: AiResult) {
  const c = await readCopy(slug, id);
  if (!c) return null;
  c.ai = { ...ai, at: new Date().toISOString() };
  c.status = 'checked';
  await writeCopy(c);
  return c;
}

// The IReV sheet's figures for a unit, as read, keyed by party.
export function irevFigures(e: Election, puId: string) {
  const r = e.analyses.get(puId)?.read;
  if (!r) return null;
  const votes: Record<string, number> = {};
  for (const p of r.parties) if (p.figures !== null) votes[partyName(p.party)] = (votes[partyName(p.party)] ?? 0) + p.figures;
  return { votes, totalValid: r.summary.totalValid.value };
}

// The figures someone typed against the IReV sheet: instant, no AI needed.
export function typedCheck(e: Election, c: Copy) {
  if (!c.typed) return null;
  const irev = irevFigures(e, c.puId);
  if (!irev) return { verdict: 'no_irev' as const, diffs: [] };
  const diffs = Object.entries(c.typed.votes)
    .filter(([p, n]) => (irev.votes[p] ?? 0) !== n)
    .map(([p, n]) => ({ field: p, copy: n, irev: irev.votes[p] ?? 0 }));
  if (c.typed.totalValid !== null && irev.totalValid !== null && c.typed.totalValid !== irev.totalValid) {
    diffs.push({ field: 'Total valid', copy: c.typed.totalValid, irev: irev.totalValid });
  }
  return { verdict: diffs.length ? 'differs' as const : 'matches' as const, diffs };
}

// Where a copy stands against IReV: the AI comparison wins when there is one.
export function standing(e: Election, c: Copy): 'agrees' | 'disagrees' | 'pending' | 'no_irev' | 'unusable' {
  if (c.ai) {
    if (c.ai.verdict === 'matches') return 'agrees';
    if (['altered', 'different_sheet'].includes(c.ai.verdict) || c.ai.diffs.length) return 'disagrees';
    if (c.ai.verdict === 'no_original') return 'no_irev';
    if (c.ai.verdict === 'unclear') {
      const t = typedCheck(e, c);
      return t?.verdict === 'differs' ? 'disagrees' : t?.verdict === 'matches' ? 'agrees' : 'pending';
    }
    return 'unusable';
  }
  const t = typedCheck(e, c);
  if (!t) return 'pending';
  return t.verdict === 'no_irev' ? 'no_irev' : t.verdict === 'matches' ? 'agrees' : 'disagrees';
}

// What the public sees: no hash, the photo only once it is confirmed to be a sheet.
export function publicCopy(e: Election, c: Copy, origin: string) {
  const pu = e.pus.find((p) => p.id === c.puId);
  return {
    id: c.id, puId: c.puId, puCode: c.puCode, puName: pu?.name.trim() ?? null, ward: pu?.ward ?? null, lga: pu?.lga ?? null,
    role: c.role, party: c.party, kind: c.kind, takenAt: c.takenAt, uploadedAt: c.uploadedAt,
    typed: c.typed, typedCheck: typedCheck(e, c), ai: c.ai, status: c.status,
    standing: standing(e, c),
    imageUrl: isPublic(c) ? `${origin}/api/${e.slug}/copies/${c.id}/image` : null,
    irevUploadedAt: pu?.uploadedAt ?? null,
    recountUrl: `${origin}/${e.slug}/pu/${c.puId}`,
  };
}

// Units where copies taken at the unit and the IReV sheet disagree. Two or more copies
// that agree with each other but not with IReV are the strongest signal Recount has.
export function conflicts(e: Election, copies: Copy[], origin: string) {
  const byPu = new Map<string, Copy[]>();
  for (const c of copies) byPu.set(c.puId, [...(byPu.get(c.puId) ?? []), c]);
  const out = [];
  for (const [puId, list] of byPu) {
    const s = list.map((c) => standing(e, c));
    const disagree = s.filter((x) => x === 'disagrees').length;
    if (!disagree) continue;
    const pu = e.pus.find((p) => p.id === puId)!;
    out.push({
      puId, puCode: pu.puCode, name: pu.name.trim(), ward: pu.ward, lga: pu.lga,
      copies: list.length, disagree, agree: s.filter((x) => x === 'agrees').length,
      irevUploadedAt: pu.uploadedAt,
      firstCopyTakenAt: list.map((c) => c.takenAt ?? c.uploadedAt).sort()[0],
      recountUrl: `${origin}/${e.slug}/pu/${puId}`,
    });
  }
  return out.sort((a, b) => b.disagree - a.disagree || b.copies - a.copies);
}

// Per-election counts for the live board.
export function copyStats(e: Election, copies: Copy[]) {
  const units = new Set(copies.map((c) => c.puId));
  const lgas = new Set(copies.map((c) => e.pus.find((p) => p.id === c.puId)?.lga).filter(Boolean));
  const st = copies.map((c) => standing(e, c));
  return {
    copies: copies.length, units: units.size, lgas: lgas.size,
    agree: st.filter((s) => s === 'agrees').length,
    disagree: st.filter((s) => s === 'disagrees').length,
    pending: st.filter((s) => s === 'pending').length,
    noIrev: st.filter((s) => s === 'no_irev').length,
  };
}
