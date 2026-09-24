import { useCallback, useEffect, useRef, useState } from 'react'
import type { Board, PropertyDef } from '../types'
import { api } from '../lib/api'
import { useProfiles } from './useProfiles'
import { notifyDataChanged, onDataChanged } from '../lib/dataEvents'

export function useBoard(boardId: string | undefined) {
  const { activeProfileId } = useProfiles()
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const loadedKey = useRef<string | null>(null)

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
    // "Yükleniyor..." sadece bu arşiv (bu profilde) İLK kez yüklenirken gösteriliyor. Eskiden her
    // yenilemede (ör. bir satırı TMDB'den doldurduktan sonra) tablo bir anlığına kayboluyor,
    // sayfa kısalınca da en başa sıçrıyordu — kullanıcı "sayfa başa gidiyo, kaldığı yerde kalsın" dedi.
    const key = `${activeProfileId}:${boardId}`
    if (loadedKey.current !== key) setLoading(true)
    return api
      .getBoards()
      .then((all) => {
        setBoard(all.find((b) => b.id === boardId) ?? null)
        loadedKey.current = key
      })
      .finally(() => setLoading(false))
  }, [boardId, activeProfileId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(
    () =>
      onDataChanged((changed) => {
        if (!boardId || !activeProfileId || (changed && changed !== boardId)) return
        api.getBoards().then((all) => setBoard(all.find((b) => b.id === boardId) ?? null)).catch(() => {})
      }),
    [boardId, activeProfileId],
  )

  async function saveBoard(patch: Partial<Omit<Board, 'id'>>) {
    if (!boardId) return
    const updated = await api.patchBoard(boardId, patch)
    setBoard(updated)
    // Aynı arşivi gösteren diğer açık ekranlar (ör. arşiv adı, sütun görevleri) de güncellensin.
    notifyDataChanged(boardId)
  }

  async function setProperties(properties: PropertyDef[]) {
    await saveBoard({ properties })
  }

  return { board, loading, saveBoard, setProperties, reload }
}
