import { fmt, useJson, type Summary } from '../api.ts';
import { CollationCheck } from '../components/CollationCheck.tsx';

const FIELDS: [string, string][] = [
  ['pu_code', 'INEC polling unit code, state/LGA/ward/unit (e.g. 29/17/03/007)'],
  ['status', 'clean, flagged (at least one flag that needs a look), missing (no sheet on IReV)'],
  ['flags', 'Space-separated flag codes, e.g. party_sum altered no_stamp'],
  ['registered … total_valid', 'Summary box figures as written on the sheet (#1, #2, #6, #7)'],
  ['party_sum', 'Sum of every party’s votes in figures'],
  ['votes_<PARTY>', 'Votes in figures for each party, as written'],
  ['stamped, signed', 'Whether a presiding officer stamp (Muse Spark or SAM 3.1) and signature were found'],
  ['irev_url, irev_uploaded_at', 'The original photo on IReV and when INEC uploaded it'],
  ['recount_url', 'This polling unit’s evidence page, with marks and reasoning'],
  ['flag_details', 'Each flag in words, e.g. "Party figures sum to 309, but total valid votes (#7) is 303."'],
];

const API: [string, string, string][] = [
  ['GET', '/api/nigeria/units?q=', 'Search all ~176,000 polling units in Nigeria by code, name, ward or LGA'],
  ['GET', '/api/nigeria/unit/:code', 'One unit nationwide: 2027 pledges, 2023 upload time, every election Recount has read there'],
  ['POST', '/api/nigeria/pledge', 'Pledge to cover a unit on 16 January 2027 (code, role)'],
  ['GET', '/api/nigeria/situation?hours=24', 'Situation room: reports by kind and state, and the latest reports'],
  ['POST', '/api/nigeria/report', 'Report what is happening at a unit (code, kind): late, bvas, vote_buying, violence, no_result…'],
  ['GET', '/api/:slug/replay', 'Election night by LGA in 10-minute steps, with stalls, replacements and serious flags'],
  ['GET', '/api/:slug/pack?pu=|lga=&ward=', 'Evidence pack with SHA-256 fingerprints of every IReV file and citizen photo'],
  ['GET', '/api/:slug/units?lga=&ward=&code=&flag=&status=', 'Polling units with figures and flags. code takes the number on a voter card, e.g. 29-11-07-015'],
  ['GET', '/api/:slug/pu/:id', 'Full reading of one sheet: every figure, marks and the reason for each flag'],
  ['GET', '/api/:slug/pu/:id/card.txt', 'Plain-text card for WhatsApp, SMS and chat bots'],
  ['GET', '/api/:slug/collation?by=lga|ward', 'Sheets added up by LGA or ward, the way the EC8C and EC8B forms do'],
  ['POST', '/api/:slug/collation/check', 'Compare a ward or LGA collation figure with the sheets under it'],
  ['POST', '/api/:slug/collation/photo', 'Upload a photo of an EC8B or EC8C collation sheet; each row is checked against IReV'],
  ['GET', '/api/:slug/collation/photo/:id', 'A collation photo: rows against IReV, the sheet\'s own arithmetic, units left out'],
  ['POST', '/api/:slug/copies', 'Add a photo of the result taken at the unit (multipart: image, puId, role, optional figures)'],
  ['GET', '/api/:slug/copies?pu=', 'Citizen copies and where each stands against the IReV sheet'],
  ['GET', '/api/:slug/copies/conflicts', 'Units where copies from the unit and IReV disagree'],
  ['GET', '/api/:slug/margin', "INEC's margin-of-lead test against units with over-voting or no sheet"],
  ['GET', '/api/:slug/forensics', 'Turnout distribution, turnout and one-party outliers, last-digit test'],
  ['GET', '/api/:slug/changes?since=', 'Sheets uploaded, replaced or read since a moment, for live monitoring'],
  ['GET', '/api/:slug/feed.xml', 'RSS feed of sheets with serious flags, for newsroom readers'],
  ['GET', '/api/:slug/summary', 'Totals, flag counts, party tally, LGAs, upload timeline'],
  ['GET', '/api/:slug/export.csv', 'Every polling unit, the download above'],
];

export function Data({ slug }: { slug: string }) {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const { data: s } = useJson<Summary>(`/api/${slug}/summary`);
  return (
    <div className="page prose-wide">
      <div className="eyebrow">Open data</div>
      <h1 className="h-display">Every sheet, as data</h1>
      <p className="lede">
        One row per polling unit: the figures as written, every flag, and links to the IReV original and the evidence
        page. Use it to report, to observe, or to prepare a petition. Every row points back to a public sheet, so every
        claim can be checked.
      </p>

      <div className="downloads">
        <a className="download" href={`/api/${slug}/export.csv`} download>
          <span className="download-kind mono">CSV</span>
          <span><b>{s?.title ?? 'Osun governorship 2026'}</b><span className="small muted">{s ? `${fmt(s.totals.pollingUnits)} polling units · opens in Excel or Google Sheets` : 'All polling units'}</span></span>
          <span className="download-go">Download ↓</span>
        </a>
        <a className="download" href={`/api/${slug}/export.json`} target="_blank" rel="noreferrer">
          <span className="download-kind mono">JSON</span>
          <span><b>Same rows, for code</b><span className="small muted">Party votes nested under votes</span></span>
          <span className="download-go">Open ↗</span>
        </a>
      </div>

      <h2>Fields</h2>
      <table className="table">
        <tbody>{FIELDS.map(([k, v]) => <tr key={k}><td className="mono small">{k}</td><td className="small">{v}</td></tr>)}</tbody>
      </table>

      <h2>Check a collation result</h2>
      <p>
        Most disputes start at the ward and LGA collation centres, where polling-unit results are added up on the EC8B
        and EC8C forms. Type in the figures from a collation sheet and Recount compares them with the polling-unit
        sheets underneath. Try "Fill in the sheet totals", change one number, and compare.
      </p>
      <CollationCheck slug={slug} summary={s ?? null} />

      <h2>API</h2>
      <p>
        Open, read-only JSON with CORS enabled, so newsrooms, observer groups and bots can build on it. No key needed.
        The full description is at <a className="inline-link" href="/api/openapi.json" target="_blank" rel="noreferrer">/api/openapi.json</a>.
      </p>
      <table className="table api-table">
        <tbody>
          {API.map(([method, route, what]) => (
            <tr key={route}><td className="mono small nowrap"><span className="method">{method}</span> {route.replace(':slug', slug)}</td><td className="small">{what}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 className="api-h">Compare a collation sheet from a script</h3>
      <pre className="code">{`curl -X POST ${origin}/api/${slug}/collation/check \\
  -H 'Content-Type: application/json' \\
  -d '{"lga": "IFE CENTRAL", "ward": "AKARABATA",
       "votes": {"A": 953, "APC": 1251},
       "source": "EC8B photo from the ward collation centre"}'`}</pre>
      <h3 className="api-h">Follow new sheets on election night</h3>
      <pre className="code">{`# returns events newer than "since", plus "now" to use next time
curl '${origin}/api/${slug}/changes?since=2026-08-15T14:00:00Z'`}</pre>

      <h2>For petitions and reporting</h2>
      <ul>
        <li>Each sheet's page prints as a one-page evidence record: the photo with marks, the rule each flag broke, and the figures, with the IReV link and upload time.</li>
        <li>Tribunals have dismissed petitions where documents were "dumped" without being tied to polling units. Every row here names its polling unit and its source.</li>
        <li>Over-voting claims are usually tested against the BVAS report and the voter register as well as the EC8A. Recount covers the EC8A; request the other two from INEC.</li>
        <li>Recount is unofficial. Figures are transcribed by AI and can be wrong; always cite the original sheet.</li>
      </ul>
    </div>
  );
}
