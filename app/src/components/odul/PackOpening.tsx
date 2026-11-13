import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { OdulReward, OdulTier } from '../../lib/api'
import { RARITY_COLORS, RARITY_NAMES, tierOf } from '../../lib/oduller'
import { useEscape } from '../../hooks/useEscape'
import { tt } from '../../lib/i18n'
import { RewardCard } from './RewardCard'
import './odul.css'

// Paket açılışı (v1.24) — kullanıcının sunumda seçtiği "kart paketi" stili. Paketin üst kenarı soldan sağa sürüklenerek
// yırtılır (ya da pakete tıklanınca kendisi yırtılır), fareyle paket döner ve folyosu parlar. 5 kart çıkar, yelpaze
// gibi açılır, tek tek çevrilir. Nadir kartların arkası çevirmeden önce parlar, efsanevi olan havaya kalkıp titrer.
// Ödüller açılıştan ÖNCE kaydedilir (pencere yarıda kapansa da kaybolmaz).

const DPR = Math.min(window.devicePixelRatio || 1, 2)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

type P = { x: number; y: number; vx: number; vy: number; l: number; d: number; g: number; s: number; c: string; k: 'dot' | 'sq'; r: number; dr: number; f: number }
type BurstOpts = { dir?: number; spread?: number; v?: number; g?: number; s?: number; decay?: number; white?: number }

class FX {
  c: CanvasRenderingContext2D
  p: P[] = []
  raf = 0
  cv: HTMLCanvasElement
  constructor(cv: HTMLCanvasElement) {
    this.cv = cv
    this.c = cv.getContext('2d')!
    this.fit()
    const loop = () => {
      this.step()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }
  fit() {
    const r = this.cv.getBoundingClientRect()
    if (r.width) {
      this.cv.width = r.width * DPR
      this.cv.height = r.height * DPR
    }
  }
  stop() {
    cancelAnimationFrame(this.raf)
  }
  burst(x: number, y: number, col: string, n: number, o: BurstOpts = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.dir ?? -Math.PI / 2) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2)
      const v = (o.v ?? 6) * (0.3 + Math.random() * 0.9)
      this.p.push({
        x: x * DPR, y: y * DPR, vx: Math.cos(a) * v * DPR, vy: Math.sin(a) * v * DPR, l: 1,
        d: (o.decay ?? 0.011) * (0.7 + Math.random() * 0.6), g: (o.g ?? 0.13) * DPR, s: (o.s ?? 2.4) * (0.5 + Math.random()) * DPR,
        c: Math.random() < (o.white ?? 0.25) ? '#ffffff' : col, k: Math.random() < 0.35 ? 'sq' : 'dot', r: Math.random() * 6, dr: (Math.random() - 0.5) * 0.3, f: 0.985,
      })
    }
  }
  step() {
    const c = this.c
    c.clearRect(0, 0, this.cv.width, this.cv.height)
    if (!this.p.length) return
    this.p = this.p.filter((p) => p.l > 0)
    c.globalCompositeOperation = 'lighter'
    for (const p of this.p) {
      p.x += p.vx
      p.y += p.vy
      p.vy += p.g
      p.vx *= p.f
      p.vy *= p.f
      p.l -= p.d
      p.r += p.dr
      c.globalAlpha = Math.max(0, Math.min(1, p.l * 1.6))
      c.fillStyle = p.c
      c.shadowColor = p.c
      c.shadowBlur = 10 * DPR
      if (p.k === 'sq') {
        c.save()
        c.translate(p.x, p.y)
        c.rotate(p.r)
        c.fillRect(-p.s * 1.4, -p.s * 0.6, p.s * 2.8, p.s * 1.2)
        c.restore()
      } else {
        c.beginPath()
        c.arc(p.x, p.y, p.s, 0, 7)
        c.fill()
      }
    }
    c.globalAlpha = 1
    c.shadowBlur = 0
    c.globalCompositeOperation = 'source-over'
  }
}

export interface PackOpeningProps {
  tier: OdulTier
  rewards: OdulReward[]
  badges: ({ text: string; dup?: boolean } | null)[]
  backKey?: string | null
  posters: string[]
  onClose: () => void
  // Aynı türden açılacak paket kaldıysa "Bir tane daha"
  onAgain?: (() => void) | null
  againLabel?: string
}

// Ekran genişliğine göre kart boyu ve yelpaze yerleşimi (telefonda 3 + 2 iki sıra)
function layout() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const narrow = vw < 640
  const cw = narrow ? Math.min(132, (vw - 40) / 3.25, (vh - 200) / 3.1) : Math.min(170, (vw - 80) / 5.4, (vh - 190) / 1.7)
  const ch = cw * 1.48
  const spots = Array.from({ length: 5 }, (_, i) => {
    if (!narrow) return { x: (i - 2) * cw * 1.07, y: Math.abs(i - 2) * 14 - 14, rot: (i - 2) * 5 }
    const top = i < 3
    const j = top ? i - 1 : i - 3.5
    return { x: j * cw * 1.08, y: top ? -ch * 0.56 : ch * 0.56, rot: j * 4 }
  })
  return { cw, ch, spots }
}

export default function PackOpening({ tier, rewards, badges, backKey, posters, onClose, onAgain, againLabel }: PackOpeningProps) {
  const t = tierOf(tier)
  const RN = RARITY_NAMES()
  const stage = useRef<HTMLDivElement>(null)
  const pack = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const flashEl = useRef<HTMLDivElement>(null)
  const fx = useRef<FX | null>(null)
  const cardEls = useRef<(HTMLDivElement | null)[]>([])
  const S = useRef({ state: 'idle' as 'idle' | 'tearing' | 'auto' | 'open', p: 0, sx: 0, last: 0, busy: false })
  const [opened, setOpened] = useState(false)
  const [flipped, setFlipped] = useState<boolean[]>(() => rewards.map(() => false))
  const [lift, setLift] = useState<number[]>([])
  const [liftOk, setLiftOk] = useState<number[]>([])
  const [ready, setReady] = useState(false)
  const [L, setL] = useState(layout)
  const alive = useRef(true)
  useEscape(true, onClose)

  useLayoutEffect(() => {
    alive.current = true
    fx.current = new FX(canvas.current!)
    const onResize = () => {
      fx.current?.fit()
      setL(layout())
    }
    window.addEventListener('resize', onResize)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      alive.current = false
      fx.current?.stop()
      window.removeEventListener('resize', onResize)
      document.body.style.overflow = prev
    }
  }, [])

  const local = (r: DOMRect) => {
    const s = stage.current!.getBoundingClientRect()
    return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top }
  }
  const flash = (col: string) => {
    const f = flashEl.current
    if (!f) return
    stage.current?.style.setProperty('--rc', col)
    f.classList.remove('go')
    void f.offsetWidth
    f.classList.add('go')
  }

  function setTear(p: number) {
    S.current.p = p
    pack.current!.style.setProperty('--p', String(p))
    const pr = wrap.current!.getBoundingClientRect()
    const s = stage.current!.getBoundingClientRect()
    const now = performance.now()
    if (now - S.current.last > 30) {
      S.current.last = now
      fx.current?.burst(pr.left - s.left + p * pr.width, pr.top - s.top + 41, '#bfefff', 4, { v: 3, s: 1.4, decay: 0.03, white: 0.6 })
    }
  }
  async function autoTear() {
    S.current.state = 'auto'
    const t0 = performance.now()
    const p0 = S.current.p
    await new Promise<void>((res) => {
      const f = () => {
        const k = Math.min(1, (performance.now() - t0) / 650)
        setTear(p0 + (1 - p0) * (k * k * (3 - 2 * k)))
        if (k < 1) requestAnimationFrame(f)
        else res()
      }
      f()
    })
    void complete()
  }
  async function complete() {
    if (S.current.state === 'open') return
    S.current.state = 'open'
    const pk = pack.current!
    pk.classList.remove('tearing')
    pk.classList.add('torn')
    pk.style.transform = ''
    const pr = wrap.current!.getBoundingClientRect()
    const s = stage.current!.getBoundingClientRect()
    fx.current?.burst(pr.right - s.left - 10, pr.top - s.top + 40, '#9fe8ff', 40, { v: 6, s: 1.8 })
    setOpened(true)
    await wait(60)
    const { ch } = layout()
    // kartlar paketin içinden yükselir
    cardEls.current.forEach((w, i) => {
      if (!w) return
      w.style.transitionDelay = `${i * 70}ms`
      w.style.transform = `translateY(${-ch * 0.52 - i * 3}px) rotate(${(i - 2) * 1.5}deg)`
    })
    await wait(1250)
    if (!alive.current) return
    wrap.current?.classList.add('drop')
    await wait(420)
    if (!alive.current) return
    setReady(true)
    setTimeout(() => cardEls.current.forEach((w) => w && (w.style.transitionDelay = '0ms')), 1000)
  }

  // yelpaze: ready olunca her kart yerine
  useEffect(() => {
    if (!ready) return
    cardEls.current.forEach((w, i) => {
      if (!w) return
      const sp = L.spots[i]
      w.style.transitionDelay = `${i * 60}ms`
      w.style.transform = `translate(${sp.x}px, ${sp.y}px) rotate(${sp.rot}deg)`
    })
  }, [ready, L])

  async function flip(i: number) {
    if (!ready || flipped[i] || lift.includes(i)) return
    const r = rewards[i].r
    const w = cardEls.current[i]
    if (r === 3) {
      setLift((l) => [...l, i])
      await wait(900)
      setLiftOk((l) => [...l, i])
    }
    if (!alive.current) return
    setFlipped((f) => f.map((x, j) => (j === i ? true : x)))
    await wait(220)
    if (!w || !alive.current) return
    const { x, y } = local(w.getBoundingClientRect())
    const col = RARITY_COLORS[r]
    fx.current?.burst(x, y, col, [12, 28, 70, 200][r], { v: [2.5, 4, 6, 9][r], s: [1.6, 2, 2.4, 2.8][r] })
    if (r >= 2) flash(col)
    if (r === 3) {
      await wait(250)
      fx.current?.burst(x, y, '#fff1b8', 120, { v: 11, s: 2.4 })
    }
  }
  async function flipAll() {
    if (S.current.busy) return
    S.current.busy = true
    for (let i = 0; i < rewards.length; i++) {
      if (flipped[i]) continue
      void flip(i)
      await wait(rewards[i].r === 3 ? 1300 : 330)
      if (!alive.current) return
    }
    S.current.busy = false
  }

  const allDone = flipped.every(Boolean)
  const best = Math.max(...rewards.map((r) => r.r))

  const onMove = (e: React.PointerEvent) => {
    const st = S.current.state
    if (st !== 'idle' && st !== 'tearing') return
    const r = stage.current!.getBoundingClientRect()
    const mx = (e.clientX - r.left) / r.width
    const my = (e.clientY - r.top) / r.height
    const pk = pack.current!
    pk.style.transform = `rotateY(${(mx - 0.5) * 26}deg) rotateX(${(0.5 - my) * 16}deg)`
    pk.style.setProperty('--mx', String(mx))
    pk.style.setProperty('--my', String(my))
    if (st === 'tearing') {
      const pr = wrap.current!.getBoundingClientRect()
      const p = Math.max(S.current.p, Math.min(1, (e.clientX - pr.left) / pr.width))
      if (p > S.current.p + 0.01) setTear(p)
      if (S.current.p >= 0.93) void complete()
    }
  }

  return createPortal(
    <div ref={stage} className="op-stage" onPointerMove={onMove} onPointerLeave={() => S.current.state === 'idle' && pack.current && (pack.current.style.transform = '')} style={{ '--rc': RARITY_COLORS[best] } as CSSProperties}>
      <div ref={flashEl} className="op-flash" />
      {allDone && <div className="op-tag">{tt('EN İYİSİ: {0}', RN[best].toLocaleUpperCase('tr'))}</div>}
      <button className="op-close" onClick={onClose} aria-label={tt('Kapat')} title={tt('Kapat')}>
        ×
      </button>

      <div ref={wrap} className="op-packw">
        <div
          ref={pack}
          className="op-pack"
          style={{ '--foil': t.foil } as CSSProperties}
          onPointerDown={(e) => {
            if (S.current.state !== 'idle') return
            S.current.state = 'tearing'
            S.current.sx = e.clientX
            pack.current!.classList.add('tearing')
            try {
              pack.current!.setPointerCapture(e.pointerId)
            } catch {
              /* önemsiz */
            }
          }}
          onPointerUp={(e) => {
            if (S.current.state !== 'tearing') return
            if (Math.abs(e.clientX - S.current.sx) < 8) void autoTear()
            else if (S.current.p < 0.93) S.current.state = 'idle'
          }}
        >
          <div className="op-foil op-top">
            <i className="cr" />
          </div>
          <div className="op-foil op-body">
            <i className="cr" />
            <div className="op-in">
              <div className="op-posts">
                {posters.slice(0, 3).map((p, i) => (
                  <img key={i} src={p} alt="" draggable={false} />
                ))}
              </div>
              <div className="op-logo">ARGUS</div>
              <div className="op-sub">{t.label()}</div>
              <div className="op-cnt">{tier === 'altin' ? tt('5 KART · 1 EPİK GARANTİ') : tt('5 KART · 1 NADİR GARANTİ')}</div>
            </div>
          </div>
          <div className="op-tl" />
          <div className="op-rip" />
          <div className="op-sci">✂️</div>
        </div>
      </div>

      {opened &&
        rewards.map((rw, i) => (
          <div
            key={i}
            ref={(el) => {
              cardEls.current[i] = el
            }}
            className={`op-w ${ready ? 'top' : ''} ${liftOk.includes(i) ? 'ok' : ''} ${ready && rw.r >= 2 && !flipped[i] && !lift.includes(i) ? 'hum' : ''} ${lift.includes(i) ? 'lift' : ''}`}
            style={{ margin: `${-L.ch / 2}px 0 0 ${-L.cw / 2}px`, transform: `translateY(${L.ch * 0.32}px)`, '--rc': RARITY_COLORS[rw.r] } as CSSProperties}
          >
            <RewardCard reward={rw} w={L.cw} backKey={backKey} shown={flipped[i]} badge={flipped[i] ? badges[i] : null} onClick={() => void flip(i)} />
          </div>
        ))}

      <canvas ref={canvas} />
      {!opened && <div className="op-hint">{tt('Üst kenarı soldan sağa sürükle ya da pakete tıkla')}</div>}
      {ready && !allDone && (
        <div className="op-actions">
          <button className="op-btn" onClick={() => void flipAll()}>
            {tt('Hepsini çevir')}
          </button>
        </div>
      )}
      {allDone && (
        <div className="op-actions">
          <button className="op-btn" onClick={onClose}>
            {tt('Kapat')}
          </button>
          {onAgain && (
            <button className="op-btn p" onClick={onAgain}>
              {againLabel ?? tt('Bir tane daha aç')}
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
