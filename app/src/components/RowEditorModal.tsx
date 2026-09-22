import { useState } from 'react'
import type { Board, PropertyValue, Row } from '../types'
import PropertyValueInput from './PropertyValueInput'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'

export default function RowEditorModal({
  board,
  row,
  onClose,
  onSave,
  onDelete,
  onAddOption,
}: {
  board: Board
  row: Row | null
  onClose: () => void
  onSave: (values: Record<string, PropertyValue>) => void
  onDelete?: () => void
  onAddOption: (propertyId: string, label: string) => string
}) {
  const [values, setValues] = useState<Record<string, PropertyValue>>(row?.values ?? {})
  const [saving, setSaving] = useState(false)

  function update(propertyId: string, v: PropertyValue) {
    setValues((prev) => ({ ...prev, [propertyId]: v }))
  }

  async function handleSave() {
    setSaving(true)
    await onSave(values)
    setSaving(false)
  }

  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const otherProps = board.properties.filter((p) => p.id !== board.titlePropertyId)
  const labelClass = 'block text-xs text-neutral-400 mb-1'

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-start justify-center overflow-y-auto py-10 px-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-50">{row ? 'Kaydı Düzenle' : 'Yeni Kayıt'}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {titleProp && (
            <div>
              <label className={labelClass}>{titleProp.name}</label>
              <PropertyValueInput property={titleProp} value={values[titleProp.id]} onChange={(v) => update(titleProp.id, v)} />
            </div>
          )}
          {otherProps.map((p) => (
            <div key={p.id}>
              <label className={labelClass}>{p.name}</label>
              <PropertyValueInput
                property={p}
                value={values[p.id]}
                onChange={(v) => update(p.id, v)}
                onAddOption={
                  p.type === 'select' || p.type === 'multiselect' ? (label) => onAddOption(p.id, label) : undefined
                }
              />
            </div>
          ))}
          {board.properties.length <= 1 && (
            <p className="text-xs text-neutral-600">
              Henüz başka sütun yok — kaydettikten sonra tablo görünümünden "+" ile istediğin sütunları ekleyebilirsin.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-4 mt-2 border-t border-neutral-800">
          <button
            onClick={handleSave}
            disabled={saving}
            style={primaryButtonStyle}
            className={`rounded-lg px-4 py-2 text-sm ${PRIMARY_BUTTON}`}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          {onDelete && (
            <button onClick={onDelete} className="text-rose-400 hover:text-rose-300 text-sm ml-auto">
              Kaydı Sil
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
