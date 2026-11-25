// Artık veriler (Sağlık Kontrolü, v1.25): bir kayıt ya da arşiv silinince ona ait TMDB eşleşmesi, bölüm listesi, kadro,
// bölüm işaretleri, şarkılar… dosyalarda sonsuza dek kalıyordu. Burada sayılır ve istenince temizlenir.
// Geçmişten geri getirilebilecek kayıtlar (geçmiş kaydında "silindi" olarak duranlar ve son 30 günün günlük hallerinde
// geçenler) korunur — geri getirilince afişinden bölümlerine her şeyi yerinde dursun.
import fs from 'node:fs'
import path from 'node:path'
import { app } from '../app.js'
import { profileBoardsFile, profileDir, profileRowsFile, readJson, readJsonShared, unreadableFiles, writeJson } from '../storage.js'
import { stt } from '../lang.js'

// rowId ile anahtarlanan dosyalar
const MAP_FILES = ['tmdb.json', 'episodes.json', 'cast.json', 'watched.json', 'songs.json', 'progress.json', 'planlar.json']
const KEEP_SNAP_DAYS = 30

// Arşiv dosyalarından biri o an okunamadıysa (kilitli/bozuk) null: içindeki kayıtlar "silinmiş" sanılıp bölümleri,
// izleme işaretleri, TMDB eşleşmeleri temizlenmesin.
function liveRowIds(profileId) {
  const ids = new Set()
  const boardsFile = profileBoardsFile(profileId)
  const boards = readJsonShared(boardsFile, [])
  if (unreadableFiles.has(boardsFile)) return null
  for (const b of boards) {
    const rowsFile = profileRowsFile(profileId, b.id)
    const rows = readJsonShared(rowsFile, [])
    if (unreadableFiles.has(rowsFile)) return null
    for (const r of rows) ids.add(r.id)
  }
  return ids
}

// Geçmişten geri getirilebilecek kayıtlar
function restorableRowIds(profileId) {
  const ids = new Set()
  const hist = path.join(profileDir(profileId), 'history')
  const cut = new Date(Date.now() - KEEP_SNAP_DAYS * 864e5)
  const cutDay = `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, '0')}-${String(cut.getDate()).padStart(2, '0')}`
  let boards = []
  try {
    boards = fs.readdirSync(hist)
  } catch {
    return ids
  }
  for (const b of boards) {
    const dir = path.join(hist, b)
    let files = []
    try {
      files = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const f of files) {
      if (!/^log-\d{4}-\d{2}\.jsonl$/.test(f)) continue
      try {
        for (const line of fs.readFileSync(path.join(dir, f), 'utf-8').split('\n')) {
          if (!line.includes('"delete"')) continue
          try {
            const e = JSON.parse(line)
            if (e.type === 'delete' && e.rowId) ids.add(e.rowId)
          } catch {}
        }
      } catch {}
    }
    let days = []
    try {
      days = fs.readdirSync(path.join(dir, 'snap'))
    } catch {}
    for (const d of days) {
      if (d.slice(0, 10) < cutDay) continue
      for (const r of readJson(path.join(dir, 'snap', d, 'rows.json'), [])) if (r?.id) ids.add(r.id)
    }
  }
  return ids
}

function scan(profileId, clean) {
  const dir = profileDir(profileId)
  const live = liveRowIds(profileId)
  if (!live) {
    if (clean) throw new Error(stt('Arşiv dosyalarından biri şu an okunamadı — verin korunuyor, hiçbir şey silinmedi. ARGUS\'u yeniden başlatıp tekrar dene.'))
    return { files: {}, total: 0, protected: 0 }
  }
  const keep = restorableRowIds(profileId)
  const orphan = (id) => !live.has(id) && !keep.has(id)
  const files = {}
  let total = 0
  for (const name of MAP_FILES) {
    const file = path.join(dir, name)
    if (!fs.existsSync(file)) continue
    const map = clean ? readJson(file, null) : readJsonShared(file, null)
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue
    const gone = Object.keys(map).filter(orphan)
    if (!gone.length) continue
    files[name] = gone.length
    total += gone.length
    if (clean) {
      for (const k of gone) delete map[k]
      writeJson(file, map)
    }
  }
  // Son izlenenler (liste) ve Koleksiyon'daki sembol/raf ayarları (items: { rowId: … })
  const recentFile = path.join(dir, 'recent-watch.json')
  const recent = readJson(recentFile, null)
  if (Array.isArray(recent)) {
    const n = recent.filter((x) => orphan(x?.rowId)).length
    if (n) {
      files['recent-watch.json'] = n
      total += n
      if (clean) writeJson(recentFile, recent.filter((x) => !orphan(x?.rowId)))
    }
  }
  const kolFile = path.join(dir, 'koleksiyon.json')
  const kol = readJson(kolFile, null)
  if (kol?.items && typeof kol.items === 'object') {
    const gone = Object.keys(kol.items).filter(orphan)
    if (gone.length) {
      files['koleksiyon.json'] = gone.length
      total += gone.length
      if (clean) {
        for (const k of gone) delete kol.items[k]
        writeJson(kolFile, kol)
      }
    }
  }
  return { files, total, protected: [...keep].filter((id) => !live.has(id)).length }
}

app.get('/api/profiles/:profileId/orphans', (req, res) => {
  res.json(scan(req.params.profileId, false))
})

app.post('/api/profiles/:profileId/orphans/clean', (req, res) => {
  const out = scan(req.params.profileId, true)
  res.json({ ok: true, removed: out.files, total: out.total })
})
