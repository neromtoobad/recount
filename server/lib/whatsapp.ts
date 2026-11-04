import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.ts';
import { addCopy, listCopies, readCopy, standing } from './copies.ts';
import { normCode, textCard } from './insights.ts';
import { addReport, KINDS, type Kind } from './incidents.ts';
import { addPledge, nationalUnit, unitHistory } from './nation.ts';
import { loadElection } from './store.ts';
import { toJpeg } from './image.ts';

// Recount on WhatsApp, through Meta's WhatsApp Cloud API. People send a polling-unit code,
// pledge to cover a unit, add a photo of their unit's result, or forward a result sheet
// they were sent to check it. A sender's number is used only to reply: it is held in
// memory while a reply is pending and never written to disk.

const GRAPH = 'https://graph.facebook.com/v21.0';
const env = () => ({ token: process.env.WHATSAPP_TOKEN, phoneId: process.env.WHATSAPP_PHONE_ID, secret: process.env.WHATSAPP_APP_SECRET });
export const whatsappReady = () => { const e = env(); return !!(e.token && e.phoneId && e.secret); };

export function verifySignature(raw: string, header: string | undefined) {
  const { secret } = env();
  if (!secret || !header?.startsWith('sha256=')) return false;
  const want = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const got = header.slice(7);
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function send(to: string, body: string) {
  const { token, phoneId } = env();
  if (!token || !phoneId) return;
  await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4000), preview_url: true } }),
  }).catch((err) => console.error('[whatsapp] send failed', err));
}

async function media(id: string) {
  const { token } = env();
  const meta = await fetch(`${GRAPH}/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()) as { url?: string };
  if (!meta.url) throw new Error('no media url');
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`media ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Pending replies, in memory only: copy or check id -> sender number. Cleared after a day.
const waiting = new Map<string, { to: string; at: number }>();
// A photo sent without a code waits here for the sender's next message, for ten minutes.
const held = new Map<string, { image: Buffer; caption: string; at: number }>();
// A REPORT sent without saying what was seen waits here for a number from the menu.
const reporting = new Map<string, { code: string; at: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of waiting) if (now - v.at > 86_400_000) waiting.delete(k);
  for (const [k, v] of held) if (now - v.at > 600_000) held.delete(k);
  for (const [k, v] of reporting) if (now - v.at > 600_000) reporting.delete(k);
}, 600_000).unref();

const HELP = (origin: string) => [
  'Recount checks polling-unit result sheets against what INEC puts on IReV. Independent and unofficial.',
  '',
  'Send the code of a polling unit (on your voter card, like 29/17/03/007) to see what Recount holds for it.',
  'Send COVER and the code to pledge to photograph the result at your unit on 16 January 2027.',
  'Send a photo of the result poster at your unit with the unit code as the caption to add it.',
  'Forward a result sheet you were sent, with no caption, to check it against INEC\'s copy.',
  'Send REPORT and the code to report a problem at your unit: late officials, BVAS down, vote buying, violence, no result posted.',
  'Send GUIDE for what to do on election day.',
  '',
  `Never photograph your marked ballot. More: ${origin}`,
].join('\n');

// Words people are likely to type after REPORT <code>, and the menu for when they type nothing.
const MENU: Kind[] = ['late', 'bvas', 'turned_away', 'vote_buying', 'violence', 'snatched', 'no_result', 'posted', 'calm', 'pvc'];
const WORDS: [RegExp, Kind][] = [
  [/\b(late|no officials?|not (yet )?arrived|materials?)\b/i, 'late'],
  [/\b(bvas|machine|accreditation)\b/i, 'bvas'],
  [/\b(turned away|not allowed|disenfranchis)/i, 'turned_away'],
  [/\b(buy|buying|money|cash|bribe|vote.?buying)\b/i, 'vote_buying'],
  [/\b(snatch|snatched|box|destroyed)\b/i, 'snatched'],
  [/\b(violence|thugs?|fight|shoot|gun|attack|intimidat)/i, 'violence'],
  [/\b(no result|not posted|not pasted|not announced)\b/i, 'no_result'],
  [/\b(posted|pasted|announced)\b/i, 'posted'],
  [/\b(calm|peaceful|fine|ok|okay|smooth)\b/i, 'calm'],
  [/\b(pvc|voter.?card)\b/i, 'pvc'],
];
const kindIn = (s: string) => WORDS.find(([re]) => re.test(s))?.[1] ?? null;
const reportMenu = (u: { code: string; name: string }) => [`What is happening at ${u.name} (PU ${u.code})? Reply with a number:`, ...MENU.map((k, i) => `${i + 1}. ${KINDS[k].label}`)].join('\n');

async function fileReport(to: string, code: string, kind: Kind, origin: string) {
  const out = await addReport(code, kind, `wa:${to}`);
  if ('error' in out) return send(to, `No polling unit with the code ${code} is on the register. Check the code on your voter card.`);
  const r = out.reports.find((x) => x.kind === kind);
  await send(to, [
    out.repeat ? `You already reported this at ${out.unit!.name}.` : `Reported: ${KINDS[kind].short} at ${out.unit!.name} (PU ${out.unit!.code}).`,
    r && r.reporters > 1 ? `${r.reporters} people have reported this here${r.corroborated ? ', so it is marked confirmed' : ''}.` : 'It is on the situation board now. Your number is not shown or kept.',
    KINDS[kind].tone === 'serious' ? 'If anyone is in danger, leave and call 112. Recount does not pass reports to INEC or the police.' : '',
    `${origin}/report`,
  ].filter(Boolean).join('\n'));
}

const GUIDE = (origin: string) => [
  'Election day, in short:',
  '- Bring your PVC. Vote only at your own polling unit. Polls are open 8:30 am to 2:30 pm, and anyone in the queue at 2:30 still votes.',
  '- Your vote is secret. Never photograph your marked ballot.',
  '- Counting is public. After the result is announced, the poster (EC60E) goes up at the unit: photograph it and send it here with the unit code.',
  '- Offered money for your vote? Say no, walk away, and send REPORT with the code.',
  '- Violence? Leave and call 112.',
  `More: ${origin}/guide`,
].join('\n');

const codeIn = (s: string) => /(\d{1,2})\s*[/.\-\s]\s*(\d{1,2})\s*[/.\-\s]\s*(\d{1,2})\s*[/.\-\s]\s*(\d{1,3})/.exec(s);
const codeOf = (m: RegExpExecArray) => normCode(`${m[1]}/${m[2]}/${m[3]}/${m[4]}`);

async function unitReply(code: string, origin: string) {
  const u = await nationalUnit(code);
  if (!u) return `No polling unit with the code ${code} is on the register. Check the code on your voter card.`;
  const history = await unitHistory(code, origin);
  const lines = [`${u.name} (PU ${u.code})`, `${u.ward}, ${u.lga}, ${u.state}`, `Covered for 16 Jan 2027 by ${u.pledges} ${u.pledges === 1 ? 'person' : 'people'}. Reply COVER ${u.code} to cover it.`];
  for (const h of history) {
    const e = await loadElection(h.slug);
    const pu = e?.pus.find((p) => p.id === h.puId);
    if (!e || !pu) continue;
    lines.push('', textCard(e, pu, origin));
    const copies = (await listCopies(h.slug)).filter((c) => c.puId === pu.id);
    if (copies.length) {
      const differ = copies.filter((c) => standing(e, c) === 'disagrees').length;
      lines.push(`Photos from the unit: ${copies.length}${differ ? `, ${differ} differ from IReV` : ', none differ from IReV'}`);
    }
  }
  lines.push('', `${origin}/unit/${u.code.replace(/\//g, '-')}`);
  return lines.join('\n');
}

// A photo of a unit's result, filed as a citizen copy under the election that unit belongs to.
async function fileCopy(to: string, code: string, image: Buffer, origin: string) {
  const history = await unitHistory(code, origin);
  const h = history[0];
  if (!h) {
    const u = await nationalUnit(code);
    return send(to, u
      ? `Thanks. Recount is not collecting results for ${u.name} yet: uploads open for each election once INEC lists its units on IReV. Reply COVER ${u.code} to be ready for 16 January 2027.`
      : `No polling unit with the code ${code} is on the register. Send the photo again with the code from your voter card.`);
  }
  const e = await loadElection(h.slug);
  if (!e) return;
  const out = await addCopy(e, { image, puId: h.puId, role: 'voter', kind: 'ec60e', takenAt: new Date().toISOString() });
  if ('error' in out) return send(to, `Could not save that photo: ${out.error}.`);
  if (!out.duplicate) waiting.set(`copy:${out.copy.id}`, { to, at: Date.now() });
  await send(to, out.duplicate
    ? `Recount already has this photo for ${h.title}. ${h.recountUrl}`
    : `Saved for ${h.title}, polling unit ${code}. Muse Spark will read it and compare it with the sheet INEC uploaded. I'll message you the result here. No name or number is stored.`);
}

// A forwarded sheet to fact-check: queued for the reader, which runs where Meta's models are available.
const checkDir = () => path.join(DATA_DIR, 'whatsapp', 'checks');
async function queueCheck(to: string, image: Buffer) {
  const id = crypto.randomBytes(8).toString('hex');
  await fs.mkdir(checkDir(), { recursive: true });
  await fs.writeFile(path.join(checkDir(), `${id}.jpg`), await toJpeg(image));
  await fs.writeFile(path.join(checkDir(), `${id}.json`), JSON.stringify({ id, at: new Date().toISOString(), status: 'pending' }));
  waiting.set(`check:${id}`, { to, at: Date.now() });
  await send(to, 'Got it. Muse Spark is reading the sheet and finding the polling unit it belongs to, then comparing it with INEC\'s copy on IReV. The answer comes here in a minute or two.');
}

export async function listChecks() {
  const files = await fs.readdir(checkDir()).catch(() => [] as string[]);
  const out = [];
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(await fs.readFile(path.join(checkDir(), f), 'utf8')) as { id: string; status: string };
    if (j.status === 'pending') out.push(j);
  }
  return out;
}
export const checkImageFile = (id: string) => /^[a-f0-9]{16}$/.test(id) ? fs.readFile(path.join(checkDir(), `${id}.jpg`)).catch(() => null) : Promise.resolve(null);

export async function finishCheck(id: string, reply: string) {
  if (!/^[a-f0-9]{16}$/.test(id)) return false;
  const file = path.join(checkDir(), `${id}.json`);
  const j = JSON.parse(await fs.readFile(file, 'utf8').catch(() => 'null'));
  if (!j) return false;
  await fs.writeFile(file, JSON.stringify({ ...j, status: 'done', doneAt: new Date().toISOString() }));
  const w = waiting.get(`check:${id}`);
  if (w) { waiting.delete(`check:${id}`); await send(w.to, reply); }
  return true;
}

// Called when the reader posts its result for a citizen copy.
export async function copyChecked(slug: string, id: string, origin: string) {
  const w = waiting.get(`copy:${id}`);
  if (!w) return;
  waiting.delete(`copy:${id}`);
  const e = await loadElection(slug);
  const c = await readCopy(slug, id);
  if (!e || !c) return;
  const st = standing(e, c);
  const url = `${origin}/${slug}/pu/${c.puId}`;
  const diffs = (c.ai?.diffs ?? []).map((d) => `${d.field}: your photo ${d.copy ?? '?'}, IReV ${d.irev ?? '?'}`).join('\n');
  await send(w.to, st === 'agrees' ? `Your photo agrees with the sheet INEC uploaded. ${url}`
    : st === 'disagrees' ? `Your photo differs from the sheet INEC uploaded.\n${diffs}\n${c.ai?.summary ?? ''}\nIt is now on the unit's page for anyone to inspect: ${url}`
    : st === 'no_irev' ? `IReV has no sheet for this unit yet, so your photo is the public record for it. ${url}`
    : `Muse Spark could not use this photo: ${c.ai?.summary ?? 'it is not a clear result sheet'}. Try one clear photo of the whole sheet in daylight.`);
}

type Inbound = { from: string; type: string; text?: { body: string }; image?: { id: string; caption?: string } };

export async function handleWebhook(payload: unknown, origin: string) {
  const entries = (payload as { entry?: { changes?: { value?: { messages?: Inbound[] } }[] }[] }).entry ?? [];
  for (const m of entries.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.messages ?? [])) {
    try {
      if (m.type === 'image' && m.image) {
        const image = await media(m.image.id);
        const caption = m.image.caption ?? '';
        const code = codeIn(caption);
        if (code) await fileCopy(m.from, codeOf(code), image, origin);
        else if (/\b(check|fake|real|verify)\b/i.test(caption) || !caption.trim()) {
          held.set(m.from, { image, caption, at: Date.now() });
          await send(m.from, 'Is this the result from your own polling unit? Reply with the unit code (like 29/17/03/007) to add it to Recount.\nOr reply CHECK if someone sent it to you and you want to know if it matches INEC\'s copy.');
        }
        continue;
      }
      const text = (m.text?.body ?? '').trim();
      const h = held.get(m.from);
      const code = codeIn(text);
      if (h && /^check\b/i.test(text)) { held.delete(m.from); await queueCheck(m.from, h.image); continue; }
      if (h && code && !/^cover\b/i.test(text)) { held.delete(m.from); await fileCopy(m.from, codeOf(code), h.image, origin); continue; }
      const pending = reporting.get(m.from);
      if (pending && /^\s*(10|[1-9])\s*$/.test(text)) {
        reporting.delete(m.from);
        await fileReport(m.from, pending.code, MENU[Number(text) - 1], origin);
        continue;
      }
      if (/^report\b/i.test(text)) {
        if (!code) { await send(m.from, 'Send REPORT and your polling unit code, like: REPORT 29/17/03/007 vote buying'); continue; }
        const kind = kindIn(text.replace(code[0], ' '));
        if (kind) await fileReport(m.from, codeOf(code), kind, origin);
        else {
          const u = await nationalUnit(codeOf(code));
          if (!u) { await send(m.from, `No polling unit with the code ${codeOf(code)} is on the register. Check the code on your voter card.`); continue; }
          reporting.set(m.from, { code: u.code, at: Date.now() });
          await send(m.from, reportMenu(u));
        }
        continue;
      }
      if (/^guide\b/i.test(text)) { await send(m.from, GUIDE(origin)); continue; }
      if (/^cover\b/i.test(text) && code) {
        const out = await addPledge(codeOf(code), 'voter');
        const u = out.unit;
        await send(m.from, !u ? out.error ?? 'Could not save that pledge.' : `You're covering ${u.name} (PU ${u.code}) on 16 January 2027${u.pledges > 1 ? `, with ${u.pledges - 1} other${u.pledges === 2 ? '' : 's'}` : ''}. After counting, photograph the result poster and send it here with the code as the caption. Never photograph your marked ballot.`);
        continue;
      }
      if (code) { await send(m.from, await unitReply(codeOf(code), origin)); continue; }
      await send(m.from, HELP(origin));
    } catch (err) {
      console.error('[whatsapp] message failed', err);
      await send(m.from, 'Something went wrong on our side. Please try again in a minute.');
    }
  }
}
