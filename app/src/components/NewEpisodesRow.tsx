import { useEffect, useState } from 'react'
import type { Board, Row } from '../types'
import { titleText } from '../types'
import { api, type NewEpisodeItem } from '../lib/api'
import { resolveRole } from '../lib/roles'
import { onDataChanged } from '../lib/dataEvents'
import { tt, fmtDate, EP, locale } from '../lib/i18n'


// "22 Eylül", yarın/bugün/dün için kelimeyle.
function friendlyDate(iso: string): string {
  if (!iso) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${iso}T00:00:00`)
  const diff = Math.round((d.getTime() - today.getTime()) / 864e5)
  if (diff === 0) return tt('bugün')
  if (diff === 1) return tt('yarın')
  if (diff === -1) return tt('dün')
  return fmtDate(null, d.getMonth(), d.getDate())
}

function ep(s: number, e: number) {
  return `S${s} ${EP()}${e}`
}

// Bugünden kaç gün sonra (geçmişse negatif)
function daysUntil(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - today.getTime()) / 864e5)
}

// "Kaç bölüm gerideyim" halkası (v1.26, A16): ortada birikmiş bölüm sayısı, halka 10 bölümde dolar (çok birikince
// turuncuya döner); bu hafta çıkacak bölüm varsa sayının yerine gün adı ("Cum", "Yarın").
const RING_FULL = 10
function BehindRing({ count, day }: { count?: number; day?: string }) {
  const r = 17
  const c = 2 * Math.PI * r
  const share = count ? Math.min(count, RING_FULL) / RING_FULL : 1
  const color = count && count >= 5 ? '#fb923c' : '#00c0fa'
  return (
    <span className="absolute top-1.5 right-1.5 h-11 w-11 rounded-full bg-black/70 backdrop-blur-sm shadow-lg shadow-black/50" title={count ? tt('{0} bölüm gerideysin', count) : undefined}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="3" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - share)} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-bold text-white ${count ? (count > 99 ? 'text-[10px]' : 'text-sm') : 'text-[10px] leading-none text-center px-1'}`}>
        {count ? (count > 99 ? '99+' : count) : day}
      </span>
    </span>
  )
}

// Bu hafta (önümüzdeki 7 gün) çıkacaksa kısa gün adı
function weekDay(iso: string): string | null {
  const n = daysUntil(iso)
  if (n < 0 || n > 6) return null
  if (n === 0) return tt('Bugün')
  if (n === 1) return tt('Yarın')
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(locale(), { weekday: 'short' })
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
      <h2 className={`${titleClass ?? 'text-xl font-semibold text-neutral-200'} mb-2`}>{tt('Yeni Bölümler')}</h2>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {shown.map((item) => {
          const row = byId.get(item.rowId)!
          const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
          const image = [coverProp, bannerProp, posterProp].map((p) => (p ? (row.values[p.id] as string) : '')).find(Boolean) ?? ''

          let headline: string
          if (item.tracking && item.unwatchedCount > 0) {
            headline = tt('{0} izlenmemiş bölüm', item.unwatchedCount)
          } else if (item.latestIsNew) {
            headline = tt('Yeni bölüm: {0}', ep(item.latest.season, item.latest.episode))
          } else if (item.upcoming) {
            headline = tt('Yakında: {0}', ep(item.upcoming.season, item.upcoming.episode))
          } else {
            headline = tt('Yeni bölüm')
          }
          const details: string[] = []
          if (item.tracking && item.nextToWatch) details.push(tt('Sıradaki: {0}', ep(item.nextToWatch.season, item.nextToWatch.episode)))
          if (item.latestIsNew && item.latest.airDate)
            details.push(tt('{0} {1} çıktı', ep(item.latest.season, item.latest.episode), friendlyDate(item.latest.airDate)))
          if (item.upcoming) details.push(`${ep(item.upcoming.season, item.upcoming.episode)} ${friendlyDate(item.upcoming.airDate)}`)

          const behind = item.tracking && item.unwatchedCount > 0 ? item.unwatchedCount : 0
          const soon = !behind && item.upcoming?.airDate ? weekDay(item.upcoming.airDate) : null
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
                {/* Halka varken sayı halkada; üstteki etiket sadece "yeni bölüm çıktı" gibi haberler için */}
                {behind ? (
                  item.latestIsNew && (
                    <span className="absolute top-2 left-2 text-[11px] font-semibold text-white bg-[#00c0fa] rounded px-2 py-0.5 shadow">{tt('Yeni bölüm')}</span>
                  )
                ) : (
                  <span className="absolute top-2 left-2 text-[11px] font-semibold text-white bg-[#00c0fa] rounded px-2 py-0.5 shadow">
                    {headline}
                  </span>
                )}
                {(behind > 0 || soon) && <BehindRing count={behind || undefined} day={soon ?? undefined} />}
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
