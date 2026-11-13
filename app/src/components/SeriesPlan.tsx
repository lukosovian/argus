import { useEffect, useState } from 'react'
import type { Season } from '../types'
import { episodeKey, todayIso } from '../types'
import { useProfiles } from '../hooks/useProfiles'
import { notifyDataChanged } from '../lib/dataEvents'
import { tt } from '../lib/i18n'

// Ekstralar › Dizi bitirme planı (v1.23.4): "X günde bitir" — çıkmış ama izlenmemiş bölümler kalan günlere bölünür,
// izledikçe (ya da geride kalınca) her gün yeniden hesaplanır; takvimde de görünür (bkz. Takvim, planEvents).
// Kayıt: data/profiles/<id>/planlar.json { [rowId]: { start, end } }

export type Plans = Record<string, { start: string; end: string }>

export function remainingEpisodes(seasons: Season[], watched: Record<string, string[]>, today = todayIso()) {
  let n = 0
  for (const s of seasons) if (s.seasonNumber > 0) for (const e of s.episodes) if (e.airDate && e.airDate <= today && !watched[episodeKey(s.seasonNumber, e.episodeNumber)]?.length) n++
  return n
}

const dayDiff = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 864e5)
const addDays = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00')
  x.setDate(x.getDate() + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

// Bugünden plan sonuna kadar gün gün bölüm hedefi (bugün izlenenler bugünün hedefinden düşer)
export function planDays(plan: { end: string }, remaining: number, watchedToday: number, today = todayIso()): { date: string; n: number }[] {
  const days = Math.max(1, dayDiff(today, plan.end) + 1)
  const total = remaining + watchedToday
  const per = Math.ceil(total / days)
  const out: { date: string; n: number }[] = []
  let left = total
  for (let i = 0; i < days && left > 0; i++) {
    const n = Math.min(per, left)
    out.push({ date: addDays(today, i), n })
    left -= n
  }
  return out
}

export default function SeriesPlan({ rowId, seasons, watched }: { rowId: string; seasons: Season[]; watched: Record<string, string[]> }) {
  const { activeProfileId } = useProfiles()
  const url = `/api/profiles/${activeProfileId}/planlar`
  const [plans, setPlans] = useState<Plans | null>(null)
  const [days, setDays] = useState(7)
  useEffect(() => {
    fetch(url)
      .then((r) => r.json())
      .then(setPlans)
      .catch(() => setPlans({}))
  }, [rowId])
  const today = todayIso()
  const remaining = remainingEpisodes(seasons, watched, today)
  const watchedToday = Object.values(watched).filter((l) => l.some((d) => d.startsWith(today))).length
  async function save(p: { start: string; end: string } | null) {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowId, plan: p }) })
    setPlans((ps) => {
      const n = { ...(ps ?? {}) }
      if (p) n[rowId] = p
      else delete n[rowId]
      return n
    })
    notifyDataChanged()
  }
  if (!plans) return null
  const plan = plans[rowId]
  if (!plan) {
    if (remaining === 0) return null
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] px-4 py-3">
        <span className="text-sm text-neutral-200">
          🗓️ {tt('{0} bölüm kaldı.', remaining)} {tt('Bitirme planı yap:')}
        </span>
        <span className="flex gap-1">
          {[3, 7, 14, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`text-xs rounded-full px-2.5 py-1 border ${days === d ? 'border-violet-400 bg-violet-500/20 text-neutral-50' : 'border-neutral-700 text-neutral-400'}`}>
              {tt('{0} gün', d)}
            </button>
          ))}
        </span>
        <button onClick={() => save({ start: today, end: addDays(today, days - 1) })} className="ml-auto text-xs font-semibold rounded-lg px-3 py-1.5 text-white" style={{ background: 'linear-gradient(90deg,#7c3aed,#c084fc)' }}>
          {tt('{0} günde bitir', days)}
        </button>
      </div>
    )
  }
  const sched = planDays(plan, remaining, watchedToday, today)
  const todayTarget = sched[0]?.date === today ? sched[0].n : 0
  const late = dayDiff(today, plan.end) < 0
  return (
    <div className="rounded-2xl border border-violet-400/30 bg-violet-500/[0.07] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-neutral-100">🗓️ {tt('Bitirme planı')}</p>
        <p className="text-xs text-neutral-400">
          {remaining === 0 ? tt('Bitti! 🎉') : late ? tt('Plan süresi doldu, {0} bölüm kaldı', remaining) : tt('{0} bölüm kaldı · {1} tarihinde biter', remaining, plan.end.split('-').reverse().join('.'))}
        </p>
        <button onClick={() => save(null)} className="ml-auto text-xs text-neutral-500 hover:text-rose-300">
          {tt('Planı kaldır')}
        </button>
      </div>
      {remaining > 0 && !late && (
        <>
          <p className="mt-2 text-sm text-violet-100">
            {tt('Bugün: {0} bölüm', todayTarget)} <span className="text-neutral-400">· {tt('izlenen {0}', watchedToday)}</span>
          </p>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {sched.slice(0, 7).map((d, i) => (
              <div key={d.date} className={`rounded-lg border px-2 py-1.5 ${i === 0 ? 'border-violet-400 bg-violet-500/15' : 'border-neutral-800 bg-neutral-900/60'}`}>
                <p className="text-[10px] text-neutral-500">{d.date.slice(8)}.{d.date.slice(5, 7)}</p>
                <p className="text-sm font-bold text-neutral-100">{d.n}</p>
                <div className="flex gap-0.5 mt-1 flex-wrap">
                  {Array.from({ length: Math.min(d.n, 8) }, (_, k) => (
                    <i key={k} className={`h-1.5 w-2.5 rounded-sm ${i === 0 && k < watchedToday ? 'bg-emerald-400' : 'bg-neutral-700'}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
