// Records real Recount footage from the live site with raw CDP screencast frames + timestamps.
//   node record.mjs home sheet osun check collation report pack
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const B = 'https://recount-production-bcaf.up.railway.app';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VW = 1600, VH = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (p) => fetch(`${B}/api/${p}`).then((r) => r.json());

const CURSOR = `(() => {
  const init = () => {
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" style="display:block;transform-origin:4px 2px;transition:transform .08s"><path d="M4 2v18l4.8-4.8 3.4 7.2 2.7-1.2-3.3-7.1H18L4 2z" fill="#141414" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: 0, top: 0, zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-60px,-60px)' });
    const attach = () => { if (!c.isConnected) (document.body || document.documentElement).appendChild(c); };
    attach(); addEventListener('DOMContentLoaded', attach);
    addEventListener('mousemove', (e) => { attach(); c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    addEventListener('mousedown', () => { c.firstChild.style.transform = 'scale(.84)'; }, true);
    addEventListener('mouseup', () => { c.firstChild.style.transform = ''; }, true);
  };
  if (document.documentElement) init(); else new MutationObserver((m, o) => { if (document.documentElement) { o.disconnect(); init(); } }).observe(document, { childList: true });
})();`;

function tools(page, st) {
  const move = async (x, y, ms = 650) => {
    const n = Math.max(8, Math.round(ms / 16)), x0 = st.mx, y0 = st.my;
    for (let i = 1; i <= n; i++) { const k = i / n, e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2; await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e); await sleep(ms / n); }
    st.mx = x; st.my = y;
  };
  const at = (sel, text) => page.evaluate((s, t) => {
    const re = t ? new RegExp(t, 'i') : null;
    const el = [...document.querySelectorAll(s)].find((n) => (!re || re.test(n.textContent || n.placeholder || '')) && n.getBoundingClientRect().width > 0);
    if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel, text);
  const click = async (sel, text, ms = 600) => {
    const p = await at(sel, text); if (!p) throw new Error(`no ${sel} ${text ?? ''}`);
    await move(p.x, p.y, ms); await sleep(140); await page.mouse.down(); await sleep(90); await page.mouse.up();
  };
  const scroll = async (dy, ms = 1400) => { const n = Math.round(ms / 16); for (let i = 0; i < n; i++) { await page.mouse.wheel({ deltaY: dy / n }); await sleep(16); } };
  const go = (p) => page.goto(p.startsWith('http') ? p : `${B}${p}`, { waitUntil: 'networkidle2', timeout: 60000 });
  const typeIn = async (sel, value) => { const p = await at(sel); await move(p.x, p.y, 500); await page.mouse.down(); await page.mouse.up(); await page.keyboard.type(value, { delay: 70 }); };
  // Scrolls the element whose text matches into view (window or any scroll container), instantly.
  const reveal = (re, block = 'center') => page.evaluate((src, b) => {
    const r = new RegExp(src); let el = null;
    for (const n of document.querySelectorAll('body *:not(script):not(style):not(template)')) if (r.test(n.textContent || '') && ![...n.children].some((c) => r.test(c.textContent || ''))) { el = n; break; }
    if (!el) return false; el.scrollIntoView({ block: b, behavior: 'instant' }); return true;
  }, re, block);
  const box = (re) => page.evaluate((src) => {
    const r = new RegExp(src); let el = null;
    for (const n of document.querySelectorAll('body *:not(script):not(style):not(template)')) if (r.test(n.textContent || '') && ![...n.children].some((c) => r.test(c.textContent || ''))) { el = n; break; }
    if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.left, t: b.top, w: b.width, h: b.height };
  }, re);
  return { move, at, click, scroll, go, typeIn, reveal, box, page };
}

async function take(browser, name, { pre, run }) {
  const page = await browser.newPage();
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(CURSOR);
  const st = { mx: VW * 0.62, my: VH * 0.62 };
  const t = tools(page, st);
  if (pre) await pre(t);
  const dir = `clips/${name}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const cdp = await page.createCDPSession();
  const frames = [];
  let t0 = null, wall0 = null;
  cdp.on('Page.screencastFrame', async (f) => {
    if (t0 === null) { t0 = f.metadata.timestamp; wall0 = Date.now(); }
    frames.push(f.metadata.timestamp - t0);
    writeFileSync(`${dir}/${String(frames.length - 1).padStart(5, '0')}.jpg`, Buffer.from(f.data, 'base64'));
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 86, maxWidth: VW, maxHeight: VH, everyNthFrame: 1 });
  await run(t);
  await sleep(250);
  const dur = (Date.now() - wall0) / 1000;
  await cdp.send('Page.stopScreencast');
  writeFileSync(`clips/${name}.json`, JSON.stringify({ dur, frames }, null, 0));
  console.log(`${name}: ${frames.length} frames over ${dur.toFixed(1)} s`);
  await page.close();
}

const SHEET = '/osun/pu/6a7f7928dcbc755a763f1999';
const TAKES = {
  home: { run: async ({ go, move }) => {
    await go('/'); await sleep(1800); await move(420, 330, 1100); await sleep(1500); await move(980, 520, 1000); await sleep(1500); await move(1180, 300, 900); await sleep(1600);
  } },
  // The sheet X-ray: the stamp SAM found, Muse Spark's edit marks, then the flags beside it.
  sheet: { pre: async ({ go, page }) => { await go(SHEET); await sleep(2500); await page.evaluate(() => scrollTo(0, 330)); await sleep(900); },
    run: async ({ move, box, scroll }) => {
      await sleep(500);
      for (const n of ['1', '2', '3', '4']) {
        const b = await box(`^${n}$`); if (b && b.y > 80 && b.y < 860) { await move(b.x, b.y, 900); await sleep(1300); }
      }
      const f = await box('^More votes than accredited voters$'); if (f) { await move(f.x + 40, f.y + 10, 900); await sleep(1800); }
      await scroll(560, 1600); await sleep(600);
      const a = await box('^The arithmetic$'); if (a) { await move(a.x + 200, a.y + 70, 900); await sleep(2200); }
    } },
  osun: { pre: async ({ go, page }) => { await go('/osun'); await sleep(2500); await page.evaluate(() => scrollTo(0, 560)); await sleep(800); },
    run: async ({ move, box, scroll }) => {
      await sleep(400); const s = await box('^3,752$'); if (s) { await move(s.x, s.y, 900); await sleep(1300); }
      const r = await box('^354$'); if (r) { await move(r.x, r.y, 900); await sleep(1300); }
      await scroll(640, 1700); await sleep(500);
      for (const re of ['^510,520$', '^444,651$']) { const b = await box(re); if (b) { await move(b.x + 90, b.y, 900); await sleep(1400); } }
      await sleep(900);
    } },
  check: { pre: async ({ go }) => { await go('/check'); await sleep(2500); },
    run: async ({ move, box, page, scroll }) => {
      await sleep(500); const d = await box('^Drop a result sheet photo here$'); if (d) { await move(d.x, d.y, 1000); await sleep(700); }
      const input = await page.$('input[type=file]'); await input.uploadFile('../public/demo/altered-29-17-03-007.jpg');
      await page.waitForFunction(() => /Altered copy/.test(document.body.innerText), { timeout: 120000 }); await sleep(1500);
      const v = await box('^Altered copy$'); if (v) { await move(v.x + 160, v.y + 30, 900); await sleep(1800); }
      await scroll(520, 1500); await sleep(800); await move(560, 520, 900); await sleep(1600);
      await scroll(380, 1300); await sleep(400);
      const w = await box("^What's different$"); if (w) { await move(w.x + 420, w.y + 90, 900); await sleep(2200); }
    } },
  collation: { pre: async ({ go }) => { await go('/collation'); await sleep(2500); },
    run: async ({ move, box, page, scroll }) => {
      await sleep(400); const t = await box('^Try the demo sheet$'); if (t) { await move(t.x, t.y, 1000); await sleep(300); await page.mouse.down(); await sleep(90); await page.mouse.up(); }
      await page.waitForFunction(() => /Does not match the polling-unit sheets/.test(document.body.innerText), { timeout: 120000 }); await sleep(1400);
      const h = await box('^Does not match the polling-unit sheets$'); if (h) { await move(h.x + 120, h.y + 40, 900); await sleep(1800); }
      await scroll(520, 1500); await sleep(500);
      const r = await box('DISPENSARY'); if (r) { await move(r.x + 260, r.y, 900); await sleep(1800); }
      const n = await box('^The total does not add up'); if (n) { await move(n.x + 200, n.y, 900); await sleep(1800); }
    } },
  report: { pre: async ({ go }) => { await go('/report'); await sleep(2500); },
    run: async ({ move, box, page }) => {
      await sleep(400);
      const k = await box('^Officials or materials have not arrived$'); if (k) { await move(k.x, k.y, 900); await sleep(900); }
      const v = await box('^Vote buying'); if (v) { await move(v.x, v.y, 800); await sleep(250); await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(1300); }
      const s = await box('^Send report$'); if (s) { await move(s.x, s.y, 900); await sleep(1500); }
    } },
  pack: { pre: async ({ go }) => { await go(`/osun/pack/pu/6a7f7928dcbc755a763f1999`); await sleep(2500); },
    run: async ({ move, box, scroll }) => {
      await sleep(400); const m = await box('^Manifest SHA-256$'); if (m) { await move(m.x + 380, m.y, 1000); await sleep(1500); }
      await scroll(700, 1600); await sleep(400);
      const h = await box('^SHA-256 as published$'); if (h) { await move(h.x + 300, h.y, 900); await sleep(2200); }
    } },
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
for (const name of process.argv.slice(2)) {
  try { await take(browser, name, TAKES[name]); } catch (e) { console.log(`${name} FAILED: ${e.message}`); }
}
await browser.close();
process.exit(0);
