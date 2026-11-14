import { useEffect, useMemo, useState } from 'react'
import type { Board, Row, WatchedMap } from '../types'
import { ratingAverage, titleText } from '../types'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useProfiles } from '../hooks/useProfiles'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { api } from './api'
import { resolveRole, watchedStatusIds } from './roles'
import { entryEnd, toEntries } from './dateRange'
import { onDataChanged } from './dataEvents'
import { tt } from './i18n'

// Profilin özet sayıları (v1.23.4 Ekstralar): yeni profil menüsü, canlı duygu avatarı, çerçeveler ve yıllık hedef
// aynı hesabı kullanır. Sadece bu özelliklerden biri açıksa veri çekilir.

export interface ProfileStats {
  monthFilms: number
  monthEpisodes: number
  streak: number
  yearDone: number
  // bu yıl ay ay bitirilen (yıllık hedef halkası için)
  yearMonths: number[]
  watchedCount: number
  lastTitle: string
  lastImage: string
  mood: { avatar: number; reason: string }
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function computeStats(board: Board, rows: Row[], watched: WatchedMap): ProfileStats {
  const now = new Date()
  const today = ymd(now)
  const month = today.slice(0, 7)
  const year = today.slice(0, 4)
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const durum = resolveRole(board, 'durum')
  const kategori = resolveRole(board, 'kategori')
  const tur = resolveRole(board, 'tur')
  const puan = resolveRole(board, 'puan')
  const banner = resolveRole(board, 'banner')
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const done = watchedStatusIds(board)
  const isSeries = (r: Row) => /dizi|series|tv/i.test(kategori?.options?.find((o) => o.id === r.values[kategori.id])?.label ?? '')

  const days = new Set<string>()
  let monthFilms = 0
  let yearDone = 0
  const yearMonths = Array(12).fill(0) as number[]
  let last: { row: Row; date: string } | null = null
  for (const r of rows) {
    const dates = dateProp ? toEntries(r.values[dateProp.id]).map(entryEnd).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : []
    for (const d of dates) days.add(d)
    if (!isSeries(r) && dates.some((d) => d.startsWith(month))) monthFilms++
    const inYear = dates.filter((d) => d.startsWith(year)).sort()
    if (inYear.length) {
      yearDone++
      yearMonths[Number(inYear[inYear.length - 1].slice(5, 7)) - 1]++
    }
    const mx = dates.sort().at(-1)
    if (mx && (!last || mx > last.date)) last = { row: r, date: mx }
  }
  let monthEpisodes = 0
  let todayEpisodes = 0
  for (const [rowId, map] of Object.entries(watched)) {
    for (const list of Object.values(map)) {
      for (const d of list) {
        if (!d) continue
        days.add(d.slice(0, 10))
        if (d.startsWith(month)) monthEpisodes++
        if (d.startsWith(today)) todayEpisodes++
        if (!last || d.slice(0, 10) > last.date) {
          const row = rows.find((x) => x.id === rowId)
          if (row) last = { row, date: d.slice(0, 10) }
        }
      }
    }
  }
  // Üst üste gün: bugünden (bugün yoksa dünden) geriye
  let streak = 0
  const c = new Date(now)
  if (!days.has(ymd(c))) c.setDate(c.getDate() - 1)
  while (days.has(ymd(c))) {
    streak++
    c.setDate(c.getDate() - 1)
  }
  const watchedCount = durum ? rows.filter((r) => done.has(r.values[durum.id] as string)).length : 0

  // Duygu avatarı (ARGUS'un 12 duygu yüzü, /avatars/profil1-12)
  const lastRow = last?.row
  const sinceDays = last ? Math.floor((now.getTime() - new Date(last.date + 'T12:00:00').getTime()) / 864e5) : 999
  const rating = lastRow && puan ? ratingAverage(lastRow.values[puan.id], puan) : null
  const genres = lastRow && tur ? (Array.isArray(lastRow.values[tur.id]) ? (lastRow.values[tur.id] as string[]) : []).map((id) => (tur.options?.find((o) => o.id === id)?.label ?? '').toLocaleLowerCase('tr')) : []
  const has = (...k: string[]) => genres.some((g) => k.some((x) => g.includes(x)))
  const h = now.getHours()
  let mood: ProfileStats['mood'] = { avatar: 11, reason: tt('Film gecesi! 🍿') }
  if (h >= 1 && h < 6) mood = { avatar: 12, reason: tt('Saat {0}, uyku vakti 😴', `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`) }
  else if (sinceDays >= 14 && sinceDays < 999) mood = { avatar: 7, reason: tt('{0} gündür bir şey izlemedin 😐', sinceDays) }
  else if (todayEpisodes >= 3) mood = { avatar: 3, reason: tt('Bugün {0} bölüm ☕', todayEpisodes) }
  else if (sinceDays <= 3 && rating !== null && rating <= 4) mood = { avatar: 6, reason: tt('{0} puan mı?! 😤', rating.toFixed(1)) }
  else if (sinceDays <= 3 && rating !== null && rating >= 9.5) mood = { avatar: 4, reason: tt('{0} puan! ✨', rating.toFixed(1)) }
  else if (sinceDays <= 3 && has('korku', 'horror')) mood = { avatar: 1, reason: tt('Korku filmi bitti 😱') }
  else if (sinceDays <= 3 && has('komedi', 'comedy')) mood = { avatar: 5, reason: tt('Komedi iyi geldi 😂') }
  else if (sinceDays <= 3 && has('gerilim', 'thriller', 'suç', 'crime')) mood = { avatar: 9, reason: tt('Gerilim dorukta 😬') }
  else if (sinceDays <= 3 && has('romant')) mood = { avatar: 10, reason: tt('Romantik bir akşam 💕') }
  else if (sinceDays <= 3 && has('dram', 'drama')) mood = { avatar: 2, reason: tt('Ağlattı… 😢') }
  else if (sinceDays <= 3 && has('bilim', 'science', 'gizem', 'mystery')) mood = { avatar: 8, reason: tt('Kafam karıştı 🤔') }

  return {
    monthFilms,
    monthEpisodes,
    streak,
    yearDone,
    yearMonths,
    watchedCount,
    lastTitle: lastRow && titleProp ? titleText(titleProp, lastRow.values[titleProp.id]) : '',
    lastImage: lastRow && banner ? ((lastRow.values[banner.id] as string) ?? '') : '',
    mood,
  }
}

export function useProfileStats(wanted: boolean): ProfileStats | null {
  const { settings } = useHomeSettings()
  // Profil seçilmeden (Kim izliyor? ekranı) hiçbir şey çekilmesin — api profil yokken hemen hata fırlatıyor
  const { activeProfileId } = useProfiles()
  const enabled = wanted && Boolean(activeProfileId)
  const boardId = enabled ? (settings.boardId ?? undefined) : undefined
  const { board } = useBoard(boardId)
  const { rows } = useRows(boardId)
  const [watched, setWatched] = useState<WatchedMap>({})
  useEffect(() => {
    if (!enabled) return
    const load = () => {
      try {
        api.getWatched().then(setWatched).catch(() => {})
      } catch {
        /* profil yoksa boş kalsın */
      }
    }
    load()
    return onDataChanged(() => load())
  }, [enabled, activeProfileId])
  // saat değişince (duygu avatarı) arada bir yenile
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => setTick((x) => x + 1), 10 * 60 * 1000)
    return () => clearInterval(t)
  }, [enabled])
  return useMemo(() => (enabled && board ? computeStats(board, rows, watched) : null), [enabled, board, rows, watched, tick])
}

// İzleme sayısına göre çerçeve (Ekstralar › Kazanılan çerçeveler)
export function frameFor(count: number): { id: string; label: string; style: React.CSSProperties } | null {
  if (count >= 500) return { id: 'neon', label: tt('Neon çerçeve'), style: { background: 'conic-gradient(from var(--argus-cerceve,0deg),#00c0fa,#8b5cf6,#f472b6,#00c0fa)', animation: 'argus-cerceve 4s linear infinite' } }
  if (count >= 300) return { id: 'altin', label: tt('Altın çerçeve'), style: { background: 'linear-gradient(135deg,#ca8a04,#fef08a,#a16207)', boxShadow: '0 0 14px rgba(250,204,21,.45)' } }
  if (count >= 150) return { id: 'gumus', label: tt('Gümüş çerçeve'), style: { background: 'linear-gradient(135deg,#9ca3af,#f9fafb,#6b7280)' } }
  if (count >= 50) return { id: 'bronz', label: tt('Bronz çerçeve'), style: { background: 'linear-gradient(135deg,#b45309,#fcd34d,#92400e)' } }
  return null
}
