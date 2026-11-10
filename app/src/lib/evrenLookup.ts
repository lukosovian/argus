// Detay penceresindeki Evrenler düğmesi için: bir kaydın hangi evrenlerde (ve hangi kartta) geçtiği.
// Kullanıcı "evrenlere ait içeriklerin detay penceresine evrenlerin ikonunu koy, tıklayınca ilgili yere atsın" dedi.
import { api } from './api'

export interface RowUniverse {
  id: string
  name: string
  short: string
  color: string
  key: string
}

const cache = new Map<string, { at: number; p: Promise<Map<string, RowUniverse[]>> }>()

function load(boardId: string) {
  const hit = cache.get(boardId)
  if (hit && Date.now() - hit.at < 60_000) return hit.p
  const p = api
    .getEvrenler(boardId)
    .then(({ universes }) => {
      const byRow = new Map<string, RowUniverse[]>()
      for (const u of universes) {
        const seen = new Set<string>()
        for (const it of u.items) {
          // Dizinin sezonları ayrı kartlar: ilk sezonun kartına gidilir
          if (!it.rowId || seen.has(it.rowId)) continue
          seen.add(it.rowId)
          const list = byRow.get(it.rowId) ?? []
          list.push({ id: u.id, name: u.name, short: u.short || u.name, color: u.color, key: it.key })
          byRow.set(it.rowId, list)
        }
      }
      return byRow
    })
    .catch(() => new Map<string, RowUniverse[]>())
  cache.set(boardId, { at: Date.now(), p })
  return p
}

export function universesOfRow(boardId: string, rowId: string): Promise<RowUniverse[]> {
  return load(boardId).then((m) => m.get(rowId) ?? [])
}
