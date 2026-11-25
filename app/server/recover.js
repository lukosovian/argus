// Bozuk dosyayı kendiliğinden kurtarma (v1.26, G1). Bir veri dosyası okunamayınca ARGUS onu korumak için üstüne yazmıyor
// (bkz. storage.js unreadableFiles) ama düzeltmek kullanıcıya kalıyordu. Artık dakikada bir bakılır: dosya birkaç turda
// da okunamıyorsa ve sebep kilit değil gerçekten bozulma ise, o dosyanın en son sağlam hali aranır —
//   - arşiv kayıtları için arşiv geçmişindeki günlük kopyalar (history/<arşiv>/snap/<gün>/rows.json),
//   - her dosya için seçili yedek klasöründeki yedekler (ARGUS Yedek/veri/<tarih>/...).
// En yenisi zile ve Ayarlar › Veritabanı › Yedekleme'deki karta "… haline geri getirilebilir — getireyim mi?" diye düşer.
// Onaylanınca bozuk dosya yanına "<ad>.bozuk-<tarih>" olarak kenara alınır, sağlam kopya yerine konur.
import fs from 'node:fs'
import path from 'node:path'
import { app } from './app.js'
import { serverLang, stt } from './lang.js'
import { pushNotification } from './notifications.js'
import { DATA_DIR, PROFILES_DIR, readJson, readJsonShared, readProfiles, unreadableFiles } from './storage.js'

const issues = new Map() // dosya → { since, checks, corrupt }
const CHECKS_BEFORE_OFFER = 3

function rel(file) {
  return path.relative(DATA_DIR, file).split(path.sep).join('/')
}
function abs(r) {
  const p = path.resolve(DATA_DIR, r)
  if (!p.startsWith(path.resolve(DATA_DIR) + path.sep)) return null
  return p
}

// Okunamıyor ama sebebi kilit mi bozulma mı
function probe(file) {
  try {
    const text = fs.readFileSync(file, 'utf-8')
    try {
      JSON.parse(text)
      return 'ok'
    } catch {
      return 'corrupt'
    }
  } catch (e) {
    return e?.code === 'ENOENT' ? 'ok' : 'locked'
  }
}

function validJson(file, wantArray) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return wantArray ? Array.isArray(v) : v !== undefined
  } catch {
    return false
  }
}

const SNAP_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/
function snapTime(name) {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})$/.exec(name)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime() : 0
}

// Dosyanın en yeni sağlam kopyası: { source: 'gecmis'|'yedek', path, at } | null
export function findCandidate(file) {
  const r = rel(file)
  const out = []
  // 1) Arşiv geçmişi: profiles/<p>/rows/<b>.json → profiles/<p>/history/<b>/snap/<gün>/rows.json
  const m = /^profiles\/([^/]+)\/rows\/([^/]+)\.json$/.exec(r)
  if (m) {
    const dir = path.join(PROFILES_DIR, m[1], 'history', m[2], 'snap')
    let days = []
    try {
      days = fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    } catch {}
    for (const d of days.sort().reverse().slice(0, 15)) {
      const p = path.join(dir, d, 'rows.json')
      try {
        out.push({ source: 'gecmis', path: p, at: fs.statSync(p).mtimeMs, wantArray: true })
      } catch {}
    }
  }
  // 2) Yedekler
  const target = readJson(path.join(DATA_DIR, 'backup-settings.json'), {})?.target
  if (typeof target === 'string' && target) {
    const vdir = path.join(target, 'ARGUS Yedek', 'veri')
    let snaps = []
    try {
      snaps = fs.readdirSync(vdir).filter((n) => SNAP_RE.test(n))
    } catch {}
    for (const n of snaps.sort().reverse().slice(0, 15)) {
      const p = path.join(vdir, n, ...r.split('/'))
      if (fs.existsSync(p)) out.push({ source: 'yedek', path: p, at: snapTime(n), wantArray: Boolean(m) })
    }
  }
  out.sort((a, b) => b.at - a.at)
  const ok = out.find((c) => validJson(c.path, c.wantArray))
  return ok ? { source: ok.source, path: ok.path, at: ok.at } : null
}

// Kullanıcıya dosyanın ne olduğu (arşiv adıyla)
function describe(file) {
  const r = rel(file)
  const m = /^profiles\/([^/]+)\/(.+)$/.exec(r)
  if (!m) return { what: path.basename(file), profileId: null }
  const [, pid, rest] = m
  const rows = /^rows\/([^/]+)\.json$/.exec(rest)
  if (rows) {
    const boards = readJsonShared(path.join(PROFILES_DIR, pid, 'boards.json'), [])
    const b = Array.isArray(boards) ? boards.find((x) => x.id === rows[1]) : null
    return { what: b?.name ? stt('"{0}" arşivinin kayıtları', b.name) : stt('Arşiv kayıtları'), profileId: pid }
  }
  const names = {
    'boards.json': stt('Arşivlerin yapısı (sütunlar)'),
    'watched.json': stt('Bölüm izleme işaretleri'),
    'episodes.json': stt('Dizi bölüm listeleri'),
    'tmdb.json': stt('TMDB eşleşmeleri'),
    'home-settings.json': stt('Ana sayfa ayarları'),
  }
  return { what: names[rest] ?? rest, profileId: pid }
}

function fmtAt(ms) {
  const d = new Date(ms)
  return d.toLocaleString(serverLang() === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

function tick() {
  for (const file of [...unreadableFiles]) {
    const state = probe(file)
    if (state === 'ok') {
      // Tekrar okunabiliyor (kilit kalktı): yasak da kalksın
      readJson(file, null)
      issues.delete(file)
      continue
    }
    const it = issues.get(file) ?? { since: Date.now(), checks: 0, corrupt: false, notified: false }
    it.checks++
    it.corrupt = state === 'corrupt'
    issues.set(file, it)
    if (!it.corrupt || it.checks < CHECKS_BEFORE_OFFER || it.notified) continue
    it.notified = true
    const cand = findCandidate(file)
    const { what, profileId } = describe(file)
    const targets = profileId ? [profileId] : readProfiles().map((p) => p.id)
    for (const pid of targets) {
      try {
        pushNotification(pid, {
          key: `kurtar:${rel(file)}:${new Date().toDateString()}`,
          type: 'recover',
          title: stt('Bir dosya bozulmuş: {0}', what),
          text: cand
            ? stt('{0} haline geri getirilebilir — getireyim mi? Tıkla, tek tuşla düzelt.', fmtAt(cand.at))
            : stt('Sağlam bir kopyası bulunamadı. Verin korunuyor; yedekten geri yüklemek için tıkla.'),
          link: '/arsivlerim?sekme=veritabani&alt=yedek',
        })
      } catch {}
    }
  }
  for (const f of [...issues.keys()]) if (!unreadableFiles.has(f)) issues.delete(f)
}

export function initRecover() {
  setInterval(tick, 60_000)
}

app.get('/api/kurtarma', (req, res) => {
  const items = []
  for (const file of unreadableFiles) {
    const it = issues.get(file)
    if (!it?.corrupt || it.checks < CHECKS_BEFORE_OFFER) continue
    const cand = findCandidate(file)
    items.push({ file: rel(file), what: describe(file).what, since: it.since, candidate: cand ? { source: cand.source, at: cand.at } : null })
  }
  res.json({ items })
})

app.post('/api/kurtarma', (req, res) => {
  const file = abs(String(req.body?.file ?? ''))
  if (!file || !unreadableFiles.has(file)) return res.status(400).json({ error: stt('Bu dosyada kurtarılacak bir sorun yok.') })
  if (probe(file) !== 'corrupt') return res.status(409).json({ error: stt('Dosya şu an başka bir programda açık — biraz sonra tekrar dene.') })
  const cand = findCandidate(file)
  if (!cand) return res.status(404).json({ error: stt('Bu dosyanın sağlam bir kopyası bulunamadı.') })
  const d = new Date()
  const tag = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  const aside = `${file}.bozuk-${tag}`
  try {
    fs.renameSync(file, aside)
  } catch {
    try {
      fs.copyFileSync(file, aside)
    } catch {}
  }
  try {
    const tmp = `${file}.${process.pid}.kurtar.tmp`
    fs.copyFileSync(cand.path, tmp)
    fs.renameSync(tmp, file)
    // Telefon eşitlemesi değişikliği görsün (kopyalama eski tarihi taşıyabiliyor)
    const now = new Date()
    fs.utimesSync(file, now, now)
  } catch (e) {
    return res.status(500).json({ error: stt('Kopya yerine konamadı: {0}', e?.message ?? '') })
  }
  readJson(file, null) // yasak kalksın
  unreadableFiles.delete(file)
  issues.delete(file)
  res.json({ ok: true, at: cand.at, source: cand.source, aside: path.basename(aside) })
})
