import { useMemo, useState } from 'react';
import { FLAG_ORDER, fmt, useJson, type PURow, type Summary } from '../api.ts';
import { Link, navigate } from '../App.tsx';
import { SeverityDot } from '../components/Flags.tsx';

const PAGE = 80;
const STATUS_LABEL = { clean: 'Passed', flagged: 'Flagged', missing: 'No sheet', error: 'Not read', pending: 'Not read' } as const;

export function Explore({ slug, search }: { slug: string; search: string }) {
  const params = new URLSearchParams(search);
  const flag = params.get('flag') ?? '';
  const lga = params.get('lga') ?? '';
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [sort, setSort] = useState<'severity' | 'code' | 'votes'>('severity');
  const rows = useJson<PURow[]>(`/api/${slug}/rows`);
  const summary = useJson<Summary>(`/api/${slug}/summary`);

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(search);
    if (v) p.set(k, v); else p.delete(k);
    setShown(PAGE);
    navigate(`/${slug}/sheets${p.toString() ? `?${p}` : ''}`);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const out = (rows.data ?? [])
      .filter((r) => (flag === 'clean' ? r.status === 'clean' : flag === 'serious' ? r.severity === 'high' : !flag || r.flags.includes(flag)))
      .filter((r) => !lga || r.lga === lga)
      .filter((r) => !needle || `${r.puCode} ${r.name} ${r.ward}`.toUpperCase().includes(needle));
    if (sort === 'severity') out.sort((a, b) => sevRank(b) - sevRank(a) || b.flags.length - a.flags.length);
    if (sort === 'code') out.sort((a, b) => a.puCode.localeCompare(b.puCode));
    if (sort === 'votes') out.sort((a, b) => (b.validVotes ?? -1) - (a.validVotes ?? -1));
    return out;
  }, [rows.data, flag, lga, q, sort]);

  const s = summary.data;
  const flagOptions = Object.entries(s?.flagCounts ?? {}).sort((a, b) => FLAG_ORDER.indexOf(a[0]) - FLAG_ORDER.indexOf(b[0]));
  const flagTitle = flag === 'clean' ? 'Passed every check' : flag === 'serious' ? 'Serious flags' : s?.flagCounts[flag]?.title;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{s?.title}</div>
          <h1 className="h-page">{flagTitle ?? 'All result sheets'}{lga && <span className="h-sub"> in {lga}</span>}</h1>
        </div>
        <div className="verdict-actions">
          {lga && <Link to={`/${slug}/pack?lga=${encodeURIComponent(lga)}`} className="btn btn-green">Evidence pack for {lga}</Link>}
          {(flag || lga) && <button className="btn btn-light" onClick={() => navigate(`/${slug}/sheets`)}>Clear filters</button>}
        </div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Filter by polling unit, ward or code" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
        <select value={flag} onChange={(e) => setParam('flag', e.target.value)} className="select" aria-label="Flag">
          <option value="">Any status</option>
          <option value="serious">Serious flags only</option>
          <option value="clean">Passed every check</option>
          {flagOptions.map(([code, f]) => <option key={code} value={code}>{f.title} ({fmt(f.count)})</option>)}
        </select>
        <select value={lga} onChange={(e) => setParam('lga', e.target.value)} className="select" aria-label="LGA">
          <option value="">All 30 LGAs</option>
          {s?.lgas.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="select" aria-label="Sort">
          <option value="severity">Most serious first</option>
          <option value="code">By polling unit code</option>
          <option value="votes">Most valid votes</option>
        </select>
        <span className="toolbar-count mono small">{fmt(filtered.length)} sheets</span>
      </div>

      <div className="sheet-table" role="table">
        <div className="st-row st-head mono small" role="row">
          <span>Status</span><span>Polling unit</span><span className="hide-sm">Ward · LGA</span><span>Flags</span><span className="num"><span className="hide-sm">Valid votes</span><span className="show-sm">Votes</span></span>
        </div>
        {filtered.slice(0, shown).map((r) => (
          <Link key={r.id} to={`/${slug}/pu/${r.id}`} className="st-row">
            <span className={`st-status st-${r.status === 'flagged' ? r.severity : r.status}`}>
              <SeverityDot severity={r.status === 'flagged' ? r.severity : r.status === 'clean' ? null : 'low'} />
              {r.status === 'flagged' && r.severity === 'high' ? 'Serious' : STATUS_LABEL[r.status]}
            </span>
            <span className="st-pu"><span className="st-name">{r.name.trim()}</span><span className="mono small muted">{r.puCode}</span></span>
            <span className="st-place small hide-sm">{r.ward} · {r.lga}</span>
            <span className="st-flags">
              {r.flags.filter((f) => s?.flagCounts[f]?.severity !== 'low').slice(0, 3).map((f) => (
                <span key={f} className={`tag tag-${s?.flagCounts[f]?.severity}`}>{s?.flagCounts[f]?.title ?? f}</span>
              ))}
              {r.flags.length > 3 && <span className="tag">+{r.flags.length - 3}</span>}
            </span>
            <span className="num mono">{fmt(r.validVotes)}</span>
          </Link>
        ))}
        {rows.loading && <div className="skeleton" style={{ height: 320 }} />}
        {!rows.loading && filtered.length === 0 && <div className="empty">No sheets match these filters.</div>}
      </div>
      {shown < filtered.length && (
        <button className="btn btn-light more" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, filtered.length - shown)} more</button>
      )}
    </div>
  );
}

function sevRank(r: PURow) {
  return r.status === 'clean' ? 0 : r.severity === 'high' ? 3 : r.severity === 'medium' ? 2 : r.severity === 'low' ? 1 : 0;
}
