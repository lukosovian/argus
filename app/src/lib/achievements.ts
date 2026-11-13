import type { Board, Row, WatchedMap } from '../types'
import { ratingAverage } from '../types'
import { resolveRole, resolveStatusOption } from './roles'
import { entryEnd, toEntries } from './dateRange'
import { tt } from './i18n'

// Başarımlar (v1.23.4, Ayarlar › Ekstralar › Başarımlar): arşivden ve bölüm tiklerinden hesaplanan kalıcı rozetler.
// Kazanılanlar profil başına hatırlanır; yenisi kazanılınca zile bildirim düşer (bkz. Navbar).

export interface Achievement {
  id: string
  emoji: string
  title: string
  hint: string
  colors: [string, string]
  value: number
  goal: number
}

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
  const A = (id: string, emoji: string, title: string, hint: string, c: [string, string], value: number, goal: number): Achievement => ({ id, emoji, title, hint, colors: c, value: Math.min(value, goal), goal })
  return [
    A('ilk10', '🎬', tt('İlk Adım'), tt('10 yapım izle'), ['#1e3a8a', '#3b82f6'], done.length, 10),
    A('ilk100', '🍿', tt('İlk 100'), tt('100 yapım izle'), ['#831843', '#f472b6'], done.length, 100),
    A('efsane', '👑', tt('Efsane'), tt('1000 yapım izle'), ['#422006', '#fbbf24'], done.length, 1000),
    A('maraton', '🏃', tt('Maratoncu'), tt('Bir günde 6 bölüm'), ['#065f46', '#34d399'], maxDayEp, 6),
    A('dizici', '🔪', tt('Seri Katili'), tt('10 dizi bitir'), ['#7f1d1d', '#ef4444'], done.filter(isSeries).length, 10),
    A('zaman', '⏳', tt('Zaman Yolcusu'), tt("60'lardan bugüne her on yıldan bir film"), ['#78350f', '#f59e0b'], decades.size, 7),
    A('dunya', '🌍', tt('Dünya Turu'), tt('10 farklı ülkeden yapım'), ['#0c4a6e', '#38bdf8'], countries.size, 10),
    A('tur', '🎭', tt('Her Telden'), tt('15 farklı türden yapım'), ['#134e4a', '#2dd4bf'], genres.size, 15),
    A('evren', '🪐', tt('Evren Fatihi'), tt('Bir evrenin hepsini izle'), ['#4c1d95', '#a78bfa'], extra.universesDone, 1),
    A('sadik', '📅', tt('Sadık'), tt('30 gün üst üste izle'), ['#1e293b', '#94a3b8'], best, 30),
    A('comert', '💯', tt('Cömert'), tt('20 kez 10 puan ver'), ['#713f12', '#fde047'], scores.filter((s) => s >= 10).length, 20),
    A('elestirmen', '✍️', tt('Eleştirmen'), tt('100 yapıma puan ver'), ['#3f3f46', '#e4e4e7'], scores.length, 100),
    A('korkusuz', '🧟', tt('Korkusuz'), tt('25 korku filmi'), ['#14532d', '#4ade80'], horror, 25),
    A('tekrar', '🔁', tt('Tekrarcı'), tt('10 yapımı yeniden izle'), ['#155e75', '#22d3ee'], rewatch, 10),
  ]
}

export const unlockedKey = (profileId: string) => `argus_basarim_${profileId}`
