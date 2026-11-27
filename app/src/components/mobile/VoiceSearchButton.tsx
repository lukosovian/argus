import { useEffect, useState } from 'react'
import { ArgusNative, isMobileApp } from '../../lib/mobile/native'
import { getLang, tt } from '../../lib/i18n'

// Telefonda sesle arama (v1.27, T3): arama kutusunun yanındaki mikrofon telefonun kendi ses tanıma penceresini açar
// (Google); söylenen arama kutusuna yazılır. Telefonda ses tanıma yoksa düğme hiç görünmez.
let availableCache: boolean | null = null

export default function VoiceSearchButton({ onText }: { onText: (text: string) => void }) {
  const [available, setAvailable] = useState<boolean>(availableCache ?? false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (availableCache !== null || !isMobileApp()) return
    ArgusNative.voiceAvailable()
      .then((r) => {
        availableCache = Boolean(r.available)
        setAvailable(availableCache)
      })
      .catch(() => {
        availableCache = false
      })
  }, [])
  if (!available) return null

  async function listen() {
    if (busy) return
    setBusy(true)
    try {
      const r = await ArgusNative.voiceSearch({ lang: getLang() === 'en' ? 'en-US' : 'tr-TR', prompt: tt('Ne arıyorsun?') })
      if (r.text) onText(r.text)
    } catch {
      /* pencere açılamadı ya da vazgeçildi */
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={listen}
      aria-label={tt('Sesle ara')}
      className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-full active:bg-neutral-800 ${busy ? 'text-[#00c0fa]' : 'text-neutral-400'}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  )
}
