// Profil başına küçük genel veri deposu: arayüzün kendi ayarlarını/verilerini (ör. oyun skorları, tercihler) sunucuda
// tutması için, her biri için ayrı uç nokta yazmaya gerek kalmasın. data/profiles/<id>/store/<ad>.json — telefon
// eşitlemesi de bu klasörü görüyor (bkz. sync.js walkData; telefon store/<ad>.json ↔ /api/profiles/<id>/store/<ad>).
import fs from 'node:fs'
import path from 'node:path'
import { app } from '../app.js'
import { profileDir, readJson, writeJson } from '../storage.js'

const NAME = /^[a-z0-9-]{1,40}$/
const MAX_BYTES = 1024 * 1024

export function storeDir(profileId) {
  const dir = path.join(profileDir(profileId), 'store')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
export function storeFile(profileId, name) {
  return path.join(storeDir(profileId), `${name}.json`)
}

app.get('/api/profiles/:profileId/store/:name', (req, res) => {
  if (!NAME.test(req.params.name)) return res.status(400).json({ error: 'name' })
  res.json(readJson(storeFile(req.params.profileId, req.params.name), {}))
})

// Gövde 1 MB'tan büyükse reddedilir (genel 15 MB sınırı yerine). Dizi ya da nesne olabilir; tamamı değiştirilir.
app.put('/api/profiles/:profileId/store/:name', (req, res) => {
  if (!NAME.test(req.params.name)) return res.status(400).json({ error: 'name' })
  if (JSON.stringify(req.body ?? null).length > MAX_BYTES) return res.status(413).json({ error: 'too large' })
  writeJson(storeFile(req.params.profileId, req.params.name), req.body ?? {})
  res.json({ ok: true })
})
