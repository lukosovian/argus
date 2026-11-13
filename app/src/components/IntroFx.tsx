import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { deviceGet, type IntroStyle } from '../lib/extras'
import { MOBILE } from '../lib/mobile/ui'

// Ayarlar › Açılış › Giriş animasyonu. v1.23.9'da baştan yazıldı — kullanıcı "giriş animasyonlarını ve seslerini
// sevmedim, uygulamanın profluğuna yakışmıyo" dedi. Eski projektör / geri sayım / perde gibi oyuncaklı sahneler
// yerine kısa (2-3 sn), sakin, stüdyo jeneriği tadında üç açılış:
//   argus (İmza) : karanlıkta mavi bir ışık belirir, logo bulanıktan netleşir, üstünden ışık geçer, ARGUS yazısı
//                  geniş harf aralığından yerine oturur, altında ince bir çizgi
//   isik (Işık)  : ortada ince bir ışık çizgisi uzar, dikey bir yarık gibi açılıp logoyu ortaya çıkarır
//   odak (Odak)  : ince halkalar dışarıdan içeri toplanır, logo objektif netlemesi gibi odağa gelir
// Eski seçimler (sinema, geri-sayim, perde) "İmza"ya düşer. Oturum başına bir kez; tıklayınca ya da tuşa basınca geçilir.
// Ses isteğe bağlı ve tek, yumuşak bir yankılı akor (Web Audio, dosya yok).

type Playable = 'argus' | 'isik' | 'odak'
const ORDER: Playable[] = ['argus', 'isik', 'odak']
const DURATION: Record<Playable, number> = { argus: 2900, isik: 3000, odak: 2900 }
const SEEN = 'argus_intro_gosterildi'
const SIRA = 'argus_intro_sira'
const PLAY_EVENT = 'argus-intro-oynat'
const LEGACY = ['sinema', 'geri-sayim', 'perde']

export function playIntro(style: Playable) {
  window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: style }))
}

export function normalizeIntro(style: string | null): IntroStyle {
  if (!style) return 'kapali'
  if (LEGACY.includes(style)) return 'argus'
  return style as IntroStyle
}

function resolve(raw: string | null): Playable | null {
  const style = normalizeIntro(raw)
  if (style === 'kapali') return null
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

// --- ses: alçak bir nefes, ardından yankılı yumuşak bir akor ---
function reverb(ctx: AudioContext, seconds: number) {
  const len = Math.ceil(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  }
  const c = ctx.createConvolver()
  c.buffer = buf
  return c
}
function sound(style: Playable) {
  let ctx: AudioContext
  try {
    ctx = new AudioContext()
  } catch {
    return
  }
  const master = ctx.createGain()
  master.gain.value = 0.55
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2600
  const wet = ctx.createGain()
  wet.gain.value = 0.5
  const rv = reverb(ctx, 3.2)
  lp.connect(master)
  lp.connect(rv).connect(wet).connect(master)
  master.connect(ctx.destination)
  const now = ctx.currentTime
  // nefes: süzülmüş, yavaşça yükselip sönen gürültü
  const nlen = 1.4
  const nb = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * nlen), ctx.sampleRate)
  const nd = nb.getChannelData(0)
  let last = 0
  for (let i = 0; i < nd.length; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.03
    nd[i] = last * 6
  }
  const ns = ctx.createBufferSource()
  ns.buffer = nb
  const nf = ctx.createBiquadFilter()
  nf.type = 'lowpass'
  nf.frequency.setValueAtTime(300, now)
  nf.frequency.exponentialRampToValueAtTime(1400, now + nlen)
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0, now)
  ng.gain.linearRampToValueAtTime(style === 'isik' ? 0.05 : 0.08, now + nlen * 0.85)
  ng.gain.linearRampToValueAtTime(0, now + nlen)
  ns.connect(nf).connect(ng).connect(lp)
  ns.start(now)
  // akor (Re majör, eklenmiş dokuzlu): sinüsler, yavaş giriş, uzun sönüş
  const at = now + (style === 'isik' ? 1.15 : 0.95)
  const notes = style === 'odak' ? [73.42, 146.83, 220, 277.18, 329.63] : style === 'isik' ? [146.83, 220, 329.63, 440, 659.25] : [73.42, 146.83, 220, 293.66, 369.99]
  notes.forEach((f, i) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    o.detune.value = (i % 2 ? 1 : -1) * 4
    const g = ctx.createGain()
    const v = (i === 0 ? 0.11 : 0.05) / (1 + i * 0.15)
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(v, at + 0.35)
    g.gain.setTargetAtTime(0, at + 0.9, 0.7)
    o.connect(g).connect(lp)
    o.start(at)
    o.stop(at + 4.5)
  })
  setTimeout(() => void ctx.close().catch(() => {}), 6500)
}

export function IntroOverlay() {
  const [style, setStyle] = useState<Playable | null>(() => {
    try {
      if (MOBILE || sessionStorage.getItem(SEEN)) return null
      sessionStorage.setItem(SEEN, '1')
    } catch {
      return null
    }
    return resolve(deviceGet('argus_intro'))
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
      className="fixed inset-0 z-[110] overflow-hidden cursor-pointer select-none"
      onClick={() => setStyle(null)}
      style={{ background: '#030507', animation: `ai-out .55s cubic-bezier(.4,0,.2,1) ${(total - 550) / 1000}s forwards` }}
    >
      <style>{CSS}</style>
      {style === 'argus' && <Signature />}
      {style === 'isik' && <Light />}
      {style === 'odak' && <Focus />}
    </div>,
    document.body,
  )
}

const d = (s: number): CSSProperties => ({ animationDelay: `${s}s` })

function Word({ at, cls }: { at: number; cls: string }) {
  return (
    <div className={cls} style={d(at)}>
      ARGUS
    </div>
  )
}

function Logo({ size, cls, at, shineAt }: { size: string; cls: string; at: number; shineAt: number }) {
  return (
    <div className={`relative ${cls}`} style={{ width: size, height: size, ...d(at) }}>
      <img src="/logoblue.png" alt="" className="h-full w-full" draggable={false} />
      <div className="ai-shine" style={d(shineAt)} />
    </div>
  )
}

// --- İmza ---
function Signature() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="ai-glow" style={d(0.1)} />
      <div className="ai-s-stage flex flex-col items-center" style={{ animation: 'ai-s-drift 2.9s cubic-bezier(.25,.1,.25,1) forwards' }}>
        <Logo size="20vmin" cls="ai-s-logo" at={0.25} shineAt={1.05} />
        <Word at={0.75} cls="ai-s-word" />
        <div className="ai-s-line" style={d(1.15)} />
      </div>
      <div className="ai-vignette" />
    </div>
  )
}

// --- Işık ---
function Light() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="ai-l-beam" />
      <div className="ai-l-flare" />
      <div className="ai-l-reveal flex flex-col items-center">
        <Logo size="19vmin" cls="ai-l-logo" at={1.0} shineAt={1.55} />
        <Word at={1.25} cls="ai-l-word" />
      </div>
      <div className="ai-vignette" />
    </div>
  )
}

// --- Odak ---
function Focus() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="ai-glow" style={d(0.5)} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="ai-f-ring" style={{ ...d(0.05 + i * 0.12), width: `${34 + i * 9}vmin`, height: `${34 + i * 9}vmin` }} />
      ))}
      <div className="ai-f-tick" />
      <div className="flex flex-col items-center">
        <Logo size="20vmin" cls="ai-f-logo" at={0.55} shineAt={1.35} />
        <Word at={1.15} cls="ai-f-word" />
      </div>
      <div className="ai-vignette" />
    </div>
  )
}

const WORD = `font-family: Inter, system-ui, sans-serif; font-weight: 600; color: #f4f7fa; font-size: 3.8vmin; padding-left: .62em;`
const CSS = `
@keyframes ai-out { to { opacity: 0; visibility: hidden } }
.ai-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.65) 100%); }
.ai-glow { position: absolute; width: 90vmin; height: 90vmin; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle, rgba(0,150,230,.22) 0%, rgba(0,90,200,.08) 38%, transparent 68%); animation: ai-glow 2.6s ease-out forwards; }
@keyframes ai-glow { 0% { opacity: 0; transform: scale(.7) } 45% { opacity: 1 } 100% { opacity: .75; transform: scale(1.05) } }
.ai-shine { position: absolute; inset: 0; -webkit-mask: url(/logoblue.png) center/contain no-repeat; mask: url(/logoblue.png) center/contain no-repeat;
  background: linear-gradient(110deg, transparent 38%, rgba(255,255,255,.75) 50%, transparent 62%) no-repeat; background-size: 320% 100%; background-position: 140% 0;
  animation: ai-shine 1.1s cubic-bezier(.45,0,.2,1) forwards; }
@keyframes ai-shine { to { background-position: -40% 0 } }

/* İmza */
@keyframes ai-s-drift { from { transform: scale(.985) } to { transform: scale(1.025) } }
.ai-s-logo { opacity: 0; filter: blur(14px); transform: scale(.92); animation: ai-s-logo 1.1s cubic-bezier(.2,.7,.2,1) forwards; }
@keyframes ai-s-logo { to { opacity: 1; filter: blur(0); transform: none } }
.ai-s-word { ${WORD} margin-top: 3.6vmin; letter-spacing: 1.4em; opacity: 0; animation: ai-s-word 1.3s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes ai-s-word { to { opacity: 1; letter-spacing: .62em } }
.ai-s-line { margin-top: 2.2vmin; height: 1px; width: 22vmin; transform: scaleX(0); opacity: .7;
  background: linear-gradient(90deg, transparent, rgba(0,192,250,.9), transparent); animation: ai-s-line 1s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes ai-s-line { to { transform: scaleX(1) } }

/* Işık */
.ai-l-beam { position: absolute; left: 0; right: 0; top: 50%; height: 1px; margin-top: -.5px; transform: scaleX(0);
  background: linear-gradient(90deg, transparent 8%, rgba(120,220,255,.8) 35%, #fff 50%, rgba(120,220,255,.8) 65%, transparent 92%);
  box-shadow: 0 0 12px 1px rgba(0,180,255,.5); animation: ai-l-beam 1.5s cubic-bezier(.65,0,.35,1) .1s forwards; }
@keyframes ai-l-beam { 0% { transform: scaleX(0); opacity: 1 } 55% { transform: scaleX(1); opacity: 1 } 100% { transform: scaleX(1) scaleY(60); opacity: 0 } }
.ai-l-flare { position: absolute; width: 70vmin; height: 12vmin; border-radius: 50%; opacity: 0;
  background: radial-gradient(ellipse, rgba(140,225,255,.35), transparent 70%); animation: ai-l-flare 1.4s ease-out .7s forwards; }
@keyframes ai-l-flare { 0% { opacity: 0; transform: scaleY(.2) } 35% { opacity: 1 } 100% { opacity: 0; transform: scaleY(2.4) } }
.ai-l-reveal { clip-path: inset(50% 0 50% 0); animation: ai-l-reveal 1.1s cubic-bezier(.65,0,.35,1) .85s forwards; }
@keyframes ai-l-reveal { to { clip-path: inset(0 0 0 0) } }
.ai-l-logo { transform: scale(1.06); animation: ai-l-logo 1.6s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes ai-l-logo { to { transform: none } }
.ai-l-word { ${WORD} margin-top: 3.4vmin; letter-spacing: .62em; opacity: 0; transform: translateY(.5em); animation: ai-l-word .9s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes ai-l-word { to { opacity: 1; transform: none } }

/* Odak */
.ai-f-ring { position: absolute; border-radius: 50%; border: 1px solid rgba(110,210,255,.45); opacity: 0; animation: ai-f-ring 1.3s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes ai-f-ring { 0% { opacity: 0; transform: scale(2.2) } 40% { opacity: .9 } 100% { opacity: 0; transform: scale(.62) } }
.ai-f-tick { position: absolute; width: 28vmin; height: 28vmin; border-radius: 50%; opacity: 0;
  border: 1px solid rgba(0,192,250,.35); border-top-color: rgba(200,240,255,.9);
  animation: ai-f-tick 1.4s cubic-bezier(.2,.7,.2,1) .7s forwards; }
@keyframes ai-f-tick { 0% { opacity: 0; transform: rotate(-120deg) scale(.9) } 40% { opacity: 1 } 100% { opacity: 0; transform: rotate(40deg) scale(1.15) } }
.ai-f-logo { opacity: 0; filter: blur(18px); transform: scale(1.18); animation: ai-f-logo 1.05s cubic-bezier(.2,.7,.2,1) forwards; }
@keyframes ai-f-logo { 0% { opacity: 0; filter: blur(18px); transform: scale(1.18) } 60% { opacity: 1; filter: blur(2px) } 78% { filter: blur(3px) } 100% { opacity: 1; filter: blur(0); transform: none } }
.ai-f-word { ${WORD} margin-top: 3.6vmin; letter-spacing: .62em; opacity: 0; filter: blur(6px); animation: ai-f-word .9s ease-out forwards; }
@keyframes ai-f-word { to { opacity: 1; filter: blur(0) } }
`
