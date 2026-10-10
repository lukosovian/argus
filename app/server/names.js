// Arşivde VERİ olarak saklanan adlar iki dilde — istemcideki src/lib/names.ts ile AYNI tablo. Sunucu yeni
// sütun/seçenek açarken kendi dilindeki adı kullanır (nameOf), tanırken iki dildeki adlara da bakar (isName).
import { serverLang } from './lang.js'

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
}

export const STATUS_NAMES = {
  izlenecek: ['İzlenecek', 'Watchlist'],
  izleniyor: ['İzleniyor', 'Watching'],
  izlendi: ['İzlendi', 'Watched'],
  yarim: ['Yarım', 'Dropped'],
}

export const KIND_NAMES = {
  film: ['Film', 'Movie'],
  dizi: ['Dizi', 'Series'],
}

export function nameOf(pair) {
  return serverLang() === 'tr' ? pair[0] : pair[1]
}

const fold = (s) => String(s ?? '').trim().toLocaleLowerCase('tr')

export function isName(name, pair) {
  if (!name) return false
  const n = fold(name)
  return n === fold(pair[0]) || n === fold(pair[1])
}
