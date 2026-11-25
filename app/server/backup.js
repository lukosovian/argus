// Yedekleme — kullanıcı "yedek alma olsun" dedi; eskiden olan "Yedek İndir" (her seferinde 3 GB'lık medyayı
// tek zip'e sıkıştırıp indiren) dakikalarca sürdüğü için kaldırılmıştı. Bu yüzden:
//   - Yedek, kullanıcının seçtiği bir klasöre alınır (OneDrive / Google Drive klasörü seçilirse buluta da gider):
//       <klasör>/ARGUS Yedek/veri/<tarih-saat>/   ← data/ klasörünün tam kopyası (~100 MB, saniyeler)
//       <klasör>/ARGUS Yedek/medya/               ← görseller; sadece YENİ ya da değişenler kopyalanır
//   - İş arka planda yürür, arayüz ilerlemeyi sorar; ilk yedek uzun, sonrakiler kısa sürer.
//   - İsteğe bağlı otomatik: her gün ya da her hafta (ARGUS açıkken).
//   - Geri yükleme: seçilen yedeğin verisi data/'nın yerine konur (şu anki data/ yanına kenara alınır),
//     eksik görseller yedekten geri kopyalanır.
import fs from 'fs'
import path from 'path'
import os from 'os'
import { stt } from './lang.js'
import { pushNotification } from './notifications.js'
import { restartArgusSoon } from './restart.js'

let DATA_DIR = ''
let MEDYA_DIR = ''
let ROOT = ''
let readJson = (_f, fb) => fb
let writeJson = (_f, _d) => {}
let profileIds = () => []
// Bu sunucu sürecinin kimliği — yedekten dönüşten sonra ARGUS yeniden başlayınca arayüz bunun değiştiğini görüp
// sayfayı yeniler (bkz. BackupPanel).
export const BOOT_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export function initBackup(opts) {
  DATA_DIR = opts.dataDir
  MEDYA_DIR = opts.medyaDir
  ROOT = opts.root
  readJson = opts.readJson
  writeJson = opts.writeJson
  if (opts.profileIds) profileIds = opts.profileIds
  // Otomatik yedek: açılıştan 2 dk sonra ve saatte bir "zamanı geldi mi" diye bakılır.
  setTimeout(autoCheck, 2 * 60 * 1000)
  setInterval(autoCheck, 60 * 60 * 1000)
}

const settingsFile = () => path.join(DATA_DIR, 'backup-settings.json')
function settings() {
  const s = readJson(settingsFile(), {})
  return {
    target: typeof s.target === 'string' ? s.target : '',
    auto: s.auto === 'daily' || s.auto === 'weekly' ? s.auto : 'off',
    keep: Number.isInteger(s.keep) && s.keep > 0 ? s.keep : 10,
    lastAt: s.lastAt ?? null,
    lastSummary: s.lastSummary ?? null,
    lastError: s.lastError ?? null,
  }
}
function saveSettings(patch) {
  writeJson(settingsFile(), { ...readJson(settingsFile(), {}), ...patch })
}

const destRoot = (target) => path.join(target, 'ARGUS Yedek')
const stamp = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`

let job = null // { kind, phase, done, total, startedAt, error }

function listSnapshots(target) {
  const dir = path.join(destRoot(target), 'veri')
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse()
  } catch {
    return []
  }
}

// Büyük kopyalamalar olay döngüsünü kilitlemesin diye dosya dosya, arada nefes alarak.
const tick = () => new Promise((r) => setImmediate(r))

async function copyTree(src, dst, skip = () => false) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (skip(s, e)) continue
    if (e.isDirectory()) await copyTree(s, d, skip)
    else {
      await fs.promises.copyFile(s, d)
      if (job) job.done++
    }
  }
}

function countFiles(dir, skip = () => false) {
  let n = 0
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (skip(p, e)) continue
    n += e.isDirectory() ? countFiles(p, skip) : 1
  }
  return n
}

// data/ içinde yedeklenmeyecekler: yedekleme ayarı, geçici dosyalar, silinen profillerin çöp kutusu.
const dataSkip = (p, e) => e.name === 'backup-settings.json' || e.name.endsWith('.tmp') || e.name === 'profiller_silinen'

async function runBackup() {
  const s = settings()
  if (!s.target) throw new Error(stt('Önce yedeklerin konacağı klasörü seç.'))
  if (!fs.existsSync(s.target)) throw new Error(stt('Seçilen klasör bulunamadı: ') + s.target)
  const root = destRoot(s.target)
  const snapDir = path.join(root, 'veri', stamp())
  const tmpDir = snapDir + '.yaziliyor'
  // 1) Veri (küçük, hızlı) — önce yarım kalırsa görünmesin diye geçici adla, bitince asıl adına
  job.phase = 'veri'
  job.done = 0
  job.total = countFiles(DATA_DIR, dataSkip)
  await copyTree(DATA_DIR, tmpDir, dataSkip)
  fs.rmSync(snapDir, { recursive: true, force: true })
  fs.renameSync(tmpDir, snapDir)
  // 2) Görseller — sadece yeni/değişen
  job.phase = 'medya'
  const mdst = path.join(root, 'medya')
  fs.mkdirSync(mdst, { recursive: true })
  const files = fs.readdirSync(MEDYA_DIR).filter((f) => !f.startsWith('.'))
  job.done = 0
  job.total = files.length
  let copied = 0
  for (const f of files) {
    const src = path.join(MEDYA_DIR, f)
    const dst = path.join(mdst, f)
    let need = true
    try {
      need = fs.statSync(dst).size !== fs.statSync(src).size
    } catch {}
    if (need) {
      try {
        await fs.promises.copyFile(src, dst)
        copied++
      } catch {}
    }
    job.done++
    if (job.done % 200 === 0) await tick()
  }
  // 3) Eski veri yedeklerini sil (en yeni `keep` tanesi kalır)
  const snaps = listSnapshots(s.target)
  for (const old of snaps.slice(s.keep)) fs.rmSync(path.join(root, 'veri', old), { recursive: true, force: true })
  return { snapshot: path.basename(snapDir), mediaCopied: copied, mediaTotal: files.length }
}

async function runRestore(name) {
  const s = settings()
  const snap = path.join(destRoot(s.target), 'veri', name)
  if (!/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/.test(name) || !fs.existsSync(snap)) throw new Error(stt('Yedek bulunamadı'))
  // 1) Yedeği önce geçici bir klasöre kopyala, sonra yer değiştir (yarım kalan geri yükleme veriyi bozmasın)
  job.phase = 'veri'
  job.done = 0
  job.total = countFiles(snap)
  const incoming = path.join(ROOT, `data_geri_yukleniyor_${stamp()}`)
  // Dönüş yarıda kalırsa (kopyalama hatası, klasör kilitli) geçici kopya veri klasörünün yanında kalmasın (H6)
  const dropIncoming = () => {
    try {
      fs.rmSync(incoming, { recursive: true, force: true })
    } catch {}
  }
  const aside = path.join(ROOT, `data_geri_yukleme_oncesi_${stamp()}`)
  try {
    await copyTree(snap, incoming)
    // yedekleme ayarı ve silinen profiller yerinde kalsın
    for (const keep of ['backup-settings.json', 'profiller_silinen']) {
      const p = path.join(DATA_DIR, keep)
      if (fs.existsSync(p)) fs.cpSync(p, path.join(incoming, keep), { recursive: true })
    }
    fs.renameSync(DATA_DIR, aside)
  } catch (e) {
    dropIncoming()
    throw e
  }
  try {
    fs.renameSync(incoming, DATA_DIR)
  } catch (e) {
    // Yedek yerine konamadıysa (ör. klasör o an başka programda açık) şu anki veri geri yerine konur — yoksa ARGUS
    // veri klasörü olmadan kalıp arşivleri boş gösteriyordu.
    try {
      fs.renameSync(aside, DATA_DIR)
    } catch {}
    dropIncoming()
    throw e
  }
  // 2) Eksik görselleri yedekten geri koy
  job.phase = 'medya'
  const msrc = path.join(destRoot(s.target), 'medya')
  const files = fs.existsSync(msrc) ? fs.readdirSync(msrc) : []
  job.done = 0
  job.total = files.length
  let restored = 0
  for (const f of files) {
    const dst = path.join(MEDYA_DIR, f)
    if (!fs.existsSync(dst)) {
      try {
        await fs.promises.copyFile(path.join(msrc, f), dst)
        restored++
      } catch {}
    }
    job.done++
    if (job.done % 200 === 0) await tick()
  }
  // Hafızadaki her şey (süren Genel Güncelleme, telefon eşitleme kayıtları, Evrenler, okuma önbelleği) yeni veriyle
  // baştan kurulsun diye ARGUS kendini yeniden başlatır (bkz. restart.js); arayüz o sırada "yeniden başlatılıyor" gösterir.
  const restarting = restartArgusSoon({ root: ROOT, appDir: path.join(ROOT, 'app') })
  return { restoredMedia: restored, previousData: path.basename(aside), restarting }
}

function start(kind, fn) {
  if (job?.running) throw new Error(stt('Şu an zaten bir yedekleme işi sürüyor.'))
  job = { kind, running: true, phase: 'hazırlık', done: 0, total: 0, startedAt: Date.now(), error: null, result: null }
  fn()
    .then((result) => {
      job.result = result
      if (kind === 'backup') saveSettings({ lastAt: Date.now(), lastSummary: result, lastError: null })
    })
    .catch((e) => {
      job.error = e?.message ?? String(e)
      if (kind === 'backup') {
        saveSettings({ lastError: job.error, lastErrorAt: Date.now() })
        notifyBackupProblem(stt('Yedek alınamadı: {0}', friendlyError(job.error)))
      }
    })
    .finally(() => {
      job.running = false
      job.finishedAt = Date.now()
    })
}

function autoCheck() {
  try {
    const s = settings()
    if (s.auto === 'off' || !s.target || job?.running) return
    const every = s.auto === 'daily' ? 24 * 3600e3 : 7 * 24 * 3600e3
    if (s.lastAt && Date.now() - s.lastAt < every) return
    if (!fs.existsSync(s.target)) {
      // Eskiden sessizce atlanıyordu: bulut klasörü koptuysa haftalarca yedeksiz kalınabiliyordu (Y1)
      notifyBackupProblem(stt('Yedek alınamadı: yedek klasörü bulunamadı ({0}).', s.target))
      return
    }
    start('backup', runBackup)
  } catch {}
  checkStale()
}

// ---- Yedek aksarsa haber (v1.26, Y1) ----------------------------------------------------------------
// Başarısız yedek ya da son başarılı yedeğin ayarlanan sürenin iki katından eski olması zile (ve oradan Windows
// bildirimine) düşer; tıklayınca Ayarlar › Veritabanı › Yedekleme açılır. Aynı gün aynı türden en çok bir bildirim.
const BACKUP_LINK = '/arsivlerim?sekme=veritabani&alt=yedek'
function friendlyError(msg) {
  const m = String(msg ?? '')
  if (/ENOSPC/i.test(m)) return stt('diskte yer kalmadı')
  if (/ENOENT|bulunamadı/i.test(m)) return stt('klasör bulunamadı')
  if (/EACCES|EPERM/i.test(m)) return stt('klasöre yazma izni yok')
  if (/EBUSY/i.test(m)) return stt('bir dosya başka bir programda açık')
  return m.slice(0, 140)
}
function notifyBackupProblem(text, kind = 'hata') {
  const day = new Date()
  const key = `yedek-${kind}:${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`
  for (const id of profileIds()) {
    try {
      pushNotification(id, { key, type: 'backup', title: stt('Yedekleme aksadı'), text: text + ' ' + stt('Düzeltmek için tıkla.'), link: BACKUP_LINK })
    } catch {}
  }
}
function checkStale() {
  try {
    const s = settings()
    if (s.auto === 'off' || !s.target || job?.running || !s.lastAt) return
    const every = s.auto === 'daily' ? 24 * 3600e3 : 7 * 24 * 3600e3
    if (Date.now() - s.lastAt < 2 * every) return
    const days = Math.floor((Date.now() - s.lastAt) / 864e5)
    notifyBackupProblem(stt('Son başarılı yedek {0} gün önce alındı.', days), 'eski')
  } catch {}
}

// Önerilen klasörler: OneDrive / Google Drive / Dropbox varsa (buluta kendiliğinden gider), yoksa Belgeler.
function suggestions() {
  const home = os.homedir()
  const cands = [
    { label: stt('OneDrive (buluta gider)'), path: process.env.OneDrive || path.join(home, 'OneDrive') },
    { label: stt('Google Drive (buluta gider)'), path: 'G:\\My Drive' },
    { label: stt('Google Drive (buluta gider)'), path: "G:\\Drive'ım" },
    { label: stt('Google Drive (buluta gider)'), path: path.join(home, 'Google Drive') },
    { label: stt('Dropbox (buluta gider)'), path: path.join(home, 'Dropbox') },
    { label: stt('Belgeler (sadece bu bilgisayar)'), path: path.join(home, 'Documents') },
  ]
  const seen = new Set()
  return cands.filter((c) => {
    if (seen.has(c.path) || !fs.existsSync(c.path)) return false
    seen.add(c.path)
    return true
  })
}

export function registerBackupRoutes(app) {
  app.get('/api/backup', (req, res) => {
    const s = settings()
    let snapshots = []
    if (s.target) snapshots = listSnapshots(s.target)
    res.json({ settings: s, snapshots, job, suggestions: suggestions(), targetExists: Boolean(s.target && fs.existsSync(s.target)), bootId: BOOT_ID })
  })
  app.post('/api/backup/settings', (req, res) => {
    const b = req.body ?? {}
    const patch = {}
    if (typeof b.target === 'string') {
      const t = b.target.trim().replace(/^"|"$/g, '')
      if (t && !fs.existsSync(t)) return res.status(400).json({ error: stt('Bu klasör bulunamadı: ') + t })
      patch.target = t
    }
    if (['off', 'daily', 'weekly'].includes(b.auto)) patch.auto = b.auto
    if (Number.isInteger(b.keep) && b.keep >= 1 && b.keep <= 100) patch.keep = b.keep
    saveSettings(patch)
    res.json({ ok: true, settings: settings() })
  })
  app.post('/api/backup/run', (req, res) => {
    try {
      start('backup', runBackup)
      res.json({ ok: true })
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  })
  app.post('/api/backup/restore', (req, res) => {
    try {
      const name = String(req.body?.snapshot ?? '')
      start('restore', () => runRestore(name))
      res.json({ ok: true })
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  })
}
