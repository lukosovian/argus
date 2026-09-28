import { resolveRole } from './roles'
import { entryEnd, parseEntry, toEntries } from './dateRange'
import { autoShelf, commonTitle } from './shelves'
import { ratingAverage, titleText, type Board, type Row, type WatchedMap } from '../types'

// Flashback (yıllık özet) hesapları — kullanıcının istediği her kutu burada hesaplanıyor: toplam ekran
// süresi (film + dizi), puanlama profili, nostalji radarı, zaman alışkanlıkları, izleyici unvanı,
// maraton/seri tespiti, en çok oyuncular/yönetmenler. Bir yılda izlenenler: İzleme Tarihi'nin (aralıksa
// bitiş günü) o yıla düşenleri ve o yıl işaretlenen bölümler.

export const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
export const TR_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
export const TR_DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

// TMDB'de bölüm süresi bulunamayan diziler için varsayılan (toplamda "yaklaşık" diye belirtilir)
const DEFAULT_EPISODE_MINUTES = 42

export interface FlashbackExtras {
  runtimes: Record<string, number>
  collections: Record<string, { id: number; name: string }>
  mediaTypes: Record<string, 'movie' | 'tv'>
  hours: number[]
  timed: number
}

export interface TitleInfo {
  row: Row
  title: string
  poster: string
  releaseYear: number | null
  isSeries: boolean
  score: number | null
  first: string // o yıl ilk izlendiği gün
  last: string
  episodes: number
}

export interface Badge {
  title: string
  why: string
}

export interface Marathon {
  kind: 'seri' | 'dizi'
  name: string
  count: number
  days: number
  titles: TitleInfo[]
}

export interface Stats {
  order: TitleInfo[]
  films: number
  rewatches: number
  seriesFinished: number
  episodes: number
  filmMinutes: number
  seriesMinutes: number
  seriesEstimated: boolean
  activeDays: number
  longestStreak: { days: number; start: string; end: string }
  months: number[]
  weekdays: number[]
  hours: number[]
  timed: number
  scores: { avg: number | null; count: number; histogram: number[]; top: TitleInfo[]; lowest: TitleInfo | null }
  decades: { label: string; count: number }[]
  newShare: number
  classicShare: number
  oldest: TitleInfo | null
  topGenres: { label: string; count: number }[]
  topCountries: { label: string; count: number }[]
  countryCount: number
  topActors: { label: string; image?: string; count: number }[]
  topDirectors: { label: string; image?: string; count: number }[]
  marathons: Marathon[]
  persona: { title: string; why: string; badges: Badge[] }
}

const dayNum = (d: string) => Math.round(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000)

export function fmtDuration(min: number): string {
  // Önce saate yuvarlanır ki "16 gün 24 saat" gibi bir şey çıkmasın
  const total = Math.round(min / 60)
  const days = Math.floor(total / 24)
  const hours = total % 24
  if (days && hours) return `${days} gün ${hours} saat`
  if (days) return `${days} gün`
  return `${total} saat`
}

const PERSONAS = [
  { re: /bilim|fantas|süper kahraman/i, title: 'Boyut Gezgini', what: 'bilim kurgu, fantastik ve süper kahraman' },
  { re: /korku|gerilim/i, title: 'Gece Bekçisi', what: 'korku ve gerilim' },
  { re: /komedi|sitcom|hiciv/i, title: 'Kahkaha Avcısı', what: 'komedi' },
  { re: /animasyon|çocuk|aile/i, title: 'Çizgi Film Ruhu', what: 'animasyon ve aile' },
  { re: /dram|romantik|gençlik/i, title: 'Duygu Kaşifi', what: 'dram ve romantik' },
  { re: /aksiyon|macera|savaş|casus|vahşi batı/i, title: 'Adrenalin Avcısı', what: 'aksiyon ve macera' },
  { re: /suç|polisiye|gizem|dedektif/i, title: 'Dedektif', what: 'suç ve gizem' },
  { re: /belgesel|tarih|biyograf/i, title: 'Zaman Yolcusu', what: 'belgesel, tarih ve biyografi' },
]

export function computeStats(board: Board, rows: Row[], watched: WatchedMap, year: string, x: FlashbackExtras): Stats {
  const Y = Number(year)
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const kategoriProp = resolveRole(board, 'kategori')
  const turProp = resolveRole(board, 'tur')
  const ulkeProp = resolveRole(board, 'ulke')
  const puanProp = resolveRole(board, 'puan')
  const sureProp = resolveRole(board, 'sure')
  const oyuncuProp = resolveRole(board, 'oyuncular')
  const yonetmenProp = resolveRole(board, 'yonetmen')
  const posterProp = resolveRole(board, 'poster')
  const vizyonProp = resolveRole(board, 'vizyon')
  const origProp = resolveRole(board, 'orjinalAdi')
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  const isSeriesRow = (r: Row) =>
    x.mediaTypes[r.id] ? x.mediaTypes[r.id] === 'tv' : /dizi/i.test(kategoriProp?.options?.find((o) => o.id === r.values[kategoriProp.id])?.label ?? '')

  const days = new Set<string>()
  const months = Array(12).fill(0)
  const dayTitle = new Set<string>() // "gün|kayıt" — haftanın günü sayımı bölüm yığınlarıyla şişmesin
  const info = new Map<string, TitleInfo>()
  let films = 0
  let rewatches = 0
  let seriesFinished = 0
  let episodes = 0
  let filmMinutes = 0
  let seriesMinutes = 0
  let seriesEstimated = false
  const episodeDates = new Map<string, string[]>()

  const touch = (row: Row, date: string) => {
    days.add(date)
    months[Number(date.slice(5, 7)) - 1]++
    dayTitle.add(`${date}|${row.id}`)
    let t = info.get(row.id)
    if (!t) {
      const rel = vizyonProp ? String(row.values[vizyonProp.id] ?? '').slice(0, 4) : ''
      t = {
        row,
        title: (tp ? titleText(tp, row.values[tp.id]) : '') || 'İsimsiz',
        poster: (posterProp && (row.values[posterProp.id] as string)) || '',
        releaseYear: /^\d{4}$/.test(rel) ? Number(rel) : null,
        isSeries: isSeriesRow(row),
        score: puanProp ? ratingAverage(row.values[puanProp.id], puanProp) : null,
        first: date,
        last: date,
        episodes: 0,
      }
      info.set(row.id, t)
    }
    if (date < t.first) t.first = date
    if (date > t.last) t.last = date
    return t
  }

  for (const row of rows) {
    const series = isSeriesRow(row)
    const entries = dateProp ? toEntries(row.values[dateProp.id]).sort() : []
    entries.forEach((e, i) => {
      const end = entryEnd(e)
      if (!end.startsWith(year)) return
      touch(row, end)
      const start = parseEntry(e).start
      if (start.startsWith(year)) days.add(start)
      if (series) seriesFinished++
      else {
        films++
        const m = sureProp ? row.values[sureProp.id] : null
        if (typeof m === 'number') filmMinutes += m
        if (i > 0) rewatches++
      }
    })
    const own = sureProp && typeof row.values[sureProp.id] === 'number' ? (row.values[sureProp.id] as number) : 0
    for (const ds of Object.values(watched[row.id] ?? {})) {
      for (const d of ds ?? []) {
        if (!d.startsWith(year)) continue
        episodes++
        const t = touch(row, d)
        t.episodes++
        const list = episodeDates.get(row.id) ?? []
        list.push(d)
        episodeDates.set(row.id, list)
        const rt = x.runtimes[row.id] || own
        if (rt) seriesMinutes += rt
        else {
          seriesMinutes += DEFAULT_EPISODE_MINUTES
          seriesEstimated = true
        }
      }
    }
  }

  // En uzun seri (üst üste gün)
  let best = { days: 0, start: '', end: '' }
  let run = 0
  let runStart = ''
  for (let d = new Date(Date.UTC(Y, 0, 1)); d.getUTCFullYear() === Y; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10)
    if (days.has(iso)) {
      if (!run) runStart = iso
      run++
      if (run > best.days) best = { days: run, start: runStart, end: iso }
    } else run = 0
  }

  const weekdays = Array(7).fill(0)
  for (const k of dayTitle) {
    const d = k.slice(0, 10)
    const wd = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))).getUTCDay()
    weekdays[(wd + 6) % 7]++
  }

  const order = [...info.values()].sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0))
  const titles = order

  // Puanlar
  const rated = titles.filter((t) => typeof t.score === 'number') as (TitleInfo & { score: number })[]
  const histogram = Array(10).fill(0)
  for (const t of rated) histogram[Math.min(9, Math.max(0, Math.round(t.score) - 1))]++
  const byScore = [...rated].sort((a, b) => b.score - a.score)
  const scores = {
    avg: rated.length ? rated.reduce((s, t) => s + t.score, 0) / rated.length : null,
    count: rated.length,
    histogram,
    top: byScore.slice(0, 5),
    lowest: rated.length >= 3 ? byScore[byScore.length - 1] : null,
  }

  // Nostalji radarı
  const withYear = titles.filter((t) => t.releaseYear && t.releaseYear >= 1900)
  const decadeMap = new Map<number, number>()
  for (const t of withYear) {
    const dec = Math.floor(t.releaseYear! / 10) * 10
    decadeMap.set(dec, (decadeMap.get(dec) ?? 0) + 1)
  }
  const decades = [...decadeMap.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => ({ label: `${d}'ler`, count: c }))
  const newShare = withYear.length ? withYear.filter((t) => t.releaseYear! >= Y - 1).length / withYear.length : 0
  const classicShare = withYear.length ? withYear.filter((t) => t.releaseYear! <= Y - 20).length / withYear.length : 0
  const oldest = withYear.length ? withYear.reduce((a, b) => (b.releaseYear! < a.releaseYear! ? b : a)) : null

  // Tür / ülke / oyuncu / yönetmen
  const count = (prop: typeof turProp) => {
    if (!prop) return []
    const m = new Map<string, number>()
    for (const t of titles) {
      const v = t.row.values[prop.id]
      for (const id of Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []) m.set(id, (m.get(id) ?? 0) + 1)
    }
    return [...m.entries()]
      .map(([id, c]) => {
        const o = prop.options?.find((op) => op.id === id)
        return { label: o?.label ?? '?', count: c, image: o?.image }
      })
      .sort((a, b) => b.count - a.count)
  }
  const genres = count(turProp)
  const countries = count(ulkeProp)
  const directors = new Map<string, { count: number; image?: string }>()
  if (yonetmenProp) {
    for (const t of titles) {
      const v = t.row.values[yonetmenProp.id]
      const names =
        yonetmenProp.type === 'multiselect' || yonetmenProp.type === 'select'
          ? (Array.isArray(v) ? (v as string[]) : v ? [v as string] : []).map((id) => yonetmenProp.options?.find((o) => o.id === id)?.label ?? '')
          : String(v ?? '').split(/,|&/)
      for (const n of names.map((s) => s.trim()).filter(Boolean)) {
        const d = directors.get(n) ?? { count: 0 }
        d.count++
        if (!d.image && t.poster) d.image = t.poster
        directors.set(n, d)
      }
    }
  }
  const topDirectors = [...directors.entries()]
    .map(([label, d]) => ({ label, count: d.count, image: d.image }))
    .filter((d) => d.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // Maratonlar: aynı seriden (Koleksiyon rafları) birden fazla yapım + bir dizinin kısa sürede çok bölümü
  const groups = new Map<string, { name: string; items: TitleInfo[] }>()
  for (const t of titles) {
    const col = x.collections[t.row.id]
    const original = (origProp && typeof t.row.values[origProp.id] === 'string' && (t.row.values[origProp.id] as string)) || t.title
    const s = autoShelf(col?.name ?? original, t.isSeries, Boolean(col))
    if (!s.key) continue
    const g = groups.get(s.key) ?? { name: s.name, items: [] }
    g.items.push(t)
    groups.set(s.key, g)
  }
  const marathons: Marathon[] = []
  for (const g of groups.values()) {
    if (g.items.length < 2) continue
    const first = g.items.reduce((a, t) => (t.first < a ? t.first : a), g.items[0].first)
    const last = g.items.reduce((a, t) => (t.last > a ? t.last : a), g.items[0].last)
    marathons.push({
      kind: 'seri',
      name: commonTitle(g.items.map((t) => t.title)) ?? g.name,
      count: g.items.length,
      days: dayNum(last) - dayNum(first) + 1,
      titles: [...g.items].sort((a, b) => (a.releaseYear ?? 0) - (b.releaseYear ?? 0)),
    })
  }
  // Bir diziyi eklerken bütün sezonu tek günde işaretlemek maraton değil: günde 10'dan fazla bölüm
  // işaretlenen günler "toplu işaretleme" sayılıp bu hesaba katılmaz.
  const BULK_PER_DAY = 10
  for (const [rowId, ds] of episodeDates) {
    const perDay = new Map<string, number>()
    for (const d of ds) perDay.set(d, (perDay.get(d) ?? 0) + 1)
    const sorted = ds
      .filter((d) => (perDay.get(d) ?? 0) <= BULK_PER_DAY)
      .map(dayNum)
      .sort((a, b) => a - b)
    let bestN = 0
    let bestSpan = 0
    let j = 0
    for (let i = 0; i < sorted.length; i++) {
      while (sorted[i] - sorted[j] > 2) j++
      if (i - j + 1 > bestN) {
        bestN = i - j + 1
        bestSpan = sorted[i] - sorted[j] + 1
      }
    }
    if (bestN >= 8) marathons.push({ kind: 'dizi', name: info.get(rowId)!.title, count: bestN, days: bestSpan, titles: [info.get(rowId)!] })
  }
  marathons.sort((a, b) => (a.kind === b.kind ? (a.kind === 'seri' ? b.count - a.count || a.days - b.days : b.count - a.count) : a.kind === 'seri' ? -1 : 1))

  // İzleyici unvanı
  const shares = PERSONAS.map((p) => ({
    p,
    n: titles.filter((t) => {
      const v = turProp ? t.row.values[turProp.id] : null
      const ids = Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []
      return ids.some((id) => p.re.test(turProp?.options?.find((o) => o.id === id)?.label ?? ''))
    }).length,
  })).sort((a, b) => b.n - a.n)
  const top = shares[0]
  const avgScore = scores.avg
  const nightTimed = [22, 23, 0, 1, 2, 3, 4, 5].reduce((s, h) => s + (x.hours[h] ?? 0), 0)
  const fastMarathon = marathons.find((m) => (m.kind === 'dizi' && m.count >= 10) || (m.kind === 'seri' && m.count >= 3 && m.days <= 14))
  const badges: Badge[] = []
  if (fastMarathon)
    badges.push({
      title: 'Maraton Ustası',
      why: fastMarathon.kind === 'seri' ? `${fastMarathon.name} serisini ${fastMarathon.days} günde bitirdin` : `${fastMarathon.name}: ${fastMarathon.days} günde ${fastMarathon.count} bölüm`,
    })
  if (episodes >= 150) badges.push({ title: 'Dizi Bağımlısı', why: `${episodes} bölüm izledin` })
  if (classicShare >= 0.3) badges.push({ title: 'Nostalji Avcısı', why: `İzlediklerinin %${Math.round(classicShare * 100)}'i 20 yıldan eski` })
  if (newShare >= 0.5) badges.push({ title: 'Güncel Takipçi', why: `İzlediklerinin %${Math.round(newShare * 100)}'i yeni yapımlar` })
  if (countries.length >= 8) badges.push({ title: 'Dünya Gezgini', why: `${countries.length} farklı ülkeden yapım` })
  if (rewatches >= 3) badges.push({ title: 'Sadık İzleyici', why: `${rewatches} filmi yeniden izledin` })
  if (x.timed >= 10 && nightTimed / x.timed >= 0.4) badges.push({ title: 'Gece Kuşu', why: `İzlemelerinin %${Math.round((nightTimed / x.timed) * 100)}'i gece` })
  if (avgScore !== null && scores.count >= 5 && avgScore >= 8.5) badges.push({ title: 'Cömert Jüri', why: `Puan ortalaman ${avgScore.toFixed(1)}` })
  if (avgScore !== null && scores.count >= 5 && avgScore <= 6.5) badges.push({ title: 'Zor Beğenen', why: `Puan ortalaman ${avgScore.toFixed(1)}` })
  const persona =
    top && top.n > 0 && titles.length
      ? { title: top.p.title, why: `İzlediklerinin %${Math.round((top.n / titles.length) * 100)}'i ${top.p.what}`, badges: badges.slice(0, 3) }
      : { title: badges[0]?.title ?? 'İzleyici', why: badges[0]?.why ?? '', badges: badges.slice(1, 4) }

  return {
    order,
    films,
    rewatches,
    seriesFinished,
    episodes,
    filmMinutes,
    seriesMinutes,
    seriesEstimated,
    activeDays: days.size,
    longestStreak: best,
    months,
    weekdays,
    hours: x.hours,
    timed: x.timed,
    scores,
    decades,
    newShare,
    classicShare,
    oldest,
    topGenres: genres.slice(0, 5),
    topCountries: countries.slice(0, 5),
    countryCount: countries.length,
    topActors: count(oyuncuProp).slice(0, 8),
    topDirectors,
    // En fazla 4 film serisi + 2 dizi maratonu; biri azsa öbüründen tamamlanır
    marathons: (() => {
      const seri = marathons.filter((m) => m.kind === 'seri')
      const dizi = marathons.filter((m) => m.kind === 'dizi')
      const d = dizi.slice(0, Math.max(2, 6 - seri.length))
      return [...seri.slice(0, 6 - d.length), ...d]
    })(),
    persona,
  }
}
