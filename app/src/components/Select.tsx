import { useRef, useState } from 'react'
import AnchoredMenu from './AnchoredMenu'
import { BRAND_TEXT } from '../lib/theme'

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export interface SelectOption {
  value: string
  label: string
}

// Native <select>'in kapalı hâli temaya uygundu ama tıklayınca açılan liste işletim
// sisteminin kendi ("eski Windows") menüsüydü — bunun yerine ToggleSwitch/Checkbox'la aynı
// ailede, tamamen kendi çizdiğimiz bir açılır liste. Uygulama genelinde tek seçimlik
// (multiselect değil) native <select> kullanan her yerin ortak yerine geçmesi hedefleniyor.
export default function Select({
  value,
  onChange,
  options,
  placeholder = 'Seç...',
  disabled = false,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const selected = options.find((o) => o.value === value)

  return (
    <div className={className}>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 rounded-lg bg-neutral-800 border px-3 py-2 text-sm text-left outline-none transition disabled:opacity-50 ${
          open ? 'border-neutral-500' : 'border-neutral-700 hover:border-neutral-600'
        }`}
      >
        <span className={`truncate ${selected ? 'text-neutral-100' : 'text-neutral-500'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <AnchoredMenu anchorRef={anchorRef} width={anchorRef.current?.offsetWidth ?? 240} onClose={() => setOpen(false)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl py-1 max-h-64 overflow-y-auto">
            {options.length === 0 && <p className="px-3 py-2 text-xs text-neutral-500">Seçenek yok</p>}
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition ${
                  o.value === value ? 'text-neutral-50 bg-neutral-800' : 'text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <span style={{ color: BRAND_TEXT }}><CheckIcon /></span>}
              </button>
            ))}
          </div>
        </AnchoredMenu>
      )}
    </div>
  )
}
