// ARGUS Android › Ana Sayfa'nın üstündeki "Diziler / Filmler" hapları (Netflix uygulamasındaki gibi, v1.26).
// Seçim telefonun kendisinde tutulur (uygulama kapanınca "Tümü"ne döner); vitrin ve bütün satırlar seçilen türe göre
// süzülür. Dizi mi film mi: arşivin Kategori sütunundaki seçeneğin adından (İstatistikler'deki kuralla aynı).
import { useMemo, useSyncExternalStore } from 'react'
import type { Board, Row } from '../../types'
import { resolveRole } from '../roles'
import { MOBILE } from './ui'

export type MobileKind = 'all' | 'dizi' | 'film'

const KEY = 'mobil.anaTur'
let kind: MobileKind = (() => {
  try {
    const v = sessionStorage.getItem(KEY)
    return v === 'dizi' || v === 'film' ? v : 'all'
  } catch {
    return 'all'
  }
})()
const listeners = new Set<() => void>()

export function setMobileKind(k: MobileKind) {
  kind = k
  try {
    sessionStorage.setItem(KEY, k)
  } catch {
    /* önemsiz */
  }
  listeners.forEach((l) => l())
}

export function useMobileKind(): MobileKind {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => kind,
  )
}

const isSeriesLabel = (label: string) => /dizi|series|tv|mini/i.test(label)
const isFilmLabel = (label: string) => /film|movie|sinema/i.test(label)

// Arşivde ayırt edilebiliyor mu (Kategori sütununda hem dizi hem film seçeneği var)
export function kindAvailable(board: Board | null | undefined): boolean {
  const k = board ? resolveRole(board, 'kategori') : undefined
  const labels = (k?.options ?? []).map((o) => o.label)
  return labels.some(isSeriesLabel) && labels.some(isFilmLabel)
}

export function filterByKind(board: Board | null | undefined, rows: Row[], k: MobileKind): Row[] {
  if (k === 'all' || !board) return rows
  const prop = resolveRole(board, 'kategori')
  if (!prop) return rows
  const wanted = new Set((prop.options ?? []).filter((o) => (k === 'dizi' ? isSeriesLabel(o.label) : isFilmLabel(o.label) && !isSeriesLabel(o.label))).map((o) => o.id))
  if (!wanted.size) return rows
  return rows.filter((r) => {
    const v = r.values[prop.id]
    return Array.isArray(v) ? v.some((x) => wanted.has(String(x))) : wanted.has(String(v))
  })
}

// Ana Sayfa'da: telefonda seçili türe göre süzülmüş kayıtlar (PC'de olduğu gibi)
export function useMobileKindRows(board: Board | null | undefined, rows: Row[]): Row[] {
  const k = useMobileKind()
  // Aynı girdiyle aynı dizi dönsün (kayıt listesine bağlı etkiler her çizimde yeniden çalışmasın)
  return useMemo(() => (!MOBILE || k === 'all' || !kindAvailable(board) ? rows : filterByKind(board, rows, k)), [board, rows, k])
}
