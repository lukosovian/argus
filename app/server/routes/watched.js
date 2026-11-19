// Bölümler, izleme işaretleri, şarkılar, Flashback kartları, yarım kalanlar.
import path from 'node:path'
import { stt } from '../lang.js'
import { makeId, profileCastFile, profileDir, profileEpisodesFile, profileProgressFile, profileSongsFile, profileWatchedFile, readJson, readJsonShared, writeJson } from '../storage.js'
import { app } from '../app.js'
import { profileRecentWatchFile, saveWatched } from '../watchLogic.js'

app.get('/api/profiles/:profileId/cast', (req, res) => {
  res.json(readJsonShared(profileCastFile(req.params.profileId), {}))
})

app.get('/api/profiles/:profileId/episodes', (req, res) => {
  res.json(readJsonShared(profileEpisodesFile(req.params.profileId), {}))
})

app.get('/api/profiles/:profileId/watched', (req, res) => {
  res.json(readJsonShared(profileWatchedFile(req.params.profileId), {}))
})

app.put('/api/profiles/:profileId/watched/:rowId', (req, res) => saveWatched(req, res, () => req.body))

// Telefondan (PC yokken yapılan) bölüm işaretlemeleri: tam liste değil FARK gelir —
// { add: { "1-3": ["2026-11-04"] }, remove: { "1-2": ["2026-11-01"] } }. Dosyadaki EN GÜNCEL hale işlenir,
// böylece bu arada PC'de işaretlenen bölümler kaybolmaz. Sonrası (otomatik durum, puan sorma…) PUT ile aynı.
app.patch('/api/profiles/:profileId/watched/:rowId/diff', (req, res) =>
  saveWatched(req, res, (current) => {
    const next = Object.fromEntries(Object.entries(current).map(([k, ds]) => [k, Array.isArray(ds) ? [...ds] : ds]))
    for (const [k, ds] of Object.entries(req.body?.add ?? {})) {
      if (!Array.isArray(ds)) continue
      next[k] = [...new Set([...(Array.isArray(next[k]) ? next[k] : []), ...ds.map(String)])].sort()
    }
    for (const [k, ds] of Object.entries(req.body?.remove ?? {})) {
      if (!Array.isArray(ds) || !Array.isArray(next[k])) continue
      next[k] = next[k].filter((d) => !ds.includes(d))
      if (!next[k].length) delete next[k]
    }
    return next
  }),
)

// İçerikteki müzikler: kullanıcı "Nook'un Hum'u izlediğim dizilerin filmlerin içindeki müzikleri bulsun,
// hangi dakikada hangi müzik çaldığı detay penceresinde yazsın" dedi. Nook izlerken çalan şarkıyı tanıyıp
// buraya yazıyor; elle de silinebiliyor. songs.json: { [rowId]: Song[] } — Song: { id, key (Shazam kimliği),
// title, artist, album?, cover?, url?, season?, episode?, atMs (içeriğin kaçıncı ms'si; bilinmiyorsa null),
// approx, foundAt }.
export const SONG_SAME_WINDOW_MS = 5 * 60 * 1000

export function cleanText(v, max = 200) {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}
export function cleanUrl(v) {
  const s = cleanText(v, 1000)
  return s && /^https:\/\//i.test(s) ? s : null
}
export function cleanInt(v) {
  return Number.isInteger(v) && v >= 0 ? v : null
}

// Bütün şarkılar (Flashback › Yılın film müzikleri, v1.24)
app.get('/api/profiles/:profileId/songs', (req, res) => {
  res.json(readJsonShared(profileSongsFile(req.params.profileId), {}))
})

// Flashback kartları (v1.24): her yılın unvan kartı Koleksiyon'a düşer. flashback-kart.json: { [yıl]: { title, why,
// badges, poster, films, episodes, titles, savedAt } }. Flashback sayfası yılı gösterince yazar (yıl bittiyse ya da
// Flashback açılmışsa).
export function profileFbCardsFile(profileId) {
  return path.join(profileDir(profileId), 'flashback-kart.json')
}
app.get('/api/profiles/:profileId/flashback-kart', (req, res) => {
  res.json(readJsonShared(profileFbCardsFile(req.params.profileId), {}))
})
app.post('/api/profiles/:profileId/flashback-kart', (req, res) => {
  const b = req.body ?? {}
  const year = String(b.year ?? '')
  if (!/^\d{4}$/.test(year)) return res.status(400).json({ error: stt('Geçersiz istek') })
  const str = (v, n = 120) => (typeof v === 'string' ? v.slice(0, n) : '')
  const num = (v) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)
  const card = {
    title: str(b.title),
    why: str(b.why, 200),
    badges: (Array.isArray(b.badges) ? b.badges : []).slice(0, 4).map((x) => ({ title: str(x?.title), why: str(x?.why, 160) })),
    poster: str(b.poster, 400),
    films: num(b.films),
    episodes: num(b.episodes),
    titles: num(b.titles),
    savedAt: Date.now(),
  }
  const file = profileFbCardsFile(req.params.profileId)
  const all = readJson(file, {})
  const prev = all[year]
  if (!prev || JSON.stringify({ ...prev, savedAt: 0 }) !== JSON.stringify({ ...card, savedAt: 0 })) {
    all[year] = card
    writeJson(file, all)
  }
  res.json({ ok: true })
})

app.get('/api/profiles/:profileId/songs/:rowId', (req, res) => {
  res.json(readJsonShared(profileSongsFile(req.params.profileId), {})[req.params.rowId] ?? [])
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

// Yarım kalan filmler: kullanıcı "yarım kalan filmi devam ettirince tekrar izleme olarak yazmasın, kaldığım
// dakikayı detay penceresinde göstersin" dedi. Nook izlerken kaldığın yeri buraya yazıyor, film bitince
// siliyor. progress.json: { [rowId]: { atMs (bilinmiyorsa null), durationMs, day (o izleme için yazılan
// tarih), at } }. day gönderilmezse öncekisi korunur.
// Hepsi birden: ana sayfadaki "Kaldığın yerden" satırı için (v1.23.3)
app.get('/api/profiles/:profileId/progress', (req, res) => {
  res.json(readJsonShared(profileProgressFile(req.params.profileId), {}))
})

app.get('/api/profiles/:profileId/progress/:rowId', (req, res) => {
  res.json(readJsonShared(profileProgressFile(req.params.profileId), {})[req.params.rowId] ?? null)
})

app.put('/api/profiles/:profileId/progress/:rowId', (req, res) => {
  const b = req.body ?? {}
  const file = profileProgressFile(req.params.profileId)
  const all = readJson(file, {})
  const old = all[req.params.rowId] ?? {}
  const day = typeof b.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : old.day
  if (!day) return res.status(400).json({ error: stt('Gün eksik') })
  all[req.params.rowId] = { atMs: cleanInt(b.atMs), durationMs: cleanInt(b.durationMs), day, at: Date.now() }
  writeJson(file, all)
  res.json({ ok: true })
})

app.delete('/api/profiles/:profileId/progress/:rowId', (req, res) => {
  const file = profileProgressFile(req.params.profileId)
  const all = readJson(file, {})
  if (req.params.rowId in all) {
    delete all[req.params.rowId]
    writeJson(file, all)
  }
  res.json({ ok: true })
})

app.get('/api/profiles/:profileId/recent-watch', (req, res) => {
  res.json(readJsonShared(profileRecentWatchFile(req.params.profileId), []))
})
