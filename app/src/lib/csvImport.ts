import { makeId, type PropertyDef, type PropertyType, type PropertyValue, type SelectOption } from '../types'

const IMAGE_HINTS = ['banner', 'görsel', 'gorsel', 'kapak', 'cover', 'image', 'foto', 'poster']
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

function isDateLike(raw: string) {
  return DATE_RE.test(raw.trim())
}

function hasRangeSeparator(raw: string) {
  return raw.includes('→') || raw.includes('->')
}

function toIsoDate(raw: string): string {
  const m = raw.trim().match(DATE_RE)
  if (!m) return ''
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function normalize(s: string) {
  return s.toLocaleLowerCase('tr')
}

export function inferColumnType(header: string, values: string[]): PropertyType {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean)
  if (nonEmpty.length === 0) return 'text'

  if (IMAGE_HINTS.some((h) => normalize(header).includes(h))) return 'image'

  const rangeFraction = nonEmpty.filter(hasRangeSeparator).length / nonEmpty.length
  if (rangeFraction > 0.2) return 'text'

  const dateFraction = nonEmpty.filter(isDateLike).length / nonEmpty.length
  if (dateFraction > 0.6) return 'date'

  const numberFraction = nonEmpty.filter((v) => Number.isFinite(Number(v.replace(',', '.')))).length / nonEmpty.length
  if (numberFraction > 0.9) return 'number'

  const commaFraction = nonEmpty.filter((v) => v.includes(',')).length / nonEmpty.length
  if (commaFraction > 0.2) {
    const tokens = new Set<string>()
    nonEmpty.forEach((v) => v.split(',').forEach((t) => tokens.add(t.trim())))
    if (tokens.size <= 120 && tokens.size <= nonEmpty.length * 0.9) return 'multiselect'
  }

  const distinct = new Set(nonEmpty)
  if (distinct.size <= 40 && distinct.size <= nonEmpty.length * 0.6) return 'select'

  return 'text'
}

function buildOptions(labels: string[]): SelectOption[] {
  return labels.map((label, i) => ({ id: makeId(), label, colorIndex: i }))
}

export function buildProperty(header: string, type: PropertyType, values: string[]): PropertyDef {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean)
  if (type === 'select') {
    const seen: string[] = []
    nonEmpty.forEach((v) => {
      if (!seen.includes(v)) seen.push(v)
    })
    return { id: makeId(), name: header, type, options: buildOptions(seen) }
  }
  if (type === 'multiselect') {
    const seen: string[] = []
    nonEmpty.forEach((v) =>
      v.split(',').forEach((t) => {
        const trimmed = t.trim()
        if (trimmed && !seen.includes(trimmed)) seen.push(trimmed)
      }),
    )
    return { id: makeId(), name: header, type, options: buildOptions(seen) }
  }
  return { id: makeId(), name: header, type }
}

// Şablon kullanılan içe aktarımda select/multiselect sütunları BAŞTAN bazı seçeneklerle
// gelebiliyor (ör. şablonun Kategori/Durum'u) — CSV'deki değerler bu mevcut seçeneklerle
// birleştirilir (etikete göre eşleşir, yoksa yeni seçenek eklenir), `buildProperty`'nin
// sıfırdan seçenek üretmesinden farklı olarak var olanları KORUR.
export function mergeOptionsFromValues(property: PropertyDef, values: string[]): PropertyDef {
  if (property.type !== 'select' && property.type !== 'multiselect') return property
  const options = [...(property.options ?? [])]
  const byLabel = new Set(options.map((o) => o.label))
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean)

  function addLabel(label: string) {
    if (byLabel.has(label)) return
    byLabel.add(label)
    options.push({ id: makeId(), label, colorIndex: options.length })
  }

  if (property.type === 'select') {
    nonEmpty.forEach(addLabel)
  } else {
    nonEmpty.forEach((v) => v.split(',').forEach((t) => t.trim() && addLabel(t.trim())))
  }
  return { ...property, options }
}

export function parseCellValue(property: PropertyDef, raw: string): PropertyValue {
  const value = (raw ?? '').trim()
  if (!value) return property.type === 'multiselect' ? [] : property.type === 'checkbox' ? false : ''

  switch (property.type) {
    case 'date':
      return toIsoDate(value)
    case 'number': {
      const n = Number(value.replace(',', '.'))
      return Number.isFinite(n) ? n : ''
    }
    case 'checkbox':
      return ['true', 'evet', 'yes', '1', '✓', 'x'].includes(normalize(value))
    case 'select': {
      const opt = property.options?.find((o) => o.label === value)
      return opt ? opt.id : ''
    }
    case 'multiselect': {
      const tokens = value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      return tokens.map((t) => property.options?.find((o) => o.label === t)?.id).filter((id): id is string => Boolean(id))
    }
    default:
      return value
  }
}
