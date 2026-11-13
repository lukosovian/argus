import { useSyncExternalStore } from 'react'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { tt } from './i18n'

// "Ekstralar" (v1.23.4): ikinci öneri sunumundaki bütün yenilikler isteğe bağlı — kullanıcı "ana sayfadakiler gibi
// isteğe bağlı olsun" dedi. Hepsi varsayılan KAPALI, Ayarlar › Ekstralar'dan açılır.
// İki çeşit var:
//  - profil: o profilin ana sayfa ayarlarında (home-settings.json → extras) saklanır
//  - cihaz: profil seçilmeden önce çalışanlar (açılış, Kim izliyor geçişi, mevsim) — localStorage'da, ui-prefs ile
//    data/ui-prefs.json'a eşlenir; ARGUS.exe açılış penceresi de oradan okur (argus_splash_*, argus_mevsim).

export type ProfileExtra =
  | 'pickerTrio'
  | 'pickerWizard'
  | 'pickerEndTime'
  | 'menuV2'
  | 'searchV2'
  | 'moodAvatar'
  | 'avatarTabs'
  | 'avatarCrop'
  | 'avatarFrames'
  | 'together'
  | 'taste'
  | 'achievements'
  | 'follow'
  | 'seriesPlan'
  | 'quiz'
  | 'weekly'
  | 'shareCard'

export type DeviceExtra = 'argus_profil_gecis' | 'argus_mevsim' | 'argus_splash_ciz' | 'argus_splash_bilgi'

export type PickerAnim = 'klasik' | 'cark' | 'slot' | 'deste' | 'serit' | 'karisik'
export type IntroStyle = 'kapali' | 'sinema' | 'geri-sayim' | 'perde'

export function useExtras() {
  const { settings, saveSettings } = useHomeSettings()
  const on = (k: ProfileExtra) => Boolean(settings.extras?.[k])
  const set = (k: ProfileExtra, v: boolean) => saveSettings({ ...settings, extras: { ...(settings.extras ?? {}), [k]: v } })
  return { on, set, settings, saveSettings }
}

// --- cihaz tercihleri (localStorage) ---
const listeners = new Set<() => void>()
function read(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
export function deviceGet(k: string): string | null {
  return read(k)
}
export function deviceSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* kaydedilemese de bu oturumda çalışsın */
  }
  listeners.forEach((l) => l())
}
export function useDevice(k: string): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => read(k),
  )
}
export const deviceOn = (k: DeviceExtra) => read(k) === '1'

// Mevsim: Aralık–Ocak başı kış, 25–31 Ekim Cadılar Bayramı, 28 Aralık–3 Ocak yılbaşı
export type Season = 'kis' | 'cadilar' | 'yilbasi' | null
export function currentSeason(d = new Date()): Season {
  const m = d.getMonth() + 1
  const day = d.getDate()
  if ((m === 12 && day >= 28) || (m === 1 && day <= 3)) return 'yilbasi'
  if (m === 10 && day >= 25) return 'cadilar'
  if (m === 12 || m === 1 || (m === 2 && day <= 15)) return 'kis'
  return null
}

export const PICKER_ANIMS: { id: PickerAnim; label: string }[] = [
  { id: 'klasik', label: tt('Klasik (dağıl-ele-büyü)') },
  { id: 'cark', label: tt('Çark') },
  { id: 'slot', label: tt('Slot makinesi') },
  { id: 'deste', label: tt('Kart destesi') },
  { id: 'serit', label: tt('Film şeridi') },
  { id: 'karisik', label: tt('Her seferinde farklı') },
]
