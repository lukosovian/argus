// ARGUS Android tam ekran (kullanıcı "Netflix tam ekran çalışıyor, bizimkinde üstte siyah bant var" dedi): sayfa
// durum çubuğunun arkasına kadar uzanıyor (index.html viewport-fit=cover, capacitor.config SystemBars). Durum
// çubuğundaki saat/pil simgeleri temaya göre: koyu temada açık, açık temada koyu renk.
import { SystemBars, SystemBarsStyle } from '@capacitor/core'

export function installSystemBars() {
  const apply = () => {
    const light = document.documentElement.getAttribute('data-theme') === 'light'
    SystemBars.setStyle({ style: light ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {})
  }
  apply()
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}
