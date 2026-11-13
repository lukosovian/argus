import { useEffect, useMemo, useRef, useState } from 'react'
import type { PickerAnim } from '../lib/extras'

// Ne İzlesem'in isteğe bağlı animasyonları (v1.23.4, Ayarlar › Ekstralar › Seçim animasyonu): çark, slot makinesi,
// kart destesi, film şeridi. Hepsi aynı sözleşmeyle çalışır: adayların görselleri + kazanan; animasyon bitince
// onDone çağrılır, sonuç ekranı (PickResult) açılır. Klasik dağılma animasyonu RandomPickerButton'da.

export type AnimItem = { key: string; cover: string }

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

export default function PickAnimation({ kind, items, winnerKey, onDone }: { kind: Exclude<PickerAnim, 'klasik' | 'karisik'>; items: AnimItem[]; winnerKey: string; onDone: () => void }) {
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const finish = (ms: number) => setTimeout(() => doneRef.current(), ms)
  if (kind === 'cark') return <Wheel items={items} winnerKey={winnerKey} finish={finish} />
  if (kind === 'slot') return <Slot items={items} winnerKey={winnerKey} finish={finish} />
  if (kind === 'deste') return <Deck items={items} winnerKey={winnerKey} finish={finish} />
  return <Strip items={items} winnerKey={winnerKey} finish={finish} />
}

type P = { items: AnimItem[]; winnerKey: string; finish: (ms: number) => ReturnType<typeof setTimeout> }

function Poster({ src, className = '', style }: { src: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 shadow-xl shadow-black/60 ${className}`} style={style}>
      {src && <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />}
    </div>
  )
}

// Çark: 12 afiş bir halkada; yavaşlayarak döner, kazanan üstteki oka gelir
function Wheel({ items, winnerKey, finish }: P) {
  const list = useMemo(() => {
    const others = items.filter((i) => i.key !== winnerKey).slice(0, 11)
    const w = items.find((i) => i.key === winnerKey)!
    const arr = [...others]
    arr.splice(Math.floor(Math.random() * (arr.length + 1)), 0, w)
    return arr
  }, [items, winnerKey])
  const n = list.length
  const wi = list.findIndex((i) => i.key === winnerKey)
  const [deg, setDeg] = useState(0)
  useEffect(() => {
    const t1 = setTimeout(() => setDeg(360 * 6 + (360 - (wi * 360) / n)), 60)
    const t2 = finish(4800)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [wi, n])
  const R = 'min(30vmin, 260px)'
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative" style={{ width: `calc(${R} * 2 + 120px)`, height: `calc(${R} * 2 + 120px)` }}>
        <div className="absolute left-1/2 -top-3 -translate-x-1/2 z-10 h-0 w-0 border-x-[16px] border-x-transparent border-t-[28px] border-t-[#00c0fa]" style={{ filter: 'drop-shadow(0 0 10px #00c0fa)' }} />
        <div
          className="absolute inset-0 rounded-full"
          style={{ transform: `rotate(${deg}deg)`, transition: 'transform 4.6s cubic-bezier(.12,.8,.12,1)', boxShadow: '0 0 60px rgba(0,192,250,.25), inset 0 0 60px rgba(0,192,250,.12)', border: '2px solid rgba(0,192,250,.35)' }}
        >
          {list.map((it, i) => (
            <div key={it.key} className="absolute left-1/2 top-1/2" style={{ width: 84, marginLeft: -42, marginTop: -63, transform: `rotate(${(i * 360) / n}deg) translateY(calc(-1 * ${R}))` }}>
              <Poster src={it.cover} />
            </div>
          ))}
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-28 w-28 rounded-full border-2 border-[#00c0fa]/60 bg-neutral-950 flex items-center justify-center" style={{ boxShadow: '0 0 40px rgba(0,192,250,.45)' }}>
          <img src="/logoblue.png" alt="" className="h-14 w-14 object-contain" />
        </div>
      </div>
    </div>
  )
}

// Slot: üç makara; sırayla durur, ortadaki çizgide üçü de kazanan olur
function Slot({ items, winnerKey, finish }: P) {
  const W = items.find((i) => i.key === winnerKey)!
  const IDX = 22
  const reels = useMemo(() => [0, 1, 2].map(() => Array.from({ length: 26 }, (_, i) => (i === IDX ? W : pick(items)))), [items, W])
  const [go, setGo] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setGo(true), 60)
    const t2 = finish(2400 + 1600 + 700)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])
  const H = 210
  const STEP = H + 12
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative flex gap-4 p-5 rounded-3xl border border-neutral-700 bg-gradient-to-b from-neutral-800 to-neutral-950 shadow-2xl shadow-black/70">
        <div className="pointer-events-none absolute left-3 right-3 top-1/2 h-0.5 -mt-px z-10" style={{ background: 'linear-gradient(90deg,transparent,#00c0fa,transparent)', boxShadow: '0 0 14px #00c0fa' }} />
        {reels.map((reel, r) => (
          <div key={r} className="relative overflow-hidden rounded-xl bg-neutral-950" style={{ width: 160, height: H + 120, boxShadow: 'inset 0 20px 24px -12px #000, inset 0 -20px 24px -12px #000' }}>
            <div
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              style={{ gap: 12, transform: go ? `translateY(${-(IDX * STEP) + 60}px)` : 'translateY(0)', transition: go ? `transform ${2.4 + r * 0.8}s cubic-bezier(.15,.85,.2,1.02)` : 'none' }}
            >
              {reel.map((it, i) => (
                <Poster key={i} src={it.cover} style={{ width: 140, height: H, aspectRatio: 'auto' }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Deste: kartlar karılır (üç kez), en üstteki ters döner
function Deck({ items, winnerKey, finish }: P) {
  const cards = useMemo(() => [...items.filter((i) => i.key !== winnerKey).slice(0, 9), items.find((i) => i.key === winnerKey)!], [items, winnerKey])
  const [step, setStep] = useState(0)
  useEffect(() => {
    const ts = [1, 2, 3, 4, 5, 6].map((s) => setTimeout(() => setStep(s), s * 430))
    const flip = setTimeout(() => setStep(7), 6 * 430 + 300)
    const t = finish(6 * 430 + 1500)
    return () => {
      ts.forEach(clearTimeout)
      clearTimeout(flip)
      clearTimeout(t)
    }
  }, [])
  const offs = useMemo(() => cards.map(() => [90 + Math.random() * 90, -30 + Math.random() * 60, 8 + Math.random() * 16]), [cards])
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: 1200 }}>
      <div className="relative" style={{ width: 210, height: 315 }}>
        {cards.map((c, i) => {
          const spread = step > 0 && step < 7 && step % 2 === 1
          const dir = i % 2 ? 1 : -1
          const top = i === cards.length - 1
          const t =
            step === 7 && top
              ? 'translateY(-24px) scale(1.2) rotateY(180deg)'
              : spread
                ? `translate(${dir * offs[i][0]}px, ${offs[i][1]}px) rotate(${dir * offs[i][2]}deg)`
                : `translate(${i * 0.7}px, ${-i * 0.7}px)`
          return (
            <div key={c.key} className="absolute inset-0" style={{ transformStyle: 'preserve-3d', transform: t, transition: 'transform .5s cubic-bezier(.3,.9,.3,1)', zIndex: i }}>
              <div className="absolute inset-0 rounded-xl border-2 border-[#00c0fa]/50 flex items-center justify-center" style={{ backfaceVisibility: 'hidden', background: 'repeating-linear-gradient(45deg,#0b1426 0 12px,#0e1a33 12px 24px)' }}>
                <img src="/logoblue.png" alt="" className="h-16 w-16 object-contain opacity-90" />
              </div>
              <div className="absolute inset-0 rounded-xl overflow-hidden" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                <img src={c.cover} alt="" className="h-full w-full object-cover" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Film şeridi: afişler hızla akar, yavaşlayıp kazananı ortadaki çerçevede durdurur
function Strip({ items, winnerKey, finish }: P) {
  const W = items.find((i) => i.key === winnerKey)!
  const IDX = 38
  const seq = useMemo(() => Array.from({ length: 44 }, (_, i) => (i === IDX ? W : pick(items))), [items, W])
  const [x, setX] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const CARD = 150
  const GAP = 14
  useEffect(() => {
    const cw = box.current?.clientWidth ?? window.innerWidth
    const t1 = setTimeout(() => setX(cw / 2 - (16 + IDX * (CARD + GAP) + CARD / 2)), 60)
    const t2 = finish(5300)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])
  return (
    <div ref={box} className="absolute inset-0 flex items-center overflow-hidden">
      <div
        className="relative flex py-5 px-4 bg-[#111]"
        style={{ gap: GAP, transform: `translateX(${x ?? 0}px)`, transition: x === null ? 'none' : 'transform 5s cubic-bezier(.1,.75,.12,1)' }}
      >
        <div className="absolute inset-x-0 top-1 h-3" style={{ background: 'repeating-linear-gradient(90deg,#000 0 12px,transparent 12px 26px)' }} />
        <div className="absolute inset-x-0 bottom-1 h-3" style={{ background: 'repeating-linear-gradient(90deg,#000 0 12px,transparent 12px 26px)' }} />
        {seq.map((it, i) => (
          <Poster key={i} src={it.cover} className="shrink-0" style={{ width: CARD }} />
        ))}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[3px] border-[#00c0fa]" style={{ width: CARD + 22, height: CARD * 1.5 + 22, boxShadow: '0 0 0 3000px rgba(5,6,10,.55), 0 0 40px #00c0fa' }} />
    </div>
  )
}
