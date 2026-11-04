// Builds data/<slug>/index.json: every polling unit in an IReV election with its
// current result-sheet URL and any replaced uploads. Metadata only, no images.
// Usage: node scripts/index-irev.mjs <electionId> <slug>
import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://dolphin-app-sleqh.ondigitalocean.app/api/v1';
const [electionId, slug] = process.argv.slice(2);
if (!electionId || !slug) {
  console.error('usage: node scripts/index-irev.mjs <electionId> <slug>');
  process.exit(1);
}

const outDir = path.join('data', slug);
await fs.mkdir(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CONC = Number(process.env.CONC ?? 2);
// State names by the first part of the polling-unit code.
const STATES = ['ABIA', 'ADAMAWA', 'AKWA IBOM', 'ANAMBRA', 'BAUCHI', 'BAYELSA', 'BENUE', 'BORNO', 'CROSS RIVER', 'DELTA', 'EBONYI', 'EDO', 'EKITI', 'ENUGU', 'GOMBE', 'IMO', 'JIGAWA', 'KADUNA', 'KANO', 'KATSINA', 'KEBBI', 'KOGI', 'KWARA', 'LAGOS', 'NASARAWA', 'NIGER', 'OGUN', 'ONDO', 'OSUN', 'OYO', 'PLATEAU', 'RIVERS', 'SOKOTO', 'TARABA', 'YOBE', 'ZAMFARA', 'FCT'];
// 2023 sheet URLs end in <pu>-<unix seconds>.pdf, the moment the sheet reached IReV; their
// stored updated_at values were rewritten in a 2024 migration.
// The stamp is Lagos wall-clock time written as if it were UTC (INEC's first 2023 presidential
// upload, 8:55 pm WAT, is stamped 20:56), so take an hour off.
const fileTime = (url) => { const m = /-(\d{10})\.(pdf|jpe?g|png)$/i.exec(url ?? ''); return m ? new Date((Number(m[1]) - 3600) * 1000).toISOString() : null; };

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()).data;
      if (res.status < 500 && res.status !== 429) throw new Error(`${res.status} ${url}`);
    } catch (err) {
      if (i === tries - 1) throw err;
    }
    await sleep(1500 * (i + 1));
  }
  throw new Error(`gave up on ${url}`);
}

const lgas = await get(`${API}/elections/${electionId}/lga`);
// START/END index a slice of the wards (for splitting a national election across processes);
// the slice is written to index.part-<START>.json for scripts/merge-index.mjs to join.
const allWards = lgas.flatMap((l) => l.wards.map((w) => ({ ...w, lgaName: l.lga.name, lgaCode: l.lga.code })));
const START = Number(process.env.START ?? 0), END = Number(process.env.END ?? allWards.length);
const wards = allWards.slice(START, END);
const partial = START > 0 || END < allWards.length;
console.log(`${lgas.length} LGAs, ${wards.length} wards`);

const pus = [];
let done = 0;
// Two requests in flight with a pause between batches keeps the load light.
for (let i = 0; i < wards.length; i += CONC) {
  const batch = wards.slice(i, i + CONC);
  const results = await Promise.all(batch.map((w) => get(`${API}/elections/${electionId}/pus?ward=${w._id}`)));
  results.forEach((rows, k) => {
    const w = batch[k];
    for (const r of rows) {
      pus.push({
        id: r._id,
        puCode: r.pu_code,
        name: r.name?.trim(),
        state: STATES[Number(r.pu_code?.split('/')[0]) - 1] ?? null,
        lga: w.lgaName,
        lgaCode: w.lgaCode,
        ward: w.name.replace(/\s+/g, ' ').trim(),
        wardCode: w.code,
        sheetUrl: r.document?.url ?? null,
        uploadedAt: fileTime(r.document?.url) ?? r.document?.updated_at ?? null,
        oldSheets: (r.old_documents ?? []).map((d) => ({ url: d.url, uploadedAt: fileTime(d.url) ?? d.updated_at })),
      });
    }
  });
  done += batch.length;
  if (done % 200 < CONC) console.log(`${done}/${wards.length} wards, ${pus.length} PUs`);
  await sleep(250);
}

const election = { id: electionId, slug, lgas: lgas.length, wards: wards.length, pus: pus.length, indexedAt: new Date().toISOString() };
await fs.writeFile(path.join(outDir, partial ? `index.part-${START}.json` : 'index.json'), JSON.stringify({ election, pus }, null, 1));
const withSheet = pus.filter((p) => p.sheetUrl).length;
const replaced = pus.filter((p) => p.oldSheets.length).length;
console.log(`saved ${pus.length} PUs (${withSheet} with sheets, ${replaced} with replaced uploads)`);
