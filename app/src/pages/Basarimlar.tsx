import { useEffect, useMemo, useState } from 'react'
import type { WatchedMap } from '../types'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { api } from '../lib/api'
import { computeAchievements } from '../lib/achievements'
import { tt } from '../lib/i18n'
import PageSkeleton from '../components/Skeleton'

// Başarımlar sayfası (v1.23.4, Ayarlar › Ekstralar › Başarımlar)
export default function Basarimlar() {
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const [watched, setWatched] = useState<WatchedMap>({})
  const [universesDone, setUniversesDone] = useState(0)
  useEffect(() => {
    api.getWatched().then(setWatched).catch(() => {})
    if (settings.boardId) api.getEvrenler(settings.boardId).then((d) => setUniversesDone(countDone(d.universes))).catch(() => {})
  }, [settings.boardId])
  const list = useMemo(() => (board ? computeAchievements(board, rows, watched, { universesDone }) : []), [board, rows, watched, universesDone])
  if (loading || !board) return <PageSkeleton kind="posters" />
  const got = list.filter((a) => a.value >= a.goal).length
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-8 sm:px-10" style={{ background: 'radial-gradient(ellipse at 15% 0%, rgba(250,204,21,.16), transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(139,92,246,.14), transparent 60%), var(--color-neutral-950)' }}>
        <p className="text-sm font-semibold tracking-widest text-amber-300">{tt('ARGUS')}</p>
        <h1 className="text-4xl sm:text-5xl font-black text-neutral-50 tracking-tight mt-1">{tt('Başarımlar')}</h1>
        <p className="text-neutral-300 mt-2">{tt('{0} rozetin {1} tanesini kazandın.', list.length, got)}</p>
        <div className="mt-4 h-2 max-w-md rounded-full bg-neutral-800 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${(got / Math.max(1, list.length)) * 100}%`, background: 'linear-gradient(90deg,#f59e0b,#fde047)' }} />
        </div>
      </section>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-x-4 gap-y-8">
        {list.map((a) => {
          const ok = a.value >= a.goal
          return (
            <div key={a.id} className="group text-center" title={`${a.hint} · ${a.value}/${a.goal}`}>
              <div
                className="mx-auto h-24 w-[88px] flex items-center justify-center text-4xl transition duration-300 group-hover:-translate-y-1.5 group-hover:-rotate-3"
                style={{ clipPath: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)', background: `linear-gradient(135deg,${a.colors[0]},${a.colors[1]})`, filter: ok ? undefined : 'grayscale(1) brightness(.35)' }}
              >
                {a.emoji}
              </div>
              <p className="mt-2 text-sm font-bold text-neutral-100">{a.title}</p>
              <p className="text-[11px] text-neutral-500">{a.hint}</p>
              {!ok && (
                <div className="mx-auto mt-1.5 h-1 w-20 rounded-full bg-neutral-800 overflow-hidden">
                  <div className="h-full" style={{ width: `${(a.value / a.goal) * 100}%`, background: 'linear-gradient(90deg,#015eea,#00c0fa)' }} />
                </div>
              )}
              {!ok && <p className="text-[10px] text-neutral-600 mt-0.5 tabular-nums">{a.value}/{a.goal}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Bitirilen evrenler: çıkmış bütün (yan olmayan) yapımları izlenmiş evren sayısı
export function countDone(universes: { items: { released: boolean; extra: boolean; watched: boolean }[] }[]): number {
  return universes.filter((u) => {
    const main = u.items.filter((i) => i.released && !i.extra)
    return main.length > 0 && main.every((i) => i.watched)
  }).length
}
