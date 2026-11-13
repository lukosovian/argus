import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { currentSeason, deviceGet, deviceOn, type IntroStyle } from '../lib/extras'
import { MOBILE } from '../lib/mobile/ui'

// Ekstralar › Giriş animasyonu (v1.23.4): ARGUS açılınca (oturum başına bir kez) sinema ışıkları, eski film geri sayımı
// ya da tiyatro perdesi. Ekstralar › Giriş sesi açıksa kısa bir ses. Tıklayınca ya da tuşa basınca geçilir.

const SEEN = 'argus_intro_gosterildi'

function chime() {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    ;[196, 293.66, 392, 587.33].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = i % 2 ? 'sine' : 'triangle'
      o.frequency.value = f
      g.gain.setValueAtTime(0, now + i * 0.06)
      g.gain.linearRampToValueAtTime(0.12, now + i * 0.06 + 0.05)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.9)
      o.connect(g).connect(ctx.destination)
      o.start(now + i * 0.06)
      o.stop(now + 2)
    })
  } catch {
    /* ses yoksa sessiz */
  }
}

export function IntroOverlay() {
  const [style] = useState<IntroStyle>(() => {
    try {
      if (MOBILE || sessionStorage.getItem(SEEN)) return 'kapali'
      sessionStorage.setItem(SEEN, '1')
    } catch {
      return 'kapali'
    }
    return (deviceGet('argus_intro') as IntroStyle | null) ?? 'kapali'
  })
  const [on, setOn] = useState(style !== 'kapali')
  const [n, setN] = useState(3)
  const [sweep, setSweep] = useState(0)
  useEffect(() => {
    if (!on) return
    if (deviceGet('argus_intro_ses') === '1') chime()
    const total = style === 'geri-sayim' ? 3200 : style === 'perde' ? 3100 : 2300
    const t = setTimeout(() => setOn(false), total)
    const skip = () => setOn(false)
    window.addEventListener('keydown', skip)
    let raf = 0
    if (style === 'geri-sayim') {
      const t0 = performance.now()
      const f = (t: number) => {
        const el = t - t0
        const k = Math.min(2, Math.floor(el / 800))
        setN(3 - k)
        setSweep(((el % 800) / 800) * 360)
        if (el < 2400) raf = requestAnimationFrame(f)
        else setN(0)
      }
      raf = requestAnimationFrame(f)
    }
    return () => {
      clearTimeout(t)
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', skip)
    }
  }, [on])
  if (!on) return null
  return createPortal(
    <div className="fixed inset-0 z-[110] bg-black flex items-center justify-center overflow-hidden cursor-pointer" onClick={() => setOn(false)} style={{ animation: 'argus-intro-bitis .5s ease-in forwards', animationDelay: style === 'geri-sayim' ? '2.7s' : style === 'perde' ? '2.6s' : '1.8s' }}>
      {style === 'sinema' && (
        <>
          <div className="absolute inset-0" style={{ animation: 'argus-intro-isik 2.2s ease-out forwards' }}>
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} className="absolute left-1/2 top-1/2 h-0.5 w-1/2 origin-left" style={{ transform: `rotate(${i * 20}deg)`, background: 'linear-gradient(90deg,#00c0fa,transparent)' }} />
            ))}
          </div>
          <img src="/logoblue.png" alt="" className="w-32 relative" style={{ animation: 'argus-intro-zoom 2.2s cubic-bezier(.2,.8,.2,1) forwards' }} />
        </>
      )}
      {style === 'geri-sayim' && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'radial-gradient(circle,#2b2b2b,#0a0a0a 70%)', filter: 'sepia(.4) contrast(1.1)' }}>
          {n > 0 ? (
            <div className="relative h-64 w-64 rounded-full border-[3px] border-neutral-300 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(rgba(255,255,255,.35) ${sweep}deg, transparent 0)` }} />
              <span className="absolute left-1/2 -top-12 -bottom-12 w-0.5 bg-neutral-300" />
              <span className="absolute top-1/2 -left-20 -right-20 h-0.5 bg-neutral-300" />
              <b className="relative text-[140px] font-black text-neutral-100" style={{ fontFamily: 'Georgia, serif' }}>
                {n}
              </b>
            </div>
          ) : (
            <img src="/logoblue.png" alt="" className="w-32" style={{ animation: 'argus-intro-zoom 1.2s cubic-bezier(.2,.8,.2,1) forwards' }} />
          )}
          <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.9'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")", animation: 'argus-gren .2s steps(3) infinite' }} />
        </div>
      )}
      {style === 'perde' && (
        <>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(255,230,170,.2), transparent 60%)' }} />
          <img src="/logoblue.png" alt="" className="w-32 relative" style={{ filter: 'drop-shadow(0 0 30px rgba(255,220,150,.6))' }} />
          {[0, 1].map((i) => (
            <i
              key={i}
              className="absolute top-0 bottom-0 w-[51%]"
              style={{
                [i ? 'right' : 'left']: 0,
                background: 'repeating-linear-gradient(90deg,#5b0f16 0 22px,#7a1520 22px 36px,#4a0b11 36px 48px)',
                boxShadow: 'inset -20px 0 40px rgba(0,0,0,.6)',
                animation: `${i ? 'argus-perde-sag' : 'argus-perde-sol'} 2.2s .4s cubic-bezier(.6,0,.3,1) forwards`,
              }}
            />
          ))}
        </>
      )}
    </div>,
    document.body,
  )
}

// Ekstralar › Mevsimlik dokunuşlar: vitrinin üstünde kar / yarasa / yıldız (sadece mevsiminde)
export function SeasonFx() {
  const ref = useRef<HTMLCanvasElement>(null)
  const season = deviceOn('argus_mevsim') ? currentSeason() : null
  useEffect(() => {
    const cv = ref.current
    if (!cv || !season) return
    const cx = cv.getContext('2d')!
    let raf = 0
    const fit = () => {
      cv.width = cv.clientWidth
      cv.height = cv.clientHeight
    }
    fit()
    window.addEventListener('resize', fit)
    const N = season === 'yilbasi' ? 60 : season === 'cadilar' ? 16 : 110
    const ps = Array.from({ length: N }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, r: 1 + Math.random() * 2.4, v: 0.3 + Math.random() * 0.9, t: Math.random() * 6.28 }))
    const draw = () => {
      cx.clearRect(0, 0, cv.width, cv.height)
      for (const p of ps) {
        p.t += 0.02
        if (season === 'kis') {
          p.y += p.v
          p.x += Math.sin(p.t) * 0.4
          cx.fillStyle = 'rgba(255,255,255,.8)'
          cx.beginPath()
          cx.arc(p.x, p.y, p.r, 0, 7)
          cx.fill()
        } else if (season === 'cadilar') {
          p.x += p.v * 1.3
          p.y += Math.sin(p.t * 2) * 0.8
          const s = p.r * 3
          const fl = Math.sin(p.t * 8) * s * 0.6
          cx.fillStyle = 'rgba(15,8,4,.85)'
          cx.save()
          cx.translate(p.x, p.y)
          cx.beginPath()
          cx.moveTo(0, 0)
          cx.quadraticCurveTo(-s * 1.5, -fl, -s * 3, 0)
          cx.quadraticCurveTo(-s * 1.5, s * 0.3, 0, s * 0.4)
          cx.quadraticCurveTo(s * 1.5, s * 0.3, s * 3, 0)
          cx.quadraticCurveTo(s * 1.5, -fl, 0, 0)
          cx.fill()
          cx.restore()
        } else {
          const a = (Math.sin(p.t * 3) + 1) / 2
          cx.fillStyle = `rgba(253,224,71,${a})`
          cx.beginPath()
          for (let i = 0; i < 5; i++) {
            const an = i * 1.2566 - 1.57
            cx.lineTo(p.x + Math.cos(an) * p.r * 2.6, p.y + Math.sin(an) * p.r * 2.6)
            cx.lineTo(p.x + Math.cos(an + 0.628) * p.r, p.y + Math.sin(an + 0.628) * p.r)
          }
          cx.fill()
        }
        if (p.y > cv.height + 5) p.y = -5
        if (p.x > cv.width + 20) p.x = -20
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', fit)
    }
  }, [season])
  if (!season) return null
  return (
    <>
      {season === 'cadilar' && <div className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] z-[5]" style={{ background: 'radial-gradient(ellipse at 70% 0%, rgba(249,115,22,.18), transparent 60%)' }} />}
      <canvas ref={ref} className="pointer-events-none absolute inset-x-0 top-0 h-[80vh] w-full z-[6]" />
    </>
  )
}
