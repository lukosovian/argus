import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ackSkipped, getState, startAppUpdate, subscribe, type MobileState } from '../../lib/mobile/connection'
import { ToastProvider } from '../../hooks/useToast'
import { tt } from '../../lib/i18n'

// Bekleyen değişiklikler ekranı: gösterge App'in dışında duruyor (bildirim sistemi yok), kendi bildirimleriyle açılır
const PendingChanges = lazy(() => import('./PendingChanges'))
const PENDING_EVENT = 'argus-bekleyenler-ac'
// PC bu telefonu artık tanımıyor: yeniden eşleşme ekranı (Ayarlar › PC bağlantısı da bu olayla açar)
const PairScreen = lazy(() => import('./PairScreen'))
export const REPAIR_EVENT = 'argus-yeniden-bagla'

// ARGUS Android: üstte küçük bağlantı göstergesi — PC yokken "Çevrimdışı · 3 değişiklik bekliyor",
// eşitlenirken "Eşitleniyor...", bitince kısa bir "Eşitlendi". Her şey yolundayken görünmez.
export function useMobileState(): MobileState {
  const [s, setS] = useState(getState)
  useEffect(() => subscribe(setS), [])
  return s
}

// Alt sekme çubuğunun hemen üstünde; 9 sn sonra kendiliğinden çekilir (sayı üstteki göstergede kalır)
function SkippedCard({ count, onOpen }: { count: number; onOpen: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => ackSkipped(), 9000)
    return () => clearTimeout(t)
  }, [count])
  return (
    <div className="fixed inset-x-0 z-[200] flex justify-center px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6.25rem)', animation: 'argus-toast-in .2s ease-out' }}>
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-amber-700/40 bg-neutral-900/95 px-4 py-3 shadow-2xl shadow-black/70 backdrop-blur-md">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="text-[14px] font-semibold text-[#fde68a]">{tt('{0} değişiklik uygulanmadı', count)}</p>
          <p className="text-xs text-neutral-400">{tt("PC'de daha yeni hali var · Dokun, hangisi kalsın seç")}</p>
        </button>
        <button onClick={() => ackSkipped()} aria-label={tt('Kapat')} className="shrink-0 px-1 text-lg leading-none text-neutral-500">
          ×
        </button>
      </div>
    </div>
  )
}

export default function MobileStatusBar() {
  const s = useMobileState()
  const [justSynced, setJustSynced] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const prev = useRef(s.status)
  const [showPending, setShowPending] = useState(false)
  const [showPair, setShowPair] = useState(false)
  useEffect(() => {
    const open = () => setShowPending(true)
    const pair = () => setShowPair(true)
    window.addEventListener(PENDING_EVENT, open)
    window.addEventListener(REPAIR_EVENT, pair)
    return () => {
      window.removeEventListener(PENDING_EVENT, open)
      window.removeEventListener(REPAIR_EVENT, pair)
    }
  }, [])
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
  else if (s.status === 'offline' && s.unpaired) {
    text = tt('PC bu telefonu tanımıyor · Yeniden bağlan')
    tone = 'bg-red-950/95 text-[#fecaca] border-red-800/60'
  } else if (s.status === 'offline') {
    text = s.pending ? tt('Çevrimdışı · {0} değişiklik bekliyor', s.pending) : tt('Çevrimdışı')
    tone = 'bg-amber-950/95 text-[#fde68a] border-amber-800/60'
  } else if (justSynced) {
    text = tt('Eşitlendi')
    tone = 'bg-emerald-950/95 text-[#a7f3d0] border-emerald-800/60'
  } else if (s.failed > 0) {
    text = tt('{0} değişiklik gönderilemedi', s.failed)
    tone = 'bg-red-950/95 text-[#fecaca] border-red-800/60'
  } else if (s.skipped > 0) {
    text = tt('{0} değişiklik uygulanmadı', s.skipped)
    tone = 'bg-amber-950/95 text-[#fde68a] border-amber-800/60'
  }
  // Dokununca bekleyen / gönderilemeyen değişiklikler açılır
  const repair = s.status === 'offline' && s.unpaired
  const tappable = repair || s.pending > 0 || s.failed > 0 || s.skipped > 0
  // Eşitleme sonrası alttan kart: "2 değişiklik uygulanmadı — PC'de daha yeni hali var" (dokununca ayrıntı)
  const skippedCard = s.newSkipped > 0 && s.status !== 'syncing' && !showPending && !showPair && (
    <SkippedCard count={s.newSkipped} onOpen={() => setShowPending(true)} />
  )
  const pendingScreen = (
    <>
      {showPending && (
        <ToastProvider>
          <Suspense fallback={null}>
            <PendingChanges onClose={() => setShowPending(false)} />
          </Suspense>
        </ToastProvider>
      )}
      {showPair && (
        <Suspense fallback={null}>
          <PairScreen onClose={() => setShowPair(false)} />
        </Suspense>
      )}
      {skippedCard}
    </>
  )
  // Yeni sürüm: dokununca indirilir, Android'in kurulum penceresi açılır
  if (s.update || s.updating !== null) {
    const busy = s.updating !== null
    return (
      <>
      {pendingScreen}
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
      </>
    )
  }
  if (!text) return pendingScreen
  return (
    <>
      {pendingScreen}
      {!showPending && !showPair && (
        <div className="fixed inset-x-0 z-[200] flex justify-center pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top) + 6px)' }}>
          {tappable ? (
            <button onClick={() => (repair ? setShowPair(true) : setShowPending(true))} className={`pointer-events-auto rounded-full border px-3 py-1 text-[11px] font-medium shadow-lg ${tone}`}>
              {text} ›
            </button>
          ) : (
            <span className={`rounded-full border px-3 py-1 text-[11px] font-medium shadow-lg ${tone}`}>{text}</span>
          )}
        </div>
      )}
    </>
  )
}
