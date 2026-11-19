import { api } from '../../lib/api'

// Çok sayıda isteği (ör. sütun tipi değişince ~900 kaydın PUT'u) hepsini birden değil, aynı anda en çok `size`
// tanesi olacak şekilde sırayla gönderir. Eskiden hepsi aynı anda gidiyordu: sunucu boğuluyor, hatalar sessizce
// yutuluyordu. Başarısız olanların sayısını döner.
export async function runBatched<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  { size = 8, onProgress }: { size?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<number> {
  let next = 0
  let done = 0
  let failed = 0
  async function worker() {
    while (next < items.length) {
      const item = items[next++]
      try {
        await fn(item)
      } catch {
        failed++
      }
      done++
      onProgress?.(done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return failed
}

// Silinen kayıtları arşiv geçmişinden geri getirir (Geçmiş penceresindeki "Geri al" ile aynı uç nokta):
// her kaydın en son "silindi" girdisi geri alınır. Geri getirilemeyenlerin sayısını döner.
export async function restoreDeletedRows(boardId: string, rowIds: string[]): Promise<number> {
  let failed = 0
  // Sunucu her geri almada kayıt dosyasını baştan yazıyor — sırayla (aynı anda değil) gidilsin.
  for (const id of rowIds) {
    try {
      const { entries } = await api.getRowHistory(boardId, id)
      const del = entries.find((e) => e.type === 'delete')
      if (!del) throw new Error('yok')
      await api.undoHistory(boardId, del.id)
    } catch {
      failed++
    }
  }
  return failed
}
