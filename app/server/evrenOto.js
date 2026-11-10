// Evrenler'in kendiliğinden güncellenmesi — kullanıcı "evrenlere sonradan film ve dizi geldikçe ARGUS bunları
// algılayacak mı" diye sordu, "eklensin mi diye sormasın, o evrendeyse eklesin" dedi.
//
// Haftada bir (ve Evrenler'deki "Şimdi kontrol et" ile) TMDB'ye bakılır:
//   1. Yeni yapımlar: evrenin TMDB etiketi (MCU, DCU), yapım şirketi (Lucasfilm) ya da film serisi (Yüzüklerin
//      Efendisi, Harry Potter, Fantastik Canavarlar). Sadece listenin hazırlandığı tarihten (CUTOFF) sonra çıkan /
//      çıkacak, tarihi belli yapımlar alınır — eski belgeseller, kamera arkası, LEGO / kısa filmler, podcast'ler elenir.
//   2. Yeni sezonlar: listedeki dizilerin listede olmayan (tarihi açıklanmış) sezonları.
//   3. Ertelenen tarihler: henüz çıkmamış yapımların tarihi TMDB'deki güncel tarihle değiştirilir.
// Eklenenler kodda değil veri klasöründe (data/evrenler-oto.json) tutulur — güncellemede kod sıfırlansa da kaybolmaz;
// hazır evrenler okunurken üstüne eklenir (mergeBuiltins). Yeni yapım hikâye sırasında tarihine göre yerleşir.
import path from 'node:path'

const CUTOFF = '2026-06-01'
const WEEK = 7 * 24 * 3600e3
// Belgesel, talk show, haber, reality, çocuk
const BAD_GENRES = new Set([99, 10767, 10763, 10764, 10762])
const BAD_NAME = /(lego|making of|behind the|insider|podcast|gallery|special look|assembled|legends|robot chicken|indiana jones|willow|countdown to|official podcast|disney\+ day)/i
// Kapanmış evrenler (DCEU 2023'te bitti; devamı DCU): bunlara bir şey eklenmez
const CLOSED = new Set(['dceu'])
const SOURCES = {
  mcu: [{ kw: 180547 }],
  dcu: [{ kw: 312528 }],
  starwars: [{ company: 1 }],
  ortadunya: [{ kw: 361759 }, { collection: 119 }],
  buyucu: [{ collection: 1241 }, { collection: 435259 }],
}

let d = null
let cache = null
let cacheBase = null
let running = null

export function initEvrenOto(deps) {
  d = deps
  setTimeout(() => maybeRun().catch(() => {}), 3 * 60e3)
  setInterval(() => maybeRun().catch(() => {}), 6 * 3600e3)
}

function stateFile() {
  return path.join(d.dataDir, 'evrenler-oto.json')
}
function readState() {
  const s = d.readJson(stateFile(), {})
  return { lastRun: s.lastRun ?? 0, added: s.added ?? {}, dates: s.dates ?? {}, hidden: s.hidden ?? {} }
}
function writeState(s) {
  d.writeJson(stateFile(), s)
  cache = null
}

// Hazır evrenler + kendiliğinden eklenenler (tarih düzeltmeleri, gizlenenler)
export function mergeBuiltins(base) {
  if (cache && cacheBase === base) return cache
  const st = readState()
  const out = {}
  for (const [uid, u0] of Object.entries(base)) {
    const hidden = new Set(st.hidden[uid] ?? [])
    const fix = st.dates[uid] ?? {}
    const items = (u0.items ?? []).map((i) => (fix[i.key] ? { ...i, ...fix[i.key] } : i))
    const story = [...(u0.story ?? items.map((i) => i.key))]
    const dateOf = new Map(items.map((i) => [i.key, i.date || '']))
    const added = [...(st.added[uid] ?? [])].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
    for (const a of added) {
      if (items.some((i) => i.key === a.key)) continue
      const { prev, ...it } = a
      items.push({ ...it, auto: true })
      // Hikâye sırasında: tarihi kendinden önce olan son yapımın arkasına (yeni sezon önceki sezonunun da arkasında)
      let pos = -1
      story.forEach((k, idx) => {
        const dt = dateOf.get(k)
        if (dt && it.date && dt <= it.date) pos = idx
      })
      if (prev) pos = Math.max(pos, story.indexOf(prev))
      story.splice(pos + 1, 0, it.key)
      dateOf.set(it.key, it.date || '')
    }
    out[uid] = { ...u0, items: items.filter((i) => !hidden.has(i.key)), story: story.filter((k) => !hidden.has(k)) }
  }
  cache = out
  cacheBase = base
  return out
}

async function maybeRun() {
  if (Date.now() - readState().lastRun < WEEK) return
  await runEvrenOto()
}

export function evrenOtoStatus() {
  const st = readState()
  return { lastRun: st.lastRun || null, running: Boolean(running), added: Object.values(st.added).reduce((a, l) => a + l.length, 0) }
}

export function hideAuto(uid, key) {
  const st = readState()
  st.hidden[uid] = [...new Set([...(st.hidden[uid] ?? []), key])]
  writeState(st)
}

export function runEvrenOto() {
  if (!running) running = doRun().finally(() => (running = null))
  return running
}

const okDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

async function doRun() {
  const apiKey = d.anyApiKey()
  if (!apiKey) return { added: [], dates: 0 }
  const base = d.getBase()
  const st = readState()
  const today = d.localDay()
  const lang = d.tmdbLang()
  const get = (p, q = {}) => d.tmdbGet(p, q, apiKey).catch(() => null)
  const newOnes = []
  let dateFixes = 0

  // Bir dizinin sezonu hangi evrende varsa orada kalır (Peacemaker 1. sezon eski DC'de, 2. sezon yeni DC'de)
  const inAnyUniverse = (id, season) =>
    Object.entries(base).some(([uid, u]) => [...(u.items ?? []), ...(st.added[uid] ?? [])].some((i) => i.type === 'tv' && i.tmdbId === id && (i.season === season || i.season == null)))
  for (const [uid, u0] of Object.entries(base)) {
    if (CLOSED.has(uid)) continue
    const merged = mergeBuiltins(base)[uid]
    const hidden = new Set(st.hidden[uid] ?? [])
    const all = [...(u0.items ?? []), ...(st.added[uid] ?? [])]
    const has = (type, id, season) => all.some((i) => i.type === type && i.tmdbId === id && (season == null || i.season === season || i.season == null))
    const known = (type, id) => all.some((i) => i.type === type && i.tmdbId === id)
    const add = (it) => {
      if (hidden.has(it.key) || all.some((i) => i.key === it.key)) return
      st.added[uid] = [...(st.added[uid] ?? []), it]
      all.push(it)
      newOnes.push({ uid, name: u0.name, it })
    }
    // Yeni yapımın fazı/grubu: tarihi kendinden önce olan son ana yapımın grubu
    const groupFor = (date) => {
      const main = merged.items.filter((i) => !i.extra && i.group && i.date && i.date <= date).sort((a, b) => a.date.localeCompare(b.date))
      return main.length ? main[main.length - 1].group : merged.items.filter((i) => !i.extra && i.group).pop()?.group
    }
    const seasonItem = async (showId, show, en, n, inherit) => {
      const s = await get(`/tv/${showId}/season/${n}`, { language: lang })
      const eps = s?.episodes ?? []
      const it = {
        key: `oto-t${showId}-${n}`,
        type: 'tv',
        tmdbId: showId,
        title: show.name || en?.name || '?',
        en: en?.name || show.name,
        date: s?.air_date || show.seasons?.find((x) => x.season_number === n)?.air_date || '',
        poster: s?.poster_path || show.poster_path || undefined,
        season: n,
        minutes: eps.reduce((a, e) => a + (e.runtime || show.episode_run_time?.[0] || 0), 0) || undefined,
        episodes: eps.length || undefined,
      }
      if (inherit?.group) it.group = inherit.group
      if (inherit?.extra) it.extra = true
      if (inherit?.optional) it.optional = true
      if (inherit?.key) it.prev = inherit.key
      return it
    }

    // 1) Yeni yapımlar
    const cands = []
    for (const src of SOURCES[uid] ?? []) {
      if (src.collection) {
        const c = await get(`/collection/${src.collection}`)
        for (const p of c?.parts ?? []) cands.push({ type: 'movie', r: p })
        continue
      }
      for (const type of ['movie', 'tv']) {
        for (let page = 1; page <= 3; page++) {
          const q = { page, sort_by: type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc' }
          if (src.kw) q.with_keywords = src.kw
          if (src.company) q.with_companies = src.company
          const r = await get(`/discover/${type}`, q)
          const res = r?.results ?? []
          for (const x of res) cands.push({ type, r: x })
          // Tarihe göre yeniden eskiye: sınırın gerisine düştüyse devam etmeye gerek yok
          const last = res[res.length - 1]
          const lastDate = last?.release_date || last?.first_air_date || ''
          if (page >= (r?.total_pages ?? 1) || (lastDate && lastDate < CUTOFF)) break
        }
      }
    }
    for (const { type, r } of cands) {
      const date = r.release_date || r.first_air_date || ''
      const name = r.title || r.name || ''
      if (!okDate(date) || date < CUTOFF) continue
      if (known(type, r.id)) continue
      if ((r.genre_ids ?? []).some((g) => BAD_GENRES.has(g)) || BAD_NAME.test(name)) continue
      if (r.original_language && r.original_language !== 'en') continue
      if (type === 'movie') {
        const [tr, en] = await Promise.all([get(`/movie/${r.id}`, { language: lang }), get(`/movie/${r.id}`, { language: 'en-US' })])
        if (!tr) continue
        if (tr.runtime && tr.runtime < 40) continue
        const dt = tr.release_date || date
        add({ key: `oto-m${r.id}`, type: 'movie', tmdbId: r.id, title: tr.title || en?.title || name, en: en?.title || name, date: dt, poster: tr.poster_path || undefined, minutes: tr.runtime || undefined, group: groupFor(dt) })
      } else {
        const [show, en] = await Promise.all([get(`/tv/${r.id}`, { language: lang }), get(`/tv/${r.id}`, { language: 'en-US' })])
        if (!show) continue
        const rt = show.episode_run_time ?? []
        if (rt.length && rt.reduce((a, b) => a + b, 0) / rt.length < 15) continue
        const g = groupFor(date)
        let prev = null
        for (const s of (show.seasons ?? []).filter((x) => x.season_number > 0 && okDate(x.air_date))) {
          const it = await seasonItem(r.id, show, en, s.season_number, { group: g, key: prev })
          add(it)
          prev = it.key
        }
      }
    }

    // 2) Listedeki dizilerin yeni sezonları
    const shows = new Map()
    for (const i of all) if (i.type === 'tv' && i.tmdbId && i.season != null) shows.set(i.tmdbId, [...(shows.get(i.tmdbId) ?? []), i])
    for (const [showId, seasons] of shows) {
      const show = await get(`/tv/${showId}`, { language: lang })
      if (!show) continue
      let en = null
      for (const s of (show.seasons ?? []).filter((x) => x.season_number > 0 && okDate(x.air_date)).sort((a, b) => a.season_number - b.season_number)) {
        if (has('tv', showId, s.season_number) || inAnyUniverse(showId, s.season_number)) continue
        en = en ?? (await get(`/tv/${showId}`, { language: 'en-US' }))
        const before = all.filter((i) => i.type === 'tv' && i.tmdbId === showId && i.season != null && i.season < s.season_number).sort((a, b) => b.season - a.season)[0]
        add(await seasonItem(showId, show, en, s.season_number, before))
      }
    }

    // 3) Henüz çıkmamış yapımların tarihi (erteleme / öne alma); kendiliğinden eklenenlerin adı ve afişi de
    //    ("Untitled X-Men Film" → gerçek adı açıklanınca)
    for (const i of all) {
      if (!i.tmdbId || (i.date && i.date <= today)) continue
      const own = (st.added[uid] ?? []).find((a) => a.key === i.key)
      let dt = ''
      if (i.type === 'movie') {
        const m = await get(`/movie/${i.tmdbId}`, { language: lang })
        dt = m?.release_date || ''
        if (own && m) {
          const en = await get(`/movie/${i.tmdbId}`, { language: 'en-US' })
          if (m.title) own.title = m.title
          if (en?.title) own.en = en.title
          if (m.poster_path) own.poster = m.poster_path
          if (m.runtime) own.minutes = m.runtime
        }
      } else if (i.season != null) {
        const se = await get(`/tv/${i.tmdbId}/season/${i.season}`, { language: lang })
        dt = se?.air_date || ''
        if (own && se) {
          if (se.poster_path) own.poster = se.poster_path
          const eps = se.episodes ?? []
          if (eps.length) own.episodes = eps.length
          const min = eps.reduce((a, e) => a + (e.runtime || 0), 0)
          if (min) own.minutes = min
        }
      }
      if (!okDate(dt) || dt === i.date) continue
      if (own) own.date = dt
      else st.dates[uid] = { ...(st.dates[uid] ?? {}), [i.key]: { date: dt } }
      dateFixes++
    }
  }

  st.lastRun = Date.now()
  writeState(st)
  for (const { uid, name, it } of newOnes) {
    const label = it.type === 'tv' ? d.stt('{0} — {1}. Sezon', it.title, it.season) : it.title
    for (const pid of d.profileIds()) {
      d.pushNotification(pid, {
        key: `evren:${uid}:${it.key}`,
        type: 'announce',
        title: d.stt('{0}: yeni yapım eklendi', name),
        text: d.stt('"{0}" Evrenler\'e eklendi (çıkış: {1}).', label, it.date ? d.langDate(it.date) : '?'),
        link: `/evrenler/${uid}?yapim=${encodeURIComponent(it.key)}`,
      })
    }
  }
  if (newOnes.length || dateFixes) console.log(`Evrenler: ${newOnes.length} yeni yapım, ${dateFixes} tarih güncellendi`)
  return { added: newOnes.map(({ uid, it }) => ({ uid, key: it.key, title: it.title, season: it.season ?? null, date: it.date })), dates: dateFixes }
}
