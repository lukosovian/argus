// ARGUS Android: telefonun geri tuşu. Önce açık pencereyi (detay, arama, Ne İzlesem…) kapatır; açık pencere
// yoksa bir önceki sayfaya döner; Ana Sayfa'daysa uygulamayı arka plana alır (kapatmaz).
import { App } from '@capacitor/app'
import { closeTopmost } from '../../hooks/useEscape'

const overlays = () => document.querySelectorAll('.fixed.inset-0').length

export function installBackButton() {
  App.addListener('backButton', () => {
    if (closeTopmost()) return
    // Esc'i kendisi dinleyen pencereler: Esc gönderilir, bir pencere kapandıysa iş tamam.
    const before = overlays()
    const target = document.activeElement ?? document.body
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    setTimeout(() => {
      if (overlays() < before) return
      if (location.pathname !== '/' || location.search) history.back()
      else App.minimizeApp()
    }, 60)
  }).catch(() => {})
}
