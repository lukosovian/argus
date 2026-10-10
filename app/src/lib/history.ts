import type { Board, PropertyValue } from '../types'
import { tt, fmtDate } from './i18n'

// Arşiv geçmişi (bkz. server/history.js) — değişiklik kayıtlarını okunur hale getiren yardımcılar.
export interface HistoryChange {
  prop: string
  from: PropertyValue | null
  to: PropertyValue | null
}
export interface HistoryEntry {
  id: string
  t: number
  type: 'create' | 'update' | 'delete'
  rowId: string
  title: string
  changes?: HistoryChange[]
  // 'undo': geçmişten geri alınarak, 'restore': arşiv bir güne döndürülerek yapılan değişiklik
  // 'backup': özellik gelmeden önceki yedeklerden sonradan çıkarıldı (saat yaklaşık)
  note?: 'undo' | 'restore' | 'backup'
}
export interface HistoryDay {
  day: string
  created: number
  updated: number
  deleted: number
  snapshot: boolean
}


export function formatStamp(ms: number, withTime = true): string {
  const d = new Date(ms)
  const base = fmtDate(d.getFullYear(), d.getMonth(), d.getDate(), { short: true })
  return withTime ? `${base} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : base
}

// "2026-09-27" (ya da "2026-09-27_donus-oncesi-1405") → "27 Eylül 2026" / "27 Eylül 2026 · 14:05 dönüşünden önce"
export function formatDayKey(key: string): string {
  const [day, extra] = key.split('_')
  const [y, m, d] = day.split('-').map(Number)
  const base = fmtDate(y, (m || 1) - 1, d)
  const hm = extra?.match(/donus-oncesi-(\d{2})(\d{2})/)
  return hm ? tt('{0} · {1}:{2}\'de geri dönmeden önceki hali', base, hm[1], hm[2]) : base
}

// Bir alanın değerini kısa, okunur bir metne çevirir (seçenek id'leri → etiket, tarih, görsel...).
export function formatValue(board: Board, propId: string, v: PropertyValue | null): string {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return '—'
  const p = board.properties.find((x) => x.id === propId)
  if (!p) return typeof v === 'string' ? v : JSON.stringify(v)
  if (p.type === 'select' || p.type === 'multiselect') {
    const ids = Array.isArray(v) ? (v as string[]) : [v as string]
    const labels = ids.map((id) => p.options?.find((o) => o.id === id)?.label ?? '?')
    return labels.length > 4 ? `${labels.slice(0, 4).join(', ')} +${labels.length - 4}` : labels.join(', ')
  }
  if (p.type === 'image') return tt('görsel')
  if (p.type === 'checkbox') return v ? tt('Evet') : tt('Hayır')
  if (p.type === 'rating' && typeof v === 'object' && !Array.isArray(v)) {
    const nums = Object.values(v as Record<string, number>).filter((n) => typeof n === 'number')
    return nums.length ? `★ ${(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)}` : '—'
  }
  if (Array.isArray(v)) return (v as unknown[]).map((x) => String(x).replace('/', ' → ')).join(', ')
  const s = String(v)
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

export function propName(board: Board, propId: string): string {
  return board.properties.find((p) => p.id === propId)?.name ?? tt('Silinmiş sütun')
}

// Bir değişikliğin tek satırlık özeti: "Durum: İzlenecek → İzlendi" (çok alan değiştiyse ilk ikisi + sayı).
export function summarizeEntry(board: Board, e: HistoryEntry): string {
  if (e.type === 'create') return tt('Eklendi')
  if (e.type === 'delete') return tt('Silindi')
  const ch = e.changes ?? []
  const parts = ch.slice(0, 2).map((c) => {
    const p = board.properties.find((x) => x.id === c.prop)
    if (p?.type === 'image') return tt('{0} değişti', p.name)
    if (p?.type === 'longtext') return tt('{0} değişti', p.name)
    return `${propName(board, c.prop)}: ${formatValue(board, c.prop, c.from)} → ${formatValue(board, c.prop, c.to)}`
  })
  return parts.join(' · ') + (ch.length > 2 ? tt(' · +{0} alan', ch.length - 2) : '')
}
