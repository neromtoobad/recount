import { useMemo, type ReactNode } from 'react';

type Ring = [number, number][];
export type GeoFeature = { properties: Record<string, string>; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any } };
export type Shape = { name: string; d: string; c: [number, number] };

// Equirectangular projection scaled by cos(latitude); accurate enough for Nigeria and its states.
export function useShapes(features: GeoFeature[] | null, key: string, W: number, H: number): Shape[] {
  return useMemo(() => {
    if (!features?.length) return [];
    const rings = (f: GeoFeature): Ring[] => (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat());
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const f of features) for (const r of rings(f)) for (const [x, y] of r) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
    const s = Math.min((W - 16) / ((x1 - x0) * k), (H - 16) / (y1 - y0));
    const ox = (W - (x1 - x0) * k * s) / 2, oy = (H - (y1 - y0) * s) / 2;
    const proj = ([x, y]: [number, number]): [number, number] => [ox + (x - x0) * k * s, oy + (y1 - y) * s];
    return features.map((f) => {
      const rs = rings(f);
      const d = rs.map((r) => 'M' + r.map((p) => proj(p).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z').join('');
      // Label point: the middle of the largest ring's bounding box.
      const big = rs.reduce((a, b) => (b.length > a.length ? b : a), rs[0]);
      const bx = big.map((p) => p[0]), by = big.map((p) => p[1]);
      const c = proj([(Math.min(...bx) + Math.max(...bx)) / 2, (Math.min(...by) + Math.max(...by)) / 2]);
      return { name: f.properties[key], d, c };
    });
  }, [features, key, W, H]);
}

export function AreaMap({ shapes, W, H, fill, label, on, onHover, onPick, children }: {
  shapes: Shape[]; W: number; H: number; label: string;
  fill: (name: string) => string;
  on?: string | null;
  onHover?: (name: string | null) => void;
  onPick?: (name: string) => void;
  children?: ReactNode;
}) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="area-map">
      {shapes.map((s) => (
        <path
          key={s.name} d={s.d} fill={fill(s.name)}
          className={`lga-shape ${on === s.name ? 'on' : ''}`}
          onMouseEnter={() => onHover?.(s.name)} onMouseLeave={() => onHover?.(null)}
          onClick={() => onPick?.(s.name)}
        ><title>{s.name}</title></path>
      ))}
      {children}
    </svg>
  );
}
