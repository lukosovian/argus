// TMDB tabanlı uç noktalar: doldurma, seriler, vizyon takvimi, kişi, keşfet, fragman, yeni bölümler…
import fs from 'node:fs'
import path from 'node:path'
import { resolveRole, resolveStatusOption } from '../roles.js'
import { serverLang, serverRegion, stt, tmdbLang } from '../lang.js'
import { MEDYA_DIR, loadBoardAndRows, localDay, profileTmdbFile, profileWatchedFile, readJson, readProfileApiKey, writeJson } from '../storage.js'
import { app } from '../app.js'
import { TMDB_IMG_BASE, archiveLookup, buildArchiveIndex, downloadTmdbImage, ensureTmdbRef, getTrailerUrl, getTvStatus, isYoutubeVideoAvailable, mapProviders, normalizeText, pickLogo, profileDismissedFile, saveShowInfo, tmdbGet, tmdbKey, toCard } from '../tmdb.js'
import { profileWatchTimesFile } from '../watchLogic.js'
import { addRowFromTmdb, fillRowFromTmdb } from '../fill.js'
import { checkFinishedSeries, profileWatchStateFile } from '../jobs/watchlist.js'
import { adultTmdbKeys, isKid, omitHiddenKeys } from '../kid.js'

app.post('/api/profiles/:profileId/fetch-tmdb/:boardId/:rowId', async (req, res) => {
  const { profileId, boardId, rowId } = req.params
  const f = req.body?.forced
  let forced = f && (f.mediaType === 'movie' || f.mediaType === 'tv') && Number.isFinite(Number(f.tmdbId)) ? { tmdbId: Number(f.tmdbId), mediaType: f.mediaType } : null
  // Sağlık Kontrolü › "TMDB'de yeniden bak": sadece daha önce eşleşmiş kayıtlar, aynı yapımla (yeniden aranmaz,
  // yanlış yapıma eşleşme riski olmasın). Hiç eşleşmemiş kayıt atlanır.
  if (!forced && req.body?.recheck) {
    const ref = readJson(profileTmdbFile(profileId), {})[rowId]
    if (!ref?.id || (ref.mediaType !== 'movie' && ref.mediaType !== 'tv')) return res.json({ ok: true, skipped: true, filled: [] })
    forced = { tmdbId: ref.id, mediaType: ref.mediaType }
  }
  const out = await fillRowFromTmdb(profileId, boardId, rowId, { exclude: req.body?.exclude, overwrite: req.body?.overwrite, ask: req.body?.ask === 'always' ? 'always' : Boolean(req.body?.ask), forced })
  res.status(out.status).json(out.data)
})

// Film serileri — kullanıcı "serinin kaçını izledim, sıradaki hangisi" görmek istedi. Filmin TMDB'deki
// serisi (belongs_to_collection) bir kez öğrenilip tmdb.json'a yazılır; serinin filmleri 6 saat önbellekte.
export const collectionCache = new Map()
app.get('/api/profiles/:profileId/collection/:boardId/:rowId', async (req, res) => {
  try {
    const { profileId, boardId, rowId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ collection: null })
    const refsFile = profileTmdbFile(profileId)
    let ref = readJson(refsFile, {})[rowId]
    // Eski (Notion'dan gelen) kayıtların bir kısmında TMDB bağlantısı yok — adıyla bulunup kaydedilir.
    if (!ref) {
      const loaded0 = loadBoardAndRows(profileId, boardId)
      const row0 = loaded0?.rows.find((r) => r.id === rowId)
      if (row0) ref = await ensureTmdbRef(profileId, loaded0.board, row0, apiKey)
    }
    if (!ref || ref.mediaType !== 'movie') return res.json({ collection: null })
    if (ref.collection === undefined) {
      const d = await tmdbGet(`/movie/${ref.id}`, { language: tmdbLang() }, apiKey)
      if (!d) return res.json({ collection: null })
      const c = d.belongs_to_collection
      const fresh = readJson(refsFile, {})
      if (fresh[rowId]) {
        fresh[rowId] = { ...fresh[rowId], collection: c ? { id: c.id, name: c.name } : null }
        writeJson(refsFile, fresh)
      }
      ref.collection = c ? { id: c.id, name: c.name } : null
    }
    if (!ref.collection) return res.json({ collection: null })
    res.json(await collectionParts(profileId, boardId, apiKey, ref.collection.id, ref.id))
  } catch (e) {
    console.error('seri hata:', e)
    res.json({ collection: null })
  }
})

// Arşivde olmayan bir TMDB filminin serisi (Ne İzlesem'in TMDB modunda: "seri bir film gelirse diğer filmleri
// de göstersin, kaçıncı film olduğunu yazsın").
app.get('/api/profiles/:profileId/collection-tmdb/:boardId/:tmdbId', async (req, res) => {
  try {
    const { profileId, boardId } = req.params
    const tmdbId = Number(req.params.tmdbId)
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey || !Number.isInteger(tmdbId)) return res.json({ collection: null })
    const d = await tmdbGet(`/movie/${tmdbId}`, { language: tmdbLang() }, apiKey)
    const c = d?.belongs_to_collection
    if (!c) return res.json({ collection: null })
    res.json(await collectionParts(profileId, boardId, apiKey, c.id, tmdbId))
  } catch (e) {
    console.error('seri hata:', e)
    res.json({ collection: null })
  }
})

export async function collectionParts(profileId, boardId, apiKey, collectionId, movieId) {
    let col = collectionCache.get(collectionId)
    if (!col || Date.now() - col.at > 6 * 3600e3) {
      const d = await tmdbGet(`/collection/${collectionId}`, { language: tmdbLang() }, apiKey)
      if (!d) return { collection: null }
      col = { at: Date.now(), data: d }
      collectionCache.set(collectionId, col)
    }
    const loaded = loadBoardAndRows(profileId, boardId)
    if (!loaded) return { collection: null }
    const look = archiveLookup(profileId, loaded.board, loaded.rows)
    const today = localDay()
    const parts = (col.data.parts ?? [])
      .filter((p) => p.release_date || p.id === movieId)
      .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'))
      .map((p) => ({ ...look(toCard(p, 'movie')), released: Boolean(p.release_date && p.release_date <= today), releaseDate: p.release_date || '' }))
    if (parts.length < 2) return { collection: null }
    return {
      collection: { id: col.data.id, name: col.data.name, backdrop: col.data.backdrop_path ? `${TMDB_IMG_BASE}/w780${col.data.backdrop_path}` : null },
      parts,
    }
}

// Takvimde vizyona girecek filmler — kullanıcı "vizyona girecek filmleri gösterebileceği bir yer ekleyebiliriz
// takvime" dedi. İstenen tarih aralığında (bir ay) ilk kez gösterime girecek en popüler 20 film (takvim kalabalıklaşmasın); 6 saat önbellekte.
export const releasesCache = new Map()
app.get('/api/profiles/:profileId/tmdb-releases/:boardId', async (req, res) => {
  try {
    const { profileId, boardId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ needsApiKey: true, items: [] })
    const from = String(req.query.from ?? '')
    const to = String(req.query.to ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return res.status(400).json({ error: stt('Geçersiz tarih') })
    const cacheKey = `${tmdbLang()}|${from}|${to}`
    let cached = releasesCache.get(cacheKey)
    if (!cached || Date.now() - cached.at > 6 * 3600e3) {
      const params = {
        language: tmdbLang(),
        include_adult: 'false',
        'primary_release_date.gte': from,
        'primary_release_date.lte': to,
        with_release_type: '2|3',
        sort_by: 'popularity.desc',
      }
      const first = await tmdbGet('/discover/movie', { ...params, page: 1 }, apiKey)
      const items = (first?.results ?? [])
        .filter((r) => r.release_date && r.poster_path)
        .map((r) => ({ ...toCard(r, 'movie'), releaseDate: r.release_date }))
      cached = { at: Date.now(), items }
      releasesCache.set(cacheKey, cached)
    }
    const loaded = loadBoardAndRows(profileId, boardId)
    const look = loaded ? archiveLookup(profileId, loaded.board, loaded.rows) : (c) => c
    let items = cached.items
    if (isKid(profileId)) {
      const adult = await adultTmdbKeys(items.map((c) => ({ mediaType: 'movie', id: c.tmdbId })), apiKey, { strict: true })
      items = items.filter((c) => !adult.has(`movie:${c.tmdbId}`))
    }
    res.json({ items: items.map((c) => ({ ...look(c), releaseDate: c.releaseDate })) })
  } catch (e) {
    console.error('vizyon hata:', e)
    res.json({ items: [] })
  }
})

// Dizilerin ortalama bölüm süresi (toplam ekran süresi için): TMDB'den bir kez öğrenilip tmdb.json'daki
// kayda epRuntime olarak yazılır (0 = TMDB'de yok). Sadece o yıl bölümü işaretlenmiş diziler için.
export const flashbackJobs = new Map() // profileId → { running, done, total }
export const flashbackNoMatch = new Set()
export async function fillEpisodeRuntimes(profileId, boardId, rowIds, apiKey) {
  if (flashbackJobs.get(profileId)?.running) return
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return
  const refsFile = profileTmdbFile(profileId)
  const refs0 = readJson(refsFile, {})
  const rowById = new Map(loaded.rows.map((r) => [r.id, r]))
  const todo = rowIds.filter((id) => rowById.has(id) && (refs0[id] ? refs0[id].mediaType === 'tv' && refs0[id].epRuntime === undefined : !flashbackNoMatch.has(`${profileId}:${id}`)))
  if (!todo.length) return
  const job = { running: true, done: 0, total: todo.length }
  flashbackJobs.set(profileId, job)
  try {
    for (const id of todo) {
      try {
        let ref = readJson(refsFile, {})[id]
        if (!ref) {
          ref = await ensureTmdbRef(profileId, loaded.board, rowById.get(id), apiKey)
          if (!ref) flashbackNoMatch.add(`${profileId}:${id}`)
        }
        if (ref && ref.mediaType === 'tv' && ref.epRuntime === undefined) {
          const d = await tmdbGet(`/tv/${ref.id}`, { language: 'en-US' }, apiKey)
          if (d) {
            const list = (d.episode_run_time ?? []).filter((m) => m > 0)
            const rt = list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : d.last_episode_to_air?.runtime || d.next_episode_to_air?.runtime || 0
            const fresh = readJson(refsFile, {})
            if (fresh[id]) {
              fresh[id] = { ...fresh[id], epRuntime: rt }
              writeJson(refsFile, fresh)
            }
          }
        }
      } catch {
        /* tek kayıt yüzünden iş durmasın */
      }
      job.done++
    }
  } finally {
    job.running = false
  }
}

app.get('/api/profiles/:profileId/flashback/:boardId', (req, res) => {
  const { profileId, boardId } = req.params
  const year = String(req.query.year ?? '')
  if (!/^\d{4}$/.test(year)) return res.status(400).json({ error: stt('Yıl eksik') })
  const watched = readJson(profileWatchedFile(profileId), {})
  const seriesIds = Object.entries(watched)
    .filter(([, eps]) => Object.values(eps ?? {}).some((ds) => (ds ?? []).some((d) => String(d).startsWith(year))))
    .map(([id]) => id)
  const refs = readJson(profileTmdbFile(profileId), {})
  const runtimes = {}
  for (const id of seriesIds) if (refs[id]?.epRuntime) runtimes[id] = refs[id].epRuntime
  const apiKey = readProfileApiKey(profileId)
  if (apiKey) fillEpisodeRuntimes(profileId, boardId, seriesIds, apiKey).catch(() => {})
  // Saat dağılımı (0-23) ve haftanın günü — sadece kaydedilmiş işaretlemelerden
  const hours = Array(24).fill(0)
  let timed = 0
  try {
    for (const line of fs.readFileSync(profileWatchTimesFile(profileId), 'utf-8').split('\n')) {
      if (!line.trim()) continue
      const e = JSON.parse(line)
      const d = new Date(e.t)
      if (String(d.getFullYear()) !== year) continue
      hours[d.getHours()]++
      timed++
    }
  } catch {
    /* dosya yoksa saat bilgisi yok */
  }
  const job = flashbackJobs.get(profileId)
  res.json({ runtimes, hours, timed, pending: job?.running ? { done: job.done, total: job.total } : null })
})

// Kayıt → TMDB'de film mi dizi mi (eşleşmesi olanlar). Arşivdeki "Sadece bölümleri yenile" sadece dizilere gitsin diye.
app.get('/api/profiles/:profileId/tmdb-media', (req, res) => {
  const refs = readJson(profileTmdbFile(req.params.profileId), {})
  const out = {}
  for (const [rowId, ref] of Object.entries(refs)) if (ref?.mediaType) out[rowId] = ref.mediaType
  res.json(out)
})

// Bilet görseli (v1.23.12): kullanıcı "karakterin kafası kesik, TMDB'deki görsellerden ben seçeyim, konumlandırayım"
// dedi. Yapımın TMDB sahneleri ve afişleri listelenir; seçilen görsel medya klasörüne indirilir (çevrimdışı da görünsün).
export const biletImgCache = new Map()
app.get('/api/profiles/:profileId/bilet-gorselleri', async (req, res) => {
  try {
    const { profileId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ needsApiKey: true, items: [] })
    let ref = typeof req.query.rowId === 'string' && req.query.rowId ? readJson(profileTmdbFile(profileId), {})[req.query.rowId] : null
    if (!ref?.id && typeof req.query.title === 'string' && req.query.title.trim()) {
      const year = String(req.query.year ?? '').slice(0, 4)
      const r = await tmdbGet('/search/movie', { query: req.query.title.trim(), language: tmdbLang(), ...(year ? { year } : {}) }, apiKey)
      const hit = r?.results?.[0]
      if (hit) ref = { id: hit.id, mediaType: 'movie' }
    }
    if (!ref?.id || (ref.mediaType !== 'movie' && ref.mediaType !== 'tv')) return res.json({ items: [] })
    const key = `${ref.mediaType}:${ref.id}`
    let items = biletImgCache.get(key)
    if (!items) {
      const d = await tmdbGet(`/${ref.mediaType}/${ref.id}/images`, { include_image_language: `${serverLang()},en,null` }, apiKey)
      const byVotes = (a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0) || (b.vote_average ?? 0) - (a.vote_average ?? 0)
      const clean = (l) => !l.iso_639_1 || l.iso_639_1 === 'xx'
      const bs = (d?.backdrops ?? []).filter((b) => (b.width ?? 0) >= 1000)
      const ps = d?.posters ?? []
      const map = (kind) => (b) => ({ path: b.file_path, kind, w: b.width, h: b.height, text: !clean(b) })
      items = [
        ...bs.filter(clean).sort(byVotes).slice(0, 40).map(map('sahne')),
        ...bs.filter((b) => !clean(b)).sort(byVotes).slice(0, 12).map(map('sahne')),
        ...ps.sort(byVotes).slice(0, 24).map(map('afis')),
      ]
      biletImgCache.set(key, items)
    }
    res.json({ items })
  } catch (e) {
    console.error('bilet-gorselleri hata:', e)
    res.json({ items: [] })
  }
})
app.post('/api/profiles/:profileId/bilet-gorsel', async (req, res) => {
  const p = String(req.body?.path ?? '')
  if (!/^\/[A-Za-z0-9_-]{6,80}\.(jpg|jpeg|png|webp)$/i.test(p)) return res.status(400).json({ error: 'path' })
  const size = req.body?.kind === 'afis' ? 'w780' : 'w1280'
  const filename = `tmdb_bilet_${size}_${p.slice(1)}`
  try {
    if (!(await downloadTmdbImage(`${TMDB_IMG_BASE}/${size}${p}`, path.join(MEDYA_DIR, filename)))) return res.status(502).json({ error: 'indirilemedi' })
    res.json({ url: `/medya/${filename}` })
  } catch (e) {
    console.error('bilet-gorsel hata:', e)
    res.status(502).json({ error: 'indirilemedi' })
  }
})

// Oyuncu / yönetmen sayfası — kullanıcı "oyuncuya tıklayınca arşivimde olmayan filmlerini de göreyim,
// tek tıkla ekleyeyim" dedi. Kişi TMDB'de adıyla aranır (arşivde kişi kimliği tutulmuyor), filmografisi
// arşivde olanlar / olmayanlar diye ayrılır.
export const personCache = new Map()
app.get('/api/profiles/:profileId/person/:boardId', async (req, res) => {
  try {
    const { profileId, boardId } = req.params
    const name = String(req.query.name ?? '').trim()
    const role = req.query.role === 'directing' ? 'directing' : 'acting'
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ needsApiKey: true })
    if (!name) return res.json({ person: null })
    const ck = `${role}:${normalizeText(name)}`
    let hit = personCache.get(ck)
    if (!hit || Date.now() - hit.at > 6 * 3600e3) {
      const sr = await tmdbGet('/search/person', { query: name, language: tmdbLang() }, apiKey)
      const want = role === 'directing' ? 'Directing' : 'Acting'
      const results = sr?.results ?? []
      const pick =
        results.find((p) => normalizeText(p.name) === normalizeText(name) && p.known_for_department === want) ??
        results.find((p) => normalizeText(p.name) === normalizeText(name)) ??
        results[0]
      if (!pick) return res.json({ person: null })
      const d = await tmdbGet(`/person/${pick.id}`, { language: tmdbLang(), append_to_response: 'combined_credits' }, apiKey)
      let bio = d?.biography ?? ''
      if (!bio) bio = (await tmdbGet(`/person/${pick.id}`, { language: 'en-US' }, apiKey))?.biography ?? ''
      hit = { at: Date.now(), data: { d, bio } }
      personCache.set(ck, hit)
    }
    const { d, bio } = hit.data
    const loaded = loadBoardAndRows(profileId, boardId)
    if (!loaded) return res.json({ person: null })
    const look = archiveLookup(profileId, loaded.board, loaded.rows)
    const credits = role === 'directing' ? (d.combined_credits?.crew ?? []).filter((c) => c.job === 'Director') : d.combined_credits?.cast ?? []
    const seen = new Set()
    const items = []
    for (const c of credits) {
      const type = c.media_type
      if (type !== 'movie' && type !== 'tv') continue
      // talk show / haber / "kendisi" rolleri filmografiyi kalabalıklaştırmasın
      if ((c.genre_ids ?? []).some((g) => g === 10767 || g === 10763 || g === 99)) continue
      if (/^(self|himself|herself|kendisi)\b/i.test(c.character ?? '')) continue
      // dizilerde bir iki bölümlük konuk oyunculuklar filmografiyi kalabalıklaştırmasın
      if (role === 'acting' && type === 'tv' && (c.episode_count ?? 0) < 3) continue
      const k = tmdbKey(type, c.id)
      if (seen.has(k)) continue
      seen.add(k)
      items.push({ ...look(toCard(c, type)), character: c.character ?? '', popularity: c.popularity ?? 0, votes: c.vote_count ?? 0 })
    }
    const inArchive = items.filter((i) => i.inArchive).sort((a, b) => (b.year || '').localeCompare(a.year || ''))
    const notInArchive = items
      .filter((i) => !i.inArchive && i.votes >= 20)
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 40)
    const place = d.place_of_birth ?? ''
    res.json({
      person: {
        id: d.id,
        name: d.name,
        bio,
        birthday: d.birthday ?? '',
        deathday: d.deathday ?? '',
        place,
        image: d.profile_path ? `${TMDB_IMG_BASE}/w342${d.profile_path}` : null,
        department: d.known_for_department ?? '',
      },
      inArchive,
      notInArchive,
    })
  } catch (e) {
    console.error('kişi hata:', e)
    res.json({ person: null })
  }
})

// Detay penceresi için: Türkiye'de nerede izlenebildiği + benzer içerikler.
app.get('/api/profiles/:profileId/tmdb-extras/:boardId/:rowId', async (req, res) => {
  try {
    const { profileId, boardId, rowId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ needsApiKey: true })
    const loaded = loadBoardAndRows(profileId, boardId)
    const row = loaded?.rows.find((r) => r.id === rowId)
    if (!row) return res.status(404).json({ error: stt('Kayıt bulunamadı') })
    const ref = await ensureTmdbRef(profileId, loaded.board, row, apiKey)
    if (!ref) return res.json({ notFound: true })

    const [prov, recs] = await Promise.all([
      tmdbGet(`/${ref.mediaType}/${ref.id}/watch/providers`, {}, apiKey),
      tmdbGet(`/${ref.mediaType}/${ref.id}/recommendations`, { language: tmdbLang() }, apiKey),
    ])
    let similarRaw = recs?.results ?? []
    if (similarRaw.length === 0) {
      const sim = await tmdbGet(`/${ref.mediaType}/${ref.id}/similar`, { language: tmdbLang() }, apiKey)
      similarRaw = sim?.results ?? []
    }
    // rowId: arşivindeki yapıma tıklayınca önizleme yerine kendi kaydının detayı açılsın diye (v1.27)
    const look = archiveLookup(profileId, loaded.board, loaded.rows)
    const similar = similarRaw
      .slice(0, 16)
      .map((r) => toCard(r, ref.mediaType))
      .map((c) => {
        const a = look(c)
        return { ...c, inArchive: a.inArchive, rowId: a.rowId }
      })

    const tr = prov?.results?.[serverRegion()]
    res.json({
      providers: tr
        ? {
            link: tr.link ?? null,
            flatrate: mapProviders(tr.flatrate),
            free: mapProviders([...(tr.free ?? []), ...(tr.ads ?? [])]),
            rent: mapProviders(tr.rent),
            buy: mapProviders(tr.buy),
          }
        : null,
      similar,
    })
  } catch (e) {
    console.error('tmdb-extras hata:', e)
    res.status(500).json({ error: stt('TMDB bilgileri alınamadı') })
  }
})

// TMDB'deki bir içeriği arşive yeni kayıt olarak ekler (Benzerler / Keşfet'ten). Önce başlık +
// durum (+ izlendiyse tarih/puan) ile kayıt oluşturulur, sonra normal TMDB doldurma çalışır.
app.post('/api/profiles/:profileId/tmdb-add/:boardId', async (req, res) => {
  try {
    const out = await addRowFromTmdb(req.params.profileId, req.params.boardId, req.body ?? {})
    res.status(out.status).json(out.json)
  } catch (e) {
    console.error('tmdb-add hata:', e)
    res.status(500).json({ error: stt('İçerik eklenemedi') })
  }
})

app.get('/api/profiles/:profileId/tmdb-genres', async (req, res) => {
  const apiKey = readProfileApiKey(req.params.profileId)
  if (!apiKey) return res.json({ needsApiKey: true, genres: [] })
  const type = req.query.type === 'tv' ? 'tv' : 'movie'
  const data = await tmdbGet(`/genre/${type}/list`, { language: tmdbLang() }, apiKey)
  res.json({ genres: (data?.genres ?? []).map((g) => ({ id: g.id, name: g.name })) })
})

// Keşfet: seçilen tür(ler)de, arşivde OLMAYAN ve daha önce "istemiyorum" denmemiş içerikler.
app.post('/api/profiles/:profileId/tmdb-discover/:boardId', async (req, res) => {
  try {
    const { profileId, boardId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.status(400).json({ error: stt('Önce Ayarlar → Veritabanı → API sekmesinden bir TMDB API anahtarı girmelisin.') })
    const loaded = loadBoardAndRows(profileId, boardId)
    if (!loaded) return res.status(404).json({ error: stt('Arşiv bulunamadı') })

    const type = req.body?.type === 'tv' ? 'tv' : 'movie'
    const genreIds = Array.isArray(req.body?.genreIds) ? req.body.genreIds.filter((n) => Number.isInteger(n)) : []
    // "Gelmesin" dediği türler (ters filtre).
    const excludeGenreIds = Array.isArray(req.body?.excludeGenreIds) ? req.body.excludeGenreIds.filter((n) => Number.isInteger(n)) : []
    const count = Math.max(1, Math.min(40, Number(req.body?.count) || 10))
    // Kullanıcı "sadece popüler ve en yüksek puanlılar var, hep aynı şeyler geliyor" dedi: 'gem' (az bilinen ama
    // beğenilenler) ve 'any' (her şeyden — popülerlik sırasının çok daha derinlerinden) eklendi.
    const sort = ['popular', 'top', 'new', 'gem', 'any'].includes(req.body?.sort) ? req.body.sort : 'popular'
    const yearFrom = Number.isInteger(req.body?.yearFrom) ? req.body.yearFrom : null
    const yearTo = Number.isInteger(req.body?.yearTo) ? req.body.yearTo : null
    // Ne İzlesem'in son gösterdikleri — bir sonraki tıklamada yine gelmesinler
    const skip = new Set(Array.isArray(req.body?.skip) ? req.body.skip.filter((k) => typeof k === 'string') : [])
    // Ne İzlesem: "bu akşam 2 saatim var" (dakika) ve "sadece platformlarımda olanlar" (TMDB platform id'leri)
    const maxMinutes = Number.isInteger(req.body?.maxMinutes) && req.body.maxMinutes > 0 ? req.body.maxMinutes : null
    const platformIds = Array.isArray(req.body?.platforms) ? req.body.platforms.filter((n) => Number.isInteger(n)) : []

    // "En yüksek puanlı": az oylu yeni yapımlar (ör. 400 oyla 9.2) klasiklerin önüne geçmesin — yeni kullanıcı
    // denemesinde Baba 7. sıradaydı. Daha yüksek oy sınırı + henüz çıkmamışlar hariç.
    const minVotes = sort === 'top' ? (type === 'tv' ? 500 : 2000) : sort === 'gem' ? (type === 'tv' ? 80 : 150) : sort === 'any' ? 40 : 50
    const params = { language: tmdbLang(), include_adult: 'false', 'vote_count.gte': minVotes }
    // 'any': derinlerden ama yine de beğenilmiş olanlar (6+), yoksa çok sayıda bilinmeyen/düşük puanlı yapım geliyordu
    if (sort === 'any') params['vote_average.gte'] = 6
    if (sort === 'gem') {
      params['vote_count.lte'] = type === 'tv' ? 800 : 1500
      params['vote_average.gte'] = 7
      params[type === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte'] = localDay()
    }
    if (sort === 'top') {
      const today = localDay()
      params[type === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte'] = today
    }
    if (genreIds.length) params.with_genres = genreIds.join(',')
    if (excludeGenreIds.length) params.without_genres = excludeGenreIds.join(',')
    params.sort_by = sort === 'top' || sort === 'gem' ? 'vote_average.desc' : sort === 'new' ? (type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc') : 'popularity.desc'
    if (sort === 'new') {
      // "Yeni" = son iki yılda çıkmış ve bugüne kadar yayınlanmış (henüz çıkmamışlar değil).
      const today = localDay()
      const twoYearsAgo = localDay(new Date(Date.now() - 2 * 365 * 864e5))
      if (type === 'tv') {
        params['first_air_date.gte'] = twoYearsAgo
        params['first_air_date.lte'] = today
      } else {
        params['primary_release_date.gte'] = twoYearsAgo
        params['primary_release_date.lte'] = today
      }
    }
    if (maxMinutes) params['with_runtime.lte'] = maxMinutes
    if (platformIds.length) {
      params.with_watch_providers = platformIds.join('|')
      params.watch_region = serverRegion()
      params.with_watch_monetization_types = 'flatrate'
    }
    // Yıl aralığı (Ne İzlesem filtresi): sıralamanın kendi tarih sınırıyla kesişir
    const dateKey = type === 'tv' ? 'first_air_date' : 'primary_release_date'
    if (yearFrom) {
      const g = `${yearFrom}-01-01`
      if (!params[`${dateKey}.gte`] || params[`${dateKey}.gte`] < g) params[`${dateKey}.gte`] = g
    }
    if (yearTo) {
      const l = `${yearTo}-12-31`
      if (!params[`${dateKey}.lte`] || params[`${dateKey}.lte`] > l) params[`${dateKey}.lte`] = l
    }

    const index = buildArchiveIndex(profileId, loaded.board, loaded.rows)
    const dismissed = new Set(readJson(profileDismissedFile(profileId), []))
    const out = []
    const seen = new Set()
    // random: Ne İzlesem her tıklamada hep aynı en popüler içerikleri göstermesin diye sonuçlar
    // ilk 25 sayfa içinden rastgele sırayla seçilen sayfalardan toplanıyor.
    let pages = Array.from({ length: 15 }, (_, i) => i + 1)
    if (req.body?.random) {
      const first = await tmdbGet(`/discover/${type}`, { ...params, page: 1 }, apiKey)
      const total = Math.max(1, Math.min(sort === 'any' ? 150 : sort === 'popular' ? 50 : 40, first?.total_pages ?? 1))
      pages = Array.from({ length: total }, (_, i) => i + 1).sort(() => Math.random() - 0.5)
    }
    // Çocuk profili: yaş sınırı 13+ olanlar (ve yaş sınırı bilinmeyenler) Keşfet'te / Ne İzlesem'de de gelmez (bkz. kid.js);
    // filmlerde TMDB'ye de baştan "en çok PG" denir ki sayfalar boşa gitmesin
    const kid = isKid(profileId)
    if (kid && type === 'movie') {
      params.certification_country = 'US'
      params['certification.lte'] = 'PG'
    }
    for (const page of pages) {
      if (out.length >= count) break
      const data = await tmdbGet(`/discover/${type}`, { ...params, page }, apiKey)
      const results = data?.results ?? []
      const adult = kid ? await adultTmdbKeys(results.map((r) => ({ mediaType: type, id: r.id })), apiKey, { strict: true }) : null
      for (const r of results) {
        const card = toCard(r, type)
        const key = tmdbKey(card.mediaType, card.tmdbId)
        if (adult?.has(`${type}:${r.id}`)) continue
        if (seen.has(key) || dismissed.has(key) || skip.has(key) || index.has(card)) continue
        seen.add(key)
        out.push(card)
        if (out.length >= count) break
      }
      if (!req.body?.random && page >= (data?.total_pages ?? 0)) break
    }
    res.json({ items: out })
  } catch (e) {
    console.error('tmdb-discover hata:', e)
    res.status(500).json({ error: stt('Keşfet sonuçları alınamadı') })
  }
})

// Arşivde OLMAYAN tek bir TMDB içeriğinin önizlemesi (Ne İzlesem'in TMDB modunda kazanan için):
// türler, süre/sezon, Türkiye'deki platformlar ve arşivde olup olmadığı.
app.get('/api/profiles/:profileId/tmdb-item/:boardId/:mediaType/:tmdbId', async (req, res) => {
  try {
    const { profileId, boardId, mediaType, tmdbId } = req.params
    if (mediaType !== 'movie' && mediaType !== 'tv') return res.status(400).json({ error: stt('Geçersiz içerik') })
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.status(400).json({ error: stt('TMDB API anahtarı gerekli') })
    const [d, prov, trailer] = await Promise.all([
      tmdbGet(`/${mediaType}/${tmdbId}`, { language: tmdbLang(), append_to_response: 'images', include_image_language: `${serverLang()},en,null` }, apiKey),
      tmdbGet(`/${mediaType}/${tmdbId}/watch/providers`, {}, apiKey),
      getTrailerUrl(mediaType, tmdbId, apiKey).catch(() => null),
    ])
    if (!d) return res.status(404).json({ error: stt('İçerik bulunamadı') })
    const card = toCard(d, mediaType)
    // Arşivdeki detay penceresiyle aynı görünüm için: büyük yatay görsel, başlık logosu (Kapak
    // Adı) ve fragman.
    const logo = pickLogo(d.images)
    const loaded = loadBoardAndRows(profileId, boardId)
    const tr = prov?.results?.[serverRegion()]
    res.json({
      ...card,
      backdrop: d.backdrop_path ? `${TMDB_IMG_BASE}/w1280${d.backdrop_path}` : card.backdrop,
      logo: logo ? `${TMDB_IMG_BASE}/w500${logo.file_path}` : null,
      trailer: trailer ?? null,
      inArchive: loaded ? buildArchiveIndex(profileId, loaded.board, loaded.rows).has(card) : false,
      genres: (d.genres ?? []).map((g) => g.name),
      runtime: mediaType === 'movie' ? d.runtime ?? null : null,
      seasons: mediaType === 'tv' ? d.number_of_seasons ?? null : null,
      providers: tr
        ? {
            link: tr.link ?? null,
            flatrate: mapProviders(tr.flatrate),
            free: mapProviders([...(tr.free ?? []), ...(tr.ads ?? [])]),
            rent: mapProviders(tr.rent),
            buy: mapProviders(tr.buy),
          }
        : null,
    })
  } catch (e) {
    console.error('tmdb-item hata:', e)
    res.status(500).json({ error: stt('İçerik bilgisi alınamadı') })
  }
})

// Fragman oynatılamayınca (YouTube "Video kullanılamıyor": gömme kapalı, bölge/yaş kısıtı, silinmiş)
// tarayıcı bunu sorup sıradaki fragmanı dener — kullanıcı "video kullanılamıyor yazıyor, güzel durmuyor;
// ikinci bir video varsa onu göstersin ya da hiç göstermesin" dedi. oEmbed kontrolü gömme kapalı olanları
// ayıklıyor ama bölge/yaş kısıtını yakalayamıyor; o yüzden tek bir adres yerine sıralı bir aday listesi.
export const trailerCandidateCache = new Map()
app.get('/api/profiles/:profileId/fragman-adaylari', async (req, res) => {
  try {
    const { profileId } = req.params
    let mediaType = req.query.mediaType
    let tmdbId = Number(req.query.tmdbId)
    if (typeof req.query.rowId === 'string' && req.query.rowId) {
      const ref = readJson(profileTmdbFile(profileId), {})[req.query.rowId]
      if (ref?.id) {
        mediaType = ref.mediaType
        tmdbId = Number(ref.id)
      }
    }
    if ((mediaType !== 'movie' && mediaType !== 'tv') || !Number.isInteger(tmdbId)) return res.json({ keys: [] })
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ keys: [] })
    const cacheKey = `${mediaType}:${tmdbId}`
    const hit = trailerCandidateCache.get(cacheKey)
    if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) return res.json({ keys: hit.keys })
    const [local, all] = await Promise.all([
      tmdbGet(`/${mediaType}/${tmdbId}/videos`, { language: tmdbLang() }, apiKey).catch(() => null),
      tmdbGet(`/${mediaType}/${tmdbId}/videos`, { include_video_language: `${serverLang()},en,null` }, apiKey).catch(() => null),
    ])
    // Sıra: bu dildeki fragmanlar, sonra diğer fragmanlar, en son tanıtımlar (Teaser).
    const rank = (results, type) => {
      const vids = (results ?? []).filter((v) => v.site === 'YouTube' && v.type === type)
      return [...vids.filter((v) => v.official), ...vids.filter((v) => !v.official)]
    }
    const ordered = [
      ...rank(local?.results, 'Trailer'),
      ...rank(all?.results, 'Trailer'),
      ...rank(local?.results, 'Teaser'),
      ...rank(all?.results, 'Teaser'),
    ]
    const seen = new Set()
    const unique = ordered.filter((v) => v.key && !seen.has(v.key) && seen.add(v.key)).slice(0, 8)
    const ok = await Promise.all(unique.map((v) => isYoutubeVideoAvailable(v.key)))
    const keys = unique.filter((_, i) => ok[i]).map((v) => v.key)
    trailerCandidateCache.set(cacheKey, { at: Date.now(), keys })
    res.json({ keys })
  } catch (e) {
    console.error('fragman-adaylari hata:', e)
    res.json({ keys: [] })
  }
})

app.post('/api/profiles/:profileId/tmdb-dismiss', (req, res) => {
  const { tmdbId, mediaType } = req.body ?? {}
  if (!tmdbId || !mediaType) return res.status(400).json({ error: stt('Geçersiz içerik') })
  const file = profileDismissedFile(req.params.profileId)
  const list = readJson(file, [])
  const key = tmdbKey(mediaType, tmdbId)
  if (!list.includes(key)) list.push(key)
  writeJson(file, list)
  res.json({ ok: true, count: list.length })
})

app.get('/api/profiles/:profileId/tmdb-dismiss', (req, res) => {
  res.json({ count: readJson(profileDismissedFile(req.params.profileId), []).length })
})

app.delete('/api/profiles/:profileId/tmdb-dismiss', (req, res) => {
  writeJson(profileDismissedFile(req.params.profileId), [])
  res.json({ ok: true })
})

// Sahneden bil (v1.23.5): kullanıcı "adı sahneden bil olacaksa gerçekten sahne göstereceksin" dedi. Arşivdeki
// yapımların TMDB'deki YAZISIZ sahne görselleri (backdrop) — en çok oy alan genelde resmi afiş/banner olduğu için o
// atlanır. İstemci aday kayıt kimliklerini yollar; TMDB kimliği bilinen (tmdb.json) kayıtlardan rastgele n tanesi için
// 3'er sahne döner. Görsel listesi yapım başına bellekte tutulur.
export const scenesCache = new Map()
app.post('/api/profiles/:profileId/sahneler', async (req, res) => {
  try {
    const { profileId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ needsApiKey: true, items: [] })
    // v1.24: sonsuz modda (3 can) daha çok soru istenebiliyor
    const want = Math.min(40, Math.max(1, Number(req.body?.n) || 12))
    const ids = Array.isArray(req.body?.rowIds) ? req.body.rowIds.filter((x) => typeof x === 'string') : []
    const refs = readJson(profileTmdbFile(profileId), {})
    const cand = ids.filter((id) => refs[id]?.id && (refs[id].mediaType === 'movie' || refs[id].mediaType === 'tv'))
    for (let i = cand.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[cand[i], cand[j]] = [cand[j], cand[i]]
    }
    const pick = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n)
    const items = []
    for (let i = 0; i < cand.length && items.length < want && i < 160; i += 6) {
      const got = await Promise.all(
        cand.slice(i, i + 6).map(async (rowId) => {
          const ref = refs[rowId]
          const key = `${ref.mediaType}:${ref.id}`
          let list = scenesCache.get(key)
          if (!list) {
            const d = await tmdbGet(`/${ref.mediaType}/${ref.id}/images`, { include_image_language: 'null' }, apiKey)
            const bs = (d?.backdrops ?? []).filter((b) => (!b.iso_639_1 || b.iso_639_1 === 'xx') && (b.width ?? 0) >= 1000)
            bs.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
            list = (bs.length > 2 ? bs.slice(1) : bs).map((b) => `${TMDB_IMG_BASE}/w1280${b.file_path}`)
            scenesCache.set(key, list)
          }
          // tek görseli olan yapımın o görseli büyük ihtimalle resmi banner — sahne sayılmaz
          return list.length >= 2 ? { rowId, scenes: pick(list, 3) } : null
        }),
      )
      for (const g of got) if (g && items.length < want) items.push(g)
    }
    res.json({ items })
  } catch (e) {
    console.error('sahneler hata:', e)
    res.json({ items: [] })
  }
})

// Ne İzlesem'in "sadece platformlarımda" filtresi için: izlenmemiş kayıtların bilinen platformları
app.get('/api/profiles/:profileId/row-platforms/:boardId', (req, res) => {
  const bs = readJson(profileWatchStateFile(req.params.profileId), {})[req.params.boardId]
  const out = {}
  for (const [rowId, v] of Object.entries(bs?.providers ?? {})) out[rowId] = v.ids
  res.json({ ready: Boolean(bs?.at), platforms: out })
})

// Platform listesi (Platformlarım seçimi): bölgedeki abonelik platformları, en yaygından başlayarak
export let platformsCache = null
// Bölgedeki abonelik platformları (ad, logo), en yaygından başlayarak — Abonelik önerisi de kullanıyor
export async function platformList(apiKey) {
    const region = serverRegion()
    if (!platformsCache || platformsCache.region !== region || Date.now() - platformsCache.at > 24 * 3600e3) {
      const lists = await Promise.all(['movie', 'tv'].map((t) => tmdbGet(`/watch/providers/${t}`, { watch_region: region, language: tmdbLang() }, apiKey)))
      const byId = new Map()
      for (const p of lists.flatMap((l) => l?.results ?? [])) {
        const prio = p.display_priorities?.[region] ?? p.display_priority ?? 999
        const cur = byId.get(p.provider_id)
        if (!cur || prio < cur.prio) byId.set(p.provider_id, { id: p.provider_id, name: p.provider_name, logo: p.logo_path ? `${TMDB_IMG_BASE}/w92${p.logo_path}` : null, prio })
      }
      platformsCache = { at: Date.now(), region, all: [...byId.values()].sort((a, b) => a.prio - b.prio), items: [...byId.values()].sort((a, b) => a.prio - b.prio).slice(0, 24) }
    }
    return platformsCache
}
app.get('/api/profiles/:profileId/tmdb-platforms', async (req, res) => {
  try {
    const apiKey = readProfileApiKey(req.params.profileId)
    if (!apiKey) return res.json({ needsApiKey: true, items: [] })
    const cache = await platformList(apiKey)
    res.json({ items: cache.items.map(({ prio: _p, ...x }) => x) })
  } catch (e) {
    console.error('platform hata:', e)
    res.json({ items: [] })
  }
})

// Detay penceresindeki "Dizi bitti / Yeni sezon" etiketi için saklanan dizi durumları (TMDB'ye gitmez).
app.get('/api/profiles/:profileId/show-status', (req, res) => {
  const refs = readJson(profileTmdbFile(req.params.profileId), {})
  const out = {}
  for (const [rowId, r] of Object.entries(refs)) if (r?.show) out[rowId] = r.show
  res.json(omitHiddenKeys(req.params.profileId, out))
})

app.get('/api/profiles/:profileId/new-episodes/:boardId', async (req, res) => {
  try {
    const { profileId, boardId } = req.params
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return res.json({ items: [] })
    const loaded = loadBoardAndRows(profileId, boardId)
    if (!loaded) return res.json({ items: [] })
    const { board, rows } = loaded
    const durumProp = resolveRole(board, 'durum')
    const izleniyor = resolveStatusOption(board, 'izleniyor')
    if (!durumProp || !izleniyor) return res.json({ items: [] })

    const watched = readJson(profileWatchedFile(profileId), {})
    const items = []
    for (const row of rows.filter((r) => r.values[durumProp.id] === izleniyor)) {
      const ref = await ensureTmdbRef(profileId, board, row, apiKey)
      if (!ref || ref.mediaType !== 'tv') continue
      const st = await getTvStatus(ref.id, apiKey)
      if (st) saveShowInfo(profileId, row.id, st)
      if (!st?.last) continue
      // Yayınlanmış bölümler: son yayınlanan bölüme kadar her şey.
      const aired = []
      for (const s of st.seasons) {
        if (s.season > st.last.season) continue
        const upTo = s.season === st.last.season ? st.last.episode : s.count
        for (let e = 1; e <= upTo; e++) aired.push(`${s.season}-${e}`)
      }
      const seen = watched[row.id] ?? {}
      // Bölüm bölüm takip edilmeyen (hiç bölüm işaretlenmemiş) dizilerde "85 izlenmemiş bölüm"
      // demek anlamsız — onlarda sadece son 14 günde yeni bölüm çıktıysa ya da önümüzdeki 7 gün
      // içinde çıkacaksa gösteriliyor. Takip edilenlerde izlenmemiş bölüm sayısı veriliyor.
      const tracking = Object.values(seen).some((d) => d?.length > 0)
      const latestKey = `${st.last.season}-${st.last.episode}`
      const latestWatched = seen[latestKey]?.length > 0
      const today = localDay()
      const daysFrom = (iso) => (iso ? Math.round((Date.parse(iso) - Date.parse(today)) / 864e5) : null)
      const sinceLatest = daysFrom(st.last.airDate)
      const untilNext = st.next ? daysFrom(st.next.airDate) : null
      const recentNew = !latestWatched && sinceLatest !== null && sinceLatest >= -14
      const soon = untilNext !== null && untilNext >= 0 && untilNext <= 7
      const unwatched = tracking ? aired.filter((k) => !(seen[k]?.length > 0)) : []
      if (!(tracking ? unwatched.length > 0 || soon : recentNew || soon)) continue
      const next = unwatched[0]?.split('-').map(Number)
      items.push({
        rowId: row.id,
        tracking,
        unwatchedCount: unwatched.length,
        nextToWatch: next ? { season: next[0], episode: next[1] } : null,
        latest: st.last,
        latestIsNew: recentNew,
        upcoming: soon ? st.next : null,
      })
    }
    // En yeni yayınlanan bölüm en üstte.
    items.sort((a, b) => (b.latest.airDate || '').localeCompare(a.latest.airDate || ''))
    res.json({ items })
    // Bitirilmiş (İzlendi) dizilerde yeni sezon kontrolü — cevabı bekletmesin diye arkada, en fazla 6 saatte bir.
    checkFinishedSeries(profileId, boardId, apiKey).catch((e) => console.error('bitmiş dizi kontrolü hata:', e))
  } catch (e) {
    console.error('new-episodes hata:', e)
    res.json({ items: [] })
  }
})
