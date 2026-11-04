import { fmt, useJson, type Summary } from '../api.ts';

export function Method() {
  const { data: s } = useJson<Summary>('/api/osun/summary');
  return (
    <div className="page prose-wide">
      <div className="eyebrow">Method</div>
      <h1 className="h-display">How Recount reads a sheet</h1>
      <p className="lede">
        At every polling unit, the presiding officer fills in Form EC8A by hand, signs and stamps it, and uploads a
        photo to INEC's IReV portal. The photos are public, but there are thousands per state and IReV shows them only
        as images: no figures, no totals, no checks. Recount reads every one.
      </p>

      <ol className="pipeline">
        <li>
          <span className="pipe-n">1</span>
          <div><h3>Collect</h3><p>Recount lists every polling unit for the election on IReV, ward by ward, with each sheet's upload time and any earlier uploads INEC replaced. Photos are rotated and resized once and cached, so every model sees the same image.</p></div>
        </li>
        <li>
          <span className="pipe-n">2</span>
          <div><h3>Read: Muse Spark 1.3</h3><p>Spark transcribes each photo into a fixed structure: the state, LGA, ward and unit codes; the eight summary boxes; every party's votes in figures and in words; the stamp, signature and serial number. It copies what is written, mistakes included, and gives the location of every overwritten or corrected entry.</p></div>
        </li>
        <li>
          <span className="pipe-n">3</span>
          <div><h3>Find the stamp: SAM 3.1</h3><p>SAM 3.1 segments the presiding officer's stamp on every sheet. A stamp counts as present if either model finds it, so faint stamps are not flagged by mistake.</p></div>
        </li>
        <li>
          <span className="pipe-n">4</span>
          <div><h3>Check</h3><p>Plain rules, not AI, decide the flags: party votes against box #7, valid plus rejected against accredited voters, ballot accounting, figures against words, codes against the IReV slot, the same serial number under two units, and missing stamps or signatures.</p></div>
        </li>
        <li>
          <span className="pipe-n">5</span>
          <div><h3>Compare viral sheets</h3><p>For a circulating photo, Spark reads it, Recount matches it to a polling unit, and Spark compares the two images like a document examiner, boxing each changed entry.</p></div>
        </li>
      </ol>

      <h2>How accurate is it?</h2>
      <p>
        The best test of the reading is the total. Adding up every party row Spark read from all {s ? fmt(s.totals.analysed) : '3,752'} Osun
        sheets lands within 0.2% of the result INEC declared for each of the three leading parties. Individual sheets
        can still be misread, especially blurred or cropped photos, which is why every flag links to the original.
      </p>
      {s?.declared && (
        <table className="table">
          <thead><tr><th>Party</th><th className="num">Recount</th><th className="num">INEC declared</th></tr></thead>
          <tbody>{s.declared.map((d) => <tr key={d.party}><td>{d.party}</td><td className="num mono">{fmt(s.tally.find((t) => t.party === d.party)?.votes)}</td><td className="num mono">{fmt(d.votes)}</td></tr>)}</tbody>
        </table>
      )}

      <h2>How it compares with other audits</h2>
      <p>
        Dataphyte's review of the same Osun sheets, using OCR and human checking, reported discrepancies at more than
        900 polling units. Its rules differ from ours. For example, it counts used ballots above accredited voters,
        while Recount counts valid plus rejected votes above accredited voters, so the counts per rule are not
        identical. Both find the same broad picture: most sheets are consistent, and a minority need a second look.
      </p>

      <h2>What a flag means, and what it doesn't</h2>
      <p>
        A flag means a sheet deserves a second look. Many are honest mistakes made at the end of a long day; some are
        reading errors on our side. Recount does not say who won, or whether any result is valid: only INEC declares
        results and only the courts decide disputes. Recount never uses party colours, and it applies the same rules
        to every sheet.
      </p>

      <h2>Sources</h2>
      <ul>
        <li>Result sheets and polling units: INEC Result Viewing Portal (IReV).</li>
        <li>Declared totals: as announced at the Osun State collation centre.</li>
        <li>LGA boundaries: geoBoundaries, William & Mary geoLab (CC BY 4.0).</li>
        <li>Models: Meta Muse Spark 1.3 and SAM 3.1, through the Meta Model API.</li>
      </ul>
    </div>
  );
}
