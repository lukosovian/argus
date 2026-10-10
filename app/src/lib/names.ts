// Arşivde VERİ olarak saklanan adlar (sütun adları, Durum/Kategori seçenekleri, puan kriterleri) iki
// dilde. Kullanıcı "argus u komple ingilizce yap" dedi: yeni oluşturulan sütunlar/seçenekler seçili
// dilde açılır (nameOf), ama tanırken HER İKİ DİLDEKİ adlara bakılır (isName) — dil değiştirilince
// eski Türkçe arşiv de, İngilizce açılmış arşiv de çalışmaya devam etsin. Aynı tablo sunucuda da var
// (server/names.js); birinde değişen diğerinde de değişmeli.
import { getLang } from './i18n'

export const COLUMN_NAMES = {
  baslik: ['Türkçe Adı', 'Title'],
  durum: ['Durum', 'Status'],
  kategori: ['Kategori', 'Category'],
  tur: ['Tür', 'Genre'],
  ulke: ['Ülke', 'Country'],
  vizyon: ['Vizyon Tarihi', 'Release Date'],
  izlemeTarihi: ['İzleme Tarihi', 'Watch Date'],
  sure: ['Süre', 'Runtime'],
  puan: ['Puan', 'Rating'],
  oyuncular: ['Oyuncular', 'Cast'],
  yonetmen: ['Yönetmen', 'Director'],
  orjinalAdi: ['Orjinal Adı', 'Original Title'],
  sinopsis: ['Sinopsis', 'Synopsis'],
  poster: ['Poster', 'Poster'],
  banner: ['Banner', 'Banner'],
  video: ['Video', 'Video'],
  yas: ['Yaş Sınırı', 'Age Rating'],
  kapakAdi: ['Kapak Adı', 'Title Logo'],
} as const

export const STATUS_NAMES = {
  izlenecek: ['İzlenecek', 'Watchlist'],
  izleniyor: ['İzleniyor', 'Watching'],
  izlendi: ['İzlendi', 'Watched'],
  yarim: ['Yarım', 'Dropped'],
} as const

export const CRITERIA_NAMES = [
  ['Senaryo', 'Story'],
  ['Oyunculuk', 'Acting'],
  ['Görsellik', 'Visuals'],
  ['Müzik', 'Music'],
  ['Tekrar İzlenebilirlik', 'Rewatchability'],
] as const

export type NamePair = readonly [string, string]

/** Seçili dildeki ad (yeni sütun/seçenek oluştururken) */
export function nameOf(pair: NamePair): string {
  return getLang() === 'tr' ? pair[0] : pair[1]
}

const fold = (s: string) => s.trim().toLocaleLowerCase('tr')

/** Bu ad, iki dildeki adlardan birine uyuyor mu (büyük/küçük harf fark etmez) */
export function isName(name: string | null | undefined, pair: NamePair): boolean {
  if (!name) return false
  const n = fold(name)
  return n === fold(pair[0]) || n === fold(pair[1])
}
