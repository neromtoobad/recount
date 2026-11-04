import { KIND_LABEL, ROLE_LABEL, STANDING_LABEL, fmt, watTime, type CitizenCopy } from '../api.ts';
import { Link } from '../App.tsx';

// How long before (or after) the IReV upload a copy was taken at the unit.
function lead(c: CitizenCopy) {
  const t = c.takenAt ?? c.uploadedAt;
  if (!c.irevUploadedAt) return null;
  const mins = Math.round((Date.parse(c.irevUploadedAt) - Date.parse(t)) / 60_000);
  if (Math.abs(mins) < 5) return null;
  const h = Math.floor(Math.abs(mins) / 60), m = Math.abs(mins) % 60;
  const span = h ? `${h}h ${m}m` : `${m}m`;
  return mins > 0 ? `${span} before the IReV upload` : `${span} after the IReV upload`;
}

export function CopyCard({ c, showUnit = false, slug }: { c: CitizenCopy; showUnit?: boolean; slug: string }) {
  // Once the AI has read the photo its figures win over anything typed, so a typo can't raise a conflict.
  const diffs = c.ai && c.ai.verdict !== 'unclear' ? c.ai.diffs : c.typedCheck?.diffs ?? [];
  const figures = c.ai?.votes && Object.keys(c.ai.votes).length ? c.ai.votes : c.typed?.votes ?? {};
  const top = Object.entries(figures).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const when = lead(c);
  return (
    <article className={`copy copy-${c.standing}`}>
      <div className="copy-thumb">
        {c.imageUrl ? <a href={c.imageUrl} target="_blank" rel="noreferrer"><img src={c.imageUrl} alt={`Citizen copy of ${c.puName ?? c.puCode}`} loading="lazy" /></a>
          : <span className="small muted">Photo shows once the AI confirms it is a result sheet</span>}
      </div>
      <div className="copy-body">
        <div className="copy-top">
          <span className={`copy-standing st-${c.standing}`}>{STANDING_LABEL[c.standing]}</span>
          <span className="mono small muted">{ROLE_LABEL[c.role]}{c.party ? ` · ${c.party}` : ''} · {KIND_LABEL[c.kind]}</span>
        </div>
        {showUnit && <Link to={`/${slug}/pu/${c.puId}`} className="copy-unit">{c.puName} <span className="mono small muted">{c.puCode} · {c.lga}</span></Link>}
        <div className="small muted">Taken {watTime(c.takenAt ?? c.uploadedAt)}{when ? ` · ${when}` : ''}</div>
        {top.length > 0 && <div className="mono small">{top.map(([p, n]) => `${p} ${fmt(n)}`).join(' · ')}</div>}
        {c.ai?.summary && <p className="small">{c.ai.summary}</p>}
        {diffs.length > 0 && (
          <ul className="copy-diffs small">
            {diffs.slice(0, 4).map((d) => <li key={d.field}><b>{d.field}</b> copy {fmt(d.copy)} · IReV {fmt(d.irev)}</li>)}
          </ul>
        )}
      </div>
    </article>
  );
}
