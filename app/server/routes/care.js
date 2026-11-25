// Disk ve görsel bakımı (v1.26).
//   Y9 — Kullanılmayan görseller: kayıt silinince ya da afiş değişince eski görsel medya klasöründe kalıyordu. Burada
//        hiçbir veri dosyasında (arşivler, bölümler, kadro, biletler, koleksiyon, ayarlar, arşiv geçmişi dahil — yani geri
//        getirilebilecek kayıtlarınki de) adı geçmeyen görseller bulunur. Temizlenenler hemen silinmez: medya/.cop/<tarih>/
//        klasöründe 30 gün bekler, istenirse "Geri getir" ile geri konur. Son 2 günde eklenen görsellere dokunulmaz
//        (yeni yüklenmiş ama henüz kaydedilmemiş olabilir).
//   Y8 — Disk uyarısı: diskte 2 GB'tan az yer kalınca zile "Diskin dolmak üzere" düşer; Ayarlar › Veritabanı › Yedekleme'deki
//        "Disk ve alan" kartında ne kadar yer açılacağı yazarak tek tuşla görsel temizliği ve eski geçmişi silme.
import fs from 'node:fs'
import path from 'node:path'
import { app } from '../app.js'
import { stt } from '../lang.js'
import { pushNotification } from '../notifications.js'
import { historyBytes, historySettings, trimOldest } from '../history.js'
import { DATA_DIR, MEDYA_DIR, readProfiles } from '../storage.js'

const TRASH = path.join(MEDYA_DIR, '.cop')
const TRASH_DAYS = 30
const FRESH_MS = 2 * 864e5
export const LOW_DISK_BYTES = 2 * 1024 ** 3
const TEXT_EXT = /\.(json|jsonl|txt)$/i
const IMG_NAME = /[A-Za-z0-9_\-.()%]+\.(?:jpe?g|png|webp|gif|svg|avif|bmp|ico)/gi

const breathe = () => new Promise((r) => setImmediate(r))

// Veri klasöründe adı geçen bütün medya dosyaları
async function referencedNames() {
  const names = new Set()
  const add = (n) => {
    if (!n) return
    names.add(n)
    try {
      names.add(decodeURIComponent(n))
    } catch {}
  }
  const walk = async (dir) => {
    let list = []
    try {
      list = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of list) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        await walk(p)
        continue
      }
      if (!TEXT_EXT.test(e.name)) continue
      let text = ''
      try {
        text = await fs.promises.readFile(p, 'utf-8')
      } catch {
        continue
      }
      // "/medya/<ad>" (asıl biçim) — ad Türkçe karakter ya da boşluk içerebilir
      for (const m of text.matchAll(/\/medya\/([^"'\\?#\r\n]+)/g)) add(m[1])
      // Yalnız dosya adı olarak geçenler (temkin için)
      for (const m of text.matchAll(IMG_NAME)) add(m[0])
      await breathe()
    }
  }
  await walk(DATA_DIR)
  return names
}

function mediaFiles() {
  const out = []
  let list = []
  try {
    list = fs.readdirSync(MEDYA_DIR, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of list) {
    if (!e.isFile() || e.name.startsWith('.') || e.name.endsWith('.tmp')) continue
    try {
      const st = fs.statSync(path.join(MEDYA_DIR, e.name))
      out.push({ name: e.name, size: st.size, mtime: st.mtimeMs })
    } catch {}
  }
  return out
}

function trashBatches() {
  let list = []
  try {
    list = fs.readdirSync(TRASH, { withFileTypes: true }).filter((e) => e.isDirectory())
  } catch {
    return []
  }
  return list
    .map((e) => {
      const dir = path.join(TRASH, e.name)
      let count = 0
      let bytes = 0
      try {
        for (const f of fs.readdirSync(dir)) {
          count++
          try {
            bytes += fs.statSync(path.join(dir, f)).size
          } catch {}
        }
      } catch {}
      return { id: e.name, at: Number(e.name.split('_')[0]) || 0, count, bytes }
    })
    .sort((a, b) => b.at - a.at)
}

function purgeTrash() {
  for (const b of trashBatches()) {
    if (Date.now() - b.at > TRASH_DAYS * 864e5) {
      try {
        fs.rmSync(path.join(TRASH, b.id), { recursive: true, force: true })
      } catch {}
    }
  }
}

let scanCache = null // { at, orphans: [{name,size}], total, totalBytes }
let scanning = null
async function scan(force = false) {
  if (!force && scanCache && Date.now() - scanCache.at < 10 * 60e3) return scanCache
  if (scanning) return scanning
  scanning = (async () => {
    try {
      purgeTrash()
      const files = mediaFiles()
      const used = await referencedNames()
      const orphans = files.filter((f) => !used.has(f.name) && Date.now() - f.mtime > FRESH_MS)
      scanCache = { at: Date.now(), orphans, total: files.length, totalBytes: files.reduce((n, f) => n + f.size, 0) }
      return scanCache
    } finally {
      scanning = null
    }
  })()
  return scanning
}

function summary(s) {
  const trash = trashBatches()
  return {
    count: s.orphans.length,
    bytes: s.orphans.reduce((n, f) => n + f.size, 0),
    total: s.total,
    totalBytes: s.totalBytes,
    scannedAt: s.at,
    trash: { count: trash.reduce((n, b) => n + b.count, 0), bytes: trash.reduce((n, b) => n + b.bytes, 0), last: trash[0] ?? null, days: TRASH_DAYS },
  }
}

app.get('/api/medya-temizlik', async (req, res) => {
  res.json(summary(await scan(req.query.yenile === '1')))
})

app.post('/api/medya-temizlik/temizle', async (req, res) => {
  const s = await scan(true)
  if (!s.orphans.length) return res.json({ ...summary(s), ok: true, moved: 0, freed: 0 })
  const id = `${Date.now()}_${s.orphans.length}`
  const dir = path.join(TRASH, id)
  fs.mkdirSync(dir, { recursive: true })
  let moved = 0
  let bytes = 0
  for (const f of s.orphans) {
    try {
      fs.renameSync(path.join(MEDYA_DIR, f.name), path.join(dir, f.name))
      moved++
      bytes += f.size
    } catch {}
  }
  scanCache = null
  res.json({ ...summary(await scan(true)), ok: true, moved, freed: bytes, batch: id })
})

// Son temizlikte çöpe alınanları geri koyar
app.post('/api/medya-temizlik/geri-al', async (req, res) => {
  const batch = typeof req.body?.batch === 'string' ? req.body.batch : trashBatches()[0]?.id
  if (!batch || !/^\d+_\d+$/.test(batch)) return res.status(400).json({ error: stt('Geri getirilecek bir temizlik yok.') })
  const dir = path.join(TRASH, batch)
  let restored = 0
  try {
    for (const f of fs.readdirSync(dir)) {
      const dst = path.join(MEDYA_DIR, f)
      if (fs.existsSync(dst)) continue
      try {
        fs.renameSync(path.join(dir, f), dst)
        restored++
      } catch {}
    }
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    return res.status(404).json({ error: stt('Bu temizlik artık çöp klasöründe yok.') })
  }
  scanCache = null
  res.json({ ...summary(await scan(true)), ok: true, restored })
})

// ---- Disk ----
export function diskInfo() {
  try {
    const st = fs.statfsSync(DATA_DIR)
    const free = Number(st.bavail) * Number(st.bsize)
    const total = Number(st.blocks) * Number(st.bsize)
    return { free, total, low: free < LOW_DISK_BYTES }
  } catch {
    return { free: null, total: null, low: false }
  }
}

app.get('/api/disk', (req, res) => {
  const hb = historyBytes()
  res.json({ ...diskInfo(), lowBytes: LOW_DISK_BYTES, history: { bytes: hb, limitBytes: historySettings().limitBytes } })
})

// "Eski geçmişi sil": arşiv geçmişinin en eski yarısı (en eski günlük haller, sonra eski aylar) silinir
app.post('/api/disk/gecmis', (req, res) => {
  const before = historyBytes()
  if (before <= 0) return res.json({ ok: true, freed: 0 })
  trimOldest((before * 0.5) / 0.9)
  const after = historyBytes()
  res.json({ ok: true, freed: Math.max(0, before - after), bytes: after })
})

// Diskte 2 GB'tan az yer kalınca: 3 günde en çok bir kez, her profilin ziline
function checkDisk() {
  const d = diskInfo()
  if (!d.low || d.free === null) return
  const gb = (d.free / 1024 ** 3).toFixed(1)
  const key = `disk:${Math.floor(Date.now() / (3 * 864e5))}`
  for (const p of readProfiles()) {
    try {
      pushNotification(p.id, {
        key,
        type: 'disk',
        title: stt('Diskin dolmak üzere'),
        text: stt('Sadece {0} GB boş yer kaldı — ARGUS kaydedemeyebilir. Kullanılmayan görselleri ve eski geçmişi temizlemek için tıkla.', gb),
        link: '/arsivlerim?sekme=veritabani&alt=yedek&alan=1',
      })
    } catch {}
  }
}

export function initCare() {
  setTimeout(() => {
    checkDisk()
    purgeTrash()
  }, 3 * 60_000)
  setInterval(checkDisk, 6 * 3600e3)
}
