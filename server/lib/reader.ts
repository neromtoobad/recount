import { meta, SPARK_PUBLIC } from './meta.ts';
import type { SheetRead } from './types.ts';

const int = { type: ['integer', 'null'] };
const str = { type: ['string', 'null'] };
const field = {
  type: 'object',
  properties: { value: int, altered: { type: 'boolean' } },
  required: ['value', 'altered'],
  additionalProperties: false,
};

const SCHEMA = {
  type: 'object',
  properties: {
    isResultSheet: { type: 'boolean' },
    formType: { type: 'string' },
    electionTitle: { type: 'string' },
    serialNumber: str,
    header: {
      type: 'object',
      properties: {
        state: str, lga: str, ward: str, pollingUnit: str,
        stateCode: str, lgaCode: str, wardCode: str, puCode: str,
      },
      required: ['state', 'lga', 'ward', 'pollingUnit', 'stateCode', 'lgaCode', 'wardCode', 'puCode'],
      additionalProperties: false,
    },
    summary: {
      type: 'object',
      properties: {
        registered: field, accredited: field, ballotsIssued: field, unused: field,
        spoiled: field, rejected: field, totalValid: field, used: field,
      },
      required: ['registered', 'accredited', 'ballotsIssued', 'unused', 'spoiled', 'rejected', 'totalValid', 'used'],
      additionalProperties: false,
    },
    parties: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          party: { type: 'string' },
          figures: int,
          words: str,
          wordsValue: int,
          altered: { type: 'boolean' },
          agentSigned: { type: 'boolean' },
        },
        required: ['party', 'figures', 'words', 'wordsValue', 'altered', 'agentSigned'],
        additionalProperties: false,
      },
    },
    alterations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          entry: { type: 'string' },
          what: { type: 'string' },
          box: {
            type: 'object',
            properties: { x1: { type: 'integer' }, y1: { type: 'integer' }, x2: { type: 'integer' }, y2: { type: 'integer' } },
            required: ['x1', 'y1', 'x2', 'y2'],
            additionalProperties: false,
          },
        },
        required: ['entry', 'what', 'box'],
        additionalProperties: false,
      },
    },
    totalValidBottom: int,
    presidingOfficerNamed: { type: 'boolean' },
    presidingOfficerSigned: { type: 'boolean' },
    stamped: { type: 'boolean' },
    dateWritten: str,
    imageQuality: { type: 'string', enum: ['good', 'poor', 'unreadable'] },
    notes: { type: 'string' },
  },
  required: [
    'isResultSheet', 'formType', 'electionTitle', 'serialNumber', 'header', 'summary', 'parties',
    'alterations', 'totalValidBottom', 'presidingOfficerNamed', 'presidingOfficerSigned', 'stamped', 'dateWritten',
    'imageQuality', 'notes',
  ],
  additionalProperties: false,
};

const PROMPT = `You are transcribing a Nigerian INEC result sheet (usually Form EC8A, the polling unit statement of result) exactly as written. You are an auditor, not a judge: copy what is on the paper even when it looks wrong, and never fix arithmetic.

Header: copy State, LGA, Registration Area (ward) and Polling Unit names, and the code digits written in the boxes beside each (state 2 digits, LGA 2, ward 2, PU 3). Copy the S/N serial number.

Summary box #1-#8 maps to: registered (#1 voters on the register), accredited (#2), ballotsIssued (#3 ballot papers issued to the PU), unused (#4), spoiled (#5), rejected (#6), totalValid (#7), used (#8 total used ballot papers).

Parties: one row per printed party in the order printed, even when the votes are zero or blank. figures = the number written in the IN FIGURES column. words = the IN WORDS text copied verbatim (keep misspellings), wordsValue = the number those words mean. agentSigned = a polling agent name or signature is on that row.

Reading conventions on these forms:
- "NIL", "Nill", "nil", "-", "—" or "=" written in a box means 0. A row left completely blank is null.
- Leading zeros and padding ("0318", "01", "-347-", "=4=") are deliberate anti-tampering practice: read 0318 as 318, and they are NOT alterations.
- If an entry is struck through and a new value written beside or over it, copy the new value. If it is struck through with nothing replacing it, use 0.

Set altered=true on any field or row where a digit is overwritten, struck through, covered with correction fluid, or squeezed in afterwards, or where the number is in visibly different ink or handwriting from the rest of the sheet. Leave altered=false when it is merely messy or padded with zeros.
For every altered entry, add one item to alterations: entry = the party or summary field name, what = a short description ("4 written over 1", "NIL scribbled out, 1 written"), box = where it is on the image in 0-1000 normalised coordinates (x1,y1 top-left, x2,y2 bottom-right), tight around the changed number.

totalValidBottom = the TOTAL VALID VOTES figure at the bottom of the party table.
presidingOfficerNamed = the presiding officer's name line is filled in. presidingOfficerSigned = there is a handwritten signature on or near the "Sign/Stamp of Presiding Officer" line, including one written inside or across the stamp. stamped = an INEC presiding officer stamp is visible anywhere.

Use null for anything blank, missing or unreadable. If the image is not an INEC result sheet, set isResultSheet=false. Put anything else unusual (pages missing, photo of a screen, two sheets in one photo, wrong election) in notes; otherwise notes is "".`;

export async function readSheet(imageUrl: string, model = SPARK_PUBLIC): Promise<SheetRead> {
  const res = await meta().chat.completions.create({
    model,
    reasoning_effort: 'low',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'result_sheet', strict: true, schema: SCHEMA } },
  } as any);
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error('empty response from reader');
  return JSON.parse(text) as SheetRead;
}
