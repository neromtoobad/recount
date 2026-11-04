import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Logo } from '../App.tsx';

const ELECTION_DAY = '16 January 2027';

// The kit for getting people in every ward ready to add their unit's result.
export function Join({ embedded = false }: { embedded?: boolean }) {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const addUrl = `${origin}/2027`;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(addUrl, { margin: 1, width: 480, color: { dark: '#0e3d1e', light: '#ffffff' } }).then(setQr); }, [addUrl]);

  const message = `On ${ELECTION_DAY}, after counting, take a clear photo of the result poster (EC60E) pasted at your polling unit and add it to Recount. Pledge to cover your unit now: ${addUrl}

Recount holds every unit's result against the sheet INEC uploads to IReV and flags any unit where they differ. No name or phone number needed.

Never photograph your marked ballot. Stay safe.`;

  return (
    <div className={embedded ? 'join-page join-embedded' : 'page join-page'}>
      <div className="no-print">
        <div className="eyebrow">{embedded ? 'Get your area ready' : 'Cover your polling unit'}</div>
        {embedded ? <h2 className="join-h join-h-top">One photo from every unit on {ELECTION_DAY}</h2> : <h1 className="h-display">One photo from every unit on {ELECTION_DAY}</h1>}
        <p className="lede">
          Nigeria has about 176,000 polling units. INEC posts each unit's result there, then uploads it to IReV, sometimes hours
          later. If one person at each unit photographs the poster and adds it to Recount, every upload can be checked against
          what was announced on the spot.
        </p>

        <ol className="join-steps">
          <li><b>Before the day</b><span>Find your unit on INEC's <a className="inline-link" href="https://www.inecnigeria.org/polling-units/" target="_blank" rel="noreferrer">polling unit locator</a>, and share this kit with your street, estate, church, mosque or market WhatsApp group.</span></li>
          <li><b>After counting</b><span>When the presiding officer announces the result and pastes the EC60E poster, take one clear photo of the whole sheet.</span></li>
          <li><b>Add it</b><span>Open <span className="mono">{origin.replace(/^https?:\/\//, '')}/add</span>, choose your unit and upload. It takes under a minute and works on a weak connection.</span></li>
          <li><b>Watch your unit</b><span>When INEC's upload appears on IReV, Recount compares it with your photo. Any difference shows on your unit's page and in the public conflicts list.</span></li>
        </ol>

        <div className="join-share">
          <div className="card">
            <h3>Share the message</h3>
            <pre className="share-text">{message}</pre>
            <div className="verdict-actions">
              <a className="btn btn-green" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
              <a className="btn btn-light" href={`https://x.com/intent/post?text=${encodeURIComponent(`On ${ELECTION_DAY}, photograph the result poster at your polling unit and add it to Recount. Every IReV upload gets checked against what was announced on the spot. ${addUrl}`)}`} target="_blank" rel="noreferrer">Post on X</a>
              <button className="btn btn-ghost" onClick={() => { navigator.clipboard?.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy text'}</button>
            </div>
          </div>
          <div className="card">
            <h3>Print the flyer</h3>
            <p className="small muted">One A4 page with a QR code that opens the upload form. Paste it where people gather.</p>
            <button className="btn btn-light" onClick={() => window.print()}>Print the flyer</button>
          </div>
        </div>

        <h2 className="join-h">Who it helps</h2>
        <div className="who-grid">
          <div className="card"><b>Voters</b><span className="small">See that the result announced at your unit is the one that counts.</span></div>
          <div className="card"><b>Party agents</b><span className="small">File your EC8A copy the moment it is signed. Every party's copies are checked the same way.</span></div>
          <div className="card"><b>Observers and CSOs</b><span className="small">Pull every copy and conflict from the open API into your situation room.</span></div>
          <div className="card"><b>Journalists</b><span className="small">Follow the RSS feed of conflicts and link readers to the evidence for each unit.</span></div>
        </div>
        <p className="small muted join-note">
          Recount opens uploads for each election as soon as INEC lists its polling units on IReV. Recount is independent and
          unofficial: it does not declare results, and a conflict means "look at this unit", not that anyone cheated.
        </p>
      </div>

      <div className="flyer print-only">
        <div className="flyer-brand"><Logo /><b>Recount</b></div>
        <h1>{ELECTION_DAY}: photograph your polling unit's result</h1>
        <p>After counting, take one clear photo of the result poster (EC60E) pasted at your unit and add it to Recount. Every upload to INEC's IReV gets checked against what was announced on the spot.</p>
        {qr && <img src={qr} alt="QR code to the Recount upload form" />}
        <p className="flyer-url">{addUrl.replace(/^https?:\/\//, '')}</p>
        <ul>
          <li>No name or phone number needed</li>
          <li>Never photograph your marked ballot</li>
          <li>Stay safe: if there is trouble, leave</li>
        </ul>
        <p className="flyer-foot">Independent and non-partisan. Not affiliated with INEC.</p>
      </div>
    </div>
  );
}
