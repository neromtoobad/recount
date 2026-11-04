import type { Evidence, Flag, PU, SheetRead } from './types.ts';

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

// Every check here is arithmetic or a comparison against IReV's own records.
// A flag says "look at this sheet", never "this was rigged".
export function runChecks(pu: PU, read: SheetRead, evidence: Evidence | null): Flag[] {
  const flags: Flag[] = [];
  const add = (code: string, severity: Flag['severity'], title: string, detail: string) =>
    flags.push({ code, severity, title, detail });

  if (!read.isResultSheet) {
    add('not_a_sheet', 'high', 'Not a result sheet', read.notes || 'The uploaded image is not an INEC result sheet.');
    return flags;
  }
  if (read.imageQuality === 'unreadable') {
    add('unreadable', 'medium', 'Unreadable upload', 'The sheet image is too blurred or cropped to read.');
  }

  // The PU code written on the sheet must be the PU the sheet was uploaded under.
  const [, lgaCode, wardCode, puNum] = pu.puCode.split('/');
  const h = read.header;
  const wrong: string[] = [];
  if (digits(h.lgaCode) && digits(h.lgaCode) !== lgaCode) wrong.push(`LGA ${h.lgaCode} vs ${lgaCode}`);
  if (digits(h.wardCode) && digits(h.wardCode) !== wardCode) wrong.push(`ward ${h.wardCode} vs ${wardCode}`);
  if (digits(h.puCode) && digits(h.puCode).padStart(3, '0') !== puNum) wrong.push(`PU ${h.puCode} vs ${puNum}`);
  if (wrong.length) {
    add('wrong_pu', 'high', 'Sheet belongs to another polling unit',
      `Codes written on the sheet do not match the IReV slot ${pu.puCode}: ${wrong.join(', ')}.`);
  }

  const s = read.summary;
  const v = (f: { value: number | null }) => f.value;
  const partySum = read.parties.reduce((t, p) => t + (p.figures ?? 0), 0);
  const anyParty = read.parties.some((p) => p.figures !== null);

  if (anyParty && v(s.totalValid) !== null && partySum !== v(s.totalValid)) {
    add('party_sum', 'high', 'Party votes do not add up',
      `Party figures sum to ${partySum}, but total valid votes (#7) is ${v(s.totalValid)}.`);
  }
  if (read.totalValidBottom !== null && v(s.totalValid) !== null && read.totalValidBottom !== v(s.totalValid)) {
    add('total_mismatch', 'medium', 'Two different totals',
      `Total valid votes is ${read.totalValidBottom} under the table but ${v(s.totalValid)} in box #7.`);
  }
  if (read.totalValidBottom === null && v(s.totalValid) === null) {
    add('no_total', 'medium', 'No total valid votes', 'Neither box #7 nor the table total is filled in.');
  }

  const used = v(s.used), spoiled = v(s.spoiled), rejected = v(s.rejected), valid = v(s.totalValid);
  if (used !== null && spoiled !== null && rejected !== null && valid !== null && used !== spoiled + rejected + valid) {
    add('used_ballots', 'medium', 'Used ballots do not add up',
      `#8 used ballots is ${used}, but spoiled ${spoiled} + rejected ${rejected} + valid ${valid} = ${spoiled + rejected + valid}.`);
  }
  const issued = v(s.ballotsIssued), unused = v(s.unused);
  if (issued !== null && unused !== null && used !== null && issued !== unused + used) {
    add('issued_ballots', 'low', 'Ballot papers unaccounted for',
      `#3 issued is ${issued}, but unused ${unused} + used ${used} = ${unused + used}.`);
  }

  const accredited = v(s.accredited), registered = v(s.registered);
  const cast = valid !== null ? valid + (rejected ?? 0) : null;
  if (accredited !== null && cast !== null && cast > accredited) {
    add('over_voting', 'high', 'More votes than accredited voters',
      `${cast} votes cast (valid + rejected) but only ${accredited} voters accredited.`);
  }
  if (accredited !== null && registered !== null && accredited > registered) {
    add('over_accreditation', 'high', 'More accredited than registered',
      `${accredited} accredited but only ${registered} on the register.`);
  }

  const wordMismatch = read.parties.filter(
    (p) => p.figures !== null && p.wordsValue !== null && p.figures !== p.wordsValue,
  );
  if (wordMismatch.length) {
    add('words_figures', 'medium', 'Figures and words disagree',
      wordMismatch.map((p) => `${p.party}: ${p.figures} in figures, "${p.words}" in words`).join('; '));
  }

  const altered = [
    ...read.parties.filter((p) => p.altered).map((p) => p.party),
    ...Object.entries(s).filter(([, f]) => f.altered).map(([k]) => k),
  ];
  if (altered.length) {
    const how = (read.alterations ?? []).map((x) => `${x.entry} (${x.what})`);
    add('altered', 'medium', 'Visible alterations', `Overwritten or corrected: ${how.length ? how.join('; ') : altered.join(', ')}.`);
  } else if (evidence?.correction.length) {
    add('altered', 'medium', 'Possible correction marks',
      `SAM found ${evidence.correction.length} correction-fluid or scribble mark(s) on the sheet.`);
  }

  const stamped = read.stamped || (evidence?.stamp.length ?? 0) > 0;
  if (!stamped) add('no_stamp', 'medium', 'No presiding officer stamp', 'No INEC stamp is visible on the sheet.');
  if (!read.presidingOfficerSigned) {
    add('no_signature', stamped ? 'low' : 'medium', 'Not signed', 'No presiding officer signature was found on the sign/stamp line.');
  }
  if (!read.presidingOfficerNamed) add('no_po_name', 'low', 'Presiding officer not named', 'The presiding officer name line is blank.');

  if (pu.oldSheets.length) {
    add('replaced', 'low', 'Sheet was replaced',
      `IReV shows ${pu.oldSheets.length} earlier upload(s) for this polling unit before the current one.`);
  }
  return flags;
}

// Duplicate uploads: the same serial number appearing under more than one polling unit.
export function duplicateSerials(reads: { pu: PU; read: SheetRead | null }[]): Map<string, string[]> {
  const bySerial = new Map<string, string[]>();
  for (const { pu, read } of reads) {
    const sn = digits(read?.serialNumber);
    if (sn.length < 4) continue;
    bySerial.set(sn, [...(bySerial.get(sn) ?? []), pu.puCode]);
  }
  return new Map([...bySerial].filter(([, codes]) => codes.length > 1));
}
