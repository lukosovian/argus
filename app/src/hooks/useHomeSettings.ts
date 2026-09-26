import { useEffect, useSyncExternalStore } from 'react'
import { emptyHomeSettings, type HomeSettings } from '../types'
import { api } from '../lib/api'
import { useProfiles } from './useProfiles'

// Ana sayfa ayarları TEK bir ortak kaynakta tutuluyor. Eskiden bu hook'u kullanan her bileşen
// (Navbar, Ne İzlesem butonu, ayarlar paneli, ana sayfa…) ayarların kendi kopyasını bir kere
// çekip saklıyordu — ayarlar panelinden bir şey değişince diğerleri sayfa yenilenene kadar eski
// kopyayla çalışmaya devam ediyordu (ör. Ne İzlesem'de seçilen görsel şeklinin hiç
// uygulanmaması). Artık bir yerde kaydedilen ayar anında her yerde görünüyor.

interface Store {
  profileId: string | null
  settings: HomeSettings
  loading: boolean
}

let store: Store = { profileId: null, settings: emptyHomeSettings, loading: true }
const listeners = new Set<() => void>()
let loadingFor: string | null = null

function setStore(patch: Partial<Store>) {
  store = { ...store, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return store
}

function load(profileId: string) {
  if (loadingFor === profileId) return
  loadingFor = profileId
  setStore({ profileId, loading: true })
  api
    .getHomeSettings()
    .then((data) => {
      if (store.profileId !== profileId) return
      setStore({ settings: data ? { ...emptyHomeSettings, ...data } : emptyHomeSettings, loading: false })
    })
    .catch(() => {
      if (store.profileId === profileId) setStore({ loading: false })
    })
    .finally(() => {
      if (loadingFor === profileId) loadingFor = null
    })
}

export function useHomeSettings() {
  const { activeProfileId } = useProfiles()
  const snap = useSyncExternalStore(subscribe, getSnapshot)

  useEffect(() => {
    if (activeProfileId && store.profileId !== activeProfileId) load(activeProfileId)
  }, [activeProfileId])

  // Profil yeni değiştiyse ve yeni profilin ayarları henüz gelmediyse önceki profilinkini
  // göstermiyoruz.
  const current = snap.profileId === activeProfileId
  const settings = current ? snap.settings : emptyHomeSettings
  const loading = !current || snap.loading

  // Ayarlar bu profil için henüz yüklenmediyse (yükleniyor ya da profil yeni değişti) ekranda görünen
  // şey gerçek ayarlar değil, boş varsayılanlar (emptyHomeSettings). O sırada bir kayıt gelirse dosyanın
  // üzerine BOŞ ayarlar yazılıyordu — kullanıcının menü sayfaları, bölümleri ve modları iki kez silindi
  // (26 Eylül 2026). Bu yüzden yükleme bitmeden hiçbir kayıt yapılmıyor.
  async function saveSettings(next: HomeSettings) {
    if (store.loading || store.profileId !== activeProfileId) return
    await api.saveHomeSettings(next)
    setStore({ settings: next })
  }

  // Ana sayfada hâlâ hiç arşiv seçilmemişse, yeni oluşturulan bir arşivi otomatik ana sayfa
  // arşivi yapar — arşiv nereden oluşturulursa oluşturulsun (Arşivler/Şablonlar/İçe Aktar)
  // aynı tek yerden çağrılıyor. Zaten bir arşiv seçiliyse hiç dokunmaz — kullanıcının bilinçli
  // seçimini asla ezmez, sadece "arşiv oluşturdum ama ana sayfa hâlâ boş" tuzağını kapatır.
  async function selectBoardIfNone(boardId: string) {
    if (store.loading || store.settings.boardId) return
    await saveSettings({ ...store.settings, boardId })
  }

  return { settings, loading, saveSettings, selectBoardIfNone }
}
