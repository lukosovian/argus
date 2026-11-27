// Bildirimler — kullanıcı "bildirim olayı için bir bildirimler yeri olsun" dedi. Profil başına
// data/profiles/<profil>/notifications.json: en yenisi başta, en fazla 200 tane. `key` verilen
// bildirim aynı anahtarla bir daha eklenmez (ör. aynı sezon duyurusu her kontrolde tekrar gelmesin).
import path from 'path'
import { isHiddenRow } from './kid.js'

let PROFILES_DIR = ''
let readJson = (_f, fb) => fb
let writeJson = (_f, _d) => {}
let makeId = () => Math.random().toString(36).slice(2, 10)

export function initNotifications(opts) {
  PROFILES_DIR = opts.profilesDir
  readJson = opts.readJson
  writeJson = opts.writeJson
  makeId = opts.makeId
}

const fileOf = (profileId) => path.join(PROFILES_DIR, profileId, 'notifications.json')

export function pushNotification(profileId, n) {
  // Çocuk profilinde gizli bir yapımın haberi (yeni bölüm, platform…) hiç düşmez (bkz. kid.js)
  try {
    if (n.rowId && isHiddenRow(profileId, n.rowId)) return null
  } catch {
    /* süzgeç okunamadıysa bildirim yine düşsün */
  }
  const list = readJson(fileOf(profileId), [])
  if (n.key && list.some((x) => x.key === n.key)) return null
  // Listeden (200) taşan eski bildirimlerin anahtarları ayrıca saklanıyor — yoksa aynı duyuru
  // liste kaydıkça yeniden geliyordu.
  const seenFile = path.join(PROFILES_DIR, profileId, 'notifications-seen.json')
  const seen = n.key ? readJson(seenFile, []) : null
  if (n.key && seen.includes(n.key)) return null
  const item = { id: makeId(), t: Date.now(), read: false, ...n }
  list.unshift(item)
  writeJson(fileOf(profileId), list.slice(0, 200))
  if (n.key) {
    seen.push(n.key)
    writeJson(seenFile, seen.slice(-5000))
  }
  return item
}

export function registerNotificationRoutes(app) {
  // İstemcinin kendi ürettiği bildirimler (ör. Ekstralar › Başarımlar: yeni rozet) — key ile tekrar eklenmez
  app.post('/api/profiles/:profileId/notifications', (req, res) => {
    const b = req.body ?? {}
    if (typeof b.title !== 'string' || !b.title.trim()) return res.status(400).json({ error: 'title' })
    const item = pushNotification(req.params.profileId, {
      key: typeof b.key === 'string' ? b.key.slice(0, 120) : undefined,
      type: typeof b.type === 'string' ? b.type.slice(0, 40) : 'info',
      title: b.title.slice(0, 200),
      text: typeof b.text === 'string' ? b.text.slice(0, 500) : undefined,
      link: typeof b.link === 'string' && b.link.startsWith('/') ? b.link.slice(0, 200) : undefined,
    })
    res.json({ ok: true, item })
  })
  app.get('/api/profiles/:profileId/notifications', (req, res) => {
    res.json({ items: readJson(fileOf(req.params.profileId), []) })
  })
  // { ids?: string[] } — ids yoksa hepsi okundu
  app.post('/api/profiles/:profileId/notifications/read', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? new Set(req.body.ids) : null
    const list = readJson(fileOf(req.params.profileId), []).map((x) => (!ids || ids.has(x.id) ? { ...x, read: true } : x))
    writeJson(fileOf(req.params.profileId), list)
    res.json({ ok: true })
  })
  app.delete('/api/profiles/:profileId/notifications', (req, res) => {
    writeJson(fileOf(req.params.profileId), [])
    res.json({ ok: true })
  })
  // Tek bildirimi sil (zildeki ×) — silinen döner ki arayüz "Geri al"da geri koyabilsin
  app.delete('/api/profiles/:profileId/notifications/:id', (req, res) => {
    const list = readJson(fileOf(req.params.profileId), [])
    const item = list.find((x) => x.id === req.params.id) ?? null
    if (item) writeJson(fileOf(req.params.profileId), list.filter((x) => x.id !== req.params.id))
    res.json({ ok: true, item })
  })
  // "Geri al": silinen bildirimler geri konur ({ items }). Aynı kimlikte olan atlanır, sıra zamana göre, en fazla 200.
  app.post('/api/profiles/:profileId/notifications/restore', (req, res) => {
    res.json({ ok: true, items: restoreNotes(readJson(fileOf(req.params.profileId), []), req.body?.items, (l) => writeJson(fileOf(req.params.profileId), l)) })
  })
}

export function restoreNotes(list, incoming, save) {
  const back = (Array.isArray(incoming) ? incoming : []).filter(
    (x) => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.title === 'string' && typeof x.t === 'number',
  )
  if (!back.length) return list
  const ids = new Set(list.map((x) => x.id))
  const merged = [...list, ...back.filter((x) => !ids.has(x.id))].sort((a, b) => b.t - a.t).slice(0, 200)
  save(merged)
  return merged
}
