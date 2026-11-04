import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { checkImage } from './lib/compare.ts';
import { addCheckPhoto, checkPhoto, markReader, pendingChecks, readCheck, readerOnline, setCheckResult } from './lib/factcheck.ts';
import { isSheetUrl, pruneImageCache, sheetJpeg, toJpegDataUrl } from './lib/image.ts';
import { buildSummary } from './lib/summary.ts';
import { exportRows, toCsv } from './lib/export.ts';
import { runElection, seedDataDir } from './lib/worker.ts';
import type { Analysis, PU } from './lib/types.ts';
import { DATA_DIR } from './lib/config.ts';
import { loadElection } from './lib/store.ts';
import { changes, checkCollation, collate, forensics, marginOfLead, queryUnits, replay, seriousFeed, textCard, type CollationClaim } from './lib/insights.ts';
import { addPledge, nationalBoard, nationalReplay, nationalUnit, searchNational, stateBoard, unitHistory } from './lib/nation.ts';
import { openapi } from './lib/openapi.ts';
import { addReport, KINDS, situation, unitReports } from './lib/incidents.ts';
import { addCollationPhoto, collationImage, compareCollation, pendingCollations, readCollationPhoto, setCollationRead, type CollationRead } from './lib/collation-sheet.ts';
import { buildPack } from './lib/pack.ts';
import { checkImageFile, copyChecked, finishCheck, handleWebhook, listChecks, verifySignature, whatsappReady } from './lib/whatsapp.ts';
import { addCopy, conflicts, copyImage, copyStats, isPublic, listCopies, publicCopy, readCopy, setResult, type AiResult } from './lib/copies.ts';

const app = new Hono();
const DATA = DATA_DIR;

// The read API is public: newsrooms, observer groups and bots can call it from anywhere.
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST'] }));

const readJson = async <T>(p: string): Promise<T | null> =>
  fs.readFile(p, 'utf8').then((t) => JSON.parse(t) as T).catch(() => null);

// Which Meta models this server can reach; some are unavailable in some hosting regions.
app.get('/api/health', async (c) => {
  try {
    const res = await fetch('https://api.meta.ai/v1/models', { headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}` } });
    const json = (await res.json()) as { data?: { id: string }[] };
    return c.json({ ok: res.ok, models: (json.data ?? []).map((m) => m.id) });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 500);
  }
});

// IReV sheets, rotated and shrunk to 2000 px. Meta's API and the browser both load
// sheets from here, so the batch runner never moves image bytes itself.
app.get('/img', async (c) => {
  const u = c.req.query('u') ?? '';
  if (!isSheetUrl(u)) return c.text('not an IReV sheet', 400);
  try {
    const jpg = await sheetJpeg(u);
    return c.body(new Uint8Array(jpg), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
  } catch (err) {
    return c.text((err as Error).message, 502);
  }
});

// Fetch and cache a sheet ahead of a Meta call without sending it back.
app.post('/img/warm', async (c) => {
  const { u } = await c.req.json<{ u: string }>();
  if (!isSheetUrl(u)) return c.json({ error: 'not an IReV sheet' }, 400);
  try {
    await sheetJpeg(u);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

// The batch runner posts each finished analysis here. Summaries are rebuilt at most
// every 20 s so a fast run doesn't rebuild thousands of times.
const pendingSummary = new Map<string, NodeJS.Timeout>();
app.post('/api/ingest/:slug', async (c) => {
  const token = process.env.INGEST_TOKEN;
  if (!token || c.req.header('authorization') !== `Bearer ${token}`) return c.json({ error: 'unauthorised' }, 401);
  const slug = c.req.param('slug');
  const dir = path.join(DATA, slug);
  if (!/^[a-z0-9-]+$/.test(slug) || !(await fs.access(path.join(dir, 'index.json')).then(() => true, () => false))) return c.notFound();
  const items = [await c.req.json<Analysis | Analysis[]>()].flat();
  await fs.mkdir(path.join(dir, 'analysis'), { recursive: true });
  for (const a of items) {
    if (!/^[a-f0-9]{24}$/.test(a?.pu?.id ?? '')) return c.json({ error: 'bad analysis' }, 400);
    await fs.writeFile(path.join(dir, 'analysis', `${a.pu.id}.json`), JSON.stringify(a));
  }
  if (!pendingSummary.has(slug)) {
    pendingSummary.set(slug, setTimeout(() => {
      pendingSummary.delete(slug);
      buildSummary(slug).catch((err) => console.error(`[${slug}] summary failed:`, err));
    }, 20_000));
  }
  return c.json({ ok: true, stored: items.length });
});

// The hosted site can't reach Meta's models (they are not offered in its region), so
// LIVE_CHECK=off makes the checker show a worked example instead of failing.
app.get('/api/config', (c) => c.json({ liveCheck: process.env.LIVE_CHECK !== 'off' }));

app.get('/api/:slug/demo-check', async (c) => {
  const d = await readJson(path.join(DATA, c.req.param('slug'), 'demo-check.json'));
  return d ? c.json(d) : c.notFound();
});

// Open data: every polling unit with its figures, flags and IReV link.
const exportCache = new Map<string, { at: number; rows: Awaited<ReturnType<typeof exportRows>> }>();
async function cachedExport(slug: string, origin: string) {
  const hit = exportCache.get(slug);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.rows;
  const rows = await exportRows(slug, origin);
  exportCache.set(slug, { at: Date.now(), rows });
  return rows;
}
// Railway terminates TLS at its proxy, so the request URL says http; links we hand out must be https.
const publicOrigin = (url: string) => {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN;
  const u = new URL(url);
  return /^(localhost|127\.)/.test(u.hostname) ? u.origin : `https://${u.host}`;
};
app.get('/api/:slug/export.csv', async (c) => {
  const slug = c.req.param('slug');
  if (!/^[a-z0-9-]+$/.test(slug)) return c.notFound();
  const rows = await cachedExport(slug, publicOrigin(c.req.url)).catch(() => null);
  if (!rows) return c.notFound();
  return c.body(toCsv(rows), 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="recount-${slug}-2026.csv"`,
  });
});
app.get('/api/:slug/export.json', async (c) => {
  const slug = c.req.param('slug');
  if (!/^[a-z0-9-]+$/.test(slug)) return c.notFound();
  const rows = await cachedExport(slug, publicOrigin(c.req.url)).catch(() => null);
  return rows ? c.json(rows) : c.notFound();
});

// Elections are any data/<slug> folder with an index.json.
// The national layer: every polling unit in the country and pledges to cover them in 2027.
// These come before the /api/:slug routes so "nigeria" is never read as an election.
app.get('/api/nigeria', async (c) => {
  const board = await nationalBoard();
  return board ? c.json(board) : c.json({ error: 'registry not built' }, 503);
});
app.get('/api/nigeria/units', async (c) => {
  const q = c.req.query('q') ?? '';
  if (q.trim().length < 2) return c.json({ units: [] });
  return c.json({ units: await searchNational(q, c.req.query('state'), Math.min(Number(c.req.query('limit') ?? 20), 100)) });
});
app.get('/api/nigeria/unit/:code', async (c) => {
  const code = c.req.param('code');
  const u = await nationalUnit(code);
  return u ? c.json({ unit: u, history: await unitHistory(code, publicOrigin(c.req.url)), reports: await unitReports(code) }) : c.notFound();
});
app.get('/api/nigeria/state/:state', async (c) => {
  const s = await stateBoard(decodeURIComponent(c.req.param('state')));
  return s ? c.json(s) : c.notFound();
});
app.get('/api/nigeria/replay', async (c) => {
  const r = await nationalReplay();
  return r ? c.json(r) : c.notFound();
});
app.post('/api/nigeria/pledge', async (c) => {
  const ip = clientIp(c.req.header('x-real-ip'), c.req.header('x-forwarded-for'));
  if (limited(ip)) return c.json({ error: 'too many pledges from this connection; try again in an hour' }, 429);
  const body = await c.req.json<{ code?: string; role?: string }>().catch(() => ({} as { code?: string; role?: string }));
  const out = await addPledge(String(body.code ?? ''), String(body.role ?? 'voter'));
  return 'error' in out ? c.json(out, 400) : c.json(out);
});

// The situation room: what people see at their unit, as one of a fixed list of kinds.
app.get('/api/nigeria/situation', async (c) => {
  const hours = Math.min(Math.max(Number(c.req.query('hours') ?? 24) || 24, 1), 24 * 30);
  const s = await situation(hours, c.req.query('state'));
  return s ? c.json({ ...s, kindsList: KINDS }) : c.json({ error: 'registry not built' }, 503);
});
app.post('/api/nigeria/report', async (c) => {
  const ip = clientIp(c.req.header('x-real-ip'), c.req.header('x-forwarded-for'));
  if (limited(ip)) return c.json({ error: 'too many reports from this connection; try again in an hour' }, 429);
  const body = await c.req.json<{ code?: string; kind?: string }>().catch(() => ({} as { code?: string; kind?: string }));
  const out = await addReport(String(body.code ?? ''), String(body.kind ?? ''), `ip:${ip}`);
  return 'error' in out ? c.json(out, 400) : c.json(out);
});

app.get('/api/elections', async (c) => {
  const slugs = (await fs.readdir(DATA, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  const list = [];
  for (const slug of slugs) {
    const s = await readJson<any>(path.join(DATA, slug, 'summary.json'));
    // An election shows up once at least one of its sheets has been read.
    if (s?.totals.analysed > 0) list.push({ slug, title: s.title, totals: s.totals });
  }
  return c.json(list);
});

app.get('/api/:slug/summary', async (c) => {
  const s = await readJson(path.join(DATA, c.req.param('slug'), 'summary.json'));
  return s ? c.json(s) : c.notFound();
});

app.get('/api/:slug/rows', async (c) => {
  const rows = await readJson(path.join(DATA, c.req.param('slug'), 'rows.json'));
  return rows ? c.json(rows) : c.notFound();
});

app.get('/api/:slug/pu/:id', async (c) => {
  const { slug, id } = c.req.param();
  if (!/^[a-f0-9]{24}$/.test(id)) return c.notFound();
  const a = await readJson<Analysis>(path.join(DATA, slug, 'analysis', `${id}.json`));
  if (a) return c.json(a);
  const index = await readJson<{ pus: PU[] }>(path.join(DATA, slug, 'index.json'));
  const pu = index?.pus.find((p) => p.id === id);
  return pu ? c.json({ pu, read: null, evidence: null, flags: [], pending: true }) : c.notFound();
});

// Query endpoints over every sheet of an election; see /api/openapi.json.
app.get('/api/openapi.json', (c) => c.json(openapi(publicOrigin(c.req.url))));

const num = (v?: string) => (v === undefined || v === '' ? undefined : Number(v));
app.get('/api/:slug/units', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  if (!e) return c.notFound();
  const q = c.req.query();
  return c.json(queryUnits(e, { ...q, limit: num(q.limit), offset: num(q.offset) }, publicOrigin(c.req.url)));
});

app.get('/api/:slug/collation', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  if (!e) return c.notFound();
  const by = c.req.query('by') === 'ward' ? 'ward' : 'lga';
  return c.json({ by, areas: collate(e, by, publicOrigin(c.req.url), { lga: c.req.query('lga') }) });
});

app.post('/api/:slug/collation/check', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  if (!e) return c.notFound();
  const claim = await c.req.json<CollationClaim>().catch(() => null);
  if (!claim?.lga || !claim.votes || typeof claim.votes !== 'object') return c.json({ error: 'send { lga, ward?, votes: { PARTY: n } }' }, 400);
  const out = checkCollation(e, claim, publicOrigin(c.req.url));
  return out ? c.json(out) : c.json({ error: 'no polling units match that LGA/ward' }, 404);
});

// A photo of a ward (EC8B) or LGA (EC8C) collation sheet: queued for Muse Spark on the Mac,
// then each row is checked against the polling-unit sheets on IReV.
app.post('/api/:slug/collation/photo', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  if (!e) return c.notFound();
  const ip = clientIp(c.req.header('x-real-ip'), c.req.header('x-forwarded-for'));
  if (limited(ip)) return c.json({ error: 'too many uploads from this connection; try again in an hour' }, 429);
  const body = await c.req.parseBody();
  const file = body.image;
  if (!(file instanceof File)) return c.json({ error: 'attach a photo of the collation sheet' }, 400);
  if (file.size > 15_000_000) return c.json({ error: 'photo too large (15 MB max)' }, 400);
  const s = await addCollationPhoto(e.slug, Buffer.from(await file.arrayBuffer()));
  return c.json({ id: s.id, status: s.status });
});
app.get('/api/:slug/collation/photo/:id', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  const s = e ? await readCollationPhoto(e.slug, c.req.param('id')) : null;
  if (!e || !s) return c.notFound();
  const origin = publicOrigin(c.req.url);
  return c.json({
    id: s.id, status: s.status, at: s.at, demo: s.demo, error: s.error ?? null,
    imageUrl: `${origin}/api/${e.slug}/collation/photo/${s.id}/image`,
    result: s.read ? compareCollation(e, s.read, origin) : null,
  });
});
app.get('/api/:slug/collation/photo/:id/image', async (c) => {
  const jpg = await collationImage(c.req.param('slug'), c.req.param('id'));
  return jpg ? c.body(new Uint8Array(jpg), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' }) : c.notFound();
});
app.post('/api/:slug/collation/read-check', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  if (!e) return c.notFound();
  const read = await c.req.json<CollationRead>().catch(() => null);
  if (!read?.rows || !read.header) return c.json({ error: 'send a collation reading: { isCollationSheet, level, header, rows, total, … }' }, 400);
  return c.json(compareCollation(e, read, publicOrigin(c.req.url)));
});
app.get('/api/:slug/collation/queue', async (c) => {
  if (!isRunner(c.req.header('authorization'))) return c.json({ error: 'unauthorised' }, 401);
  return c.json((await pendingCollations(c.req.param('slug'))).map((id) => ({ id })));
});
app.post('/api/:slug/collation/photo/:id/read', async (c) => {
  if (!isRunner(c.req.header('authorization'))) return c.json({ error: 'unauthorised' }, 401);
  const out = await setCollationRead(c.req.param('slug'), c.req.param('id'), await c.req.json<{ read?: CollationRead; error?: string }>());
  return out ? c.json({ ok: true }) : c.notFound();
});

app.get('/api/:slug/margin', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  return e ? c.json(marginOfLead(e, publicOrigin(c.req.url))) : c.notFound();
});

app.get('/api/:slug/forensics', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  return e ? c.json(forensics(e, publicOrigin(c.req.url))) : c.notFound();
});

app.get('/api/:slug/changes', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  if (!e) return c.notFound();
  const out = changes(e, c.req.query('since') ?? '1970-01-01', publicOrigin(c.req.url), Math.min(num(c.req.query('limit')) ?? 500, 2000));
  return out ? c.json(out) : c.json({ error: 'since must be an ISO date' }, 400);
});

app.get('/api/:slug/feed.xml', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  if (!e) return c.notFound();
  return c.body(seriousFeed(e, publicOrigin(c.req.url)), 200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
});

// Evidence pack for a polling unit, ward or LGA, with fingerprints of every file.
app.get('/api/:slug/pack', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  if (!e) return c.notFound();
  const scope = { pu: c.req.query('pu') || undefined, lga: c.req.query('lga') || undefined, ward: c.req.query('ward') || undefined };
  if (!scope.pu && !scope.lga) return c.json({ error: 'give pu, or lga (and optionally ward)' }, 400);
  const pack = await buildPack(e, scope, publicOrigin(c.req.url));
  if (!pack) return c.json({ error: 'no polling units in that scope, or more than 400' }, 404);
  if (c.req.query('download')) c.header('Content-Disposition', `attachment; filename="recount-evidence-${e.slug}-${pack.manifestSha256.slice(0, 8)}.json"`);
  return c.json(pack);
});
app.get('/api/:slug/replay', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  const r = e && replay(e, publicOrigin(c.req.url));
  return r ? c.json(r) : c.notFound();
});
app.get('/api/:slug/pu/:id/card.txt', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  const pu = e?.pus.find((p) => p.id === c.req.param('id'));
  if (!e || !pu) return c.notFound();
  return c.text(textCard(e, pu, publicOrigin(c.req.url)));
});

// Citizen copies. Uploads are open to anyone, so they are rate-limited per address
// (kept in memory only, never written down) and checked before any photo is shown.
const recent = new Map<string, number[]>();
// The proxy's own record of the caller: X-Real-IP, or the last X-Forwarded-For entry (the one
// the proxy appended). Earlier entries come from the client and can be made up.
function clientIp(real?: string, fwd?: string) {
  return real?.trim() || fwd?.split(',').pop()?.trim() || 'local';
}
const limited = (ip: string) => {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  recent.set(ip, [...hits, now]);
  return hits.length >= 30;
};
const isRunner = (auth?: string) => !!process.env.INGEST_TOKEN && auth === `Bearer ${process.env.INGEST_TOKEN}`;

app.post('/api/:slug/copies', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  if (!e) return c.notFound();
  const ip = clientIp(c.req.header('x-real-ip'), c.req.header('x-forwarded-for'));
  if (limited(ip)) return c.json({ error: 'too many uploads from this connection; try again in an hour' }, 429);
  const body = await c.req.parseBody();
  const file = body.image;
  if (!(file instanceof File)) return c.json({ error: 'attach a photo of the result sheet' }, 400);
  if (file.size > 15_000_000) return c.json({ error: 'photo too large (15 MB max)' }, 400);
  let votes: Record<string, unknown> = {};
  try { votes = JSON.parse(String(body.votes ?? '{}')); } catch { /* typed figures are optional */ }
  const out = await addCopy(e, {
    image: Buffer.from(await file.arrayBuffer()), puId: String(body.puId ?? ''), role: String(body.role ?? ''),
    party: body.party ? String(body.party) : undefined, kind: String(body.kind ?? ''), takenAt: body.takenAt ? String(body.takenAt) : undefined,
    votes, totalValid: body.totalValid, demo: body.demo === '1' && isRunner(c.req.header('authorization')),
  });
  if ('error' in out) return c.json(out, 400);
  return c.json({ duplicate: out.duplicate, copy: publicCopy(e, out.copy, publicOrigin(c.req.url)) });
});

app.get('/api/:slug/copies', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  if (!e) return c.notFound();
  const origin = publicOrigin(c.req.url);
  const pu = c.req.query('pu');
  const all = await listCopies(e.slug);
  const list = pu ? all.filter((x) => x.puId === pu || x.puCode === pu) : all;
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 500);
  return c.json({ stats: copyStats(e, all), copies: list.slice(0, limit).map((x) => publicCopy(e, x, origin)) });
});

app.get('/api/:slug/copies/conflicts', async (c) => {
  const e = await loadElection(c.req.param('slug'));
  if (!e) return c.notFound();
  return c.json(conflicts(e, await listCopies(e.slug), publicOrigin(c.req.url)));
});

// The Mac runner (which can reach Meta) pulls pending copies and posts back the AI check.
app.get('/api/:slug/copies/queue', async (c) => {
  if (!isRunner(c.req.header('authorization'))) return c.json({ error: 'unauthorised' }, 401);
  return c.json((await listCopies(c.req.param('slug'))).filter((x) => x.status === 'pending').map((x) => ({ id: x.id, puId: x.puId })));
});

app.post('/api/:slug/copies/:id/result', async (c) => {
  if (!isRunner(c.req.header('authorization'))) return c.json({ error: 'unauthorised' }, 401);
  const out = await setResult(c.req.param('slug'), c.req.param('id'), await c.req.json<AiResult>());
  if (out) await copyChecked(c.req.param('slug'), c.req.param('id'), publicOrigin(c.req.url));
  return out ? c.json({ ok: true }) : c.notFound();
});

app.get('/api/:slug/copies/:id/image', async (c) => {
  const { slug, id } = c.req.param();
  const copy = await readCopy(slug, id);
  if (!copy || !(isPublic(copy) || isRunner(c.req.header('authorization')))) return c.notFound();
  const jpg = await copyImage(slug, id);
  return jpg ? c.body(new Uint8Array(jpg), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=300' }) : c.notFound();
});

// "Is this result sheet real?" — compare an uploaded photo with the IReV original.
// WhatsApp Cloud API webhook. Meta verifies the URL with a GET, then posts every message,
// signed with the app secret. Replies are sent straight away; the work happens after.
app.get('/api/whatsapp', (c) => {
  const ok = c.req.query('hub.mode') === 'subscribe' && !!process.env.WHATSAPP_VERIFY_TOKEN && c.req.query('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN;
  return ok ? c.text(c.req.query('hub.challenge') ?? '') : c.text('forbidden', 403);
});
app.post('/api/whatsapp', async (c) => {
  const raw = await c.req.text();
  if (!verifySignature(raw, c.req.header('x-hub-signature-256'))) return c.text('bad signature', 401);
  const origin = publicOrigin(c.req.url);
  handleWebhook(JSON.parse(raw), origin).catch((err) => console.error('[whatsapp]', err));
  return c.text('ok');
});
app.get('/api/whatsapp/status', (c) => c.json({ ready: whatsappReady(), number: process.env.WHATSAPP_DISPLAY_NUMBER ?? null }));
// The reader on the Mac picks up forwarded sheets to fact-check and posts the reply text back.
app.get('/api/whatsapp/checks', async (c) => (isRunner(c.req.header('authorization')) ? c.json(await listChecks()) : c.json({ error: 'unauthorised' }, 401)));
app.get('/api/whatsapp/checks/:id/image', async (c) => {
  if (!isRunner(c.req.header('authorization'))) return c.json({ error: 'unauthorised' }, 401);
  const img = await checkImageFile(c.req.param('id'));
  return img ? c.body(new Uint8Array(img), 200, { 'Content-Type': 'image/jpeg' }) : c.notFound();
});
app.post('/api/whatsapp/checks/:id/result', async (c) => {
  if (!isRunner(c.req.header('authorization'))) return c.json({ error: 'unauthorised' }, 401);
  const { reply } = await c.req.json<{ reply: string }>();
  return (await finishCheck(c.req.param('id'), String(reply ?? ''))) ? c.json({ ok: true }) : c.notFound();
});

// Fact-check a result sheet. Where Meta's API answers (the Mac, local dev) it runs straight
// away; on the hosted site the photo is queued for the reader and the page polls for it.
app.post('/api/check', async (c) => {
  const body = await c.req.parseBody();
  const file = body.image;
  const slug = String(body.election ?? 'osun');
  if (!(file instanceof File)) return c.json({ error: 'attach an image' }, 400);
  if (file.size > 15_000_000) return c.json({ error: 'image too large (15 MB max)' }, 400);
  if (process.env.LIVE_CHECK === 'off') {
    if (!(await loadElection(slug))) return c.json({ error: 'unknown election' }, 404);
    const ip = clientIp(c.req.header('x-real-ip'), c.req.header('x-forwarded-for'));
    if (limited(ip)) return c.json({ error: 'too many uploads from this connection; try again in an hour' }, 429);
    const s = await addCheckPhoto(slug, Buffer.from(await file.arrayBuffer()));
    return c.json({ id: s.id, status: s.status });
  }
  try {
    return c.json(await checkImage(slug, await toJpegDataUrl(Buffer.from(await file.arrayBuffer()))));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});
app.get('/api/check/queue', async (c) => {
  if (!isRunner(c.req.header('authorization'))) return c.json({ error: 'unauthorised' }, 401);
  markReader();
  return c.json(await pendingChecks());
});
app.get('/api/check/:id', async (c) => {
  const s = await readCheck(c.req.param('id'));
  if (!s) return c.notFound();
  const imageUrl = `${publicOrigin(c.req.url)}/api/check/${s.id}/image`;
  return c.json({
    id: s.id, status: s.status, slug: s.slug, at: s.at, error: s.error ?? null, readerOnline: readerOnline(), imageUrl,
    result: s.result ? { ...s.result, uploadUrl: imageUrl } : null,
  });
});
app.get('/api/check/:id/image', async (c) => {
  const jpg = await checkPhoto(c.req.param('id'));
  return jpg ? c.body(new Uint8Array(jpg), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' }) : c.notFound();
});
app.post('/api/check/:id/result', async (c) => {
  if (!isRunner(c.req.header('authorization'))) return c.json({ error: 'unauthorised' }, 401);
  const out = await setCheckResult(c.req.param('id'), await c.req.json());
  return out ? c.json({ ok: true }) : c.notFound();
});

app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

const port = Number(process.env.PORT ?? 8791);
await pruneImageCache().then((c) => console.log(`image cache: ${c.files} files, ${c.mb} MB (${c.removed} removed)`)).catch(() => {});
await seedDataDir();
serve({ fetch: app.fetch, port }, () => console.log(`recount api on :${port}`));

// ANALYZE=osun,ekiti reads every outstanding sheet in the background, one election after another.
const queue = (process.env.ANALYZE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (queue.length) {
  (async () => {
    for (const slug of queue) {
      await runElection(slug, { concurrency: Number(process.env.ANALYZE_CONCURRENCY ?? 12) })
        .catch((err) => console.error(`[${slug}] worker stopped:`, err));
    }
  })();
}
