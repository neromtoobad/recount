import { useEffect, useRef, useState, type DragEvent } from 'react';
import { fmt, sheetSrc, useJson, type CheckResult, type Config } from '../api.ts';
import { Link } from '../App.tsx';
import { SheetImage } from '../components/SheetImage.tsx';

const VERDICTS = {
  matches: { title: 'Matches the official sheet', tone: 'ok', stamp: 'MATCHES' },
  altered: { title: 'Altered copy', tone: 'bad', stamp: 'ALTERED' },
  different_sheet: { title: 'Not the sheet INEC published', tone: 'bad', stamp: 'DIFFERENT SHEET' },
  unclear: { title: 'Could not confirm', tone: 'warn', stamp: 'UNCLEAR' },
} as const;

type Demo = Extract<CheckResult, { status: 'compared' }> & { seconds: number };
type Queued = { id: string; status: 'pending' | 'done' | 'failed'; slug: string; error: string | null; readerOnline: boolean; imageUrl: string; result: CheckResult | null };

export function Check({ slug }: { slug: string }) {
  const config = useJson<Config>('/api/config');
  const demo = useJson<Demo>(`/api/${slug}/demo-check`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const [queued, setQueued] = useState<Queued | null>(null);
  const [usedSlug, setUsedSlug] = useState(slug);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const live = config.data?.liveCheck ?? false;

  // On the hosted site a check is queued for the reader in Lagos; the id stays in the
  // address so the page can be reopened while it waits.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id && /^[a-f0-9]{16}$/.test(id)) { setBusy(true); poll(id); }
    return () => window.clearTimeout(timer.current);
  }, []);

  async function poll(id: string) {
    try {
      const res = await fetch(`/api/check/${id}`);
      if (!res.ok) throw new Error('That check could not be found');
      const q = (await res.json()) as Queued;
      setQueued(q);
      setPreview(q.imageUrl);
      if (q.status === 'pending') { timer.current = window.setTimeout(() => poll(id), 4000); return; }
      if (q.status === 'failed') setErr(`The reader could not check that photo (${q.error}). Try one clear photo of the whole sheet.`);
      else { setResult(q.result); setUsedSlug(q.slug); }
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  async function submit(file: File) {
    window.clearTimeout(timer.current);
    setBusy(true); setErr(null); setResult(null); setQueued(null); setUsedSlug(slug);
    setPreview(URL.createObjectURL(file));
    const body = new FormData();
    body.set('image', file);
    body.set('election', slug);
    try {
      const res = await fetch('/api/check', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Check failed');
      if (json.id) {
        window.history.replaceState(null, '', `/check?election=${slug}&id=${json.id}`);
        return poll(json.id);
      }
      setResult(json);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  function reset() {
    window.clearTimeout(timer.current);
    setResult(null); setPreview(null); setQueued(null); setErr(null);
    window.history.replaceState(null, '', `/check?election=${slug}`);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setHover(false);
    const f = e.dataTransfer.files[0];
    if (f) submit(f);
  };

  return (
    <div className="page">
      <section className="check-hero">
        <div>
          <div className="eyebrow">Fact-check · Osun governorship 2026</div>
          <h1 className="h-display">Is that result sheet real?</h1>
          <p className="lede">
            After every election, photos of "result sheets" spread on WhatsApp and X faster than anyone can check them.
            Recount reads the photo, finds which polling unit it claims to be, pulls INEC's original from IReV, and
            circles every figure that differs.
          </p>
        </div>
        <ol className="check-steps">
          <li><b>Read</b><span>Muse Spark 1.3 transcribes the photo: codes, every party's votes, the summary box.</span></li>
          <li><b>Match</b><span>The codes and names find the polling unit among {slug === 'osun' ? '3,763' : 'all'} on IReV.</span></li>
          <li><b>Compare</b><span>Spark examines both images like a document examiner and boxes each change.</span></li>
        </ol>
      </section>

      {!result && (
        <div
          className={`drop ${hover ? 'hover' : ''} ${busy ? 'busy' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setHover(true); }}
          onDragLeave={() => setHover(false)}
          onDrop={onDrop}
          onClick={() => !busy && input.current?.click()}
        >
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && submit(e.target.files[0])} />
          {busy ? (
            <div className="drop-busy">
              {preview && <img src={preview} alt="" />}
              <div>
                <div className="drop-title">Checking… {live ? 'about 20 seconds' : 'about a minute'}</div>
                <ol className="steps small">
                  <li>Reading the sheet with Muse Spark</li>
                  <li>Finding the polling unit on IReV</li>
                  <li>Comparing it with the original</li>
                </ol>
                {queued && !queued.readerOnline && (
                  <p className="small muted">Recount's reader is offline right now. Your sheet is queued, and this page updates when it is read; you can keep this link and come back.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="drop-icon" aria-hidden>↑</div>
              <div className="drop-title">Drop a result sheet photo here</div>
              <div className="muted small">or click to choose one · one clear photo of the whole sheet · Osun 2026, Ekiti 2026 or Anambra 2025</div>
            </>
          )}
        </div>
      )}
      {!result && <p className="small collation-demo">Got a ward (EC8B) or LGA (EC8C) collation sheet instead? <Link to={`/collation?election=${slug}`} className="inline-link">Check it row by row</Link>.</p>}
      {err && <p className="error">{err}</p>}
      {result && <CheckOutcome result={result} slug={usedSlug} onReset={reset} />}

      {!live && config.data && !result && !busy && (
        <p className="small muted">Checks run on Recount's reader in Lagos, where Meta's models are available, so a sheet takes about a minute.</p>
      )}
      {!result && !busy && demo.data && (
        <section className="example">
          <div className="example-head"><div className="kicker">Example</div><p className="small muted">A real check the reader ran on a test copy we altered ourselves (APC 233 → 283).</p></div>
          <CheckOutcome result={demo.data} slug={slug} demoSeconds={demo.data.seconds} />
        </section>
      )}
    </div>
  );
}

function CheckOutcome({ result, slug, onReset, demoSeconds }: { result: CheckResult; slug: string; onReset?: () => void; demoSeconds?: number }) {
  if (result.status !== 'compared') {
    const msg = {
      not_a_sheet: "This doesn't look like an INEC result sheet.",
      no_match: "We couldn't match this sheet to a polling unit. The codes or names may be cropped out.",
      no_original: 'IReV has no official sheet for this polling unit to compare against.',
    }[result.status];
    return (
      <div className="verdict verdict-warn">
        <h2>{msg}</h2>
        {result.status === 'not_a_sheet' && <p className="small">If it's a ward (EC8B) or LGA (EC8C) collation sheet, <Link to={`/collation?election=${slug}`} className="inline-link">check it row by row</Link>.</p>}
        {onReset && <button className="btn btn-light" onClick={onReset}>Try another sheet</button>}
      </div>
    );
  }
  const { pu, visual, diffs } = result;
  const v = VERDICTS[visual.verdict];
  const marks = visual.differences.map((d, i) => ({ ...d.box, kind: 'diff' as const, n: i + 1 }));
  const extra = diffs.filter((d) => !visual.differences.some((x) => x.field.toUpperCase().includes(d.field.toUpperCase())));
  return (
    <div className="outcome">
      <div className={`verdict verdict-${v.tone}`}>
        <div className="verdict-stamp" aria-hidden>{v.stamp}</div>
        <div className="verdict-body">
          <div className="eyebrow">{pu.name.trim()} · PU {pu.puCode} · {pu.ward}, {pu.lga}</div>
          <h2>{v.title}</h2>
          <p>{visual.summary}</p>
          <div className="verdict-actions">
            <Link to={`/${slug}/pu/${pu.id}`} className="btn btn-dark">See INEC's sheet and its checks</Link>
            {onReset && <button className="btn btn-light" onClick={onReset}>Check another</button>}
            {demoSeconds && <span className="mono small muted">Checked in {demoSeconds} s</span>}
          </div>
        </div>
      </div>

      <div className="compare">
        <figure>
          <figcaption><span className="cap-tag cap-circ">Circulating copy</span>{marks.length > 0 && <span className="small muted">{marks.length} change{marks.length === 1 ? '' : 's'} circled</span>}</figcaption>
          <SheetImage src={result.uploadUrl} marks={marks} alt="Circulating sheet" reveal />
        </figure>
        <figure>
          <figcaption><span className="cap-tag cap-irev">INEC original on IReV</span><a href={pu.sheetUrl!} target="_blank" rel="noreferrer" className="small link">Open on IReV ↗</a></figcaption>
          <SheetImage src={sheetSrc(pu.sheetUrl!)} alt="Official IReV sheet" />
        </figure>
      </div>

      {(visual.differences.length > 0 || extra.length > 0) && (
        <section className="card">
          <h2>What's different</h2>
          <table className="table">
            <thead><tr><th></th><th>Entry</th><th className="num">Circulating</th><th className="num">INEC original</th><th>How it was changed</th></tr></thead>
            <tbody>
              {visual.differences.map((d, i) => (
                <tr key={`v${i}`} className="bad"><td><span className="note-n diff-n">{i + 1}</span></td><td>{d.field}</td><td className="num mono">{d.circulating}</td><td className="num mono">{d.original}</td><td className="small">{d.how}</td></tr>
              ))}
              {extra.map((d) => (
                <tr key={d.field} className="bad"><td /><td>{d.field}</td><td className="num mono">{fmt(d.upload)}</td><td className="num mono">{fmt(d.original)}</td><td className="small muted">Read differently from the two photos</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
