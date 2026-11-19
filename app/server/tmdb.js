// TMDB istemcisi ve TMDB ile ilgili ortak yardımcılar (arama, kimlik eşleşmesi, kart, arşiv dizini).
import fs from 'node:fs'
import path from 'node:path'
import { resolveRole, watchedStatusIds } from './roles.js'
import { serverLang, serverRegion, stt, tmdbLang } from './lang.js'
import { MEDYA_DIR, profileDir, profileTmdbFile, readJson, writeJson } from './storage.js'

export const TMDB_BASE = 'https://api.themoviedb.org/3'
export const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p'

export const ISO_TO_TR = {
  US: 'ABD', GB: 'Birleşik Krallık', FR: 'Fransa', IT: 'İtalya', BE: 'Belçika',
  DE: 'Almanya', DK: 'Danimarka', SE: 'İsveç', AU: 'Avustralya', CZ: 'Çek Cumhuriyeti',
  NZ: 'Yeni Zelanda', PL: 'Polonya', SI: 'Slovenya', CA: 'Kanada', CN: 'Çin',
  JP: 'Japonya', ES: 'İspanya', KR: 'Güney Kore', HK: 'Hong Kong', LU: 'Lüksemburg',
  AE: 'BAE', GM: 'Gambiya', HU: 'Macaristan', JO: 'Ürdün', RU: 'Rusya',
  IN: 'Hindistan', MX: 'Meksika', IE: 'İrlanda', IS: 'İzlanda', TH: 'Tayland',
  AR: 'Arjantin', NO: 'Norveç', NL: 'Hollanda', PH: 'Filipinler', VE: 'Venezuela',
  CY: 'Kıbrıs', LB: 'Lübnan', QA: 'Katar', AT: 'Avusturya', BG: 'Bulgaristan',
  ZM: 'Zambia', TW: 'Tayvan', RS: 'Sırbistan', BR: 'Brezilya', ZA: 'Güney Afrika',
  CO: 'Kolombiya', SG: 'Singapur', MT: 'Malta', SK: 'Slovakya', CH: 'İsviçre',
  TR: 'Türkiye', FI: 'Finlandiya', PT: 'Portekiz', GR: 'Yunanistan', RO: 'Romanya',
  UA: 'Ukrayna', IL: 'İsrail', EG: 'Mısır', SA: 'Suudi Arabistan', ID: 'Endonezya',
  MY: 'Malezya', VN: 'Vietnam', PK: 'Pakistan', BD: 'Bangladeş', NG: 'Nijerya',
}

export function normalizeText(s) {
  return (s ?? '')
    .toString()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/ı/g, 'i')
}

export function stripFlagEmoji(label) {
  return label.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}/u, '').trim()
}

// Listede olmayan ülkelerin Türkçe adı (ör. HR → Hırvatistan). Kullanıcı yeni eklenen ülke
// etiketlerinin başında bayrak emojisi (Windows'ta "HR" gibi harf olarak görünüyordu) ve İngilizce
// ad ("Croatia") çıktığını söyledi — artık diğer ülkeler gibi sade Türkçe ad yazılıyor.
export function isoToTrName(iso2) {
  if (!iso2 || iso2.length !== 2) return null
  try {
    const name = new Intl.DisplayNames([serverLang()], { type: 'region' }).of(iso2.toUpperCase())
    return name && name !== iso2.toUpperCase() ? name : null
  } catch {
    return null
  }
}

// Takılan bir istek doldurmayı dakikalarca dondurmasın diye 20 sn zaman aşımı; TMDB'nin
// "çok istek" (429) ve geçici sunucu hatalarında (5xx) da kısa bir beklemeyle yeniden deneniyor.
export async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: options?.signal ?? AbortSignal.timeout(20000) })
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const ra = Number(res.headers.get('retry-after'))
        await new Promise((r) => setTimeout(r, ra > 0 && ra < 30 ? ra * 1000 : 800 * 2 ** attempt))
        continue
      }
      return res
    } catch (e) {
      if (attempt >= retries) throw e
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }
}

// TMDB'ye istek sınırı: 10 saniyede en fazla 40 istek (bütün işler toplamı — Genel Güncelleme, takip turu, Keşfet…
// aynı anda çalışınca TMDB "çok istek" (429) deyip yavaşlatıyordu). Sınır dolunca sıradaki istek biraz bekler.
const RATE_MAX = 40
const RATE_WINDOW_MS = 10_000
const rateTimes = []
async function rateLimit() {
  for (;;) {
    const now = Date.now()
    while (rateTimes.length && now - rateTimes[0] >= RATE_WINDOW_MS) rateTimes.shift()
    if (rateTimes.length < RATE_MAX) {
      rateTimes.push(now)
      return
    }
    await new Promise((r) => setTimeout(r, RATE_WINDOW_MS - (now - rateTimes[0]) + 5))
  }
}

// Kısa süreli yanıt önbelleği (bellekte, en fazla 400 yanıt): aynı yapımın detayları/sezonları birkaç dakika içinde
// birden çok yerden (detay penceresi, takip turu, doldurma) istenince TMDB'ye tekrar gidilmez. Varsayılan 6 saat;
// çağıran `maxAgeMs` ile daha tazesini isteyebilir (TMDB'den doldurma 30 dk — "Güncelle"ye basınca yeni bölüm gelsin).
// Aramalar önbelleğe alınmaz. Yanıt metin olarak saklanır, her seferinde yeni bir nesne döner (çağıran değiştirebilir).
const TMDB_CACHE_MS = 6 * 3600e3
const TMDB_CACHE_MAX = 400
const tmdbCache = new Map() // anahtar (adres, api_key hariç) → { at, text }

export async function tmdbGet(path_, params, apiKey, { maxAgeMs = TMDB_CACHE_MS } = {}) {
  const url = new URL(`${TMDB_BASE}${path_}`)
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, v)
  const cacheable = !path_.startsWith('/search/') && maxAgeMs > 0
  const key = url.toString()
  if (cacheable) {
    const hit = tmdbCache.get(key)
    if (hit && Date.now() - hit.at < maxAgeMs) return JSON.parse(hit.text)
  }
  url.searchParams.set('api_key', apiKey)
  await rateLimit()
  const res = await fetchWithRetry(url)
  if (!res.ok) return null
  const text = await res.text()
  const data = JSON.parse(text)
  if (cacheable && text.length < 2_000_000) {
    tmdbCache.delete(key)
    tmdbCache.set(key, { at: Date.now(), text })
    if (tmdbCache.size > TMDB_CACHE_MAX) tmdbCache.delete(tmdbCache.keys().next().value)
  }
  return data
}

// Bir dizinin sezonları tek tek değil, 20'şerli gruplar halinde (append_to_response=season/1,season/2,…) çekilir —
// 10 sezonluk dizi için 10 yerine 1 istek. Dönüş: { [sezonNo]: sezon verisi | null }. Grupta gelmeyen sezon tek başına denenir.
export async function tmdbSeasons(tvId, seasonNumbers, params, apiKey, opts) {
  const out = {}
  for (let i = 0; i < seasonNumbers.length; i += 20) {
    const chunk = seasonNumbers.slice(i, i + 20)
    const d = await tmdbGet(`/tv/${tvId}`, { ...params, append_to_response: chunk.map((n) => `season/${n}`).join(',') }, apiKey, opts)
    for (const n of chunk) {
      out[n] = d?.[`season/${n}`] ?? (await tmdbGet(`/tv/${tvId}/season/${n}`, params, apiKey, opts))
    }
  }
  return out
}

export async function downloadTmdbImage(url, destPath) {
  if (fs.existsSync(destPath)) return true
  const res = await fetchWithRetry(url)
  if (!res.ok) return false
  // Önce geçici dosyaya yazılıp sonra adı değiştiriliyor — yarıda kesilen bir indirme "var" sayılıp
  // sonsuza dek bozuk afiş olarak kalmasın.
  const tmp = `${destPath}.tmp`
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()))
  fs.renameSync(tmp, destPath)
  return true
}

// Adı birebir tutan en bilinen sonuç: Türkçe sonuçlar + aynı aramanın İngilizcesi birlikte bakılıyor, çünkü
// kullanıcı çoğu zaman İngilizce adı yazıyor ve Türkçe sonuçlarda o ad görünmüyor. "Parasite" → ilk sonuç
// "Parasite Dolls" ya da adı gerçekten "Parasite" olan az bilinen bir film çıkıyordu; doğrusu "Parazit"
// (İngilizce adı Parasite, en çok oy alan). Birebir tutan yoksa null (çağıran ilk sonuca düşer).
export async function bestExact(endpoint, params, trResults, query, apiKey) {
  const q = normalizeText(query)
  const same = (r) => [r.title, r.name, r.original_title, r.original_name].some((t) => t && normalizeText(t) === q)
  const en = await tmdbGet(endpoint, { ...params, query, language: 'en-US' }, apiKey)
  const cands = [...(trResults ?? []), ...(en?.results ?? [])].filter((r) => (r.media_type ? r.media_type === 'movie' || r.media_type === 'tv' : true) && same(r))
  if (!cands.length) return null
  const best = cands.reduce((a, b) => ((b.vote_count ?? 0) > (a.vote_count ?? 0) ? b : a))
  // Türkçe sonuçtaki karşılığı tercih edilir (aynı kimlik), yoksa İngilizcesi — kimlik aynı, sonra Türkçe detay çekiliyor.
  return (trResults ?? []).find((r) => r.id === best.id && (r.media_type ?? '') === (best.media_type ?? '')) ?? best
}

export async function searchTv(query, year, apiKey) {
  if (!query) return null
  const params = { query, language: tmdbLang() }
  if (year) params.first_air_date_year = year
  const withYear = year ? await tmdbGet('/search/tv', params, apiKey) : null
  if (withYear?.results?.[0]) return (await bestExact('/search/tv', { first_air_date_year: year }, withYear.results, query, apiKey)) ?? withYear.results[0]
  const noYear = await tmdbGet('/search/tv', { query, language: tmdbLang() }, apiKey)
  if (!noYear?.results?.length) return null
  return (await bestExact('/search/tv', {}, noYear.results, query, apiKey)) ?? noYear.results[0]
}

// Önce İLK vizyon yılıyla (primary_release_year) aranır — sadece 'year' ile arayınca o yıl yeniden
// gösterime giren eski yapımlar öne çıkabiliyordu (ör. 'Transformers' 2007 → 1986 çizgi film). Sonuçlar
// arasında adı birebir tutan tercih edilir.
export function pickByTitle(results, query) {
  const q = normalizeText(query)
  return results.find((r) => normalizeText(r.title ?? '') === q || normalizeText(r.original_title ?? '') === q) ?? results[0] ?? null
}
export async function searchMovie(query, year, apiKey) {
  if (!query) return null
  if (year) {
    const primary = await tmdbGet('/search/movie', { query, language: tmdbLang(), primary_release_year: year }, apiKey)
    if (primary?.results?.length) return pickByTitle(primary.results, query)
    const withYear = await tmdbGet('/search/movie', { query, language: tmdbLang(), year }, apiKey)
    if (withYear?.results?.length) return pickByTitle(withYear.results, query)
  }
  const noYear = await tmdbGet('/search/movie', { query, language: tmdbLang() }, apiKey)
  if (!noYear?.results?.length) return null
  return (await bestExact('/search/movie', {}, noYear.results, query, apiKey)) ?? noYear.results[0]
}

export async function searchMulti(query, year, apiKey) {
  if (!query) return null
  const data = await tmdbGet('/search/multi', { query, language: tmdbLang() }, apiKey)
  const results = (data?.results ?? []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
  if (results.length === 0) return null
  if (year) {
    const match = results.find((r) => (r.release_date || r.first_air_date || '').startsWith(year))
    if (match) return match
  }
  return (await bestExact('/search/multi', {}, results, query, apiKey)) ?? results[0]
}

export function findProp(board, name, type) {
  const target = name.trim().toLocaleLowerCase('tr')
  return board.properties.find((p) => p.name.trim().toLocaleLowerCase('tr') === target && (!type || p.type === type))
}

export function rankTrailers(results) {
  const trailers = (results ?? []).filter((v) => v.site === 'YouTube' && v.type === 'Trailer')
  const official = trailers.filter((v) => v.official)
  const rest = trailers.filter((v) => !v.official)
  return [...official, ...rest]
}

export async function isYoutubeVideoAvailable(videoKey) {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoKey}`)}&format=json`
    const res = await fetchWithRetry(url, undefined, 1)
    return res.ok
  } catch {
    return false
  }
}

export async function getTrailerUrl(mediaType, tmdbId, apiKey) {
  const tr = await tmdbGet(`/${mediaType}/${tmdbId}/videos`, { language: tmdbLang() }, apiKey)
  const trCandidates = rankTrailers(tr?.results)
  for (const c of trCandidates) {
    if (await isYoutubeVideoAvailable(c.key)) return `https://www.youtube.com/watch?v=${c.key}`
  }
  const def = await tmdbGet(`/${mediaType}/${tmdbId}/videos`, {}, apiKey)
  const seenKeys = new Set(trCandidates.map((c) => c.key))
  for (const c of rankTrailers(def?.results)) {
    if (seenKeys.has(c.key)) continue
    if (await isYoutubeVideoAvailable(c.key)) return `https://www.youtube.com/watch?v=${c.key}`
  }
  return null
}

// TMDB logoların bir kısmını SVG olarak veriyor (İngilizce logolarda sık); aynı dilde PNG varsa o seçiliyor.
export function pickLogo(images) {
  const logos = images?.logos ?? []
  if (logos.length === 0) return null
  const pref = (list) => list.find((l) => !/\.svg$/i.test(l.file_path)) ?? list[0]
  return pref(logos.filter((l) => l.iso_639_1 === serverLang())) ?? pref(logos.filter((l) => l.iso_639_1 === 'en')) ?? pref(logos)
}

// Eskiden SVG logolar da .png adıyla kaydediliyordu, tarayıcı açamıyordu (kırık görsel). Böyle bir dosya
// boş sayılıyor ki Güncelle onu yeniden indirsin.
export function isBrokenLogo(value) {
  if (typeof value !== 'string' || !/^\/medya\/[^/]+\.png$/i.test(value)) return false
  try {
    return fs.readFileSync(path.join(MEDYA_DIR, value.slice('/medya/'.length))).subarray(0, 256).toString('utf-8').trimStart().startsWith('<')
  } catch {
    return false
  }
}

// Yaş sınırı hep aynı Türkçe biçimde yazılsın — TMDB bazen Türkiye'nin ("13+", "Genel İzleyici Kitlesi"), bazen
// ABD'nin ("R", "PG-13", "TV-MA") sınıflandırmasını veriyor, sütunda karışık duruyordu (bkz. src/lib/ageRating.ts).
export const AGE_TIERS = {
  'genel izleyici kitlesi': 'Genel İzleyici', 'genel izleyici': 'Genel İzleyici', 'general audience': 'Genel İzleyici', g: 'Genel İzleyici', 'tv-y': 'Genel İzleyici', 'tv-g': 'Genel İzleyici',
  '6+': '6+', '6a': '6+', '7+': '7+', '7a': '7+', pg: '7+', 'tv-y7': '7+', '10+': '10+', '10a': '10+', 'tv-pg': '10+',
  '13+': '13+', '13a': '13+', 'pg-13': '13+', 'tv-14': '13+', '15+': '16+', '16+': '16+', r: '16+', '18+': '18+', 'nc-17': '18+', 'tv-ma': '18+',
}
export function normalizeCert(raw) {
  const tier = raw ? AGE_TIERS[String(raw).trim().toLocaleLowerCase('tr')] : null
  return tier === 'Genel İzleyici' ? stt('Genel İzleyici') : (tier ?? raw)
}

export async function getMovieCertification(tmdbId, apiKey) {
  const data = await tmdbGet(`/movie/${tmdbId}/release_dates`, {}, apiKey)
  const byCountry = new Map((data?.results ?? []).map((c) => [c.iso_3166_1, c.release_dates]))
  for (const cc of [...new Set([serverRegion(), 'US'])]) {
    const entries = byCountry.get(cc)
    if (!entries) continue
    const cert = entries.map((e) => e.certification).find((c) => c)
    if (cert) return normalizeCert(cert)
  }
  return null
}

export async function getTvCertification(tmdbId, apiKey) {
  const data = await tmdbGet(`/tv/${tmdbId}/content_ratings`, {}, apiKey)
  const byCountry = new Map((data?.results ?? []).map((c) => [c.iso_3166_1, c.rating]))
  for (const cc of [...new Set([serverRegion(), 'US'])]) {
    if (byCountry.get(cc)) return normalizeCert(byCountry.get(cc))
  }
  return null
}

// Bir kaydın TMDB'deki karşılığını başlığına/orijinal adına, yılına ve Kategori'sine (Film mi
// Dizi mi) bakarak arar. Sadece arar, kaydı değiştirmez — { result, mediaType } ya da null.
// Kategori etiketinden film mi dizi mi olduğu (bilinmiyorsa ikisi de false)
export function isTvKind(label) {
  return ['dizi', 'mini dizi', 'reality show', 'yarışma', 'series', 'tv series', 'tv show', 'miniseries', 'mini series', 'show'].includes(label) || label.includes('gösteri')
}
export function isMovieKind(label) {
  return ['film', 'kısa film', 'movie', 'short', 'short film', 'sinema filmi'].includes(label)
}

export async function searchTmdbForRow(board, row, apiKey) {
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const origProp = resolveRole(board, 'orjinalAdi')
  const vizyonProp = resolveRole(board, 'vizyon')
  const kategoriProp = resolveRole(board, 'kategori')
  const titleTr = titleProp ? row.values[titleProp.id] : ''
  const titleOrig = origProp ? row.values[origProp.id] : ''
  if (!titleTr && !titleOrig) return null

  let year = null
  const rawYear = vizyonProp ? row.values[vizyonProp.id] : null
  if (typeof rawYear === 'string' && /^\d{4}/.test(rawYear)) year = rawYear.slice(0, 4)

  const kategoriId = kategoriProp ? row.values[kategoriProp.id] : null
  const kategoriLabel = kategoriProp?.options?.find((o) => o.id === kategoriId)?.label ?? ''
  const kategoriLower = kategoriLabel.toLocaleLowerCase('tr')
  const tvHint = isTvKind(kategoriLower)
  // Sadece film olduğu belli olanlarda filmlerde aranır; Anime, Belgesel, Animasyon gibi ikisi de olabilenlerde
  // karışık arama (eskiden 'Dizi' değilse film sayılıyordu — 'Anime' yazan Attack on Titan müzikal filmini buluyordu)
  const movieHint = isMovieKind(kategoriLower)

  if (tvHint) {
    const r = (await searchTv(titleOrig, year, apiKey)) ?? (await searchTv(titleTr, year, apiKey))
    if (r) return { result: r, mediaType: 'tv' }
  } else if (movieHint) {
    const r = (await searchMovie(titleOrig, year, apiKey)) ?? (await searchMovie(titleTr, year, apiKey))
    if (r) return { result: r, mediaType: 'movie' }
  }
  const multi = (await searchMulti(titleOrig, year, apiKey)) ?? (await searchMulti(titleTr, year, apiKey))
  return multi ? { result: multi, mediaType: multi.media_type } : null
}

// Bir kaydı TMDB'den doldurur. Hem tablodaki "TMDB'den Doldur"/Genel Güncelleme hem de
// Benzerler/Keşfet'ten yeni içerik ekleme bunu kullanıyor. `forced` verilirse (TMDB id + tür
// zaten biliniyorsa, ör. Keşfet'ten seçilen içerik) isimle arama hiç yapılmaz. Sonuç her zaman
// { status, data } — çağıran taraf HTTP yanıtına çeviriyor.
// Güncelle'de TMDB'de birden fazla aday varsa kullanıcıya seçtirmek için (kullanıcı "birden fazla sonuç
// bulursa kendi birini mi seçiyor, ekrana getirsin ben seçeyim" dedi). Türkçe ve orijinal adla, Türkçe ve
// İngilizce aranır; adı birebir tutanlar "kesin" sayılır. Kendisi seçtiği durumlar: kesin eşleşme tek
// (Kategori Film/Dizi ya da vizyon yılı doluysa ona göre daraltılmış) ya da bu kaydın zaten bağlı olduğu
// yapım kesinler arasında. Diğer her durumda (birden fazla kesin, ya da hiç kesin yok ama birden fazla
// sonuç) { choose: [...] } döner. Hiç sonuç yoksa {} — normal arama devam eder, bulamazsa hata verir.
export async function pickTmdbCandidate(profileId, board, row, apiKey, always = false) {
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const origProp = resolveRole(board, 'orjinalAdi')
  const vizyonProp = resolveRole(board, 'vizyon')
  const kategoriProp = resolveRole(board, 'kategori')
  const names = [origProp && row.values[origProp.id], titleProp && row.values[titleProp.id]].filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
  const queries = [...new Set(names)]
  if (!queries.length) return {}
  const fold = (s) => normalizeText(String(s ?? '').toLocaleLowerCase('tr')).replace(/ı/g, 'i')
  const wanted = new Set(queries.map(fold))
  const byKey = new Map()
  const exactKeys = new Set()
  for (const q of queries) {
    for (const language of serverLang() === 'tr' ? ['tr-TR', 'en-US'] : ['en-US']) {
      const data = await tmdbGet('/search/multi', { query: q, language }, apiKey)
      for (const r of data?.results ?? []) {
        if (r.media_type !== 'movie' && r.media_type !== 'tv') continue
        const key = tmdbKey(r.media_type, r.id)
        const prev = byKey.get(key)
        // Türkçe sonuç önce geliyor; İngilizce adı ayrıca saklanıyor (listede gösterilir).
        if (!prev) byKey.set(key, { tr: language === tmdbLang() ? r : null, en: language === 'en-US' ? r : null, order: byKey.size })
        else if (language === tmdbLang() && !prev.tr) prev.tr = r
        else if (language === 'en-US' && !prev.en) prev.en = r
        if ([r.title, r.name, r.original_title, r.original_name].some((t) => t && wanted.has(fold(t)))) exactKeys.add(key)
      }
    }
  }
  if (byKey.size === 0) return {}
  const entries = [...byKey.entries()].map(([key, v]) => {
    const r = v.tr ?? v.en
    return { key, r, en: v.en, order: v.order, votes: r.vote_count ?? 0 }
  })
  const toForced = (e) => ({ tmdbId: e.r.id, mediaType: e.r.media_type })
  let exact = entries.filter((e) => exactKeys.has(e.key))
  // Bu kayıt zaten bir yapıma bağlıysa ve o yapım adı tutanlar arasındaysa onu kullan.
  const ref = readJson(profileTmdbFile(profileId), {})[row.id]
  const current = ref && exact.find((e) => e.key === tmdbKey(ref.mediaType, ref.id))
  if (current && !always) return { forced: toForced(current) }
  const kategoriLabel = (kategoriProp?.options?.find((o) => o.id === row.values[kategoriProp.id])?.label ?? '').toLocaleLowerCase('tr')
  if (kategoriLabel) {
    const want = isTvKind(kategoriLabel) ? 'tv' : isMovieKind(kategoriLabel) ? 'movie' : null
    const narrowed = want ? exact.filter((e) => e.r.media_type === want) : []
    if (narrowed.length) exact = narrowed
  }
  const rawYear = vizyonProp ? row.values[vizyonProp.id] : null
  const year = typeof rawYear === 'string' && /^\d{4}/.test(rawYear) ? rawYear.slice(0, 4) : null
  if (year) {
    const narrowed = exact.filter((e) => (e.r.release_date || e.r.first_air_date || '').startsWith(year))
    if (narrowed.length) exact = narrowed
  }
  // `always`: Sağlık Kontrolü › "Yeniden eşleştir" — tek aday olsa da liste gösterilir
  if (exact.length === 1 && !always) return { forced: toForced(exact[0]) }
  if (exact.length === 0 && entries.length === 1 && !always) return { forced: toForced(entries[0]) }
  // Liste: adı tutanlar önce (en bilinen önce), sonra diğerleri TMDB'nin sırasıyla.
  const exactSet = new Set(exact.map((e) => e.key))
  const list = [
    ...exact.sort((a, b) => b.votes - a.votes),
    ...entries.filter((e) => !exactSet.has(e.key)).sort((a, b) => a.order - b.order),
  ].slice(0, 12)
  return {
    choose: list.map((e) => ({
      tmdbId: e.r.id,
      mediaType: e.r.media_type,
      title: (e.r.title || e.r.name || '').replace(/[‎‏‪-‮]/g, '').trim(),
      originalTitle: e.r.original_title || e.r.original_name || '',
      englishTitle: (e.en && (e.en.title || e.en.name)) || '',
      year: (e.r.release_date || e.r.first_air_date || '').slice(0, 4),
      poster: e.r.poster_path ? `${TMDB_IMG_BASE}/w185${e.r.poster_path}` : null,
      overview: (e.r.overview || e.en?.overview || '').slice(0, 220),
      exact: exactSet.has(e.key),
    })),
  }
}

// ---- TMDB tabanlı keşif özellikleri -----------------------------------------------------------
// Nerede İzlenir, Benzer İçerikler, Keşfet ve Yeni Bölümler — hepsi bir kaydın TMDB kimliğine
// (tmdb.json) dayanıyor. Kimliği henüz bilinmeyen (hiç "TMDB'den Doldur" yapılmamış) kayıtlar
// ilk ihtiyaç anında başlığıyla aranıp eşleşme saklanıyor.

export function profileDismissedFile(profileId) {
  return path.join(profileDir(profileId), 'tmdb-dismissed.json')
}

export function tmdbKey(mediaType, id) {
  return `${mediaType}:${id}`
}

// Dizinin TMDB durumu: bitti mi, devam mı ediyor, sıradaki bölüm ne zaman — detay penceresindeki
// "Dizi bitti / Yeni sezon: 12 Mart" etiketi için tmdb.json'daki kayda yazılıyor.
export function showInfoFromDetails(d) {
  const ep = (x) => (x ? { season: x.season_number, episode: x.episode_number, airDate: x.air_date ?? '' } : null)
  return { status: d.status ?? '', next: ep(d.next_episode_to_air), last: ep(d.last_episode_to_air), checkedAt: Date.now() }
}
export function saveShowInfo(profileId, rowId, st) {
  const file = profileTmdbFile(profileId)
  const refs = readJson(file, {})
  if (!refs[rowId]) return
  const next = { status: st.status ?? '', next: st.next, last: st.last, checkedAt: Date.now() }
  if (JSON.stringify(refs[rowId].show ?? null) === JSON.stringify({ ...next, checkedAt: refs[rowId].show?.checkedAt })) return
  refs[rowId] = { ...refs[rowId], show: next }
  writeJson(file, refs)
}

export async function ensureTmdbRef(profileId, board, row, apiKey) {
  const file = profileTmdbFile(profileId)
  const refs = readJson(file, {})
  if (refs[row.id]) return refs[row.id]
  const match = await searchTmdbForRow(board, row, apiKey)
  if (!match) return null
  const ref = { id: match.result.id, mediaType: match.mediaType }
  // Arama sürerken başka bir iş tmdb.json'a yazmış olabilir — eski kopyayı geri yazmamak için tazesi okunuyor.
  const fresh = readJson(file, {})
  if (fresh[row.id]) return fresh[row.id]
  fresh[row.id] = ref
  writeJson(file, fresh)
  return ref
}

// "Bu içerik zaten arşivde mi?" — TMDB kimliği bilinen kayıtlar kimlikle, bilinmeyenler
// başlık/orijinal ad eşleşmesiyle (büyük/küçük harf ve aksan farkı gözetmeden) yakalanıyor.
export function buildArchiveIndex(profileId, board, rows) {
  const refs = readJson(profileTmdbFile(profileId), {})
  const keys = new Set()
  const titles = new Set()
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const origProp = resolveRole(board, 'orjinalAdi')
  for (const row of rows) {
    const ref = refs[row.id]
    if (ref) keys.add(tmdbKey(ref.mediaType, ref.id))
    for (const p of [titleProp, origProp]) {
      const v = p ? row.values[p.id] : ''
      if (typeof v === 'string' && v.trim()) titles.add(normalizeText(v))
    }
  }
  return {
    has(item) {
      if (keys.has(tmdbKey(item.mediaType, item.tmdbId))) return true
      return titles.has(normalizeText(item.title)) || titles.has(normalizeText(item.originalTitle))
    },
  }
}

export function toCard(r, mediaType) {
  const type = r.media_type === 'movie' || r.media_type === 'tv' ? r.media_type : mediaType
  const date = type === 'tv' ? r.first_air_date : r.release_date
  return {
    tmdbId: r.id,
    mediaType: type,
    title: (type === 'tv' ? r.name : r.title) || '',
    originalTitle: (type === 'tv' ? r.original_name : r.original_title) || '',
    year: date ? date.slice(0, 4) : '',
    poster: r.poster_path ? `${TMDB_IMG_BASE}/w342${r.poster_path}` : null,
    backdrop: r.backdrop_path ? `${TMDB_IMG_BASE}/w780${r.backdrop_path}` : null,
    overview: r.overview ?? '',
    rating: typeof r.vote_average === 'number' ? Math.round(r.vote_average * 10) / 10 : null,
  }
}

// Arşivdeki bir TMDB içeriğinin satırı ve durumu (seri ve oyuncu sayfalarında "arşivinde / izledin" için).
export function archiveLookup(profileId, board, rows) {
  const refs = readJson(profileTmdbFile(profileId), {})
  const byKey = new Map()
  for (const [rowId, r] of Object.entries(refs)) if (r?.id) byKey.set(tmdbKey(r.mediaType, r.id), rowId)
  const index = buildArchiveIndex(profileId, board, rows)
  const durumProp = resolveRole(board, 'durum')
  const done = watchedStatusIds(board)
  const rowById = new Map(rows.map((r) => [r.id, r]))
  // TMDB bağlantısı olmayan eski kayıtlar için adıyla eşleştirme
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const origProp = resolveRole(board, 'orjinalAdi')
  const byTitle = new Map()
  for (const r of rows) {
    if (refs[r.id]) continue
    for (const p of [origProp, titleProp]) {
      const v = p ? r.values[p.id] : ''
      if (typeof v === 'string' && v.trim() && !byTitle.has(normalizeText(v))) byTitle.set(normalizeText(v), r.id)
    }
  }
  return (card) => {
    const rowId = byKey.get(tmdbKey(card.mediaType, card.tmdbId)) ?? byTitle.get(normalizeText(card.originalTitle)) ?? byTitle.get(normalizeText(card.title))
    const row = rowId ? rowById.get(rowId) : null
    const statusId = row && durumProp ? row.values[durumProp.id] : null
    return {
      ...card,
      inArchive: Boolean(row) || index.has(card),
      rowId: row ? row.id : null,
      status: statusId ? (durumProp.options?.find((o) => o.id === statusId)?.label ?? null) : null,
      watched: Boolean(statusId && done.has(statusId)),
    }
  }
}

export function mapProviders(list) {
  return (list ?? []).map((p) => ({ name: p.provider_name, logo: p.logo_path ? `${TMDB_IMG_BASE}/w92${p.logo_path}` : null }))
}

// Yeni bölümler: Durum'u "İzleniyor" olan dizilerde, yayınlanmış ama henüz izlenmemiş bölümler.
// TMDB'yi her ana sayfa açılışında yormamak için dizi başına sonuç birkaç saat bellekte tutuluyor.
export const tvStatusCache = new Map()
export const TV_CACHE_MS = 3 * 60 * 60 * 1000

export async function getTvStatus(tmdbId, apiKey) {
  const cached = tvStatusCache.get(tmdbId)
  if (cached && Date.now() - cached.at < TV_CACHE_MS) return cached.data
  const d = await tmdbGet(`/tv/${tmdbId}`, { language: tmdbLang() }, apiKey)
  if (!d) return null
  const data = {
    status: d.status ?? '',
    seasons: (d.seasons ?? []).filter((s) => s.season_number >= 1).map((s) => ({ season: s.season_number, count: s.episode_count ?? 0 })),
    last: d.last_episode_to_air
      ? { season: d.last_episode_to_air.season_number, episode: d.last_episode_to_air.episode_number, name: d.last_episode_to_air.name ?? '', airDate: d.last_episode_to_air.air_date ?? '' }
      : null,
    next: d.next_episode_to_air
      ? { season: d.next_episode_to_air.season_number, episode: d.next_episode_to_air.episode_number, name: d.next_episode_to_air.name ?? '', airDate: d.next_episode_to_air.air_date ?? '' }
      : null,
  }
  tvStatusCache.set(tmdbId, { at: Date.now(), data })
  return data
}

export function tmdbNames(details, mediaType) {
  const en = (details.translations?.translations ?? []).find((t) => t.iso_639_1 === 'en')?.data
  const strip = (s) => String(s ?? '').replace(/[‎‏‪-‮]/g, '').trim()
  // Başka dillerdeki adlar ve TMDB'nin "diğer adları" (ör. "Kara Panter", "Karateci Çocuk") — kullanıcının kendi verdiği
  // yaygın bir Türkçe ad şüpheli sayılmasın
  const alt = new Set()
  for (const t of details.translations?.translations ?? []) if (strip(t.data?.title || t.data?.name)) alt.add(strip(t.data.title || t.data.name))
  for (const t of details.alternative_titles?.titles ?? details.alternative_titles?.results ?? []) if (strip(t.title)) alt.add(strip(t.title))
  return {
    tr: strip(mediaType === 'tv' ? details.name : details.title),
    orig: strip(mediaType === 'tv' ? details.original_name : details.original_title),
    en: strip(en?.title || en?.name),
    yil: String((mediaType === 'tv' ? details.first_air_date : details.release_date) || '').slice(0, 4),
    alt: [...alt].slice(0, 60),
  }
}

export const vfold = (s) =>
  normalizeText(String(s ?? '').toLocaleLowerCase('tr'))
    .replace(/ı/g, 'i')
    .replace(/['’`´]/g, '') // "Flux'ta" = "Fluxta"
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

// İki ad aynı yapımı mı anlatıyor: birebir, biri diğerini içeriyor ("Dune" / "Dune: Part One") ya da kelimelerin çoğu ortak
export function sameName(a, b) {
  const x = vfold(a)
  const y = vfold(b)
  if (!x || !y) return false
  if (x === y) return true
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true
  const wx = new Set(x.split(' ').filter((w) => w.length > 1))
  const wy = new Set(y.split(' ').filter((w) => w.length > 1))
  if (!wx.size || !wy.size) return false
  const common = [...wx].filter((w) => wy.has(w)).length
  return common / Math.min(wx.size, wy.size) >= 0.75 && common >= Math.min(2, wx.size, wy.size)
}
