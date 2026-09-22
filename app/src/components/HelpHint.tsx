import { useState } from 'react'

// Küçük "?" ikonu — üzerine gelince (ya da dokununca) sağında/altında kısa bir açıklama
// kutusu açılır. Uzun/ayrıntılı metinleri sayfanın ana akışından çıkarıp buraya taşımak için:
// varsayılan görünümde sadece kısa, sade bir cümle olsun, ayrıntı isteyen buraya baksın.
// Hem `onMouseEnter`/`onMouseLeave` (fare) hem `onClick` (dokunmatik ekran) ile açılır/kapanır.
export default function HelpHint({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label="Yardım"
        className="h-4 w-4 shrink-0 rounded-full border border-neutral-600 text-neutral-500 hover:border-neutral-400 hover:text-neutral-300 text-[10px] leading-none flex items-center justify-center transition"
      >
        ?
      </button>
      {open && (
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="absolute z-20 top-6 left-1/2 -translate-x-1/2 w-72 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl shadow-black/40 p-3 text-sm leading-relaxed text-neutral-300"
        >
          {children}
        </div>
      )}
    </span>
  )
}
