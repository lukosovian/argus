import { useEffect, useState } from 'react'
import { api } from './api'
import { onDataChanged } from './dataEvents'
import type { ShowInfo } from './notifications'

// Dizilerin TMDB durumu (sunucu tmdb.json'da saklıyor) — birkaç pencere aynı anda sorabileceği için
// kısa süreli önbellekle tek istek.
let cache: { at: number; data: Record<string, ShowInfo> } | null = null
let pending: Promise<Record<string, ShowInfo>> | null = null
function load(force = false): Promise<Record<string, ShowInfo>> {
  if (!force && cache && Date.now() - cache.at < 60_000) return Promise.resolve(cache.data)
  if (pending) return pending
  pending = Promise.resolve()
    .then(() => api.getShowStatus())
    .then((d) => {
      cache = { at: Date.now(), data: d }
      return d
    })
    .catch(() => ({}))
    .finally(() => {
      pending = null
    })
  return pending
}

export function useShowInfo(rowId: string | undefined): ShowInfo | null {
  const [info, setInfo] = useState<ShowInfo | null>(null)
  useEffect(() => {
    if (!rowId) return
    let alive = true
    load().then((d) => alive && setInfo(d[rowId] ?? null))
    const off = onDataChanged(() => load(true).then((d) => alive && setInfo(d[rowId] ?? null)))
    return () => {
      alive = false
      off()
    }
  }, [rowId])
  return info
}

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
function trDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const thisYear = new Date().getFullYear()
  return `${d} ${TR_MONTHS[(m || 1) - 1]}${y !== thisYear ? ' ' + y : ''}`
}

// "Dizi bitti" / "Yeni sezon: 12 Mart" / "Yeni bölüm: 3 Ekim" / "Yeni sezon bekleniyor" — kısa etiket + renk.
export function showLabel(info: ShowInfo | null): { text: string; tone: 'done' | 'soon' | 'wait' } | null {
  if (!info) return null
  if (info.status === 'Ended' || info.status === 'Canceled') return { text: info.status === 'Canceled' ? 'Dizi iptal edildi' : 'Dizi bitti', tone: 'done' }
  if (info.next?.airDate) {
    return { text: info.next.episode === 1 ? `${info.next.season}. sezon: ${trDay(info.next.airDate)}` : `Yeni bölüm: ${trDay(info.next.airDate)}`, tone: 'soon' }
  }
  if (info.status) return { text: 'Yeni sezon bekleniyor', tone: 'wait' }
  return null
}
