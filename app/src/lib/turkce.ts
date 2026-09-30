// Türkçe bulunma eki (-de/-da/-te/-ta): sözcüğün son ünlüsüne (kalın → a, ince → e) ve son harfine
// (sert ünsüz "fıstıkçı şahap" → t, değilse d) göre. Sayılarda okunuşun son sözcüğüne bakılır:
// 2026 → "altı" → 'da', 2023 → "üç" → 'te', 2020 → "yirmi" → 'de' (yeni kullanıcı denemesinde "2026'TE" yazıyordu).

const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']

function lastSpokenWord(n: number): string {
  const x = Math.abs(Math.trunc(n))
  if (x === 0) return 'sıfır'
  if (x % 10) return ONES[x % 10]
  if (x % 100) return TENS[(x % 100) / 10]
  if (x % 1000) return 'yüz'
  if (x % 1_000_000) return 'bin'
  return 'milyon'
}

export function locativeSuffix(word: string | number): string {
  const w = (typeof word === 'number' ? lastSpokenWord(word) : word).toLocaleLowerCase('tr')
  const vowels = [...w].filter((c) => 'aıoueiöü'.includes(c))
  const last = vowels[vowels.length - 1] ?? 'e'
  const back = 'aıou'.includes(last)
  const hard = 'fstkçşhp'.includes(w[w.length - 1] ?? '')
  return (hard ? 't' : 'd') + (back ? 'a' : 'e')
}

// "2026'da", "Mart'ta"
export function withLocative(word: string | number): string {
  return `${word}'${locativeSuffix(word)}`
}
