import { useMemo, useState } from 'react'
import type { Board, Row } from '../../types'
import { titleText } from '../../types'
import { resolveRole } from '../../lib/roles'
import { locale, tt } from '../../lib/i18n'

// ARGUS Android › Takvim. Kullanıcı "takvim takvim gibi değil, Netflix uygulamasındaki gibi olsun" dedi:
//   - üstte gerçek bir ay takvimi (izlenen günlerde nokta, yaklaşanlarda mavi halka, bugün dolu daire) —
//     bir güne dokununca aşağıdaki listede o güne gidilir, boş güne dokununca o güne ekleme paneli açılır;
//   - altta Netflix'in "Yeni ve Popüler"i gibi: solda tarih (ay kısaltması + büyük gün), sağda görselli kartlar.

export interface MobileCalEvent {
  key: string
  date: string
  row: Row
  kind: 'watch' | 'episodes' | 'upcoming' | 'release'
  sub: string
  rewatch?: boolean
  finished?: boolean
}
export interface MobileRelease {
  tmdbId: number
  title: string
  image?: string | null
  releaseDate: string
}

const WEEKDAYS = () => {
  const base = new Date(2024, 0, 1) // Pazartesi
  return Array.from({ length: 7 }, (_, i) => new Date(base.getFullYear(), 0, 1 + i).toLocaleDateString(locale(), { weekday: 'narrow' }))
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function MobileMonth({
  board,
  year,
  month,
  today,
  byDay,
  releasesByDay,
  onPrev,
  onNext,
  onToday,
  onOpenDay,
  onOpenRow,
  onOpenRelease,
}: {
  board: Board
  year: number
  month: number
  today: string
  byDay: Map<string, MobileCalEvent[]>
  releasesByDay: Map<string, MobileRelease[]>
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onOpenDay: (d: string) => void
  onOpenRow: (r: Row) => void
  onOpenRelease: (c: MobileRelease) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  const logoProp = board.properties.find((p) => p.id === board.titleImagePropertyId && p.type === 'image')
  const posterProp = resolveRole(board, 'poster')
  const img = (r: Row) => ((coverProp && (r.values[coverProp.id] as string)) || (posterProp && (r.values[posterProp.id] as string)) || '') as string
  const logo = (r: Row) => ((logoProp && (r.values[logoProp.id] as string)) || '') as string
  const name = (r: Row) => (titleProp ? titleText(titleProp, r.values[titleProp.id]) : '') || tt('İsimsiz')

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const lead = (first.getDay() + 6) % 7
    const count = new Date(year, month + 1, 0).getDate()
    return [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => ymd(new Date(year, month, i + 1)))]
  }, [year, month])

  const days = cells.filter((d): d is string => !!d && ((byDay.get(d)?.length ?? 0) > 0 || releasesByDay.has(d)))
  const monthName = new Date(year, month, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })

  function pick(d: string) {
    const has = (byDay.get(d)?.length ?? 0) > 0 || releasesByDay.has(d)
    // İleri tarihli boş günde ekleme paneli boş açılıyordu (kullanıcı "ileri tarihe tıklıyorum boş sayfa açılıyor" dedi):
    // sadece seçilir; geçmiş/bugün boş günde ekleme paneli açılır.
    if (!has) {
      if (d > today) return setSelected(d)
      return onOpenDay(d)
    }
    setSelected(d)
    document.getElementById(`gun-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-5">
      {/* Ay takvimi */}
      <div className="rounded-2xl bg-neutral-900/70 border border-white/[0.06] p-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={onPrev} aria-label={tt('Önceki ay')} className="h-9 w-9 rounded-full text-xl text-neutral-300 active:bg-neutral-800">
            ‹
          </button>
          <button onClick={onToday} className="text-[17px] font-bold capitalize text-neutral-50">
            {monthName}
          </button>
          <button onClick={onNext} aria-label={tt('Sonraki ay')} className="h-9 w-9 rounded-full text-xl text-neutral-300 active:bg-neutral-800">
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-neutral-500 mb-1">
          {WEEKDAYS().map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`b${i}`} />
            const evs = byDay.get(d) ?? []
            const watched = evs.some((e) => e.kind === 'watch' || e.kind === 'episodes')
            const coming = evs.some((e) => e.kind === 'upcoming' || e.kind === 'release') || releasesByDay.has(d)
            const isToday = d === today
            const isSel = d === selected
            return (
              <button key={d} onClick={() => pick(d)} className="flex flex-col items-center py-1">
                <span
                  className={`h-8 w-8 flex items-center justify-center rounded-full text-[14px] tabular-nums ${
                    isToday ? 'bg-[#00c0fa] text-black font-bold' : isSel ? 'bg-neutral-50 text-neutral-950 font-semibold' : coming && !watched ? 'ring-1 ring-[#00c0fa]/70 text-neutral-100' : 'text-neutral-200'
                  }`}
                >
                  {Number(d.slice(8))}
                </span>
                <span className="mt-0.5 h-1.5 flex gap-0.5">
                  {watched && <span className="h-1.5 w-1.5 rounded-full bg-neutral-50/80" />}
                  {coming && <span className="h-1.5 w-1.5 rounded-full bg-[#00c0fa]" />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Kullanıcı "takvimden izledim gibi şeyler ekleyemiyor muyum" dedi — ekleme paneli görünür bir düğmeyle */}
      <button
        onClick={() => onOpenDay(selected && selected <= today ? selected : today)}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#00c0fa]/40 bg-[#00c0fa]/10 py-3 text-[15px] font-semibold text-[#7fdcff] active:bg-[#00c0fa]/20"
      >
        <span className="text-xl leading-none">+</span>
        {selected && selected < today
          ? tt('{0} günü izlediğini ekle', new Date(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)) - 1, Number(selected.slice(8))).toLocaleDateString(locale(), { day: 'numeric', month: 'long' }))
          : tt('Bugün izlediğini ekle')}
      </button>

      {/* Gün gün liste — "Yeni ve Popüler" düzeni */}
      {days.length === 0 && <p className="text-sm text-neutral-500 text-center py-8">{tt('Bu ay için kayıt yok.')}</p>}
      {days.map((d) => {
        const date = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)))
        const evs = byDay.get(d) ?? []
        const rels = d.startsWith(monthPrefix) ? (releasesByDay.get(d) ?? []) : []
        return (
          <section key={d} id={`gun-${d}`} className="flex gap-3" style={{ scrollMarginTop: 'calc(env(safe-area-inset-top) + 6rem)' }}>
            <button onClick={() => onOpenDay(d)} className="w-11 shrink-0 self-start sticky text-center pt-1" style={{ top: 'calc(env(safe-area-inset-top) + 6rem)' }}>
              <span className={`block text-[11px] font-semibold uppercase ${d === today ? 'text-[#00c0fa]' : 'text-neutral-400'}`}>
                {date.toLocaleDateString(locale(), { month: 'short' })}
              </span>
              <span className={`block text-[28px] font-bold leading-none ${d === today ? 'text-[#00c0fa]' : 'text-neutral-50'}`}>{date.getDate()}</span>
              <span className="block mt-0.5 text-[10px] text-neutral-500">{date.toLocaleDateString(locale(), { weekday: 'short' })}</span>
            </button>
            <div className="flex-1 min-w-0 space-y-3">
              {evs.map((ev) => {
                const future = ev.kind === 'upcoming' || ev.kind === 'release'
                const pic = img(ev.row)
                const lg = logo(ev.row)
                return (
                  <button key={ev.key} onClick={() => onOpenRow(ev.row)} className="block w-full text-left active:opacity-80">
                    <span className="relative block aspect-video rounded-lg overflow-hidden bg-neutral-800">
                      {pic && <img src={pic} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
                      {lg ? (
                        <img src={lg} alt="" loading="lazy" className="absolute left-2.5 bottom-2.5 max-h-8 max-w-[55%] object-contain object-left drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]" />
                      ) : null}
                      {future && (
                        <span className="absolute top-2 left-2 rounded bg-[#00c0fa] px-1.5 py-0.5 text-[10px] font-bold text-black">{tt('YAKINDA')}</span>
                      )}
                    </span>
                    <span className="block mt-1.5 text-[15px] font-semibold text-neutral-50 truncate">{name(ev.row)}</span>
                    {ev.sub && (
                      <span
                        className={`block text-[13px] truncate ${ev.rewatch ? 'text-amber-400' : future ? 'text-[#7fdcff]' : ev.finished ? 'text-emerald-400' : 'text-neutral-400'}`}
                      >
                        {ev.rewatch ? '↻ ' : ''}
                        {ev.sub}
                      </span>
                    )}
                  </button>
                )
              })}
              {rels.map((c) => (
                <button key={c.tmdbId} onClick={() => onOpenRelease(c)} className="block w-full text-left active:opacity-80">
                  <span className="relative block aspect-video rounded-lg overflow-hidden bg-neutral-800 ring-1 ring-amber-400/40">
                    {c.image && <img src={c.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                    <span className="absolute top-2 left-2 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-black">{tt('VİZYONDA')}</span>
                  </span>
                  <span className="block mt-1.5 text-[15px] font-semibold text-neutral-50 truncate">{c.title}</span>
                  <span className="block text-[13px] text-amber-300/80">{tt('Arşivinde yok — vizyona giriyor')}</span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
