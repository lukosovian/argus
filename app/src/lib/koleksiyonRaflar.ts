import type { KoleksiyonInfo } from './api'
import { resolveRole, resolveStatusOption } from './roles'
import { entryEnd, toEntries } from './dateRange'
import { autoShelf, commonTitle } from './shelves'
import { titleText, type Board, type Row } from '../types'
import { tt } from './i18n'

// Koleksiyon rafları (pages/Koleksiyon.tsx'ten taşındı, v1.25): Ödüller'in seri seti bonusu da aynı rafları
// kullansın diye ortak. Hesap eskisiyle birebir aynı.

// ARGUS'la gelen, bazı raflara kendiliğinden konan semboller (değiştirilebilir)
export const DEFAULT_SHELF_SYMBOLS: Record<string, string> = {
  'star trek': '/semboller/delta.svg',
  'harry potter': '/semboller/olum-yadigarlari.svg',
  'fantastic beasts': '/semboller/olum-yadigarlari.svg',
  'lord of the rings': '/semboller/tek-yuzuk.svg',
  hobbit: '/semboller/tek-yuzuk.svg',
  tron: '/semboller/tron.svg',
}

export interface KoleksiyonItem {
  row: Row
  title: string
  logo: string
  poster: string
  year: string
  isSeries: boolean
  lastWatched: string
  symbol: string | null
  key: string // bulunduğu raf ('' = rafsız)
  autoKey: string
  autoName: string
  // Ayrıca içinde durduğu, elle açılmış raflar (bkz. KoleksiyonData.shelves[].rows)
  extra: string[]
}

export interface KoleksiyonShelf {
  key: string
  name: string
  autoName: string
  seriesName: string
  symbol: string | null
  custom: boolean
  manual: boolean
  items: KoleksiyonItem[]
}

export function buildKoleksiyonItems(board: Board, rows: Row[], info: KoleksiyonInfo): KoleksiyonItem[] {
  const durum = resolveRole(board, 'durum')
  // İzlenecek dışındaki her durum (İzlendi, İzleniyor, Yarım…) — sunucudaki koleksiyonRows ile aynı
  const later = resolveStatusOption(board, 'izlenecek')
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  const orig = resolveRole(board, 'orjinalAdi')
  const poster = resolveRole(board, 'poster')
  const kategori = resolveRole(board, 'kategori')
  const vizyon = resolveRole(board, 'vizyon')
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const str = (r: Row, id?: string) => (id && typeof r.values[id] === 'string' ? (r.values[id] as string) : '')
  const manual = Object.entries(info.data.shelves).filter(([, v]) => v.manual)
  return rows
    .filter((r) => durum && r.values[durum.id] && r.values[durum.id] !== later)
    .map((r) => {
      const title = (tp ? titleText(tp, r.values[tp.id]) : '') || tt('İsimsiz')
      const original = str(r, orig?.id) || title
      const col = info.collections[r.id]
      const source = col?.name ?? original
      const isSeries = info.mediaTypes[r.id] ? info.mediaTypes[r.id] === 'tv' : /dizi/i.test(kategori?.options?.find((o) => o.id === r.values[kategori.id])?.label ?? '')
      const auto = autoShelf(source, isSeries, Boolean(col))
      const autoKey = auto.key
      const override = info.data.items[r.id]?.shelf
      // Elle açılmış bir rafa "taşınmış" eski kayıtlar da (v1.12) ek raf sayılır, kendi raflarında kalır
      const overrideManual = Boolean(override && info.data.shelves[override]?.manual)
      const extra = manual.filter(([k, v]) => v.rows?.includes(r.id) || (overrideManual && override === k)).map(([k]) => k)
      const dates = dateProp ? toEntries(r.values[dateProp.id]).map(entryEnd).sort() : []
      return {
        row: r,
        title,
        logo: str(r, board.titleImagePropertyId ?? undefined),
        poster: str(r, poster?.id),
        year: str(r, vizyon?.id).slice(0, 4),
        isSeries,
        lastWatched: dates[dates.length - 1] ?? '',
        symbol: info.data.items[r.id]?.image ?? null,
        key: override !== undefined && !overrideManual ? override : autoKey,
        autoKey,
        autoName: auto.name,
        extra,
      }
    })
}

// Raflar: en az 2 yapımı olanlar, elle oluşturulanlar ya da adı / sembolü değiştirilenler
export function buildShelves(items: KoleksiyonItem[], info: KoleksiyonInfo | null) {
  const groups = new Map<string, KoleksiyonItem[]>()
  for (const it of items) {
    if (!it.key) continue
    const g = groups.get(it.key) ?? []
    g.push(it)
    groups.set(it.key, g)
  }
  const data = info?.data
  const list: KoleksiyonShelf[] = [...groups.entries()]
    .filter(([key, g]) => g.length >= 2 || data?.shelves[key] || g.some((it) => data?.items[it.row.id]?.shelf === key))
    .map(([key, g]) => {
      const names = new Map<string, number>()
      for (const it of g) if (it.autoKey === key) names.set(it.autoName, (names.get(it.autoName) ?? 0) + 1)
      // Türkçe adları ortak bir başlangıçla başlıyorsa raf adı o olsun ("Recep İvedik 2" … → "Recep İvedik",
      // "Yüzüklerin Efendisi: İki Kule" … → "Yüzüklerin Efendisi"); yoksa serinin (İngilizce) adı.
      const series = [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? g[0].autoName
      const auto = commonTitle(g.map((it) => it.title)) ?? series
      const symbol: string | null = data?.shelves[key]?.image ?? DEFAULT_SHELF_SYMBOLS[key] ?? null
      return {
        key,
        name: data?.shelves[key]?.name || auto,
        autoName: auto,
        seriesName: series,
        symbol: symbol as string | null,
        custom: Boolean(data?.shelves[key]?.image),
        manual: Boolean(data?.shelves[key]?.manual),
        items: [...g].sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999')),
      }
    })
  // Elle açılmış raflar: içindekiler ayrıca kendi yerlerinde de duruyor. Boşken de görünür (içine
  // "+ Yapım ekle" ile yapım koyulsun).
  for (const [key, v] of Object.entries(data?.shelves ?? {})) {
    if (!v.manual || groups.has(key)) continue
    const name = v.name || tt('Yeni raf')
    const members = items.filter((it) => it.extra.includes(key)).sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999'))
    list.push({ key, name, autoName: name, seriesName: name, symbol: v.image ?? null, custom: Boolean(v.image), manual: true, items: members })
  }
  list.sort((a, b) => Number(Boolean(b.symbol)) - Number(Boolean(a.symbol)) || b.items.length - a.items.length || a.name.localeCompare(b.name, 'tr'))
  // Aynı adı alan raflar (ör. Avatar filmleri ve "Avatar: The Last Airbender" dizileri) serinin kendi adıyla ayrılsın
  const seen = new Map<string, number>()
  for (const sh of list) seen.set(sh.name, (seen.get(sh.name) ?? 0) + 1)
  for (const sh of list) if ((seen.get(sh.name) ?? 0) > 1 && !data?.shelves[sh.key]?.name && sh.seriesName !== sh.name) sh.name = sh.autoName = sh.seriesName
  // Elle açılan raflardakiler kendi yerlerinden (tek başına olanlar dahil) kalkmıyor
  const onShelf = new Set(list.filter((s) => !s.manual).flatMap((s) => s.items.map((it) => it.row.id)))
  const rest = items.filter((it) => !onShelf.has(it.row.id)).sort((a, b) => b.lastWatched.localeCompare(a.lastWatched))
  return { shelves: list, loose: rest }
}

// Seri seti (Y14): kendiliğinden oluşan bir raftaki, o seriye kendiliğinden düşen (elle taşınmamış), afişi olan
// filmler. En az 2 film olmalı; elle açılan raflar sayılmaz (istediğin filmleri koyup paket alınmasın).
export function shelfSetMembers(shelf: KoleksiyonShelf): string[] {
  if (shelf.manual) return []
  const films = shelf.items.filter((it) => !it.isSeries && it.autoKey === shelf.key && it.poster)
  return films.length >= 2 ? films.map((it) => it.row.id) : []
}
