import { useState } from 'react'
import { episodeKey, todayIso, type Season } from '../types'
import { fmtDate, tt } from '../lib/i18n'

// "Uzun ara verdin" — kullanıcı bir diziye aylar sonra dönünce kaldığı yeri hatırlamak istedi. Son izlenen bölümün
// üzerinden 3 haftadan fazla geçtiyse ve sırada yayınlanmış, izlenmemiş bölüm varsa: kaldığın yer ve son izlediğin
// birkaç bölümün özeti (TMDB'den). Sadece izlediklerinin özeti gösterilir, ileriye dair bir şey söylenmez.

const GAP_DAYS = 21

function daysSince(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const [ty, tm, td] = todayIso().split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 864e5)
}

export default function ResumeRecap({ seasons, watched }: { seasons: Season[]; watched: Record<string, string[]> }) {
  const [open, setOpen] = useState(false)
  const today = todayIso()
  const eps = seasons
    .filter((s) => s.seasonNumber >= 1)
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
    .flatMap((s) => [...s.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber).map((e) => ({ s: s.seasonNumber, e, key: episodeKey(s.seasonNumber, e.episodeNumber) })))
  const fullDates = (k: string) => (watched[k] ?? []).map((d) => String(d).split('/').pop() ?? '').filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  // Kaldığın yer: izlenmiş son bölümden sonraki ilk yayınlanmış, izlenmemiş bölüm
  let lastIdx = -1
  eps.forEach((x, i) => {
    if ((watched[x.key] ?? []).length) lastIdx = i
  })
  if (lastIdx < 0) return null
  const next = eps.slice(lastIdx + 1).find((x) => x.e.airDate && x.e.airDate <= today && !(watched[x.key] ?? []).length)
  if (!next) return null
  const lastDate = eps
    .slice(0, lastIdx + 1)
    .flatMap((x) => fullDates(x.key))
    .sort()
    .pop()
  if (!lastDate) return null
  const gap = daysSince(lastDate)
  if (gap < GAP_DAYS) return null
  const recent = eps.slice(Math.max(0, lastIdx - 2), lastIdx + 1).filter((x) => (watched[x.key] ?? []).length)
  const [y, m, d] = lastDate.split('-').map(Number)
  const ago = gap >= 60 ? tt('{0} ay önce', Math.round(gap / 30)) : tt('{0} gün önce', gap)

  return (
    <section id="rd-ozet" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-neutral-50">{tt('Uzun ara verdin')}</p>
          <p className="text-sm text-neutral-300">
            {tt('Son bölümü {0} izledin ({1}).', ago, fmtDate(y, m - 1, d, { short: true }))}{' '}
            {tt('Kaldığın yer: {0}. Sezon {1}. Bölüm', next.s, next.e.episodeNumber)}
            {next.e.name ? ` · ${next.e.name}` : ''}
          </p>
        </div>
        {recent.some((x) => x.e.overview) && (
          <button onClick={() => setOpen((v) => !v)} className="text-sm rounded-lg px-3 py-1.5 border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 shrink-0">
            {open ? tt('Özeti gizle') : tt('Neler olmuştu? Özeti göster')}
          </button>
        )}
      </div>
      {open && (
        <ol className="mt-3 space-y-2.5">
          {recent.map((x) => (
            <li key={x.key} className="flex gap-3">
              {x.e.stillUrl && <img src={x.e.stillUrl} alt="" loading="lazy" className="hidden sm:block w-28 aspect-video object-cover rounded-md shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-100">
                  {tt('{0}. Sezon {1}. Bölüm', x.s, x.e.episodeNumber)}
                  {x.e.name ? ` · ${x.e.name}` : ''}
                </p>
                <p className="text-sm text-neutral-400">{x.e.overview || tt('Bu bölümün özeti yok.')}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
