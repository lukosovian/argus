import { useEffect, useState } from 'react'

// Özellik anahtarları (sunucudaki /api/features). Geliştirici bilgisayarında her şey açık; Flashback (yıllık özet)
// diğer kullanıcılara features.json'daki anahtarla açılıp kapatılıyor.
export interface Features {
  developer: boolean
  wrappedForAll: boolean
}

let cache: Features | null = null
const listeners = new Set<(f: Features) => void>()

export function setFeaturesCache(f: Features) {
  cache = f
  for (const l of listeners) l(f)
}

export function useFeatures(): Features | null {
  const [f, setF] = useState<Features | null>(cache)
  useEffect(() => {
    listeners.add(setF)
    if (!cache) {
      fetch('/api/features')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setFeaturesCache(d))
        .catch(() => {})
    }
    return () => {
      listeners.delete(setF)
    }
  }, [])
  return f
}

// Diğer kullanıcılarda menüdeki "Flashback"in yanında, sayfa bir kez açılana kadar YENİ etiketi durur
const WRAPPED_SEEN = 'argus_wrapped_seen'
export function wrappedIsNew(f: Features | null): boolean {
  if (!f || f.developer || !f.wrappedForAll) return false
  try {
    return !localStorage.getItem(WRAPPED_SEEN)
  } catch {
    return false
  }
}
export function markWrappedSeen() {
  try {
    localStorage.setItem(WRAPPED_SEEN, '1')
  } catch {
    /* tarayıcı depolaması kapalıysa önemsiz */
  }
}

export function canSeeWrapped(f: Features | null): boolean {
  return Boolean(f && (f.developer || f.wrappedForAll))
}
