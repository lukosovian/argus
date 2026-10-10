// Arşiv geçmişi — kullanıcı Notion'daki sayfa geçmişi gibi bir şey istedi ("arşiv tablosunun geçmiş
// hallerini tutsun"), süre değil BOYUT sınırıyla: varsayılan 5 GB, aşınca uygulama "alanı artırayım mı,
// en eskilerden mi sileyim" diye soruyor. İki şey tutuluyor (data/profiles/<profil>/history/<arşiv>/):
//   - log-YYYY-MM.jsonl: her kayıt değişikliği (eklendi / değişti: hangi alan neyden neye / silindi,
//     silinende kaydın tamamı — geri getirebilmek için). Bütün yazmalar tek yerden (writeJson) geçtiği
//     için TMDB doldurma, toplu ekleme, tablo düzenlemeleri... hepsi kendiliğinden kaydediliyor.
//   - snap/YYYY-MM-DD/: o günün İLK değişikliğinden hemen önceki hali (kayıtlar + arşiv şeması) —
//     "arşivi bu günün başındaki haline döndür" için.
import fs from 'fs'
import path from 'path'
import { stt } from './lang.js'

const GB = 1024 * 1024 * 1024
const DEFAULT_LIMIT = 5 * GB

let DATA_DIR = ''
let PROFILES_DIR = ''
let readJson = (_f, fb) => fb
let rawWrite = (_f, _d) => {}
let makeId = () => Math.random().toString(36).slice(2, 10)

export function initHistory(opts) {
  DATA_DIR = opts.dataDir
  PROFILES_DIR = opts.profilesDir
  readJson = opts.readJson
  rawWrite = opts.rawWrite
  makeId = opts.makeId
}

const settingsFile = () => path.join(DATA_DIR, 'history-settings.json')
export function historySettings() {
  const s = readJson(settingsFile(), {})
  return { limitBytes: typeof s.limitBytes === 'number' && s.limitBytes > 0 ? s.limitBytes : DEFAULT_LIMIT }
}

function histDir(profileId, boardId) {
  return path.join(PROFILES_DIR, profileId, 'history', boardId)
}

function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Aşırı uzun değerler (sinopsis vb.) log'u şişirmesin — değişiklik listesinde görmek için yeter.
function clip(v) {
  if (typeof v === 'string' && v.length > 400) return v.slice(0, 400) + '…'
  return v
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function titleOf(board, row) {
  const tp = board?.properties?.find((p) => p.id === board.titlePropertyId)
  const v = tp ? row?.values?.[tp.id] : ''
  return typeof v === 'string' ? v : ''
}

// Arşiv şeması (boards.json, ~2 MB) her kayıt yazımında yeniden okunmasın — dosya değişmediyse hafızadaki
// kopya kullanılır (sadece başlık bulmak için okunuyor, değiştirilmiyor). Hız ölçümünde fark edildi.
const boardsCache = new Map()
export function findBoard(profileId, boardId) {
  const file = path.join(PROFILES_DIR, profileId, 'boards.json')
  let stamp = ''
  try {
    const st = fs.statSync(file)
    stamp = st.mtimeMs + ':' + st.size
  } catch {}
  let hit = boardsCache.get(file)
  if (!hit || hit.stamp !== stamp) {
    hit = { stamp, boards: readJson(file, []) }
    boardsCache.set(file, hit)
  }
  return (Array.isArray(hit.boards) ? hit.boards : []).find((b) => b.id === boardId) ?? null
}

function appendLog(profileId, boardId, entries) {
  if (entries.length === 0) return
  const dir = histDir(profileId, boardId)
  fs.mkdirSync(dir, { recursive: true })
  const now = new Date()
  const file = path.join(dir, `log-${localDay(now).slice(0, 7)}.jsonl`)
  fs.appendFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8')
  sizeDirty = true
}

// Günün ilk değişikliğinden önce o arşivin hali (kayıtlar + şema) saklanır.
function ensureSnapshot(profileId, boardId, oldRows, oldBoard) {
  const dir = path.join(histDir(profileId, boardId), 'snap', localDay())
  if (fs.existsSync(path.join(dir, 'rows.json'))) return
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'rows.json'), JSON.stringify(oldRows ?? []), 'utf-8')
  if (oldBoard) fs.writeFileSync(path.join(dir, 'board.json'), JSON.stringify(oldBoard), 'utf-8')
  sizeDirty = true
}

function norm(file) {
  return file.split(path.sep).join('/')
}

// writeJson her yazmadan ÖNCE bunu çağırıyor. Kayıt dosyası ya da boards.json ise eski haliyle
// karşılaştırıp log'a yazar ve gerekiyorsa günün ilk hali olarak saklar. Hata olursa asıl yazma
// hiçbir zaman engellenmesin diye her şey try içinde.
// Geri alma/geri yükleme sırasında yapılan yazmaları işaretlemek için (listede 'Geri getirildi' görünsün).
let writeNote = null

export function beforeWrite(file, data) {
  try {
    const f = norm(file)
    const rowsMatch = f.match(/\/profiles\/([^/]+)\/rows\/([^/.]+)\.json$/)
    if (rowsMatch) {
      const [, profileId, boardId] = rowsMatch
      const oldRows = readJson(file, [])
      const board = findBoard(profileId, boardId)
      ensureSnapshot(profileId, boardId, oldRows, board)
      const oldById = new Map((Array.isArray(oldRows) ? oldRows : []).map((r) => [r.id, r]))
      const newById = new Map((Array.isArray(data) ? data : []).map((r) => [r.id, r]))
      const t = Date.now()
      const entries = []
      for (const [id, r] of newById) {
        const o = oldById.get(id)
        if (!o) {
          entries.push({ id: makeId(), t, type: 'create', rowId: id, title: titleOf(board, r), ...(writeNote ? { note: writeNote } : {}) })
          continue
        }
        const changes = []
        const keys = new Set([...Object.keys(o.values ?? {}), ...Object.keys(r.values ?? {})])
        for (const k of keys) {
          const a = o.values?.[k]
          const b = r.values?.[k]
          if (!same(a, b)) changes.push({ prop: k, from: clip(a ?? null), to: clip(b ?? null) })
        }
        if (changes.length) entries.push({ id: makeId(), t, type: 'update', rowId: id, title: titleOf(board, r) || titleOf(board, o), changes, ...(writeNote ? { note: writeNote } : {}) })
      }
      for (const [id, o] of oldById) {
        if (!newById.has(id)) entries.push({ id: makeId(), t, type: 'delete', rowId: id, title: titleOf(board, o), row: o, ...(writeNote ? { note: writeNote } : {}) })
      }
      appendLog(profileId, boardId, entries)
      return
    }
    const boardsMatch = f.match(/\/profiles\/([^/]+)\/boards\.json$/)
    if (boardsMatch) {
      const [, profileId] = boardsMatch
      const oldBoards = readJson(file, [])
      const newBoards = Array.isArray(data) ? data : []
      for (const ob of Array.isArray(oldBoards) ? oldBoards : []) {
        const nb = newBoards.find((b) => b.id === ob.id)
        if (nb && same(ob, nb)) continue
        const rows = readJson(path.join(PROFILES_DIR, profileId, 'rows', `${ob.id}.json`), [])
        ensureSnapshot(profileId, ob.id, rows, ob)
      }
    }
  } catch {
    // geçmiş tutulamasa da asıl kayıt yapılır
  }
}

// ---- Boyut -------------------------------------------------------------------------------------

let sizeCache = 0
let sizeDirty = true
function dirSize(dir) {
  let total = 0
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) total += dirSize(p)
    else {
      try {
        total += fs.statSync(p).size
      } catch {}
    }
  }
  return total
}
export function historyBytes() {
  if (!sizeDirty) return sizeCache
  let total = 0
  for (const prof of safeReaddir(PROFILES_DIR)) total += dirSize(path.join(PROFILES_DIR, prof, 'history'))
  sizeCache = total
  sizeDirty = false
  return total
}
function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

// En eskiden başlayarak (günlük haller, sonra eski ay log'ları) sınırın %90'ının altına inene kadar sil.
function trimOldest(limit) {
  const target = limit * 0.9
  const items = []
  for (const prof of safeReaddir(PROFILES_DIR)) {
    const h = path.join(PROFILES_DIR, prof, 'history')
    for (const board of safeReaddir(h)) {
      for (const day of safeReaddir(path.join(h, board, 'snap'))) items.push({ key: day, p: path.join(h, board, 'snap', day), dir: true })
      for (const f of safeReaddir(path.join(h, board))) {
        const m = f.match(/^log-(\d{4}-\d{2})\.jsonl$/)
        if (m) items.push({ key: `${m[1]}-99`, p: path.join(h, board, f), dir: false })
      }
    }
  }
  items.sort((a, b) => (a.key < b.key ? -1 : 1))
  let removed = 0
  for (const it of items) {
    sizeDirty = true
    if (historyBytes() <= target) break
    try {
      fs.rmSync(it.p, { recursive: true, force: true })
      removed++
    } catch {}
  }
  sizeDirty = true
  return removed
}

// ---- Okuma ---------------------------------------------------------------------------------------

function readLogs(profileId, boardId) {
  const dir = histDir(profileId, boardId)
  const files = safeReaddir(dir).filter((f) => /^log-\d{4}-\d{2}\.jsonl$/.test(f)).sort()
  const out = []
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf-8')
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        out.push(JSON.parse(line))
      } catch {}
    }
  }
  return out
}

export function registerHistoryRoutes(app) {
  app.get('/api/history/status', (req, res) => {
    const { limitBytes } = historySettings()
    const bytes = historyBytes()
    res.json({ bytes, limitBytes, over: bytes > limitBytes })
  })

  app.post('/api/history/limit', (req, res) => {
    const limitBytes = Number(req.body?.limitBytes)
    if (!Number.isFinite(limitBytes) || limitBytes < 100 * 1024 * 1024) return res.status(400).json({ error: stt('Geçersiz sınır') })
    rawWrite(settingsFile(), { ...readJson(settingsFile(), {}), limitBytes })
    res.json({ ok: true, limitBytes })
  })

  app.post('/api/history/trim', (req, res) => {
    const removed = trimOldest(historySettings().limitBytes)
    res.json({ ok: true, removed, bytes: historyBytes() })
  })

  // Gün gün özet
  app.get('/api/profiles/:profileId/history/:boardId/days', (req, res) => {
    const { profileId, boardId } = req.params
    const days = new Map()
    for (const e of readLogs(profileId, boardId)) {
      const d = localDay(new Date(e.t))
      const x = days.get(d) ?? { day: d, created: 0, updated: 0, deleted: 0 }
      if (e.type === 'create') x.created++
      else if (e.type === 'update') x.updated++
      else if (e.type === 'delete') x.deleted++
      days.set(d, x)
    }
    const snaps = new Set(safeReaddir(path.join(histDir(profileId, boardId), 'snap')))
    const list = [...days.values()].map((d) => ({ ...d, snapshot: snaps.has(d.day) }))
    for (const s of snaps) if (!days.has(s)) list.push({ day: s, created: 0, updated: 0, deleted: 0, snapshot: true })
    list.sort((a, b) => (a.day < b.day ? 1 : -1))
    res.json({ days: list })
  })

  app.get('/api/profiles/:profileId/history/:boardId/day/:day', (req, res) => {
    const { profileId, boardId, day } = req.params
    const entries = readLogs(profileId, boardId).filter((e) => localDay(new Date(e.t)) === day)
    res.json({ entries: entries.reverse() })
  })

  app.get('/api/profiles/:profileId/history/:boardId/row/:rowId', (req, res) => {
    const { profileId, boardId, rowId } = req.params
    const entries = readLogs(profileId, boardId).filter((e) => e.rowId === rowId)
    res.json({ entries: entries.reverse().slice(0, 100) })
  })

  // Tek bir değişikliği geri al: silineni geri getir / değişen alanları eski haline döndür / ekleneni sil.
  app.post('/api/profiles/:profileId/history/:boardId/undo', (req, res) => {
    const { profileId, boardId } = req.params
    const entry = readLogs(profileId, boardId).find((e) => e.id === req.body?.entryId)
    if (!entry) return res.status(404).json({ error: stt('Bu değişiklik bulunamadı') })
    const file = path.join(PROFILES_DIR, profileId, 'rows', `${boardId}.json`)
    const rows = readJson(file, [])
    if (entry.type === 'delete') {
      if (rows.some((r) => r.id === entry.rowId)) return res.status(400).json({ error: stt('Bu kayıt zaten arşivinde') })
      rows.push(entry.row)
    } else if (entry.type === 'update') {
      const r = rows.find((x) => x.id === entry.rowId)
      if (!r) return res.status(400).json({ error: stt('Kayıt artık yok — önce silinmiş halini geri getir') })
      r.values = { ...r.values }
      for (const c of entry.changes ?? []) {
        if (typeof c.from === 'string' && c.from.endsWith('…')) continue // kısaltılmış uzun metinler geri yazılmaz
        if (c.from === null) delete r.values[c.prop]
        else r.values[c.prop] = c.from
      }
      r.updatedAt = Date.now()
    } else if (entry.type === 'create') {
      const i = rows.findIndex((x) => x.id === entry.rowId)
      if (i < 0) return res.status(400).json({ error: stt('Bu kayıt zaten silinmiş') })
      rows.splice(i, 1)
    }
    // writeJson kancası da çağrılsın diye dışarıdan verilen yazıcıyla
    writeNote = 'undo'
    try {
      historyWrite(file, rows)
    } finally {
      writeNote = null
    }
    res.json({ ok: true })
  })

  // Arşivi bir günün başındaki haline döndür (şu anki hali de o günün geçmişine düşer, geri alınabilir).
  app.post('/api/profiles/:profileId/history/:boardId/restore-day', (req, res) => {
    const { profileId, boardId } = req.params
    const day = String(req.body?.day ?? '')
    const dir = path.join(histDir(profileId, boardId), 'snap', day)
    const rows = readJson(path.join(dir, 'rows.json'), null)
    if (!rows) return res.status(404).json({ error: stt('O günün kaydı yok') })
    // Dönmeden önceki hal ayrı bir kayıt olarak saklanır — yanlışlıkla dönülürse geri gelinebilsin.
    const now = new Date()
    const beforeDir = path.join(histDir(profileId, boardId), 'snap', `${localDay(now)}_donus-oncesi-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`)
    fs.mkdirSync(beforeDir, { recursive: true })
    fs.writeFileSync(path.join(beforeDir, 'rows.json'), JSON.stringify(readJson(path.join(PROFILES_DIR, profileId, 'rows', `${boardId}.json`), [])), 'utf-8')
    const curBoard = findBoard(profileId, boardId)
    if (curBoard) fs.writeFileSync(path.join(beforeDir, 'board.json'), JSON.stringify(curBoard), 'utf-8')
    sizeDirty = true
    const board = readJson(path.join(dir, 'board.json'), null)
    if (board) {
      const boardsFile = path.join(PROFILES_DIR, profileId, 'boards.json')
      const boards = readJson(boardsFile, [])
      const i = boards.findIndex((b) => b.id === boardId)
      if (i >= 0) {
        boards[i] = board
        historyWrite(boardsFile, boards)
      }
    }
    writeNote = 'restore'
    try {
      historyWrite(path.join(PROFILES_DIR, profileId, 'rows', `${boardId}.json`), rows)
    } finally {
      writeNote = null
    }
    res.json({ ok: true, count: rows.length })
  })
}

let historyWrite = (f, d) => rawWrite(f, d)
export function setHistoryWriter(fn) {
  historyWrite = fn
}
