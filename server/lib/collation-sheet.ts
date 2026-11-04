import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.ts';
import { toJpeg } from './image.ts';
import { collate, normCode, unit } from './insights.ts';
import { meta, SPARK_PRIVATE } from './meta.ts';
import type { Election } from './store.ts';
import { partyName } from './summary.ts';

// Collation sheets. IReV publishes polling-unit sheets only: the ward (EC8B) and LGA (EC8C)
// summaries exist on paper at the collation centres, and tribunal cases keep turning on a
// figure that changed between the unit and the ward. Someone at the centre photographs the
// sheet, Muse Spark copies every row, and Recount checks each row against that unit's IReV
// sheet, the sheet's own column sums, and the units the sheet leaves out.

const int = { type: ['integer', 'null'] };
const str = { type: ['string', 'null'] };
const votes = {
  type: 'array',
  items: { type: 'object', properties: { party: { type: 'string' }, figures: int }, required: ['party', 'figures'], additionalProperties: false },
};
const SCHEMA = {
  type: 'object',
  properties: {
    isCollationSheet: { type: 'boolean' },
    formType: { type: 'string' },
    level: { type: 'string', enum: ['ward', 'lga', 'state', 'other'] },
    header: {
      type: 'object',
      properties: { state: str, lga: str, ward: str, stateCode: str, lgaCode: str, wardCode: str },
      required: ['state', 'lga', 'ward', 'stateCode', 'lgaCode', 'wardCode'],
      additionalProperties: false,
    },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: { code: str, name: str, accredited: int, totalValid: int, votes, altered: { type: 'boolean' } },
        required: ['code', 'name', 'accredited', 'totalValid', 'votes', 'altered'],
        additionalProperties: false,
      },
    },
    total: {
      type: 'object',
      properties: { accredited: int, totalValid: int, votes },
      required: ['accredited', 'totalValid', 'votes'],
      additionalProperties: false,
    },
    alterations: {
      type: 'array',
      items: { type: 'object', properties: { entry: { type: 'string' }, what: { type: 'string' } }, required: ['entry', 'what'], additionalProperties: false },
    },
    signed: { type: 'boolean' },
    stamped: { type: 'boolean' },
    imageQuality: { type: 'string', enum: ['good', 'poor', 'unreadable'] },
    notes: { type: 'string' },
  },
  required: ['isCollationSheet', 'formType', 'level', 'header', 'rows', 'total', 'alterations', 'signed', 'stamped', 'imageQuality', 'notes'],
  additionalProperties: false,
};

export type CollationRead = {
  isCollationSheet: boolean; formType: string; level: 'ward' | 'lga' | 'state' | 'other';
  header: { state: string | null; lga: string | null; ward: string | null; stateCode: string | null; lgaCode: string | null; wardCode: string | null };
  rows: { code: string | null; name: string | null; accredited: number | null; totalValid: number | null; votes: { party: string; figures: number | null }[]; altered: boolean }[];
  total: { accredited: number | null; totalValid: number | null; votes: { party: string; figures: number | null }[] };
  alterations: { entry: string; what: string }[];
  signed: boolean; stamped: boolean; imageQuality: 'good' | 'poor' | 'unreadable'; notes: string;
};

const PROMPT = `You are transcribing a Nigerian INEC collation result sheet exactly as written. The usual forms are EC8B (ward / registration area collation: one entry per polling unit, then the ward total) and EC8C (LGA collation: one entry per ward, then the LGA total). The sheet may list units or wards as rows with parties as columns, or the other way round: either way, give one item in rows per polling unit (EC8B) or per ward (EC8C).

You are an auditor, not a judge: copy what is on the paper even when it looks wrong, and never fix arithmetic.

level = ward for EC8B, lga for EC8C, state for EC8D, other otherwise. header: copy the State, LGA and Registration Area (ward) names and the code digits written beside them.
rows: code = the polling unit code (or ward code) as written, e.g. "001" or "29/17/03/007"; name = the polling unit or ward name. accredited and totalValid when the sheet has those lines for that entry. votes = one item per party column, party = the party acronym as printed, figures = the number written (NIL, "-" or "0" written means 0; blank means null). altered = any figure in that entry is overwritten, struck through or squeezed in.
total: the TOTAL column or row printed on the sheet, as written; do not add anything up yourself.
alterations: one item per overwritten or corrected figure anywhere on the sheet.
signed = the collation or returning officer has signed; stamped = an INEC stamp is visible.
If the image is not an INEC collation sheet (for example it is a polling-unit EC8A sheet), set isCollationSheet=false. Put anything unusual in notes; otherwise notes is "".`;

export async function readCollation(imageUrl: string): Promise<CollationRead> {
  const res = await meta().chat.completions.create({
    model: SPARK_PRIVATE,
    reasoning_effort: 'low',
    messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: imageUrl } }] }],
    response_format: { type: 'json_schema', json_schema: { name: 'collation_sheet', strict: true, schema: SCHEMA } },
  } as any);
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error('empty response from reader');
  return JSON.parse(text) as CollationRead;
}

const toVotes = (vs: { party: string; figures: number | null }[]) => {
  const out: Record<string, number> = {};
  for (const v of vs) if (v.figures !== null && partyName(v.party)) out[partyName(v.party)] = (out[partyName(v.party)] ?? 0) + v.figures;
  return out;
};
const clean = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const lastNum = (s: string | null) => { const m = (s ?? '').match(/(\d+)\D*$/); return m ? Number(m[1]) : null; };

// Check a collation sheet's reading against the polling-unit sheets on IReV.
export function compareCollation(e: Election, read: CollationRead, origin: string) {
  if (!read.isCollationSheet) return { verdict: 'not_collation' as const, summary: 'This is not a ward or LGA collation sheet.' };
  if (read.level !== 'ward' && read.level !== 'lga') return { verdict: 'unsupported' as const, summary: `Recount checks ward (EC8B) and LGA (EC8C) sheets; this looks like ${read.formType || 'another form'}.` };

  // Find the LGA (and ward) by code first, then by name.
  const h = read.header;
  const lgaPus = e.pus.filter((p) => (h.lgaCode && Number(p.lgaCode) === Number(h.lgaCode)) || (h.lga && clean(p.lga) === clean(h.lga)));
  const lga = lgaPus[0]?.lga;
  if (!lga) return { verdict: 'no_match' as const, summary: `Recount could not find the LGA "${h.lga ?? h.lgaCode ?? '?'}" in ${e.title}.` };
  const wardPus = read.level === 'ward'
    ? lgaPus.filter((p) => (h.wardCode && Number(p.wardCode) === Number(h.wardCode)) || (h.ward && clean(p.ward) === clean(h.ward)))
    : [];
  const ward = wardPus[0]?.ward;
  if (read.level === 'ward' && !ward) return { verdict: 'no_match' as const, summary: `Recount could not find the ward "${h.ward ?? h.wardCode ?? '?'}" in ${lga} LGA.` };

  // What IReV says for each entry the sheet should list: polling units for a ward sheet, wards for an LGA sheet.
  type Entry = { key: string; code: string; name: string; votes: Record<string, number>; hasSheet: boolean; url: string | null };
  const entries: Entry[] = read.level === 'ward'
    ? wardPus.map((p) => { const u = unit(e, p, origin); return { key: p.id, code: p.puCode, name: p.name.trim(), votes: u.votes, hasSheet: !!p.sheetUrl && (u.status === 'clean' || u.status === 'flagged'), url: u.recountUrl }; })
    : collate(e, 'ward', origin, { lga }).map((a) => ({ key: a.ward!, code: lgaPus.find((p) => p.ward === a.ward)?.wardCode ?? '', name: a.ward!, votes: a.votes, hasSheet: a.read > 0, url: `${origin}/${e.slug}/sheets?lga=${encodeURIComponent(lga)}&ward=${encodeURIComponent(a.ward!)}` }));

  const used = new Set<string>();
  const match = (row: CollationRead['rows'][number]) => {
    const n = lastNum(row.code);
    const byCode = n !== null ? entries.find((x) => !used.has(x.key) && lastNum(x.code) === n) : undefined;
    const byName = row.name ? entries.find((x) => !used.has(x.key) && clean(x.name) === clean(row.name)) : undefined;
    const hit = byName && byCode && byName !== byCode ? byName : byCode ?? byName;
    if (hit) used.add(hit.key);
    return hit ?? null;
  };

  // Parties the sheet prints at all; one it leaves off entirely is a layout choice, not a changed figure.
  const listed = new Set([...read.rows.flatMap((r) => r.votes), ...read.total.votes].map((v) => partyName(v.party)).filter(Boolean));
  const rows = read.rows.map((row) => {
    const sheet = toVotes(row.votes);
    const m = match(row);
    if (!m) return { code: row.code, name: row.name, status: 'unmatched' as const, votes: sheet, irev: null, diffs: [], altered: row.altered, url: null };
    if (!m.hasSheet) return { code: m.code, name: m.name, status: 'no_irev' as const, votes: sheet, irev: null, diffs: [], altered: row.altered, url: m.url };
    const parties = new Set([...Object.keys(sheet), ...Object.keys(m.votes)].filter((x) => listed.has(x)));
    const diffs = [...parties].map((p) => ({ party: p, collation: sheet[p] ?? 0, irev: m.votes[p] ?? 0 })).filter((d) => d.collation !== d.irev);
    return { code: m.code, name: m.name, status: diffs.length ? 'differs' as const : 'matches' as const, votes: sheet, irev: m.votes, diffs, altered: row.altered, url: m.url };
  });

  // Does the sheet's own total equal the sum of its rows?
  const total = toVotes(read.total.votes);
  const rowSum: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.votes)) rowSum[k] = (rowSum[k] ?? 0) + v;
  const arithmetic = Object.keys({ ...total, ...rowSum }).map((k) => ({ party: k, total: total[k] ?? null, sumOfRows: rowSum[k] ?? 0 }))
    .filter((a) => a.total !== null && a.total !== a.sumOfRows);
  // And the sum of every IReV sheet the sheet should cover.
  const irevSum: Record<string, number> = {};
  for (const x of entries) for (const [k, v] of Object.entries(x.votes)) irevSum[k] = (irevSum[k] ?? 0) + v;
  const totals = Object.keys({ ...total, ...irevSum }).filter((k) => listed.has(k)).map((k) => ({ party: k, collation: total[k] ?? null, irev: irevSum[k] ?? 0 }))
    .filter((t) => t.collation !== null || t.irev > 0).sort((a, b) => (b.collation ?? b.irev) - (a.collation ?? a.irev));
  const missing = entries.filter((x) => !used.has(x.key) && x.hasSheet).map((x) => ({ code: x.code, name: x.name, url: x.url }));

  const differ = rows.filter((r) => r.status === 'differs');
  const verdict = differ.length || arithmetic.length || missing.length ? 'differs' as const : 'matches' as const;
  const place = read.level === 'ward' ? `${ward} ward, ${lga} LGA` : `${lga} LGA`;
  const what = read.level === 'ward' ? 'polling unit' : 'ward';
  const parts = [
    differ.length ? `${differ.length} ${what}${differ.length === 1 ? '' : 's'} on this sheet ${differ.length === 1 ? 'differs' : 'differ'} from IReV: ${differ.slice(0, 3).map((r) => `${r.name} (${r.diffs.map((d) => `${d.party} ${d.collation} here, ${d.irev} on IReV`).join(', ')})`).join('; ')}${differ.length > 3 ? '…' : ''}.` : '',
    arithmetic.length ? `The sheet's total does not equal the sum of its own rows for ${arithmetic.map((a) => `${a.party} (${a.total} written, rows add to ${a.sumOfRows})`).join(', ')}.` : '',
    missing.length ? `${missing.length} ${what}${missing.length === 1 ? '' : 's'} with a sheet on IReV ${missing.length === 1 ? 'is' : 'are'} not on this sheet.` : '',
  ].filter(Boolean);
  return {
    verdict, level: read.level, formType: read.formType, area: place,
    summary: parts.length ? parts.join(' ') : `Every ${what} on this sheet matches its IReV sheet, and the total adds up.`,
    rows, arithmetic, totals, missing,
    counts: { rows: rows.length, matches: rows.filter((r) => r.status === 'matches').length, differs: differ.length, noIrev: rows.filter((r) => r.status === 'no_irev').length, unmatched: rows.filter((r) => r.status === 'unmatched').length, expected: entries.length },
    sheet: { signed: read.signed, stamped: read.stamped, alterations: read.alterations, imageQuality: read.imageQuality, notes: read.notes },
    caveat: 'Figures are copied from the photo by AI and can be misread. Check any difference against the photo and the IReV sheet before relying on it. Only INEC declares results.',
  };
}

// Uploaded collation photos wait here for the reader on the Mac, then hold its reading.
const dir = (slug: string) => path.join(DATA_DIR, slug, 'collation');
type Stored = { id: string; at: string; status: 'pending' | 'done' | 'failed'; demo: boolean; read?: CollationRead; error?: string };
const validId = (id: string) => /^[a-f0-9]{16}$/.test(id);

// The bundled demo sheet is labelled as a demo; nothing else can claim to be one.
let demoBytes: Promise<Buffer | null> | null = null;
const isDemo = async (image: Buffer) => {
  demoBytes ??= fs.readFile(path.join('public', 'demo', 'ec8b-ejigbo-ii-demo.jpg')).catch(() => null);
  const d = await demoBytes;
  return !!d && d.equals(image);
};

export async function addCollationPhoto(slug: string, image: Buffer) {
  const demo = await isDemo(image);
  const jpg = await toJpeg(image);
  const id = crypto.createHash('sha256').update(jpg).digest('hex').slice(0, 16);
  await fs.mkdir(dir(slug), { recursive: true });
  const existing = await readCollationPhoto(slug, id);
  if (existing) return existing;
  await fs.writeFile(path.join(dir(slug), `${id}.jpg`), jpg);
  const s: Stored = { id, at: new Date().toISOString(), status: 'pending', demo };
  await fs.writeFile(path.join(dir(slug), `${id}.json`), JSON.stringify(s));
  return s;
}
export const readCollationPhoto = (slug: string, id: string) =>
  validId(id) ? fs.readFile(path.join(dir(slug), `${id}.json`), 'utf8').then((t) => JSON.parse(t) as Stored).catch(() => null) : Promise.resolve(null);
export const collationImage = (slug: string, id: string) =>
  validId(id) ? fs.readFile(path.join(dir(slug), `${id}.jpg`)).catch(() => null) : Promise.resolve(null);
export async function pendingCollations(slug: string) {
  const files = await fs.readdir(dir(slug)).catch(() => [] as string[]);
  const out: string[] = [];
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    const s = await readCollationPhoto(slug, f.slice(0, -5));
    if (s?.status === 'pending') out.push(s.id);
  }
  return out;
}
export async function setCollationRead(slug: string, id: string, result: { read?: CollationRead; error?: string }) {
  const s = await readCollationPhoto(slug, id);
  if (!s) return null;
  const next: Stored = { ...s, status: result.read ? 'done' : 'failed', read: result.read, error: result.error };
  await fs.writeFile(path.join(dir(slug), `${id}.json`), JSON.stringify(next));
  return next;
}
