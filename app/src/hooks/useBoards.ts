import { useEffect, useState } from 'react'
import type { Board } from '../types'
import { api } from '../lib/api'
import { useProfiles } from './useProfiles'

function byCreatedAtAsc(a: Board, b: Board) {
  return a.createdAt - b.createdAt
}

export function useBoards() {
  const { activeProfileId } = useProfiles()
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)

  // Profil değişince (ör. "kim izliyor" ekranından başka birine geçilince) bu profilin
  // kendi board listesi yeniden çekilsin — her profilin verisi ayrı.
  useEffect(() => {
    if (!activeProfileId) return
    setLoading(true)
    api
      .getBoards()
      .then((data) => setBoards(data.sort(byCreatedAtAsc)))
      .finally(() => setLoading(false))
  }, [activeProfileId])

  async function createBoard(data: Omit<Board, 'id'>): Promise<string> {
    const { id } = await api.createBoard(data)
    setBoards((prev) => [...prev, { ...data, id }].sort(byCreatedAtAsc))
    return id
  }

  async function deleteBoard(id: string) {
    await api.deleteBoard(id)
    setBoards((prev) => prev.filter((b) => b.id !== id))
  }

  return { boards, loading, createBoard, deleteBoard }
}
