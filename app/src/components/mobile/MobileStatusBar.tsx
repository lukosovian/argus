import { useEffect, useRef, useState } from 'react'
import { getState, startAppUpdate, subscribe, type MobileState } from '../../lib/mobile/connection'
import { tt } from '../../lib/i18n'

// ARGUS Android: üstte küçük bağlantı göstergesi — PC yokken "Çevrimdışı · 3 değişiklik bekliyor",
// eşitlenirken "Eşitleniyor...", bitince kısa bir "Eşitlendi". Her şey yolundayken görünmez.
export function useMobileState(): MobileState {
  const [s, setS] = useState(getState)
  useEffect(() => subscribe(setS), [])
  return s
}

export default function MobileStatusBar() {
  const s = useMobileState()
  const [justSynced, setJustSynced] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const prev = useRef(s.status)
  useEffect(() => {
    if (prev.current === 'syncing' && s.status === 'online') {
      setJustSynced(true)
      const t = setTimeout(() => setJustSynced(false), 2200)
      prev.current = s.status
      return () => clearTimeout(t)
    }
    prev.current = s.status
  }, [s.status])

  let text: string | null = null
  let tone = 'bg-neutral-800/95 text-neutral-200 border-neutral-700'
  if (s.status === 'syncing') text = tt('Eşitleniyor...')
  else if (s.status === 'offline') {
    text = s.pending ? tt('Çevrimdışı · {0} değişiklik bekliyor', s.pending) : tt('Çevrimdışı')
    tone = 'bg-amber-950/95 text-[#fde68a] border-amber-800/60'
  } else if (justSynced) {
    text = tt('Eşitlendi')
    tone = 'bg-emerald-950/95 text-[#a7f3d0] border-emerald-800/60'
  }
  // Yeni sürüm: dokununca indirilir, Android'in kurulum penceresi açılır
  if (s.update || s.updating !== null) {
    const busy = s.updating !== null
    return (
      <div className="fixed inset-x-0 z-[200] flex justify-center" style={{ top: 'calc(env(safe-area-inset-top) + 6px)' }}>
        <button
          disabled={busy}
          onClick={async () => {
            const r = await startAppUpdate()
            if (r === 'izin') setHint(tt("Açılan ayarda ARGUS'a izin ver, sonra tekrar dokun."))
            else if (r === 'hata') setHint(tt("İndirilemedi — PC'ye bağlıyken tekrar dene."))
            else setHint(null)
          }}
          className="rounded-full border border-[#00c0fa]/60 bg-[#062033]/95 px-3.5 py-1.5 text-[12px] font-semibold text-[#bdeeff] shadow-lg"
        >
          {busy ? tt('Güncelleme indiriliyor… %{0}', s.updating ?? 0) : hint ?? tt('Yeni sürüm {0} hazır · Güncelle', s.update?.version ?? '')}
        </button>
      </div>
    )
  }
  if (!text) return null
  return (
    <div className="fixed inset-x-0 z-[200] flex justify-center pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top) + 6px)' }}>
      <span className={`rounded-full border px-3 py-1 text-[11px] font-medium shadow-lg ${tone}`}>{text}</span>
    </div>
  )
}
