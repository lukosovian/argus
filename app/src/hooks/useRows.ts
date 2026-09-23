import { useCallback, useEffect, useState } from 'react'
import type { Row } from '../types'
import { api } from '../lib/api'
import { useProfiles } from './useProfiles'
import { onDataChanged } from '../lib/dataEvents'

function byCreatedAtAsc(a: Row, b: Row) {
  return a.createdAt - b.createdAt
}

export function useRows(boardId: string | undefined) {
  const { activeProfileId } = useProfiles()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    // bkz. useBoard.ts'teki aynı düzeltme — boardId yokken loading sonsuza dek true kalmasın.
    if (!boardId || !activeProfileId) {
      setRows([])
      setLoading(false)
      return Promise.resolve()
    }
    setLoading(true)
    return api
      .getRows(boardId)
      .then((data) => setRows(data.sort(byCreatedAtAsc)))
      .finally(() => setLoading(false))
  }, [boardId, activeProfileId])

  useEffect(() => {
    reload()
  }, [reload])

  // Başka bir yerden (ör. Keşfet) bu arşive kayıt eklenince sessizce yenile — "Yükleniyor..."
  // göstermeden, mevcut liste yerinde dururken.
  useEffect(
    () =>
      onDataChanged((changed) => {
        if (!boardId || !activeProfileId || (changed && changed !== boardId)) return
        api.getRows(boardId).then((data) => setRows(data.sort(byCreatedAtAsc))).catch(() => {})
      }),
    [boardId, activeProfileId],
  )

  async function saveRow(row: Omit<Row, 'id'>, id?: string) {
    if (!boardId) return undefined
    const saved = id ? await api.updateRow(boardId, id, row) : await api.createRow(boardId, row)
    setRows((prev) => {
      const next = id ? prev.map((r) => (r.id === id ? saved : r)) : [saved, ...prev]
      return [...next].sort(byCreatedAtAsc)
    })
    // Çağıran taraf (ör. "+ Yeni Ekle" butonu) yeni satırın id'sini bilip ona kaydırabilsin diye.
    return saved
  }

  async function removeRow(id: string) {
    if (!boardId) return
    await api.deleteRow(boardId, id)
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  async function bulkAdd(items: Omit<Row, 'id'>[]) {
    if (!boardId) return
    await api.bulkAddRows(boardId, items)
    const fresh = await api.getRows(boardId)
    setRows(fresh.sort(byCreatedAtAsc))
  }

  return { rows, loading, saveRow, removeRow, bulkAdd, reload }
}
