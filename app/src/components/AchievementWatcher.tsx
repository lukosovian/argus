import { useEffect, useState } from 'react'
import type { WatchedMap } from '../types'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { computeAchievements, unlockedKey } from '../lib/achievements'
import { onDataChanged } from '../lib/dataEvents'
import { tt } from '../lib/i18n'

// Ekstralar › Başarımlar (v1.23.4): veri değişince rozetleri yeniden hesaplar; yeni kazanılan rozet için zile bildirim
// ve ekranda kısa bir kutlama. İlk açılışta zaten kazanılmış olanlar sessizce kaydedilir (geriye dönük yağmur olmasın).
export default function AchievementWatcher({ profileId }: { profileId: string }) {
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const { notify } = useToast()
  const [watched, setWatched] = useState<WatchedMap | null>(null)
  useEffect(() => {
    const load = () => api.getWatched().then(setWatched).catch(() => {})
    load()
    return onDataChanged(() => load())
  }, [profileId])
  useEffect(() => {
    if (!board || loading || !watched || !rows.length) return
    const got = computeAchievements(board, rows, watched).filter((a) => a.value >= a.goal)
    let seen: string[] | null = null
    try {
      const raw = localStorage.getItem(unlockedKey(profileId))
      seen = raw ? JSON.parse(raw) : null
    } catch {
      seen = null
    }
    const ids = got.map((a) => a.id)
    try {
      localStorage.setItem(unlockedKey(profileId), JSON.stringify([...new Set([...(seen ?? []), ...ids])]))
    } catch {
      /* önemsiz */
    }
    if (!seen) return
    for (const a of got.filter((x) => !seen!.includes(x.id))) {
      notify(tt('{0} Yeni başarım: {1}!', a.emoji, a.title), 'success')
      fetch(`/api/profiles/${profileId}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `basarim:${a.id}`, type: 'achievement', title: tt('Yeni başarım: {0}', a.title), text: a.hint, link: '/basarimlar' }),
      }).catch(() => {})
    }
  }, [board, rows, watched, loading])
  return null
}
