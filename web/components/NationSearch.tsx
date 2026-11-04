import { useEffect, useState } from 'react';
import { codeToPath, titleCase, useJson, type NationalUnit } from '../api.ts';
import { navigate } from '../App.tsx';

// Search every polling unit in Nigeria by the code on a voter card, or by name, ward or LGA.
export function NationSearch({ big = false, onPick, placeholder = 'Your polling unit: code on your voter card, or name' }: {
  big?: boolean; onPick?: (u: NationalUnit) => void; placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 220); return () => clearTimeout(t); }, [q]);
  const res = useJson<{ units: NationalUnit[] }>(debounced.length >= 2 ? `/api/nigeria/units?q=${encodeURIComponent(debounced)}&limit=8` : null);
  const hits = debounced === q.trim() ? res.data?.units ?? [] : [];

  const go = (u: NationalUnit) => {
    setQ(''); setOpen(false);
    if (onPick) onPick(u); else navigate(`/unit/${codeToPath(u.code)}`);
  };

  return (
    <div className={`pu-search ${big ? 'is-big' : ''}`}>
      <label className="pu-search-box">
        <svg viewBox="0 0 20 20" aria-hidden><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        <input
          value={q} placeholder={placeholder} aria-label="Find a polling unit anywhere in Nigeria"
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
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
          {(res.loading || debounced !== q.trim()) && <li className="pu-empty">Searching 176,000 polling units…</li>}
          {!res.loading && debounced === q.trim() && hits.length === 0 && <li className="pu-empty">No polling unit matches “{q}”. Try the code on your voter card, like 24/11/04/012.</li>}
          {hits.map((u, i) => (
            <li key={u.code} role="option" aria-selected={i === active}>
              <button className={i === active ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => go(u)} onMouseEnter={() => setActive(i)}>
                <span className="pu-hit">
                  <span className="pu-hit-name">{u.name}</span>
                  <span className="pu-hit-sub mono">{u.code} · {titleCase(u.ward)}, {titleCase(u.lga)}, {titleCase(u.state)}</span>
                </span>
                <span className="pu-hit-status">{u.pledges ? `${u.pledges} covering` : 'Not covered yet'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
