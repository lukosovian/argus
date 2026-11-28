import { useState } from 'react'
import { ratingAverage, titleText, type Board, type PropertyDef, type Row } from '../../types'
import { resolveRole } from '../../lib/roles'
import OptionBadge from '../OptionBadge'
import { tt } from '../../lib/i18n'
import Icon from '../Icon'

// Durum panosu (v1.26, A9): seçilen Seçim sütununun (varsayılan Durum) her seçeneği bir sütun, kayıtlar afişli kart.
// Kartı başka sütuna sürükleyip bırakınca o kaydın değeri değişir (İzlendi'ye bırakınca bugünün tarihi eklenir, puanı
// boşsa puan sorulur — bkz. BoardView.moveOnBoard). Filtre, arama ve sıralama tablodakiyle aynı.
const PAGE = 40
const EMPTY = '__bos__'

export function posterOf(board: Board, row: Row): string {
  const poster = resolveRole(board, 'poster')
  const cover = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  for (const p of [poster, cover]) {
    const v = p ? row.values[p.id] : undefined
    if (typeof v === 'string' && v) return v
  }
  return ''
}

export function yearOf(board: Board, row: Row): string {
  const vizyon = resolveRole(board, 'vizyon')
  const v = vizyon ? row.values[vizyon.id] : undefined
  return typeof v === 'string' ? v.slice(0, 4) : typeof v === 'number' ? String(v) : ''
}

export function ratingOf(board: Board, row: Row): number | null {
  const puan = resolveRole(board, 'puan')
  if (!puan) return null
  return puan.type === 'rating' ? ratingAverage(row.values[puan.id], puan) : typeof row.values[puan.id] === 'number' ? (row.values[puan.id] as number) : null
}

export default function BoardKanban({
  board,
  rows,
  groupProp,
  onMove,
  onOpen,
}: {
  board: Board
  rows: Row[]
  groupProp: PropertyDef
  onMove: (rowId: string, optionId: string | null) => void
  onOpen: (row: Row) => void
}) {
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [shown, setShown] = useState<Record<string, number>>({})

  const buckets = new Map<string, Row[]>()
  for (const o of groupProp.options ?? []) buckets.set(o.id, [])
  const empty: Row[] = []
  for (const r of rows) {
    const v = r.values[groupProp.id]
    const b = typeof v === 'string' ? buckets.get(v) : undefined
    if (b) b.push(r)
    else empty.push(r)
  }
  const columns: { key: string; optionId: string | null; list: Row[] }[] = [
    ...(groupProp.options ?? []).map((o) => ({ key: o.id, optionId: o.id as string | null, list: buckets.get(o.id) ?? [] })),
    ...(empty.length > 0 ? [{ key: EMPTY, optionId: null, list: empty }] : []),
  ]

  if ((groupProp.options ?? []).length === 0) {
    return <p className="text-sm text-neutral-500 py-10 text-center">{tt('"{0}" sütununda henüz seçenek yok — pano bu sütunun seçeneklerini sütun olarak gösterir.', groupProp.name)}</p>
  }

  return (
    <div className="overflow-x-auto pb-4 -mx-1 px-1">
      <div className="flex gap-3 items-start min-w-max">
        {columns.map((col) => {
          const opt = col.optionId ? groupProp.options?.find((o) => o.id === col.optionId) : undefined
          const limit = shown[col.key] ?? PAGE
          const over = overCol === col.key && dragId !== null
          return (
            <section
              key={col.key}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (overCol !== col.key) setOverCol(col.key)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverCol((c) => (c === col.key ? null : c))
              }}
              onDrop={(e) => {
                e.preventDefault()
                const id = dragId ?? e.dataTransfer.getData('text/plain')
                setDragId(null)
                setOverCol(null)
                if (!id) return
                const row = rows.find((r) => r.id === id)
                const cur = row?.values[groupProp.id]
                if (row && (cur ?? null) !== col.optionId && !(col.optionId === null && !cur)) onMove(id, col.optionId)
              }}
              className={`w-72 shrink-0 rounded-xl border transition ${over ? 'border-[#00c0fa]/70 bg-[#00c0fa]/5' : 'border-neutral-800 bg-neutral-900/50'}`}
            >
              <header className="flex items-center gap-2 px-3 py-2.5 border-b border-neutral-800">
                {opt ? <OptionBadge label={opt.label} colorIndex={opt.colorIndex} image={opt.image} /> : <span className="text-sm italic text-neutral-400">{tt('(boş)')}</span>}
                <span className="text-xs tabular-nums text-neutral-500">{col.list.length}</span>
              </header>
              <div className="p-2 space-y-2 min-h-24">
                {col.list.length === 0 && <p className="text-[11px] text-neutral-600 text-center py-6">{tt('Kartı buraya sürükle')}</p>}
                {col.list.slice(0, limit).map((row) => {
                  const title = (titleProp ? titleText(titleProp, row.values[titleProp.id]) : '') || tt('İsimsiz')
                  const poster = posterOf(board, row)
                  const year = yearOf(board, row)
                  const rating = ratingOf(board, row)
                  return (
                    <button
                      key={row.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', row.id)
                        setTimeout(() => setDragId(row.id), 0)
                      }}
                      onDragEnd={() => {
                        setDragId(null)
                        setOverCol(null)
                      }}
                      onClick={() => onOpen(row)}
                      title={tt('Detayı aç — başka sütuna taşımak için sürükle')}
                      className={`w-full flex gap-2.5 text-left rounded-lg border border-neutral-800 bg-neutral-950 p-1.5 hover:border-neutral-600 transition cursor-grab active:cursor-grabbing ${
                        dragId === row.id ? 'opacity-40' : ''
                      }`}
                    >
                      <span className="h-[72px] w-12 shrink-0 overflow-hidden rounded-md bg-neutral-800">
                        {poster ? <img src={poster} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 py-0.5">
                        <span className="block text-sm font-medium text-neutral-100 line-clamp-2 leading-snug">{title}</span>
                        <span className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                          {year && <span className="tabular-nums">{year}</span>}
                          {rating !== null && <span className="inline-flex items-center gap-0.5 text-amber-300 tabular-nums"><Icon name="star" className="h-3 w-3" /> {rating.toFixed(1)}</span>}
                        </span>
                      </span>
                    </button>
                  )
                })}
                {col.list.length > limit && (
                  <button
                    onClick={() => setShown((s) => ({ ...s, [col.key]: limit + PAGE * 2 }))}
                    className="w-full rounded-lg py-1.5 text-xs text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition"
                  >
                    {tt('Daha fazla göster (+{0})', col.list.length - limit)}
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
