// TMDB dışındaki ücretsiz, anahtarsız kaynaklar (v1.24). Kullanıcı "TMDB'den başka bakabileceğimiz yer varsa
// birlikte çalışsınlar" ve "sinopsis TMDB'de olduğu halde çekmediği oluyor" dedi. TMDB'de bir bilgi boşsa sırayla:
//   1. TMDB'nin başka çevirileri (aynı dilde başka ülke, sonra İngilizce)
//   2. Vikipedi (TMDB'nin verdiği Wikidata kimliğiyle doğru sayfa bulunur — adla arama yapılmaz, yanlış eşleşmez)
//   3. TVmaze (sadece diziler: IMDb kimliğiyle; özet İngilizce, bölüm süresi)
// Hepsine kısa zaman aşımı var; biri cevap vermezse sessizce geçilir.

const UA = { 'User-Agent': 'ARGUS/1.0 (personal media archive)' }
const TIMEOUT_MS = 8000
const cache = new Map()

async function getJson(url) {
  if (cache.has(url)) return cache.get(url)
  let data = null
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.ok) data = await res.json()
  } catch {
    data = null
  }
  if (cache.size > 500) cache.clear()
  cache.set(url, data)
  return data
}

const clean = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

// TMDB detayındaki (append_to_response=translations) çevirilerden bir alan: önce istenen dil, sonra İngilizce
export function fromTranslations(details, field, lang) {
  const list = details?.translations?.translations ?? []
  const pick = (code) => list.find((t) => t.iso_639_1 === code && clean(t.data?.[field]))
  const t = pick(lang) ?? (lang !== 'en' ? pick('en') : null)
  return t ? { text: clean(t.data[field]), lang: t.iso_639_1 } : null
}

// Wikidata kimliğinden Vikipedi'deki giriş paragrafı (istenen dilde; yoksa null)
export async function wikiSummary(wikidataId, lang) {
  if (!/^Q\d+$/.test(String(wikidataId ?? ''))) return null
  const site = `${lang}wiki`
  const wd = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&props=sitelinks&sitefilter=${site}&format=json`)
  const title = wd?.entities?.[wikidataId]?.sitelinks?.[site]?.title
  if (!title) return null
  const sum = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
  const text = clean(sum?.extract)
  return text.length >= 40 ? { text, url: sum?.content_urls?.desktop?.page ?? null } : null
}

// IMDb kimliğiyle TVmaze'deki dizi (özet, ortalama bölüm süresi, adı)
export async function tvmazeShow(imdbId) {
  if (!/^tt\d+$/.test(String(imdbId ?? ''))) return null
  const d = await getJson(`https://api.tvmaze.com/lookup/shows?imdb=${imdbId}`)
  if (!d?.id) return null
  return { id: d.id, name: d.name ?? '', summary: clean(d.summary), runtime: d.averageRuntime || d.runtime || null, premiered: d.premiered ?? '' }
}

// Metni seçili dile çevirir (Google Çeviri'nin anahtarsız ucu, olmazsa MyMemory). Çevrilemezse null.
// Kullanıcı "Türkçe sinopsis bulamayıp başka dil bulursa Türkçeye çevirsin" dedi (v1.24).
export async function translateText(text, to) {
  const src = String(text ?? '').trim()
  if (!src) return null
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(src.slice(0, 4500))}`
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.ok) {
      const j = await res.json()
      const out = (j?.[0] ?? []).map((p) => p?.[0] ?? '').join('').trim()
      if (out && j?.[2] !== to) return out
      if (out && j?.[2] === to) return src
    }
  } catch {
    /* yedeğe geç */
  }
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(src.slice(0, 480))}&langpair=en|${to}`
    const j = await getJson(url)
    const out = clean(j?.responseData?.translatedText)
    if (out && j?.responseStatus === 200) return out
  } catch {
    /* çevrilemedi */
  }
  return null
}

// Sinopsis için en iyi metin: TMDB (seçili dil) → TMDB çevirisi → Vikipedi → TMDB İngilizce → TVmaze. `source` nereden geldiği.
// Seçili dilde bulunamayıp başka dilde bulunan metin seçili dile çevrilir (çevrilemezse olduğu gibi yazılır).
export async function bestOverview(details, mediaType, lang) {
  const own = clean(details?.overview)
  if (own) return { text: own, source: 'tmdb' }
  const same = fromTranslations(details, 'overview', lang)
  if (same && same.lang === lang) return { text: same.text, source: 'tmdb' }
  const ext = details?.external_ids ?? {}
  const wiki = await wikiSummary(ext.wikidata_id, lang)
  if (wiki) return { text: wiki.text, source: 'wikipedia' }
  let found = same ? { text: same.text, source: 'tmdb-en' } : null
  if (!found && mediaType === 'tv') {
    const tm = await tvmazeShow(ext.imdb_id)
    if (tm?.summary) found = { text: tm.summary, source: 'tvmaze' }
  }
  if (!found) {
    // Son çare: herhangi bir dildeki TMDB çevirisi (ör. sadece Korece özeti olan dizi)
    const any = (details?.translations?.translations ?? []).find((t) => clean(t.data?.overview))
    if (any) found = { text: clean(any.data.overview), source: 'tmdb-' + any.iso_639_1 }
  }
  if (!found) return null
  const tr = await translateText(found.text, lang)
  return tr ? { text: tr, source: found.source, translated: true } : found
}

// Dizinin bölüm süresi (dakika): TMDB'nin ortalaması → son/sıradaki bölümün süresi → TVmaze
export async function seriesRuntime(details) {
  const list = (details?.episode_run_time ?? []).filter((m) => m > 0)
  if (list.length) return Math.round(list.reduce((a, b) => a + b, 0) / list.length)
  const one = details?.last_episode_to_air?.runtime || details?.next_episode_to_air?.runtime
  if (one) return one
  const tm = await tvmazeShow(details?.external_ids?.imdb_id)
  return tm?.runtime || null
}
