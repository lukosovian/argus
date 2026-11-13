import type { Board, Row, WatchedMap } from '../types'
import { ratingAverage } from '../types'
import { resolveRole, resolveStatusOption } from './roles'
import { entryEnd, toEntries } from './dateRange'
import { tt } from './i18n'
import type { IconName } from '../components/Icon'

// Başarımlar (v1.23.4; v1.23.5'te bronz/gümüş/altın seviyeli, emojisiz madalyalar): arşivden ve bölüm tiklerinden
// hesaplanan kalıcı rozetler. Kazanılan seviyeler profil başına hatırlanır; yenisinde zile bildirim düşer (bkz. AchievementWatcher).

export type Tier = 0 | 1 | 2 | 3 // 0 kilitli, 1 bronz, 2 gümüş, 3 altın

export interface Achievement {
  id: string
  icon: IconName
  title: string
  // {0} yerine sıradaki seviyenin hedefi gelir (ör. "{0} yapım izle")
  hint: string
  colors: [string, string]
  value: number
  tiers: [number, number, number]
  level: Tier
  // sıradaki seviyenin hedefi (altındaysa son hedef)
  goal: number
}

export const TIER_NAMES = () => [tt('Kilitli'), tt('Bronz'), tt('Gümüş'), tt('Altın')]
export const TIER_COLORS: [string, string][] = [
  ['#3f3f46', '#71717a'],
  ['#8a4b24', '#f0b07a'],
  ['#6b7280', '#f1f5f9'],
  ['#a16207', '#fde68a'],
]

export function computeAchievements(board: Board, rows: Row[], watched: WatchedMap, extra: { universesDone: number } = { universesDone: 0 }): Achievement[] {
  const durum = resolveRole(board, 'durum')
  const izlendi = resolveStatusOption(board, 'izlendi')
  const kategori = resolveRole(board, 'kategori')
  const tur = resolveRole(board, 'tur')
  const ulke = resolveRole(board, 'ulke')
  const vizyon = resolveRole(board, 'vizyon')
  const puan = resolveRole(board, 'puan')
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const isSeries = (r: Row) => /dizi|series|tv/i.test(kategori?.options?.find((o) => o.id === r.values[kategori.id])?.label ?? '')
  const done = rows.filter((r) => durum && izlendi && r.values[durum.id] === izlendi)
  const labelsOf = (r: Row, p: typeof tur) => (p ? (Array.isArray(r.values[p.id]) ? (r.values[p.id] as string[]) : typeof r.values[p.id] === 'string' ? [r.values[p.id] as string] : []) : [])
  const genres = new Set(done.flatMap((r) => labelsOf(r, tur)))
  const countries = new Set(done.flatMap((r) => labelsOf(r, ulke)))
  const decades = new Set(done.filter((r) => !isSeries(r) && vizyon).map((r) => String(r.values[vizyon!.id] ?? '').slice(0, 3)).filter((d) => /^(19[6-9]|20[0-2])$/.test(d)))
  const scores = rows.map((r) => (puan ? ratingAverage(r.values[puan.id], puan) : null)).filter((n): n is number => n !== null)
  const horrorIds = new Set((tur?.options ?? []).filter((o) => /korku|horror/i.test(o.label)).map((o) => o.id))
  const horror = done.filter((r) => labelsOf(r, tur).some((g) => horrorIds.has(g))).length
  const rewatch = rows.filter((r) => dateProp && toEntries(r.values[dateProp.id]).length >= 2).length
  // günler: kayıt tarihleri + bölüm tarihleri
  const perDayEp = new Map<string, number>()
  const days = new Set<string>()
  for (const r of rows) if (dateProp) for (const d of toEntries(r.values[dateProp.id]).map(entryEnd)) if (/^\d{4}-\d{2}-\d{2}$/.test(d)) days.add(d)
  for (const m of Object.values(watched))
    for (const list of Object.values(m))
      for (const d of list) {
        const k = d.slice(0, 10)
        days.add(k)
        perDayEp.set(k, (perDayEp.get(k) ?? 0) + 1)
      }
  const maxDayEp = Math.max(0, ...perDayEp.values())
  const totalEp = [...perDayEp.values()].reduce((x, y) => x + y, 0)
  let best = 0
  let run = 0
  let prev = ''
  for (const d of [...days].sort()) {
    const p = new Date(d + 'T12:00:00')
    p.setDate(p.getDate() - 1)
    const y = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`
    run = prev === y ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  const A = (id: string, icon: IconName, title: string, hint: string, c: [string, string], value: number, tiers: [number, number, number]): Achievement => {
    const level = (tiers.filter((t) => value >= t).length as Tier)
    return { id, icon, title, hint, colors: c, value, tiers, level, goal: tiers[Math.min(level, 2)] }
  }
  const movies = done.filter((r) => !isSeries(r)).length
  return [
    A('izleyici', 'play', tt('Sinefil'), tt('{0} yapım izle'), ['#1e3a8a', '#3b82f6'], done.length, [10, 100, 1000]),
    A('film', 'clapper', tt('Film Kurdu'), tt('{0} film izle'), ['#831843', '#f472b6'], movies, [50, 200, 500]),
    A('dizici', 'tv', tt('Seri Katili'), tt('{0} dizi bitir'), ['#7f1d1d', '#ef4444'], done.filter(isSeries).length, [10, 25, 50]),
    A('bolum', 'film', tt('Bölüm Avcısı'), tt('{0} bölüm işaretle'), ['#312e81', '#818cf8'], totalEp, [100, 500, 1500]),
    A('maraton', 'flame', tt('Maratoncu'), tt('Bir günde {0} bölüm'), ['#065f46', '#34d399'], maxDayEp, [6, 10, 15]),
    A('sadik', 'calendar', tt('Sadık'), tt('{0} gün üst üste izle'), ['#1e293b', '#94a3b8'], best, [7, 14, 30]),
    A('zaman', 'clock', tt('Zaman Yolcusu'), tt("60'lardan bugüne {0} farklı on yıldan film"), ['#78350f', '#f59e0b'], decades.size, [3, 5, 7]),
    A('dunya', 'globe', tt('Dünya Turu'), tt('{0} farklı ülkeden yapım'), ['#0c4a6e', '#38bdf8'], countries.size, [5, 10, 20]),
    A('tur', 'sparkle', tt('Her Telden'), tt('{0} farklı türden yapım'), ['#134e4a', '#2dd4bf'], genres.size, [6, 10, 15]),
    A('evren', 'planet', tt('Evren Fatihi'), tt('{0} evrenin hepsini izle'), ['#4c1d95', '#a78bfa'], extra.universesDone, [1, 3, 5]),
    A('comert', 'star', tt('Cömert'), tt('{0} kez 10 puan ver'), ['#713f12', '#fde047'], scores.filter((s) => s >= 10).length, [5, 20, 50]),
    A('elestirmen', 'pencil', tt('Eleştirmen'), tt('{0} yapıma puan ver'), ['#3f3f46', '#e4e4e7'], scores.length, [25, 100, 300]),
    A('korkusuz', 'moon', tt('Korkusuz'), tt('{0} korku yapımı izle'), ['#14532d', '#4ade80'], horror, [10, 25, 50]),
    A('tekrar', 'repeat', tt('Tekrarcı'), tt('{0} yapımı yeniden izle'), ['#155e75', '#22d3ee'], rewatch, [3, 10, 25]),
  ]
}

export const unlockedKey = (profileId: string) => `argus_basarim_${profileId}`
// Seviyeli sürüm (v1.23.5): "id:seviye" listesi ve kazanılma tarihleri { "id:seviye": "2026-11-13" }
export const unlockedKey2 = (profileId: string) => `argus_basarim2_${profileId}`
export const unlockedDatesKey = (profileId: string) => `argus_basarim_tarih_${profileId}`

// Bitirilen evrenler: çıkmış bütün (yan olmayan) yapımları izlenmiş evren sayısı
export function countDone(universes: { items: { released: boolean; extra: boolean; watched: boolean }[] }[]): number {
  return universes.filter((u) => {
    const main = u.items.filter((i) => i.released && !i.extra)
    return main.length > 0 && main.every((i) => i.watched)
  }).length
}
