// Arşiv doğrulama (Sağlık Kontrolü).
import { resolveRole } from '../roles.js'
import { stt, tmdbLang } from '../lang.js'
import { loadBoardAndRows, mapLimit, profileTmdbFile, readJson, readProfileApiKey, writeJson } from '../storage.js'
import { app } from '../app.js'
import { isMovieKind, isTvKind, sameName, tmdbGet, tmdbNames } from '../tmdb.js'

// ---- Arşiv doğrulama (Sağlık Kontrolü, v1.24) ---------------------------------------------------------------
// Kullanıcı "arşivdeki içerikleri düzgünce kontrol eden bir şey ekle; Türkçe adı başka orijinali başka olanlar,
// aktarımda yanlış çekilmişler oluyor" dedi. TMDB'ye bağlı her kaydın adları/yılı/türü bağlı olduğu yapımla
// karşılaştırılır. TMDB'deki adlar tmdb.json'da `ad` olarak saklanır ({ tr, orig, en, yil }) — her güncellemede
// yazılır, eskiler için "Kontrol et" bir kez TMDB'ye sorar (verifyJobs). "Doğru" denenler board.verifyIgnore'da.
export const verifyJobs = new Map() // `${profileId}:${boardId}` → { done, total }


export function verifyBoard(profileId, board, rows) {
  const refs = readJson(profileTmdbFile(profileId), {})
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const origProp = resolveRole(board, 'orjinalAdi')
  const vizyonProp = resolveRole(board, 'vizyon')
  const kategoriProp = resolveRole(board, 'kategori')
  const ignored = new Set(board.verifyIgnore ?? [])
  const items = []
  let unlinked = 0
  let missing = 0
  for (const row of rows) {
    const ref = refs[row.id]
    const title = titleProp && typeof row.values[titleProp.id] === 'string' ? row.values[titleProp.id].trim() : ''
    const orig = origProp && typeof row.values[origProp.id] === 'string' ? row.values[origProp.id].trim() : ''
    if (!ref?.id) {
      if (title || orig) unlinked++
      continue
    }
    if (!ref.ad || !ref.ad.alt) {
      missing++
      continue
    }
    if (ignored.has(row.id)) continue
    const ad = ref.ad
    const names = [ad.tr, ad.orig, ad.en, ...(ad.alt ?? [])].filter(Boolean)
    const fits = (s) => names.some((n) => sameName(s, n))
    const issues = []
    const titleOk = !title || fits(title)
    const origOk = !orig || fits(orig)
    // Kullanıcı adı bir kez TMDB'den düzeltildikten sonra kendisi değiştirdiyse (tt farklı) o ad bilerek verilmiş
    const userTitle = typeof ref.tt === 'string' && ref.tt && title && ref.tt !== title
    if (!titleOk && !origOk) issues.push('ad')
    else if (!origOk) issues.push('orj')
    // TMDB'de Türkçe adı yoksa (Türkçe adı orijinaliyle aynı) kullanıcının yazdığı Türkçe ad şüpheli sayılmaz
    else if (!titleOk && !userTitle && ad.tr && !sameName(ad.tr, ad.orig) && !sameName(ad.tr, ad.en)) issues.push('trAd')
    const rowYear = vizyonProp && typeof row.values[vizyonProp.id] === 'string' ? row.values[vizyonProp.id].slice(0, 4) : ''
    if (/^\d{4}$/.test(rowYear) && /^\d{4}$/.test(ad.yil) && Math.abs(Number(rowYear) - Number(ad.yil)) > 1) issues.push('yil')
    const kat = (kategoriProp?.options?.find((o) => o.id === row.values[kategoriProp.id])?.label ?? '').toLocaleLowerCase('tr')
    const want = kat ? (isTvKind(kat) ? 'tv' : isMovieKind(kat) ? 'movie' : null) : null
    if (want && want !== ref.mediaType) issues.push('tur')
    if (issues.length) items.push({ rowId: row.id, issues, tmdb: { tr: ad.tr, orig: ad.orig, en: ad.en, yil: ad.yil, mediaType: ref.mediaType, id: ref.id }, row: { title, orig, year: rowYear } })
  }
  return { items, unlinked, missing }
}

export async function runVerifyJob(profileId, boardId, apiKey, force) {
  const k = `${profileId}:${boardId}`
  if (verifyJobs.has(k)) return
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return
  const refs0 = readJson(profileTmdbFile(profileId), {})
  const todo = loaded.rows.filter((r) => refs0[r.id]?.id && (force || !refs0[r.id].ad || !refs0[r.id].ad.alt)).map((r) => r.id)
  if (!todo.length) return
  const job = { done: 0, total: todo.length }
  verifyJobs.set(k, job)
  try {
    const found = {}
    await mapLimit(todo, 4, async (rowId) => {
      const ref = refs0[rowId]
      const d = await tmdbGet(`/${ref.mediaType}/${ref.id}`, { language: tmdbLang(), append_to_response: 'translations,alternative_titles' }, apiKey)
      if (d) found[rowId] = tmdbNames(d, ref.mediaType)
      job.done++
      // Ara ara yaz: uzun sürerse yarım iş kaybolmasın
      if (job.done % 25 === 0 || job.done === job.total) {
        const fresh = readJson(profileTmdbFile(profileId), {})
        for (const [id, ad] of Object.entries(found)) if (fresh[id]) fresh[id].ad = ad
        writeJson(profileTmdbFile(profileId), fresh)
      }
    })
  } finally {
    verifyJobs.delete(k)
  }
}

app.get('/api/profiles/:profileId/boards/:id/verify', (req, res) => {
  const loaded = loadBoardAndRows(req.params.profileId, req.params.id)
  if (!loaded) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
  const job = verifyJobs.get(`${req.params.profileId}:${req.params.id}`)
  res.json({ ...verifyBoard(req.params.profileId, loaded.board, loaded.rows), pending: job ? { done: job.done, total: job.total } : null })
})

// Eksik `ad` bilgilerini TMDB'den toplar (force: hepsini yeniden). Arka planda çalışır, ilerleme GET'te.
app.post('/api/profiles/:profileId/boards/:id/verify', (req, res) => {
  const apiKey = readProfileApiKey(req.params.profileId)
  if (!apiKey) return res.status(400).json({ error: stt('Önce Ayarlar → Veritabanı → API sekmesinden bir TMDB API anahtarı girmelisin.') })
  runVerifyJob(req.params.profileId, req.params.id, apiKey, Boolean(req.body?.force)).catch((e) => console.error('doğrulama hata:', e))
  res.json({ ok: true })
})
