import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { fmt, useJson, type NationalBoard, type Summary } from './api.ts';
import { Overview } from './pages/Overview.tsx';
import { Explore } from './pages/Explore.tsx';
import { Sheet } from './pages/Sheet.tsx';
import { Check } from './pages/Check.tsx';
import { Method } from './pages/Method.tsx';
import { Data } from './pages/Data.tsx';
import { AddSheet } from './pages/AddSheet.tsx';
import { Nation, LapsedDomain } from './pages/Nation.tsx';
import { Cover } from './pages/Cover.tsx';
import { Unit } from './pages/Unit.tsx';
import { Situation } from './pages/Situation.tsx';
import { Guide } from './pages/Guide.tsx';
import { Collation } from './pages/Collation.tsx';
import { Replay } from './pages/Replay.tsx';
import { Pack } from './pages/Pack.tsx';

export const ELECTION_SLUGS = ['osun', 'ekiti', 'anambra'];

export function navigate(to: string) {
  history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  if (!to.includes('#')) window.scrollTo({ top: 0 });
}

export function Link({ to, children, className, title }: { to: string; children: ReactNode; className?: string; title?: string }) {
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} className={className} onClick={onClick} title={title}>{children}</a>;
}

function usePath() {
  const [path, setPath] = useState(location.pathname + location.search);
  useEffect(() => {
    const on = () => setPath(location.pathname + location.search);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

// A tally of five: how votes are counted at the polling unit.
export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="logo" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--green-deep)" />
      <path d="M9.5 9v14M13.5 9v14M17.5 9v14M21.5 9v14" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M6.5 20.5 25.5 11.5" stroke="#7fd37e" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

function Wordmark({ to }: { to: string }) {
  return (
    <Link to={to} className="wordmark">
      <Logo />
      <span className="wordmark-text"><b>Recount</b><small>Independent result-sheet audit</small></span>
    </Link>
  );
}

export function App() {
  const path = usePath();
  const [pathname, search = ''] = path.split('?');
  const parts = pathname.split('/').filter(Boolean);
  const inElection = ELECTION_SLUGS.includes(parts[0]);
  const slug = inElection ? parts[0] : 'osun';
  const national = !inElection && !['check', 'collation', 'method', 'data', 'add'].includes(parts[0] ?? '');
  const summary = useJson<Summary>(national ? null : `/api/${slug}/summary`);
  const board = useJson<NationalBoard>(national ? '/api/nigeria' : null);

  let page: ReactNode;
  const params = new URLSearchParams(search);
  if (!parts.length) page = <Nation />;
  else if (parts[0] === '2027' || parts[0] === 'join') page = <Cover state={params.get('state')} />;
  else if (parts[0] === '2023') page = (
    <>
      <Replay url="/api/nigeria/replay" geo="nigeria" eyebrow="Presidential election · 25 February 2023"
        title="The 2023 presidential upload night, replayed"
        intro="Every polling unit's result sheet reaching IReV, state by state, from the upload times IReV recorded. Polls closed at 2:30 pm and the first sheet arrived at 8:55 pm. These times match what was reported then: 84.5% of sheets by 2 March, 90% by 4 March, 167,443 in the end." />
      <div className="page"><LapsedDomain /></div>
    </>
  );
  else if (parts[0] === 'unit' && parts[1]) page = <Unit code={parts[1]} />;
  else if (parts[0] === 'report' || parts[0] === 'situation') page = <Situation unitCode={params.get('unit')} />;
  else if (parts[0] === 'guide') page = <Guide />;
  else if (parts[0] === 'add') page = <AddSheet key={params.get('election') ?? 'osun'} slug={params.get('election') ?? 'osun'} puId={params.get('pu')} />;
  else if (parts[0] === 'check') page = <Check slug={params.get('election') ?? 'osun'} />;
  else if (parts[0] === 'collation') page = <Collation key={params.get('election') ?? 'osun'} slug={params.get('election') ?? 'osun'} />;
  else if (parts[0] === 'method') page = <Method />;
  else if (parts[0] === 'data') page = <Data slug={slug} />;
  else if (!inElection) page = <Nation />;
  else if (parts[1] === 'replay') page = (
    <Replay url={`/api/${slug}/replay`} geo={slug} eyebrow={summary.data?.title ?? 'Election night'} back={{ to: `/${slug}`, label: 'Findings' }}
      title="Election night, as it reached IReV"
      intro="Each polling unit's result sheet arriving on IReV, LGA by LGA, with the moments worth stopping on: the first upload, stalls, sheets replaced after upload, and sheets whose own figures contradict each other." />
  );
  else if (parts[1] === 'pack') page = <Pack slug={slug} query={parts[2] === 'pu' && parts[3] ? `pu=${parts[3]}` : search} />;
  else if (parts[1] === 'pu' && parts[2]) page = <Sheet slug={slug} id={parts[2]} />;
  else if (parts[1] === 'sheets') page = <Explore slug={slug} search={search} />;
  else page = <Overview slug={slug} />;

  const section = !parts.length ? 'nigeria'
    : ['2027', 'join', 'unit'].includes(parts[0]) ? '2027'
    : ['report', 'situation'].includes(parts[0]) ? 'report'
    : parts[0] === 'guide' ? 'guide'
    : parts[0] === '2023' ? 'replay'
    : parts[0] === 'collation' ? 'check'
    : ['check', 'method', 'data', 'add'].includes(parts[0]) ? parts[0]
    : parts[1] === 'replay' ? 'replay'
    : parts[1] === 'sheets' || parts[1] === 'pu' || parts[1] === 'pack' ? 'sheets' : 'overview';
  const t = summary.data?.totals;
  const nb = board.data?.totals;
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Wordmark to="/" />
          <button className="menu-btn" aria-expanded={menu} aria-controls="main-nav" onClick={() => setMenu((m) => !m)}>{menu ? 'Close' : 'Menu'}</button>
          <nav id="main-nav" className={`nav ${menu ? 'open' : ''}`} aria-label="Main">
            <Link to="/" className={section === 'nigeria' ? 'on' : ''}>Nigeria</Link>
            <Link to={`/${slug}`} className={section === 'overview' || section === 'sheets' ? 'on' : ''}>Findings</Link>
            <Link to={`/${slug}/replay`} className={section === 'replay' ? 'on' : ''}>Replay</Link>
            <Link to="/2027" className={section === '2027' ? 'on' : ''}>2027</Link>
            <Link to="/report" className={section === 'report' ? 'on' : ''}>Report</Link>
            <Link to="/add" className={`nav-mid ${section === 'add' ? 'on' : ''}`}>Add a sheet</Link>
            <Link to="/check" className={`nav-mid ${section === 'check' ? 'on' : ''}`}>Fact-check</Link>
            <Link to="/guide" className={`nav-minor ${section === 'guide' ? 'on' : ''}`}>Guide</Link>
            <Link to="/data" className={`nav-minor ${section === 'data' ? 'on' : ''}`}>Data</Link>
            <Link to="/method" className={`nav-minor ${section === 'method' ? 'on' : ''}`}>Method</Link>
          </nav>
          <Link to="/2027" className="btn btn-green nav-cta hide-sm">Cover your unit</Link>
        </div>
        {national && nb && (
          <div className="statusbar">
            <div className="statusbar-inner mono">
              <span className="status-flag">Independent · not INEC</span>
              <span>{fmt(nb.units)} <span className="hide-sm">polling units</span><span className="show-sm">units</span></span>
              <span className="sep">·</span>
              <span>{fmt(nb.covered)} covered<span className="hide-sm"> for 16 Jan 2027</span></span>
            </div>
          </div>
        )}
        {!national && t && (
          <div className="statusbar">
            <div className="statusbar-inner mono">
              <span className="status-flag">Independent · not INEC</span>
              <span className="hide-sm">{summary.data!.title}</span>
              <span className="sep hide-sm">·</span>
              <span>{fmt(t.analysed)} of {fmt(t.sheets)} <span className="hide-sm">IReV sheets </span>read</span>
              <span className="sep hide-sm">·</span>
              <span className="hide-sm">{fmt(t.pollingUnits - t.sheets)} units with no sheet</span>
            </div>
          </div>
        )}
      </header>
      <main>{page}</main>
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Wordmark to="/" />
            <p>Every polling unit result sheet, read and checked. Independent and non-partisan.</p>
          </div>
          <p className="footer-note">
            Recount reads the public result sheets INEC uploads to IReV. It is unofficial and does not declare results:
            only INEC declares results, and only the courts decide disputes. A flag means "look at this sheet", not
            "this result is false".
          </p>
          <nav className="footer-links" aria-label="More">
            <Link to="/data">Open data and API</Link>
            <Link to="/method">How Recount works</Link>
            <Link to="/2023">2023 upload replay</Link>
            <Link to="/check">Fact-check a sheet</Link>
            <Link to="/collation">Check a collation sheet</Link>
            <Link to="/report">Situation room</Link>
            <Link to="/guide">Election-day guide</Link>
          </nav>
          <div className="footer-meta mono">
            <span>Read by Meta Muse Spark 1.3 · stamps located by SAM 3.1</span>
            <span>Sheets: INEC IReV · Boundaries: geoBoundaries (CC BY 4.0)</span>
            <span>Built by nerom and joyegwatu</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
