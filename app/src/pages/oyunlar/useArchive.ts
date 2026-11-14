import { useHomeSettings } from '../../hooks/useHomeSettings'
import { useBoard } from '../../hooks/useBoard'
import { useRows } from '../../hooks/useRows'
import { useGamePool } from '../../lib/games'

// Oyunların ortak verisi: seçili arşiv, kayıtları ve oyun havuzu
export function useArchive() {
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const pool = useGamePool(board, rows)
  return { board, rows, loading: loading || !board, pool }
}
