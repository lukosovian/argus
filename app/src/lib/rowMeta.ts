import { ratingAverage, type Board, type Row } from '../types'

type MetaType = 'select' | 'date' | 'multiselect' | 'rating'

// Seçim ve tarih tipindeki değerleri ("Dizi", "2026" gibi) tek satırlık kısa bir
// özete çevirir — vitrin ve detay penceresinde başlığın altında gösterilir.
export function metaSummary(
  board: Board,
  row: Row,
  excludeIds: Set<string | undefined>,
  types: MetaType[] = ['select', 'date', 'multiselect', 'rating'],
): string[] {
  return board.properties
    .filter((p) => !excludeIds.has(p.id) && types.includes(p.type as MetaType))
    .map((p) => {
      if (p.type === 'rating') {
        const avg = ratingAverage(row.values[p.id], p)
        return avg === null ? null : `⭐ ${avg.toFixed(1)}`
      }
      const v = row.values[p.id]
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return null
      if (p.type === 'date') {
        const [y] = (v as string).split('-')
        return y ?? null
      }
      if (p.type === 'multiselect' && Array.isArray(v)) {
        const labels = v
          .map((id) => p.options?.find((o) => o.id === id)?.label)
          .filter((l): l is string => Boolean(l))
        return labels.length > 0 ? labels.slice(0, 3).join(', ') : null
      }
      const opt = p.options?.find((o) => o.id === v)
      return opt?.label ?? null
    })
    .filter((v): v is string => Boolean(v))
}

// "Süre" alanı (dakika olarak saklanır) her gösterildiği yerde aynı formatta olsun diye
// (vitrin meta satırı, detay penceresindeki bilgi ızgarası) tek bir yerden formatlanıyor.
export function formatRuntime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}s ${m}dk` : `${m}dk`
}

// Vitrin (Netflix tarzı öne çıkan afiş) için özel, kısa tutulmuş bir özet: Kategori, Tür'den
// sadece ilki (hepsi değil), yıl, diziyse sezon sayısı / filmse süre — metaSummary'nin genel
// amaçlı "her seçim/tarih alanını dök" mantığından bilinçli olarak farklı, çünkü vitrinde az ve
// öz bilgi isteniyor (bkz. kullanıcı isteği 2026-09-15). Yaş sınırı burada YOK — o artık ayrı bir
// rozet (AgeRatingChip) olarak gösteriliyor, düz metin olarak bu diziye eklenmiyor.
export function showcaseMeta(board: Board, row: Row, seasonCount?: number): string[] {
  const bits: string[] = []

  const kategoriProp = board.properties.find((p) => p.name === 'Kategori' && p.type === 'select')
  if (kategoriProp) {
    const label = kategoriProp.options?.find((o) => o.id === row.values[kategoriProp.id])?.label
    if (label) bits.push(label)
  }

  const turProp = board.properties.find((p) => p.name === 'Tür' && p.type === 'multiselect')
  if (turProp) {
    const ids = row.values[turProp.id]
    const firstId = Array.isArray(ids) ? ids[0] : undefined
    const label = firstId ? turProp.options?.find((o) => o.id === firstId)?.label : undefined
    if (label) bits.push(label)
  }

  const vizyonProp = board.properties.find((p) => p.name === 'Vizyon Tarihi' && p.type === 'date')
  if (vizyonProp) {
    const v = row.values[vizyonProp.id]
    if (typeof v === 'string') {
      const [y] = v.split('-')
      if (y) bits.push(y)
    }
  }

  if (typeof seasonCount === 'number' && seasonCount > 0) {
    bits.push(seasonCount === 1 ? '1 Sezon' : `${seasonCount} Sezon`)
  } else {
    const sureProp = board.properties.find((p) => p.name === 'Süre' && p.type === 'number')
    const mins = sureProp ? row.values[sureProp.id] : undefined
    if (typeof mins === 'number' && mins > 0) {
      bits.push(formatRuntime(mins))
    }
  }

  return bits
}

// Bir "seçim/çoklu seçim sütunu + seçenek id'leri" filtresine (HomeSection, showcaseFilter,
// randomPickerFilter — hepsi aynı şekli kullanıyor) uyan satırları döner. propertyId boşsa
// ya da hiç seçenek işaretlenmediyse BOŞ dizi döner — "filtresiz" davranışı (tüm satırları
// göstermek) her çağıran kendi bağlamına göre ayrıca karar veriyor (bkz. AnaSayfa.tsx'teki
// vitrin/Tümü mantığı ve RandomPickerButton.tsx).
export function rowsForFilter(filter: { propertyId: string | null; optionIds: string[] }, allRows: Row[]): Row[] {
  if (!filter.propertyId || filter.optionIds.length === 0) return []
  return allRows.filter((row) => {
    const v = row.values[filter.propertyId!]
    if (Array.isArray(v)) return v.some((id) => filter.optionIds.includes(id))
    return typeof v === 'string' && filter.optionIds.includes(v)
  })
}

// Fisher-Yates — "Tümü" satırının karışık sırası ve RandomPickerButton'ın vitrin-tarzı
// scatter animasyonu için gösterilecek örneklem ikisi de aynı basit karıştırmayı kullanıyor.
export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Ana sayfadaki üzerine gelince büyüyen kartların alt bilgi satırı için: Durum, Kategori,
// çıkış yılı — showcaseMeta ile aynı "isme göre bul" mantığı, sadece farklı bir alan seçimi.
export function hoverCardMeta(board: Board, row: Row): string[] {
  const bits: string[] = []

  const durumProp = board.properties.find((p) => p.name === 'Durum' && p.type === 'select')
  if (durumProp) {
    const label = durumProp.options?.find((o) => o.id === row.values[durumProp.id])?.label
    if (label) bits.push(label)
  }

  const kategoriProp = board.properties.find((p) => p.name === 'Kategori' && p.type === 'select')
  if (kategoriProp) {
    const label = kategoriProp.options?.find((o) => o.id === row.values[kategoriProp.id])?.label
    if (label) bits.push(label)
  }

  const vizyonProp = board.properties.find((p) => p.name === 'Vizyon Tarihi' && p.type === 'date')
  if (vizyonProp) {
    const v = row.values[vizyonProp.id]
    if (typeof v === 'string') {
      const [y] = v.split('-')
      if (y) bits.push(y)
    }
  }

  return bits
}
