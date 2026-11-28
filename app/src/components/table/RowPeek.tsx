import { ratingAverage, titleText, type Board, type Row } from '../../types'
import { resolveRole } from '../../lib/roles'
import { formatRuntime, showcaseMeta } from '../../lib/rowMeta'
import { isSeriesRow } from '../../lib/watchWindow'
import { tt } from '../../lib/i18n'
import Icon from '../Icon'
import OptionBadge from '../OptionBadge'

// Tablonun sağındaki önizleme paneli (Arayüz Önerileri 3 · T1, v1.27.2): afişe tıklayınca açılır, tablo yerinde kalır.
// Açıkken başka bir satırın hücresine geçince (↑/↓ dahil) panel o satıra geçer. Sütunlar görevlerden bulunuyor.
export const PEEK_KEY = 'argus-tablo-onizleme'

export function readPeekOpen(): boolean {
  try {
    return localStorage.getItem(PEEK_KEY) === '1'
  } catch {
    return false
  }
}
export function writePeekOpen(open: boolean) {
  try {
    localStorage.setItem(PEEK_KEY, open ? '1' : '0')
  } catch {
    /* kapalı — sadece hatırlanmaz */
  }
}

function img(row: Row, id: string | null | undefined): string {
  const v = id ? row.values[id] : undefined
  return typeof v === 'string' ? v : ''
}

export default function RowPeek({
  board,
  row,
  onClose,
  onOpen,
  onWatchedToday,
}: {
  board: Board
  row: Row | null
  onClose: () => void
  onOpen: (row: Row) => void
  onWatchedToday?: (row: Row) => void
}) {
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const bannerP = resolveRole(board, 'banner')
  const posterP = resolveRole(board, 'poster')
  const durumP = resolveRole(board, 'durum')
  const puanP = resolveRole(board, 'puan')
  const sinopsisP = resolveRole(board, 'sinopsis')
  const coverId = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')?.id

  const shell = 'sticky top-16 self-start w-[300px] shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden'
  const closeBtn = (
    <button
      onClick={onClose}
      title={tt('Önizlemeyi kapat')}
      aria-label={tt('Önizlemeyi kapat')}
      className="absolute top-2 right-2 z-10 h-7 w-7 flex items-center justify-center rounded-full bg-black/60 text-neutral-200 hover:bg-black/80 transition"
    >
      <Icon name="close" className="h-3.5 w-3.5" />
    </button>
  )
  if (!row)
    return (
      <aside className={`${shell} relative hidden lg:block p-5`}>
        {closeBtn}
        <p className="text-sm text-neutral-400 pr-8">{tt('Önizlemek için bir satırın afişine tıkla.')}</p>
      </aside>
    )

  const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
  const backdrop = img(row, bannerP?.id) || img(row, coverId) || img(row, posterP?.id)
  const logo = img(row, board.titleImagePropertyId)
  const durumOpt = durumP?.options?.find((o) => o.id === row.values[durumP.id])
  const avg = puanP ? ratingAverage(row.values[puanP.id], puanP) : null
  const synopsis = sinopsisP ? String(row.values[sinopsisP.id] ?? '') : ''
  // Dizide Süre bir bölümün süresi (v1.24): "57 dk/bölüm" diye yazılır
  const sureP = resolveRole(board, 'sure')
  const mins = sureP ? row.values[sureP.id] : undefined
  const meta = showcaseMeta(board, row).map((m) =>
    typeof mins === 'number' && mins > 0 && m === formatRuntime(mins) && isSeriesRow(board, row) ? tt('{0} dk/bölüm', mins) : m,
  )
  const canWatch = Boolean(onWatchedToday && (resolveRole(board, 'izlemeTarihi') || durumP))

  return (
    <aside className={`${shell} hidden lg:flex flex-col`} aria-label={tt('Önizleme')}>
      <div className="relative aspect-video bg-neutral-800">
        {backdrop && <img key={backdrop} src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/20 to-transparent" />
        {closeBtn}
        <div className="absolute left-3.5 right-3.5 bottom-2">
          {logo ? (
            <img src={logo} alt={title} className="max-h-11 max-w-[70%] object-contain object-left drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" />
          ) : (
            <p className="text-lg font-bold text-neutral-50 leading-tight line-clamp-2 drop-shadow">{title || tt('(adsız)')}</p>
          )}
        </div>
      </div>
      <div className="px-3.5 pt-3 pb-4 space-y-2.5 text-[12.5px] text-neutral-300">
        <div className="flex flex-wrap items-center gap-1.5">
          {durumOpt && <OptionBadge label={durumOpt.label} colorIndex={durumOpt.colorIndex} dim={false} />}
          {meta.map((m) => (
            <span key={m} className="text-[11px] text-neutral-400">
              {m}
            </span>
          ))}
          {avg !== null && (
            <span className="ml-auto inline-flex items-center gap-1 font-bold text-amber-400 tabular-nums">
              <Icon name="star" className="h-3.5 w-3.5" />
              {avg.toFixed(1)}
            </span>
          )}
        </div>
        {synopsis && <p className="leading-relaxed line-clamp-5 text-neutral-400">{synopsis}</p>}
        <div className="flex gap-1.5 pt-0.5">
          {canWatch && (
            <button
              onClick={() => onWatchedToday?.(row)}
              title={tt('İzleme tarihine bugünü ekler (daha önce izlediysen tekrar izleme olarak) ve durumu İzlendi yapar')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-50 px-3 py-1.5 text-xs font-bold text-neutral-950 hover:bg-white transition"
            >
              <Icon name="check" className="h-3.5 w-3.5" />
              {tt('Bugün izledim')}
            </button>
          )}
          <button
            onClick={() => onOpen(row)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-bold text-neutral-100 hover:border-neutral-500 transition"
          >
            <Icon name="eye" className="h-3.5 w-3.5" />
            {tt('Aç')}
          </button>
        </div>
      </div>
    </aside>
  )
}
