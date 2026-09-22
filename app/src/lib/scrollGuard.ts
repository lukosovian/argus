// Chrome tetikler mouseenter/mouseleave'i sadece fare hareket ettiğinde değil, sayfa tekerlekle
// kaydırılıp imlecin altındaki eleman değiştiğinde de — bu da onhover'a bağlı React state'i olan
// kart ızgaralarında (bkz. AnaSayfa HomeCard) kaydırma sırasında art arda render/DOM değişikliğine,
// dolayısıyla gözle görülür takılmaya yol açıyor. Aktif kaydırma sırasında gelen "enter"ları
// yok sayarak bu render fırtınasını önlüyoruz.
let scrolling = false
let timer: ReturnType<typeof setTimeout> | null = null

if (typeof window !== 'undefined') {
  window.addEventListener(
    'scroll',
    () => {
      scrolling = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        scrolling = false
      }, 150)
    },
    { passive: true },
  )
}

export function isScrolling(): boolean {
  return scrolling
}
