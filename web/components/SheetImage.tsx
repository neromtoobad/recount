import { useEffect, useState } from 'react';

export type Mark = {
  x1: number; y1: number; x2: number; y2: number;
  kind: 'stamp' | 'signature' | 'correction' | 'diff';
  n?: number;
};

// A sheet photo with reviewer marks drawn over it in a 0-1000 space. Marks look like
// crop marks (corner ticks), numbered to match the list beside the image.
// `reveal` draws them one after another; `zoomable` opens the photo full screen.
export function SheetImage({ src, marks = [], alt, reveal = false, zoomable = true, fit = 'contain' }: {
  src: string;
  marks?: Mark[];
  alt: string;
  reveal?: boolean;
  zoomable?: boolean;
  fit?: 'contain' | 'natural';
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [ratio, setRatio] = useState(0.75);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  const body = (big: boolean) => (
    <div className={`sheet-frame ${big ? 'is-big' : ''}`} style={{ aspectRatio: String(ratio) }}>
      <img
        src={src} alt={alt}
        onLoad={(e) => { setLoaded(true); const i = e.currentTarget; if (i.naturalWidth) setRatio(i.naturalWidth / i.naturalHeight); }}
        onError={() => setFailed(true)}
      />
      {loaded && <Marks marks={marks} reveal={reveal && !big} />}
    </div>
  );

  return (
    <>
      <div
        className={`sheet-image fit-${fit} ${loaded ? 'is-loaded' : ''} ${zoomable && loaded ? 'is-zoomable' : ''}`}
        onClick={() => zoomable && loaded && setZoom(true)}
        role={zoomable ? 'button' : undefined}
        aria-label={zoomable ? 'Open the sheet full size' : undefined}
      >
        {failed ? <div className="sheet-fail">The sheet image could not be loaded from IReV.</div> : body(false)}
        {!loaded && !failed && <div className="sheet-loading"><span className="spinner" />Loading sheet from IReV</div>}
        {zoomable && loaded && <span className="zoom-hint">Click to enlarge</span>}
      </div>
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(false)} role="dialog" aria-label={alt}>
          <button className="lightbox-close" aria-label="Close">Close ✕</button>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>{body(true)}</div>
        </div>
      )}
    </>
  );
}

function Marks({ marks, reveal }: { marks: Mark[]; reveal: boolean }) {
  if (!marks.length) return null;
  return (
    <div className={`marks-layer ${reveal ? 'reveal' : ''}`}>
    <svg className="marks" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden>
      {marks.map((m, i) => {
        const pad = 8;
        const x = m.x1 - pad, y = m.y1 - pad, w = m.x2 - m.x1 + pad * 2, h = m.y2 - m.y1 + pad * 2;
        const t = Math.min(18, w / 3, h / 3);
        const corners = `M${x},${y + t}V${y}H${x + t} M${x + w - t},${y}H${x + w}V${y + t} M${x + w},${y + h - t}V${y + h}H${x + w - t} M${x + t},${y + h}H${x}V${y + h - t}`;
        return (
          <g key={i} className={`mark mark-${m.kind}`} style={{ animationDelay: `${0.6 + i * 0.9}s` }}>
            <rect x={x} y={y} width={w} height={h} className="mark-box" vectorEffect="non-scaling-stroke" />
            <path d={corners} className="mark-corners" vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
    {marks.map((m, i) => m.n !== undefined && (
      <span
        key={`n${i}`}
        className={`mark-badge mark-${m.kind}`}
        style={{ left: `${m.x1 / 10}%`, top: `${m.y1 / 10}%`, animationDelay: `${0.6 + i * 0.9}s` }}
      >{m.n}</span>
    ))}
    </div>
  );
}
