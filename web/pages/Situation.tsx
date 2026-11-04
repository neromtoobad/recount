import { useEffect, useState } from 'react';
import { codeToPath, fmt, titleCase, useJson, watTime, type NationalUnit, type SituationData, type UnitReport } from '../api.ts';
import { Link } from '../App.tsx';
import { AreaMap, useShapes } from '../components/AreaMap.tsx';
import { NationSearch } from '../components/NationSearch.tsx';
import { WhatsAppCard } from '../components/WhatsAppCard.tsx';
import { useGeo } from './Replay.tsx';

const KIND_ORDER = ['late', 'bvas', 'turned_away', 'vote_buying', 'violence', 'snatched', 'no_result', 'posted', 'calm', 'pvc'];
const WINDOWS = [[6, '6 hours'], [24, '24 hours'], [24 * 7, '7 days']] as const;
const RAMP = ['#f1f3f1', '#f6dccb', '#eebb9c', '#df8e66', '#c8603b', '#9c3b1f'];
const W = 620, H = 520;

// The situation room: report what you see at your polling unit, and watch reports come in.
export function Situation({ unitCode }: { unitCode: string | null }) {
  const preset = useJson<{ unit: NationalUnit }>(unitCode ? `/api/nigeria/unit/${unitCode}` : null);
  const [unit, setUnit] = useState<NationalUnit | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ unit: NationalUnit; reports: UnitReport[]; repeat: boolean } | null>(null);
  const [tick, setTick] = useState(0);
  const picked = unit ?? preset.data?.unit ?? null;

  const kinds = useJson<SituationData>(`/api/nigeria/situation?hours=24&t=${tick}`);
  const list = kinds.data ? KIND_ORDER.map((k) => kinds.data!.kinds.find((x) => x.kind === k)!).filter(Boolean) : [];

  const send = async () => {
    if (!picked || !kind) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/nigeria/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: picked.code, kind }) }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok || !json?.unit) return setError(json?.error ?? 'Could not send. Check your connection and try again.');
    setDone(json);
    setTick((t) => t + 1);
  };

  return (
    <div className="page situation-page">
      <div className="add-head">
        <div>
          <div className="eyebrow">Situation room · open now and on 16 January 2027</div>
          <h1 className="h-display">Report what you see at your polling unit</h1>
          <p className="lede">
            Late officials, a BVAS that won't work, vote buying, violence, a result that never goes up. Pick your unit and what is
            happening. Reports show on the board below, without your name or number, and two people reporting the same thing
            at one unit marks it confirmed.
          </p>
        </div>
      </div>

      <div className="add-layout">
        <div className="card add-form">
          {done ? (
            <div className="add-done">
              <div className="mono small muted">Reported · {done.unit.code}</div>
              <h2>{done.repeat ? 'You already reported this here' : 'Thank you. Your report is on the board'}</h2>
              <p>{done.unit.name}, {titleCase(done.unit.ward)}, {titleCase(done.unit.lga)}</p>
              <ul className="report-list">{done.reports.map((r) => <ReportRow key={r.kind} r={r} />)}</ul>
              <p className="small muted">If anyone is in danger, leave and call 112. A report here does not reach INEC or the police.</p>
              <div className="verdict-actions">
                <button className="btn btn-green" onClick={() => { setDone(null); setKind(null); }}>Report something else here</button>
                <Link to={`/unit/${codeToPath(done.unit.code)}`} className="btn btn-ghost">Your unit's page</Link>
              </div>
            </div>
          ) : (
            <>
              <fieldset>
                <legend><span className="step-n">1</span>Your polling unit</legend>
                {picked ? (
                  <div className="picked">
                    <div>
                      <b>{picked.name}</b>
                      <span className="mono small muted">{picked.code} · {titleCase(picked.ward)}, {titleCase(picked.lga)}, {titleCase(picked.state)}</span>
                    </div>
                    <button className="btn btn-ghost" onClick={() => setUnit(null)}>Change</button>
                  </div>
                ) : <NationSearch onPick={setUnit} />}
              </fieldset>
              <fieldset>
                <legend><span className="step-n">2</span>What is happening?</legend>
                <div className="kind-grid" role="radiogroup">
                  {list.map((k) => (
                    <button type="button" role="radio" aria-checked={kind === k.kind} key={k.kind} className={`kind tone-${k.tone} ${kind === k.kind ? 'on' : ''}`} onClick={() => setKind(k.kind)}>
                      <span className="kind-dot" />{k.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              {error && <p className="error">{error}</p>}
              <button className="btn btn-green add-submit" disabled={!picked || !kind || busy} onClick={send}>{busy ? 'Sending…' : 'Send report'}</button>
            </>
          )}
        </div>
        <aside className="add-guide">
          <WhatsAppCard compact />
          <div className="card guide-warn">
            <h3>Safety first</h3>
            <ul>
              <li>Report from a safe distance. Don't film or confront anyone who is armed or angry.</li>
              <li>In an emergency, leave and call <b>112</b>.</li>
              <li>Recount is independent. It does not send reports to INEC or the police; it makes them public so observers and the press can follow up.</li>
            </ul>
          </div>
          <div className="card">
            <h3>What happens to a report</h3>
            <ul>
              <li>It shows on the board with the unit, the time and what was seen. Nothing about you is shown or kept.</li>
              <li>Two different people reporting the same thing at one unit within three hours marks it confirmed.</li>
              <li>Reports go into the unit's evidence pack beside its result sheet.</li>
            </ul>
          </div>
        </aside>
      </div>

      <Board tick={tick} onTick={() => setTick((t) => t + 1)} />
    </div>
  );
}

function ReportRow({ r }: { r: UnitReport }) {
  return (
    <li className={`tone-${r.tone}`}>
      <span className="kind-dot" />
      <span><b>{r.short}</b> · {r.reporters} {r.reporters === 1 ? 'person' : 'people'}{r.corroborated ? ' · confirmed' : ''}</span>
      <span className="mono small muted">{watTime(r.last)}</span>
    </li>
  );
}
export { ReportRow };

// Live board: counts by kind, a map of states by serious reports, and the latest reports.
function Board({ tick, onTick }: { tick: number; onTick: () => void }) {
  const [hours, setHours] = useState<number>(24);
  const { data } = useJson<SituationData>(`/api/nigeria/situation?hours=${hours}&t=${tick}`);
  const { features, key } = useGeo('nigeria');
  const shapes = useShapes(features, key, W, H);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => { const id = window.setInterval(onTick, 30_000); return () => window.clearInterval(id); }, [onTick]);
  if (!data) return <div className="skeleton" style={{ height: 420 }} />;

  const hi = Math.max(1, ...data.states.map((s) => s.reports));
  const fill = (name: string) => {
    const s = data.states.find((x) => x.name === name);
    return !s?.reports ? RAMP[0] : RAMP[Math.min(RAMP.length - 1, 1 + Math.floor((s.reports / hi) * (RAMP.length - 2)))];
  };
  const h = hover ? data.states.find((s) => s.name === hover) : null;
  const kinds = KIND_ORDER.map((k) => data.kinds.find((x) => x.kind === k)!).filter(Boolean);
  const top = Math.max(1, ...kinds.map((k) => k.reports));

  return (
    <section className="block">
      <div className="block-head">
        <div className="kicker">The board · refreshes every 30 seconds</div>
        <h2>{data.totals.reports ? `${fmt(data.totals.reports)} report${data.totals.reports === 1 ? '' : 's'} from ${fmt(data.totals.units)} polling unit${data.totals.units === 1 ? '' : 's'}` : 'No reports yet'}</h2>
        <p className="block-lede">
          {data.totals.reports
            ? `${fmt(data.totals.corroborated)} confirmed by two or more people. Shown by unit and time only.`
            : 'Reports from any polling unit in Nigeria appear here as they arrive, by unit and time only.'}
        </p>
        <div className="chips">
          {WINDOWS.map(([n, label]) => <button key={n} className={`chip ${hours === n ? 'on' : ''}`} onClick={() => setHours(n)}>Last {label}</button>)}
        </div>
      </div>
      <div className="map-wrap">
        <div className="map">
          <AreaMap shapes={shapes} W={W} H={H} label="Reports by state" fill={fill} on={hover} onHover={setHover} />
          <div className={`map-tip ${h ? 'on' : ''}`}>
            {h ? (
              <>
                <div className="map-tip-name">{titleCase(h.name)}</div>
                <div className="map-tip-big">{fmt(h.reports)} report{h.reports === 1 ? '' : 's'}</div>
                <div className="mono small muted">{fmt(h.units)} units · {fmt(h.serious)} serious</div>
              </>
            ) : <div className="small muted">Hover a state</div>}
          </div>
        </div>
        <div className="situation-side">
          <ol className="kind-rank">
            {kinds.map((k) => (
              <li key={k.kind} className={`tone-${k.tone}`}>
                <span className="kind-dot" />
                <span className="lga-n">{k.short}</span>
                <span className="lga-bar"><span style={{ width: `${(k.reports / top) * 100}%` }} /></span>
                <span className="mono lga-pct">{fmt(k.reports)}</span>
              </li>
            ))}
          </ol>
          <h3 className="situation-latest-h">Latest</h3>
          {data.latest.length ? (
            <ul className="situation-latest">
              {data.latest.slice(0, 20).map((l) => (
                <li key={`${l.code}-${l.kind}`} className={`tone-${l.tone}`}>
                  <span className="kind-dot" />
                  <div>
                    <Link to={`/unit/${codeToPath(l.code)}`}><b>{l.short}</b> at {l.name}</Link>
                    <div className="mono small muted">{l.code} · {titleCase(l.lga)}, {titleCase(l.state)} · {watTime(l.at)}{l.reporters > 1 ? ` · ${l.reporters} people` : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="small muted">Nothing in this window.</p>}
        </div>
      </div>
    </section>
  );
}
