import { RATING_OVERALL, ratingAverage, type PropertyDef, type PropertyValue } from '../../types'
import { detectDateOrder, parseDateEntries, parseDateLoose, parseScore } from '../../lib/csvImport'
import { searchFold } from '../../lib/search'

// Hücre kopyala-yapıştır (v1.26, Y19). Kopyalanan değer panoya Excel'in de anlayacağı düz yazı olarak gider (seçimlerde
// etiketi, tarih listelerinde virgülle); ARGUS içinde aynı tipte bir sütuna yapıştırılırsa asıl değer (seçenek id'leri,
// kriterli puan) olduğu gibi kullanılır. Excel'den gelen çok hücreli metin satırlara (\n) ve sütunlara (\t) bölünür.

// Son kopyalanan hücre — panodaki yazı hâlâ buysa yapıştırmada asıl değer kullanılır
let lastCopy: { text: string; type: PropertyDef['type']; propertyId: string; value: PropertyValue } | null = null

export function rememberCopy(text: string, property: PropertyDef, value: PropertyValue) {
  lastCopy = { text, type: property.type, propertyId: property.id, value }
}

// Panodaki yazı ARGUS'ta kopyalanan hücreyse ve hedef aynı tipteyse asıl değer (aynı sütun değilse seçim id'leri
// geçersiz olacağı için seçimlerde sadece aynı sütun)
export function rawFromCopy(text: string, target: PropertyDef): PropertyValue | undefined {
  if (!lastCopy || lastCopy.text !== text || lastCopy.type !== target.type) return undefined
  if ((target.type === 'select' || target.type === 'multiselect' || target.type === 'rating') && lastCopy.propertyId !== target.id) return undefined
  return lastCopy.value
}

export function cellToText(property: PropertyDef, v: PropertyValue | undefined): string {
  if (v === undefined || v === null || v === '') return ''
  switch (property.type) {
    case 'select':
      return property.options?.find((o) => o.id === v)?.label ?? ''
    case 'multiselect':
      return Array.isArray(v) ? v.map((id) => property.options?.find((o) => o.id === id)?.label).filter(Boolean).join(', ') : ''
    case 'multidate':
      return Array.isArray(v) ? (v as string[]).map((d) => d.replace('/', ' → ')).join(', ') : String(v)
    case 'checkbox':
      return v ? '✓' : ''
    case 'rating': {
      const avg = ratingAverage(v, property)
      return avg === null ? '' : String(Math.round(avg * 10) / 10)
    }
    default:
      return typeof v === 'object' ? '' : String(v)
  }
}

// Excel / Google Sheets'ten gelen metin: satırlar ve sekmeyle ayrılmış hücreler. Tırnaklı (içinde satır sonu olan)
// hücreler de doğru bölünür.
export function parseClipboardGrid(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === '\t') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const YES = ['✓', 'x', 'evet', 'yes', 'true', '1', 'var', 'doğru', 'dogru']

// Yazıyı sütunun tipine çevirir. Seçimlerde etiketle eşleşir; olmayan etiketler `newLabels`'a eklenir (çağıran taraf
// seçenekleri TEK seferde açar — tek tek açmak birbirinin üstüne yazıyordu, bkz. BoardView.deleteOptions notu) ve
// onlar için geçici "label:" değerleri döner. undefined: bu hücreye yazılacak bir şey yok (anlaşılamadı).
export function textToValue(property: PropertyDef, text: string, newLabels: Set<string>): PropertyValue | undefined {
  const t = text.trim()
  const optionByLabel = (label: string) => {
    const f = searchFold(label)
    return property.options?.find((o) => searchFold(o.label) === f)?.id
  }
  switch (property.type) {
    case 'text':
    case 'longtext':
    case 'url':
    case 'image':
      return t
    case 'number': {
      if (!t) return ''
      const n = Number(t.replace(/\s/g, '').replace(',', '.'))
      return Number.isFinite(n) ? n : undefined
    }
    case 'checkbox':
      return YES.includes(t.toLocaleLowerCase('tr'))
    case 'select': {
      if (!t) return ''
      const id = optionByLabel(t)
      if (id) return id
      newLabels.add(t)
      return `label:${t}`
    }
    case 'multiselect': {
      if (!t) return []
      return t
        .split(/[,;]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((label) => {
          const id = optionByLabel(label)
          if (id) return id
          newLabels.add(label)
          return `label:${label}`
        })
    }
    case 'date': {
      if (!t) return ''
      const d = parseDateLoose(t.split(/→|->/)[0], true, detectDateOrder([t]))
      return d || undefined
    }
    case 'multidate': {
      if (!t) return []
      const e = parseDateEntries(t, detectDateOrder([t]), true)
      return e.length ? e : undefined
    }
    case 'rating': {
      if (!t) return {}
      const n = parseScore(t)
      return n === null ? undefined : { [RATING_OVERALL]: n }
    }
    default:
      return undefined
  }
}
