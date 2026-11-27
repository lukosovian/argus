// Medya, güncelleme, özellik anahtarları, arayüz tercihleri, açılış bilgisi.
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { execFile, execSync } from 'node:child_process'
import { buildRestartScript, launchDetachedRestart } from '../restart.js'
import { pushNotification } from '../notifications.js'
import { publishFile } from '../featurePublish.js'
import { stt } from '../lang.js'
import { quickDataBackup } from '../backup.js'
import { DATA_DIR, MEDYA_DIR, ROOT, __dirname, localDay, rawWriteJson, readJson, readProfiles } from '../storage.js'
import { app } from '../app.js'

// Ayarlar › Açılış › Açılış penceresinde afiş duvarı: ARGUS.exe açılırken buradaki afişleri arkada akıtır
app.post('/api/splash-info', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 20000) : ''
  try {
    fs.writeFileSync(path.join(DATA_DIR, 'splash-info.txt'), text, 'utf8')
  } catch {}
  res.json({ ok: true })
})

app.get('/api/medya', (req, res) => {
  const files = fs
    .readdirSync(MEDYA_DIR)
    .filter((f) => !f.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, 'tr'))
  res.json(files)
})

export function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '_')
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: MEDYA_DIR,
    filename: (req, file, cb) => {
      const safe = sanitizeFilename(file.originalname)
      const ext = path.extname(safe)
      const base = path.basename(safe, ext)
      let name = safe
      let i = 1
      while (fs.existsSync(path.join(MEDYA_DIR, name))) {
        name = `${base}-${i}${ext}`
        i++
      }
      cb(null, name)
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
})

app.post('/api/medya/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya gelmedi' })
  res.json({ filename: req.file.filename })
})

// İnternetteki bir görseli (adresi yapıştırılan) medya klasörüne indirir — Koleksiyon'da sembol eklerken.
app.post('/api/medya/from-url', async (req, res) => {
  try {
    const url = String(req.body?.url ?? '').trim()
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: stt('Geçerli bir görsel adresi değil.') })
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ARGUS' }, signal: AbortSignal.timeout(20000) })
    if (!r.ok) return res.status(400).json({ error: stt('Görsel indirilemedi ({0}).', r.status) })
    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim()
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/avif': '.avif' }[type]
    if (!ext) return res.status(400).json({ error: stt('Bu adres bir görsel değil (sayfanın değil, görselin kendi adresini yapıştır).') })
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 15 * 1024 * 1024) return res.status(400).json({ error: stt('Görsel çok büyük (15 MB üstü).') })
    let name = `sembol_${Date.now().toString(36)}${ext}`
    while (fs.existsSync(path.join(MEDYA_DIR, name))) name = `sembol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}${ext}`
    fs.writeFileSync(path.join(MEDYA_DIR, name), buf)
    res.json({ filename: name })
  } catch (e) {
    res.status(400).json({ error: stt('Görsel indirilemedi.') })
  }
})

// git fetch artık arka planda (execFile) — eskiden 10 sn'ye kadar bütün sunucuyu kilitliyordu.
app.get('/api/update-check', async (req, res) => {
  try {
    await gitOut(['fetch', '--quiet'], 10000)
    const behind = Number((await gitOut(['rev-list', 'HEAD..@{u}', '--count'], 5000)).trim())
    res.json({ updateAvailable: behind > 0, commitsBehind: behind || 0 })
  } catch {
    res.json({ updateAvailable: false, commitsBehind: 0 })
  }
})

// "Şimdi Güncelle" — kullanıcı bekleyip uygulamayı kendisi kapatıp açmak yerine tek tıkla
// güncellensin istedi. Kodu hemen çeker, yanıtı gönderir, sonra eski ARGUS'u kapatıp yerine
// yenisini başlatır (ayrıntılar ve neden iki kademeli olduğu: bkz. restart.js). Yanıt MUTLAKA
// süreç kapanmadan ÖNCE gönderiliyor, yoksa tarayıcı hiç cevap alamaz.
app.post('/api/apply-update', async (req, res) => {
  // v1.27 (M6): yedek klasörü ayarlıysa önce verinin hızlı bir yedeği ("Güncelleme öncesi", görseller hariç) alınır.
  // Yedek alınamasa da güncelleme durmaz; en fazla 90 sn beklenir.
  try {
    const r = await Promise.race([quickDataBackup('guncelleme'), new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı')), 90000))])
    if (r?.snapshot) console.log('[guncelleme] guncelleme oncesi yedek alindi:', r.snapshot)
  } catch (e) {
    console.error('[guncelleme] guncelleme oncesi yedek alinamadi:', e?.message ?? e)
  }
  try {
    if (fs.existsSync(path.join(ROOT, '.gelistirici'))) {
      execSync('git pull --ff-only', { cwd: ROOT, timeout: 15000, stdio: 'ignore' })
    } else {
      execSync('git fetch --quiet origin', { cwd: ROOT, timeout: 15000, stdio: 'ignore' })
      execSync('git reset --hard --quiet @{u}', { cwd: ROOT, timeout: 15000, stdio: 'ignore' })
    }
  } catch {
    return res.status(500).json({ error: stt('Güncelleme çekilemedi — internet bağlantını kontrol et.') })
  }
  // ARGUS.bat bu dosyayı app/ klasörüne yazıyor ("ARGUS Durdur.bat" da oradan okuyor). Eskiden
  // burada app/server/ içinde aranıyordu — hiç bulunamadığı için eski ARGUS hiç kapatılmıyor,
  // yeni sunucu port dolu olduğu için başlayamıyor ve eski sunucu kodu çalışmaya devam ediyordu.
  const pidFile = path.join(__dirname, '..', 'argus-pid.txt')
  let oldPid = null
  try {
    if (fs.existsSync(pidFile)) oldPid = fs.readFileSync(pidFile, 'utf-8').trim()
  } catch {}

  res.json({ ok: true })

  try {
    launchDetachedRestart(buildRestartScript({ oldPid, batPath: path.join(ROOT, 'ARGUS.bat'), root: ROOT, launcherPath: path.join(ROOT, 'app', 'launcher', 'baslat.ps1'), exePath: path.join(ROOT, 'ARGUS.exe') }), ROOT)
  } catch {}
})

// Özellik anahtarları (app/features.json, kodla birlikte GitHub'a gider). Geliştirici bilgisayarında her şey
// açık; bazı özellikler (ör. Flashback — yıllık özet) diğer kullanıcılara buradan açılıp kapatılıyor.
export const FEATURES_FILE = path.join(__dirname, '..', 'features.json')
export const isDevMachine = () => fs.existsSync(path.join(ROOT, '.gelistirici'))
// Flashback (yıllık özet) diğer kullanıcılara açıldığında her profile bir kez bildirim düşer (kullanıcı "onlarda açılınca
// haberleri olsun" dedi). Aynı anahtarla ikinci kez eklenmez (bkz. pushNotification); geliştirici
// bilgisayarında zaten hep açık olduğu için orada gönderilmez.
// Flashback'in herkese açık olduğu tarih aralığı (features.json › wrappedWindow { from, until }): kullanıcı "9 Aralık'ta
// açılsın, 1 hafta sonra kapansın" dedi. `until` günü kapalıdır. Elle açma anahtarı (wrappedForAll) da hâlâ geçerli.
export function wrappedOpen(f) {
  if (f.wrappedForAll) return true
  const w = f.wrappedWindow
  if (!w || typeof w.from !== 'string' || typeof w.until !== 'string') return false
  const today = localDay()
  return today >= w.from && today < w.until
}

export function announceFeatures(f) {
  if (isDevMachine()) return
  if (!wrappedOpen(f)) return
  for (const p of readProfiles()) {
    try {
      pushNotification(p.id, {
        key: `feature:wrapped:${localDay().slice(0, 4)}`,
        type: 'feature',
        title: stt('Yeni: Flashback'),
        text: stt('Yılın nasıl geçti? Toplam ekran süren, izleyici unvanın, maratonların, en sevdiklerin ve paylaşabileceğin bir hikâye kartı. Profil menüsünde.'),
        link: '/flashback',
      })
    } catch {
      /* bildirim yazılamadıysa önemsiz */
    }
  }
}

// Arayüz tercihleri (kapatılan sütunlar, tablo sıklığı, tema, TMDB tercihleri, "bir daha sorma"lar…).
// Eskiden sadece tarayıcının kendi hafızasındaydı (localStorage); ARGUS kendi uygulamasına (Electron)
// geçince uygulamanın hafızası tarayıcınınkinden ayrı olduğu için hepsi kaybolacaktı. Artık burada da
// tutuluyor (bkz. src/lib/uiPrefs.ts): uygulama ve tarayıcı aynı tercihleri görür. migratedAt: tarayıcıdaki
// eski tercihler bir kez aktarıldı mı (bkz. desktop/main.cjs'teki ilk açılış).
export const UI_PREFS_FILE = path.join(DATA_DIR, 'ui-prefs.json')
app.get('/api/ui-prefs', (req, res) => {
  res.json(readJson(UI_PREFS_FILE, { prefs: {} }))
})
app.post('/api/ui-prefs', (req, res) => {
  const data = readJson(UI_PREFS_FILE, { prefs: {} })
  data.prefs = data.prefs ?? {}
  const set = req.body?.set && typeof req.body.set === 'object' ? req.body.set : {}
  for (const [k, v] of Object.entries(set)) if (/^argus_/.test(k) && typeof v === 'string' && v.length < 200000) data.prefs[k] = v
  for (const k of Array.isArray(req.body?.remove) ? req.body.remove : []) delete data.prefs[k]
  if (req.body?.migrate) data.migratedAt = Date.now()
  rawWriteJson(UI_PREFS_FILE, data)
  res.json({ ok: true })
})

// Diğer bilgisayarlarda anahtarlar GitHub'daki güncel features.json'dan okunur (20 sn'de en çok bir kez
// bakılır), kod güncellemesi beklenmez. Kullanıcı "Flashback'i açtım ama arkadaşa güncelle bildirimi
// gitmedi" dedi: anahtar sadece bir açma/kapama, özelliğin kodu zaten orada — açınca birkaç dakikada
// kendiliğinden görünsün. İnternet yoksa yerel dosyaya düşülür.
export const remoteFeatures = { at: 0, value: null, pending: null }
export function gitOut(args, timeout) {
  return new Promise((resolve, reject) =>
    execFile('git', args, { cwd: ROOT, timeout, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(String(stdout)))),
  )
}
export async function currentFeatures() {
  const local = readJson(FEATURES_FILE, {})
  if (isDevMachine()) return local
  if (Date.now() - remoteFeatures.at > 20_000 && !remoteFeatures.pending) {
    remoteFeatures.pending = (async () => {
      try {
        await gitOut(['fetch', '--quiet', 'origin'], 15000)
        remoteFeatures.value = JSON.parse(await gitOut(['show', '@{u}:app/features.json'], 5000))
      } catch {
        /* internet yok — son bilinen ya da yerel değer */
      } finally {
        remoteFeatures.at = Date.now()
        remoteFeatures.pending = null
      }
    })()
  }
  // İlk seferde cevabı bekle; sonrakilerde eldeki değerle hemen dön, arkada tazelensin.
  if (remoteFeatures.pending && !remoteFeatures.value) await remoteFeatures.pending
  return remoteFeatures.value ?? local
}

app.get('/api/features', async (req, res) => {
  const f = await currentFeatures()
  announceFeatures(f)
  res.json({ developer: isDevMachine(), wrappedForAll: wrappedOpen(f), wrappedManual: Boolean(f.wrappedForAll), wrappedWindow: f.wrappedWindow ?? null })
})
app.post('/api/features', async (req, res) => {
  if (!isDevMachine()) return res.status(403).json({ error: stt('Bu ayar sadece geliştirici bilgisayarında değiştirilebilir.') })
  const f = readJson(FEATURES_FILE, {})
  if (typeof req.body?.wrappedForAll === 'boolean') f.wrappedForAll = req.body.wrappedForAll
  fs.writeFileSync(FEATURES_FILE, JSON.stringify(f, null, 2) + '\n', 'utf-8')
  // Kullanıcı ayrıca "gönder" demek zorunda kalmasın: sadece bu dosya Git'e gönderilir (bkz. featurePublish.js)
  const pub = await publishFile(ROOT, FEATURES_FILE, f.wrappedForAll ? 'Flashback diger kullanicilara acildi' : 'Flashback diger kullanicilara kapatildi')
  res.json({ ok: true, wrappedForAll: wrappedOpen(f), wrappedManual: Boolean(f.wrappedForAll), wrappedWindow: f.wrappedWindow ?? null, ...pub })
})
