import { useRef, useState, type DragEvent } from 'react';
import { fmt, useJson, type Summary } from '../api.ts';
import { Link } from '../App.tsx';
import { CollationCheck } from '../components/CollationCheck.tsx';

type Row = { code: string | null; name: string | null; status: 'matches' | 'differs' | 'no_irev' | 'unmatched'; diffs: { party: string; collation: number; irev: number }[]; altered: boolean; url: string | null };
type Result = {
  verdict: 'matches' | 'differs' | 'not_collation' | 'unsupported' | 'no_match'; summary: string;
  area?: string; level?: string; formType?: string; rows?: Row[];
  arithmetic?: { party: string; total: number | null; sumOfRows: number }[];
  totals?: { party: string; collation: number | null; irev: number }[];
  missing?: { code: string; name: string; url: string | null }[];
  counts?: { rows: number; matches: number; differs: number; noIrev: number; unmatched: number; expected: number };
  sheet?: { signed: boolean; stamped: boolean; alterations: { entry: string; what: string }[]; imageQuality: string };
  caveat?: string;
};
type Photo = { id: string; status: 'pending' | 'done' | 'failed'; demo: boolean; error: string | null; imageUrl: string; result: Result | null };

const DEMO = '/demo/ec8b-ejigbo-ii-demo.jpg';
const STATUS = { matches: 'Matches IReV', differs: 'Differs from IReV', no_irev: 'No IReV sheet', unmatched: 'Not found on IReV' };

// Photograph a ward (EC8B) or LGA (EC8C) collation sheet; Muse Spark copies every row and
// Recount checks each one against the polling-unit sheets on IReV.
export function Collation({ slug }: { slug: string }) {
  const summary = useJson<Summary>(`/api/${slug}/summary`);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: Blob) {
    setBusy(true); setErr(null); setPhoto(null);
    const body = new FormData();
    body.set('image', file, 'collation.jpg');
    try {
      const res = await fetch(`/api/${slug}/collation/photo`, { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      await poll(json.id);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  async function poll(id: string) {
    const res = await fetch(`/api/${slug}/collation/photo/${id}`);
    const json = (await res.json()) as Photo;
    setPhoto(json);
    if (json.status === 'pending') window.setTimeout(() => poll(id), 4000);
    else setBusy(false);
  }
  const tryDemo = async () => upload(await (await fetch(DEMO)).blob());
  const onDrop = (e: DragEvent) => { e.preventDefault(); setHover(false); const f = e.dataTransfer.files[0]; if (f) upload(f); };

  return (
    <div className="page">
      <section className="check-hero">
        <div>
          <div className="eyebrow">Collation check · {summary.data?.title ?? 'Osun governorship 2026'}</div>
          <h1 className="h-display">Did the figures change at collation?</h1>
          <p className="lede">
            IReV shows each polling unit's sheet, but the ward (EC8B) and LGA (EC8C) collation sheets stay on paper at the
            collation centre. Photograph one there, and Recount checks every row against the unit sheets on IReV, adds up
            the columns, and lists any unit the sheet leaves out.
          </p>
        </div>
        <ol className="check-steps">
          <li><b>Read</b><span>Muse Spark 1.3 copies every row of the collation sheet, as written.</span></li>
          <li><b>Match</b><span>Each row is matched to its polling unit (or ward) on IReV.</span></li>
          <li><b>Check</b><span>Rows against IReV, the totals against the rows, and units that are missing.</span></li>
        </ol>
      </section>

      {!photo?.result && (
        <div
          className={`drop ${hover ? 'hover' : ''} ${busy ? 'busy' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setHover(true); }}
          onDragLeave={() => setHover(false)}
          onDrop={onDrop}
          onClick={() => !busy && input.current?.click()}
        >
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {busy ? (
            <div className="drop-busy">
              {photo && <img src={photo.imageUrl} alt="" />}
              <div>
                <div className="drop-title">Reading the collation sheet…</div>
                <p className="small muted">Muse Spark runs on Recount's reader in Lagos, where Meta's API is available. A sheet takes 15 to 60 seconds once the reader picks it up.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="drop-icon" aria-hidden>↑</div>
              <div className="drop-title">Drop a photo of a ward or LGA collation sheet</div>
              <div className="muted small">or click to choose one · EC8B or EC8C · one clear photo of the whole sheet</div>
            </>
          )}
        </div>
      )}
      {!photo?.result && !busy && (
        <p className="small collation-demo">
          No sheet to hand? <button className="inline-link btn-link" onClick={tryDemo}>Try the demo sheet</button>: a replica of the Ejigbo II ward sheet (Ila LGA), typed from its nine IReV sheets, with two figures changed on purpose.
        </p>
      )}
      {err && <p className="error">{err}</p>}
      {photo?.status === 'failed' && <p className="error">The reader could not read that photo ({photo.error}). Try one clear photo of the whole sheet.</p>}
      {photo?.result && <Outcome photo={photo} onReset={() => setPhoto(null)} />}

      <section className="block">
        <div className="block-head">
          <div className="kicker">No photo?</div>
          <h2>Type the figures from a collation sheet</h2>
          <p className="block-lede">Enter a ward or LGA's totals, as announced or written on the sheet, and compare them with the sum of its polling-unit sheets.</p>
        </div>
        <CollationCheck slug={slug} summary={summary.data ?? null} />
      </section>
    </div>
  );
}

function Outcome({ photo, onReset }: { photo: Photo; onReset: () => void }) {
  const r = photo.result!;
  const ok = r.verdict === 'matches';
  const checked = r.verdict === 'matches' || r.verdict === 'differs';
  return (
    <section className={`collation-outcome card verdict-${ok ? 'ok' : checked ? 'bad' : 'warn'}`}>
      <div className="collation-outcome-head">
        <div>
          <div className="kicker">{photo.demo ? 'Demo sheet · ' : ''}{r.formType ?? 'Collation sheet'}{r.area ? ` · ${r.area}` : ''}</div>
          <h2>{ok ? 'Matches the polling-unit sheets' : checked ? 'Does not match the polling-unit sheets' : 'Could not check this sheet'}</h2>
          <p>{r.summary}</p>
        </div>
        <button className="btn btn-light" onClick={onReset}>Check another sheet</button>
      </div>
      <div className="collation-outcome-grid">
        <a href={photo.imageUrl} target="_blank" rel="noreferrer" className="collation-photo"><img src={photo.imageUrl} alt="The collation sheet photo" /></a>
        <div className="collation-outcome-body">
          {r.counts && <p className="small muted">{r.counts.rows} rows read · {r.counts.matches} match · {r.counts.differs} {r.counts.differs === 1 ? "differs" : "differ"} · {r.counts.expected} expected from IReV{r.sheet ? ` · ${r.sheet.signed ? 'signed' : 'not signed'}, ${r.sheet.stamped ? 'stamped' : 'no stamp'}` : ''}</p>}
          {r.rows && (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Unit</th><th>Row against IReV</th></tr></thead>
                <tbody>
                  {r.rows.map((row, i) => (
                    <tr key={`${row.code}-${i}`} className={row.status === 'differs' ? 'bad' : ''}>
                      <td><span className="mono small muted">{row.code}</span> {row.url ? <a className="inline-link" href={row.url}>{row.name}</a> : row.name}</td>
                      <td className="small">{row.status === 'differs' ? row.diffs.map((d) => `${d.party}: ${fmt(d.collation)} here, ${fmt(d.irev)} on IReV`).join(' · ') : STATUS[row.status]}{row.altered ? ' · overwritten on the sheet' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!!r.arithmetic?.length && (
            <div className="collation-note"><b>The total does not add up.</b> {r.arithmetic.map((a) => `${a.party}: ${fmt(a.total)} written, rows add to ${fmt(a.sumOfRows)}`).join(' · ')}</div>
          )}
          {!!r.missing?.length && (
            <div className="collation-note"><b>Not on this sheet:</b> {r.missing.map((m) => `${m.name} (${m.code})`).join(', ')}</div>
          )}
          {r.totals && (
            <table className="table">
              <thead><tr><th>Party</th><th className="num">On this sheet</th><th className="num">Sum of IReV sheets</th></tr></thead>
              <tbody>
                {r.totals.filter((t) => (t.collation ?? 0) > 0 || t.irev > 0).slice(0, 6).map((t) => (
                  <tr key={t.party} className={t.collation !== null && t.collation !== t.irev ? 'bad' : ''}>
                    <td>{t.party}</td><td className="num mono">{fmt(t.collation)}</td><td className="num mono">{fmt(t.irev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {r.caveat && <p className="small muted">{r.caveat}</p>}
          <Link to="/guide" className="link-arrow small">Where collation fits in the count</Link>
        </div>
      </div>
    </section>
  );
}
