import { useMemo, useState } from 'react';
import { daysUntil, fmt, titleCase, useJson, type ElectionListItem, type NationalBoard, type ReplayData } from '../api.ts';
import { Link, navigate } from '../App.tsx';
import { AreaMap, useShapes } from '../components/AreaMap.tsx';
import { NationSearch } from '../components/NationSearch.tsx';
import { WhatsAppCard } from '../components/WhatsAppCard.tsx';
import { useGeo } from './Replay.tsx';

const ICONS = {
  flag: <path d="M6 21V4m0 0h10l-2 4 2 4H6" />,
  camera: <path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Zm8 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />,
  play: <path d="M8 5v14l11-7L8 5Z" />,
  alert: <path d="M12 4 2.8 19.5a.6.6 0 0 0 .5.9h17.4a.6.6 0 0 0 .5-.9L12 4Zm0 6v4.5m0 2.8v.2" />,
  scan: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9h8M8 12h8M8 15h5" />,
};

// Elections Recount covers, newest first, with what it holds for each.
const ELECTIONS = [
  { slug: 'osun', state: 'OSUN', title: 'Osun Governorship', date: '15 Aug 2026' },
  { slug: 'ekiti', state: 'EKITI', title: 'Ekiti Governorship', date: '20 Jun 2026' },
  { slug: 'anambra', state: 'ANAMBRA', title: 'Anambra Governorship', date: '8 Nov 2025' },
];

export function Nation() {
  const board = useJson<NationalBoard>('/api/nigeria');
  const elections = useJson<ElectionListItem[]>('/api/elections');
  const b = board.data;
  const days = daysUntil(b?.electionDay ?? '2027-01-16');

  return (
    <div className="home">
      <section className="hero-band">
        <div className="hero hero-nation">
          <div className="hero-copy">
            <div className="eyebrow">Nigeria · 36 states and the FCT</div>
            <h1>Every polling unit in Nigeria, <em>watched by the people who vote there</em></h1>
            <p className="lede">
              Recount reads the result sheets INEC puts on IReV, checks every figure with Meta's Muse Spark, and holds each
              upload against photos taken at the polling unit by voters, party agents and observers. On 16 January 2027
              it needs one person at each of Nigeria's {b ? fmt(b.totals.units) : '176,000'} units.
            </p>
            <NationSearch big />
            <div className="hero-links">
              <Link to="/2027" className="link-arrow">Cover your polling unit on 16 January 2027</Link>
            </div>
          </div>
          <div className="hero-count">
            <div className="count-days"><b>{days}</b><span>days to the presidential election</span></div>
            <dl className="count-grid">
              <div><dt>Polling units</dt><dd>{b ? fmt(b.totals.units) : '—'}</dd></div>
              <div><dt>Covered for 2027</dt><dd>{b ? fmt(b.totals.covered) : '—'}</dd></div>
              <div><dt>Wards</dt><dd>{b ? fmt(b.totals.wards) : '—'}</dd></div>
              <div><dt>LGAs</dt><dd>{b ? fmt(b.totals.lgas) : '—'}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="services">
        {[
          { icon: ICONS.flag, title: 'Cover your unit', text: 'Pledge to photograph the result at your polling unit on 16 January 2027.', to: '/2027', go: 'Cover a unit' },
          { icon: ICONS.camera, title: 'Add your result', text: 'Upload the result poster from your unit. Recount holds IReV against it.', to: '/add', go: 'Add a sheet' },
          { icon: ICONS.alert, title: 'Report a problem', text: 'Late officials, BVAS down, vote buying, violence, no result posted. Tell the board.', to: '/report', go: 'Situation room' },
          { icon: ICONS.play, title: 'Replay election night', text: 'Watch sheets reach IReV unit by unit, stalls and replacements included.', to: '/osun/replay', go: 'Watch Osun 2026' },
          { icon: ICONS.scan, title: 'Fact-check a sheet', text: 'Got a result sheet on WhatsApp? Compare it with the copy INEC published.', to: '/check', go: 'Check a sheet' },
        ].map((i) => (
          <Link key={i.title} to={i.to} className="service">
            <span className="service-icon"><svg viewBox="0 0 24 24" aria-hidden>{i.icon}</svg></span>
            <h3>{i.title}</h3>
            <p>{i.text}</p>
            <span className="service-go">{i.go}<span aria-hidden>→</span></span>
          </Link>
        ))}
      </section>

      <div className="page">
        <WhatsAppCard />
        {b && <CoverageMap b={b} />}

        <section className="block">
          <div className="block-head">
            <div className="kicker">Read so far</div>
            <h2>Elections Recount has read</h2>
            <p className="block-lede">Every polling-unit sheet INEC put on IReV, read by Muse Spark, checked, and open for anyone to inspect.</p>
          </div>
          <div className="election-grid">
            {ELECTIONS.map((x) => {
              const e = elections.data?.find((y) => y.slug === x.slug);
              const t = e?.totals;
              return (
                <Link key={x.slug} to={t ? `/${x.slug}` : `/${x.slug}/replay`} className="election-card card">
                  <div className="mono small muted">{x.date}</div>
                  <h3>{x.title}</h3>
                  {t ? (
                    <>
                      <div className="election-read"><b>{fmt(t.analysed)}</b> of {fmt(t.sheets)} sheets read</div>
                      <div className="election-bar"><span style={{ width: `${(t.analysed / (t.sheets || 1)) * 100}%` }} /></div>
                      <div className="small muted">{fmt(t.highSeverity)} serious flags · {fmt(t.flagged)} need a look</div>
                    </>
                  ) : <div className="small muted">Indexed from IReV. Reading queued.</div>}
                  <span className="service-go">{t && t.analysed >= t.sheets ? 'See the findings' : 'Open'}<span aria-hidden>→</span></span>
                </Link>
              );
            })}
            <Link to="/2023" className="election-card card election-2023">
              <div className="mono small muted">25 Feb 2023</div>
              <h3>Presidential election</h3>
              <div className="election-read"><b>{b ? fmt(b.totals.units) : '176,000'}</b> polling units indexed</div>
              <div className="small muted">The sheet links on IReV no longer work. Replay the upload night from IReV's own timestamps.</div>
              <span className="service-go">Replay 2023<span aria-hidden>→</span></span>
            </Link>
          </div>
        </section>

        <LapsedDomain />
      </div>
    </div>
  );
}

const RAMP = ['#eef3ee', '#d3ead4', '#a8d5aa', '#73b977', '#3f9447', '#1f6b38'];
const W = 620, H = 520;

// Pledges to cover units in 2027 by state, or how quickly each state's 2023 sheets reached IReV.
function CoverageMap({ b }: { b: NationalBoard }) {
  const { features, key } = useGeo('nigeria');
  const shapes = useShapes(features, key, W, H);
  const replay = useJson<ReplayData>('/api/nigeria/replay');
  const [metric, setMetric] = useState<'cover' | 'fast'>(b.totals.covered >= 25 ? 'cover' : 'fast');
  const [hover, setHover] = useState<string | null>(null);

  // Share of each state's 2023 sheets that were on IReV within 24 hours of polls closing.
  const fast = useMemo(() => {
    const r = replay.data;
    if (!r) return new Map<string, number>();
    const within = Math.round((24 * 60) / r.stepMinutes);
    return new Map(r.areas.map((a) => [a.name, a.counts.slice(0, within).reduce((t, n) => t + n, 0) / (a.total || 1)]));
  }, [replay.data]);
  const value = (name: string) => {
    const s = b.states.find((x) => x.name === name);
    if (!s) return 0;
    return metric === 'cover' ? s.covered / (s.units || 1) : fast.get(name) ?? 0;
  };
  const vals = b.states.map((s) => value(s.name));
  const hi = Math.max(...vals, metric === 'cover' ? 0.01 : 1);
  const fill = (name: string) => RAMP[Math.min(RAMP.length - 1, Math.floor((value(name) / hi) * (RAMP.length - 1)))];
  const ranked = [...b.states].sort((x, y) => value(y.name) - value(x.name) || x.name.localeCompare(y.name));
  const h = hover ? b.states.find((s) => s.name === hover) : null;

  return (
    <section className="block">
      <div className="block-head">
        <div className="kicker">Across Nigeria</div>
        <h2>{metric === 'cover' ? 'Who is covering their unit for 16 January 2027' : 'How fast each state\'s 2023 sheets reached IReV'}</h2>
        <p className="block-lede">
          {metric === 'cover'
            ? `${fmt(b.totals.covered)} of ${fmt(b.totals.units)} polling units have someone pledged to photograph the result. Click a state to see which LGAs still need people.`
            : 'Share of each state\'s presidential result sheets that were on IReV within 24 hours of polls closing on 25 February 2023, from the upload times IReV recorded.'}
        </p>
        <div className="chips">
          <button className={`chip ${metric === 'cover' ? 'on' : ''}`} onClick={() => setMetric('cover')}>2027 coverage</button>
          <button className={`chip ${metric === 'fast' ? 'on' : ''}`} onClick={() => setMetric('fast')}>2023 upload speed</button>
        </div>
      </div>
      <div className="map-wrap">
        <div className="map">
          <AreaMap shapes={shapes} W={W} H={H} label="Map of Nigeria by state" fill={fill} on={hover} onHover={setHover}
            onPick={(s) => navigate(metric === 'cover' ? `/2027?state=${encodeURIComponent(s)}` : '/2023')} />
          <div className={`map-tip ${h ? 'on' : ''}`}>
            {h ? (
              <>
                <div className="map-tip-name">{titleCase(h.name)}</div>
                <div className="map-tip-big">{metric === 'cover' ? `${fmt(h.covered)} of ${fmt(h.units)}` : `${Math.round((fast.get(h.name) ?? 0) * 100)}% in 24h`}</div>
                <div className="mono small muted">{metric === 'cover' ? 'units covered' : `${fmt(h.units)} units · ${fmt(h.lgas)} LGAs`}</div>
              </>
            ) : <div className="small muted">Hover a state</div>}
          </div>
          <div className="legend">
            <span className="small muted">{metric === 'cover' ? 'Units covered' : 'Sheets on IReV within 24 hours'}</span>
            <div className="legend-ramp">{RAMP.map((c) => <span key={c} style={{ background: c }} />)}</div>
            <div className="legend-ends mono small muted"><span>0%</span><span>{Math.round(hi * 100)}%</span></div>
          </div>
        </div>
        <ol className="lga-rank">
          {ranked.map((s) => {
            const v = value(s.name);
            return (
              <li key={s.name} className={hover === s.name ? 'on' : ''} onMouseEnter={() => setHover(s.name)} onMouseLeave={() => setHover(null)}>
                <a href={`/2027?state=${encodeURIComponent(s.name)}`} onClick={(e) => { e.preventDefault(); navigate(metric === 'cover' ? `/2027?state=${encodeURIComponent(s.name)}` : '/2023'); }}>
                  <span className="lga-swatch" style={{ background: fill(s.name) }} />
                  <span className="lga-n">{titleCase(s.name)}</span>
                  <span className="lga-bar"><span style={{ width: `${(v / (hi || 1)) * 100}%` }} /></span>
                  <span className="mono lga-pct">{metric === 'cover' ? fmt(s.covered) : `${Math.round(v * 100)}%`}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// The 2023 sheet links point at a domain INEC no longer holds.
export function LapsedDomain() {
  return (
    <section className="block finding-2023">
      <div className="card finding-card">
        <div className="kicker">Why independent copies matter</div>
        <h2>Half the 2023 presidential sheets are gone from IReV</h2>
        <p>
          IReV still lists all 176,846 polling units from the 2023 presidential election, but 93,410 of the 167,443 sheet links
          point to <span className="mono">docs.inecelectionresults.net</span>. That domain lapsed. A domain reseller registered it
          on 25 April 2025, and the links now open a page offering it for sale. Whoever holds the domain controls what those
          official links show. The other 74,033 sheets, on INEC's cache server, still open.
        </p>
        <p>
          Official records can disappear or change after the fact. Photos taken at the unit, timestamped and held apart from
          INEC, are the record that survives. That is what Recount collects for 2027.
        </p>
        <div className="verdict-actions">
          <Link to="/2027" className="btn btn-green">Cover your unit in 2027</Link>
          <a className="btn btn-ghost" href="https://lookup.icann.org/en/lookup?name=inecelectionresults.net" target="_blank" rel="noreferrer">Check the registration</a>
        </div>
      </div>
    </section>
  );
}
