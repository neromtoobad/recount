// Hand transcription of data/raw/sample.jpg (Osun 29/17/03/007) to sanity-check the rules.
import { runChecks } from '../server/lib/checks.ts';
import type { PU, SheetRead } from '../server/lib/types.ts';
const f = (value: number | null, altered = false) => ({ value, altered });
const party = (party: string, n: number, words = String(n)) => ({ party, figures: n, words, wordsValue: n, altered: false, agentSigned: false });
const read: SheetRead = {
  isResultSheet: true, formType: 'EC8A', electionTitle: '2026 Osun State Governorship Election', serialNumber: '0001916',
  header: { state: 'OSUN', lga: 'ILA', ward: 'EJIGBO III', pollingUnit: 'OGUNLADE JUNCTION', stateCode: '29', lgaCode: '17', wardCode: '03', puCode: '007' },
  summary: { registered: f(1027), accredited: f(594), ballotsIssued: f(1027), unused: f(433), spoiled: f(2), rejected: f(6), totalValid: f(586), used: f(594) },
  alterations: [], parties: [party('A', 347), party('AA', 0), party('ADC', 4), party('APC', 233), party('APM', 1), party('ZLP', 1)],
  totalValidBottom: 586, presidingOfficerNamed: false, presidingOfficerSigned: true, stamped: true, dateWritten: '15/8/2026', imageQuality: 'good', notes: '',
};
const pu = { id: 'x', puCode: '29/17/03/007', name: 'OGUNLADE JUNCTION', lga: 'ILA', lgaCode: '17', ward: 'EJIGBO III', wardCode: '03', sheetUrl: 'u', uploadedAt: null, oldSheets: [] } as PU;
console.log('clean sheet ->', runChecks(pu, read, null).map((x) => x.code));
const bad = structuredClone(read);
bad.parties[3].figures = 333; bad.parties[3].altered = true; bad.summary.accredited.value = 500; bad.header.puCode = '009';
console.log('tampered sheet ->', runChecks(pu, bad, null).map((x) => `${x.code}: ${x.detail}`));
