import { useSyncExternalStore } from 'react'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { tt } from './i18n'

// İsteğe bağlı özellikler (v1.23.4'te "Ekstralar" sekmesindeydi, v1.23.5'ten beri ilgili ayar sekmelerinde). Hepsi
// varsayılan KAPALI. İki çeşit:
//  - profil: o profilin ana sayfa ayarlarında (home-settings.json → extras) saklanır
//  - cihaz: profil seçilmeden önce çalışanlar (giriş animasyonu, Kim izliyor geçişi, açılış penceresi) — localStorage'da,
//    ui-prefs ile data/ui-prefs.json'a eşlenir; ARGUS.exe açılış penceresi de oradan okur (argus_splash_ciz).

export type ProfileExtra =
  | 'pickerTrio'
  | 'pickerWizard'
  | 'pickerEndTime'
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

export type DeviceExtra = 'argus_profil_gecis' | 'argus_splash_ciz' | 'argus_intro_ses'

export type PickerAnim = 'klasik' | 'cark' | 'slot' | 'deste' | 'serit' | 'karisik'
export type IntroStyle = 'kapali' | 'argus' | 'isik' | 'odak' | 'sirayla' | 'rastgele'

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

export const PICKER_ANIMS: { id: PickerAnim; label: string }[] = [
  { id: 'klasik', label: tt('Klasik (dağıl-ele-büyü)') },
  { id: 'cark', label: tt('Çark') },
  { id: 'slot', label: tt('Slot makinesi') },
  { id: 'deste', label: tt('Kart destesi') },
  { id: 'serit', label: tt('Film şeridi') },
  { id: 'karisik', label: tt('Her seferinde farklı') },
]
