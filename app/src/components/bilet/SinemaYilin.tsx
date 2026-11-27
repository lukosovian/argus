import { useMemo, useState } from 'react'
import { tt } from '../../lib/i18n'
import { locale } from '../../lib/i18n'
import type { BiletItem } from './Ticket'

// Sinema yılın (Y31): biletlerden yıllık özet — kaç seans, harcama, bilet başı ortalama, en sevdiğin format, en çok
// gittiğin gün ve saat, en çok gittiğin 3 sinema, en çok kiminle, aylara dağılım. Biletlerim'in üstünde.

// "520 ₺", "1.250,00 TL", "250", "180,50" → sayı; anlaşılmayan → null
export function priceNumber(p?: string): number | null {
  const m = /(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?(?:\.(\d{1,2}))?/.exec((p ?? '').replace(/ /g, ' '))
  if (!m) return null
  const n = Number(`${m[1].replace(/[.\s]/g, '')}.${m[2] ?? m[3] ?? '0'}`)
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null
}

function top<T extends string>(list: T[]): [T, number][] {
  const m = new Map<T, number>()
  for (const v of list) if (v) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

const money = (n: number) => `${new Intl.NumberFormat(locale(), { maximumFractionDigits: n < 100 ? 2 : 0 }).format(n)} ₺`

// onPick (O2): sinema / kişi satırına tıklayınca Biletlerim duvarı ona göre süzülür
export default function SinemaYilin({ list, onPick, picked }: { list: BiletItem[]; onPick?: (kind: 'cinema' | 'person', v: string) => void; picked?: { cinema: string | null; person: string | null } }) {
  const years = useMemo(() => [...new Set(list.map((b) => (b.date ?? '').slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort().reverse(), [list])
  const [year, setYear] = useState<string | null>(null)
  const y = year && years.includes(year) ? year : years[0]
  const s = useMemo(() => {
    const items = list.filter((b) => (b.date ?? '').startsWith(y ?? '----'))
    const prices = items.map((b) => priceNumber(b.price)).filter((n): n is number => n !== null)
    const spend = prices.reduce((a, b) => a + b, 0)
    const months = Array.from({ length: 12 }, (_, i) => items.filter((b) => Number((b.date ?? '').slice(5, 7)) === i + 1).length)
    const days = top(
      items
        .filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? ''))
        .map((b) => {
          const [yy, mm, dd] = b.date!.split('-').map(Number)
          return new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(new Date(yy, mm - 1, dd))
        }),
    )
    const hours = top(
      items
        .map((b) => /^(\d{1,2})/.exec((b.time ?? '').trim())?.[1])
        .filter((h): h is string => Boolean(h))
        .map((h) => {
          const n = Number(h)
          return n < 12 ? tt('Sabah') : n < 17 ? tt('Öğleden sonra') : n < 21 ? tt('Akşam') : tt('Gece')
        }),
    )
    const people = top(items.flatMap((b) => (b.withWho ?? '').split(/,| ve /).map((x) => x.trim())).filter(Boolean))
    return {
      n: items.length,
      spend,
      priced: prices.length,
      avg: prices.length ? spend / prices.length : 0,
      format: top(items.map((b) => b.format ?? ''))[0],
      cinemas: top(items.map((b) => (b.cinema ?? '').trim())).slice(0, 3),
      day: days[0],
      hour: hours[0],
      who: people[0],
      alone: items.filter((b) => !(b.withWho ?? '').trim()).length,
      months,
    }
  }, [list, y])
  if (!y || s.n === 0) return null
  const maxM = Math.max(...s.months, 1)
  const monthNames = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale(), { month: 'short' }).format(new Date(2024, i, 1)))
  const tile = 'rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3'
  return (
    <section className="rounded-3xl border border-neutral-800 p-5 sm:p-6" style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(245,200,120,0.08), transparent 55%), var(--color-neutral-950)' }}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/70">{tt('Sinema yılın')}</p>
          <h2 className="text-2xl font-black tracking-tight text-neutral-50">{tt('{0} yılında {1} seans', y, s.n)}</h2>
        </div>
        {years.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {years.slice(0, 6).map((yy) => (
              <button key={yy} onClick={() => setYear(yy)} className={`rounded-full border px-3 py-1 text-xs transition ${yy === y ? 'border-white bg-white text-black' : 'border-neutral-700 text-neutral-400 hover:text-neutral-100'}`}>
                {yy}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className={tile}>
          <b className="block text-xl text-neutral-50">{s.priced ? money(s.spend) : '—'}</b>
          <span className="text-[11px] text-neutral-400">{s.priced && s.priced < s.n ? tt('harcama ({0} biletin fiyatı yazılı)', s.priced) : tt('sinemaya harcadığın')}</span>
        </div>
        <div className={tile}>
          <b className="block text-xl text-neutral-50">{s.priced ? money(s.avg) : '—'}</b>
          <span className="text-[11px] text-neutral-400">{tt('bilet başı ortalama')}</span>
        </div>
        <div className={tile}>
          <b className="block truncate text-xl text-neutral-50">{s.format ? s.format[0] : '—'}</b>
          <span className="text-[11px] text-neutral-400">{s.format ? tt('en sevdiğin format ({0} kez)', s.format[1]) : tt('format yazılmamış')}</span>
        </div>
        <div className={tile}>
          <b className="block truncate text-xl capitalize text-neutral-50">{s.day ? s.day[0] : '—'}</b>
          <span className="text-[11px] text-neutral-400">{s.hour ? tt('en çok gittiğin gün · çoğunlukla {0}', s.hour[0].toLocaleLowerCase('tr')) : tt('en çok gittiğin gün')}</span>
        </div>
      </div>
      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[1.1fr_1fr]">
        <div className={tile}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{tt('En çok gittiğin sinemalar')}</p>
          {s.cinemas.length ? (
            <ol className="space-y-1.5">
              {s.cinemas.map(([c, n], i) => (
                <li key={c}>
                  <button
                    type="button"
                    disabled={!onPick}
                    onClick={() => onPick?.('cinema', c)}
                    aria-pressed={picked?.cinema === c}
                    title={onPick ? tt('Bu sinemanın biletlerini göster') : undefined}
                    className={`-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2.5 rounded-lg px-1.5 py-0.5 text-left text-sm transition enabled:hover:bg-white/[0.05] ${picked?.cinema === c ? 'bg-amber-300/10 ring-1 ring-amber-300/40' : ''}`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-300 text-black' : 'bg-neutral-800 text-neutral-300'}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-neutral-100">{c}</span>
                    <span className="text-xs text-neutral-500">{tt('{0} seans', n)}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-neutral-500">{tt('Biletlerde sinema adı yazılmamış.')}</p>
          )}
          <p className="mt-3 text-xs text-neutral-400">
            {s.who && onPick ? (
              <button
                type="button"
                onClick={() => onPick('person', s.who![0])}
                aria-pressed={picked?.person === s.who[0]}
                title={tt('Bu kişiyle gittiğin biletleri göster')}
                className={`underline decoration-dotted underline-offset-2 hover:text-neutral-100 ${picked?.person === s.who[0] ? 'text-amber-200' : ''}`}
              >
                {tt('En çok {0} ile gittin ({1} kez).', s.who[0], s.who[1])}
              </button>
            ) : s.who ? (
              tt('En çok {0} ile gittin ({1} kez).', s.who[0], s.who[1])
            ) : (
              ''
            )}{' '}
            {s.alone ? tt('{0} seansa tek başına.', s.alone) : ''}
          </p>
        </div>
        <div className={tile}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{tt('Aylara göre')}</p>
          <div className="flex h-24 items-end gap-1">
            {s.months.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1" title={tt('{0}: {1} seans', monthNames[i], n)}>
                {n > 0 && <span className="text-[9px] tabular-nums text-neutral-400">{n}</span>}
                <div className="w-full rounded-t-[3px]" style={{ height: `${(n / maxM) * 64}px`, minHeight: n ? 4 : 2, background: n ? 'linear-gradient(180deg,#f5c878,#c8902c)' : 'rgba(255,255,255,.06)' }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {monthNames.map((m) => (
              <span key={m} className="flex-1 truncate text-center text-[9px] text-neutral-500">
                {m.slice(0, 3)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
