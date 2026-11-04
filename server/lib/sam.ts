import { apiKey, BASE_URL } from './meta.ts';
import type { Box, Evidence } from './types.ts';

// SAM 3.1 streams special-token text; boxes are all we need for overlays, so we
// parse the documented box grammar directly and skip mask decoding.
const BOX = /<\|box;([^|]*)\|>/g;

function parseBoxes(text: string): { boxes: Box[]; width: number; height: number } {
  const boxes: Box[] = [];
  let width = 0, height = 0;
  for (const m of text.matchAll(BOX)) {
    const kv = Object.fromEntries(m[1].split(';').map((p) => p.split('=') as [string, string]));
    width = Number(kv.w); height = Number(kv.h);
    boxes.push({ x1: +kv.x1, y1: +kv.y1, x2: +kv.x2, y2: +kv.y2, c: kv.c ? +kv.c : null });
  }
  return { boxes, width, height };
}

// SAM's rate limit is tighter than Spark's; back off and retry on 429 and 5xx.
async function samFetch(init: RequestInit): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(`${BASE_URL}/responses`, init);
    if ((res.status !== 429 && res.status < 500) || i >= 6) return res;
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 2000 * 2 ** i + Math.random() * 1000));
  }
}

export async function segment(imageUrl: string, prompt: string, minConfidence = 0.4) {
  const res = await samFetch({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: 'sam-3.1',
      stream: true,
      metadata: { include_confidence: 'true', mask_encoding: 'one_bit' },
      input: [{
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: imageUrl },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`SAM ${res.status}: ${(await res.text()).slice(0, 300)}`);

  let text = '';
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      const ev = JSON.parse(data);
      if (ev.type === 'response.output_text.delta' && ev.delta) text += ev.delta;
    }
  }
  const parsed = parseBoxes(text);
  parsed.boxes = parsed.boxes.filter((b) => b.c === null || b.c >= minConfidence);
  return parsed;
}

// SAM segments objects, not pen strokes: "round stamp" is reliable, while signatures
// and handwriting return nothing, so those are judged by Muse Spark instead.
export async function gatherEvidence(imageUrl: string): Promise<Evidence> {
  const [stamp, correction] = await Promise.all([
    segment(imageUrl, 'round stamp', 0.5),
    segment(imageUrl, 'correction fluid', 0.5),
  ]);
  const sized = [stamp, correction].find((r) => r.width) ?? { width: 0, height: 0 };
  return { width: sized.width, height: sized.height, stamp: stamp.boxes, signature: [], correction: correction.boxes };
}
