import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { tt } from '../lib/i18n'
import { useEscape } from '../hooks/useEscape'
import { MOBILE } from '../lib/mobile/ui'

// "?" tuşuna basınca açılan klavye kısayolları listesi (bilgisayarda). Yazı yazılan bir kutudayken açılmaz.
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Ctrl', 'K'], label: 'Her yerden ara' },
  { keys: ['/'], label: 'Arama' },
  { keys: ['Esc'], label: 'Açık pencereyi kapat' },
  { keys: ['1', '2', '3', '…'], label: '"Kim izliyor?" ekranında profil seç' },
  { keys: ['←', '→'], label: 'Flashback hikâyesinde önceki / sonraki' },
  { keys: ['?'], label: 'Bu listeyi aç / kapat' },
]

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)
  useEscape(open, () => setOpen(false))
  useEffect(() => {
    if (MOBILE) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return
      e.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-sm rounded-2xl bg-neutral-900 ring-1 ring-white/10 shadow-2xl shadow-black/60 p-5"
        style={{ animation: 'argus-fade-in .25s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-neutral-50">{tt('Klavye kısayolları')}</h2>
          <button onClick={() => setOpen(false)} aria-label={tt('Kapat')} className="h-8 w-8 rounded-full text-neutral-400 hover:text-neutral-50 hover:bg-neutral-800 transition">
            ×
          </button>
        </div>
        <ul className="space-y-2.5">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4">
              <span className="text-sm text-neutral-300">{tt(s.label)}</span>
              <span className="flex gap-1 shrink-0">
                {s.keys.map((k) => (
                  <kbd key={k} className="min-w-7 h-7 px-2 inline-flex items-center justify-center rounded-md bg-neutral-800 ring-1 ring-neutral-700 text-xs font-semibold text-neutral-100 shadow-[0_2px_0_rgba(0,0,0,0.4)]">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
