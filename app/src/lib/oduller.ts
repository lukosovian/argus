import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { api, type OdulData, type OdulReward, type OdulTier } from './api'
import { resolveRole, resolveStatusOption } from './roles'
import { entryEnd, toEntries } from './dateRange'
import { onDataChanged } from './dataEvents'
import { ratingAverage, titleText, type Board, type Row, type WatchedMap } from '../types'
import { useProfiles } from '../hooks/useProfiles'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useBiletler } from './bilet'
import { tt } from './i18n'

// Koleksiyon › Ödüller (v1.24): izledikçe kart paketi kazanılır, paket yırtılıp açılır (sunumda kullanıcının seçtiği
// "kart paketi" stili). Kullanıcı ödül olarak başarım/rozet istemedi ("saçma olur"); ödüller:
//  - Film kartları: arşivinde izlediğin yapımların kartları. Nadirliği senin verdiğin puandan gelir (10 → efsanevi).
//    %12 ihtimalle "parlak" (folyo) çıkar.
//  - Avatar çerçeveleri: takınca sağ üstteki avatarın çevresinde görünür.
//  - Kart arkaları: paketten çıkan kartların ve albümün arka yüzü.
//  - Bilet tasarımı: Biletlerim'de yeni bir tasarım (Neon).
// Kopya çıkarsa makaraya döner; makarayla paket alınır.

export const RARITY_NAMES = () => [tt('Sıradan'), tt('Nadir'), tt('Epik'), tt('Efsanevi')]
export const RARITY_COLORS = ['#9aa4bf', '#3fa9ff', '#b065ff', '#ffbf1f']

export interface TierInfo {
  id: OdulTier
  label: () => string
  // 5 kartın her biri için nadirlik oranları (yüzde: sıradan, nadir, epik, efsanevi)
  odds: [number, number, number, number]
  foil: string
  rule: () => string
  price: number
}
export const TIERS: TierInfo[] = [
  { id: 'bronz', label: () => tt('Bronz paket'), odds: [72, 22, 5, 1], foil: 'linear-gradient(160deg,#3a2414,#9a5a2c 38%,#5c3518 62%,#1f130a)', rule: () => tt('Her 4 bölümde bir'), price: 10 },
  { id: 'gumus', label: () => tt('Gümüş paket'), odds: [50, 32, 14, 4], foil: 'linear-gradient(160deg,#151b3f,#2b3080 38%,#1a1f4d 62%,#0b0f26)', rule: () => tt('Her bitirdiğin film'), price: 25 },
  { id: 'altin', label: () => tt('Altın paket'), odds: [0, 52, 34, 14], foil: 'linear-gradient(160deg,#3d2a05,#c89211 38%,#7a5508 62%,#2a1c02)', rule: () => tt('Sinemada izleyince, her 10 filmde ve her 40 bölümde'), price: 60 },
]
export const tierOf = (id: OdulTier) => TIERS.find((t) => t.id === id) ?? TIERS[1]

export type ItemKind = 'frame' | 'back' | 'bilet'
export interface CatalogItem {
  key: string
  kind: ItemKind
  r: number
  name: () => string
}
const item = (key: string, r: number, name: () => string): CatalogItem => ({ key, kind: key.split(':')[0] as ItemKind, r, name })
export const CATALOG: CatalogItem[] = [
  item('frame:okyanus', 0, () => tt('Okyanus')),
  item('frame:gunbatimi', 0, () => tt('Gün batımı')),
  item('frame:nane', 0, () => tt('Nane')),
  item('frame:film', 1, () => tt('Film şeridi')),
  item('frame:zumrut', 1, () => tt('Zümrüt')),
  item('frame:kiraz', 1, () => tt('Kiraz çiçeği')),
  item('frame:kristal', 2, () => tt('Kristal')),
  item('frame:lav', 2, () => tt('Lav')),
  item('frame:galaksi', 3, () => tt('Galaksi')),
  item('frame:varak', 3, () => tt('Altın varak')),
  item('back:gece', 0, () => tt('Gece mavisi')),
  item('back:retro', 1, () => tt('Retro 80\'ler')),
  item('back:folyo', 1, () => tt('Gümüş folyo')),
  item('back:neon', 2, () => tt('Neon')),
  item('back:altin', 3, () => tt('Altın')),
  item('bilet:neon', 2, () => tt('Neon bilet')),
]
export const catalogItem = (key: string) => CATALOG.find((c) => c.key === key)
export const KIND_LABEL = (k: ItemKind) => (k === 'frame' ? tt('Avatar çerçevesi') : k === 'back' ? tt('Kart arkası') : tt('Bilet tasarımı'))

// Avatarın çevresindeki çerçeve (Navbar'da ve önizlemede; kapsayıcıya padding verilir)
export function frameStyle(key?: string | null): CSSProperties | null {
  switch (key) {
    case 'frame:okyanus':
      return { background: 'linear-gradient(135deg,#015eea,#00c0fa)' }
    case 'frame:gunbatimi':
      return { background: 'linear-gradient(135deg,#ff5f6d,#ffc371)' }
    case 'frame:nane':
      return { background: 'linear-gradient(135deg,#10b981,#a7f3d0)' }
    case 'frame:film':
      return { background: 'repeating-conic-gradient(#f5f5f5 0 7deg,#111 7deg 15deg)', boxShadow: '0 0 0 1.5px #111' }
    case 'frame:zumrut':
      return { background: 'linear-gradient(135deg,#065f46,#34d399 45%,#d1fae5 55%,#047857)', boxShadow: '0 0 12px rgba(52,211,153,.45)' }
    case 'frame:kiraz':
      return { background: 'linear-gradient(135deg,#f9a8d4,#fff1f7 50%,#ec4899)', boxShadow: '0 0 12px rgba(244,114,182,.45)' }
    case 'frame:kristal':
      return { background: 'conic-gradient(from 30deg,#e0f2fe,#a5b4fc,#f0abfc,#e0f2fe,#99f6e4,#e0f2fe)', boxShadow: '0 0 16px rgba(165,180,252,.6)' }
    case 'frame:lav':
      return { background: 'conic-gradient(from var(--argus-cerceve,0deg),#7f1d1d,#f97316,#fde047,#dc2626,#7f1d1d)', animation: 'argus-cerceve 3s linear infinite', boxShadow: '0 0 16px rgba(249,115,22,.55)' }
    case 'frame:galaksi':
      return { background: 'conic-gradient(from var(--argus-cerceve,0deg),#1e1b4b,#7c3aed,#22d3ee,#f0abfc,#1e1b4b)', animation: 'argus-cerceve 5s linear infinite', boxShadow: '0 0 18px rgba(124,58,237,.7)' }
    case 'frame:varak':
      return { background: 'conic-gradient(from var(--argus-cerceve,0deg),#8a5a00,#fff1b8,#c48b00,#ffe48a,#8a5a00)', animation: 'argus-cerceve 4s linear infinite', boxShadow: '0 0 18px rgba(255,191,31,.6)' }
  }
  return null
}

// Puan → kart nadirliği
export function rarityOfRating(r: number | null | undefined) {
  if (r == null) return 0
  if (r >= 9.5) return 3
  if (r >= 8.5) return 2
  if (r >= 7) return 1
  return 0
}

export interface PoolCard {
  rowId: string
  title: string
  poster: string
  year: string
  rating: number | null
  r: number
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Başlangıçtan beri kazanılan paketler. Sadece başlangıç gününden sonraki izlemeler sayılır (eski arşiv bir anda
// yüzlerce paket vermesin); bir günde toplu işaretlenenler sınırlı sayılır. "İzledim" geri alınırsa sayı da düşer.
export function computeEarned(board: Board, rows: Row[], watched: WatchedMap, biletDays: string[], startedAt: string) {
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const kategori = resolveRole(board, 'kategori')
  const isSeries = (r: Row) => /dizi|series|tv/i.test(kategori?.options?.find((o) => o.id === r.values[kategori.id])?.label ?? '')
  const filmDays = new Map<string, number>()
  for (const r of rows) {
    if (isSeries(r) || !dateProp) continue
    for (const d of toEntries(r.values[dateProp.id]).map(entryEnd)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= startedAt) filmDays.set(d, (filmDays.get(d) ?? 0) + 1)
  }
  const epDays = new Map<string, number>()
  for (const map of Object.values(watched)) for (const list of Object.values(map)) for (const d of list) if (d && d.slice(0, 10) >= startedAt) epDays.set(d.slice(0, 10), (epDays.get(d.slice(0, 10)) ?? 0) + 1)
  let films = 0
  for (const n of filmDays.values()) films += Math.min(n, 3)
  let eps = 0
  for (const n of epDays.values()) eps += Math.min(n, 12)
  // Sinema: biletin gösterim günü başlangıçtan sonraysa (eski gösterimlerin biletleri sayılmaz), günde en çok 2
  const sDays = new Map<string, number>()
  for (const d of biletDays) if (d >= startedAt) sDays.set(d, (sDays.get(d) ?? 0) + 1)
  let sinema = 0
  for (const n of sDays.values()) sinema += Math.min(n, 2)
  return {
    films,
    eps,
    sinema,
    earned: { bronz: Math.floor(eps / 4), gumus: films, altin: sinema + Math.floor(films / 10) + Math.floor(eps / 40) } as Record<OdulTier, number>,
  }
}

export function buildPool(board: Board, rows: Row[]): PoolCard[] {
  const durum = resolveRole(board, 'durum')
  const izlendi = resolveStatusOption(board, 'izlendi')
  const poster = resolveRole(board, 'poster')
  const puan = resolveRole(board, 'puan')
  const vizyon = resolveRole(board, 'vizyon')
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  const out: PoolCard[] = []
  for (const r of rows) {
    if (durum && izlendi && r.values[durum.id] !== izlendi) continue
    const img = poster ? r.values[poster.id] : null
    if (typeof img !== 'string' || !img) continue
    const rating = puan ? ratingAverage(r.values[puan.id], puan) : null
    const vz = vizyon ? r.values[vizyon.id] : ''
    out.push({ rowId: r.id, title: tp ? titleText(tp, r.values[tp.id]) : '', poster: img, year: typeof vz === 'string' ? vz.slice(0, 4) : '', rating, r: rarityOfRating(rating) })
  }
  return out
}

export const EVENT = 'argus-oduller-degisti'

export function useOduller(enabled = true) {
  const { activeProfileId } = useProfiles()
  const { settings } = useHomeSettings()
  const on = enabled && Boolean(activeProfileId)
  const boardId = on ? (settings.boardId ?? undefined) : undefined
  const { board } = useBoard(boardId)
  const { rows, loading: rowsLoading } = useRows(boardId)
  const { data: biletler } = useBiletler()
  const [data, setData] = useState<OdulData | null>(null)
  const [watched, setWatched] = useState<WatchedMap | null>(null)
  const load = useCallback(() => {
    if (!on) return
    api.getOduller().then(setData).catch(() => {})
    api.getWatched().then(setWatched).catch(() => {})
  }, [on, activeProfileId])
  useEffect(() => {
    load()
    window.addEventListener(EVENT, load)
    const off = onDataChanged(() => load())
    return () => {
      window.removeEventListener(EVENT, load)
      off()
    }
  }, [load])
  const stats = useMemo(() => {
    // hepsi yüklenmeden hesaplanmasın (yarım veriyle sayı önce düşük çıkıp sonra artıyor, "yeni paket" sanılıyordu)
    if (!board || !data?.startedAt || rowsLoading || !watched || !biletler) return null
    const biletDays = Object.values(biletler?.items ?? {}).map((b) => {
      if (b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) return b.date
      const c = Number((b as { createdAt?: number }).createdAt)
      return c ? ymd(new Date(c)) : ''
    })
    return computeEarned(board, rows, watched, biletDays, data.startedAt)
  }, [board, rows, rowsLoading, watched, biletler, data?.startedAt])
  const available = useMemo(() => {
    const out = { bronz: 0, gumus: 0, altin: 0 } as Record<OdulTier, number>
    if (!data) return out
    for (const t of TIERS) out[t.id] = Math.max(0, (stats?.earned[t.id] ?? 0) + (data.bonus[t.id] ?? 0) - (data.opened[t.id] ?? 0))
    return out
  }, [data, stats])
  const pool = useMemo(() => (board ? buildPool(board, rows) : []), [board, rows])
  const act = useCallback(async (a: Parameters<typeof api.odulAction>[0]) => {
    const d = await api.odulAction(a)
    setData(d)
    window.dispatchEvent(new Event(EVENT))
    return d
  }, [])
  return { data, stats, available, pool, act, reload: load, ready: Boolean(board && data) }
}

// Bir paket: 5 kart. Her kartın nadirliği paketin oranlarından; en az bir nadir garanti; 10 pakettir epik çıkmadıysa
// bu pakette bir epik garanti. Önce sahip olmadıkların seçilir (kopya azalsın). Kartlar nadirliğe göre sıralanır.
export function rollPack(tier: OdulTier, data: OdulData, pool: PoolCard[], rand = Math.random): { rewards: OdulReward[]; pity: number } {
  const t = tierOf(tier)
  const roll = () => {
    let x = rand() * 100
    for (let i = 0; i < 4; i++) {
      x -= t.odds[i]
      if (x < 0) return i
    }
    return 0
  }
  const rs = Array.from({ length: 5 }, roll)
  if (Math.max(...rs) < 1) rs[4] = 1
  if (tier === 'altin' && Math.max(...rs) < 2) rs[4] = 2
  let pity = data.pity + 1
  if (Math.max(...rs) < 2 && pity >= 10) rs[4] = 2
  if (Math.max(...rs) >= 2) pity = 0
  rs.sort((a, b) => a - b)
  const usedCards = new Set<string>()
  const usedItems = new Set<string>()
  const pick = <T,>(list: T[], owned: (x: T) => boolean): T | null => {
    if (!list.length) return null
    const fresh = list.filter((x) => !owned(x))
    const from = fresh.length && rand() < 0.85 ? fresh : list
    return from[Math.floor(rand() * from.length)]
  }
  const rewards: OdulReward[] = []
  for (const want of rs) {
    let got: OdulReward | null = null
    for (let r = want; r >= 0 && !got; r--) {
      const cards = pool.filter((c) => c.r === r && !usedCards.has(c.rowId))
      const items = CATALOG.filter((c) => c.r === r && !usedItems.has(c.key))
      const freshItems = items.filter((c) => !data.items[c.key])
      // Kozmetik ödül şansı: sahip olmadığın varsa %35, hepsi varsa %10
      const wantItem = items.length && (!cards.length || rand() < (freshItems.length ? 0.35 : 0.1))
      if (wantItem) {
        const it = pick(items, (c) => Boolean(data.items[c.key]))
        if (it) {
          usedItems.add(it.key)
          got = { kind: 'item', key: it.key, r: it.r }
        }
      } else {
        const c = pick(cards, (x) => Boolean(data.cards[x.rowId]))
        if (c) {
          usedCards.add(c.rowId)
          got = { kind: 'card', rowId: c.rowId, r: c.r, title: c.title, poster: c.poster, year: c.year, rating: c.rating, foil: rand() < 0.12 }
        }
      }
    }
    if (!got) {
      const it = CATALOG.filter((c) => c.r === 0)[Math.floor(rand() * 3)]
      got = { kind: 'item', key: it.key, r: 0 }
    }
    rewards.push(got)
  }
  rewards.sort((a, b) => a.r - b.r)
  return { rewards, pity }
}

export function todayYmd() {
  return ymd(new Date())
}

// Sadece kayıtlı durum (Navbar'daki takılı çerçeve, bilet formundaki Neon tasarım için — arşiv satırları çekilmez)
export function useOdulData(enabled: boolean) {
  const { activeProfileId } = useProfiles()
  const [data, setData] = useState<OdulData | null>(null)
  useEffect(() => {
    if (!enabled || !activeProfileId) {
      setData(null)
      return
    }
    const load = () => {
      try {
        api.getOduller().then(setData).catch(() => {})
      } catch {
        /* profil yoksa boş */
      }
    }
    load()
    window.addEventListener(EVENT, load)
    return () => window.removeEventListener(EVENT, load)
  }, [enabled, activeProfileId])
  return data
}
