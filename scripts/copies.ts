// Reads citizen copies uploaded to the hosted site with Muse Spark, compares each with the
// IReV original, and posts the result back. Runs on the Mac because Meta's API is not
// offered in the hosting region.
// Also answers result sheets forwarded to the WhatsApp number.
// Usage: npx tsx scripts/copies.ts <slug> [--watch]
import 'dotenv/config';
import { readCollation, type CollationRead } from '../server/lib/collation-sheet.ts';
import { checkImage } from '../server/lib/compare.ts';
import { partyName } from '../server/lib/summary.ts';
import type { AiResult } from '../server/lib/copies.ts';

const slug = process.argv[2];
const watch = process.argv.includes('--watch');
const base = process.env.PUSH_URL?.replace(/\/$/, '');
const auth = { Authorization: `Bearer ${process.env.INGEST_TOKEN}` };
if (!slug || !base || !process.env.INGEST_TOKEN) throw new Error('usage: copies.ts <slug> [--watch], with PUSH_URL and INGEST_TOKEN set');

async function checkOne(id: string, puId: string): Promise<AiResult> {
  const img = await fetch(`${base}/api/${slug}/copies/${id}/image`, { headers: auth });
  if (!img.ok) throw new Error(`image ${img.status}`);
  const dataUrl = `data:image/jpeg;base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`;
  const r = await checkImage(slug, dataUrl);
  const votes: Record<string, number> = {};
  for (const p of r.upload.parties) if (p.figures !== null) votes[partyName(p.party)] = p.figures;
  const common = { at: '', matchedPuCode: 'pu' in r && r.pu ? r.pu.puCode : null, votes, totalValid: r.upload.summary.totalValid.value, diffs: [] };
  if (r.status === 'not_a_sheet') return { ...common, verdict: 'not_a_sheet', summary: 'This photo is not a polling-unit result sheet.' };
  if (r.status === 'no_match') return { ...common, verdict: 'no_match', summary: 'The unit codes and name on this photo could not be matched to a polling unit.' };
  if (r.status === 'no_original') return { ...common, verdict: 'no_original', summary: 'IReV has no sheet for this unit yet, so this copy is the only public record.' };
  if (r.pu.id !== puId) return { ...common, verdict: 'other_unit', summary: `The photo shows polling unit ${r.pu.puCode}, not the unit it was filed under.` };
  return {
    ...common,
    verdict: r.visual.verdict,
    summary: r.visual.summary.replace(/\b(the )?(circulating|uploaded) (image|copy|sheet)\b/gi, (_m, the) => `${the ?? ''}photo`),
    diffs: r.diffs.map((d) => ({ field: d.field, copy: d.upload, irev: d.original })),
  };
}

async function pass() {
  const queue = (await (await fetch(`${base}/api/${slug}/copies/queue`, { headers: auth })).json()) as { id: string; puId: string }[];
  for (const { id, puId } of queue) {
    try {
      const result = await checkOne(id, puId);
      const res = await fetch(`${base}/api/${slug}/copies/${id}/result`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
      console.log(`${id} ${result.verdict} ${res.ok ? '' : `(post ${res.status})`}`);
    } catch (err) {
      console.error(`${id} failed: ${(err as Error).message}`);
    }
  }
  return queue.length;
}

// Photos of ward (EC8B) and LGA (EC8C) collation sheets: read them and post the reading back;
// the server checks each row against the polling-unit sheets.
async function collationPass() {
  const res = await fetch(`${base}/api/${slug}/collation/queue`, { headers: auth });
  if (!res.ok) return 0;
  const queue = (await res.json()) as { id: string }[];
  for (const { id } of queue) {
    let body: { read?: CollationRead; error?: string };
    try {
      const img = await fetch(`${base}/api/${slug}/collation/photo/${id}/image`);
      body = { read: await readCollation(`data:image/jpeg;base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`) };
    } catch (err) {
      body = { error: (err as Error).message };
    }
    await fetch(`${base}/api/${slug}/collation/photo/${id}/read`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    console.log(`collation ${id}: ${body.read ? `${body.read.formType}, ${body.read.rows.length} rows` : `failed (${body.error})`}`);
  }
  return queue.length;
}

// A forwarded collation sheet: read it, have the server check it, and word the reply.
async function collationReply(dataUrl: string) {
  const read = await readCollation(dataUrl);
  if (!read.isCollationSheet) return null;
  const s = SLUG_BY_STATE[String(Number(read.header.stateCode ?? 0))] ?? slug;
  const res = await fetch(`${base}/api/${s}/collation/read-check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(read) });
  const out = await res.json() as { verdict: string; area?: string; summary: string };
  const head = out.verdict === 'matches' ? 'This collation sheet matches the polling-unit sheets on IReV' : out.verdict === 'differs' ? 'This collation sheet does not match the polling-unit sheets on IReV' : 'Recount could not check this collation sheet';
  return [`${head}${out.area ? ` (${out.area})` : ''}.`, out.summary, 'Figures are read by AI: check them against the photo. Recount is unofficial. Only INEC declares results.'].join('\n');
}

// Result sheets forwarded to the WhatsApp number: find the unit, compare with IReV, reply.
const SLUG_BY_STATE: Record<string, string> = { '29': 'osun', '13': 'ekiti', '4': 'anambra' };
// Compare with the election asked for; if the codes belong to another state Recount holds, try that one.
async function checkAnywhere(dataUrl: string, first: string) {
  let r = await checkImage(first, dataUrl);
  const state = String(Number((r.upload.header.puCode ?? r.upload.header.stateCode ?? '').split(/[^0-9]/)[0] || 0));
  const other = SLUG_BY_STATE[state];
  if (r.status !== 'no_match' || !other || other === first) return { r, s: first };
  r = await checkImage(other, dataUrl);
  return { r, s: r.status === 'no_match' ? first : other };
}

async function factCheck(dataUrl: string) {
  const first = await checkImage(slug, dataUrl);
  if (first.status === 'not_a_sheet' || /EC\s*8\s*[BCD]/i.test(first.upload.formType)) {
    const reply = await collationReply(dataUrl);
    if (reply) return reply;
  }
  const { r, s } = first.status === 'no_match' ? await checkAnywhere(dataUrl, slug) : { r: first, s: slug };
  if (r.status === 'not_a_sheet') return 'That does not look like a polling-unit result sheet (Form EC8A). Send one clear photo of the whole sheet.';
  if (r.status === 'no_match') return 'Recount could not match the codes on this sheet to a polling unit in an election it holds (Osun 2026, Ekiti 2026, Anambra 2025). Check that the unit codes at the top are readable.';
  const url = `${base}/${s}/pu/${r.pu.id}`;
  if (r.status === 'no_original') return `This sheet is for ${r.pu.name.trim()} (PU ${r.pu.puCode}), but INEC has no sheet for that unit on IReV, so there is nothing to compare it with. ${url}`;
  const diffs = r.diffs.map((d) => `${d.field}: this sheet ${d.upload ?? '?'}, IReV ${d.original ?? '?'}`).join('\n');
  const head = { matches: 'This sheet matches the one INEC published', altered: 'This sheet has been changed from the one INEC published', different_sheet: 'This is a different sheet from the one INEC published', unclear: 'Recount could not tell if this sheet matches the one INEC published' }[r.visual.verdict];
  return [`${head} for ${r.pu.name.trim()} (PU ${r.pu.puCode}, ${r.pu.lga}).`, diffs, r.visual.summary.replace(/\b(the )?(circulating|uploaded) (image|copy|sheet)\b/gi, (_m, the) => `${the ?? ''}photo you sent`), `See both side by side: ${url}`, 'Recount is unofficial. Only INEC declares results.'].filter(Boolean).join('\n');
}

async function whatsappPass() {
  const res = await fetch(`${base}/api/whatsapp/checks`, { headers: auth });
  if (!res.ok) return 0;
  const queue = (await res.json()) as { id: string }[];
  for (const { id } of queue) {
    try {
      const img = await fetch(`${base}/api/whatsapp/checks/${id}/image`, { headers: auth });
      const reply = await factCheck(`data:image/jpeg;base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`);
      await fetch(`${base}/api/whatsapp/checks/${id}/result`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ reply }) });
      console.log(`whatsapp check ${id}: ${reply.split('\n')[0]}`);
    } catch (err) {
      console.error(`whatsapp check ${id} failed: ${(err as Error).message}`);
    }
  }
  return queue.length;
}

// Sheets sent to the website's fact-check page, for any election Recount holds.
async function webCheckPass() {
  const res = await fetch(`${base}/api/check/queue`, { headers: auth });
  if (!res.ok) return 0;
  const queue = (await res.json()) as { id: string; slug: string }[];
  for (const { id, slug: asked } of queue) {
    let body: { slug?: string; result?: unknown; error?: string };
    try {
      const img = await fetch(`${base}/api/check/${id}/image`);
      const { r, s } = await checkAnywhere(`data:image/jpeg;base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`, asked);
      const { uploadUrl: _photo, ...result } = r;
      body = { slug: s, result };
    } catch (err) {
      body = { error: (err as Error).message };
    }
    await fetch(`${base}/api/check/${id}/result`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const r = body.result as { status: string; visual?: { verdict: string } } | undefined;
    console.log(`web check ${id}: ${r ? `${body.slug} ${r.visual?.verdict ?? r.status}` : `failed (${body.error})`}`);
  }
  return queue.length;
}

do {
  // A dropped connection to the site must not end the watcher; it tries again on the next round.
  let n = 0;
  try {
    n = (await pass()) + (await whatsappPass()) + (await collationPass()) + (await webCheckPass());
  } catch (err) {
    if (!watch) throw err;
    console.log(`round failed: ${(err as Error).message}`);
  }
  if (!watch) break;
  if (!n) await new Promise((r) => setTimeout(r, 8_000));
} while (true);
