import { Link } from '../App.tsx';
import { WhatsAppCard } from '../components/WhatsAppCard.tsx';

// What a voter can do on election day, and what to do when something goes wrong. Kept to
// what INEC's own rules say; the official texts are linked at the bottom.

const DAY = [
  ['Before you go', 'Find your polling unit and bring your voter card (PVC). You can only vote at the unit you registered at. Campaigning stops the day before the election, and none is allowed at the unit.'],
  ['8:30 am to 2:30 pm', 'Polls open at 8:30 am and close at 2:30 pm. Anyone already in the queue at 2:30 pm is still allowed to vote. Older voters, pregnant women and voters with disabilities go first, and a voter who needs help can bring someone of their choice to assist.'],
  ['Accreditation', 'The BVAS checks your fingerprint or, if that fails, your face. Then you get your ballot papers.'],
  ['Voting', 'Your vote is secret. Mark your ballot inside the cubicle, fold it and drop it in the box yourself. Phones and cameras are not allowed in the cubicle: never photograph your marked ballot.'],
  ['Counting', 'Counting happens at the unit, in public, straight after voting. You can stay and watch from a calm distance.'],
  ['The result', 'The presiding officer announces the result, fills the result sheet (Form EC8A), gives copies to the party agents and police, and pastes the result poster (Form EC60E) at the unit. The BVAS then sends a photo of the EC8A to IReV. Under the Electoral Act 2026, where the network fails, the paper EC8A is the record collation uses, which is why a photo of the poster matters.'],
] as const;

const IF = [
  ['Officials or materials have not arrived', 'Wait calmly. Report it on Recount so the board shows which units are late.', '/report', 'Report late officials'],
  ['The BVAS will not read your fingerprint', 'Ask the officer to try face capture. If no BVAS at the unit works, INEC\'s rules say voting there continues once a working one arrives, which can be the next day. Report it either way.', '/report', 'Report a BVAS failure'],
  ['Your name is not on the register at the unit', 'Check that you are at the right unit with INEC\'s polling unit locator. You can only vote where you registered.', 'https://www.inecnigeria.org/polling-units/', 'INEC polling unit locator'],
  ['Someone offers money, food or gifts for your vote', 'Say no and walk away; don\'t argue. Buying and selling votes are both crimes under the Electoral Act. Report what you saw, not who you think did it.', '/report', 'Report vote buying'],
  ['There is violence, or a ballot box is snatched', 'Leave. Your safety comes first, and an emergency is a call to 112. Report it on Recount once you are safe.', '/report', 'Report violence'],
  ['The result is not announced or the poster is not pasted', 'Ask the presiding officer, politely, when it will be posted. Report it. When the poster goes up, photograph the whole sheet and add it to Recount.', '/add', 'Add the result photo'],
  ['A result sheet is going round on WhatsApp', 'Don\'t forward it yet. Recount compares it with the copy INEC uploaded for that unit and tells you if it was changed.', '/check', 'Fact-check a sheet'],
] as const;

// How a result travels from the polling unit to the declaration, and where Recount checks it.
const CHAIN = [
  ['Polling unit', 'EC8A sheet and EC60E poster', 'Recount reads every IReV sheet, checks its arithmetic, and holds it against photos taken at the unit.'],
  ['Ward collation', 'EC8B', 'Recount compares each row of a ward sheet with that unit\'s IReV sheet, and checks the ward totals.'],
  ['LGA collation', 'EC8C', 'Recount adds up the polling-unit sheets in the LGA so the LGA figure can be checked.'],
  ['State collation', 'EC8D', 'The sum of every LGA, and the margin-of-lead test for cancelled units.'],
  ['Declaration', 'EC8E', 'Only INEC declares results, and only the courts decide disputes.'],
] as const;

export function Guide() {
  return (
    <div className="page guide-page">
      <div className="add-head">
        <div>
          <div className="eyebrow">Election-day guide · 16 January 2027</div>
          <h1 className="h-display">What you can do on election day</h1>
          <p className="lede">How voting works at your polling unit, what to do when something goes wrong, and where your result goes after counting. Plain words, from INEC's own rules.</p>
        </div>
      </div>

      <section className="block">
        <ol className="guide-day">
          {DAY.map(([h, t], i) => (
            <li key={h} className="card">
              <span className="step-n">{i + 1}</span>
              <div><h3>{h}</h3><p>{t}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="block">
        <div className="block-head">
          <div className="kicker">When something goes wrong</div>
          <h2>What to do if…</h2>
        </div>
        <div className="guide-if">
          {IF.map(([h, t, to, go]) => (
            <div key={h} className="card">
              <h3>{h}</h3>
              <p>{t}</p>
              {to.startsWith('http')
                ? <a href={to} target="_blank" rel="noreferrer" className="link-arrow small">{go}</a>
                : <Link to={to} className="link-arrow small">{go}</Link>}
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <div className="block-head">
          <div className="kicker">After counting</div>
          <h2>Where your result goes, and where Recount checks it</h2>
          <p className="block-lede">A unit's result is added up at the ward, then the LGA, then the state. Tribunal cases often turn on a figure that changed between two of these steps.</p>
        </div>
        <ol className="guide-chain">
          {CHAIN.map(([level, form, check]) => (
            <li key={level}>
              <div className="guide-chain-level"><b>{level}</b><span className="mono small">{form}</span></div>
              <p className="small">{check}</p>
              {level === 'Ward collation' && <Link to="/collation" className="link-arrow small">Check a collation sheet</Link>}
            </li>
          ))}
        </ol>
      </section>

      <div className="guide-foot">
        <WhatsAppCard compact />
        <div className="card">
          <h3>The official texts</h3>
          <ul className="small">
            <li><a className="inline-link" href="https://statehouse.gov.ng/president-tinubu-signs-amended-electoral-act-commits-to-strengthening-democracy/" target="_blank" rel="noreferrer">Electoral Act 2026</a>, signed 18 February 2026</li>
            <li><a className="inline-link" href="https://www.inecnigeria.org/" target="_blank" rel="noreferrer">INEC</a>, for the Regulations and Guidelines for the Conduct of Elections</li>
            <li><a className="inline-link" href="https://www.inecnigeria.org/polling-units/" target="_blank" rel="noreferrer">INEC polling unit locator</a></li>
          </ul>
          <p className="small muted">Recount is independent and not part of INEC. Where this guide and INEC's published rules differ, INEC's rules apply.</p>
        </div>
      </div>
    </div>
  );
}
