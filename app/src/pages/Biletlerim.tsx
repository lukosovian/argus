import { useMemo, useState } from 'react'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useToast } from '../hooks/useToast'
import { saveBilet, shortDay, sortedBiletler, useBiletler } from '../lib/bilet'
import { tt } from '../lib/i18n'
import type { Row } from '../types'
import { TicketThumb, TICKET_RATIO, type BiletItem } from '../components/bilet/Ticket'
import TicketViewer from '../components/bilet/TicketViewer'
import TicketForm from '../components/bilet/TicketForm'
import RowDetailModal from '../components/RowDetailModal'
import Icon from '../components/Icon'

// Koleksiyon › Biletlerim (v1.23.11): sinemada izlediklerinin koleksiyonluk biletleri, yıllara göre bir albüm gibi.
// Bilete tıklayınca büyür ve çevrilebilir (TicketViewer). Bilet, yapımın detayındaki "Sinemada izledim"den ya da
// buradaki "+ Bilet ekle"den eklenir.

const THUMB = 340
// Duvardaki biletin üstünden geçen ışık (fareyle üstüne gelince)
const CSS = `
.bilet-kart { position: relative; }
.bilet-kart::after { content: ''; position: absolute; inset: 0; border-radius: 0.9em; pointer-events: none; opacity: 0;
  background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.28) 48%, rgba(255,255,255,0) 60%);
  background-size: 260% 100%; background-position: 120% 0; transition: background-position .9s ease, opacity .3s; }
.group:hover .bilet-kart::after { opacity: 1; background-position: -40% 0; }
`

function topOf(list: (string | undefined)[]) {
  const m = new Map<string, number>()
  for (const raw of list) {
    for (const v of (raw ?? '').split(/,| ve /).map((x) => x.trim()).filter(Boolean)) m.set(v, (m.get(v) ?? 0) + 1)
  }
  const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
  return best && best[1] > 1 ? best[0] : best?.[0] ?? ''
}

export default function Biletlerim() {
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows } = useRows(settings.boardId ?? undefined)
  const { data, error, reload } = useBiletler()
  const { confirm, notify } = useToast()
  const [view, setView] = useState<{ index: number; origin: DOMRect | null } | null>(null)
  const [form, setForm] = useState<{ id?: string; b?: BiletItem } | null>(null)
  const [detail, setDetail] = useState<Row | null>(null)

  const list = useMemo(() => (data ? sortedBiletler(data.items).map((b, i) => ({ ...b, no: i + 1 })) : []), [data])
  // duvarda yeniden eskiye
  const shown = useMemo(() => [...list].reverse(), [list])
  const years = useMemo(() => {
    const m = new Map<string, typeof shown>()
    for (const b of shown) {
      const y = (b.date ?? '').slice(0, 4) || tt('Tarihsiz')
      if (!m.has(y)) m.set(y, [])
      m.get(y)!.push(b)
    }
    return [...m.entries()]
  }, [shown])
  // üstte yelpaze gibi açılan son üç bilet
  const fan = useMemo(() => shown.slice(0, 3).reverse(), [shown])
  const thisYear = String(new Date().getFullYear())
  const stats = useMemo(
    () => ({
      total: list.length,
      year: list.filter((b) => (b.date ?? '').startsWith(thisYear)).length,
      cinema: topOf(list.map((b) => b.cinema)),
      who: topOf(list.map((b) => b.withWho)),
    }),
    [list, thisYear],
  )
  const suggestions = useMemo(
    () => ({
      cinemas: [...new Set(list.map((b) => b.cinema).filter(Boolean) as string[])],
      people: [...new Set(list.flatMap((b) => (b.withWho ?? '').split(',').map((x) => x.trim())).filter(Boolean))],
    }),
    [list],
  )

  async function remove(b: BiletItem) {
    const ok = await confirm({ message: tt('"{0}" bileti koleksiyondan silinsin mi?', b.title), confirmLabel: tt('Sil'), tone: 'danger' })
    if (!ok) return
    try {
      await saveBilet(b.id, null)
      setView(null)
      notify(tt('Bilet silindi.'), 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Silinemedi.'), 'danger')
    }
  }

  if (error && !data)
    return (
      <div className="py-16 text-center">
        <p className="text-neutral-200">{tt('Biletler açılamadı')}</p>
        <p className="mt-2 text-sm text-neutral-500">{tt('ARGUS yeni güncellendiyse sunucusu eski kalmış olabilir: ARGUS\'u kapatıp yeniden açmayı dene.')}</p>
        <button onClick={reload} className="mt-4 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200">
          {tt('Tekrar dene')}
        </button>
      </div>
    )

  return (
    <div className="space-y-10">
      <style>{CSS}</style>
      <section
        className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-8 sm:px-10"
        style={{ background: 'radial-gradient(ellipse at 15% 0%, rgba(245,200,120,0.13), transparent 60%), radial-gradient(ellipse at 95% 100%, rgba(0,192,250,0.10), transparent 60%), var(--color-neutral-950)' }}
      >
        {fan.length > 0 && (
          <div className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 xl:block" style={{ width: 330, height: 200 }}>
            {fan.map((b, i) => (
              <button
                key={b.id}
                onClick={(e) => setView({ index: list.indexOf(b), origin: (e.currentTarget.firstElementChild as HTMLElement).getBoundingClientRect() })}
                className="group pointer-events-auto absolute left-0 top-1/2 transition duration-500 ease-out hover:z-10 hover:-translate-y-5"
                style={{ transform: `translateY(-50%) translateX(${(i - (fan.length - 1) / 2) * 34}px) rotate(${(i - (fan.length - 1) / 2) * 7}deg)`, zIndex: i, transformOrigin: '50% 120%' }}
                title={b.title}
              >
                <div className="bilet-kart drop-shadow-[0_14px_24px_rgba(0,0,0,.55)]" style={{ fontSize: 300 / 48 }}>
                  <TicketThumb b={b} no={b.no} width={300} />
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="text-sm font-semibold tracking-widest text-amber-200/80">{tt('KOLEKSİYON')}</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-neutral-50 sm:text-5xl">{tt('Biletlerim')}</h1>
        <p className="mt-2 max-w-2xl text-neutral-300">{tt('Sinemada izlediklerinin koleksiyonluk biletleri. Bir bilete tıkla, büyüsün; çevirip arkasına bak.')}</p>
        <div className={`mt-5 flex flex-wrap items-center gap-2 ${fan.length ? 'xl:max-w-[calc(100%-380px)]' : ''}`}>
          {[
            [String(stats.total), tt('bilet')],
            [String(stats.year), tt('bu yıl')],
            ...(stats.cinema ? [[stats.cinema, tt('en sık gittiğin sinema')]] : []),
            ...(stats.who ? [[stats.who, tt('en çok birlikte gittiğin')]] : []),
          ].map(([v, l]) => (
            <span key={l} className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2">
              <b className="block max-w-[14rem] truncate text-lg leading-tight text-neutral-50">{v}</b>
              <span className="text-[11px] text-neutral-400">{l}</span>
            </span>
          ))}
          <button onClick={() => setForm({})} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#00c0fa] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#33cdfb]">
            <Icon name="ticket" className="h-4 w-4" />
            {tt('Bilet ekle')}
          </button>
        </div>
      </section>

      {data && list.length === 0 && (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-neutral-800 px-6 py-14 text-center">
          <div className="relative mb-6 h-28 w-72">
            {[-8, 4, 0].map((r, i) => (
              <div key={i} className="absolute inset-0 rounded-xl border border-neutral-700" style={{ transform: `rotate(${r}deg) translateY(${i * 4}px)`, background: i === 2 ? 'linear-gradient(90deg, #1b2733 73%, #f2ece1 73%)' : '#151515', opacity: i === 2 ? 1 : 0.6 }} />
            ))}
          </div>
          <p className="text-lg font-semibold text-neutral-100">{tt('Henüz bilet yok')}</p>
          <p className="mt-1 max-w-md text-sm text-neutral-400">{tt('Sinemada izlediğin bir yapımın detayında "Sinemada izledim" düğmesine bas ya da buradan ekle.')}</p>
          <button onClick={() => setForm({})} className="mt-5 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-[#00c0fa]">
            {tt('İlk biletini ekle')}
          </button>
        </div>
      )}

      {/* Duvar: her yılın biletleri yanında dikey yıl etiketiyle; yıllar yan yana akar (az biletli yıllar satırı boş bırakmaz) */}
      {years.length > 0 && (
        <div className="flex flex-wrap items-start gap-x-12 gap-y-12 border-t border-neutral-800/80 pt-8">
          {years.map(([y, items]) => (
            <section key={y} className="flex min-w-0 max-w-full gap-4">
              <div className="flex shrink-0 flex-col items-center gap-3 border-r border-neutral-800 pr-3">
                <h2
                  className="text-4xl font-black leading-none tracking-tight text-transparent [writing-mode:vertical-rl] rotate-180"
                  style={{ WebkitTextStroke: '1.4px rgb(212 212 212 / .8)' }}
                >
                  {y}
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500 [writing-mode:vertical-rl] rotate-180">{tt('{0} bilet', items.length)}</span>
              </div>
              <div className="flex min-w-0 flex-wrap gap-x-8 gap-y-8">
                {items.map((b) => {
                  const tilt = ((b.no * 37) % 7) - 3
                  return (
                    <button
                      key={b.id}
                      onClick={(e) => setView({ index: list.indexOf(b), origin: (e.currentTarget.firstElementChild as HTMLElement).getBoundingClientRect() })}
                      className="group flex flex-col items-start text-left"
                      title={b.title}
                    >
                      <div
                        className="bilet-kart transition duration-300 ease-out drop-shadow-[0_10px_18px_rgba(0,0,0,.45)] group-hover:-translate-y-2 group-hover:!rotate-0 group-hover:scale-[1.03] group-hover:drop-shadow-[0_22px_32px_rgba(0,0,0,.65)]"
                        style={{ rotate: `${tilt * 0.5}deg`, height: THUMB / TICKET_RATIO, fontSize: THUMB / 48 }}
                      >
                        <TicketThumb b={b} no={b.no} width={THUMB} />
                      </div>
                      <p className="mt-3 w-full truncate text-[11px] uppercase tracking-[0.2em] text-neutral-500 transition group-hover:text-neutral-300" style={{ maxWidth: THUMB }}>
                        № {String(b.no).padStart(3, '0')}
                        <span className="text-neutral-700">{'  ·  '}</span>
                        {shortDay(b.date) || tt('Tarihsiz')}
                        {b.cinema ? <span className="text-neutral-700">{'  ·  '}</span> : null}
                        {b.cinema}
                      </p>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {view && (
        <TicketViewer
          items={list}
          index={view.index}
          origin={view.origin}
          onIndex={(i) => setView({ index: i, origin: null })}
          onClose={() => setView(null)}
          onEdit={(b) => {
            setView(null)
            setForm({ id: b.id, b })
          }}
          onDelete={(b) => void remove(b)}
          onOpenRow={(b) => {
            const r = rows.find((x) => x.id === b.rowId)
            if (r) {
              setView(null)
              setDetail(r)
            } else notify(tt('Bu yapım artık arşivinde yok.'), 'danger')
          }}
        />
      )}
      {form && <TicketForm id={form.id} initial={form.b} board={board} rows={rows} suggestions={suggestions} onClose={() => setForm(null)} />}
      {detail && board && <RowDetailModal board={board} row={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
