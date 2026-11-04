import { FLAG_INFO, FLAG_ORDER, UNOFFICIAL, fmt, pct, sheetSrc, useJson, type Analysis, type Summary } from '../api.ts';
import { Link } from '../App.tsx';
import { SeverityDot } from '../components/Flags.tsx';
import { OsunMap } from '../components/OsunMap.tsx';
import { PuSearch } from '../components/PuSearch.tsx';
import { SheetImage } from '../components/SheetImage.tsx';
import { Loupe } from '../components/Loupe.tsx';
import { UploadTimeline } from '../components/UploadTimeline.tsx';
import { sheetMarks } from '../marks.ts';

type MarginOfLead = {
  atRisk: { count: number };
  fromDeclared: { lead: number; registeredAtRisk: number } | null;
};

// The sheet the hero "X-ray" walks through, per election.
const HERO: Record<string, string> = { osun: '6a7f7928dcbc755a763f0dc3' };

export function Overview({ slug }: { slug: string }) {
  const { data: s, error } = useJson<Summary>(`/api/${slug}/summary`);
  if (error) return <div className="page"><p className="muted">This election has not been read yet.</p></div>;
  if (!s) return <div className="page"><div className="skeleton" style={{ height: 520 }} /></div>;
  const t = s.totals;

  return (
    <div className="home">
      <section className="hero-band">
      <div className="hero">
        <div className="hero-copy">
          <div className="eyebrow">{s.title}</div>
          <h1>Every polling unit result sheet, <em>read and checked</em></h1>
          <p className="lede">
            INEC posted {fmt(t.sheets)} handwritten polling-unit result sheets for this election. Recount read all of
            them with Meta's Muse Spark, checked the arithmetic, located stamps with SAM 3.1, and marked every
            overwritten figure, so anyone can see the evidence on the sheet itself.
          </p>
          <PuSearch slug={slug} big />
          <div className="hero-links">
            <Link to="/check" className="link-arrow">Got a result sheet on WhatsApp? Check if it's real</Link>
          </div>
        </div>
        {HERO[slug] && <HeroXray slug={slug} id={HERO[slug]} />}
      </div>
      </section>

      <Services slug={slug} />

      <section className="figures">
        <Figure value={fmt(t.analysed)} label="sheets read" sub={`every sheet on IReV · ${fmt(t.pollingUnits - t.sheets)} units had none`} />
        <Figure value={fmt(t.clean)} label="pass every check" sub={pct(t.clean, t.analysed)} tone="ok" />
        <Figure value={fmt(t.flagged)} label="need a second look" sub={pct(t.flagged, t.analysed)} tone="warn" />
        <Figure value={fmt(t.highSeverity)} label="serious flags" sub="sums, over-voting, wrong unit, duplicates" tone="bad" />
      </section>

      <div className="page">
        <Accuracy s={s} />
        <Margin s={s} slug={slug} />
        <Findings s={s} slug={slug} />

        <section className="block">
          <div className="block-head">
            <div className="kicker">Where</div>
            <h2>Flagged sheets by local government</h2>
            <p className="block-lede">Shaded by the share of each LGA's sheets with at least one flag that needs a look. Click an LGA to see its sheets.</p>
          </div>
          <OsunMap summary={s} slug={slug} />
        </section>

        <section className="block">
          <div className="block-head">
            <div className="kicker">When</div>
            <h2>How long the sheets took to reach IReV</h2>
            <p className="block-lede">Sheets uploaded per hour after polls closed. Late uploads leave room for doubt, so this is worth watching in every election.</p>
          </div>
          <UploadTimeline uploads={s.uploads} />
          {(s.replaced > 0 || s.duplicates.length > 0) && (
            <div className="aside-row">
              {s.replaced > 0 && <Link to={`/${slug}/sheets?flag=replaced`} className="aside-card"><b>{fmt(s.replaced)}</b> polling units had their sheet replaced after the first upload. The earlier versions are still public, and Recount links to them.</Link>}
              {s.duplicates.length > 0 && <Link to={`/${slug}/sheets?flag=duplicate`} className="aside-card"><b>{fmt(s.duplicates.length)}</b> serial numbers appear on sheets uploaded under more than one polling unit.</Link>}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

function HeroXray({ slug, id }: { slug: string; id: string }) {
  const { data: a } = useJson<Analysis>(`/api/${slug}/pu/${id}`);
  if (!a?.read || !a.pu.sheetUrl) return <div className="xray"><div className="skeleton" style={{ height: 460 }} /></div>;
  const { marks, notes } = sheetMarks(a);
  const sum = a.flags.find((f) => f.code === 'party_sum');
  const src = sheetSrc(a.pu.sheetUrl);
  const edit = marks.find((m) => m.kind === 'correction');
  return (
    <figure className="xray">
      <div className="xray-bar mono">
        <span>X-ray · {a.pu.puCode}</span>
        <Link to={`/${slug}/pu/${id}`} className="xray-open">Open this sheet →</Link>
      </div>
      <div className="xray-body">
        <SheetImage src={src} marks={marks} alt={`Result sheet for ${a.pu.name}`} reveal zoomable={false} />
        <ol className="xray-notes">
          {notes.map((n, i) => (
            <li key={n.n} className={`note note-${n.kind}`} style={{ animationDelay: `${0.6 + i * 0.9}s` }}>
              <span className="note-n">{n.n}</span>
              <span>
                <span className="note-label">{n.label}</span><span className="note-by mono">{n.by}</span>
                {n.kind === 'correction' && edit && n.n === edit.n && <Loupe src={src} box={edit} />}
              </span>
            </li>
          ))}
          {sum && (
            <li className="note note-sum" style={{ animationDelay: `${0.6 + notes.length * 0.9}s` }}>
              <span className="note-n">Σ</span>
              <span><span className="note-label">{sum.detail}</span><span className="note-by mono">Arithmetic check</span></span>
            </li>
          )}
        </ol>
      </div>
      <figcaption className="xray-cap">{a.pu.name.trim()}, {a.pu.ward}, {a.pu.lga}. The marks are Recount's; the photo is INEC's upload.</figcaption>
    </figure>
  );
}

function Figure({ value, label, sub, tone }: { value: string; label: string; sub: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className={`figure ${tone ? `figure-${tone}` : ''}`}>
      <div className="figure-value">{value}</div>
      <div className="figure-label">{tone && <span className={`dot dot-${tone === 'bad' ? 'high' : tone === 'warn' ? 'medium' : 'ok'}`} />}{label}</div>
      <div className="figure-sub">{sub}</div>
    </div>
  );
}

function Accuracy({ s }: { s: Summary }) {
  if (!s.declared) return null;
  const ours = new Map(s.tally.map((p) => [p.party, p.votes]));
  const rows = s.declared.map((d) => ({ ...d, ours: ours.get(d.party) ?? 0 }));
  const worst = Math.max(...rows.map((r) => Math.abs(r.ours - r.votes) / r.votes));
  return (
    <section className="block block-split">
      <div className="block-head">
        <div className="kicker">Can you trust the reading?</div>
        <h2>Our sheet-by-sheet count lands within {(worst * 100).toFixed(1)}% of INEC's declared result</h2>
        <p className="block-lede">
          Before checking anything else, we added up every party row Muse Spark read from every sheet. If the reading were
          sloppy, these totals would drift. They don't, so a flag is about the sheet, not about the reader.
        </p>
      </div>
      <table className="table table-accuracy">
        <thead><tr><th>Party</th><th className="num">Recount</th><th className="num">INEC declared</th><th className="num">Gap</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.party}>
              <td><b>{r.party}</b></td>
              <td className="num mono">{fmt(r.ours)}</td>
              <td className="num mono">{fmt(r.votes)}</td>
              <td className="num mono">{r.ours - r.votes > 0 ? '+' : ''}{fmt(r.ours - r.votes)} <span className="muted">({(((r.ours - r.votes) / r.votes) * 100).toFixed(2)}%)</span></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={4} className="small muted">{UNOFFICIAL} Declared figures as announced at the state collation centre.</td></tr></tfoot>
      </table>
    </section>
  );
}

// Votes on seriously flagged sheets, set against the declared lead. It answers "could these
// sheets change the outcome?" without saying anything is fraudulent.
function Margin({ s, slug }: { s: Summary; slug: string }) {
  const mol = useJson<MarginOfLead>(`/api/${slug}/margin`).data;
  if (!s.declared || s.declared.length < 2) return null;
  const [first, second] = [...s.declared].sort((a, b) => b.votes - a.votes);
  const tally = new Map(s.tally.map((p) => [p.party, p]));
  const flaggedA = (tally.get(first.party)?.votes ?? 0) - (tally.get(first.party)?.cleanVotes ?? 0);
  const flaggedB = (tally.get(second.party)?.votes ?? 0) - (tally.get(second.party)?.cleanVotes ?? 0);
  const lead = first.votes - second.votes;
  const leadWithout = (tally.get(first.party)?.cleanVotes ?? 0) - (tally.get(second.party)?.cleanVotes ?? 0);
  const allFlagged = s.tally.reduce((t, p) => t + p.votes - p.cleanVotes, 0);
  const max = Math.max(lead, leadWithout, allFlagged);
  return (
    <section className="block block-split">
      <div className="block-head">
        <div className="kicker">Does it change the outcome?</div>
        <h2>{leadWithout > 0 ? 'Setting aside every seriously flagged sheet leaves the declared order unchanged' : 'The seriously flagged sheets are enough to change the declared order'}</h2>
        <p className="block-lede">
          {fmt(allFlagged)} votes were recorded on the {fmt(s.totals.highSeverity)} sheets with a serious flag. They split
          between the parties much like everywhere else, so leaving them all out moves the lead by {fmt(Math.abs(lead - leadWithout))} votes.
          This is a stress test, not a recount: the sheets are flagged for a second look, not cancelled.
        </p>
      </div>
      <div className="margin">
        <MarginBar label={`Declared lead, ${first.party} over ${second.party}`} value={lead} max={max} tone="ink" />
        <MarginBar label="Votes on seriously flagged sheets (all parties)" value={allFlagged} max={max} tone="red" />
        <MarginBar label="Lead if those sheets are left out" value={leadWithout} max={max} tone="ink-soft" />
        <div className="margin-split mono small muted">
          On flagged sheets: {first.party} {fmt(flaggedA)} · {second.party} {fmt(flaggedB)}
        </div>
        {mol?.fromDeclared && (
          <div className="mol">
            <b>INEC's margin-of-lead test</b>
            <p className="small">
              {fmt(mol.atRisk.count)} units have over-voting on the sheet or no sheet at all. Results there can be cancelled,
              and they hold up to {fmt(mol.fromDeclared.registeredAtRisk)} registered voters, {mol.fromDeclared.lead > mol.fromDeclared.registeredAtRisk ? 'fewer' : 'more'} than
              the {fmt(mol.fromDeclared.lead)} lead. {mol.fromDeclared.lead > mol.fromDeclared.registeredAtRisk
                ? 'The lead is safe under the rule.'
                : 'Whether that matters depends on the PVCs collected in those units, which only INEC publishes, and on each over-voting flag holding up against the BVAS record.'}
            </p>
            <a className="link-arrow small" href={`/api/${slug}/margin`} target="_blank" rel="noreferrer">The units, as JSON</a>
          </div>
        )}
      </div>
    </section>
  );
}

function MarginBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  return (
    <div className="mbar">
      <div className="mbar-top"><span>{label}</span><span className="mono">{fmt(value)}</span></div>
      <div className="mbar-track"><span className={`mbar-fill mbar-${tone}`} style={{ width: `${(Math.max(0, value) / max) * 100}%` }} /></div>
    </div>
  );
}

function Findings({ s, slug }: { s: Summary; slug: string }) {
  const groups = [
    { sev: 'high', title: 'Serious', note: 'The figures on the sheet contradict each other, or the sheet is not where it should be.' },
    { sev: 'medium', title: 'Needs a look', note: 'Edits, missing stamps and loose ballot accounting.' },
  ] as const;
  const entries = Object.entries(s.flagCounts).sort((a, b) => FLAG_ORDER.indexOf(a[0]) - FLAG_ORDER.indexOf(b[0]));
  return (
    <section className="block">
      <div className="block-head">
        <div className="kicker">What we found</div>
        <h2>{fmt(s.totals.flagged)} sheets need a second look</h2>
        <p className="block-lede">One sheet can carry several flags. Each row opens the sheets behind it, with the photo and the reasoning side by side.</p>
      </div>
      <div className="findings">
        {groups.map((g) => {
          const list = entries.filter(([, f]) => f.severity === g.sev);
          const max = Math.max(1, ...list.map(([, f]) => f.count));
          return (
            <div key={g.sev} className="finding-group">
              <div className="finding-group-head"><SeverityDot severity={g.sev} /><b>{g.title}</b><span className="muted small">{g.note}</span></div>
              {list.map(([code, f]) => (
                <Link key={code} to={`/${slug}/sheets?flag=${code}`} className="finding">
                  <div className="finding-top">
                    <span className="finding-title">{f.title}</span>
                    <span className="finding-count mono">{fmt(f.count)}</span>
                  </div>
                  <span className="finding-bar"><span className={`fill-${f.severity}`} style={{ width: `${(f.count / max) * 100}%` }} /></span>
                  {FLAG_INFO[code] && <span className="finding-means">{FLAG_INFO[code].means}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
      <p className="small muted findings-foot">
        Notes that don't make a sheet "flagged": {entries.filter(([, f]) => f.severity === 'low').map(([code, f]) => (
          <Link key={code} to={`/${slug}/sheets?flag=${code}`} className="inline-link">{f.title.toLowerCase()} ({fmt(f.count)})</Link>
        )).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ', ', el] : [el]), [])}.
      </p>
    </section>
  );
}

const ICONS = {
  pin: <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Zm0-7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  scan: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9h8M8 12h8M8 15h5" />,
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />,
  book: <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h10" />,
  camera: <path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Zm8 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />,
};

// The four things people come here to do, as service tiles under the hero.
function Services({ slug }: { slug: string }) {
  const items = [
    { icon: ICONS.pin, title: 'Polling unit lookup', text: 'Open the sheet for your unit, with every check and the INEC original side by side.', to: `/${slug}/sheets`, go: 'Browse all sheets' },
    { icon: ICONS.camera, title: 'Add your result', text: 'Photograph the result poster at your unit. Recount holds INEC\'s upload against it.', to: '/add', go: 'Add a sheet' },
    { icon: ICONS.scan, title: 'Fact-check a sheet', text: 'Got a result sheet on WhatsApp or X? Compare it with the copy INEC published.', to: '/check', go: 'Check a sheet' },
    { icon: ICONS.download, title: 'Open data', text: 'Every figure and flag as CSV or JSON, ready for a newsroom, observer group or lawyer.', to: '/data', go: 'Get the data' },
  ];
  return (
    <section className="services">
      {items.map((i) => (
        <Link key={i.title} to={i.to} className="service">
          <span className="service-icon"><svg viewBox="0 0 24 24" aria-hidden>{i.icon}</svg></span>
          <h3>{i.title}</h3>
          <p>{i.text}</p>
          <span className="service-go">{i.go}<span aria-hidden>→</span></span>
        </Link>
      ))}
    </section>
  );
}
