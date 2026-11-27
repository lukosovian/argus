import { ratingAverage, todayIso, type Board, type PropertyValue, type Row } from '../types'
import { isFullDate, isUnknownDate, isYearOnly, parseEntry } from './dateRange'

// Her yerdeki filtrelerin (vitrin, Ne İzlesem, sayfalar, modlar, tablo) ortak hali. Kullanıcı
// "filtre yaptığım her yerde birden fazla filtre ve ters filtre (şunlar gelsin, şunlar gelmesin)
// olsun" dedi. Her koşul bir sütun: include'dan en az biri (includeMode 'all' ise hepsi) OLMALI (boşsa şart yok), exclude'dan
// hiçbiri OLMAMALI. Birden fazla koşul varsa hepsi birden sağlanmalı (VE).
export interface FilterCondition {
  propertyId: string
  include: string[]
  exclude: string[]
  // Y16 (v1.26, arşiv tablosunda): sayı/puan aralığı ("8 ve üstü"), tarih aralığı ("2023'te izlediklerim"; uçlar
  // "YYYY-AA-GG" ya da sadece yıl "YYYY"), hazır tarih kısayolu (o günün tarihine göre hesaplanır — kayıtlı görünümdeki
  // "bu yıl" seneye de "bu yıl" kalsın diye) ve boş / dolu olanlar.
  min?: number
  max?: number
  from?: string
  to?: string
  rel?: RelativeRange
  presence?: 'empty' | 'filled'
  // A7 (v1.27): çoklu seçim sütununda ✓'lerin "en az biri" ('any', varsayılan — eski kayıtlarda alan yok)
  // mi yoksa "hepsi birden" ('all') mi olsun. Ör. Türler: Komedi + Dram → ikisi de olan yapımlar.
  includeMode?: 'any' | 'all'
}

export type RelativeRange = 'buYil' | 'gecenYil' | 'buAy' | 'gecenAy' | 'son30'
const RELS: RelativeRange[] = ['buYil', 'gecenYil', 'buAy', 'gecenAy', 'son30']

// Koşulda bir şart var mı (seçenek, aralık ya da boş/dolu)
export function isActiveCondition(c: FilterCondition): boolean {
  return (
    c.include.length > 0 ||
    c.exclude.length > 0 ||
    c.min !== undefined ||
    c.max !== undefined ||
    Boolean(c.from) ||
    Boolean(c.to) ||
    Boolean(c.rel) ||
    Boolean(c.presence)
  )
}

const pad2 = (n: number) => String(n).padStart(2, '0')
// Kısayolun bugünkü karşılığı: [başlangıç, bitiş] (ikisi de dahil)
export function relativeBounds(rel: RelativeRange, today = todayIso()): [string, string] {
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))
  const lastDay = (yy: number, mm: number) => new Date(yy, mm, 0).getDate()
  switch (rel) {
    case 'buYil':
      return [`${y}-01-01`, `${y}-12-31`]
    case 'gecenYil':
      return [`${y - 1}-01-01`, `${y - 1}-12-31`]
    case 'buAy':
      return [`${y}-${pad2(m)}-01`, `${y}-${pad2(m)}-${pad2(lastDay(y, m))}`]
    case 'gecenAy': {
      const py = m === 1 ? y - 1 : y
      const pm = m === 1 ? 12 : m - 1
      return [`${py}-${pad2(pm)}-01`, `${py}-${pad2(pm)}-${pad2(lastDay(py, pm))}`]
    }
    case 'son30': {
      const d = new Date(y, m - 1, Number(today.slice(8, 10)) - 29)
      return [`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, today]
    }
  }
}

function isEmptyValue(v: PropertyValue | undefined): boolean {
  if (v === undefined || v === null || v === '' || v === false) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return !Object.values(v).some((x) => typeof x === 'number')
  return false
}

// Sayı ya da puan (kriterli puanda ortalama). Arşiv verilmezse kayıttaki bütün kriterlerin ortalaması.
function numericValue(v: PropertyValue | undefined, propertyId: string, board?: Board): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v.replace(',', '.')))) return Number(v.replace(',', '.'))
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const p = board?.properties.find((x) => x.id === propertyId)
    if (p) return ratingAverage(v, p)
    const nums = Object.values(v).filter((x): x is number => typeof x === 'number')
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
  }
  return null
}

// Tarih değerinin kapsadığı aralıklar (tek gün, "başladım → bitirdim", sadece yıl); "?" sayılmaz.
function dateSpans(v: PropertyValue | undefined): [string, string][] {
  const list = Array.isArray(v) ? (v as unknown[]).map(String) : typeof v === 'string' && v ? [v] : []
  const out: [string, string][] = []
  for (const s of list) {
    if (isUnknownDate(s)) continue
    if (isYearOnly(s)) {
      out.push([`${s}-01-01`, `${s}-12-31`])
      continue
    }
    if (!isFullDate(s)) continue
    const e = parseEntry(s)
    out.push([e.start.slice(0, 10), (e.end ?? e.start).slice(0, 10)])
  }
  return out
}

const boundFrom = (s: string) => (/^\d{4}$/.test(s) ? `${s}-01-01` : s)
const boundTo = (s: string) => (/^\d{4}$/.test(s) ? `${s}-12-31` : s)

// Eski tek sütunlu şekil ({ propertyId, optionIds }) + yeni `conditions`. `conditions` varsa o
// geçerli; yoksa eski alanlardan tek koşul üretilir (eski kayıtlar olduğu gibi çalışsın diye).
export interface FilterLike {
  propertyId: string | null
  optionIds: string[]
  conditions?: FilterCondition[]
}

export function filterConditions(f: FilterLike | null | undefined): FilterCondition[] {
  if (!f) return []
  if (f.conditions) return f.conditions.filter(isActiveCondition)
  if (f.propertyId && f.optionIds.length > 0) return [{ propertyId: f.propertyId, include: f.optionIds, exclude: [] }]
  return []
}

export function hasActiveFilter(f: FilterLike | null | undefined): boolean {
  return filterConditions(f).length > 0
}

function valueIds(v: PropertyValue | undefined): string[] {
  if (Array.isArray(v)) return v as string[]
  return typeof v === 'string' && v ? [v] : []
}

// `board`: kriterli puanların ortalaması tablodakiyle aynı hesaplansın diye (verilmezse kayıttaki kriterlere bakılır)
export function rowMatchesConditions(row: Row, conds: FilterCondition[], board?: Board): boolean {
  for (const c of conds) {
    const v = row.values[c.propertyId]
    if (c.presence) {
      const empty = isEmptyValue(v)
      if (c.presence === 'empty' ? !empty : empty) return false
    }
    if (c.include.length > 0 || c.exclude.length > 0) {
      const ids = valueIds(v)
      if (c.include.length > 0) {
        const ok = c.includeMode === 'all' ? c.include.every((id) => ids.includes(id)) : ids.some((id) => c.include.includes(id))
        if (!ok) return false
      }
      if (c.exclude.length > 0 && ids.some((id) => c.exclude.includes(id))) return false
    }
    if (c.min !== undefined || c.max !== undefined) {
      const n = numericValue(v, c.propertyId, board)
      if (n === null) return false
      if (c.min !== undefined && n < c.min) return false
      if (c.max !== undefined && n > c.max) return false
    }
    if (c.rel || c.from || c.to) {
      const [lo, hi] = c.rel ? relativeBounds(c.rel) : [c.from ? boundFrom(c.from) : '0000', c.to ? boundTo(c.to) : '9999']
      if (!dateSpans(v).some(([a, b]) => b >= lo && a <= hi)) return false
    }
  }
  return true
}

// Kaydederken yeni koşulların yanına eski alanları da doldur: ilk "gelsin"li koşul.
// (Eski alanları okuyan yerler — ör. başka bir sürüm — en azından kabaca çalışsın.)
export function withConditions<T extends FilterLike>(f: T, conditions: FilterCondition[]): T {
  const clean = conditions.filter(isActiveCondition)
  const first = clean.find((c) => c.include.length > 0)
  return { ...f, conditions: clean, propertyId: first?.propertyId ?? null, optionIds: first?.include ?? [] }
}

// Aralık / boş-dolu şartlarının yazımı: "~min=8~max=10~from=2023~to=2023-06-30~rel=buYil~p=e"
function extrasPart(c: FilterCondition): string {
  const parts: string[] = []
  if (c.min !== undefined) parts.push(`min=${c.min}`)
  if (c.max !== undefined) parts.push(`max=${c.max}`)
  if (c.from) parts.push(`from=${c.from}`)
  if (c.to) parts.push(`to=${c.to}`)
  if (c.rel) parts.push(`rel=${c.rel}`)
  if (c.presence) parts.push(`p=${c.presence === 'empty' ? 'e' : 'f'}`)
  if (c.includeMode === 'all') parts.push('m=all')
  return parts.map((x) => '~' + x).join('')
}

export function conditionsKey(conds: FilterCondition[]): string {
  return conds.map((c) => `${c.propertyId}:+${c.include.join('.')}:-${c.exclude.join('.')}${extrasPart(c)}`).join('|')
}

// Tablo filtresinin adres çubuğundaki hali: "prop:+a.b-c;prop2:-d~min=8" (kısa ve okunur kalsın diye).
export function encodeConditions(conds: FilterCondition[]): string {
  return conds
    .filter(isActiveCondition)
    .map((c) => `${c.propertyId}:${c.include.map((id) => '+' + id).join('')}${c.exclude.map((id) => '-' + id).join('')}${extrasPart(c)}`)
    .join(';')
}

export function decodeConditions(s: string | null): FilterCondition[] {
  if (!s) return []
  const out: FilterCondition[] = []
  for (const part of s.split(';')) {
    const i = part.indexOf(':')
    if (i <= 0) continue
    const propertyId = part.slice(0, i)
    const include: string[] = []
    const exclude: string[] = []
    const [head, ...extras] = part.slice(i + 1).split('~')
    for (const m of head.matchAll(/([+-])([^+-]+)/g)) (m[1] === '+' ? include : exclude).push(m[2])
    const c: FilterCondition = { propertyId, include, exclude }
    for (const x of extras) {
      const eq = x.indexOf('=')
      if (eq <= 0) continue
      const k = x.slice(0, eq)
      const val = x.slice(eq + 1)
      if ((k === 'min' || k === 'max') && val !== '' && Number.isFinite(Number(val))) c[k] = Number(val)
      else if ((k === 'from' || k === 'to') && /^\d{4}(-\d{2}-\d{2})?$/.test(val)) c[k] = val
      else if (k === 'rel' && (RELS as string[]).includes(val)) c.rel = val as RelativeRange
      else if (k === 'p' && (val === 'e' || val === 'f')) c.presence = val === 'e' ? 'empty' : 'filled'
      else if (k === 'm' && val === 'all') c.includeMode = 'all'
    }
    if (isActiveCondition(c)) out.push(c)
  }
  return out
}
