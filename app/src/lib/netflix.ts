import { episodeKey, type Board, type EpisodesMap, type Row, type WatchedMap } from '../types'
import { resolveRole } from './roles'
import { entryEnd, entryStart, isFullDate, isUnknownDate, isYearOnly, makeEntry, parseEntry, toEntries } from './dateRange'
import { searchFold } from './search'

// Netflix "Görüntüleme etkinliği" dosyasını arşive işleme (v1.26, Y17). Netflix › Hesap › Profil › Görüntüleme
// etkinliği › "Tümünü indir" ile inen NetflixViewingHistory.csv: iki sütun (Title, Date). Diziler "Dizi: 1. Sezon:
// Bölüm adı" (dizi adının kendisinde de ":" olabilir: "Avatar: The Last Airbender: 2. Sezon: …"), sınırlı diziler
// "Dizi: Mini Dizi: …", sezonsuzlar "Dizi: 3. Bölüm". Tarih bölgeye göre ay/gün/yıl ("8/17/26") ya da gün.ay.yıl.
// Bu dosya sadece okuyup bir PLAN çıkarır; yazma işi İçe Aktar sayfasında, kullanıcı önizlemeyi onaylayınca.

export interface NetflixEntry {
  title: string
  date: string
}

// ---- Dosya ----------------------------------------------------------------------------------------
export function parseNetflixRows(rows: Record<string, string>[]): { entries: NetflixEntry[]; bad: number } | null {
  if (rows.length === 0) return { entries: [], bad: 0 }
  const keys = Object.keys(rows[0])
  const titleKey = keys.find((k) => /^(title|başlık|baslik|titel|titre|título|titolo)$/i.test(k.trim()))
  const dateKey = keys.find((k) => /^(date|tarih|datum|fecha|data)$/i.test(k.trim()))
  if (!titleKey || !dateKey) return null
  const raw = rows.map((r) => ({ title: (r[titleKey] ?? '').trim(), date: (r[dateKey] ?? '').trim() }))
  const order = detectOrder(raw.map((r) => r.date))
  const entries: NetflixEntry[] = []
  let bad = 0
  for (const r of raw) {
    const d = parseNetflixDate(r.date, order)
    if (!r.title || !d) {
      bad++
      continue
    }
    entries.push({ title: r.title, date: d })
  }
  return { entries, bad }
}

// Bütün tarihlere bakıp gün/ay sırasına bir kez karar verilir: ilk sayı 12'yi geçen varsa gün/ay, ikinci sayı geçen
// varsa ay/gün; ikisi de yoksa "/" ile yazılmışsa ay/gün (Netflix'in ABD biçimi), "." ile yazılmışsa gün/ay.
function detectOrder(values: string[]): 'mdy' | 'dmy' {
  let dmy = false
  let mdy = false
  let slash = 0
  let dot = 0
  for (const v of values) {
    const m = /^(\d{1,2})([./-])(\d{1,2})\2(\d{2,4})$/.exec(v)
    if (!m) continue
    if (+m[1] > 12) dmy = true
    if (+m[3] > 12) mdy = true
    if (m[2] === '/') slash++
    else dot++
  }
  if (dmy !== mdy) return dmy ? 'dmy' : 'mdy'
  return slash >= dot ? 'mdy' : 'dmy'
}

function parseNetflixDate(s: string, order: 'mdy' | 'dmy'): string {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`
  const m = /^(\d{1,2})([./-])(\d{1,2})\2(\d{2,4})$/.exec(s)
  if (!m) return ''
  let [a, b] = [+m[1], +m[3]]
  if (order === 'mdy') [a, b] = [b, a]
  let y = +m[4]
  if (m[4].length === 2) y += 2000
  if (b < 1 || b > 12 || a < 1 || a > 31 || y < 1990 || y > 2200) return ''
  return `${y}-${pad(b)}-${pad(a)}`
}

// ---- Başlıklar ------------------------------------------------------------------------------------
export function normTitle(s: string): string {
  return searchFold(s)
    .replace(/\(\d{4}\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
}

// Sezon parçası mı ("1. Sezon", "Season 2", "Mini Dizi"…) — sınırlı diziler 1. sezon sayılır
function seasonOf(seg: string): number | null {
  const s = seg.trim()
  let m = /^(\d+)\.\s*(sezon|kısım|kisim|kitap|cilt|bölüm grubu|sezonu)$/i.exec(s)
  if (m) return +m[1]
  m = /^(sezon|season|staffel|saison|temporada|stagione|kitap|book|part|kısım|kisim|cilt|volume|vol\.?|chapter)\s*(\d+)$/i.exec(s)
  if (m) return +m[2]
  if (/^(mini dizi|sınırlı dizi|sinirli dizi|limited series|miniseries|mini series|mini-series|mini-dizi)$/i.test(s)) return 1
  return null
}

// "3. Bölüm", "Bölüm 3", "Episode 3", "Ep. 3"
function episodeNumberOf(seg: string): number | null {
  const s = seg.trim()
  const m = /^(?:(\d+)\.\s*bölüm|bölüm\s*(\d+)|episode\s*(\d+)|ep\.?\s*(\d+)|folge\s*(\d+)|épisode\s*(\d+))$/i.exec(s)
  if (!m) return null
  const n = m.slice(1).find(Boolean)
  return n ? +n : null
}

interface Parsed {
  full: string
  segs: string[]
  // Kesin dizi bölümü (sezon parçası ya da "3. Bölüm" var)
  show: string | null
  season: number | null
  episode: string
}

function parseTitle(full: string): Parsed {
  const segs = full.split(/:\s+/)
  for (let i = 1; i < segs.length - 1; i++) {
    let season = seasonOf(segs[i])
    // "Stranger Things: Stranger Things 2: 1. Bölüm: …" — sezon, dizinin adı + numara olarak yazılmış
    if (season === null) {
      const show = normTitle(segs.slice(0, i).join(': '))
      const m = /^(.*) (\d{1,2})$/.exec(normTitle(segs[i]))
      if (show && m && m[1] === show) season = +m[2]
    }
    if (season !== null) return { full, segs, show: segs.slice(0, i).join(': '), season, episode: segs.slice(i + 1).join(': ') }
  }
  if (segs.length >= 2 && episodeNumberOf(segs[segs.length - 1]) !== null) {
    return { full, segs, show: segs.slice(0, -1).join(': '), season: null, episode: segs[segs.length - 1] }
  }
  return { full, segs, show: null, season: null, episode: '' }
}

// ---- Plan ----------------------------------------------------------------------------------------
export interface PlanContext {
  board: Board
  rows: Row[]
  episodes: EpisodesMap
  watched: WatchedMap
  media: Record<string, 'movie' | 'tv'>
  // Az önce eklenen kayıtlar: Netflix adının (normTitle) gittiği kayıt — TMDB adı değiştirse de eşleşsin
  forced?: Map<string, string>
}

export interface EpisodeHit {
  key: string
  label: string
  newDates: string[]
  // Yeni tarihin yerine geçeceği eski değer: "?" (hatırlamıyorum) ya da aynı yılın "sadece yıl"ı her zaman;
  // `bulk` ise çok bölüme birden girilmiş tek bir tarih (toplu işaretleme) — sadece kullanıcı isterse
  replace?: string
  bulk?: boolean
}

export interface SeriesGroup {
  kind: 'series'
  key: string
  name: string
  row: Row | null
  hasEpisodes: boolean
  // Kayda yazılacak bölümler (yeni tarihi olanlar)
  hits: EpisodeHit[]
  newDates: number
  already: number
  // Toplu girilmiş tarihi Netflix'teki gerçek günüyle değişebilecek bölüm sayısı
  bulk: number
  unmatched: string[]
  lastDate: string
  entries: number
}

export interface MovieGroup {
  kind: 'movie'
  key: string
  name: string
  row: Row | null
  // Yeni izlemeler (tek gün ya da arka arkaya günler aralık olarak)
  watches: string[]
  already: number
  lastDate: string
  entries: number
}

export type PlanGroup = SeriesGroup | MovieGroup

export interface NetflixPlan {
  series: SeriesGroup[]
  movies: MovieGroup[]
  total: number
}

function rowTitles(board: Board, row: Row): string[] {
  const orig = resolveRole(board, 'orjinalAdi')
  return [board.titlePropertyId, orig?.id].flatMap((pid) => {
    const v = pid ? row.values[pid] : undefined
    return typeof v === 'string' && v.trim() ? [v] : []
  })
}

export function rowIsSeries(ctx: PlanContext, row: Row): boolean {
  if (ctx.media[row.id]) return ctx.media[row.id] === 'tv'
  if ((ctx.episodes[row.id]?.length ?? 0) > 0) return true
  const kat = resolveRole(ctx.board, 'kategori')
  const label = kat?.options?.find((o) => o.id === row.values[kat.id])?.label ?? ''
  return /dizi|anime|series|show|program/i.test(label)
}

function dayDiff(a: string, b: string) {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((t(b) - t(a)) / 86400000)
}

// Netflix bir filmi izlendiği her gün için ayrı yazar: arka arkaya günler tek izleme ("başladım → bitirdim") sayılır
function mergeDays(days: string[]): string[] {
  const sorted = [...new Set(days)].sort()
  const out: string[] = []
  let start = ''
  let end = ''
  for (const d of sorted) {
    if (start && dayDiff(end, d) <= 1) {
      end = d
      continue
    }
    if (start) out.push(makeEntry(start, end))
    start = d
    end = d
  }
  if (start) out.push(makeEntry(start, end))
  return out
}

function shiftDay(iso: string, n: number) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n))
  return d.toISOString().slice(0, 10)
}

// Var olan izleme tarihleriyle çakışıyor mu (aynı gün ya da aralığın içinde). Bir gün tolerans: Netflix günü kendi
// saatine göre yazıyor, gece izlenen bir film arşivde ertesi günle girilmiş olabiliyor (gerçek dosyada Enola Holmes 2:
// Netflix 6 Nisan, arşiv 7 Nisan) — aynı izleme iki kez eklenmesin.
function overlaps(existing: string[], entry: string): boolean {
  const e = parseEntry(entry)
  const lo = shiftDay(e.start, -1)
  const hi = shiftDay(e.end ?? e.start, 1)
  return existing.some((x) => {
    if (!isFullDate(x)) return false
    const a = entryStart(x).slice(0, 10)
    const b = entryEnd(x).slice(0, 10)
    return b >= lo && a <= hi
  })
}

// Bir kaydın İzleme Tarihi'ne Netflix izlemelerini ekler: zaten olanlar atlanır, "?" ve aynı yılın "sadece yıl"ı ilk
// yeni izlemenin yerine geçer. Yeni değer (değişmediyse null) ve atlanan sayısı.
export function mergeMovieDates(cur: unknown, watches: string[]): { value: string[] | null; added: number; already: number } {
  let list = toEntries(cur)
  let added = 0
  let already = 0
  for (const w of watches) {
    if (overlaps(list, w)) {
      already++
      continue
    }
    const at = list.findIndex((d) => isUnknownDate(d) || (isYearOnly(d) && d === w.slice(0, 4)))
    if (at >= 0) list = list.filter((_, j) => j !== at)
    list = [...list, w]
    added++
  }
  return { value: added ? list.sort() : null, added, already }
}

// İki adın harf ikilisi benzerliği (0–1) — küçük yazım farkları ("Pilot Bölüm" / "Pilot" değil, "Şeker mi Şaka mı Ucube"
// / "Şeker mi Şaka mı, Ucube?" gibi) eşleşsin diye
function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const grams = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1)
    return m
  }
  const ga = grams(a)
  const gb = grams(b)
  let common = 0
  for (const [g, n] of ga) common += Math.min(n, gb.get(g) ?? 0)
  return (2 * common) / (a.length - 1 + (b.length - 1))
}

function findEpisode(seasons: EpisodesMap[string], season: number | null, name: string): { key: string; label: string } | null {
  if (!seasons?.length) return null
  const label = (s: number, e: number, nm: string) => `S${s}·B${e}${nm ? ` — ${nm}` : ''}`
  // "1. Bölüm: Küpler" gibi yazılmışsa adın kendisi de, numarası da denenir
  const parts = name.split(/:\s+/)
  const names = [...new Set([name, ...parts.filter((p) => episodeNumberOf(p) === null)].map(normTitle).filter(Boolean))]
  const byName = (list: typeof seasons, fuzzy: boolean) => {
    let best: { key: string; label: string; score: number } | null = null
    for (const s of list)
      for (const ep of s.episodes ?? []) {
        const en = normTitle(ep.name ?? '')
        if (!en) continue
        for (const n of names) {
          const exact = en === n || (n.length >= 5 && en.length >= 5 && (en.startsWith(n) || n.startsWith(en)))
          const score = exact ? 1 : fuzzy ? similarity(en, n) : 0
          if (score >= (fuzzy ? 0.8 : 1) && (!best || score > best.score)) best = { key: episodeKey(s.seasonNumber, ep.episodeNumber), label: label(s.seasonNumber, ep.episodeNumber, ep.name), score }
        }
      }
    return best ? { key: best.key, label: best.label } : null
  }
  const inSeason = season !== null ? seasons.filter((s) => s.seasonNumber === season) : []
  const regular = seasons.filter((s) => s.seasonNumber > 0)
  const hit = byName(inSeason, false) ?? byName(regular, false) ?? byName(inSeason, true) ?? byName(regular, true)
  if (hit) return hit
  const num = episodeNumberOf(name) ?? parts.map(episodeNumberOf).find((x) => x !== null) ?? null
  if (num === null) return null
  // Numarayla: sezonu belliyse o sezonda (bitince sonraki sezonlara taşar — bazı diziler bölümleri sezonlar boyunca
  // "30. Bölüm" diye sürekli sayıyor), değilse 1. sezondan başlayarak
  const ordered = seasons.filter((s) => s.seasonNumber > 0).sort((a, b) => a.seasonNumber - b.seasonNumber)
  let idx = season !== null ? ordered.findIndex((s) => s.seasonNumber === season) : 0
  if (idx < 0) return null
  let k = num
  while (idx < ordered.length) {
    const eps = ordered[idx].episodes ?? []
    if (k <= eps.length) {
      const ep = eps[k - 1]
      return { key: episodeKey(ordered[idx].seasonNumber, ep.episodeNumber), label: label(ordered[idx].seasonNumber, ep.episodeNumber, ep.name) }
    }
    k -= eps.length
    idx++
  }
  return null
}

export function buildNetflixPlan(entries: NetflixEntry[], ctx: PlanContext): NetflixPlan {
  // Arşivdeki adlar → kayıtlar
  const byName = new Map<string, Row[]>()
  for (const r of ctx.rows)
    for (const t of rowTitles(ctx.board, r)) {
      const k = normTitle(t)
      if (!k) continue
      const list = byName.get(k) ?? []
      if (!list.includes(r)) list.push(r)
      byName.set(k, list)
    }
  const rowById = new Map(ctx.rows.map((r) => [r.id, r]))
  const find = (name: string, want: 'series' | 'movie' | 'any'): Row | null => {
    const k = normTitle(name)
    const forcedId = ctx.forced?.get(k)
    if (forcedId && rowById.has(forcedId)) return rowById.get(forcedId)!
    const list = byName.get(k) ?? []
    if (want === 'any') return list[0] ?? null
    return list.find((r) => (want === 'series') === rowIsSeries(ctx, r)) ?? null
  }

  const parsed = entries.map((e) => ({ e, p: parseTitle(e.title) }))
  // Sezonsuz yazılmış bölümler ("Dizi: Bölüm adı") için: aynı ön ekle dosyada birden çok farklı başlık varsa dizi say
  const prefixCount = new Map<string, Set<string>>()
  for (const { p } of parsed) {
    if (p.show || p.segs.length < 2) continue
    const pre = normTitle(p.segs.slice(0, -1).join(': '))
    const set = prefixCount.get(pre) ?? new Set<string>()
    set.add(p.full)
    prefixCount.set(pre, set)
  }

  type Raw = { kind: 'series' | 'movie'; name: string; row: Row | null; items: { date: string; season: number | null; episode: string }[] }
  const groups = new Map<string, Raw>()
  const add = (kind: 'series' | 'movie', name: string, row: Row | null, item: { date: string; season: number | null; episode: string }) => {
    const key = row ? `row:${row.id}` : `new:${kind}:${normTitle(name)}`
    const g = groups.get(key) ?? { kind, name, row, items: [] }
    g.items.push(item)
    groups.set(key, g)
  }

  for (const { e, p } of parsed) {
    if (p.show) {
      add('series', p.show, find(p.show, 'series') ?? find(p.show, 'any'), { date: e.date, season: p.season, episode: p.episode })
      continue
    }
    // Bölüm parçası olmayan başlık filmdir (Netflix dizileri hep bölümüyle yazar) — arşivde aynı adlı bir dizi olsa da
    // ("The Flash" filmi / dizisi) diziye yazılmaz
    const whole = find(e.title, 'movie')
    if (whole) {
      add('movie', e.title, whole, { date: e.date, season: null, episode: '' })
      continue
    }
    // "Dizi: Bölüm adı": ön eki arşivdeki bir diziyse (en uzun ön ekten başlayarak)
    let done = false
    for (let k = p.segs.length - 1; k >= 1 && !done; k--) {
      const show = p.segs.slice(0, k).join(': ')
      const row = find(show, 'series')
      if (row) {
        add('series', show, row, { date: e.date, season: null, episode: p.segs.slice(k).join(': ') })
        done = true
      }
    }
    if (done) continue
    if (p.segs.length >= 2 && (prefixCount.get(normTitle(p.segs.slice(0, -1).join(': ')))?.size ?? 0) >= 2) {
      add('series', p.segs.slice(0, -1).join(': '), null, { date: e.date, season: null, episode: p.segs[p.segs.length - 1] })
      continue
    }
    add('movie', e.title, null, { date: e.date, season: null, episode: '' })
  }

  const series: SeriesGroup[] = []
  const movies: MovieGroup[] = []
  const tarihProp = resolveRole(ctx.board, 'izlemeTarihi')
  for (const [key, g] of groups) {
    const lastDate = g.items.map((i) => i.date).sort().at(-1) ?? ''
    if (g.kind === 'movie' || (g.row && !rowIsSeries(ctx, g.row) && g.items.every((i) => !i.episode))) {
      const watches = mergeDays(g.items.map((i) => i.date))
      let already = 0
      let fresh = watches
      if (g.row && tarihProp) {
        const cur = toEntries(g.row.values[tarihProp.id])
        fresh = watches.filter((w) => !overlaps(cur, w))
        already = watches.length - fresh.length
      }
      movies.push({ kind: 'movie', key, name: g.name, row: g.row, watches: fresh, already, lastDate, entries: g.items.length })
      continue
    }
    const seasons = g.row ? (ctx.episodes[g.row.id] ?? []) : []
    const existing = g.row ? (ctx.watched[g.row.id] ?? {}) : {}
    const byKey = new Map<string, { label: string; dates: Set<string> }>()
    const unmatched: string[] = []
    for (const it of g.items) {
      const hit = it.episode ? findEpisode(seasons, it.season, it.episode) : null
      if (!hit) {
        const nm = it.season !== null ? `${it.season}. Sezon: ${it.episode}` : it.episode || g.name
        if (!unmatched.includes(nm)) unmatched.push(nm)
        continue
      }
      const cur = byKey.get(hit.key) ?? { label: hit.label, dates: new Set<string>() }
      cur.dates.add(it.date)
      byKey.set(hit.key, cur)
    }
    const hits: EpisodeHit[] = []
    let newDates = 0
    let already = 0
    let bulk = 0
    // Bölümlerin çoğuna aynı tek tarih yazılmışsa (eski toplu işaretleme, "bütün sezonu bugün izledim") o tarih büyük
    // ihtimalle gerçek izleme günü değil
    const singleCount = new Map<string, number>()
    for (const ds of Object.values(existing)) if (Array.isArray(ds) && ds.length === 1) singleCount.set(String(ds[0]), (singleCount.get(String(ds[0])) ?? 0) + 1)
    for (const [k, v] of byKey) {
      const have = (existing[k] ?? []).map(String)
      const fresh = [...v.dates].filter((d) => !overlaps(have, d)).sort()
      already += v.dates.size - fresh.length
      newDates += fresh.length
      if (!fresh.length) continue
      const approx = have.find((d) => isUnknownDate(d) || (isYearOnly(d) && d === fresh[0].slice(0, 4)))
      // (Netflix'te o bölüm o gün de izlenmişse tarih gerçektir, değiştirilmez)
      const isBulk =
        !approx && have.length === 1 && isFullDate(have[0]) && (singleCount.get(have[0]) ?? 0) >= 3 && ![...v.dates].some((d) => overlaps([have[0]], d))
      if (isBulk) bulk++
      hits.push({ key: k, label: v.label, newDates: fresh, replace: approx ?? (isBulk ? have[0] : undefined), bulk: isBulk })
    }
    hits.sort((a, b) => {
      const [as, ae] = a.key.split('-').map(Number)
      const [bs, be] = b.key.split('-').map(Number)
      return as - bs || ae - be
    })
    series.push({ kind: 'series', key, name: g.name, row: g.row, hasEpisodes: seasons.length > 0, hits, newDates, already, bulk, unmatched, lastDate, entries: g.items.length })
  }
  const byLast = (a: PlanGroup, b: PlanGroup) => b.lastDate.localeCompare(a.lastDate)
  series.sort(byLast)
  movies.sort(byLast)
  return { series, movies, total: entries.length }
}

// Bölüm haritasına yeni tarihleri ekler (var olanlar korunur)
// `replaceBulk`: toplu girilmiş tarihler de Netflix'teki günle değişsin ("?" ve "sadece yıl" her zaman değişir)
export function mergeEpisodeMap(cur: Record<string, string[]>, hits: EpisodeHit[], replaceBulk: boolean): Record<string, string[]> {
  const next: Record<string, string[]> = Object.fromEntries(Object.entries(cur ?? {}).map(([k, v]) => [k, [...(v ?? [])]]))
  for (const h of hits) {
    let list = next[h.key] ?? []
    if (h.replace && (!h.bulk || replaceBulk)) {
      const at = list.indexOf(h.replace)
      if (at >= 0) list = list.filter((_, j) => j !== at)
    }
    next[h.key] = [...list, ...h.newDates.filter((d) => !list.includes(d))].sort()
  }
  return next
}
