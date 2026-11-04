import { useEffect, useState } from 'react';

// A magnified crop of one region of a sheet (box in 0-1000 space), like a reviewer's loupe.
export function Loupe({ src, box, pad = 60, tone = 'correction' }: {
  src: string;
  box: { x1: number; y1: number; x2: number; y2: number };
  pad?: number;
  tone?: 'correction' | 'stamp' | 'diff';
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setRatio(img.naturalWidth / img.naturalHeight);
    img.src = src;
  }, [src]);
  if (!ratio) return null;
  // Pad horizontally more than vertically: figures sit in table rows.
  const x1 = Math.max(0, box.x1 - pad * 1.6), x2 = Math.min(1000, box.x2 + pad * 1.6);
  const y1 = Math.max(0, box.y1 - pad), y2 = Math.min(1000, box.y2 + pad);
  const cw = x2 - x1, ch = y2 - y1;
  const inner = { left: ((box.x1 - x1) / cw) * 100, top: ((box.y1 - y1) / ch) * 100, w: ((box.x2 - box.x1) / cw) * 100, h: ((box.y2 - box.y1) / ch) * 100 };
  return (
    <div
      className={`loupe loupe-${tone}`}
      style={{
        aspectRatio: String((cw / ch) * ratio),
        backgroundImage: `url("${src}")`,
        backgroundSize: `${(1000 / cw) * 100}% ${(1000 / ch) * 100}%`,
        backgroundPosition: `${cw < 1000 ? (x1 / (1000 - cw)) * 100 : 0}% ${ch < 1000 ? (y1 / (1000 - ch)) * 100 : 0}%`,
      }}
      role="img"
      aria-label="Close-up of the marked entry"
    >
      <span className="loupe-box" style={{ left: `${inner.left}%`, top: `${inner.top}%`, width: `${inner.w}%`, height: `${inner.h}%` }} />
    </div>
  );
}
