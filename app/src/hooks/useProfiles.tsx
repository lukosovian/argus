import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Profile } from '../types'
import { api, setApiProfileId } from '../lib/api'

// Hangi profilin "aktif" olduğu, sadece bu SEKME açıkken hatırlanan bir tercih —
// sessionStorage kullanılıyor (localStorage değil): sekme kapanıp yeniden açıldığında
// (ya da tarayıcı yeniden başlatıldığında) "Kim izliyor" ekranı tekrar sorulsun istendi;
// localStorage tarayıcı kapansa da kalıcı olurdu, sessionStorage sekmeyle birlikte silinir
// ama SAYFA YENİLEMESİNDE (F5) korunur — profil seçimi bir yenilemede kaybolmaz.
const ACTIVE_PROFILE_KEY = 'argus_active_profile_id'

function readActiveId(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_PROFILE_KEY)
  } catch {
    return null
  }
}

interface ProfilesValue {
  profiles: Profile[]
  loading: boolean
  activeProfileId: string | null
  activeProfile: Profile | null
  setActiveProfileId: (id: string | null) => void
  addProfile: (data: Omit<Profile, 'id'>) => Promise<Profile>
  updateProfile: (id: string, data: Omit<Profile, 'id'>) => Promise<Profile>
  removeProfile: (id: string) => Promise<void>
}

// Navbar, App.tsx'teki "kim izliyor" kapısı ve profil seçici aynı anda, aynı ekranda
// birlikte var olabiliyor — her biri kendi `useProfiles()`'ını çağırıp ayrı bir React
// state tutsaydı, birinde yapılan bir profil değişikliği diğerlerine hemen yansımazdı
// (ör. seçiciden profil değiştirince Navbar'daki avatar bir sonraki sayfa yenilemesine
// kadar eskisini göstermeye devam ederdi). Bu yüzden tek bir Context ile paylaşılıyor.
const ProfilesContext = createContext<ProfilesValue | null>(null)

export function ProfilesProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(readActiveId)

  useEffect(() => {
    api
      .getProfiles()
      .then(setProfiles)
      .finally(() => setLoading(false))
  }, [])

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null

  // api.ts'nin bir sonraki isteği doğru profile göndermesi için, `activeProfileId`
  // her değiştiğinde hemen (bir effect'i beklemeden) güncelleniyor — effect'ler
  // ağaçta aşağıdan yukarı çalıştığı için, bunu bir effect'e koysaydık altta duran bir
  // bileşenin kendi veri çekme effect'i, bu satır çalışmadan önce eski (yanlış) profil
  // id'siyle isteği atmış olabilirdi. Bu satır React state'ini değil, sadece api.ts'nin
  // içindeki modül-seviyesi bir değişkeni günceller; render çıktısını etkilemez.
  setApiProfileId(activeProfileId)

  function setActiveProfileId(id: string | null) {
    setActiveProfileIdState(id)
    try {
      if (id) sessionStorage.setItem(ACTIVE_PROFILE_KEY, id)
      else sessionStorage.removeItem(ACTIVE_PROFILE_KEY)
    } catch {
      // sessionStorage kapalı/dolu olabilir — sorun değil, sadece bu sekmede hatırlanmaz
    }
  }

  async function addProfile(data: Omit<Profile, 'id'>) {
    const created = await api.createProfile(data)
    setProfiles((prev) => [...prev, created])
    return created
  }

  async function updateProfile(id: string, data: Omit<Profile, 'id'>) {
    const updated = await api.updateProfile(id, data)
    setProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)))
    return updated
  }

  async function removeProfile(id: string) {
    await api.deleteProfile(id)
    setProfiles((prev) => prev.filter((p) => p.id !== id))
    if (activeProfileId === id) setActiveProfileId(null)
  }

  const value: ProfilesValue = {
    profiles,
    loading,
    activeProfileId,
    activeProfile,
    setActiveProfileId,
    addProfile,
    updateProfile,
    removeProfile,
  }

  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>
}

export function useProfiles(): ProfilesValue {
  const ctx = useContext(ProfilesContext)
  if (!ctx) throw new Error('useProfiles, <ProfilesProvider> içinde kullanılmalı')
  return ctx
}
