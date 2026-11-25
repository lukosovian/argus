import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { api } from '../../lib/api'
import { computeStats, fmtDuration, type Stats } from '../../lib/flashback'
import { entryEnd, toEntries } from '../../lib/dateRange'
import { resolveRole } from '../../lib/roles'
import { useHomeSettings } from '../../hooks/useHomeSettings'
import { useProfiles } from '../../hooks/useProfiles'
import { useProfileStats } from '../../lib/profileStats'
import { useEscape } from '../../hooks/useEscape'
import { monthNames, tt } from '../../lib/i18n'
import { MOBILE } from '../../lib/mobile/ui'
import type { Board, Row, WatchedMap } from '../../types'
import { FbMark } from './FbLogo'

// Yaz ortası mini Flashback (Y30): 1–15 Temmuz arası ana sayfada "Yılın yarısı" kartı; açınca 6 kartlık kısa hikâye —
// ilk 6 ayın yapım sayısı ve süresi, en çok izlenen tür, en iyi puanın, en yoğun ay, hedefe ne kadar yaklaştığın.
// Hesap Flashback'le aynı (lib/flashback › computeStats), sadece 30 Haziran'a kadarki izlemelerle.
// Kart kapatılınca o yıl bir daha çıkmaz. Denemek için: ana sayfa adresine ?yariyil=1.

const hideKey = (y: number) => `argus_yariyil_kapali_${y}`

export function yariYilOpen(now = new Date()) {
  return now.getMonth() === 6 && now.getDate() <= 15
}

// İzlemeler sadece 1 Ocak – 30 Haziran
function firstHalf(board: Board, rows: Row[], watched: WatchedMap, year: number): { rows: Row[]; watched: WatchedMap } {
  const cut = `${year}-06-30`
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const outRows = dateProp
    ? rows.map((r) => {
        const v = r.values[dateProp.id]
        if (v === undefined || v === null || v === '') return r
        const kept = toEntries(v).filter((e) => entryEnd(e).slice(0, 10) <= cut)
        return { ...r, values: { ...r.values, [dateProp.id]: Array.isArray(v) ? kept : (kept[0] ?? '') } }
      })
    : rows
  const outW: WatchedMap = {}
  for (const [rowId, map] of Object.entries(watched)) {
    const m: Record<string, string[]> = {}
    for (const [k, list] of Object.entries(map ?? {})) {
      const l = (list ?? []).filter((d) => !d || d.slice(0, 10) <= cut)
      if (l.length) m[k] = l
    }
    outW[rowId] = m as WatchedMap[string]
  }
  return { rows: outRows, watched: outW }
}

export default function YariYilCard({ board, rows }: { board: Board | null | undefined; rows: Row[] }) {
  const loc = useLocation()
  const { activeProfileId } = useProfiles()
  const year = new Date().getFullYear()
  const forced = new URLSearchParams(loc.search).get('yariyil') === '1'
  const [hidden, setHidden] = useState(() => {
    try {
      return Boolean(localStorage.getItem(hideKey(year)))
    } catch {
      return false
    }
  })
  const visible = Boolean(board) && (forced || (yariYilOpen() && !hidden))
  const [watched, setWatched] = useState<WatchedMap | null>(null)
  const [runtimes, setRuntimes] = useState<Record<string, number>>({})
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!visible || !board) return
    let alive = true
    api.getWatched().then((w) => alive && setWatched(w)).catch(() => alive && setWatched({}))
    api
      .getFlashback(board.id, String(year))
      .then((x) => alive && setRuntimes(x.runtimes ?? {}))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [visible, board, year, activeProfileId])
  const stats = useMemo(() => {
    if (!visible || !board || !watched) return null
    const h = firstHalf(board, rows, watched, year)
    return computeStats(board, h.rows, h.watched, String(year), { runtimes, collections: {}, mediaTypes: {}, hours: Array(24).fill(0), timed: 0 })
  }, [visible, board, rows, watched, runtimes, year])

  if (!visible || !stats || stats.order.length < 3) return null
  const posters = stats.order.filter((t) => t.poster).slice(0, 5)
  return (
    <>
      <div className="fb-page relative overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-6" style={{ background: 'radial-gradient(ellipse at 0% 0%, rgba(0,225,255,.18), transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(255,45,138,.18), transparent 55%), #07070b' }}>
        <button
          onClick={() => {
            try {
              localStorage.setItem(hideKey(year), '1')
            } catch {
              /* önemsiz */
            }
            setHidden(true)
          }}
          className="absolute right-3 top-3 z-10 h-8 w-8 rounded-full bg-white/5 text-neutral-400 hover:text-white"
          aria-label={tt('Kapat')}
          title={tt('Bu yıl bir daha gösterme')}
        >
          ×
        </button>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-[#7fe9ff]">
              <FbMark className="h-5 w-5" />
              {tt('Flashback · yılın yarısı')}
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{tt('{0}, yarı yolda', year)}</h2>
            <p className="mt-1 text-sm text-neutral-300">{tt('İlk 6 ayda {0} yapım, {1}. Kısa bir geri sarma?', stats.order.length, fmtDuration(stats.filmMinutes + stats.seriesMinutes))}</p>
            <button onClick={() => setOpen(true)} className="mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-black" style={{ background: 'linear-gradient(90deg,#00e1ff,#ff2d8a)' }}>
              ▶ {tt('Hikâyeyi izle')}
            </button>
          </div>
          <div className="flex shrink-0 -space-x-6">
            {posters.map((t, i) => (
              <img key={t.row.id} src={t.poster} alt="" className="h-32 w-[86px] rounded-xl border border-white/10 object-cover shadow-2xl" style={{ transform: `rotate(${(i - 2) * 5}deg) translateY(${Math.abs(i - 2) * 5}px)`, zIndex: 5 - Math.abs(i - 2) }} />
            ))}
          </div>
        </div>
      </div>
      {open && <YariYilStory stats={stats} year={year} onClose={() => setOpen(false)} />}
    </>
  )
}

const DUR = 6000

function YariYilStory({ stats, year, onClose }: { stats: Stats; year: number; onClose: () => void }) {
  useEscape(true, onClose)
  const { settings } = useHomeSettings()
  const ps = useProfileStats(true)
  const [i, setI] = useState(0)
  const [held, setHeld] = useState(false)
  const [, setP] = useState(0) // sadece yeniden çizim için
  const downAt = useRef(0)
  const months = monthNames()
  const half = stats.months.slice(0, 6)
  const busy = half.indexOf(Math.max(...half))
  const best = stats.scores.top[0] ?? null
  const genre = stats.topGenres[0]
  const goal = settings.yearGoalNext && settings.yearGoalNext.year === String(year) ? settings.yearGoalNext.n : (settings.yearGoal ?? 0)
  const done = ps?.yearDone ?? stats.films + stats.seriesFinished
  const N = 6
  // Kartta geçen süre: kart değişince sıfırlanır, basılı tutunca kaldığı yerden sürer
  const elapsed = useRef({ i: 0, k: 0 })
  if (elapsed.current.i !== i) elapsed.current = { i, k: 0 }
  useEffect(() => {
    if (held) return
    let raf = 0
    const start = performance.now() - elapsed.current.k * DUR
    const step = (t: number) => {
      const k = (t - start) / DUR
      if (k >= 1) {
        if (i < N - 1) setI(i + 1)
        else onClose()
        return
      }
      elapsed.current.k = k
      setP(k)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, held])
  const go = (d: number) => {
    const n = i + d
    if (n < 0) return setI(0)
    if (n >= N) return onClose()
    setI(n)
  }
  const big = 'text-6xl sm:text-7xl font-black tracking-tight text-white'
  const cards = [
    <>
      <FbMark className="h-16 w-16" />
      <p className="mt-6 text-sm font-bold uppercase tracking-[0.3em] text-[#7fe9ff]">{tt('Yılın yarısı')}</p>
      <p className={big}>{year}</p>
      <p className="mt-3 text-lg text-neutral-300">{tt('Ocak – Haziran')}</p>
    </>,
    <>
      <p className="text-sm uppercase tracking-[0.25em] text-neutral-400">{tt('İlk 6 ayda')}</p>
      <p className={big}>{stats.order.length}</p>
      <p className="text-xl font-bold text-white">{tt('yapım izledin')}</p>
      <p className="mt-6 text-3xl font-black text-[#7fe9ff]">{fmtDuration(stats.filmMinutes + stats.seriesMinutes)}</p>
      <p className="mt-1 text-sm text-neutral-400">{tt('{0} film · {1} bölüm · {2} gün ekran başında', stats.films, stats.episodes, stats.activeDays)}</p>
    </>,
    <>
      <p className="text-sm uppercase tracking-[0.25em] text-neutral-400">{tt('En çok izlediğin tür')}</p>
      <p className="mt-2 text-5xl font-black text-white sm:text-6xl">{genre?.label ?? '—'}</p>
      {genre && <p className="mt-2 text-neutral-300">{tt('{0} yapım', genre.count)}</p>}
      <p className="mt-8 text-sm text-neutral-400">{tt('Şimdilik unvanın')}</p>
      <p className="text-2xl font-black" style={{ background: 'linear-gradient(90deg,#00e1ff,#ff2d8a)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
        {stats.persona.title}
      </p>
    </>,
    best ? (
      <>
        <p className="text-sm uppercase tracking-[0.25em] text-neutral-400">{tt('İlk yarının en iyisi')}</p>
        {best.poster && <img src={best.poster} alt="" className="mt-4 h-64 w-44 rounded-2xl object-cover shadow-[0_20px_60px_rgba(255,45,138,.35)]" />}
        <p className="mt-4 text-2xl font-black text-white">{best.title}</p>
        {best.score !== null && <p className="text-3xl font-black text-amber-300">★ {best.score.toFixed(1)}</p>}
      </>
    ) : (
      <>
        <p className="text-sm uppercase tracking-[0.25em] text-neutral-400">{tt('İlk yarının en iyisi')}</p>
        <p className="mt-4 text-xl text-neutral-300">{tt('Bu yıl henüz puan vermedin. İkinci yarıda puanlarsan Aralık\'ta en iyilerin çıkar.')}</p>
      </>
    ),
    <>
      <p className="text-sm uppercase tracking-[0.25em] text-neutral-400">{tt('En yoğun ayın')}</p>
      <p className="mt-2 text-5xl font-black capitalize text-white">{months[busy]}</p>
      <div className="mt-8 flex h-40 w-full max-w-xs items-end gap-2">
        {half.map((v, k) => (
          <div key={k} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs tabular-nums text-neutral-400">{v}</span>
            <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, (v / Math.max(...half, 1)) * 120)}px`, background: k === busy ? 'linear-gradient(180deg,#00e1ff,#ff2d8a)' : 'rgba(255,255,255,.14)' }} />
            <span className="text-[10px] uppercase text-neutral-500">{months[k].slice(0, 3)}</span>
          </div>
        ))}
      </div>
    </>,
    goal ? (
      <>
        <p className="text-sm uppercase tracking-[0.25em] text-neutral-400">{tt('{0} hedefin', year)}</p>
        <p className={big}>
          {done}
          <span className="text-3xl text-neutral-500"> / {goal}</span>
        </p>
        <div className="mt-6 h-3 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (done / goal) * 100)}%`, background: 'linear-gradient(90deg,#00e1ff,#ff2d8a)' }} />
        </div>
        <p className="mt-4 text-lg font-bold text-white">
          {done >= goal ? tt('Hedefini şimdiden tamamladın!') : done >= goal / 2 ? tt('Yarıyı geçtin, tam yolundasın.') : tt('Yarıya {0} kaldı — ikinci yarı senin.', Math.ceil(goal / 2 - done))}
        </p>
      </>
    ) : (
      <>
        <p className="text-sm uppercase tracking-[0.25em] text-neutral-400">{tt('Yılın ikinci yarısı')}</p>
        <p className="mt-4 text-3xl font-black text-white">{tt('Aralık\'ta tam Flashback seni bekliyor.')}</p>
        <p className="mt-3 text-neutral-400">{tt('İstatistikler\'den bir yıl hedefi koyarsan yıl sonunda ne kadar yaklaştığını görürsün.')}</p>
      </>
    ),
  ]
  return createPortal(
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/90" onClick={onClose}>
      <div
        className="relative flex h-full max-h-[860px] w-full max-w-[480px] select-none flex-col overflow-hidden sm:h-[92vh] sm:rounded-3xl"
        style={{ background: `radial-gradient(ellipse at ${20 + i * 12}% 0%, rgba(0,225,255,.22), transparent 55%), radial-gradient(ellipse at ${80 - i * 10}% 100%, rgba(255,45,138,.22), transparent 55%), #07070b`, paddingTop: MOBILE ? 'env(safe-area-inset-top)' : undefined }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={() => {
          downAt.current = performance.now()
          setHeld(true)
        }}
        onPointerUp={(e) => {
          setHeld(false)
          const r = e.currentTarget.getBoundingClientRect()
          // kısa dokunuş: ileri/geri; basılı tutmak sadece durdurur
          if (performance.now() - downAt.current < 350) go(e.clientX - r.left < r.width / 3 ? -1 : 1)
        }}
        onPointerCancel={() => setHeld(false)}
      >
        <div className="flex gap-1 px-3 pt-3">
          {Array.from({ length: N }, (_, k) => (
            <div key={k} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <div className="h-full bg-white" style={{ width: k < i ? '100%' : k === i ? `${elapsed.current.k * 100}%` : '0%' }} />
            </div>
          ))}
        </div>
        <button onClick={onClose} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} className="absolute right-3 top-6 z-10 h-9 w-9 rounded-full bg-black/40 text-lg text-white" aria-label={tt('Kapat')}>
          ×
        </button>
        <div key={i} className="flex flex-1 flex-col items-center justify-center px-8 text-center" style={{ animation: 'argus-fade-in .45s ease-out' }}>
          {cards[i]}
        </div>
        <p className="pb-5 text-center text-[11px] uppercase tracking-[0.3em] text-neutral-500">ARGUS · Flashback</p>
      </div>
    </div>,
    document.body,
  )
}
