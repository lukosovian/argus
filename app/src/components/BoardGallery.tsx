import type { Board, PropertyValue, Row } from '../types'
import { titleText } from '../types'
import OptionBadge from './OptionBadge'

function CardBadges({ board, row }: { board: Board; row: Row }) {
  const badgeProps = board.properties.filter((p) => p.type === 'select' || p.type === 'multiselect')
  const items: { key: string; label: string; colorIndex: number; image?: string }[] = []
  for (const p of badgeProps) {
    const v = row.values[p.id]
    if (p.type === 'select' && typeof v === 'string' && v) {
      const opt = p.options?.find((o) => o.id === v)
      if (opt) items.push({ key: opt.id, label: opt.label, colorIndex: opt.colorIndex, image: opt.image })
    }
    if (p.type === 'multiselect' && Array.isArray(v)) {
      v.forEach((id) => {
        const opt = p.options?.find((o) => o.id === id)
        if (opt) items.push({ key: opt.id, label: opt.label, colorIndex: opt.colorIndex, image: opt.image })
      })
    }
  }
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {items.slice(0, 4).map((it) => (
        <OptionBadge key={it.key} label={it.label} colorIndex={it.colorIndex} image={it.image} />
      ))}
    </div>
  )
}

export default function BoardGallery({
  board,
  rows,
  onOpenRow,
  onAddRow,
}: {
  board: Board
  rows: Row[]
  onOpenRow: (row: Row) => void
  onAddRow: () => void
}) {
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <button
        onClick={onAddRow}
        className="aspect-[2/3] rounded-xl border border-dashed border-neutral-700 hover:border-neutral-500 text-neutral-500 hover:text-neutral-300 transition flex flex-col items-center justify-center gap-1"
      >
        <span className="text-3xl leading-none">+</span>
        <span className="text-xs">Yeni Kayıt</span>
      </button>

      {rows.map((row) => {
        const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
        const cover = coverProp ? (row.values[coverProp.id] as string) : ''
        return (
          <button
            key={row.id}
            onClick={() => onOpenRow(row)}
            className="group text-left rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 hover:border-neutral-600 transition"
          >
            <div className="aspect-[2/3] bg-neutral-800 overflow-hidden">
              {cover ? (
                <img
                  src={cover}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs px-2 text-center">
                  {title || 'İsimsiz'}
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-medium text-neutral-100 truncate">{title || 'İsimsiz'}</p>
              <CardBadges board={board} row={row} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function rowMatchesFilter(row: Row, propertyId: string | null, optionId: string | null): boolean {
  if (!propertyId || !optionId) return true
  const v: PropertyValue = row.values[propertyId]
  if (Array.isArray(v)) return v.includes(optionId)
  return v === optionId
}
