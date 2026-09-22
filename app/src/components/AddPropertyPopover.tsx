import { useState, type RefObject } from 'react'
import type { PropertyType } from '../types'
import AnchoredMenu from './AnchoredMenu'
import PropertyTypePicker from './PropertyTypePicker'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'

export default function AddPropertyPopover({
  anchorRef,
  onSubmit,
  onClose,
}: {
  anchorRef: RefObject<HTMLElement | null>
  onSubmit: (name: string, type: PropertyType) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<PropertyType>('text')

  function handleSubmit() {
    if (!name.trim()) return
    onSubmit(name.trim(), type)
  }

  return (
    <AnchoredMenu anchorRef={anchorRef} align="right" width={288} onClose={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-4 normal-case">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-neutral-400">Yeni sütun</p>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 text-sm">
            ×
          </button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Sütun adı"
          className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm mb-3"
        />
        <p className="text-[11px] text-neutral-500 mb-1.5">Tip</p>
        <div className="mb-3">
          <PropertyTypePicker value={type} onChange={setType} />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          style={primaryButtonStyle}
          className={`w-full py-1.5 text-sm rounded-lg ${PRIMARY_BUTTON}`}
        >
          Sütunu Ekle
        </button>
      </div>
    </AnchoredMenu>
  )
}
