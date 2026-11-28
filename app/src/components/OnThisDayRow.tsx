import { useEffect, useState } from 'react'
import { MOBILE } from '../lib/mobile/ui'
import { useNavigate } from 'react-router-dom'
import type { Board, Row, WatchedMap } from '../types'
import { titleText } from '../types'
import { api } from '../lib/api'
import { onDataChanged } from '../lib/dataEvents'
import { resolveRole } from '../lib/roles'
import { tt, locale } from '../lib/i18n'

// "Geçmiş yıllarda bugün" — takvimle birlikte gelen ana sayfa satırı: bugünün ayı-günü, önceki
// yıllarda ne izlemişsin (izleme tarihi ya da bölüm işaretleri). Hiçbir şey yoksa satır hiç görünmez.
export default function OnThisDayRow({
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
  const navigate = useNavigate()
  const [watched, setWatched] = useState<WatchedMap>({})
  // Bir bölüm işaretlenince ya da izleme tarihi girilince satır sayfa yenilenmeden güncellensin (v1.26, H11)
  useEffect(() => {
    let alive = true
    const load = () =>
      Promise.resolve()
        .then(() => api.getWatched())
        .then((w) => alive && setWatched(w))
        .catch(() => {})
    load()
    const off = onDataChanged((_b, kind) => {
      if (kind === 'watched' || kind === 'all') load()
    })
    return () => {
      alive = false
      off()
    }
  }, [board.id])

  const now = new Date()
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const thisYear = now.getFullYear()
  const dateProp = resolveRole(board, 'izlemeTarihi')

  const hits: { row: Row; year: number; episodes: number }[] = []
  for (const row of rows) {
    const years = new Map<number, number>()
    if (dateProp) {
      const v = row.values[dateProp.id]
      for (const d of (Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []).flatMap((x) => x.split('/'))) {
        const y = Number(d.slice(0, 4))
        if (d.slice(5) === md && y < thisYear) years.set(y, years.get(y) ?? 0)
      }
    }
    for (const ds of Object.values(watched[row.id] ?? {})) {
      for (const d of ds ?? []) {
        const y = Number(d.slice(0, 4))
        if (d.slice(5) === md && y < thisYear) years.set(y, (years.get(y) ?? 0) + 1)
      }
    }
    for (const [year, episodes] of years) hits.push({ row, year, episodes })
  }
  if (hits.length === 0) return null
  hits.sort((a, b) => b.year - a.year)

  // O yılın o gününe git: ay görünümü ve günün paneli açık (bkz. Takvim'deki ?gun=)
  const calendarLink = (year: number) => `/takvim?ay=${year}-${md.slice(0, 2)}&gun=${year}-${md}`
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const bannerProp = resolveRole(board, 'banner')
  const posterProp = resolveRole(board, 'poster')
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')

  // Masaüstünde fotoğraf albümü (öneri A5): beyaz çerçeveli, hafif eğik "polaroid"ler, köşede turuncu tarih
  // damgası. Renkler temadan bağımsız sabit (eski fotoğraf kâğıdı açık temada da aynı durur).
  if (!MOBILE) {
    const ROT = [-4, 2.5, -1.5, 3, -2.5, 1.5]
    const LIFT = [0, 10, 2, 8, -2, 6]
    const dayLabel = now.toLocaleDateString(locale(), { day: 'numeric', month: 'long' })
    return (
      <div>
        <div className="flex items-baseline gap-3 mb-2">
          <h2 className={titleClass ?? 'text-xl font-semibold text-neutral-200'}>{tt('Geçmiş yıllarda bugün')}</h2>
          <span className="text-xs text-neutral-500">{dayLabel}</span>
          <button onClick={() => navigate(calendarLink(hits[0].year))} className="text-xs text-neutral-500 hover:text-[#00c0fa] transition">
            {tt('Takvimde gör ›')}
          </button>
        </div>
        <div className="no-scrollbar flex gap-7 overflow-x-auto -mx-4 px-6 pt-4 pb-8">
          {hits.map(({ row, year, episodes }, i) => {
            const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
            const image = [coverProp, bannerProp, posterProp].map((p) => (p ? (row.values[p.id] as string) : '')).find(Boolean) ?? ''
            const ago = thisYear - year
            const stamp = `'${String(year).slice(2)} ${md.slice(0, 2)} ${md.slice(3)}`
            return (
              <div
                key={`${row.id}-${year}`}
                className="group w-[240px] shrink-0 rounded-[4px] p-2.5 pb-3.5 transition duration-300 hover:-translate-y-1.5"
                style={{
                  background: '#f4f1ea',
                  color: '#1b1b1b',
                  transform: `rotate(${ROT[i % ROT.length]}deg) translateY(${LIFT[i % LIFT.length]}px)`,
                  boxShadow: '0 22px 40px -16px rgba(0,0,0,.65), 0 2px 6px rgba(0,0,0,.18)',
                }}
              >
                <button onClick={() => onOpenDetail(row)} className="block w-full text-left">
                  <span className="relative block aspect-[4/3] overflow-hidden bg-[#d9d4c7]">
                    {image && <img src={image} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover" style={{ filter: 'saturate(.92) contrast(1.03)' }} />}
                    <span
                      className="absolute right-1.5 bottom-1.5 font-mono text-xs font-bold"
                      style={{ color: '#ffb347', textShadow: '0 0 6px rgba(255,140,0,.85)' }}
                    >
                      {stamp}
                    </span>
                  </span>
                  <b className="mt-2.5 block truncate text-sm">{title}</b>
                </button>
                <small className="block truncate text-xs" style={{ color: '#555' }}>
                  {ago === 1 ? tt('1 yıl önce bugün') : tt('{0} yıl önce bugün', ago)}
                  {episodes > 0 ? tt(' · {0} bölüm izledin', episodes) : ''}
                  {' · '}
                  <button onClick={() => navigate(calendarLink(year))} className="hover:text-[#0077a8] transition">
                    {tt('takvimde gör')}
                  </button>
                </small>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className={titleClass ?? 'text-xl font-semibold text-neutral-200'}>{tt('Geçmiş yıllarda bugün')}</h2>
        <button
          onClick={() => navigate(calendarLink(hits[0].year))}
          className="text-xs text-neutral-500 hover:text-[#00c0fa] transition"
        >
          {tt('Takvimde gör ›')}
        </button>
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {hits.map(({ row, year, episodes }) => {
          const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
          const image = [bannerProp, posterProp].map((p) => (p ? (row.values[p.id] as string) : '')).find(Boolean) ?? ''
          const ago = thisYear - year
          return (
            <div key={`${row.id}-${year}`} className={`${MOBILE ? 'w-48' : 'w-64'} shrink-0`}>
              <button onClick={() => onOpenDetail(row)} className="w-full text-left group">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-neutral-800">
                  {image && <img src={image} alt={title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />}
                  <span className="absolute top-2 left-2 text-[11px] font-semibold text-white bg-[#00c0fa] rounded px-2 py-0.5 shadow">
                    {ago === 1 ? tt('1 yıl önce') : tt('{0} yıl önce', ago)}
                  </span>
                </div>
                <p className="text-sm text-neutral-200 font-medium mt-1.5 truncate">{title}</p>
              </button>
              <p className="text-xs text-neutral-500 truncate">
                {year}
                {episodes > 0 ? tt(' · {0} bölüm izledin', episodes) : tt(' · izledin')}
                {' · '}
                <button onClick={() => navigate(calendarLink(year))} className="hover:text-[#00c0fa] transition">
                  {tt('takvimde gör')}
                </button>
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
