import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import AnchoredMenu from './AnchoredMenu'
import { BRAND_TEXT } from '../lib/theme'
import { tt } from '../lib/i18n'

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
  placeholder = tt('Seç...'),
  disabled = false,
  className = '',
  id,
  'aria-labelledby': labelledBy,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  // Erişilebilirlik: tetikleyici düğmenin id'si ve onu adlandıran etiket (ör. <label id=…>)
  id?: string
  'aria-labelledby'?: string
  'aria-label'?: string
}) {
  const [open, setOpen] = useState(false)
  // Klavyeyle üzerinde durulan seçenek (Enter/Boşluk onu seçer)
  const [active, setActive] = useState(-1)
  // Liste genişliği açılırken ölçülüyor (render sırasında ref okumamak için state'te)
  const [width, setWidth] = useState(240)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  function openList(at?: number) {
    if (disabled) return
    setWidth(anchorRef.current?.offsetWidth ?? 240)
    setActive(at ?? (selectedIndex >= 0 ? selectedIndex : 0))
    setOpen(true)
  }
  function close(refocus: boolean) {
    setOpen(false)
    if (refocus) anchorRef.current?.focus({ preventScroll: true })
  }
  function pick(i: number) {
    const o = options[i]
    if (o) onChange(o.value)
    close(true)
  }

  // Liste açılınca odak listeye geçsin (ok tuşları orada çalışıyor); AnchoredMenu bir kare sonra çizildiği için ref ile
  const focusList = useCallback((el: HTMLDivElement | null) => {
    el?.focus({ preventScroll: true })
  }, [])

  // Üzerinde durulan seçenek görünür alanda kalsın
  useEffect(() => {
    if (!open || active < 0) return
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, listId])

  function onTriggerKey(e: KeyboardEvent) {
    if (open) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openList(e.key === 'ArrowUp' && selectedIndex < 0 ? options.length - 1 : undefined)
    }
  }
  function onListKey(e: KeyboardEvent) {
    const n = options.length
    const move = (i: number) => {
      e.preventDefault()
      if (n) setActive(Math.max(0, Math.min(n - 1, i)))
    }
    if (e.key === 'ArrowDown') move(active + 1)
    else if (e.key === 'ArrowUp') move(active - 1)
    else if (e.key === 'Home' || e.key === 'PageUp') move(0)
    else if (e.key === 'End' || e.key === 'PageDown') move(n - 1)
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (active >= 0) pick(active)
    } else if (e.key === 'Escape') {
      // İşaretle ki AnchoredMenu / arkadaki pencere (useEscape) ayrıca kapanmasın
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      close(true)
    }
  }

  return (
    <div className={className}>
      <button
        ref={anchorRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelledBy}
        aria-label={ariaLabel}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKey}
        className={`w-full flex items-center justify-between gap-2 rounded-lg bg-neutral-800 border px-3 py-2 text-sm text-left outline-none transition disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#00c0fa]/60 ${
          open ? 'border-neutral-500' : 'border-neutral-700 hover:border-neutral-600'
        }`}
      >
        <span className={`truncate ${selected ? 'text-neutral-100' : 'text-neutral-500'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <AnchoredMenu anchorRef={anchorRef} width={width} onClose={() => close(false)}>
          <div
            ref={focusList}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={labelledBy}
            aria-label={labelledBy ? undefined : ariaLabel}
            aria-activedescendant={active >= 0 && options[active] ? `${listId}-${active}` : undefined}
            onKeyDown={onListKey}
            className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl py-1 max-h-64 overflow-y-auto outline-none"
          >
            {options.length === 0 && <p className="px-3 py-2 text-xs text-neutral-500">{tt('Seçenek yok')}</p>}
            {options.map((o, i) => (
              <div
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                onClick={() => pick(i)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left cursor-pointer transition ${
                  o.value === value ? 'text-neutral-50 bg-neutral-800' : 'text-neutral-300 hover:bg-neutral-800'
                } ${i === active ? 'ring-1 ring-inset ring-neutral-500' : ''}`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <span style={{ color: BRAND_TEXT }}><CheckIcon /></span>}
              </div>
            ))}
          </div>
        </AnchoredMenu>
      )}
    </div>
  )
}
