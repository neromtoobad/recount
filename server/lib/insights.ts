import type { Election } from './store.ts';
import { partyName } from './summary.ts';
import type { Analysis, PU } from './types.ts';

// Query endpoints for observers, newsrooms and party agents. Everything here is derived
// from the sheets as read; none of it is an official result.

const SEV_RANK = { high: 3, medium: 2, low: 1 } as const;

export type Unit = {
  id: string;
  puCode: string;
  name: string;
  ward: string;
  lga: string;
  status: 'clean' | 'flagged' | 'missing' | 'error' | 'pending';
  severity: 'high' | 'medium' | 'low' | null;
  flags: string[];
  registered: number | null;
  accredited: number | null;
  totalValid: number | null;
  votes: Record<string, number>;
  irevUrl: string | null;
  uploadedAt: string | null;
  recountUrl: string;
};

export function unit(e: Election, pu: PU, origin: string): Unit {
  const a = e.analyses.get(pu.id);
  const r = a?.read ?? null;
  const worst = a?.flags.reduce<Analysis['flags'][number] | null>((w, f) => (!w || SEV_RANK[f.severity] > SEV_RANK[w.severity] ? f : w), null);
  const votes: Record<string, number> = {};
  for (const p of r?.parties ?? []) {
    const name = partyName(p.party);
    if (name && p.figures !== null) votes[name] = (votes[name] ?? 0) + p.figures;
  }
  return {
    id: pu.id, puCode: pu.puCode, name: pu.name.trim(), ward: pu.ward, lga: pu.lga,
    status: !a ? 'pending' : a.error ? 'error' : !pu.sheetUrl || !r ? 'missing' : a.flags.some((f) => f.severity !== 'low') ? 'flagged' : 'clean',
    severity: worst?.severity ?? null,
    flags: a?.flags.map((f) => f.code) ?? [],
    registered: r?.summary.registered.value ?? null,
    accredited: r?.summary.accredited.value ?? null,
    totalValid: r?.summary.totalValid.value ?? null,
    votes,
    irevUrl: pu.sheetUrl, uploadedAt: pu.uploadedAt,
    recountUrl: `${origin}/${e.slug}/pu/${pu.id}`,
  };
}

// "29-11-07-015", "29/11/07/015" and "29 11 7 15" all name the same polling unit.
export const normCode = (c: string) => c.trim().split(/[^0-9]+/).filter(Boolean).map((p) => String(Number(p))).join('/');

export type UnitQuery = {
  lga?: string; ward?: string; status?: string; flag?: string; severity?: string;
  code?: string; q?: string; limit?: number; offset?: number;
};

export function queryUnits(e: Election, q: UnitQuery, origin: string) {
  const eq = (a: string, b?: string) => !b || a.toUpperCase() === b.trim().toUpperCase();
  const code = q.code ? normCode(q.code) : '';
  const needle = q.q?.trim().toUpperCase() ?? '';
  const all = e.pus.map((pu) => unit(e, pu, origin)).filter((u) =>
    eq(u.lga, q.lga) && eq(u.ward, q.ward) && eq(u.status, q.status)
    && (!q.flag || u.flags.includes(q.flag))
    && (!q.severity || u.severity === q.severity)
    && (!code || normCode(u.puCode) === code)
    && (!needle || `${u.name} ${u.ward} ${u.puCode}`.toUpperCase().includes(needle)));
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 1000);
  const offset = Math.max(q.offset ?? 0, 0);
  return { total: all.length, offset, limit, units: all.slice(offset, offset + limit) };
}

type Area = {
  lga: string;
  ward?: string;
  pollingUnits: number;
  sheets: number;
  read: number;
  flagged: number;
  serious: number;
  registered: number;
  accredited: number;
  totalValid: number;
  votes: Record<string, number>;
  // Votes on sheets with no high-severity flag, for comparing against a collation figure
  // without the sheets most likely to be wrong.
  votesOnCleanSheets: Record<string, number>;
};

// Add the polling-unit sheets up by ward or LGA, the way the EC8B and EC8C collation forms do.
export function collate(e: Election, by: 'lga' | 'ward', origin: string, only?: { lga?: string; ward?: string }) {
  const areas = new Map<string, Area>();
  for (const pu of e.pus) {
    if (only?.lga && pu.lga.toUpperCase() !== only.lga.toUpperCase()) continue;
    if (only?.ward && pu.ward.toUpperCase() !== only.ward.toUpperCase()) continue;
    const key = by === 'lga' ? pu.lga : `${pu.lga}\u0000${pu.ward}`;
    const area = areas.get(key) ?? {
      lga: pu.lga, ...(by === 'ward' ? { ward: pu.ward } : {}),
      pollingUnits: 0, sheets: 0, read: 0, flagged: 0, serious: 0,
      registered: 0, accredited: 0, totalValid: 0, votes: {}, votesOnCleanSheets: {},
    };
    areas.set(key, area);
    const u = unit(e, pu, origin);
    area.pollingUnits++;
    if (pu.sheetUrl) area.sheets++;
    if (u.status === 'clean' || u.status === 'flagged') area.read++;
    if (u.status === 'flagged') area.flagged++;
    if (u.severity === 'high') area.serious++;
    area.registered += u.registered ?? 0;
    area.accredited += u.accredited ?? 0;
    area.totalValid += u.totalValid ?? 0;
    for (const [p, n] of Object.entries(u.votes)) {
      area.votes[p] = (area.votes[p] ?? 0) + n;
      if (u.severity !== 'high') area.votesOnCleanSheets[p] = (area.votesOnCleanSheets[p] ?? 0) + n;
    }
  }
  const out = [...areas.values()];
  for (const a of out) {
    a.votes = sortVotes(a.votes);
    a.votesOnCleanSheets = sortVotes(a.votesOnCleanSheets);
  }
  return out.sort((a, b) => a.lga.localeCompare(b.lga) || (a.ward ?? '').localeCompare(b.ward ?? ''));
}

const sortVotes = (v: Record<string, number>) =>
  Object.fromEntries(Object.entries(v).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]));

export type CollationClaim = {
  lga: string;
  ward?: string;
  votes: Record<string, number>;
  accredited?: number;
  totalValid?: number;
  source?: string;
};

// Compare a ward (EC8B) or LGA (EC8C) collation figure with the polling-unit sheets under it.
export function checkCollation(e: Election, claim: CollationClaim, origin: string) {
  const [area] = collate(e, claim.ward ? 'ward' : 'lga', origin, { lga: claim.lga, ward: claim.ward });
  if (!area) return null;
  const parties = new Set([...Object.keys(claim.votes).map(partyName), ...Object.keys(area.votes)]);
  const claimed = Object.fromEntries(Object.entries(claim.votes).map(([p, n]) => [partyName(p), Number(n)]));
  const rows = [...parties].map((party) => {
    const declared = claimed[party] ?? null;
    const sheets = area.votes[party] ?? 0;
    const difference = declared === null ? null : declared - sheets;
    return { party, declared, sheets, difference, differencePct: difference === null || !sheets ? null : round((difference / sheets) * 100, 2) };
  }).filter((r) => r.declared !== null || r.sheets > 0).sort((a, b) => (b.declared ?? b.sheets) - (a.declared ?? a.sheets));

  // AI transcription is not perfect, so small gaps are expected. A party gaining or losing
  // more than 1% (and more than 10 votes) against its own sheets is worth a closer look.
  const big = rows.filter((r) => r.difference !== null && Math.abs(r.difference) > 10 && Math.abs(r.differencePct ?? 100) > 1);
  const unread = area.pollingUnits - area.read;
  const scope = claim.ward ? `${claim.ward} ward, ${area.lga} LGA` : `${area.lga} LGA`;
  return {
    area: scope,
    level: claim.ward ? 'ward (EC8B)' : 'lga (EC8C)',
    source: claim.source ?? null,
    verdict: big.length ? 'differs' : 'matches',
    summary: big.length
      ? `${big.map((r) => `${r.party} ${r.difference! > 0 ? '+' : ''}${r.difference}`).join(', ')} against the sum of ${area.read} polling-unit sheets in ${scope}.`
      : `Within 1% of the sum of ${area.read} polling-unit sheets in ${scope} for every party.`,
    parties: rows,
    totals: {
      accredited: { declared: claim.accredited ?? null, sheets: area.accredited },
      totalValid: { declared: claim.totalValid ?? null, sheets: area.totalValid },
    },
    coverage: { pollingUnits: area.pollingUnits, sheetsRead: area.read, notRead: unread, seriousFlags: area.serious },
    caveat: unread > 0
      ? `${unread} polling unit(s) here have no readable sheet, so some gap is expected. Check them before drawing conclusions.`
      : 'Sheets are transcribed by AI; confirm any gap against the IReV originals linked from each unit.',
    unitsUrl: `${origin}/api/${e.slug}/units?lga=${encodeURIComponent(area.lga)}${claim.ward ? `&ward=${encodeURIComponent(claim.ward)}` : ''}`,
  };
}

// INEC's margin-of-lead principle: if the winner's lead is not more than the number of
// voters (PVCs collected) in polling units where the poll was cancelled or not held, the
// returning officer declares the election inconclusive and supplementary polls follow.
// Recount cannot see PVC counts, so it uses registered voters as an upper bound: a lead
// above that bound is safe; a lead below it needs INEC's PVC figures to settle.
export function marginOfLead(e: Election, origin: string) {
  const units = e.pus.map((pu) => unit(e, pu, origin));
  const tally = new Map<string, number>();
  for (const u of units) for (const [p, n] of Object.entries(u.votes)) tally.set(p, (tally.get(p) ?? 0) + n);
  const ranked = [...tally].sort((a, b) => b[1] - a[1]);
  const declared = e.summary.declared ? [...e.summary.declared].sort((a, b) => b.votes - a.votes) : null;

  // Registered voters for units with no sheet: the median of read sheets in the same ward, then LGA.
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const regBy = (k: (u: typeof units[number]) => string) => {
    const m = new Map<string, number[]>();
    for (const u of units) if (u.registered) m.set(k(u), [...(m.get(k(u)) ?? []), u.registered]);
    return m;
  };
  const byWard = regBy((u) => `${u.lga}/${u.ward}`), byLga = regBy((u) => u.lga), all = units.flatMap((u) => (u.registered ? [u.registered] : []));

  const atRisk = units.filter((u) => u.status === 'missing' || u.flags.includes('over_voting')).map((u) => {
    const estimated = u.registered === null;
    const registered = u.registered ?? median(byWard.get(`${u.lga}/${u.ward}`) ?? []) ?? median(byLga.get(u.lga) ?? []) ?? median(all) ?? 0;
    return { puCode: u.puCode, name: u.name, ward: u.ward, lga: u.lga, reason: u.status === 'missing' ? 'no sheet on IReV' : 'over-voting (Electoral Act 2022, s. 51(2))', registered, estimated, recountUrl: u.recountUrl };
  });
  const registered = atRisk.reduce((t, u) => t + u.registered, 0);
  const test = (lead: number) => ({ lead, registeredAtRisk: registered, result: lead > registered ? 'lead is safe' : 'needs INEC PVC figures' });

  return {
    leader: ranked[0]?.[0] ?? null,
    runnerUp: ranked[1]?.[0] ?? null,
    fromSheets: ranked.length > 1 ? test(ranked[0][1] - ranked[1][1]) : null,
    fromDeclared: declared && declared.length > 1 ? { leader: declared[0].party, runnerUp: declared[1].party, ...test(declared[0].votes - declared[1].votes) } : null,
    atRisk: { count: atRisk.length, estimatedRegistered: atRisk.filter((u) => u.estimated).length, units: atRisk },
    rule: 'If the lead is not more than the voters in units where polls were cancelled or not held, INEC declares the election inconclusive. Recount uses registered voters as an upper bound for PVCs collected.',
  };
}

// Election-forensics indicators. They point at sheets worth a look; none is proof of fraud.
export function forensics(e: Election, origin: string) {
  const units = e.pus.map((pu) => unit(e, pu, origin)).filter((u) => u.status === 'clean' || u.status === 'flagged');

  const bins = Array.from({ length: 21 }, (_, i) => ({ from: i * 5, n: 0 }));
  const outliers: (Pick<Unit, 'puCode' | 'name' | 'ward' | 'lga' | 'registered' | 'accredited' | 'recountUrl'> & { turnout: number | null; topShare: number | null; reasons: string[] })[] = [];
  for (const u of units) {
    const turnout = u.registered && u.accredited !== null ? u.accredited / u.registered : null;
    if (turnout !== null) bins[Math.min(20, Math.floor(turnout * 20))].n++;
    const valid = Object.values(u.votes).reduce((t, n) => t + n, 0);
    const top = Math.max(0, ...Object.values(u.votes));
    const topShare = valid ? top / valid : null;
    const reasons: string[] = [];
    if (turnout !== null && turnout > 0.9 && (u.registered ?? 0) >= 50) reasons.push('turnout above 90%');
    if (topShare !== null && topShare >= 0.95 && valid >= 50) reasons.push('one party has 95% or more of the votes');
    if (reasons.length) outliers.push({ puCode: u.puCode, name: u.name, ward: u.ward, lga: u.lga, registered: u.registered, accredited: u.accredited, recountUrl: u.recountUrl, turnout: turnout === null ? null : round(turnout, 3), topShare: topShare === null ? null : round(topShare, 3), reasons });
  }
  outliers.sort((a, b) => b.reasons.length - a.reasons.length || (b.turnout ?? 0) - (a.turnout ?? 0));
  const turnouts = units.flatMap((u) => (u.registered && u.accredited !== null ? [u.accredited / u.registered] : []));

  // Last-digit test (Beber & Scacco): last digits of honest vote counts of 10 or more are
  // close to uniform; figures written by hand to order tend to favour some digits. Small
  // parties are left out: their counts sit just above 10, which biases the last digit low.
  const tally = e.summary.tally.reduce((t, p) => t + p.votes, 0);
  const major = e.summary.tally.filter((p) => p.votes / (tally || 1) >= 0.05).map((p) => p.party);
  const lastDigits = [...major, 'ALL'].map((party) => {
    const counts = Array(10).fill(0) as number[];
    for (const u of units) for (const [p, n] of Object.entries(u.votes)) {
      if (n >= 10 && (party === 'ALL' ? major.includes(p) : p === party)) counts[n % 10]++;
    }
    const total = counts.reduce((t, n) => t + n, 0);
    const expected = total / 10;
    const chi2 = expected ? counts.reduce((t, n) => t + (n - expected) ** 2 / expected, 0) : 0;
    const p = expected ? chiSquareP(chi2, 9) : null;
    return { party, figures: total, counts, chi2: round(chi2, 2), p: p === null ? null : round(p, 4), uniform: p === null ? null : p >= 0.05 };
  });

  return {
    sheets: units.length,
    turnout: {
      median: turnouts.length ? round([...turnouts].sort((a, b) => a - b)[Math.floor(turnouts.length / 2)], 3) : null,
      histogram: bins.map((b, i) => ({ range: i === 20 ? '100%+' : `${b.from}-${b.from + 5}%`, sheets: b.n })),
    },
    outliers: { count: outliers.length, units: outliers },
    lastDigits,
    caveat: 'Indicators, not proof. Small units, bloc voting and transcription errors all produce outliers. Open the sheet before drawing a conclusion.',
  };
}

export type ChangeEvent = { at: string; type: 'uploaded' | 'replaced' | 'read'; puCode: string; name: string; lga: string; ward: string; status: Unit['status']; flags: string[]; recountUrl: string };

// What happened since a moment: sheets INEC uploaded or replaced, and sheets Recount read.
// Poll it with `since` set to the previous response's `now`.
export function changes(e: Election, since: string, origin: string, limit = 500) {
  const t = Date.parse(since);
  if (Number.isNaN(t)) return null;
  const events: ChangeEvent[] = [];
  for (const pu of e.pus) {
    const u = unit(e, pu, origin);
    const base = { puCode: u.puCode, name: u.name, lga: u.lga, ward: u.ward, status: u.status, flags: u.flags, recountUrl: u.recountUrl };
    if (pu.uploadedAt && Date.parse(pu.uploadedAt) > t) events.push({ at: pu.uploadedAt, type: pu.oldSheets.length ? 'replaced' : 'uploaded', ...base });
    const at = e.analyses.get(pu.id)?.analyzedAt;
    if (at && Date.parse(at) > t) events.push({ at, type: 'read', ...base });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));
  return { since: new Date(t).toISOString(), now: new Date().toISOString(), count: events.length, events: events.slice(0, limit) };
}

// An RSS feed of sheets with serious flags, newest upload first.
export function seriousFeed(e: Election, origin: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const items = e.pus.flatMap((pu) => {
    const a = e.analyses.get(pu.id);
    if (!a?.flags.some((f) => f.severity === 'high')) return [];
    return [{ pu, a, at: pu.uploadedAt ?? a.analyzedAt }];
  }).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 100);
  const body = items.map(({ pu, a, at }) => {
    const link = `${origin}/${e.slug}/pu/${pu.id}`;
    const serious = a.flags.filter((f) => f.severity === 'high');
    return `<item><title>${esc(`${pu.name.trim()} (${pu.puCode}), ${pu.lga}: ${serious.map((f) => f.title).join('; ')}`)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid><pubDate>${new Date(at).toUTCString()}</pubDate><description>${esc(a.flags.map((f) => `${f.title}: ${f.detail}`).join(' ') + ' Unofficial: a flag means look at this sheet, not that the result is false.')}</description></item>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(`Recount: serious flags, ${e.title}`)}</title><link>${origin}/${e.slug}/sheets?flag=serious</link><description>Polling-unit result sheets on IReV whose own figures contradict each other. Independent and unofficial.</description>${body}</channel></rss>`;
}

// A plain-text card for WhatsApp, SMS and chat bots.
export function textCard(e: Election, pu: PU, origin: string) {
  const u = unit(e, pu, origin);
  const a = e.analyses.get(pu.id);
  const status = { clean: 'Passed every check', flagged: u.severity === 'high' ? 'Serious flag' : 'Needs a second look', missing: 'No sheet on IReV', error: 'Not read yet', pending: 'Not read yet' }[u.status];
  const votes = Object.entries(u.votes).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([p, n]) => `${p} ${n}`).join(', ');
  return [
    `${u.name} (PU ${u.puCode})`,
    `${u.ward} ward, ${u.lga} LGA · ${e.title}`,
    `Status: ${status}`,
    votes && `Votes on the sheet: ${votes}`,
    u.totalValid !== null && `Total valid: ${u.totalValid} · Accredited: ${u.accredited ?? '?'} · Registered: ${u.registered ?? '?'}`,
    ...(a?.flags.filter((f) => f.severity !== 'low').map((f) => `- ${f.title}: ${f.detail}`) ?? []),
    u.irevUrl && `INEC original: ${u.irevUrl}`,
    `Evidence: ${u.recountUrl}`,
    'Recount is unofficial. Only INEC declares results.',
  ].filter(Boolean).join('\n');
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

// Upper tail of the chi-square distribution, via the regularised incomplete gamma function.
function chiSquareP(x: number, df: number) {
  const a = df / 2, z = x / 2;
  if (z <= 0) return 1;
  const lgA = lnGamma(a);
  if (z < a + 1) {
    let sum = 1 / a, term = sum;
    for (let n = 1; n < 500 && term > sum * 1e-12; n++) { term *= z / (a + n); sum += term; }
    return 1 - sum * Math.exp(-z + a * Math.log(z) - lgA);
  }
  let b = z + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.exp(-z + a * Math.log(z) - lgA) * h;
}

function lnGamma(x: number): number {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let s = 0.99999999999980993;
  for (let i = 0; i < 8; i++) s += g[i] / (x + i + 1);
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(s);
}

export type ReplayEvent = { at: string; kind: 'pretest' | 'first' | 'milestone' | 'stall' | 'resume' | 'replaced' | 'serious'; text: string; lga?: string; url?: string };

// Election night as it happened on IReV: sheets arriving by LGA in 10-minute steps, plus the
// moments worth stopping on (first upload, milestones, the longest stall, replaced sheets,
// sheets whose own figures contradict each other).
export function replay(e: Election, origin: string) {
  const ups = e.pus.filter((p) => p.uploadedAt).map((p) => ({ p, t: Date.parse(p.uploadedAt!) })).sort((a, b) => a.t - b.t);
  if (!ups.length) return null;
  // Polls open at 08:30 WAT. Anything on IReV before then was not a result: INEC has left
  // training and sample documents in some units' upload history.
  const open = e.date ? Date.parse(`${e.date}T08:30:00+01:00`) : 0;
  const early = e.pus.flatMap((p) => [p.uploadedAt, ...p.oldSheets.map((o) => o.uploadedAt)]
    .filter((t): t is string => !!t && Date.parse(t) < open).map((t) => ({ p, t: Date.parse(t) })));
  // Replaced sheets keep their first upload time in oldSheets; the night is when each unit first appeared.
  const first = (p: PU) => Math.min(Date.parse(p.uploadedAt!), ...p.oldSheets.map((o) => Date.parse(o.uploadedAt)).filter((n) => !Number.isNaN(n) && n >= open));
  const times = ups.map(({ p }) => ({ p, t: first(p) })).sort((a, b) => a.t - b.t);
  const step = 10 * 60_000;
  const start = Math.floor(times[0].t / step) * step;
  const end = times[Math.floor((times.length - 1) * 0.99)].t;
  const n = Math.ceil((end - start) / step) + 1;
  const lgas = new Map<string, { name: string; total: number; counts: number[]; late: number; serious: number }>();
  for (const p of e.pus) {
    if (!lgas.has(p.lga)) lgas.set(p.lga, { name: p.lga, total: 0, counts: new Array(n).fill(0), late: 0, serious: 0 });
    lgas.get(p.lga)!.total++;
  }
  for (const { p, t } of times) {
    const l = lgas.get(p.lga)!;
    const k = Math.floor((t - start) / step);
    if (k >= n) l.late++; else l.counts[k]++;
    if (e.analyses.get(p.id)?.flags.some((f) => f.severity === 'high')) l.serious++;
  }

  const iso = (t: number) => new Date(t).toISOString();
  const events: ReplayEvent[] = [];
  const total = e.pus.length;
  if (early.length) {
    const units = new Set(early.map((x) => x.p.id));
    const x = early.sort((a, b) => a.t - b.t)[0];
    events.push({ at: iso(start), kind: 'pretest', text: `${early.length} document${early.length > 1 ? 's' : ''} uploaded to ${units.size} real unit${units.size > 1 ? 's' : ''} before polls opened, from ${new Date(x.t).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', hour: '2-digit', minute: '2-digit' })} WAT. They are test or training uploads, still in IReV's history`, lga: x.p.lga, url: `${origin}/${e.slug}/pu/${x.p.id}` });
  }
  events.push({ at: iso(times[0].t), kind: 'first', text: `First sheet on IReV: ${times[0].p.name.trim()}, ${times[0].p.lga}`, lga: times[0].p.lga, url: `${origin}/${e.slug}/pu/${times[0].p.id}` });
  for (const pct of [25, 50, 75, 90, 99]) {
    const i = Math.ceil((pct / 100) * total) - 1;
    if (i < times.length) events.push({ at: iso(times[i].t), kind: 'milestone', text: `${pct}% of units have a sheet on IReV` });
  }
  // The longest pause in uploads before 95% of sheets were in.
  let gap = { from: 0, to: 0, at: 0 };
  const cut = Math.floor(times.length * 0.95);
  for (let i = 1; i < cut; i++) if (times[i].t - times[i - 1].t > gap.to - gap.from) gap = { from: times[i - 1].t, to: times[i].t, at: i };
  if (gap.to - gap.from > 30 * 60_000) {
    const h = Math.floor((gap.to - gap.from) / 3_600_000), m = Math.round(((gap.to - gap.from) % 3_600_000) / 60_000);
    events.push({ at: iso(gap.from), kind: 'stall', text: `Uploads stop at ${gap.at.toLocaleString('en')} of ${total.toLocaleString('en')} units` });
    events.push({ at: iso(gap.to), kind: 'resume', text: `Uploads resume after ${h ? `${h}h ` : ''}${m}m` });
  }
  for (const p of e.pus) {
    for (const o of p.oldSheets) {
      if (!p.uploadedAt) continue;
      events.push({ at: p.uploadedAt, kind: 'replaced', text: `Sheet replaced: ${p.name.trim()}, ${p.lga} (first upload ${new Date(o.uploadedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })})`, lga: p.lga, url: `${origin}/${e.slug}/pu/${p.id}` });
    }
  }
  const serious = times.filter(({ p }) => e.analyses.get(p.id)?.flags.some((f) => f.severity === 'high'));
  for (const { p, t } of serious.filter((_, i) => i % Math.max(1, Math.ceil(serious.length / 40)) === 0)) {
    const f = e.analyses.get(p.id)!.flags.find((x) => x.severity === 'high')!;
    events.push({ at: iso(t), kind: 'serious', text: `${f.title}: ${p.name.trim()}, ${p.lga}`, lga: p.lga, url: `${origin}/${e.slug}/pu/${p.id}` });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  return {
    title: e.title, start: iso(start), stepMinutes: 10, steps: n, total,
    uploaded: times.length, seriousTotal: serious.length,
    areas: [...lgas.values()].sort((a, b) => a.name.localeCompare(b.name)),
    events,
  };
}
