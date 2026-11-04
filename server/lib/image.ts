import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { DATA_DIR } from './config.ts';

const SHEET_HOSTS = new Set(['inc-s3-cache.incportals.com', 'inec-prod-cache.s3.eu-west-2.amazonaws.com']);
export const isSheetUrl = (u: string) => {
  try { return SHEET_HOSTS.has(new URL(u).hostname); } catch { return false; }
};

export async function toJpeg(buf: Buffer, maxSide = 2000): Promise<Buffer> {
  return sharp(buf)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function toJpegDataUrl(buf: Buffer, maxSide = 2000): Promise<string> {
  return `data:image/jpeg;base64,${(await toJpeg(buf, maxSide)).toString('base64')}`;
}

// The resized copies are a cache, not a record: IReV still holds the originals. Keep the
// cache under IMG_CACHE_MB, dropping the oldest copies first, so it never fills the volume
// the results live on.
const cacheDir = path.join(DATA_DIR, 'img-cache');
const cacheCap = Number(process.env.IMG_CACHE_MB ?? 1500) * 1_000_000;
let writes = 0;
export async function pruneImageCache() {
  const names = await fs.readdir(cacheDir).catch(() => [] as string[]);
  const files = (await Promise.all(names.map((n) => fs.stat(path.join(cacheDir, n)).then((s) => ({ n, size: s.size, t: s.mtimeMs }), () => null))))
    .filter((f) => !!f).sort((a, b) => a.t - b.t);
  let total = files.reduce((sum, f) => sum + f.size, 0);
  let removed = 0;
  for (const f of files) {
    if (total <= cacheCap * 0.8) break;
    await fs.rm(path.join(cacheDir, f.n), { force: true });
    total -= f.size;
    removed++;
  }
  return { files: files.length - removed, removed, mb: Math.round(total / 1e6) };
}

// IReV sheets are ~4 MB phone photos served as binary/octet-stream. We fetch once,
// apply EXIF rotation, shrink to 2000 px and keep a copy on disk; both the UI and
// Meta's API read this version.
export async function sheetJpeg(url: string): Promise<Buffer> {
  if (!isSheetUrl(url)) throw new Error('not an IReV sheet URL');
  const file = path.join(cacheDir, `${crypto.createHash('sha1').update(url).digest('hex')}.jpg`);
  const cached = await fs.readFile(file).catch(() => null);
  // A copy written while the disk was full can be cut short; only a JPEG that ends with its
  // end-of-image marker counts, anything else is fetched again.
  if (cached && cached.at(-2) === 0xff && cached.at(-1) === 0xd9) return cached;

  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`sheet fetch ${res.status}`);
      const jpg = await toJpeg(Buffer.from(await res.arrayBuffer()));
      // A full disk must not stop the sheet being served; it just isn't kept.
      await fs.mkdir(cacheDir, { recursive: true }).then(() => fs.writeFile(file, jpg)).catch(() => fs.rm(file, { force: true }));
      if (++writes % 200 === 0) pruneImageCache().catch(() => {});
      return jpg;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

// What to hand Meta for a sheet: a public URL to our resizing proxy when one is
// configured (no image bytes cross the runner's own connection), else inline bytes.
export async function sheetInput(url: string): Promise<string> {
  const proxy = process.env.IMAGE_PROXY_BASE;
  // v changes the address Meta sees, so it fetches afresh instead of reusing a copy it took
  // while the volume was full (Nov 2) and the proxy was serving cut-short files.
  if (proxy) return `${proxy.replace(/\/$/, '')}/img?u=${encodeURIComponent(url)}&v=2`;
  return `data:image/jpeg;base64,${(await sheetJpeg(url)).toString('base64')}`;
}

// Meta occasionally can't download from the proxy (a cold fetch or a network blip).
// Retry once with the bytes inline, which never depends on Meta reaching us.
export async function withSheet<T>(url: string, fn: (input: string) => Promise<T>): Promise<T> {
  try {
    return await fn(await sheetInput(url));
  } catch (err) {
    if (!process.env.IMAGE_PROXY_BASE || !/fetchable|download media|origin/i.test(String((err as Error).message))) throw err;
    return fn(`data:image/jpeg;base64,${(await sheetJpeg(url)).toString('base64')}`);
  }
}
