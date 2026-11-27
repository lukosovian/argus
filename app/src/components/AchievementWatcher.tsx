import { useEffect, useRef, useState } from 'react'
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
import { readStore, writeStore } from '../lib/profileStore'

// Başarımlar (v1.23.4, seviyeli v1.23.5): veri değişince rozetleri yeniden hesaplar; yeni kazanılan seviye için zile
// bildirim ve ekranda kısa bir kutlama. İlk açılışta zaten kazanılmış olanlar sessizce kaydedilir (geriye dönük yağmur olmasın).
const listKey = (pid: string) => `argus_basarim_liste_${pid}`

// Profil deposu 'basarimlar': görülen "id:seviye" listesi, kazanılma tarihleri, rozet listesinin imzası
export const BASARIM_STORE = 'basarimlar'
export const BASARIM_EVT = 'argus-basarim-degisti'
export interface BasarimData {
  seen?: string[]
  dates?: Record<string, string>
  ids?: string
}
// Eskiden bu bilgisayarın localStorage'ındaydı; ilk açılışta depoya katılır
export function legacyBasarim(pid: string): BasarimData | null {
  try {
    const raw = localStorage.getItem(unlockedKey2(pid))
    const d = localStorage.getItem(unlockedDatesKey(pid))
    const ids = localStorage.getItem(listKey(pid))
    if (raw === null && d === null) return null
    return { seen: raw ? JSON.parse(raw) : undefined, dates: d ? JSON.parse(d) : undefined, ids: ids ?? undefined }
  } catch {
    return null
  }
}
export function dropLegacyBasarim(pid: string) {
  try {
    for (const k of [unlockedKey2(pid), unlockedDatesKey(pid), listKey(pid)]) localStorage.removeItem(k)
  } catch {
    /* önemsiz */
  }
}
// Birleştirme: görülenlerin birleşimi, aynı seviyenin iki tarihi varsa en erkeni
export function mergeBasarim(a: BasarimData, b: BasarimData): BasarimData {
  const seen = a.seen || b.seen ? [...new Set([...(a.seen ?? []), ...(b.seen ?? [])])] : undefined
  const dates: Record<string, string> = { ...(a.dates ?? {}) }
  for (const [k, v] of Object.entries(b.dates ?? {})) if (!dates[k] || v < dates[k]) dates[k] = v
  return { seen, dates, ids: a.ids ?? b.ids }
}

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
  // Okuma-yazma sırayla yapılsın (veri peş peşe değişince iki kez "yeni rozet" duyurulmasın)
  const chain = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    if (!board || loading || !watched || !rows.length || universesDone === null) return
    const list = computeAchievements(board, rows, watched, { universesDone })
    chain.current = chain.current.then(() => check(list)).catch(() => {})
  }, [board, rows, watched, loading, universesDone])

  async function check(list: ReturnType<typeof computeAchievements>) {
    const keys = list.flatMap((a) => Array.from({ length: a.level }, (_, i) => `${a.id}:${i + 1}`))
    // Kazanılanlar ve tarihleri profil deposunda (H7, v1.27); depo okunamazsa hiçbir şey yapılmaz (boşuna kutlama olmasın)
    let stored: BasarimData
    try {
      stored = await readStore<BasarimData>(profileId, BASARIM_STORE)
    } catch {
      return
    }
    const legacy = legacyBasarim(profileId)
    const cur = legacy ? mergeBasarim(stored, legacy) : stored
    let seen: string[] | null = Array.isArray(cur.seen) ? cur.seen : null
    const dates: Record<string, string> = { ...(cur.dates ?? {}) }
    // rozet listesi büyüdüyse (v1.23.6: 14 → 29) yeni rozetlerin zaten kazanılmış seviyeleri sessizce kaydedilsin
    const ids = list.map((a) => a.id).sort().join(',')
    if (cur.ids !== ids && seen) {
      const s0 = seen
      seen = [...s0, ...keys.filter((k) => !list.some((a) => s0.some((x) => x.startsWith(a.id + ':')) && k.startsWith(a.id + ':')))]
    }
    const fresh = seen ? keys.filter((k) => !seen!.includes(k)) : []
    for (const k of fresh) dates[k] = todayIso()
    const next: BasarimData = { seen: [...new Set([...(seen ?? []), ...keys])], dates, ids }
    if (JSON.stringify(next) !== JSON.stringify(stored)) {
      try {
        await writeStore(profileId, BASARIM_STORE, next)
      } catch {
        return
      }
      dropLegacyBasarim(profileId)
      window.dispatchEvent(new Event(BASARIM_EVT))
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
  }
  return null
}
