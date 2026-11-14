/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Users,
  CalendarX2,
  SearchX,
  Search,
  MapPin,
  Star,
  Ticket,
  CheckCircle2,
  IndianRupee,
  ShieldCheck,
  BadgeCheck,
  MessageCircle,
  Smartphone,
  RefreshCw,
  Bell,
  Video,
  Mic,
  PhoneOff,
  FileText,
  Pill,
  Megaphone,
  BarChart3,
  Building2,
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  Captions,
  Clock,
  UserRound,
  Rocket,
  Stethoscope,
  HeartPulse,
} from 'lucide-react';
import type { Doctor } from '../../types';
import { LogoMark } from '../brand/Logo';
import NARRATION from './narration.json';

/* =========================================================================
   neXgen for Doctors — the presentation.

   One 1920×1080 stage, every animation computed from a single clock `t`
   (milliseconds). Nothing uses CSS transitions, so any moment can be rendered
   exactly — which is how scripts/doctor-video records it frame by frame into
   an MP4. Opened at /doctors-video it plays live, with narration audio when
   /media/nexgen-for-doctors-narration.m4a is present.

   ?capture=1        recording mode: no controls, exposes window.__presentation
   ?captions=hi|en   burn narration captions into the frame (WhatsApp version)
   ========================================================================= */

const W = 1920;
const H = 1080;

/* ------------------------------------------------------------- palette */
const C = {
  bg0: '#050b18',
  bg1: '#0a1733',
  bg2: '#10265a',
  blue: '#1f57e0',
  sky: '#3dbdec',
  teal: '#14b19b',
  coral: '#ff7c5e',
  coralDeep: '#f95d3d',
  amber: '#fbbf24',
  rose: '#fb7185',
  green: '#34d399',
  ink: '#0f1b33',
  inkSoft: '#5a6a85',
  line: '#e2e8f2',
  card: '#ffffff',
  white70: 'rgba(255,255,255,0.72)',
  white55: 'rgba(255,255,255,0.55)',
};

const FONT_EN = '"Plus Jakarta Sans", "Noto Sans Devanagari", system-ui, sans-serif';
const FONT_HI = '"Noto Sans Devanagari", "Plus Jakarta Sans", system-ui, sans-serif';

/* -------------------------------------------------------------- easing */
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** 0→1 progress of an element that starts animating at `start` ms for `dur` ms. */
const k = (l: number, start: number, dur = 650) => easeOut(clamp((l - start) / dur));
const fadeUp = (v: number, dist = 36): React.CSSProperties => ({ opacity: v, transform: `translateY(${(1 - v) * dist}px)` });
const fadeLeft = (v: number, dist = 60): React.CSSProperties => ({ opacity: v, transform: `translateX(${(1 - v) * dist}px)` });
const pop = (v: number): React.CSSProperties => ({ opacity: v, transform: `scale(${0.82 + 0.18 * v})` });
const lerp = (a: number, b: number, v: number) => a + (b - a) * v;

/* ------------------------------------------------------------- copy */
interface SceneCopy {
  eyebrow: [string, string];
  title: [string, string];
  bullets?: Array<[string, string]>;
}

const COPY: Record<string, SceneCopy> = {
  s01: { eyebrow: ['For doctors', 'डॉक्टरों के लिए'], title: ['More patients. Calmer OPD. 100% of your fee.', 'ज़्यादा मरीज़। शांत OPD। आपकी पूरी 100% फीस।'] },
  s02: { eyebrow: ['The problem', 'समस्या'], title: ['Crowds, no-shows and missed patients.', 'भीड़, नो-शो और छूटते मरीज़।'] },
  s03: {
    eyebrow: ['The solution', 'समाधान'],
    title: ['Patients book online. ₹50 confirms the seat.', 'मरीज़ ऑनलाइन बुक करते हैं। ₹50 से सीट पक्की।'],
    bullets: [
      ['Find by speciality or area', 'विशेषज्ञता या इलाके से खोजें'],
      ['Pick a day and time', 'दिन और समय चुनें'],
      ['₹50 confirms seat + token', '₹50 से सीट और टोकन पक्का'],
    ],
  },
  s04: {
    eyebrow: ['Your fee', 'आपकी फीस'],
    title: ['Your consultation fee stays 100% yours.', 'आपकी परामर्श फीस 100% आपकी।'],
    bullets: [
      ['0% commission — ever', '0% कमीशन — कभी नहीं'],
      ['Collected by you, at your clinic', 'फीस आप ही क्लिनिक पर लेते हैं'],
      ['Free to join, no monthly charge', 'मुफ़्त जुड़ें, कोई मासिक शुल्क नहीं'],
    ],
  },
  s05: {
    eyebrow: ['More patients', 'ज़्यादा मरीज़'],
    title: ['Be found by every patient nearby.', 'आस-पास का हर मरीज़ आपको ढूँढ सके।'],
    bullets: [
      ['Photo, experience & ratings', 'फ़ोटो, अनुभव और रेटिंग'],
      ['Your chamber pinned on the map', 'नक्शे पर आपका चैंबर'],
      ['Your next free slot, live', 'आपका अगला खाली समय, लाइव'],
    ],
  },
  s06: {
    eyebrow: ['Fewer no-shows', 'कम नो-शो'],
    title: ['Paid bookings show up.', 'पक्की बुकिंग, पक्का मरीज़।'],
    bullets: [
      ['₹50 paid = real commitment', '₹50 दिए = पक्का इरादा'],
      ['WhatsApp & SMS reminders', 'WhatsApp और SMS रिमाइंडर'],
      ['Free reschedule, not a no-show', 'नो-शो नहीं, मुफ़्त रीशेड्यूल'],
    ],
  },
  s07: {
    eyebrow: ['Waitlist', 'वेटलिस्ट'],
    title: ['A cancelled seat is refilled instantly.', 'रद्द सीट तुरंत फिर से भर जाती है।'],
    bullets: [
      ['Automatic waitlist alerts', 'वेटलिस्ट को अपने-आप सूचना'],
      ['Seats refilled, not wasted', 'सीट बर्बाद नहीं, फिर से भरी'],
      ['No extra work for your desk', 'डेस्क पर कोई अतिरिक्त काम नहीं'],
    ],
  },
  s08: {
    eyebrow: ['Organised OPD', 'व्यवस्थित OPD'],
    title: ['A calm OPD that runs on tokens.', 'टोकन से चलने वाली शांत OPD।'],
    bullets: [
      ['Token numbers in booking order', 'बुकिंग क्रम में टोकन नंबर'],
      ['A per-slot limit you set', 'हर स्लॉट की सीमा आप तय करें'],
      ['Live queue for your desk', 'आपकी डेस्क के लिए लाइव कतार'],
    ],
  },
  s09: {
    eyebrow: ['Video consults', 'वीडियो परामर्श'],
    title: ['See more patients — without adding chairs.', 'ज़्यादा मरीज़ देखें — बिना कुर्सी बढ़ाए।'],
    bullets: [
      ['Follow-ups from anywhere', 'कहीं से भी फ़ॉलो-अप'],
      ['Reach patients from far away', 'दूर के मरीज़ों तक पहुँच'],
      ['Evening sessions from home', 'घर से शाम का सत्र'],
    ],
  },
  s10: {
    eyebrow: ['Repeat patients', 'दोबारा आने वाले मरीज़'],
    title: ['Digital prescriptions that bring patients back.', 'डिजिटल पर्चा, जो मरीज़ को वापस लाए।'],
    bullets: [
      ['Rx in the patient’s vault instantly', 'पर्चा तुरंत मरीज़ के वॉल्ट में'],
      ['History ready at the next visit', 'अगली विज़िट पर पूरा इतिहास'],
      ['One-tap “Book again”', 'एक टैप में “फिर से बुक”'],
    ],
  },
  s11: {
    eyebrow: ['Trust & updates', 'भरोसा और सूचना'],
    title: ['Ratings build trust. One click informs everyone.', 'रेटिंग से भरोसा। एक क्लिक में सबको सूचना।'],
    bullets: [
      ['Ratings after every visit', 'हर विज़िट के बाद रेटिंग'],
      ['Delay notice to all in one click', 'एक क्लिक में सबको देरी की सूचना'],
      ['Fewer calls to your desk', 'डेस्क पर कम फ़ोन कॉल'],
    ],
  },
  s12: {
    eyebrow: ['Insights', 'जानकारी'],
    title: ['Every chamber. One dashboard.', 'हर चैंबर। एक डैशबोर्ड।'],
    bullets: [
      ['Several chambers, one profile', 'कई चैंबर, एक प्रोफ़ाइल'],
      ['Today’s bookings & chamber load', 'आज की बुकिंग और भीड़'],
      ['Follow-ups and ratings', 'फ़ॉलो-अप और रेटिंग'],
    ],
  },
  s13: { eyebrow: ['Revenue', 'आमदनी'], title: ['More patients. More revenue. All yours.', 'ज़्यादा मरीज़। ज़्यादा आमदनी। सब आपकी।'] },
  s14: { eyebrow: ['How to join', 'कैसे जुड़ें'], title: ['Join in three simple steps.', 'तीन आसान कदमों में जुड़ें।'] },
  s15: { eyebrow: ['Join free today', 'आज ही मुफ़्त जुड़ें'], title: ['More patients. Calmer OPD. 100% of your fee.', 'ज़्यादा मरीज़। शांत OPD। आपकी पूरी 100% फीस।'] },
};

interface NarrationLine {
  id: string;
  en: string;
  hi: string;
  tts: string;
}

interface SceneTiming {
  id: string;
  start: number;
  duration: number;
  speechStart: number;
  speechEnd: number;
}

/** Without recorded narration, estimate each scene from its word count. */
function estimatedTimings(): SceneTiming[] {
  let start = 0;
  return (NARRATION as NarrationLine[]).map(line => {
    const words = line.tts.split(/\s+/).length;
    const speech = Math.round((words / 2.55) * 1000);
    const duration = speech + 1300;
    const timing = { id: line.id, start, duration, speechStart: start + 500, speechEnd: start + 500 + speech };
    start += duration;
    return timing;
  });
}

declare global {
  interface Window {
    __presentation?: { ready: boolean; total: number; seek: (ms: number) => void };
  }
}

/* =========================================================================
   Root
   ========================================================================= */
export default function DoctorPresentation() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const capture = params.get('capture') === '1';
  const burnCaptions = (params.get('captions') as 'hi' | 'en' | null) ?? null;

  const [timings, setTimings] = useState<SceneTiming[]>(estimatedTimings);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(!capture);
  const [captionLang, setCaptionLang] = useState<'en' | 'hi' | 'off'>(burnCaptions ?? 'off');
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioOk, setAudioOk] = useState(false);
  const tRef = useRef(0);
  tRef.current = t;

  const total = timings.length ? timings[timings.length - 1].start + timings[timings.length - 1].duration : 1;

  // Keep the presentation true-colour whatever the site theme is.
  useLayoutEffect(() => {
    document.title = 'neXgen Healthcare — for doctors';
  }, []);

  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Load recorded timings (if the video build has run) and the doctor directory.
  useEffect(() => {
    let cancelled = false;
    const timingP = fetch('/media/narration-timing.json')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data?.scenes?.length) setTimings(data.scenes);
      })
      .catch(() => {});
    const docsP = fetch('/api/doctors')
      .then(r => (r.ok ? r.json() : []))
      .then((docs: Doctor[]) => {
        if (cancelled) return docs;
        setDoctors(docs);
        return docs;
      })
      .catch(() => [] as Doctor[]);

    Promise.all([timingP, docsP]).then(async ([, docs]) => {
      // Preload every photo the scenes use, then the fonts — a recorded frame
      // must never catch an image half-decoded.
      const urls = Array.from(new Set((docs || []).map(d => d.image).filter(Boolean))) as string[];
      await Promise.all(
        urls.slice(0, 8).map(
          src =>
            new Promise<void>(resolve => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = src;
            })
        )
      );
      await (document as any).fonts?.ready;
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Recording hook.
  useEffect(() => {
    window.__presentation = {
      ready,
      total,
      seek: (ms: number) => flushSync(() => setT(ms)),
    };
  }, [ready, total]);

  // Live playback: follow the narration audio when present, otherwise a clock.
  useEffect(() => {
    if (capture || !playing || !ready) return;
    let raf = 0;
    let last = performance.now();
    const audio = audioRef.current;
    if (audio && audioOk) {
      audio.currentTime = tRef.current / 1000;
      audio.play().catch(() => setAudioOk(false));
    }
    const tick = (now: number) => {
      const a = audioRef.current;
      let next = a && audioOk && !a.paused ? a.currentTime * 1000 : tRef.current + (now - last);
      last = now;
      if (next >= total) {
        setT(total);
        setPlaying(false);
        return;
      }
      tRef.current = next;
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      audio?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ready, audioOk, capture, total]);

  const restart = useCallback(() => {
    setT(0);
    setPlaying(true);
  }, []);

  // Which scene, and where inside it.
  const sceneIndex = Math.max(0, timings.findIndex(s => t >= s.start && t < s.start + s.duration));
  const idx = t >= total ? timings.length - 1 : sceneIndex;
  const scene = timings[idx];
  const local = t - (scene?.start ?? 0);
  const D = scene?.duration ?? 1;
  const isLast = idx === timings.length - 1;
  const sceneFade = Math.min(k(local, 0, 450), isLast ? 1 : 1 - clamp((local - (D - 420)) / 420));
  const line = (NARRATION as NarrationLine[])[idx];
  const showCaption =
    captionLang !== 'off' && scene && t >= scene.speechStart - 150 && t <= scene.speechEnd + 400;

  const ctx: SceneCtx = { l: local, D, doctors, t };

  return (
    <div className="presentation-root" style={{ position: 'fixed', inset: 0, background: C.bg0, overflow: 'hidden', fontFamily: FONT_EN }}>
      {!capture && (
        <audio
          ref={audioRef}
          src="/media/nexgen-for-doctors-narration.m4a"
          preload="auto"
          onCanPlay={() => setAudioOk(true)}
          onError={() => setAudioOk(false)}
        />
      )}

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: W,
          height: H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center',
          overflow: 'hidden',
          color: '#fff',
        }}
      >
        <Backdrop t={t} />

        {scene && (
          <div style={{ position: 'absolute', inset: 0, opacity: sceneFade }}>
            {renderScene(scene.id, ctx)}
          </div>
        )}

        <Chrome idx={idx} count={timings.length} t={t} total={total} hideLogo={scene?.id === 's01' || scene?.id === 's15'} />

        {showCaption && line && (
          <div
            style={{
              position: 'absolute',
              left: 160,
              right: 160,
              bottom: 74,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                background: 'rgba(5,11,24,0.82)',
                color: '#fff',
                padding: '14px 26px',
                borderRadius: 16,
                fontSize: captionLang === 'hi' ? 34 : 32,
                lineHeight: 1.45,
                fontWeight: 600,
                textAlign: 'center',
                fontFamily: captionLang === 'hi' ? FONT_HI : FONT_EN,
                maxWidth: 1500,
                boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
              }}
            >
              {captionLang === 'hi' ? line.hi : line.en}
            </span>
          </div>
        )}
      </div>

      {!capture && (
        <Controls
          playing={playing}
          onToggle={() => (t >= total ? restart() : setPlaying(p => !p))}
          onRestart={restart}
          t={t}
          total={total}
          onSeek={ms => {
            setT(ms);
            if (audioRef.current && audioOk) audioRef.current.currentTime = ms / 1000;
          }}
          captionLang={captionLang}
          onCaption={setCaptionLang}
          timings={timings}
          ready={ready}
          hasAudio={audioOk}
        />
      )}
    </div>
  );
}

interface SceneCtx {
  l: number;
  D: number;
  doctors: Doctor[];
  t: number;
}

function renderScene(id: string, ctx: SceneCtx) {
  switch (id) {
    case 's01':
      return <Intro {...ctx} />;
    case 's02':
      return <Split id={id} ctx={ctx} visual={<ProblemVisual {...ctx} />} />;
    case 's03':
      return <Split id={id} ctx={ctx} visual={<BookingPhone {...ctx} />} />;
    case 's04':
      return <Split id={id} ctx={ctx} visual={<FeeFlow {...ctx} />} />;
    case 's05':
      return <Split id={id} ctx={ctx} visual={<SearchVisual {...ctx} />} />;
    case 's06':
      return <Split id={id} ctx={ctx} visual={<RemindersVisual {...ctx} />} />;
    case 's07':
      return <Split id={id} ctx={ctx} visual={<WaitlistVisual {...ctx} />} />;
    case 's08':
      return <Split id={id} ctx={ctx} visual={<QueueVisual {...ctx} />} />;
    case 's09':
      return <Split id={id} ctx={ctx} visual={<VideoVisual {...ctx} />} />;
    case 's10':
      return <Split id={id} ctx={ctx} visual={<RxVisual {...ctx} />} />;
    case 's11':
      return <Split id={id} ctx={ctx} visual={<TrustVisual {...ctx} />} />;
    case 's12':
      return <Split id={id} ctx={ctx} visual={<DashboardVisual {...ctx} />} />;
    case 's13':
      return <Split id={id} ctx={ctx} visual={<RevenueVisual {...ctx} />} wideVisual />;
    case 's14':
      return <JoinSteps {...ctx} />;
    case 's15':
      return <Outro {...ctx} />;
    default:
      return null;
  }
}

/* =========================================================================
   Persistent layers
   ========================================================================= */
function Backdrop({ t }: { t: number }) {
  const s = t / 1000;
  return (
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(1200px 800px at 20% 10%, ${C.bg2} 0%, ${C.bg1} 45%, ${C.bg0} 100%)` }}>
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          borderRadius: '50%',
          left: 1200 + Math.sin(s / 7) * 80,
          top: -300 + Math.cos(s / 9) * 60,
          background: 'radial-gradient(circle, rgba(20,177,155,0.28), transparent 65%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1000,
          height: 1000,
          borderRadius: '50%',
          left: -350 + Math.cos(s / 8) * 70,
          top: 450 + Math.sin(s / 6) * 60,
          background: 'radial-gradient(circle, rgba(31,87,224,0.30), transparent 65%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.035) 2px, transparent 2px), linear-gradient(to bottom, rgba(255,255,255,0.035) 2px, transparent 2px)',
          backgroundSize: '48px 48px',
          backgroundPosition: `${-24 + ((s * 6) % 48)}px -24px`,
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
      />
    </div>
  );
}

function Chrome({ idx, count, t, total, hideLogo }: { idx: number; count: number; t: number; total: number; hideLogo: boolean }) {
  return (
    <>
      <div style={{ position: 'absolute', left: 96, top: 64, display: 'flex', alignItems: 'center', gap: 16, opacity: hideLogo ? 0 : 1 }}>
        <LogoMark size={52} role="doctor" />
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>
            ne<span style={{ color: C.sky }}>X</span>gen <span style={{ fontWeight: 600, color: C.white70 }}>Healthcare</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: C.teal, textTransform: 'uppercase' }}>
            For doctors · <span style={{ fontFamily: FONT_HI, letterSpacing: 0 }}>डॉक्टरों के लिए</span>
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 96,
          top: 76,
          fontSize: 18,
          fontWeight: 700,
          color: C.white55,
          letterSpacing: 2,
          fontFamily: '"IBM Plex Mono", monospace',
        }}
      >
        {String(idx + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
      </div>
      <div style={{ position: 'absolute', left: 96, right: 96, bottom: 40, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.10)' }}>
        <div
          style={{
            width: `${clamp(t / total) * 100}%`,
            height: '100%',
            borderRadius: 3,
            background: `linear-gradient(90deg, ${C.blue}, ${C.teal}, ${C.coral})`,
          }}
        />
      </div>
    </>
  );
}

/** Left: eyebrow + bilingual title + bilingual bullets. Right: the scene's visual. */
function Split({ id, ctx, visual, wideVisual = false }: { id: string; ctx: SceneCtx; visual: React.ReactNode; wideVisual?: boolean }) {
  const copy = COPY[id];
  const { l } = ctx;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: wideVisual ? '700px 1fr' : '760px 1fr', gap: 60, padding: '190px 96px 120px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ ...fadeUp(k(l, 100)), display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 999, background: 'rgba(20,177,155,0.16)', color: '#5fe0c8', fontWeight: 800, fontSize: 20, letterSpacing: 2, textTransform: 'uppercase' }}>
          {copy.eyebrow[0]} <span style={{ opacity: 0.6 }}>·</span> <span style={{ fontFamily: FONT_HI, letterSpacing: 0, textTransform: 'none' }}>{copy.eyebrow[1]}</span>
        </div>
        <h2 style={{ ...fadeUp(k(l, 250, 750)), margin: '28px 0 0', fontSize: 66, lineHeight: 1.08, fontWeight: 800, letterSpacing: -1.5 }}>{copy.title[0]}</h2>
        <p style={{ ...fadeUp(k(l, 520, 750)), margin: '20px 0 0', fontFamily: FONT_HI, fontSize: 38, lineHeight: 1.4, fontWeight: 700, color: '#93b4ff' }}>{copy.title[1]}</p>
        {copy.bullets && (
          <ul style={{ listStyle: 'none', margin: '44px 0 0', padding: 0, display: 'grid', gap: 20 }}>
            {copy.bullets.map((b, i) => (
              <li key={b[0]} style={{ ...fadeLeft(k(l, 1100 + i * 650), -40), display: 'flex', alignItems: 'flex-start', gap: 18 }}>
                <span style={{ marginTop: 4, width: 36, height: 36, flexShrink: 0, borderRadius: 12, background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={22} color="#fff" />
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 30, fontWeight: 700 }}>{b[0]}</span>
                  <span style={{ display: 'block', fontSize: 25, fontFamily: FONT_HI, color: C.white70, marginTop: 2 }}>{b[1]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{visual}</div>
    </div>
  );
}

/* =========================================================================
   Building blocks
   ========================================================================= */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties; key?: string }) {
  return (
    <div style={{ background: C.card, color: C.ink, borderRadius: 28, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.55)', ...style }}>
      {children}
    </div>
  );
}

function Avatar({ doctor, size, radius = 20 }: { doctor?: Doctor; size: number; radius?: number }) {
  if (doctor?.image) {
    return (
      <img
        src={doctor.image}
        alt=""
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', objectPosition: 'top', flexShrink: 0, filter: 'none' }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: 'linear-gradient(135deg,#dce8ff,#cdf9ef)', color: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.32 }}>
      Dr
    </div>
  );
}

function Phone({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ width: 400, height: 800, borderRadius: 56, background: '#0b1220', padding: 14, boxShadow: '0 40px 100px -20px rgba(0,0,0,0.7), inset 0 0 0 2px rgba(255,255,255,0.08)', ...style }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 44, overflow: 'hidden', background: '#f4f7fc', color: C.ink }}>
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', width: 120, height: 30, borderRadius: 20, background: '#0b1220', zIndex: 5 }} />
        {children}
      </div>
    </div>
  );
}

const pickDoctors = (doctors: Doctor[]) => {
  const withPhoto = doctors.filter(d => d.image && d.isActive !== false);
  const uniq: Doctor[] = [];
  withPhoto.forEach(d => {
    if (!uniq.some(u => u.name === d.name)) uniq.push(d);
  });
  return uniq;
};

/* =========================================================================
   Scenes
   ========================================================================= */
function Intro({ l, D }: SceneCtx) {
  const ring = (delay: number) => {
    const v = clamp(((l - delay) % 3000) / 3000);
    return { width: 220 + v * 700, height: 220 + v * 700, opacity: (1 - v) * 0.35 };
  };
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      {[0, 1000, 2000].map(d => (
        <div key={d} style={{ position: 'absolute', left: '50%', top: 380, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `3px solid ${C.teal}`, ...ring(d) }} />
      ))}
      <div style={{ ...pop(k(l, 150, 800)), marginTop: -40 }}>
        <LogoMark size={200} role="doctor" />
      </div>
      <div style={{ ...fadeUp(k(l, 700)), marginTop: 44, fontSize: 92, fontWeight: 800, letterSpacing: -3 }}>
        ne<span style={{ background: `linear-gradient(135deg, ${C.sky}, ${C.teal})`, WebkitBackgroundClip: 'text', color: 'transparent' }}>X</span>gen{' '}
        <span style={{ fontWeight: 600, color: C.white70 }}>Healthcare</span>
      </div>
      <div style={{ ...fadeUp(k(l, 1300)), marginTop: 22, fontSize: 46, fontWeight: 700 }}>{COPY.s01.title[0]}</div>
      <div style={{ ...fadeUp(k(l, 1700)), marginTop: 12, fontSize: 40, fontFamily: FONT_HI, fontWeight: 700, color: '#93b4ff' }}>{COPY.s01.title[1]}</div>
      <div style={{ ...fadeUp(k(l, 2300)), marginTop: 40, display: 'flex', gap: 16 }}>
        {[
          ['Free to join', 'मुफ़्त जुड़ें'],
          ['0% commission', '0% कमीशन'],
          ['Patients pay ₹50 to book', 'मरीज़ ₹50 देकर बुक करते हैं'],
        ].map(([en, hi]) => (
          <span key={en} style={{ padding: '14px 24px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', fontSize: 24, fontWeight: 700 }}>
            {en} <span style={{ fontFamily: FONT_HI, color: C.white70, fontWeight: 600 }}>· {hi}</span>
          </span>
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 110, opacity: k(l, 2800) * (1 - clamp((l - D + 600) / 600)), fontSize: 20, color: C.white55, letterSpacing: 4, textTransform: 'uppercase', fontWeight: 700 }}>
        A 3-minute guide for doctors
      </div>
    </div>
  );
}

function ProblemVisual({ l }: SceneCtx) {
  const items = [
    { icon: Users, en: 'Waiting rooms overflow', hi: 'वेटिंग रूम में भीड़', tone: C.amber },
    { icon: CalendarX2, en: 'No-shows waste booked slots', hi: 'नो-शो से स्लॉट बर्बाद', tone: C.rose },
    { icon: SearchX, en: 'Patients can’t find you online', hi: 'मरीज़ आपको ऑनलाइन नहीं ढूँढ पाते', tone: C.coral },
  ];
  return (
    <div style={{ display: 'grid', gap: 28, width: 820 }}>
      {items.map((it, i) => {
        const v = k(l, 900 + i * 1700, 800);
        return (
          <Card key={it.en} style={{ ...fadeLeft(v, 120), display: 'flex', alignItems: 'center', gap: 28, padding: '30px 36px' }}>
            <span style={{ width: 92, height: 92, borderRadius: 26, background: `${it.tone}26`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <it.icon size={50} color={it.tone} />
            </span>
            <div>
              <div style={{ fontSize: 38, fontWeight: 800 }}>{it.en}</div>
              <div style={{ fontSize: 30, fontFamily: FONT_HI, color: C.inkSoft, fontWeight: 600, marginTop: 4 }}>{it.hi}</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function BookingPhone({ l, D, doctors }: SceneCtx) {
  const doc = pickDoctors(doctors)[0];
  const phase = clamp((l - 600) / Math.max(1, D - 1800));
  const screen = phase < 0.34 ? 0 : phase < 0.68 ? 1 : 2;
  const screenStart = [600, 600 + (D - 1800) * 0.34, 600 + (D - 1800) * 0.68][screen];
  const sv = k(l, screenStart, 500);
  const slots = ['09:00 AM', '10:00 AM', '11:00 AM', '04:00 PM', '05:00 PM', '06:00 PM'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 70 }}>
      <div style={{ ...pop(k(l, 200, 800)) }}>
        <Phone>
          <div style={{ padding: '64px 24px 24px', height: '100%', ...fadeUp(sv, 20) }}>
            {screen === 0 && (
              <>
                <div style={{ fontSize: 22, fontWeight: 800 }}>Find a doctor</div>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 16, padding: '14px 16px', border: `1px solid ${C.line}`, fontSize: 17, color: C.inkSoft }}>
                  <Search size={20} color={C.blue} /> Cardiology · Line Bazar
                </div>
                <div style={{ marginTop: 18, background: '#fff', borderRadius: 22, overflow: 'hidden', border: `1px solid ${C.line}` }}>
                  <div style={{ height: 230, overflow: 'hidden' }}>
                    <Avatar doctor={doc} size={372} radius={0} />
                  </div>
                  <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 21, fontWeight: 800 }}>{doc?.name || 'Dr. Rajesh Sharma'}</div>
                    <div style={{ fontSize: 16, color: C.blue, fontWeight: 600 }}>{doc?.specialty || 'Cardiologist'}</div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 10, fontSize: 15, color: C.inkSoft }}>
                      <Star size={16} color={C.amber} fill={C.amber} /> {doc?.rating || 4.9} · {doc?.experienceYears || 18}+ yrs
                    </div>
                    <div style={{ marginTop: 14, borderRadius: 14, background: C.coralDeep, color: '#fff', textAlign: 'center', padding: '12px 0', fontWeight: 800, fontSize: 18 }}>Book for ₹50</div>
                  </div>
                </div>
              </>
            )}
            {screen === 1 && (
              <>
                <div style={{ fontSize: 22, fontWeight: 800 }}>Pick a time</div>
                <div style={{ marginTop: 6, fontSize: 16, color: C.inkSoft }}>Tomorrow · {doc?.name || 'Dr. Rajesh Sharma'}</div>
                <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {slots.map((s, i) => {
                    const chosen = i === 1 && k(l, screenStart + 700, 300) > 0.5;
                    return (
                      <div key={s} style={{ borderRadius: 14, padding: '16px 0', textAlign: 'center', border: `2px solid ${chosen ? C.blue : C.line}`, background: chosen ? C.blue : '#fff', color: chosen ? '#fff' : C.ink }}>
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700, fontSize: 18 }}>{s}</div>
                        <div style={{ fontSize: 13, color: chosen ? 'rgba(255,255,255,0.8)' : '#059669' }}>{3 - (i % 3)} left</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 26, borderRadius: 16, background: '#fff', border: `1px solid ${C.line}`, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
                    <span>Booking fee</span> <span>₹50</span>
                  </div>
                  <div style={{ fontSize: 14, color: C.inkSoft, marginTop: 4 }}>Doctor’s fee paid at the clinic</div>
                </div>
                <div style={{ marginTop: 18, borderRadius: 14, background: C.coralDeep, color: '#fff', textAlign: 'center', padding: '15px 0', fontWeight: 800, fontSize: 19 }}>Pay ₹50 & confirm</div>
              </>
            )}
            {screen === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 70 }}>
                <span style={{ ...pop(k(l, screenStart + 100, 600)), width: 120, height: 120, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={72} color="#fff" />
                </span>
                <div style={{ marginTop: 26, fontSize: 28, fontWeight: 800 }}>Booking confirmed</div>
                <div style={{ marginTop: 8, fontSize: 17, color: C.inkSoft }}>Tomorrow · 10:00 AM</div>
                <div style={{ marginTop: 28, borderRadius: 22, border: '2px dashed #34d399', padding: '18px 40px', background: '#ecfdf5' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 2, color: '#047857' }}>OPD TOKEN</div>
                  <div style={{ fontSize: 64, fontWeight: 800, fontFamily: '"IBM Plex Mono", monospace', color: '#065f46' }}>T-07</div>
                </div>
                <div style={{ marginTop: 24, fontSize: 16, color: C.inkSoft, lineHeight: 1.5 }}>Pay the doctor’s fee<br />at the clinic, as usual.</div>
              </div>
            )}
          </div>
        </Phone>
      </div>
      <div style={{ display: 'grid', gap: 22 }}>
        {[
          { n: 1, en: 'Find', hi: 'खोजें', icon: Search },
          { n: 2, en: 'Pick a slot', hi: 'स्लॉट चुनें', icon: Clock },
          { n: 3, en: 'Pay ₹50 → token', hi: '₹50 → टोकन', icon: Ticket },
        ].map((s, i) => {
          const active = i === screen;
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: lerp(0.4, 1, active ? 1 : i < screen ? 0.6 : 0), transform: `scale(${active ? 1.06 : 1})`, transformOrigin: 'left center' }}>
              <span style={{ width: 70, height: 70, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? C.coralDeep : i < screen ? C.teal : 'rgba(255,255,255,0.1)' }}>
                {i < screen ? <CheckCircle2 size={36} color="#fff" /> : <s.icon size={34} color="#fff" />}
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 32, fontWeight: 800 }}>{s.en}</span>
                <span style={{ display: 'block', fontSize: 26, fontFamily: FONT_HI, color: C.white70 }}>{s.hi}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeeFlow({ l }: SceneCtx) {
  const pct = Math.round(100 * k(l, 2600, 1600));
  const arrow = (start: number) => clamp((l - start) / 900);
  return (
    <div style={{ position: 'relative', width: 880, height: 640 }}>
      {/* patient */}
      <div style={{ ...pop(k(l, 300)), position: 'absolute', left: 0, top: 230, width: 200, textAlign: 'center' }}>
        <span style={{ margin: '0 auto', width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <UserRound size={78} color="#fff" />
        </span>
        <div style={{ marginTop: 14, fontSize: 30, fontWeight: 800 }}>Patient</div>
        <div style={{ fontSize: 24, fontFamily: FONT_HI, color: C.white70 }}>मरीज़</div>
      </div>
      {/* arrows */}
      <svg width="880" height="640" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="ga" x1="0" x2="1">
            <stop offset="0" stopColor={C.coral} />
            <stop offset="1" stopColor={C.coralDeep} />
          </linearGradient>
          <linearGradient id="gb" x1="0" x2="1">
            <stop offset="0" stopColor={C.teal} />
            <stop offset="1" stopColor="#5fe0c8" />
          </linearGradient>
        </defs>
        <path d="M200 290 C 300 200, 340 140, 460 130" fill="none" stroke="url(#ga)" strokeWidth="8" strokeLinecap="round" strokeDasharray="400" strokeDashoffset={400 * (1 - arrow(900))} />
        <path d="M200 350 C 300 440, 340 500, 460 500" fill="none" stroke="url(#gb)" strokeWidth="12" strokeLinecap="round" strokeDasharray="400" strokeDashoffset={400 * (1 - arrow(1700))} />
      </svg>
      {/* neXgen box */}
      <Card style={{ ...fadeLeft(k(l, 1300), 80), position: 'absolute', left: 470, top: 40, width: 410, padding: '26px 30px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <LogoMark size={70} showBadge={false} />
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.inkSoft }}>Booking fee → neXgen</div>
          <div style={{ fontSize: 52, fontWeight: 800, color: C.coralDeep, lineHeight: 1.05 }}>₹50</div>
          <div style={{ fontSize: 20, fontFamily: FONT_HI, color: C.inkSoft }}>बुकिंग फीस</div>
        </div>
      </Card>
      {/* doctor box */}
      <Card style={{ ...fadeLeft(k(l, 2100), 80), position: 'absolute', left: 470, top: 360, width: 410, padding: '30px 30px', border: `4px solid ${C.teal}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ width: 70, height: 70, borderRadius: 20, background: '#cdf9ef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Stethoscope size={40} color="#0c8f7f" />
          </span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.inkSoft }}>Your fee → you, at clinic</div>
            <div style={{ fontSize: 62, fontWeight: 800, color: '#0c8f7f', lineHeight: 1.05 }}>{pct}%</div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 22, fontFamily: FONT_HI, color: C.inkSoft }}>आपकी फीस — सीधे आपको</div>
      </Card>
      <div style={{ ...fadeUp(k(l, 3400)), position: 'absolute', left: 470, top: 600, display: 'flex', gap: 12 }}>
        {['0% commission', 'Free to join'].map(b => (
          <span key={b} style={{ padding: '10px 18px', borderRadius: 999, background: 'rgba(52,211,153,0.16)', color: C.green, fontWeight: 800, fontSize: 20 }}>
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

function SearchVisual({ l, doctors }: SceneCtx) {
  const query = 'skin doctor near Line Bazar';
  const typed = query.slice(0, Math.floor(clamp((l - 500) / 1800) * query.length));
  const docs = pickDoctors(doctors).slice(0, 3);
  return (
    <Card style={{ ...pop(k(l, 150, 700)), width: 900, padding: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderRadius: 18, border: `2px solid ${C.blue}`, padding: '18px 22px', fontSize: 26, fontWeight: 600 }}>
        <Search size={30} color={C.blue} />
        <span>{typed}</span>
        <span style={{ width: 3, height: 32, background: C.blue, opacity: Math.floor(l / 450) % 2 ? 0 : 1 }} />
      </div>
      <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
        {docs.map((d, i) => {
          const v = k(l, 2500 + i * 450, 600);
          const top = i === 0;
          return (
            <div key={d.id} style={{ ...fadeUp(v, 30), display: 'flex', alignItems: 'center', gap: 20, padding: 18, borderRadius: 22, border: `2px solid ${top ? C.teal : C.line}`, background: top ? '#effdfa' : '#fff' }}>
              <Avatar doctor={d} size={96} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 26, fontWeight: 800 }}>
                  {d.name} <BadgeCheck size={24} color={C.blue} />
                </div>
                <div style={{ fontSize: 19, color: C.blue, fontWeight: 600 }}>{d.specialty}</div>
                <div style={{ marginTop: 6, display: 'flex', gap: 18, fontSize: 18, color: C.inkSoft }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Star size={18} color={C.amber} fill={C.amber} /> {d.rating}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={18} color={C.coralDeep} /> {d.area || d.district}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, color: C.inkSoft, fontWeight: 600 }}>Next free</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{['Today 5:00 PM', 'Tomorrow 10:00', 'Today 6:30 PM'][i]}</div>
                {top && (
                  <div style={{ marginTop: 8, borderRadius: 12, background: C.coralDeep, color: '#fff', padding: '8px 16px', fontSize: 17, fontWeight: 800, transform: `scale(${1 + 0.05 * Math.sin(l / 220)})` }}>
                    Book ₹50
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RemindersVisual({ l, doctors }: SceneCtx) {
  const doc = pickDoctors(doctors)[1] || pickDoctors(doctors)[0];
  const bubbles = [
    { icon: MessageCircle, tone: '#25d366', title: 'WhatsApp', text: `Reminder: your visit with ${doc?.name || 'your doctor'} is tomorrow at 10:00 AM. Token T-04.`, at: 700 },
    { icon: Smartphone, tone: C.blue, title: 'SMS', text: 'neXgen: Reach 15 min early. Show token T-04 at the desk.', at: 2600 },
    { icon: RefreshCw, tone: C.teal, title: 'Rescheduled', text: 'Moved to Thu, 11:00 AM — no extra charge. See you then!', at: 4700 },
  ];
  return (
    <div style={{ ...pop(k(l, 100, 700)) }}>
      <Phone style={{ width: 460, height: 820 }}>
        <div style={{ padding: '70px 22px', display: 'grid', gap: 18, background: 'linear-gradient(180deg,#e9eef8,#f4f7fc)', height: '100%' }}>
          <div style={{ textAlign: 'center', fontSize: 56, fontWeight: 300, color: C.ink, letterSpacing: -1 }}>9:41</div>
          {bubbles.map(b => {
            const v = k(l, b.at, 600);
            return (
              <div key={b.title} style={{ ...fadeUp(v, 40), background: '#fff', borderRadius: 22, padding: 16, boxShadow: '0 10px 30px -12px rgba(15,27,51,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 800, color: C.inkSoft }}>
                  <span style={{ width: 32, height: 32, borderRadius: 10, background: b.tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <b.icon size={18} color="#fff" />
                  </span>
                  {b.title} <span style={{ marginLeft: 'auto', fontWeight: 600 }}>now</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 19, lineHeight: 1.4, fontWeight: 600, color: C.ink }}>{b.text}</div>
              </div>
            );
          })}
        </div>
      </Phone>
    </div>
  );
}

function WaitlistVisual({ l, D }: SceneCtx) {
  const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '04:00', '04:30', '05:00', '05:30', '06:00', '06:30'];
  const cancelAt = D * 0.28;
  const fillAt = D * 0.58;
  const target = 5;
  return (
    <div style={{ position: 'relative', width: 900 }}>
      <Card style={{ ...pop(k(l, 100, 700)), padding: 34 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>Today’s OPD slots</div>
          <div style={{ fontSize: 20, color: C.inkSoft, fontWeight: 600 }}>12 / 12 booked</div>
        </div>
        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {times.map((tm, i) => {
            const isTarget = i === target;
            const cancelled = isTarget && l > cancelAt && l < fillAt;
            const refilled = isTarget && l >= fillAt;
            const bg = cancelled ? '#ffe4e6' : refilled ? '#d1fae5' : '#eef4ff';
            const fg = cancelled ? '#be123c' : refilled ? '#047857' : C.blue;
            return (
              <div key={tm} style={{ borderRadius: 18, padding: '18px 0', textAlign: 'center', background: bg, color: fg, border: `2px solid ${isTarget && (cancelled || refilled) ? fg : 'transparent'}`, transform: `scale(${isTarget ? 1 + 0.06 * Math.max(k(l, cancelAt, 300) * (1 - k(l, cancelAt + 400, 300)), k(l, fillAt, 300) * (1 - k(l, fillAt + 400, 300))) : 1})` }}>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700, fontSize: 24 }}>{tm}</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{cancelled ? 'Cancelled' : refilled ? 'Refilled ✓' : 'Booked'}</div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card style={{ ...fadeLeft(k(l, cancelAt + 700, 600), 100), position: 'absolute', right: -30, bottom: -150, width: 470, padding: 22, display: 'flex', gap: 16, alignItems: 'center', border: `3px solid ${C.teal}` }}>
        <span style={{ width: 64, height: 64, borderRadius: 18, background: '#cdf9ef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bell size={34} color="#0c8f7f" />
        </span>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Slot opened — 11:30</div>
          <div style={{ fontSize: 18, color: C.inkSoft }}>Waitlisted patient alerted and booked</div>
          <div style={{ fontSize: 18, fontFamily: FONT_HI, color: C.inkSoft }}>वेटलिस्ट मरीज़ ने सीट ले ली</div>
        </div>
      </Card>
    </div>
  );
}

function QueueVisual({ l }: SceneCtx) {
  const rows = [
    { tk: 'T-01', name: 'Aarav P.', st: 'Done', c: '#047857', b: '#d1fae5' },
    { tk: 'T-02', name: 'Pooja G.', st: 'Done', c: '#047857', b: '#d1fae5' },
    { tk: 'T-03', name: 'Suresh K.', st: 'With doctor', c: '#fff', b: C.blue },
    { tk: 'T-04', name: 'Ananya I.', st: 'Waiting', c: '#b45309', b: '#fef3c7' },
    { tk: 'T-05', name: 'Rakesh K.', st: 'Waiting', c: '#b45309', b: '#fef3c7' },
    { tk: 'T-06', name: 'Kartik S.', st: 'Booked · 11:00', c: C.inkSoft, b: '#eef2f8' },
  ];
  const cap = Math.round(lerp(0, 3, k(l, 3500, 900)));
  return (
    <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
      <Card style={{ ...pop(k(l, 100, 700)), width: 620, padding: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>Live queue</div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 800, color: '#e11d48' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#e11d48', opacity: 0.5 + 0.5 * Math.sin(l / 200) }} /> LIVE
          </span>
        </div>
        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
          {rows.map((r, i) => (
            <div key={r.tk} style={{ ...fadeLeft(k(l, 500 + i * 380, 500), 50), display: 'flex', alignItems: 'center', gap: 18, padding: '14px 18px', borderRadius: 18, background: '#f6f8fc' }}>
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 24, fontWeight: 800, color: C.blue, width: 80 }}>{r.tk}</span>
              <span style={{ flex: 1, fontSize: 22, fontWeight: 700 }}>{r.name}</span>
              <span style={{ padding: '6px 14px', borderRadius: 999, background: r.b, color: r.c, fontSize: 16, fontWeight: 800 }}>{r.st}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card style={{ ...fadeUp(k(l, 3200)), width: 300, padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.inkSoft }}>10:00 AM slot</div>
        <div style={{ marginTop: 10, fontSize: 64, fontWeight: 800, fontFamily: '"IBM Plex Mono", monospace' }}>
          {cap}<span style={{ color: C.inkSoft, fontSize: 40 }}>/4</span>
        </div>
        <div style={{ marginTop: 12, height: 14, borderRadius: 7, background: '#eef2f8', overflow: 'hidden' }}>
          <div style={{ width: `${(cap / 4) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${C.blue}, ${C.teal})` }} />
        </div>
        <div style={{ marginTop: 12, fontSize: 18, color: C.inkSoft }}>Limit set by you</div>
        <div style={{ fontSize: 18, fontFamily: FONT_HI, color: C.inkSoft }}>सीमा आप तय करें</div>
      </Card>
    </div>
  );
}

function VideoVisual({ l, doctors }: SceneCtx) {
  const doc = pickDoctors(doctors)[2] || pickDoctors(doctors)[0];
  const secs = 504 + Math.floor(l / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <div style={{ ...pop(k(l, 100, 800)), position: 'relative', width: 920, height: 600, borderRadius: 32, overflow: 'hidden', background: '#0b1220', boxShadow: '0 40px 100px -20px rgba(0,0,0,0.7)' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Avatar doctor={doc} size={920} radius={0} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,11,24,0.35), transparent 30%, transparent 60%, rgba(5,11,24,0.8))' }} />
      <div style={{ position: 'absolute', left: 24, top: 24, display: 'flex', gap: 12 }}>
        <span style={{ padding: '8px 16px', borderRadius: 999, background: '#e11d48', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', opacity: 0.5 + 0.5 * Math.sin(l / 220) }} /> LIVE {mm}:{ss}
        </span>
        <span style={{ padding: '8px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.18)', fontWeight: 700, fontSize: 18 }}>Follow-up consultation</span>
      </div>
      <div style={{ ...fadeLeft(k(l, 900), 60), position: 'absolute', right: 24, top: 24, width: 220, height: 150, borderRadius: 20, background: 'linear-gradient(135deg,#1f57e0,#14b19b)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid rgba(255,255,255,0.4)' }}>
        <div style={{ textAlign: 'center' }}>
          <UserRound size={56} color="#fff" />
          <div style={{ fontSize: 16, fontWeight: 700 }}>Patient · Kasba</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 32, bottom: 32 }}>
        <div style={{ fontSize: 32, fontWeight: 800 }}>{doc?.name || 'Dr. Ananya Mukherjee'}</div>
        <div style={{ fontSize: 20, color: C.white70 }}>{doc?.specialty || 'Pediatrician'}</div>
      </div>
      <div style={{ position: 'absolute', right: 32, bottom: 32, display: 'flex', gap: 14 }}>
        {[Mic, Video, PhoneOff].map((Icon, i) => (
          <span key={i} style={{ width: 64, height: 64, borderRadius: '50%', background: i === 2 ? '#e11d48' : 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={28} color="#fff" />
          </span>
        ))}
      </div>
    </div>
  );
}

function RxVisual({ l, D }: SceneCtx) {
  const meds = ['Tab. Telmisartan 40 mg — 1-0-0 × 30 days', 'Tab. Atorvastatin 10 mg — 0-0-1 × 30 days', 'Walk 30 min daily · low-salt diet', 'Review after 4 weeks'];
  const sent = k(l, D * 0.55, 700);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
      <Card style={{ ...pop(k(l, 100, 700)), width: 560, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 64, fontWeight: 800, color: C.blue, fontFamily: 'Georgia, serif' }}>℞</span>
          <span style={{ fontSize: 18, color: C.inkSoft, fontWeight: 700 }}>Digital prescription</span>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 14 }}>
          {meds.map((m, i) => {
            const v = clamp((l - 700 - i * 650) / 600);
            return (
              <div key={m} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 21, fontWeight: 600, opacity: v > 0 ? 1 : 0 }}>
                <Pill size={22} color={C.teal} style={{ marginTop: 3, flexShrink: 0 }} />
                <span>{m.slice(0, Math.ceil(v * m.length))}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.line}`, fontSize: 18, color: C.inkSoft }}>Signed digitally · {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
      </Card>
      <ArrowRight size={60} color={C.teal} style={{ opacity: sent, transform: `translateX(${(1 - sent) * -30}px)` }} />
      <div style={{ ...fadeLeft(sent, 60) }}>
        <Phone style={{ width: 330, height: 640 }}>
          <div style={{ padding: '62px 20px', display: 'grid', gap: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Health Vault</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14, borderRadius: 18, background: '#fff', border: `2px solid ${C.teal}` }}>
              <FileText size={30} color={C.blue} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>Prescription</div>
                <div style={{ fontSize: 14, color: C.inkSoft }}>Just now · new</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14, borderRadius: 18, background: '#fff' }}>
              <FileText size={30} color={C.inkSoft} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>Lab report</div>
                <div style={{ fontSize: 14, color: C.inkSoft }}>Last month</div>
              </div>
            </div>
            <div style={{ marginTop: 18, borderRadius: 16, background: C.blue, color: '#fff', textAlign: 'center', padding: '16px 0', fontSize: 20, fontWeight: 800, transform: `scale(${1 + 0.05 * Math.max(0, Math.sin(l / 260)) * k(l, D * 0.7)})` }}>
              Book again
            </div>
          </div>
        </Phone>
      </div>
    </div>
  );
}

function TrustVisual({ l, D }: SceneCtx) {
  const stars = Math.min(5, Math.floor(clamp((l - 600) / 1800) * 5.99));
  const sentCount = Math.round(lerp(0, 12, k(l, D * 0.62, 1200)));
  return (
    <div style={{ display: 'grid', gap: 30, width: 820 }}>
      <Card style={{ ...fadeLeft(k(l, 200, 700), 100), padding: 32 }}>
        <div style={{ fontSize: 24, fontWeight: 800 }}>How was your visit?</div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <Star key={i} size={64} color={i < stars ? C.amber : '#cbd5e3'} fill={i < stars ? C.amber : 'transparent'} style={{ transform: `scale(${i === stars - 1 ? 1.12 : 1})` }} />
          ))}
        </div>
        <div style={{ marginTop: 16, fontSize: 22, lineHeight: 1.45, color: C.inkSoft, fontStyle: 'italic', opacity: k(l, 2600) }}>
          “Seen on time with my token. The doctor explained everything clearly.”
        </div>
      </Card>
      <Card style={{ ...fadeLeft(k(l, D * 0.5, 700), 100), padding: 30, display: 'flex', gap: 22, alignItems: 'center' }}>
        <span style={{ width: 84, height: 84, borderRadius: 24, background: '#fff4f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Megaphone size={44} color={C.coralDeep} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>“Doctor running 20 minutes late today.”</div>
          <div style={{ marginTop: 6, fontSize: 20, color: C.inkSoft, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={22} color="#059669" /> Sent to {sentCount} booked patients · WhatsApp, SMS, app
          </div>
        </div>
      </Card>
    </div>
  );
}

function DashboardVisual({ l }: SceneCtx) {
  const kpis = [
    { label: 'Booked today', value: 18, suffix: '', icon: Ticket, c: C.blue },
    { label: 'Chamber load', value: 75, suffix: '%', icon: Building2, c: C.teal },
    { label: 'Follow-ups', value: 6, suffix: '', icon: RefreshCw, c: '#d97706' },
    { label: 'Rating', value: 4.8, suffix: '', icon: Star, c: '#e11d48' },
  ];
  const bars = [9, 12, 10, 14, 16, 15, 18];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <Card style={{ ...pop(k(l, 100, 700)), width: 920, padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 }}>
          <BarChart3 size={32} color={C.blue} /> My dashboard
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {['Line Bazar chamber', 'Khushkibagh chamber'].map((c, i) => (
            <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, background: i === 0 ? '#eef4ff' : '#f6f8fc', color: i === 0 ? C.blue : C.inkSoft, fontWeight: 700, fontSize: 16 }}>
              <MapPin size={16} /> {c}
            </span>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {kpis.map((kp, i) => {
          const v = k(l, 500 + i * 300, 1000);
          const val = kp.value % 1 ? (kp.value * v).toFixed(1) : Math.round(kp.value * v);
          return (
            <div key={kp.label} style={{ ...fadeUp(k(l, 400 + i * 250)), padding: 18, borderRadius: 20, background: '#f6f8fc' }}>
              <kp.icon size={28} color={kp.c} />
              <div style={{ marginTop: 10, fontSize: 40, fontWeight: 800 }}>
                {val}
                {kp.suffix}
              </div>
              <div style={{ fontSize: 17, color: C.inkSoft, fontWeight: 600 }}>{kp.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 26, height: 220, display: 'flex', alignItems: 'flex-end', gap: 22, padding: '0 8px' }}>
        {bars.map((b, i) => {
          const v = k(l, 1800 + i * 160, 900);
          return (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: (b / 18) * 180 * v, borderRadius: 12, background: i === 6 ? `linear-gradient(180deg, ${C.teal}, ${C.blue})` : '#dce8ff' }} />
              <div style={{ marginTop: 8, fontSize: 16, color: C.inkSoft, fontWeight: 600 }}>{days[i]}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, textAlign: 'right', fontSize: 14, color: '#94a3bb' }}>Sample data for illustration</div>
    </Card>
  );
}

function RevenueVisual({ l, D }: SceneCtx) {
  const step = (i: number) => k(l, 900 + i * (D * 0.13), 600);
  const monthly = Math.round(41600 * k(l, 900 + 4 * (D * 0.13), 1600));
  const row = (i: number, labelEn: string, labelHi: string, value: string, op?: string) => (
    <div style={{ ...fadeLeft(step(i), 60), display: 'flex', alignItems: 'center', gap: 20, padding: '16px 0', borderBottom: `1px solid ${C.line}` }}>
      <span style={{ width: 40, fontSize: 36, fontWeight: 800, color: C.inkSoft, textAlign: 'center' }}>{op || ''}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 26, fontWeight: 700 }}>{labelEn}</span>
        <span style={{ display: 'block', fontSize: 21, fontFamily: FONT_HI, color: C.inkSoft }}>{labelHi}</span>
      </span>
      <span style={{ fontSize: 40, fontWeight: 800, fontFamily: '"IBM Plex Mono", monospace' }}>{value}</span>
    </div>
  );
  return (
    <Card style={{ ...pop(k(l, 100, 700)), width: 940, padding: '30px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 }}>
          <IndianRupee size={30} color={C.teal} /> Illustrative example
        </div>
        <div style={{ fontSize: 20, fontFamily: FONT_HI, color: C.inkSoft }}>उदाहरण मात्र</div>
      </div>
      {row(0, 'Your consultation fee', 'आपकी परामर्श फीस', '₹400')}
      {row(1, 'Extra patients per day', 'रोज़ अतिरिक्त मरीज़', '4', '×')}
      {row(2, 'Extra income per day', 'रोज़ की अतिरिक्त आमदनी', '₹1,600', '=')}
      {row(3, 'OPD days per month', 'महीने के OPD दिन', '26', '×')}
      <div style={{ ...fadeUp(step(4)), marginTop: 18, borderRadius: 24, padding: '22px 28px', background: 'linear-gradient(135deg,#effdfa,#eef4ff)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          <span style={{ display: 'block', fontSize: 26, fontWeight: 800, color: '#0c8f7f' }}>Extra per month — 100% yours</span>
          <span style={{ display: 'block', fontSize: 22, fontFamily: FONT_HI, color: C.inkSoft }}>हर महीने अतिरिक्त — पूरी आपकी</span>
        </span>
        <span style={{ fontSize: 72, fontWeight: 800, color: '#0c8f7f', fontFamily: '"IBM Plex Mono", monospace' }}>₹{monthly.toLocaleString('en-IN')}</span>
      </div>
      <div style={{ marginTop: 12, fontSize: 16, color: '#94a3bb' }}>Your numbers will vary with your fee, timings and demand. · आपके आँकड़े अलग हो सकते हैं।</div>
    </Card>
  );
}

function JoinSteps({ l }: SceneCtx) {
  const copy = COPY.s14;
  const steps = [
    { icon: FileText, en: 'Apply online', hi: 'ऑनलाइन आवेदन', d: 'Registration no. + chamber details', dh: 'रजिस्ट्रेशन नंबर + चैंबर की जानकारी' },
    { icon: ShieldCheck, en: 'We verify you', hi: 'हम सत्यापन करते हैं', d: 'Our team checks your registration', dh: 'हमारी टीम रजिस्ट्रेशन जाँचती है' },
    { icon: Rocket, en: 'Go live', hi: 'प्रोफ़ाइल लाइव', d: 'Patients start booking your OPD', dh: 'मरीज़ आपकी OPD बुक करने लगते हैं' },
  ];
  const line = clamp((l - 1500) / 4200);
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '200px 120px 120px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ ...fadeUp(k(l, 100)), padding: '10px 18px', borderRadius: 999, background: 'rgba(20,177,155,0.16)', color: '#5fe0c8', fontWeight: 800, fontSize: 20, letterSpacing: 2, textTransform: 'uppercase' }}>
        {copy.eyebrow[0]} · <span style={{ fontFamily: FONT_HI, letterSpacing: 0 }}>{copy.eyebrow[1]}</span>
      </div>
      <h2 style={{ ...fadeUp(k(l, 250, 750)), margin: '24px 0 0', fontSize: 72, fontWeight: 800, letterSpacing: -1.5 }}>{copy.title[0]}</h2>
      <p style={{ ...fadeUp(k(l, 500, 750)), margin: '12px 0 0', fontSize: 40, fontFamily: FONT_HI, fontWeight: 700, color: '#93b4ff' }}>{copy.title[1]}</p>
      <div style={{ position: 'relative', marginTop: 80, width: 1580, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 50 }}>
        <div style={{ position: 'absolute', left: 260, right: 260, top: 70, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.12)' }}>
          <div style={{ width: `${line * 100}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${C.teal}, ${C.coral})` }} />
        </div>
        {steps.map((s, i) => {
          const v = k(l, 1300 + i * 1500, 700);
          return (
            <div key={s.en} style={{ ...fadeUp(v, 50), position: 'relative', textAlign: 'center' }}>
              <span style={{ margin: '0 auto', width: 140, height: 140, borderRadius: 40, background: v > 0.9 ? `linear-gradient(135deg, ${C.blue}, ${C.teal})` : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 50px -20px rgba(20,177,155,0.6)' }}>
                <s.icon size={68} color="#fff" />
              </span>
              <div style={{ marginTop: 18, fontSize: 22, fontWeight: 800, color: C.coral, letterSpacing: 3 }}>STEP {i + 1}</div>
              <div style={{ marginTop: 6, fontSize: 42, fontWeight: 800 }}>{s.en}</div>
              <div style={{ fontSize: 32, fontFamily: FONT_HI, fontWeight: 700, color: '#93b4ff' }}>{s.hi}</div>
              <div style={{ marginTop: 12, fontSize: 24, color: C.white70 }}>{s.d}</div>
              <div style={{ fontSize: 22, fontFamily: FONT_HI, color: C.white55 }}>{s.dh}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Outro({ l }: SceneCtx) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <div style={{ ...pop(k(l, 100, 800)) }}>
        <LogoMark size={170} role="doctor" />
      </div>
      <div style={{ ...fadeUp(k(l, 500)), marginTop: 34, fontSize: 84, fontWeight: 800, letterSpacing: -3 }}>
        ne<span style={{ background: `linear-gradient(135deg, ${C.sky}, ${C.teal})`, WebkitBackgroundClip: 'text', color: 'transparent' }}>X</span>gen{' '}
        <span style={{ fontWeight: 600, color: C.white70 }}>Healthcare</span>
      </div>
      <div style={{ ...fadeUp(k(l, 900)), marginTop: 16, fontSize: 46, fontWeight: 700 }}>{COPY.s15.title[0]}</div>
      <div style={{ ...fadeUp(k(l, 1200)), marginTop: 10, fontSize: 40, fontFamily: FONT_HI, fontWeight: 700, color: '#93b4ff' }}>{COPY.s15.title[1]}</div>
      <div
        style={{
          ...pop(k(l, 1700, 700)),
          marginTop: 46,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 18,
          padding: '26px 44px',
          borderRadius: 999,
          background: `linear-gradient(135deg, ${C.coral}, ${C.coralDeep})`,
          fontSize: 40,
          fontWeight: 800,
          boxShadow: `0 0 0 ${10 + 8 * Math.abs(Math.sin(l / 500))}px rgba(255,124,94,0.18)`,
        }}
      >
        <HeartPulse size={44} /> Join free · <span style={{ fontFamily: FONT_HI }}>आज ही मुफ़्त जुड़ें</span> <ArrowRight size={44} />
      </div>
      <div style={{ ...fadeUp(k(l, 2300)), marginTop: 30, fontSize: 26, color: C.white70 }}>
        Website → <strong style={{ color: '#fff' }}>“Join as a doctor”</strong> · 0% commission · Your fee stays 100% yours
      </div>
      <div style={{ ...fadeUp(k(l, 2700)), marginTop: 10, fontSize: 18, letterSpacing: 4, color: C.white55, fontWeight: 700 }}>POWERED BY SRM ECO TECH</div>
    </div>
  );
}

/* =========================================================================
   Live controls (not rendered while recording)
   ========================================================================= */
function Controls({
  playing,
  onToggle,
  onRestart,
  t,
  total,
  onSeek,
  captionLang,
  onCaption,
  timings,
  ready,
  hasAudio,
}: {
  playing: boolean;
  onToggle: () => void;
  onRestart: () => void;
  t: number;
  total: number;
  onSeek: (ms: number) => void;
  captionLang: 'en' | 'hi' | 'off';
  onCaption: (c: 'en' | 'hi' | 'off') => void;
  timings: SceneTiming[];
  ready: boolean;
  hasAudio: boolean;
}) {
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 18,
        transform: 'translateX(-50%)',
        width: 'min(980px, calc(100vw - 24px))',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 18,
        background: 'rgba(5,11,24,0.78)',
        backdropFilter: 'blur(10px)',
        color: '#fff',
        fontFamily: FONT_EN,
        fontSize: 14,
        zIndex: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
      }}
    >
      <button type="button" onClick={onToggle} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'} style={btn}>
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button type="button" onClick={onRestart} aria-label="Restart" style={btn}>
        <RotateCcw size={16} />
      </button>
      <span style={{ fontFamily: '"IBM Plex Mono", monospace', opacity: 0.8, minWidth: 92 }}>
        {fmt(t)} / {fmt(total)}
      </span>
      <div
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={t}
        tabIndex={0}
        onClick={e => {
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          onSeek(clamp((e.clientX - r.left) / r.width) * total);
        }}
        style={{ position: 'relative', flex: 1, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.15)', cursor: 'pointer' }}
      >
        <div style={{ width: `${clamp(t / total) * 100}%`, height: '100%', borderRadius: 5, background: `linear-gradient(90deg, ${C.blue}, ${C.teal})` }} />
        {timings.slice(1).map(s => (
          <span key={s.id} style={{ position: 'absolute', top: 0, left: `${(s.start / total) * 100}%`, width: 2, height: '100%', background: 'rgba(5,11,24,0.7)' }} />
        ))}
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Captions size={18} style={{ opacity: 0.8 }} />
        {(['off', 'en', 'hi'] as const).map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onCaption(c)}
            style={{ ...btn, width: 'auto', padding: '0 10px', background: captionLang === c ? '#fff' : 'rgba(255,255,255,0.12)', color: captionLang === c ? '#0b1220' : '#fff', fontWeight: 700 }}
          >
            {c === 'off' ? 'Off' : c === 'en' ? 'EN' : 'हिं'}
          </button>
        ))}
      </span>
      {!hasAudio && <span style={{ opacity: 0.6, fontSize: 12 }}>no audio</span>}
    </div>
  );
}

const btn: React.CSSProperties = {
  width: 36,
  height: 32,
  borderRadius: 10,
  border: 'none',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
