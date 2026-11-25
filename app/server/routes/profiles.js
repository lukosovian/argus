// Profiller, TMDB anahtarı, ana sayfa ayarları.
import fs from 'node:fs'
import path from 'node:path'
import { stt } from '../lang.js'
import { DATA_DIR, PROFILES_DIR, PROFILE_FILE, makeId, profileApiKeyFile, profileHomeSettingsFile, readJson, readJsonShared, readProfileApiKey, readProfiles, writeJson } from '../storage.js'
import { app } from '../app.js'

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
  // Profil silme (bütün arşivleriyle) sadece PC'deki ARGUS'tan (H2) — telefonun isteği eşleştirme anahtarıyla gelir
  // (bkz. sync.js checkRemote, req.argusDevice).
  if (req.argusDevice) return res.status(403).json({ error: stt('Bu işlem sadece PC\'deki ARGUS\'tan yapılabilir.') })
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
  res.json(readJsonShared(profileHomeSettingsFile(req.params.profileId), null))
})

app.put('/api/profiles/:profileId/home-settings', (req, res) => {
  writeJson(profileHomeSettingsFile(req.params.profileId), req.body)
  res.json({ ok: true })
})
