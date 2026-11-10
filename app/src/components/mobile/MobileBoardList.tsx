import { useEffect, useRef, useState } from 'react'
import type { Board, Row } from '../../types'
import { OPTION_COLORS, titleText } from '../../types'
import { resolveRole } from '../../lib/roles'
import { showcaseMeta } from '../../lib/rowMeta'
import OptionBadge from '../OptionBadge'
import { tt } from '../../lib/i18n'
import { IconText } from '../Icon'

// ARGUS Android › Arşiv: kullanıcı "arşiv arşiv gibi değil, Netflix uygulamasındaki gibi olsun" dedi —
// masaüstü tablosu yerine 3 sütunlu afiş ızgarası (Netflix'teki "Listem" gibi); sonra "liste görünümüne
// geçme de gelebilir" dedi: sağ üstteki düğmeyle afiş + ad + bilgi + durum satırlarına geçilir (tercih hatırlanır).
// Dokununca detay penceresi. Uzun arşivde kaydırdıkça yüklenir.
const PAGE = 48
const VIEW_KEY = 'argus_mobil_arsiv_gorunum'

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
    </svg>
  )
}
function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  )
}

export default function MobileBoardList({ board, rows, onOpen }: { board: Board; rows: Row[]; onOpen: (row: Row) => void }) {
  const [count, setCount] = useState(PAGE)
  const [view, setView] = useState<'izgara' | 'liste'>(() => (localStorage.getItem(VIEW_KEY) === 'liste' ? 'liste' : 'izgara'))
  const end = useRef<HTMLDivElement>(null)
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const posterProp = resolveRole(board, 'poster')
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  const statusProp = resolveRole(board, 'durum')

  // Filtre/arama değişince baştan
  useEffect(() => setCount(PAGE), [rows])
  useEffect(() => {
    const el = end.current
    if (!el) return
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setCount((c) => c + PAGE), { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [rows, count, view])

  function switchView(v: 'izgara' | 'liste') {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  const header = (
    <div className="flex items-center justify-between mb-3">
      <span className="text-[13px] text-neutral-500">{tt('{0} kayıt', rows.length)}</span>
      <div className="flex rounded-full border border-neutral-800 bg-neutral-900 p-0.5">
        {(['izgara', 'liste'] as const).map((v) => (
          <button
            key={v}
            onClick={() => switchView(v)}
            aria-label={v === 'izgara' ? tt('Afiş görünümü') : tt('Liste görünümü')}
            className={`h-8 w-10 flex items-center justify-center rounded-full transition ${view === v ? 'bg-neutral-700 text-neutral-50' : 'text-neutral-500'}`}
          >
            {v === 'izgara' ? <GridIcon /> : <ListIcon />}
          </button>
        ))}
      </div>
    </div>
  )

  if (rows.length === 0)
    return (
      <>
        {header}
        <p className="py-16 text-center text-sm text-neutral-500">{tt('Bu filtrede kayıt yok.')}</p>
      </>
    )

  const shown = rows.slice(0, count)

  return (
    <>
      {header}
      {view === 'izgara' ? (
        <div className="grid grid-cols-3 gap-2">
          {shown.map((row) => {
            const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
            const poster = posterProp ? ((row.values[posterProp.id] as string) ?? '') : ''
            const cover = coverProp ? ((row.values[coverProp.id] as string) ?? '') : ''
            const status = statusProp?.options?.find((o) => o.id === row.values[statusProp.id])
            const dot = status && status.colorIndex >= 0 ? OPTION_COLORS[status.colorIndex % OPTION_COLORS.length] : null
            return (
              <button key={row.id} onClick={() => onOpen(row)} className="relative aspect-[2/3] rounded-md overflow-hidden bg-neutral-800 active:opacity-80">
                {poster ? (
                  <img src={poster} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <>
                    {cover && <img src={cover} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
                    <span className="absolute inset-0 flex items-end p-2 bg-gradient-to-t from-black/90 to-transparent">
                      <span className="text-[12px] font-semibold leading-tight text-white line-clamp-3 text-left">{title || tt('Adsız')}</span>
                    </span>
                  </>
                )}
                {dot && (
                  <span title={status?.label} className={`absolute top-1.5 right-1.5 ${dot.text}`}>
                    <span className="block h-3 w-3 rounded-full bg-current ring-2 ring-black/70" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-800/80">
          {shown.map((row) => {
            const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
            const poster = (posterProp && (row.values[posterProp.id] as string)) || ''
            const cover = (coverProp && (row.values[coverProp.id] as string)) || ''
            const status = statusProp?.options?.find((o) => o.id === row.values[statusProp.id])
            const meta = showcaseMeta(board, row).slice(0, 3).join(' · ')
            return (
              <li key={row.id}>
                <button onClick={() => onOpen(row)} className="w-full flex items-center gap-3 py-2.5 text-left active:bg-neutral-900/80 rounded-lg">
                  <span className={`shrink-0 rounded-md overflow-hidden bg-neutral-800 ${poster ? 'h-[72px] w-12' : 'h-12 w-20'}`}>
                    {(poster || cover) && <img src={poster || cover} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug text-neutral-50 line-clamp-2">{title || tt('Adsız')}</span>
                    {meta && <span className="block mt-0.5 text-xs text-neutral-500 truncate"><IconText text={meta} /></span>}
                  </span>
                  {status && (
                    <span className="shrink-0">
                      <OptionBadge label={status.label} colorIndex={status.colorIndex} dim={false} />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {count < rows.length && <div ref={end} className="h-16" />}
    </>
  )
}
