import { readSheet } from './reader.ts';
import { gatherEvidence } from './sam.ts';
import { runChecks } from './checks.ts';
import { SPARK_PUBLIC } from './meta.ts';
import { withSheet } from './image.ts';
import type { Analysis, PU } from './types.ts';

export async function analyzePU(pu: PU, opts: { evidence?: boolean } = {}): Promise<Analysis> {
  const base = { pu, model: SPARK_PUBLIC, analyzedAt: new Date().toISOString() };
  if (!pu.sheetUrl) {
    return {
      ...base, read: null, evidence: null,
      flags: [{ code: 'missing', severity: 'medium', title: 'No sheet uploaded', detail: 'IReV has no result sheet for this polling unit.' }],
    };
  }
  try {
    const [read, evidence] = await withSheet(pu.sheetUrl, (image) => Promise.all([
      readSheet(image),
      opts.evidence === false ? Promise.resolve(null) : gatherEvidence(image),
    ]));
    return { ...base, read, evidence, flags: runChecks(pu, read, evidence) };
  } catch (err) {
    return { ...base, read: null, evidence: null, flags: [], error: String((err as Error).message ?? err) };
  }
}
