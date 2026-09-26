import { useState } from 'react'
import type { AutoFillSettings, Board } from '../../types'
import { AUTO_FILL_MAX_OPTIONS } from '../../types'
import OptionBadge from '../OptionBadge'

// "En altta otomatik satırlar" için gelsin / gelmesin filtresi. Kullanıcı "şunlar gelsin şunlar
// gelmesin, ikisinden de birden fazla seçebileyim" dedi: bir değere her tıklayışta
// boş → ✓ Gelsin → ✕ Gelmesin → boş diye döner. Bir sütunun tamamı da kapatılabilir
// (ör. Durum'dan hiç satır gelmesin). "Gelsin" seçilen varsa yalnızca onlar arasından seçilir.
export default function AutoFillFilterEditor({
  board,
  value,
  onChange,
}: {
  board: Board | undefined
  value: AutoFillSettings
  onChange: (v: AutoFillSettings) => void
}) {
  const props =
    board?.properties.filter(
      (p) => (p.type === 'select' || p.type === 'multiselect') && (p.options?.length ?? 0) > 0 && (p.options?.length ?? 0) <= AUTO_FILL_MAX_OPTIONS,
    ) ?? []
  const include = value.include ?? []
  const exclude = value.exclude ?? []
  const excludeProps = value.excludeProps ?? []
  const [openId, setOpenId] = useState<string | null>(null)

  function cycle(optionId: string) {
    if (include.includes(optionId)) {
      onChange({ ...value, include: include.filter((id) => id !== optionId), exclude: [...exclude, optionId] })
    } else if (exclude.includes(optionId)) {
      onChange({ ...value, exclude: exclude.filter((id) => id !== optionId) })
    } else {
      onChange({ ...value, include: [...include, optionId] })
    }
  }

  function toggleProp(propId: string) {
    onChange({
      ...value,
      excludeProps: excludeProps.includes(propId) ? excludeProps.filter((id) => id !== propId) : [...excludeProps, propId],
    })
  }

  const allOptions = props.flatMap((p) => (p.options ?? []).map((o) => ({ ...o, propName: p.name })))
  const includedOpts = allOptions.filter((o) => include.includes(o.id))
  const excludedOpts = allOptions.filter((o) => exclude.includes(o.id))
  const hasAny = include.length > 0 || exclude.length > 0 || excludeProps.length > 0

  if (props.length === 0) return null

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-300">Hangi satırlar gelsin, hangileri gelmesin</p>
        {hasAny && (
          <button
            onClick={() => onChange({ ...value, include: [], exclude: [], excludeProps: [] })}
            className="text-[11px] text-neutral-500 hover:text-neutral-200 transition"
          >
            Filtreyi temizle
          </button>
        )}
      </div>

      {/* Özet: seçilenler iki grupta; üzerindeki × ile tek tek kaldırılır */}
      {(includedOpts.length > 0 || excludedOpts.length > 0) && (
        <div className="space-y-2">
          {includedOpts.length > 0 && (
            <SummaryRow
              title="✓ Sadece bunlar gelsin"
              tone="text-emerald-400"
              items={includedOpts}
              onRemove={(id) => onChange({ ...value, include: include.filter((x) => x !== id) })}
            />
          )}
          {excludedOpts.length > 0 && (
            <SummaryRow
              title="✕ Bunlar gelmesin"
              tone="text-red-400"
              items={excludedOpts}
              onRemove={(id) => onChange({ ...value, exclude: exclude.filter((x) => x !== id) })}
            />
          )}
        </div>
      )}

      <div className="divide-y divide-neutral-800/70 border-t border-neutral-800/70">
        {props.map((p) => {
          const off = excludeProps.includes(p.id)
          const open = openId === p.id && !off
          const picked = (p.options ?? []).filter((o) => include.includes(o.id) || exclude.includes(o.id)).length
          return (
            <div key={p.id} className="py-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => !off && setOpenId(open ? null : p.id)}
                  disabled={off}
                  className={`flex-1 min-w-0 flex items-center gap-2 text-left text-sm ${off ? 'text-neutral-600 line-through' : 'text-neutral-200 hover:text-neutral-50'} transition`}
                >
                  <span className={`text-[10px] text-neutral-500 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                  <span className="truncate">{p.name}</span>
                  {picked > 0 && !off && <span className="text-[11px] text-neutral-500">{picked} seçili</span>}
                </button>
                <button
                  onClick={() => toggleProp(p.id)}
                  className={`shrink-0 text-[11px] px-2 py-1 rounded-full border transition ${
                    off
                      ? 'border-red-500/40 text-red-300 bg-red-500/10 hover:bg-red-500/20'
                      : 'border-neutral-700 text-neutral-400 hover:text-neutral-100 hover:border-neutral-500'
                  }`}
                  title={off ? 'Bu sütundan yine satır gelebilsin' : 'Bu sütundan hiç satır gelmesin'}
                >
                  {off ? 'Hiç gelmiyor · aç' : 'Hiç gelmesin'}
                </button>
              </div>
              {open && (
                <div className="mt-2.5 pl-5">
                  <p className="text-[11px] text-neutral-500 mb-2">Tıkla: ✓ gelsin → tekrar tıkla: ✕ gelmesin → tekrar tıkla: seçimi kaldır</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(p.options ?? []).map((o) => {
                      const state = include.includes(o.id) ? 'in' : exclude.includes(o.id) ? 'out' : 'none'
                      return (
                        <button
                          key={o.id}
                          onClick={() => cycle(o.id)}
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
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-neutral-600">
        Hiçbir şey seçmezsen bütün değerlerden rastgele gelir. "Gelsin" seçtiklerin varsa satırlar yalnızca onlardan seçilir.
      </p>
    </div>
  )
}

function SummaryRow({
  title,
  tone,
  items,
  onRemove,
}: {
  title: string
  tone: string
  items: { id: string; label: string; colorIndex: number; image?: string; propName: string }[]
  onRemove: (id: string) => void
}) {
  return (
    <div>
      <p className={`text-[11px] font-medium mb-1 ${tone}`}>{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((o) => (
          <button key={o.id} onClick={() => onRemove(o.id)} title={`${o.propName} · kaldırmak için tıkla`} className="group inline-flex items-center gap-0.5">
            <OptionBadge label={o.label} colorIndex={o.colorIndex} image={o.image} dim={false} />
            <span className="text-neutral-600 group-hover:text-neutral-200 text-xs transition">×</span>
          </button>
        ))}
      </div>
    </div>
  )
}
