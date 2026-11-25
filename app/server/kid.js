// Çocuk profili (v1.23.4'te sadece arşiv listesinde uygulanıyordu). v1.26: aynı kural her yerde — arşiv, bölüm/izleme
// listeleri (telefona eşitlenen veri de bunlar), zil bildirimleri, Keşfet ve Evrenler. Kural tek: yaş sınırı 13+ ve
// üstü olan yapım çocuk profilinde görünmez. Arşivde olmayan (TMDB'den gelen) yapımların yaş sınırı TMDB'den
// öğrenilip data/yas-onbellek.json'da saklanıyor — her açılışta yeniden sorulmasın.
import path from 'node:path'
import { resolveRole } from './roles.js'
import { DATA_DIR, mapLimit, profileBoardsFile, profileRowsFile, rawWriteJson, readJson, readJsonShared, readProfiles } from './storage.js'
import { getMovieCertification, getTvCertification } from './tmdb.js'

export const ADULT_AGE = /(^|\D)(1[3-8])\s*\+|\b(R|NC-17|TV-MA|TV-14|PG-13|18|16|13)\b/i

export function isKid(profileId) {
  return Boolean(readProfiles().find((p) => p.id === profileId)?.kid)
}

export const isAdultCert = (cert) => Boolean(cert) && ADULT_AGE.test(String(cert))

// Bir arşivin kayıtlarından çocuk profilinde görünmeyecek olanlar
export function hideForKid(profileId, boardId, rows) {
  if (!isKid(profileId)) return rows
  const board = readJsonShared(profileBoardsFile(profileId), []).find((b) => b.id === boardId)
  const yas = board ? resolveRole(board, 'yas') : null
  if (!yas) return rows
  return rows.filter((r) => !isAdultCert(r.values?.[yas.id]))
}

// Çocuk profilinde gizlenen bütün kayıtların kimlikleri (çocuk profili değilse null). Dosyalar değişmedikçe
// önbellekteki dondurulmuş kopyalardan okunuyor; sonuç da dosya damgalarına göre saklanıyor.
const hiddenCache = new Map()
export function hiddenRowIds(profileId) {
  if (!isKid(profileId)) return null
  const boards = readJsonShared(profileBoardsFile(profileId), [])
  const ids = new Set()
  for (const b of Array.isArray(boards) ? boards : []) {
    const yas = resolveRole(b, 'yas')
    if (!yas) continue
    const rows = readJsonShared(profileRowsFile(profileId, b.id), [])
    const hit = hiddenCache.get(`${profileId}:${b.id}`)
    if (hit && hit.rows === rows && hit.yas === yas.id) {
      for (const id of hit.ids) ids.add(id)
      continue
    }
    const mine = (Array.isArray(rows) ? rows : []).filter((r) => isAdultCert(r.values?.[yas.id])).map((r) => r.id)
    hiddenCache.set(`${profileId}:${b.id}`, { rows, yas: yas.id, ids: mine })
    for (const id of mine) ids.add(id)
  }
  return ids
}

// Kayıt kimliğiyle anahtarlanmış bir haritadan (bölümler, izleme işaretleri, kadro…) gizli kayıtları çıkarır
export function omitHiddenKeys(profileId, map) {
  const hidden = hiddenRowIds(profileId)
  if (!hidden || !hidden.size || !map || typeof map !== 'object' || Array.isArray(map)) return map
  const out = {}
  for (const [k, v] of Object.entries(map)) if (!hidden.has(k)) out[k] = v
  return out
}

// Bildirim üretirken: bu kayıt çocuk profilinde gizli mi
export function isHiddenRow(profileId, rowId) {
  const hidden = hiddenRowIds(profileId)
  return Boolean(hidden && rowId && hidden.has(rowId))
}

// ---- TMDB yaş sınırları (arşivde olmayan yapımlar için) ----
const certFile = () => path.join(DATA_DIR, 'yas-onbellek.json')
const CERT_TTL = 120 * 864e5
let certs = null
let certsDirty = null
function loadCerts() {
  if (!certs) {
    const d = readJson(certFile(), {})
    certs = d && typeof d === 'object' && !Array.isArray(d) ? d : {}
  }
  return certs
}
function saveCertsSoon() {
  if (certsDirty) return
  certsDirty = setTimeout(() => {
    certsDirty = null
    try {
      rawWriteJson(certFile(), certs)
    } catch {
      /* önemsiz — bir dahaki sefere yeniden sorulur */
    }
  }, 1000)
}

// items: [{ mediaType: 'movie'|'tv', id }] → çocuk profilinde gösterilmeyecek "tür:kimlik" anahtarları.
// strict: yaş sınırı bilinmeyenler (TMDB'de yok / "NR") de gizlenir — Keşfet gibi tanımadığın yapımların geldiği yerlerde.
const UNRATED = /^(NR|UR|N\/A|UNRATED|NOT RATED)$/i
export async function adultTmdbKeys(items, apiKey, { strict = false } = {}) {
  const bad = (cert) => isAdultCert(cert) || (strict && (!cert || UNRATED.test(String(cert).trim())))
  const map = loadCerts()
  const out = new Set()
  const todo = []
  for (const it of items) {
    if (!it?.id || (it.mediaType !== 'movie' && it.mediaType !== 'tv')) continue
    const k = `${it.mediaType}:${it.id}`
    const c = map[k]
    if (c && Date.now() - (c.at ?? 0) < CERT_TTL) {
      if (bad(c.cert)) out.add(k)
    } else if (!todo.some((x) => x.k === k)) todo.push({ ...it, k })
  }
  if (todo.length && apiKey) {
    await mapLimit(todo, 6, async (it) => {
      const cert = it.mediaType === 'movie' ? await getMovieCertification(it.id, apiKey) : await getTvCertification(it.id, apiKey)
      map[it.k] = { cert: cert ?? '', at: Date.now() }
      if (bad(cert)) out.add(it.k)
    })
    saveCertsSoon()
  }
  return out
}
