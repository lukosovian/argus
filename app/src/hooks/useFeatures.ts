import { useEffect, useState } from 'react'

// Özellik anahtarları (sunucudaki /api/features). Geliştirici bilgisayarında her şey açık; Flashback (yıllık özet)
// diğer kullanıcılara features.json'daki anahtarla açılıp kapatılıyor.
export interface Features {
  developer: boolean
  // Flashback şu an diğer kullanıcılara açık mı (elle açılmışsa ya da tarih aralığındaysa)
  wrappedForAll: boolean
  // Elle açma anahtarı ve kendiliğinden açık olduğu aralık (v1.24: 9–16 Aralık; `until` günü kapalı)
  wrappedManual?: boolean
  wrappedWindow?: { from: string; until: string } | null
}

let cache: Features | null = null
const listeners = new Set<(f: Features) => void>()

export function setFeaturesCache(f: Features) {
  cache = f
  for (const l of listeners) l(f)
}

function load() {
  fetch('/api/features')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => d && (!cache || JSON.stringify(cache) !== JSON.stringify(d)) && setFeaturesCache(d))
    .catch(() => {})
}

// Açık kalan ARGUS'ta da anahtar değişikliği (ör. Flashback açıldı) yaklaşık bir dakikada görünsün diye ara ara,
// bir de pencereye dönülünce hemen yeniden sorulur (sunucu GitHub'daki güncel değeri okuyor, bkz.
// server/index.js currentFeatures). Kullanıcı "5 dakikada bir güncelleme muhabbetini mi bekliyor, beklemesin" dedi.
const REFRESH_MS = 45 * 1000
let refreshTimer: ReturnType<typeof setInterval> | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => load())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load())
}

export function useFeatures(): Features | null {
  const [f, setF] = useState<Features | null>(cache)
  useEffect(() => {
    listeners.add(setF)
    if (!cache) load()
    if (!refreshTimer) refreshTimer = setInterval(load, REFRESH_MS)
    return () => {
      listeners.delete(setF)
    }
  }, [])
  return f
}

// Diğer kullanıcılarda menüdeki "Flashback"in yanında, sayfa bir kez açılana kadar YENİ etiketi durur
// Her yıl yeniden (Flashback her Aralık açılıyor)
const WRAPPED_SEEN = `argus_wrapped_seen_${new Date().getFullYear()}`
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
