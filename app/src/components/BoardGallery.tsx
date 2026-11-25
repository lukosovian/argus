import { useState } from 'react'
import { titleText, type Board, type PropertyDef, type Row } from '../types'
import OptionBadge from './OptionBadge'
import { posterOf, ratingOf, yearOf } from './table/BoardKanban'
import { tt } from '../lib/i18n'

// Arşivin afiş galerisi görünümü (v1.26, A10): tablodaki filtre, arama, sıralama ve gruplama aynen geçerli; afişe
// tıklayınca detay penceresi açılır. Çok kayıtlı arşivde sayfa ağırlaşmasın diye afişler parça parça eklenir.
const PAGE = 120
const EMPTY = '__bos__'

function Card({ board, row, titleProp, onOpen }: { board: Board; row: Row; titleProp?: PropertyDef; onOpen: (row: Row) => void }) {
  const title = (titleProp ? titleText(titleProp, row.values[titleProp.id]) : '') || tt('İsimsiz')
  const poster = posterOf(board, row)
  const year = yearOf(board, row)
  const rating = ratingOf(board, row)
  return (
    <button
      onClick={() => onOpen(row)}
      className="group text-left min-w-0 outline-none"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '160px 290px' }}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-neutral-800 ring-1 ring-neutral-800 group-hover:ring-neutral-500 group-focus-visible:ring-2 group-focus-visible:ring-[#00c0fa] transition">
        {poster ? (
          <img src={poster} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-neutral-500">{title}</div>
        )}
        {rating !== null && (
          <span className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber-300 backdrop-blur-sm">
            ★ {rating.toFixed(1)}
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate text-sm text-neutral-200 group-hover:text-neutral-50">{title}</p>
      {year && <p className="text-[11px] tabular-nums text-neutral-500">{year}</p>}
    </button>
  )
}

export default function BoardGallery({
  board,
  rows,
  groupProp = null,
  onOpenRow,
  onAddRow,
}: {
  board: Board
  rows: Row[]
  groupProp?: PropertyDef | null
  onOpenRow: (row: Row) => void
  onAddRow?: () => void
}) {
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const [limit, setLimit] = useState(PAGE)
  const grid = 'grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-5'

  if (rows.length === 0) return <p className="py-16 text-center text-sm text-neutral-500">{tt('Gösterilecek kayıt yok.')}</p>

  // Gruplama açıksa her seçenek kendi başlığıyla (tablodaki gibi, boşlar en sonda)
  if (groupProp && groupProp.type === 'select') {
    const buckets = new Map<string, Row[]>()
    for (const o of groupProp.options ?? []) buckets.set(o.id, [])
    const empty: Row[] = []
    for (const r of rows) {
      const v = r.values[groupProp.id]
      const b = typeof v === 'string' ? buckets.get(v) : undefined
      if (b) b.push(r)
      else empty.push(r)
    }
    const groups = [...[...buckets].map(([id, list]) => ({ key: id, list })), { key: EMPTY, list: empty }].filter((g) => g.list.length > 0)
    let budget = limit
    return (
      <div className="space-y-8">
        {groups.map((g) => {
          const opt = groupProp.options?.find((o) => o.id === g.key)
          const take = Math.max(0, Math.min(g.list.length, budget))
          budget -= take
          if (take === 0) return null
          return (
            <section key={g.key}>
              <h3 className="mb-3 flex items-center gap-2">
                {opt ? <OptionBadge label={opt.label} colorIndex={opt.colorIndex} image={opt.image} /> : <span className="text-sm italic text-neutral-400">{tt('(boş)')}</span>}
                <span className="text-xs tabular-nums text-neutral-500">{g.list.length}</span>
              </h3>
              <div className={grid}>
                {g.list.slice(0, take).map((row) => (
                  <Card key={row.id} board={board} row={row} titleProp={titleProp} onOpen={onOpenRow} />
                ))}
              </div>
            </section>
          )
        })}
        {rows.length > limit && <MoreButton left={rows.length - limit} onMore={() => setLimit((n) => n + PAGE * 2)} />}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className={grid}>
        {onAddRow && (
          <button
            onClick={onAddRow}
            className="aspect-[2/3] rounded-lg border border-dashed border-neutral-700 hover:border-neutral-500 text-neutral-500 hover:text-neutral-300 transition flex flex-col items-center justify-center gap-1"
          >
            <span className="text-3xl leading-none">+</span>
            <span className="text-xs">{tt('Yeni Kayıt')}</span>
          </button>
        )}
        {rows.slice(0, limit).map((row) => (
          <Card key={row.id} board={board} row={row} titleProp={titleProp} onOpen={onOpenRow} />
        ))}
      </div>
      {rows.length > limit && <MoreButton left={rows.length - limit} onMore={() => setLimit((n) => n + PAGE * 2)} />}
    </div>
  )
}

function MoreButton({ left, onMore }: { left: number; onMore: () => void }) {
  return (
    <div className="text-center">
      <button onClick={onMore} className="rounded-lg border border-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-600 hover:text-neutral-50 transition">
        {tt('Daha fazla göster (+{0})', left)}
      </button>
    </div>
  )
}
