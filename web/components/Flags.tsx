import { FLAG_INFO, type Flag } from '../api.ts';

const SEV_LABEL = { high: 'Serious', medium: 'Needs a look', low: 'Note' } as const;

export function SeverityDot({ severity }: { severity: Flag['severity'] | null }) {
  return <span className={`dot dot-${severity ?? 'none'}`} aria-hidden />;
}

export function SeverityTag({ severity }: { severity: Flag['severity'] }) {
  return <span className={`sev sev-${severity}`}><SeverityDot severity={severity} />{SEV_LABEL[severity]}</span>;
}

// "Why this sheet was flagged": the rule, what we read, and what it does not prove.
export function FlagList({ flags }: { flags: Flag[] }) {
  if (!flags.length) {
    return (
      <div className="why why-clean">
        <div className="why-title"><span className="dot dot-ok" />Every check passed</div>
        <p className="why-detail">The arithmetic adds up, the codes match this polling unit, and the sheet is stamped and signed.</p>
      </div>
    );
  }
  const order = { high: 0, medium: 1, low: 2 };
  return (
    <div className="why-list">
      {[...flags].sort((a, b) => order[a.severity] - order[b.severity]).map((f, i) => {
        const info = FLAG_INFO[f.code];
        return (
          <div key={`${f.code}${i}`} className={`why why-${f.severity}`}>
            <div className="why-head">
              <div className="why-title">{f.title}</div>
              <SeverityTag severity={f.severity} />
            </div>
            <p className="why-detail">{f.detail}</p>
            {info && (
              <details className="why-more">
                <summary>What this means</summary>
                <p>{info.means}</p>
                <p className="why-caveat"><b>What it does not prove:</b> {info.notProof}</p>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
