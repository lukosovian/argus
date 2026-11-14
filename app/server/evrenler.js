// Evrenler — kullanıcı "VisionQuest'i anlamak için şunları izlemen gerek dedi, madem öyle Marvel'ı baştan
// izleyeyim; sinematik evrendeki filmleri dizileri sıralasın, ben oradan işaretleyeyim, izlendi olarak arşivime,
// takvime düşsün" dedi. Hazır evrenler (evrenler.json: Marvel, DC, Star Wars, Orta Dünya, Büyücülük Dünyası)
// çıkış ve hikâye sırasıyla gelir; sıralar resmî kaynaklardan (Marvel'ın Disney+ zaman çizelgesi, StarWars.com,
// Wikipedia) doğrulandı, TMDB kimlikleri/afişler/süreler TMDB'den çekildi. Kullanıcı kendi evrenini de kurabilir.
//
// Kişiye özel her şey profilin evrenler.json dosyasında: { custom: { id: Evren }, prefs: { id: { maraton, ek, sira } } }.
// İşaretleme gerçek arşive yazar: filmde İzleme Tarihi'ne bir tarih eklenir + Durum İzlendi; dizide o sezonun
// (ya da bütün sezonların) yayınlanmış bölümlerine tarih girilir — gerisini (otomatik İzlendi, takvim, puan sorma)
// her zamanki bölüm kaydı yapar. Arşivde olmayan bir yapım önce TMDB'den eklenir.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureRole, ensureStatusOption, isWatchedStatus, resolveRole, resolveStatusOption, watchedStatusIds } from './roles.js'
import { langDate, stt } from './lang.js'
import { pushNotification } from './notifications.js'
import { evrenOtoStatus, hideAuto, initEvrenOto, mergeBuiltins, runEvrenOto } from './evrenOto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IMG = 'https://image.tmdb.org/t/p/w342'
let BUILTIN = {}
try {
  BUILTIN = JSON.parse(fs.readFileSync(path.join(__dirname, 'evrenler.json'), 'utf-8'))
} catch (e) {
  console.error('evrenler.json okunamadı:', e)
}

let d = null
export function initEvrenler(deps) {
  d = deps
  initEvrenOto({
    dataDir: deps.dataDir,
    readJson: deps.readJson,
    writeJson: deps.writeJson,
    tmdbGet: deps.tmdbGet,
    tmdbLang: deps.tmdbLang,
    localDay: deps.localDay,
    profileIds: deps.profileIds,
    anyApiKey: () => deps.profileIds().map((id) => deps.readProfileApiKey(id)).find(Boolean) || '',
    getBase: () => BUILTIN,
    pushNotification,
    stt,
    langDate,
  })
}
// Hazır evrenler + TMDB'den kendiliğinden eklenen yeni yapımlar/sezonlar (bkz. evrenOto.js)
const builtins = () => mergeBuiltins(BUILTIN)

const DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{4}|\?)$/
const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).map(String)
const endOf = (e) => (e === '?' ? '' : String(e).split('/').pop())

function userFile(profileId) {
  return path.join(d.profileDir(profileId), 'evrenler.json')
}
function readUser(profileId) {
  const u = d.readJson(userFile(profileId), {})
  return { custom: u.custom ?? {}, prefs: u.prefs ?? {} }
}

function universe(profileId, uid) {
  const u = readUser(profileId)
  return u.custom[uid] ?? builtins()[uid] ?? null
}

// Arşivdeki karşılığı: önce TMDB kimliği, yoksa adı (bkz. archiveLookup)
function makeContext(profileId, boardId) {
  const loaded = d.loadBoardAndRows(profileId, boardId)
  if (!loaded) return null
  const { board, rows } = loaded
  const look = d.archiveLookup(profileId, board, rows)
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const episodes = d.readJson(d.profileEpisodesFile(profileId), {})
  const watched = d.readJson(d.profileWatchedFile(profileId), {})
  const durum = resolveRole(board, 'durum')
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const poster = resolveRole(board, 'poster')
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const done = watchedStatusIds(board) // İzlendi / Sezon Finali / Final
  return { board, rows, look, rowById, episodes, watched, durum, dateProp, poster, titleProp, done, today: d.localDay() }
}

function findRow(ctx, item) {
  if (item.rowId && ctx.rowById.has(item.rowId)) return ctx.rowById.get(item.rowId)
  if (!item.tmdbId) return null
  const card = ctx.look({ tmdbId: item.tmdbId, mediaType: item.type, title: item.title ?? '', originalTitle: item.en ?? '' })
  return card.rowId ? ctx.rowById.get(card.rowId) ?? null : null
}

// Dizinin bu öğeye düşen (yayınlanmış) bölümleri: "sezon-bölüm" anahtarları
function episodeKeys(ctx, rowId, season) {
  const seasons = ctx.episodes[rowId]
  if (!Array.isArray(seasons)) return []
  const out = []
  for (const s of seasons) {
    if (!(s.seasonNumber >= 1) || (season && s.seasonNumber !== season)) continue
    for (const e of s.episodes ?? []) if (e.airDate && e.airDate <= ctx.today) out.push(`${s.seasonNumber}-${e.episodeNumber}`)
  }
  return out
}

// Öğenin izlenme durumu: watches = her bitirişin tarihi (tekrar izleme = ikinci tarih), progress = yarım kalan izleme,
// tour = izleme turu (since: turun başladığı gün) — kullanıcı "baştan izleme turu başlatıp ne kadar izledim ne kadar
// kaldı takip edeyim" dedi. Turda sadece o günden sonraki izlemeler sayılır; dizide her bölüm kendi gerçek tarihiyle
// (Nook'tan ya da detay penceresinden) işaretlenir, burada toplu tarih basılmaz.
function itemState(ctx, item, since) {
  const st = baseState(ctx, item)
  if (!since) return st
  const after = (w) => w !== '?' && endOf(w) >= since
  if (st.rowId && item.type === 'tv') {
    const keys = episodeKeys(ctx, st.rowId, item.season)
    if (keys.length) {
      const seenMap = ctx.watched[st.rowId] ?? {}
      const seen = keys.filter((k) => list(seenMap[k]).some(after)).length
      return { ...st, tour: { done: seen === keys.length, seen, total: keys.length, active: seen > 0 && seen < keys.length } }
    }
  }
  // Durumu İzleniyor/Yarım olan bir kaydın tarihi izlemeye başladığı gün: turda bitmiş sayılmaz, sıradaki o kalır
  // (kullanıcı "izleniyor da duran bir içeriği izlendi sayıp turda diğerini sıradaki göstermesin" dedi).
  const started = st.watches.some(after)
  return { ...st, tour: { done: started && st.finished !== false, seen: null, total: null, active: started && st.finished === false } }
}

function baseState(ctx, item) {
  const row = findRow(ctx, item)
  if (!row) return { rowId: null, watched: false, watches: [] }
  const status = ctx.durum ? row.values[ctx.durum.id] : null
  const statusLabel = status ? (ctx.durum.options?.find((o) => o.id === status)?.label ?? null) : null
  const rowDates = ctx.dateProp ? list(row.values[ctx.dateProp.id]) : []
  const rowWatched = Boolean(status && ctx.done.has(status))
  const base = { rowId: row.id, status: statusLabel, title: ctx.titleProp ? String(row.values[ctx.titleProp.id] ?? '') : '', poster: ctx.poster ? row.values[ctx.poster.id] || null : null }
  if (item.type === 'tv') {
    const keys = episodeKeys(ctx, row.id, item.season)
    const seen = ctx.watched[row.id] ?? {}
    const anyMarked = Object.values(seen).some((ds) => Array.isArray(ds) && ds.length)
    if (keys.length && (anyMarked || !rowWatched)) {
      const per = keys.map((k) => [...list(seen[k])].sort())
      const k = Math.min(...per.map((l) => l.length))
      const watches = []
      for (let i = 0; i < k; i++) watches.push(per.map((l) => l[i]).sort().pop())
      const inProgress = per.filter((l) => l.length > k).length
      return { ...base, watched: k > 0, watches, progress: inProgress ? { seen: inProgress, total: keys.length } : null, episodes: keys.length }
    }
  }
  // Durumu İzlendi olmayan (Yarım, İzleniyor…) bir kaydın tarihi izlemeye başladığı gün olabilir — izlendi sayılmaz
  return { ...base, watched: rowWatched || (!ctx.durum && rowDates.length > 0), watches: rowDates, finished: rowWatched || !ctx.durum }
}

function publicItem(ctx, item, since) {
  const st = itemState(ctx, item, since)
  const poster = st.poster || (item.poster ? (String(item.poster).startsWith('/') && !String(item.poster).startsWith('/medya') ? IMG + item.poster : item.poster) : null)
  return {
    key: item.key,
    type: item.type,
    tmdbId: item.tmdbId ?? null,
    season: item.season ?? null,
    title: item.title,
    archiveTitle: st.title || null,
    date: item.date || '',
    released: Boolean(item.date && item.date <= ctx.today),
    poster,
    minutes: item.minutes ?? null,
    group: item.group ?? null,
    extra: Boolean(item.extra),
    optional: Boolean(item.optional),
    auto: Boolean(item.auto),
    rowId: st.rowId,
    status: st.status ?? null,
    watched: st.watched,
    watches: st.watches,
    progress: st.progress ?? null,
    tour: st.tour ?? null,
  }
}

export function registerEvrenlerRoutes(app) {
  app.get('/api/profiles/:profileId/evrenler/:boardId', (req, res) => {
    const { profileId, boardId } = req.params
    const ctx = makeContext(profileId, boardId)
    if (!ctx) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
    const user = readUser(profileId)
    const all = [
      ...Object.values(builtins()).map((u) => ({ ...u, builtin: true })),
      ...Object.values(user.custom).map((u) => ({ ...u, builtin: false })),
    ]
    const universes = all.map((u) => ({
      id: u.id,
      name: u.name,
      short: u.short ?? '',
      color: u.color ?? '#00c0fa',
      builtin: u.builtin,
      from: u.from ?? null,
      groups: u.groups ?? [],
      story: u.story ?? (u.items ?? []).map((i) => i.key),
      deps: u.deps ?? {},
      items: (u.items ?? []).map((it) => publicItem(ctx, it, user.prefs[u.id]?.maraton)),
    }))
    res.json({ universes, prefs: user.prefs, today: ctx.today })
  })

  // Kendiliğinden güncelleme: durum, şimdi kontrol et, yanlış eklenen bir yapımı listeden çıkar
  app.get('/api/profiles/:profileId/evrenler-oto', (req, res) => res.json(evrenOtoStatus()))
  app.post('/api/profiles/:profileId/evrenler-oto', async (req, res) => {
    try {
      res.json(await runEvrenOto())
    } catch (e) {
      console.error('evrenler-oto hata:', e)
      res.status(500).json({ error: stt('Yeni yapımlar kontrol edilemedi') })
    }
  })
  app.post('/api/profiles/:profileId/evrenler-oto/cikar', (req, res) => {
    const { uid, key } = req.body ?? {}
    if (typeof uid !== 'string' || typeof key !== 'string' || !key.startsWith('oto-')) return res.status(400).json({ error: stt('Geçersiz istek') })
    hideAuto(uid, key)
    res.json({ ok: true })
  })

  // Kısmi güncelleme: { custom: { id: Evren | null }, prefs: { id: {...} | null } } — null siler
  app.post('/api/profiles/:profileId/evrenler-veri', (req, res) => {
    const file = userFile(req.params.profileId)
    const data = d.readJson(file, {})
    for (const kind of ['custom', 'prefs']) {
      const patch = req.body?.[kind]
      if (!patch || typeof patch !== 'object') continue
      data[kind] = data[kind] ?? {}
      for (const [k, v] of Object.entries(patch)) {
        if (BUILTIN[k] && kind === 'custom') continue
        if (v === null) delete data[kind][k]
        else if (kind === 'custom' && typeof v === 'object') data[kind][k] = cleanUniverse(k, v)
        else if (typeof v === 'object') {
          const merged = { ...(data[kind][k] ?? {}), ...v }
          for (const [mk, mv] of Object.entries(merged)) if (mv === null) delete merged[mk]
          data[kind][k] = merged
        }
      }
    }
    d.writeJson(file, data)
    res.json({ ok: true })
  })

  // Filmi izledim olarak işaretle (date: "2026-11-06" | "2019" | "?") ya da o tarihi geri al (remove). Diziler burada
  // toplu işaretlenmez — kullanıcı "bütün bölümleri aynı tarihe atmasın" dedi; bölümler detay penceresinden tek tek.
  app.post('/api/profiles/:profileId/evrenler/:boardId/isaretle', async (req, res) => {
    try {
      const { profileId, boardId } = req.params
      const { uid, key, date, remove } = req.body ?? {}
      if (typeof date !== 'string' || !DATE_RE.test(date)) return res.status(400).json({ error: stt('Geçersiz tarih') })
      const item = universe(profileId, uid)?.items?.find((i) => i.key === key)
      if (!item) return res.status(404).json({ error: stt('Yapım bulunamadı') })
      if (item.type !== 'movie') return res.status(400).json({ error: stt('Dizilerin bölümlerini detay penceresinden işaretle') })
      const ctx = makeContext(profileId, boardId)
      if (!ctx) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
      const row = findRow(ctx, item)
      if (!row) {
        if (remove) return res.json({ ok: true })
        if (!item.tmdbId) return res.status(400).json({ error: stt('Bu yapım arşivinde yok') })
        const out = await d.addRowFromTmdb(profileId, boardId, { tmdbId: item.tmdbId, mediaType: 'movie', status: 'izlendi', watchedDate: date })
        if (out.status !== 200) return res.status(out.status).json(out.json)
        return askAndSend(res, profileId, boardId, out.json.rowId, { ok: true, rowId: out.json.rowId, created: true })
      }
      const result = markRow(profileId, boardId, row.id, date, Boolean(remove))
      return askAndSend(res, profileId, boardId, row.id, { ok: true, rowId: row.id, created: false, ...result })
    } catch (e) {
      console.error('evren işaretle hata:', e)
      res.status(500).json({ error: stt('İşaretlenemedi') })
    }
  })

  // Arşivinde olmayan bir yapımı ekle (dizilerde bölümler de gelir); zaten varsa kaydını döndürür. Varsayılan İzlenecek;
  // status "izlendi" + date ("2019" / "?") = "eskiden izledim, arşive yazmayı unuttum" — kullanıcı toplu eklerken
  // bunları ayırmak istedi. Dizide bölümlere tarih basılmaz, sadece kayıt İzlendi olur (tura sayılmaz).
  app.post('/api/profiles/:profileId/evrenler/:boardId/ekle', async (req, res) => {
    try {
      const { profileId, boardId } = req.params
      const { uid, key, status, date } = req.body ?? {}
      const old = status === 'izlendi'
      if (old && (typeof date !== 'string' || !DATE_RE.test(date))) return res.status(400).json({ error: stt('Geçersiz tarih') })
      const item = universe(profileId, uid)?.items?.find((i) => i.key === key)
      if (!item) return res.status(404).json({ error: stt('Yapım bulunamadı') })
      const ctx = makeContext(profileId, boardId)
      if (!ctx) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
      const row = findRow(ctx, item)
      if (row) return res.json({ ok: true, rowId: row.id, created: false })
      if (!item.tmdbId) return res.status(400).json({ error: stt('Bu yapım arşivinde yok') })
      const out = await d.addRowFromTmdb(profileId, boardId, { tmdbId: item.tmdbId, mediaType: item.type, status: old ? 'izlendi' : 'izlenecek', watchedDate: old ? date : undefined })
      if (out.status !== 200) return res.status(out.status).json(out.json)
      res.json({ ok: true, rowId: out.json.rowId, created: true })
    } catch (e) {
      console.error('evren ekle hata:', e)
      res.status(500).json({ error: stt('İçerik eklenemedi') })
    }
  })

  // Kendi evrenine yapım eklemek için arama: TMDB (film + dizi), arşivde olanlar işaretli
  app.get('/api/profiles/:profileId/evren-ara/:boardId', async (req, res) => {
    try {
      const { profileId, boardId } = req.params
      const q = String(req.query.q ?? '').trim()
      if (q.length < 2) return res.json({ items: [] })
      const apiKey = d.readProfileApiKey(profileId)
      if (!apiKey) return res.json({ items: [], needsApiKey: true })
      const ctx = makeContext(profileId, boardId)
      if (!ctx) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
      const data = await d.tmdbGet('/search/multi', { query: q, language: d.tmdbLang() }, apiKey)
      const items = (data?.results ?? [])
        .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
        .slice(0, 16)
        .map((r) => {
          const card = ctx.look(d.toCard(r, r.media_type))
          return { ...card, date: (r.media_type === 'tv' ? r.first_air_date : r.release_date) || '', posterPath: r.poster_path ?? null }
        })
      res.json({ items })
    } catch (e) {
      console.error('evren ara hata:', e)
      res.json({ items: [] })
    }
  })

  // Dizinin sezonları (kendi evrenine tek bir sezonu eklemek için)
  app.get('/api/profiles/:profileId/evren-sezonlar/:tmdbId', async (req, res) => {
    const apiKey = d.readProfileApiKey(req.params.profileId)
    const tmdbId = Number(req.params.tmdbId)
    if (!apiKey || !Number.isInteger(tmdbId)) return res.json({ seasons: [] })
    const tv = await d.tmdbGet(`/tv/${tmdbId}`, { language: d.tmdbLang() }, apiKey)
    const seasons = (tv?.seasons ?? [])
      .filter((s) => s.season_number >= 1)
      .map((s) => ({ season: s.season_number, date: s.air_date || '', episodes: s.episode_count ?? 0, poster: s.poster_path ?? null }))
    const avg = (tv?.episode_run_time ?? [])[0] || tv?.last_episode_to_air?.runtime || null
    res.json({ seasons, runtime: avg })
  })
}

// ---- Hangi aboneliği almalıyım? ---------------------------------------------------------------
// Kullanıcı "bu ay hangi platformu alsam" sorusunun cevabını istedi: izlenecekler listesindeki (ya da bir evrende
// izlemediklerindeki) yapımların hangi abonelik platformunda olduğu toplanır, en çok süreyi karşılayan platformlar
// önce gelir. Platformlar: arşivdeki açık kayıtlar için watch-state.json'da zaten var; olmayanlar TMDB'den çekilip
// profildeki platform-cache.json'da 7 gün saklanır.
const PLATFORM_TTL = 7 * 24 * 3600e3

function platformCacheFile(profileId) {
  return path.join(d.profileDir(profileId), 'platform-cache.json')
}

export function registerPlatformRoutes(app) {
  app.post('/api/profiles/:profileId/platform-ozet/:boardId', async (req, res) => {
    try {
      const { profileId, boardId } = req.params
      const apiKey = d.readProfileApiKey(profileId)
      if (!apiKey) return res.json({ needsApiKey: true, providers: [], none: [], total: 0, totalMinutes: 0 })
      const ctx = makeContext(profileId, boardId)
      if (!ctx) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
      const refs = d.readJson(d.profileTmdbFile(profileId), {})
      const keyToRow = new Map()
      for (const [rowId, r] of Object.entries(refs)) if (r?.id && ctx.rowById.has(rowId)) keyToRow.set(`${r.mediaType}:${r.id}`, rowId)

      // Hangi yapımlar: istemcinin gönderdiği liste (evren) ya da izlenecekler listesi
      let list = []
      if (Array.isArray(req.body?.items)) {
        list = req.body.items
          .filter((i) => i && (i.type === 'movie' || i.type === 'tv') && Number.isInteger(i.tmdbId))
          .slice(0, 400)
          .map((i) => ({ type: i.type, tmdbId: i.tmdbId, title: String(i.title ?? ''), poster: typeof i.poster === 'string' ? i.poster : null, minutes: Number(i.minutes) || 0 }))
      } else {
        const later = resolveStatusOption(ctx.board, 'izlenecek')
        const sure = resolveRole(ctx.board, 'sure')
        for (const row of ctx.rows) {
          if (!ctx.durum || row.values[ctx.durum.id] !== later) continue
          const ref = refs[row.id]
          if (!ref?.id) continue
          let minutes = sure && Number(row.values[sure.id]) > 0 ? Number(row.values[sure.id]) : 0
          if (ref.mediaType === 'tv') minutes = episodeKeys(ctx, row.id).length * (ref.epRuntime || 40)
          list.push({ type: ref.mediaType, tmdbId: ref.id, title: ctx.titleProp ? String(row.values[ctx.titleProp.id] ?? '') : '', poster: ctx.poster ? row.values[ctx.poster.id] || null : null, minutes, rowId: row.id })
        }
      }

      const watchState = d.readJson(d.profileWatchStateFile(profileId), {})[boardId]?.providers ?? {}
      const cacheFile = platformCacheFile(profileId)
      const cache = d.readJson(cacheFile, {})
      const region = d.serverRegion()
      let fetched = 0
      await d.mapLimit(list, 4, async (it) => {
        const k = `${it.type}:${it.tmdbId}`
        const rowId = it.rowId ?? keyToRow.get(k)
        if (rowId && watchState[rowId]) return (it.ids = watchState[rowId].ids)
        if (cache[k] && Date.now() - cache[k].at < PLATFORM_TTL) return (it.ids = cache[k].ids)
        const p = await d.tmdbGet(`/${it.type}/${it.tmdbId}/watch/providers`, {}, apiKey)
        it.ids = (p?.results?.[region]?.flatrate ?? []).map((x) => x.provider_id)
        cache[k] = { ids: it.ids, at: Date.now() }
        fetched++
      })
      if (fetched) d.writeJson(cacheFile, cache)

      const names = new Map(((await d.platformList(apiKey)).all ?? []).map((p) => [p.id, p]))
      const byId = new Map()
      const none = []
      for (const it of list) {
        const ids = [...new Set(it.ids ?? [])].filter((id) => names.has(id))
        if (!ids.length) {
          none.push({ title: it.title, poster: it.poster })
          continue
        }
        for (const id of ids) {
          const p = byId.get(id) ?? { id, name: names.get(id).name, logo: names.get(id).logo, count: 0, minutes: 0, items: [] }
          p.count++
          p.minutes += it.minutes
          p.items.push({ title: it.title, poster: it.poster, key: `${it.type}:${it.tmdbId}` })
          byId.set(id, p)
        }
      }
      // Aynı platformun farklı paketleri (ör. "Netflix" / "Netflix basic with Ads") ayrı görünmesin: aynı yapımları
      // kapsayan, adı diğerini içeren platform elenir
      let providers = [...byId.values()].sort((a, b) => b.minutes - a.minutes || b.count - a.count)
      providers = providers.filter((p) => !providers.some((q) => q !== p && q.count >= p.count && p.name.toLowerCase().startsWith(q.name.toLowerCase())))
      // En iyi ikili: birlikte en çok süreyi karşılayan iki platform
      let combo = null
      const top = providers.slice(0, 8)
      for (let a = 0; a < top.length; a++)
        for (let b = a + 1; b < top.length; b++) {
          const keys = new Set([...top[a].items, ...top[b].items].map((x) => x.key))
          const minutes = list.filter((it) => keys.has(`${it.type}:${it.tmdbId}`)).reduce((t, it) => t + it.minutes, 0)
          if (!combo || minutes > combo.minutes) combo = { ids: [top[a].id, top[b].id], count: keys.size, minutes }
        }
      // 3 aylık plan (v1.23.3): her ay, daha önceki aylarda karşılanmayanlardan en çok süreyi karşılayan platform
      const minutesOf = new Map(list.map((it) => [`${it.type}:${it.tmdbId}`, it.minutes]))
      const covered = new Set()
      const plan = []
      for (let m = 0; m < 3; m++) {
        let bestP = null
        for (const p of providers.slice(0, 12)) {
          if (plan.some((x) => x.id === p.id)) continue
          const fresh = p.items.filter((x) => !covered.has(x.key))
          const minutes = fresh.reduce((t, x) => t + (minutesOf.get(x.key) ?? 0), 0)
          if (fresh.length && (!bestP || minutes > bestP.minutes || (minutes === bestP.minutes && fresh.length > bestP.count)))
            bestP = { id: p.id, count: fresh.length, minutes, items: fresh.slice(0, 6) }
        }
        if (!bestP) break
        for (const x of providers.find((p) => p.id === bestP.id).items) covered.add(x.key)
        plan.push(bestP)
      }
      const home = d.readJson(d.profileHomeSettingsFile(profileId), {})
      // Abone olunan platformlar (v1.23.13, Abonelik sayfasından işaretlenir): onlarla izlenebilenler ve onlara
      // eklemek için en iyi platform (aboneliklerinde olmayanlardan en çok süreyi karşılayan)
      const mineSet = new Set(Array.isArray(home.myPlatforms) ? home.myPlatforms : [])
      let mineCover = null
      let bestNew = null
      if (mineSet.size) {
        const coveredKeys = new Set(list.filter((it) => (it.ids ?? []).some((id) => mineSet.has(id))).map((it) => `${it.type}:${it.tmdbId}`))
        mineCover = { count: coveredKeys.size, minutes: list.filter((it) => coveredKeys.has(`${it.type}:${it.tmdbId}`)).reduce((t, it) => t + it.minutes, 0) }
        for (const p of providers) {
          if (mineSet.has(p.id)) continue
          const fresh = p.items.filter((x) => !coveredKeys.has(x.key))
          const minutes = fresh.reduce((t, x) => t + (minutesOf.get(x.key) ?? 0), 0)
          if (fresh.length && (!bestNew || minutes > bestNew.minutes)) bestNew = { id: p.id, count: fresh.length, minutes }
        }
      }
      res.json({
        mineCover,
        bestNew,
        plan,
        providers: providers.map((p) => ({ ...p, items: p.items.slice(0, 12) })),
        none: none.slice(0, 30),
        noneCount: none.length,
        total: list.length,
        totalMinutes: list.reduce((t, it) => t + it.minutes, 0),
        mine: Array.isArray(home.myPlatforms) ? home.myPlatforms : [],
        combo,
      })
    } catch (e) {
      console.error('platform özet hata:', e)
      res.status(500).json({ error: stt('Platform bilgisi alınamadı') })
    }
  })
}

function askAndSend(res, profileId, boardId, rowId, body) {
  const rows = d.readJson(d.profileRowsFile(profileId, boardId), [])
  const row = rows.find((r) => r.id === rowId)
  if (row && d.shouldAskRating(profileId, boardId, body.beforeRow ?? null, row)) d.setAskRating(res, boardId, rowId)
  const { beforeRow: _b, ...rest } = body
  res.json(rest)
}

// Filmin İzleme Tarihi'ne tarih ekle / çıkar, Durum'u buna göre ayarla
function markRow(profileId, boardId, rowId, date, remove) {
  const boardsFile = d.profileBoardsFile(profileId)
  const boards = d.readJson(boardsFile, [])
  const board = boards.find((b) => b.id === boardId)
  const rowsFile = d.profileRowsFile(profileId, boardId)
  const rows = d.readJson(rowsFile, [])
  const idx = rows.findIndex((r) => r.id === rowId)
  if (!board || idx === -1) return {}
  const before = rows[idx]
  const values = { ...before.values }
  const boardBefore = JSON.stringify(board)
  const durum = resolveRole(board, 'durum')
  const dateProp = remove ? resolveRole(board, 'izlemeTarihi') : ensureRole(board, 'izlemeTarihi', d.makeId)
  if (dateProp) {
    const cur = list(values[dateProp.id])
    if (remove) {
      const i = cur.map(endOf).lastIndexOf(date) >= 0 ? cur.map(endOf).lastIndexOf(date) : cur.lastIndexOf(date)
      if (i >= 0) cur.splice(i, 1)
    } else if (!cur.includes(date)) cur.push(date)
    cur.sort()
    values[dateProp.id] = dateProp.type === 'multidate' ? cur : (cur[cur.length - 1] ?? '')
  }
  if (durum) {
    const left = dateProp ? list(values[dateProp.id]).length : 0
    const key = remove ? (left ? 'izlendi' : 'izlenecek') : 'izlendi'
    // Zaten izlenmiş sayılan durum (Sezon Finali / Final) korunur
    const keep = key === 'izlendi' && isWatchedStatus(board, values[durum.id])
    const opt = keep ? null : ensureStatusOption(board, key, d.makeId)
    if (opt) values[durum.id] = opt
  }
  const saved = { ...before, values, updatedAt: Date.now() }
  rows[idx] = saved
  if (JSON.stringify(board) !== boardBefore) d.writeJson(boardsFile, boards)
  d.writeJson(rowsFile, rows)
  try {
    d.recordRowWatchTime(profileId, boardId, before, saved)
  } catch {
    /* önemsiz */
  }
  return { beforeRow: before }
}

function cleanUniverse(id, v) {
  const str = (x, max = 200) => (typeof x === 'string' ? x.slice(0, max) : '')
  const items = (Array.isArray(v.items) ? v.items : [])
    .filter((i) => i && typeof i.key === 'string' && (i.type === 'movie' || i.type === 'tv') && (Number.isInteger(i.tmdbId) || typeof i.rowId === 'string'))
    .slice(0, 500)
    .map((i) => {
      const o = { key: str(i.key, 40), type: i.type, title: str(i.title) || '?', date: DATE_RE.test(i.date ?? '') || /^\d{4}-\d{2}-\d{2}$/.test(i.date ?? '') ? i.date : '' }
      if (Number.isInteger(i.tmdbId)) o.tmdbId = i.tmdbId
      if (typeof i.rowId === 'string') o.rowId = str(i.rowId, 40)
      if (Number.isInteger(i.season) && i.season > 0) o.season = i.season
      if (typeof i.en === 'string') o.en = str(i.en)
      if (typeof i.poster === 'string') o.poster = str(i.poster, 500)
      if (Number.isFinite(i.minutes) && i.minutes > 0) o.minutes = Math.round(i.minutes)
      if (typeof i.group === 'string') o.group = str(i.group, 40)
      if (i.extra) o.extra = true
      if (i.optional) o.optional = true
      return o
    })
  const keys = new Set(items.map((i) => i.key))
  const story = (Array.isArray(v.story) ? v.story : []).filter((k) => keys.has(k))
  for (const k of keys) if (!story.includes(k)) story.push(k)
  return {
    id,
    name: str(v.name, 80) || stt('Yeni evren'),
    short: str(v.short, 8),
    color: /^#[0-9a-f]{6}$/i.test(v.color ?? '') ? v.color : '#00c0fa',
    from: typeof v.from === 'string' ? str(v.from, 40) : undefined,
    groups: (Array.isArray(v.groups) ? v.groups : []).filter((g) => g && typeof g.id === 'string').map((g) => ({ id: str(g.id, 40), name: str(g.name, 80) })),
    items,
    story,
  }
}
