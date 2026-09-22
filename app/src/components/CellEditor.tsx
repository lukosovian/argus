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
      </div>
    </AnchoredMenu>
  )
}
