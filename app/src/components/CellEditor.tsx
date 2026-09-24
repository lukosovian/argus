import { useRef, useState, type RefObject } from 'react'
import type { PropertyDef, PropertyValue } from '../types'
import AnchoredMenu from './AnchoredMenu'
import PropertyValueInput from './PropertyValueInput'

const SINGLE_STEP_TYPES = new Set(['text', 'number', 'date', 'url'])

export default function CellEditor({
  anchorRef,
  property,
  value,
  onCommit,
  onClose,
  onAddOption,
  onAddCriterion,
}: {
  anchorRef: RefObject<HTMLElement | null>
  property: PropertyDef
  value: PropertyValue
  onCommit: (v: PropertyValue) => void
  onClose: () => void
  onAddOption?: (label: string) => string
  onAddCriterion?: (name: string) => string
}) {
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(draft)
  draftRef.current = draft

  function handleClose() {
    if (draftRef.current !== value) onCommit(draftRef.current)
    onClose()
  }

  return (
    <AnchoredMenu anchorRef={anchorRef} align="left" width={property.type === 'rating' ? 320 : 260} onClose={handleClose}>
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-3 normal-case"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && SINGLE_STEP_TYPES.has(property.type)) handleClose()
        }}
      >
        <PropertyValueInput
          property={property}
          value={draft}
          onChange={setDraft}
          onAddOption={onAddOption}
          onAddCriterion={onAddCriterion}
        />
        {/* Kullanıcı "puan falan verdikten sonra orayı kapatmak için boş bi yere tıklamam
            gerekiyor, bi kapatma butonu ekle" dedi — dışarı tıklamakla aynı: değişiklik kaydedilir. */}
        <div className="flex justify-end mt-3">
          <button
            type="button"
            onClick={handleClose}
            className="text-xs font-semibold rounded-md bg-[#00c0fa] hover:brightness-110 text-white px-3 py-1.5 transition"
          >
            Kapat
          </button>
        </div>
      </div>
    </AnchoredMenu>
  )
}
