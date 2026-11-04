import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt, titleCase, useJson, type ReplayData, type ReplayEvent } from '../api.ts';
import { AreaMap, useShapes, type GeoFeature } from '../components/AreaMap.tsx';
import { Link } from '../App.tsx';

// Boundaries per replay: LGAs for a state election, states for a national one.
export const GEO: Record<string, { load: () => Promise<{ default: unknown }>; key: string }> = {
  osun: { load: () => import('../osun-lgas.json'), key: 'lga' },
  ekiti: { load: () => import('../geo/ekiti.json'), key: 'lga' },
  anambra: { load: () => import('../geo/anambra.json'), key: 'lga' },
  nigeria: { load: () => import('../ng-states.json'), key: 'state' },
};
export function useGeo(name: string) {
  const [features, setFeatures] = useState<GeoFeature[] | null>(null);
  useEffect(() => {
    const g = GEO[name];
    if (!g) return;
    let live = true;
    g.load().then((m) => live && setFeatures((m.default as { features: GeoFeature[] }).features)).catch(() => undefined);
    return () => { live = false; };
  }, [name]);
  return { features, key: GEO[name]?.key ?? 'name' };
}

// Share of a unit's sheets in, from nothing (pale) to all (deep green).
const RAMP = ['#eef3ee', '#d3ead4', '#a8d5aa', '#73b977', '#3f9447', '#1f6b38', '#0e3d1e'];
const W = 560, H = 480;
const wat = (t: number, withDay = false) => new Date(t).toLocaleString('en-GB', {
  timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', ...(withDay ? { weekday: 'short', day: 'numeric', month: 'short' } : {}),
});
const KIND_LABEL: Record<ReplayEvent['kind'], string> = {
  first: 'First sheet', milestone: 'Milestone', stall: 'Stall', resume: 'Resumed', replaced: 'Replaced', serious: 'Serious flag',
};

export function Replay({ url, geo, title, eyebrow, intro, back }: {
  url: string; geo: string; title: string; eyebrow: string; intro: string; back?: { to: string; label: string };
}) {
  const { data, error } = useJson<ReplayData>(url);
  const { features, key } = useGeo(geo);
  const shapes = useShapes(features, key, W, H);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  // Cumulative uploads per area at every step, and for the whole election.
  const cum = useMemo(() => {
    if (!data) return null;
    const byArea = new Map(data.areas.map((a) => {
      let t = 0;
      return [a.name, a.counts.map((n) => (t += n))];
    }));
    const total = new Array(data.steps).fill(0);
    for (const series of byArea.values()) series.forEach((n, i) => { total[i] += n; });
    return { byArea, total };
  }, [data]);

  useEffect(() => {
    if (!playing || !data) return;
    timer.current = window.setInterval(() => {
      setStep((s) => {
        if (s >= data.steps - 1) { setPlaying(false); return s; }
        return s + 1;
      });
    }, 160 / speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, data]);

  if (error) return <div className="page"><p className="error">Could not load the replay ({error}).</p></div>;
  if (!data || !cum) return <div className="page"><p className="muted">Loading election night…</p></div>;

  const start = Date.parse(data.start);
  const stepMs = data.stepMinutes * 60_000;
  const now = start + (step + 1) * stepMs;
  const units = data.total ?? data.areas.reduce((t, a) => t + a.total, 0);
  const inNow = cum.total[step];
  const areaShare = (name: string) => {
    const a = data.areas.find((x) => x.name === name);
    const c = cum.byArea.get(name);
    return a && c ? c[step] / (a.total || 1) : null;
  };
  const fill = (name: string) => {
    const r = areaShare(name);
    return r === null ? '#f1f1ee' : RAMP[Math.min(RAMP.length - 1, Math.floor(r * (RAMP.length - 1) + 0.0001))];
  };
  const events = (data.events ?? []).filter((e) => Date.parse(e.at) <= now);
  const pinned = events.filter((e) => e.kind !== 'serious' && e.kind !== 'replaced');
  const ticker = [...events].reverse().slice(0, 7);
  const h = hover ? data.areas.find((a) => a.name === hover) : null;
  const stall = (() => {
    const s = data.events?.find((e) => e.kind === 'stall'), r = data.events?.find((e) => e.kind === 'resume');
    return s && r ? { from: Date.parse(s.at), to: Date.parse(r.at) } : null;
  })();
  const inStall = stall && now >= stall.from && now < stall.to;

  // The upload curve.
  const CW = 640, CH = 140, max = units;
  const x = (i: number) => (i / (data.steps - 1)) * CW;
  const y = (n: number) => CH - (n / max) * (CH - 8);
  const line = cum.total.map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join('');
  const sx = (t: number) => ((t - start) / stepMs / (data.steps - 1)) * CW;

  return (
    <div className="page replay-page">
      {back && <Link to={back.to} className="crumb-link small">← {back.label}</Link>}
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="h-display">{title}</h1>
      <p className="lede">{intro}</p>

      <section className="replay">
        <div className="replay-stage card">
          <div className="replay-head">
            <div>
              <div className="replay-clock">{wat(now)}<span className="mono small muted"> WAT · {wat(now, true).split(',')[0]}</span></div>
              <div className="replay-count">
                <b>{fmt(inNow)}</b> of {fmt(units)} units have a sheet on IReV <span className="mono muted">· {Math.round((inNow / units) * 100)}%</span>
              </div>
            </div>
            {inStall && <div className="replay-stall">No new sheets for {Math.round((now - stall!.from) / 60_000)} min</div>}
          </div>
          <div className="replay-map">
            <AreaMap shapes={shapes} W={W} H={H} label="Map shaded by the share of units with a sheet on IReV" fill={fill} on={hover} onHover={setHover} />
            <div className={`map-tip ${h ? 'on' : ''}`}>
              {h ? (
                <>
                  <div className="map-tip-name">{titleCase(h.name)}</div>
                  <div className="map-tip-big">{fmt(cum.byArea.get(h.name)?.[step] ?? 0)} of {fmt(h.total)}</div>
                  <div className="mono small muted">units with a sheet{h.late ? ` · ${fmt(h.late)} came days later` : ''}</div>
                </>
              ) : <div className="small muted">Hover an area</div>}
            </div>
          </div>
          <div className="legend">
            <span className="small muted">Units with a sheet</span>
            <div className="legend-ramp">{RAMP.map((c) => <span key={c} style={{ background: c }} />)}</div>
            <div className="legend-ends mono small muted"><span>0%</span><span>100%</span></div>
          </div>
          <div className="replay-controls">
            <button className="btn btn-green" onClick={() => { if (step >= data.steps - 1) setStep(0); setPlaying((p) => !p); }}>
              {playing ? 'Pause' : step >= data.steps - 1 ? 'Replay' : step ? 'Resume' : 'Play election night'}
            </button>
            <div className="chips">
              {[1, 3, 8].map((s) => <button key={s} className={`chip ${speed === s ? 'on' : ''}`} onClick={() => setSpeed(s)}>{s}×</button>)}
            </div>
            <input
              className="replay-scrub" type="range" min={0} max={data.steps - 1} value={step}
              onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }} aria-label="Time"
            />
          </div>
          <svg viewBox={`0 0 ${CW} ${CH + 18}`} className="replay-curve" role="img" aria-label="Sheets on IReV over time">
            {stall && <rect x={sx(stall.from)} y={0} width={Math.max(2, sx(stall.to) - sx(stall.from))} height={CH} className="curve-stall" />}
            <path d={`${line}L${CW},${CH}L0,${CH}Z`} className="curve-area" />
            <path d={line} className="curve-line" />
            <line x1={x(step)} x2={x(step)} y1={0} y2={CH} className="curve-cursor" />
            <circle cx={x(step)} cy={y(inNow)} r={4} className="curve-dot" />
            <text x={0} y={CH + 14} className="curve-label">{wat(start, true)}</text>
            <text x={CW} y={CH + 14} textAnchor="end" className="curve-label">{wat(start + data.steps * stepMs, true)}</text>
            {stall && <text x={sx(stall.from) + 4} y={14} className="curve-label">stall</text>}
          </svg>
        </div>

        <aside className="replay-side">
          {pinned.length > 0 && (
            <div className="card">
              <h3>The night so far</h3>
              <ol className="replay-moments">
                {pinned.map((e) => (
                  <li key={e.at + e.kind} className={`k-${e.kind}`}>
                    <span className="mono small muted">{wat(Date.parse(e.at))}</span>
                    <span>{e.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {ticker.length > 0 && (
            <div className="card">
              <h3>Latest</h3>
              <ul className="replay-ticker">
                {ticker.map((e, i) => (
                  <li key={i} className={`k-${e.kind}`}>
                    <span className="tick-kind">{KIND_LABEL[e.kind]}</span>
                    {e.url ? <a href={e.url} className="small">{e.text}</a> : <span className="small">{e.text}</span>}
                    <span className="mono small muted">{wat(Date.parse(e.at))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!data.events?.length && <div className="card small muted">Press play to watch result sheets reach IReV, area by area.</div>}
        </aside>
      </section>
    </div>
  );
}
