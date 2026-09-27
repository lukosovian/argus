import { useState } from 'react'
import type { Board } from '../types'
import type { FilterCondition } from '../lib/filters'
import OptionBadge from './OptionBadge'

// Çoklu + ters filtre seçici (vitrin, Ne İzlesem, sayfalar, modlar, tablo hepsi bunu kullanıyor).
// Bir sütunu açıp değerlere tıklarsın: bir tık ✓ gelsin, ikinci tık ✕ gelmesin, üçüncü tık seçimi
// kaldırır. Birden fazla sütunda seçim yapılabilir — hepsi birlikte uygulanır.
const MANY_OPTIONS = 40
const SEARCH_LIMIT = 60

export default function MultiFilterEditor({
  board,
  conditions,
  onChange,
  emptyText,
  compact = false,
}: {
  board: Board | undefined
  conditions: FilterCondition[]
  onChange: (conditions: FilterCondition[]) => void
  // Hiç seçim yokken ne olacağı (ör. "Filtre yok — hepsinden rastgele").
  emptyText?: string
  // Dar yerler (tablo filtresi) için: kutu çerçevesiz.
  compact?: boolean
}) {
  const props = board?.properties.filter((p) => (p.type === 'select' || p.type === 'multiselect') && (p.options?.length ?? 0) > 0) ?? []
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const condOf = (propertyId: string): FilterCondition =>
    conditions.find((c) => c.propertyId === propertyId) ?? { propertyId, include: [], exclude: [] }

  function setCond(next: FilterCondition) {
    const others = conditions.filter((c) => c.propertyId !== next.propertyId)
    const keep = next.include.length > 0 || next.exclude.length > 0
    // Sütun sırası korunsun: var olanın yerine koy, yoksa sona ekle.
    const idx = conditions.findIndex((c) => c.propertyId === next.propertyId)
    if (!keep) return onChange(others)
    if (idx === -1) return onChange([...conditions, next])
    onChange(conditions.map((c) => (c.propertyId === next.propertyId ? next : c)))
  }

  function cycle(propertyId: string, optionId: string) {
    const c = condOf(propertyId)
    if (c.include.includes(optionId)) setCond({ ...c, include: c.include.filter((x) => x !== optionId), exclude: [...c.exclude, optionId] })
    else if (c.exclude.includes(optionId)) setCond({ ...c, exclude: c.exclude.filter((x) => x !== optionId) })
    else setCond({ ...c, include: [...c.include, optionId] })
  }

  function remove(propertyId: string, optionId: string) {
    const c = condOf(propertyId)
    setCond({ ...c, include: c.include.filter((x) => x !== optionId), exclude: c.exclude.filter((x) => x !== optionId) })
  }

  const active = conditions.filter((c) => c.include.length > 0 || c.exclude.length > 0)

  if (props.length === 0) return <p className="text-xs text-neutral-500">Bu arşivde filtrelenecek seçim sütunu yok.</p>

  return (
    <div className={compact ? 'space-y-2.5' : 'rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 space-y-3'}>
      {/* Özet: seçilenler sütun sütun; üstüne tıklayınca o seçim kalkar */}
      {active.length > 0 ? (
        <div className="space-y-1.5">
          {active.map((c) => {
            const p = props.find((x) => x.id === c.propertyId)
            if (!p) return null
            const opt = (id: string) => p.options?.find((o) => o.id === id)
            return (
              <div key={c.propertyId} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-neutral-500 mr-0.5">{p.name}:</span>
                {c.include.map((id) => {
                  const o = opt(id)
                  return o ? <SummaryChip key={id} kind="in" label={o.label} colorIndex={o.colorIndex} image={o.image} onRemove={() => remove(p.id, id)} /> : null
                })}
                {c.exclude.map((id) => {
                  const o = opt(id)
                  return o ? <SummaryChip key={id} kind="out" label={o.label} colorIndex={o.colorIndex} image={o.image} onRemove={() => remove(p.id, id)} /> : null
                })}
              </div>
            )
          })}
          <button onClick={() => onChange([])} className="text-[11px] text-neutral-500 hover:text-neutral-200 transition">
            Filtreyi temizle
          </button>
        </div>
      ) : (
        emptyText && <p className="text-xs text-neutral-500">{emptyText}</p>
      )}

      <div className="divide-y divide-neutral-800/70 border-t border-neutral-800/70">
        {props.map((p) => {
          const c = condOf(p.id)
          const picked = c.include.length + c.exclude.length
          const open = openId === p.id
          const options = p.options ?? []
          const many = options.length > MANY_OPTIONS
          const q = query.trim().toLocaleLowerCase('tr')
          const shown = !open
            ? []
            : many
              ? q
                ? options.filter((o) => o.label.toLocaleLowerCase('tr').includes(q)).slice(0, SEARCH_LIMIT)
                : options.length > 150
                  ? options.filter((o) => c.include.includes(o.id) || c.exclude.includes(o.id))
                  : options
              : options
          return (
            <div key={p.id} className="py-2">
              <button
                onClick={() => {
                  setOpenId(open ? null : p.id)
                  setQuery('')
                }}
                className="w-full flex items-center gap-2 text-left text-sm text-neutral-200 hover:text-neutral-50 transition"
              >
                <span className={`text-[10px] text-neutral-500 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                <span className="truncate">{p.name}</span>
                {picked > 0 && (
                  <span className="text-[11px] text-neutral-500">
                    {c.include.length > 0 && <span className="text-emerald-400">✓{c.include.length}</span>}
                    {c.include.length > 0 && c.exclude.length > 0 && ' '}
                    {c.exclude.length > 0 && <span className="text-red-400">✕{c.exclude.length}</span>}
                  </span>
                )}
              </button>
              {open && (
                <div className="mt-2.5 pl-5 space-y-2">
                  <p className="text-[11px] text-neutral-500">Tıkla: ✓ gelsin → tekrar tıkla: ✕ gelmesin → tekrar tıkla: seçimi kaldır</p>
                  {many && (
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`${p.name} ara... (${options.length})`}
                      className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500"
                    />
                  )}
                  <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto pt-1.5 pr-1.5">
                    {shown.map((o) => {
                      const state = c.include.includes(o.id) ? 'in' : c.exclude.includes(o.id) ? 'out' : 'none'
                      return (
                        <button
                          key={o.id}
                          onClick={() => cycle(p.id, o.id)}
                          className={`relative rounded-full transition ${
                            state === 'in'
                              ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-neutral-900'
                              : state === 'out'
                                ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-neutral-900 opacity-60'
                                : 'opacity-50 hover:opacity-100'
                          }`}
                        >
                          <OptionBadge label={o.label} colorIndex={o.colorIndex} image={o.image} dim={false} />
                          {state !== 'none' && (
                            <span
                              className={`absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white ${
                                state === 'in' ? 'bg-emerald-500' : 'bg-red-500'
                              }`}
                            >
                              {state === 'in' ? '✓' : '✕'}
                            </span>
                          )}
                        </button>
                      )
                    })}
                    {many && shown.length === 0 && (
                      <p className="text-xs text-neutral-600">{q ? 'Eşleşen yok.' : 'Aramak için yazmaya başla.'}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SummaryChip({
  kind,
  label,
  colorIndex,
  image,
  onRemove,
}: {
  kind: 'in' | 'out'
  label: string
  colorIndex: number
  image?: string
  onRemove: () => void
}) {
  return (
    <button
      onClick={onRemove}
      title={kind === 'in' ? 'Gelsin — kaldırmak için tıkla' : 'Gelmesin — kaldırmak için tıkla'}
      className="group inline-flex items-center gap-0.5"
    >
      <span className={`text-[11px] font-bold ${kind === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>{kind === 'in' ? '✓' : '✕'}</span>
      <span className={kind === 'out' ? 'line-through decoration-red-400/70' : ''}>
        <OptionBadge label={label} colorIndex={colorIndex} image={image} dim={false} />
      </span>
      <span className="text-neutral-600 group-hover:text-neutral-200 text-xs transition">×</span>
    </button>
  )
}
