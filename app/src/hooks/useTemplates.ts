import { useEffect, useState } from 'react'
import type { Template } from '../types'
import { api } from '../lib/api'
import { useProfiles } from './useProfiles'

// Kullanıcının kendi oluşturduğu şablonlar — useBoards.ts ile birebir aynı desen (profil
// değişince yeniden çek, aktif profil yoksa hiç çekme). Uygulamayla gelen "Medya Arşivi"
// şablonu burada YOK — o sunucuya hiç yazılmaz, her yerde types.ts'teki builtinMediaTemplate()
// ile ayrıca ekleniyor.
export function useTemplates() {
  const { activeProfileId } = useProfiles()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeProfileId) return
    setLoading(true)
    api
      .getTemplates()
      .then(setTemplates)
      .finally(() => setLoading(false))
  }, [activeProfileId])

  async function createTemplate(data: Omit<Template, 'id'>): Promise<Template> {
    const created = await api.createTemplate(data)
    setTemplates((prev) => [...prev, created])
    return created
  }

  async function deleteTemplate(id: string) {
    await api.deleteTemplate(id)
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  return { templates, loading, createTemplate, deleteTemplate }
}
