// "Hangi seriden?" — Koleksiyon'un rafları ve Flashback'in seri/maraton tespiti ortak kullanıyor.
// Filmler TMDB serisinin (İngilizce) adıyla, diğerleri adının ":" öncesiyle aynı anahtara düşer:
// "Star Trek: Discovery" / "Star Trek: The Kelvin Timeline Collection" → "star trek".

// split=false: ":" sonrası atılmaz (bkz. autoShelf'teki tek kelimelik dizi adı notu).
export function cleanSeriesName(s: string, split = true) {
  const base = s
    .replace(/\s*[([][^)\]]*[)\]]\s*$/, '')
    .replace(/\s*\b(koleksiyonu|koleksiyon|collection|serisi|series)\b\s*$/i, '')
    .trim()
  return (split ? base.split(/:|\s[-–]\s/)[0] : base).trim()
}

export function shelfKey(s: string, split = true) {
  return cleanSeriesName(s, split)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9ğüşıöç ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// source: filmin TMDB serisinin adı, yoksa orijinal adı. Tek kelimelik ön ekli dizi adları başka bir
// seriye karışmasın: "Avatar: The Last Airbender" Cameron'ın Avatar filmlerinin rafına düşmesin (iki
// kelime ve üstü, ör. "Star Trek: ..." birleşir).
export function autoShelf(source: string, isSeries: boolean, hasCollection: boolean) {
  const split = !(isSeries && !hasCollection && !/\s/.test(cleanSeriesName(source)))
  return { key: shelfKey(source, split), name: cleanSeriesName(source, split) }
}

// Türkçe adlar ortak bir başlangıçla başlıyorsa seri adı o olsun ("Recep İvedik 2" … → "Recep İvedik",
// "Yüzüklerin Efendisi: İki Kule" … → "Yüzüklerin Efendisi").
const TRAILING = /^(ve|and|the|of|ile|a|an|[-–:&,.]|\d+|ii|iii|iv|bölüm|episode|part|kısım|chapter)$/i
export function commonTitle(titles: string[]): string | null {
  if (titles.length < 2) return null
  const split = titles.map((t) => t.replace(/[:]/g, ' : ').split(/\s+/).filter(Boolean))
  const out: string[] = []
  for (let i = 0; i < split[0].length; i++) {
    const w = split[0][i]
    if (split.every((ws) => ws[i]?.toLocaleLowerCase('tr') === w.toLocaleLowerCase('tr'))) out.push(w)
    else break
  }
  while (out.length && TRAILING.test(out[out.length - 1])) out.pop()
  const name = out.join(' ').replace(/\s:\s?/g, ': ').trim()
  return name.length >= 3 ? name : null
}
