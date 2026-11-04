import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.ts';
import { normCode } from './insights.ts';
import { loadRegistry, nationalUnit } from './nation.ts';

// The situation room: what people see at their polling unit, reported as one of a fixed set
// of kinds so nothing written about a person ever goes on the board. The kinds follow what
// observers (Yiaga Africa, Dataphyte) and INEC's own risk register keep finding: late
// officials and materials, BVAS failures, vote buying, violence, snatched boxes, voters
// turned away, results not posted, and voter cards that can't be collected.
// Each line on disk is { c: unit code, k: kind, t: time, w: reporter tag }. The tag is a hash
// of the connection or WhatsApp number with a key that only lives in memory, so two reports
// from one person count once, but no number or address can be recovered from the file.

export const KINDS = {
  calm: { label: 'All calm, voting is going well', short: 'Calm', tone: 'good' },
  late: { label: 'Officials or materials have not arrived', short: 'Officials late', tone: 'watch' },
  bvas: { label: 'BVAS not working, accreditation stopped', short: 'BVAS down', tone: 'watch' },
  turned_away: { label: 'Registered voters turned away', short: 'Voters turned away', tone: 'serious' },
  vote_buying: { label: 'Vote buying: cash, food or gifts at or near the unit', short: 'Vote buying', tone: 'serious' },
  violence: { label: 'Violence, thugs or intimidation', short: 'Violence', tone: 'serious' },
  snatched: { label: 'Ballot box snatched or destroyed', short: 'Box snatched', tone: 'serious' },
  no_result: { label: 'Result not announced, or the result poster (EC60E) not pasted', short: 'No result posted', tone: 'serious' },
  posted: { label: 'Result announced and poster pasted', short: 'Result posted', tone: 'good' },
  pvc: { label: 'Could not collect my voter card (PVC)', short: 'PVC problem', tone: 'watch' },
} as const;
export type Kind = keyof typeof KINDS;
export const isKind = (k: string): k is Kind => k in KINDS;

type Line = { c: string; k: Kind; t: string; w: string };

// Reporter tags: an HMAC under a key made fresh each time the server starts.
const key = crypto.randomBytes(32);
export const reporterTag = (who: string) => crypto.createHmac('sha256', key).update(who).digest('hex').slice(0, 12);

const file = () => path.join(DATA_DIR, 'nigeria', 'reports.jsonl');
let lines: Promise<Line[]> | null = null;
const load = () => (lines ??= fs.readFile(file(), 'utf8').catch(() => '').then((t) => t.split('\n').flatMap((l) => {
  try { return l ? [JSON.parse(l) as Line] : []; } catch { return []; }
})));

export async function addReport(code: string, kind: string, who: string) {
  if (!isKind(kind)) return { error: `kind must be one of ${Object.keys(KINDS).join(', ')}` };
  const reg = await loadRegistry();
  const i = reg?.byCode.get(normCode(code));
  if (!reg || i === undefined) return { error: 'that polling unit code is not on the register' };
  const c = reg.r.units[i][0];
  const w = reporterTag(who);
  const all = await load();
  // The same person reporting the same thing at the same unit within three hours counts once.
  const now = Date.now();
  const repeat = all.some((l) => l.c === c && l.k === kind && l.w === w && now - Date.parse(l.t) < 3 * 3_600_000);
  if (!repeat) {
    const line: Line = { c, k: kind, t: new Date(now).toISOString(), w };
    await fs.mkdir(path.dirname(file()), { recursive: true });
    await fs.appendFile(file(), JSON.stringify(line) + '\n');
    all.push(line);
  }
  return { unit: await nationalUnit(c), repeat, reports: await unitReports(c) };
}

// Per kind at one unit: how many different people, and when it was last reported. Two or
// more different people within three hours makes a report corroborated.
function summarise(ls: Line[]) {
  const by = new Map<Kind, Line[]>();
  for (const l of ls) by.set(l.k, [...(by.get(l.k) ?? []), l]);
  return [...by].map(([k, xs]) => {
    const last = xs.reduce((a, b) => (a.t > b.t ? a : b));
    const near = xs.filter((x) => Date.parse(last.t) - Date.parse(x.t) < 3 * 3_600_000);
    return { kind: k, ...KINDS[k], reporters: new Set(xs.map((x) => x.w)).size, corroborated: new Set(near.map((x) => x.w)).size >= 2, first: xs[0].t, last: last.t };
  }).sort((a, b) => b.last.localeCompare(a.last));
}

export async function unitReports(code: string, between?: [string, string]) {
  const c = normCode(code);
  const all = await load();
  return summarise(all.filter((l) => normCode(l.c) === c && (!between || (l.t >= between[0] && l.t <= between[1]))));
}

// The board: counts by kind and by state over a window, and the latest reports with the
// unit's name and place. Only codes and kinds are shown, never who sent them.
export async function situation(hours = 24, state?: string) {
  const reg = await loadRegistry();
  if (!reg) return null;
  const { r, byCode } = reg;
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const si = state ? r.states.indexOf(state.toUpperCase()) : -1;
  const placed = (await load()).filter((l) => l.t >= since).flatMap((l) => {
    const i = byCode.get(normCode(l.c));
    if (i === undefined) return [];
    const [code, name, w] = r.units[i];
    const [li, ward] = r.wards[w];
    const [s, lga] = r.lgas[li];
    return si >= 0 && s !== si ? [] : [{ ...l, code, name, ward, lga, s }];
  });
  const kinds = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0])) as Record<Kind, number>;
  const states = r.states.map((name) => ({ name, reports: 0, units: new Set<string>(), serious: 0 }));
  for (const l of placed) {
    kinds[l.k]++;
    const st = states[l.s];
    st.reports++;
    st.units.add(l.code);
    if (KINDS[l.k].tone === 'serious') st.serious++;
  }
  // Latest first, one row per unit and kind.
  const rows = new Map<string, (typeof placed)[number][]>();
  for (const l of placed) rows.set(`${l.code}|${l.k}`, [...(rows.get(`${l.code}|${l.k}`) ?? []), l]);
  const latest = [...rows.values()].map((xs) => {
    const last = xs.reduce((a, b) => (a.t > b.t ? a : b));
    return {
      code: last.code, name: last.name, ward: last.ward, lga: last.lga, state: r.states[last.s],
      kind: last.k, ...KINDS[last.k], at: last.t, reporters: new Set(xs.map((x) => x.w)).size,
    };
  }).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  return {
    hours, since, state: si >= 0 ? r.states[si] : null,
    totals: { reports: placed.length, units: new Set(placed.map((l) => l.code)).size, corroborated: latest.filter((l) => l.reporters >= 2).length },
    kinds: Object.entries(KINDS).map(([k, v]) => ({ kind: k, ...v, reports: kinds[k as Kind] })),
    states: states.map((s) => ({ name: s.name, reports: s.reports, units: s.units.size, serious: s.serious })),
    latest,
  };
}
