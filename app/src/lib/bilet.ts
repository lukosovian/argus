import { useCallback, useEffect, useState } from 'react'
import { api, type Bilet, type BiletData } from './api'
import { resolveRole } from './roles'
import { titleText, type Board, type Row } from '../types'
import { useProfiles } from '../hooks/useProfiles'
import { locale } from './i18n'

// Koleksiyon › Biletlerim (v1.23.11): sinemada izlediğin yapımların koleksiyonluk biletleri. Kullanıcı "sinemaya
// gidince koleksiyonluk biletler oluyo ya, onları argusta da biriktirelim; bilete tıklayınca büyüsün, arkalı önlü
// çevirebileyim" dedi. Biletler profil başına data/profiles/<id>/biletler.json'da (bkz. server › biletler).

export type { Bilet }
export const BILET_EVENT = 'argus-biletler-degisti'

export function newBiletId() {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// Arşivdeki bir yapımdan biletin yapım bilgileri (o anki hali saklanır)
export function biletFromRow(board: Board, row: Row): Bilet {
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  const img = (id: string | null | undefined) => (id && typeof row.values[id] === 'string' ? (row.values[id] as string) : '')
  const posterProp = resolveRole(board, 'poster')
  const vizyon = resolveRole(board, 'vizyon')
  const vz = vizyon && typeof row.values[vizyon.id] === 'string' ? (row.values[vizyon.id] as string) : ''
  return {
    title: tp ? titleText(tp, row.values[tp.id]) : '',
    poster: img(posterProp?.id),
    cover: img(board.coverPropertyId),
    logo: img(board.titleImagePropertyId),
    year: vz.slice(0, 4),
    rowId: row.id,
    boardId: board.id,
  }
}

// Biletlerin hepsi; değişince (başka pencerede kaydedilince) kendini yeniler
export function useBiletler() {
  const { activeProfileId } = useProfiles()
  const [data, setData] = useState<BiletData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    if (!activeProfileId) return
    api
      .getBiletler()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'error'))
  }, [activeProfileId])
  useEffect(() => {
    load()
    window.addEventListener(BILET_EVENT, load)
    return () => window.removeEventListener(BILET_EVENT, load)
  }, [load])
  return { data, error, reload: load }
}

export async function saveBilet(id: string, b: Partial<Record<keyof Bilet, string | null>> | null) {
  const d = await api.saveBiletler({ [id]: b })
  window.dispatchEvent(new Event(BILET_EVENT))
  return d
}

// Biletler eskiden yeniye sıralı (seri numarası bu sıraya göre)
export function sortedBiletler(items: Record<string, Bilet>) {
  return Object.entries(items)
    .map(([id, b]) => ({ id, ...b }))
    .sort((a, b) => `${a.date ?? ''}${a.time ?? ''}${a.createdAt ?? 0}`.localeCompare(`${b.date ?? ''}${b.time ?? ''}${b.createdAt ?? 0}`))
}

export function longDay(iso?: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d))
}
export function weekday(iso?: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(new Date(y, m - 1, d))
}
export function shortDay(iso?: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
// Barkod çizgileri (biletin kimliğinden, hep aynı)
export function barcode(seed: string, n = 46) {
  let h = hash(seed || 'argus')
  return Array.from({ length: n }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    h = (h ^ (h >>> 13)) >>> 0
    return 1 + (h % 4)
  })
}
export function serialOf(no: number, date?: string) {
  return `ARG-${(date ?? '').slice(0, 4) || '0000'}-${String(no).padStart(4, '0')}`
}
