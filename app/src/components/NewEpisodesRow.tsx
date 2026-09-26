import { useEffect, useState } from 'react'
import type { Board, Row } from '../types'
import { titleText } from '../types'
import { api, type NewEpisodeItem } from '../lib/api'
import { resolveRole } from '../lib/roles'
import { onDataChanged } from '../lib/dataEvents'

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// "22 Eylül", yarın/bugün/dün için kelimeyle.
function friendlyDate(iso: string): string {
  if (!iso) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${iso}T00:00:00`)
  const diff = Math.round((d.getTime() - today.getTime()) / 864e5)
  if (diff === 0) return 'bugün'
  if (diff === 1) return 'yarın'
  if (diff === -1) return 'dün'
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`
}

function ep(s: number, e: number) {
  return `S${s} B${e}`
}

// Ana sayfanın en üstündeki "Yeni Bölümler" satırı: Durum'u "İzleniyor" olan dizilerden yeni
// bölümü çıkmış ya da bu hafta çıkacak olanlar (kurallar için bkz. server'daki /new-episodes).
// Hiç sonuç yoksa (ya da TMDB anahtarı yoksa) satır hiç görünmüyor.
export default function NewEpisodesRow({
  board,
  rows,
  onOpenDetail,
  titleClass,
}: {
  board: Board
  rows: Row[]
  onOpenDetail: (row: Row) => void
  titleClass?: string
}) {
  const [items, setItems] = useState<NewEpisodeItem[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () =>
      api
        .getNewEpisodes(board.id)
        .then((d) => !cancelled && setItems(d.items))
        .catch(() => {})
    load()
    // Bir bölüm izlendi olarak işaretlenince ya da durum değişince liste de güncellensin.
    const off = onDataChanged((changed) => {
      if (!changed || changed === board.id) load()
    })
    return () => {
      cancelled = true
      off()
    }
  }, [board.id])

  const byId = new Map(rows.map((r) => [r.id, r]))
  const shown = items.filter((i) => byId.has(i.rowId))
  if (shown.length === 0) return null

  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  const bannerProp = resolveRole(board, 'banner')
  const posterProp = resolveRole(board, 'poster')

  return (
    <div>
      <h2 className={`${titleClass ?? 'text-xl font-semibold text-neutral-200'} mb-2`}>Yeni Bölümler</h2>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {shown.map((item) => {
          const row = byId.get(item.rowId)!
          const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
          const image = [coverProp, bannerProp, posterProp].map((p) => (p ? (row.values[p.id] as string) : '')).find(Boolean) ?? ''

          let headline: string
          if (item.tracking && item.unwatchedCount > 0) {
            headline = `${item.unwatchedCount} izlenmemiş bölüm`
          } else if (item.latestIsNew) {
            headline = `Yeni bölüm: ${ep(item.latest.season, item.latest.episode)}`
          } else if (item.upcoming) {
            headline = `Yakında: ${ep(item.upcoming.season, item.upcoming.episode)}`
          } else {
            headline = 'Yeni bölüm'
          }
          const details: string[] = []
          if (item.tracking && item.nextToWatch) details.push(`Sıradaki: ${ep(item.nextToWatch.season, item.nextToWatch.episode)}`)
          if (item.latestIsNew && item.latest.airDate)
            details.push(`${ep(item.latest.season, item.latest.episode)} ${friendlyDate(item.latest.airDate)} çıktı`)
          if (item.upcoming) details.push(`${ep(item.upcoming.season, item.upcoming.episode)} ${friendlyDate(item.upcoming.airDate)}`)

          return (
            <button key={item.rowId} onClick={() => onOpenDetail(row)} className="w-64 shrink-0 text-left group">
              <div className="relative aspect-video rounded-lg overflow-hidden bg-neutral-800">
                {image && (
                  <img
                    src={image}
                    alt={title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                )}
                <span className="absolute top-2 left-2 text-[11px] font-semibold text-white bg-[#00c0fa] rounded px-2 py-0.5 shadow">
                  {headline}
                </span>
              </div>
              <p className="text-sm text-neutral-200 font-medium mt-1.5 truncate">{title}</p>
              {details.length > 0 && <p className="text-xs text-neutral-500 truncate">{details.join(' · ')}</p>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
