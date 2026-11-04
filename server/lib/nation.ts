import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.ts';
import { normCode } from './insights.ts';
import { loadElection } from './store.ts';

// The national layer: every polling unit in Nigeria (from IReV's 2023 presidential index),
// pledges to cover a unit on 16 January 2027, and lookups across every election Recount
// has read. The registry ships with the site; pledges live on the volume.

export const ELECTION_DAY_2027 = '2027-01-16';
const BUNDLED = 'data';

type Registry = {
  builtAt: string;
  source: { election: string; slug: string; title: string };
  states: string[];
  lgas: [number, string][];
  wards: [number, string][];
  units: [string, string, number, number, number][];
};

export type NationalUnit = {
  code: string; name: string; state: string; lga: string; ward: string;
  uploaded2023: string | null; replaced2023: number; pledges: number;
};

let registry: Promise<{ r: Registry; byCode: Map<string, number> } | null> | null = null;
export function loadRegistry() {
  registry ??= fs.readFile(path.join(BUNDLED, 'nigeria', 'registry.json'), 'utf8')
    .then((t) => {
      const r = JSON.parse(t) as Registry;
      return { r, byCode: new Map(r.units.map((u, i) => [normCode(u[0]), i])) };
    })
    .catch(() => null);
  return registry;
}

// Pledges: one line per pledge, no name, phone or IP. "I will photograph the result at
// this unit on election day."
const pledgeFile = () => path.join(DATA_DIR, 'nigeria', 'pledges.jsonl');
let pledges: Promise<Map<string, number>> | null = null;
function loadPledges() {
  pledges ??= fs.readFile(pledgeFile(), 'utf8').catch(() => '').then((t) => {
    const m = new Map<string, number>();
    for (const line of t.split('\n')) {
      if (!line) continue;
      try { const c = (JSON.parse(line) as { c: string }).c; m.set(c, (m.get(c) ?? 0) + 1); } catch { /* skip a torn line */ }
    }
    return m;
  });
  return pledges;
}

const ROLES = ['voter', 'agent', 'observer', 'journalist'] as const;
export async function addPledge(code: string, role: string) {
  const reg = await loadRegistry();
  const i = reg?.byCode.get(normCode(code));
  if (!reg || i === undefined) return { error: 'that polling unit code is not on the register' };
  const c = reg.r.units[i][0];
  const m = await loadPledges();
  await fs.mkdir(path.dirname(pledgeFile()), { recursive: true });
  await fs.appendFile(pledgeFile(), JSON.stringify({ c, r: ROLES.includes(role as never) ? role : 'voter', t: new Date().toISOString() }) + '\n');
  m.set(c, (m.get(c) ?? 0) + 1);
  return { unit: await nationalUnit(c) };
}

function toUnit(r: Registry, i: number, pl: Map<string, number>): NationalUnit {
  const [code, name, w, t, replaced] = r.units[i];
  const [l, ward] = r.wards[w];
  const [s, lga] = r.lgas[l];
  return {
    code, name, state: r.states[s], lga, ward,
    uploaded2023: t ? new Date(t * 60_000).toISOString() : null, replaced2023: replaced, pledges: pl.get(code) ?? 0,
  };
}

export async function nationalUnit(code: string) {
  const reg = await loadRegistry();
  const i = reg?.byCode.get(normCode(code));
  if (!reg || i === undefined) return null;
  return toUnit(reg.r, i, await loadPledges());
}

// Name, ward or code search across the whole country.
export async function searchNational(q: string, state?: string, limit = 20) {
  const reg = await loadRegistry();
  if (!reg) return [];
  const pl = await loadPledges();
  const { r } = reg;
  const digits = /^[\d\s/.-]+$/.test(q.trim());
  const code = digits ? normCode(q) : '';
  const needle = q.trim().toUpperCase();
  const si = state ? r.states.indexOf(state.toUpperCase()) : -1;
  const out: NationalUnit[] = [];
  for (let i = 0; i < r.units.length && out.length < limit; i++) {
    const u = r.units[i];
    const [l, ward] = r.wards[u[2]];
    if (si >= 0 && r.lgas[l][0] !== si) continue;
    const hit = digits ? normCode(u[0]).startsWith(code) : needle.length >= 3 && (u[1].includes(needle) || ward.includes(needle) || r.lgas[l][1].includes(needle));
    if (hit) out.push(toUnit(r, i, pl));
  }
  return out;
}

// Readable elections Recount covers, by the first part of the unit code.
const STATE_ELECTIONS: Record<string, string[]> = { '29': ['osun'], '13': ['ekiti'], '4': ['anambra'] };

// Every election Recount has read that includes this unit, with a link to its sheet.
export async function unitHistory(code: string, origin: string) {
  const c = normCode(code);
  const out = [];
  for (const slug of STATE_ELECTIONS[c.split('/')[0]] ?? []) {
    const e = await loadElection(slug);
    const pu = e?.pus.find((p) => normCode(p.puCode) === c);
    if (!e || !pu) continue;
    const a = e.analyses.get(pu.id);
    out.push({
      slug, title: e.title, puId: pu.id, uploadedAt: pu.uploadedAt, hasSheet: !!pu.sheetUrl,
      status: a?.flags.some((f) => f.severity === 'high') ? 'serious' : a?.flags.length ? 'flagged' : a ? 'clean' : 'unread',
      recountUrl: `${origin}/${slug}/pu/${pu.id}`,
    });
  }
  return out;
}

// The national board: units and pledges by state, and the elections Recount has read.
export async function nationalBoard() {
  const reg = await loadRegistry();
  if (!reg) return null;
  const pl = await loadPledges();
  const { r } = reg;
  const states = r.states.map((name) => ({ name, units: 0, lgas: 0, covered: 0, pledges: 0, uploaded2023: 0 }));
  for (const [s] of r.lgas) states[s].lgas++;
  for (const u of r.units) {
    const st = states[r.lgas[r.wards[u[2]][0]][0]];
    st.units++;
    if (u[3]) st.uploaded2023++;
    const n = pl.get(u[0]) ?? 0;
    if (n) { st.covered++; st.pledges += n; }
  }
  const total = (k: 'units' | 'covered' | 'pledges' | 'uploaded2023') => states.reduce((t, s) => t + s[k], 0);
  return {
    electionDay: ELECTION_DAY_2027,
    totals: { units: total('units'), covered: total('covered'), pledges: total('pledges'), lgas: r.lgas.length, wards: r.wards.length },
    states,
    registry: { builtAt: r.builtAt, source: r.source.title },
  };
}

// Pledged units in one state, by LGA, so a state page can show which LGAs still need people.
export async function stateBoard(state: string) {
  const reg = await loadRegistry();
  if (!reg) return null;
  const { r } = reg;
  const si = r.states.indexOf(state.toUpperCase());
  if (si < 0) return null;
  const pl = await loadPledges();
  const lgas = new Map<number, { name: string; units: number; covered: number; wards: Set<number> }>();
  r.lgas.forEach(([s, name], i) => { if (s === si) lgas.set(i, { name, units: 0, covered: 0, wards: new Set() }); });
  for (const u of r.units) {
    const l = lgas.get(r.wards[u[2]][0]);
    if (!l) continue;
    l.units++;
    l.wards.add(u[2]);
    if (pl.get(u[0])) l.covered++;
  }
  return {
    state: r.states[si],
    lgas: [...lgas.values()].map((l) => ({ name: l.name, units: l.units, wards: l.wards.size, covered: l.covered }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// Election-night replay of the 2023 presidential uploads, by state, in 15-minute steps.
export async function nationalReplay() {
  const reg = await loadRegistry();
  if (!reg) return null;
  const { r } = reg;
  const times = r.units.map((u) => u[3]).filter(Boolean).sort((a, b) => a - b);
  // The polls closed at 14:30 WAT (13:30 UTC) on 25 Feb 2023; start the clock there.
  const start = Math.round(Date.parse('2023-02-25T13:30:00Z') / 60_000);
  // Half-hour steps over the ten days to 7 March, when INEC had 93% of sheets up; the rest count as late.
  const step = 30;
  const last = Math.min(times[Math.floor(times.length * 0.995)] ?? start, start + 10 * 24 * 60);
  const n = Math.max(1, Math.ceil((last - start) / step) + 1);
  const areas = r.states.map((name) => ({ name, total: 0, counts: new Array<number>(n).fill(0), late: 0 }));
  for (const u of r.units) {
    const a = areas[r.lgas[r.wards[u[2]][0]][0]];
    a.total++;
    if (!u[3]) continue;
    const k = Math.floor((u[3] - start) / step);
    if (k >= n) a.late++;
    else a.counts[Math.max(0, k)]++;
  }
  return { start: new Date(start * 60_000).toISOString(), stepMinutes: step, steps: n, areas };
}
