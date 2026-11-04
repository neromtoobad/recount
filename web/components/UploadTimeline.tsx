import { useState } from 'react';
import { fmt, type Summary } from '../api.ts';

const WAT = (iso: string) => new Date(Date.parse(iso) + 3_600_000);
const label = (iso: string) => {
  const d = WAT(iso);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${String(d.getUTCHours()).padStart(2, '0')}:00 WAT`;
};

// Sheets reaching IReV per hour. Shows how long the public waited for each sheet.
export function UploadTimeline({ uploads }: { uploads: Summary['uploads'] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!uploads.length) return null;
  const max = Math.max(...uploads.map((u) => u.n));
  const total = uploads.reduce((t, u) => t + u.n, 0);
  let cum = 0;
  const cumAt = uploads.map((u) => (cum += u.n));
  const firstDay = WAT(uploads[0].t).getUTCDate();
  const sameDay = uploads.filter((u) => WAT(u.t).getUTCDate() === firstDay).reduce((t, u) => t + u.n, 0);
  const W = 1000, H = 180, bw = W / uploads.length;
  const days = uploads.map((u, i) => ({ i, d: WAT(u.t) })).filter(({ d, i }) => d.getUTCHours() === 0 && i * bw < W - 70);
  const h = hover !== null ? uploads[hover] : null;

  return (
    <div className="timeline">
      <div className="timeline-head">
        <div className="timeline-read mono small">
          {h ? <>{label(h.t)} · <b>{fmt(h.n)}</b> sheets · {Math.round((cumAt[hover!] / total) * 100)}% uploaded by then</>
            : <>{Math.round((sameDay / total) * 100)}% of sheets were on IReV by midnight on polling day. The last arrived {label(uploads[uploads.length - 1].t)}.</>}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="timeline-svg" onMouseLeave={() => setHover(null)} role="img" aria-label="Sheets uploaded to IReV per hour">
        <line x1="0" x2={W} y1={H} y2={H} className="axis" />
        {uploads.map((u, i) => {
          const bh = (u.n / max) * (H - 8);
          return (
            <g key={u.t} onMouseEnter={() => setHover(i)}>
              <rect x={i * bw} y="0" width={bw} height={H} fill="transparent" />
              <rect x={i * bw + 1} y={H - bh} width={Math.max(1, bw - 2)} height={bh} rx="1.5" className={`tbar ${hover === i ? 'on' : ''}`} />
            </g>
          );
        })}
        {days.map(({ i, d }) => (
          <g key={i}>
            <line x1={i * bw} x2={i * bw} y1="0" y2={H} className="day-line" />
            <text x={i * bw + 4} y={H + 16} className="day-label">{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</text>
          </g>
        ))}
        <text x="4" y={H + 16} className="day-label">Polling day</text>
      </svg>
    </div>
  );
}
