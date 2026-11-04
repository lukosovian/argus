// Telefon eşitlemesi — kullanıcı "telefondan değiştirdiğim şeyi telefon hafızasında tutsun, PC'ye bağlanınca
// ikisi aynı ağda olunca iletişim kursun, bunlar bunlar değişti desin" dedi (ARGUS Android uygulaması).
//
// Nasıl çalışıyor:
//   - Eşleştirme: PC'de Ayarlar › Telefon Bağla 6 haneli bir kod gösterir (10 dk geçerli). Telefon aynı ağda
//     ARGUS'u bulur (/api/sync/hello), kodu gönderir (/api/sync/pair) ve kalıcı bir anahtar alır. Anahtarın
//     sadece özeti (sha256) data/devices.json'da tutulur. PC'den telefon kaldırılınca anahtar geçersiz olur.
//   - Erişim: bu bilgisayarın kendisi dışındaki her istek geçerli bir anahtar (X-Argus-Token) ister. Bazı
//     işler (güncelleme, yedekten dönme, telefon ekleme/kaldırma, TMDB anahtarı) telefondan hiç yapılamaz.
//   - Değişiklik listesi: telefon PC yokken yaptığı değişiklikleri sırayla, her birinin kimliği
//     (X-Argus-Op-Id) ve yapıldığı an (X-Argus-Op-At) ile normal uç noktalara gönderir. Sunucu kendi
//     kurallarını (otomatik durum, puan sorma, bölüm numarası düzeltme…) aynen uygular. Aynı kimlikle ikinci
//     kez gelen değişiklik (bağlantı yarıda koptuysa) tekrar uygulanmaz: data/sync-applied.json.
//   - Çakışma: kayıt alanları için "son yapılan kazanır" — kayıtlarda her alanın son değişiklik anı
//     (fieldAt) tutulur (bkz. history.js beforeWrite), PC'de daha sonra değişmiş bir alanı telefonun eski
//     değişikliği ezmez (bkz. index.js satır PUT).
//   - Çekme: telefon /api/sync/manifest ile veri dosyalarının değişiklik zamanlarını alır, sadece
//     değişenlere karşılık gelen verileri yeniden ister.
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import QRCode from 'qrcode'
import { stt } from './lang.js'

let DATA_DIR = ''
let PROFILES_DIR = ''
let readJson = (_f, fb) => fb
let rawWrite = (_f, _d) => {}
let makeId = () => Math.random().toString(36).slice(2, 10)
let appVersion = ''
let MOBILE_DIR = ''

const devicesFile = () => path.join(DATA_DIR, 'devices.json')
const appliedFile = () => path.join(DATA_DIR, 'sync-applied.json')
const serverIdFile = () => path.join(DATA_DIR, 'sync-id.json')

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_CODE_TRIES = 5
const APPLIED_KEEP_MS = 90 * 24 * 60 * 60 * 1000
const LAST_SEEN_EVERY_MS = 5 * 60 * 1000

let pairing = null // { code, expiresAt, tries }
let applied = null // Map opId → zaman
let serverId = ''

export function initSync(opts) {
  DATA_DIR = opts.dataDir
  PROFILES_DIR = opts.profilesDir
  readJson = opts.readJson
  rawWrite = opts.rawWrite
  makeId = opts.makeId
  appVersion = opts.appVersion || ''
  MOBILE_DIR = opts.mobileDir || ''
  const saved = readJson(serverIdFile(), null)
  if (saved?.id) serverId = saved.id
  else {
    serverId = crypto.randomBytes(8).toString('hex')
    rawWrite(serverIdFile(), { id: serverId })
  }
}

const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex')

function readDevices() {
  const list = readJson(devicesFile(), [])
  return Array.isArray(list) ? list : []
}

// İsteğin ağdan değil bu bilgisayarın kendisinden geldiği (soket adresi) — Host başlığı ağdaki biri
// tarafından "localhost" diye yazılabileceği için tek başına yetmez.
export function isLoopback(req) {
  const a = req.socket?.remoteAddress || ''
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'
}

// Anahtarsız (henüz eşleşmemiş telefon) ulaşılabilen tek yerler: tanışma ve eşleştirme.
// APK de açık: telefona ilk kurulum, PC'deki QR kod okutularak telefonun kendi tarayıcısından yapılıyor (APK zaten
// herkese açık GitHub deposunda duruyor).
const OPEN_PATHS = new Set(['/api/sync/hello', '/api/sync/pair', '/api/mobile/apk'])
// Telefondan (anahtarı olsa bile) hiç yapılamayan işler.
const LOCAL_ONLY = [
  /^\/api\/apply-update/,
  /^\/api\/backup/,
  /^\/api\/history\/(limit|trim)/,
  /^\/api\/sync\/(devices|pair-code)/,
  /^\/api\/mobile\/qr/,
  /^\/api\/profiles\/[^/]+\/api-key/,
]

export function isLocalOnlyPath(p) {
  return LOCAL_ONLY.some((re) => re.test(p))
}

let lastSeenWritten = 0
function findDevice(token) {
  if (!token) return null
  const h = hash(token)
  const devices = readDevices()
  const d = devices.find((x) => x.tokenHash === h)
  if (!d) return null
  const now = Date.now()
  if (now - (d.lastSeen || 0) > LAST_SEEN_EVERY_MS && now - lastSeenWritten > 10_000) {
    d.lastSeen = now
    lastSeenWritten = now
    try {
      rawWrite(devicesFile(), devices)
    } catch {
      /* önemsiz */
    }
  }
  return d
}

// Bu bilgisayardan gelmeyen bir isteğe izin var mı? true → devam; yoksa hata mesajı.
export function checkRemote(req) {
  if (OPEN_PATHS.has(req.path)) return true
  const device = findDevice(req.headers['x-argus-token'])
  if (!device) return stt('Bu cihaz ARGUS\'a bağlı değil. PC\'de Ayarlar › Telefon Bağla\'dan eşleştir.')
  if (isLocalOnlyPath(req.path)) return stt('Bu işlem sadece PC\'deki ARGUS\'tan yapılabilir.')
  req.argusDevice = device
  return true
}

function loadApplied() {
  if (applied) return applied
  const data = readJson(appliedFile(), {})
  applied = new Map(Object.entries(data && typeof data === 'object' ? data : {}))
  return applied
}
let appliedTimer = null
function saveAppliedSoon() {
  if (appliedTimer) return
  appliedTimer = setTimeout(() => {
    appliedTimer = null
    const cut = Date.now() - APPLIED_KEEP_MS
    for (const [k, t] of applied) if (t < cut) applied.delete(k)
    try {
      rawWrite(appliedFile(), Object.fromEntries(applied))
    } catch (e) {
      console.error('sync-applied yazılamadı:', e)
    }
  }, 300)
}

// Telefonun değişiklik listesinden gelen ve daha önce uygulanmış bir istek tekrar çalışmasın.
export function opDedupeMiddleware(req, res, next) {
  const opId = req.headers['x-argus-op-id']
  if (!opId || req.method === 'GET') return next()
  const map = loadApplied()
  if (map.has(opId)) return res.json({ ok: true, duplicate: true })
  res.on('finish', () => {
    if (res.statusCode < 400) {
      map.set(String(opId), Date.now())
      saveAppliedSoon()
    }
  })
  next()
}

// Değişikliğin telefonda yapıldığı an (ms) — yoksa null (PC'deki normal istek).
export function opAt(req) {
  const n = Number(req.headers['x-argus-op-at'])
  return Number.isFinite(n) && n > 0 ? n : null
}

function lanAddresses() {
  const out = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address)
    }
  }
  return out
}

function walkData() {
  const files = {}
  const add = (abs) => {
    try {
      const st = fs.statSync(abs)
      files[path.relative(DATA_DIR, abs).split(path.sep).join('/')] = { m: Math.floor(st.mtimeMs), s: st.size }
    } catch {
      /* silinmiş */
    }
  }
  add(path.join(DATA_DIR, 'profile.json'))
  let profiles = []
  try {
    profiles = fs.readdirSync(PROFILES_DIR, { withFileTypes: true }).filter((e) => e.isDirectory())
  } catch {
    /* yok */
  }
  for (const p of profiles) {
    const dir = path.join(PROFILES_DIR, p.name)
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.json') && f !== 'api-key.json') add(path.join(dir, f))
    try {
      for (const f of fs.readdirSync(path.join(dir, 'rows'))) if (f.endsWith('.json')) add(path.join(dir, 'rows', f))
    } catch {
      /* arşiv yok */
    }
  }
  return files
}

export function registerSyncRoutes(app) {
  app.get('/api/sync/hello', (req, res) => {
    res.json({ app: 'ARGUS', serverId, pcName: os.hostname(), version: appVersion })
  })

  // PC'deki ARGUS: yeni eşleştirme kodu üretir (öncekini geçersiz kılar).
  app.post('/api/sync/pair-code', (req, res) => {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    pairing = { code, expiresAt: Date.now() + CODE_TTL_MS, tries: 0 }
    res.json({ code, expiresAt: pairing.expiresAt, addresses: lanAddresses(), port: Number(process.env.PORT) || 4000 })
  })

  app.post('/api/sync/pair', (req, res) => {
    const code = String(req.body?.code ?? '').replace(/\D/g, '')
    if (!pairing || Date.now() > pairing.expiresAt) {
      return res.status(403).json({ error: stt('Kodun süresi doldu. PC\'de Telefon Bağla\'dan yeni kod al.') })
    }
    if (code !== pairing.code) {
      pairing.tries++
      if (pairing.tries >= MAX_CODE_TRIES) pairing = null
      return res.status(403).json({ error: stt('Kod yanlış.') })
    }
    pairing = null
    const token = crypto.randomBytes(24).toString('hex')
    const name = String(req.body?.name ?? '').trim().slice(0, 60) || stt('Telefon')
    const device = { id: makeId(), name, tokenHash: hash(token), pairedAt: Date.now(), lastSeen: Date.now() }
    rawWrite(devicesFile(), [...readDevices(), device])
    res.json({ token, deviceId: device.id, serverId, pcName: os.hostname(), version: appVersion })
  })

  app.get('/api/sync/devices', (req, res) => {
    res.json({
      devices: readDevices().map(({ tokenHash: _h, ...d }) => d),
      pairing: pairing && Date.now() < pairing.expiresAt ? { code: pairing.code, expiresAt: pairing.expiresAt } : null,
      addresses: lanAddresses(),
    })
  })

  app.delete('/api/sync/devices/:id', (req, res) => {
    rawWrite(
      devicesFile(),
      readDevices().filter((d) => d.id !== req.params.id),
    )
    res.json({ ok: true })
  })

  // ---- Telefon uygulaması (APK) --------------------------------------------------------------------------
  // app/mobile/ARGUS.apk + surum.json mobile/derle.cmd ile üretilip PC sürümüyle birlikte GitHub'a gönderiliyor;
  // ARGUS güncellenince bunlar da gelir. Telefon PC'ye bağlanınca sürüme bakıp kendini güncelleyebilir.
  app.get('/api/mobile/info', (req, res) => {
    const apk = path.join(MOBILE_DIR, 'ARGUS.apk')
    const info = readJson(path.join(MOBILE_DIR, 'surum.json'), null)
    let size = 0
    try {
      size = fs.statSync(apk).size
    } catch {
      return res.json({ available: false })
    }
    res.json({ available: true, version: info?.version ?? '', code: info?.code ?? 0, size })
  })

  app.get('/api/mobile/apk', (req, res) => {
    const apk = path.join(MOBILE_DIR, 'ARGUS.apk')
    if (!fs.existsSync(apk)) return res.status(404).json({ error: stt('Telefon uygulaması bu ARGUS\'ta yok.') })
    res.setHeader('Content-Type', 'application/vnd.android.package-archive')
    res.download(apk, 'ARGUS.apk')
  })

  // PC'deki Ayarlar › Telefon: telefona kurmak için okutulacak QR kod (APK'nın ağdaki adresi)
  app.get('/api/mobile/qr', async (req, res) => {
    const host = String(req.query.host ?? '').replace(/[^0-9.]/g, '')
    if (!host) return res.status(400).end()
    const svg = await QRCode.toString(`http://${host}:${Number(process.env.PORT) || 4000}/api/mobile/apk`, {
      type: 'svg',
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    })
    res.setHeader('Content-Type', 'image/svg+xml')
    res.send(svg)
  })

  // Telefonun neyi yeniden çekmesi gerektiğini bulması için veri dosyalarının değişiklik zamanları.
  app.get('/api/sync/manifest', (req, res) => {
    res.json({ serverId, version: appVersion, now: Date.now(), files: walkData() })
  })
}
