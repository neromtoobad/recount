import { useMemo, useState } from 'react';
import { fmt, type Summary } from '../api.ts';
import { navigate } from '../App.tsx';
import { useGeo } from '../pages/Replay.tsx';

// One-hue sequential ramp (light = few flags, dark = many). Party colours are never used.
const RAMP = ['#fbefd4', '#f6d9a0', '#eebb6a', '#dd9540', '#bf6c26', '#8c4716'];

type Ring = [number, number][];
type Feature = { properties: { lga: string }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any } };

const W = 560, H = 520;

// Equirectangular projection scaled by cos(latitude); fine at the size of one state.
function useProjection(features: Feature[]) {
  return useMemo(() => {
    const pts: [number, number][] = [];
    const rings = (f: Feature): Ring[] => (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat());
    for (const f of features) for (const r of rings(f)) pts.push(...r);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
    const s = Math.min((W - 20) / ((x1 - x0) * k), (H - 20) / (y1 - y0));
    const ox = (W - (x1 - x0) * k * s) / 2, oy = (H - (y1 - y0) * s) / 2;
    const proj = ([x, y]: [number, number]) => [ox + (x - x0) * k * s, oy + (y1 - y) * s];
    return features.map((f) => {
      const d = rings(f).map((r) => 'M' + r.map((p) => proj(p).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z').join('');
      const all = rings(f).flat();
      const c = proj([all.reduce((t, p) => t + p[0], 0) / all.length, all.reduce((t, p) => t + p[1], 0) / all.length]);
      return { lga: f.properties.lga, d, c };
    });
  }, [features]);
}

export function OsunMap({ summary, slug }: { summary: Summary; slug: string }) {
  const { features } = useGeo(slug);
  const shapes = useProjection((features ?? []) as unknown as Feature[]);
  const [hover, setHover] = useState<string | null>(null);
  const byName = new Map(summary.lgas.map((l) => [l.name, l]));
  const rates = summary.lgas.map((l) => (l.analysed ? l.flagged / l.analysed : 0));
  const lo = Math.min(...rates), hi = Math.max(...rates);
  const bin = (r: number) => Math.min(RAMP.length - 1, Math.floor(((r - lo) / (hi - lo || 1)) * RAMP.length));
  const h = hover ? byName.get(hover) : null;
  const sorted = [...summary.lgas].sort((a, b) => b.flagged / (b.analysed || 1) - a.flagged / (a.analysed || 1));

  return (
    <div className="map-wrap">
      <div className="map">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of Osun LGAs shaded by the share of sheets flagged">
          {shapes.map((s) => {
            const l = byName.get(s.lga);
            const r = l?.analysed ? l.flagged / l.analysed : 0;
            return (
              <path
                key={s.lga} d={s.d}
                fill={RAMP[bin(r)]}
                className={`lga-shape ${hover === s.lga ? 'on' : ''}`}
                onMouseEnter={() => setHover(s.lga)} onMouseLeave={() => setHover(null)}
                onClick={() => navigate(`/${slug}/sheets?lga=${encodeURIComponent(s.lga)}`)}
              ><title>{s.lga}</title></path>
            );
          })}
        </svg>
        <div className={`map-tip ${h ? 'on' : ''}`}>
          {h ? (
            <>
              <div className="map-tip-name">{h.name}</div>
              <div className="map-tip-big">{Math.round((h.flagged / (h.analysed || 1)) * 100)}% flagged</div>
              <div className="mono small muted">{fmt(h.flagged)} of {fmt(h.analysed)} sheets · {fmt(h.pollingUnits)} units</div>
            </>
          ) : <div className="small muted">Hover an LGA · click to see its sheets</div>}
        </div>
        <div className="legend">
          <span className="small muted">Share of sheets flagged</span>
          <div className="legend-ramp">{RAMP.map((c) => <span key={c} style={{ background: c }} />)}</div>
          <div className="legend-ends mono small muted"><span>{Math.round(lo * 100)}%</span><span>{Math.round(hi * 100)}%</span></div>
        </div>
      </div>
      <ol className="lga-rank">
        {sorted.map((l) => {
          const r = l.analysed ? l.flagged / l.analysed : 0;
          return (
            <li key={l.name} className={hover === l.name ? 'on' : ''} onMouseEnter={() => setHover(l.name)} onMouseLeave={() => setHover(null)}>
              <a href={`/${slug}/sheets?lga=${encodeURIComponent(l.name)}`} onClick={(e) => { e.preventDefault(); navigate(`/${slug}/sheets?lga=${encodeURIComponent(l.name)}`); }}>
                <span className="lga-swatch" style={{ background: RAMP[bin(r)] }} />
                <span className="lga-n">{l.name}</span>
                <span className="lga-bar"><span style={{ width: `${(r / (hi || 1)) * 100}%` }} /></span>
                <span className="mono lga-pct">{Math.round(r * 100)}%</span>
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
