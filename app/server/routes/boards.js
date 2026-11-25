// Arşivler ve kayıtlar: CRUD, Sağlık Kontrolü, mükerrerler, şablonlar.
import fs from 'node:fs'
import path from 'node:path'
import { ensureStatusOption, resolveRole, resolveStatusOption, showEnded, watchedStatusIds } from '../roles.js'
import { findBoard as findBoardCached } from '../history.js'
import { stt } from '../lang.js'
import { opAt, reportSkipped } from '../sync.js'
import { PROFILES_DIR, ROOT, loadBoardAndRows, localToday, makeId, profileBoardsFile, profileCastFile, profileEpisodesFile, profileRowsFile, profileTemplatesFile, profileTmdbFile, profileWatchedFile, readJson, readJsonShared, readProfiles, writeJson } from '../storage.js'
import { app } from '../app.js'
import { normalizeText, tmdbKey } from '../tmdb.js'
import { planIfUpcoming, recordRowWatchTime, setAskRating, shouldAskRating } from '../watchLogic.js'

app.get('/api/profiles/:profileId/boards', (req, res) => {
  res.json(readJsonShared(profileBoardsFile(req.params.profileId), []))
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

// Çocuk profili (v1.23.4, profil düzenleme penceresi): yaş sınırı 13+ ve üstü olan yapımlar bu profilde hiç gönderilmez.
// Kural v1.26'dan beri kid.js'te — Keşfet, Evrenler, bölüm listeleri ve bildirimler de aynısını kullanıyor.
import { ADULT_AGE, hideForKid } from '../kid.js'
export { ADULT_AGE, hideForKid }

app.get('/api/profiles/:profileId/boards/:id/rows', (req, res) => {
  res.json(hideForKid(req.params.profileId, req.params.id, readJsonShared(profileRowsFile(req.params.profileId, req.params.id), [])))
})

// Kim izliyor ekranındaki çerçeveler (Ekstralar › Kazanılan çerçeveler): çerçeveyi açmış profillerin izlediği sayısı
app.get('/api/profile-frames', (req, res) => {
  const out = {}
  for (const p of readProfiles()) {
    try {
      const home = readJson(path.join(PROFILES_DIR, p.id, 'home-settings.json'), {})
      if (!home?.extras?.avatarFrames || !home.boardId) continue
      const loaded = loadBoardAndRows(p.id, home.boardId)
      if (!loaded) continue
      const durum = resolveRole(loaded.board, 'durum')
      const done = watchedStatusIds(loaded.board)
      out[p.id] = durum ? loaded.rows.filter((r) => done.has(r.values?.[durum.id])).length : 0
    } catch {
      /* tek profil yüzünden durma */
    }
  }
  res.json(out)
})

// "Sağlık Kontrolü" paneli için — bir görsel sütununun değeri diskte gerçekten var olmayan bir
// dosyaya işaret ediyorsa (ör. `medya/` klasöründen elle silinmiş bir dosya) bunu istemci
// tarafından bilemeyiz, sadece sunucu diski kontrol edebilir. Eksik başlık/kapak gibi diğer
// sağlık kontrolleri board+rows verisinden türetilebildiği için tamamen istemci tarafında.
app.get('/api/profiles/:profileId/boards/:id/health', (req, res) => {
  const boardsFile = profileBoardsFile(req.params.profileId)
  const boards = readJsonShared(boardsFile, [])
  const board = boards.find((b) => b.id === req.params.id)
  if (!board) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
  const rows = readJsonShared(profileRowsFile(req.params.profileId, board.id), [])
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
  // TMDB'de olmadığı son güncellemede görülen alanlar (bkz. fillRowFromTmdb › eksik)
  const refs = readJsonShared(profileTmdbFile(req.params.profileId), {})
  const tmdbMissing = {}
  for (const row of rows) if (Array.isArray(refs[row.id]?.eksik) && refs[row.id].eksik.length) tmdbMissing[row.id] = { props: refs[row.id].eksik, at: refs[row.id].baktim ?? null }
  res.json({
    brokenImages,
    duplicates: findDuplicateGroups(req.params.profileId, board, rows),
    tmdbMissing,
    undatedSeries: findUndatedSeries(req.params.profileId, board, rows),
    seriesToFinale: findSeriesToFinale(req.params.profileId, board, rows),
  })
})

// v1.24: durumu İzlendi olan diziler — Sezon Finali (dizi sürüyor) ya da Final'e (dizi bitti) çevrilebilir.
// Kullanıcı "ben de Sezon Finali ve Final kullanmaya geçeyim" dedi; Sağlık Kontrolü'nde tek tuşla geçilir.
export function findSeriesToFinale(profileId, board, rows) {
  const durumProp = resolveRole(board, 'durum')
  const izlendi = resolveStatusOption(board, 'izlendi')
  if (!durumProp || !izlendi) return []
  const refs = readJsonShared(profileTmdbFile(profileId), {})
  return rows
    .filter((r) => r.values[durumProp.id] === izlendi && refs[r.id]?.mediaType === 'tv')
    .map((r) => ({ rowId: r.id, to: showEnded(refs[r.id]?.show?.status) ? 'final' : 'sezonFinali' }))
}

app.post('/api/profiles/:profileId/boards/:id/series-finale', (req, res) => {
  const { profileId, id } = req.params
  const boardsFile = profileBoardsFile(profileId)
  const boards = readJson(boardsFile, [])
  const board = boards.find((b) => b.id === id)
  if (!board) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
  const want = Array.isArray(req.body?.rowIds) ? new Set(req.body.rowIds) : null
  const rowsFile = profileRowsFile(profileId, id)
  const rows = readJson(rowsFile, [])
  const list = findSeriesToFinale(profileId, board, rows).filter((x) => !want || want.has(x.rowId))
  const durumProp = resolveRole(board, 'durum')
  const before = JSON.stringify(durumProp?.options ?? [])
  const ids = { final: list.some((x) => x.to === 'final') ? ensureStatusOption(board, 'final', makeId) : null, sezonFinali: list.some((x) => x.to === 'sezonFinali') ? ensureStatusOption(board, 'sezonFinali', makeId) : null }
  if (JSON.stringify(durumProp?.options ?? []) !== before) writeJson(boardsFile, boards)
  let n = 0
  for (const x of list) {
    const row = rows.find((r) => r.id === x.rowId)
    const to = ids[x.to]
    if (!row || !to) continue
    row.values = { ...row.values, [durumProp.id]: to }
    row.updatedAt = Date.now()
    n++
  }
  if (n) writeJson(rowsFile, rows)
  res.json({ ok: true, changed: n, final: list.filter((x) => x.to === 'final').length, sezonFinali: list.filter((x) => x.to === 'sezonFinali').length })
})

// "İzlendi" olan ama bölümlerinin izleme tarihi olmayan diziler (Sağlık Kontrolü). Kullanıcı "diziyi izlemişim,
// izlendi işaretli ama bölümlerinde tarih yok, bunları göstersin, toplu ya da tek tek tarihleyebileyim" dedi.
// Yayınlanmış ama hiç işaretlenmemiş (ya da boş tarihli) bölümler sayılır; "?" (hatırlamıyorum) tarih sayılır.
// v1.24: Sezon Finali / Final de izlendi sayılır; "İzlenecek ama izleme tarihi var" diziler de listelenir (kullanıcı
// "onları da göstersin" dedi) — bunlar `todo: true` ile gelir.
export function findUndatedSeries(profileId, board, rows) {
  const durumProp = resolveRole(board, 'durum')
  const done = watchedStatusIds(board)
  const izlenecek = resolveStatusOption(board, 'izlenecek')
  const dateProp = resolveRole(board, 'izlemeTarihi')
  if (!durumProp || !done.size) return []
  const hasDate = (row) => {
    const v = dateProp ? row.values[dateProp.id] : null
    return Array.isArray(v) ? v.some(Boolean) : Boolean(v)
  }
  const episodes = readJsonShared(profileEpisodesFile(profileId), {})
  const watched = readJsonShared(profileWatchedFile(profileId), {})
  const today = localToday()
  const out = []
  for (const row of rows) {
    const st = row.values[durumProp.id]
    const todo = Boolean(izlenecek && st === izlenecek && hasDate(row))
    if (!done.has(st) && !todo) continue
    const seasons = episodes[row.id]
    if (!Array.isArray(seasons) || !seasons.length) continue
    const seen = watched[row.id] ?? {}
    const list = []
    for (const s of seasons) {
      if (!(s.seasonNumber >= 1)) continue
      const aired = (s.episodes ?? []).filter((e) => e.airDate && e.airDate <= today)
      const undated = aired.filter((e) => !(seen[`${s.seasonNumber}-${e.episodeNumber}`] ?? []).some((d) => d)).length
      if (undated) list.push({ season: s.seasonNumber, total: aired.length, undated })
    }
    if (list.length) out.push({ rowId: row.id, seasons: list, ...(todo ? { todo: true } : {}) })
  }
  return out
}

// Tarihsiz bölümlere tarih yazma (Sağlık Kontrolü). { items: [{ rowId, seasons?: number[] }], date } — date: "YYYY-MM-DD",
// "YYYY", "?" ya da "kayit" (kaydın kendi izleme tarihinden: tek günse hepsi o gün, aralıksa bölümler aralığa sırayla
// yayılır). Sadece tarihi olmayan bölümlere yazılır. Durum değişmez, kayda yeni izleme tarihi eklenmez, Son izlenenler'e
// düşmez — kullanıcı "bölümlere tarih atınca tekrardan izleme tarihi atmasın" dedi.
app.post('/api/profiles/:profileId/boards/:id/date-episodes', (req, res) => {
  const { profileId } = req.params
  const board = readJson(profileBoardsFile(profileId), []).find((b) => b.id === req.params.id)
  if (!board) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  const date = String(req.body?.date ?? '')
  if (!(date === '?' || date === 'kayit' || /^\d{4}$/.test(date) || /^\d{4}-\d{2}-\d{2}$/.test(date))) return res.status(400).json({ error: 'bad date' })
  const rows = readJson(profileRowsFile(profileId, board.id), [])
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const episodes = readJson(profileEpisodesFile(profileId), {})
  const file = profileWatchedFile(profileId)
  const all = readJson(file, {})
  const today = localToday()
  const addDays = (iso, n) => {
    const d = new Date(iso + 'T12:00:00')
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  let done = 0
  for (const it of items) {
    const row = rows.find((r) => r.id === it?.rowId)
    const seasons = row && episodes[row.id]
    if (!Array.isArray(seasons)) continue
    const want = Array.isArray(it.seasons) && it.seasons.length ? new Set(it.seasons.map(Number)) : null
    const seen = { ...(all[row.id] ?? {}) }
    const keys = []
    for (const s of [...seasons].sort((a, b) => a.seasonNumber - b.seasonNumber)) {
      if (!(s.seasonNumber >= 1) || (want && !want.has(s.seasonNumber))) continue
      for (const e of [...(s.episodes ?? [])].sort((a, b) => a.episodeNumber - b.episodeNumber)) {
        if (!e.airDate || e.airDate > today) continue
        const k = `${s.seasonNumber}-${e.episodeNumber}`
        if ((seen[k] ?? []).some((d) => d)) continue
        keys.push(k)
      }
    }
    if (!keys.length) continue
    let dates = keys.map(() => date)
    if (date === 'kayit') {
      // Kaydın son izleme tarihi: "a/b" aralığı, tek gün, yıl ya da "?"
      const v = dateProp ? row.values[dateProp.id] : null
      const list = (Array.isArray(v) ? v : v ? [v] : []).map(String).sort()
      const last = list[list.length - 1] ?? '?'
      const [a, b] = last.split('/')
      if (b && /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b)) {
        const span = Math.max(0, Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5))
        dates = keys.map((_, i) => addDays(a, keys.length > 1 ? Math.round((i * span) / (keys.length - 1)) : span))
      } else dates = keys.map(() => (/^\d{4}(-\d{2}-\d{2})?$/.test(a) ? a : '?'))
    }
    keys.forEach((k, i) => {
      seen[k] = [...(seen[k] ?? []).filter((d) => d), dates[i]]
    })
    all[row.id] = seen
    done += keys.length
  }
  writeJson(file, all)
  res.json({ ok: true, episodes: done })
})

// Mükerrer kayıtlar (Sağlık Kontrolü). Kullanıcı "şimdiye kadar mükerrerleri sen bakıp söyledin, sağlık
// kontrolünde toplu görebileyim" dedi. İki kayıt aynı içerik sayılır: aynı TMDB içeriğine bağlılarsa ya
// da adları tutuyorsa (Türkçe adı / orijinal adı, çapraz da: birinin Türkçe adına İngilizcesi yazılmış
// olabilir). Ad eşleşmesinde yeniden çekimler (Dune 1984 / 2021) ve aynı adlı film/dizi (Fargo) karışmasın
// diye TMDB kimlikleri, vizyon yılları ya da Kategori'leri ikisinde de dolu ve farklıysa sayılmaz.
// "Bunlar farklı" denen çiftler board.duplicateIgnore'da ("a|b", küçük id önce).
export function findDuplicateGroups(profileId, board, rows) {
  const refs = readJsonShared(profileTmdbFile(profileId), {})
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
      year: typeof y === 'string' && /^\d{4}/.test(y) ? y.slice(0, 4) : null,
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
  const board = readJsonShared(profileBoardsFile(req.params.profileId), []).find((b) => b.id === req.params.id)
  if (!board) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
  const rows = readJsonShared(profileRowsFile(req.params.profileId, board.id), [])
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
  // Telefonda PC yokken eklenen kayıt kendi kimliğiyle gelir (sonraki değişiklikleri aynı kimliği kullanıyor).
  const wanted = req.body?.id
  const id = typeof wanted === 'string' && /^[a-z0-9]{6,16}$/.test(wanted) && !rows.some((r) => r.id === wanted) ? wanted : makeId()
  const { fieldAt: _fa, ...body } = req.body ?? {}
  const row = { ...body, id }
  planIfUpcoming(findBoardCached(req.params.profileId, req.params.id), row)
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
  // Telefonun PC yokken yaptığı değişiklik (sync.js): yapıldığı an. Tam kayıt geldiyse değişen sütunlar
  // bulunur; PC'de o andan SONRA değişmiş bir sütun ezilmez ("son yapılan kazanır", fieldAt: history.js).
  const at = opAt(req)
  // Kayıt bu arada PC'de silindiyse silme kazanır (geçmişten geri getirilebilir), yeniden oluşturulmaz.
  // Telefon uygulanamayanları "Bekleyen değişiklikler"de gösterir (X-Argus-Skipped, bkz. sync.js reportSkipped)
  if (!before && at) {
    reportSkipped(res, { deleted: true })
    return res.json({ id: req.params.rowId, skipped: true })
  }
  let changed = Array.isArray(req.body?._changed) ? req.body._changed : null
  if (before && at) {
    if (!changed) {
      const incoming = req.body?.values ?? {}
      const keys = new Set([...Object.keys(before.values ?? {}), ...Object.keys(incoming)])
      changed = [...keys].filter((k) => JSON.stringify(before.values?.[k] ?? null) !== JSON.stringify(incoming[k] ?? null))
    }
    const kept = changed.filter((k) => !((before.fieldAt?.[k] ?? 0) > at))
    // PC'deki değer zaten telefondakiyle aynıysa "uygulanmadı" denmez
    const sameAsPc = (k) => JSON.stringify(before.values?.[k] ?? null) === JSON.stringify(req.body?.values?.[k] ?? null)
    const dropped = changed.filter((k) => !kept.includes(k) && !sameAsPc(k))
    if (dropped.length) reportSkipped(res, { fields: dropped.map((k) => ({ id: k, pc: before.values?.[k] ?? null, pcAt: before.fieldAt?.[k] ?? null })) })
    changed = kept
  }
  if (before && changed) {
    // Arayüz sadece değiştirdiği sütunları bildiriyor (_changed): onları dosyadaki EN GÜNCEL halin üstüne
    // işliyoruz. Eskiden arayüzdeki (belki eski) kopyanın tamamı yazılıyordu — Genel Güncelleme sürerken
    // tabloda bir hücre değiştirilince o satıra TMDB'den az önce gelen afiş/oyuncu vb. siliniyordu.
    const values = { ...before.values }
    const incoming = req.body.values ?? {}
    for (const k of changed) {
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
  planIfUpcoming(findBoardCached(req.params.profileId, req.params.id), saved, before)
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

export function defaultValueForType(type) {
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

export function isEmptyPropertyValue(v) {
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
  res.json(readJsonShared(profileTemplatesFile(req.params.profileId), []))
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
