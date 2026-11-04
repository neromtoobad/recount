// Builds vo.json + timeline.js: a music-only cold open, every narration line's start and
// length, the scene under each part of a line, the map geometry and the soundtrack plan.
//   node timeline.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FF = '/Users/mac/.local/bin/ffmpeg';
const COLD = 8.4; // music and typewriter before the first word
const GAP = 0.55;
const HOLD = { n3: 1.2, n5: 1.0, n6: 3.4 }; // extra air after a line; n6's is the title card
// "A New Life" (Mixkit 543): quiet build, then the full band at 24.62 s, which lands on the
// title. It is 4-bar phrased at 128 BPM, so one 16-bar repeat (69.62 -> 39.62) stretches it
// to cover act 3 and it still ends on its own fade at about 88 s.
const HIT = 24.62, JUMP_AT = 69.62, JUMP_TO = 39.62, MUSIC_END = 88;

const dur = (f) => {
  const s = spawnSync(FF, ['-hide_banner', '-i', f, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const m = [...s.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
};
const clipDur = (c) => JSON.parse(readFileSync(`clips/${c}.json`, 'utf8')).dur;

// Scenes per line: [scene, share of the line, extra]. A scene named after a recorded take
// plays that take from `from` to `to` (negative counts back from its end).
// Archive shots: `foot` is a VOA frame sequence (footage/f), `photo` a Wikimedia Commons still.
const SHOTS = {
  n1: [['p-count', 0.5, { photo: 'count' }], ['sheet1', 0.5]],
  n2: [['p-upload', 0.3, { photo: 'upload' }], ['wall', 0.7]],
  n3: [['map', 0.62], ['clip87', 0.38]],
  n4: [['chain', 1]],
  n5: [['p-decl', 0.2, { photo: 'collation' }], ['phone', 0.22], ['f-sitin', 0.18, { foot: 'sitin' }], ['f-irev', 0.2, { foot: 'irev' }], ['clips2', 0.2]],
  n6: [['why', 1]],
  n7: [['sheet', 1, { from: 0.3, to: 12.2, focus: [0.3, 0.45] }]],
  n8: [['sheet', 1, { from: 12.2, to: -0.2, focus: [0.62, 0.55] }]],
  n9: [['osun', 1, { from: 0.3, to: -0.2, focus: [0.4, 0.5] }]],
  n10: [['phone2', 0.16], ['check', 0.28, { from: 0.6, to: 4.4, focus: [0.3, 0.3] }], ['check', 0.56, { from: 12, to: -0.3, focus: [0.4, 0.55] }]],
  n11: [['collation', 0.42, { from: 0.6, to: 6.6, focus: [0.35, 0.4] }], ['collation', 0.58, { from: 8.6, to: -0.3, focus: [0.5, 0.55] }]],
  n12: [['report', 0.42, { from: 0.2, to: -0.2, focus: [0.45, 0.5] }], ['pack', 0.58, { from: 0.2, to: -0.2, focus: [0.4, 0.4] }]],
  n13: [['home', 0.5, { from: 0.4, to: 5, focus: [0.35, 0.45] }], ['end', 0.5]],
};
const CLIPS = new Set(['sheet', 'osun', 'check', 'collation', 'report', 'pack', 'home']);

const script = JSON.parse(readFileSync('script.json', 'utf8'));
let t = COLD;
const vo = [];
const scenes = [{ name: 'f-crowd', line: null, t: 0, dur: COLD / 2, foot: 'crowd' }, { name: 'f-bvas', line: null, t: COLD / 2, dur: COLD / 2, foot: 'bvas' }];
let title = 0;
for (const line of script) {
  const d = dur(`vo/${line.id}.wav`);
  vo.push({ id: line.id, act: line.act, t: +t.toFixed(3), dur: +d.toFixed(3), text: line.text, cap: line.cap });
  const segLen = d + GAP + (line.id === 'n6' ? 0.25 : HOLD[line.id] ?? 0);
  let s = t - 0.1;
  for (const [name, share, extra = {}] of SHOTS[line.id]) {
    const len = segLen * share;
    const sc = { name, line: line.id, t: +s.toFixed(3), dur: +len.toFixed(3), ...extra };
    if (CLIPS.has(name)) {
      const C = clipDur(name);
      sc.clip = name;
      sc.from = +(sc.from ?? 0).toFixed(3);
      sc.to = +(sc.to === undefined ? C : sc.to < 0 ? C + sc.to : sc.to).toFixed(3);
    }
    scenes.push(sc);
    s += len;
  }
  t += segLen;
  if (line.id === 'n6') {
    title = +(t - 0.1).toFixed(3);
    scenes.push({ name: 'title', line: null, t: title, dur: HOLD.n6 });
    t += HOLD.n6;
  }
}
const music = { start543: +(title - HIT).toFixed(3), hit: title };
const total = +(title + (JUMP_AT - HIT) + (MUSIC_END - JUMP_TO)).toFixed(3);
const lastWord = vo.at(-1).t + vo.at(-1).dur;
if (total < lastWord + 3) console.log(`WARNING: music ends ${(lastWord + 3 - total).toFixed(2)} s too early`);
scenes.at(-1).dur = +(total - scenes.at(-1).t).toFixed(3);
music.jump = +(title + JUMP_AT - HIT).toFixed(3);
Object.assign(music, { HIT, JUMP_AT, JUMP_TO, MUSIC_END });

const clips = {};
for (const c of CLIPS) clips[c] = JSON.parse(readFileSync(`clips/${c}.json`, 'utf8'));

// Map: states projected into a 900 x 760 box (equirectangular, longitude scaled by cos 9°).
const geo = JSON.parse(readFileSync('../web/ng-states.json', 'utf8'));
const replay = JSON.parse(readFileSync('build/replay2023.json', 'utf8'));
const K = Math.cos((9 * Math.PI) / 180);
let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
const each = (f, fn) => { const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; for (const p of polys) for (const ring of p) for (const pt of ring) fn(pt); };
for (const f of geo.features) each(f, ([lo, la]) => { x0 = Math.min(x0, lo * K); x1 = Math.max(x1, lo * K); y0 = Math.min(y0, la); y1 = Math.max(y1, la); });
const sc = Math.min(900 / (x1 - x0), 760 / (y1 - y0));
const P = ([lo, la]) => `${((lo * K - x0) * sc).toFixed(1)},${((y1 - la) * sc).toFixed(1)}`;
const states = geo.features.map((f) => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const d = polys.map((p) => p.map((ring) => 'M' + ring.map(P).join('L') + 'Z').join('')).join('');
  const a = replay.areas.find((x) => x.name === f.properties.state);
  if (!a) console.log('no replay for', f.properties.state);
  let acc = 0;
  const cum = a.counts.map((c) => (acc += c));
  // keep every 4th step (2 h) so the page stays small
  return { name: f.properties.state, d, total: a.total, cum: cum.filter((_, i) => i % 4 === 0 || i === cum.length - 1) };
});
const map = { start: replay.start, stepMinutes: replay.stepMinutes * 4, w: +((x1 - x0) * sc).toFixed(0), h: +((y1 - y0) * sc).toFixed(0), states };

const footage = {};
for (const s of scenes) if (s.foot) footage[s.foot] = JSON.parse(readFileSync(`footage/f/${s.foot}.json`, 'utf8'));
const sheets = JSON.parse(readFileSync('art/sheets/list.json', 'utf8')).map((s) => s.id);
const TL = { total, cold: COLD, title, music, vo, scenes, clips, footage, map, sheets };
writeFileSync('vo.json', JSON.stringify({ total, cold: COLD, title, music, vo, scenes }, null, 1));
writeFileSync('timeline.js', `window.TL = ${JSON.stringify(TL)};`);
console.log(`title ${title} s, last word ${lastWord.toFixed(2)} s, total ${total} s, ${scenes.length} scenes`);
for (const s of scenes) console.log(`${s.t.toFixed(2).padStart(7)} ${s.dur.toFixed(2).padStart(6)} ${s.name}${s.clip ? ` ${s.from}-${s.to}` : ''}`);
