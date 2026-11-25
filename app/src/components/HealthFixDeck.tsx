import { useEffect, useMemo, useRef, useState } from 'react'
import type { Row } from '../types'
import { tt } from '../lib/i18n'

// Sağlık Kontrolü › "Tek tek düzelt" (A21): uzun liste yerine her seferinde tek soru. Sorunlar açılışta sıraya
// dizilir (anlık görüntü); düzelen kart listeden düşer, sıradaki gelir. Telefonda kart sola kaydırılınca atlanır,
// sağa kaydırılınca bir öncekine dönülür; klavyede ← →.

export type FixAction = {
  label: string
  run: (input?: string) => Promise<unknown> | unknown
  kind?: 'primary' | 'plain' | 'dashed'
  // 'year': yanında yıl kutusu olan düğme ("Sadece yıl")
  input?: 'year'
  title?: string
  // Kartta kal (ör. kaydı açınca sıradakine geçilmesin)
  stay?: boolean
}
export type FixIssue = {
  key: string
  row: Row
  label: string
  question: string
  detail?: string
  group: string
  actions: FixAction[]
}

export function HealthRing({ pct, size = 64 }: { pct: number; size?: number }) {
  const color = pct >= 90 ? '#10b981' : pct >= 70 ? '#00c0fa' : '#f59e0b'
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="43" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" />
        <circle cx="50" cy="50" r="43" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.max(pct, 1)} 100`} style={{ transition: 'stroke-dasharray .5s', filter: `drop-shadow(0 0 4px ${color})` }} />
      </svg>
      <span className="relative text-sm font-bold tabular-nums text-neutral-50">%{pct}</span>
    </span>
  )
}

export default function HealthFixDeck({ issues, poster, onOpenRow, onExit }: { issues: FixIssue[]; poster: (row: Row) => string | null; onOpenRow: (row: Row) => void; onExit: () => void }) {
  // Sıra açılışta sabitlenir; sonradan çıkan yeni sorunlar bu turda sorulmaz
  const [queue] = useState(() => issues.map((i) => i.key))
  const [idx, setIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [year, setYear] = useState('')
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const [drag, setDrag] = useState(0)
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0)
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const live = useMemo(() => new Map(issues.map((i) => [i.key, i])), [issues])
  const fixed = queue.filter((k) => !live.has(k)).length
  // Şu anki konumdan itibaren hâlâ duran ilk sorun
  let pos = idx
  while (pos < queue.length && !live.has(queue[pos])) pos++
  const cur = pos < queue.length ? live.get(queue[pos]) : undefined

  useEffect(() => setYear(''), [cur?.key])

  const go = (dir: 1 | -1) => {
    if (dir === 1) {
      if (cur) setSkipped((s) => new Set(s).add(cur.key))
      setIdx(pos + 1)
    } else {
      let p = pos - 1
      while (p >= 0 && !live.has(queue[p])) p--
      if (p >= 0) setIdx(p)
    }
  }
  const animate = (dir: 1 | -1) => {
    setLeaving(dir)
    window.setTimeout(() => {
      setLeaving(0)
      setDrag(0)
      go(dir)
    }, 180)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') animate(1)
      else if (e.key === 'ArrowLeft') animate(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function run(a: FixAction) {
    if (!cur || busy) return
    if (a.input === 'year' && !/^(19|20)\d\d$/.test(year)) return
    setBusy(true)
    try {
      await a.run(a.input === 'year' ? year : undefined)
      if (a.stay) return
      // Düzelen sorun listeden kendiliğinden düşer; düşmediyse (ör. TMDB'de bilgi çıkmadı) sıradakine geç
      setIdx(pos + 1)
    } catch {
      /* hata bildirimi çağıranda */
    } finally {
      setBusy(false)
    }
  }

  const total = queue.length
  const left = queue.slice(pos).filter((k) => live.has(k)).length
  const doneAll = !cur

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onExit} className="text-sm text-neutral-400 hover:text-neutral-50">
          ← {tt('Listeye dön')}
        </button>
        <span className="ml-auto text-xs tabular-nums text-neutral-400">{tt('{0} düzeldi · {1} kaldı', fixed, left)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${total ? ((total - left) / total) * 100 : 100}%` }} />
      </div>

      {doneAll ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 px-6 py-12 text-center">
          <p className="text-4xl">✓</p>
          <p className="mt-3 text-lg font-semibold text-neutral-50">{fixed ? tt('{0} sorun düzeldi!', fixed) : tt('Tur bitti')}</p>
          <p className="mt-1 text-sm text-neutral-400">{skipped.size ? tt('{0} sorunu atladın; listeden ya da yeni bir turla bakabilirsin.', skipped.size) : tt('Bu turda sorulacak başka bir şey kalmadı.')}</p>
          <button onClick={onExit} className="mt-5 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-[#00c0fa]">
            {tt('Listeye dön')}
          </button>
        </div>
      ) : (
        <div
          className="touch-pan-y select-none"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button,input')) return
            start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
          }}
          onPointerMove={(e) => {
            if (!start.current || start.current.id !== e.pointerId) return
            const dx = e.clientX - start.current.x
            if (Math.abs(dx) > Math.abs(e.clientY - start.current.y)) setDrag(dx)
          }}
          onPointerUp={() => {
            const dx = drag
            start.current = null
            if (dx < -80) animate(1)
            else if (dx > 80) animate(-1)
            else setDrag(0)
          }}
          onPointerCancel={() => {
            start.current = null
            setDrag(0)
          }}
        >
          <div
            key={cur.key}
            className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5 shadow-xl"
            style={{
              transform: leaving ? `translateX(${leaving * -110}%) rotate(${leaving * -6}deg)` : `translateX(${drag}px) rotate(${drag / 40}deg)`,
              opacity: leaving ? 0 : 1 - Math.min(Math.abs(drag) / 400, 0.5),
              transition: start.current ? 'none' : 'transform .18s ease, opacity .18s ease',
            }}
          >
            <div className="flex gap-4">
              {poster(cur.row) ? (
                <img src={poster(cur.row)!} alt="" className="h-28 w-[75px] shrink-0 rounded-lg object-cover" draggable={false} />
              ) : (
                <div className="flex h-28 w-[75px] shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-2xl text-neutral-600">?</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">{cur.group}</p>
                <button onClick={() => onOpenRow(cur.row)} className="mt-0.5 block max-w-full truncate text-left text-lg font-bold text-neutral-50 hover:text-[#00c0fa]" title={tt('Kaydı aç')}>
                  {cur.label}
                </button>
                <p className="mt-1 text-sm text-neutral-300">{cur.question}</p>
                {cur.detail && <p className="mt-1 text-xs text-neutral-500">{cur.detail}</p>}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {cur.actions.map((a) =>
                a.input === 'year' ? (
                  <span key={a.label} className="inline-flex items-center overflow-hidden rounded-lg border border-neutral-700">
                    <input
                      value={year}
                      onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      onKeyDown={(e) => e.key === 'Enter' && void run(a)}
                      inputMode="numeric"
                      placeholder={String(new Date().getFullYear())}
                      className="w-16 bg-transparent px-2 py-1.5 text-sm text-neutral-100 outline-none"
                    />
                    <button disabled={busy || !/^(19|20)\d\d$/.test(year)} onClick={() => void run(a)} className="border-l border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40">
                      {a.label}
                    </button>
                  </span>
                ) : (
                  <button
                    key={a.label}
                    disabled={busy}
                    title={a.title}
                    onClick={() => void run(a)}
                    className={`rounded-lg px-3.5 py-1.5 text-sm transition disabled:opacity-40 ${
                      a.kind === 'primary' ? 'bg-[#00c0fa] font-semibold text-black hover:bg-[#33ccfb]' : a.kind === 'dashed' ? 'border border-dashed border-neutral-600 text-neutral-300 hover:border-neutral-400' : 'border border-neutral-700 text-neutral-200 hover:border-neutral-500'
                    }`}
                  >
                    {a.label}
                  </button>
                ),
              )}
              <button disabled={busy} onClick={() => animate(1)} className="ml-auto rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-50">
                {tt('Atla')} →
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-neutral-600">{tt('Kartı sola kaydır: atla · sağa kaydır: önceki')}</p>
        </div>
      )}
    </div>
  )
}
