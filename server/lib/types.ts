export type Field = { value: number | null; altered: boolean };

export type PartyRow = {
  party: string;
  figures: number | null;
  words: string | null;
  wordsValue: number | null;
  altered: boolean;
  agentSigned: boolean;
};

export type SheetRead = {
  isResultSheet: boolean;
  formType: string;
  electionTitle: string;
  serialNumber: string | null;
  header: {
    state: string | null;
    lga: string | null;
    ward: string | null;
    pollingUnit: string | null;
    stateCode: string | null;
    lgaCode: string | null;
    wardCode: string | null;
    puCode: string | null;
  };
  summary: {
    registered: Field;
    accredited: Field;
    ballotsIssued: Field;
    unused: Field;
    spoiled: Field;
    rejected: Field;
    totalValid: Field;
    used: Field;
  };
  parties: PartyRow[];
  alterations: { entry: string; what: string; box: { x1: number; y1: number; x2: number; y2: number } }[];
  totalValidBottom: number | null;
  presidingOfficerNamed: boolean;
  presidingOfficerSigned: boolean;
  stamped: boolean;
  dateWritten: string | null;
  imageQuality: 'good' | 'poor' | 'unreadable';
  notes: string;
};

export type Box = { x1: number; y1: number; x2: number; y2: number; c: number | null };

export type Evidence = {
  width: number;
  height: number;
  stamp: Box[];
  signature: Box[];
  correction: Box[];
};

export type Severity = 'high' | 'medium' | 'low';

export type Flag = {
  code: string;
  severity: Severity;
  title: string;
  detail: string;
};

export type PU = {
  id: string;
  puCode: string;
  name: string;
  lga: string;
  lgaCode: string;
  ward: string;
  wardCode: string;
  sheetUrl: string | null;
  uploadedAt: string | null;
  oldSheets: { url: string; uploadedAt: string }[];
};

// Muse Spark's second look at a flagged sheet: does the problem sit on the paper, or in the first reading?
export type Review = {
  model: string;
  at: string;
  items: { code: string; verdict: 'on_sheet' | 'misread' | 'unclear'; sheetSays: string; explanation: string; box: { x1: number; y1: number; x2: number; y2: number } }[];
  summary: string;
};

export type Analysis = {
  pu: PU;
  read: SheetRead | null;
  evidence: Evidence | null;
  flags: Flag[];
  review?: Review;
  error?: string;
  model: string;
  analyzedAt: string;
};
