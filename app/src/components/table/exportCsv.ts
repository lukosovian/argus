import Papa from 'papaparse'
import type { Board, PropertyDef, PropertyValue, Row } from '../../types'
import { ratingAverage, titleText } from '../../types'
import { formatEntry } from '../../lib/dateRange'
import { isoDate, tt } from '../../lib/i18n'

// Bir hücrenin okunur yazı hali: seçeneklerin etiketi, tarihler gün.ay.yıl, puanların ortalaması…
function cellText(p: PropertyDef, v: PropertyValue, labels: Map<string, string> | undefined): string {
  if (p.type === 'rating') {
    const avg = ratingAverage(v, p)
    return avg === null ? '' : avg.toFixed(1)
  }
  if (v === undefined || v === null || v === '') return ''
  switch (p.type) {
    case 'select':
      return labels?.get(v as string) ?? ''
    case 'multiselect':
      return Array.isArray(v) ? (v as string[]).map((id) => labels?.get(id) ?? '').filter(Boolean).join(', ') : ''
    case 'date':
      return typeof v === 'string' ? (isoDate(v) ?? v) : ''
    case 'multidate':
      return Array.isArray(v) ? (v as string[]).map((d) => formatEntry(d, (x) => isoDate(x) ?? x)).join(', ') : ''
    case 'checkbox':
      return v ? tt('Evet') : ''
    case 'number':
      return typeof v === 'number' ? String(v) : ''
    default:
      return typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : ''
  }
}

// Görünen sütunlar (tablodaki sırayla) ve verilen kayıtlar → CSV dosyası indirilir. Başına UTF-8 BOM konuyor ki
// Excel Türkçe karakterleri (ş, ğ, ı…) bozmadan açsın.
export function downloadRowsCsv(board: Board, rows: Row[], columns: PropertyDef[]) {
  const labelMaps = new Map<string, Map<string, string>>()
  for (const p of columns) if (p.options) labelMaps.set(p.id, new Map(p.options.map((o) => [o.id, o.label])))
  const fields = columns.map((p) => p.name)
  const data = rows.map((r) =>
    columns.map((p) => (p.id === board.titlePropertyId ? titleText(p, r.values[p.id]) : cellText(p, r.values[p.id], labelMaps.get(p.id)))),
  )
  const csv = Papa.unparse({ fields, data })
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(board.name || tt('Arşiv')).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'arsiv'}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
