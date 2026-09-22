import { useState, type RefObject } from 'react'
import { OPTION_COLORS, type PropertyDef, type PropertyType, type RatingCriterion, type SelectOption } from '../types'
import AnchoredMenu from './AnchoredMenu'
import PropertyTypePicker from './PropertyTypePicker'

function CriterionRow({
  criterion,
  onRename,
  onDelete,
}: {
  criterion: RatingCriterion
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(criterion.name)

  function commit() {
    if (name.trim() && name.trim() !== criterion.name) onRename(name.trim())
  }

  return (
    <div className="flex items-center gap-1 mb-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="flex-1 min-w-0 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-100 text-xs outline-none focus:border-neutral-500"
      />
      <button onClick={onDelete} className="text-neutral-600 hover:text-rose-400 text-xs shrink-0 px-1">
        ×
      </button>
    </div>
  )
}

function OptionRow({
  option,
  onRename,
  onChangeColor,
  onDelete,
}: {
  option: SelectOption
  onRename: (label: string) => void
  onChangeColor: (colorIndex: number) => void
  onDelete: () => void
}) {
  const [label, setLabel] = useState(option.label)
  const [pickingColor, setPickingColor] = useState(false)

  function commit() {
    if (label.trim() && label.trim() !== option.label) onRename(label.trim())
  }

  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPickingColor((v) => !v)}
          title="Renk seç"
          className={`h-4 w-4 rounded-full border shrink-0 ${OPTION_COLORS[option.colorIndex % OPTION_COLORS.length].bg} ${OPTION_COLORS[option.colorIndex % OPTION_COLORS.length].border}`}
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="flex-1 min-w-0 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-100 text-xs outline-none focus:border-neutral-500"
        />
        <button onClick={onDelete} className="text-neutral-600 hover:text-rose-400 text-xs shrink-0 px-1">
          ×
        </button>
      </div>
      {pickingColor && (
        <div className="flex flex-wrap gap-1 mt-1 pl-5">
          {OPTION_COLORS.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChangeColor(i)
                setPickingColor(false)
              }}
              className={`h-4 w-4 rounded-full border ${c.bg} ${c.border} ${i === option.colorIndex ? 'ring-2 ring-white/60' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NewCriterionInput({ onAdd }: { onAdd: (name: string) => string }) {
  const [name, setName] = useState('')

  function commit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setName('')
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit())}
        placeholder="Yeni kriter..."
        className="flex-1 min-w-0 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-100 text-xs outline-none focus:border-neutral-500"
      />
      <button type="button" onClick={commit} className="text-xs text-neutral-400 hover:text-neutral-50 shrink-0 px-1">
        + Ekle
      </button>
    </div>
  )
}

export default function ColumnMenu({
  anchorRef,
  property,
  canDelete,
  isCover,
  isTitleImage,
  onClose,
  onRename,
  onChangeType,
  onDelete,
  onRenameOption,
  onChangeOptionColor,
  onDeleteOption,
  onAddCriterion,
  onRenameCriterion,
  onDeleteCriterion,
  onToggleCover,
  onToggleTitleImage,
}: {
  anchorRef: RefObject<HTMLElement | null>
  property: PropertyDef
  canDelete: boolean
  isCover?: boolean
  isTitleImage?: boolean
  onClose: () => void
  onRename: (name: string) => void
  onChangeType: (type: PropertyType) => void
  onDelete: () => void
  onRenameOption: (optionId: string, label: string) => void
  onChangeOptionColor: (optionId: string, colorIndex: number) => void
  onDeleteOption: (optionId: string) => void
  onAddCriterion: (name: string) => string
  onRenameCriterion: (criterionId: string, name: string) => void
  onDeleteCriterion: (criterionId: string) => void
  onToggleCover?: () => void
  onToggleTitleImage?: () => void
}) {
  const [name, setName] = useState(property.name)
  const hasOptions = property.type === 'select' || property.type === 'multiselect'

  function commitName() {
    if (name.trim() && name.trim() !== property.name) onRename(name.trim())
  }

  return (
    <AnchoredMenu anchorRef={anchorRef} align="left" width={240} onClose={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-3 normal-case max-h-[70vh] overflow-y-auto">
        <p className="text-[11px] text-neutral-500 mb-1">Sütun adı</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-neutral-100 text-sm mb-3 outline-none focus:border-neutral-500"
        />
        <p className="text-[11px] text-neutral-500 mb-1.5">Tip</p>
        <PropertyTypePicker value={property.type} onChange={onChangeType} />

        {property.type === 'image' && (
          <div className="mt-3 pt-3 border-t border-neutral-800 space-y-1">
            <button
              type="button"
              onClick={onToggleCover}
              className={`block w-full text-left text-xs rounded-md px-2 py-1.5 transition ${
                isCover ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50'
              }`}
            >
              {isCover ? '✓ Kapak Görseli' : 'Kapak Görseli Yap'}
            </button>
            <button
              type="button"
              onClick={onToggleTitleImage}
              className={`block w-full text-left text-xs rounded-md px-2 py-1.5 transition ${
                isTitleImage ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50'
              }`}
            >
              {isTitleImage ? '✓ Vitrin Başlık Görseli' : 'Vitrin Başlık Görseli Yap'}
            </button>
            <p className="text-[11px] text-neutral-600 px-2">
              Bir kayıtta bu görsel doluysa vitrinde/detayda yazı yerine bu görsel gösterilir, boşsa başlık yazısına
              dönülür.
            </p>
          </div>
        )}

        {hasOptions && (property.options?.length ?? 0) > 0 && (
          <div className="mt-3 pt-3 border-t border-neutral-800">
            <p className="text-[11px] text-neutral-500 mb-1.5">Seçenekler (renk için soldaki noktaya tıkla)</p>
            {property.options!.map((o) => (
              <OptionRow
                key={o.id}
                option={o}
                onRename={(label) => onRenameOption(o.id, label)}
                onChangeColor={(colorIndex) => onChangeOptionColor(o.id, colorIndex)}
                onDelete={() => onDeleteOption(o.id)}
              />
            ))}
          </div>
        )}

        {property.type === 'rating' && (
          <div className="mt-3 pt-3 border-t border-neutral-800">
            <p className="text-[11px] text-neutral-500 mb-1.5">Puanlama kriterleri</p>
            {(property.criteria ?? []).map((c) => (
              <CriterionRow
                key={c.id}
                criterion={c}
                onRename={(name) => onRenameCriterion(c.id, name)}
                onDelete={() => onDeleteCriterion(c.id)}
              />
            ))}
            <NewCriterionInput onAdd={onAddCriterion} />
          </div>
        )}

        {canDelete && (
          <button
            onClick={onDelete}
            className="w-full text-left text-rose-400 hover:text-rose-300 text-xs mt-3 pt-3 border-t border-neutral-800"
          >
            Sütunu Sil
          </button>
        )}
      </div>
    </AnchoredMenu>
  )
}
