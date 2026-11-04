import { useEffect, useState } from 'react';
import type { Analysis, Flag } from '../server/lib/types.ts';
import type { PURow, Summary } from '../server/lib/summary.ts';
import type { FieldDiff, Visual } from '../server/lib/compare.ts';

export type { Analysis, Flag, PURow, Summary, FieldDiff, Visual };

export function useJson<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null, error: null, loading: !!url,
  });
  useEffect(() => {
    if (!url) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e) => live && setState({ data: null, error: String(e.message), loading: false }));
    return () => { live = false; };
  }, [url]);
  return state;
}

export const FLAG_ORDER = [
  'wrong_pu', 'duplicate', 'over_voting', 'over_accreditation', 'party_sum', 'altered', 'not_a_sheet',
  'words_figures', 'total_mismatch', 'used_ballots', 'no_total', 'no_stamp', 'no_signature', 'unreadable', 'missing',
  'issued_ballots', 'no_po_name', 'replaced',
];

export const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-NG'));
export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');

export type CheckResult =
  | { status: 'not_a_sheet' | 'no_match'; upload: Analysis['read']; uploadUrl: string }
  | { status: 'no_original'; pu: Analysis['pu']; upload: Analysis['read']; uploadUrl: string }
  | {
      status: 'compared'; pu: Analysis['pu']; upload: NonNullable<Analysis['read']>;
      original: NonNullable<Analysis['read']>; diffs: FieldDiff[]; visual: Visual; uploadUrl: string;
    };

// IReV sheets are ~4 MB phone photos; the server serves a rotated 2000 px copy.
export const sheetSrc = (url: string) => `/img?u=${encodeURIComponent(url)}`;

// Plain-language meaning of each check, and what it does not prove on its own.
export const FLAG_INFO: Record<string, { means: string; notProof: string }> = {
  wrong_pu: {
    means: 'The state, LGA, ward or unit codes written on the sheet belong to a different polling unit from the IReV slot it was uploaded to.',
    notProof: 'It can be an upload mix-up at INEC rather than a changed result. The right sheet may exist elsewhere on IReV.',
  },
  duplicate: {
    means: 'The same serial number appears on sheets uploaded under more than one polling unit.',
    notProof: 'A misread serial number can cause a false match. Compare the two photos before drawing conclusions.',
  },
  over_voting: {
    means: 'Valid plus rejected votes are higher than the number of accredited voters in box #2.',
    notProof: 'Courts also look at the BVAS report and the voter register. A wrong figure in box #2 produces this flag too.',
  },
  over_accreditation: {
    means: 'More voters were accredited than are registered at this polling unit.',
    notProof: 'Box #1 is sometimes copied from an old register. Check the register for this unit.',
  },
  party_sum: {
    means: 'Adding up every party’s votes gives a different number from total valid votes in box #7.',
    notProof: 'Most gaps are a few votes and look like arithmetic slips. It does not show who gained.',
  },
  altered: {
    means: 'An entry has been overwritten, crossed out or corrected, so two different numbers were written in the same place.',
    notProof: 'Presiding officers correct honest mistakes too. A corrected figure should be countersigned, so look for initials.',
  },
  not_a_sheet: {
    means: 'The image uploaded for this unit is not a Form EC8A, for example a cancellation form (EC40G) or a blank page.',
    notProof: 'Elections are cancelled at some units for lawful reasons, and the EC40G explains why.',
  },
  words_figures: {
    means: 'The votes written in figures and in words disagree for at least one party.',
    notProof: 'The words are meant to guard the figures. Either one can be the mistake.',
  },
  total_mismatch: {
    means: 'Total valid votes in the party table and in box #7 are different numbers.',
    notProof: 'Usually one of the two was mis-copied. It does not change the party figures.',
  },
  used_ballots: {
    means: 'Used ballot papers (#8) do not equal spoiled (#5) + rejected (#6) + valid (#7).',
    notProof: 'This ballot accounting is often filled in loosely. It matters most alongside other flags.',
  },
  issued_ballots: {
    means: 'Ballot papers issued (#3) do not equal unused (#4) + used (#8).',
    notProof: 'Low on its own. Ballot paper counts are often estimated at the unit.',
  },
  no_total: { means: 'Neither box #7 nor the table total is filled in.', notProof: 'The party figures can still be complete.' },
  no_stamp: {
    means: 'No presiding officer stamp was found by Muse Spark or by SAM 3.1.',
    notProof: 'Faint or cropped stamps can be missed. Open the original photo.',
  },
  no_signature: {
    means: 'The presiding officer’s signature line is empty.',
    notProof: 'Signatures are sometimes inside the stamp or on the back page.',
  },
  unreadable: { means: 'The photo is too blurred or cropped to read reliably.', notProof: 'The paper sheet itself may be fine.' },
  missing: {
    means: 'IReV has no result sheet for this polling unit.',
    notProof: 'Voting may have been cancelled or not held here.',
  },
  no_po_name: { means: 'The presiding officer name line is blank.', notProof: 'A paperwork gap only.' },
  replaced: {
    means: 'INEC replaced this unit’s upload after the first one. Earlier versions stay public.',
    notProof: 'Blurry first uploads are often replaced with clearer photos.',
  },
};

export type Config = { liveCheck: boolean };

// Unofficial: INEC alone declares results. Shown wherever totals appear.
export const UNOFFICIAL = 'Unofficial. Recount reads INEC’s public sheets; it does not declare results.';

export type CopyStanding = 'agrees' | 'disagrees' | 'pending' | 'no_irev' | 'unusable';
export type CitizenCopy = {
  id: string; puId: string; puCode: string; puName: string | null; ward: string | null; lga: string | null;
  role: 'voter' | 'agent' | 'observer' | 'journalist' | 'demo'; party: string | null; kind: 'ec60e' | 'ec8a' | 'other';
  takenAt: string | null; uploadedAt: string;
  typed: { votes: Record<string, number>; totalValid: number | null } | null;
  typedCheck: { verdict: 'matches' | 'differs' | 'no_irev'; diffs: { field: string; copy: number | null; irev: number | null }[] } | null;
  ai: { verdict: string; summary: string; votes: Record<string, number>; totalValid: number | null; diffs: { field: string; copy: number | null; irev: number | null }[] } | null;
  status: 'pending' | 'checked'; standing: CopyStanding; imageUrl: string | null; irevUploadedAt: string | null; recountUrl: string;
};
export type CopyStats = { copies: number; units: number; lgas: number; agree: number; disagree: number; pending: number; noIrev: number };

export const ROLE_LABEL = { voter: 'Voter', agent: 'Party agent', observer: 'Observer', journalist: 'Journalist', demo: 'Demo upload' } as const;
export const KIND_LABEL = { ec60e: 'Result poster (EC60E)', ec8a: "Agent's copy (EC8A)", other: 'Other photo' } as const;
export const STANDING_LABEL: Record<CopyStanding, string> = {
  agrees: 'Agrees with IReV', disagrees: 'Differs from IReV', pending: 'Awaiting AI check', no_irev: 'No IReV sheet yet', unusable: 'Could not be used',
};
export const watTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WAT';

// The national layer.
export type NationalUnit = {
  code: string; name: string; state: string; lga: string; ward: string;
  uploaded2023: string | null; replaced2023: number; pledges: number;
};
export type StateRow = { name: string; units: number; lgas: number; covered: number; pledges: number; uploaded2023: number };
export type NationalBoard = {
  electionDay: string;
  totals: { units: number; covered: number; pledges: number; lgas: number; wards: number };
  states: StateRow[];
  registry: { builtAt: string; source: string };
};
export type UnitHistory = { slug: string; title: string; puId: string; uploadedAt: string | null; hasSheet: boolean; status: 'serious' | 'flagged' | 'clean' | 'unread'; recountUrl: string };
export type ElectionListItem = { slug: string; title: string; totals: Summary['totals'] };

export type ReplayArea = { name: string; total: number; counts: number[]; late: number; serious?: number };
export type ReplayEvent = { at: string; kind: 'first' | 'milestone' | 'stall' | 'resume' | 'replaced' | 'serious'; text: string; lga?: string; url?: string };
export type ReplayData = {
  title?: string; start: string; stepMinutes: number; steps: number;
  total?: number; uploaded?: number; seriousTotal?: number;
  areas: ReplayArea[]; events?: ReplayEvent[];
};

// Polling-unit codes in URLs use dashes: 29/17/03/007 becomes 29-17-03-007.
export const codeToPath = (code: string) => code.replace(/\//g, '-');
export const daysUntil = (iso: string) => Math.max(0, Math.ceil((Date.parse(`${iso}T08:00:00+01:00`) - Date.now()) / 86_400_000));
export const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bFct\b/, 'FCT');

export type ReportTone = 'good' | 'watch' | 'serious';
export type UnitReport = { kind: string; label: string; short: string; tone: ReportTone; reporters: number; corroborated: boolean; first: string; last: string };
export type SituationData = {
  hours: number; since: string; state: string | null;
  totals: { reports: number; units: number; corroborated: number };
  kinds: { kind: string; label: string; short: string; tone: ReportTone; reports: number }[];
  states: { name: string; reports: number; units: number; serious: number }[];
  latest: { code: string; name: string; ward: string; lga: string; state: string; kind: string; short: string; tone: ReportTone; at: string; reporters: number }[];
};
