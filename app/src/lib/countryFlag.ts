import { splitFlagEmoji } from './flagEmoji'

// Ülke adından gerçek bayrak (flag-icons) kodu: "Türkiye" → "tr", "ABD" → "us". Windows bayrak emojisini harf
// olarak gösterdiği için emoji değil, flag-icons'un SVG bayrağı çiziliyor (<span class="fi fi-tr" />).
// Bulunamazsa null — o zaman hiç bayrak gösterilmez, harf kodu asla gösterilmez.

// flag-icons paketinde SVG'si olan iki harfli kodlar
const FLAG_CODES = new Set(
  'ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws xk ye yt za zm zw'.split(' '),
)

// Kısaltmalar ve eski / yaygın adlar (Intl'in verdiği resmi addan farklı yazılanlar)
const ALIASES: Record<string, string> = {
  abd: 'us',
  usa: 'us',
  'amerika': 'us',
  'united states of america': 'us',
  bae: 'ae',
  uae: 'ae',
  uk: 'gb',
  'ingiltere': 'gb',
  'england': 'gb',
  'büyük britanya': 'gb',
  'çek cumhuriyeti': 'cz',
  'czech republic': 'cz',
  'hong kong': 'hk',
  zambia: 'zm',
  'kore': 'kr',
  'south korea': 'kr',
  'north korea': 'kp',
  'kuzey makedonya': 'mk',
  'makedonya': 'mk',
  'fildişi sahili': 'ci',
  'bosna hersek': 'ba',
  'kktc': 'cy',
  'rusya federasyonu': 'ru',
  'iran': 'ir',
  'vietnam': 'vn',
}

const norm = (s: string) => s.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ')

let byName: Map<string, string> | null = null
function nameMap(): Map<string, string> {
  if (byName) return byName
  const m = new Map<string, string>()
  for (const lang of ['tr', 'en']) {
    let d: Intl.DisplayNames | null = null
    try {
      d = new Intl.DisplayNames([lang], { type: 'region' })
    } catch {
      d = null
    }
    if (!d) continue
    for (const code of FLAG_CODES) {
      try {
        const n = d.of(code.toUpperCase())
        if (n && n.toUpperCase() !== code.toUpperCase() && !m.has(norm(n))) m.set(norm(n), code)
      } catch {
        /* bilinmeyen kod */
      }
    }
  }
  for (const [k, v] of Object.entries(ALIASES)) m.set(norm(k), v)
  byName = m
  return m
}

export function countryFlagCode(label: string): string | null {
  if (!label) return null
  const { flagCode, rest } = splitFlagEmoji(label)
  if (flagCode && FLAG_CODES.has(flagCode)) return flagCode
  return nameMap().get(norm(rest)) ?? null
}
