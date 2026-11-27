import { useCallback, useEffect, useState } from 'react'
import { api, getApiProfileId, type Bilet, type BiletData } from './api'
import { readStore, writeStore } from './profileStore'
import { searchFold } from './search'
import { isWatchedStatus, resolveRole, resolveStatusOption } from './roles'
import { entryEnd, isFullDate, isUnknownDate, isYearOnly } from './dateRange'
import { notifyDataChanged } from './dataEvents'
import { titleText, todayIso, type Board, type PropertyValue, type Row } from '../types'
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

// Kullanıcı "bugün tarihli bilet girdim, izlendi yazması, puan sorması gerekmez mi; o tarihte zaten izlenmişse yazmasın"
// dedi: bilet arşivdeki bir yapıma bağlıysa ve tarihi geçmişte/bugünse, o gün izleme tarihlerine eklenir ve durum
// İzlendi olur. Puan sorusu sunucudan gelir (İzlendi'ye geçip puanı boşsa). O gün zaten yazılıysa hiçbir şey yapılmaz.
export async function markBiletWatched(b: Bilet): Promise<'eklendi' | 'tekrar' | null> {
  const date = b.date?.slice(0, 10)
  if (!b.rowId || !b.boardId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso()) return null
  // Kiminle izlediğin de o günün izlemesine yazılsın (O1); olmazsa izleme işareti yine yapılır
  await linkBiletKiminle(b).catch(() => false)
  const [boards, rows] = await Promise.all([api.getBoards(), api.getRows(b.boardId)])
  const board = boards.find((x) => x.id === b.boardId)
  const row = rows.find((x) => x.id === b.rowId)
  const tarihProp = board && resolveRole(board, 'izlemeTarihi')
  if (!board || !row || !tarihProp) return null
  const cur = row.values[tarihProp.id]
  const list = Array.isArray(cur) ? (cur as string[]) : typeof cur === 'string' && cur ? [cur] : []
  if (list.some((d) => d.slice(0, 10) === date || entryEnd(d) === date)) return null
  // Tek tarihli sütunda en son izleme kalır; '?' ya da sadece yıl yazılıysa biletin tam tarihi onun yerine geçer.
  // (Eskiden tarih kontrolündeki yazım hatası yüzünden bu fonksiyon hiçbir bilette çalışmıyordu.)
  // Çoklu tarihte de (H5): "?" (hatırlamıyorum) ya da biletin yılıyla aynı "sadece yıl" izleme büyük ihtimalle bu
  // izlemedir — yanına ikinci bir izleme eklemek yerine onun yerine biletin günü yazılır (izleme sayısı şişmesin).
  const approxAt = list.findIndex((d) => isUnknownDate(d) || (isYearOnly(d) && d === date.slice(0, 4)))
  const base = approxAt >= 0 ? list.filter((_, j) => j !== approxAt) : list
  const patch: Record<string, PropertyValue> = {
    [tarihProp.id]: tarihProp.type === 'multidate' ? [...base, date].sort() :
      list.length && isFullDate(list[0]) && entryEnd(list[0]) > date ? list[0] : date,
  }
  const durumProp = resolveRole(board, 'durum')
  const izlendi = resolveStatusOption(board, 'izlendi')
  if (durumProp && izlendi && !isWatchedStatus(board, row.values[durumProp.id])) patch[durumProp.id] = izlendi
  await api.updateRow(board.id, row.id, { values: { ...row.values, ...patch }, createdAt: row.createdAt, updatedAt: Date.now() }, Object.keys(patch))
  notifyDataChanged(board.id)
  return (tarihProp.type === 'multidate' ? base.length : list.length) ? 'tekrar' : 'eklendi'
}

// Biletteki "Kiminle" metni → kişiler ("Ece, Can" ya da "Ece ve Can")
export function splitPeople(s?: string | null): string[] {
  return (s ?? '')
    .split(/,| ve /)
    .map((x) => x.trim().slice(0, 40))
    .filter(Boolean)
}

// O1 (v1.27): biletteki kişiler, o yapımın o günkü izlemesine detaydaki "Kiminle izledin?" etiketi olarak da eklenir
// (profilin 'birlikte-izledik' deposu, bkz. koleksiyon/KiminleIzledin). Zaten olan isim tekrar eklenmez; ileri
// tarihli (henüz izlenmemiş) bilette bir şey yapılmaz — seans bitince markBiletWatched yine çağırır.
// Birlikte izle sayfası "… ile birlikte izlediklerin"i bu kayıttan saydığı için sinema gezileri oraya da düşer.
export async function linkBiletKiminle(b: Bilet): Promise<boolean> {
  const pid = getApiProfileId()
  const date = b.date?.slice(0, 10)
  const names = splitPeople(b.withWho)
  if (!pid || !b.rowId || !names.length || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso()) return false
  const store = 'birlikte-izledik'
  const cur = await readStore<Record<string, Record<string, string[]>>>(pid, store)
  const row = { ...(cur[b.rowId] ?? {}) }
  const list = Array.isArray(row[date]) ? [...row[date]] : []
  const seen = new Set(list.map(searchFold))
  for (const n of names) {
    if (seen.has(searchFold(n))) continue
    seen.add(searchFold(n))
    list.push(n)
  }
  if (list.length === (row[date]?.length ?? 0)) return false
  row[date] = list.slice(0, 12)
  await writeStore(pid, store, { ...cur, [b.rowId]: row })
  // useStore('birlikte-izledik') kullanan açık ekranlar yenilensin (bkz. lib/useProfileStore)
  window.dispatchEvent(new CustomEvent('argus-store-degisti', { detail: store }))
  return true
}

// Biletler eskiden yeniye sıralı (seri numarası bu sıraya göre)
export function sortedBiletler(items: Record<string, Bilet>) {
  return Object.entries(items)
    .map(([id, b]) => ({ id, ...b }))
    .sort((a, b) => {
      // Önce gün, sonra saat (saatsizler o günün sonunda), sonra eklenme zamanı (sayı olarak).
      // Eskiden üçü tek metne yapıştırılıyordu: "9:30" / "10:00" ve farklı uzunluktaki zamanlar yanlış sıralanıyordu.
      const d = (a.date ?? '').localeCompare(b.date ?? '')
      if (d) return d
      const ta = timeKey(a.time)
      const tb = timeKey(b.time)
      if (ta !== tb) return ta === null ? 1 : tb === null ? -1 : ta - tb
      return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)
    })
}
// "9:30", "21.15", "2130" → dakika; boş / anlaşılmayan → null
function timeKey(t?: string): number | null {
  const m = /^(\d{1,2})[:.]?(\d{2})/.exec((t ?? '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
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
