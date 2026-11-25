// ARGUS Android: telefonun geri tuşu. Önce açık pencereyi (detay, arama, Ne İzlesem…) kapatır; açık pencere
// yoksa bir önceki sayfaya döner; Ana Sayfa'daysa uygulamayı arka plana alır (kapatmaz).
import { App } from '@capacitor/app'
import { closeTopmost } from '../../hooks/useEscape'

const layers = () => Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0'))
const overlays = () => layers().length

// "Dışarı dokununca kapan" katmanları: içi boş, dokunulabilir tam ekran katman (ör. alt menüdeki "Daha fazla"
// paneli). Bunlar Esc dinlemiyor — eskiden geri tuşu panel açıkken arkadaki sayfayı geri götürüyor (ya da uygulamayı
// arka plana alıyordu), panel açık kalıyordu.
function topBackdrop(): HTMLElement | null {
  const list = layers().filter((el) => !el.childElementCount && el.getClientRects().length && getComputedStyle(el).pointerEvents !== 'none')
  return list[list.length - 1] ?? null
}

export function installBackButton() {
  App.addListener('backButton', () => {
    if (closeTopmost()) return
    // Esc'i kendisi dinleyen pencereler: Esc gönderilir, bir pencere kapandıysa iş tamam.
    const before = overlays()
    // Klavye kapalıyken odak sayfadaysa (body) Esc'i en üstteki pencerenin yazı kutusu dinliyor olabilir (ör. telefondaki
    // arama ekranı): Esc oraya gönderilir. Eskiden arama açıkken geri tuşu alttaki sayfayı geri götürüyordu.
    let target: Element = document.activeElement ?? document.body
    if (target === document.body) {
      const top = layers().pop()
      target = top?.querySelector('input, textarea') ?? document.body
    }
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    setTimeout(() => {
      if (overlays() < before) return
      const backdrop = topBackdrop()
      if (backdrop) {
        backdrop.click()
        return
      }
      if (location.pathname !== '/' || location.search) {
        // Geri gidecek sayfa yoksa (uygulama doğrudan bu sayfada açıldı) Ana Sayfa'ya dön — eskiden hiçbir şey olmuyordu
        const idx = (history.state as { idx?: number } | null)?.idx
        if (idx === undefined || idx > 0) history.back()
        else {
          history.replaceState(history.state, '', '/')
          window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
        }
      } else App.minimizeApp()
    }, 60)
  }).catch(() => {})
}
