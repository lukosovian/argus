import { useEffect, useState } from 'react'

// Özellik anahtarları (sunucudaki /api/features). Geliştirici bilgisayarında her şey açık; Yıllık Özet
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

export function canSeeWrapped(f: Features | null): boolean {
  return Boolean(f && (f.developer || f.wrappedForAll))
}
