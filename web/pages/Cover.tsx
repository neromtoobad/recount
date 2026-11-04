import { useState } from 'react';
import { codeToPath, daysUntil, fmt, titleCase, useJson, type NationalBoard, type NationalUnit } from '../api.ts';
import { Link, navigate } from '../App.tsx';
import { NationSearch } from '../components/NationSearch.tsx';
import { Join } from './Join.tsx';
import { WhatsAppCard } from '../components/WhatsAppCard.tsx';

const ROLES = [['voter', 'Voter'], ['agent', 'Party agent'], ['observer', 'Observer'], ['journalist', 'Journalist']] as const;

// A calendar entry for election day, so the pledge is still there in January.
function icsHref(u: NationalUnit, url: string) {
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Recount//Cover your unit//EN', 'BEGIN:VEVENT',
    `UID:cover-${u.code.replace(/\//g, '-')}@recount`, 'DTSTART;VALUE=DATE:20270116', 'DTEND;VALUE=DATE:20270117',
    `SUMMARY:Photograph the result at ${u.name}`,
    `DESCRIPTION:After counting\\, photograph the result poster (EC60E) at ${u.name} (${u.code}) and add it at ${url}. Never photograph your marked ballot.`,
    `LOCATION:${u.name}\\, ${titleCase(u.ward)}\\, ${titleCase(u.lga)}\\, ${titleCase(u.state)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', 'DESCRIPTION:Election day tomorrow: you are covering your polling unit', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
}

export function Cover({ state }: { state: string | null }) {
  const board = useJson<NationalBoard>('/api/nigeria');
  const [unit, setUnit] = useState<NationalUnit | null>(null);
  const [role, setRole] = useState('voter');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<NationalUnit | null>(null);
  const b = board.data;

  const pledge = async () => {
    if (!unit) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/nigeria/pledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: unit.code, role }) }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok || !json?.unit) return setError(json?.error ?? 'Could not save. Check your connection and try again.');
    setDone(json.unit);
  };

  const unitUrl = (u: NationalUnit) => `${location.origin}/unit/${codeToPath(u.code)}`;
  const share = (u: NationalUnit) => `I'm covering polling unit ${u.code}, ${u.name} (${titleCase(u.ward)}, ${titleCase(u.lga)}) on 16 January 2027. After counting I'll photograph the result and add it to Recount, so the upload to IReV can be checked against it. Is your unit covered? ${location.origin}/2027`;

  return (
    <div className="page cover-page">
      <div className="add-head">
        <div>
          <div className="eyebrow">Presidential election · 16 January 2027</div>
          <h1 className="h-display">Cover your polling unit</h1>
          <p className="lede">
            Pledge to photograph the result at your unit after counting. One person per unit is enough. No name or phone number
            needed: Recount only counts how many people cover each unit.
          </p>
        </div>
        <div className="add-stats">
          <div><b>{daysUntil(b?.electionDay ?? '2027-01-16')}</b><span>days to go</span></div>
          <div><b>{b ? fmt(b.totals.covered) : '—'}</b><span>units covered</span></div>
          <div><b>{b ? fmt(b.totals.units - b.totals.covered) : '—'}</b><span>still need someone</span></div>
          <div><b>{b ? fmt(b.totals.pledges) : '—'}</b><span>pledges</span></div>
        </div>
      </div>

      <div className="add-layout">
        <div className="card add-form">
          {done ? (
            <div className="add-done">
              <div className="mono small muted">Pledged · {done.code}</div>
              <h2>You're covering {done.name}</h2>
              <p>
                {done.pledges > 1 ? `${done.pledges} people now cover this unit.` : 'You are the first person covering this unit.'} On 16 January,
                after the presiding officer announces the result and pastes the poster, photograph it and add it to Recount.
              </p>
              <div className="verdict-actions">
                <a className="btn btn-green" href={`https://wa.me/?text=${encodeURIComponent(share(done))}`} target="_blank" rel="noreferrer">Tell your group on WhatsApp</a>
                <a className="btn btn-light" href={icsHref(done, `${location.origin}/add`)} download="election-day-2027.ics">Add to calendar</a>
                <Link to={`/unit/${codeToPath(done.code)}`} className="btn btn-ghost">Your unit's page</Link>
              </div>
              <button className="btn btn-ghost" onClick={() => { setDone(null); setUnit(null); }}>Cover another unit</button>
            </div>
          ) : (
            <>
              <fieldset>
                <legend><span className="step-n">1</span>Your polling unit</legend>
                {unit ? (
                  <div className="picked">
                    <div>
                      <b>{unit.name}</b>
                      <span className="mono small muted">{unit.code} · {titleCase(unit.ward)}, {titleCase(unit.lga)}, {titleCase(unit.state)}</span>
                      <span className="small">{unit.pledges ? `${unit.pledges} already covering` : 'Nobody is covering this unit yet'}</span>
                    </div>
                    <button className="btn btn-ghost" onClick={() => setUnit(null)}>Change</button>
                  </div>
                ) : <NationSearch onPick={setUnit} />}
                <p className="small muted">The code is on your voter card (PVC), like 24/11/04/012. INEC's <a className="inline-link" href="https://www.inecnigeria.org/polling-units/" target="_blank" rel="noreferrer">polling unit locator</a> can also find it.</p>
              </fieldset>
              <fieldset>
                <legend><span className="step-n">2</span>You are</legend>
                <div className="chips">
                  {ROLES.map(([r, label]) => <button type="button" key={r} className={`chip ${role === r ? 'on' : ''}`} onClick={() => setRole(r)}>{label}</button>)}
                </div>
              </fieldset>
              {error && <p className="error">{error}</p>}
              <button className="btn btn-green add-submit" disabled={!unit || busy} onClick={pledge}>{busy ? 'Saving…' : 'I will cover this unit'}</button>
            </>
          )}
        </div>
        <aside className="add-guide">
          <WhatsAppCard compact />
          <div className="card">
            <h3>On the day</h3>
            <ul>
              <li>Vote, then stay or come back for the count. It is public.</li>
              <li>When the result is announced and the EC60E poster goes up, take one clear photo of the whole sheet.</li>
              <li>Add it on Recount or send it to the Recount WhatsApp number with your unit code.</li>
            </ul>
          </div>
          <div className="card guide-warn">
            <h3>Stay safe, stay legal</h3>
            <ul>
              <li><b>Never photograph your marked ballot.</b></li>
              <li>Don't argue with officials or agents. Just take the photo.</li>
              <li>If there is trouble, leave. No photo is worth your safety.</li>
            </ul>
          </div>
        </aside>
      </div>

      {state && <StateCoverage key={done?.code ?? ''} state={state} />}

      <Join embedded />
    </div>
  );
}

// Which LGAs in a state still need people.
function StateCoverage({ state }: { state: string }) {
  const { data } = useJson<{ state: string; lgas: { name: string; units: number; wards: number; covered: number }[] }>(`/api/nigeria/state/${encodeURIComponent(state)}`);
  if (!data) return null;
  const units = data.lgas.reduce((t, l) => t + l.units, 0), covered = data.lgas.reduce((t, l) => t + l.covered, 0);
  return (
    <section className="block">
      <div className="block-head">
        <div className="kicker">{titleCase(data.state)}</div>
        <h2>{fmt(covered)} of {fmt(units)} units covered</h2>
        <p className="block-lede">LGAs with the fewest people first. Share the kit with groups there.</p>
      </div>
      <ol className="lga-rank state-rank">
        {[...data.lgas].sort((a, b) => a.covered / a.units - b.covered / b.units).map((l) => (
          <li key={l.name}>
            <a href={`/2027?state=${encodeURIComponent(state)}`} onClick={(e) => { e.preventDefault(); navigate(`/2027?state=${encodeURIComponent(state)}`); }}>
              <span className="lga-n">{titleCase(l.name)}</span>
              <span className="lga-bar"><span style={{ width: `${(l.covered / (l.units || 1)) * 100}%` }} /></span>
              <span className="mono lga-pct">{fmt(l.covered)}/{fmt(l.units)}</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
