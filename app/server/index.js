// ARGUS'un kendi bilgisayarında çalışan yerel sunucusu.
// Firebase yerine geçer: tüm veriler ARGUS klasörünün içindeki data/ klasöründe
// gerçek .json dosyaları olarak, görseller/videolar ise medya/ klasöründe
// gerçek dosyalar olarak durur. İnternete açık değildir, sadece bu bilgisayardan erişilir.

import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..') // app/server -> ARGUS
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

// ---- Profil başına veri ----
// Her profilin (Netflix'teki "kim izliyor" gibi) kendi board/satır/ayar/kadro/bölüm
// verisi vardır — data/profiles/<profileId>/ altında, tıpkı eski tek-profilli data/
// klasörünün bir kopyası gibi. Böylece boş bir test profili açıp gerçek verilere hiç
// dokunmadan denemeler yapılabilir.
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
// cast.json/episodes.json'un aksine bu TAMAMEN kullanıcı girdisi (RowDetailModal'daki bölüm
// tikleri) — salt-okunur değil, GET/PUT ikisi de var. { [rowId]: { [bölümAnahtarı]: ISO
// tarih dizisi } }
function profileWatchedFile(profileId) {
  return path.join(profileDir(profileId), 'watched.json')
}
function profileRowsFile(profileId, boardId) {
  return path.join(profileDir(profileId), 'rows', `${boardId}.json`)
}
// Kullanıcının kendi oluşturduğu şablonlar (bkz. Ayarlar → Veritabanı → Şablonlar) — sadece
// sütun yapısı, satır/veri yok. Uygulamayla gelen "Medya Arşivi" şablonu burada YOK, o hiç
// sunucuya yazılmaz, frontend'de types.ts'teki builtinMediaTemplate() ile her seferinde üretilir.
function profileTemplatesFile(profileId) {
  return path.join(profileDir(profileId), 'templates.json')
}
// Her profilin kendi TMDB API anahtarı (Ayarlar → Veritabanı → API sekmesinden girilir) —
// uygulama artık sadece geliştiricinin kendi anahtarıyla çalışmıyor, her profil/kullanıcı
// kendi ücretsiz TMDB anahtarını girmek zorunda (bkz. aşağıdaki tek seferlik göç notu).
function profileApiKeyFile(profileId) {
  return path.join(profileDir(profileId), 'api-key.json')
}
function readProfileApiKey(profileId) {
  const data = readJson(profileApiKeyFile(profileId), null)
  return (data?.tmdbApiKey || '').trim()
}

// profile.json eskiden tek bir { username, photo } nesnesiydi — ilk okumada listeye göçürülür.
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

// Çok-profilli yapıya geçmeden önceki tek-profilli data/boards.json + data/rows/ + ...
// varsa, ilk profile (profile.json'daki ilk kayıt) taşınır — kullanıcının gerçek arşivi
// kaybolmaz, sadece artık o profilin kendi klasörüne ait olur. Tek seferlik, sunucu her
// açıldığında kontrol edilir ama hedef klasör zaten varsa hiçbir şey yapmaz.
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

// TMDB anahtarı eskiden kod içine gömülüydü (tek kullanıcı, geliştiricinin kendi anahtarı) —
// artık her profil kendi anahtarını girmek zorunda (uygulamayı başkalarının da kullanabilmesi
// için, bkz. Ayarlar → Veritabanı → API). Zaten arşivi olan (gerçekten kullanılan) profiller bu
// değişiklikle aniden bozulmasın diye, henüz kendi anahtarı olmayan ama en az bir arşivi zaten
// var olan profillere, TEK SEFERLİK, eski gömülü anahtar otomatik yazılır — sonradan eklenecek
// yeni/boş profiller bu göçe girmez, onlar kendi anahtarlarını girmek zorunda.
const LEGACY_SHARED_TMDB_KEY = 'aed6863a2ea912a4a7a961e41da4a58a'
function seedExistingProfilesWithLegacyApiKey() {
  if (!fs.existsSync(PROFILES_DIR)) return
  for (const entry of fs.readdirSync(PROFILES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const profileId = entry.name
    if (fs.existsSync(profileApiKeyFile(profileId))) continue
    const boards = readJson(profileBoardsFile(profileId), [])
    if (boards.length === 0) continue
    writeJson(profileApiKeyFile(profileId), { tmdbApiKey: LEGACY_SHARED_TMDB_KEY })
  }
}
seedExistingProfilesWithLegacyApiKey()

const app = express()
app.use(cors())
app.use(express.json({ limit: '15mb' }))
app.use('/medya', express.static(MEDYA_DIR))

// ---- Boards (profile başına) ----

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
  } catch {
    // zaten yoktu, sorun değil
  }
  res.json({ ok: true })
})

// ---- Rows (profile başına) ----

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

// ---- Kullanıcı şablonları (profile başına) ----

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

// ---- Profiller (Netflix'teki "kim izliyor" gibi, birden fazla profil) ----

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

// Bir profil silindiğinde klasörü GERÇEKTEN silmek yerine `data/profiller_silinen/` altına
// taşıyoruz — yanlışlıkla (ya da deneme yaparken) kendi gerçek profilini silen biri, verisini
// tamamen kaybetmesin diye. Aynı isimle iki kez silinirse (aynı id tekrar oluşturulup tekrar
// silinirse) üzerine yazmasın diye hedef klasör adına zaman damgası ekleniyor — `fs.renameSync`
// aynı disk içinde anlık ve verisiz kayıp olmadan çalışır, 38MB'lık bir profilde bile önemli
// değil. Kalıcı olarak temizlemek istenirse bu klasör elle silinebilir; otomatik bir
// süpürme/expiry burada bilerek yok (aynı ".bak_<timestamp>" felsefesi, bkz. argus-feedback).
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

// ---- TMDB API anahtarı (profile başına) ----
// bkz. yukarıdaki seedExistingProfilesWithLegacyApiKey — her profil kendi anahtarını girer,
// girilmemişse 🔄 (TMDB'den doldur) uç noktası 400 döner.

app.get('/api/profiles/:profileId/api-key', (req, res) => {
  res.json({ tmdbApiKey: readProfileApiKey(req.params.profileId) })
})

app.put('/api/profiles/:profileId/api-key', (req, res) => {
  writeJson(profileApiKeyFile(req.params.profileId), { tmdbApiKey: (req.body?.tmdbApiKey || '').trim() })
  res.json({ ok: true })
})

// ---- Ana Sayfa ayarları (profile başına) ----

app.get('/api/profiles/:profileId/home-settings', (req, res) => {
  res.json(readJson(profileHomeSettingsFile(req.params.profileId), null))
})

app.put('/api/profiles/:profileId/home-settings', (req, res) => {
  writeJson(profileHomeSettingsFile(req.params.profileId), req.body)
  res.json({ ok: true })
})

// TMDB'den çekilen "hangi kayıtta hangi oyuncu hangi rolde oynadı" verisi (profile başına) —
// board/row şemasının bir parçası değil, scripts/fetch_tmdb.py tarafından yazılan
// salt-okunur bir zenginleştirme katmanı. Kayıt id'sine göre: { [rowId]: [{ optionId, character }] }
app.get('/api/profiles/:profileId/cast', (req, res) => {
  res.json(readJson(profileCastFile(req.params.profileId), {}))
})

// TMDB'den çekilen sezon/bölüm verisi (profile başına) — cast.json ile aynı mantık,
// salt-okunur, scripts/enrich_details.py tarafından yazılır. { [rowId]: Season[] }
app.get('/api/profiles/:profileId/episodes', (req, res) => {
  res.json(readJson(profileEpisodesFile(req.params.profileId), {}))
})

// Bölüm bazlı izleme kaydı — TAMAMEN kullanıcı girdisi, PUT bir kaydın TÜM bölüm/tarih
// haritasını (isteğin body'si) baştan yazar, tek tek bölüm eklemez/çıkarmaz — frontend
// (hooks/useWatched.ts) her tik/tekrar-izleme değişikliğinde o satırın güncel haritasının
// tamamını gönderir, aynı satırın kendi `values`'ını PUT ile güncellemesiyle aynı desen.
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

// ---- TMDB'den doldur / yenile ----
// scripts/*.py toplu (tüm board) tarama içindi; bu uç nokta kullanıcı tablo satırındaki
// 🔄 butonuna bastığında SADECE o kayıt için TMDB'yi sorgular — ARGUS'un geri kalanı
// internetsiz çalışmaya devam eder, sadece bu tıklama anında dışarı çıkar. Sadece Türkçe
// Adı (ve varsa Orjinal Adı) doluyken çağrılabilir: yeni eklenmiş, başka hiçbir alanı
// doldurulmamış bir kayıtta bile film/dizi olduğunu TMDB'den bulup gerisini (poster,
// banner, ülke, yönetmen, sinopsis, oyuncular, diziyse sezon/bölüm) doldurur — sadece
// kullanıcının kendi dolduracağı Durum/Puan/İzleme Tarihi'ne hiç dokunmaz, ve halihazırda
// dolu olan hiçbir alanın da üzerine yazmaz (Oyuncular/kadro ve sezon/bölüm hariç, onlar
// her çağrıda güncellenir — devam eden bir dizinin yeni bölümünü/oyuncusunu yakalamak için).

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p'
const TR_MONTHS = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// scripts/enrich_details.py'daki ISO_TO_TR ile aynı liste — var olan Ülke seçenekleriyle
// aynı Türkçe isimle eşleşsin diye (yoksa İngilizce isimle gereksiz bir kopya oluşturur).
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

// Node'un yerleşik fetch'inde Python'daki requests.Session + urllib3 Retry gibi otomatik
// bir tekrar deneme yok — TMDB'ye art arda çok sayıda istek attığımız bu uç noktada tek
// bir geçici ağ kopması (ECONNRESET vb.) tüm tıklamayı boşa çıkarmasın diye burada elle
// artan bekleme süreli (exponential backoff) birkaç deneme yapıyoruz.
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

// Kategori henüz boşsa ya da film/dizi olduğu belirsizse: TMDB'nin film+dizi+kişi
// karışık arama uç noktasıyla türünü kendisi bulsun.
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

// Resmi fragmanlar önce, sonra gerisi — TEK bir en iyi aday değil, sırayla denenecek bir liste
// döndürüyor artık (bkz. getTrailerUrl): TMDB'nin "fragman" dediği bir YouTube videosu gerçekte
// kaldırılmış/gizli olabiliyor, tek adaya güvenip "video kullanılamıyor" bir linki kaydetmemek
// için birden fazla adayı sırayla deneyebilmemiz gerekiyor.
function rankTrailers(results) {
  const trailers = (results ?? []).filter((v) => v.site === 'YouTube' && v.type === 'Trailer')
  const official = trailers.filter((v) => v.official)
  const rest = trailers.filter((v) => !v.official)
  return [...official, ...rest]
}

// YouTube'un anahtarsız oEmbed uç noktası — video gerçekten oynatılabilir mi (silinmemiş,
// gizli değil, bölge kısıtlı değil) diye TEK istekte kontrol eder, ayrı bir YouTube API
// anahtarı gerektirmez. Kısa zaman aşımı/tek deneme yeterli: bu sadece bir canlılık kontrolü,
// başarısız olursa sıradaki adaya geçilecek, uzun uzun beklemenin bir faydası yok.
async function isYoutubeVideoAvailable(videoKey) {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoKey}`)}&format=json`
    const res = await fetchWithRetry(url, undefined, 1)
    return res.ok
  } catch {
    return false
  }
}

// Önce Türkçe altyazılı/dublajlı adayları, bulunamaz/hiçbiri oynatılamazsa TMDB'nin varsayılan
// (genelde İngilizce) adaylarını dener — her aday oEmbed ile doğrulanır, ilk gerçekten
// oynatılabilir olan kaydedilir; hiçbiri çalışmıyorsa `video` alanına hiç dokunulmaz (kırık bir
// link kaydetmektense boş bırakmak tercih edildi).
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

// TMDB'nin görsel setinden en uygun "başlık görseli" (logo, PNG, saydam arka plan) — önce
// Türkçe, yoksa İngilizce, yoksa dilsiz/sembol logo. `details.images` için detay isteğine
// `include_image_language=tr,en,null` eklenmesi gerekir (yoksa sadece istekteki `language`'a
// uyan görseller döner, ki bu çoğu yapımda sıfır Türkçe logo demek).
function pickLogo(images) {
  const logos = images?.logos ?? []
  if (logos.length === 0) return null
  return logos.find((l) => l.iso_639_1 === 'tr') ?? logos.find((l) => l.iso_639_1 === 'en') ?? logos[0]
}

// Önce Türkiye (TR) sertifikasını dener, yoksa ABD (US) sertifikasına düşer.
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
    // Frontend'deki "API'den hangi alanlar çekilsin" ayarı (bkz. BoardView.tsx'teki dişli
    // ikonu) burada bir dışlama listesi olarak geliyor — kullanıcı bir alanı kapattıysa o
    // blok hiç çalışmıyor, alan boş bile olsa dokunulmuyor.
    const exclude = new Set(Array.isArray(req.body?.exclude) ? req.body.exclude : [])
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
    if (!titleTr && !titleOrig) return res.status(400).json({ error: 'Önce bir başlık yazmalısın' })

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
    if (!result) return res.status(404).json({ error: 'TMDB eşleşmesi bulunamadı' })

    // `include_image_language` olmadan `images` sadece istekteki `language`e (tr-TR) uyan
    // görselleri döndürür — çoğu yapımda sıfır Türkçe logo demek olurdu, o yüzden Kapak Adı
    // (logo) için İngilizce ve dilsiz/sembol logoları da havuza dahil ediyoruz (bkz. pickLogo).
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

    // --- Kategori (boşsa) ---
    if (kategoriProp && !kategoriId && !exclude.has('kategori')) {
      const wantLabel = mediaType === 'tv' ? 'Dizi' : 'Film'
      const opt = kategoriProp.options?.find((o) => o.label === wantLabel)
      if (opt) {
        row.values[kategoriProp.id] = opt.id
        filled.push('Kategori')
      }
    }

    // --- Orjinal Adı (boşsa) ---
    if (origProp && !titleOrig && !exclude.has('orjinalAdi')) {
      const orig = mediaType === 'tv' ? details.original_name : details.original_title
      if (orig) {
        row.values[origProp.id] = orig
        filled.push('Orjinal Adı')
      }
    }

    // --- Vizyon Tarihi (boşsa) ---
    if (vizyonProp && !row.values[vizyonProp.id] && !exclude.has('vizyonTarihi')) {
      const date = mediaType === 'tv' ? details.first_air_date : details.release_date
      if (date) {
        row.values[vizyonProp.id] = date
        filled.push('Vizyon Tarihi')
      }
    }

    // --- Sinopsis (boşsa) ---
    if (sinopsisProp && !row.values[sinopsisProp.id] && details.overview && !exclude.has('sinopsis')) {
      row.values[sinopsisProp.id] = details.overview
      filled.push('Sinopsis')
    }

    // --- Poster (boşsa) ---
    if (posterProp && !row.values[posterProp.id] && details.poster_path && !exclude.has('poster')) {
      const filename = `tmdb_poster_${row.id}.jpg`
      if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w500${details.poster_path}`, path.join(MEDYA_DIR, filename))) {
        row.values[posterProp.id] = `/medya/${filename}`
        filled.push('Poster')
      }
    }

    // --- Banner (boşsa) ---
    if (bannerProp && !row.values[bannerProp.id] && details.backdrop_path && !exclude.has('banner')) {
      const filename = `tmdb_backdrop_${row.id}.jpg`
      if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w1280${details.backdrop_path}`, path.join(MEDYA_DIR, filename))) {
        row.values[bannerProp.id] = `/medya/${filename}`
        filled.push('Banner')
      }
    }

    // --- Kapak Adı / başlık logosu (boşsa) ---
    if (kapakAdiProp && !row.values[kapakAdiProp.id] && !exclude.has('kapakAdi')) {
      const logo = pickLogo(details.images)
      if (logo) {
        const filename = `tmdb_logo_${row.id}.png`
        if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w500${logo.file_path}`, path.join(MEDYA_DIR, filename))) {
          row.values[kapakAdiProp.id] = `/medya/${filename}`
          filled.push('Kapak Adı')
        }
      }
    }

    // --- Tür (boşsa) ---
    if (turProp && (!Array.isArray(row.values[turProp.id]) || row.values[turProp.id].length === 0) && !exclude.has('tur')) {
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

    // --- Ülke (boşsa) ---
    if (ulkeProp && (!Array.isArray(row.values[ulkeProp.id]) || row.values[ulkeProp.id].length === 0) && !exclude.has('ulke')) {
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

    // --- Yönetmen (boşsa) ---
    if (yonetmenProp && !(row.values[yonetmenProp.id] ?? '').trim() && !exclude.has('yonetmen')) {
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

    // --- Süre (sadece film, boşsa) ---
    if (mediaType === 'movie' && sureProp && !row.values[sureProp.id] && details.runtime && !exclude.has('sure')) {
      row.values[sureProp.id] = details.runtime
      filled.push('Süre')
    }

    // --- Yaş Sınırı (boşsa) ---
    if (yasProp && !(row.values[yasProp.id] ?? '').trim() && !exclude.has('yasSiniri')) {
      const cert = mediaType === 'movie' ? await getMovieCertification(result.id, apiKey) : await getTvCertification(result.id, apiKey)
      if (cert) {
        row.values[yasProp.id] = cert
        filled.push('Yaş Sınırı')
      }
    }

    // --- Fragman (boşsa) ---
    if (videoProp && !(row.values[videoProp.id] ?? '').trim() && !exclude.has('video')) {
      const trailerUrl = await getTrailerUrl(mediaType, result.id, apiKey)
      if (trailerUrl) {
        row.values[videoProp.id] = trailerUrl
        filled.push('video')
      }
    }

    // --- Sezon/bölüm listesi (sadece dizi, her zaman güncellenir) ---
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

    // --- Kadro (her zaman güncellenir: yeni oyuncu/bölüm sayısı yakalamak için) ---
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

// ---- Medya (görsel/video) klasörü ----

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
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB (video için)
})

app.post('/api/medya/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya gelmedi' })
  res.json({ filename: req.file.filename })
})

// ---- Güncelleme kontrolü ----
// ARGUS klasörü bir git deposuysa (ARGUS.bat ile klonlanmışsa) uzak depoda yeni
// commit'ler var mı diye bakar — kullanıcı uygulama AÇIKKEN de bir güncelleme çıkarsa haberdar
// olsun istedi. Kod kendi kendini çalışırken değiştirip yeniden başlatmıyor (bu ortasında bir şey
// yapan birini keserdi) — sadece haber veriyor, gerçek güncelleme bir sonraki açılışta
// ARGUS.bat'ın kendi `git pull`'ıyla uygulanıyor. Git kurulu değilse/depo değilse/
// internet yoksa sessizce "güncelleme yok" döner, hiçbir zaman hata fırlatmaz.
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

const PORT = 4000
app.listen(PORT, () => {
  console.log(`ARGUS yerel sunucusu çalışıyor: http://localhost:${PORT}`)
  console.log(`Veriler: ${DATA_DIR}`)
  console.log(`Medya: ${MEDYA_DIR}`)
})
