import fs from 'node:fs/promises';
import path from 'node:path';
import { meta, SPARK_PRIVATE } from './meta.ts';
import { readSheet } from './reader.ts';
import { withSheet } from './image.ts';
import type { Analysis, PU, SheetRead } from './types.ts';
import { DATA_DIR } from './config.ts';

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');


function findPU(pus: PU[], read: SheetRead): PU | null {
  const h = read.header;
  const lga = digits(h.lgaCode), ward = digits(h.wardCode), pu = digits(h.puCode).padStart(3, '0');
  if (lga && ward && digits(h.puCode)) {
    const hit = pus.find((p) => {
      const [, l, w, n] = p.puCode.split('/');
      return l === lga.padStart(2, '0') && w === ward.padStart(2, '0') && n === pu;
    });
    if (hit) return hit;
  }
  // Fall back to names when the code boxes are cropped or unreadable.
  const name = norm(h.pollingUnit), wardName = norm(h.ward);
  return pus.find((p) => norm(p.name) === name && (!wardName || norm(p.ward) === wardName)) ?? null;
}

export type FieldDiff = { field: string; upload: number | null; original: number | null };

function diffReads(up: SheetRead, og: SheetRead): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const k of Object.keys(og.summary) as (keyof SheetRead['summary'])[]) {
    const a = up.summary[k].value, b = og.summary[k].value;
    if (a !== b) diffs.push({ field: k, upload: a, original: b });
  }
  const ogParties = new Map(og.parties.map((p) => [norm(p.party), p.figures]));
  for (const p of up.parties) {
    const key = norm(p.party);
    if (!ogParties.has(key)) continue;
    const b = ogParties.get(key)!;
    if (p.figures !== b) diffs.push({ field: p.party, upload: p.figures, original: b });
  }
  return diffs;
}

const VISUAL_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['matches', 'altered', 'different_sheet', 'unclear'] },
    samePhysicalSheet: { type: 'boolean' },
    summary: { type: 'string' },
    differences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          original: { type: 'string' },
          circulating: { type: 'string' },
          how: { type: 'string' },
          box: {
            type: 'object',
            properties: { x1: { type: 'integer' }, y1: { type: 'integer' }, x2: { type: 'integer' }, y2: { type: 'integer' } },
            required: ['x1', 'y1', 'x2', 'y2'],
            additionalProperties: false,
          },
        },
        required: ['field', 'original', 'circulating', 'how', 'box'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdict', 'samePhysicalSheet', 'summary', 'differences'],
  additionalProperties: false,
};

export type Visual = {
  verdict: 'matches' | 'altered' | 'different_sheet' | 'unclear';
  samePhysicalSheet: boolean;
  summary: string;
  differences: { field: string; original: string; circulating: string; how: string; box: { x1: number; y1: number; x2: number; y2: number } }[];
};

async function visualCompare(originalUrl: string, uploadUrl: string): Promise<Visual> {
  const res = await meta().chat.completions.create({
    model: SPARK_PRIVATE,
    reasoning_effort: 'medium',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'IMAGE 1 is the official result sheet INEC uploaded to its IReV portal.' },
        { type: 'image_url', image_url: { url: originalUrl } },
        { type: 'text', text: 'IMAGE 2 is a copy of the same polling unit\'s sheet that is circulating on social media.' },
        { type: 'image_url', image_url: { url: uploadUrl } },
        {
          type: 'text',
          text: `Compare them like a forensic document examiner. Decide whether IMAGE 2 is a photo of the same physical sheet (same handwriting, ink, stamp and fold marks), and list every entry whose value differs: numbers, names, codes, stamps or signatures added or removed. For each difference say how it was changed (overwritten digit, added digit, pasted region, different handwriting, retyped) and give its location on IMAGE 2 as a box in 0-1000 normalised coordinates (x1,y1 top-left, x2,y2 bottom-right).
verdict: "matches" = same sheet, no meaningful changes; "altered" = same sheet with edits; "different_sheet" = a different sheet entirely; "unclear" = cannot tell. Differences in lighting, angle or crop are not changes. summary: one plain sentence for the public, no accusations against any party or person.`,
        },
      ],
    }],
    response_format: { type: 'json_schema', json_schema: { name: 'sheet_compare', strict: true, schema: VISUAL_SCHEMA } },
  } as any);
  return JSON.parse(res.choices[0]!.message!.content!) as Visual;
}

// uploadUrl is the circulating photo as a JPEG data URL; it is returned so the UI can show it.
export async function checkImage(slug: string, uploadUrl: string) {
  const dir = path.join(DATA_DIR, slug);
  const { pus } = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8')) as { pus: PU[] };
  const upload = await readSheet(uploadUrl, SPARK_PRIVATE);
  if (!upload.isResultSheet) return { status: 'not_a_sheet' as const, upload, uploadUrl };

  const pu = findPU(pus, upload);
  if (!pu) return { status: 'no_match' as const, upload, uploadUrl };
  if (!pu.sheetUrl) return { status: 'no_original' as const, pu, upload, uploadUrl };

  const stored = await fs.readFile(path.join(dir, 'analysis', `${pu.id}.json`), 'utf8')
    .then((t) => JSON.parse(t) as Analysis).catch(() => null);
  const [original, visual] = await withSheet(pu.sheetUrl, (originalUrl) => Promise.all([
    stored?.read ? Promise.resolve(stored.read) : readSheet(originalUrl),
    visualCompare(originalUrl, uploadUrl),
  ]));
  const diffs = diffReads(upload, original);
  return { status: 'compared' as const, pu, upload, original, diffs, visual, uploadUrl };
}
