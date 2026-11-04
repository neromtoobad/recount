// Runs the full pipeline on one PU and prints what came back, for prompt tuning.
import fs from 'node:fs/promises';
import { analyzePU } from '../server/lib/analyze.ts';
import type { PU } from '../server/lib/types.ts';
const [slug, code] = process.argv.slice(2);
const { pus } = JSON.parse(await fs.readFile(`data/${slug}/index.json`, 'utf8')) as { pus: PU[] };
const pu = pus.find((p) => p.puCode === code || p.id === code)!;
const t = Date.now();
const a = await analyzePU(pu);
console.log(`took ${((Date.now() - t) / 1000).toFixed(1)}s`);
if (a.error) { console.log('ERROR', a.error); process.exit(1); }
const r = a.read!;
console.log('header', r.header, 'sn', r.serialNumber, 'quality', r.imageQuality);
console.log('summary', Object.fromEntries(Object.entries(r.summary).map(([k, f]) => [k, f.value + (f.altered ? '*' : '')])));
console.log('parties', r.parties.map((p) => `${p.party}=${p.figures}${p.altered ? '*' : ''}(${p.wordsValue})`).join(' '));
console.log('bottom', r.totalValidBottom, 'PO named', r.presidingOfficerNamed, 'signed', r.presidingOfficerSigned, 'stamped', r.stamped, 'notes', r.notes);
console.log('SAM', a.evidence && { w: a.evidence.width, h: a.evidence.height, stamp: a.evidence.stamp, signature: a.evidence.signature.length, correction: a.evidence.correction });
console.log('FLAGS', a.flags.map((f) => `${f.code}: ${f.detail}`));
