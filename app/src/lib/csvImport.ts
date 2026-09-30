import { makeId, RATING_OVERALL, type PropertyDef, type PropertyType, type PropertyValue, type SelectOption } from '../types'
import { makeEntry } from './dateRange'

const IMAGE_HINTS = ['banner', 'görsel', 'gorsel', 'kapak', 'cover', 'image', 'foto', 'poster']

// ---- Tarihler -----------------------------------------------------------------------------------
// Notion dili İngilizceyken "March 12, 2023", Türkçeyken "12/03/2023" ya da "12 Mart 2023", bazen saatli
// ("February 1, 2024 1:00 AM"); aralıklar "… → …". Hepsi YYYY-AA-GG'ye çevriliyor. Yeni bir kullanıcının
// Notion listesiyle yapılan denemede İngilizce tarihler hiç tanınmıyor, düz yazı olarak kalıyordu.
const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6, temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')
function iso(y: number, m: number, d: number) {
  if (!(y > 1800 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return ''
  return `${y}-${pad(m)}-${pad(d)}`
}

// Tek bir tarih → 'YYYY-AA-GG' ya da ''. `yearOnly`: sadece yıl yazılmışsa (ör. "1994") yılın ilk günü.
export function parseDateLoose(raw: string, yearOnly = false): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  // Saat ve saat dilimi at: "1:00 AM", "13:45", "(GMT+3)"
  s = s.replace(/\(.*?\)/g, '').replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\s*$/i, '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (m) {
    let d = +m[1]
    let mo = +m[2]
    // ABD biçimi (ay/gün) sadece gün 12'den büyükse anlaşılıyor; belirsizse Türkiye biçimi (gün/ay)
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]
    return iso(+m[3], mo, d)
  }
  m = s.match(/^([A-Za-zÇĞİÖŞÜçğıöşü]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m && MONTHS[m[1].toLocaleLowerCase('tr')]) return iso(+m[3], MONTHS[m[1].toLocaleLowerCase('tr')], +m[2])
  m = s.match(/^(\d{1,2})\.?\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\.?,?\s+(\d{4})$/)
  if (m && MONTHS[m[2].toLocaleLowerCase('tr')]) return iso(+m[3], MONTHS[m[2].toLocaleLowerCase('tr')], +m[1])
  if (yearOnly) {
    m = s.match(/^(\d{4})$/)
    if (m) return iso(+m[1], 1, 1)
  }
  return ''
}

function hasRangeSeparator(raw: string) {
  return raw.includes('→') || raw.includes('->')
}

// Birden çok tarih/aralık: ";" ile, ya da arkasından yıl gelmeyen virgülle ayrılmış ("March 12, 2023" içindeki
// virgül bölmesin). Her parça tek tarih ya da "başlangıç → bitiş".
export function parseDateEntries(raw: string): string[] {
  const value = (raw ?? '').trim()
  if (!value) return []
  return value
    .split(/;|,(?!\s*\d{4}\b)/)
    .map((part) => {
      const [a, b] = part.split(/→|->/).map((x) => parseDateLoose(x))
      return a ? makeEntry(a, b || null) : ''
    })
    .filter(Boolean)
}

function isDateLike(raw: string) {
  return parseDateEntries(raw).length > 0
}

// ---- Puanlar ------------------------------------------------------------------------------------
// "⭐⭐⭐⭐" / "★★★½" (5 üzerinden), "8/10", "4/5", "8,5" → 10 üzerinden puan. `max`: sütundaki en büyük
// çıplak sayı 5'i geçmiyorsa sayılar 5 üzerinden kabul edilir.
export function parseScore(raw: string, fiveScale = false): number | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  const stars = [...s].filter((c) => c === '⭐' || c === '★').length
  if (stars) {
    const half = /½/.test(s) ? 0.5 : 0
    return Math.min(10, (stars + half) * 2)
  }
  const m = s.replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?/)
  if (!m) return null
  const n = Number(m[1])
  const outOf = m[2] ? Number(m[2]) : fiveScale ? 5 : 10
  if (!Number.isFinite(n) || !outOf) return null
  return Math.max(0, Math.min(10, Math.round((n / outOf) * 10 * 10) / 10))
}

export function isFiveScale(values: string[]) {
  const nums = values.map((v) => v.trim()).filter((v) => /^\d+([.,]\d+)?$/.test(v)).map((v) => Number(v.replace(',', '.')))
  return nums.length > 0 && Math.max(...nums) <= 5
}

const YES = ['true', 'evet', 'yes', '1', '✓', 'x', 'var', 'checked']
const NO = ['false', 'hayır', 'hayir', 'no', '0', 'yok', 'unchecked']

function normalize(s: string) {
  return s.toLocaleLowerCase('tr')
}

export function inferColumnType(header: string, values: string[]): PropertyType {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean)
  if (nonEmpty.length === 0) return 'text'

  if (IMAGE_HINTS.some((h) => normalize(header).includes(h))) return 'image'

  // Evet/Hayır, Yes/No → onay kutusu
  if (nonEmpty.every((v) => YES.includes(normalize(v)) || NO.includes(normalize(v)))) return 'checkbox'

  const dateFraction = nonEmpty.filter(isDateLike).length / nonEmpty.length
  if (dateFraction > 0.6) return nonEmpty.some(hasRangeSeparator) ? 'multidate' : 'date'

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
// sıfırdan seçenek üretmesinden farklı olarak var olanları KORUR. `rename`: CSV değeri → şablondaki
// seçeneğin etiketi (ör. Notion'daki "Bitti" → "İzlendi"); eşlenen değer için yeni seçenek açılmaz.
export function mergeOptionsFromValues(property: PropertyDef, values: string[], rename?: Map<string, string>): PropertyDef {
  if (property.type !== 'select' && property.type !== 'multiselect') return property
  const options = [...(property.options ?? [])]
  const byLabel = new Set(options.map((o) => o.label))
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean)

  function addLabel(label: string) {
    const l = rename?.get(label) ?? label
    if (byLabel.has(l)) return
    byLabel.add(l)
    options.push({ id: makeId(), label: l, colorIndex: options.length })
  }

  if (property.type === 'select') {
    nonEmpty.forEach(addLabel)
  } else {
    nonEmpty.forEach((v) => v.split(',').forEach((t) => t.trim() && addLabel(t.trim())))
  }
  return { ...property, options }
}

export interface ParseContext {
  // Seçim değerlerinin yeniden adlandırılması (ör. "Bitti" → "İzlendi")
  rename?: Map<string, string>
  // Puan sütunundaki çıplak sayılar 5 üzerinden mi
  fiveScale?: boolean
  // Tarih sütununa sadece yıl yazılmışsa yılın ilk gününü kullan (Vizyon Tarihi)
  yearOnly?: boolean
}

export function parseCellValue(property: PropertyDef, raw: string, ctx: ParseContext = {}): PropertyValue {
  const value = (raw ?? '').trim()
  if (!value) return property.type === 'multiselect' || property.type === 'multidate' ? [] : property.type === 'checkbox' ? false : ''

  switch (property.type) {
    case 'date':
      // Aralık yazılmışsa başlangıcı
      return parseDateLoose(value.split(/→|->/)[0], ctx.yearOnly)
    // Birden fazla tarih; Notion'un "12/03/2023 → 20/03/2023" ya da "March 12, 2023 → March 20, 2023" aralıkları
    // başlangıç/bitiş olarak.
    case 'multidate':
      return parseDateEntries(value)
    case 'number': {
      const n = Number(value.replace(',', '.'))
      return Number.isFinite(n) ? n : ''
    }
    case 'checkbox':
      return YES.includes(normalize(value))
    case 'rating': {
      // Kriterli puan alanına tek (genel) puan olarak yazılır; kriterler boş kalır (bkz. types.ts RATING_OVERALL)
      const score = parseScore(value, ctx.fiveScale)
      if (score === null) return {}
      return { [RATING_OVERALL]: score }
    }
    case 'select': {
      const label = ctx.rename?.get(value) ?? value
      const opt = property.options?.find((o) => o.label === label)
      return opt ? opt.id : ''
    }
    case 'multiselect': {
      const tokens = value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      return tokens.map((t) => property.options?.find((o) => o.label === (ctx.rename?.get(t) ?? t))?.id).filter((id): id is string => Boolean(id))
    }
    default:
      return value
  }
}
