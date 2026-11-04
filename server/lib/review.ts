import { meta, SPARK_PRIVATE } from './meta.ts';
import { withSheet } from './image.ts';
import type { Analysis, Review } from './types.ts';

// Flags that rest on numbers or codes read off the sheet. A misread digit can raise any of
// them, so each one gets a second, slower look before anyone acts on it.
const NUMERIC = new Set(['party_sum', 'total_mismatch', 'used_ballots', 'issued_ballots', 'over_voting', 'over_accreditation', 'words_figures', 'wrong_pu']);

export const reviewable = (a: Analysis) => !!a.read && a.flags.some((f) => NUMERIC.has(f.code));

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          verdict: { type: 'string', enum: ['on_sheet', 'misread', 'unclear'] },
          sheetSays: { type: 'string' },
          explanation: { type: 'string' },
          box: {
            type: 'object',
            properties: { x1: { type: 'integer' }, y1: { type: 'integer' }, x2: { type: 'integer' }, y2: { type: 'integer' } },
            required: ['x1', 'y1', 'x2', 'y2'],
            additionalProperties: false,
          },
        },
        required: ['code', 'verdict', 'sheetSays', 'explanation', 'box'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string' },
  },
  required: ['items', 'summary'],
  additionalProperties: false,
};

export async function reviewSheet(a: Analysis): Promise<Review> {
  const read = a.read!;
  const flags = a.flags.filter((f) => NUMERIC.has(f.code));
  const first = {
    codesOnSheet: [read.header.stateCode, read.header.lgaCode, read.header.wardCode, read.header.puCode].join('/'),
    iRevSlot: a.pu.puCode,
    summary: Object.fromEntries(Object.entries(read.summary).map(([k, f]) => [k, f.value])),
    totalValidUnderTable: read.totalValidBottom,
    parties: read.parties.map((p) => ({ party: p.party, figures: p.figures, words: p.words })),
  };
  const res = await withSheet(a.pu.sheetUrl!, (image) => meta().chat.completions.create({
    model: SPARK_PRIVATE,
    reasoning_effort: 'medium',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: image } },
        {
          type: 'text',
          text: `This is an INEC polling-unit result sheet (Form EC8A). An automated first reading copied it as:
${JSON.stringify(first)}

Plain arithmetic on that reading raised these flags:
${flags.map((f) => `- ${f.code}: ${f.title}. ${f.detail}`).join('\n')}

Take a second look, like a careful human checker. For each flag, find only the entries it depends on and read them again digit by digit. Watch for digits that are easy to confuse in handwriting (1 and 7, 4 and 9, 0 and 6, 3 and 8), numbers written over other numbers, smudges, and boxes that a number spills into from the next row. Work the arithmetic again from what you read.

For each flag return one item:
- code: the flag code.
- verdict: "on_sheet" if the sheet really says what the first reading says, so the problem is on the paper itself; "misread" if the first reading got an entry wrong and the problem goes away with the right figure; "unclear" if the handwriting or photo can't settle it.
- sheetSays: what the relevant entries actually say, e.g. "#7 total valid: 237; party figures add to 222".
- explanation: one or two plain sentences for a member of the public. Describe the paper, never accuse a party, official or person.
- box: the entries you re-read, on the image in 0-1000 normalised coordinates (x1,y1 top-left, x2,y2 bottom-right).
summary: one plain sentence on the sheet as a whole.`,
        },
      ],
    }],
    response_format: { type: 'json_schema', json_schema: { name: 'second_look', strict: true, schema: SCHEMA } },
  } as any));
  const out = JSON.parse(res.choices[0]!.message!.content!) as Omit<Review, 'model' | 'at'>;
  return { model: SPARK_PRIVATE, at: new Date().toISOString(), ...out };
}
