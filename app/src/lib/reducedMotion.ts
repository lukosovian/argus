import { useSyncExternalStore } from 'react'

// "Hareketi azalt" (işletim sisteminin erişilebilirlik ayarı) açık mı? Açıksa süslü animasyonları
// (dönen çerçeveler, patlama efektleri, yakınlaşma, kayan geçişler) kısaltıyor ya da kapatıyoruz.
const QUERY = '(prefers-reduced-motion: reduce)'

function mql(): MediaQueryList | null {
  return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null
}

export function prefersReducedMotion(): boolean {
  return !!mql()?.matches
}

function subscribe(cb: () => void) {
  const m = mql()
  if (!m) return () => {}
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

// Ayar uygulama açıkken değişirse de güncellenir
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false)
}
