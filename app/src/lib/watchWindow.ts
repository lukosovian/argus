import type { Board, Row, WatchedMap } from '../types'
import { resolveRole } from './roles'
import { entryEnd, isFullDate, toEntries } from './dateRange'

// Bir tarih aralığında (from..to, ikisi de dahil, "YYYY-AA-GG") ne izlendiğini bulan ortak yardımcılar —
// İstatistikler'in tarih aralığı/yıl kıyası ve Abonelik'in "son 30 gün" hesabı aynı kuralı kullansın diye.
export interface DateWindow {
  from: string
  to: string
}

export const dayIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Bölüm süresi bilinmeyen dizilerde varsayılan (sunucudaki platform özetiyle aynı)
export const DEFAULT_EPISODE_MIN = 40

// Kategori seçeneğinin adından dizi mi (İstatistikler'deki kuralla aynı)
export function isSeriesRow(board: Board, row: Row): boolean {
  const kategori = resolveRole(board, 'kategori')
  if (!kategori) return false
  const label = kategori.options?.find((o) => o.id === row.values[kategori.id])?.label ?? ''
  return /dizi|series|tv/i.test(label)
}

// Bir izleme öğesi ("2024-05-01", "2024-05-01/2024-05-03", "2019", "?") aralığa giriyor mu?
// Tam tarihlerde bitiş günü sayılır. Sadece yılı bilinenler (fullOnly değilse) yılın tamamı aralıkta kalıyorsa sayılır.
export function entryInWindow(entry: string, w: DateWindow, fullOnly = false): boolean {
  const d = entryEnd(entry)
  if (!d) return false
  if (isFullDate(d)) {
    const day = d.slice(0, 10)
    return day >= w.from && day <= w.to
  }
  if (fullOnly) return false
  if (/^\d{4}$/.test(d)) return `${d}-01-01` >= w.from && `${d}-12-31` <= w.to
  if (/^\d{4}-\d{2}$/.test(d)) return `${d}-01` >= w.from && `${d}-31` <= w.to
  return false
}

// Satırın aralıktaki izleme tarihi öğeleri
export function rowEntriesInWindow(board: Board, row: Row, w: DateWindow, fullOnly = false): string[] {
  const tarih = resolveRole(board, 'izlemeTarihi')
  if (!tarih) return []
  return toEntries(row.values[tarih.id]).filter((e) => entryInWindow(e, w, fullOnly))
}

// Satırın aralıkta işaretlenen bölüm tikleri (tarih listesi; tekrar izlemeler dahil)
export function episodeDatesInWindow(watched: WatchedMap, rowId: string, w: DateWindow): string[] {
  const out: string[] = []
  for (const list of Object.values(watched[rowId] ?? {})) for (const d of list) if (d && d.slice(0, 10) >= w.from && d.slice(0, 10) <= w.to && isFullDate(d)) out.push(d.slice(0, 10))
  return out
}

// Satırın Süre değeri (dakika): filmde filmin süresi, dizide bölüm süresi (v1.24)
export function rowMinutes(board: Board, row: Row): number {
  const sure = resolveRole(board, 'sure')
  const v = sure ? row.values[sure.id] : undefined
  return typeof v === 'number' && v > 0 ? v : 0
}

// Aralıkta izlenen yaklaşık süre (dakika): filmde aralıktaki her izleme × film süresi, dizide aralıktaki
// her bölüm × bölüm süresi (bilinmiyorsa 40 dk). Dizinin bölüm tiki yoksa izleme tarihi sayılmaz (süresi bilinmez).
export function minutesInWindow(board: Board, row: Row, watched: WatchedMap, w: DateWindow, fullOnly = true): { minutes: number; episodes: number; views: number } {
  if (isSeriesRow(board, row)) {
    const eps = episodeDatesInWindow(watched, row.id, w).length
    return { minutes: eps * (rowMinutes(board, row) || DEFAULT_EPISODE_MIN), episodes: eps, views: 0 }
  }
  const views = rowEntriesInWindow(board, row, w, fullOnly).length
  return { minutes: views * rowMinutes(board, row), episodes: 0, views }
}
