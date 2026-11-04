// Builds the worked example shown on the hosted checker: runs a real check on our own
// altered test copy and saves the result, plus a watermarked image for display.
// Usage: npx tsx scripts/make-demo-check.ts
import 'dotenv/config';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { checkImage } from '../server/lib/compare.ts';
import { toJpegDataUrl, toJpeg } from '../server/lib/image.ts';

const src = await fs.readFile('test/doctored-29-17-03-007.jpg');
const started = Date.now();
const result = await checkImage('osun', await toJpegDataUrl(src));
const seconds = Math.round((Date.now() - started) / 1000);

const jpg = await toJpeg(src);
const { width = 1500, height = 2000 } = await sharp(jpg).metadata();
const band = Math.round(height * 0.05);
const label = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${height - band}" width="${width}" height="${band}" fill="#d03b3b"/>
  <text x="${width / 2}" y="${height - band * 0.32}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${band * 0.46}" fill="#fff" text-anchor="middle">TEST COPY · ALTERED BY RECOUNT TO DEMONSTRATE THE CHECKER · NOT A REAL RESULT</text>
</svg>`;
await sharp(jpg).composite([{ input: Buffer.from(label) }]).jpeg({ quality: 85 }).toFile('public/demo/altered-29-17-03-007.jpg');

await fs.writeFile('data/osun/demo-check.json', JSON.stringify({
  ...result, uploadUrl: '/demo/altered-29-17-03-007.jpg', seconds, ranAt: new Date().toISOString(),
}));
console.log(result.status, 'verdict' in result ? '' : '', (result as any).visual?.verdict, `${seconds}s`);
