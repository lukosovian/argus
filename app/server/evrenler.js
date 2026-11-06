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
import { ensureRole, ensureStatusOption, resolveRole, resolveStatusOption } from './roles.js'
import { stt } from './lang.js'

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
}

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
  return u.custom[uid] ?? BUILTIN[uid] ?? null
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
  const izlendi = resolveStatusOption(board, 'izlendi')
  return { board, rows, look, rowById, episodes, watched, durum, dateProp, poster, titleProp, izlendi, today: d.localDay() }
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

// Öğenin izlenme durumu: watches = her bitirişin tarihi (tekrar izleme = ikinci tarih), progress = yarım kalan izleme
function itemState(ctx, item) {
  const row = findRow(ctx, item)
  if (!row) return { rowId: null, watched: false, watches: [] }
  const status = ctx.durum ? row.values[ctx.durum.id] : null
  const statusLabel = status ? (ctx.durum.options?.find((o) => o.id === status)?.label ?? null) : null
  const rowDates = ctx.dateProp ? list(row.values[ctx.dateProp.id]) : []
  const rowWatched = Boolean(ctx.izlendi && status === ctx.izlendi)
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
  return { ...base, watched: rowWatched || (!ctx.durum && rowDates.length > 0), watches: rowDates }
}

function publicItem(ctx, item) {
  const st = itemState(ctx, item)
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
    rowId: st.rowId,
    status: st.status ?? null,
    watched: st.watched,
    watches: st.watches,
    progress: st.progress ?? null,
  }
}

export function registerEvrenlerRoutes(app) {
  app.get('/api/profiles/:profileId/evrenler/:boardId', (req, res) => {
    const { profileId, boardId } = req.params
    const ctx = makeContext(profileId, boardId)
    if (!ctx) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
    const user = readUser(profileId)
    const all = [
      ...Object.values(BUILTIN).map((u) => ({ ...u, builtin: true })),
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
      items: (u.items ?? []).map((it) => publicItem(ctx, it)),
    }))
    res.json({ universes, prefs: user.prefs, today: ctx.today })
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

  // Bir öğeyi izledim olarak işaretle (date: "2026-11-06" | "2019" | "?") ya da o tarihi geri al (remove)
  app.post('/api/profiles/:profileId/evrenler/:boardId/isaretle', async (req, res) => {
    try {
      const { profileId, boardId } = req.params
      const { uid, key, date, remove } = req.body ?? {}
      if (typeof date !== 'string' || !DATE_RE.test(date)) return res.status(400).json({ error: stt('Geçersiz tarih') })
      const u = universe(profileId, uid)
      const item = u?.items?.find((i) => i.key === key)
      if (!item) return res.status(404).json({ error: stt('Yapım bulunamadı') })
      let ctx = makeContext(profileId, boardId)
      if (!ctx) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
      let row = findRow(ctx, item)
      let created = false
      if (!row) {
        if (remove) return res.json({ ok: true })
        if (!item.tmdbId) return res.status(400).json({ error: stt('Bu yapım arşivinde yok') })
        const out = await d.addRowFromTmdb(profileId, boardId, {
          tmdbId: item.tmdbId,
          mediaType: item.type,
          status: item.type === 'movie' ? 'izlendi' : 'izlenecek',
          watchedDate: date,
        })
        if (out.status !== 200) return res.status(out.status).json(out.json)
        created = true
        if (item.type === 'movie') return askAndSend(res, profileId, boardId, out.json.rowId, { ok: true, rowId: out.json.rowId, created })
        ctx = makeContext(profileId, boardId)
        row = ctx.rowById.get(out.json.rowId)
        if (!row) return res.json({ ok: true, created })
      }
      if (item.type === 'tv') {
        const keys = episodeKeys(ctx, row.id, item.season)
        if (keys.length) {
          const r = d.applyWatched(profileId, row.id, (before) => {
            const next = { ...before }
            for (const k of keys) {
              const cur = list(next[k])
              if (remove) {
                const i = cur.lastIndexOf(date)
                if (i >= 0) cur.splice(i, 1)
                if (cur.length) next[k] = cur
                else delete next[k]
              } else next[k] = [...cur, date].sort()
            }
            return next
          })
          if (r.askRating) d.setAskRating(res, r.askRating.boardId, r.askRating.rowId)
          // Bölümleri bilinmeyen sezonlar yüzünden durum kendiliğinden değişmediyse (ör. yalnız bu sezonu bitirdi)
          return res.json({ ok: true, rowId: row.id, created, autoWatched: r.autoWatched, autoWatching: r.autoWatching })
        }
      }
      // Film (ya da bölümleri bilinmeyen dizi): İzleme Tarihi + Durum
      const result = markRow(profileId, boardId, row.id, date, Boolean(remove))
      return askAndSend(res, profileId, boardId, row.id, { ok: true, rowId: row.id, created, ...result })
    } catch (e) {
      console.error('evren işaretle hata:', e)
      res.status(500).json({ error: stt('İşaretlenemedi') })
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
    const opt = ensureStatusOption(board, key, d.makeId)
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
