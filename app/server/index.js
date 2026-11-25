// ARGUS yerel sunucusu — başlangıç noktası. Kod modüllere bölündü (bkz. storage.js, tmdb.js, fill.js, routes/, jobs/);
// rota dosyaları içe aktarılınca kendi uç noktalarını kaydediyor, sıra aşağıdaki gibi.
import express from 'express'
import path from 'node:path'
import { initHistory, registerHistoryRoutes, setHistoryWriter } from './history.js'
import { initNotifications, registerNotificationRoutes } from './notifications.js'
import { initBackup, registerBackupRoutes } from './backup.js'
import { serverRegion, stt, tmdbLang } from './lang.js'
import { initSync, registerSyncRoutes } from './sync.js'
import { initEvrenler, registerEvrenlerRoutes, registerPlatformRoutes } from './evrenler.js'
import { DATA_DIR, MEDYA_DIR, PROFILES_DIR, ROOT, __dirname, loadBoardAndRows, localDay, makeId, mapLimit, profileBoardsFile, profileDir, profileEpisodesFile, profileHomeSettingsFile, profileRowsFile, profileTmdbFile, profileWatchedFile, rawWriteJson, readAppVersion, readJson, readJsonShared, readProfileApiKey, readProfiles, writeJson } from './storage.js'
import { app } from './app.js'
import { archiveLookup, tmdbGet, toCard } from './tmdb.js'
import { applyWatched, recordRowWatchTime, setAskRating, shouldAskRating } from './watchLogic.js'
import { addRowFromTmdb } from './fill.js'
import { platformList } from './routes/tmdb.js'
import { profileWatchStateFile, watchlistTick } from './jobs/watchlist.js'
import './routes/boards.js'
import './routes/profiles.js'
import './routes/watched.js'
import './routes/collection.js'
import './routes/verify.js'
import './routes/system.js'
import './routes/store.js'
import './routes/orphans.js'
import './routes/desktop.js'
import './routes/devices.js'
import { initCare } from './routes/care.js'
import { initRecover } from './recover.js'
import { resumeBulkJobs } from './jobs/bulk.js'
import { startReminders } from './jobs/reminders.js'

// Beklenmedik bir hata (ör. yukarıdaki "okunamadı, kaydedilmedi") sunucuyu kapatmasın.
process.on('unhandledRejection', (e) => console.error('Hata:', e))

initHistory({ dataDir: DATA_DIR, profilesDir: PROFILES_DIR, readJson, readShared: readJsonShared, rawWrite: rawWriteJson, makeId })
setHistoryWriter(writeJson)
registerHistoryRoutes(app)
initNotifications({ profilesDir: PROFILES_DIR, readJson, writeJson, makeId })
registerNotificationRoutes(app)
initBackup({ dataDir: DATA_DIR, medyaDir: MEDYA_DIR, root: ROOT, readJson, writeJson: rawWriteJson, profileIds: () => readProfiles().map((p) => p.id) })
registerBackupRoutes(app)
initSync({ dataDir: DATA_DIR, profilesDir: PROFILES_DIR, readJson, rawWrite: rawWriteJson, makeId, appVersion: readAppVersion(), mobileDir: path.join(__dirname, '..', 'mobile') })
registerSyncRoutes(app)
initEvrenler({
  dataDir: DATA_DIR, profileIds: () => readProfiles().map((p) => p.id),
  readJson, writeJson, makeId, profileDir, localDay: () => localDay(),
  profileEpisodesFile, profileWatchedFile, profileRowsFile, profileBoardsFile, readProfileApiKey,
  loadBoardAndRows: (...a) => loadBoardAndRows(...a), archiveLookup: (...a) => archiveLookup(...a),
  addRowFromTmdb: (...a) => addRowFromTmdb(...a), applyWatched: (...a) => applyWatched(...a),
  shouldAskRating: (...a) => shouldAskRating(...a), setAskRating: (...a) => setAskRating(...a),
  recordRowWatchTime: (...a) => recordRowWatchTime(...a), tmdbGet: (...a) => tmdbGet(...a), toCard: (...a) => toCard(...a), tmdbLang,
  platformList: (...a) => platformList(...a), mapLimit: (...a) => mapLimit(...a), serverRegion, profileTmdbFile, profileHomeSettingsFile,
  profileWatchStateFile: (...a) => profileWatchStateFile(...a),
})
registerEvrenlerRoutes(app)
registerPlatformRoutes(app)

if (!process.env.ARGUS_NO_WATCH) {
  setTimeout(watchlistTick, 60_000)
  setInterval(watchlistTick, 3600e3)
  // v1.26: yeni bölüm (İzleniyor), puan hatırlatma, sabah bülteni, seans, haftalık otomatik güncelleme, eski telefon
  startReminders()
}
// v1.26: bozuk dosya kurtarma önerisi (G1), disk uyarısı ve görsel çöpünün temizliği (Y8, Y9)
initRecover()
initCare()

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
  // Yarıda kalmış Genel Güncelleme varsa devam (bkz. jobs/bulk.js)
  resumeBulkJobs()
})
