// Windows'un emoji fontu bayrak emojilerini (🇹🇷 gibi) desteklemiyor — Mac/telefonda
// düzgün görünse de Windows'ta ya iki harfli koda ya da boş kutuya dönüşüyor. Etiketin
// başındaki bayrak emojisini (iki "regional indicator" karakterinin dizisi) tanıyıp
// ülke koduna çeviriyoruz ki `flag-icons` ile gerçek bir bayrak ikonu çizebilelim.
const REGIONAL_INDICATOR_BASE = 0x1f1e6 // 🇦

function regionalIndicatorLetter(codePoint: number | undefined): string | null {
  if (codePoint === undefined) return null
  if (codePoint < REGIONAL_INDICATOR_BASE || codePoint > REGIONAL_INDICATOR_BASE + 25) return null
  return String.fromCharCode(65 + (codePoint - REGIONAL_INDICATOR_BASE))
}

export function splitFlagEmoji(text: string): { flagCode: string | null; rest: string } {
  const chars = Array.from(text)
  const l0 = regionalIndicatorLetter(chars[0]?.codePointAt(0))
  const l1 = regionalIndicatorLetter(chars[1]?.codePointAt(0))
  if (l0 && l1) {
    return { flagCode: (l0 + l1).toLowerCase(), rest: chars.slice(2).join('').trimStart() }
  }
  return { flagCode: null, rest: text }
}
