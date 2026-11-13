import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { deviceGet, type IntroStyle } from '../lib/extras'
import { MOBILE } from '../lib/mobile/ui'
import { tt } from '../lib/i18n'

// Ayarlar › Açılış › Giriş animasyonu (v1.23.4, v1.23.5'te baştan yazıldı — kullanıcı "giriş animasyonları daha güzel
// olsun, sinema iyi değil, bize ait güzel bir açılış ekle, sırayla gibi bir seçenek olsun" dedi). ARGUS açılınca oturum
// başına bir kez oynar; tıklayınca ya da tuşa basınca geçilir. Ayarlar'daki "Şimdi izle" düğmeleri playIntro() ile oynatır.
//   argus      : bize ait — karanlıkta bir çizgi, göz açılır, iris döner, göz kırpar, ışıkla logo ve ARGUS yazısı
//   sinema     : projektör ışığı salona vurur, toz zerreleri, perdede titreyen eski film, kamera perdeye dalar
//   geri-sayim : akan film şeridi, 3-2-1, bip sesleri, film yanığıyla logo
//   perde      : kadife perde, saçaklı üst perde, spot ışığı, perde toplanarak açılır
//   sirayla    : her açılışta sıradaki; rastgele: her açılışta biri

type Playable = 'argus' | 'sinema' | 'geri-sayim' | 'perde'
const ORDER: Playable[] = ['argus', 'sinema', 'geri-sayim', 'perde']
const DURATION: Record<Playable, number> = { argus: 4300, sinema: 4500, 'geri-sayim': 4700, perde: 4600 }
const SEEN = 'argus_intro_gosterildi'
const SIRA = 'argus_intro_sira'
const PLAY_EVENT = 'argus-intro-oynat'

export function playIntro(style: Playable) {
  window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: style }))
}

function resolve(style: IntroStyle | null): Playable | null {
  if (!style || style === 'kapali') return null
  if (style === 'rastgele') return ORDER[Math.floor(Math.random() * ORDER.length)]
  if (style === 'sirayla') {
    let i = 0
    try {
      i = (Number(localStorage.getItem(SIRA) ?? -1) + 1) % ORDER.length
      if (!Number.isFinite(i) || i < 0) i = 0
      localStorage.setItem(SIRA, String(i))
    } catch {
      /* sıra hatırlanamasa da oynasın */
    }
    return ORDER[i]
  }
  return (ORDER as string[]).includes(style) ? (style as Playable) : null
}

// --- sesler (Web Audio, dosya yok) ---
function audio(): AudioContext | null {
  try {
    return new AudioContext()
  } catch {
    return null
  }
}
function tone(ctx: AudioContext, f: number, at: number, len: number, vol = 0.1, type: OscillatorType = 'sine') {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = f
  const t = ctx.currentTime + at
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + len)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + len + 0.05)
}
function noise(ctx: AudioContext, at: number, len: number, vol: number, from: number, to: number) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.2
  const t = ctx.currentTime + at
  f.frequency.setValueAtTime(from, t)
  f.frequency.exponentialRampToValueAtTime(to, t + len)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + len * 0.7)
  g.gain.linearRampToValueAtTime(0, t + len)
  src.connect(f).connect(g).connect(ctx.destination)
  src.start(t)
}
function chord(ctx: AudioContext, at: number, notes: number[], vol = 0.07, len = 2.2) {
  notes.forEach((f, i) => tone(ctx, f, at + i * 0.07, len, vol, i % 2 ? 'sine' : 'triangle'))
}
function sound(style: Playable) {
  const ctx = audio()
  if (!ctx) return
  if (style === 'argus') {
    noise(ctx, 0.3, 1.6, 0.05, 300, 2400)
    tone(ctx, 98, 0.5, 1.8, 0.08)
    chord(ctx, 2.2, [293.66, 440, 587.33, 880])
  } else if (style === 'sinema') {
    for (let i = 0; i < 26; i++) noise(ctx, 0.4 + i * 0.1, 0.035, 0.05, 1800, 1500)
    chord(ctx, 1.9, [261.63, 329.63, 392, 523.25], 0.06)
  } else if (style === 'geri-sayim') {
    ;[0.25, 1.05, 1.85].forEach((t) => tone(ctx, 1000, t, 0.12, 0.08, 'sine'))
    noise(ctx, 2.6, 0.8, 0.06, 500, 3000)
    chord(ctx, 2.9, [246.94, 369.99, 493.88, 739.99], 0.06)
  } else {
    for (let i = 0; i < 18; i++) noise(ctx, 0.1 + i * 0.045, 0.05, 0.03 + i * 0.002, 200, 180)
    chord(ctx, 1.1, [196, 246.94, 293.66, 392, 493.88], 0.06, 2.6)
  }
}

export function IntroOverlay() {
  const [style, setStyle] = useState<Playable | null>(() => {
    try {
      if (MOBILE || sessionStorage.getItem(SEEN)) return null
      sessionStorage.setItem(SEEN, '1')
    } catch {
      return null
    }
    return resolve(deviceGet('argus_intro') as IntroStyle | null)
  })
  const [run, setRun] = useState(0)
  // Masaüstü uygulamasında pencere, açılış penceresi (ARGUS.exe) kapanana kadar gizli bekliyor — animasyon pencere
  // görünür olunca başlasın, yoksa başı kaçar (bkz. desktop/main.cjs waitForSplash). O ana kadar siyah ekran.
  const [visible, setVisible] = useState(() => !window.argusApp || Boolean((window as { __argusGorundu?: boolean }).__argusGorundu))
  useEffect(() => {
    if (visible) return
    const on = () => setVisible(true)
    window.addEventListener('argus-pencere-gorundu', on)
    const t = setTimeout(on, 8000)
    return () => {
      window.removeEventListener('argus-pencere-gorundu', on)
      clearTimeout(t)
    }
  }, [visible])
  useEffect(() => {
    const onPlay = (e: Event) => {
      const s = (e as CustomEvent<Playable>).detail
      if (ORDER.includes(s)) {
        setVisible(true)
        setStyle(s)
        setRun((n) => n + 1)
      }
    }
    window.addEventListener(PLAY_EVENT, onPlay)
    return () => window.removeEventListener(PLAY_EVENT, onPlay)
  }, [])
  useEffect(() => {
    if (!style || !visible) return
    if (deviceGet('argus_intro_ses') === '1') sound(style)
    const t = setTimeout(() => setStyle(null), DURATION[style])
    const skip = () => setStyle(null)
    window.addEventListener('keydown', skip)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', skip)
    }
  }, [style, run, visible])
  if (!style) return null
  if (!visible) return createPortal(<div className="fixed inset-0 z-[110] bg-black" />, document.body)
  const total = DURATION[style]
  return createPortal(
    <div
      key={run}
      className="fixed inset-0 z-[110] overflow-hidden bg-black cursor-pointer select-none"
      onClick={() => setStyle(null)}
      style={{ animation: `ai-out .6s ease-in ${(total - 600) / 1000}s forwards` }}
    >
      <style>{CSS}</style>
      {style === 'argus' && <ArgusIntro />}
      {style === 'sinema' && <CinemaIntro />}
      {style === 'geri-sayim' && <CountdownIntro />}
      {style === 'perde' && <CurtainIntro />}
    </div>,
    document.body,
  )
}

const d = (s: number): CSSProperties => ({ animationDelay: `${s}s` })

function Wordmark({ at, className = '' }: { at: number; className?: string }) {
  return (
    <div className={`ai-word ${className}`}>
      {'ARGUS'.split('').map((ch, i) => (
        <span key={i} style={d(at + i * 0.08)}>
          {ch}
        </span>
      ))}
    </div>
  )
}

function ShinyLogo({ size, at, className = '', style }: { size: string; at: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size, ...style }}>
      <img src="/logoblue.png" alt="" className="h-full w-full" draggable={false} />
      <div className="ai-shine" style={{ ...d(at) }} />
    </div>
  )
}

// --- ARGUS: göz açılışı ---
function ArgusIntro() {
  const fibers = useMemo(() => Array.from({ length: 56 }, (_, i) => i * (360 / 56)), [])
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at center, #031427 0%, #000 65%)' }}>
      <div className="ai-a-stage relative flex flex-col items-center justify-center" style={{ animation: 'ai-a-push .7s cubic-bezier(.5,0,.75,0) 3.6s forwards' }}>
        <div className="ai-a-slit" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="ai-a-ring" style={d(1.05 + i * 0.28)} />
        ))}
        <svg viewBox="-100 -46 200 92" className="ai-a-eye">
          <defs>
            <clipPath id="ai-almond">
              <path d="M-100 0 Q0 -92 100 0 Q0 92 -100 0Z" />
            </clipPath>
            <radialGradient id="ai-iris">
              <stop offset="0" stopColor="#bff3ff" />
              <stop offset=".35" stopColor="#00c0fa" />
              <stop offset=".75" stopColor="#015eea" />
              <stop offset="1" stopColor="#001637" />
            </radialGradient>
            <radialGradient id="ai-white">
              <stop offset="0" stopColor="#0d2a4a" />
              <stop offset="1" stopColor="#020812" />
            </radialGradient>
          </defs>
          <g className="ai-a-lid">
            <g clipPath="url(#ai-almond)">
              <rect x="-100" y="-46" width="200" height="92" fill="url(#ai-white)" />
              <g className="ai-a-iris">
                <circle r="31" fill="url(#ai-iris)" />
                {fibers.map((a) => (
                  <line key={a} x1="11" y1="0" x2="30" y2="0" stroke="rgba(210,245,255,.32)" strokeWidth=".7" transform={`rotate(${a})`} />
                ))}
                <circle r="31" fill="none" stroke="#001a3d" strokeWidth="2.4" />
              </g>
              <circle className="ai-a-pupil" r="11.5" fill="#000" />
              <circle cx="-9" cy="-10" r="4.2" fill="#fff" opacity=".85" />
              <circle cx="7" cy="8" r="1.8" fill="#fff" opacity=".5" />
            </g>
            <path d="M-100 0 Q0 -92 100 0 Q0 92 -100 0Z" fill="none" stroke="#5fd8ff" strokeWidth="1.2" opacity=".8" />
          </g>
        </svg>
        <div className="ai-a-flash" />
        <div className="ai-a-logo">
          <ShinyLogo size="24vmin" at={3.0} />
        </div>
        <Wordmark at={2.75} className="ai-a-word" />
      </div>
    </div>
  )
}

// --- Sinema projektörü ---
function CinemaIntro() {
  const dust = useMemo(
    () => Array.from({ length: 34 }, () => ({ x: 22 + Math.random() * 56, y: 22 + Math.random() * 70, s: 1 + Math.random() * 2.5, t: 3 + Math.random() * 4, dl: Math.random() * 3 })),
    [],
  )
  return (
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 35%, #1a1410 0%, #050403 60%, #000 100%)', animation: 'ai-c-push .8s cubic-bezier(.6,0,.8,.2) 3.75s forwards', transformOrigin: '50% 36%' }}>
      {/* perde (ekran) */}
      <div className="ai-c-screen">
        <div className="ai-c-film">
          <div className="ai-c-night" />
          <div className="ai-c-content">
            <ShinyLogo size="15vmin" at={2.6} />
            <Wordmark at={1.6} className="ai-c-word" />
            <p className="ai-c-sub" style={d(2.4)}>
              {tt('SUNAR')}
            </p>
          </div>
          <div className="ai-grain" />
          <div className="ai-c-scratch" />
          <div className="ai-c-vignette" />
        </div>
      </div>
      {/* ışık konisi ve tozlar */}
      <div className="ai-c-beam" />
      {dust.map((p, i) => (
        <i key={i} className="ai-c-dust" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, animationDuration: `${p.t}s`, animationDelay: `${p.dl}s` }} />
      ))}
      {/* projektör ve seyirciler */}
      <div className="ai-c-lens" />
      <div className="ai-c-crowd">
        {Array.from({ length: 13 }, (_, i) => (
          <span key={i} style={{ left: `${-4 + i * 8.4}%`, transform: `scale(${0.9 + ((i * 7) % 5) * 0.06})` }} />
        ))}
      </div>
    </div>
  )
}

// --- Film geri sayımı ---
function CountdownIntro() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#151311' }}>
      <div className="ai-g-frame">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle, #8a7d68 0%, #4a4237 55%, #1b1813 100%)' }} />
        <div className="ai-g-dial">
          <div className="ai-g-sweep" />
          <div className="ai-g-ring1" />
          <div className="ai-g-ring2" />
          <span className="ai-g-h" />
          <span className="ai-g-v" />
          {[3, 2, 1].map((n, i) => (
            <b key={n} className="ai-g-num" style={d(0.2 + i * 0.8)}>
              {n}
            </b>
          ))}
        </div>
        <div className="ai-grain ai-grain-strong" />
        <div className="ai-g-scratch" />
        <div className="ai-g-scratch" style={{ left: '71%', animationDelay: '.37s' }} />
      </div>
      <div className="ai-g-sprocket left-0" />
      <div className="ai-g-sprocket right-0" />
      {/* film yanığı ve logo */}
      <div className="ai-g-burn" />
      <div className="ai-g-logo">
        <ShinyLogo size="22vmin" at={3.4} />
        <Wordmark at={3.05} className="ai-a-word" />
      </div>
    </div>
  )
}

// --- Tiyatro perdesi ---
function CurtainIntro() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 110%, #2a1206 0%, #0a0503 55%, #000 100%)' }}>
      <div className="ai-p-spot" />
      <div className="ai-p-floor" />
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: '6vh' }}>
        <ShinyLogo size="20vmin" at={2.7} className="ai-p-logo" />
        <Wordmark at={2.1} className="ai-p-word" />
      </div>
      <div className="ai-p-curtain ai-p-left">
        <i className="ai-p-tie" />
      </div>
      <div className="ai-p-curtain ai-p-right">
        <i className="ai-p-tie" />
      </div>
      <div className="ai-p-valance" />
      <div className="ai-p-lights">
        {Array.from({ length: 15 }, (_, i) => (
          <i key={i} style={d(0.3 + i * 0.04)} />
        ))}
      </div>
    </div>
  )
}

const CSS = `
@keyframes ai-out { to { opacity: 0; visibility: hidden } }
.ai-word { display: flex; gap: .32em; font-weight: 900; letter-spacing: .02em; color: #fff; }
.ai-word span { display: inline-block; opacity: 0; transform: translateY(.6em) scale(.9); filter: blur(6px); animation: ai-letter .7s cubic-bezier(.2,.9,.25,1) forwards; }
@keyframes ai-letter { to { opacity: 1; transform: none; filter: none } }
.ai-shine { position: absolute; inset: 0; -webkit-mask: url(/logoblue.png) center/contain no-repeat; mask: url(/logoblue.png) center/contain no-repeat;
  background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.95) 50%, transparent 65%) no-repeat; background-size: 300% 100%; background-position: 150% 0; animation: ai-shine 1s ease-in-out forwards; }
@keyframes ai-shine { to { background-position: -50% 0 } }
.ai-grain { position: absolute; inset: -50%; opacity: .14; pointer-events: none; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  animation: ai-grain .25s steps(4) infinite; }
.ai-grain-strong { opacity: .3 }
@keyframes ai-grain { 0% { transform: translate(0,0) } 25% { transform: translate(-4%,3%) } 50% { transform: translate(3%,-5%) } 75% { transform: translate(-2%,-2%) } 100% { transform: translate(5%,4%) } }

/* ARGUS */
.ai-a-stage { width: 100vmin; height: 100vmin }
.ai-a-slit { position: absolute; top: 50%; left: 15%; right: 15%; height: 2px; margin-top: -1px; border-radius: 2px;
  background: linear-gradient(90deg, transparent, #7fe3ff 20%, #fff 50%, #7fe3ff 80%, transparent); box-shadow: 0 0 18px 4px rgba(0,192,250,.55), 0 0 60px 10px rgba(0,120,255,.35);
  transform: scaleX(0); animation: ai-a-slit 1.25s cubic-bezier(.2,.8,.2,1) .15s forwards; }
@keyframes ai-a-slit { 0% { transform: scaleX(0) } 45% { transform: scaleX(1); opacity: 1 } 70% { opacity: 1 } 100% { transform: scaleX(1.05); opacity: 0 } }
.ai-a-eye { position: absolute; width: 74vmin; overflow: visible; filter: drop-shadow(0 0 24px rgba(0,170,255,.45)); }
.ai-a-lid { transform-box: fill-box; transform-origin: center; transform: scaleY(.02); opacity: 0; animation: ai-a-lid 2.25s cubic-bezier(.3,1.3,.5,1) .6s forwards; }
@keyframes ai-a-lid { 0% { transform: scaleY(.02); opacity: 1 } 26% { transform: scaleY(1) } 74% { transform: scaleY(1); opacity: 1 } 84% { transform: scaleY(.03); opacity: 1 } 100% { transform: scaleY(.02); opacity: 0 } }
.ai-a-iris { transform-box: fill-box; transform-origin: center; animation: ai-a-iris 2.2s ease-in-out .6s forwards; }
@keyframes ai-a-iris { 0% { transform: rotate(-30deg) scale(.85) } 45% { transform: rotate(10deg) scale(1) translateX(6px) } 70% { transform: rotate(25deg) scale(1) translateX(-4px) } 100% { transform: rotate(30deg) scale(1) } }
.ai-a-pupil { transform-box: fill-box; transform-origin: center; animation: ai-a-pupil 1.4s ease-in-out 1.1s forwards; }
@keyframes ai-a-pupil { 0% { transform: scale(1) } 40% { transform: scale(.55) } 100% { transform: scale(.7) } }
.ai-a-ring { position: absolute; left: 50%; top: 50%; width: 30vmin; height: 30vmin; margin: -15vmin; border-radius: 50%; border: 1.5px solid rgba(0,192,250,.7);
  opacity: 0; animation: ai-a-ring 1.6s cubic-bezier(.1,.6,.3,1) forwards; }
@keyframes ai-a-ring { 0% { opacity: .9; transform: scale(.4) } 100% { opacity: 0; transform: scale(3.2) } }
.ai-a-flash { position: absolute; left: 50%; top: 50%; width: 120vmin; height: 120vmin; margin: -60vmin; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(120,220,255,.6) 18%, rgba(0,120,255,.15) 45%, transparent 70%); animation: ai-a-flash .9s ease-out 2.45s forwards; }
@keyframes ai-a-flash { 0% { opacity: 0; transform: scale(.2) } 25% { opacity: 1 } 100% { opacity: 0; transform: scale(1.3) } }
.ai-a-logo { opacity: 0; transform: scale(1.5); animation: ai-a-logo .9s cubic-bezier(.2,.9,.2,1) 2.5s forwards; filter: drop-shadow(0 0 40px rgba(0,170,255,.5)); }
@keyframes ai-a-logo { 0% { opacity: 0; transform: scale(1.5) } 100% { opacity: 1; transform: scale(1) } }
.ai-a-word { margin-top: 3vmin; font-size: 7vmin; text-shadow: 0 0 30px rgba(0,170,255,.6); }
@keyframes ai-a-push { to { transform: scale(1.35); opacity: 0; filter: blur(4px) } }

/* Sinema */
.ai-c-screen { position: absolute; left: 17%; right: 17%; top: 12%; height: 52%; background: #0d0c0b; box-shadow: 0 0 0 6px #050404, 0 30px 80px rgba(0,0,0,.8); overflow: hidden; }
.ai-c-film { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at center, #f4ead2 0%, #cbbb98 60%, #7d6f55 100%); animation: ai-c-on 2.6s steps(1) .55s forwards, ai-c-color 1.2s ease-out 2.3s forwards; filter: sepia(.9) contrast(1.15); }
@keyframes ai-c-on { 0% { opacity: .3 } 6% { opacity: .9 } 10% { opacity: .5 } 16% { opacity: 1 } 22% { opacity: .75 } 30% { opacity: 1 } 46% { opacity: .85 } 52% { opacity: 1 } 100% { opacity: 1 } }
@keyframes ai-c-color { to { filter: sepia(0) contrast(1.05) } }
.ai-c-night { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at center, #10233c 0%, #050b16 70%, #02050a 100%); animation: ai-fade 1.2s ease-out 2.3s forwards; }
.ai-c-content { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.2vmin; animation: ai-jitter .12s steps(2) infinite; }
.ai-c-word { font-size: 5.5vmin; color: #fff; text-shadow: 0 0 20px rgba(0,170,255,.5) }
.ai-c-sub { font-size: 1.4vmin; letter-spacing: .6em; color: rgba(255,255,255,.7); opacity: 0; animation: ai-letter .6s ease-out forwards; }
@keyframes ai-jitter { 0% { transform: translate(0,0) } 50% { transform: translate(.15%, -.25%) } 100% { transform: translate(-.1%, .2%) } }
.ai-c-scratch { position: absolute; top: 0; bottom: 0; left: 30%; width: 1px; background: rgba(255,255,255,.4); animation: ai-scratch .5s steps(3) infinite; }
@keyframes ai-scratch { 0% { left: 23%; opacity: .5 } 33% { left: 61%; opacity: .2 } 66% { left: 78%; opacity: .45 } 100% { left: 40% } }
.ai-c-vignette { position: absolute; inset: 0; box-shadow: inset 0 0 12vmin rgba(0,0,0,.85); }
.ai-c-beam { position: absolute; inset: 0; opacity: 0; mix-blend-mode: screen; pointer-events: none;
  clip-path: polygon(49.3% 104%, 50.7% 104%, 83% 64%, 83% 12%, 17% 12%, 17% 64%);
  background: linear-gradient(to top, rgba(255,240,205,.5), rgba(255,240,205,.14) 55%, rgba(255,240,205,.05));
  animation: ai-c-beam 3.2s linear .45s forwards; }
@keyframes ai-c-beam { 0% { opacity: 0 } 4% { opacity: .9 } 8% { opacity: .4 } 13% { opacity: 1 } 20% { opacity: .75 } 26% { opacity: 1 } 60% { opacity: .9 } 64% { opacity: 1 } 100% { opacity: .95 } }
.ai-c-dust { position: absolute; border-radius: 50%; background: rgba(255,245,220,.9); opacity: 0; animation-name: ai-c-dust; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
@keyframes ai-c-dust { 0% { opacity: 0; transform: translate(0,0) } 30% { opacity: .9 } 100% { opacity: 0; transform: translate(3vmin,-5vmin) } }
.ai-c-lens { position: absolute; left: 50%; bottom: -3vmin; width: 6vmin; height: 6vmin; margin-left: -3vmin; border-radius: 50%; background: radial-gradient(circle, #fff 0%, #ffe9b8 30%, rgba(255,200,120,0) 70%); opacity: 0; animation: ai-c-beam 3.2s linear .45s forwards; }
.ai-c-crowd { position: absolute; left: 0; right: 0; bottom: 0; height: 16vh; }
.ai-c-crowd span { position: absolute; bottom: -2vh; width: 9vmin; height: 13vh; background: #020202; border-radius: 45% 45% 18% 18% / 32% 32% 10% 10%; box-shadow: 0 -1px 0 rgba(255,230,190,.08); }
.ai-c-crowd span::before { content: ''; position: absolute; left: 50%; top: -5.2vmin; width: 5vmin; height: 6vmin; margin-left: -2.5vmin; border-radius: 50%; background: #020202; }
@keyframes ai-c-push { to { transform: scale(2.6); opacity: 0 } }

/* Geri sayım */
.ai-g-frame { position: absolute; top: 0; bottom: 0; left: 9vmin; right: 9vmin; overflow: hidden; animation: ai-g-flick .18s steps(2) infinite, ai-jitter .1s steps(2) infinite; }
@keyframes ai-g-flick { 0% { filter: sepia(.6) brightness(1) contrast(1.15) } 50% { filter: sepia(.6) brightness(.86) contrast(1.2) } 100% { filter: sepia(.6) brightness(1.05) contrast(1.1) } }
.ai-g-dial { position: absolute; left: 50%; top: 50%; width: 62vmin; height: 62vmin; margin: -31vmin; animation: ai-g-hide .2s linear 2.6s forwards; }
@keyframes ai-g-hide { to { opacity: 0 } }
.ai-g-sweep { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(rgba(20,16,12,.55) 0deg, rgba(20,16,12,.55) var(--a, 0deg), transparent var(--a, 0deg)); animation: ai-g-sweep .8s linear .2s 3; }
@property --a { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes ai-g-sweep { from { --a: 0deg } to { --a: 360deg } }
.ai-g-ring1, .ai-g-ring2 { position: absolute; border-radius: 50%; border: .5vmin solid #efe6d2; }
.ai-g-ring1 { inset: 0 } .ai-g-ring2 { inset: 4vmin; border-width: .35vmin }
.ai-g-h, .ai-g-v { position: absolute; background: #efe6d2 }
.ai-g-h { left: -30vmin; right: -30vmin; top: 50%; height: .35vmin }
.ai-g-v { top: -20vmin; bottom: -20vmin; left: 50%; width: .35vmin }
.ai-g-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 900 40vmin/1 Georgia, 'Times New Roman', serif; color: #f6efe0; text-shadow: 0 0 2vmin rgba(0,0,0,.6); opacity: 0; animation: ai-g-num .8s steps(1) forwards; }
@keyframes ai-g-num { 0% { opacity: 1 } 99% { opacity: 1 } 100% { opacity: 0 } }
.ai-g-scratch { position: absolute; top: 0; bottom: 0; left: 18%; width: 2px; background: rgba(255,255,255,.55); animation: ai-scratch .4s steps(3) infinite; }
.ai-g-sprocket { position: absolute; top: 0; bottom: 0; width: 9vmin; background-color: #0c0b0a; background-repeat: repeat-y; background-position: center 0;
  background-image: radial-gradient(ellipse 2.2vmin 1.6vmin, #d8d0bd 90%, transparent 100%); background-size: 9vmin 6vmin; animation: ai-g-run .25s linear infinite; }
@keyframes ai-g-run { to { background-position: center 6vmin } }
.ai-g-burn { position: absolute; left: 62%; top: 38%; width: 10vmin; height: 10vmin; margin: -5vmin; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle, #fff 0%, #fff6d6 22%, #ffb347 40%, #c2410c 55%, rgba(60,10,0,.9) 68%, transparent 72%);
  animation: ai-g-burn 1.1s cubic-bezier(.5,0,.8,.4) 2.55s forwards; }
@keyframes ai-g-burn { 0% { opacity: 1; transform: scale(.2) } 70% { opacity: 1; transform: scale(28) } 100% { opacity: 0; transform: scale(34) } }
.ai-g-logo { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; background: radial-gradient(ellipse at center, #071a30 0%, #000 70%); animation: ai-fade .6s ease-out 3.05s forwards; }
@keyframes ai-fade { to { opacity: 1 } }

/* Perde */
.ai-p-spot { position: absolute; left: 50%; top: -10vh; width: 90vmin; height: 120vh; margin-left: -45vmin; opacity: 0;
  background: radial-gradient(ellipse 50% 60% at 50% 100%, rgba(255,226,170,.35), transparent 70%), linear-gradient(to bottom, rgba(255,230,180,.0), rgba(255,230,180,.12));
  clip-path: polygon(44% 0, 56% 0, 100% 100%, 0 100%); animation: ai-fade 1.2s ease-out 1.3s forwards; }
.ai-p-floor { position: absolute; left: 0; right: 0; bottom: 0; height: 22vh; background: linear-gradient(to top, #1a0c05, transparent); }
.ai-p-logo { opacity: 0; transform: translateY(2vh) scale(.92); animation: ai-p-rise 1.2s cubic-bezier(.2,.8,.2,1) 1.5s forwards; filter: drop-shadow(0 0 30px rgba(255,210,140,.45)); }
@keyframes ai-p-rise { to { opacity: 1; transform: none } }
.ai-p-word { margin-top: 2.5vmin; font-size: 6vmin; color: #fff7e6; text-shadow: 0 0 24px rgba(255,200,120,.55); }
.ai-p-curtain { position: absolute; top: 0; bottom: 0; width: 51%; z-index: 2;
  background:
    linear-gradient(to bottom, rgba(0,0,0,.35), transparent 18%, transparent 80%, rgba(0,0,0,.55)),
    repeating-linear-gradient(90deg, #4a0a10 0, #7d1520 2.2vmin, #a41d2b 3.4vmin, #7d1520 4.6vmin, #4a0a10 6.4vmin);
  box-shadow: inset 0 0 6vmin rgba(0,0,0,.6); }
.ai-p-left { left: 0; transform-origin: left center; animation: ai-p-sway 1s ease-in-out .1s, ai-p-open 2.2s cubic-bezier(.65,0,.3,1) .85s forwards; }
.ai-p-right { right: 0; transform-origin: right center; animation: ai-p-sway 1s ease-in-out .1s reverse, ai-p-open 2.2s cubic-bezier(.65,0,.3,1) .85s forwards; }
@keyframes ai-p-sway { 50% { transform: skewX(.8deg) } }
@keyframes ai-p-open { 0% { transform: scaleX(1) } 100% { transform: scaleX(.14) skewY(0) } }
.ai-p-tie { position: absolute; top: 58%; width: 100%; height: 1.4vmin; background: linear-gradient(#f5d27a, #a87a22); opacity: 0; animation: ai-fade .4s ease-out 2.4s forwards; box-shadow: 0 .4vmin 1vmin rgba(0,0,0,.6); }
.ai-p-valance { position: absolute; top: 0; left: 0; right: 0; height: 14vh; z-index: 3;
  background: linear-gradient(to bottom, #3d070c, #8a1724 70%, #5c0d15), repeating-linear-gradient(90deg, rgba(0,0,0,.25) 0 1vmin, transparent 1vmin 4vmin);
  box-shadow: 0 1.2vmin 3vmin rgba(0,0,0,.8); }
.ai-p-valance::after { content: ''; position: absolute; left: 0; right: 0; bottom: -2.2vmin; height: 2.4vmin;
  background: radial-gradient(circle at 50% 0, #e8c060 0 1.1vmin, #a77a22 1.2vmin 1.4vmin, transparent 1.5vmin) 0 0/3vmin 2.4vmin repeat-x; }
.ai-p-valance::before { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: .6vmin; background: linear-gradient(90deg, #a77a22, #f5d27a, #a77a22); }
.ai-p-lights { position: absolute; left: 4%; right: 4%; bottom: 3vh; display: flex; justify-content: space-between; z-index: 4; }
.ai-p-lights i { width: 1.4vmin; height: 1.4vmin; border-radius: 50%; background: #ffd27a; opacity: .15; box-shadow: 0 0 2vmin 1vmin rgba(255,200,110,.0); animation: ai-p-bulb .5s ease-out forwards; }
@keyframes ai-p-bulb { to { opacity: 1; box-shadow: 0 0 2.4vmin 1vmin rgba(255,200,110,.55) } }
`
