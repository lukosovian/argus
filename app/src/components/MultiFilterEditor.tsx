import { useState } from 'react'
import { searchFold } from '../lib/search'
import type { Board, PropertyDef } from '../types'
import { isActiveCondition, type FilterCondition, type RelativeRange } from '../lib/filters'
import OptionBadge from './OptionBadge'
import { tt } from '../lib/i18n'
import Icon from './Icon'
import DateField from './DateField'

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
  ranges = false,
}: {
  board: Board | undefined
  conditions: FilterCondition[]
  onChange: (conditions: FilterCondition[]) => void
  // Hiç seçim yokken ne olacağı (ör. "Filtre yok — hepsinden rastgele").
  emptyText?: string
  // Dar yerler (tablo filtresi) için: kutu çerçevesiz.
  compact?: boolean
  // Y16 (arşiv tablosu): puan/sayı aralığı, tarih aralığı ve kısayolları, her sütunda boş / dolu olanlar
  ranges?: boolean
}) {
  const hasOptions = (p: PropertyDef) => (p.type === 'select' || p.type === 'multiselect') && (p.options?.length ?? 0) > 0
  const props = board?.properties.filter((p) => ranges || hasOptions(p)) ?? []
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const condOf = (propertyId: string): FilterCondition =>
    conditions.find((c) => c.propertyId === propertyId) ?? { propertyId, include: [], exclude: [] }

  function setCond(next: FilterCondition) {
    // "biri / hepsi" seçimi ancak 2+ ✓ varken anlamlı — azalınca kayda gereksiz alan kalmasın
    if (next.includeMode && next.include.length < 2) {
      next = { ...next }
      delete next.includeMode
    }
    const others = conditions.filter((c) => c.propertyId !== next.propertyId)
    const keep = isActiveCondition(next)
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

  const active = conditions.filter(isActiveCondition)

  if (props.length === 0) return <p className="text-xs text-neutral-500">{tt('Bu arşivde filtrelenecek seçim sütunu yok.')}</p>

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
                {c.includeMode === 'all' && c.include.length > 1 && <span className="text-[10px] text-emerald-400/80">{tt('(hepsi olsun)')}</span>}
                {c.exclude.map((id) => {
                  const o = opt(id)
                  return o ? <SummaryChip key={id} kind="out" label={o.label} colorIndex={o.colorIndex} image={o.image} onRemove={() => remove(p.id, id)} /> : null
                })}
                {extrasLabel(c) && (
                  <button
                    onClick={() => setCond({ propertyId: c.propertyId, include: c.include, exclude: c.exclude, includeMode: c.includeMode })}
                    title={tt('Kaldırmak için tıkla')}
                    className="group inline-flex items-center gap-1 rounded-full border border-[#00c0fa]/40 bg-[#00c0fa]/10 px-2 py-0.5 text-[11px] text-[#7fdcff]"
                  >
                    {extrasLabel(c)}
                    <span className="text-neutral-500 group-hover:text-neutral-100">×</span>
                  </button>
                )}
              </div>
            )
          })}
          <button onClick={() => onChange([])} className="text-[11px] text-neutral-500 hover:text-neutral-200 transition">
            {tt('Filtreyi temizle')}
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
          const q = searchFold(query.trim())
          const shown = !open
            ? []
            : many
              ? q
                ? options.filter((o) => searchFold(o.label).includes(q)).slice(0, SEARCH_LIMIT)
                : options.length > 150
                  ? options.filter((o) => c.include.includes(o.id) || c.exclude.includes(o.id))
                  : options
              : options
          return (
            <div key={p.id} className="py-2">
              <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setOpenId(open ? null : p.id)
                  setQuery('')
                }}
                className="flex-1 min-w-0 flex items-center gap-2 text-left text-sm text-neutral-200 hover:text-neutral-50 transition"
              >
                <span className={`inline-flex text-neutral-500 transition-transform ${open ? 'rotate-90' : ''}`}><Icon name="caret" className="h-3 w-3" /></span>
                <span className="truncate">{p.name}</span>
                {extrasLabel(c) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#00c0fa]" />}
                {picked > 0 && (
                  <span className="text-[11px] text-neutral-500">
                    {c.include.length > 0 && <span className="text-emerald-400">✓{c.include.length}</span>}
                    {c.include.length > 0 && c.exclude.length > 0 && ' '}
                    {c.exclude.length > 0 && <span className="text-red-400">✕{c.exclude.length}</span>}
                  </span>
                )}
              </button>
              {/* A7: çoklu seçimde 2+ ✓ varken "en az biri mi, hepsi mi olsun" (ör. Komedi + Dram ikisi de) */}
              {p.type === 'multiselect' && c.include.length > 1 && (
                <span className="inline-flex shrink-0 rounded-full border border-neutral-700 overflow-hidden text-[10px]" role="group" aria-label={tt('✓ seçilenlerden')}>
                  {(['any', 'all'] as const).map((m) => {
                    const on = (c.includeMode ?? 'any') === m
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setCond({ ...c, includeMode: m === 'all' ? 'all' : undefined })}
                        title={m === 'any' ? tt('Seçilenlerden en az biri olsun') : tt('Seçilenlerin hepsi birden olsun')}
                        className={`px-2 py-0.5 transition ${on ? 'bg-emerald-500/20 text-emerald-300' : 'text-neutral-400 hover:text-neutral-100'}`}
                      >
                        {m === 'any' ? tt('biri') : tt('hepsi')}
                      </button>
                    )
                  })}
                </span>
              )}
              </div>
              {open && ranges && <RangeControls property={p} cond={c} onChange={setCond} />}
              {open && hasOptions(p) && (
                <div className="mt-2.5 pl-5 space-y-2">
                  <p className="text-[11px] text-neutral-500">{tt('Tıkla: ✓ gelsin → tekrar tıkla: ✕ gelmesin → tekrar tıkla: seçimi kaldır')}</p>
                  {many && (
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={tt('{0} ara... ({1})', p.name, options.length)}
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
                      <p className="text-xs text-neutral-600">{q ? tt('Eşleşen yok.') : tt('Aramak için yazmaya başla.')}</p>
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
      title={kind === 'in' ? tt('Gelsin — kaldırmak için tıkla') : tt('Gelmesin — kaldırmak için tıkla')}
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

const REL_LABELS: [RelativeRange, string][] = [
  ['buYil', tt('Bu yıl')],
  ['gecenYil', tt('Geçen yıl')],
  ['buAy', tt('Bu ay')],
  ['gecenAy', tt('Geçen ay')],
  ['son30', tt('Son 30 gün')],
]

function fmtBound(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s
}

// Seçenek dışı şartların kısa yazısı ("8 – 10", "bu yıl", "2023", "boş olanlar")
function extrasLabel(c: FilterCondition): string {
  const parts: string[] = []
  if (c.min !== undefined && c.max !== undefined) parts.push(`${c.min} – ${c.max}`)
  else if (c.min !== undefined) parts.push(tt('{0} ve üstü', c.min))
  else if (c.max !== undefined) parts.push(tt('{0} ve altı', c.max))
  if (c.rel) parts.push((REL_LABELS.find(([k]) => k === c.rel)?.[1] ?? '').toLocaleLowerCase('tr'))
  else if (c.from && c.to) parts.push(c.from === c.to ? fmtBound(c.from) : `${fmtBound(c.from)} – ${fmtBound(c.to)}`)
  else if (c.from) parts.push(tt('{0} ve sonrası', fmtBound(c.from)))
  else if (c.to) parts.push(tt('{0} ve öncesi', fmtBound(c.to)))
  if (c.presence) parts.push(c.presence === 'empty' ? tt('boş olanlar') : tt('dolu olanlar'))
  return parts.filter(Boolean).join(' · ')
}

// Sütunun tipine göre aralık / tarih / boş-dolu seçimleri (Y16)
function RangeControls({ property, cond, onChange }: { property: PropertyDef; cond: FilterCondition; onChange: (c: FilterCondition) => void }) {
  const [yearText, setYearText] = useState(cond.from && cond.from === cond.to && /^\d{4}$/.test(cond.from) ? cond.from : '')
  const numeric = property.type === 'number' || property.type === 'rating'
  const dated = property.type === 'date' || property.type === 'multidate'
  const isRating = property.type === 'rating'
  const chip = (on: boolean) =>
    `whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition ${
      on ? 'border-[#00c0fa] bg-[#00c0fa]/15 text-[#7fdcff]' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
    }`
  const input = 'rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-[#00c0fa]'
  const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v.replace(',', '.'))) ? undefined : Number(v.replace(',', '.')))
  return (
    <div className="mt-2.5 pl-5 space-y-2.5">
      {numeric && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            <span>{tt('En az')}</span>
            <input
              type="number"
              step={isRating ? 0.5 : 1}
              min={isRating ? 0 : undefined}
              max={isRating ? 10 : undefined}
              value={cond.min ?? ''}
              onChange={(e) => onChange({ ...cond, min: num(e.target.value) })}
              className={`${input} w-16`}
            />
            <span>{tt('en çok')}</span>
            <input
              type="number"
              step={isRating ? 0.5 : 1}
              min={isRating ? 0 : undefined}
              max={isRating ? 10 : undefined}
              value={cond.max ?? ''}
              onChange={(e) => onChange({ ...cond, max: num(e.target.value) })}
              className={`${input} w-16`}
            />
          </div>
          {isRating && (
            <>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={cond.min ?? 0}
                onChange={(e) => onChange({ ...cond, min: Number(e.target.value) || undefined })}
                className="w-full accent-[#00c0fa]"
                aria-label={tt('En az puan')}
              />
              <div className="flex flex-wrap gap-1.5">
                {[7, 8, 9].map((n) => {
                  const on = cond.min === n && cond.max === undefined
                  return (
                    <button key={n} onClick={() => onChange({ ...cond, min: on ? undefined : n, max: undefined })} className={chip(on)}>
                      {tt('{0} ve üstü', n)}
                    </button>
                  )
                })}
                <button
                  onClick={() => onChange({ ...cond, min: undefined, max: cond.max === 5 && cond.min === undefined ? undefined : 5 })}
                  className={chip(cond.max === 5 && cond.min === undefined)}
                >
                  {tt('{0} ve altı', 5)}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {dated && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {REL_LABELS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => {
                  setYearText('')
                  onChange({ ...cond, rel: cond.rel === k ? undefined : k, from: undefined, to: undefined })
                }}
                className={chip(cond.rel === k)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            <span>{tt('Yıl')}</span>
            <input
              inputMode="numeric"
              maxLength={4}
              value={yearText}
              placeholder={String(new Date().getFullYear() - 1)}
              onChange={(e) => {
                const t = e.target.value.replace(/\D/g, '')
                setYearText(t)
                if (/^\d{4}$/.test(t)) onChange({ ...cond, rel: undefined, from: t, to: t })
                else if (cond.from && cond.from === cond.to && /^\d{4}$/.test(cond.from)) onChange({ ...cond, from: undefined, to: undefined })
              }}
              className={`${input} w-16`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-400">
            <DateField
              value={cond.from && cond.from.length === 10 ? cond.from : ''}
              onChange={(iso) => {
                setYearText('')
                onChange({ ...cond, rel: undefined, from: iso || undefined, to: cond.to && cond.to.length === 4 ? undefined : cond.to })
              }}
              inputClassName="w-[6.5rem] text-xs"
              ariaLabel={tt('Şu tarihten')}
            />
            <span>–</span>
            <DateField
              value={cond.to && cond.to.length === 10 ? cond.to : ''}
              onChange={(iso) => {
                setYearText('')
                onChange({ ...cond, rel: undefined, to: iso || undefined, from: cond.from && cond.from.length === 4 ? undefined : cond.from })
              }}
              inputClassName="w-[6.5rem] text-xs"
              ariaLabel={tt('Şu tarihe')}
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {(['empty', 'filled'] as const).map((k) => (
          <button key={k} onClick={() => onChange({ ...cond, presence: cond.presence === k ? undefined : k })} className={chip(cond.presence === k)}>
            {k === 'empty' ? tt('Boş olanlar') : tt('Dolu olanlar')}
          </button>
        ))}
      </div>
    </div>
  )
}
