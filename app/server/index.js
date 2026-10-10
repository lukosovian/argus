import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, execSync } from 'node:child_process'
import { ensureRole, ensureStatusOption, resolveRole, resolveStatusOption } from './roles.js'
import { buildRestartScript, launchDetachedRestart } from './restart.js'
import { beforeWrite, findBoard as findBoardCached, initHistory, registerHistoryRoutes, setHistoryWriter } from './history.js'
import { initNotifications, pushNotification, registerNotificationRoutes } from './notifications.js'
import { initBackup, registerBackupRoutes } from './backup.js'
import { publishFile } from './featurePublish.js'
import { langDate, serverLang, serverRegion, stt, tmdbLang } from './lang.js'
import { COLUMN_NAMES, KIND_NAMES, isName, nameOf } from './names.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const DATA_DIR = path.join(ROOT, 'data')
const PROFILES_DIR = path.join(DATA_DIR, 'profiles')
const MEDYA_DIR = path.join(ROOT, 'medya')

for (const dir of [DATA_DIR, PROFILES_DIR, MEDYA_DIR]) fs.mkdirSync(dir, { recursive: true })

const PROFILE_FILE = path.join(DATA_DIR, 'profile.json')

// Var olduğu halde okunamayan dosyalar (bozuk ya da o an antivirüs/başka program kilitlemiş). Böyle bir
// dosya "boş" sayılıp okunduysa, o boş hali dosyanın üstüne YAZILMIYOR — yoksa bütün arşiv silinebilirdi.
// Dosya tekrar sağlıklı okununca yasak kalkıyor.
const unreadableFiles = new Set()

function readJson(file, fallback) {
  for (let attempt = 0; ; attempt++) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
      unreadableFiles.delete(file)
      return data
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        unreadableFiles.delete(file)
        return fallback
      }
      // Kısa süreli kilitler için birkaç kez kısa aralıkla yeniden dene.
      if (attempt < 4) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40)
        continue
      }
      unreadableFiles.add(file)
      console.error(`Dosya okunamadı (üzerine yazılmayacak): ${file} — ${e && e.message}`)
      return fallback
    }
  }
}

function assertWritable(file) {
  if (unreadableFiles.has(file)) {
    throw new Error(stt('{0} okunamadığı için kaydedilmedi — verin korunuyor. ARGUS\'u yeniden başlatıp tekrar dene.', path.basename(file)))
  }
}

// Önce geçici dosyaya yazıp sonra yerine koyuyoruz: yazma sırasında ARGUS kapanırsa (ör.
// "Şimdi Güncelle" ile yeniden başlarken) asıl dosya yarım kalmasın, eski hali sağlam dursun.
function writeJson(file, data) {
  assertWritable(file)
  // Arşiv geçmişi: kayıt/şema dosyasıysa eski haliyle karşılaştırıp değişiklikleri kaydeder (bkz. history.js).
  beforeWrite(file, data)
  rawWriteJson(file, data)
}

function rawWriteJson(file, data) {
  assertWritable(file)
  const text = JSON.stringify(data, null, 2)
  const tmp = `${file}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, text, 'utf-8')
    fs.renameSync(tmp, file)
  } catch {
    // Windows'ta dosya o an başka bir programda açıksa yer değiştirme reddedilebilir — eski yol.
    try {
      fs.unlinkSync(tmp)
    } catch {}
    fs.writeFileSync(file, text, 'utf-8')
  }
}

// Bilgisayarın kendi saatine göre bugünün tarihi ("YYYY-MM-DD"). toISOString dünya saatini (UTC) verir:
// Türkiye'de gece 00:00–03:00 arası bir önceki günü gösteriyordu.
function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
function profileSongsFile(profileId) {
  return path.join(profileDir(profileId), 'songs.json')
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

// Beklenmedik bir hata (ör. yukarıdaki "okunamadı, kaydedilmedi") sunucuyu kapatmasın.
process.on('unhandledRejection', (e) => console.error('Hata:', e))

const app = express()
// Sadece ARGUS'un kendi arayüzü (bu bilgisayardaki localhost) erişebilsin. Eskiden herkese açıktı:
// ARGUS açıkken tarayıcıda açılan herhangi bir site arka planda kayıt silebilirdi; ağdaki başka bir
// cihaz da ulaşabilirdi.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (!LOCAL_HOST.test(req.headers.host || '') || (origin && !LOCAL_ORIGIN.test(origin))) {
    return res.status(403).json({ error: stt('Bu adresten ARGUS\'a erişilemez.') })
  }
  next()
})
app.use(cors({ origin: LOCAL_ORIGIN }))
app.use(express.json({ limit: '15mb' }))
app.use('/medya', express.static(MEDYA_DIR))

initHistory({ dataDir: DATA_DIR, profilesDir: PROFILES_DIR, readJson, rawWrite: rawWriteJson, makeId })
setHistoryWriter(writeJson)
registerHistoryRoutes(app)
initNotifications({ profilesDir: PROFILES_DIR, readJson, writeJson, makeId })
registerNotificationRoutes(app)
initBackup({ dataDir: DATA_DIR, medyaDir: MEDYA_DIR, root: ROOT, readJson, writeJson: rawWriteJson })
registerBackupRoutes(app)

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
  if (idx === -1) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
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
  if (!board) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
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
  res.json({ brokenImages, duplicates: findDuplicateGroups(req.params.profileId, board, rows) })
})

// Mükerrer kayıtlar (Sağlık Kontrolü). Kullanıcı "şimdiye kadar mükerrerleri sen bakıp söyledin, sağlık
// kontrolünde toplu görebileyim" dedi. İki kayıt aynı içerik sayılır: aynı TMDB içeriğine bağlılarsa ya
// da adları tutuyorsa (Türkçe adı / orijinal adı, çapraz da: birinin Türkçe adına İngilizcesi yazılmış
// olabilir). Ad eşleşmesinde yeniden çekimler (Dune 1984 / 2021) ve aynı adlı film/dizi (Fargo) karışmasın
// diye TMDB kimlikleri, vizyon yılları ya da Kategori'leri ikisinde de dolu ve farklıysa sayılmaz.
// "Bunlar farklı" denen çiftler board.duplicateIgnore'da ("a|b", küçük id önce).
function findDuplicateGroups(profileId, board, rows) {
  const refs = readJson(profileTmdbFile(profileId), {})
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const origProp = resolveRole(board, 'orjinalAdi')
  const vizyonProp = resolveRole(board, 'vizyon')
  const kategoriProp = resolveRole(board, 'kategori')
  const ignored = new Set(board.duplicateIgnore ?? [])
  const info = rows.map((row) => {
    const names = new Set()
    for (const p of [titleProp, origProp]) {
      const v = p ? row.values[p.id] : null
      if (typeof v === 'string' && normalizeText(v)) names.add(normalizeText(v))
    }
    const ref = refs[row.id]
    const y = vizyonProp ? row.values[vizyonProp.id] : null
    return {
      row,
      names,
      key: ref ? tmdbKey(ref.mediaType, ref.id) : null,
      year: typeof y === 'string' && /^d{4}/.test(y) ? y.slice(0, 4) : null,
      kategori: kategoriProp ? row.values[kategoriProp.id] || null : null,
    }
  })
  const parent = new Map(rows.map((r) => [r.id, r.id]))
  const find = (id) => (parent.get(id) === id ? id : find(parent.get(id)))
  const reasons = new Map()
  const link = (a, b, reason) => {
    const pair = a.row.id < b.row.id ? `${a.row.id}|${b.row.id}` : `${b.row.id}|${a.row.id}`
    if (ignored.has(pair)) return
    const ra = find(a.row.id)
    const rb = find(b.row.id)
    if (ra !== rb) parent.set(ra, rb)
    reasons.set(a.row.id, reasons.get(a.row.id) === 'tmdb' ? 'tmdb' : reason)
    reasons.set(b.row.id, reasons.get(b.row.id) === 'tmdb' ? 'tmdb' : reason)
  }
  const byKey = new Map()
  const byName = new Map()
  for (const x of info) {
    if (x.key) {
      if (!byKey.has(x.key)) byKey.set(x.key, [])
      byKey.get(x.key).push(x)
    }
    for (const n of x.names) {
      if (!byName.has(n)) byName.set(n, [])
      byName.get(n).push(x)
    }
  }
  for (const list of byKey.values()) for (let i = 1; i < list.length; i++) link(list[0], list[i], 'tmdb')
  for (const list of byName.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        if (a.key && b.key && a.key !== b.key) continue
        if (a.year && b.year && a.year !== b.year) continue
        if (a.kategori && b.kategori && a.kategori !== b.kategori) continue
        link(a, b, 'ad')
      }
    }
  }
  const groups = new Map()
  for (const r of rows) {
    if (!reasons.has(r.id)) continue
    const root = find(r.id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(r.id)
  }
  return [...groups.values()].filter((ids) => ids.length > 1).map((ids) => ({ rowIds: ids }))
}

// Tablodaki kırmızı nokta için sadece mükerrer grupları (Sağlık Kontrolü'nün disk taraması olmadan).
app.get('/api/profiles/:profileId/boards/:id/duplicates', (req, res) => {
  const board = readJson(profileBoardsFile(req.params.profileId), []).find((b) => b.id === req.params.id)
  if (!board) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
  const rows = readJson(profileRowsFile(req.params.profileId, board.id), [])
  res.json({ duplicates: findDuplicateGroups(req.params.profileId, board, rows) })
})

// Mükerrerleri birleştirme: `keepId` kalır, `removeIds` silinir. Silinenlerde olup kalanda BOŞ olan her
// alan kalana aktarılır (izleme tarihleri birleştirilir); bölüm işaretleri, TMDB eşleşmesi, sezonlar ve
// kadro da kalanda yoksa taşınır — "bilgisi az olanı sil" derken hiçbir şey kaybolmasın.
app.post('/api/profiles/:profileId/boards/:id/merge-rows', (req, res) => {
  const { profileId, id: boardId } = req.params
  const { keepId, removeIds } = req.body ?? {}
  if (!keepId || !Array.isArray(removeIds) || removeIds.length === 0 || removeIds.includes(keepId)) {
    return res.status(400).json({ error: stt('Geçersiz birleştirme') })
  }
  const board = readJson(profileBoardsFile(profileId), []).find((b) => b.id === boardId)
  if (!board) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
  const rowsFile = profileRowsFile(profileId, boardId)
  const rows = readJson(rowsFile, [])
  const keep = rows.find((r) => r.id === keepId)
  const removed = removeIds.map((rid) => rows.find((r) => r.id === rid)).filter(Boolean)
  if (!keep || removed.length === 0) return res.status(404).json({ error: stt('Kayıt bulunamadı') })
  const empty = (v) =>
    v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const moved = new Set()
  for (const r of removed) {
    for (const [pid, v] of Object.entries(r.values ?? {})) {
      if (empty(v)) continue
      const cur = keep.values[pid]
      if (empty(cur)) {
        keep.values[pid] = v
        moved.add(pid)
      } else if (dateProp && pid === dateProp.id && Array.isArray(cur) && Array.isArray(v)) {
        const all = [...new Set([...cur, ...v])]
        if (all.length > cur.length) {
          keep.values[pid] = all.sort()
          moved.add(pid)
        }
      }
    }
  }
  keep.updatedAt = Date.now()
  for (const file of [profileTmdbFile(profileId), profileEpisodesFile(profileId), profileCastFile(profileId), profileWatchedFile(profileId)]) {
    const map = readJson(file, {})
    let changed = false
    for (const r of removed) {
      if (map[r.id] === undefined) continue
      if (map[keepId] === undefined) map[keepId] = map[r.id]
      delete map[r.id]
      changed = true
    }
    if (changed) writeJson(file, map)
  }
  const gone = new Set(removed.map((r) => r.id))
  writeJson(
    rowsFile,
    rows.filter((r) => !gone.has(r.id)),
  )
  res.json({ ok: true, row: keep, movedFields: board.properties.filter((p) => moved.has(p.id)).map((p) => p.name) })
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
  const before = idx === -1 ? null : rows[idx]
  let saved
  if (before && Array.isArray(req.body?._changed)) {
    // Arayüz sadece değiştirdiği sütunları bildiriyor (_changed): onları dosyadaki EN GÜNCEL halin üstüne
    // işliyoruz. Eskiden arayüzdeki (belki eski) kopyanın tamamı yazılıyordu — Genel Güncelleme sürerken
    // tabloda bir hücre değiştirilince o satıra TMDB'den az önce gelen afiş/oyuncu vb. siliniyordu.
    const values = { ...before.values }
    const incoming = req.body.values ?? {}
    for (const k of req.body._changed) {
      if (k in incoming) values[k] = incoming[k]
      else delete values[k]
    }
    const { _changed, ...rest } = before
    saved = { ...rest, values, id: req.params.rowId, updatedAt: req.body.updatedAt ?? Date.now() }
    if ('sortKey' in req.body) saved.sortKey = req.body.sortKey
  } else {
    const { _changed, ...body } = req.body ?? {}
    saved = { ...body, id: req.params.rowId, updatedAt: Date.now() }
  }
  // Tablodaki sürükleyerek verilen sıra (sortKey): kaydı bilmeden kaydeden yerler (hücre düzenleme,
  // detay penceresi…) onu göndermiyor — silinmesin, korunuyor.
  if (before && before.sortKey !== undefined && !('sortKey' in req.body)) saved.sortKey = before.sortKey
  if (idx === -1) rows.unshift(saved)
  else rows[idx] = saved
  writeJson(rowsFile, rows)
  if (shouldAskRating(req.params.profileId, req.params.id, before, saved)) setAskRating(res, req.params.id, saved.id)
  try {
    recordRowWatchTime(req.params.profileId, req.params.id, before, saved)
  } catch {
    /* saat kaydı önemsiz */
  }
  res.json(saved)
})

// Puan hatırlatması: kullanıcı "izledikten sonra puan sorsun" dedi. Bir kayıt İzlendi olduysa ve puanı
// boşsa arayüze bir başlıkla (X-Argus-Ask-Rating) haber verilir, arayüz küçük bir puan penceresi açar.
function shouldAskRating(profileId, boardId, before, after) {
  const board = findBoardCached(profileId, boardId)
  if (!board) return false
  const durumProp = resolveRole(board, 'durum')
  const izlendi = resolveStatusOption(board, 'izlendi')
  const puanProp = resolveRole(board, 'puan')
  if (!durumProp || !izlendi || !puanProp) return false
  if (after?.values?.[durumProp.id] !== izlendi) return false
  if (before && before.values?.[durumProp.id] === izlendi) return false
  const score = after.values?.[puanProp.id]
  return !(score && typeof score === 'object' && Object.keys(score).length > 0)
}
function setAskRating(res, boardId, rowId) {
  res.setHeader('X-Argus-Ask-Rating', encodeURIComponent(JSON.stringify({ boardId, rowId })))
  res.setHeader('Access-Control-Expose-Headers', 'X-Argus-Ask-Rating')
}

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
  if (!board) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
  const prop = board.properties.find((p) => p.id === propertyId)
  if (!prop) return res.status(404).json({ error: stt('Sütun bulunamadı') })

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
  if (idx === -1) return res.status(404).json({ error: stt('Profil bulunamadı') })
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
  const before = all[req.params.rowId] ?? {}
  all[req.params.rowId] = req.body
  writeJson(file, all)
  try {
    const today = localToday()
    const n = Object.entries(req.body ?? {}).filter(([k, ds]) => Array.isArray(ds) && ds.includes(today) && !(before[k] ?? []).includes(today)).length
    if (n) appendWatchTime(req.params.profileId, { rowId: req.params.rowId, kind: 'ep', n })
    const added = Object.entries(req.body ?? {}).some(([k, ds]) => Array.isArray(ds) && ds.some((d) => !(before[k] ?? []).includes(d)))
    if (added) touchRecentWatch(req.params.profileId, req.params.rowId)
  } catch {
    /* saat kaydı önemsiz */
  }
  let autoWatched = null
  let autoWatching = null
  try {
    autoWatched = autoMarkSeriesWatched(req.params.profileId, req.params.rowId, req.body ?? {})
    if (!autoWatched) autoWatching = autoUnmarkSeriesWatched(req.params.profileId, req.params.rowId, before, req.body ?? {})
  } catch (e) {
    console.error('otomatik durum hata:', e)
  }
  if (autoWatched) {
    const rows = readJson(profileRowsFile(req.params.profileId, autoWatched.boardId), [])
    const row = rows.find((r) => r.id === req.params.rowId)
    if (row && shouldAskRating(req.params.profileId, autoWatched.boardId, null, row)) setAskRating(res, autoWatched.boardId, row.id)
  }
  res.json({ ok: true, autoWatched, autoWatching })
})

// İçerikteki müzikler: kullanıcı "Nook'un Hum'u izlediğim dizilerin filmlerin içindeki müzikleri bulsun,
// hangi dakikada hangi müzik çaldığı detay penceresinde yazsın" dedi. Nook izlerken çalan şarkıyı tanıyıp
// buraya yazıyor; elle de silinebiliyor. songs.json: { [rowId]: Song[] } — Song: { id, key (Shazam kimliği),
// title, artist, album?, cover?, url?, season?, episode?, atMs (içeriğin kaçıncı ms'si; bilinmiyorsa null),
// approx, foundAt }.
const SONG_SAME_WINDOW_MS = 5 * 60 * 1000

function cleanText(v, max = 200) {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}
function cleanUrl(v) {
  const s = cleanText(v, 1000)
  return s && /^https:\/\//i.test(s) ? s : null
}
function cleanInt(v) {
  return Number.isInteger(v) && v >= 0 ? v : null
}

app.get('/api/profiles/:profileId/songs/:rowId', (req, res) => {
  res.json(readJson(profileSongsFile(req.params.profileId), {})[req.params.rowId] ?? [])
})

app.post('/api/profiles/:profileId/songs/:rowId', (req, res) => {
  const b = req.body ?? {}
  const key = cleanText(b.key, 64)
  const title = cleanText(b.title)
  const artist = cleanText(b.artist)
  if (!key || !title) return res.status(400).json({ error: stt('Şarkı bilgisi eksik') })
  const season = cleanInt(b.season)
  const episode = season !== null ? cleanInt(b.episode) : null
  const atMs = cleanInt(b.atMs)
  const file = profileSongsFile(req.params.profileId)
  const all = readJson(file, {})
  const list = Array.isArray(all[req.params.rowId]) ? all[req.params.rowId] : []
  // Aynı şarkı aynı bölümde birkaç dakika içinde yeniden bulunduysa (hâlâ çalıyor) tekrar eklenmez
  const same = list.find(
    (s) =>
      s.key === key &&
      (s.season ?? null) === season &&
      (s.episode ?? null) === episode &&
      (atMs === null || s.atMs === null || Math.abs(s.atMs - atMs) < SONG_SAME_WINDOW_MS),
  )
  if (same) return res.json({ ok: true, duplicate: true, song: same })
  const song = {
    id: makeId(),
    key,
    title,
    artist: artist ?? '',
    album: cleanText(b.album),
    cover: cleanUrl(b.cover),
    url: cleanUrl(b.url),
    season,
    episode,
    atMs,
    // Oynatıcı konum vermediyse dakika, izlenen süreden tahmin (ekranda "~" ile)
    approx: atMs !== null && b.approx === true,
    // Kullanıcı ARGUS'ta elle ekledi (Nook bulmadı)
    manual: b.manual === true,
    foundAt: Date.now(),
  }
  all[req.params.rowId] = [...list, song]
  writeJson(file, all)
  res.json({ ok: true, duplicate: false, song })
})

app.delete('/api/profiles/:profileId/songs/:rowId/:songId', (req, res) => {
  const file = profileSongsFile(req.params.profileId)
  const all = readJson(file, {})
  const list = Array.isArray(all[req.params.rowId]) ? all[req.params.rowId] : []
  const next = list.filter((s) => s.id !== req.params.songId)
  if (next.length) all[req.params.rowId] = next
  else delete all[req.params.rowId]
  writeJson(file, all)
  res.json({ ok: true })
})

// Yayınlanmış bölümlerin anahtarları (episodes.json'a göre) — yoksa null.
function airedEpisodeKeys(profileId, rowId) {
  const seasons = readJson(profileEpisodesFile(profileId), {})[rowId]
  if (!Array.isArray(seasons) || seasons.length === 0) return null
  const today = localToday()
  const aired = []
  for (const s of seasons) {
    if (!(s.seasonNumber >= 1)) continue
    for (const e of s.episodes ?? []) if (e.airDate && e.airDate <= today) aired.push(`${s.seasonNumber}-${e.episodeNumber}`)
  }
  return aired.length ? aired : null
}

// Tersi: kullanıcı "son bölümün izleme tarihini kaldırdım, durumu İzleniyor yapsın" dedi. Bütün
// bölümleri işaretliyken (tamamlanmışken) bir bölümün işareti kaldırılırsa ve durum İzlendi ise
// İzleniyor'a alınır. İzleme tarihine dokunulmaz (o gün gerçekten izlemiş olabilir).
function autoUnmarkSeriesWatched(profileId, rowId, before, after) {
  const aired = airedEpisodeKeys(profileId, rowId)
  if (!aired) return null
  const complete = (seen) => aired.every((k) => seen?.[k]?.length > 0)
  if (!complete(before) || complete(after)) return null
  const boards = readJson(profileBoardsFile(profileId), [])
  for (const board of boards) {
    const rowsFile = profileRowsFile(profileId, board.id)
    const rows = readJson(rowsFile, [])
    const row = rows.find((r) => r.id === rowId)
    if (!row) continue
    const durumProp = resolveRole(board, 'durum')
    const izlendi = resolveStatusOption(board, 'izlendi')
    const izleniyor = resolveStatusOption(board, 'izleniyor')
    if (!durumProp || !izlendi || !izleniyor || row.values[durumProp.id] !== izlendi) return null
    row.values = { ...row.values, [durumProp.id]: izleniyor }
    row.updatedAt = Date.now()
    writeJson(rowsFile, rows)
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    const title = String((tp && row.values[tp.id]) || stt('Dizi'))
    pushNotification(profileId, {
      type: 'newSeason',
      boardId: board.id,
      rowId,
      title,
      text: stt('Bir bölümün işaretini kaldırdın, artık bütün bölümler izlenmiş değil — durumu İzleniyor\'a alındı.'),
    })
    return { title, boardId: board.id }
  }
  return null
}

function localToday() {
  return localDay()
}

// Kullanıcı "dizinin çıkmış bölümlerinin hepsine izleme tarihi girdim, durumu İzlendi'ye çeksin"
// dedi: bir dizinin YAYINLANMIŞ bütün bölümleri işaretlenince Durum kendiliğinden İzlendi olur,
// son izlenen bölümün tarihi İzleme Tarihi'ne eklenir ve bildirim düşer.
function autoMarkSeriesWatched(profileId, rowId, seen) {
  const seasons = readJson(profileEpisodesFile(profileId), {})[rowId]
  if (!Array.isArray(seasons) || seasons.length === 0) return null
  const today = localToday()
  const aired = []
  for (const s of seasons) {
    if (!(s.seasonNumber >= 1)) continue
    for (const e of s.episodes ?? []) if (e.airDate && e.airDate <= today) aired.push(`${s.seasonNumber}-${e.episodeNumber}`)
  }
  if (aired.length === 0 || !aired.every((k) => seen[k]?.length > 0)) return null
  // Sezon ortasındaysa (yayınlanmış bölümü olan bir sezonda henüz çıkmamış ya da tarihi belli olmayan bölüm
  // varsa) İzlendi yapma — kullanıcı "Lanterns'ün 7. bölümünü girdim, İzlendi yaptı ama bir bölüm daha var"
  // dedi. Sadece ilerideki yeni bir sezon açıklanmışsa (hiç bölümü çıkmamış sezon) eskisi gibi İzlendi olur.
  const midSeason = seasons.some(
    (s) => s.seasonNumber >= 1 && (s.episodes ?? []).some((e) => e.airDate && e.airDate <= today) && (s.episodes ?? []).some((e) => !e.airDate || e.airDate > today),
  )
  const lastAiredSeason = Math.max(...aired.map((k) => Number(k.split('-')[0])))
  const next = readJson(profileTmdbFile(profileId), {})[rowId]?.show?.next
  const nextInSameSeason = next && next.season === lastAiredSeason && (!next.airDate || next.airDate > today)
  if (midSeason || nextInSameSeason) return null
  const boards = readJson(profileBoardsFile(profileId), [])
  for (const board of boards) {
    const rowsFile = profileRowsFile(profileId, board.id)
    const rows = readJson(rowsFile, [])
    const row = rows.find((r) => r.id === rowId)
    if (!row) continue
    const durumProp = resolveRole(board, 'durum')
    const izlendi = resolveStatusOption(board, 'izlendi')
    if (!durumProp || !izlendi || row.values[durumProp.id] === izlendi) return null
    row.values = { ...row.values, [durumProp.id]: izlendi }
    const dateProp = resolveRole(board, 'izlemeTarihi')
    const allDates = Object.values(seen).flat().filter(Boolean).sort()
    const lastDate = allDates[allDates.length - 1]
    if (dateProp && lastDate) {
      const v = row.values[dateProp.id]
      if (dateProp.type === 'multidate') {
        const list = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []
        // Kullanıcı: "en son yazdığım tarihi izleme tarihi yapıyorsun ama başlama tarihim çok daha önce" —
        // izleme tarihi, bu izlemeye ait ilk bölümün gününden son bölümün gününe bir aralık olarak yazılır.
        // Bu izlemenin başı: bir önceki izleme tarihinin bitişinden sonraki ilk bölüm günü.
        const prevEnd = list.map((x) => String(x).split('/').pop()).filter((d) => d < lastDate).sort().pop() ?? ''
        const start = allDates.find((d) => d > prevEnd) ?? lastDate
        const entry = start < lastDate ? `${start}/${lastDate}` : lastDate
        const covered = list.some((x) => String(x).split('/').includes(lastDate))
        if (!covered) row.values[dateProp.id] = [...list, entry].sort()
      } else if (!v) row.values[dateProp.id] = lastDate
    }
    row.updatedAt = Date.now()
    writeJson(rowsFile, rows)
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    const title = (tp && row.values[tp.id]) || stt('Dizi')
    const show = readJson(profileTmdbFile(profileId), {})[rowId]?.show
    const tail = show?.status === 'Ended' || show?.status === 'Canceled' ? stt(' Dizi bitti, yeni bölüm gelmeyecek.') : show?.next?.airDate ? stt(' Yeni bölüm {0} tarihinde.', langDate(show.next.airDate)) : stt(' Yeni sezon çıkınca haber vereceğim.')
    pushNotification(profileId, {
      type: 'watched',
      boardId: board.id,
      rowId,
      title: String(title),
      text: stt('Çıkmış bütün bölümleri izledin, durumu İzlendi yapıldı.{0}', tail),
    })
    return { title: String(title), boardId: board.id }
  }
  return null
}


const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p'

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

// Listede olmayan ülkelerin Türkçe adı (ör. HR → Hırvatistan). Kullanıcı yeni eklenen ülke
// etiketlerinin başında bayrak emojisi (Windows'ta "HR" gibi harf olarak görünüyordu) ve İngilizce
// ad ("Croatia") çıktığını söyledi — artık diğer ülkeler gibi sade Türkçe ad yazılıyor.
function isoToTrName(iso2) {
  if (!iso2 || iso2.length !== 2) return null
  try {
    const name = new Intl.DisplayNames([serverLang()], { type: 'region' }).of(iso2.toUpperCase())
    return name && name !== iso2.toUpperCase() ? name : null
  } catch {
    return null
  }
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

// Adı birebir tutan en bilinen sonuç: Türkçe sonuçlar + aynı aramanın İngilizcesi birlikte bakılıyor, çünkü
// kullanıcı çoğu zaman İngilizce adı yazıyor ve Türkçe sonuçlarda o ad görünmüyor. "Parasite" → ilk sonuç
// "Parasite Dolls" ya da adı gerçekten "Parasite" olan az bilinen bir film çıkıyordu; doğrusu "Parazit"
// (İngilizce adı Parasite, en çok oy alan). Birebir tutan yoksa null (çağıran ilk sonuca düşer).
async function bestExact(endpoint, params, trResults, query, apiKey) {
  const q = normalizeText(query)
  const same = (r) => [r.title, r.name, r.original_title, r.original_name].some((t) => t && normalizeText(t) === q)
  const en = await tmdbGet(endpoint, { ...params, query, language: 'en-US' }, apiKey)
  const cands = [...(trResults ?? []), ...(en?.results ?? [])].filter((r) => (r.media_type ? r.media_type === 'movie' || r.media_type === 'tv' : true) && same(r))
  if (!cands.length) return null
  const best = cands.reduce((a, b) => ((b.vote_count ?? 0) > (a.vote_count ?? 0) ? b : a))
  // Türkçe sonuçtaki karşılığı tercih edilir (aynı kimlik), yoksa İngilizcesi — kimlik aynı, sonra Türkçe detay çekiliyor.
  return (trResults ?? []).find((r) => r.id === best.id && (r.media_type ?? '') === (best.media_type ?? '')) ?? best
}

async function searchTv(query, year, apiKey) {
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
function pickByTitle(results, query) {
  const q = normalizeText(query)
  return results.find((r) => normalizeText(r.title ?? '') === q || normalizeText(r.original_title ?? '') === q) ?? results[0] ?? null
}
async function searchMovie(query, year, apiKey) {
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

async function searchMulti(query, year, apiKey) {
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
function pickLogo(images) {
  const logos = images?.logos ?? []
  if (logos.length === 0) return null
  const pref = (list) => list.find((l) => !/\.svg$/i.test(l.file_path)) ?? list[0]
  return pref(logos.filter((l) => l.iso_639_1 === serverLang())) ?? pref(logos.filter((l) => l.iso_639_1 === 'en')) ?? pref(logos)
}

// Eskiden SVG logolar da .png adıyla kaydediliyordu, tarayıcı açamıyordu (kırık görsel). Böyle bir dosya
// boş sayılıyor ki Güncelle onu yeniden indirsin.
function isBrokenLogo(value) {
  if (typeof value !== 'string' || !/^\/medya\/[^/]+\.png$/i.test(value)) return false
  try {
    return fs.readFileSync(path.join(MEDYA_DIR, value.slice('/medya/'.length))).subarray(0, 256).toString('utf-8').trimStart().startsWith('<')
  } catch {
    return false
  }
}

// Yaş sınırı hep aynı Türkçe biçimde yazılsın — TMDB bazen Türkiye'nin ("13+", "Genel İzleyici Kitlesi"), bazen
// ABD'nin ("R", "PG-13", "TV-MA") sınıflandırmasını veriyor, sütunda karışık duruyordu (bkz. src/lib/ageRating.ts).
const AGE_TIERS = {
  'genel izleyici kitlesi': 'Genel İzleyici', 'genel izleyici': 'Genel İzleyici', 'general audience': 'Genel İzleyici', g: 'Genel İzleyici', 'tv-y': 'Genel İzleyici', 'tv-g': 'Genel İzleyici',
  '6+': '6+', '6a': '6+', '7+': '7+', '7a': '7+', pg: '7+', 'tv-y7': '7+', '10+': '10+', '10a': '10+', 'tv-pg': '10+',
  '13+': '13+', '13a': '13+', 'pg-13': '13+', 'tv-14': '13+', '15+': '16+', '16+': '16+', r: '16+', '18+': '18+', 'nc-17': '18+', 'tv-ma': '18+',
}
function normalizeCert(raw) {
  const tier = raw ? AGE_TIERS[String(raw).trim().toLocaleLowerCase('tr')] : null
  return tier === 'Genel İzleyici' ? stt('Genel İzleyici') : (tier ?? raw)
}

async function getMovieCertification(tmdbId, apiKey) {
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

async function getTvCertification(tmdbId, apiKey) {
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
function isTvKind(label) {
  return ['dizi', 'mini dizi', 'reality show', 'yarışma', 'series', 'tv series', 'tv show', 'miniseries', 'mini series', 'show'].includes(label) || label.includes('gösteri')
}
function isMovieKind(label) {
  return ['film', 'kısa film', 'movie', 'short', 'short film', 'sinema filmi'].includes(label)
}

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
async function pickTmdbCandidate(profileId, board, row, apiKey) {
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
  if (current) return { forced: toForced(current) }
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
  if (exact.length === 1) return { forced: toForced(exact[0]) }
  if (exact.length === 0 && entries.length === 1) return { forced: toForced(entries[0]) }
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

async function fillRowFromTmdb(profileId, boardId, rowId, { exclude: excludeList = [], overwrite: overwriteFlag = false, forced = null, ask = false } = {}) {
  try {
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) {
      return { status: 400, data: { error: stt('Önce Ayarlar → Veritabanı → API sekmesinden bir TMDB API anahtarı girmelisin.') } }
    }
    const exclude = new Set(Array.isArray(excludeList) ? excludeList : [])
    const overwrite = Boolean(overwriteFlag)
    const boardsFile = profileBoardsFile(profileId)
    const boards = readJson(boardsFile, [])
    const board = boards.find((b) => b.id === boardId)
    if (!board) return { status: 404, data: { error: stt('Arşiv bulunamadı') } }
    const rowsFilePath = profileRowsFile(profileId, board.id)
    const rows = readJson(rowsFilePath, [])
    const row = rows.find((r) => r.id === rowId)
    if (!row) return { status: 404, data: { error: stt('Kayıt bulunamadı') } }

    // Başlık her zaman arşivin başlık sütunu (adı "Türkçe Adı" olmak zorunda değil).
    const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)

    // Board'da bu sütunlardan biri hiç yoksa (kullanıcı hazır şablonu kullanmadan kendi
    // arşivini elle kurduysa, ya da bir sütunu sildiyse) TMDB doldurma eskiden sessizce o
    // alanı atlıyordu — arkadaşının arşivinde "KAPAK ADI" sütunu hiç eklenmemiş olması TAM
    // OLARAK bu yüzden hiç doldurulmuyordu. Artık Süre/Yaş Sınırı'nda zaten var olan
    // "yoksa oluştur" deseni TÜM TMDB alanlarına uygulanıyor — güncelle butonuna basmak
    // eksik sütunları da kendisi ekliyor.
    // Hariç tutulan (bu sefer "gelmesin" denen) bir alanın sütunu yoksa oluşturulmuyor — kullanıcı
    // doldurmadan önce çıkan pencerede "Kapak Adı gelmesin" derse tabloya boş sütun eklenmesin.
    const mk = () => makeId()
    const ens = (field, key, extra) => (exclude.has(field) ? resolveRole(board, key) : ensureRole(board, key, mk, extra))
    const origProp = ens('orjinalAdi', 'orjinalAdi')
    const kategoriProp = ens('kategori', 'kategori', { options: [] })
    const vizyonProp = ens('vizyonTarihi', 'vizyon')
    const bannerProp = ens('banner', 'banner')
    // Kapak görseli seçilmemiş arşivde (ör. şablonsuz içe aktarım) ana sayfa kartları boş kalıyordu — Banner kapak olsun
    if (bannerProp && !board.coverPropertyId) board.coverPropertyId = bannerProp.id
    const posterProp = ens('poster', 'poster')
    // Başlık logosu: arşivde "Vitrin Başlık Görseli" olarak işaretli sütun; hiç yoksa oluşturulup
    // o şekilde işaretleniyor (eskiden "Kapak Adı" adıyla aranıyordu).
    let kapakAdiProp = board.properties.find((p) => p.id === board.titleImagePropertyId && p.type === 'image')
    if (!kapakAdiProp) {
      kapakAdiProp = board.properties.find((p) => p.type === 'image' && isName(p.name, COLUMN_NAMES.kapakAdi))
      if (!kapakAdiProp && !exclude.has('kapakAdi')) {
        kapakAdiProp = { id: mk(), name: nameOf(COLUMN_NAMES.kapakAdi), type: 'image' }
        board.properties.push(kapakAdiProp)
      }
      if (kapakAdiProp) board.titleImagePropertyId = kapakAdiProp.id
    }
    const ulkeProp = ens('ulke', 'ulke', { options: [] })
    const turProp = ens('tur', 'tur', { options: [] })
    const yonetmenProp = ens('yonetmen', 'yonetmen')
    const oyuncularProp = ens('kadro', 'oyuncular', { options: [] })
    const videoProp = ens('video', 'video')
    const sureProp = ens('sure', 'sure')
    const yasProp = ens('yasSiniri', 'yas')
    const sinopsisProp = ens('sinopsis', 'sinopsis')

    const titleTr = titleProp ? row.values[titleProp.id] : ''
    const titleOrig = origProp ? row.values[origProp.id] : ''
    if (!titleTr && !titleOrig) {
      return { status: 400, data: { error: stt('Önce başlığı (ya da "Orjinal Adı" sütununu) doldurmalısın.') } }
    }

    const kategoriId = kategoriProp ? row.values[kategoriProp.id] : null
    // Tek satırdaki Güncelle (`ask`): kesin tek bir eşleşme yoksa kendisi seçmek yerine adayları
    // döndürür, arayüz listeyi gösterip kullanıcıya seçtirir (sonra `forced` ile yeniden çağrılır).
    if (!forced && ask) {
      const pick = await pickTmdbCandidate(profileId, board, row, apiKey)
      if (pick.choose) return { status: 200, data: { choose: pick.choose } }
      if (pick.forced) forced = pick.forced
    }
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
            stt('TMDB eşleşmesi bulunamadı — başlığın yazımını kontrol et; "Kategori" sütununu Film ya da Dizi olarak doldurursan arama daha isabetli sonuç verir.'),
        },
      }
    }

    const details =
      mediaType === 'tv'
        ? await tmdbGet(
            `/tv/${result.id}`,
            { language: tmdbLang(), append_to_response: 'aggregate_credits,images', include_image_language: `${serverLang()},en,null` },
            apiKey,
          )
        : await tmdbGet(
            `/movie/${result.id}`,
            { language: tmdbLang(), append_to_response: 'credits,images', include_image_language: `${serverLang()},en,null` },
            apiKey,
          )
    if (!details) return { status: 502, data: { error: stt('TMDB detay alınamadı') } }

    // Bu kaydın TMDB kimliği saklanıyor — Nerede İzlenir, Benzerler, yeni bölüm kontrolü ve
    // Keşfet'in "zaten arşivde var" ayıklaması bunu kullanıyor (bkz. tmdb.json).
    const refs = readJson(profileTmdbFile(profileId), {})
    // "Hangisi?" penceresinde kayıt BAŞKA bir yapımla eşleştirildiyse (önceki eşleşme yanlıştı) eski yapımdan
    // kalan afiş, yönetmen, yıl, oyuncular… da yenisiyle değiştirilir — yeni kullanıcı denemesinde "Attack on
    // Titan" müzikaliyle eşleşmiş, doğrusu seçilince müzikalin afişi ve yönetmeni kalmıştı. Kategori ve başlık
    // (kullanıcının kendi yazdıkları) bu yüzden değişmez.
    const prevRef = refs[row.id]
    const rematch = Boolean(forced && prevRef && (prevRef.id !== result.id || prevRef.mediaType !== mediaType))
    const ow = overwrite || rematch
    refs[row.id] = { id: result.id, mediaType, ...(mediaType === 'tv' ? { show: showInfoFromDetails(details) } : {}) }
    writeJson(profileTmdbFile(profileId), refs)

    const filled = []

    if (kategoriProp && (overwrite || !kategoriId) && !exclude.has('kategori')) {
      const wantPair = mediaType === 'tv' ? KIND_NAMES.dizi : KIND_NAMES.film
      const wantLabel = nameOf(wantPair)
      if (!kategoriProp.options) kategoriProp.options = []
      let opt = kategoriProp.options.find((o) => isName(o.label, wantPair))
      if (!opt) {
        opt = { id: makeId(), label: wantLabel, colorIndex: kategoriProp.options.length % 9 }
        kategoriProp.options.push(opt)
      }
      row.values[kategoriProp.id] = opt.id
      filled.push(stt('Kategori'))
    }

    // Başlık: kullanıcı "Türkçe adına İngilizcesini yazıyorum, öyle kalıyor; Türkçe adını bulursa
    // güncellesin" dedi. Başlık boşsa (sadece Orjinal Adı yazılıp aranmışsa) ya da başlıkta orijinal/
    // İngilizce ad yazıyorsa TMDB'nin Türkçe adı yazılır. Kullanıcının kendi verdiği başka bir ad korunur.
    if (titleProp && titleProp.type === 'text') {
      const trTitle = ((mediaType === 'tv' ? details.name : details.title) || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim() // TMDB bazen görünmez yön işaretleri koyuyor
      const cur = typeof titleTr === 'string' ? titleTr.trim() : ''
      // Aynı ad ama yazımı farklıysa da (kullanıcı "hepsini küçük harfle yazdım, filmi buldu ama yazımı
      // düzeltmedi" dedi — büyük/küçük harf, ı/i, ş/s gibi harfler) TMDB'deki yazım yazılır.
      if (trTitle && cur !== trTitle) {
        const fold = (s) => normalizeText(s.toLocaleLowerCase('tr')).replace(/ı/g, 'i') // "dunya varmis" = "Dünya Varmış"
        let replace = !cur || fold(cur) === fold(trTitle)
        // İngilizce / orijinal ad yazılmışsa Türkçesiyle değiştirmek bir seçenek (dişli › "Başlığı Türkçe adla değiştir";
        // arşivin titleTr ayarı, yoksa kapalı)
        if (!replace && !exclude.has('turkceAdi') && board.titleTr) {
          const orig = (mediaType === 'tv' ? details.original_name : details.original_title) || ''
          replace = normalizeText(cur) === normalizeText(orig)
          if (!replace) {
            const en = await tmdbGet(`/${mediaType}/${result.id}`, { language: 'en-US' }, apiKey)
            const enTitle = (mediaType === 'tv' ? en?.name : en?.title) || ''
            replace = Boolean(enTitle) && normalizeText(cur) === normalizeText(enTitle)
          }
        }
        if (replace) {
          row.values[titleProp.id] = trTitle
          filled.push(titleProp.name)
        }
      }
    }

    if (origProp && (ow || !titleOrig) && !exclude.has('orjinalAdi')) {
      const orig = mediaType === 'tv' ? details.original_name : details.original_title
      if (orig) {
        row.values[origProp.id] = orig
        filled.push(stt('Orjinal Adı'))
      }
    }

    // İçe aktarımda sadece yıl yazılmışsa ("1994" → 1994-01-01) aynı yıldaki gerçek tarihle tamamlanır
    const vizyonNow = vizyonProp ? row.values[vizyonProp.id] : ''
    const tmdbDate = mediaType === 'tv' ? details.first_air_date : details.release_date
    const yearOnly = typeof vizyonNow === 'string' && /^\d{4}-01-01$/.test(vizyonNow) && tmdbDate?.startsWith(vizyonNow.slice(0, 4)) && tmdbDate !== vizyonNow
    if (vizyonProp && (ow || !vizyonNow || yearOnly) && !exclude.has('vizyonTarihi')) {
      const date = tmdbDate
      if (date) {
        row.values[vizyonProp.id] = date
        filled.push(stt('Vizyon Tarihi'))
      }
    }

    if (sinopsisProp && (ow || !row.values[sinopsisProp.id]) && details.overview && !exclude.has('sinopsis')) {
      row.values[sinopsisProp.id] = details.overview
      filled.push(stt('Sinopsis'))
    }

    if (posterProp && (ow || !row.values[posterProp.id]) && details.poster_path && !exclude.has('poster')) {
      const filename = `tmdb_poster_${row.id}_${result.id}.jpg`
      if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w500${details.poster_path}`, path.join(MEDYA_DIR, filename))) {
        row.values[posterProp.id] = `/medya/${filename}`
        filled.push('Poster')
      }
    }

    if (bannerProp && (ow || !row.values[bannerProp.id]) && details.backdrop_path && !exclude.has('banner')) {
      const filename = `tmdb_backdrop_${row.id}_${result.id}.jpg`
      if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w1280${details.backdrop_path}`, path.join(MEDYA_DIR, filename))) {
        row.values[bannerProp.id] = `/medya/${filename}`
        filled.push('Banner')
      }
    }

    if (kapakAdiProp && (ow || !row.values[kapakAdiProp.id] || isBrokenLogo(row.values[kapakAdiProp.id])) && !exclude.has('kapakAdi')) {
      const logo = pickLogo(details.images)
      if (logo) {
        const filename = `tmdb_logo_${row.id}_${result.id}${/\.svg$/i.test(logo.file_path) ? '.svg' : '.png'}`
        if (isBrokenLogo(`/medya/${filename}`)) fs.rmSync(path.join(MEDYA_DIR, filename), { force: true })
        if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w500${logo.file_path}`, path.join(MEDYA_DIR, filename))) {
          row.values[kapakAdiProp.id] = `/medya/${filename}`
          filled.push(stt('Kapak Adı'))
        }
      }
    }

    if (
      turProp &&
      (ow || !Array.isArray(row.values[turProp.id]) || row.values[turProp.id].length === 0) &&
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
        filled.push(stt('Tür'))
      }
    }

    if (
      ulkeProp &&
      (ow || !Array.isArray(row.values[ulkeProp.id]) || row.values[ulkeProp.id].length === 0) &&
      !exclude.has('ulke')
    ) {
      const countries = details.production_countries ?? []
      if (countries.length) {
        const ulkeByName = new Map(ulkeProp.options.map((o) => [normalizeText(stripFlagEmoji(o.label)), o.id]))
        const ids = []
        for (const c of countries) {
          const trName = (serverLang() === 'tr' ? ISO_TO_TR[c.iso_3166_1] : null) ?? isoToTrName(c.iso_3166_1) ?? c.name ?? c.iso_3166_1
          const norm = normalizeText(trName)
          let optId = ulkeByName.get(norm)
          if (!optId) {
            optId = makeId()
            ulkeProp.options.push({ id: optId, label: trName, colorIndex: ulkeProp.options.length % 9 })
            ulkeByName.set(norm, optId)
          }
          ids.push(optId)
        }
        row.values[ulkeProp.id] = ids
        filled.push(stt('Ülke'))
      }
    }

    if (yonetmenProp && (ow || !(row.values[yonetmenProp.id] ?? '').trim()) && !exclude.has('yonetmen')) {
      let directors = []
      if (mediaType === 'movie') {
        directors = (details.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name)
      } else {
        directors = (details.created_by ?? []).map((c) => c.name)
      }
      if (directors.length) {
        row.values[yonetmenProp.id] = directors.join(', ')
        filled.push(stt('Yönetmen'))
      }
    }

    if (mediaType === 'movie' && sureProp && (ow || !row.values[sureProp.id]) && details.runtime && !exclude.has('sure')) {
      row.values[sureProp.id] = details.runtime
      filled.push(stt('Süre'))
    }

    if (yasProp && (ow || !(row.values[yasProp.id] ?? '').trim()) && !exclude.has('yasSiniri')) {
      const cert = mediaType === 'movie' ? await getMovieCertification(result.id, apiKey) : await getTvCertification(result.id, apiKey)
      if (cert) {
        row.values[yasProp.id] = cert
        filled.push(stt('Yaş Sınırı'))
      }
    }

    if (videoProp && (ow || !(row.values[videoProp.id] ?? '').trim()) && !exclude.has('video')) {
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
        const sdata = await tmdbGet(`/tv/${result.id}/season/${s.season_number}`, { language: tmdbLang() }, apiKey)
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
            name: ep.name || stt('Bölüm {0}', ep.episode_number),
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
          const person = await tmdbGet(`/person/${c.id}`, { language: tmdbLang() }, apiKey)
          if (person) {
            const parts = []
            if (person.birthday) {
              parts.push(langDate(person.birthday))
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

        const existingIds = !rematch && Array.isArray(row.values[oyuncularProp.id]) ? row.values[oyuncularProp.id] : []
        row.values[oyuncularProp.id] = [...new Set([...existingIds, ...freshCast.map((c) => c.optionId)])]
      }
    }

    writeJson(boardsFile, boards)
    writeJson(rowsFilePath, rows)

    // Mükerrer uyarısı: aynı TMDB içeriği bu arşivde başka bir kayıtta da varsa arayüz haber verir.
    const dupRow = rows.find((x) => x.id !== row.id && refs[x.id]?.id === result.id && refs[x.id]?.mediaType === mediaType)
    const duplicateOf = dupRow ? { rowId: dupRow.id, title: (titleProp && dupRow.values[titleProp.id]) || stt('İsimsiz') } : null

    return { status: 200, data: { ok: true, mediaType, filled, newEpisodes, newActors, duplicateOf } }
  } catch (e) {
    console.error('fetch-tmdb hata:', e)
    return { status: 500, data: { error: stt('Çekme sırasında hata oluştu') } }
  }
}

app.post('/api/profiles/:profileId/fetch-tmdb/:boardId/:rowId', async (req, res) => {
  const { profileId, boardId, rowId } = req.params
  const f = req.body?.forced
  const forced = f && (f.mediaType === 'movie' || f.mediaType === 'tv') && Number.isFinite(Number(f.tmdbId)) ? { tmdbId: Number(f.tmdbId), mediaType: f.mediaType } : null
  const out = await fillRowFromTmdb(profileId, boardId, rowId, { exclude: req.body?.exclude, overwrite: req.body?.overwrite, ask: Boolean(req.body?.ask), forced })
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

// Dizinin TMDB durumu: bitti mi, devam mı ediyor, sıradaki bölüm ne zaman — detay penceresindeki
// "Dizi bitti / Yeni sezon: 12 Mart" etiketi için tmdb.json'daki kayda yazılıyor.
function showInfoFromDetails(d) {
  const ep = (x) => (x ? { season: x.season_number, episode: x.episode_number, airDate: x.air_date ?? '' } : null)
  return { status: d.status ?? '', next: ep(d.next_episode_to_air), last: ep(d.last_episode_to_air), checkedAt: Date.now() }
}
function saveShowInfo(profileId, rowId, st) {
  const file = profileTmdbFile(profileId)
  const refs = readJson(file, {})
  if (!refs[rowId]) return
  const next = { status: st.status ?? '', next: st.next, last: st.last, checkedAt: Date.now() }
  if (JSON.stringify(refs[rowId].show ?? null) === JSON.stringify({ ...next, checkedAt: refs[rowId].show?.checkedAt })) return
  refs[rowId] = { ...refs[rowId], show: next }
  writeJson(file, refs)
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

// Arşivdeki bir TMDB içeriğinin satırı ve durumu (seri ve oyuncu sayfalarında "arşivinde / izledin" için).
function archiveLookup(profileId, board, rows) {
  const refs = readJson(profileTmdbFile(profileId), {})
  const byKey = new Map()
  for (const [rowId, r] of Object.entries(refs)) if (r?.id) byKey.set(tmdbKey(r.mediaType, r.id), rowId)
  const index = buildArchiveIndex(profileId, board, rows)
  const durumProp = resolveRole(board, 'durum')
  const izlendi = resolveStatusOption(board, 'izlendi')
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
      watched: Boolean(statusId && statusId === izlendi),
    }
  }
}

// Film serileri — kullanıcı "serinin kaçını izledim, sıradaki hangisi" görmek istedi. Filmin TMDB'deki
// serisi (belongs_to_collection) bir kez öğrenilip tmdb.json'a yazılır; serinin filmleri 6 saat önbellekte.
const collectionCache = new Map()
app.get('/api/profiles/:profileId/collection/:boardId/:rowId', async (req, res) => {
  try {
    const { profileId, boardId, rowId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ collection: null })
    const refsFile = profileTmdbFile(profileId)
    let ref = readJson(refsFile, {})[rowId]
    // Eski (Notion'dan gelen) kayıtların bir kısmında TMDB bağlantısı yok — adıyla bulunup kaydedilir.
    if (!ref) {
      const loaded0 = loadBoardAndRows(profileId, boardId)
      const row0 = loaded0?.rows.find((r) => r.id === rowId)
      if (row0) ref = await ensureTmdbRef(profileId, loaded0.board, row0, apiKey)
    }
    if (!ref || ref.mediaType !== 'movie') return res.json({ collection: null })
    if (ref.collection === undefined) {
      const d = await tmdbGet(`/movie/${ref.id}`, { language: tmdbLang() }, apiKey)
      if (!d) return res.json({ collection: null })
      const c = d.belongs_to_collection
      const fresh = readJson(refsFile, {})
      if (fresh[rowId]) {
        fresh[rowId] = { ...fresh[rowId], collection: c ? { id: c.id, name: c.name } : null }
        writeJson(refsFile, fresh)
      }
      ref.collection = c ? { id: c.id, name: c.name } : null
    }
    if (!ref.collection) return res.json({ collection: null })
    let col = collectionCache.get(ref.collection.id)
    if (!col || Date.now() - col.at > 6 * 3600e3) {
      const d = await tmdbGet(`/collection/${ref.collection.id}`, { language: tmdbLang() }, apiKey)
      if (!d) return res.json({ collection: null })
      col = { at: Date.now(), data: d }
      collectionCache.set(ref.collection.id, col)
    }
    const loaded = loadBoardAndRows(profileId, boardId)
    if (!loaded) return res.json({ collection: null })
    const look = archiveLookup(profileId, loaded.board, loaded.rows)
    const today = localDay()
    const parts = (col.data.parts ?? [])
      .filter((p) => p.release_date || p.id === ref.id)
      .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'))
      .map((p) => ({ ...look(toCard(p, 'movie')), released: Boolean(p.release_date && p.release_date <= today), releaseDate: p.release_date || '' }))
    if (parts.length < 2) return res.json({ collection: null })
    res.json({
      collection: { id: col.data.id, name: col.data.name, backdrop: col.data.backdrop_path ? `${TMDB_IMG_BASE}/w780${col.data.backdrop_path}` : null },
      parts,
    })
  } catch (e) {
    console.error('seri hata:', e)
    res.json({ collection: null })
  }
})

// ---- Flashback (yıllık özet) --------------------------------------------------------------------
// İzleme saatleri: kullanıcı "en çok gece mi gündüz mü izliyorum" görmek istedi ama arşivde sadece
// tarih var. Bundan sonra bir şey BUGÜNÜN tarihiyle izlendi diye işaretlenince o anın saati
// watch-times.jsonl'a eklenir (işaretleme genelde izledikten hemen sonra yapıldığı için yaklaşık izleme saati).
function profileWatchTimesFile(profileId) {
  return path.join(profileDir(profileId), 'watch-times.jsonl')
}
function appendWatchTime(profileId, entry) {
  fs.appendFileSync(profileWatchTimesFile(profileId), JSON.stringify({ t: Date.now(), ...entry }) + '\n')
}
function recordRowWatchTime(profileId, boardId, before, after) {
  const board = findBoardCached(profileId, boardId)
  const dateProp = board && resolveRole(board, 'izlemeTarihi')
  if (!dateProp) return
  const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).map(String)
  const today = localToday()
  const old = new Set(list(before?.values?.[dateProp.id]))
  const added = list(after?.values?.[dateProp.id]).filter((e) => !old.has(e))
  if (added.length) touchRecentWatch(profileId, after.id)
  if (added.some((e) => e === today || e.endsWith('/' + today))) appendWatchTime(profileId, { rowId: after.id, kind: 'row' })
}

// Son izleme verisi girilen kayıtlar (en yeni önce) — Takvim'deki "Son izlediklerin — tek tıkla seç"
// için. Kullanıcı "son verisini girdiğim gelmiyor" dedi: liste izleme tarihine göre sıralanınca geçmiş bir
// tarih girilen yapım (ör. dün izlediğini bugün eklemek) listeye girmiyordu. Artık girildiği ana göre.
function profileRecentWatchFile(profileId) {
  return path.join(profileDir(profileId), 'recent-watch.json')
}
function touchRecentWatch(profileId, rowId) {
  const file = profileRecentWatchFile(profileId)
  const list = readJson(file, []).filter((x) => x.rowId !== rowId)
  list.unshift({ rowId, t: Date.now() })
  writeJson(file, list.slice(0, 30))
}
app.get('/api/profiles/:profileId/recent-watch', (req, res) => {
  res.json(readJson(profileRecentWatchFile(req.params.profileId), []))
})

// Dizilerin ortalama bölüm süresi (toplam ekran süresi için): TMDB'den bir kez öğrenilip tmdb.json'daki
// kayda epRuntime olarak yazılır (0 = TMDB'de yok). Sadece o yıl bölümü işaretlenmiş diziler için.
const flashbackJobs = new Map() // profileId → { running, done, total }
const flashbackNoMatch = new Set()
async function fillEpisodeRuntimes(profileId, boardId, rowIds, apiKey) {
  if (flashbackJobs.get(profileId)?.running) return
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return
  const refsFile = profileTmdbFile(profileId)
  const refs0 = readJson(refsFile, {})
  const rowById = new Map(loaded.rows.map((r) => [r.id, r]))
  const todo = rowIds.filter((id) => rowById.has(id) && (refs0[id] ? refs0[id].mediaType === 'tv' && refs0[id].epRuntime === undefined : !flashbackNoMatch.has(`${profileId}:${id}`)))
  if (!todo.length) return
  const job = { running: true, done: 0, total: todo.length }
  flashbackJobs.set(profileId, job)
  try {
    for (const id of todo) {
      try {
        let ref = readJson(refsFile, {})[id]
        if (!ref) {
          ref = await ensureTmdbRef(profileId, loaded.board, rowById.get(id), apiKey)
          if (!ref) flashbackNoMatch.add(`${profileId}:${id}`)
        }
        if (ref && ref.mediaType === 'tv' && ref.epRuntime === undefined) {
          const d = await tmdbGet(`/tv/${ref.id}`, { language: 'en-US' }, apiKey)
          if (d) {
            const list = (d.episode_run_time ?? []).filter((m) => m > 0)
            const rt = list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : d.last_episode_to_air?.runtime || d.next_episode_to_air?.runtime || 0
            const fresh = readJson(refsFile, {})
            if (fresh[id]) {
              fresh[id] = { ...fresh[id], epRuntime: rt }
              writeJson(refsFile, fresh)
            }
          }
        }
      } catch {
        /* tek kayıt yüzünden iş durmasın */
      }
      job.done++
    }
  } finally {
    job.running = false
  }
}

app.get('/api/profiles/:profileId/flashback/:boardId', (req, res) => {
  const { profileId, boardId } = req.params
  const year = String(req.query.year ?? '')
  if (!/^\d{4}$/.test(year)) return res.status(400).json({ error: stt('Yıl eksik') })
  const watched = readJson(profileWatchedFile(profileId), {})
  const seriesIds = Object.entries(watched)
    .filter(([, eps]) => Object.values(eps ?? {}).some((ds) => (ds ?? []).some((d) => String(d).startsWith(year))))
    .map(([id]) => id)
  const refs = readJson(profileTmdbFile(profileId), {})
  const runtimes = {}
  for (const id of seriesIds) if (refs[id]?.epRuntime) runtimes[id] = refs[id].epRuntime
  const apiKey = readProfileApiKey(profileId)
  if (apiKey) fillEpisodeRuntimes(profileId, boardId, seriesIds, apiKey).catch(() => {})
  // Saat dağılımı (0-23) ve haftanın günü — sadece kaydedilmiş işaretlemelerden
  const hours = Array(24).fill(0)
  let timed = 0
  try {
    for (const line of fs.readFileSync(profileWatchTimesFile(profileId), 'utf-8').split('\n')) {
      if (!line.trim()) continue
      const e = JSON.parse(line)
      const d = new Date(e.t)
      if (String(d.getFullYear()) !== year) continue
      hours[d.getHours()]++
      timed++
    }
  } catch {
    /* dosya yoksa saat bilgisi yok */
  }
  const job = flashbackJobs.get(profileId)
  res.json({ runtimes, hours, timed, pending: job?.running ? { done: job.done, total: job.total } : null })
})

// ---- Koleksiyon ----------------------------------------------------------------------------------
// Kullanıcı "izlediklerimden sembolleri (Star Trek'teki göğüs deltaları gibi) sergileyen bir sayfa"
// istedi. İzlenen, izlenmekte olan ve yarım bırakılan yapımlar raflara ayrılıyor (raf anahtarı arayüzde hesaplanıyor):
// filmler için TMDB serisi (belongs_to_collection, İngilizce adıyla — dizilerin orijinal adıyla aynı
// raf anahtarını versin diye, ör. "Star Trek: ..." ), bu yüzden eksik seri bilgileri arka planda
// bir kez öğrenilip tmdb.json'a yazılıyor. Kullanıcının eklediği semboller, raf adları ve raf
// değişiklikleri koleksiyon.json'da.
function profileKoleksiyonFile(profileId) {
  return path.join(profileDir(profileId), 'koleksiyon.json')
}
const koleksiyonJobs = new Map() // profileId → { running, done, total }
const koleksiyonNoMatch = new Set() // TMDB'de bulunamayan kayıtlar (her açılışta yeniden aranmasın)

function koleksiyonRows(board, rows) {
  const durumProp = resolveRole(board, 'durum')
  if (!durumProp) return []
  // İzlenecek dışındaki her durum (İzlendi, İzleniyor, Yarım…): bir kısmını bile izlediysen koleksiyonda
  const later = resolveStatusOption(board, 'izlenecek')
  return rows.filter((r) => r.values[durumProp.id] && r.values[durumProp.id] !== later)
}

async function fillKoleksiyonCollections(profileId, boardId, apiKey) {
  if (koleksiyonJobs.get(profileId)?.running) return
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return
  const refsFile = profileTmdbFile(profileId)
  const refs0 = readJson(refsFile, {})
  const needs = (ref) => ref && ref.mediaType === 'movie' && (ref.collection === undefined || (ref.collection && !ref.collection.en))
  const todo = koleksiyonRows(loaded.board, loaded.rows).filter((r) => (refs0[r.id] ? needs(refs0[r.id]) : !koleksiyonNoMatch.has(`${profileId}:${r.id}`)))
  if (!todo.length) return
  const job = { running: true, done: 0, total: todo.length }
  koleksiyonJobs.set(profileId, job)
  try {
    for (const row of todo) {
      try {
        let ref = readJson(refsFile, {})[row.id]
        if (!ref) {
          ref = await ensureTmdbRef(profileId, loaded.board, row, apiKey)
          if (!ref) koleksiyonNoMatch.add(`${profileId}:${row.id}`)
        }
        if (needs(ref)) {
          const d = await tmdbGet(`/movie/${ref.id}`, { language: 'en-US' }, apiKey)
          if (d) {
            const c = d.belongs_to_collection
            const fresh = readJson(refsFile, {})
            if (fresh[row.id]) {
              fresh[row.id] = { ...fresh[row.id], collection: c ? { id: c.id, name: fresh[row.id].collection?.name ?? c.name, en: c.name } : null }
              writeJson(refsFile, fresh)
            }
          }
        }
      } catch {
        /* tek kayıt yüzünden iş durmasın */
      }
      job.done++
    }
  } finally {
    job.running = false
  }
}

// Kayıt → TMDB'de film mi dizi mi (eşleşmesi olanlar). Arşivdeki "Sadece bölümleri yenile" sadece dizilere gitsin diye.
app.get('/api/profiles/:profileId/tmdb-media', (req, res) => {
  const refs = readJson(profileTmdbFile(req.params.profileId), {})
  const out = {}
  for (const [rowId, ref] of Object.entries(refs)) if (ref?.mediaType) out[rowId] = ref.mediaType
  res.json(out)
})

app.get('/api/profiles/:profileId/koleksiyon/:boardId', (req, res) => {
  const { profileId, boardId } = req.params
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
  const refs = readJson(profileTmdbFile(profileId), {})
  const collections = {}
  const mediaTypes = {}
  for (const row of koleksiyonRows(loaded.board, loaded.rows)) {
    const ref = refs[row.id]
    if (!ref) continue
    mediaTypes[row.id] = ref.mediaType
    if (ref.collection) collections[row.id] = { id: ref.collection.id, name: ref.collection.en ?? ref.collection.name }
  }
  const apiKey = readProfileApiKey(profileId)
  if (apiKey) fillKoleksiyonCollections(profileId, boardId, apiKey).catch(() => {})
  const job = koleksiyonJobs.get(profileId)
  res.json({
    collections,
    mediaTypes,
    pending: job?.running ? { done: job.done, total: job.total } : null,
    data: readJson(profileKoleksiyonFile(profileId), { items: {}, shelves: {} }),
  })
})

// Kısmi güncelleme: { items: { rowId: {...} | null }, shelves: { key: {...} | null } } — null siler.
app.post('/api/profiles/:profileId/koleksiyon', (req, res) => {
  const file = profileKoleksiyonFile(req.params.profileId)
  const data = readJson(file, { items: {}, shelves: {} })
  for (const kind of ['items', 'shelves']) {
    const patch = req.body?.[kind]
    if (!patch || typeof patch !== 'object') continue
    data[kind] = data[kind] ?? {}
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete data[kind][k]
      else if (typeof v === 'object') {
        const merged = { ...(data[kind][k] ?? {}), ...v }
        for (const [mk, mv] of Object.entries(merged)) if (mv === null) delete merged[mk]
        if (Object.keys(merged).length) data[kind][k] = merged
        else delete data[kind][k]
      }
    }
  }
  writeJson(file, data)
  res.json(data)
})

// Oyuncu / yönetmen sayfası — kullanıcı "oyuncuya tıklayınca arşivimde olmayan filmlerini de göreyim,
// tek tıkla ekleyeyim" dedi. Kişi TMDB'de adıyla aranır (arşivde kişi kimliği tutulmuyor), filmografisi
// arşivde olanlar / olmayanlar diye ayrılır.
const personCache = new Map()
app.get('/api/profiles/:profileId/person/:boardId', async (req, res) => {
  try {
    const { profileId, boardId } = req.params
    const name = String(req.query.name ?? '').trim()
    const role = req.query.role === 'directing' ? 'directing' : 'acting'
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ needsApiKey: true })
    if (!name) return res.json({ person: null })
    const ck = `${role}:${normalizeText(name)}`
    let hit = personCache.get(ck)
    if (!hit || Date.now() - hit.at > 6 * 3600e3) {
      const sr = await tmdbGet('/search/person', { query: name, language: tmdbLang() }, apiKey)
      const want = role === 'directing' ? 'Directing' : 'Acting'
      const results = sr?.results ?? []
      const pick =
        results.find((p) => normalizeText(p.name) === normalizeText(name) && p.known_for_department === want) ??
        results.find((p) => normalizeText(p.name) === normalizeText(name)) ??
        results[0]
      if (!pick) return res.json({ person: null })
      const d = await tmdbGet(`/person/${pick.id}`, { language: tmdbLang(), append_to_response: 'combined_credits' }, apiKey)
      let bio = d?.biography ?? ''
      if (!bio) bio = (await tmdbGet(`/person/${pick.id}`, { language: 'en-US' }, apiKey))?.biography ?? ''
      hit = { at: Date.now(), data: { d, bio } }
      personCache.set(ck, hit)
    }
    const { d, bio } = hit.data
    const loaded = loadBoardAndRows(profileId, boardId)
    if (!loaded) return res.json({ person: null })
    const look = archiveLookup(profileId, loaded.board, loaded.rows)
    const credits = role === 'directing' ? (d.combined_credits?.crew ?? []).filter((c) => c.job === 'Director') : d.combined_credits?.cast ?? []
    const seen = new Set()
    const items = []
    for (const c of credits) {
      const type = c.media_type
      if (type !== 'movie' && type !== 'tv') continue
      // talk show / haber / "kendisi" rolleri filmografiyi kalabalıklaştırmasın
      if ((c.genre_ids ?? []).some((g) => g === 10767 || g === 10763 || g === 99)) continue
      if (/^(self|himself|herself|kendisi)\b/i.test(c.character ?? '')) continue
      // dizilerde bir iki bölümlük konuk oyunculuklar filmografiyi kalabalıklaştırmasın
      if (role === 'acting' && type === 'tv' && (c.episode_count ?? 0) < 3) continue
      const k = tmdbKey(type, c.id)
      if (seen.has(k)) continue
      seen.add(k)
      items.push({ ...look(toCard(c, type)), character: c.character ?? '', popularity: c.popularity ?? 0, votes: c.vote_count ?? 0 })
    }
    const inArchive = items.filter((i) => i.inArchive).sort((a, b) => (b.year || '').localeCompare(a.year || ''))
    const notInArchive = items
      .filter((i) => !i.inArchive && i.votes >= 20)
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 40)
    const place = d.place_of_birth ?? ''
    res.json({
      person: {
        id: d.id,
        name: d.name,
        bio,
        birthday: d.birthday ?? '',
        deathday: d.deathday ?? '',
        place,
        image: d.profile_path ? `${TMDB_IMG_BASE}/w342${d.profile_path}` : null,
        department: d.known_for_department ?? '',
      },
      inArchive,
      notInArchive,
    })
  } catch (e) {
    console.error('kişi hata:', e)
    res.json({ person: null })
  }
})

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
    if (!row) return res.status(404).json({ error: stt('Kayıt bulunamadı') })
    const ref = await ensureTmdbRef(profileId, loaded.board, row, apiKey)
    if (!ref) return res.json({ notFound: true })

    const [prov, recs] = await Promise.all([
      tmdbGet(`/${ref.mediaType}/${ref.id}/watch/providers`, {}, apiKey),
      tmdbGet(`/${ref.mediaType}/${ref.id}/recommendations`, { language: tmdbLang() }, apiKey),
    ])
    let similarRaw = recs?.results ?? []
    if (similarRaw.length === 0) {
      const sim = await tmdbGet(`/${ref.mediaType}/${ref.id}/similar`, { language: tmdbLang() }, apiKey)
      similarRaw = sim?.results ?? []
    }
    const index = buildArchiveIndex(profileId, loaded.board, loaded.rows)
    const similar = similarRaw
      .slice(0, 16)
      .map((r) => toCard(r, ref.mediaType))
      .map((c) => ({ ...c, inArchive: index.has(c) }))

    const tr = prov?.results?.[serverRegion()]
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
    res.status(500).json({ error: stt('TMDB bilgileri alınamadı') })
  }
})

// TMDB'deki bir içeriği arşive yeni kayıt olarak ekler (Benzerler / Keşfet'ten). Önce başlık +
// durum (+ izlendiyse tarih/puan) ile kayıt oluşturulur, sonra normal TMDB doldurma çalışır.
app.post('/api/profiles/:profileId/tmdb-add/:boardId', async (req, res) => {
  try {
    const { profileId, boardId } = req.params
    const { tmdbId, mediaType, status, watchedDate, rating, exclude } = req.body ?? {}
    if (!tmdbId || (mediaType !== 'movie' && mediaType !== 'tv')) return res.status(400).json({ error: stt('Geçersiz içerik') })
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.status(400).json({ error: stt('Önce Ayarlar → Veritabanı → API sekmesinden bir TMDB API anahtarı girmelisin.') })

    const boardsFile = profileBoardsFile(profileId)
    const boards = readJson(boardsFile, [])
    const board = boards.find((b) => b.id === boardId)
    if (!board) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
    const rowsFile = profileRowsFile(profileId, boardId)
    const rows = readJson(rowsFile, [])

    const index = buildArchiveIndex(profileId, board, rows)
    const basic = await tmdbGet(`/${mediaType}/${tmdbId}`, { language: tmdbLang() }, apiKey)
    if (!basic) return res.status(502).json({ error: stt('TMDB bilgisi alınamadı') })
    const card = toCard(basic, mediaType)
    if (index.has(card)) return res.status(409).json({ error: stt('"{0}" zaten arşivinde var.', card.title) })

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
          // Tek (genel) puan — kriterlere dağıtılmaz (bkz. src/types.ts RATING_OVERALL)
          values[puanProp.id] = { _genel: rating }
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
    res.status(500).json({ error: stt('İçerik eklenemedi') })
  }
})

app.get('/api/profiles/:profileId/tmdb-genres', async (req, res) => {
  const apiKey = readProfileApiKey(req.params.profileId)
  if (!apiKey) return res.json({ needsApiKey: true, genres: [] })
  const type = req.query.type === 'tv' ? 'tv' : 'movie'
  const data = await tmdbGet(`/genre/${type}/list`, { language: tmdbLang() }, apiKey)
  res.json({ genres: (data?.genres ?? []).map((g) => ({ id: g.id, name: g.name })) })
})

// Keşfet: seçilen tür(ler)de, arşivde OLMAYAN ve daha önce "istemiyorum" denmemiş içerikler.
app.post('/api/profiles/:profileId/tmdb-discover/:boardId', async (req, res) => {
  try {
    const { profileId, boardId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.status(400).json({ error: stt('Önce Ayarlar → Veritabanı → API sekmesinden bir TMDB API anahtarı girmelisin.') })
    const loaded = loadBoardAndRows(profileId, boardId)
    if (!loaded) return res.status(404).json({ error: stt('Arşiv bulunamadı') })

    const type = req.body?.type === 'tv' ? 'tv' : 'movie'
    const genreIds = Array.isArray(req.body?.genreIds) ? req.body.genreIds.filter((n) => Number.isInteger(n)) : []
    // "Gelmesin" dediği türler (ters filtre).
    const excludeGenreIds = Array.isArray(req.body?.excludeGenreIds) ? req.body.excludeGenreIds.filter((n) => Number.isInteger(n)) : []
    const count = Math.max(1, Math.min(40, Number(req.body?.count) || 10))
    const sort = ['popular', 'top', 'new'].includes(req.body?.sort) ? req.body.sort : 'popular'

    // "En yüksek puanlı": az oylu yeni yapımlar (ör. 400 oyla 9.2) klasiklerin önüne geçmesin — yeni kullanıcı
    // denemesinde Baba 7. sıradaydı. Daha yüksek oy sınırı + henüz çıkmamışlar hariç.
    const params = { language: tmdbLang(), include_adult: 'false', 'vote_count.gte': sort === 'top' ? (type === 'tv' ? 500 : 2000) : 50 }
    if (sort === 'top') {
      const today = localDay()
      params[type === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte'] = today
    }
    if (genreIds.length) params.with_genres = genreIds.join(',')
    if (excludeGenreIds.length) params.without_genres = excludeGenreIds.join(',')
    params.sort_by = sort === 'top' ? 'vote_average.desc' : sort === 'new' ? (type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc') : 'popularity.desc'
    if (sort === 'new') {
      // "Yeni" = son iki yılda çıkmış ve bugüne kadar yayınlanmış (henüz çıkmamışlar değil).
      const today = localDay()
      const twoYearsAgo = localDay(new Date(Date.now() - 2 * 365 * 864e5))
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
    res.status(500).json({ error: stt('Keşfet sonuçları alınamadı') })
  }
})

// Arşivde OLMAYAN tek bir TMDB içeriğinin önizlemesi (Ne İzlesem'in TMDB modunda kazanan için):
// türler, süre/sezon, Türkiye'deki platformlar ve arşivde olup olmadığı.
app.get('/api/profiles/:profileId/tmdb-item/:boardId/:mediaType/:tmdbId', async (req, res) => {
  try {
    const { profileId, boardId, mediaType, tmdbId } = req.params
    if (mediaType !== 'movie' && mediaType !== 'tv') return res.status(400).json({ error: stt('Geçersiz içerik') })
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.status(400).json({ error: stt('TMDB API anahtarı gerekli') })
    const [d, prov, trailer] = await Promise.all([
      tmdbGet(`/${mediaType}/${tmdbId}`, { language: tmdbLang(), append_to_response: 'images', include_image_language: `${serverLang()},en,null` }, apiKey),
      tmdbGet(`/${mediaType}/${tmdbId}/watch/providers`, {}, apiKey),
      getTrailerUrl(mediaType, tmdbId, apiKey).catch(() => null),
    ])
    if (!d) return res.status(404).json({ error: stt('İçerik bulunamadı') })
    const card = toCard(d, mediaType)
    // Arşivdeki detay penceresiyle aynı görünüm için: büyük yatay görsel, başlık logosu (Kapak
    // Adı) ve fragman.
    const logo = pickLogo(d.images)
    const loaded = loadBoardAndRows(profileId, boardId)
    const tr = prov?.results?.[serverRegion()]
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
    res.status(500).json({ error: stt('İçerik bilgisi alınamadı') })
  }
})

app.post('/api/profiles/:profileId/tmdb-dismiss', (req, res) => {
  const { tmdbId, mediaType } = req.body ?? {}
  if (!tmdbId || !mediaType) return res.status(400).json({ error: stt('Geçersiz içerik') })
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

// Kullanıcı: "yeni sezon çıkınca İzleniyor'a alsın" ve "haber versin". İzlendi durumundaki dizilere
// bakılır: sonradan yeni bölüm yayınlandıysa durum İzleniyor olur + bildirim; yeni sezonun tarihi
// açıklandıysa (henüz çıkmadıysa) sadece bir kez duyuru bildirimi.
const finishedCheckAt = new Map()
const FINISHED_CHECK_MS = 6 * 60 * 60 * 1000
async function checkFinishedSeries(profileId, boardId, apiKey) {
  const k = `${profileId}:${boardId}`
  if (Date.now() - (finishedCheckAt.get(k) ?? 0) < FINISHED_CHECK_MS) return
  finishedCheckAt.set(k, Date.now())
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return
  const { board } = loaded
  const durumProp = resolveRole(board, 'durum')
  const izlendi = resolveStatusOption(board, 'izlendi')
  const izleniyor = resolveStatusOption(board, 'izleniyor')
  const dateProp = resolveRole(board, 'izlemeTarihi')
  if (!durumProp || !izlendi || !izleniyor) return
  const refs = readJson(profileTmdbFile(profileId), {})
  const watched = readJson(profileWatchedFile(profileId), {})
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  const today = localToday()
  for (const row of loaded.rows.filter((r) => r.values[durumProp.id] === izlendi)) {
    const ref = refs[row.id]
    if (!ref || ref.mediaType !== 'tv') continue
    const st = await getTvStatus(ref.id, apiKey)
    if (!st) continue
    saveShowInfo(profileId, row.id, st)
    const title = String((tp && row.values[tp.id]) || stt('Dizi'))
    // En son ne zaman izledin: bölüm işaretleri ya da izleme tarihi
    const seen = watched[row.id] ?? {}
    const dv = dateProp ? row.values[dateProp.id] : null
    const dates = [...Object.values(seen).flat(), ...(Array.isArray(dv) ? dv : dv ? [dv] : [])
        .map((x) => String(x).split('/').pop())
        // "Sadece yıl" (2019) yılın sonu sayılır; "Hatırlamıyorum" (?) hesaba katılmaz.
        .map((d) => (/^\d{4}$/.test(d) ? `${d}-12-31` : d))
        .filter((d) => /^\d{4}-/.test(d))].filter(Boolean).sort()
    // Ne izleme tarihi ne bölüm işareti varsa (ör. Notion'dan "Bitti" diye aktarılmış dizi) ölçü, kaydın ARGUS'a
    // eklendiği gün — yoksa yıllar önce çıkmış son bölüm "yeni" sayılıp dizi İzleniyor'a alınıyordu (yeni kullanıcı
    // denemesinde Game of Thrones, Sherlock… hepsi böyle oldu).
    const added = row.createdAt ? new Date(row.createdAt) : null
    const addedDay = added ? `${added.getFullYear()}-${String(added.getMonth() + 1).padStart(2, '0')}-${String(added.getDate()).padStart(2, '0')}` : ''
    const lastWatch = dates[dates.length - 1] ?? addedDay
    const lastKey = st.last ? `${st.last.season}-${st.last.episode}` : ''
    const newAired = st.last && st.last.airDate && st.last.airDate <= today && !(seen[lastKey]?.length > 0) && (!lastWatch || st.last.airDate > lastWatch)
    if (newAired) {
      const rowsFile = profileRowsFile(profileId, boardId)
      const rows = readJson(rowsFile, [])
      const r = rows.find((x) => x.id === row.id)
      if (r && r.values[durumProp.id] === izlendi) {
        r.values = { ...r.values, [durumProp.id]: izleniyor }
        r.updatedAt = Date.now()
        writeJson(rowsFile, rows)
        pushNotification(profileId, {
          key: `new:${row.id}:${lastKey}`,
          type: 'newSeason',
          boardId,
          rowId: row.id,
          title,
          text: stt('Yeni bölüm çıktı (S{0}B{1}, {2}) — durumu İzleniyor\'a alındı.', st.last.season, st.last.episode, langDate(st.last.airDate)),
        })
      }
      continue
    }
    if (st.next && st.next.episode === 1 && st.next.airDate && st.next.airDate > today) {
      pushNotification(profileId, {
        key: `announce:${row.id}:${st.next.season}`,
        type: 'announce',
        boardId,
        rowId: row.id,
        title,
        text: stt('{0}. sezon {1}\'de başlıyor.', st.next.season, langDate(st.next.airDate)),
      })
    }
  }
}

// Detay penceresindeki "Dizi bitti / Yeni sezon" etiketi için saklanan dizi durumları (TMDB'ye gitmez).
app.get('/api/profiles/:profileId/show-status', (req, res) => {
  const refs = readJson(profileTmdbFile(req.params.profileId), {})
  const out = {}
  for (const [rowId, r] of Object.entries(refs)) if (r?.show) out[rowId] = r.show
  res.json(out)
})

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
      if (st) saveShowInfo(profileId, row.id, st)
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
      const today = localDay()
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
    // Bitirilmiş (İzlendi) dizilerde yeni sezon kontrolü — cevabı bekletmesin diye arkada, en fazla 6 saatte bir.
    checkFinishedSeries(profileId, boardId, apiKey).catch((e) => console.error('bitmiş dizi kontrolü hata:', e))
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

// İnternetteki bir görseli (adresi yapıştırılan) medya klasörüne indirir — Koleksiyon'da sembol eklerken.
app.post('/api/medya/from-url', async (req, res) => {
  try {
    const url = String(req.body?.url ?? '').trim()
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: stt('Geçerli bir görsel adresi değil.') })
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ARGUS' }, signal: AbortSignal.timeout(20000) })
    if (!r.ok) return res.status(400).json({ error: stt('Görsel indirilemedi ({0}).', r.status) })
    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim()
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/avif': '.avif' }[type]
    if (!ext) return res.status(400).json({ error: stt('Bu adres bir görsel değil (sayfanın değil, görselin kendi adresini yapıştır).') })
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 15 * 1024 * 1024) return res.status(400).json({ error: stt('Görsel çok büyük (15 MB üstü).') })
    let name = `sembol_${Date.now().toString(36)}${ext}`
    while (fs.existsSync(path.join(MEDYA_DIR, name))) name = `sembol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}${ext}`
    fs.writeFileSync(path.join(MEDYA_DIR, name), buf)
    res.json({ filename: name })
  } catch (e) {
    res.status(400).json({ error: stt('Görsel indirilemedi.') })
  }
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
    return res.status(500).json({ error: stt('Güncelleme çekilemedi — internet bağlantını kontrol et.') })
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
    launchDetachedRestart(buildRestartScript({ oldPid, batPath: path.join(ROOT, 'ARGUS.bat'), root: ROOT, launcherPath: path.join(ROOT, 'app', 'launcher', 'baslat.ps1'), exePath: path.join(ROOT, 'ARGUS.exe') }), ROOT)
  } catch {}
})

// Özellik anahtarları (app/features.json, kodla birlikte GitHub'a gider). Geliştirici bilgisayarında her şey
// açık; bazı özellikler (ör. Flashback — yıllık özet) diğer kullanıcılara buradan açılıp kapatılıyor.
const FEATURES_FILE = path.join(__dirname, '..', 'features.json')
const isDevMachine = () => fs.existsSync(path.join(ROOT, '.gelistirici'))
// Flashback (yıllık özet) diğer kullanıcılara açıldığında her profile bir kez bildirim düşer (kullanıcı "onlarda açılınca
// haberleri olsun" dedi). Aynı anahtarla ikinci kez eklenmez (bkz. pushNotification); geliştirici
// bilgisayarında zaten hep açık olduğu için orada gönderilmez.
function announceFeatures(f) {
  if (isDevMachine()) return
  if (!f.wrappedForAll) return
  for (const p of readProfiles()) {
    try {
      pushNotification(p.id, {
        key: 'feature:wrapped',
        type: 'feature',
        title: stt('Yeni: Flashback'),
        text: stt('Yılın nasıl geçti? Toplam ekran süren, izleyici unvanın, maratonların, en sevdiklerin ve paylaşabileceğin bir hikâye kartı. Profil menüsünde.'),
        link: '/flashback',
      })
    } catch {
      /* bildirim yazılamadıysa önemsiz */
    }
  }
}

// Arayüz tercihleri (kapatılan sütunlar, tablo sıklığı, tema, TMDB tercihleri, "bir daha sorma"lar…).
// Eskiden sadece tarayıcının kendi hafızasındaydı (localStorage); ARGUS kendi uygulamasına (Electron)
// geçince uygulamanın hafızası tarayıcınınkinden ayrı olduğu için hepsi kaybolacaktı. Artık burada da
// tutuluyor (bkz. src/lib/uiPrefs.ts): uygulama ve tarayıcı aynı tercihleri görür. migratedAt: tarayıcıdaki
// eski tercihler bir kez aktarıldı mı (bkz. desktop/main.cjs'teki ilk açılış).
const UI_PREFS_FILE = path.join(DATA_DIR, 'ui-prefs.json')
app.get('/api/ui-prefs', (req, res) => {
  res.json(readJson(UI_PREFS_FILE, { prefs: {} }))
})
app.post('/api/ui-prefs', (req, res) => {
  const data = readJson(UI_PREFS_FILE, { prefs: {} })
  data.prefs = data.prefs ?? {}
  const set = req.body?.set && typeof req.body.set === 'object' ? req.body.set : {}
  for (const [k, v] of Object.entries(set)) if (/^argus_/.test(k) && typeof v === 'string' && v.length < 200000) data.prefs[k] = v
  for (const k of Array.isArray(req.body?.remove) ? req.body.remove : []) delete data.prefs[k]
  if (req.body?.migrate) data.migratedAt = Date.now()
  rawWriteJson(UI_PREFS_FILE, data)
  res.json({ ok: true })
})

// Diğer bilgisayarlarda anahtarlar GitHub'daki güncel features.json'dan okunur (20 sn'de en çok bir kez
// bakılır), kod güncellemesi beklenmez. Kullanıcı "Flashback'i açtım ama arkadaşa güncelle bildirimi
// gitmedi" dedi: anahtar sadece bir açma/kapama, özelliğin kodu zaten orada — açınca birkaç dakikada
// kendiliğinden görünsün. İnternet yoksa yerel dosyaya düşülür.
const remoteFeatures = { at: 0, value: null, pending: null }
function gitOut(args, timeout) {
  return new Promise((resolve, reject) =>
    execFile('git', args, { cwd: ROOT, timeout, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(String(stdout)))),
  )
}
async function currentFeatures() {
  const local = readJson(FEATURES_FILE, {})
  if (isDevMachine()) return local
  if (Date.now() - remoteFeatures.at > 20_000 && !remoteFeatures.pending) {
    remoteFeatures.pending = (async () => {
      try {
        await gitOut(['fetch', '--quiet', 'origin'], 15000)
        remoteFeatures.value = JSON.parse(await gitOut(['show', '@{u}:app/features.json'], 5000))
      } catch {
        /* internet yok — son bilinen ya da yerel değer */
      } finally {
        remoteFeatures.at = Date.now()
        remoteFeatures.pending = null
      }
    })()
  }
  // İlk seferde cevabı bekle; sonrakilerde eldeki değerle hemen dön, arkada tazelensin.
  if (remoteFeatures.pending && !remoteFeatures.value) await remoteFeatures.pending
  return remoteFeatures.value ?? local
}

app.get('/api/features', async (req, res) => {
  const f = await currentFeatures()
  announceFeatures(f)
  res.json({ developer: isDevMachine(), wrappedForAll: Boolean(f.wrappedForAll) })
})
app.post('/api/features', async (req, res) => {
  if (!isDevMachine()) return res.status(403).json({ error: stt('Bu ayar sadece geliştirici bilgisayarında değiştirilebilir.') })
  const f = readJson(FEATURES_FILE, {})
  if (typeof req.body?.wrappedForAll === 'boolean') f.wrappedForAll = req.body.wrappedForAll
  fs.writeFileSync(FEATURES_FILE, JSON.stringify(f, null, 2) + '\n', 'utf-8')
  // Kullanıcı ayrıca "gönder" demek zorunda kalmasın: sadece bu dosya Git'e gönderilir (bkz. featurePublish.js)
  const pub = await publishFile(ROOT, FEATURES_FILE, f.wrappedForAll ? 'Flashback diger kullanicilara acildi' : 'Flashback diger kullanicilara kapatildi')
  res.json({ ok: true, wrappedForAll: Boolean(f.wrappedForAll), ...pub })
})

// Paketli arayüz (bkz. start.mjs): ARGUS_SERVE_UI varsa dist/ klasörü de bu sunucudan, 5173 portundan
// sunuluyor — ayrı bir Vite sürecine gerek kalmıyor. index.html önbelleğe alınmıyor (güncellemeden sonra
// hemen yeni sürüm gelsin), adlarında içerik özeti olan diğer dosyalar uzun süre önbellekte kalabiliyor.
if (process.env.ARGUS_SERVE_UI) {
  const DIST = path.join(__dirname, '..', 'dist')
  app.use(
    express.static(DIST, {
      index: false,
      setHeaders: (res, file) =>
        res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'),
    }),
  )
  // Sayfa adresleri (/board/..., /takvim ...) hep index.html'e düşer; API ve medya hariç.
  app.get(/^(?!\/api\/|\/medya\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(DIST, 'index.html'))
  })
  const UI_PORT = Number(process.env.UI_PORT) || 5173
  app.listen(UI_PORT, () => console.log(`ARGUS arayüzü: http://localhost:${UI_PORT}`))
}

// Bir istekte hata çıkarsa (ör. "okunamadı, kaydedilmedi") arayüze anlaşılır mesajla dönsün.
app.use((err, req, res, _next) => {
  console.error('Hata:', err)
  if (!res.headersSent) res.status(500).json({ error: err?.message || stt('Sunucuda hata oluştu.') })
})

const PORT = Number(process.env.PORT) || 4000
app.listen(PORT, () => {
  console.log(`ARGUS yerel sunucusu çalışıyor: http://localhost:${PORT}`)
  console.log(`Veriler: ${DATA_DIR}`)
  console.log(`Medya: ${MEDYA_DIR}`)
})
