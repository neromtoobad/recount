// Full-page screenshots at the recording size, to plan camera moves.   node probe.mjs /path ...
import puppeteer from 'puppeteer-core';
const B = 'https://recount-production-bcaf.up.railway.app';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
for (const p of process.argv.slice(2)) {
  const page = await b.newPage(); await page.setViewport({ width: 1600, height: 900 });
  await page.goto(B + p, { waitUntil: 'networkidle2', timeout: 60000 }); await new Promise((r) => setTimeout(r, 2500));
  const name = p.replace(/[^a-z0-9]+/gi, '_') || 'home';
  await page.screenshot({ path: `probe/${name}.jpg`, type: 'jpeg', quality: 60, fullPage: true });
  const h = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,button')].map((e) => `${e.tagName}@${Math.round(e.getBoundingClientRect().top + scrollY)}:${e.textContent.trim().slice(0, 50)}`).join(' | '));
  console.log(name, await page.evaluate(() => document.body.scrollHeight), h.slice(0, 900));
  await page.close();
}
await b.close();
