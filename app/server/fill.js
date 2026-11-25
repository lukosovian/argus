// Kaydı TMDB'den doldurma (tek kayıt, Genel Güncelleme, TMDB'den yeni kayıt ekleme).
import fs from 'node:fs'
import path from 'node:path'
import { bestOverview, seriesRuntime } from './sources.js'
import { ensureRole, ensureStatusOption, resolveRole } from './roles.js'
import { langDate, serverLang, stt, tmdbLang } from './lang.js'
import { COLUMN_NAMES, KIND_NAMES, isName, nameOf } from './names.js'
import { MEDYA_DIR, makeId, profileBoardsFile, profileCastFile, profileEpisodesFile, profileRowsFile, profileTmdbFile, readJson, readJsonShared, readProfileApiKey, updateJson, withLock, writeJson } from './storage.js'
import { ISO_TO_TR, TMDB_IMG_BASE, buildArchiveIndex, downloadTmdbImage, getMovieCertification, getTrailerUrl, getTvCertification, isBrokenLogo, isoToTrName, normalizeText, pickLogo, pickTmdbCandidate, searchTmdbForRow, showInfoFromDetails, stripFlagEmoji, tmdbGet, tmdbNames, tmdbSeasons, toCard } from './tmdb.js'
import { planIfUpcoming } from './watchLogic.js'
import { profileAklimdaFile, readAklimda } from './routes/collection.js'

// TMDB'den doldururken kullanılan yanıtlar en fazla 30 dk eski olabilir (bkz. tmdb.js önbellek) — "Güncelle"ye
// basınca yeni çıkan bölüm gelsin, ama Genel Güncelleme yarıda kalıp yeniden başlatılınca aynı istekler tekrarlanmasın.
const FILL_TTL = { maxAgeMs: 30 * 60e3 }

// Aynı kayıt aynı anda iki kez doldurulmasın (Genel Güncelleme + tablodaki Güncelle): ikincisi öncekini bekler.
export function fillRowFromTmdb(profileId, boardId, rowId, opts = {}) {
  return withLock(`fill:${profileId}:${rowId}`, () => fillRowFromTmdbNow(profileId, boardId, rowId, opts))
}

// Sonuçları kaydederken dosyaların EN GÜNCEL hali okunur ve sadece bu kaydın değişen alanları + bu doldurmanın
// açtığı yeni sütun/seçenekler işlenir. Eskiden işin başında okunan kopyalar TMDB istekleri bitince (bazen
// dakikalar sonra) olduğu gibi geri yazılıyordu: bu arada başka kayıtlarda yapılan düzenlemeler, şema
// değişiklikleri ve aynı anda çalışan başka bir doldurmanın eklediği seçenekler sessizce geri alınıyordu.
function commitFill(profileId, boardId, rowId, { board, row, origValues, origPropIds, origOptionIds, ref, seasonsOut, freshCast }) {
  // 1) Şema: bu doldurmanın açtığı sütunlar ve seçenekler (id'ye göre) güncel şemaya eklenir. Başka bir doldurma
  // aynı adla seçenek açmışsa (ör. iki kayıtta aynı anda "Dram") onunki kullanılır, bu kayıttaki id ona çevrilir.
  const remap = new Map()
  const boardsFile = profileBoardsFile(profileId)
  const boards = readJson(boardsFile, [])
  const fb = boards.find((b) => b.id === boardId)
  if (!fb) return { status: 404, data: { error: stt('Arşiv bulunamadı') } }
  const before = JSON.stringify(fb)
  for (const p of board.properties) {
    if (!origPropIds.has(p.id)) {
      if (!fb.properties.some((x) => x.id === p.id)) fb.properties.push(p)
      continue
    }
    const fp = fb.properties.find((x) => x.id === p.id)
    if (!fp || !Array.isArray(p.options)) continue
    const known = origOptionIds.get(p.id) ?? new Set()
    for (const o of p.options) {
      if (known.has(o.id)) continue
      if (!fp.options) fp.options = []
      if (fp.options.some((x) => x.id === o.id)) continue
      const same = fp.options.find((x) => normalizeText(x.label) === normalizeText(o.label))
      if (same) remap.set(o.id, same.id)
      else fp.options.push({ ...o, colorIndex: fp.options.length % 9 })
    }
  }
  for (const k of ['coverPropertyId', 'titleImagePropertyId']) {
    if (board[k] && !fb[k] && fb.properties.some((x) => x.id === board[k])) fb[k] = board[k]
  }
  // 2) Kayıt: bu arada silindiyse yeniden oluşturulmaz. Doldurma sürerken kullanıcının kendisinin değiştirdiği
  // bir alan varsa onunki kalır.
  const rowsFile = profileRowsFile(profileId, boardId)
  const rows = readJson(rowsFile, [])
  const fr = rows.find((r) => r.id === rowId)
  if (!fr) return { status: 404, data: { error: stt('Kayıt bulunamadı') } }
  const fix = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => remap.get(x) ?? x))] : typeof v === 'string' && remap.has(v) ? remap.get(v) : v)
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  const values = { ...fr.values }
  for (const k of new Set([...Object.keys(origValues), ...Object.keys(row.values)])) {
    if (same(origValues[k], row.values[k])) continue
    if (!same(fr.values?.[k], origValues[k])) continue // kullanıcı bu arada değiştirdi
    if (row.values[k] === undefined) delete values[k]
    else values[k] = fix(row.values[k])
  }
  const rowBefore = JSON.stringify(fr.values ?? {})
  fr.values = values
  planIfUpcoming(fb, fr)
  if (JSON.stringify(fb) !== before) writeJson(boardsFile, boards)
  if (JSON.stringify(fr.values) !== rowBefore) writeJson(rowsFile, rows)
  // 3) TMDB eşleşmesi (tmdb.json'a tek yazma), bölümler ve kadro
  const refsFile = profileTmdbFile(profileId)
  const refs = readJson(refsFile, {})
  try {
    const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    const eksik = []
    for (const [field, key] of [['poster', 'poster'], ['sinopsis', 'sinopsis'], ['video', 'video'], ['ulke', 'ulke'], ['yonetmen', 'yonetmen']]) {
      if (ref.exclude.has(field)) continue
      const p = resolveRole(fb, key)
      if (p && empty(fr.values[p.id])) eksik.push(p.id)
    }
    if (eksik.length) ref.entry.eksik = eksik
    ref.entry.baktim = Date.now()
    ref.entry.ad = tmdbNames(ref.details, ref.entry.mediaType)
  } catch {
    /* önemsiz */
  }
  refs[rowId] = ref.entry
  writeJson(refsFile, refs)
  if (seasonsOut) {
    updateJson(profileEpisodesFile(profileId), {}, (map) => {
      const n0 = (map[rowId] ?? []).reduce((n, s) => n + s.episodes.length, 0)
      map[rowId] = seasonsOut
      ref.newEpisodes = seasonsOut.reduce((n, s) => n + s.episodes.length, 0) - n0
    })
  }
  if (freshCast?.length) {
    updateJson(profileCastFile(profileId), {}, (map) => {
      map[rowId] = freshCast.map((c) => ({ ...c, optionId: remap.get(c.optionId) ?? c.optionId }))
    })
  }
  return { status: 200, rows, refs }
}

async function fillRowFromTmdbNow(profileId, boardId, rowId, { exclude: excludeList = [], overwrite: overwriteFlag = false, forced = null, ask = false } = {}) {
  try {
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) {
      return { status: 400, data: { error: stt('Önce Ayarlar → Veritabanı → API sekmesinden bir TMDB API anahtarı girmelisin.') } }
    }
    const exclude = new Set(Array.isArray(excludeList) ? excludeList : [])
    const overwrite = Boolean(overwriteFlag)
    const boardsFile = profileBoardsFile(profileId)
    const boards = readJson(boardsFile, [])
    const board = boards.find((b) => b.id === boardId)
    if (!board) return { status: 404, data: { error: stt('Arşiv bulunamadı') } }
    const rowsFilePath = profileRowsFile(profileId, board.id)
    const rows = readJson(rowsFilePath, [])
    const row = rows.find((r) => r.id === rowId)
    if (!row) return { status: 404, data: { error: stt('Kayıt bulunamadı') } }
    // Başlangıçtaki hal: kaydederken sadece bu doldurmanın değiştirdikleri işlenir (bkz. commitFill)
    const origValues = structuredClone(row.values ?? {})
    row.values = { ...(row.values ?? {}) }
    const origPropIds = new Set(board.properties.map((p) => p.id))
    const origOptionIds = new Map(board.properties.map((p) => [p.id, new Set((p.options ?? []).map((o) => o.id))]))

    // Başlık her zaman arşivin başlık sütunu (adı "Türkçe Adı" olmak zorunda değil).
    const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)

    // Board'da bu sütunlardan biri hiç yoksa (kullanıcı hazır şablonu kullanmadan kendi
    // arşivini elle kurduysa, ya da bir sütunu sildiyse) TMDB doldurma eskiden sessizce o
    // alanı atlıyordu — arkadaşının arşivinde "KAPAK ADI" sütunu hiç eklenmemiş olması TAM
    // OLARAK bu yüzden hiç doldurulmuyordu. Artık Süre/Yaş Sınırı'nda zaten var olan
    // "yoksa oluştur" deseni TÜM TMDB alanlarına uygulanıyor — güncelle butonuna basmak
    // eksik sütunları da kendisi ekliyor.
    // Hariç tutulan (bu sefer "gelmesin" denen) bir alanın sütunu yoksa oluşturulmuyor — kullanıcı
    // doldurmadan önce çıkan pencerede "Kapak Adı gelmesin" derse tabloya boş sütun eklenmesin.
    const mk = () => makeId()
    const ens = (field, key, extra) => (exclude.has(field) ? resolveRole(board, key) : ensureRole(board, key, mk, extra))
    const origProp = ens('orjinalAdi', 'orjinalAdi')
    const kategoriProp = ens('kategori', 'kategori', { options: [] })
    const vizyonProp = ens('vizyonTarihi', 'vizyon')
    const bannerProp = ens('banner', 'banner')
    // Kapak görseli seçilmemiş arşivde (ör. şablonsuz içe aktarım) ana sayfa kartları boş kalıyordu — Banner kapak olsun
    if (bannerProp && !board.coverPropertyId) board.coverPropertyId = bannerProp.id
    const posterProp = ens('poster', 'poster')
    // Başlık logosu: arşivde "Vitrin Başlık Görseli" olarak işaretli sütun; hiç yoksa oluşturulup
    // o şekilde işaretleniyor (eskiden "Kapak Adı" adıyla aranıyordu).
    let kapakAdiProp = board.properties.find((p) => p.id === board.titleImagePropertyId && p.type === 'image')
    if (!kapakAdiProp) {
      kapakAdiProp = board.properties.find((p) => p.type === 'image' && isName(p.name, COLUMN_NAMES.kapakAdi))
      if (!kapakAdiProp && !exclude.has('kapakAdi')) {
        kapakAdiProp = { id: mk(), name: nameOf(COLUMN_NAMES.kapakAdi), type: 'image' }
        board.properties.push(kapakAdiProp)
      }
      if (kapakAdiProp) board.titleImagePropertyId = kapakAdiProp.id
    }
    const ulkeProp = ens('ulke', 'ulke', { options: [] })
    const turProp = ens('tur', 'tur', { options: [] })
    const yonetmenProp = ens('yonetmen', 'yonetmen')
    const oyuncularProp = ens('kadro', 'oyuncular', { options: [] })
    const videoProp = ens('video', 'video')
    const sureProp = ens('sure', 'sure')
    const yasProp = ens('yasSiniri', 'yas')
    const sinopsisProp = ens('sinopsis', 'sinopsis')

    const titleTr = titleProp ? row.values[titleProp.id] : ''
    const titleOrig = origProp ? row.values[origProp.id] : ''
    if (!titleTr && !titleOrig) {
      return { status: 400, data: { error: stt('Önce başlığı (ya da "Orjinal Adı" sütununu) doldurmalısın.') } }
    }

    const kategoriId = kategoriProp ? row.values[kategoriProp.id] : null
    // Tek satırdaki Güncelle (`ask`): kesin tek bir eşleşme yoksa kendisi seçmek yerine adayları
    // döndürür, arayüz listeyi gösterip kullanıcıya seçtirir (sonra `forced` ile yeniden çağrılır).
    if (!forced && ask) {
      const pick = await pickTmdbCandidate(profileId, board, row, apiKey, ask === 'always')
      if (pick.choose) return { status: 200, data: { choose: pick.choose } }
      if (pick.forced) forced = pick.forced
    }
    let mediaType = null
    let result = null
    if (forced) {
      result = { id: forced.tmdbId }
      mediaType = forced.mediaType
    } else {
      const match = await searchTmdbForRow(board, row, apiKey)
      if (match) {
        result = match.result
        mediaType = match.mediaType
      }
    }
    if (!result) {
      return {
        status: 404,
        data: {
          error:
            stt('TMDB eşleşmesi bulunamadı — başlığın yazımını kontrol et; "Kategori" sütununu Film ya da Dizi olarak doldurursan arama daha isabetli sonuç verir.'),
        },
      }
    }

    const details =
      mediaType === 'tv'
        ? await tmdbGet(
            `/tv/${result.id}`,
            { language: tmdbLang(), append_to_response: 'aggregate_credits,images,translations,external_ids,alternative_titles', include_image_language: `${serverLang()},en,null` },
            apiKey,
            FILL_TTL,
          )
        : await tmdbGet(
            `/movie/${result.id}`,
            { language: tmdbLang(), append_to_response: 'credits,images,translations,external_ids,alternative_titles', include_image_language: `${serverLang()},en,null` },
            apiKey,
            FILL_TTL,
          )
    if (!details) return { status: 502, data: { error: stt('TMDB detay alınamadı') } }

    // Bu kaydın TMDB kimliği saklanıyor — Nerede İzlenir, Benzerler, yeni bölüm kontrolü ve
    // Keşfet'in "zaten arşivde var" ayıklaması bunu kullanıyor (bkz. tmdb.json).
    const refs = readJsonShared(profileTmdbFile(profileId), {})
    // "Hangisi?" penceresinde kayıt BAŞKA bir yapımla eşleştirildiyse (önceki eşleşme yanlıştı) eski yapımdan
    // kalan afiş, yönetmen, yıl, oyuncular… da yenisiyle değiştirilir — yeni kullanıcı denemesinde "Attack on
    // Titan" müzikaliyle eşleşmiş, doğrusu seçilince müzikalin afişi ve yönetmeni kalmıştı. Kategori ve başlık
    // (kullanıcının kendi yazdıkları) bu yüzden değişmez.
    const prevRef = refs[row.id]
    const rematch = Boolean(forced && prevRef && (prevRef.id !== result.id || prevRef.mediaType !== mediaType))
    const ow = overwrite || rematch
    // tmdb.json'a en sonda bir kez yazılır (bkz. commitFill) — eskiden doldurma sırasında 4 kez yazılıyordu.
    const refEntry = { id: result.id, mediaType, ...(mediaType === 'tv' ? { show: showInfoFromDetails(details) } : {}) }

    const filled = []

    if (kategoriProp && (overwrite || !kategoriId) && !exclude.has('kategori')) {
      const wantPair = mediaType === 'tv' ? KIND_NAMES.dizi : KIND_NAMES.film
      const wantLabel = nameOf(wantPair)
      if (!kategoriProp.options) kategoriProp.options = []
      let opt = kategoriProp.options.find((o) => isName(o.label, wantPair))
      if (!opt) {
        opt = { id: makeId(), label: wantLabel, colorIndex: kategoriProp.options.length % 9 }
        kategoriProp.options.push(opt)
      }
      row.values[kategoriProp.id] = opt.id
      filled.push(stt('Kategori'))
    }

    // Başlık: kullanıcı "Türkçe adına İngilizcesini yazıyorum, öyle kalıyor; Türkçe adını bulursa
    // güncellesin" dedi. Başlık boşsa (sadece Orjinal Adı yazılıp aranmışsa) ya da başlıkta orijinal/
    // İngilizce ad yazıyorsa TMDB'nin Türkçe adı yazılır. Kullanıcının kendi verdiği başka bir ad korunur.
    if (titleProp && titleProp.type === 'text') {
      const trTitle = ((mediaType === 'tv' ? details.name : details.title) || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim() // TMDB bazen görünmez yön işaretleri koyuyor
      const cur = typeof titleTr === 'string' ? titleTr.trim() : ''
      // Aynı ad ama yazımı farklıysa da (kullanıcı "hepsini küçük harfle yazdım, filmi buldu ama yazımı
      // düzeltmedi" dedi — büyük/küçük harf, ı/i, ş/s gibi harfler) TMDB'deki yazım yazılır.
      // Ad bir kez TMDB'den düzeltildikten sonra kullanıcı kendisi değiştirdiyse (son güncellemede yazılan
      // addan farklıysa) bir daha dokunulmaz — kullanıcı "ilk güncellede düzeltsin, sonra kendim
      // değiştirdiğimde dokunmasın" dedi. Eski kayıtlarda (tt yok) bir kez daha düzeltilebilir.
      const userEdited = typeof prevRef?.tt === 'string' && cur && cur !== prevRef.tt
      if (trTitle && cur !== trTitle && !userEdited) {
        const fold = (s) => normalizeText(s.toLocaleLowerCase('tr')).replace(/ı/g, 'i') // "dunya varmis" = "Dünya Varmış"
        let replace = !cur || fold(cur) === fold(trTitle)
        // İngilizce / orijinal ad yazılmışsa Türkçesiyle değiştirmek bir seçenek (dişli › "Başlığı Türkçe adla değiştir";
        // arşivin titleTr ayarı, yoksa kapalı)
        if (!replace && !exclude.has('turkceAdi') && board.titleTr) {
          const orig = (mediaType === 'tv' ? details.original_name : details.original_title) || ''
          replace = normalizeText(cur) === normalizeText(orig)
          if (!replace) {
            const en = await tmdbGet(`/${mediaType}/${result.id}`, { language: 'en-US' }, apiKey, FILL_TTL)
            const enTitle = (mediaType === 'tv' ? en?.name : en?.title) || ''
            replace = Boolean(enTitle) && normalizeText(cur) === normalizeText(enTitle)
          }
        }
        if (replace) {
          row.values[titleProp.id] = trTitle
          filled.push(titleProp.name)
        }
      }
    }
    if (titleProp) {
      const t = row.values[titleProp.id]
      refEntry.tt = typeof t === 'string' ? t.trim() : ''
    }

    if (origProp && (ow || !titleOrig) && !exclude.has('orjinalAdi')) {
      const orig = mediaType === 'tv' ? details.original_name : details.original_title
      if (orig) {
        row.values[origProp.id] = orig
        filled.push(stt('Orjinal Adı'))
      }
    }

    // İçe aktarımda sadece yıl yazılmışsa ("1994" → 1994-01-01) aynı yıldaki gerçek tarihle tamamlanır
    const vizyonNow = vizyonProp ? row.values[vizyonProp.id] : ''
    const tmdbDate = mediaType === 'tv' ? details.first_air_date : details.release_date
    const yearOnly = typeof vizyonNow === 'string' && /^\d{4}-01-01$/.test(vizyonNow) && tmdbDate?.startsWith(vizyonNow.slice(0, 4)) && tmdbDate !== vizyonNow
    if (vizyonProp && (ow || !vizyonNow || yearOnly) && !exclude.has('vizyonTarihi')) {
      const date = tmdbDate
      if (date) {
        row.values[vizyonProp.id] = date
        filled.push(stt('Vizyon Tarihi'))
      }
    }

    // Sinopsis: TMDB'nin bu dildeki özeti boşsa başka çevirisi, Vikipedi, İngilizcesi ya da TVmaze (bkz. sources.js).
    // Kullanıcı "sinopsis TMDB'de olduğu halde çekmediği oluyor" dedi — Türkçe çevirisi olmayınca boş kalıyordu.
    if (sinopsisProp && (ow || !String(row.values[sinopsisProp.id] ?? '').trim()) && !exclude.has('sinopsis')) {
      const ov = await bestOverview(details, mediaType, serverLang())
      if (ov?.text) {
        row.values[sinopsisProp.id] = ov.text
        filled.push(stt('Sinopsis'))
      }
    }

    if (posterProp && (ow || !row.values[posterProp.id]) && details.poster_path && !exclude.has('poster')) {
      const filename = `tmdb_poster_${row.id}_${result.id}.jpg`
      if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w500${details.poster_path}`, path.join(MEDYA_DIR, filename))) {
        row.values[posterProp.id] = `/medya/${filename}`
        filled.push('Poster')
      }
    }

    if (bannerProp && (ow || !row.values[bannerProp.id]) && details.backdrop_path && !exclude.has('banner')) {
      const filename = `tmdb_backdrop_${row.id}_${result.id}.jpg`
      if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w1280${details.backdrop_path}`, path.join(MEDYA_DIR, filename))) {
        row.values[bannerProp.id] = `/medya/${filename}`
        filled.push('Banner')
      }
    }

    if (kapakAdiProp && (ow || !row.values[kapakAdiProp.id] || isBrokenLogo(row.values[kapakAdiProp.id])) && !exclude.has('kapakAdi')) {
      const logo = pickLogo(details.images)
      if (logo) {
        const filename = `tmdb_logo_${row.id}_${result.id}${/\.svg$/i.test(logo.file_path) ? '.svg' : '.png'}`
        if (isBrokenLogo(`/medya/${filename}`)) fs.rmSync(path.join(MEDYA_DIR, filename), { force: true })
        if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w500${logo.file_path}`, path.join(MEDYA_DIR, filename))) {
          row.values[kapakAdiProp.id] = `/medya/${filename}`
          filled.push(stt('Kapak Adı'))
        }
      }
    }

    if (
      turProp &&
      (ow || !Array.isArray(row.values[turProp.id]) || row.values[turProp.id].length === 0) &&
      !exclude.has('tur')
    ) {
      const genres = details.genres ?? []
      if (genres.length) {
        if (!Array.isArray(turProp.options)) turProp.options = [] // seçeneksiz kurulmuş sütunda çökmesin
        const turByName = new Map(turProp.options.map((o) => [normalizeText(o.label), o.id]))
        const ids = []
        for (const g of genres) {
          const norm = normalizeText(g.name)
          let optId = turByName.get(norm)
          if (!optId) {
            optId = makeId()
            turProp.options.push({ id: optId, label: g.name, colorIndex: turProp.options.length % 9 })
            turByName.set(norm, optId)
          }
          ids.push(optId)
        }
        row.values[turProp.id] = ids
        filled.push(stt('Tür'))
      }
    }

    if (
      ulkeProp &&
      (ow || !Array.isArray(row.values[ulkeProp.id]) || row.values[ulkeProp.id].length === 0) &&
      !exclude.has('ulke')
    ) {
      const countries = details.production_countries ?? []
      if (countries.length) {
        if (!Array.isArray(ulkeProp.options)) ulkeProp.options = []
        const ulkeByName = new Map(ulkeProp.options.map((o) => [normalizeText(stripFlagEmoji(o.label)), o.id]))
        const ids = []
        for (const c of countries) {
          const trName = (serverLang() === 'tr' ? ISO_TO_TR[c.iso_3166_1] : null) ?? isoToTrName(c.iso_3166_1) ?? c.name ?? c.iso_3166_1
          const norm = normalizeText(trName)
          let optId = ulkeByName.get(norm)
          if (!optId) {
            optId = makeId()
            ulkeProp.options.push({ id: optId, label: trName, colorIndex: ulkeProp.options.length % 9 })
            ulkeByName.set(norm, optId)
          }
          ids.push(optId)
        }
        row.values[ulkeProp.id] = ids
        filled.push(stt('Ülke'))
      }
    }

    if (yonetmenProp && (ow || !(row.values[yonetmenProp.id] ?? '').trim()) && !exclude.has('yonetmen')) {
      let directors = []
      if (mediaType === 'movie') {
        directors = (details.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name)
      } else {
        directors = (details.created_by ?? []).map((c) => c.name)
      }
      if (directors.length) {
        row.values[yonetmenProp.id] = directors.join(', ')
        filled.push(stt('Yönetmen'))
      }
    }

    // Süre: filmde filmin süresi, dizide bir bölümün ortalama süresi (v1.24 — kullanıcı "dizilerde de süre
    // kısmını diziye uygun doldursun" dedi). Tabloda dizide "bölüm başına" diye yazılır.
    if (sureProp && (ow || !row.values[sureProp.id]) && !exclude.has('sure')) {
      const mins = mediaType === 'movie' ? details.runtime : await seriesRuntime(details)
      if (mins > 0) {
        row.values[sureProp.id] = mins
        filled.push(stt('Süre'))
        if (mediaType === 'tv') refEntry.epRuntime = mins
      }
    }

    if (yasProp && (ow || !(row.values[yasProp.id] ?? '').trim()) && !exclude.has('yasSiniri')) {
      const cert = mediaType === 'movie' ? await getMovieCertification(result.id, apiKey) : await getTvCertification(result.id, apiKey)
      if (cert) {
        row.values[yasProp.id] = cert
        filled.push(stt('Yaş Sınırı'))
      }
    }

    if (videoProp && (ow || !(row.values[videoProp.id] ?? '').trim()) && !exclude.has('video')) {
      const trailerUrl = await getTrailerUrl(mediaType, result.id, apiKey)
      if (trailerUrl) {
        row.values[videoProp.id] = trailerUrl
        filled.push('Video')
      }
    }

    let seasonsOut = null
    if (mediaType === 'tv' && !exclude.has('sezonlar')) {
      const seasonsMeta = (details.seasons ?? []).filter((s) => s.season_number >= 1)
      seasonsOut = []
      const prevSeasons = readJsonShared(profileEpisodesFile(profileId), {})[row.id] ?? []
      // Sezonlar 20'şerli gruplar halinde tek istekte (bkz. tmdbSeasons)
      const seasonData = await tmdbSeasons(result.id, seasonsMeta.map((s) => s.season_number), { language: tmdbLang() }, apiKey, FILL_TTL)
      for (const s of seasonsMeta) {
        const sdata = seasonData[s.season_number]
        if (!sdata) {
          // TMDB o sezonu getiremediyse (ağ hatası, 429) eldeki bölümler silinmesin — eskisi kalsın.
          const old = prevSeasons.find((p) => p.seasonNumber === s.season_number)
          if (old) seasonsOut.push(old)
          continue
        }
        const eps = []
        for (const ep of sdata.episodes ?? []) {
          let stillUrl = null
          if (ep.still_path) {
            const filename = `episode_${path.basename(ep.still_path)}`
            if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w300${ep.still_path}`, path.join(MEDYA_DIR, filename))) {
              stillUrl = `/medya/${filename}`
            }
          }
          eps.push({
            episodeNumber: ep.episode_number,
            name: ep.name || stt('Bölüm {0}', ep.episode_number),
            overview: ep.overview ?? '',
            airDate: ep.air_date ?? '',
            stillUrl,
          })
        }
        if (eps.length) seasonsOut.push({ seasonNumber: s.season_number, name: s.name || `Sezon ${s.season_number}`, episodes: eps })
        else {
          // TMDB sezonu bölümsüz gönderdiyse (nadiren, geçici) eldeki bölümler — ve onlara bağlı izleme tikleri — silinmesin.
          const old = prevSeasons.find((p) => p.seasonNumber === s.season_number)
          if (old?.episodes?.length) seasonsOut.push(old)
        }
      }
      // Sezon listesi hiç gelmediyse ya da boş geldiyse (TMDB'nin geçici hatası) bölüm listesi olduğu gibi kalır;
      // eskiden boş liste yazılıp dizinin bütün bölümleri siliniyordu.
      if (!seasonsOut.length && prevSeasons.length) seasonsOut = null
    }

    let newActors = 0
    let freshCast = null
    if (oyuncularProp && !exclude.has('kadro')) {
      if (!Array.isArray(oyuncularProp.options)) oyuncularProp.options = []
      const actorByName = new Map(oyuncularProp.options.map((o) => [normalizeText(o.label), o.id]))
      const rawCast =
        mediaType === 'tv'
          ? (details.aggregate_credits?.cast ?? []).slice(0, 20).map((c) => {
              const roles = c.roles ?? []
              const primary = roles.length ? roles.reduce((a, b) => ((b.episode_count ?? 0) > (a.episode_count ?? 0) ? b : a)) : null
              return {
                id: c.id,
                name: c.name,
                profile_path: c.profile_path,
                character: primary?.character,
                episodeCount: roles.reduce((n, r) => n + (r.episode_count ?? 0), 0),
              }
            })
          : (details.credits?.cast ?? []).slice(0, 20).map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path, character: c.character }))

      freshCast = []
      for (const c of rawCast) {
        if (!c.name || !c.character) continue
        const norm = normalizeText(c.name)
        let optId = actorByName.get(norm)

        if (!optId) {
          optId = makeId()
          const newOpt = { id: optId, label: c.name, colorIndex: oyuncularProp.options.length % 9 }
          if (c.profile_path) {
            const filename = `actor_tmdb_${optId}.jpg`
            if (await downloadTmdbImage(`${TMDB_IMG_BASE}/w500${c.profile_path}`, path.join(MEDYA_DIR, filename))) {
              newOpt.image = `/medya/${filename}`
            }
          }
          const person = await tmdbGet(`/person/${c.id}`, { language: tmdbLang() }, apiKey, FILL_TTL)
          if (person) {
            const parts = []
            if (person.birthday) {
              parts.push(langDate(person.birthday))
            }
            if (person.place_of_birth) parts.push(person.place_of_birth)
            if (parts.length) newOpt.subtitle = parts.join(' · ')
          }
          oyuncularProp.options.push(newOpt)
          actorByName.set(norm, optId)
          newActors++
        }
        const entry = { optionId: optId, character: c.character }
        if (c.episodeCount) entry.episodeCount = c.episodeCount
        freshCast.push(entry)
      }

      if (freshCast.length) {
        const existingIds = !rematch && Array.isArray(row.values[oyuncularProp.id]) ? row.values[oyuncularProp.id] : []
        row.values[oyuncularProp.id] = [...new Set([...existingIds, ...freshCast.map((c) => c.optionId)])]
      }
    }

    // TMDB'de olmayan temel bilgiler (ör. yönetmeni yok) tmdb.json'a "eksik" diye yazılır (commitFill): Sağlık Kontrolü
    // bunları "eksik" diye göstermesin, ama her güncellemede (toplu ya da tek) yeniden bakılır — TMDB'ye eklenirse dolar
    // ve listeden düşer. Kullanıcı "TMDB'de yoksa sürekli göstermesin, sonraki güncellemelerde arka planda tekrar baksın" dedi.
    const ref = { entry: refEntry, details, exclude, newEpisodes: 0 }
    const saved = commitFill(profileId, boardId, row.id, { board, row, origValues, origPropIds, origOptionIds, ref, seasonsOut, freshCast })
    if (saved.status !== 200) return saved
    const newEpisodes = ref.newEpisodes

    // Mükerrer uyarısı: aynı TMDB içeriği bu arşivde başka bir kayıtta da varsa arayüz haber verir.
    const dupRow = saved.rows.find((x) => x.id !== row.id && saved.refs[x.id]?.id === result.id && saved.refs[x.id]?.mediaType === mediaType)
    const duplicateOf = dupRow ? { rowId: dupRow.id, title: (titleProp && dupRow.values[titleProp.id]) || stt('İsimsiz') } : null

    return { status: 200, data: { ok: true, mediaType, filled, newEpisodes, newActors, duplicateOf } }
  } catch (e) {
    console.error('fetch-tmdb hata:', e)
    return { status: 500, data: { error: stt('Çekme sırasında hata oluştu') } }
  }
}

// Evrenler'den de kullanılıyor (izlendi + yaklaşık tarih "2019" / "?" olabilir).
export async function addRowFromTmdb(profileId, boardId, body) {
  {
    const { tmdbId, mediaType, status, watchedDate, rating, scores, exclude } = body ?? {}
    if (!tmdbId || (mediaType !== 'movie' && mediaType !== 'tv')) return { status: 400, json: { error: stt('Geçersiz içerik') } }
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return { status: 400, json: { error: stt('Önce Ayarlar → Veritabanı → API sekmesinden bir TMDB API anahtarı girmelisin.') } }

    const boardsFile = profileBoardsFile(profileId)
    if (!readJsonShared(boardsFile, []).some((b) => b.id === boardId)) return { status: 404, json: { error: stt('Arşiv bulunamadı') } }
    const basic = await tmdbGet(`/${mediaType}/${tmdbId}`, { language: tmdbLang() }, apiKey)
    if (!basic) return { status: 502, json: { error: stt('TMDB bilgisi alınamadı') } }
    // Şema ve kayıtlar TMDB cevabından SONRA okunuyor: beklerken yapılan değişiklikler eski kopyayla ezilmesin.
    const boards = readJson(boardsFile, [])
    const board = boards.find((b) => b.id === boardId)
    if (!board) return { status: 404, json: { error: stt('Arşiv bulunamadı') } }
    const rowsFile = profileRowsFile(profileId, boardId)
    const rows = readJson(rowsFile, [])
    const index = buildArchiveIndex(profileId, board, rows)
    const card = toCard(basic, mediaType)
    if (index.has(card)) return { status: 409, json: { error: stt('"{0}" zaten arşivinde var.', card.title) } }

    const values = {}
    const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
    if (titleProp) values[titleProp.id] = card.title || card.originalTitle

    const statusKey = status === 'izlendi' ? 'izlendi' : 'izlenecek'
    const durumProp = resolveRole(board, 'durum')
    const statusOpt = ensureStatusOption(board, statusKey, makeId)
    if (durumProp && statusOpt) values[durumProp.id] = statusOpt

    if (statusKey === 'izlendi') {
      const date = typeof watchedDate === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(watchedDate) || /^\d{4}$/.test(watchedDate) || watchedDate === '?') ? watchedDate : null
      if (date) {
        const dateProp = ensureRole(board, 'izlemeTarihi', makeId)
        if (dateProp) values[dateProp.id] = dateProp.type === 'multidate' ? [date] : date
      }
      // Kullanıcı "İzledim deyince puan verme kısmı detaylı değil" dedi: Ne İzlesem artık kriter kriter puan
      // gönderebiliyor (scores: { kriterId: puan }); sadece arşivin kriterleri kabul edilir.
      const puanProp0 = resolveRole(board, 'puan')
      const criteriaIds = new Set((puanProp0?.criteria ?? []).map((c) => c.id))
      const cleanScores =
        scores && typeof scores === 'object'
          ? Object.fromEntries(Object.entries(scores).filter(([k, n]) => criteriaIds.has(k) && typeof n === 'number' && n >= 0 && n <= 10))
          : {}
      if (puanProp0 && Object.keys(cleanScores).length) {
        values[puanProp0.id] = cleanScores
      } else if (typeof rating === 'number' && rating >= 0 && rating <= 10) {
        const puanProp = resolveRole(board, 'puan')
        if (puanProp) {
          // Kriterli puanda tek bir genel puan girildi — tüm kriterlere aynı değer yazılıyor
          // (ortalaması zaten o puan olur); hiç kriter yoksa "Genel" diye bir tane açılıyor.
          // Tek (genel) puan — kriterlere dağıtılmaz (bkz. src/types.ts RATING_OVERALL)
          values[puanProp.id] = { _genel: rating }
        }
      }
    }

    const now = Date.now()
    const row = { id: makeId(), values, createdAt: now, updatedAt: now }
    rows.push(row)
    writeJson(boardsFile, boards)
    writeJson(rowsFile, rows)

    // Aklımda'da TMDB önerisi olarak duruyorsa artık bu arşiv kaydına bağlı (notu korunur)
    const akl = readAklimda(profileId)
    const aklKey = `tmdb:${mediaType}:${tmdbId}`
    if (akl.items[aklKey]) {
      const { tmdb: _t, ...rest } = akl.items[aklKey]
      akl.items[row.id] = { ...rest, boardId }
      delete akl.items[aklKey]
      writeJson(profileAklimdaFile(profileId), akl)
    }

    const fill = await fillRowFromTmdb(profileId, boardId, row.id, { exclude, forced: { tmdbId, mediaType } })
    return { status: 200, json: { ok: true, rowId: row.id, title: card.title, filled: fill.status === 200 } }
  }
}
