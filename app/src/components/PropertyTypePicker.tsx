import { PROPERTY_TYPE_LABELS, type PropertyType } from '../types'

const TYPES: PropertyType[] = [
  'text',
  'number',
  'select',
  'multiselect',
  'checkbox',
  'date',
  'multidate',
  'url',
  'image',
  'longtext',
  'rating',
]

export default function PropertyTypePicker({
  value,
  onChange,
}: {
  value: PropertyType
  onChange: (type: PropertyType) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {TYPES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`text-xs rounded-lg border px-2 py-1.5 text-left transition ${
            value === t
              ? 'bg-neutral-700 border-neutral-500 text-neutral-50'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200'
          }`}
        >
          {PROPERTY_TYPE_LABELS[t]}
        </button>
      ))}
    </div>
  )
}
