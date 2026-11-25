import { longDay, weekday } from '../../lib/bilet'
import { tt } from '../../lib/i18n'
import { TicketThumb, TICKET_RATIO, type BiletItem } from './Ticket'
import { countdown } from './seans'

// Yaklaşan seans (Y26): ileri tarihli biletler Biletlerim'in üstünde geri sayımla. Seans günü hatırlatma bildirimi
// sunucudan gelir; seans bitince SeansWatcher izlendi işaretler ve bilet duvara geçer.
export default function YaklasanSeans({ items, now, onOpen, onEdit }: { items: (BiletItem & { no: number })[]; now: Date; onOpen: (b: BiletItem, el: HTMLElement) => void; onEdit: (b: BiletItem) => void }) {
  if (!items.length) return null
  const TW = 220
  return (
    <section className="rounded-3xl border border-amber-400/25 p-4 sm:p-5" style={{ background: 'linear-gradient(135deg, rgba(245,200,120,0.10), transparent 60%), var(--color-neutral-950)' }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-300" />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-amber-200">{items.length > 1 ? tt('Yaklaşan seanslar') : tt('Yaklaşan seans')}</h2>
      </div>
      <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-1">
        {items.map((b) => (
          <div key={b.id} className="flex w-[min(100%,460px)] shrink-0 snap-start flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-3 sm:flex-row sm:items-center">
            <button onClick={(e) => onOpen(b, e.currentTarget.firstElementChild as HTMLElement)} className="shrink-0 self-center" title={b.title}>
              <div style={{ height: TW / TICKET_RATIO, fontSize: TW / 48 }} className="drop-shadow-[0_10px_18px_rgba(0,0,0,.5)]">
                <TicketThumb b={b} no={b.no} width={TW} />
              </div>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-neutral-50">{b.title}</p>
              <p className="text-xs capitalize text-neutral-400">
                {weekday(b.date)} · {longDay(b.date)}
                {b.time ? ` · ${b.time}` : ''}
              </p>
              {(b.cinema || b.hall || b.seat) && <p className="truncate text-xs text-neutral-500">{[b.cinema, b.hall && tt('Salon {0}', b.hall), b.seat && tt('Koltuk {0}', b.seat)].filter(Boolean).join(' · ')}</p>}
              <div className="mt-2 flex items-center gap-2">
                <span className="whitespace-nowrap rounded-lg bg-amber-300 px-2.5 py-1 text-sm font-black tabular-nums text-black">{countdown(b, now)}</span>
                <span className="text-[11px] text-neutral-500">{tt('kaldı')}</span>
                <button onClick={() => onEdit(b)} className="ml-auto text-xs text-neutral-400 hover:text-white">
                  {tt('Düzenle')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
