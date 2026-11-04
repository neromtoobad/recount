import { fmt, sheetSrc, titleCase, useJson, watTime } from '../api.ts';
import { Link, Logo } from '../App.tsx';

type PackUnit = {
  puId: string; puCode: string; name: string; ward: string; lga: string; recountUrl: string;
  irev: { url: string; uploadedAt: string | null; file: { sha256: string; bytes: number; at: string } | null; earlierVersions: { url: string; uploadedAt: string; file: { sha256: string } | null }[] } | null;
  reading: { model: string; readAt: string; serialNumber: string | null; votes: Record<string, number>; summary: Record<string, number | null>; alteredEntries: string[]; stamped: boolean; presidingOfficerSigned: boolean; imageQuality: string } | null;
  flags: { severity: string; title: string; detail: string }[];
  reports: { kind: string; label: string; reporters: number; corroborated: boolean; first: string; last: string }[];
  copies: { id: string; role: string; party: string | null; kind: string; takenAt: string | null; uploadedAt: string; sha256: string; standing: string; aiSummary: string | null; diffs: { field: string; copy: number | null; irev: number | null }[]; imageUrl: string | null }[];
};
type PackData = {
  generatedAt: string; election: { slug: string; title: string };
  scope: { type: string; puCode?: string; name?: string; ward?: string; lga?: string };
  counts: { units: number; withSheet: number; read: number; flagged: number; serious: number; replaced: number; copies: number; copiesDisagree: number };
  totalsFromSheets: Record<string, number>; units: PackUnit[]; method: string[]; limits: string; manifestSha256: string;
};

const SUMMARY_LABEL: Record<string, string> = {
  registered: 'Registered voters', accredited: 'Accredited voters', ballotsIssued: 'Ballots issued', unused: 'Unused ballots',
  spoiled: 'Spoiled ballots', rejected: 'Rejected ballots', totalValid: 'Total valid votes', used: 'Total used ballots',
};

// A printable evidence pack: a cover, a register of units, and each unit's chain of custody.
export function Pack({ slug, query }: { slug: string; query: string }) {
  const url = `/api/${slug}/pack?${query}`;
  const { data: p, error } = useJson<PackData>(url);
  if (error) return <div className="page"><p className="error">Could not build this pack ({error}).</p></div>;
  if (!p) return <div className="page"><p className="muted">Fetching the IReV files and fingerprinting them…</p><div className="skeleton" style={{ height: 420 }} /></div>;
  const single = p.scope.type === 'polling unit';
  const scopeName = single ? `${p.scope.name} (${p.scope.puCode})` : p.scope.type === 'ward' ? `${titleCase(p.scope.ward!)} ward, ${titleCase(p.scope.lga!)}` : `${titleCase(p.scope.lga!)} LGA`;
  const c = p.counts;

  return (
    <div className="page pack-page">
      <div className="pack-tools no-print">
        <Link to={single ? `/${slug}/pu/${p.units[0].puId}` : `/${slug}/sheets`} className="crumb-link small">← Back</Link>
        <div className="verdict-actions">
          <button className="btn btn-green" onClick={() => window.print()}>Print or save as PDF</button>
          <a className="btn btn-light" href={`${url}&download=1`}>Download the manifest (JSON)</a>
        </div>
      </div>

      <section className="pack-cover">
        <div className="pack-brand"><Logo /><b>Recount</b><span className="mono small muted">Evidence pack</span></div>
        <h1 className="h-display">{scopeName}</h1>
        <p className="lede">{p.election.title}</p>
        <dl className="pack-meta mono small">
          <div><dt>Generated</dt><dd>{watTime(p.generatedAt)}</dd></div>
          <div><dt>Manifest SHA-256</dt><dd className="hash">{p.manifestSha256}</dd></div>
          <div><dt>Units</dt><dd>{fmt(c.units)} · {fmt(c.withSheet)} with a sheet on IReV · {fmt(c.read)} read</dd></div>
          <div><dt>Flags</dt><dd>{fmt(c.serious)} serious · {fmt(c.flagged)} with any flag · {fmt(c.replaced)} sheets replaced after upload</dd></div>
          <div><dt>Citizen copies</dt><dd>{fmt(c.copies)} · {fmt(c.copiesDisagree)} differ from IReV</dd></div>
        </dl>
        <p className="small muted pack-limits">{p.limits}</p>
      </section>

      {!single && (
        <section className="pack-section">
          <h2>Register of polling units</h2>
          <div className="table-scroll">
            <table className="api-table pack-register">
              <thead><tr><th>Code</th><th>Polling unit</th><th>On IReV</th><th>Flags</th><th>Copies</th>{Object.keys(p.totalsFromSheets).slice(0, 4).map((k) => <th key={k} className="num">{k}</th>)}</tr></thead>
              <tbody>
                {p.units.map((u) => (
                  <tr key={u.puId} className={u.flags.some((f) => f.severity === 'high') ? 'row-serious' : ''}>
                    <td className="mono">{u.puCode}</td>
                    <td>{u.name}</td>
                    <td className="mono small">{u.irev?.uploadedAt ? watTime(u.irev.uploadedAt) : 'No sheet'}{u.irev?.earlierVersions.length ? ' · replaced' : ''}</td>
                    <td className="small">{u.flags.filter((f) => f.severity !== 'low').map((f) => f.title).join('; ') || '—'}</td>
                    <td className="small">{u.copies.length ? `${u.copies.length} (${u.copies.filter((x) => x.standing === 'disagrees').length} differ)` : '—'}</td>
                    {Object.keys(p.totalsFromSheets).slice(0, 4).map((k) => <td key={k} className="num mono">{fmt(u.reading?.votes[k] ?? null)}</td>)}
                  </tr>
                ))}
                <tr className="row-total"><td colSpan={5}>Total from the sheets</td>{Object.entries(p.totalsFromSheets).slice(0, 4).map(([k, n]) => <td key={k} className="num mono">{fmt(n)}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {p.units.filter((u) => single || u.flags.some((f) => f.severity !== 'low') || u.copies.length || u.reports.length || u.irev?.earlierVersions.length).map((u) => (
        <section key={u.puId} className="pack-section pack-unit">
          <h2>{u.name} <span className="mono small muted">{u.puCode} · {titleCase(u.ward)}, {titleCase(u.lga)}</span></h2>
          <div className="pack-unit-grid">
            {u.irev && <img className="pack-sheet" src={sheetSrc(u.irev.url)} alt={`IReV result sheet for ${u.name}`} />}
            <div className="pack-unit-body">
              <h3>Chain of custody</h3>
              <table className="api-table">
                <tbody>
                  <tr><th>IReV file</th><td className="mono small break">{u.irev?.url ?? 'No sheet on IReV'}</td></tr>
                  {u.irev && <tr><th>Uploaded to IReV</th><td>{u.irev.uploadedAt ? watTime(u.irev.uploadedAt) : 'Not recorded'}</td></tr>}
                  {u.irev?.file && <tr><th>SHA-256 as published</th><td className="mono small hash">{u.irev.file.sha256} · {fmt(u.irev.file.bytes)} bytes · fetched {watTime(u.irev.file.at)}</td></tr>}
                  {u.irev?.earlierVersions.map((v, i) => <tr key={v.url}><th>Earlier upload {i + 1}</th><td className="small">{watTime(v.uploadedAt)} · <span className="mono break">{v.file?.sha256 ?? v.url}</span></td></tr>)}
                  {u.reading && <tr><th>Read by</th><td className="small">{u.reading.model}, {watTime(u.reading.readAt)}{u.reading.serialNumber ? ` · serial ${u.reading.serialNumber}` : ''}</td></tr>}
                </tbody>
              </table>
              {u.reading && (
                <>
                  <h3>Figures as written on the sheet</h3>
                  <table className="api-table">
                    <tbody>
                      {Object.entries(u.reading.summary).map(([k, v]) => <tr key={k}><th>{SUMMARY_LABEL[k] ?? k}</th><td className="num mono">{fmt(v)}</td></tr>)}
                      {Object.entries(u.reading.votes).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k, n]) => <tr key={k}><th>{k}</th><td className="num mono">{fmt(n)}</td></tr>)}
                    </tbody>
                  </table>
                  {u.reading.alteredEntries.length > 0 && <p className="small"><b>Overwritten entries:</b> {u.reading.alteredEntries.join('; ')}</p>}
                </>
              )}
              {u.flags.length > 0 && (
                <>
                  <h3>Checks that need a look</h3>
                  <ul className="pack-flags">{u.flags.map((f) => <li key={f.title} className={`sev-${f.severity}`}><b>{f.title}.</b> {f.detail}</li>)}</ul>
                </>
              )}
              {u.reports.length > 0 && (
                <>
                  <h3>Reported at the unit on election day</h3>
                  <ul className="pack-flags">{u.reports.map((r) => <li key={r.kind}><b>{r.label}.</b> {r.reporters} {r.reporters === 1 ? 'person' : 'people'}{r.corroborated ? ', confirmed' : ''}, {watTime(r.first)}{r.last !== r.first ? ` to ${watTime(r.last)}` : ''}.</li>)}</ul>
                </>
              )}
            </div>
          </div>
          {u.copies.length > 0 && (
            <>
              <h3>Copies taken at the unit</h3>
              <div className="pack-copies">
                {u.copies.map((x) => (
                  <div key={x.id} className="pack-copy">
                    {x.imageUrl ? <img src={x.imageUrl} alt="Citizen copy" /> : <div className="pack-copy-none small muted">Photo not yet confirmed as a result sheet</div>}
                    <div className="small">
                      <b>{x.standing === 'disagrees' ? 'Differs from IReV' : x.standing === 'agrees' ? 'Agrees with IReV' : 'Not compared yet'}</b>
                      <div className="muted">{x.role === 'demo' ? 'Demo upload' : titleCase(x.role)}{x.party ? ` · ${x.party}` : ''} · taken {x.takenAt ? watTime(x.takenAt) : 'time not given'} · received {watTime(x.uploadedAt)}</div>
                      {x.aiSummary && <div>{x.aiSummary}</div>}
                      {x.diffs.map((d) => <div key={d.field} className="mono">{d.field}: copy {fmt(d.copy)} · IReV {fmt(d.irev)}</div>)}
                      <div className="mono hash muted">SHA-256 {x.sha256}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      ))}

      <section className="pack-section">
        <h2>How this pack was made, and how to check it</h2>
        <ul className="small">{p.method.map((m) => <li key={m}>{m}</li>)}</ul>
        <p className="small">To check an IReV file, download it from the address above and compute its SHA-256 (on a Mac or Linux: <span className="mono">shasum -a 256 file.jpg</span>). The manifest JSON holds every value on these pages.</p>
      </section>
    </div>
  );
}
