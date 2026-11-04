// Builds data/nigeria/registry.json, every polling unit in the country, from the IReV index
// of the 2023 presidential election (the last election held in every unit). LGA and ward
// names go into lookup tables so the file stays small enough to ship with the site.
// Usage: node scripts/registry.mjs [president-2023]
import fs from 'node:fs/promises';
import path from 'node:path';

const slug = process.argv[2] ?? 'president-2023';
const { election, pus } = JSON.parse(await fs.readFile(path.join('data', slug, 'index.json'), 'utf8'));

const STATES = ['ABIA', 'ADAMAWA', 'AKWA IBOM', 'ANAMBRA', 'BAUCHI', 'BAYELSA', 'BENUE', 'BORNO', 'CROSS RIVER', 'DELTA', 'EBONYI', 'EDO', 'EKITI', 'ENUGU', 'GOMBE', 'IMO', 'JIGAWA', 'KADUNA', 'KANO', 'KATSINA', 'KEBBI', 'KOGI', 'KWARA', 'LAGOS', 'NASARAWA', 'NIGER', 'OGUN', 'ONDO', 'OSUN', 'OYO', 'PLATEAU', 'RIVERS', 'SOKOTO', 'TARABA', 'YOBE', 'ZAMFARA', 'FCT'];
const lgas = [], wards = [], lgaIdx = new Map(), wardIdx = new Map();
const units = [];
for (const p of pus) {
  const s = Number(p.puCode.split('/')[0]) - 1;
  if (!(s >= 0 && s < STATES.length)) continue;
  const lk = `${s}|${p.lga}`;
  if (!lgaIdx.has(lk)) { lgaIdx.set(lk, lgas.length); lgas.push([s, p.lga]); }
  const wk = `${lk}|${p.ward}`;
  if (!wardIdx.has(wk)) { wardIdx.set(wk, wards.length); wards.push([lgaIdx.get(lk), p.ward]); }
  // Upload time in whole minutes since the epoch, 0 when the unit never got a sheet.
  const t = p.uploadedAt ? Math.round(Date.parse(p.uploadedAt) / 60_000) : 0;
  units.push([p.puCode, (p.name ?? '').replace(/\s+/g, ' ').trim(), wardIdx.get(wk), t, p.oldSheets?.length ?? 0]);
}
units.sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));

const out = {
  builtAt: new Date().toISOString(),
  source: { election: election.id, slug, title: 'Presidential election · 25 Feb 2023' },
  states: STATES, lgas, wards,
  // [code, name, ward index, upload minute (0 = none), replaced uploads]
  units,
};
await fs.mkdir(path.join('data', 'nigeria'), { recursive: true });
await fs.writeFile(path.join('data', 'nigeria', 'registry.json'), JSON.stringify(out));
console.log(`${units.length} units, ${lgas.length} LGAs, ${wards.length} wards, ${units.filter((u) => u[3]).length} with a 2023 upload`);
