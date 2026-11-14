#!/usr/bin/env node
/**
 * Builds the "neXgen for Doctors" video from the live presentation.
 *
 *   node scripts/doctor-video/build.mjs [--base http://localhost:3001] [--fps 30]
 *                                       [--voice Ravi] [--workers 4] [--skip-hindi]
 *
 * Needs: the app running (npm run dev), Google Chrome, ffmpeg on PATH (or FFMPEG
 * env var), and Windows for the OneCore narration voice (tts.ps1).
 *
 * Steps
 *  1. narration  src/components/presentation/narration.json -> WAV per scene
 *  2. timing     scene durations from the real clip lengths -> public/media/narration-timing.json
 *  3. audio      voice + a soft synthesised pad, loudness-normalised -> narration.m4a
 *  4. frames     /doctors-video?capture=1 seeked frame by frame in parallel tabs
 *  5. encode     H.264 1080p MP4 with EN + HI subtitle tracks, a Hindi-captioned
 *                copy for WhatsApp, WebVTT files and a poster frame
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const MEDIA = path.join(ROOT, 'public', 'media');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, [])
);
const BASE = args.base || 'http://localhost:3001';
const FPS = Number(args.fps || 30);
const VOICE = args.voice || 'Ravi';
const WORKERS = Number(args.workers || Math.max(2, Math.min(6, os.cpus().length - 2)));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || FFMPEG.replace(/ffmpeg(\.exe)?$/i, m => m.replace('ffmpeg', 'ffprobe'));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const WORK = path.join(os.tmpdir(), 'nexgen-doctor-video');
/** Share-only outputs (WhatsApp copy) live outside public/ so they never bloat a web deploy. */
const SHARE_DIR = path.join(ROOT, 'docs', 'video');

function loadPlaywright() {
  for (const candidate of ['playwright-core', path.resolve(ROOT, '../nexgen-hms/node_modules/playwright-core')]) {
    try {
      return require(candidate);
    } catch {
      /* try next */
    }
  }
  throw new Error('playwright-core not found. Install it (npm i -D playwright-core) or keep the sibling nexgen-hms checkout.');
}

function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { stdio: opts.capture ? 'pipe' : 'inherit', encoding: 'utf8', maxBuffer: 1 << 26 });
  if (res.status !== 0) {
    throw new Error(`${path.basename(cmd)} failed (${res.status}): ${res.stderr || ''}`);
  }
  return res.stdout;
}

const durationOf = file =>
  Math.round(
    Number(run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { capture: true }).trim()) * 1000
  );

const log = (...m) => console.log('›', ...m);

/* ------------------------------------------------------------ 1. narration */
const narration = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/components/presentation/narration.json'), 'utf8'));
const REUSE_AUDIO = Boolean(args['reuse-audio']);
fs.mkdirSync(MEDIA, { recursive: true });
fs.mkdirSync(SHARE_DIR, { recursive: true });
if (!REUSE_AUDIO) {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK, 'wav'), { recursive: true });
  fs.writeFileSync(path.join(WORK, 'lines.json'), JSON.stringify(narration.map(n => ({ id: n.id, text: n.tts }))), 'utf8');
  log(`narrating ${narration.length} scenes with ${VOICE}…`);
  run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'tts.ps1'), '-Lines', path.join(WORK, 'lines.json'), '-OutDir', path.join(WORK, 'wav'), '-Voice', VOICE]);
}

/* --------------------------------------------------------------- 2. timing */
const LEAD = 550; // breath before the voice starts
const TAIL = 850; // hold after it ends, before the scene changes
let cursor = 0;
const reused = REUSE_AUDIO ? JSON.parse(fs.readFileSync(path.join(MEDIA, 'narration-timing.json'), 'utf8')) : null;
const scenes = reused ? reused.scenes : narration.map((n, i) => {
  const speech = durationOf(path.join(WORK, 'wav', `${n.id}.wav`));
  const lead = i === 0 ? 1200 : LEAD;
  const tail = i === narration.length - 1 ? 3200 : TAIL;
  const scene = { id: n.id, start: cursor, duration: lead + speech + tail, speechStart: cursor + lead, speechEnd: cursor + lead + speech };
  cursor += scene.duration;
  return scene;
});
const totalMs = reused ? reused.total : cursor;
if (!reused) fs.writeFileSync(path.join(MEDIA, 'narration-timing.json'), JSON.stringify({ voice: VOICE, total: totalMs, scenes }, null, 2));
log(`total ${(totalMs / 1000).toFixed(1)} s${reused ? ' (reusing narration)' : ''}`);

/* ---------------------------------------------------------------- 3. audio */
// A gentle four-chord pad (Cmaj7 – Am7 – Fmaj7 – G), each chord swelling in
// and out over ~10 s with a slight detune for warmth. Kept ~30 dB under voice.
const chords = [
  [130.81, 164.81, 196.0, 246.94],
  [110.0, 130.81, 164.81, 196.0],
  [87.31, 130.81, 174.61, 220.0],
  [98.0, 146.83, 196.0, 246.94],
];
const voices = chords
  .map((notes, s) => {
    const env = `between(mod(t,32)-${s * 8},-1,9)*pow(sin(PI*(mod(t,32)-${s * 8}+1)/10),2)`;
    const tones = notes.map(f => `sin(2*PI*${f}*t)+0.6*sin(2*PI*${(f * 1.004).toFixed(3)}*t)`).join('+');
    return `${env}*(${tones})`;
  })
  .join('+');
const padExpr = `0.045*(${voices})`;
const totalSec = (totalMs / 1000).toFixed(3);

const voiceInputs = [];
const voiceFilters = [];
scenes.forEach((s, i) => {
  voiceInputs.push('-i', path.join(WORK, 'wav', `${s.id}.wav`));
  voiceFilters.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${s.speechStart}|${s.speechStart}[v${i}]`);
});
const n = scenes.length;
const filter = [
  ...voiceFilters,
  `${scenes.map((_, i) => `[v${i}]`).join('')}amix=inputs=${n}:normalize=0:dropout_transition=0,apad=whole_dur=${totalSec}[voice]`,
  `aevalsrc=exprs='${padExpr}|${padExpr}':s=48000:d=${totalSec},lowpass=f=1600,aecho=0.6:0.5:60|90:0.25|0.18,afade=t=in:d=2.5,afade=t=out:st=${(totalMs / 1000 - 3).toFixed(2)}:d=3[pad]`,
  `[voice][pad]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:${totalSec}[out]`,
].join(';');
const narrationM4a = path.join(MEDIA, 'nexgen-for-doctors-narration.m4a');
if (!REUSE_AUDIO) log('mixing narration + pad…');
if (!REUSE_AUDIO) run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...voiceInputs, '-filter_complex', filter, '-map', '[out]', '-c:a', 'aac', '-b:a', '192k', narrationM4a]);

/* ----------------------------------------------------- subtitles (SRT/VTT) */
const stamp = (ms, sep) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = Math.floor(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`;
};
/** Split a scene's line into sentence-sized cues, timed by character share. */
function cuesFor(lang) {
  const cues = [];
  scenes.forEach((s, i) => {
    const text = narration[i][lang];
    const parts = text.split(/(?<=[.?!।])\s+|(?<=—)\s+/).map(p => p.trim()).filter(Boolean);
    const chars = parts.reduce((a, p) => a + p.length, 0);
    let at = s.speechStart;
    const span = s.speechEnd - s.speechStart;
    parts.forEach(p => {
      const len = Math.max(900, Math.round((p.length / chars) * span));
      cues.push({ start: at, end: Math.min(s.speechEnd + 300, at + len), text: p });
      at += len;
    });
  });
  return cues;
}
for (const lang of REUSE_AUDIO ? [] : ['en', 'hi']) {
  const cues = cuesFor(lang);
  fs.writeFileSync(
    path.join(WORK, `${lang}.srt`),
    cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(MEDIA, `nexgen-for-doctors.${lang}.vtt`),
    'WEBVTT\n\n' + cues.map(c => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n'),
    'utf8'
  );
}

/* --------------------------------------------------------------- 4. frames */
const { chromium } = loadPlaywright();

async function captureFrames(dir, query) {
  fs.mkdirSync(dir, { recursive: true });
  const frameCount = Math.ceil((totalMs / 1000) * FPS);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const per = Math.ceil(frameCount / WORKERS);
  const started = Date.now();
  let done = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async (_, w) => {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      await page.goto(`${BASE}/doctors-video?capture=1${query}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(t => window.__presentation?.ready && Math.abs(window.__presentation.total - t) < 5, totalMs, { timeout: 60000 });
      for (let f = w * per; f < Math.min(frameCount, (w + 1) * per); f++) {
        await page.evaluate(ms => window.__presentation.seek(ms), (f * 1000) / FPS);
        await page.screenshot({ path: path.join(dir, `f_${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
        done++;
        if (done % 300 === 0) {
          const rate = done / ((Date.now() - started) / 1000);
          log(`  ${done}/${frameCount} frames · ${rate.toFixed(1)} fps · ~${Math.round((frameCount - done) / rate)} s left`);
        }
      }
      await page.close();
    })
  );
  await browser.close();
  return frameCount;
}

function encode(framesDir, out, withSoftSubs) {
  const inputs = ['-framerate', String(FPS), '-i', path.join(framesDir, 'f_%05d.jpg'), '-i', narrationM4a];
  const maps = ['-map', '0:v', '-map', '1:a'];
  const extra = [];
  if (withSoftSubs) {
    inputs.push('-i', path.join(WORK, 'en.srt'), '-i', path.join(WORK, 'hi.srt'));
    maps.push('-map', '2:s', '-map', '3:s');
    extra.push('-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', 'title=English', '-metadata:s:s:1', 'language=hin', '-metadata:s:s:1', 'title=Hindi');
  }
  run(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...inputs, ...maps,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'animation',
    '-c:a', 'copy', ...extra,
    '-movflags', '+faststart', '-t', (totalMs / 1000).toFixed(3),
    '-metadata', 'title=neXgen Healthcare — for doctors',
    out,
  ]);
}

log(`capturing frames (${WORKERS} tabs, ${FPS} fps)…`);
const mainFrames = path.join(WORK, 'frames');
await captureFrames(mainFrames, '');
log('encoding MP4…');
encode(mainFrames, path.join(MEDIA, 'nexgen-for-doctors.mp4'), true);

// Poster: the end of the intro scene.
const posterFrame = Math.min(Math.floor(((scenes[0].start + scenes[0].duration * 0.85) / 1000) * FPS), fs.readdirSync(mainFrames).length - 1);
fs.copyFileSync(path.join(mainFrames, `f_${String(posterFrame).padStart(5, '0')}.jpg`), path.join(MEDIA, 'nexgen-for-doctors-poster.jpg'));
fs.rmSync(mainFrames, { recursive: true, force: true });

if (!args['skip-hindi']) {
  log('capturing Hindi-captioned version…');
  const hiFrames = path.join(WORK, 'frames-hi');
  await captureFrames(hiFrames, '&captions=hi');
  log('encoding Hindi-captioned MP4…');
  encode(hiFrames, path.join(SHARE_DIR, 'nexgen-for-doctors-hindi-captions.mp4'), false);
  fs.rmSync(hiFrames, { recursive: true, force: true });
}

for (const dir of [MEDIA, SHARE_DIR]) {
  for (const f of fs.readdirSync(dir)) {
    const size = fs.statSync(path.join(dir, f)).size;
    log(`${path.relative(ROOT, path.join(dir, f)).padEnd(56)} ${(size / 1048576).toFixed(1)} MB`);
  }
}
log('done.');
