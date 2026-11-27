import { useEffect, useRef, useState } from 'react'
import AnchoredMenu from './AnchoredMenu'
import { autoDots, fmt, MiniCalendar, parseTypedDate } from './DateChipEditor'
import { tt } from '../lib/i18n'

// Tek tarihlik, klavyeyle yazılabilen tarih kutusu — tarayıcının kendi <input type="date"> kutusunun
// yerine (kullanıcı "diğer tarih girmeler de elle yapılabilsin" dedi). GG.AA.YYYY yazılır (noktalar
// kendiliğinden gelir), yanındaki takvim düğmesi küçük takvimi açar. Değer her zaman ISO "YYYY-MM-DD"
// ya da '' (boş). Geçerli ve min/max içinde bir tarih yazılınca onChange hemen çağrılır; geçersizse
// kutu kırmızı olur ve odak gidince eski değere döner.
export default function DateField({
  value,
  onChange,
  min,
  max,
  className = '',
  inputClassName = '',
  ariaLabel,
  placeholder,
  autoFocus,
  allowEmpty = true,
  onEnter,
}: {
  value: string
  onChange: (iso: string) => void
  min?: string
  max?: string
  className?: string
  inputClassName?: string
  ariaLabel?: string
  placeholder?: string
  autoFocus?: boolean
  // false: kutu boşaltılınca onChange('') çağrılmaz (ör. İstatistikler'deki aralık)
  allowEmpty?: boolean
  onEnter?: () => void
}) {
  const [text, setText] = useState(value ? fmt(value) : '')
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  // Dışarıdan değer değişince (takvimden seçim, sıfırlama) kutu da güncellensin
  useEffect(() => {
    setText(value ? fmt(value) : '')
  }, [value])

  const inRange = (d: string) => (!min || d >= min) && (!max || d <= max)
  const parsed = parseTypedDate(text)
  const bad = text.trim() !== '' && (!parsed || !inRange(parsed))

  function change(v: string) {
    const next = autoDots(v)
    setText(next)
    const d = parseTypedDate(next)
    if (d && inRange(d)) {
      if (d !== value) onChange(d)
    } else if (next.trim() === '' && allowEmpty && value) onChange('')
  }

  return (
    <span className={`inline-flex items-stretch min-w-0 ${className}`}>
      <input
        autoFocus={autoFocus}
        inputMode="numeric"
        value={text}
        onChange={(e) => change(e.target.value)}
        onBlur={() => {
          if (bad || (text.trim() === '' && !allowEmpty)) setText(value ? fmt(value) : '')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter && !bad) {
            e.preventDefault()
            onEnter()
          }
        }}
        placeholder={placeholder ?? tt('GG.AA.YYYY')}
        aria-label={ariaLabel ?? placeholder ?? tt('Tarih')}
        aria-invalid={bad || undefined}
        className={`min-w-0 flex-1 rounded-l-md border bg-neutral-950 px-2 py-1 text-sm text-neutral-100 tabular-nums outline-none focus:border-[#00c0fa] ${
          bad ? 'border-red-500/70' : 'border-neutral-700'
        } ${inputClassName}`}
      />
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={tt('Takvimden seç')}
        aria-label={tt('Takvimden seç')}
        className={`shrink-0 rounded-r-md border border-l-0 px-2 text-neutral-400 hover:text-neutral-100 transition ${
          open ? 'border-[#00c0fa] text-[#7fdcff]' : 'border-neutral-700 bg-neutral-950'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      </button>
      {open && (
        <AnchoredMenu anchorRef={btnRef} align="right" width={240} onClose={() => setOpen(false)}>
          <div className="p-1 bg-neutral-900 rounded-lg shadow-xl">
            <MiniCalendar
              initial={value || max || new Date().toISOString().slice(0, 10)}
              selected={value ? { start: value } : null}
              rangeStart={null}
              onPick={(d) => {
                if (!inRange(d)) return
                onChange(d)
                setText(fmt(d))
                setOpen(false)
              }}
            />
          </div>
        </AnchoredMenu>
      )}
    </span>
  )
}
