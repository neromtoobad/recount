// Frame-exact render of index.html: seek(t) per frame, screenshot, pipe to ffmpeg. Parallel workers, then concat.
//   node render.mjs --stills 3,40,70        -> probe/still-<t>.jpg
//   node render.mjs [--workers 6] [--fps 30] -> out/silent.mp4
import puppeteer from 'puppeteer-core';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FF = ffmpegInstaller.path;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = Number(arg('--fps', 30)), WORKERS = Number(arg('--workers', 6));
const TOTAL = JSON.parse(readFileSync(arg('--vo', 'vo.json'), 'utf8')).total;
const URL_ = pathToFileURL(process.cwd() + '/' + arg('--page', 'index.html')).href;
const OUT = arg('--out', 'out/silent.mp4'), PART = arg('--part', 'part');
mkdirSync('out', { recursive: true }); mkdirSync('probe', { recursive: true });

const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--disable-web-security', '--force-color-profile=srgb', '--hide-scrollbars'], defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 } });
const browsers = [];
async function newPage() {
  // one browser per worker: a background tab in a shared browser stalls on img.decode()
  const b = await launch(); browsers.push(b);
  const p = (await b.pages())[0] || (await b.newPage());
  await p.goto(URL_, { waitUntil: 'networkidle0' });
  await p.evaluate(() => window.ready);
  return p;
}

const stills = arg('--stills');
if (stills) {
  const p = await newPage();
  for (const t of stills.split(',').map(Number)) { await p.evaluate((x) => window.seek(x), t); await p.screenshot({ path: `probe/still-${t}.jpg`, type: 'jpeg', quality: 85 }); }
  for (const b of browsers) await b.close(); process.exit(0);
}

const N = Math.ceil(TOTAL * FPS);
const per = Math.ceil(N / WORKERS);
const t0 = Date.now();
await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
  const a = w * per, b = Math.min(N, a + per); if (a >= b) return;
  const p = await newPage();
  const ff = spawn(FF, ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), `out/${PART}-${w}.mp4`], { stdio: ['pipe', 'ignore', 'inherit'] });
  let dead = null; ff.on('close', (c) => { dead = c; }); ff.stdin.on('error', (e) => { dead = e.message; });
  for (let i = a; i < b; i++) {
    await p.evaluate((x) => window.seek(x), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 93 });
    if (dead !== null) throw new Error(`encoder ${w} exited: ${dead}`);
    if (!ff.stdin.write(buf)) await new Promise((r) => { ff.stdin.once('drain', r); });
    if (w === 0 && i % 150 === 0) console.log(`${(((i - a) / (b - a)) * 100).toFixed(0)}%  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end(); if (dead === null) await new Promise((r) => ff.on('close', r));
}));
writeFileSync('out/parts.txt', Array.from({ length: WORKERS }, (_, w) => `file '${PART}-${w}.mp4'`).join('\n'));
spawnSync(FF, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'out/parts.txt', '-c', 'copy', OUT], { stdio: 'inherit' });
console.log(`rendered ${N} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
for (const b of browsers) await b.close();
process.exit(0);
