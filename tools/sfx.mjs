// Embeds the chosen earshot takes into the game as data: tools/sfx.json -> src/js/05-sound-data.js.
//   node tools/sfx.mjs                          rebuild 05-sound-data.js from tools/sfx.json
//   node tools/sfx.mjs pick chomp kiss/lips     play another earshot design for an event, then rebuild
//   node tools/sfx.mjs pick chomp synth         the event goes back to the synth, then rebuild
// The takes come from the folder in sfx.json `src` (made with earshot outside the repo: variants/*.wav and
// candidates.json, see listen.html there). Each take is cut at its onset, shortened to `max`, made mono 24 kHz and
// encoded as mp3 (plays in Chrome, Firefox and iOS 15 Safari; ogg does not on old Safari). Its level is matched to
// the old synth sound of the same event by the loudest 50 ms, measured in headless Chrome, plus `trim_db`.
// Needs ffmpeg (on PATH or FFMPEG=...) and Chrome (as the tests: channel chrome, or CHROME=...).
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = join(root, 'tools/sfx.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const src = process.env.SFX_SRC || cfg.src;
const cand = JSON.parse(readFileSync(join(src, 'candidates.json'), 'utf8'));

if (process.argv[2] === 'pick') {
  const [ev, sound] = process.argv.slice(3);
  if (!cand[ev]) throw new Error(`no event ${ev}; events: ${Object.keys(cand).join(', ')}`);
  if (sound === 'synth') cfg.events[ev] = null;
  else {
    if (!cand[ev].some(([s]) => s === sound)) throw new Error(`${ev} has no variant ${sound}; variants: ${cand[ev].map((c) => c[0]).join(', ')}`);
    cfg.events[ev] = { ...(cfg.events[ev] || { max: 0.5, trim_db: 0 }), sound };
  }
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`${ev}: ${sound}`);
}

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const tmp = mkdtempSync(join(tmpdir(), 'kus-sfx-'));
const takes = {};
for (const [ev, e] of Object.entries(cfg.events)) {
  if (!e) continue;
  const i = cand[ev].findIndex(([s]) => s === e.sound);
  if (i < 0) throw new Error(`${ev}: ${e.sound} is not among the variants in ${src}`);
  const n = cand[ev][i][1];
  const names = n > 1 ? Array.from({ length: n }, (_, k) => `${ev}__v${i + 1}_${k + 1}`) : [`${ev}__v${i + 1}`];
  takes[ev] = names.map((name) => {
    const wav = join(src, 'variants', `${name}.wav`),
      mp3 = join(tmp, `${name}.mp3`);
    if (!existsSync(wav)) throw new Error(`missing ${wav}`);
    const af = [
      'silenceremove=start_periods=1:start_threshold=-45dB',
      `atrim=end=${e.max}`,
      'afade=t=in:d=0.002',
      `afade=t=out:st=${Math.max(0, e.max - 0.03).toFixed(3)}:d=0.03`,
    ].join(',');
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', wav, '-af', af, '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', mp3]);
    return readFileSync(mp3).toString('base64');
  });
}
rmSync(tmp, { recursive: true, force: true });

// level: the synth's loudest 50 ms against each take's, both measured at Sfx.out in an OfflineAudioContext
const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
const browser = await chromium.launch(launch);
const page = await browser.newPage();
const synth = readFileSync(join(root, 'src/js/05-sound.js'), 'utf8').replace(/^const Sfx =/m, 'window.Sfx =');
await page.addScriptTag({ content: `const clamp=(v,a,b)=>v<a?a:v>b?b:v, rand=(a,b)=>(a+b)/2, cam={x:0,z:1}, W=1000;\n${synth}` });
const ARGS = { chomp: [1, 1], snap: [1], bloop: [1], ding: [2], gulp: [1], boing: [1] };
const level = await page.evaluate(
  async ({ takes, ARGS }) => {
    const sr = 48000;
    const loud = (d) => {
      const w = 2400;
      let s = 0,
        best = 0;
      for (let i = 0; i < d.length; i++) {
        s += d[i] * d[i];
        if (i >= w) s -= d[i - w] * d[i - w];
        if (s > best) best = s;
      }
      return Math.sqrt(best / w);
    };
    const res = {};
    for (const ev in takes) {
      const off = new OfflineAudioContext(1, sr * 2, sr),
        S = window.Sfx;
      S.ac = off;
      S.out = off.createGain();
      S.out.connect(off.destination);
      S.noise = off.createBuffer(1, sr, sr);
      const nd = S.noise.getChannelData(0);
      let q = 1;
      for (let i = 0; i < sr; i++) nd[i] = ((q = (q * 16807) % 2147483647) / 2147483647) * 2 - 1;
      S.ok = () => true;
      S.lastPop = S.lastBoing = -9;
      Math.random = () => (q = (q * 16807) % 2147483647) / 2147483647; // the same noise offsets every build
      S[ev](...(ARGS[ev] || []));
      const a = loud((await off.startRendering()).getChannelData(0));
      let b = 0;
      for (const t of takes[ev]) {
        const bin = atob(t),
          u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        b += loud((await off.decodeAudioData(u.buffer)).getChannelData(0)) / takes[ev].length;
      }
      res[ev] = a / b;
    }
    return res;
  },
  { takes, ARGS },
);
await browser.close();

let js = `// ---------- sound data (GENERATED by tools/sfx.mjs from tools/sfx.json: do not edit) ----------
// Recorded takes for Sfx, mp3 as base64, decoded on the first tap. g: level that matches the old synth sound.
// Made with earshot (https://github.com/Leonxlnx/earshot, MIT; rendered sounds are free for any use without credit).
const SFX_DATA = {\n`;
let bytes = 0;
const rows = [];
for (const ev in takes) {
  const e = cfg.events[ev],
    g = level[ev] * Math.pow(10, (e.trim_db || 0) / 20),
    kb = takes[ev].reduce((s, t) => s + t.length, 0);
  bytes += kb;
  js += `  // ${e.sound}, ${takes[ev].length} take${takes[ev].length > 1 ? 's' : ''}\n  ${ev}: {\n    g: ${g.toFixed(3)},\n    r: [\n${takes[ev].map((t) => `      '${t}',\n`).join('')}    ],\n  },\n`;
  rows.push(
    `${ev.padEnd(8)} ${e.sound.padEnd(14)} ${String(takes[ev].length).padStart(2)} takes  ${(kb / 1024).toFixed(1).padStart(5)} KB  g ${g.toFixed(3)}`,
  );
}
js += '};\n';
writeFileSync(join(root, 'src/js/05-sound-data.js'), js);
console.log(rows.join('\n'));
console.log(
  `src/js/05-sound-data.js: ${(bytes / 1024).toFixed(1)} KB of base64; synth only: ${
    Object.keys(cfg.events)
      .filter((k) => !cfg.events[k])
      .join(', ') || 'none'
  }`,
);
