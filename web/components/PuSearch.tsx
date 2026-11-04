import { useMemo, useRef, useState } from 'react';
import { useJson, type PURow } from '../api.ts';
import { navigate } from '../App.tsx';
import { SeverityDot } from './Flags.tsx';

const STATUS = { clean: 'Passed every check', flagged: 'Needs a second look', missing: 'No sheet on IReV', error: 'Not read', pending: 'Not read yet' };

// Search by polling unit name, ward, LGA or code (29/17/03/007, or just 17/03/007).
export function PuSearch({ slug, big = false, autoFocus = false, onPick, placeholder = 'Find your polling unit' }: {
  slug: string; big?: boolean; autoFocus?: boolean; onPick?: (r: PURow) => void; placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const rows = useJson<PURow[]>(q.length > 0 || open ? `/api/${slug}/rows` : null);
  const input = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    const needle = q.trim().toUpperCase();
    if (needle.length < 2 || !rows.data) return [];
    const words = needle.split(/\s+/);
    const scored = [];
    for (const r of rows.data) {
      const hay = `${r.puCode} ${r.name} ${r.ward} ${r.lga}`.toUpperCase();
      if (!words.every((w) => hay.includes(w))) continue;
      const score = r.puCode.endsWith(needle) ? 0 : r.name.toUpperCase().startsWith(needle) ? 1 : 2;
      scored.push({ r, score });
      if (scored.length > 400) break;
    }
    return scored.sort((a, b) => a.score - b.score).slice(0, 8).map((s) => s.r);
  }, [q, rows.data]);

  const go = (r: PURow) => {
    if (!onPick) return navigate(`/${slug}/pu/${r.id}`);
    onPick(r); setQ(''); setOpen(false);
  };

  return (
    <div className={`pu-search ${big ? 'is-big' : ''}`}>
      <label className="pu-search-box">
        <svg viewBox="0 0 20 20" aria-hidden><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        <input
          ref={input}
          autoFocus={autoFocus}
          value={q}
          placeholder={placeholder}
          aria-label="Find a polling unit"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && hits[active]) go(hits[active]);
            if (e.key === 'Escape') setOpen(false);
          }}
        />
      </label>
      {open && q.trim().length >= 2 && (
        <ul className="pu-results" role="listbox">
          {rows.loading && <li className="pu-empty">Loading polling units…</li>}
          {!rows.loading && hits.length === 0 && <li className="pu-empty">No polling unit matches “{q}”.</li>}
          {hits.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active}>
              <button className={i === active ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => go(r)} onMouseEnter={() => setActive(i)}>
                <SeverityDot severity={r.status === 'flagged' ? r.severity : r.status === 'clean' ? null : 'low'} />
                <span className="pu-hit">
                  <span className="pu-hit-name">{r.name.trim()}</span>
                  <span className="pu-hit-sub mono">{r.puCode} · {r.ward}, {r.lga}</span>
                </span>
                <span className={`pu-hit-status st-${r.status}`}>{STATUS[r.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
