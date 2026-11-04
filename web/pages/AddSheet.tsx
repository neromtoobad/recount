import { useEffect, useState, type FormEvent } from 'react';
import { STANDING_LABEL, fmt, useJson, watTime, type Analysis, type CitizenCopy, type CopyStats, type PURow, type Summary } from '../api.ts';
import { Link, navigate } from '../App.tsx';
import { CopyCard } from '../components/CopyList.tsx';
import { PuSearch } from '../components/PuSearch.tsx';

type Picked = Pick<PURow, 'id' | 'puCode' | 'name' | 'ward' | 'lga'>;
type Conflict = { puId: string; puCode: string; name: string; lga: string; copies: number; disagree: number; agree: number };

const ROLES = [['voter', 'Voter'], ['agent', 'Party agent'], ['observer', 'Observer'], ['journalist', 'Journalist']] as const;
const KINDS = [['ec60e', 'Result poster pasted at the unit (EC60E)'], ['ec8a', "Party agent's copy of the EC8A"], ['other', 'Other photo of the result']] as const;

// datetime-local wants local wall time without a zone.
const localInput = (ms: number) => new Date(ms - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

const ADD_ELECTIONS = [['osun', 'Osun 2026'], ['ekiti', 'Ekiti 2026'], ['anambra', 'Anambra 2025']] as const;

export function AddSheet({ slug, puId }: { slug: string; puId: string | null }) {
  const summary = useJson<Summary>(`/api/${slug}/summary`).data;
  const preset = useJson<Analysis>(puId ? `/api/${slug}/pu/${puId}` : null).data;
  const board = useJson<{ stats: CopyStats; copies: CitizenCopy[] }>(`/api/${slug}/copies?limit=12`);
  const conflicts = useJson<Conflict[]>(`/api/${slug}/copies/conflicts`).data;

  const [pu, setPu] = useState<Picked | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [takenAt, setTakenAt] = useState('');
  const [kind, setKind] = useState('ec60e');
  const [role, setRole] = useState('voter');
  const [party, setParty] = useState('');
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [totalValid, setTotalValid] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ copy: CitizenCopy; duplicate: boolean } | null>(null);

  useEffect(() => { if (preset?.pu && !pu) setPu(preset.pu); }, [preset, pu]);
  const parties = (summary?.tally ?? []).slice(0, 4).map((p) => p.party);

  const pick = (f: File | null) => {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : '');
    // Phones stamp camera photos with the moment they were taken.
    if (f) setTakenAt(localInput(f.lastModified || Date.now()));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pu) return setError('Choose the polling unit first.');
    if (!file) return setError('Add a photo of the result.');
    setBusy(true); setError('');
    const fd = new FormData();
    fd.set('image', file); fd.set('puId', pu.id); fd.set('role', role); fd.set('kind', kind);
    if (role === 'agent') fd.set('party', party);
    if (takenAt) fd.set('takenAt', new Date(takenAt).toISOString());
    fd.set('votes', JSON.stringify(Object.fromEntries(Object.entries(votes).filter(([, v]) => v !== ''))));
    if (totalValid) fd.set('totalValid', totalValid);
    const res = await fetch(`/api/${slug}/copies`, { method: 'POST', body: fd }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok || !json) return setError(json?.error ?? 'Upload failed. Check your connection and try again.');
    setDone(json);
    requestAnimationFrame(() => document.querySelector('.add-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const reset = () => { setDone(null); pick(null); setVotes({}); setTotalValid(''); };
  const s = board.data?.stats;

  return (
    <div className="page add-page">
      <div className="add-head">
        <div>
          <div className="eyebrow">Citizen copies · {summary?.title ?? ''}</div>
          <h1 className="h-display">Add the result from your polling unit</h1>
          <p className="lede">
            After counting, INEC pastes the result on a poster (Form EC60E) at every polling unit, and party agents get copies
            of the EC8A. A photo of it, taken at the unit, is a record fixed in time. Recount holds it against the sheet INEC
            uploads to IReV, which can come hours later, and flags any unit where the two disagree.
          </p>
          <div className="chips add-elections" role="group" aria-label="Election">
            {ADD_ELECTIONS.map(([sl, label]) => (
              <button key={sl} type="button" className={`chip ${sl === slug ? 'on' : ''}`} onClick={() => navigate(`/add?election=${sl}`)}>{label}</button>
            ))}
          </div>
        </div>
        {s && (
          <div className="add-stats">
            <div><b>{fmt(s.copies)}</b><span>copies added</span></div>
            <div><b>{fmt(s.units)}</b><span>polling units</span></div>
            <div><b className="st-agrees">{fmt(s.agree)}</b><span>agree with IReV</span></div>
            <div><b className="st-disagrees">{fmt(s.disagree)}</b><span>differ from IReV</span></div>
          </div>
        )}
      </div>

      <div className="add-layout">
        {done ? (
          <Done slug={slug} copy={done.copy} duplicate={done.duplicate} onAgain={reset} />
        ) : (
          <form className="card add-form" onSubmit={submit}>
            <fieldset>
              <legend><span className="step-n">1</span>Polling unit</legend>
              {pu ? (
                <div className="picked">
                  <div><b>{pu.name.trim()}</b><span className="mono small muted">{pu.puCode} · {pu.ward} · {pu.lga}</span></div>
                  <button type="button" className="btn btn-ghost small" onClick={() => setPu(null)}>Change</button>
                </div>
              ) : <PuSearch slug={slug} onPick={setPu} placeholder="Name, ward or code on your voter card" />}
            </fieldset>

            <fieldset>
              <legend><span className="step-n">2</span>Photo of the result</legend>
              <label className={`photo-drop ${preview ? 'has' : ''}`}>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                {preview ? <img src={preview} alt="Your photo" /> : <span><b>Take or choose a photo</b><span className="small muted">The whole sheet, flat, in daylight</span></span>}
              </label>
              {file && (
                <label className="field small">When was it taken?
                  <input className="search" type="datetime-local" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
                </label>
              )}
              <div className="choice">
                {KINDS.map(([k, label]) => (
                  <label key={k} className={kind === k ? 'on' : ''}><input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />{label}</label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend><span className="step-n">3</span>Who took it</legend>
              <div className="chips">
                {ROLES.map(([r, label]) => <button type="button" key={r} className={`chip ${role === r ? 'on' : ''}`} onClick={() => setRole(r)}>{label}</button>)}
              </div>
              {role === 'agent' && (
                <label className="field small">Your party
                  <select className="select" value={party} onChange={(e) => setParty(e.target.value)}>
                    <option value="">Choose</option>
                    {(summary?.tally ?? []).map((p) => <option key={p.party} value={p.party}>{p.party}</option>)}
                  </select>
                </label>
              )}
              <p className="small muted">No names, phone numbers or locations are stored. Photo metadata is removed.</p>
            </fieldset>

            <fieldset>
              <legend><span className="step-n">4</span>The figures <span className="muted">(optional, gives an instant check)</span></legend>
              <div className="fig-grid">
                {parties.map((p) => (
                  <label key={p} className="field small">{p}
                    <input className="search mono" inputMode="numeric" value={votes[p] ?? ''} onChange={(e) => setVotes((v) => ({ ...v, [p]: e.target.value.replace(/\D/g, '') }))} />
                  </label>
                ))}
                <label className="field small">Total valid
                  <input className="search mono" inputMode="numeric" value={totalValid} onChange={(e) => setTotalValid(e.target.value.replace(/\D/g, ''))} />
                </label>
              </div>
            </fieldset>

            {error && <p className="error">{error}</p>}
            <button className="btn btn-green add-submit" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Add this result'}</button>
          </form>
        )}

        <aside className="add-guide">
          <div className="card">
            <h3>What to photograph</h3>
            <ul>
              <li>The <b>EC60E poster</b> the presiding officer pastes at the unit after announcing the result.</li>
              <li>A <b>party agent's EC8A</b> copy, signed and stamped at the unit.</li>
              <li>The whole sheet in one shot, flat, with the unit codes at the top readable.</li>
            </ul>
          </div>
          <div className="card guide-warn">
            <h3>Stay safe, stay legal</h3>
            <ul>
              <li><b>Never photograph your marked ballot.</b> It breaks the secrecy of the vote and is how vote buying is proved to buyers.</li>
              <li>Wait until the result is announced and posted. Don't argue with officials or agents; just take the photo.</li>
              <li>If there is trouble, leave. No photo is worth your safety.</li>
            </ul>
          </div>
          <Link to="/join" className="card join-link">
            <b>Get your area ready for 16 January 2027</b>
            <span className="small">Share the kit on WhatsApp, print a flyer with a QR code, and cover every unit.</span>
            <span className="link-arrow small">The kit</span>
          </Link>
        </aside>
      </div>

      {conflicts && conflicts.length > 0 && (
        <section className="block">
          <div className="block-head">
            <div className="kicker">Conflicts</div>
            <h2>Units where copies from the field differ from IReV</h2>
            <p className="block-lede">A copy that differs is a reason to look, not proof: either the copy or the upload can be wrong. Several independent copies that agree with each other carry the most weight.</p>
          </div>
          <div className="conflicts">
            {conflicts.map((c) => (
              <Link key={c.puId} to={`/${slug}/pu/${c.puId}`} className="conflict">
                <b>{c.name}</b><span className="mono small muted">{c.puCode} · {c.lga}</span>
                <span className="small">{c.disagree} of {c.copies} {c.copies === 1 ? 'copy differs' : 'copies differ'}{c.agree ? ` · ${c.agree} agree` : ''}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {board.data && board.data.copies.length > 0 && (
        <section className="block">
          <div className="block-head">
            <div className="kicker">Live from the field</div>
            <h2>Latest copies</h2>
          </div>
          <div className="copy-list">{board.data.copies.map((c) => <CopyCard key={c.id} c={c} slug={slug} showUnit />)}</div>
        </section>
      )}
    </div>
  );
}

function Done({ slug, copy, duplicate, onAgain }: { slug: string; copy: CitizenCopy; duplicate: boolean; onAgain: () => void }) {
  const t = copy.typedCheck;
  const share = `I added the result from ${copy.puName} (${copy.puCode}) to Recount, which checks polling-unit results against INEC's IReV. Add the one from your unit: ${location.origin}/add`;
  return (
    <div className={`card add-done st-bg-${copy.standing}`}>
      <div className="eyebrow">{duplicate ? 'Already added' : 'Saved'} · {watTime(copy.uploadedAt)}</div>
      <h2>{duplicate ? 'This exact photo is already on Recount' : STANDING_LABEL[copy.standing]}</h2>
      {copy.standing === 'no_irev' && <p>IReV has no sheet for {copy.puName} yet, so your copy is now the public record for this unit. When INEC uploads, Recount will compare them.</p>}
      {copy.standing === 'agrees' && <p>The figures you typed match the sheet INEC uploaded for {copy.puName}.</p>}
      {copy.standing === 'disagrees' && t && (
        <>
          <p>The figures you typed differ from the sheet INEC uploaded for {copy.puName}. Double-check your numbers against the photo; if they are right, this unit needs a closer look.</p>
          <table className="table"><thead><tr><th>Entry</th><th className="num">Your copy</th><th className="num">IReV</th></tr></thead>
            <tbody>{t.diffs.map((d) => <tr key={d.field} className="bad"><td>{d.field}</td><td className="num mono">{fmt(d.copy)}</td><td className="num mono">{fmt(d.irev)}</td></tr>)}</tbody></table>
        </>
      )}
      {copy.standing === 'pending' && <p>Muse Spark will read your photo and compare it with INEC's sheet for {copy.puName}. The result appears on the unit's page.</p>}
      <div className="verdict-actions">
        <Link to={`/${slug}/pu/${copy.puId}`} className="btn btn-green">See the unit's page</Link>
        <a className="btn btn-light" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
        <button className="btn btn-ghost" onClick={onAgain}>Add another</button>
      </div>
    </div>
  );
}
