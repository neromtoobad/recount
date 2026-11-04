import { useState } from 'react';
import { codeToPath, titleCase, useJson, watTime, type NationalUnit, type UnitHistory, type UnitReport } from '../api.ts';
import { ReportRow } from './Situation.tsx';
import { Link } from '../App.tsx';

const STATUS = { serious: 'Serious flag', flagged: 'Needs a second look', clean: 'Passed every check', unread: 'Not read yet' };

// One polling unit, across every election Recount holds, and who is covering it in 2027.
export function Unit({ code }: { code: string }) {
  const { data, error } = useJson<{ unit: NationalUnit; history: UnitHistory[]; reports: UnitReport[] }>(`/api/nigeria/unit/${code}`);
  const [pledged, setPledged] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <div className="page"><p className="muted">No polling unit with the code {code.replace(/-/g, '/')} is on the register.</p><Link to="/2027" className="link-arrow">Search for your unit</Link></div>;
  if (!data) return <div className="page"><div className="skeleton" style={{ height: 360 }} /></div>;
  const { unit: u, history, reports } = data;
  const pledges = pledged ?? u.pledges;

  const pledge = async () => {
    setBusy(true);
    const res = await fetch('/api/nigeria/pledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: u.code, role: 'voter' }) }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (json?.unit) setPledged(json.unit.pledges);
  };
  const share = `Polling unit ${u.code}, ${u.name} (${titleCase(u.lga)}, ${titleCase(u.state)}) has ${pledges || 'no'} ${pledges === 1 ? 'person' : 'people'} covering it on 16 January 2027. Cover it with me: ${location.origin}/unit/${codeToPath(u.code)}`;

  return (
    <div className="page unit-page">
      <nav className="crumbs small">
        <Link to="/">Nigeria</Link><span>/</span>
        <Link to={`/2027?state=${encodeURIComponent(u.state)}`}>{titleCase(u.state)}</Link><span>/</span>
        <span>{titleCase(u.lga)}</span><span>/</span><span>{titleCase(u.ward)}</span>
      </nav>
      <div className="eyebrow mono">Polling unit {u.code}</div>
      <h1 className="h-display">{u.name}</h1>
      <p className="lede">{titleCase(u.ward)} ward, {titleCase(u.lga)} LGA, {titleCase(u.state)}</p>

      <div className="unit-grid">
        <div className={`card unit-cover ${pledges ? 'is-covered' : ''}`}>
          <div className="kicker">16 January 2027</div>
          <div className="unit-cover-n"><b>{pledges}</b> {pledges === 1 ? 'person is' : 'people are'} covering this unit</div>
          <p className="small muted">{pledges ? 'Someone will photograph the result here. A second person makes the record stronger.' : 'Nobody has pledged to photograph the result here yet.'}</p>
          <div className="verdict-actions">
            {pledged === null
              ? <button className="btn btn-green" disabled={busy} onClick={pledge}>{busy ? 'Saving…' : 'I will cover this unit'}</button>
              : <span className="copy-standing st-agrees">You're covering this unit</span>}
            <a className="btn btn-light" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
          </div>
          <div className="unit-reports">
            <div className="kicker">Reports from this unit</div>
            {reports.length
              ? <ul className="report-list">{reports.map((r) => <ReportRow key={r.kind} r={r} />)}</ul>
              : <p className="small muted">No one has reported anything here.</p>}
            <Link to={`/report?unit=${codeToPath(u.code)}`} className="link-arrow small">Report what you see here</Link>
          </div>
        </div>

        <div className="card">
          <h3>Results Recount holds for this unit</h3>
          {history.length ? (
            <ul className="unit-history">
              {history.map((h) => (
                <li key={h.slug}>
                  <div>
                    <b>{h.title}</b>
                    <span className="small muted">{h.hasSheet ? `Sheet on IReV ${h.uploadedAt ? watTime(h.uploadedAt) : ''}` : 'No sheet on IReV'} · {STATUS[h.status]}</span>
                  </div>
                  <div className="unit-history-links">
                    <a href={h.recountUrl} className="link-arrow small">Open the sheet</a>
                    <Link to={`/${h.slug}/pack/pu/${h.puId}`} className="small inline-link">Evidence pack</Link>
                    <Link to={`/add?election=${h.slug}&pu=${h.puId}`} className="small inline-link">Add your photo</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="small muted">Recount has not read an election held at this unit yet. It reads every governorship election as it happens and the presidential election on 16 January 2027.</p>}
          <div className="unit-2023">
            <div className="kicker">Presidential election, 25 Feb 2023</div>
            <p className="small">
              {u.uploaded2023 ? <>The sheet reached IReV {watTime(u.uploaded2023)}{u.replaced2023 ? `, and was replaced ${u.replaced2023} time${u.replaced2023 > 1 ? 's' : ''}` : ''}. </> : 'IReV recorded no sheet for this unit. '}
              The 2023 sheet links no longer open: <Link to="/2023" className="inline-link">see why</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
