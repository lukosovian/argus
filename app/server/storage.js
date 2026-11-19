// Veri dosyaları: yollar, okuma/yazma (önbellek, kilit, güvenli yazma) ve profil dosyaları.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeWrite } from './history.js'
import { stt } from './lang.js'

export const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..', '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const PROFILES_DIR = path.join(DATA_DIR, 'profiles')
export const MEDYA_DIR = path.join(ROOT, 'medya')

for (const dir of [DATA_DIR, PROFILES_DIR, MEDYA_DIR]) fs.mkdirSync(dir, { recursive: true })

export const PROFILE_FILE = path.join(DATA_DIR, 'profile.json')

// Var olduğu halde okunamayan dosyalar (bozuk ya da o an antivirüs/başka program kilitlemiş). Böyle bir
// dosya "boş" sayılıp okunduysa, o boş hali dosyanın üstüne YAZILMIYOR — yoksa bütün arşiv silinebilirdi.
// Dosya tekrar sağlıklı okununca yasak kalkıyor.
export const unreadableFiles = new Set()

// Okuma önbelleği: dosya → { stamp (değişme zamanı + boyut), value (dondurulmuş) }. Aynı istek içinde ve istekler
// arasında episodes.json (4–5 MB), boards.json gibi büyük dosyalar her seferinde yeniden ayrıştırılmasın.
// readJsonShared önbellekteki DONDURULMUŞ nesneyi verir (sadece okuyan yerler için — değiştirmeye kalkışan
// hata alır); readJson her zaman değiştirilebilir, kendine ait bir kopya verir (önbellekte varsa oradan kopyalanır).
const readCache = new Map()
const READ_CACHE_MAX = 64

function fileStamp(file) {
  try {
    const st = fs.statSync(file)
    return `${st.mtimeMs}:${st.size}`
  } catch {
    return null
  }
}

function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const k of Object.keys(v)) deepFreeze(v[k])
  }
  return v
}

export function readJsonShared(file, fallback) {
  const stamp = fileStamp(file)
  if (stamp === null) return readJson(file, fallback)
  const hit = readCache.get(file)
  if (hit && hit.stamp === stamp) return hit.value
  const value = readJsonRaw(file, undefined)
  if (value === undefined) return fallback
  readCache.delete(file)
  readCache.set(file, { stamp, value: deepFreeze(value) })
  if (readCache.size > READ_CACHE_MAX) readCache.delete(readCache.keys().next().value)
  return value
}

export function readJson(file, fallback) {
  const hit = readCache.get(file)
  if (hit) {
    if (hit.stamp === fileStamp(file)) return structuredClone(hit.value)
    readCache.delete(file)
  }
  return readJsonRaw(file, fallback)
}

function readJsonRaw(file, fallback) {
  for (let attempt = 0; ; attempt++) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
      unreadableFiles.delete(file)
      return data
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        unreadableFiles.delete(file)
        return fallback
      }
      // Kısa süreli kilitler için birkaç kez kısa aralıkla yeniden dene.
      if (attempt < 4) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40)
        continue
      }
      unreadableFiles.add(file)
      console.error(`Dosya okunamadı (üzerine yazılmayacak): ${file} — ${e && e.message}`)
      return fallback
    }
  }
}

export function assertWritable(file) {
  if (unreadableFiles.has(file)) {
    throw new Error(stt('{0} okunamadığı için kaydedilmedi — verin korunuyor. ARGUS\'u yeniden başlatıp tekrar dene.', path.basename(file)))
  }
}

// Önce geçici dosyaya yazıp sonra yerine koyuyoruz: yazma sırasında ARGUS kapanırsa (ör.
// "Şimdi Güncelle" ile yeniden başlarken) asıl dosya yarım kalmasın, eski hali sağlam dursun.
export function writeJson(file, data) {
  assertWritable(file)
  // Arşiv geçmişi: kayıt/şema dosyasıysa eski haliyle karşılaştırıp değişiklikleri kaydeder (bkz. history.js).
  beforeWrite(file, data)
  rawWriteJson(file, data)
}

// Oku-değiştir-yaz tek adımda (arada bekleme yok, Node tek iş parçacıklı olduğu için başka bir istek araya giremez):
// fn dosyanın EN GÜNCEL halini alır, değiştirir; false dönerse yazılmaz. fn'in dönüşü (false değilse) geri verilir.
export function updateJson(file, fallback, fn) {
  const data = readJson(file, fallback)
  const out = fn(data)
  if (out !== false) writeJson(file, data)
  return out
}

// Dosya/iş başına sıra (kilit): bekleme (await) içeren bir oku-değiştir-yaz işi aynı anahtarla ikinci kez
// başlarsa öncekinin bitmesini bekler. Ör. aynı kaydı aynı anda iki kez TMDB'den doldurma (Genel Güncelleme +
// tablodaki Güncelle) birbirinin yarım kopyasını yazmasın.
const locks = new Map()
export async function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve()
  let release
  const mine = new Promise((r) => (release = r))
  const chain = prev.then(() => mine)
  locks.set(key, chain)
  try {
    await prev
    return await fn()
  } finally {
    release()
    if (locks.get(key) === chain) locks.delete(key)
  }
}

export function rawWriteJson(file, data) {
  assertWritable(file)
  readCache.delete(file)
  const text = JSON.stringify(data, null, 2)
  const tmp = `${file}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, text, 'utf-8')
    fs.renameSync(tmp, file)
  } catch {
    // Windows'ta dosya o an başka bir programda açıksa yer değiştirme reddedilebilir — eski yol.
    try {
      fs.unlinkSync(tmp)
    } catch {}
    fs.writeFileSync(file, text, 'utf-8')
  }
}

// Bilgisayarın kendi saatine göre bugünün tarihi ("YYYY-MM-DD"). toISOString dünya saatini (UTC) verir:
// Türkiye'de gece 00:00–03:00 arası bir önceki günü gösteriyordu.
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function makeId() {
  return Math.random().toString(36).slice(2, 10)
}

// Arayüzün sürüm numarası (src/lib/version.ts) — telefon hangi ARGUS'a bağlandığını görsün.
export function readAppVersion() {
  try {
    return /APP_VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'version.ts'), 'utf-8'))?.[1] ?? ''
  } catch {
    return ''
  }
}

export function profileDir(profileId) {
  const dir = path.join(PROFILES_DIR, profileId)
  fs.mkdirSync(path.join(dir, 'rows'), { recursive: true })
  return dir
}

export function profileBoardsFile(profileId) {
  return path.join(profileDir(profileId), 'boards.json')
}
export function profileHomeSettingsFile(profileId) {
  return path.join(profileDir(profileId), 'home-settings.json')
}
export function profileCastFile(profileId) {
  return path.join(profileDir(profileId), 'cast.json')
}
export function profileEpisodesFile(profileId) {
  return path.join(profileDir(profileId), 'episodes.json')
}
export function profileWatchedFile(profileId) {
  return path.join(profileDir(profileId), 'watched.json')
}
export function profileProgressFile(profileId) {
  return path.join(profileDir(profileId), 'progress.json')
}
export function profileSongsFile(profileId) {
  return path.join(profileDir(profileId), 'songs.json')
}
export function profileRowsFile(profileId, boardId) {
  return path.join(profileDir(profileId), 'rows', `${boardId}.json`)
}
export function profileTemplatesFile(profileId) {
  return path.join(profileDir(profileId), 'templates.json')
}
// Kayıt id → { id, mediaType } — kaydın eşleştiği TMDB içeriği (bkz. fillRowFromTmdb).
export function profileTmdbFile(profileId) {
  return path.join(profileDir(profileId), 'tmdb.json')
}
export function profileApiKeyFile(profileId) {
  return path.join(profileDir(profileId), 'api-key.json')
}
export function readProfileApiKey(profileId) {
  const data = readJson(profileApiKeyFile(profileId), null)
  return (data?.tmdbApiKey || '').trim()
}

export function readProfiles() {
  const data = readJson(PROFILE_FILE, [])
  if (Array.isArray(data)) return data
  if (data && data.username) {
    const migrated = [{ id: makeId(), username: data.username, photo: data.photo || '' }]
    writeJson(PROFILE_FILE, migrated)
    return migrated
  }
  return []
}

export function migrateFlatDataToFirstProfile() {
  const profiles = readProfiles()
  if (profiles.length === 0) return
  const firstId = profiles[0].id
  const targetDir = path.join(PROFILES_DIR, firstId)
  if (fs.existsSync(targetDir)) return
  const oldBoardsFile = path.join(DATA_DIR, 'boards.json')
  if (!fs.existsSync(oldBoardsFile)) return
  fs.mkdirSync(targetDir, { recursive: true })
  const moves = [
    [oldBoardsFile, path.join(targetDir, 'boards.json')],
    [path.join(DATA_DIR, 'rows'), path.join(targetDir, 'rows')],
    [path.join(DATA_DIR, 'home-settings.json'), path.join(targetDir, 'home-settings.json')],
    [path.join(DATA_DIR, 'cast.json'), path.join(targetDir, 'cast.json')],
    [path.join(DATA_DIR, 'episodes.json'), path.join(targetDir, 'episodes.json')],
  ]
  for (const [from, to] of moves) {
    if (fs.existsSync(from)) fs.renameSync(from, to)
  }
  console.log(`Eski tek-profilli veriler '${firstId}' profiline taşındı: ${targetDir}`)
}
migrateFlatDataToFirstProfile()

export function localToday() {
  return localDay()
}

export function loadBoardAndRows(profileId, boardId) {
  const board = readJson(profileBoardsFile(profileId), []).find((b) => b.id === boardId)
  if (!board) return null
  return { board, rows: readJson(profileRowsFile(profileId, boardId), []) }
}

export async function mapLimit(items, n, fn) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const it = items[i++]
        try {
          await fn(it)
        } catch (e) {
          console.error('takip hata:', e)
        }
      }
    }),
  )
}
