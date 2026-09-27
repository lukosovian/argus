// Bildirimler — kullanıcı "bildirim olayı için bir bildirimler yeri olsun" dedi. Profil başına
// data/profiles/<profil>/notifications.json: en yenisi başta, en fazla 200 tane. `key` verilen
// bildirim aynı anahtarla bir daha eklenmez (ör. aynı sezon duyurusu her kontrolde tekrar gelmesin).
import path from 'path'

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
  const list = readJson(fileOf(profileId), [])
  if (n.key && list.some((x) => x.key === n.key)) return null
  const item = { id: makeId(), t: Date.now(), read: false, ...n }
  list.unshift(item)
  writeJson(fileOf(profileId), list.slice(0, 200))
  return item
}

export function registerNotificationRoutes(app) {
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
}
