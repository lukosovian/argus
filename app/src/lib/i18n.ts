// Çok dil desteği — kullanıcı "argus u komple ingilizce yap, her yerini hatasız" dedi. Kaynak dil Türkçe:
// arayüzdeki her metin `tt('Türkçe metin')` ile yazılır, anahtar da metnin kendisidir. İngilizce
// karşılıklar src/locales/en.json'da; bulunamayan metin Türkçe kalır (tarayıcı konsolunda uyarı verir).
//
//   tt('{0} bölüm', n)   → "3 bölüm" / "3 episodes"   (çoğul: en.json'da "{0} episode|{0} episodes")
//   tt('{0} ile {1}', a, b) → yer tutucular {0}, {1}…
//
// Dil, sayfa yüklenirken bir kez belirlenir (main.tsx uygulamayı ondan sonra yükler; modüllerdeki sabit
// listeler de doğru dilde kurulsun diye). Dil değişince sayfa yeniden yüklenir. Seçim localStorage'da
// `argus_lang` olarak durur ve uiPrefs.ts ile sunucuya da gider — sunucu da bildirimleri, TMDB bilgilerini
// ve yeni sütun adlarını bu dilde yazar.
import { createElement, Fragment, type ReactNode } from 'react'
import en from '../locales/en.json'

export type Lang = 'tr' | 'en'

export const LANGS: { id: Lang; label: string; locale: string }[] = [
  { id: 'tr', label: 'Türkçe', locale: 'tr-TR' },
  { id: 'en', label: 'English', locale: 'en-US' },
]

const DICTS: Partial<Record<Lang, Record<string, string>>> = { en }
export const LANG_KEY = 'argus_lang'

let current: Lang = 'tr'

export function getLang(): Lang {
  return current
}

/** Sistem dilinden: Türkçe değilse İngilizce */
export function detectLang(): Lang {
  for (const l of navigator.languages ?? [navigator.language]) {
    if (l.toLowerCase().startsWith('tr')) return 'tr'
    if (l) return 'en'
  }
  return 'en'
}

/**
 * Kayıtlı dil; yoksa (bu sürümden önce) — profil kurulmuş eski bir ARGUS ise Türkçe kalır, ilk kez
 * açılan yeni bir kurulumsa sistemin dili. Seçilen dil hemen kaydedilir (sunucu da bilsin).
 */
export async function initLang() {
  const q = new URLSearchParams(location.search).get('lang')
  if (q === 'tr' || q === 'en') {
    current = q
    return
  }
  let saved: string | null = null
  try {
    saved = localStorage.getItem(LANG_KEY)
  } catch {
    /* kapalı */
  }
  if (saved === 'tr' || saved === 'en') {
    current = saved
  } else {
    let existing = false
    try {
      const r = await fetch('/api/profiles')
      existing = r.ok && ((await r.json()) as unknown[]).length > 0
    } catch {
      /* sunucuya ulaşılamadı */
    }
    current = existing ? 'tr' : detectLang()
    try {
      localStorage.setItem(LANG_KEY, current)
    } catch {
      /* kapalı */
    }
  }
  document.documentElement.lang = current
  // İzleme platformları ve yaş sınırları için ülke (sunucu okur): sistemin bölgesi, yoksa dile göre
  try {
    if (!localStorage.getItem('argus_region')) {
      const region = (navigator.languages ?? [navigator.language]).map((l) => l.split('-')[1]).find((r) => r && /^[A-Za-z]{2}$/.test(r))
      localStorage.setItem('argus_region', (region ?? (current === 'tr' ? 'TR' : 'US')).toUpperCase())
    }
  } catch {
    /* kapalı */
  }
}

/** Dili değiştirir ve sayfayı yeniden yükler */
export function setLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    /* kapalı */
  }
  // Sunucuya da yazılsın diye (uiPrefs 400 ms sonra gönderir) kısa bir bekleme
  fetch('/api/ui-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ set: { [LANG_KEY]: lang } }) })
    .catch(() => {})
    .finally(() => location.reload())
}

/** Tarih/sayı biçimleri için (toLocaleDateString vb.) */
export function locale() {
  return LANGS.find((l) => l.id === current)!.locale
}

/** Bölüm kodu: Türkçede "S1B2" (Sezon/Bölüm), İngilizcede "S1E2" (Season/Episode) */
export const EP = () => (current === 'tr' ? 'B' : 'E')

const missing = new Set<string>()

/** Metni seçili dile çevirir; {0}, {1}… yerine argümanlar gelir. Çoğul: "tekil|çoğul" (ilk sayı 1 ise tekil). */
export function tt(text: string, ...args: (string | number | null | undefined)[]): string {
  let out = text
  if (current !== 'tr') {
    const hit = DICTS[current]?.[text]
    if (hit !== undefined) {
      out = hit
      // Çoğul yalnızca sayı argümanı varsa (metnin kendisinde | geçebilir)
      const n = args.find((a): a is number => typeof a === 'number')
      if (n !== undefined && out.includes('|')) {
        const [one, many] = out.split('|')
        out = n === 1 || n === -1 ? one : many
      }
    } else if (import.meta.env.DEV && !missing.has(text)) {
      missing.add(text)
      console.warn('[i18n] çevirisi yok:', text)
    }
  }
  return args.length ? out.replace(/\{(\d+)\}/g, (_m, i) => (args[Number(i)] ?? '') + '') : out
}

/**
 * Aynı Türkçe metnin farklı yerlerde farklı çevrilmesi gerektiğinde (ör. "Hepsini aç": TMDB alanlarında
 * "Turn all on", Yama Notları'nda "Expand all"): sözlükte "bağlam::metin" anahtarı aranır, yoksa düz metin.
 */
export function ttc(ctx: string, text: string, ...args: (string | number | null | undefined)[]): string {
  const key = `${ctx}::${text}`
  if (current !== 'tr' && DICTS[current]?.[key] !== undefined) return tt(key, ...args)
  return tt(text, ...args)
}

/** Elle sözlük kontrolü (testler/önizleme) */
export function hasTranslation(text: string) {
  return current === 'tr' || DICTS[current]?.[text] !== undefined
}

/**
 * tt gibi, ama yer tutuculara React öğeleri de konabilir — cümle bölünmeden çevrilsin diye:
 *   ttx('Arşivinde {0} yapımı var', <b>{n}</b>, n)  → kelime sırası her dilde doğru kalır.
 * Çoğul, argümanlardaki ilk sayıya göre seçilir (metinde kullanılmayan bir sayı da verilebilir, yukarıdaki n gibi).
 */
const MARK = '\u0001'
export function ttx(text: string, ...args: ReactNode[]): ReactNode {
  const marked = tt(text, ...args.map((a, i) => (typeof a === 'number' ? a : `${MARK}${i}${MARK}`)))
  const parts = marked.split(/\u0001(\d+)\u0001/)
  return createElement(Fragment, null, ...parts.map((p, i) => (i % 2 ? createElement(Fragment, { key: i }, args[Number(p)]) : p)))
}

/** Ay adları seçili dilde (Ocak… / January…); short: Oca… / Jan… */
export function monthNames(form: 'long' | 'short' = 'long') {
  const f = new Intl.DateTimeFormat(locale(), { month: form })
  return Array.from({ length: 12 }, (_, m) => f.format(new Date(2024, m, 1)))
}

/** Gün adları pazartesiden başlayarak; two: takvim başlığındaki iki harfli kısaltmalar (Pt Sa Ça… / Mo Tu We…) */
export function dayNames(form: 'long' | 'short' | 'two' = 'long') {
  if (form === 'two') return current === 'tr' ? ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
  const f = new Intl.DateTimeFormat(locale(), { weekday: form })
  // 1 Ocak 2024 pazartesi
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)))
}

/**
 * Elle kurulan tarih yazıları için: Türkçede "12 Mart 2025, Pazartesi" (eskisi gibi), İngilizcede
 * "Monday, March 12, 2025". y/d boş bırakılabilir; m 0'dan başlar.
 */
export function fmtDate(y: number | null, m: number, d: number | null, opts: { short?: boolean; weekday?: boolean } = {}) {
  const date = new Date(y ?? 2024, m, d ?? 1)
  if (current === 'tr') {
    const month = monthNames(opts.short ? 'short' : 'long')[m]
    const wd = opts.weekday ? `, ${dayNames()[(date.getDay() + 6) % 7]}` : ''
    return `${d ? `${d} ` : ''}${month}${y ? ` ${y}` : ''}${wd}`
  }
  return new Intl.DateTimeFormat(locale(), {
    month: opts.short ? 'short' : 'long',
    ...(d ? { day: 'numeric' } : {}),
    ...(y ? { year: 'numeric' } : {}),
    ...(opts.weekday ? { weekday: 'long' } : {}),
  }).format(date)
}
