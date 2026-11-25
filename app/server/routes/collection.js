// Koleksiyon, Aklımda, Biletlerim, Ödüller, planlar ve kişi takibi.
import fs from 'node:fs'
import path from 'node:path'
import { resolveRole, resolveStatusOption } from '../roles.js'
import { stt } from '../lang.js'
import { MEDYA_DIR, PROFILES_DIR, loadBoardAndRows, localDay, profileBoardsFile, profileDir, profileRowsFile, profileTmdbFile, readJson, readProfileApiKey, writeJson } from '../storage.js'
import { app } from '../app.js'
import { ensureTmdbRef, tmdbGet } from '../tmdb.js'

// ---- Koleksiyon ----------------------------------------------------------------------------------
// Kullanıcı "izlediklerimden sembolleri (Star Trek'teki göğüs deltaları gibi) sergileyen bir sayfa"
// istedi. İzlenen, izlenmekte olan ve yarım bırakılan yapımlar raflara ayrılıyor (raf anahtarı arayüzde hesaplanıyor):
// filmler için TMDB serisi (belongs_to_collection, İngilizce adıyla — dizilerin orijinal adıyla aynı
// raf anahtarını versin diye, ör. "Star Trek: ..." ), bu yüzden eksik seri bilgileri arka planda
// bir kez öğrenilip tmdb.json'a yazılıyor. Kullanıcının eklediği semboller, raf adları ve raf
// değişiklikleri koleksiyon.json'da.
export function profileKoleksiyonFile(profileId) {
  return path.join(profileDir(profileId), 'koleksiyon.json')
}
export const koleksiyonJobs = new Map() // profileId → { running, done, total }
export const koleksiyonNoMatch = new Set() // TMDB'de bulunamayan kayıtlar (her açılışta yeniden aranmasın)

export function koleksiyonRows(board, rows) {
  const durumProp = resolveRole(board, 'durum')
  if (!durumProp) return []
  // İzlenecek dışındaki her durum (İzlendi, İzleniyor, Yarım…): bir kısmını bile izlediysen koleksiyonda
  const later = resolveStatusOption(board, 'izlenecek')
  return rows.filter((r) => r.values[durumProp.id] && r.values[durumProp.id] !== later)
}

export async function fillKoleksiyonCollections(profileId, boardId, apiKey) {
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
  // İzlenecek'teki yapımların serisi (rafta "kaçını izledin" halkası için; v1.23.3)
  const laterCollections = {}
  const durumProp = resolveRole(loaded.board, 'durum')
  const later = resolveStatusOption(loaded.board, 'izlenecek')
  if (durumProp && later)
    for (const row of loaded.rows) {
      if (row.values[durumProp.id] !== later) continue
      const ref = refs[row.id]
      if (ref?.collection) laterCollections[row.id] = { id: ref.collection.id, name: ref.collection.en ?? ref.collection.name }
      if (ref?.mediaType) mediaTypes[row.id] = ref.mediaType
    }
  const apiKey = readProfileApiKey(profileId)
  if (apiKey) fillKoleksiyonCollections(profileId, boardId, apiKey).catch(() => {})
  const job = koleksiyonJobs.get(profileId)
  res.json({
    collections,
    laterCollections,
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

// "Aklımda" — kullanıcı "ARGUS'u açıyorum, karşıma bir film çıkıyor, bunu izlesem mi diyorum ama not etmeyince
// aklımdan gidiyor" dedi. İzlenecekler'den farkı: orası "izleyeceğim", burası "bir ara bakarım belki". Arşivdeki
// her yapım (izlenmiş, yarım, izlenecek) ya da arşivde olmayan bir TMDB önerisi buraya eklenebilir. data/profiles/<id>/aklimda.json: { items: { anahtar: {...} } }
//   arşivdeki yapım: anahtar = rowId → { boardId, addedAt, note? }
//   arşivde olmayan: anahtar = "tmdb:movie:603" → { tmdb: { id, mediaType, title, poster, year }, addedAt, note? }
// Arşivde olmayan bir yapım sonradan arşive eklenince (tmdb-add ya da başka yoldan) kaydın anahtarı rowId olur.
export function profileAklimdaFile(profileId) {
  return path.join(profileDir(profileId), 'aklimda.json')
}

export function readAklimda(profileId) {
  const data = readJson(profileAklimdaFile(profileId), { items: {} })
  if (!data.items || typeof data.items !== 'object') data.items = {}
  return data
}

// TMDB önerisi olarak eklenmiş ama artık arşivde olan yapımları arşiv kaydına bağlar. Değişiklik olduysa true.
export function linkAklimdaToArchive(profileId, data) {
  const pending = Object.keys(data.items).filter((k) => k.startsWith('tmdb:'))
  if (!pending.length) return false
  const refs = readJson(profileTmdbFile(profileId), {})
  const byTmdb = new Map()
  for (const [rowId, ref] of Object.entries(refs)) if (ref?.id && ref.mediaType) byTmdb.set(`tmdb:${ref.mediaType}:${ref.id}`, rowId)
  let changed = false
  let boardOf = null
  for (const key of pending) {
    const rowId = byTmdb.get(key)
    if (!rowId) continue
    if (!boardOf) {
      boardOf = new Map()
      for (const b of readJson(profileBoardsFile(profileId), [])) for (const r of readJson(profileRowsFile(profileId, b.id), [])) boardOf.set(r.id, b.id)
    }
    const boardId = boardOf.get(rowId)
    if (!boardId) continue
    const { tmdb: _t, ...rest } = data.items[key]
    if (!data.items[rowId]) data.items[rowId] = { ...rest, boardId }
    delete data.items[key]
    changed = true
  }
  return changed
}

app.get('/api/profiles/:profileId/aklimda', (req, res) => {
  const { profileId } = req.params
  const data = readAklimda(profileId)
  let changed = linkAklimdaToArchive(profileId, data)
  // Arşivden silinmiş kayıtlar listeden de düşer (yoksa sınırı boşuna doldururlar)
  const rowIds = new Map()
  for (const [k, it] of Object.entries(data.items)) {
    if (!it?.boardId) continue
    if (!rowIds.has(it.boardId)) rowIds.set(it.boardId, new Set(readJson(profileRowsFile(profileId, it.boardId), []).map((r) => r.id)))
    if (!rowIds.get(it.boardId).has(k)) {
      delete data.items[k]
      changed = true
    }
  }
  if (changed) writeJson(profileAklimdaFile(profileId), data)
  // Arşivdeki yapımların TMDB kimliği de gönderiliyor: TMDB önizlemesinde "zaten aklında" görünebilsin
  const refs = readJson(profileTmdbFile(profileId), {})
  const tmdbOf = {}
  for (const k of Object.keys(data.items)) if (refs[k]?.id && refs[k].mediaType) tmdbOf[k] = `${refs[k].mediaType}:${refs[k].id}`
  res.json({ ...data, tmdbOf })
})

// Kısmi güncelleme: { items: { anahtar: {...} | null } } — null siler, alanlardaki null o alanı siler.
app.post('/api/profiles/:profileId/aklimda', (req, res) => {
  const file = profileAklimdaFile(req.params.profileId)
  const data = readAklimda(req.params.profileId)
  // limit: en fazla kaç yapım (0 = sınırsız, yoksa 20 — bkz. useAklimda)
  const lim = req.body?.limit
  if (Number.isInteger(lim) && lim >= 0 && lim <= 1000) data.limit = lim
  const patch = req.body?.items
  if (patch && typeof patch === 'object') {
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete data.items[k]
      else if (typeof v === 'object') {
        const merged = { ...(data.items[k] ?? {}), ...v }
        for (const [mk, mv] of Object.entries(merged)) if (mv === null) delete merged[mk]
        if (typeof merged.note === 'string') merged.note = merged.note.slice(0, 1000)
        if (!merged.addedAt) merged.addedAt = Date.now()
        data.items[k] = merged
      }
    }
  }
  writeJson(file, data)
  res.json(data)
})

// Koleksiyon › Biletlerim (v1.23.11): sinemada izlediğin yapımların koleksiyonluk biletleri.
// data/profiles/<id>/biletler.json: { items: { biletId: { title, poster, cover, logo, year, rowId?, boardId?, date, time,
//   cinema, hall, seat, format, withWho, price, note, front?, back?, createdAt } } }
// Yapımın bilgileri bilet kesildiği anki haliyle saklanır (yapım arşivden silinse de bilet kalır).
export function profileBiletFile(profileId) {
  return path.join(profileDir(profileId), 'biletler.json')
}
// "data:image/jpeg;base64,..." → medya/bilet_*.jpg ("/medya/<ad>"); bozuk/çok büyükse null
function saveBiletPhoto(dataUrl) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl)
  if (!m) return null
  const buf = Buffer.from(m[2], 'base64')
  if (!buf.length || buf.length > 8 * 1024 * 1024) return null
  const ext = m[1] === 'png' ? '.png' : m[1] === 'webp' ? '.webp' : '.jpg'
  let name = `bilet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}${ext}`
  while (fs.existsSync(path.join(MEDYA_DIR, name))) name = `bilet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}${ext}`
  try {
    fs.writeFileSync(path.join(MEDYA_DIR, name), buf)
  } catch {
    return null
  }
  return `/medya/${name}`
}
export const BILET_TEXT = ['title', 'poster', 'cover', 'logo', 'year', 'rowId', 'boardId', 'date', 'time', 'cinema', 'hall', 'seat', 'format', 'withWho', 'price', 'note', 'front', 'back', 'art', 'artPos', 'artZoom', 'style']
app.get('/api/profiles/:profileId/biletler', (req, res) => {
  const data = readJson(profileBiletFile(req.params.profileId), { items: {} })
  if (!data.items || typeof data.items !== 'object') data.items = {}
  res.json(data)
})
// Kısmi güncelleme: { items: { id: {...} | null } } — null siler, alandaki null o alanı siler.
app.post('/api/profiles/:profileId/biletler', (req, res) => {
  const file = profileBiletFile(req.params.profileId)
  const data = readJson(file, { items: {} })
  if (!data.items || typeof data.items !== 'object') data.items = {}
  const patch = req.body?.items
  if (patch && typeof patch === 'object') {
    for (const [id, v] of Object.entries(patch)) {
      if (!/^[a-z0-9_-]{1,40}$/i.test(id)) continue
      if (v === null) {
        delete data.items[id]
        continue
      }
      if (typeof v !== 'object') continue
      const merged = { ...(data.items[id] ?? {}) }
      for (const k of BILET_TEXT) {
        if (!(k in v)) continue
        if (v[k] === null || v[k] === '') delete merged[k]
        else if ((k === 'front' || k === 'back') && typeof v[k] === 'string' && v[k].startsWith('data:image/')) {
          // Y14: telefonda çekilen bilet fotoğrafı metin olarak gelir (PC yokken sıraya girebilsin diye); burada
          // medya klasörüne dosya olarak yazılır, bilette dosyanın adresi kalır.
          const saved = saveBiletPhoto(v[k])
          if (saved) merged[k] = saved
        } else merged[k] = String(v[k]).slice(0, k === 'note' ? 600 : 400)
      }
      if (!merged.createdAt) merged.createdAt = Date.now()
      if (!merged.title) continue
      data.items[id] = merged
    }
  }
  writeJson(file, data)
  res.json(data)
})

// Koleksiyon › Ödüller (v1.24): izledikçe kazanılan kart paketleri. Kullanıcı Kick'teki kutu açmayı görüp "argusta da
// olsun" dedi, sunumdaki dört stilden kart paketini seçti; başarım/rozet ödülü istemedi. Kazanılan paket sayısı
// arayüzde izleme kayıtlarından hesaplanır (başlangıç tarihinden sonrası); burada açılanlar ve toplananlar durur.
// data/profiles/<id>/oduller.json: { startedAt, opened:{tier:n}, bonus:{tier:n}, makara, pity, items:{key:{n,at,r}},
//   cards:{rowId:{n,at,r,title,poster,year,rating}}, equip:{frame?,back?} }
export const ODUL_TIERS = ['bronz', 'gumus', 'altin']
export const MAKARA_OF = [1, 2, 5, 12] // kopya çıkınca nadirliğe göre makara
export const MAKARA_PRICE = { bronz: 10, gumus: 25, altin: 60 }
export function profileOdulFile(profileId) {
  return path.join(profileDir(profileId), 'oduller.json')
}
export function readOdul(profileId) {
  const d = readJson(profileOdulFile(profileId), {})
  return {
    startedAt: typeof d.startedAt === 'string' ? d.startedAt : null,
    opened: { ...(d.opened ?? {}) },
    bonus: { ...(d.bonus ?? {}) },
    makara: Number(d.makara) || 0,
    pity: Number(d.pity) || 0,
    items: d.items && typeof d.items === 'object' ? d.items : {},
    cards: d.cards && typeof d.cards === 'object' ? d.cards : {},
    equip: d.equip && typeof d.equip === 'object' ? d.equip : {},
    log: Array.isArray(d.log) ? d.log.slice(-30) : [],
    // Oyunlardan kazanılan paketler (v1.24, Oyun salonu): anahtar → zaman; aynı anahtar ikinci kez sayılmaz
    games: d.games && typeof d.games === 'object' ? d.games : {},
  }
}
app.get('/api/profiles/:profileId/oduller', (req, res) => {
  res.json(readOdul(req.params.profileId))
})
// { action: 'start' } | { action:'open', tier, opId, pity, rewards:[{kind:'item',key,r}|{kind:'card',rowId,r,title,poster,year,rating}] }
// | { action:'equip', slot:'frame'|'back', key|null } | { action:'buy', tier }
app.post('/api/profiles/:profileId/oduller', (req, res) => {
  const file = profileOdulFile(req.params.profileId)
  const d = readOdul(req.params.profileId)
  const b = req.body ?? {}
  const now = Date.now()
  if (b.action === 'start') {
    if (!d.startedAt) {
      const t = new Date()
      d.startedAt = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
      // Hoş geldin paketleri: hemen bir tane açılabilsin
      d.bonus = { bronz: 2, altin: 1 }
    }
  } else if (b.action === 'open' && ODUL_TIERS.includes(b.tier) && Array.isArray(b.rewards)) {
    // Aynı açılış iki kez gelmesin (telefon cevabı kaybedip yeniden gönderirse)
    if (typeof b.opId === 'string' && d.log.some((l) => l.opId === b.opId)) return res.json(d)
    // İki cihazda (PC + telefon) aynı paket açılmasın: arayüz o seviyeden kaç paketin açılmış olduğunu sanıyorsa
    // (expectOpened) ve burada farklıysa paket açılmaz, güncel hal döner.
    if (typeof b.expectOpened === 'number' && b.expectOpened !== (Number(d.opened[b.tier]) || 0)) {
      return res.status(409).json({ error: stt('Bu paket başka bir cihazda açıldı.'), data: d })
    }
    d.opened[b.tier] = (Number(d.opened[b.tier]) || 0) + 1
    d.pity = Math.max(0, Math.min(99, Number(b.pity) || 0))
    const got = []
    for (const r of b.rewards.slice(0, 8)) {
      const rar = Math.max(0, Math.min(3, Number(r?.r) || 0))
      if (r?.kind === 'card' && typeof r.rowId === 'string' && /^[a-z0-9_-]{1,60}$/i.test(r.rowId)) {
        const cur = d.cards[r.rowId]
        if (cur && r.foil && !cur.foil) cur.foil = true // parlak kopya: kart parlağa yükselir
        else if (cur) {
          cur.n = (cur.n || 1) + 1
          d.makara += MAKARA_OF[rar]
        } else
          d.cards[r.rowId] = {
            ...(r.foil ? { foil: true } : {}),
            n: 1, at: now, r: rar,
            title: String(r.title ?? '').slice(0, 200), poster: String(r.poster ?? '').slice(0, 400),
            year: String(r.year ?? '').slice(0, 4), rating: r.rating == null ? null : Number(r.rating) || null,
          }
        got.push(`c:${r.rowId}`)
      } else if (r?.kind === 'item' && typeof r.key === 'string' && /^[a-z]+:[a-z0-9-]{1,30}$/.test(r.key)) {
        const cur = d.items[r.key]
        if (cur) {
          cur.n = (cur.n || 1) + 1
          d.makara += MAKARA_OF[rar]
        } else d.items[r.key] = { n: 1, at: now, r: rar }
        got.push(r.key)
      }
    }
    d.log.push({ at: now, tier: b.tier, got, ...(typeof b.opId === 'string' ? { opId: b.opId.slice(0, 40) } : {}) })
    d.log = d.log.slice(-30)
  } else if (b.action === 'equip' && (b.slot === 'frame' || b.slot === 'back')) {
    if (b.key === null || b.key === undefined) delete d.equip[b.slot]
    else if (typeof b.key === 'string' && d.items[b.key]) d.equip[b.slot] = b.key
  } else if (b.action === 'game' && ODUL_TIERS.includes(b.tier) && typeof b.key === 'string' && /^[a-z0-9:_-]{1,80}$/i.test(b.key)) {
    // Oyun salonu (v1.24): oyun bitirme bronz (günde en çok 3), rekor gümüş, günlük oyunda 7 gün seri altın.
    // Ödüller açılmamışsa (startedAt yok) paket verilmez.
    if (!d.startedAt || d.games[b.key]) return res.json({ ...d, granted: false })
    const day = localDay()
    if (b.tier === 'bronz') {
      const todayN = Object.entries(d.games).filter(([k, v]) => k.startsWith('bitir:') && v?.day === day).length
      if (todayN >= 3) return res.json({ ...d, granted: false })
    }
    d.games[b.key] = { at: now, day, tier: b.tier }
    const keys = Object.keys(d.games)
    if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete d.games[k]
    d.bonus[b.tier] = (Number(d.bonus[b.tier]) || 0) + 1
    writeJson(file, d)
    return res.json({ ...d, granted: true })
  } else if (b.action === 'buy' && ODUL_TIERS.includes(b.tier)) {
    const price = MAKARA_PRICE[b.tier]
    if (d.makara < price) return res.status(400).json({ error: stt('Yeterli makaran yok.') })
    d.makara -= price
    d.bonus[b.tier] = (Number(d.bonus[b.tier]) || 0) + 1
  } else return res.status(400).json({ error: 'bad action' })
  writeJson(file, d)
  res.json(d)
})

// Ekstralar › Dizi bitirme planı (v1.23.4): data/profiles/<id>/planlar.json { [rowId]: { start, end } }
export const plansFile = (profileId) => path.join(PROFILES_DIR, profileId, 'planlar.json')
app.get('/api/profiles/:profileId/planlar', (req, res) => res.json(readJson(plansFile(req.params.profileId), {})))
app.post('/api/profiles/:profileId/planlar', (req, res) => {
  const { rowId, plan } = req.body ?? {}
  if (typeof rowId !== 'string' || !rowId) return res.status(400).json({ error: 'rowId' })
  const all = readJson(plansFile(req.params.profileId), {})
  const ok = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  if (plan && ok(plan.start) && ok(plan.end)) all[rowId] = { start: plan.start, end: plan.end }
  else delete all[rowId]
  writeJson(plansFile(req.params.profileId), all)
  res.json({ ok: true })
})

// Ekstralar › Oyuncu ve yönetmen takibi (v1.23.4): data/profiles/<id>/takip.json { [tmdbKişiId]: { name, role, at } }
export const followFile = (profileId) => path.join(PROFILES_DIR, profileId, 'takip.json')
app.get('/api/profiles/:profileId/takip', (req, res) => res.json(readJson(followFile(req.params.profileId), {})))
app.post('/api/profiles/:profileId/takip', (req, res) => {
  const b = req.body ?? {}
  const id = Number(b.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id' })
  const all = readJson(followFile(req.params.profileId), {})
  if (b.on) all[id] = { name: String(b.name ?? '').slice(0, 120), role: b.role === 'directing' ? 'directing' : 'acting', at: Date.now() }
  else delete all[id]
  writeJson(followFile(req.params.profileId), all)
  res.json({ ok: true })
})
