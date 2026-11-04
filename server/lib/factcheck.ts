import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.ts';
import { toJpeg } from './image.ts';

// Result-sheet photos sent to the website's fact-check. Meta's API is not offered where the
// site is hosted, so each photo waits here for the reader on the Mac, which compares it with
// the IReV original and posts the result back. The id is the start of the JPEG's SHA-256, so
// the same photo sent twice gets the answer it already has.

type Stored = { id: string; at: string; slug: string; status: 'pending' | 'done' | 'failed'; result?: Record<string, unknown>; error?: string };

const dir = () => path.join(DATA_DIR, 'factcheck');
const validId = (id: string) => /^[a-f0-9]{16}$/.test(id);

export async function addCheckPhoto(slug: string, image: Buffer) {
  const jpg = await toJpeg(image);
  const id = crypto.createHash('sha256').update(jpg).digest('hex').slice(0, 16);
  const existing = await readCheck(id);
  if (existing && existing.status !== 'failed') return existing;
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(path.join(dir(), `${id}.jpg`), jpg);
  const s: Stored = { id, at: new Date().toISOString(), slug, status: 'pending' };
  await fs.writeFile(path.join(dir(), `${id}.json`), JSON.stringify(s));
  return s;
}

export const readCheck = (id: string) =>
  validId(id) ? fs.readFile(path.join(dir(), `${id}.json`), 'utf8').then((t) => JSON.parse(t) as Stored).catch(() => null) : Promise.resolve(null);
export const checkPhoto = (id: string) =>
  validId(id) ? fs.readFile(path.join(dir(), `${id}.jpg`)).catch(() => null) : Promise.resolve(null);

export async function pendingChecks() {
  const files = await fs.readdir(dir()).catch(() => [] as string[]);
  const out: { id: string; slug: string }[] = [];
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    const s = await readCheck(f.slice(0, -5));
    if (s?.status === 'pending') out.push({ id: s.id, slug: s.slug });
  }
  return out;
}

// The reader posts the comparison without the photo itself; the site serves that by id.
export async function setCheckResult(id: string, body: { slug?: string; result?: Record<string, unknown>; error?: string }) {
  const s = await readCheck(id);
  if (!s) return null;
  const { uploadUrl: _drop, ...result } = body.result ?? {};
  const next: Stored = { ...s, slug: body.slug ?? s.slug, status: body.result ? 'done' : 'failed', result: body.result ? result : undefined, error: body.error };
  await fs.writeFile(path.join(dir(), `${id}.json`), JSON.stringify(next));
  return next;
}

// When the reader last asked for work, so the page can say whether anyone is reading.
let readerSeen = 0;
export const markReader = () => { readerSeen = Date.now(); };
export const readerOnline = () => Date.now() - readerSeen < 90_000;
