import { useMemo, useState } from 'react'
import { useArchive } from './useArchive'
import { preferWatched, sfx, shuffle, type GameItem } from '../../lib/games'
import { tt } from '../../lib/i18n'
import PageSkeleton from '../../components/Skeleton'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import { FinishInfo, GameShell, useFinish, type Finish, PRIMARY_BTN, PRIMARY_BG } from '../../components/oyun/GameShell'

// G1 Hangisi daha yüksek? (v1.24): iki yapım yan yana; puan (senin verdiğin), çıkış yılı (hangisi daha yeni) ya da süre
// (hangisi daha uzun, filmler). Doğru bildikçe seri uzar; kazanan kalır, yanına yenisi gelir. Yanılınca biter.

type Mode = 'puan' | 'yil' | 'sure'
const MODES: { id: Mode; label: string; q: string }[] = [
  { id: 'puan', label: tt('Puanın'), q: tt('Hangisine daha yüksek puan verdin?') },
  { id: 'yil', label: tt('Çıkış yılı'), q: tt('Hangisi daha yeni?') },
  { id: 'sure', label: tt('Süre'), q: tt('Hangisi daha uzun?') },
]
const val = (m: Mode, x: GameItem) => (m === 'puan' ? x.score : m === 'yil' ? x.year : x.series ? null : x.runtime)
const show = (m: Mode, v: number) => (m === 'puan' ? `★ ${v.toFixed(1)}` : m === 'yil' ? String(v) : tt('{0} dk', v))

export default function HangisiYuksek() {
  const { pool, loading } = useArchive()
  const [mode, setMode] = useState<Mode>('puan')
  const finish = useFinish(`yuksek_${mode}`)
  const items = useMemo(() => preferWatched(pool.filter((x) => val(mode, x) !== null && x.poster), 10), [pool, mode])
  const [pair, setPair] = useState<[GameItem, GameItem] | null>(null)
  const [used, setUsed] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<number | null>(null)
  const [streak, setStreak] = useState(0)
  const [over, setOver] = useState(false)
  const [fin, setFin] = useState<Finish | null>(null)

  function nextOf(exclude: Set<string>, against?: GameItem): GameItem | null {
    // Eşit değerler sıkıcı: farklı olan bir yapım seç
    const left = items.filter((x) => !exclude.has(x.id) && (!against || val(mode, x) !== val(mode, against)))
    return left.length ? shuffle(left)[0] : null
  }
  function start() {
    const a = nextOf(new Set())
    if (!a) return
    const b = nextOf(new Set([a.id]), a)
    if (!b) return
    setPair([a, b])
    setUsed(new Set([a.id, b.id]))
    setPicked(null)
    setStreak(0)
    setOver(false)
    setFin(null)
  }
  function pick(i: number) {
    if (!pair || picked !== null) return
    setPicked(i)
    const [a, b] = pair
    const va = val(mode, a)!
    const vb = val(mode, b)!
    const ok = i === 0 ? va >= vb : vb >= va
    if (ok) {
      sfx.ok()
      const s = streak + 1
      setStreak(s)
      if (s % 5 === 0) sfx.streak()
      setTimeout(() => {
        const winner = i === 0 ? a : b
        const u = new Set(used)
        const c = nextOf(u, winner)
        if (!c) {
          setOver(true)
          finish(s).then(setFin)
          return
        }
        u.add(c.id)
        setUsed(u)
        setPair([winner, c])
        setPicked(null)
      }, 1300)
    } else {
      sfx.bad()
      setTimeout(() => {
        setOver(true)
        finish(streak).then(setFin)
      }, 1300)
    }
  }

  if (loading) return <PageSkeleton />
  const m = MODES.find((x) => x.id === mode)!
  return (
    <GameShell game={`yuksek_${mode}`} title={tt('Hangisi daha yüksek?')} subtitle={m.q} score={pair && !over ? streak : undefined}>
      {!pair || over ? (
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8 space-y-5 max-w-2xl">
          {over && (
            <div>
              <p className="text-neutral-400">{tt('Seri bitti!')}</p>
              <p className="text-6xl font-black text-neutral-50 tabular-nums">{streak}</p>
              <p className="text-sm text-neutral-400">{tt('üst üste doğru')}</p>
            </div>
          )}
          <FinishInfo f={fin} />
          <div>
            <p className="text-xs font-bold tracking-wider text-neutral-500 mb-2">{tt('NEYE GÖRE')}</p>
            <div className="flex flex-wrap gap-2">
              {MODES.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setMode(x.id)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${mode === x.id ? 'border-[#00c0fa] bg-[#00c0fa]/12 text-white' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          {items.length < 4 ? (
            <EmptyState art="kayit" title={tt('Yeterli yapım yok')} text={tt('Bu oyun için en az 4 yapımda bu bilgi (puan, yıl ya da süre) dolu olmalı.')} />
          ) : (
            <button onClick={start} className={PRIMARY_BTN} style={PRIMARY_BG}>
              <Icon name="play" className="h-4 w-4" />
              {over ? tt('Tekrar oyna') : tt('Başla')}
            </button>
          )}
        </div>
      ) : (
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-xl font-bold text-neutral-100 mb-5">{m.q}</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8">
            {pair.map((x, i) => {
              const v = val(mode, x)!
              const other = val(mode, pair[1 - i])!
              const win = v >= other
              return (
                <button
                  key={x.id + i}
                  onClick={() => pick(i)}
                  disabled={picked !== null}
                  className={`group text-center ${i === 1 ? 'order-3' : ''}`}
                  style={{ animation: 'argus-toast-in .35s ease-out' }}
                >
                  <div
                    className={`relative aspect-[2/3] rounded-2xl overflow-hidden ring-2 transition ${
                      picked === null ? 'ring-transparent group-hover:ring-[#00c0fa] group-hover:-translate-y-1' : win ? 'ring-emerald-400' : 'ring-rose-500/70'
                    }`}
                  >
                    <img src={x.poster} alt="" className="h-full w-full object-cover" />
                    {picked !== null && (
                      <span className={`absolute inset-x-0 bottom-0 py-2 text-2xl font-black ${win ? 'bg-emerald-500/85' : 'bg-black/75'} text-white`}>{show(mode, v)}</span>
                    )}
                  </div>
                  <p className="mt-2 font-bold text-neutral-100 line-clamp-2">{x.title}</p>
                  {mode !== 'yil' && x.year && <p className="text-xs text-neutral-500">{x.year}</p>}
                </button>
              )
            })}
            <span className="order-2 text-xl font-black text-neutral-600">VS</span>
          </div>
          <p className="text-center text-sm text-neutral-500 mt-5">{tt('Seri: {0}', streak)}</p>
        </div>
      )}
    </GameShell>
  )
}
