// Sunucunun dili: kullanıcı "argus u komple ingilizce yap" dedi. Arayüz dili localStorage'da `argus_lang`
// olarak tutuluyor ve uiPrefs ile data/ui-prefs.json'a da yazılıyor; sunucu oradan okur. Bildirimler,
// hata mesajları, TMDB'den gelen bilgiler (özet, tür adları, başlıklar) ve sunucunun kendisi açtığı
// sütun/seçenek adları bu dilde olur. Kaynak dil Türkçe: stt('Türkçe metin') — İngilizce karşılıklar
// server/locales/en.json'da (bulunamayan Türkçe kalır).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PREFS_FILE = path.resolve(__dirname, '..', '..', 'data', 'ui-prefs.json')
const EN = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'en.json'), 'utf-8'))
  } catch {
    return {}
  }
})()

let cache = { mtime: -1, prefs: {} }
function prefs() {
  try {
    const m = fs.statSync(PREFS_FILE).mtimeMs
    if (m !== cache.mtime) cache = { mtime: m, prefs: JSON.parse(fs.readFileSync(PREFS_FILE, 'utf-8')).prefs ?? {} }
  } catch {
    /* dosya yok — varsayılanlar */
  }
  return cache.prefs
}

/** 'tr' | 'en' — tercih yoksa Türkçe (eski kurulumlar) */
export function serverLang() {
  return prefs().argus_lang === 'en' ? 'en' : 'tr'
}

/** İzleme platformları ve yaş sınırı için ülke kodu (TR, US, GB…) — arayüz sistemin bölgesini yazar */
export function serverRegion() {
  const r = prefs().argus_region
  return typeof r === 'string' && /^[A-Z]{2}$/.test(r) ? r : serverLang() === 'tr' ? 'TR' : 'US'
}

/** TMDB isteklerinin dili */
export function tmdbLang() {
  return serverLang() === 'tr' ? 'tr-TR' : 'en-US'
}

/** Metni sunucunun diline çevirir; {0}, {1}… yer tutucular; çoğul "tekil|çoğul" (ilk sayıya göre) */
export function stt(text, ...args) {
  let out = text
  if (serverLang() !== 'tr' && EN[text] !== undefined) {
    out = EN[text]
    const n = args.find((a) => typeof a === 'number')
    if (n !== undefined && out.includes('|')) {
      const [one, many] = out.split('|')
      out = n === 1 || n === -1 ? one : many
    }
  }
  return args.length ? out.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? '')) : out
}

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

/** "2026-03-12" → "12 Mart 2026" / "March 12, 2026" */
export function langDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!d || !m) return String(iso)
  if (serverLang() === 'tr') return `${d} ${TR_MONTHS[m - 1]} ${y}`
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d))
}
