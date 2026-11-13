import { useEffect, useState } from 'react'
import type { WatchedMap } from '../types'
import { todayIso } from '../types'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { computeAchievements, countDone, TIER_NAMES, unlockedDatesKey, unlockedKey2 } from '../lib/achievements'
import { onDataChanged } from '../lib/dataEvents'
import { tt } from '../lib/i18n'

// Başarımlar (v1.23.4, seviyeli v1.23.5): veri değişince rozetleri yeniden hesaplar; yeni kazanılan seviye için zile
// bildirim ve ekranda kısa bir kutlama. İlk açılışta zaten kazanılmış olanlar sessizce kaydedilir (geriye dönük yağmur olmasın).
const listKey = (pid: string) => `argus_basarim_liste_${pid}`

export default function AchievementWatcher({ profileId }: { profileId: string }) {
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const { notify } = useToast()
  const [watched, setWatched] = useState<WatchedMap | null>(null)
  const [universesDone, setUniversesDone] = useState<number | null>(null)
  useEffect(() => {
    const load = () => api.getWatched().then(setWatched).catch(() => {})
    load()
    return onDataChanged(() => load())
  }, [profileId])
  useEffect(() => {
    if (settings.boardId)
      api
        .getEvrenler(settings.boardId)
        .then((d) => setUniversesDone(countDone(d.universes)))
        .catch(() => setUniversesDone(0))
    else setUniversesDone(0)
  }, [settings.boardId])
  useEffect(() => {
    if (!board || loading || !watched || !rows.length || universesDone === null) return
    const list = computeAchievements(board, rows, watched, { universesDone })
    const keys = list.flatMap((a) => Array.from({ length: a.level }, (_, i) => `${a.id}:${i + 1}`))
    let seen: string[] | null = null
    let dates: Record<string, string> = {}
    try {
      const raw = localStorage.getItem(unlockedKey2(profileId))
      seen = raw ? JSON.parse(raw) : null
      // rozet listesi büyüdüyse (v1.23.6: 14 → 29) yeni rozetlerin zaten kazanılmış seviyeleri sessizce kaydedilsin
      const ids = list.map((a) => a.id).sort().join(',')
      if (localStorage.getItem(listKey(profileId)) !== ids) {
        localStorage.setItem(listKey(profileId), ids)
        if (seen) seen = [...seen, ...keys.filter((k) => !list.some((a) => (seen as string[]).some((x) => x.startsWith(a.id + ':')) && k.startsWith(a.id + ':')))]
      }
      dates = JSON.parse(localStorage.getItem(unlockedDatesKey(profileId)) ?? '{}')
    } catch {
      seen = null
    }
    const fresh = seen ? keys.filter((k) => !seen!.includes(k)) : []
    for (const k of fresh) dates[k] = todayIso()
    try {
      localStorage.setItem(unlockedKey2(profileId), JSON.stringify([...new Set([...(seen ?? []), ...keys])]))
      localStorage.setItem(unlockedDatesKey(profileId), JSON.stringify(dates))
    } catch {
      /* önemsiz */
    }
    // aynı rozetin birden çok seviyesi birden geldiyse sadece en yükseği duyurulur
    const best = new Map<string, number>()
    for (const k of fresh) {
      const [id, lv] = k.split(':')
      best.set(id, Math.max(best.get(id) ?? 0, Number(lv)))
    }
    for (const [id, lv] of best) {
      const a = list.find((x) => x.id === id)
      if (!a) continue
      const name = `${a.title} (${TIER_NAMES()[lv]})`
      notify(tt('Yeni başarım: {0}!', name), 'success')
      fetch(`/api/profiles/${profileId}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `basarim:${id}:${lv}`, type: 'achievement', title: tt('Yeni başarım: {0}', name), text: a.hint.replace('{0}', String(a.tiers[lv - 1])), link: '/basarimlar' }),
      }).catch(() => {})
    }
  }, [board, rows, watched, loading, universesDone])
  return null
}
