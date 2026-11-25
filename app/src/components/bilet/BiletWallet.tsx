import { useEffect, useMemo, useRef, useState } from 'react'
import { shortDay } from '../../lib/bilet'
import { tt } from '../../lib/i18n'
import { TicketBack, TicketFront, TICKET_RATIO, type BiletItem } from './Ticket'

// Telefonda Biletlerim (A17): telefon cüzdanı gibi üst üste dizili bir deste. Bilete dokununca yukarı kayıp büyür
// (diğerleri alta toplanır); açık bileti sağa-sola kaydırınca bir sonrakine geçilir, dokununca çevrilir, aşağı
// çekince deste kapanır. Masaüstündeki duvar değişmedi.

const PEEK = 54
const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* desteklenmiyor */
  }
}

export default function BiletWallet({ items, onEdit, onOpenRow, onDelete }: { items: (BiletItem & { no: number })[]; onEdit: (b: BiletItem) => void; onOpenRow: (b: BiletItem) => void; onDelete: (b: BiletItem) => void }) {
  const years = useMemo(() => [...new Set(items.map((b) => (b.date ?? '').slice(0, 4) || tt('Tarihsiz')))], [items])
  const [year, setYear] = useState<string | null>(null)
  const shown = useMemo(() => (year ? items.filter((b) => ((b.date ?? '').slice(0, 4) || tt('Tarihsiz')) === year) : items), [items, year])
  const [sel, setSel] = useState<number | null>(null)
  const [flip, setFlip] = useState(false)
  const [drag, setDrag] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const [w, setW] = useState(() => Math.min(window.innerWidth - 32, 520))
  useEffect(() => {
    const on = () => setW(Math.min(window.innerWidth - 32, 520))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  useEffect(() => {
    setSel(null)
    setFlip(false)
  }, [year])
  const h = w / TICKET_RATIO
  const open = sel !== null && sel < shown.length
  const cur = open ? shown[sel!] : null

  const go = (d: 1 | -1) => {
    if (sel === null) return
    const n = sel + d
    if (n < 0 || n >= shown.length) return
    buzz(6)
    setSel(n)
    setFlip(false)
  }
  const close = () => {
    setSel(null)
    setFlip(false)
  }

  // Kapalı deste yüksekliği; açıkken: büyük bilet + düğmeler + alttaki toplu deste
  const stackH = open ? h + 96 + Math.min(shown.length - 1, 5) * 7 + h * 0.35 : (shown.length - 1) * PEEK + h

  return (
    <div className="space-y-3">
      {years.length > 1 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {[null, ...years].map((y) => (
            <button key={y ?? 'hepsi'} onClick={() => setYear(y)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${year === y ? 'border-white bg-white text-black' : 'border-neutral-700 text-neutral-300'}`}>
              {y ?? tt('Hepsi')}
            </button>
          ))}
        </div>
      )}
      <div className="relative mx-auto transition-[height] duration-300" style={{ width: w, height: stackH }}>
        {shown.map((b, i) => {
          let y: number
          let scale = 1
          let z = i
          let opacity = 1
          if (!open) y = i * PEEK
          else if (i === sel) {
            y = 0
            z = 100
          } else {
            // alttaki toplu deste: seçilenden sonrakiler sırayla, öncekiler en altta
            const order = i > sel! ? i - sel! - 1 : shown.length - sel! - 1 + i
            y = h + 96 + Math.min(order, 5) * 7
            scale = 1 - Math.min(order, 5) * 0.03
            z = 50 - order
            opacity = order > 5 ? 0 : 1
          }
          const isCur = open && i === sel
          const dx = isCur ? drag.x : 0
          const dy = isCur ? Math.max(0, drag.y) : 0
          return (
            <div
              key={b.id}
              role="button"
              tabIndex={0}
              aria-label={b.title}
              className={`absolute left-0 top-0 select-none ${isCur ? 'touch-none' : 'touch-pan-y'}`}
              style={{
                width: w,
                height: h,
                zIndex: z,
                opacity,
                transform: `translate(${dx}px, ${y + dy}px) scale(${scale}) rotate(${dx / 30}deg)`,
                transformOrigin: '50% 0',
                transition: start.current && isCur ? 'none' : 'transform .38s cubic-bezier(.2,.8,.2,1), opacity .3s',
                filter: 'drop-shadow(0 -6px 14px rgba(0,0,0,.45))',
              }}
              onPointerDown={(e) => {
                start.current = { x: e.clientX, y: e.clientY, t: Date.now() }
                if (isCur) e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                if (!isCur || !start.current) return
                setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y })
              }}
              onPointerUp={(e) => {
                const st = start.current
                start.current = null
                const mx = st ? e.clientX - st.x : 0
                const my = st ? e.clientY - st.y : 0
                setDrag({ x: 0, y: 0 })
                const tap = Math.abs(mx) < 8 && Math.abs(my) < 8
                if (!open) {
                  if (tap) {
                    buzz(8)
                    setSel(i)
                  }
                  return
                }
                if (!isCur) {
                  if (tap) {
                    buzz(6)
                    setSel(i)
                    setFlip(false)
                  }
                  return
                }
                if (my > 90 && Math.abs(my) > Math.abs(mx)) close()
                else if (mx < -60) go(1)
                else if (mx > 60) go(-1)
                else if (tap) setFlip((f) => !f)
              }}
              onPointerCancel={() => {
                start.current = null
                setDrag({ x: 0, y: 0 })
              }}
            >
              <div style={{ width: w, height: h, fontSize: w / 48, perspective: 1200 }}>
                <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transition: 'transform .5s', transform: isCur && flip ? 'rotateY(180deg)' : 'none' }}>
                  <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden' }}>
                    <TicketFront b={b} no={b.no} />
                  </div>
                  {isCur && (
                    <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                      <TicketBack b={b} no={b.no} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {cur && (
          <div className="absolute left-0 right-0 z-[101] flex flex-col gap-2" style={{ top: h + 12 }}>
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              <span className="truncate">
                № {String(cur.no).padStart(3, '0')} · {shortDay(cur.date) || tt('Tarihsiz')}
                {cur.cinema ? ` · ${cur.cinema}` : ''}
              </span>
              <span className="shrink-0 tabular-nums">
                {sel! + 1}/{shown.length}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setFlip((f) => !f)} className="flex-1 rounded-xl bg-neutral-800 py-2.5 text-sm text-neutral-100">
                {flip ? tt('Ön yüz') : tt('Çevir')}
              </button>
              <button onClick={() => onEdit(cur)} className="flex-1 rounded-xl bg-neutral-800 py-2.5 text-sm text-neutral-100">
                {tt('Düzenle')}
              </button>
              {cur.rowId && (
                <button onClick={() => onOpenRow(cur)} className="flex-1 rounded-xl bg-neutral-800 py-2.5 text-sm text-neutral-100">
                  {tt('Yapım')}
                </button>
              )}
              <button onClick={() => onDelete(cur)} className="rounded-xl bg-neutral-800 px-3.5 py-2.5 text-sm text-red-300" aria-label={tt('Sil')}>
                🗑
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="text-center text-[11px] text-neutral-600">{open ? tt('Sağa-sola kaydır: diğer bilet · dokun: çevir · aşağı çek: desteyi kapat') : tt('Bir bilete dokun, büyüsün')}</p>
    </div>
  )
}
