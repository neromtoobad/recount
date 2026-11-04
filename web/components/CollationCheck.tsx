import { useMemo, useState, type FormEvent } from 'react';
import { fmt, useJson, type Summary } from '../api.ts';

type Area = { lga: string; ward?: string; votes: Record<string, number> };
type Result = {
  area: string; level: string; verdict: 'matches' | 'differs'; summary: string; caveat: string;
  parties: { party: string; declared: number | null; sheets: number; difference: number | null; differencePct: number | null }[];
  coverage: { pollingUnits: number; sheetsRead: number; notRead: number; seriousFlags: number };
};

// Type in the figures from a ward (EC8B) or LGA (EC8C) collation sheet and compare them
// with the polling-unit sheets underneath. Wraps POST /api/:slug/collation/check.
export function CollationCheck({ slug, summary }: { slug: string; summary: Summary | null }) {
  const [lga, setLga] = useState('');
  const [ward, setWard] = useState('');
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const wards = useJson<{ areas: Area[] }>(lga ? `/api/${slug}/collation?by=ward&lga=${encodeURIComponent(lga)}` : null);
  const parties = useMemo(() => (summary?.tally ?? []).slice(0, 4).map((p) => p.party), [summary]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setResult(null);
    const body = { lga, ward: ward || undefined, votes: Object.fromEntries(Object.entries(votes).filter(([, v]) => v !== '').map(([p, v]) => [p, Number(v)])) };
    const res = await fetch(`/api/${slug}/collation/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? 'Something went wrong'); else setResult(json);
  };

  // Prefill with the sheet totals so a demo can change one number and see the gap.
  const prefill = () => {
    const area = ward ? wards.data?.areas.find((a) => a.ward === ward) : null;
    const src = area?.votes ?? summary?.lgas.find((l) => l.name === lga)?.tally ?? {};
    setVotes(Object.fromEntries(parties.map((p) => [p, String(src[p] ?? 0)])));
  };

  return (
    <div className="collation card">
      <form onSubmit={submit} className="collation-form">
        <label>LGA
          <select className="select" value={lga} onChange={(e) => { setLga(e.target.value); setWard(''); setResult(null); }} required>
            <option value="">Choose an LGA</option>
            {summary?.lgas.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
          </select>
        </label>
        <label>Ward, or the whole LGA
          <select className="select" value={ward} onChange={(e) => { setWard(e.target.value); setResult(null); }} disabled={!lga}>
            <option value="">Whole LGA</option>
            {wards.data?.areas.map((a) => <option key={a.ward} value={a.ward}>{a.ward}</option>)}
          </select>
        </label>
        <div className="collation-votes">
          {parties.map((p) => (
            <label key={p}>{p}
              <input className="search mono" inputMode="numeric" value={votes[p] ?? ''} placeholder="Votes" onChange={(e) => setVotes((v) => ({ ...v, [p]: e.target.value.replace(/\D/g, '') }))} />
            </label>
          ))}
        </div>
        <div className="collation-actions">
          <button className="btn btn-green" type="submit" disabled={!lga}>Compare with the sheets</button>
          <button className="btn btn-light" type="button" onClick={prefill} disabled={!lga}>Fill in the sheet totals</button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className={`collation-result verdict-${result.verdict === 'matches' ? 'ok' : 'bad'}`}>
          <b>{result.verdict === 'matches' ? 'Matches the polling-unit sheets' : 'Differs from the polling-unit sheets'}</b>
          <p className="small">{result.summary}</p>
          <table className="table">
            <thead><tr><th>Party</th><th className="num">Collation</th><th className="num">Sum of sheets</th><th className="num">Gap</th></tr></thead>
            <tbody>
              {result.parties.filter((r) => r.declared !== null).map((r) => (
                <tr key={r.party} className={r.difference && Math.abs(r.difference) > 10 && Math.abs(r.differencePct ?? 100) > 1 ? 'bad' : ''}>
                  <td>{r.party}</td><td className="num mono">{fmt(r.declared)}</td><td className="num mono">{fmt(r.sheets)}</td>
                  <td className="num mono">{r.difference! > 0 ? '+' : ''}{fmt(r.difference)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">{result.coverage.sheetsRead} of {result.coverage.pollingUnits} sheets read · {result.coverage.seriousFlags} with serious flags. {result.caveat}</p>
        </div>
      )}
    </div>
  );
}
