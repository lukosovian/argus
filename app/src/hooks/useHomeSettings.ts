import { useEffect, useState } from 'react'
import { emptyHomeSettings, type HomeSettings } from '../types'
import { api } from '../lib/api'
import { useProfiles } from './useProfiles'

export function useHomeSettings() {
  const { activeProfileId } = useProfiles()
  const [settings, setSettings] = useState<HomeSettings>(emptyHomeSettings)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeProfileId) return
    setLoading(true)
    api
      .getHomeSettings()
      .then((data) => setSettings(data ? { ...emptyHomeSettings, ...data } : emptyHomeSettings))
      .finally(() => setLoading(false))
  }, [activeProfileId])

  async function saveSettings(next: HomeSettings) {
    await api.saveHomeSettings(next)
    setSettings(next)
  }

  // Ana sayfada hâlâ hiç arşiv seçilmemişse, yeni oluşturulan bir arşivi otomatik ana sayfa
  // arşivi yapar — arşiv nereden oluşturulursa oluşturulsun (Arşivler/Şablonlar/İçe Aktar)
  // aynı tek yerden çağrılıyor. Zaten bir arşiv seçiliyse hiç dokunmaz — kullanıcının bilinçli
  // seçimini asla ezmez, sadece "arşiv oluşturdum ama ana sayfa hâlâ boş" tuzağını kapatır.
  async function selectBoardIfNone(boardId: string) {
    if (settings.boardId) return
    await saveSettings({ ...settings, boardId })
  }

  return { settings, loading, saveSettings, selectBoardIfNone }
}
