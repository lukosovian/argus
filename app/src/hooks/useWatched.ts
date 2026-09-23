import { useCallback, useEffect, useState } from 'react'
import type { WatchedMap } from '../types'
import { api } from '../lib/api'
import { useProfiles } from './useProfiles'
import { useToast } from './useToast'
import { notifyDataChanged } from '../lib/dataEvents'

// episodes.json (TMDB, salt-okunur) ile aynı `{ [rowId]: ... }` şeklinde ama YAZILABİLİR —
// RowDetailModal'daki bölüm tikleri/tekrar izleme tarihleri buradan kaydedilir.
export function useWatched() {
  const { activeProfileId } = useProfiles()
  const { notify } = useToast()
  const [watched, setWatched] = useState<WatchedMap>({})

  const reload = useCallback(() => {
    if (!activeProfileId) return Promise.resolve()
    return api.getWatched().then(setWatched)
  }, [activeProfileId])

  useEffect(() => {
    reload()
  }, [reload])

  // Önce ekrana (iyimser) yazılır, sonra sunucuya gönderilir — kullanıcı "eskiye dönük tarih
  // giremiyorum, girdiğim tarihi güncelleyemiyorum" dedi; eski hâlde kayıt sunucudan dönene
  // kadar ekrana hiç yansımıyordu, ki gerçek bir hata (ör. ağ kopukluğu) hiçbir uyarı vermeden
  // sessizce yutuluyordu — kullanıcıya "hiçbir şey olmadı" gibi görünürdü. Artık başarısız
  // olursa hem eski hâline geri alınır hem de uygulama içi bir hata bildirimi gösterilir.
  async function saveRowWatched(rowId: string, map: Record<string, string[]>) {
    const previous = watched[rowId]
    setWatched((prev) => ({ ...prev, [rowId]: map }))
    try {
      await api.saveRowWatched(rowId, map)
      // Ana sayfadaki "Yeni Bölümler" satırı izlenen bölümü düşürsün diye.
      notifyDataChanged()
    } catch (e) {
      setWatched((prev) => ({ ...prev, [rowId]: previous ?? {} }))
      notify(e instanceof Error ? e.message : 'İzleme tarihi kaydedilemedi.', 'danger')
    }
  }

  return { watched, saveRowWatched, reload }
}
