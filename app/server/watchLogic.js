// İzleme kuralları: bölüm işaretleme sonrası otomatik durum, puan sorma, izleme saati, son izlenenler.
import fs from 'node:fs'
import path from 'node:path'
import { isWatchedStatus, resolveRole, resolveStatusOption, seriesDoneStatus, showEnded } from './roles.js'
import { findBoard as findBoardCached } from './history.js'
import { pushNotification } from './notifications.js'
import { langDate, stt } from './lang.js'
import { localDay, localToday, makeId, profileBoardsFile, profileDir, profileEpisodesFile, profileRowsFile, profileTmdbFile, profileWatchedFile, readJson, readJsonShared, writeJson } from './storage.js'

// Kullanıcı "ileri tarihli bir içerik eklendiğinde otomatik olarak İzlenecek yapabilir" dedi: Durum'u boş bir
// kaydın Vizyon Tarihi bugünden sonraysa (henüz çıkmamış) Durum kendiliğinden İzlenecek olur. Kullanıcının
// seçtiği bir durum hiç değiştirilmez. Yeni kayıtta, TMDB'den doldurmada ve vizyon tarihi elle girilince çalışır.
export function planIfUpcoming(board, row, before = null) {
  if (!board || !row?.values) return false
  const durumProp = resolveRole(board, 'durum')
  const vizyonProp = resolveRole(board, 'vizyon')
  const izlenecek = resolveStatusOption(board, 'izlenecek')
  if (!durumProp || !vizyonProp || !izlenecek || row.values[durumProp.id]) return false
  const v = row.values[vizyonProp.id]
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v) || v.slice(0, 10) <= localDay()) return false
  if (before && before.values?.[vizyonProp.id] === v) return false
  row.values = { ...row.values, [durumProp.id]: izlenecek }
  return true
}

// Puan hatırlatması: kullanıcı "izledikten sonra puan sorsun" dedi. Bir kayıt İzlendi olduysa ve puanı
// boşsa arayüze bir başlıkla (X-Argus-Ask-Rating) haber verilir, arayüz küçük bir puan penceresi açar.
export function shouldAskRating(profileId, boardId, before, after) {
  const board = findBoardCached(profileId, boardId)
  if (!board) return false
  const durumProp = resolveRole(board, 'durum')
  const puanProp = resolveRole(board, 'puan')
  if (!durumProp || !puanProp) return false
  if (!isWatchedStatus(board, after?.values?.[durumProp.id])) return false
  if (before && isWatchedStatus(board, before.values?.[durumProp.id])) return false
  const score = after.values?.[puanProp.id]
  return !(score && typeof score === 'object' && Object.keys(score).length > 0)
}
export function setAskRating(res, boardId, rowId) {
  res.setHeader('X-Argus-Ask-Rating', encodeURIComponent(JSON.stringify({ boardId, rowId })))
  res.setHeader('Access-Control-Expose-Headers', 'X-Argus-Ask-Rating')
}

// Kullanıcı "Mehmed: Fetihler Sultanı'na Nook'tan bölüm ekledim, takvimde var ama detay penceresinde
// tarih yok; bir yerde 1 2 3 4. bölüm diyor bir yerde 84 85 86" dedi: Nook YouTube/tabii başlığındaki
// baştan sayılmış numarayı ("87. Bölüm") olduğu gibi "4-87" diye yazmıştı. Listede olmayan bir bölüm,
// numarası önceki sezonların toplamından büyükse baştan sayılmış kabul edilip doğru sezon/bölüme çevrilir
// (87 → 4. sezon 4. bölüm). Henüz TMDB'ye girmemiş yeni bir bölüm ("4-8") küçük numaralı olduğundan dokunulmaz.
export function fixAbsoluteEpisodes(profileId, rowId, body) {
  const seasons = (readJsonShared(profileEpisodesFile(profileId), {})[rowId] ?? [])
    .filter((s) => s.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
  if (!seasons.length || !body || typeof body !== 'object') return body
  const known = new Set(seasons.flatMap((s) => (s.episodes ?? []).map((e) => `${s.seasonNumber}-${e.episodeNumber}`)))
  const out = {}
  for (const [k, ds] of Object.entries(body)) {
    let key = k
    const m = /^(\d+)-(\d+)$/.exec(k)
    if (m && !known.has(k)) {
      const sn = Number(m[1])
      let n = Number(m[2])
      const offset = seasons.filter((s) => s.seasonNumber < sn).reduce((t, s) => t + (s.episodes?.length ?? 0), 0)
      if (offset > 0 && n > offset) {
        key = `${sn}-${n - offset}`
        for (const s of seasons) {
          const c = s.episodes?.length ?? 0
          if (n <= c) {
            if (s.seasonNumber >= sn) key = `${s.seasonNumber}-${s.episodes[n - 1].episodeNumber}`
            break
          }
          n -= c
        }
      }
    }
    out[key] = Array.isArray(out[key]) && Array.isArray(ds) ? [...new Set([...out[key], ...ds])].sort() : ds
  }
  return out
}

export function saveWatched(req, res, makeBody) {
  const r = applyWatched(req.params.profileId, req.params.rowId, makeBody)
  if (r.askRating) setAskRating(res, r.askRating.boardId, r.askRating.rowId)
  res.json({ ok: true, autoWatched: r.autoWatched, autoWatching: r.autoWatching })
}

// Bir dizinin bölüm tarihlerini değiştirir (makeBody: eski hâl → yeni hâl) ve ardından gelen her şeyi yapar:
// otomatik durum (İzlendi / İzleniyor), son izlenenler, izleme saati. Evrenler'deki "sezonu izledim" de bunu kullanıyor.
export function applyWatched(profileId, rowId, makeBody) {
  const file = profileWatchedFile(profileId)
  const all = readJson(file, {})
  const before = all[rowId] ?? {}
  const body = fixAbsoluteEpisodes(profileId, rowId, makeBody(before))
  all[rowId] = body
  writeJson(file, all)
  try {
    const today = localToday()
    const n = Object.entries(body ?? {}).filter(([k, ds]) => Array.isArray(ds) && ds.includes(today) && !(before[k] ?? []).includes(today)).length
    if (n) appendWatchTime(profileId, { rowId, kind: 'ep', n })
    const added = Object.entries(body ?? {}).some(([k, ds]) => Array.isArray(ds) && ds.some((d) => !(before[k] ?? []).includes(d)))
    if (added) touchRecentWatch(profileId, rowId)
  } catch {
    /* saat kaydı önemsiz */
  }
  let autoWatched = null
  let autoWatching = null
  try {
    autoWatched = autoMarkSeriesWatched(profileId, rowId, body ?? {})
    if (!autoWatched) autoWatching = autoUnmarkSeriesWatched(profileId, rowId, before, body ?? {})
    if (!autoWatched && !autoWatching) autoWatching = autoStartWatching(profileId, rowId, before, body ?? {})
  } catch (e) {
    console.error('otomatik durum hata:', e)
  }
  let askRating = null
  if (autoWatched) {
    const rows = readJsonShared(profileRowsFile(profileId, autoWatched.boardId), [])
    const row = rows.find((r) => r.id === rowId)
    if (row && shouldAskRating(profileId, autoWatched.boardId, null, row)) askRating = { boardId: autoWatched.boardId, rowId: row.id }
  }
  return { body, autoWatched, autoWatching, askRating }
}
// Bir kaydın hangi arşivde olduğu (önbellekteki dondurulmuş kopyalardan — dosyalar değişmediyse yeniden okunmaz).
// Bölüm işaretleyince çalışan otomatik durum kuralları eskiden her biri bütün arşivleri ve kayıtları baştan okuyordu.
export function rowBoardId(profileId, rowId) {
  for (const b of readJsonShared(profileBoardsFile(profileId), [])) {
    if (readJsonShared(profileRowsFile(profileId, b.id), []).some((r) => r.id === rowId)) return b.id
  }
  return null
}
function boardsWithRow(profileId, rowId) {
  const id = rowBoardId(profileId, rowId)
  const b = id ? readJsonShared(profileBoardsFile(profileId), []).find((x) => x.id === id) : null
  return b ? [b] : []
}


// Yayınlanmış bölümlerin anahtarları (episodes.json'a göre) — yoksa null.
export function airedEpisodeKeys(profileId, rowId) {
  const seasons = readJsonShared(profileEpisodesFile(profileId), {})[rowId]
  if (!Array.isArray(seasons) || seasons.length === 0) return null
  const today = localToday()
  const aired = []
  for (const s of seasons) {
    if (!(s.seasonNumber >= 1)) continue
    for (const e of s.episodes ?? []) if (e.airDate && e.airDate <= today) aired.push(`${s.seasonNumber}-${e.episodeNumber}`)
  }
  return aired.length ? aired : null
}

// Tersi: kullanıcı "son bölümün izleme tarihini kaldırdım, durumu İzleniyor yapsın" dedi. Bütün
// bölümleri işaretliyken (tamamlanmışken) bir bölümün işareti kaldırılırsa ve durum İzlendi ise
// İzleniyor'a alınır. İzleme tarihine dokunulmaz (o gün gerçekten izlemiş olabilir).
export function autoUnmarkSeriesWatched(profileId, rowId, before, after) {
  const aired = airedEpisodeKeys(profileId, rowId)
  if (!aired) return null
  const complete = (seen) => aired.every((k) => seen?.[k]?.length > 0)
  if (!complete(before) || complete(after)) return null
  for (const board of boardsWithRow(profileId, rowId)) {
    const rowsFile = profileRowsFile(profileId, board.id)
    const rows = readJson(rowsFile, [])
    const row = rows.find((r) => r.id === rowId)
    if (!row) continue
    const durumProp = resolveRole(board, 'durum')
    const izleniyor = resolveStatusOption(board, 'izleniyor')
    if (!durumProp || !izleniyor || !isWatchedStatus(board, row.values[durumProp.id])) return null
    row.values = { ...row.values, [durumProp.id]: izleniyor }
    row.updatedAt = Date.now()
    writeJson(rowsFile, rows)
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    const title = String((tp && row.values[tp.id]) || stt('Dizi'))
    pushNotification(profileId, {
      type: 'newSeason',
      boardId: board.id,
      rowId,
      title,
      text: stt('Bir bölümün işaretini kaldırdın, artık bütün bölümler izlenmiş değil — durumu İzleniyor\'a alındı.'),
    })
    return { title, boardId: board.id }
  }
  return null
}

// Kullanıcı "Avatar: Seven Havens'a Nook'tan izleme tarihi girdim, İzleniyor'a çekmedi" dedi: bir
// bölüme yeni izleme tarihi girilince durum İzlendi/İzleniyor değilse (boş, İzlenecek, Yarım…) İzleniyor yapılır. Sadece
// yeni tarih son 14 gün içindeyse — geçmişe dönük eski bir tarih girmek (ör. Yarım bırakılmış Dark'a
// 2021'deki bölümü yazmak) durumu değiştirmesin. Bu kural sunucuda — ARGUS'un detay penceresi de Nook da
// aynı yoldan geçer.
export function autoStartWatching(profileId, rowId, before, after) {
  const cut = new Date()
  cut.setDate(cut.getDate() - 14)
  const recent = localDay(cut)
  // Sadece gerçek gün sayılır: "?" (hatırlamıyorum) yazı olarak her tarihten "büyük" çıktığı için eskiden
  // yeni izleme sanılıyor, eski bir bölüme "?" girince dizi İzleniyor'a alınıyordu.
  const added = Object.entries(after).some(([k, ds]) => Array.isArray(ds) && ds.some((d) => !(before[k] ?? []).includes(d) && /^\d{4}-\d{2}-\d{2}/.test(String(d)) && String(d) >= recent))
  if (!added) return null
  for (const board of boardsWithRow(profileId, rowId)) {
    const rowsFile = profileRowsFile(profileId, board.id)
    const rows = readJson(rowsFile, [])
    const row = rows.find((r) => r.id === rowId)
    if (!row) continue
    const durumProp = resolveRole(board, 'durum')
    const izleniyor = resolveStatusOption(board, 'izleniyor')
    const cur = durumProp ? row.values[durumProp.id] : null
    if (!durumProp || !izleniyor || cur === izleniyor || isWatchedStatus(board, cur)) return null
    row.values = { ...row.values, [durumProp.id]: izleniyor }
    row.updatedAt = Date.now()
    writeJson(rowsFile, rows)
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    return { title: String((tp && row.values[tp.id]) || stt('Dizi')), boardId: board.id }
  }
  return null
}


// Kullanıcı "dizinin çıkmış bölümlerinin hepsine izleme tarihi girdim, durumu İzlendi'ye çeksin"
// dedi: bir dizinin YAYINLANMIŞ bütün bölümleri işaretlenince Durum kendiliğinden İzlendi olur,
// son izlenen bölümün tarihi İzleme Tarihi'ne eklenir ve bildirim düşer.
export function autoMarkSeriesWatched(profileId, rowId, seen) {
  const seasons = readJsonShared(profileEpisodesFile(profileId), {})[rowId]
  if (!Array.isArray(seasons) || seasons.length === 0) return null
  const today = localToday()
  const aired = []
  for (const s of seasons) {
    if (!(s.seasonNumber >= 1)) continue
    for (const e of s.episodes ?? []) if (e.airDate && e.airDate <= today) aired.push(`${s.seasonNumber}-${e.episodeNumber}`)
  }
  if (aired.length === 0 || !aired.every((k) => seen[k]?.length > 0)) return null
  // Sezon ortasındaysa (yayınlanmış bölümü olan bir sezonda henüz çıkmamış ya da tarihi belli olmayan bölüm
  // varsa) İzlendi yapma — kullanıcı "Lanterns'ün 7. bölümünü girdim, İzlendi yaptı ama bir bölüm daha var"
  // dedi. Sadece ilerideki yeni bir sezon açıklanmışsa (hiç bölümü çıkmamış sezon) eskisi gibi İzlendi olur.
  const midSeason = seasons.some(
    (s) => s.seasonNumber >= 1 && (s.episodes ?? []).some((e) => e.airDate && e.airDate <= today) && (s.episodes ?? []).some((e) => !e.airDate || e.airDate > today),
  )
  const lastAiredSeason = Math.max(...aired.map((k) => Number(k.split('-')[0])))
  const next = readJsonShared(profileTmdbFile(profileId), {})[rowId]?.show?.next
  const nextInSameSeason = next && next.season === lastAiredSeason && (!next.airDate || next.airDate > today)
  if (midSeason || nextInSameSeason) return null
  const boards = readJson(profileBoardsFile(profileId), [])
  const inBoard = rowBoardId(profileId, rowId)
  for (const board of boards.filter((b) => b.id === inBoard)) {
    const rowsFile = profileRowsFile(profileId, board.id)
    const rows = readJson(rowsFile, [])
    const row = rows.find((r) => r.id === rowId)
    if (!row) continue
    const durumProp = resolveRole(board, 'durum')
    if (!durumProp) return null
    // v1.24: dizi bittiyse Final, sürüyorsa Sezon Finali (seçenek yoksa açılır). Zaten izlenmiş sayılan bir
    // durumdaysa (İzlendi / Sezon Finali / Final) dokunulmaz — Sezon Finali → Final geçişi checkFinishedSeries'te.
    if (isWatchedStatus(board, row.values[durumProp.id])) return null
    const show0 = readJsonShared(profileTmdbFile(profileId), {})[rowId]?.show
    const optsBefore = JSON.stringify(durumProp.options ?? [])
    const doneId = seriesDoneStatus(board, showEnded(show0?.status), makeId)
    if (!doneId) return null
    if (JSON.stringify(durumProp.options ?? []) !== optsBefore) writeJson(profileBoardsFile(profileId), boards)
    row.values = { ...row.values, [durumProp.id]: doneId }
    const doneLabel = durumProp.options?.find((o) => o.id === doneId)?.label ?? stt('İzlendi')
    const dateProp = resolveRole(board, 'izlemeTarihi')
    // Yaklaşık tarihler ("2019", "?") gerçek günlerin önüne geçmesin: "?" sıralamada en sona düştüğü için
    // izleme tarihine "2026-11-01/?" gibi bozuk bir aralık yazılıyordu. Gerçek gün varsa sadece onlara bakılır.
    const rawDates = Object.values(seen).flat().filter(Boolean).map(String).sort()
    const realDates = rawDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    const yearDates = rawDates.filter((d) => /^\d{4}$/.test(d))
    const allDates = realDates.length ? realDates : yearDates.length ? yearDates : rawDates
    const lastDate = allDates[allDates.length - 1]
    if (dateProp && lastDate) {
      const v = row.values[dateProp.id]
      if (dateProp.type === 'multidate') {
        const list = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []
        // Kullanıcı: "en son yazdığım tarihi izleme tarihi yapıyorsun ama başlama tarihim çok daha önce" —
        // izleme tarihi, bu izlemeye ait ilk bölümün gününden son bölümün gününe bir aralık olarak yazılır.
        // Bu izlemenin başı: bir önceki izleme tarihinin bitişinden sonraki ilk bölüm günü.
        const prevEnd = list.map((x) => String(x).split('/').pop()).filter((d) => d < lastDate).sort().pop() ?? ''
        const start = allDates.find((d) => d > prevEnd) ?? lastDate
        const entry = start < lastDate ? `${start}/${lastDate}` : lastDate
        const covered = list.some((x) => String(x).split('/').includes(lastDate))
        if (!covered) row.values[dateProp.id] = [...list, entry].sort()
      } else if (!v) row.values[dateProp.id] = lastDate
    }
    row.updatedAt = Date.now()
    writeJson(rowsFile, rows)
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    const title = (tp && row.values[tp.id]) || stt('Dizi')
    const tail = showEnded(show0?.status) ? stt(' Dizi bitti, yeni bölüm gelmeyecek.') : show0?.next?.airDate ? stt(' Yeni bölüm {0} tarihinde.', langDate(show0.next.airDate)) : stt(' Yeni sezon çıkınca haber vereceğim.')
    pushNotification(profileId, {
      type: 'watched',
      boardId: board.id,
      rowId,
      title: String(title),
      text: stt('Çıkmış bütün bölümleri izledin, durumu {0} yapıldı.{1}', doneLabel, tail),
    })
    return { title: String(title), boardId: board.id }
  }
  return null
}

// ---- Flashback (yıllık özet) --------------------------------------------------------------------
// İzleme saatleri: kullanıcı "en çok gece mi gündüz mü izliyorum" görmek istedi ama arşivde sadece
// tarih var. Bundan sonra bir şey BUGÜNÜN tarihiyle izlendi diye işaretlenince o anın saati
// watch-times.jsonl'a eklenir (işaretleme genelde izledikten hemen sonra yapıldığı için yaklaşık izleme saati).
export function profileWatchTimesFile(profileId) {
  return path.join(profileDir(profileId), 'watch-times.jsonl')
}
export function appendWatchTime(profileId, entry) {
  fs.appendFileSync(profileWatchTimesFile(profileId), JSON.stringify({ t: Date.now(), ...entry }) + '\n')
}
export function recordRowWatchTime(profileId, boardId, before, after) {
  const board = findBoardCached(profileId, boardId)
  const dateProp = board && resolveRole(board, 'izlemeTarihi')
  if (!dateProp) return
  const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).map(String)
  const today = localToday()
  const old = new Set(list(before?.values?.[dateProp.id]))
  const added = list(after?.values?.[dateProp.id]).filter((e) => !old.has(e))
  if (added.length) touchRecentWatch(profileId, after.id)
  if (added.some((e) => e === today || e.endsWith('/' + today))) appendWatchTime(profileId, { rowId: after.id, kind: 'row' })
}

// Son izleme verisi girilen kayıtlar (en yeni önce) — Takvim'deki "Son izlediklerin — tek tıkla seç"
// için. Kullanıcı "son verisini girdiğim gelmiyor" dedi: liste izleme tarihine göre sıralanınca geçmiş bir
// tarih girilen yapım (ör. dün izlediğini bugün eklemek) listeye girmiyordu. Artık girildiği ana göre.
export function profileRecentWatchFile(profileId) {
  return path.join(profileDir(profileId), 'recent-watch.json')
}
export function touchRecentWatch(profileId, rowId) {
  const file = profileRecentWatchFile(profileId)
  const list = readJson(file, []).filter((x) => x.rowId !== rowId)
  list.unshift({ rowId, t: Date.now() })
  writeJson(file, list.slice(0, 30))
}
