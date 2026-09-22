import { useEffect, useRef, useState } from 'react'
import type { PropertyDef, PropertyValue } from '../types'

const inputClass =
  'w-full h-9 bg-neutral-800 border border-sky-500 rounded px-2 text-sm text-neutral-100 outline-none'

export default function InlineValueEditor({
  property,
  value,
  onCommit,
  onDone,
}: {
  property: PropertyDef
  value: PropertyValue
  onCommit: (v: PropertyValue) => void
  onDone: () => void
}) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = inputRef.current ?? textareaRef.current
    el?.focus()
    el?.select()
  }, [])

  function commit() {
    if (draft !== value) onCommit(draft)
    onDone()
  }

  if (property.type === 'longtext') {
    return (
      <textarea
        ref={textareaRef}
        value={(draft as string) ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
        rows={1}
        className={`${inputClass} resize-none py-1.5`}
      />
    )
  }

  const inputType = property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : property.type === 'url' ? 'url' : 'text'

  return (
    <input
      ref={inputRef}
      type={inputType}
      value={draft === null || draft === undefined ? '' : (draft as string | number)}
      onChange={(e) =>
        setDraft(property.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)
      }
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') onDone()
      }}
      onClick={(e) => e.stopPropagation()}
      className={inputClass}
    />
  )
}
