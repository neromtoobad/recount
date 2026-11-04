// Soundtrack: "Vertigo" (Mixkit 597) from its first pulse at 5.3 s under the archive act,
// crossfading into "A New Life" (Mixkit 543) placed so its full band (24.62 s) lands on the
// title card, with one 16-bar repeat to carry act 3. Both are ducked by the voice. Typewriter
// clicks on the cold open, soft whooshes on archive cuts. Voice: gentle compressor, no
// limiter; one linear gain to about -15.5 LUFS with the true peak at or below -1.5 dBTP.
//   node mix.mjs  -> out/mix.wav (+ out/recount-demo.mp4 if out/silent.mp4 exists)
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';

const FF = '/Users/mac/.local/bin/ffmpeg';
const run = (a) => {
  const r = spawnSync(FF, ['-hide_banner', '-y', ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status) { console.log(r.stderr.slice(-2500)); throw new Error('ffmpeg failed'); }
  return r.stderr;
};
const { vo, scenes, total, title, music: M } = JSON.parse(readFileSync('vo.json', 'utf8'));
const S = 'aformat=sample_rates=48000:channel_layouts=stereo';
const ms = (t) => Math.round(Math.max(0, t) * 1000);
mkdirSync('build', { recursive: true });

// act 1: Vertigo, out as A New Life's build comes up under "I'm Nigerian"
const vOut = M.start543 + 3.5, vLen = vOut + 5;
run(['-ss', '5.3', '-t', String(vLen), '-i', 'music/597.mp3', '-af', `${S},afade=t=in:st=0:d=0.6,afade=t=out:st=${vOut}:d=4.5,volume=1.4`, 'build/m1.wav']);
// act 2-3: A New Life, two pieces joined on a bar line with a short crossfade
const X = 0.04;
run(['-t', String(M.JUMP_AT + X), '-i', 'music/543.mp3', '-af', `${S},afade=t=in:st=0:d=3,afade=t=out:st=${M.JUMP_AT - X}:d=${2 * X},adelay=${ms(M.start543)}:all=1`, 'build/m2a.wav']);
run(['-ss', String(M.JUMP_TO - X), '-t', String(M.MUSIC_END - M.JUMP_TO + 2), '-i', 'music/543.mp3', '-af', `${S},afade=t=in:st=0:d=${2 * X},adelay=${ms(M.jump - X)}:all=1`, 'build/m2b.wav']);
run(['-i', 'build/m1.wav', '-i', 'build/m2a.wav', '-i', 'build/m2b.wav', '-filter_complex',
  `[0]apad=whole_dur=${total}[a];[1]volume=0.8,apad=whole_dur=${total}[b];[2]volume=0.8,apad=whole_dur=${total}[c];[a][b][c]amix=3:normalize=0,volume='if(lt(t,${title - 0.05}),1,1+0.7*min(1,max(0,(${title + 3.5}-t)/0.6)))':eval=frame,afade=t=out:st=${total - 2.5}:d=2.5,atrim=0:${total}`, 'build/music.wav']);

// voice: each take levelled to -21 LUFS with one static gain, the hot opening of n6 eased by 3 dB
const lufs = (f) => Number(run(['-i', f, '-af', 'ebur128', '-f', 'null', '-']).split('Summary:').pop().match(/I:\s+(-?[\d.]+) LUFS/)[1]);
const CLIP = { n6: "volume='if(lt(t,1.0),0.71,1)':eval=frame," };
run([...vo.flatMap((v) => ['-i', `vo/${v.id}.wav`]), '-filter_complex',
  `${vo.map((v, i) => `[${i}]${S},${CLIP[v.id] ?? ''}volume=${(-21 - lufs(`vo/${v.id}.wav`)).toFixed(2)}dB,adelay=${ms(v.t)}:all=1[v${i}]`).join(';')};${vo.map((_, i) => `[v${i}]`).join('')}amix=${vo.length}:normalize=0,highpass=f=85,acompressor=threshold=-30dB:ratio=3:attack=6:release=160:makeup=4,apad=whole_dur=${total}`, 'build/voice.wav']);

// typewriter keys for the two typed lines of the cold open (same timing as index.html)
run(['-f', 'lavfi', '-i', 'anoisesrc=color=white:duration=0.05:amplitude=0.9', '-af', `highpass=f=1800,lowpass=f=7000,afade=t=out:st=0.004:d=0.04,${S}`, 'build/key.wav']);
const keys = [];
for (const [t0, len, n] of [[1.0, 1.7, 27], [3.3, 1.9, 30]]) for (let i = 0; i < n; i++) if (i % 7 !== 6) keys.push(t0 + (len * (i + 0.5)) / n + ((i * 37) % 11) * 0.004);
run([...keys.flatMap(() => ['-i', 'build/key.wav']), '-filter_complex',
  `${keys.map((t, i) => `[${i}]adelay=${ms(t)}:all=1,volume=${(0.32 + ((i * 13) % 5) * 0.04).toFixed(2)}[k${i}]`).join(';')};${keys.map((_, i) => `[k${i}]`).join('')}amix=${keys.length}:normalize=0,apad=whole_dur=${total}`, 'build/keys.wav']);
// whoosh on archive cuts and into the title
run(['-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=0.9:amplitude=0.6', '-af', `highpass=f=300,lowpass=f=3800,afade=t=in:st=0:d=0.4,afade=t=out:st=0.4:d=0.5,${S}`, 'build/whoosh.wav']);
// a low hit under the title, with the band
run(['-f', 'lavfi', '-i', `sine=f=48:d=1.6`, '-af', `volume='exp(-3*t)':eval=frame,afade=t=in:d=0.01,${S},volume=0.9,adelay=${ms(title)}:all=1,apad=whole_dur=${total}`, 'build/boom.wav']);
const cuts = scenes.filter((s, i) => i > 0 && s.t < title + 0.1 && !s.clip && !s.foot).map((s) => s.t - 0.35);
run([...cuts.flatMap(() => ['-i', 'build/whoosh.wav']), '-filter_complex',
  `${cuts.map((t, i) => `[${i}]adelay=${ms(t)}:all=1,volume=0.16[s${i}]`).join(';')};${cuts.map((_, i) => `[s${i}]`).join('')}amix=${cuts.length}:normalize=0,apad=whole_dur=${total}`, 'build/sfx.wav']);

run(['-i', 'build/music.wav', '-i', 'build/voice.wav', '-i', 'build/keys.wav', '-i', 'build/sfx.wav', '-i', 'build/boom.wav', '-filter_complex',
  `[0]${S},volume=0.55[m];[1]${S},asplit[vk][vm];[2]${S}[k];[3]${S}[fx];[4]${S}[bm];` +
  `[m][vk]sidechaincompress=threshold=0.02:ratio=7:attack=40:release=600[md];[md][vm][k][fx][bm]amix=5:normalize=0,atrim=0:${total}`, 'build/premix.wav']);
const st = run(['-i', 'build/premix.wav', '-af', 'ebur128=peak=true', '-f', 'null', '-']).split('Summary:').pop();
const I = Number(st.match(/I:\s+(-?[\d.]+) LUFS/)[1]), TP = Number(st.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]);
const gain = Math.min(-15.5 - I, -1.5 - TP);
console.log(`premix ${I} LUFS, TP ${TP} -> gain ${gain.toFixed(2)} dB`);
run(['-i', 'build/premix.wav', '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'pcm_s16le', 'out/mix.wav']);
const fin = run(['-i', 'out/mix.wav', '-af', 'ebur128=peak=true', '-f', 'null', '-']).split('Summary:').pop();
console.log('final', fin.match(/I:\s+(-?[\d.]+) LUFS/)[0], fin.match(/Peak:\s+(-?[\d.]+) dBFS/)[0]);
for (const [a, b] of [[0, 8.4], [8.4, title], [title, title + 3.4], [title + 3.4, total]]) {
  const s = run(['-ss', String(a), '-t', String(b - a), '-i', 'out/mix.wav', '-af', 'ebur128', '-f', 'null', '-']).split('Summary:').pop();
  console.log(`${a.toFixed(1)}-${b.toFixed(1)}s`, s.match(/I:\s+(-?[\d.]+) LUFS/)[0]);
}
if (existsSync('out/silent.mp4')) {
  run(['-i', 'out/silent.mp4', '-i', 'out/mix.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'out/recount-demo.mp4']);
  console.log('wrote out/recount-demo.mp4');
}
