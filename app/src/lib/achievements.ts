import type { Board, Row, WatchedMap } from '../types'
import { ratingAverage } from '../types'
import { resolveRole, watchedStatusIds } from './roles'
import { entryEnd, toEntries } from './dateRange'
import { tt } from './i18n'
import type { IconName } from '../components/Icon'

// Başarımlar (v1.23.4; v1.23.5 seviyeli madalyalar; v1.23.6'da 29 rozet, gruplar ve her rozetin ilgili yapımları): arşivden
// ve bölüm tiklerinden hesaplanan kalıcı rozetler. Kazanılan seviyeler profil başına hatırlanır; yenisinde zile bildirim düşer.

export type Tier = 0 | 1 | 2 | 3 // 0 kilitli, 1 bronz, 2 gümüş, 3 altın

export type AchievementGroup = 'izleme' | 'tur' | 'kesif' | 'puan' | 'aliskanlik'

export interface Achievement {
  id: string
  group: AchievementGroup
  icon: IconName
  title: string
  // {0} yerine sıradaki seviyenin hedefi gelir (ör. "{0} yapım izle")
  hint: string
  // rozetin ne için verildiği (bitmiş rozette de görünsün diye ayrı)
  about: string
  colors: [string, string]
  value: number
  tiers: [number, number, number]
  level: Tier
  // sıradaki seviyenin hedefi (altındaysa son hedef)
  goal: number
  // rozete tıklayınca gösterilen ilgili yapımlar (en son izlenen başta) ve varsa kısa notları ("2019 · 7 bölüm")
  related: { row: Row; note?: string }[]
}

export const GROUP_NAMES = (): Record<AchievementGroup, string> => ({
  izleme: tt('İzleme'),
  tur: tt('Türler'),
  kesif: tt('Keşif'),
  puan: tt('Puanlar'),
  aliskanlik: tt('Alışkanlıklar'),
})

export const TIER_NAMES = () => [tt('Kilitli'), tt('Bronz'), tt('Gümüş'), tt('Altın')]
export const TIER_COLORS: [string, string][] = [
  ['#3f3f46', '#71717a'],
  ['#8a4b24', '#f0b07a'],
  ['#6b7280', '#f1f5f9'],
  ['#a16207', '#fde68a'],
]

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function computeAchievements(board: Board, rows: Row[], watched: WatchedMap, extra: { universesDone: number } = { universesDone: 0 }): Achievement[] {
  const durum = resolveRole(board, 'durum')
  const doneIds = watchedStatusIds(board)
  const kategori = resolveRole(board, 'kategori')
  const tur = resolveRole(board, 'tur')
  const ulke = resolveRole(board, 'ulke')
  const vizyon = resolveRole(board, 'vizyon')
  const puan = resolveRole(board, 'puan')
  const sure = resolveRole(board, 'sure')
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const isSeries = (r: Row) => /dizi|series|tv/i.test(kategori?.options?.find((o) => o.id === r.values[kategori.id])?.label ?? '')
  const isDone = (r: Row) => Boolean(durum && doneIds.has(r.values[durum.id] as string))
  const done = rows.filter(isDone)
  const labelsOf = (r: Row, p: typeof tur) => (p ? (Array.isArray(r.values[p.id]) ? (r.values[p.id] as string[]) : typeof r.values[p.id] === 'string' ? [r.values[p.id] as string] : []) : [])
  const optLabel = (p: typeof tur, id: string) => p?.options?.find((o) => o.id === id)?.label ?? ''
  const dates = (r: Row) => (dateProp ? toEntries(r.values[dateProp.id]).map(entryEnd).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [])
  const lastDate = (r: Row) => {
    const ep = Object.values(watched[r.id] ?? {}).flat().map((d) => d.slice(0, 10))
    return [...dates(r), ...ep].sort().pop() ?? ''
  }
  const year = (r: Row) => (vizyon ? String(r.values[vizyon.id] ?? '').slice(0, 4) : '')
  const score = (r: Row) => (puan ? ratingAverage(r.values[puan.id], puan) : null)
  const byRecent = (list: Row[]) => [...list].sort((a, b) => lastDate(b).localeCompare(lastDate(a)))
  const rel = (list: Row[], note?: (r: Row) => string | undefined) => byRecent(list).map((row) => ({ row, note: note?.(row) }))
  // her gruptan bir temsilci (ör. her ülkeden en son izlenen) — "Dünya Turu" gibi rozetlerde
  const onePer = (list: Row[], keys: (r: Row) => string[]) => {
    const seen = new Map<string, Row>()
    for (const r of byRecent(list)) for (const k of keys(r)) if (k && !seen.has(k)) seen.set(k, r)
    return [...seen.entries()].map(([k, row]) => ({ row, note: k }))
  }
  const genreRows = (re: RegExp) => {
    const ids = new Set((tur?.options ?? []).filter((o) => re.test(o.label)).map((o) => o.id))
    return done.filter((r) => labelsOf(r, tur).some((g) => ids.has(g)))
  }

  const movies = done.filter((r) => !isSeries(r))
  const series = done.filter(isSeries)
  const decadeOf = (r: Row) => {
    const d = year(r).slice(0, 3)
    return /^(19[2-9]|20[0-2])$/.test(d) ? `${d}0'lar` : ''
  }
  const decadeFilms = movies.filter((r) => /^(19[6-9]|20[0-2])$/.test(year(r).slice(0, 3)))
  const rated = rows.filter((r) => score(r) !== null)
  const tens = rated.filter((r) => (score(r) ?? 0) >= 10)
  const harsh = rated.filter((r) => (score(r) ?? 99) <= 4)
  const rewatch = rows.filter((r) => dates(r).length >= 2)
  const classics = movies.filter((r) => /^\d{4}$/.test(year(r)) && Number(year(r)) < 1980)
  const fresh = done.filter((r) => year(r) && dates(r).some((d) => d.slice(0, 4) === year(r)))
  const local = done.filter((r) => labelsOf(r, ulke).some((id) => /türk|turk/i.test(optLabel(ulke, id))))
  const long = movies.filter((r) => sure && Number(r.values[sure.id] ?? 0) >= 150)

  // bölümler: gün gün
  const perDayEp = new Map<string, number>()
  const perDayRows = new Map<string, Set<string>>()
  const days = new Set<string>()
  const addDay = (d: string, rowId: string) => {
    days.add(d)
    if (!perDayRows.has(d)) perDayRows.set(d, new Set())
    perDayRows.get(d)!.add(rowId)
  }
  for (const r of rows) for (const d of dates(r)) addDay(d, r.id)
  for (const [rowId, m] of Object.entries(watched))
    for (const list of Object.values(m))
      for (const d of list) {
        const k = d.slice(0, 10)
        addDay(k, rowId)
        perDayEp.set(k, (perDayEp.get(k) ?? 0) + 1)
      }
  const byId = new Map(rows.map((r) => [r.id, r]))
  let maxDay = ''
  for (const [d, n] of perDayEp) if (!maxDay || n > (perDayEp.get(maxDay) ?? 0)) maxDay = d
  const maxDayEp = maxDay ? perDayEp.get(maxDay)! : 0
  const totalEp = [...perDayEp.values()].reduce((x, y) => x + y, 0)
  const epRows = rows.filter((r) => watched[r.id] && Object.values(watched[r.id]).some((l) => l.length))
  const epCount = (r: Row) => Object.values(watched[r.id] ?? {}).reduce((s, l) => s + (l.length ? 1 : 0), 0)
  // en uzun üst üste izleme serisi ve o günler
  let best = 0
  let bestEnd = ''
  let run = 0
  let prev = ''
  for (const d of [...days].sort()) {
    const p = new Date(d + 'T12:00:00')
    p.setDate(p.getDate() - 1)
    run = prev === ymd(p) ? run + 1 : 1
    if (run > best) {
      best = run
      bestEnd = d
    }
    prev = d
  }
  const streakRows = () => {
    if (!bestEnd) return []
    const out = new Set<string>()
    const e = new Date(bestEnd + 'T12:00:00')
    for (let i = 0; i < best; i++) {
      const d = new Date(e)
      d.setDate(e.getDate() - i)
      for (const id of perDayRows.get(ymd(d)) ?? []) out.add(id)
    }
    return [...out].map((id) => byId.get(id)).filter((r): r is Row => Boolean(r))
  }
  // yıl ve ay rekorları (bitirme tarihine göre)
  const perYear = new Map<string, Row[]>()
  const perMonth = new Map<string, Row[]>()
  for (const r of done) {
    const d = dates(r).sort().pop()
    if (!d) continue
    perYear.set(d.slice(0, 4), [...(perYear.get(d.slice(0, 4)) ?? []), r])
    perMonth.set(d.slice(0, 7), [...(perMonth.get(d.slice(0, 7)) ?? []), r])
  }
  const top = (m: Map<string, Row[]>) => [...m.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? ['', []]
  const [bestYear, yearRows] = top(perYear)
  const [bestMonth, monthRows] = top(perMonth)

  const A = (
    group: AchievementGroup,
    id: string,
    icon: IconName,
    title: string,
    hint: string,
    about: string,
    c: [string, string],
    value: number,
    tiers: [number, number, number],
    related: { row: Row; note?: string }[],
  ): Achievement => {
    const level = tiers.filter((t) => value >= t).length as Tier
    return { id, group, icon, title, hint, about, colors: c, value, tiers, level, goal: tiers[Math.min(level, 2)], related }
  }
  const scoreNote = (r: Row) => (score(r) !== null ? String(score(r)).replace('.', ',') : undefined)
  return [
    // izleme
    A('izleme', 'izleyici', 'play', tt('Sinefil'), tt('{0} yapım izle'), tt('İzlendi olarak işaretlediğin bütün yapımlar.'), ['#1e3a8a', '#3b82f6'], done.length, [10, 100, 1000], rel(done)),
    A('izleme', 'film', 'clapper', tt('Film Kurdu'), tt('{0} film izle'), tt('İzlediğin filmler.'), ['#831843', '#f472b6'], movies.length, [50, 200, 500], rel(movies)),
    A('izleme', 'dizici', 'tv', tt('Seri Katili'), tt('{0} dizi bitir'), tt('Sonuna kadar izlediğin diziler.'), ['#7f1d1d', '#ef4444'], series.length, [10, 25, 50], rel(series)),
    A('izleme', 'bolum', 'film', tt('Bölüm Avcısı'), tt('{0} bölüm işaretle'), tt('Bölüm bölüm işaretlediğin diziler.'), ['#312e81', '#818cf8'], totalEp, [100, 500, 1500], rel(epRows, (r) => tt('{0} bölüm', epCount(r)))),
    A('izleme', 'tekrar', 'repeat', tt('Tekrarcı'), tt('{0} yapımı yeniden izle'), tt('Birden fazla kez izlediğin yapımlar.'), ['#155e75', '#22d3ee'], rewatch.length, [3, 10, 25], rel(rewatch, (r) => tt('{0} kez', dates(r).length))),
    A('izleme', 'uzun', 'clock', tt('Uzun Soluklu'), tt('2,5 saati aşan {0} film izle'), tt('150 dakikadan uzun filmler.'), ['#3b0764', '#c084fc'], long.length, [5, 15, 40], rel(long, (r) => (sure ? `${r.values[sure.id]} dk` : undefined))),
    A('izleme', 'arsiv', 'table', tt('Arşivci'), tt('Arşivine {0} yapım ekle'), tt('Arşivindeki bütün kayıtlar.'), ['#334155', '#94a3b8'], rows.length, [100, 500, 1000], rel(rows)),
    // türler
    A('tur', 'tur', 'sparkle', tt('Her Telden'), tt('{0} farklı türden yapım'), tt('İzlediğin her türden bir örnek.'), ['#134e4a', '#2dd4bf'], new Set(done.flatMap((r) => labelsOf(r, tur))).size, [6, 10, 15], onePer(done, (r) => labelsOf(r, tur).map((id) => optLabel(tur, id)))),
    A('tur', 'korkusuz', 'moon', tt('Korkusuz'), tt('{0} korku yapımı izle'), tt('İzlediğin korku yapımları.'), ['#14532d', '#4ade80'], genreRows(/korku|horror/i).length, [10, 25, 50], rel(genreRows(/korku|horror/i))),
    A('tur', 'komedi', 'party', tt('Gülme Krizi'), tt('{0} komedi izle'), tt('İzlediğin komediler.'), ['#854d0e', '#facc15'], genreRows(/komedi|comedy/i).length, [10, 30, 75], rel(genreRows(/komedi|comedy/i))),
    A('tur', 'bilimkurgu', 'planet', tt('Uzay Yolcusu'), tt('{0} bilim kurgu izle'), tt('İzlediğin bilim kurgu yapımları.'), ['#1e1b4b', '#6366f1'], genreRows(/bilim|sci/i).length, [10, 25, 50], rel(genreRows(/bilim|sci/i))),
    A('tur', 'animasyon', 'sun', tt('Çizgi Kalpli'), tt('{0} animasyon izle'), tt('İzlediğin animasyonlar.'), ['#9a3412', '#fb923c'], genreRows(/animasyon|animation/i).length, [10, 25, 50], rel(genreRows(/animasyon|animation/i))),
    A('tur', 'suc', 'search', tt('Dedektif'), tt('{0} suç ya da gizem yapımı izle'), tt('İzlediğin suç ve gizem yapımları.'), ['#18181b', '#a1a1aa'], genreRows(/suç|gizem|crime|mystery/i).length, [10, 30, 60], rel(genreRows(/suç|gizem|crime|mystery/i))),
    A('tur', 'aksiyon', 'flame', tt('Adrenalin'), tt('{0} aksiyon izle'), tt('İzlediğin aksiyon yapımları.'), ['#7c2d12', '#f97316'], genreRows(/aksiyon|action/i).length, [10, 30, 75], rel(genreRows(/aksiyon|action/i))),
    A('tur', 'romantik', 'star', tt('Romantik'), tt('{0} romantik yapım izle'), tt('İzlediğin romantik yapımlar.'), ['#881337', '#fb7185'], genreRows(/romant|romance/i).length, [5, 15, 40], rel(genreRows(/romant|romance/i))),
    A('tur', 'belgesel', 'bulb', tt('Meraklı'), tt('{0} belgesel izle'), tt('İzlediğin belgeseller.'), ['#14532d', '#a3e635'], genreRows(/belgesel|documentary/i).length, [3, 10, 25], rel(genreRows(/belgesel|documentary/i))),
    // keşif
    A('kesif', 'dunya', 'globe', tt('Dünya Turu'), tt('{0} farklı ülkeden yapım'), tt('Her ülkeden en son izlediğin yapım.'), ['#0c4a6e', '#38bdf8'], new Set(done.flatMap((r) => labelsOf(r, ulke))).size, [5, 10, 20], onePer(done, (r) => labelsOf(r, ulke).map((id) => optLabel(ulke, id)))),
    A('kesif', 'yerli', 'pin', tt('Yerli Malı'), tt('{0} Türk yapımı izle'), tt('İzlediğin Türk yapımları.'), ['#991b1b', '#f87171'], local.length, [5, 20, 50], rel(local)),
    A('kesif', 'zaman', 'clock', tt('Zaman Yolcusu'), tt("60'lardan bugüne {0} farklı on yıldan film"), tt('Her on yıldan en son izlediğin film.'), ['#78350f', '#f59e0b'], new Set(decadeFilms.map((r) => year(r).slice(0, 3))).size, [3, 5, 7], onePer(decadeFilms, (r) => [decadeOf(r)])),
    A('kesif', 'klasik', 'film', tt('Klasikçi'), tt("1980'den eski {0} film izle"), tt("1980'den önce çıkmış filmler."), ['#44403c', '#d6d3d1'], classics.length, [3, 10, 25], rel(classics, year)),
    A('kesif', 'vizyon', 'calendar', tt('Vizyon Avcısı'), tt('Çıktığı yıl {0} yapım izle'), tt('Çıktığı yıl içinde izlediğin yapımlar.'), ['#0e7490', '#67e8f9'], fresh.length, [5, 20, 50], rel(fresh, year)),
    A('kesif', 'evren', 'planet', tt('Evren Fatihi'), tt('{0} evrenin hepsini izle'), tt('Evrenler sayfasında bütün ana yapımlarını izlediğin evrenler.'), ['#4c1d95', '#a78bfa'], extra.universesDone, [1, 3, 5], []),
    // puanlar
    A('puan', 'elestirmen', 'pencil', tt('Eleştirmen'), tt('{0} yapıma puan ver'), tt('Puan verdiğin yapımlar.'), ['#3f3f46', '#e4e4e7'], rated.length, [25, 100, 300], rel(rated, scoreNote)),
    A('puan', 'comert', 'star', tt('Cömert'), tt('{0} kez 10 puan ver'), tt('10 puan verdiğin yapımlar.'), ['#713f12', '#fde047'], tens.length, [5, 20, 50], rel(tens, scoreNote)),
    A('puan', 'sert', 'bell', tt('Acımasız'), tt('{0} yapıma 4 ya da altı ver'), tt('4 ve altında puan verdiğin yapımlar.'), ['#450a0a', '#dc2626'], harsh.length, [3, 10, 25], rel(harsh, scoreNote)),
    // alışkanlıklar
    A('aliskanlik', 'maraton', 'flame', tt('Maratoncu'), tt('Bir günde {0} bölüm'), maxDay ? tt('En çok bölüm izlediğin gün: {0}, {1} bölüm.', maxDay.split('-').reverse().join('.'), maxDayEp) : tt('Bir günde izlediğin bölüm rekoru.'), ['#065f46', '#34d399'], maxDayEp, [6, 10, 15], rel([...(perDayRows.get(maxDay) ?? [])].map((id) => byId.get(id)).filter((r): r is Row => Boolean(r) && Boolean(watched[r!.id])))),
    A('aliskanlik', 'sadik', 'calendar', tt('Sadık'), tt('{0} gün üst üste izle'), best ? tt('En uzun serin {0} gün, {1} tarihinde bitti.', best, bestEnd.split('-').reverse().join('.')) : tt('Üst üste izlediğin gün rekoru.'), ['#1e293b', '#94a3b8'], best, [7, 14, 30], rel(streakRows())),
    A('aliskanlik', 'yil', 'trophy', tt('Yılın İzleyicisi'), tt('Bir yılda {0} yapım bitir'), bestYear ? tt('En iyi yılın {0}: {1} yapım.', bestYear, yearRows.length) : tt('Bir yılda bitirdiğin yapım rekoru.'), ['#78350f', '#fbbf24'], yearRows.length, [50, 100, 200], rel(yearRows)),
    A('aliskanlik', 'ay', 'sparkle', tt('Ayın Yıldızı'), tt('Bir ayda {0} yapım bitir'), bestMonth ? tt('En iyi ayın {0}: {1} yapım.', bestMonth.split('-').reverse().join('.'), monthRows.length) : tt('Bir ayda bitirdiğin yapım rekoru.'), ['#701a75', '#e879f9'], monthRows.length, [10, 20, 35], rel(monthRows)),
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
