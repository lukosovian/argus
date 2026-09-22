import { useCallback, useEffect, useState } from 'react'
import type { Board, PropertyDef } from '../types'
import { api } from '../lib/api'
import { useProfiles } from './useProfiles'

export function useBoard(boardId: string | undefined) {
  const { activeProfileId } = useProfiles()
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)

  // `activeProfileId` de bağımlılıklarda — profil değişince (aynı board id başka bir
  // profilde muhtemelen yok olsa da) bu profilin verisiyle yeniden çekilsin.
  const reload = useCallback(() => {
    // boardId hiç seçilmemişse (ör. henüz arşiv yok) burada sonsuza dek "loading: true" takılı
    // kalmasın diye açıkça false'a çekiyoruz — önceden burası hiç dokunmuyordu, o da
    // İstatistikler sayfası gibi (AnaSayfa'nın aksine) `loading` bittiğinde diye bekleyen bir
    // ekranı sonsuza dek "Yükleniyor..."da bırakıyordu.
    if (!boardId || !activeProfileId) {
      setBoard(null)
      setLoading(false)
      return Promise.resolve()
    }
    setLoading(true)
    return api
      .getBoards()
      .then((all) => setBoard(all.find((b) => b.id === boardId) ?? null))
      .finally(() => setLoading(false))
  }, [boardId, activeProfileId])

  useEffect(() => {
    reload()
  }, [reload])

  async function saveBoard(patch: Partial<Omit<Board, 'id'>>) {
    if (!boardId) return
    const updated = await api.patchBoard(boardId, patch)
    setBoard(updated)
  }

  async function setProperties(properties: PropertyDef[]) {
    await saveBoard({ properties })
  }

  return { board, loading, saveBoard, setProperties, reload }
}
