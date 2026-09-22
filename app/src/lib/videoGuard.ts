// Kart üzerine gelince oynayan önizleme videosuyla (HoverPreviewVideo — hem AnaSayfa'daki
// HomeCard'ta hem MoodRow'daki MoodCard'ta kullanılıyor) vitrindeki/detay penceresindeki büyük
// video AYNI ANDA oynamasın diye (kullanıcı "aynı anda iki tane olmasın" dedi) paylaşılan,
// React'ten bağımsız küçük bir sayaç — potansiyel olarak çok sayıda kart bileşeni üzerinden prop
// drilling yapmadan ShowcaseBanner'ın haberdar olup kendi videosunu duraklatmasını sağlıyor.
// scrollGuard.ts'teki "modül seviyesinde paylaşılan mutable durum" deseniyle aynı fikir, ama
// burada React'in buna TEPKİ vermesi (oynatıcıyı durdurup başlatması) gerektiği için abone
// olunabilir (subscribe) hale getirildi — bkz. ShowcaseBanner.tsx'teki useSyncExternalStore kullanımı.
let count = 0
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

export function beginHoverVideo() {
  count++
  notify()
}

export function endHoverVideo() {
  count = Math.max(0, count - 1)
  notify()
}

export function isHoverVideoActive(): boolean {
  return count > 0
}

export function subscribeHoverVideo(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
