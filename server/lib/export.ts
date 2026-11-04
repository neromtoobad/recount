import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.ts';
import type { Analysis, PU } from './types.ts';

export type ExportRow = {
  pu_code: string; polling_unit: string; ward: string; lga: string;
  status: string; flags: string; flag_details: string;
  registered: number | null; accredited: number | null; rejected: number | null; total_valid: number | null;
  party_sum: number | null; votes: Record<string, number | null>;
  serial_number: string | null; stamped: boolean | null; signed: boolean | null;
  irev_url: string | null; irev_uploaded_at: string | null; replaced_uploads: number;
  recount_url: string;
};

// One row per polling unit, in IReV order, for journalists, observers and lawyers.
export async function exportRows(slug: string, origin: string): Promise<ExportRow[]> {
  const dir = path.join(DATA_DIR, slug);
  const { pus } = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8')) as { pus: PU[] };
  const rows: ExportRow[] = [];
  for (const pu of pus) {
    const a = await fs.readFile(path.join(dir, 'analysis', `${pu.id}.json`), 'utf8')
      .then((t) => JSON.parse(t) as Analysis).catch(() => null);
    const r = a?.read ?? null;
    const serious = a?.flags.some((f) => f.severity !== 'low');
    const votes: Record<string, number | null> = {};
    for (const p of r?.parties ?? []) votes[p.party.toUpperCase().replace(/[^A-Z]/g, '')] = p.figures;
    rows.push({
      pu_code: pu.puCode, polling_unit: pu.name.trim(), ward: pu.ward, lga: pu.lga,
      status: !a ? 'pending' : a.error ? 'error' : !pu.sheetUrl ? 'missing' : serious ? 'flagged' : 'clean',
      flags: a?.flags.map((f) => f.code).join(' ') ?? '',
      flag_details: a?.flags.map((f) => `${f.title}: ${f.detail}`).join(' | ') ?? '',
      registered: r?.summary.registered.value ?? null,
      accredited: r?.summary.accredited.value ?? null,
      rejected: r?.summary.rejected.value ?? null,
      total_valid: r?.summary.totalValid.value ?? null,
      party_sum: r ? r.parties.reduce((t, p) => t + (p.figures ?? 0), 0) : null,
      votes,
      serial_number: r?.serialNumber ?? null,
      stamped: r ? r.stamped || (a?.evidence?.stamp.length ?? 0) > 0 : null,
      signed: r?.presidingOfficerSigned ?? null,
      irev_url: pu.sheetUrl, irev_uploaded_at: pu.uploadedAt, replaced_uploads: pu.oldSheets.length,
      recount_url: `${origin}/${slug}/pu/${pu.id}`,
    });
  }
  return rows;
}

export function toCsv(rows: ExportRow[]): string {
  const parties = [...new Set(rows.flatMap((r) => Object.keys(r.votes)))].sort();
  const head = ['pu_code', 'polling_unit', 'ward', 'lga', 'status', 'flags', 'registered', 'accredited', 'rejected',
    'total_valid', 'party_sum', ...parties.map((p) => `votes_${p}`), 'serial_number', 'stamped', 'signed',
    'irev_url', 'irev_uploaded_at', 'replaced_uploads', 'recount_url', 'flag_details'];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [
    r.pu_code, r.polling_unit, r.ward, r.lga, r.status, r.flags, r.registered, r.accredited, r.rejected,
    r.total_valid, r.party_sum, ...parties.map((p) => r.votes[p] ?? ''), r.serial_number, r.stamped, r.signed,
    r.irev_url, r.irev_uploaded_at, r.replaced_uploads, r.recount_url, r.flag_details,
  ].map(cell).join(','));
  return [head.join(','), ...lines].join('\n');
}
