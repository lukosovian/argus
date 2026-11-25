// E-bilet metnini ayıkla (Y27): sinemaların SMS / e-posta / uygulama metinlerinden (Cinemaximum, Paribu Cineverse,
// Cinemapink, Prestige, Cinetime, Avşar, Biletinial…) film adı, tarih, saat, sinema, salon, koltuk, format ve fiyat
// çıkarılır. Emin olunmayan alan boş bırakılır; kullanıcı formda düzeltir. Türkçe karakterleri yazmayan SMS'ler
// (Koltuk, Ucret, Subat…) de anlaşılır.

export interface EBiletFields {
  title?: string
  date?: string // YYYY-MM-DD
  time?: string // HH:MM
  cinema?: string
  hall?: string
  seat?: string
  format?: string
  price?: string
}

const MONTHS: Record<string, number> = {
  ocak: 1, subat: 2, şubat: 2, mart: 3, nisan: 4, mayis: 5, mayıs: 5, haziran: 6, temmuz: 7, agustos: 8, ağustos: 8,
  eylul: 9, eylül: 9, ekim: 10, kasim: 11, kasım: 11, aralik: 12, aralık: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  oca: 1, şub: 2, sub: 2, mar: 3, nis: 4, haz: 6, tem: 7, ağu: 8, agu: 8, eyl: 9, eki: 10, kas: 11, ara: 12,
}
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')

// Bilinen sinema zincirleri (en uzun önce: "Paribu Cineverse" "Cineverse"den önce)
const CHAINS = [
  'Paribu Cineverse', 'Cineverse', 'Cinemaximum', 'Cinemapink', 'Cinema Pink', 'Prestige', 'Cinetime', 'Avşar', 'Avsar', 'Site Sinemaları',
  'Cinens', 'Cinemarine', 'Moviemax', 'Spectrum', 'Kültürpark', 'Megapol', 'Cinemall', 'Cinebonus', 'CineGold', 'Cinecity', 'Akmerkez',
  'Beyoğlu Sineması', 'Atlas 1948', 'Pera Müzesi', 'Kadıköy Sineması', 'Ankara Büyülü Fener', 'Büyülü Fener', 'Cinemaxx', 'Hayatpark', 'Özdilek',
  'Kinopark', 'CinemaPlus', 'Cinema Plus', 'Mars Cinema', 'Cine Park', 'Cinepark', 'Planet', 'Starcity',
]
const FORMATS: [RegExp, string][] = [
  [/\bIMAX\b/i, 'IMAX'],
  [/\b4\s?DX\b/i, '4DX'],
  [/\bScreen\s?X\b/i, 'ScreenX'],
  [/\bDolby(\s?(Atmos|Cinema))?\b/i, 'Dolby'],
  [/\b3\s?D\b/, '3D'],
  [/\b2\s?D\b/, '2D'],
]

// Anahtar (etiket) eşanlamlıları — "Film Adı: ...", "Seans Saati: ..." gibi satırlar için
const KEYS: [keyof EBiletFields | 'datetime', RegExp][] = [
  ['title', /^(film(\s*ad[ıi])?|film\s*ismi|etkinlik(\s*ad[ıi])?|movie|g[öo]sterim)$/i],
  ['datetime', /^(seans(\s*tarihi\s*(ve|\/)\s*saati)?|tarih\s*(ve|\/)\s*saat|g[öo]sterim\s*zaman[ıi]|zaman)$/i],
  ['date', /^((seans|g[öo]sterim|film|etkinlik)?\s*tarih(i)?|date)$/i],
  ['time', /^((seans|g[öo]sterim)?\s*saat(i)?|seans\s*saati|time)$/i],
  ['cinema', /^(sinema(\s*(ad[ıi]|salonu|kompleksi))?|mekan|lokasyon|şube|sube|cinema|tiyatro)$/i],
  ['hall', /^(salon(\s*(no|numaras[ıi]|ad[ıi]))?|hall|screen)$/i],
  ['seat', /^(koltuk(lar|\(lar\)|\s*no|\s*numaras[ıi]|\s*numaralar[ıi])?|seat(s)?|yer)$/i],
  ['price', /^((toplam\s*)?(tutar|ücret|ucret|fiyat|bedel)(ı|i)?|bilet\s*(fiyat[ıi]|ücreti|ucreti)|ödenen(\s*tutar)?|odenen(\s*tutar)?|total)$/i],
]

const pad = (n: number) => String(n).padStart(2, '0')
const validDate = (y: number, m: number, d: number) => y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31

// Yıl yazmayan tarihte (ör. "14 Temmuz Pazartesi") bugüne en yakın yıl: 2 aydan eski görünürse gelecek yıl
function guessYear(m: number, d: number, now: Date) {
  const y = now.getFullYear()
  const cand = new Date(y, m - 1, d)
  return cand.getTime() < now.getTime() - 60 * 86400000 ? y + 1 : y
}

export function findDate(s: string, now = new Date()): string | undefined {
  let m = /\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/.exec(s)
  if (m && validDate(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/.exec(s)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    if (validDate(y, +m[2], +m[1])) return `${y}-${pad(+m[2])}-${pad(+m[1])}`
  }
  m = new RegExp(`\\b(\\d{1,2})\\s*(${MONTH_RE})\\.?\\w*\\s*,?\\s*(\\d{4})?`, 'i').exec(s)
  if (m) {
    const mo = MONTHS[m[2].toLocaleLowerCase('tr')] ?? MONTHS[m[2].toLowerCase()]
    const d = +m[1]
    if (mo) {
      const y = m[3] ? +m[3] : guessYear(mo, d, now)
      if (validDate(y, mo, d)) return `${y}-${pad(mo)}-${pad(d)}`
    }
  }
  // "14/07" (yılsız, gün/ay)
  m = /\b(\d{1,2})[./](\d{1,2})\b(?![./]\d)/.exec(s)
  if (m && +m[2] <= 12 && +m[1] <= 31 && !/\d[.,]\d{2}\s*(TL|₺)/i.test(m[0])) {
    const y = guessYear(+m[2], +m[1], now)
    return `${y}-${pad(+m[2])}-${pad(+m[1])}`
  }
  return undefined
}

export function findTime(s: string): string | undefined {
  // Önce "seans/saat" yakınındaki saat, yoksa metindeki ilk saat (fiyat/tarih olmayan)
  const near = /(seans|saat|saati|time|başlang[ıi]ç|baslangic)\D{0,12}([01]?\d|2[0-3])[:.]([0-5]\d)\b/i.exec(s)
  if (near) return `${pad(+near[2])}:${near[3]}`
  const re = /(?<![\d.,/])([01]?\d|2[0-3])[:]([0-5]\d)(?![\d.,/])/g
  const m = re.exec(s)
  return m ? `${pad(+m[1])}:${m[2]}` : undefined
}

function cleanPrice(v: string): string | undefined {
  const m = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(TL|₺|TRY)?/i.exec(v)
  if (!m) return undefined
  let num = m[1].replace(/\s/g, '')
  // 1.250,00 → 1250 · 520,00 → 520 · 520.50 → 520,50
  if (/,\d{1,2}$/.test(num)) num = num.replace(/\./g, '').replace(/,(\d{1,2})$/, (_, d) => (/^0+$/.test(d) ? '' : `,${d}`))
  else if (/\.\d{3}$/.test(num)) num = num.replace(/\./g, '')
  else num = num.replace(/\.(\d{1,2})$/, (_, d) => (/^0+$/.test(d) ? '' : `,${d}`))
  const n = Number(num.replace(',', '.'))
  if (!n || n > 100000) return undefined
  return `${num} ₺`
}

function cleanSeat(v: string): string | undefined {
  const list = v.toUpperCase().match(/\b[A-Z]{1,2}\s*-?\s*\d{1,3}\b/g)
  if (list?.length) return [...new Set(list.map((x) => x.replace(/[\s-]/g, '')))].join(', ')
  // "Sıra F Koltuk 12" biçimi
  const m = /s[ıi]ra\s*:?\s*([A-Z]{1,2})\D{1,12}(\d{1,3})/i.exec(v)
  if (m) return `${m[1].toUpperCase()}${m[2]}`
  return undefined
}

function cleanHall(v: string): string | undefined {
  const t = v.replace(/^\s*salon\s*(no|numaras[ıi])?\s*[:#.-]?\s*/i, '').trim()
  const m = /^([0-9]{1,2}|[A-Za-zÇĞİÖŞÜçğıöşü0-9]+(?:\s+[A-Za-zÇĞİÖŞÜçğıöşü0-9]+)?)/.exec(t)
  if (!m) return undefined
  const out = m[1].trim()
  return out.length <= 20 ? out : undefined
}

// Zincir adı büyük/küçük harf fark etmeden, arkasındaki şube adı (en çok 3 kelime) sadece Büyük harfle başlıyorsa
const anyCase = (c: string) =>
  [...c].map((ch) => (ch === ' ' ? '\\s*' : /\p{L}/u.test(ch) ? `[${ch.toLocaleLowerCase('tr')}${ch.toLocaleUpperCase('tr')}${ch.toLowerCase()}${ch.toUpperCase()}]` : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('')
const STOP = "(?!(?:[Ss]alon|SALON|[Ss]eans|SEANS|[Ss]inemas|[Tt]arih|[Ff]ilm|FILM|[Kk]oltuk|KOLTUK|[Ss]aat|[İi]çin|[Ii]cin|E-B[İI]LET|E-[Bb]ilet|B[İI]LET|[Bb]ilet|[Rr]ezervasyon|REZERVASYON)(?![\\wçğıöşü]))"
function findCinema(s: string): string | undefined {
  for (const c of CHAINS) {
    const re = new RegExp(`(${anyCase(c)})((?:\\s+${STOP}[A-ZÇĞİÖŞÜ][\\wÇĞİÖŞÜçğıöşü'’&.-]*){0,3})`)
    const m = re.exec(s)
    if (m) {
      const chain = m[1] === m[1].toUpperCase() && m[1] !== c ? c : m[1]
      return `${chain}${m[2] ?? ''}`.replace(/\s+/g, ' ').replace(/\s+(IMAX|4DX|ScreenX|VIP|Gold)$/i, '').replace(/[.,;:-]+$/, '').trim()
    }
  }
  return undefined
}

function cleanTitle(v: string): string | undefined {
  let t = v
    .replace(/\((\s*(TR|ENG?|ORJ|ORİJİNAL|ALTYAZI(LI)?|DUBLAJ|TÜRKÇE|IMAX|2D|3D|4DX)[^)]*)\)/gi, '')
    .replace(/\b(2D|3D|IMAX|4DX|ScreenX)\b/gi, '')
    .replace(/\s*[-–|]\s*(Türkçe\s*)?(Dublaj|Altyazı(lı)?|Altyazili|Orijinal|TR\s*Dublaj)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^["“'‘\s]+|["”'’\s.,;]+$/g, '')
    .trim()
  if (!t || t.length > 120) return undefined
  // TAMAMI BÜYÜK yazılmış SMS adlarını başlık düzenine çevir ("OPPENHEIMER" → "Oppenheimer")
  if (t === t.toLocaleUpperCase('tr') && /[A-ZÇĞİÖŞÜ]{3}/.test(t)) {
    // Türkçe harf yoksa (ör. OPPENHEIMER) İngilizce kuralıyla: I → i (ı değil)
    const tr = /[ÇĞİÖŞÜ]/.test(t)
    const lo = (x: string) => (tr ? x.toLocaleLowerCase('tr') : x.toLowerCase())
    const up = (x: string) => (tr ? x.toLocaleUpperCase('tr') : x.toUpperCase())
    t = lo(t).replace(/(^|[\s:(-])(\p{L})/gu, (_, a, b) => a + up(b))
  }
  return t
}

export function parseEBilet(text: string, now = new Date()): EBiletFields {
  const out: EBiletFields = {}
  const src = text.replace(/\r/g, '').replace(/[   ]/g, ' ')
  // "Anahtar: değer" parçaları (satır satır; tek satırlık SMS'lerde " | " / " - " ile ayrılmış olabilir)
  const parts = src.split(/\n|\s\|\s|•|(?:;|\s[-–])(?=\s*[A-ZÇĞİÖŞÜa-zçğıöşü() ]{3,25}:)/)
  for (const raw of parts) {
    const m = /^\s*([A-Za-zÇĞİÖŞÜçğıöşü() /.]{2,40}?)\s*[:：]\s*(.+?)\s*$/.exec(raw)
    if (!m) continue
    const key = m[1].trim().replace(/\s+/g, ' ')
    const val = m[2].trim()
    for (const [field, re] of KEYS) {
      if (!re.test(key)) continue
      if (field === 'datetime') {
        out.date ??= findDate(val, now)
        out.time ??= findTime(val) ?? findTime(` saat ${val}`)
      } else if (field === 'date') {
        out.date ??= findDate(val, now)
        out.time ??= findTime(val)
      } else if (field === 'time') out.time ??= findTime(` saat ${val}`)
      else if (field === 'title') out.title ??= cleanTitle(val)
      else if (field === 'cinema') out.cinema ??= val.replace(/\s*[-–,]?\s*salon\s*\S+.*$/i, '').replace(/[.,;]+$/, '').trim().slice(0, 80) || undefined
      else if (field === 'hall') out.hall ??= cleanHall(val)
      else if (field === 'seat') out.seat ??= cleanSeat(val)
      else if (field === 'price') out.price ??= cleanPrice(val)
      break
    }
  }
  const flat = src.replace(/\n+/g, ' ')
  // Etiketsiz SMS'ler için metnin tamamından
  out.date ??= findDate(flat, now)
  out.time ??= findTime(flat)
  if (!out.hall) {
    const h = /\bsalon\b\s*(?:no\b|numaras[ıi])?\s*[:#.-]?\s*(\d{1,2}\b|IMAX|VIP|Gold|4DX|ScreenX)/i.exec(flat) ?? /\b(\d{1,2}|IMAX|VIP|Gold|4DX|ScreenX)\s*\.?\s*salon(u|da)?\b/i.exec(flat)
    if (h) out.hall = h[1].length <= 2 || /^\d+$/.test(h[1]) ? h[1].toUpperCase() : h[1]
  }
  if (!out.seat) {
    const s = /koltuk(?:lar[ıi]?|\(lar\)|\s*no|\s*numaras[ıi]|\s*numaralar[ıi])?\s*[:#.-]?\s*((?:[A-Z]{1,2}\s*-?\s*\d{1,3}\s*(?:[,/;&]|\sve\s|\s)?\s*)+)/i.exec(flat)
    if (s) out.seat = cleanSeat(s[1])
    // "F12,F13 koltuklarına" (koltuklar önce yazılmış)
    const before = !s && /((?:\b[A-Z]{1,2}-?\d{1,3}\s*(?:[,/&]|\sve\s)?\s*)+)\s*(?:no'?lu\s*)?koltuk/i.exec(flat)
    if (before) out.seat = cleanSeat(before[1])
    else if (!s) {
      const r = /s[ıi]ra\s*:?\s*([A-Z]{1,2})\b\D{0,12}koltuk\s*:?\s*(\d{1,3})/i.exec(flat)
      if (r) out.seat = `${r[1].toUpperCase()}${r[2]}`
    }
  }
  if (!out.price) {
    const p = /(toplam(\s*tutar)?|tutar|[üu]cret|fiyat|[öo]denen)\D{0,15}?(\d[\d.,\s]*\s*(TL|₺|TRY))/i.exec(flat) ?? /(\d[\d.,]*\s*(TL|₺|TRY))\b/i.exec(flat)
    if (p) out.price = cleanPrice(p[3] ?? p[1])
  }
  out.cinema ??= findCinema(flat)
  for (const [re, f] of FORMATS) if (re.test(flat)) {
    out.format = f
    break
  }
  if (!out.title) {
    // "OPPENHEIMER filmi", "“Dune” filmine", "Film: X" olmayan SMS'lerde tırnak içi
    const q = /["“'‘]([^"”'’\n]{2,80})["”'’]\s*(film|gösterim|seans|için|icin|adl[ıi])/i.exec(flat) ?? /\b(?:filmi|film)\s*[:-]?\s*["“]([^"”]{2,80})["”]/i.exec(flat)
    const f = q ?? /(?:^|[.,]\s+|\s)((?:[A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜ0-9:'’&-]*\s?){1,8})\s+(?:filmi|filmine|filminin|filmi için|isimli film|adl[ıi] film)/.exec(flat)
    if (f) out.title = cleanTitle(f[1])
  }
  for (const k of Object.keys(out) as (keyof EBiletFields)[]) if (!out[k]) delete out[k]
  return out
}
