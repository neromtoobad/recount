import type { Analysis } from './api.ts';
import type { Mark } from './components/SheetImage.tsx';

export type MarkNote = { n: number; kind: Mark['kind']; label: string; by: string };

// Marks for one sheet in a shared 0-1000 space: SAM 3.1 boxes come in pixels of the
// image it saw, Muse Spark's edit boxes are already normalised.
export function sheetMarks(a: Pick<Analysis, 'read' | 'evidence' | 'review'>): { marks: Mark[]; notes: MarkNote[] } {
  const marks: Mark[] = [];
  const notes: MarkNote[] = [];
  const ev = a.evidence;
  // One stamp is enough to show; SAM sometimes returns overlapping boxes for it.
  const stamps = [...(ev?.stamp ?? [])].sort((p, q) => (q.c ?? 0) - (p.c ?? 0)).slice(0, 1);
  for (const b of stamps) {
    if (!ev?.width) break;
    const n = notes.length + 1;
    marks.push({ x1: (b.x1 / ev.width) * 1000, x2: (b.x2 / ev.width) * 1000, y1: (b.y1 / ev.height) * 1000, y2: (b.y2 / ev.height) * 1000, kind: 'stamp', n });
    notes.push({ n, kind: 'stamp', label: 'Presiding officer stamp', by: 'Located by SAM 3.1' });
  }
  for (const x of a.read?.alterations ?? []) {
    const n = notes.length + 1;
    marks.push({ ...x.box, kind: 'correction', n });
    notes.push({ n, kind: 'correction', label: `${x.entry}: ${x.what}`, by: 'Marked by Muse Spark' });
  }
  // where the second look re-read the entries behind a flag
  for (const x of a.review?.items ?? []) {
    const n = notes.length + 1;
    marks.push({ ...x.box, kind: 'diff', n });
    notes.push({ n, kind: 'diff', label: `Checked again: ${x.sheetSays}`, by: 'Muse Spark, second look' });
  }
  return { marks, notes };
}
