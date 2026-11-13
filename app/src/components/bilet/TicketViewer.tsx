import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TicketBack, TicketFront, TICKET_RATIO, useTicketTint, type BiletItem } from './Ticket'
import { longDay } from '../../lib/bilet'
import Icon from '../Icon'
import { useEscape } from '../../hooks/useEscape'
import { tt } from '../../lib/i18n'

// Bilete tıklayınca: bilet tıklandığı yerden ekranın ortasına büyür; fareyle oynatınca hafifçe yatar ve üstünde
// ışık gezer; tıklayınca / Boşluk ile 3B döner (arkası); ← → ile diğer biletler; Esc ile yerine geri küçülür.

const CSS = `
.bilet-glare { opacity: 0; transition: opacity .3s; mix-blend-mode: soft-light;
  background: radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), rgba(255,255,255,.55), rgba(255,255,255,0) 42%); }
.bilet-glare::after { content: ''; position: absolute; inset: 0; mix-blend-mode: color-dodge; opacity: .22;
  background: linear-gradient(115deg, transparent 20%, rgba(255,80,200,.5) 38%, rgba(80,200,255,.5) 50%, rgba(255,230,90,.45) 62%, transparent 80%);
  background-size: 250% 100%; background-position: var(--hx, 50%) 0; }
.bilet-stage:hover .bilet-glare { opacity: 1 }
.bilet-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
`

export default function TicketViewer({
  items,
  index,
  origin,
  onIndex,
  onClose,
  onEdit,
  onDelete,
  onOpenRow,
}: {
  items: (BiletItem & { no: number })[]
  index: number
  origin: DOMRect | null
  onIndex: (i: number) => void
  onClose: () => void
  onEdit: (b: BiletItem) => void
  onDelete: (b: BiletItem) => void
  onOpenRow?: (b: BiletItem) => void
}) {
  const b = items[index]
  const tint = useTicketTint(b?.poster || b?.cover)
  const [flipped, setFlipped] = useState(false)
  const [width, setWidth] = useState(() => Math.min(920, window.innerWidth * 0.86, (window.innerHeight - 220) * TICKET_RATIO))
  const pos = useRef<HTMLDivElement>(null)
  const tilt = useRef<HTMLDivElement>(null)
  const startIndex = useRef(index)
  const closing = useRef(false)
  useEscape(true, () => close())

  useEffect(() => {
    const r = () => setWidth(Math.min(920, window.innerWidth * 0.86, (window.innerHeight - 220) * TICKET_RATIO))
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [])

  // açılış: tıklanan küçük biletin yerinden büyü
  useLayoutEffect(() => {
    const el = pos.current
    if (!el || !origin) return
    const t = el.getBoundingClientRect()
    const dx = origin.left + origin.width / 2 - (t.left + t.width / 2)
    const dy = origin.top + origin.height / 2 - (t.top + t.height / 2)
    const s = origin.width / t.width
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    if (closing.current) return
    closing.current = true
    const el = pos.current
    if (el && origin && index === startIndex.current && !flipped) {
      const t = el.getBoundingClientRect()
      const dx = origin.left + origin.width / 2 - (t.left + t.width / 2)
      const dy = origin.top + origin.height / 2 - (t.top + t.height / 2)
      const a = el.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${origin.width / t.width})` }], { duration: 360, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
      a.onfinish = onClose
    } else onClose()
  }

  function go(d: number) {
    const n = (index + d + items.length) % items.length
    setFlipped(false)
    onIndex(n)
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.key === 'ArrowRight' && items.length > 1) go(1)
      else if (e.key === 'ArrowLeft' && items.length > 1) go(-1)
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  })

  function move(e: React.PointerEvent) {
    const el = tilt.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.transform = `rotateX(${(0.5 - y) * 10}deg) rotateY(${(x - 0.5) * 14}deg)`
    el.style.setProperty('--gx', `${(flipped ? 1 - x : x) * 100}%`)
    el.style.setProperty('--gy', `${y * 100}%`)
    el.style.setProperty('--hx', `${(flipped ? 1 - x : x) * 100}%`)
    el.style.setProperty('--ha', `${Math.round((x + y) * 180)}deg`)
  }
  function leave() {
    if (tilt.current) tilt.current.style.transform = 'rotateX(0) rotateY(0)'
  }

  if (!b) return null
  const h = width / TICKET_RATIO
  const btn = 'inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-white/[0.12] hover:text-white transition'
  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md" onClick={close} style={{ animation: 'argus-fade-in .3s ease-out' }}>
      <style>{CSS}</style>
      {/* biletin renginde hafif bir ışık */}
      <div className="pointer-events-none absolute inset-0 transition-[background] duration-700" style={{ background: `radial-gradient(ellipse 60% 45% at 50% 48%, ${tint.accent}38, transparent 70%)` }} />
      <p className="relative mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-neutral-400" onClick={(e) => e.stopPropagation()}>
        № {String(b.no).padStart(3, '0')}
        {b.date ? <span className="text-neutral-600">{'  ·  '}</span> : null}
        {longDay(b.date)}
      </p>
      <div ref={pos} onClick={(e) => e.stopPropagation()} className="bilet-stage relative" style={{ width, height: h, perspective: 1600 }} onPointerMove={move} onPointerLeave={leave}>
        <div ref={tilt} className="h-full w-full" style={{ transformStyle: 'preserve-3d', transition: 'transform .18s ease-out' }}>
          <div
            className="relative h-full w-full cursor-pointer"
            onClick={() => setFlipped((f) => !f)}
            style={{ transformStyle: 'preserve-3d', transition: 'transform .8s cubic-bezier(.3,1.3,.5,1)', transform: `rotateY(${flipped ? 180 : 0}deg)`, fontSize: width / 48 }}
          >
            <div className="bilet-face absolute inset-0 drop-shadow-[0_30px_50px_rgba(0,0,0,.6)]">
              <TicketFront b={b} no={b.no} glare />
            </div>
            <div className="bilet-face absolute inset-0 drop-shadow-[0_30px_50px_rgba(0,0,0,.6)]" style={{ transform: 'rotateY(180deg)' }}>
              <TicketBack b={b} no={b.no} glare />
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-8 flex flex-wrap items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
        {items.length > 1 && (
          <button onClick={() => go(-1)} className={btn} title="←">
            ‹
          </button>
        )}
        <button onClick={() => setFlipped((f) => !f)} className={btn}>
          <Icon name="repeat" className="h-3.5 w-3.5" />
          {flipped ? tt('Önünü göster') : tt('Arkasını çevir')}
          <kbd className="ml-1 rounded border border-white/20 px-1 font-mono text-[10px] text-neutral-400">{tt('Boşluk')}</kbd>
        </button>
        {onOpenRow && b.rowId && (
          <button onClick={() => onOpenRow(b)} className={btn}>
            {tt('Yapımı aç')}
          </button>
        )}
        <button onClick={() => onEdit(b)} className={btn}>
          <Icon name="pencil" className="h-3.5 w-3.5" />
          {tt('Düzenle')}
        </button>
        <button onClick={() => onDelete(b)} className={`${btn} hover:border-red-400/50 hover:text-red-200`}>
          {tt('Sil')}
        </button>
        {items.length > 1 && (
          <button onClick={() => go(1)} className={btn} title="→">
            ›
          </button>
        )}
      </div>
      {items.length > 1 && (
        <p className="mt-3 text-[11px] text-neutral-500">
          {index + 1} / {items.length}
        </p>
      )}
    </div>,
    document.body,
  )
}
