import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const DATA_DIR = path.join(ROOT, 'data')
const PROFILES_DIR = path.join(DATA_DIR, 'profiles')
const MEDYA_DIR = path.join(ROOT, 'medya')

for (const dir of [DATA_DIR, PROFILES_DIR, MEDYA_DIR]) fs.mkdirSync(dir, { recursive: true })

const PROFILE_FILE = path.join(DATA_DIR, 'profile.json')

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

function makeId() {
  return Math.random().toString(36).slice(2, 10)
}

function profileDir(profileId) {
  const dir = path.join(PROFILES_DIR, profileId)
  fs.mkdirSync(path.join(dir, 'rows'), { recursive: true })
  return dir
}

function profileBoardsFile(profileId) {
  return path.join(profileDir(profileId), 'boards.json')
}
function profileHomeSettingsFile(profileId) {
  return path.join(profileDir(profileId), 'home-settings.json')
}
function profileCastFile(profileId) {
  return path.join(profileDir(profileId), 'cast.json')
}
function profileEpisodesFile(profileId) {
  return path.join(profileDir(profileId), 'episodes.json')
}
function profileWatchedFile(profileId) {
  return path.join(profileDir(profileId), 'watched.json')
}
function profileRowsFile(profileId, boardId) {
  return path.join(profileDir(profileId), 'rows', `${boardId}.json`)
}
function profileTemplatesFile(profileId) {
  return path.join(profileDir(profileId), 'templates.json')
}
function profileApiKeyFile(profileId) {
  return path.join(profileDir(profileId), 'api-key.json')
}
function readProfileApiKey(profileId) {
  const data = readJson(profileApiKeyFile(profileId), null)
  return (data?.tmdbApiKey || '').trim()
}

function readProfiles() {
  const data = readJson(PROFILE_FILE, [])
  if (Array.isArray(data)) return data
  if (data && data.username) {
    const migrated = [{ id: makeId(), username: data.username, photo: data.photo || '' }]
    writeJson(PROFILE_FILE, migrated)
    return migrated
  }
  return []
}

function migrateFlatDataToFirstProfile() {
  const profiles = readProfiles()
  if (profiles.length === 0) return
  const firstId = profiles[0].id
  const targetDir = path.join(PROFILES_DIR, firstId)
  if (fs.existsSync(targetDir)) return
  const oldBoardsFile = path.join(DATA_DIR, 'boards.json')
  if (!fs.existsSync(oldBoardsFile)) return
  fs.mkdirSync(targetDir, { recursive: true })
  const moves = [
    [oldBoardsFile, path.join(targetDir, 'boards.json')],
    [path.join(DATA_DIR, 'rows'), path.join(targetDir, 'rows')],
    [path.join(DATA_DIR, 'home-settings.json'), path.join(targetDir, 'home-settings.json')],
    [path.join(DATA_DIR, 'cast.json'), path.join(targetDir, 'cast.json')],
    [path.join(DATA_DIR, 'episodes.json'), path.join(targetDir, 'episodes.json')],
  ]
  for (const [from, to] of moves) {
    if (fs.existsSync(from)) fs.renameSync(from, to)
  }
  console.log(`Eski tek-profilli veriler '${firstId}' profiline taşındı: ${targetDir}`)
}
migrateFlatDataToFirstProfile()

const app = express()
app.use(cors())
app.use(express.json({ limit: '15mb' }))
app.use('/medya', express.static(MEDYA_DIR))

app.get('/api/profiles/:profileId/boards', (req, res) => {
  res.json(readJson(profileBoardsFile(req.params.profileId), []))
})

app.post('/api/profiles/:profileId/boards', (req, res) => {
  const boardsFile = profileBoardsFile(req.params.profileId)
  const boards = readJson(boardsFile, [])
  const id = makeId()
  boards.push({ ...req.body, id })
  writeJson(boardsFile, boards)
  writeJson(profileRowsFile(req.params.profileId, id), [])
  res.json({ id })
})

app.patch('/api/profiles/:profileId/boards/:id', (req, res) => {
  const boardsFile = profileBoardsFile(req.params.profileId)
  const boards = readJson(boardsFile, [])
  const idx = boards.findIndex((b) => b.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Arşiv bulunamadı' })
  boards[idx] = { ...boards[idx], ...req.body, id: req.params.id, updatedAt: Date.now() }
  writeJson(boardsFile, boards)
  res.json(boards[idx])
})

app.delete('/api/profiles/:profileId/boards/:id', (req, res) => {
  const boardsFile = profileBoardsFile(req.params.profileId)
  const boards = readJson(boardsFile, []).filter((b) => b.id !== req.params.id)
  writeJson(boardsFile, boards)
  try {
    fs.unlinkSync(profileRowsFile(req.params.profileId, req.params.id))
  } catch {}
  res.json({ ok: true })
})

app.get('/api/profiles/:profileId/boards/:id/rows', (req, res) => {
  res.json(readJson(profileRowsFile(req.params.profileId, req.params.id), []))
})

app.post('/api/profiles/:profileId/boards/:id/rows', (req, res) => {
  const rowsFile = profileRowsFile(req.params.profileId, req.params.id)
  const rows = readJson(rowsFile, [])
  const id = makeId()
  const row = { ...req.body, id }
  rows.unshift(row)
  writeJson(rowsFile, rows)
  res.json(row)
})

app.put('/api/profiles/:profileId/boards/:id/rows/:rowId', (req, res) => {
  const rowsFile = profileRowsFile(req.params.profileId, req.params.id)
  const rows = readJson(rowsFile, [])
  const idx = rows.findIndex((r) => r.id === req.params.rowId)
  const saved = { ...req.body, id: req.params.rowId, updatedAt: Date.now() }
  if (idx === -1) rows.unshift(saved)
  else rows[idx] = saved
  writeJson(rowsFile, rows)
  res.json(saved)
})

app.delete('/api/profiles/:profileId/boards/:id/rows/:rowId', (req, res) => {
  const rowsFile = profileRowsFile(req.params.profileId, req.params.id)
  const rows = readJson(rowsFile, []).filter((r) => r.id !== req.params.rowId)
  writeJson(rowsFile, rows)
  res.json({ ok: true })
})

app.post('/api/profiles/:profileId/boards/:id/rows/bulk', (req, res) => {
  const rowsFile = profileRowsFile(req.params.profileId, req.params.id)
  const rows = readJson(rowsFile, [])
  const newOnes = (req.body ?? []).map((item) => ({ ...item, id: makeId() }))
  writeJson(rowsFile, [...newOnes, ...rows])
  res.json({ ok: true, count: newOnes.length })
})

function defaultValueForType(type) {
  switch (type) {
    case 'checkbox':
      return false
    case 'multiselect':
    case 'multidate':
      return []
    case 'rating':
      return {}
    default:
      return ''
  }
}

function isEmptyPropertyValue(v) {
  if (v === undefined || v === null || v === '') return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v).length === 0
  return false
}

app.post('/api/profiles/:profileId/boards/:id/clear-column/:propertyId', (req, res) => {
  const { profileId, id: boardId, propertyId } = req.params
  const boards = readJson(profileBoardsFile(profileId), [])
  const board = boards.find((b) => b.id === boardId)
  if (!board) return res.status(404).json({ error: 'Arşiv bulunamadı' })
  const prop = board.properties.find((p) => p.id === propertyId)
  if (!prop) return res.status(404).json({ error: 'Sütun bulunamadı' })

  const rowsFile = profileRowsFile(profileId, boardId)
  const rows = readJson(rowsFile, [])
  const empty = defaultValueForType(prop.type)
  let count = 0
  for (const row of rows) {
    if (!isEmptyPropertyValue(row.values[propertyId])) count++
    row.values[propertyId] = empty
  }
  writeJson(rowsFile, rows)
  res.json({ ok: true, count })
})

app.get('/api/profiles/:profileId/templates', (req, res) => {
  res.json(readJson(profileTemplatesFile(req.params.profileId), []))
})

app.post('/api/profiles/:profileId/templates', (req, res) => {
  const file = profileTemplatesFile(req.params.profileId)
  const templates = readJson(file, [])
  const template = { ...req.body, id: makeId() }
  templates.push(template)
  writeJson(file, templates)
  res.json(template)
})

app.delete('/api/profiles/:profileId/templates/:id', (req, res) => {
  const file = profileTemplatesFile(req.params.profileId)
  const templates = readJson(file, []).filter((t) => t.id !== req.params.id)
  writeJson(file, templates)
  res.json({ ok: true })
})

app.get('/api/profiles', (req, res) => {
  res.json(readProfiles())
})

app.post('/api/profiles', (req, res) => {
  const profiles = readProfiles()
  const profile = { id: makeId(), username: req.body.username ?? '', photo: req.body.photo ?? '' }
  profiles.push(profile)
  writeJson(PROFILE_FILE, profiles)
  res.json(profile)
})

app.put('/api/profiles/:id', (req, res) => {
  const profiles = readProfiles()
  const idx = profiles.findIndex((p) => p.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Profil bulunamadı' })
  profiles[idx] = { ...profiles[idx], ...req.body, id: req.params.id }
  writeJson(PROFILE_FILE, profiles)
  res.json(profiles[idx])
})

app.delete('/api/profiles/:id', (req, res) => {
  const profiles = readProfiles().filter((p) => p.id !== req.params.id)
  writeJson(PROFILE_FILE, profiles)
  const dir = path.join(PROFILES_DIR, req.params.id)
  if (fs.existsSync(dir)) {
    const trashDir = path.join(DATA_DIR, 'profiller_silinen')
    fs.mkdirSync(trashDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    fs.renameSync(dir, path.join(trashDir, `${req.params.id}_${stamp}`))
  }
  res.json({ ok: true })
})

app.get('/api/profiles/:profileId/api-key', (req, res) => {
  res.json({ tmdbApiKey: readProfileApiKey(req.params.profileId) })
})

app.put('/api/profiles/:profileId/api-key', (req, res) => {
  writeJson(profileApiKeyFile(req.params.profileId), { tmdbApiKey: (req.body?.tmdbApiKey || '').trim() })
  res.json({ ok: true })
})

app.get('/api/profiles/:profileId/home-settings', (req, res) => {
  res.json(readJson(profileHomeSettingsFile(req.params.profileId), null))
})

app.put('/api/profiles/:profileId/home-settings', (req, res) => {
  writeJson(profileHomeSettingsFile(req.params.profileId), req.body)
  res.json({ ok: true })
})

app.get('/api/profiles/:profileId/cast', (req, res) => {
  res.json(readJson(profileCastFile(req.params.profileId), {}))
})

app.get('/api/profiles/:profileId/episodes', (req, res) => {
  res.json(readJson(profileEpisodesFile(req.params.profileId), {}))
})

app.get('/api/profiles/:profileId/watched', (req, res) => {
  res.json(readJson(profileWatchedFile(req.params.profileId), {}))
})

app.put('/api/profiles/:profileId/watched/:rowId', (req, res) => {
  const file = profileWatchedFile(req.params.profileId)
  const all = readJson(file, {})
  all[req.params.rowId] = req.body
  writeJson(file, all)
  res.json({ ok: true })
})

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p'
const TR_MONTHS = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

const ISO_TO_TR = {
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

function normalizeText(s) {
  return (s ?? '')
    .toString()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

function stripFlagEmoji(label) {
  return label.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}/u, '').trim()
}

function isoToFlag(iso2) {
  if (!iso2 || iso2.length !== 2) return ''
  return [...iso2.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('')
}

async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, options)
    } catch (e) {
      if (attempt >= retries) throw e
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }
}

async function tmdbGet(path_, params, apiKey) {
  const url = new URL(`${TMDB_BASE}${path_}`)
  url.searchParams.set('api_key', apiKey)
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, v)
  const res = await fetchWithRetry(url)
  if (!res.ok) return null
  return res.json()
}

async function downloadTmdbImage(url, destPath) {
  if (fs.existsSync(destPath)) return true
  const res = await fetchWithRetry(url)
  if (!res.ok) return false
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()))
  return true
}

async function searchTv(query, year, apiKey) {
  if (!query) return null
  const params = { query, language: 'tr-TR' }
  if (year) params.first_air_date_year = year
  const withYear = year ? await tmdbGet('/search/tv', params, apiKey) : null
  if (withYear?.results?.[0]) return withYear.results[0]
  const noYear = await tmdbGet('/search/tv', { query, language: 'tr-TR' }, apiKey)
  return noYear?.results?.[0] ?? null
}

async function searchMovie(query, year, apiKey) {
  if (!query) return null
  const params = { query, language: 'tr-TR' }
  if (year) params.year = year
  const withYear = year ? await tmdbGet('/search/movie', params, apiKey) : null
  if (withYear?.results?.[0]) return withYear.results[0]
  const noYear = await tmdbGet('/search/movie', { query, language: 'tr-TR' }, apiKey)
  return noYear?.results?.[0] ?? null
}

async function searchMulti(query, year, apiKey) {
  if (!query) return null
  const data = await tmdbGet('/search/multi', { query, language: 'tr-TR' }, apiKey)
  const results = (data?.results ?? []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
  if (results.length === 0) return null
  if (year) {
    const match = results.find((r) => (r.release_date || r.first_air_date || '').startsWith(year))
    if (match) return match
  }
  return results[0]
}

function findProp(board, name, type) {
  return board.properties.find((p) => p.name === name && (!type || p.type === type))
}

function rankTrailers(results) {
  const trailers = (results ?? []).filter((v) => v.site === 'YouTube' && v.type === 'Trailer')
  const official = trailers.filter((v) => v.official)
  const rest = trailers.filter((v) => !v.official)
  return [...official, ...rest]
}

async function isYoutubeVideoAvailable(videoKey) {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoKey}`)}&format=json`
    const res = await fetchWithRetry(url, undefined, 1)
    return res.ok
  } catch {
    return false
  }
}

async function getTrailerUrl(mediaType, tmdbId, apiKey) {
  const tr = await tmdbGet(`/${mediaType}/${tmdbId}/videos`, { language: 'tr-TR' }, apiKey)
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

function pickLogo(images) {
  const logos = images?.logos ?? []
  if (logos.length === 0) return null
  return logos.find((l) => l.iso_639_1 === 'tr') ?? logos.find((l) => l.iso_639_1 === 'en') ?? logos[0]
}

async function getMovieCertification(tmdbId, apiKey) {
  const data = await tmdbGet(`/movie/${tmdbId}/release_dates`, {}, apiKey)
  const byCountry = new Map((data?.results ?? []).map((c) => [c.iso_3166_1, c.release_dates]))
  for (const cc of ['TR', 'US']) {
    const entries = byCountry.get(cc)
    if (!entries) continue
    const cert = entries.map((e) => e.certification).find((c) => c)
    if (cert) return cert
  }
  return null
}

async function getTvCertification(tmdbId, apiKey) {
  const data = await tmdbGet(`/tv/${tmdbId}/content_ratings`, {}, apiKey)
  const byCountry = new Map((data?.results ?? []).map((c) => [c.iso_3166_1, c.rating]))
  for (const cc of ['TR', 'US']) {
    if (byCountry.get(cc)) return byCountry.get(cc)
  }
  return null
}

app.post('/api/profiles/:profileId/fetch-tmdb/:boardId/:rowId', async (req, res) => {
  try {
    const { profileId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) {
      return res.status(400).json({ error: 'Önce Ayarlar → Veritabanı → API sekmesinden bir TMDB API anahtarı girmelisin.' })
    }
    const exclude = new Set(Array.isArray(req.body?.exclude) ? req.body.exclude : [])
    const overwrite = Boolean(req.body?.overwrite)
    const boardsFile = profileBoardsFile(profileId)
    const boards = readJson(boardsFile, [])
    const board = boards.find((b) => b.id === req.params.boardId)
    if (!board) return res.status(404).json({ error: 'Arşiv bulunamadı' })
    const rowsFilePath = profileRowsFile(profileId, board.id)
    const rows = readJson(rowsFilePath, [])
    const row = rows.find((r) => r.id === req.params.rowId)
    if (!row) return res.status(404).json({ error: 'Kayıt bulunamadı' })

    const titleProp = findProp(board, 'Türkçe Adı')
    const origProp = findProp(board, 'Orjinal Adı')
    const kategoriProp = findProp(board, 'Kategori', 'select')
    const vizyonProp = findProp(board, 'Vizyon Tarihi', 'date')
    const bannerProp = findProp(board, 'Banner', 'image')
    const posterProp = findProp(board, 'Poster', 'image')
    const kapakAdiProp = findProp(board, 'KAPAK ADI', 'image')
    const ulkeProp = findProp(board, 'Ülke', 'multiselect')
    const turProp = findProp(board, 'Tür', 'multiselect')
    const yonetmenProp = findProp(board, 'Yönetmen', 'text')
    const sinopsisProp = board.properties.find((p) => p.type === 'longtext')
    const oyuncularProp = findProp(board, 'Oyuncular', 'multiselect')
    const videoProp = findProp(board, 'video', 'url')

    let sureProp = findProp(board, 'Süre', 'number')
    if (!sureProp) {
      sureProp = { id: makeId(), name: 'Süre', type: 'number' }
      board.properties.push(sureProp)
    }
    let yasProp = findProp(board, 'Yaş Sınırı', 'text')
    if (!yasProp) {
      yasProp = { id: makeId(), name: 'Yaş Sınırı', type: 'text' }
      board.properties.push(yasProp)
    }

    const titleTr = titleProp ? row.values[titleProp.id] : ''
    const titleOrig = origProp ? row.values[origProp.id] : ''
    if (!titleTr && !titleOrig) {
      return res.status(400).json({ error: 'Önce "Türkçe Adı" (ya da "Orjinal Adı") sütununu doldurmalısın.' })
    }

    let year = null
    if (vizyonProp) {
      const raw = row.values[vizyonProp.id]
      if (typeof raw === 'string' && /^\d{4}/.test(raw)) year = raw.slice(0, 4)
    }

    const kategoriId = kategoriProp ? row.values[kategoriProp.id] : null
    const kategoriLabel = kategoriProp?.options?.find((o) => o.id === kategoriId)?.label ?? ''
    const kategoriLower = kategoriLabel.toLocaleLowerCase('tr')
    const tvHint = ['dizi', 'mini dizi', 'reality show', 'yarışma'].includes(kategoriLower) || kategoriLower.includes('gösteri')
    const movieHint = kategoriLabel && !tvHint

    let mediaType = null
    let result = null
    if (tvHint) {
      result = (await searchTv(titleOrig, year, apiKey)) ?? (await searchTv(titleTr, year, apiKey))
      mediaType = 'tv'
    } else if (movieHint) {
      result = (await searchMovie(titleOrig, year, apiKey)) ?? (await searchMovie(titleTr, year, apiKey))
      mediaType = 'movie'
    }
    if (!result) {
      const multi = (await searchMulti(titleOrig, year, apiKey)) ?? (await searchMulti(titleTr, year, apiKey))
      if (multi) {
        result = multi
        mediaType = multi.media_type
      }
    }
    if (!result) {
      return res.status(404).json({
        error:
          'TMDB eşleşmesi bulunamadı — başlığın yazımını kontrol et; "Kategori" sütununu Film ya da Dizi olarak doldurursan arama daha isabetli sonuç verir.',
      })
    }

    const details =
      mediaType === 'tv'
        ? await tmdbGet(
            `/tv/${result.id}`,
            { language: 'tr-TR', append_to_response: 'aggregate_credits,images', include_image_language: 'tr,en,null' },
            apiKey,
          )
        : await tmdbGet(
            `/movie/${result.id}`,
            { language: 'tr-TR', append_to_response: 'credits,images', include_image_language: 'tr,en,null' },
            apiKey,
          )
    if (!details) return res.status(502).json({ error: 'TMDB detay alınamadı' })

    const filled = []

    if (kategoriProp && (overwrite || !kategoriId) && !exclude.has('kategori')) {
      const wantLabel = mediaType === 'tv' ? 'Dizi' : 'Film'
      const opt = kategoriProp.options?.find((o) => o.label === wantLabel)
      if (opt) {
        row.values[kategoriProp.id] = opt.id
        filled.push('Kategori')
      }
    }

    if (origProp && (overwrite || !titleOrig) && !exclude.has('orjinalAdi')) {
      const orig = mediaType === 'tv' ? details.original_name : details.original_title
      if (orig) {
        row.values[origProp.id] = orig
        filled.push('Orjinal Adı')
      }
    }

    if (vizyonProp && (overwrite || !row.values[vizyonProp.id]) && !exclude.has('vizyonTarihi')) {
      const date = mediaType === 'tv' ? details.first_air_date : details.release_date
      if (date) {
        row.values[vizyonProp.id] = date
        filled.push('Vizyon Tarihi')
      }
    }

    if (sinopsisProp && (overwrite || !row.values[sinopsisProp.id]) && details.overview && !exclude.has('sinopsis')) {
      row.values[sinopsisProp.id] = details.overview
      filled.push('Sinopsis')
    }

    if (posterProp && (overwrite || !row.values[posterProp.id]) && details.poster_path && !exclude.has('poster')) {
      const filename = `tmdb_poster_${row.id}.jpg`
      if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w500${details.poster_path}`, path.join(MEDYA_DIR, filename))) {
        row.values[posterProp.id] = `/medya/${filename}`
        filled.push('Poster')
      }
    }

    if (bannerProp && (overwrite || !row.values[bannerProp.id]) && details.backdrop_path && !exclude.has('banner')) {
      const filename = `tmdb_backdrop_${row.id}.jpg`
      if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w1280${details.backdrop_path}`, path.join(MEDYA_DIR, filename))) {
        row.values[bannerProp.id] = `/medya/${filename}`
        filled.push('Banner')
      }
    }

    if (kapakAdiProp && (overwrite || !row.values[kapakAdiProp.id]) && !exclude.has('kapakAdi')) {
      const logo = pickLogo(details.images)
      if (logo) {
        const filename = `tmdb_logo_${row.id}.png`
        if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w500${logo.file_path}`, path.join(MEDYA_DIR, filename))) {
          row.values[kapakAdiProp.id] = `/medya/${filename}`
          filled.push('Kapak Adı')
        }
      }
    }

    if (
      turProp &&
      (overwrite || !Array.isArray(row.values[turProp.id]) || row.values[turProp.id].length === 0) &&
      !exclude.has('tur')
    ) {
      const genres = details.genres ?? []
      if (genres.length) {
        const turByName = new Map(turProp.options.map((o) => [normalizeText(o.label), o.id]))
        const ids = []
        for (const g of genres) {
          const norm = normalizeText(g.name)
          let optId = turByName.get(norm)
          if (!optId) {
            optId = makeId()
            turProp.options.push({ id: optId, label: g.name, colorIndex: turProp.options.length % 9 })
            turByName.set(norm, optId)
          }
          ids.push(optId)
        }
        row.values[turProp.id] = ids
        filled.push('Tür')
      }
    }

    if (
      ulkeProp &&
      (overwrite || !Array.isArray(row.values[ulkeProp.id]) || row.values[ulkeProp.id].length === 0) &&
      !exclude.has('ulke')
    ) {
      const countries = details.production_countries ?? []
      if (countries.length) {
        const ulkeByName = new Map(ulkeProp.options.map((o) => [normalizeText(stripFlagEmoji(o.label)), o.id]))
        const ids = []
        for (const c of countries) {
          const trName = ISO_TO_TR[c.iso_3166_1] ?? c.name ?? c.iso_3166_1
          const norm = normalizeText(trName)
          let optId = ulkeByName.get(norm)
          if (!optId) {
            optId = makeId()
            ulkeProp.options.push({ id: optId, label: `${isoToFlag(c.iso_3166_1)}${trName}`, colorIndex: ulkeProp.options.length % 9 })
            ulkeByName.set(norm, optId)
          }
          ids.push(optId)
        }
        row.values[ulkeProp.id] = ids
        filled.push('Ülke')
      }
    }

    if (yonetmenProp && (overwrite || !(row.values[yonetmenProp.id] ?? '').trim()) && !exclude.has('yonetmen')) {
      let directors = []
      if (mediaType === 'movie') {
        directors = (details.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name)
      } else {
        directors = (details.created_by ?? []).map((c) => c.name)
      }
      if (directors.length) {
        row.values[yonetmenProp.id] = directors.join(', ')
        filled.push('Yönetmen')
      }
    }

    if (mediaType === 'movie' && sureProp && (overwrite || !row.values[sureProp.id]) && details.runtime && !exclude.has('sure')) {
      row.values[sureProp.id] = details.runtime
      filled.push('Süre')
    }

    if (yasProp && (overwrite || !(row.values[yasProp.id] ?? '').trim()) && !exclude.has('yasSiniri')) {
      const cert = mediaType === 'movie' ? await getMovieCertification(result.id, apiKey) : await getTvCertification(result.id, apiKey)
      if (cert) {
        row.values[yasProp.id] = cert
        filled.push('Yaş Sınırı')
      }
    }

    if (videoProp && (overwrite || !(row.values[videoProp.id] ?? '').trim()) && !exclude.has('video')) {
      const trailerUrl = await getTrailerUrl(mediaType, result.id, apiKey)
      if (trailerUrl) {
        row.values[videoProp.id] = trailerUrl
        filled.push('video')
      }
    }

    let newEpisodes = 0
    if (mediaType === 'tv' && !exclude.has('sezonlar')) {
      const seasonsMeta = (details.seasons ?? []).filter((s) => s.season_number >= 1)
      const seasonsOut = []
      for (const s of seasonsMeta) {
        const sdata = await tmdbGet(`/tv/${result.id}/season/${s.season_number}`, { language: 'tr-TR' }, apiKey)
        if (!sdata) continue
        const eps = []
        for (const ep of sdata.episodes ?? []) {
          let stillUrl = null
          if (ep.still_path) {
            const filename = `episode_${path.basename(ep.still_path)}`
            if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w300${ep.still_path}`, path.join(MEDYA_DIR, filename))) {
              stillUrl = `/medya/${filename}`
            }
          }
          eps.push({
            episodeNumber: ep.episode_number,
            name: ep.name || `Bölüm ${ep.episode_number}`,
            overview: ep.overview ?? '',
            airDate: ep.air_date ?? '',
            stillUrl,
          })
        }
        if (eps.length) seasonsOut.push({ seasonNumber: s.season_number, name: s.name || `Sezon ${s.season_number}`, episodes: eps })
      }

      const episodesFile = profileEpisodesFile(profileId)
      const episodesMap = readJson(episodesFile, {})
      const before = (episodesMap[row.id] ?? []).reduce((n, s) => n + s.episodes.length, 0)
      episodesMap[row.id] = seasonsOut
      writeJson(episodesFile, episodesMap)
      newEpisodes = seasonsOut.reduce((n, s) => n + s.episodes.length, 0) - before
    }

    let newActors = 0
    if (oyuncularProp && !exclude.has('kadro')) {
      const actorByName = new Map(oyuncularProp.options.map((o) => [normalizeText(o.label), o.id]))
      const rawCast =
        mediaType === 'tv'
          ? (details.aggregate_credits?.cast ?? []).slice(0, 20).map((c) => {
              const roles = c.roles ?? []
              const primary = roles.length ? roles.reduce((a, b) => ((b.episode_count ?? 0) > (a.episode_count ?? 0) ? b : a)) : null
              return {
                id: c.id,
                name: c.name,
                profile_path: c.profile_path,
                character: primary?.character,
                episodeCount: roles.reduce((n, r) => n + (r.episode_count ?? 0), 0),
              }
            })
          : (details.credits?.cast ?? []).slice(0, 20).map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path, character: c.character }))

      const freshCast = []
      for (const c of rawCast) {
        if (!c.name || !c.character) continue
        const norm = normalizeText(c.name)
        let optId = actorByName.get(norm)

        if (!optId) {
          optId = makeId()
          const newOpt = { id: optId, label: c.name, colorIndex: oyuncularProp.options.length % 9 }
          if (c.profile_path) {
            const filename = `actor_tmdb_${optId}.jpg`
            if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w500${c.profile_path}`, path.join(MEDYA_DIR, filename))) {
              newOpt.image = `/medya/${filename}`
            }
          }
          const person = await tmdbGet(`/person/${c.id}`, { language: 'tr-TR' }, apiKey)
          if (person) {
            const parts = []
            if (person.birthday) {
              const [y, m, d] = person.birthday.split('-')
              parts.push(`${parseInt(d, 10)} ${TR_MONTHS[parseInt(m, 10)]} ${y}`)
            }
            if (person.place_of_birth) parts.push(person.place_of_birth)
            if (parts.length) newOpt.subtitle = parts.join(' · ')
          }
          oyuncularProp.options.push(newOpt)
          actorByName.set(norm, optId)
          newActors++
        }
        const entry = { optionId: optId, character: c.character }
        if (c.episodeCount) entry.episodeCount = c.episodeCount
        freshCast.push(entry)
      }

      if (freshCast.length) {
        const castFile = profileCastFile(profileId)
        const castMap = readJson(castFile, {})
        castMap[row.id] = freshCast
        writeJson(castFile, castMap)

        const existingIds = Array.isArray(row.values[oyuncularProp.id]) ? row.values[oyuncularProp.id] : []
        row.values[oyuncularProp.id] = [...new Set([...existingIds, ...freshCast.map((c) => c.optionId)])]
      }
    }

    writeJson(boardsFile, boards)
    writeJson(rowsFilePath, rows)

    res.json({ ok: true, mediaType, filled, newEpisodes, newActors })
  } catch (e) {
    console.error('fetch-tmdb hata:', e)
    res.status(500).json({ error: 'Çekme sırasında hata oluştu' })
  }
})

app.get('/api/medya', (req, res) => {
  const files = fs
    .readdirSync(MEDYA_DIR)
    .filter((f) => !f.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, 'tr'))
  res.json(files)
})

function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '_')
}

const upload = multer({
  storage: multer.diskStorage({
    destination: MEDYA_DIR,
    filename: (req, file, cb) => {
      const safe = sanitizeFilename(file.originalname)
      const ext = path.extname(safe)
      const base = path.basename(safe, ext)
      let name = safe
      let i = 1
      while (fs.existsSync(path.join(MEDYA_DIR, name))) {
        name = `${base}-${i}${ext}`
        i++
      }
      cb(null, name)
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
})

app.post('/api/medya/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya gelmedi' })
  res.json({ filename: req.file.filename })
})

app.get('/api/update-check', (req, res) => {
  try {
    execSync('git fetch --quiet', { cwd: ROOT, timeout: 10000, stdio: 'ignore' })
    const behind = Number(
      execSync('git rev-list HEAD..@{u} --count', { cwd: ROOT, timeout: 5000 }).toString().trim(),
    )
    res.json({ updateAvailable: behind > 0, commitsBehind: behind || 0 })
  } catch {
    res.json({ updateAvailable: false, commitsBehind: 0 })
  }
})

// "Şimdi Güncelle" — kullanıcı bekleyip uygulamayı kendisi kapatıp açmak yerine tek tıkla
// güncellensin istedi. Kodu hemen çeker, sonra kendi sunucu sürecini (ve ARGUS.bat'ın
// başlattığı tüm ağacı — Vite dahil) kapatıp YERİNE yeni bir ARGUS.bat başlatır; o da zaten
// git pull + node kontrolü + gizli sunucu başlatma işini kendisi yapar (bkz. ARGUS.bat).
// Yanıtı (res.json) MUTLAKA süreç kapanmadan ÖNCE gönderiyoruz, yoksa tarayıcı hiç cevap
// alamaz. `argus-pid.txt` "ARGUS Durdur.bat"ın kullandığı AYNI dosya — kök süreci bulup
// tüm ağacı (/T) kapatmak için.
app.post('/api/apply-update', (req, res) => {
  try {
    execSync('git pull --ff-only', { cwd: ROOT, timeout: 15000, stdio: 'ignore' })
  } catch {
    return res.status(500).json({ error: 'Güncelleme çekilemedi — internet bağlantını kontrol et.' })
  }
  res.json({ ok: true })
  setTimeout(() => {
    try {
      const batPath = path.join(ROOT, 'ARGUS.bat')
      spawn(batPath, [], { cwd: ROOT, detached: true, stdio: 'ignore', shell: true }).unref()
    } catch {}
    try {
      const pidFile = path.join(__dirname, 'argus-pid.txt')
      if (fs.existsSync(pidFile)) {
        const pid = fs.readFileSync(pidFile, 'utf-8').trim()
        if (pid) execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
      }
    } catch {}
  }, 400)
})

const PORT = 4000
app.listen(PORT, () => {
  console.log(`ARGUS yerel sunucusu çalışıyor: http://localhost:${PORT}`)
  console.log(`Veriler: ${DATA_DIR}`)
  console.log(`Medya: ${MEDYA_DIR}`)
})
