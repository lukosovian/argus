// Aramada Türkçe harf toleransı (v1.26, G8): kullanıcı telefonda ya da hızlı yazarken ş, ç, ğ, ö, ü yazmıyor —
// "kesisim" yazınca "Kesişim", "sogus" yazınca "Soğuk Savaş" çıksın. Hem aranan metin hem aranan şey aynı biçime
// indirgenir: küçük harf (Türkçe kurallarıyla: I → ı, İ → i), ı → i, sonra harflerin üstündeki/altındaki işaretler
// atılır (ş → s, ç → c, ğ → g, ö → o, ü → u; é, ñ gibi yabancı harfler de sadeleşir).
// Ana arama, arşiv tablosu araması, seçenek/oyuncu listeleri ve sayfalardaki küçük arama kutuları bunu kullanır.

const MARKS = /[̀-ͯ]/g

export function searchFold(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFKD').replace(MARKS, '')
}

// `query` zaten searchFold'dan geçmiş olmalı (her satır için tekrar tekrar indirgenmesin diye)
export function searchIncludes(text: string | null | undefined, query: string): boolean {
  if (!query) return true
  return searchFold(text).includes(query)
}
