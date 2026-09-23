import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { ensureRole, ensureStatusOption, resolveRole, resolveStatusOption } from './roles.js'
import { buildRestartScript, launchDetachedRestart } from './restart.js'

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
// Kayıt id → { id, mediaType } — kaydın eşleştiği TMDB içeriği (bkz. fillRowFromTmdb).
function profileTmdbFile(profileId) {
  return path.join(profileDir(profileId), 'tmdb.json')
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

// "Sağlık Kontrolü" paneli için — bir görsel sütununun değeri diskte gerçekten var olmayan bir
// dosyaya işaret ediyorsa (ör. `medya/` klasöründen elle silinmiş bir dosya) bunu istemci
// tarafından bilemeyiz, sadece sunucu diski kontrol edebilir. Eksik başlık/kapak gibi diğer
// sağlık kontrolleri board+rows verisinden türetilebildiği için tamamen istemci tarafında.
app.get('/api/profiles/:profileId/boards/:id/health', (req, res) => {
  const boardsFile = profileBoardsFile(req.params.profileId)
  const boards = readJson(boardsFile, [])
  const board = boards.find((b) => b.id === req.params.id)
  if (!board) return res.status(404).json({ error: 'Arşiv bulunamadı' })
  const rows = readJson(profileRowsFile(req.params.profileId, board.id), [])
  const imageProps = board.properties.filter((p) => p.type === 'image')
  const brokenImages = []
  for (const row of rows) {
    for (const p of imageProps) {
      const v = row.values[p.id]
      if (typeof v !== 'string' || !v.startsWith('/medya/')) continue
      if (!fs.existsSync(path.join(ROOT, v))) {
        brokenImages.push({ rowId: row.id, propertyId: p.id, propertyName: p.name, value: v })
      }
    }
  }
  res.json({ brokenImages })
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
  const target = name.trim().toLocaleLowerCase('tr')
  return board.properties.find((p) => p.name.trim().toLocaleLowerCase('tr') === target && (!type || p.type === type))
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

// Bir kaydın TMDB'deki karşılığını başlığına/orijinal adına, yılına ve Kategori'sine (Film mi
// Dizi mi) bakarak arar. Sadece arar, kaydı değiştirmez — { result, mediaType } ya da null.
async function searchTmdbForRow(board, row, apiKey) {
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
  const tvHint = ['dizi', 'mini dizi', 'reality show', 'yarışma'].includes(kategoriLower) || kategoriLower.includes('gösteri')
  const movieHint = kategoriLabel && !tvHint

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
async function fillRowFromTmdb(profileId, boardId, rowId, { exclude: excludeList = [], overwrite: overwriteFlag = false, forced = null } = {}) {
  try {
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) {
      return { status: 400, data: { error: 'Önce Ayarlar → Veritabanı → API sekmesinden bir TMDB API anahtarı girmelisin.' } }
    }
    const exclude = new Set(Array.isArray(excludeList) ? excludeList : [])
    const overwrite = Boolean(overwriteFlag)
    const boardsFile = profileBoardsFile(profileId)
    const boards = readJson(boardsFile, [])
    const board = boards.find((b) => b.id === boardId)
    if (!board) return { status: 404, data: { error: 'Arşiv bulunamadı' } }
    const rowsFilePath = profileRowsFile(profileId, board.id)
    const rows = readJson(rowsFilePath, [])
    const row = rows.find((r) => r.id === rowId)
    if (!row) return { status: 404, data: { error: 'Kayıt bulunamadı' } }

    // Başlık her zaman arşivin başlık sütunu (adı "Türkçe Adı" olmak zorunda değil).
    const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)

    // Board'da bu sütunlardan biri hiç yoksa (kullanıcı hazır şablonu kullanmadan kendi
    // arşivini elle kurduysa, ya da bir sütunu sildiyse) TMDB doldurma eskiden sessizce o
    // alanı atlıyordu — arkadaşının arşivinde "KAPAK ADI" sütunu hiç eklenmemiş olması TAM
    // OLARAK bu yüzden hiç doldurulmuyordu. Artık Süre/Yaş Sınırı'nda zaten var olan
    // "yoksa oluştur" deseni TÜM TMDB alanlarına uygulanıyor — güncelle butonuna basmak
    // eksik sütunları da kendisi ekliyor.
    const mk = () => makeId()
    const origProp = ensureRole(board, 'orjinalAdi', mk)
    const kategoriProp = ensureRole(board, 'kategori', mk, { options: [] })
    const vizyonProp = ensureRole(board, 'vizyon', mk)
    const bannerProp = ensureRole(board, 'banner', mk)
    const posterProp = ensureRole(board, 'poster', mk)
    // Başlık logosu: arşivde "Vitrin Başlık Görseli" olarak işaretli sütun; hiç yoksa oluşturulup
    // o şekilde işaretleniyor (eskiden "Kapak Adı" adıyla aranıyordu).
    let kapakAdiProp = board.properties.find((p) => p.id === board.titleImagePropertyId && p.type === 'image')
    if (!kapakAdiProp) {
      kapakAdiProp = board.properties.find((p) => p.type === 'image' && p.name.trim().toLocaleLowerCase('tr') === 'kapak adı')
      if (!kapakAdiProp) {
        kapakAdiProp = { id: mk(), name: 'Kapak Adı', type: 'image' }
        board.properties.push(kapakAdiProp)
      }
      board.titleImagePropertyId = kapakAdiProp.id
    }
    const ulkeProp = ensureRole(board, 'ulke', mk, { options: [] })
    const turProp = ensureRole(board, 'tur', mk, { options: [] })
    const yonetmenProp = ensureRole(board, 'yonetmen', mk)
    const oyuncularProp = ensureRole(board, 'oyuncular', mk, { options: [] })
    const videoProp = ensureRole(board, 'video', mk)
    const sureProp = ensureRole(board, 'sure', mk)
    const yasProp = ensureRole(board, 'yas', mk)
    const sinopsisProp = ensureRole(board, 'sinopsis', mk)

    const titleTr = titleProp ? row.values[titleProp.id] : ''
    const titleOrig = origProp ? row.values[origProp.id] : ''
    if (!titleTr && !titleOrig) {
      return { status: 400, data: { error: 'Önce başlığı (ya da "Orjinal Adı" sütununu) doldurmalısın.' } }
    }

    const kategoriId = kategoriProp ? row.values[kategoriProp.id] : null
    let mediaType = null
    let result = null
    if (forced) {
      result = { id: forced.tmdbId }
      mediaType = forced.mediaType
    } else {
      const match = await searchTmdbForRow(board, row, apiKey)
      if (match) {
        result = match.result
        mediaType = match.mediaType
      }
    }
    if (!result) {
      return {
        status: 404,
        data: {
          error:
            'TMDB eşleşmesi bulunamadı — başlığın yazımını kontrol et; "Kategori" sütununu Film ya da Dizi olarak doldurursan arama daha isabetli sonuç verir.',
        },
      }
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
    if (!details) return { status: 502, data: { error: 'TMDB detay alınamadı' } }

    // Bu kaydın TMDB kimliği saklanıyor — Nerede İzlenir, Benzerler, yeni bölüm kontrolü ve
    // Keşfet'in "zaten arşivde var" ayıklaması bunu kullanıyor (bkz. tmdb.json).
    const refs = readJson(profileTmdbFile(profileId), {})
    refs[row.id] = { id: result.id, mediaType }
    writeJson(profileTmdbFile(profileId), refs)

    const filled = []

    if (kategoriProp && (overwrite || !kategoriId) && !exclude.has('kategori')) {
      const wantLabel = mediaType === 'tv' ? 'Dizi' : 'Film'
      if (!kategoriProp.options) kategoriProp.options = []
      let opt = kategoriProp.options.find((o) => o.label === wantLabel)
      if (!opt) {
        opt = { id: makeId(), label: wantLabel, colorIndex: kategoriProp.options.length % 9 }
        kategoriProp.options.push(opt)
      }
      row.values[kategoriProp.id] = opt.id
      filled.push('Kategori')
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
        filled.push('Video')
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

    return { status: 200, data: { ok: true, mediaType, filled, newEpisodes, newActors } }
  } catch (e) {
    console.error('fetch-tmdb hata:', e)
    return { status: 500, data: { error: 'Çekme sırasında hata oluştu' } }
  }
}

app.post('/api/profiles/:profileId/fetch-tmdb/:boardId/:rowId', async (req, res) => {
  const { profileId, boardId, rowId } = req.params
  const out = await fillRowFromTmdb(profileId, boardId, rowId, { exclude: req.body?.exclude, overwrite: req.body?.overwrite })
  res.status(out.status).json(out.data)
})

// ---- TMDB tabanlı keşif özellikleri -----------------------------------------------------------
// Nerede İzlenir, Benzer İçerikler, Keşfet ve Yeni Bölümler — hepsi bir kaydın TMDB kimliğine
// (tmdb.json) dayanıyor. Kimliği henüz bilinmeyen (hiç "TMDB'den Doldur" yapılmamış) kayıtlar
// ilk ihtiyaç anında başlığıyla aranıp eşleşme saklanıyor.

function profileDismissedFile(profileId) {
  return path.join(profileDir(profileId), 'tmdb-dismissed.json')
}

function tmdbKey(mediaType, id) {
  return `${mediaType}:${id}`
}

async function ensureTmdbRef(profileId, board, row, apiKey) {
  const file = profileTmdbFile(profileId)
  const refs = readJson(file, {})
  if (refs[row.id]) return refs[row.id]
  const match = await searchTmdbForRow(board, row, apiKey)
  if (!match) return null
  const ref = { id: match.result.id, mediaType: match.mediaType }
  refs[row.id] = ref
  writeJson(file, refs)
  return ref
}

// "Bu içerik zaten arşivde mi?" — TMDB kimliği bilinen kayıtlar kimlikle, bilinmeyenler
// başlık/orijinal ad eşleşmesiyle (büyük/küçük harf ve aksan farkı gözetmeden) yakalanıyor.
function buildArchiveIndex(profileId, board, rows) {
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

function toCard(r, mediaType) {
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

function loadBoardAndRows(profileId, boardId) {
  const board = readJson(profileBoardsFile(profileId), []).find((b) => b.id === boardId)
  if (!board) return null
  return { board, rows: readJson(profileRowsFile(profileId, boardId), []) }
}

function mapProviders(list) {
  return (list ?? []).map((p) => ({ name: p.provider_name, logo: p.logo_path ? `${TMDB_IMG_BASE}/w92${p.logo_path}` : null }))
}

// Detay penceresi için: Türkiye'de nerede izlenebildiği + benzer içerikler.
app.get('/api/profiles/:profileId/tmdb-extras/:boardId/:rowId', async (req, res) => {
  try {
    const { profileId, boardId, rowId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ needsApiKey: true })
    const loaded = loadBoardAndRows(profileId, boardId)
    const row = loaded?.rows.find((r) => r.id === rowId)
    if (!row) return res.status(404).json({ error: 'Kayıt bulunamadı' })
    const ref = await ensureTmdbRef(profileId, loaded.board, row, apiKey)
    if (!ref) return res.json({ notFound: true })

    const [prov, recs] = await Promise.all([
      tmdbGet(`/${ref.mediaType}/${ref.id}/watch/providers`, {}, apiKey),
      tmdbGet(`/${ref.mediaType}/${ref.id}/recommendations`, { language: 'tr-TR' }, apiKey),
    ])
    let similarRaw = recs?.results ?? []
    if (similarRaw.length === 0) {
      const sim = await tmdbGet(`/${ref.mediaType}/${ref.id}/similar`, { language: 'tr-TR' }, apiKey)
      similarRaw = sim?.results ?? []
    }
    const index = buildArchiveIndex(profileId, loaded.board, loaded.rows)
    const similar = similarRaw
      .slice(0, 16)
      .map((r) => toCard(r, ref.mediaType))
      .map((c) => ({ ...c, inArchive: index.has(c) }))

    const tr = prov?.results?.TR
    res.json({
      providers: tr
        ? {
            link: tr.link ?? null,
            flatrate: mapProviders(tr.flatrate),
            free: mapProviders([...(tr.free ?? []), ...(tr.ads ?? [])]),
            rent: mapProviders(tr.rent),
            buy: mapProviders(tr.buy),
          }
        : null,
      similar,
    })
  } catch (e) {
    console.error('tmdb-extras hata:', e)
    res.status(500).json({ error: 'TMDB bilgileri alınamadı' })
  }
})

// TMDB'deki bir içeriği arşive yeni kayıt olarak ekler (Benzerler / Keşfet'ten). Önce başlık +
// durum (+ izlendiyse tarih/puan) ile kayıt oluşturulur, sonra normal TMDB doldurma çalışır.
app.post('/api/profiles/:profileId/tmdb-add/:boardId', async (req, res) => {
  try {
    const { profileId, boardId } = req.params
    const { tmdbId, mediaType, status, watchedDate, rating, exclude } = req.body ?? {}
    if (!tmdbId || (mediaType !== 'movie' && mediaType !== 'tv')) return res.status(400).json({ error: 'Geçersiz içerik' })
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.status(400).json({ error: 'Önce Ayarlar → Veritabanı → API sekmesinden bir TMDB API anahtarı girmelisin.' })

    const boardsFile = profileBoardsFile(profileId)
    const boards = readJson(boardsFile, [])
    const board = boards.find((b) => b.id === boardId)
    if (!board) return res.status(404).json({ error: 'Arşiv bulunamadı' })
    const rowsFile = profileRowsFile(profileId, boardId)
    const rows = readJson(rowsFile, [])

    const index = buildArchiveIndex(profileId, board, rows)
    const basic = await tmdbGet(`/${mediaType}/${tmdbId}`, { language: 'tr-TR' }, apiKey)
    if (!basic) return res.status(502).json({ error: 'TMDB bilgisi alınamadı' })
    const card = toCard(basic, mediaType)
    if (index.has(card)) return res.status(409).json({ error: `"${card.title}" zaten arşivinde var.` })

    const values = {}
    const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
    if (titleProp) values[titleProp.id] = card.title || card.originalTitle

    const statusKey = status === 'izlendi' ? 'izlendi' : 'izlenecek'
    const durumProp = resolveRole(board, 'durum')
    const statusOpt = ensureStatusOption(board, statusKey, makeId)
    if (durumProp && statusOpt) values[durumProp.id] = statusOpt

    if (statusKey === 'izlendi') {
      const date = typeof watchedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(watchedDate) ? watchedDate : null
      if (date) {
        const dateProp = ensureRole(board, 'izlemeTarihi', makeId)
        if (dateProp) values[dateProp.id] = dateProp.type === 'multidate' ? [date] : date
      }
      if (typeof rating === 'number' && rating >= 0 && rating <= 10) {
        const puanProp = resolveRole(board, 'puan')
        if (puanProp) {
          // Kriterli puanda tek bir genel puan girildi — tüm kriterlere aynı değer yazılıyor
          // (ortalaması zaten o puan olur); hiç kriter yoksa "Genel" diye bir tane açılıyor.
          if (!puanProp.criteria || puanProp.criteria.length === 0) puanProp.criteria = [{ id: makeId(), name: 'Genel' }]
          values[puanProp.id] = Object.fromEntries(puanProp.criteria.map((c) => [c.id, rating]))
        }
      }
    }

    const now = Date.now()
    const row = { id: makeId(), values, createdAt: now, updatedAt: now }
    rows.push(row)
    writeJson(boardsFile, boards)
    writeJson(rowsFile, rows)

    const fill = await fillRowFromTmdb(profileId, boardId, row.id, { exclude, forced: { tmdbId, mediaType } })
    res.json({ ok: true, rowId: row.id, title: card.title, filled: fill.status === 200 })
  } catch (e) {
    console.error('tmdb-add hata:', e)
    res.status(500).json({ error: 'İçerik eklenemedi' })
  }
})

app.get('/api/profiles/:profileId/tmdb-genres', async (req, res) => {
  const apiKey = readProfileApiKey(req.params.profileId)
  if (!apiKey) return res.json({ needsApiKey: true, genres: [] })
  const type = req.query.type === 'tv' ? 'tv' : 'movie'
  const data = await tmdbGet(`/genre/${type}/list`, { language: 'tr-TR' }, apiKey)
  res.json({ genres: (data?.genres ?? []).map((g) => ({ id: g.id, name: g.name })) })
})

// Keşfet: seçilen tür(ler)de, arşivde OLMAYAN ve daha önce "istemiyorum" denmemiş içerikler.
app.post('/api/profiles/:profileId/tmdb-discover/:boardId', async (req, res) => {
  try {
    const { profileId, boardId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.status(400).json({ error: 'Önce Ayarlar → Veritabanı → API sekmesinden bir TMDB API anahtarı girmelisin.' })
    const loaded = loadBoardAndRows(profileId, boardId)
    if (!loaded) return res.status(404).json({ error: 'Arşiv bulunamadı' })

    const type = req.body?.type === 'tv' ? 'tv' : 'movie'
    const genreIds = Array.isArray(req.body?.genreIds) ? req.body.genreIds.filter((n) => Number.isInteger(n)) : []
    const count = Math.max(1, Math.min(40, Number(req.body?.count) || 10))
    const sort = ['popular', 'top', 'new'].includes(req.body?.sort) ? req.body.sort : 'popular'

    const params = { language: 'tr-TR', include_adult: 'false', 'vote_count.gte': sort === 'top' ? 300 : 50 }
    if (genreIds.length) params.with_genres = genreIds.join(',')
    params.sort_by = sort === 'top' ? 'vote_average.desc' : sort === 'new' ? (type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc') : 'popularity.desc'
    if (sort === 'new') {
      // "Yeni" = son iki yılda çıkmış ve bugüne kadar yayınlanmış (henüz çıkmamışlar değil).
      const today = new Date().toISOString().slice(0, 10)
      const twoYearsAgo = new Date(Date.now() - 2 * 365 * 864e5).toISOString().slice(0, 10)
      if (type === 'tv') {
        params['first_air_date.gte'] = twoYearsAgo
        params['first_air_date.lte'] = today
      } else {
        params['primary_release_date.gte'] = twoYearsAgo
        params['primary_release_date.lte'] = today
      }
    }

    const index = buildArchiveIndex(profileId, loaded.board, loaded.rows)
    const dismissed = new Set(readJson(profileDismissedFile(profileId), []))
    const out = []
    const seen = new Set()
    // random: Ne İzlesem her tıklamada hep aynı en popüler içerikleri göstermesin diye sonuçlar
    // ilk 25 sayfa içinden rastgele sırayla seçilen sayfalardan toplanıyor.
    let pages = Array.from({ length: 15 }, (_, i) => i + 1)
    if (req.body?.random) {
      const first = await tmdbGet(`/discover/${type}`, { ...params, page: 1 }, apiKey)
      const total = Math.max(1, Math.min(25, first?.total_pages ?? 1))
      pages = Array.from({ length: total }, (_, i) => i + 1).sort(() => Math.random() - 0.5)
    }
    for (const page of pages) {
      if (out.length >= count) break
      const data = await tmdbGet(`/discover/${type}`, { ...params, page }, apiKey)
      const results = data?.results ?? []
      for (const r of results) {
        const card = toCard(r, type)
        const key = tmdbKey(card.mediaType, card.tmdbId)
        if (seen.has(key) || dismissed.has(key) || index.has(card)) continue
        seen.add(key)
        out.push(card)
        if (out.length >= count) break
      }
      if (!req.body?.random && page >= (data?.total_pages ?? 0)) break
    }
    res.json({ items: out })
  } catch (e) {
    console.error('tmdb-discover hata:', e)
    res.status(500).json({ error: 'Keşfet sonuçları alınamadı' })
  }
})

// Arşivde OLMAYAN tek bir TMDB içeriğinin önizlemesi (Ne İzlesem'in TMDB modunda kazanan için):
// türler, süre/sezon, Türkiye'deki platformlar ve arşivde olup olmadığı.
app.get('/api/profiles/:profileId/tmdb-item/:boardId/:mediaType/:tmdbId', async (req, res) => {
  try {
    const { profileId, boardId, mediaType, tmdbId } = req.params
    if (mediaType !== 'movie' && mediaType !== 'tv') return res.status(400).json({ error: 'Geçersiz içerik' })
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.status(400).json({ error: 'TMDB API anahtarı gerekli' })
    const [d, prov, trailer] = await Promise.all([
      tmdbGet(`/${mediaType}/${tmdbId}`, { language: 'tr-TR', append_to_response: 'images', include_image_language: 'tr,en,null' }, apiKey),
      tmdbGet(`/${mediaType}/${tmdbId}/watch/providers`, {}, apiKey),
      getTrailerUrl(mediaType, tmdbId, apiKey).catch(() => null),
    ])
    if (!d) return res.status(404).json({ error: 'İçerik bulunamadı' })
    const card = toCard(d, mediaType)
    // Arşivdeki detay penceresiyle aynı görünüm için: büyük yatay görsel, başlık logosu (Kapak
    // Adı) ve fragman.
    const logo = pickLogo(d.images)
    const loaded = loadBoardAndRows(profileId, boardId)
    const tr = prov?.results?.TR
    res.json({
      ...card,
      backdrop: d.backdrop_path ? `${TMDB_IMG_BASE}/w1280${d.backdrop_path}` : card.backdrop,
      logo: logo ? `${TMDB_IMG_BASE}/w500${logo.file_path}` : null,
      trailer: trailer ?? null,
      inArchive: loaded ? buildArchiveIndex(profileId, loaded.board, loaded.rows).has(card) : false,
      genres: (d.genres ?? []).map((g) => g.name),
      runtime: mediaType === 'movie' ? d.runtime ?? null : null,
      seasons: mediaType === 'tv' ? d.number_of_seasons ?? null : null,
      providers: tr
        ? {
            link: tr.link ?? null,
            flatrate: mapProviders(tr.flatrate),
            free: mapProviders([...(tr.free ?? []), ...(tr.ads ?? [])]),
            rent: mapProviders(tr.rent),
            buy: mapProviders(tr.buy),
          }
        : null,
    })
  } catch (e) {
    console.error('tmdb-item hata:', e)
    res.status(500).json({ error: 'İçerik bilgisi alınamadı' })
  }
})

app.post('/api/profiles/:profileId/tmdb-dismiss', (req, res) => {
  const { tmdbId, mediaType } = req.body ?? {}
  if (!tmdbId || !mediaType) return res.status(400).json({ error: 'Geçersiz içerik' })
  const file = profileDismissedFile(req.params.profileId)
  const list = readJson(file, [])
  const key = tmdbKey(mediaType, tmdbId)
  if (!list.includes(key)) list.push(key)
  writeJson(file, list)
  res.json({ ok: true, count: list.length })
})

app.get('/api/profiles/:profileId/tmdb-dismiss', (req, res) => {
  res.json({ count: readJson(profileDismissedFile(req.params.profileId), []).length })
})

app.delete('/api/profiles/:profileId/tmdb-dismiss', (req, res) => {
  writeJson(profileDismissedFile(req.params.profileId), [])
  res.json({ ok: true })
})

// Yeni bölümler: Durum'u "İzleniyor" olan dizilerde, yayınlanmış ama henüz izlenmemiş bölümler.
// TMDB'yi her ana sayfa açılışında yormamak için dizi başına sonuç birkaç saat bellekte tutuluyor.
const tvStatusCache = new Map()
const TV_CACHE_MS = 3 * 60 * 60 * 1000

async function getTvStatus(tmdbId, apiKey) {
  const cached = tvStatusCache.get(tmdbId)
  if (cached && Date.now() - cached.at < TV_CACHE_MS) return cached.data
  const d = await tmdbGet(`/tv/${tmdbId}`, { language: 'tr-TR' }, apiKey)
  if (!d) return null
  const data = {
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

app.get('/api/profiles/:profileId/new-episodes/:boardId', async (req, res) => {
  try {
    const { profileId, boardId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ items: [] })
    const loaded = loadBoardAndRows(profileId, boardId)
    if (!loaded) return res.json({ items: [] })
    const { board, rows } = loaded
    const durumProp = resolveRole(board, 'durum')
    const izleniyor = resolveStatusOption(board, 'izleniyor')
    if (!durumProp || !izleniyor) return res.json({ items: [] })

    const watched = readJson(profileWatchedFile(profileId), {})
    const items = []
    for (const row of rows.filter((r) => r.values[durumProp.id] === izleniyor)) {
      const ref = await ensureTmdbRef(profileId, board, row, apiKey)
      if (!ref || ref.mediaType !== 'tv') continue
      const st = await getTvStatus(ref.id, apiKey)
      if (!st?.last) continue
      // Yayınlanmış bölümler: son yayınlanan bölüme kadar her şey.
      const aired = []
      for (const s of st.seasons) {
        if (s.season > st.last.season) continue
        const upTo = s.season === st.last.season ? st.last.episode : s.count
        for (let e = 1; e <= upTo; e++) aired.push(`${s.season}-${e}`)
      }
      const seen = watched[row.id] ?? {}
      // Bölüm bölüm takip edilmeyen (hiç bölüm işaretlenmemiş) dizilerde "85 izlenmemiş bölüm"
      // demek anlamsız — onlarda sadece son 14 günde yeni bölüm çıktıysa ya da önümüzdeki 7 gün
      // içinde çıkacaksa gösteriliyor. Takip edilenlerde izlenmemiş bölüm sayısı veriliyor.
      const tracking = Object.values(seen).some((d) => d?.length > 0)
      const latestKey = `${st.last.season}-${st.last.episode}`
      const latestWatched = seen[latestKey]?.length > 0
      const today = new Date().toISOString().slice(0, 10)
      const daysFrom = (iso) => (iso ? Math.round((Date.parse(iso) - Date.parse(today)) / 864e5) : null)
      const sinceLatest = daysFrom(st.last.airDate)
      const untilNext = st.next ? daysFrom(st.next.airDate) : null
      const recentNew = !latestWatched && sinceLatest !== null && sinceLatest >= -14
      const soon = untilNext !== null && untilNext >= 0 && untilNext <= 7
      const unwatched = tracking ? aired.filter((k) => !(seen[k]?.length > 0)) : []
      if (!(tracking ? unwatched.length > 0 || soon : recentNew || soon)) continue
      const next = unwatched[0]?.split('-').map(Number)
      items.push({
        rowId: row.id,
        tracking,
        unwatchedCount: unwatched.length,
        nextToWatch: next ? { season: next[0], episode: next[1] } : null,
        latest: st.last,
        latestIsNew: recentNew,
        upcoming: soon ? st.next : null,
      })
    }
    // En yeni yayınlanan bölüm en üstte.
    items.sort((a, b) => (b.latest.airDate || '').localeCompare(a.latest.airDate || ''))
    res.json({ items })
  } catch (e) {
    console.error('new-episodes hata:', e)
    res.json({ items: [] })
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
// güncellensin istedi. Kodu hemen çeker, yanıtı gönderir, sonra eski ARGUS'u kapatıp yerine
// yenisini başlatır (ayrıntılar ve neden iki kademeli olduğu: bkz. restart.js). Yanıt MUTLAKA
// süreç kapanmadan ÖNCE gönderiliyor, yoksa tarayıcı hiç cevap alamaz.
app.post('/api/apply-update', (req, res) => {
  try {
    if (fs.existsSync(path.join(ROOT, '.gelistirici'))) {
      execSync('git pull --ff-only', { cwd: ROOT, timeout: 15000, stdio: 'ignore' })
    } else {
      execSync('git fetch --quiet origin', { cwd: ROOT, timeout: 15000, stdio: 'ignore' })
      execSync('git reset --hard --quiet @{u}', { cwd: ROOT, timeout: 15000, stdio: 'ignore' })
    }
  } catch {
    return res.status(500).json({ error: 'Güncelleme çekilemedi — internet bağlantını kontrol et.' })
  }
  // ARGUS.bat bu dosyayı app/ klasörüne yazıyor ("ARGUS Durdur.bat" da oradan okuyor). Eskiden
  // burada app/server/ içinde aranıyordu — hiç bulunamadığı için eski ARGUS hiç kapatılmıyor,
  // yeni sunucu port dolu olduğu için başlayamıyor ve eski sunucu kodu çalışmaya devam ediyordu.
  const pidFile = path.join(__dirname, '..', 'argus-pid.txt')
  let oldPid = null
  try {
    if (fs.existsSync(pidFile)) oldPid = fs.readFileSync(pidFile, 'utf-8').trim()
  } catch {}

  res.json({ ok: true })

  try {
    launchDetachedRestart(buildRestartScript({ oldPid, batPath: path.join(ROOT, 'ARGUS.bat'), root: ROOT }), ROOT)
  } catch {}
})

const PORT = Number(process.env.PORT) || 4000
app.listen(PORT, () => {
  console.log(`ARGUS yerel sunucusu çalışıyor: http://localhost:${PORT}`)
  console.log(`Veriler: ${DATA_DIR}`)
  console.log(`Medya: ${MEDYA_DIR}`)
})
