import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Board, Row, WatchedMap } from '../types'
import { titleText } from '../types'
import { api } from '../lib/api'
import { resolveRole } from '../lib/roles'

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
  useEffect(() => {
    Promise.resolve()
      .then(() => api.getWatched())
      .then(setWatched)
      .catch(() => {})
  }, [])

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

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className={titleClass ?? 'text-xl font-semibold text-neutral-200'}>Geçmiş yıllarda bugün</h2>
        <button
          onClick={() => navigate(calendarLink(hits[0].year))}
          className="text-xs text-neutral-500 hover:text-[#00c0fa] transition"
        >
          Takvimde gör ›
        </button>
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {hits.map(({ row, year, episodes }) => {
          const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
          const image = [bannerProp, posterProp].map((p) => (p ? (row.values[p.id] as string) : '')).find(Boolean) ?? ''
          const ago = thisYear - year
          return (
            <div key={`${row.id}-${year}`} className="w-64 shrink-0">
              <button onClick={() => onOpenDetail(row)} className="w-full text-left group">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-neutral-800">
                  {image && <img src={image} alt={title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />}
                  <span className="absolute top-2 left-2 text-[11px] font-semibold text-white bg-[#00c0fa] rounded px-2 py-0.5 shadow">
                    {ago === 1 ? '1 yıl önce' : `${ago} yıl önce`}
                  </span>
                </div>
                <p className="text-sm text-neutral-200 font-medium mt-1.5 truncate">{title}</p>
              </button>
              <p className="text-xs text-neutral-500 truncate">
                {year}
                {episodes > 0 ? ` · ${episodes} bölüm izledin` : ' · izledin'}
                {' · '}
                <button onClick={() => navigate(calendarLink(year))} className="hover:text-[#00c0fa] transition">
                  takvimde gör
                </button>
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
