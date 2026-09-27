import type { PropertyValue, Row } from '../types'

// Her yerdeki filtrelerin (vitrin, Ne İzlesem, sayfalar, modlar, tablo) ortak hali. Kullanıcı
// "filtre yaptığım her yerde birden fazla filtre ve ters filtre (şunlar gelsin, şunlar gelmesin)
// olsun" dedi. Her koşul bir sütun: include'dan en az biri OLMALI (boşsa şart yok), exclude'dan
// hiçbiri OLMAMALI. Birden fazla koşul varsa hepsi birden sağlanmalı (VE).
export interface FilterCondition {
  propertyId: string
  include: string[]
  exclude: string[]
}

// Eski tek sütunlu şekil ({ propertyId, optionIds }) + yeni `conditions`. `conditions` varsa o
// geçerli; yoksa eski alanlardan tek koşul üretilir (eski kayıtlar olduğu gibi çalışsın diye).
export interface FilterLike {
  propertyId: string | null
  optionIds: string[]
  conditions?: FilterCondition[]
}

export function filterConditions(f: FilterLike | null | undefined): FilterCondition[] {
  if (!f) return []
  if (f.conditions) return f.conditions.filter((c) => c.include.length > 0 || c.exclude.length > 0)
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

export function rowMatchesConditions(row: Row, conds: FilterCondition[]): boolean {
  for (const c of conds) {
    const ids = valueIds(row.values[c.propertyId])
    if (c.include.length > 0 && !ids.some((id) => c.include.includes(id))) return false
    if (c.exclude.length > 0 && ids.some((id) => c.exclude.includes(id))) return false
  }
  return true
}

// Kaydederken yeni koşulların yanına eski alanları da doldur: ilk "gelsin"li koşul.
// (Eski alanları okuyan yerler — ör. başka bir sürüm — en azından kabaca çalışsın.)
export function withConditions<T extends FilterLike>(f: T, conditions: FilterCondition[]): T {
  const clean = conditions.filter((c) => c.include.length > 0 || c.exclude.length > 0)
  const first = clean.find((c) => c.include.length > 0)
  return { ...f, conditions: clean, propertyId: first?.propertyId ?? null, optionIds: first?.include ?? [] }
}

export function conditionsKey(conds: FilterCondition[]): string {
  return conds.map((c) => `${c.propertyId}:+${c.include.join('.')}:-${c.exclude.join('.')}`).join('|')
}

// Tablo filtresinin adres çubuğundaki hali: "prop:+a.b-c;prop2:-d" (kısa ve okunur kalsın diye).
export function encodeConditions(conds: FilterCondition[]): string {
  return conds
    .filter((c) => c.include.length > 0 || c.exclude.length > 0)
    .map((c) => `${c.propertyId}:${c.include.map((id) => '+' + id).join('')}${c.exclude.map((id) => '-' + id).join('')}`)
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
    for (const m of part.slice(i + 1).matchAll(/([+-])([^+-]+)/g)) (m[1] === '+' ? include : exclude).push(m[2])
    if (include.length || exclude.length) out.push({ propertyId, include, exclude })
  }
  return out
}
