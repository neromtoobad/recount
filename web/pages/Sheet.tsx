import { useState } from 'react';
import { UNOFFICIAL, fmt, sheetSrc, useJson, type Analysis } from '../api.ts';
import { Link } from '../App.tsx';
import { FlagList } from '../components/Flags.tsx';
import { SheetImage } from '../components/SheetImage.tsx';
import { sheetMarks } from '../marks.ts';
import { CopyCard } from '../components/CopyList.tsx';
import type { CitizenCopy } from '../api.ts';

type Read = NonNullable<Analysis['read']>;

const SUMMARY_LABELS: [keyof Read['summary'], string][] = [
  ['registered', '#1 Registered voters'],
  ['accredited', '#2 Accredited voters'],
  ['ballotsIssued', '#3 Ballot papers issued'],
  ['unused', '#4 Unused ballot papers'],
  ['spoiled', '#5 Spoiled ballot papers'],
  ['rejected', '#6 Rejected ballots'],
  ['totalValid', '#7 Total valid votes'],
  ['used', '#8 Used ballot papers'],
];

const WAT = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WAT';

export function Sheet({ slug, id }: { slug: string; id: string }) {
  const { data: a, error } = useJson<Analysis & { pending?: boolean }>(`/api/${slug}/pu/${id}`);
  const [layers, setLayers] = useState({ stamp: true, correction: true });
  const [copied, setCopied] = useState(false);
  const copies = useJson<{ copies: CitizenCopy[] }>(`/api/${slug}/copies?pu=${id}`).data?.copies ?? [];
  if (error) return <div className="page"><p className="muted">Polling unit not found.</p></div>;
  if (!a) return <div className="page"><div className="skeleton" style={{ height: 640 }} /></div>;

  const { pu, read } = a;
  const { marks, notes } = sheetMarks(a);
  const shown = marks.filter((m) => layers[m.kind as 'stamp' | 'correction'] ?? true);
  const serious = a.flags.some((f) => f.severity === 'high');
  const needsLook = a.flags.some((f) => f.severity !== 'low');
  const status = !pu.sheetUrl ? 'No sheet on IReV' : serious ? 'Serious flag' : needsLook ? 'Needs a second look' : 'Passed every check';
  const tone = !pu.sheetUrl ? 'low' : serious ? 'high' : needsLook ? 'medium' : 'ok';
  const url = typeof location !== 'undefined' ? location.href : '';
  const share = `${pu.name.trim()} (${pu.puCode}), ${pu.lga}: ${status.toLowerCase()} on Recount. See the INEC sheet and the checks: ${url}`;

  return (
    <div className="page sheet-page">
      <div className="print-only print-head">
        <b>Recount evidence record</b> · {UNOFFICIAL} · Printed {new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })} WAT · {url}
      </div>
      <div className="crumbs mono small">
        <Link to={`/${slug}/sheets`}>All sheets</Link> / <Link to={`/${slug}/sheets?lga=${encodeURIComponent(pu.lga)}`}>{pu.lga}</Link> / {pu.ward}
      </div>
      <div className="sheet-head">
        <div>
          <span className={`status-pill pill-${tone}`}><span className={`dot dot-${tone}`} />{status}</span>
          <h1 className="h-page">{pu.name.trim()}</h1>
          <div className="mono muted">PU {pu.puCode} · {pu.ward} ward · {pu.lga} LGA</div>
        </div>
        <div className="sheet-actions no-print">
          {pu.sheetUrl && <a className="btn btn-light" href={pu.sheetUrl} target="_blank" rel="noreferrer">Original on IReV ↗</a>}
          <Link to={`/${slug}/pack/pu/${pu.id}`} className="btn btn-green">Evidence pack</Link>
          <a className="btn btn-light" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
          <button className="btn btn-ghost" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Link copied' : 'Copy link'}</button>
        </div>
      </div>

      <div className="sheet-layout">
        <div className="sheet-col">
          {pu.sheetUrl ? (
            <>
              <SheetImage src={sheetSrc(pu.sheetUrl)} marks={shown} alt={`Result sheet for ${pu.name}`} />
              {read && notes.length > 0 && (
                <div className="marks-legend">
                  <div className="layers no-print">
                    {notes.some((n) => n.kind === 'stamp') && (
                      <button className={`layer layer-stamp ${layers.stamp ? 'on' : ''}`} onClick={() => setLayers((l) => ({ ...l, stamp: !l.stamp }))}>
                        <span className="swatch" />Stamp · SAM 3.1
                      </button>
                    )}
                    {notes.some((n) => n.kind === 'correction') && (
                      <button className={`layer layer-correction ${layers.correction ? 'on' : ''}`} onClick={() => setLayers((l) => ({ ...l, correction: !l.correction }))}>
                        <span className="swatch" />Edits · Muse Spark
                      </button>
                    )}
                  </div>
                  <ol className="xray-notes compact">
                    {notes.map((n) => (
                      <li key={n.n} className={`note note-${n.kind}`}>
                        <span className="note-n">{n.n}</span>
                        <span><span className="note-label">{n.label}</span><span className="note-by mono">{n.by}</span></span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {read && notes.length === 0 && <p className="small muted">No stamp was located and no edits were marked on this sheet.</p>}
            </>
          ) : (
            <div className="sheet-fail big">IReV has no result sheet for this polling unit.</div>
          )}
          {pu.oldSheets.length > 0 && (
            <div className="card replaced">
              <h3>Earlier uploads</h3>
              <p className="muted small">INEC replaced this polling unit's sheet. The earlier versions are still public:</p>
              {pu.oldSheets.map((o, i) => (
                <a key={o.url} href={o.url} target="_blank" rel="noreferrer" className="link small">Upload {i + 1} · {WAT(o.uploadedAt)} ↗</a>
              ))}
            </div>
          )}
        </div>

        <div className="data-col">
          {a.pending && <div className="card"><p className="muted">This sheet hasn't been read yet.</p></div>}
          {a.error && <div className="card"><p className="muted">Reading failed: {a.error}</p></div>}
          {!a.pending && (
            <section className="card">
              <h2>{a.flags.length ? 'Why this sheet was flagged' : 'Checks'}</h2>
              <FlagList flags={a.flags} />
            </section>
          )}

          <section className="card no-print">
            <div className="card-head">
              <h2>Copies from the unit</h2>
              <Link to={`/add?pu=${id}`} className="btn btn-green small">Add your copy</Link>
            </div>
            {copies.length === 0
              ? <p className="small muted">No one has added a photo taken at this unit yet. Voters, party agents and observers can add the result poster (EC60E) or an agent's EC8A copy; Recount compares it with this IReV sheet.</p>
              : <div className="copy-list compact">{copies.map((c) => <CopyCard key={c.id} c={c} slug={slug} />)}</div>}
          </section>

          {read && <Arithmetic read={read} />}

          {read && (
            <section className="card">
              <div className="card-head">
                <h2>Votes by party</h2>
                <span className="mono small muted">as written on the sheet</span>
              </div>
              <table className="table">
                <thead><tr><th>Party</th><th className="num">Figures</th><th>In words</th></tr></thead>
                <tbody>
                  {read.parties.map((p) => {
                    const mismatch = p.figures !== null && p.wordsValue !== null && p.figures !== p.wordsValue;
                    return (
                      <tr key={p.party} className={p.altered || mismatch ? 'bad' : ''}>
                        <td>{p.party}</td>
                        <td className="num mono">{fmt(p.figures)}{p.altered && <span className="pill">edited</span>}{mismatch && <span className="pill">≠ words</span>}</td>
                        <td className="words">{p.words ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {read && (
            <section className="card">
              <h2>Summary box</h2>
              <table className="table">
                <tbody>
                  {SUMMARY_LABELS.map(([k, label]) => (
                    <tr key={k} className={read.summary[k].altered ? 'bad' : ''}>
                      <td>{label}</td>
                      <td className="num mono">{fmt(read.summary[k].value)}{read.summary[k].altered && <span className="pill">edited</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="card">
            <h2>Record</h2>
            <dl className="meta-list small">
              <div><dt>IReV upload</dt><dd>{pu.uploadedAt ? WAT(pu.uploadedAt) : '—'}</dd></div>
              {read && <div><dt>Serial no.</dt><dd className="mono">{read.serialNumber ?? '—'}</dd></div>}
              {read && <div><dt>Codes on sheet</dt><dd className="mono">{[read.header.stateCode, read.header.lgaCode, read.header.wardCode, read.header.puCode].map((c) => c ?? '?').join('/')}</dd></div>}
              {read && <div><dt>Date written</dt><dd>{read.dateWritten ?? '—'}</dd></div>}
              {read && <div><dt>Photo quality</dt><dd>{read.imageQuality}</dd></div>}
              <div><dt>Read by</dt><dd>{a.model?.replace('-contributor', '') ?? '—'}{a.analyzedAt ? ` · ${WAT(a.analyzedAt)}` : ''}</dd></div>
            </dl>
            {read?.notes && <p className="note-text small">{read.notes}</p>}
            <p className="small muted">{UNOFFICIAL} Figures are transcribed as written, including mistakes.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

// The three sums every EC8A should satisfy, worked out from what is written on it.
function Arithmetic({ read }: { read: Read }) {
  const v = (k: keyof Read['summary']) => read.summary[k].value;
  const sum = (...ks: (keyof Read['summary'])[]) => (ks.some((k) => v(k) === null) ? null : ks.reduce((t, k) => t + (v(k) ?? 0), 0));
  const partySum = read.parties.reduce((t, p) => t + (p.figures ?? 0), 0);
  const cast = sum('totalValid', 'rejected');
  const used = sum('spoiled', 'rejected', 'totalValid');
  const checks = [
    { label: 'Party votes add up to #7 total valid', left: partySum, right: v('totalValid'), ok: v('totalValid') === null ? null : partySum === v('totalValid'), op: '=' },
    { label: 'Valid + rejected is within #2 accredited', left: cast, right: v('accredited'), ok: cast === null || v('accredited') === null ? null : cast <= v('accredited')!, op: '≤' },
    { label: '#5 + #6 + #7 equals #8 used ballots', left: used, right: v('used'), ok: used === null || v('used') === null ? null : used === v('used'), op: '=' },
  ];
  return (
    <section className="card">
      <h2>The arithmetic</h2>
      <ul className="sums">
        {checks.map((c) => (
          <li key={c.label} className={c.ok === null ? 'sum-na' : c.ok ? 'sum-ok' : 'sum-bad'}>
            <span className="sum-icon" aria-hidden>{c.ok === null ? '–' : c.ok ? '✓' : '✕'}</span>
            <span className="sum-label">{c.label}</span>
            <span className="sum-math mono">{fmt(c.left)} {c.ok === false ? (c.op === '=' ? '≠' : '>') : c.op} {fmt(c.right)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
