// Arka plan işleri: izleme listesi takibi, biten diziler, kişi takibi, haftalık özet.
import path from 'node:path'
import { ensureStatusOption, resolveRole, resolveStatusOption, showEnded, watchedStatusIds } from '../roles.js'
import { pushNotification } from '../notifications.js'
import { langDate, serverRegion, stt, tmdbLang } from '../lang.js'
import { PROFILES_DIR, loadBoardAndRows, localDay, localToday, makeId, mapLimit, profileBoardsFile, profileDir, profileHomeSettingsFile, profileRowsFile, profileTmdbFile, profileWatchedFile, readJson, readProfileApiKey, readProfiles, writeJson } from '../storage.js'
import { buildArchiveIndex, getTvStatus, saveShowInfo, tmdbGet, toCard } from '../tmdb.js'
import { followFile } from '../routes/collection.js'

// Kullanıcı: "yeni sezon çıkınca İzleniyor'a alsın" ve "haber versin". İzlendi durumundaki dizilere
// bakılır: sonradan yeni bölüm yayınlandıysa durum İzleniyor olur + bildirim; yeni sezonun tarihi
// açıklandıysa (henüz çıkmadıysa) sadece bir kez duyuru bildirimi.
export const finishedCheckAt = new Map()
export const FINISHED_CHECK_MS = 6 * 60 * 60 * 1000
export async function checkFinishedSeries(profileId, boardId, apiKey) {
  const k = `${profileId}:${boardId}`
  if (Date.now() - (finishedCheckAt.get(k) ?? 0) < FINISHED_CHECK_MS) return
  finishedCheckAt.set(k, Date.now())
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return
  const { board } = loaded
  const durumProp = resolveRole(board, 'durum')
  const done = watchedStatusIds(board)
  const izleniyor = resolveStatusOption(board, 'izleniyor')
  const sezonFinali = resolveStatusOption(board, 'sezonFinali')
  const dateProp = resolveRole(board, 'izlemeTarihi')
  if (!durumProp || !done.size || !izleniyor) return
  const refs = readJson(profileTmdbFile(profileId), {})
  const watched = readJson(profileWatchedFile(profileId), {})
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  const today = localToday()
  for (const row of loaded.rows.filter((r) => done.has(r.values[durumProp.id]))) {
    const ref = refs[row.id]
    if (!ref || ref.mediaType !== 'tv') continue
    const st = await getTvStatus(ref.id, apiKey)
    if (!st) continue
    saveShowInfo(profileId, row.id, st)
    const title = String((tp && row.values[tp.id]) || stt('Dizi'))
    // En son ne zaman izledin: bölüm işaretleri ya da izleme tarihi
    const seen = watched[row.id] ?? {}
    const dv = dateProp ? row.values[dateProp.id] : null
    // Bölüm işaretleri de aynı süzgeçten geçer — eskiden süzgeç sadece izleme tarihine uygulanıyordu; bir bölümde
    // "?" olunca o en büyük tarih sayılıyor ve diziye yeni bölüm gelse de hiç İzleniyor'a alınmıyordu.
    const dates = [...Object.values(seen).flat(), ...(Array.isArray(dv) ? dv : dv ? [dv] : [])]
      .filter(Boolean)
      .map((x) => String(x).split('/').pop())
      // "Sadece yıl" (2019) yılın sonu sayılır; "Hatırlamıyorum" (?) hesaba katılmaz.
      .map((d) => (/^\d{4}$/.test(d) ? `${d}-12-31` : d))
      .filter((d) => /^\d{4}-/.test(d))
      .sort()
    // Ne izleme tarihi ne bölüm işareti varsa (ör. Notion'dan "Bitti" diye aktarılmış dizi) ölçü, kaydın ARGUS'a
    // eklendiği gün — yoksa yıllar önce çıkmış son bölüm "yeni" sayılıp dizi İzleniyor'a alınıyordu (yeni kullanıcı
    // denemesinde Game of Thrones, Sherlock… hepsi böyle oldu).
    const added = row.createdAt ? new Date(row.createdAt) : null
    const addedDay = added ? `${added.getFullYear()}-${String(added.getMonth() + 1).padStart(2, '0')}-${String(added.getDate()).padStart(2, '0')}` : ''
    const lastWatch = dates[dates.length - 1] ?? addedDay
    const lastKey = st.last ? `${st.last.season}-${st.last.episode}` : ''
    const newAired = st.last && st.last.airDate && st.last.airDate <= today && !(seen[lastKey]?.length > 0) && (!lastWatch || st.last.airDate > lastWatch)
    if (newAired) {
      const rowsFile = profileRowsFile(profileId, boardId)
      const rows = readJson(rowsFile, [])
      const r = rows.find((x) => x.id === row.id)
      if (r && done.has(r.values[durumProp.id])) {
        r.values = { ...r.values, [durumProp.id]: izleniyor }
        r.updatedAt = Date.now()
        writeJson(rowsFile, rows)
        pushNotification(profileId, {
          key: `new:${row.id}:${lastKey}`,
          type: 'newSeason',
          boardId,
          rowId: row.id,
          title,
          text: stt('Yeni bölüm çıktı (S{0}B{1}, {2}) — durumu İzleniyor\'a alındı.', st.last.season, st.last.episode, langDate(st.last.airDate)),
        })
      }
      continue
    }
    // Sezon Finali'ndeki dizi TMDB'de bitti/iptal edildi olarak işaretlendiyse Final olur (v1.24)
    if (sezonFinali && row.values[durumProp.id] === sezonFinali && showEnded(st.status)) {
      const rowsFile = profileRowsFile(profileId, boardId)
      const rows = readJson(rowsFile, [])
      const r = rows.find((x) => x.id === row.id)
      const boardsNow = readJson(profileBoardsFile(profileId), [])
      const bNow = boardsNow.find((b) => b.id === boardId)
      const before = JSON.stringify(resolveRole(bNow, 'durum')?.options ?? [])
      const finalId = bNow ? ensureStatusOption(bNow, 'final', makeId) : null
      if (r && finalId && r.values[durumProp.id] === sezonFinali) {
        if (JSON.stringify(resolveRole(bNow, 'durum')?.options ?? []) !== before) writeJson(profileBoardsFile(profileId), boardsNow)
        r.values = { ...r.values, [durumProp.id]: finalId }
        r.updatedAt = Date.now()
        writeJson(rowsFile, rows)
        pushNotification(profileId, {
          key: `final:${row.id}`,
          type: 'watched',
          boardId,
          rowId: row.id,
          title,
          text: stt('Dizi bitti, yeni bölüm gelmeyecek — durumu Final yapıldı.'),
        })
      }
      continue
    }
    if (st.next && st.next.episode === 1 && st.next.airDate && st.next.airDate > today) {
      pushNotification(profileId, {
        key: `announce:${row.id}:${st.next.season}`,
        type: 'announce',
        boardId,
        rowId: row.id,
        title,
        text: stt('{0}. sezon {1}\'de başlıyor.', st.next.season, langDate(st.next.airDate)),
      })
    }
  }
}

// ---- İzleme listesi takibi ------------------------------------------------------------------------
// Kullanıcı şunları istedi: (1) İzlenecek bir içerik bir platforma (Netflix, Disney+…) gelince haber versin,
// (2) ileri tarihli vizyon tarihleri kendiliğinden güncellensin (ertelenirse haber versin), (3) arşivdeki bir
// film serisine yeni bir film eklenince haber versin. Sunucu açıkken saatte bir bakılır, her arşiv için günde bir
// tur yapılır (seriler haftada bir). Görülenler watch-state.json'da saklanır: bir şey ilk kez görüldüğünde sadece
// kaydedilir, sonraki turlarda DEĞİŞEN şey bildirilir (yoksa ilk açılışta yüzlerce bildirim düşerdi).
export function profileWatchStateFile(profileId) {
  return path.join(profileDir(profileId), 'watch-state.json')
}
export const WATCHLIST_CHECK_MS = 20 * 3600e3
export const COLLECTION_CHECK_MS = 6 * 24 * 3600e3
export const watchlistRunning = new Set()



export async function checkWatchlist(profileId, boardId, apiKey, force = false) {
  const k = `${profileId}:${boardId}`
  if (watchlistRunning.has(k)) return
  const stateFile = profileWatchStateFile(profileId)
  const bs = readJson(stateFile, {})[boardId] ?? {}
  if (!force && Date.now() - (bs.at ?? 0) < WATCHLIST_CHECK_MS) return
  watchlistRunning.add(k)
  try {
    const loaded = loadBoardAndRows(profileId, boardId)
    if (!loaded) return
    const { board, rows } = loaded
    const durumProp = resolveRole(board, 'durum')
    const done = watchedStatusIds(board)
    const vizyonProp = resolveRole(board, 'vizyon')
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    const titleOf = (r) => String((tp && r.values[tp.id]) || stt('İsimsiz'))
    const refs = readJson(profileTmdbFile(profileId), {})
    const home = readJson(profileHomeSettingsFile(profileId), {})
    const mine = new Set(Array.isArray(home.myPlatforms) ? home.myPlatforms : [])
    const region = serverRegion()
    const today = localDay()
    const providers = bs.providers ?? {}
    const dateChanges = []
    // Platformdan kalkınca da haber (v1.26, Y3): aboneliklerinden birinden kalkan, henüz izlenmemiş yapım için. TMDB'nin
    // platform bilgisi bazen bir günlüğüne boş gelebiliyor — yanlış alarm olmasın diye iki tur üst üste yoksa bildirilir.
    const leaveOn = home?.extras?.platformLeave !== false && mine.size > 0
    let providerNames = null
    const nameOf = async (pid, known) => {
      if (known) return known
      if (!providerNames) {
        try {
          const { platformList } = await import('../routes/tmdb.js')
          providerNames = new Map((await platformList(apiKey)).all.map((p) => [p.id, p.name]))
        } catch {
          providerNames = new Map()
        }
      }
      return providerNames.get(pid) ?? ''
    }

    // 1 + 2: henüz izlenmemiş (İzlenecek, Yarım, İzleniyor, boş) ve TMDB'ye bağlı kayıtlar — tek istekte hem
    // içeriğin bilgisi (vizyon tarihi) hem platformları
    const open = rows.filter((r) => refs[r.id]?.id && (!durumProp || !done.has(r.values[durumProp.id])))
    const live = new Set(open.map((r) => r.id))
    for (const id of Object.keys(providers)) if (!live.has(id)) delete providers[id]
    await mapLimit(open, 4, async (row) => {
      const ref = refs[row.id]
      const d = await tmdbGet(`/${ref.mediaType}/${ref.id}`, { language: tmdbLang(), append_to_response: 'watch/providers' }, apiKey)
      if (!d) return
      const flat = d['watch/providers']?.results?.[region]?.flatrate ?? []
      const before = providers[row.id]
      if (before) {
        for (const p of flat) {
          if (before.ids.includes(p.provider_id) || (mine.size > 0 && !mine.has(p.provider_id))) continue
          pushNotification(profileId, {
            key: `platform:${row.id}:${p.provider_id}`,
            type: 'platform',
            boardId,
            rowId: row.id,
            title: titleOf(row),
            text: stt('Artık şu platformda izlenebilir: {0}.', p.provider_name),
          })
        }
      }
      const names = { ...(before?.names ?? {}) }
      for (const p of flat) names[p.provider_id] = p.provider_name
      const ids = flat.map((p) => p.provider_id)
      const gone = {}
      if (before && leaveOn) {
        const nowIds = new Set(ids)
        for (const pid of before.ids) {
          if (nowIds.has(pid) || !mine.has(pid)) continue
          const n = (before.gone?.[pid] ?? 0) + 1
          if (n < 2) {
            // ilk turda yok: bir tur daha beklenir (listede kalır, geri gelirse "geldi" diye bildirilmez)
            gone[pid] = n
            ids.push(pid)
            continue
          }
          const pname = await nameOf(pid, names[pid])
          pushNotification(profileId, {
            key: `leave:${row.id}:${pid}`,
            type: 'platformLeave',
            boardId,
            rowId: row.id,
            title: titleOf(row),
            text: pname ? stt('Artık {0} platformunda yok.', pname) : stt('Aboneliklerinden birinden kalktı.'),
          })
        }
      }
      providers[row.id] = { ids, names, at: Date.now(), ...(Object.keys(gone).length ? { gone } : {}) }
      const tmdbDate = ref.mediaType === 'tv' ? d.first_air_date : d.release_date
      const cur = vizyonProp ? row.values[vizyonProp.id] : null
      const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
      if (vizyonProp && isDay(cur) && cur > today && isDay(tmdbDate) && tmdbDate !== cur) dateChanges.push({ rowId: row.id, from: cur, to: tmdbDate })
    })

    if (dateChanges.length) {
      const rowsFile = profileRowsFile(profileId, boardId)
      const fresh = readJson(rowsFile, [])
      for (const c of dateChanges) {
        const r = fresh.find((x) => x.id === c.rowId)
        if (!r || r.values[vizyonProp.id] !== c.from) continue
        r.values = { ...r.values, [vizyonProp.id]: c.to }
        r.updatedAt = Date.now()
        pushNotification(profileId, {
          key: `vizyon:${r.id}:${c.to}`,
          type: 'announce',
          boardId,
          rowId: r.id,
          title: titleOf(r),
          text:
            c.to > c.from
              ? stt('Vizyon tarihi ertelendi: {0} → {1}.', langDate(c.from), langDate(c.to))
              : stt('Vizyon tarihi öne alındı: {0} → {1}.', langDate(c.from), langDate(c.to)),
        })
      }
      writeJson(rowsFile, fresh)
    }

    // 3: film serileri. Serisi henüz bilinmeyen filmlerin serisi her turda en fazla 80 tane öğrenilir.
    const movieRows = rows.filter((r) => refs[r.id]?.mediaType === 'movie')
    const learned = {}
    await mapLimit(
      movieRows.filter((r) => refs[r.id].collection === undefined).slice(0, 80),
      4,
      async (row) => {
        const d = await tmdbGet(`/movie/${refs[row.id].id}`, { language: tmdbLang() }, apiKey)
        if (!d) return
        const c = d.belongs_to_collection
        learned[row.id] = c ? { id: c.id, name: c.name } : null
      },
    )
    if (Object.keys(learned).length) {
      const fr = readJson(profileTmdbFile(profileId), {})
      for (const [id, c] of Object.entries(learned)) {
        if (fr[id]) fr[id] = { ...fr[id], collection: c }
        refs[id] = { ...refs[id], collection: c }
      }
      writeJson(profileTmdbFile(profileId), fr)
    }
    let collections = bs.collections ?? {}
    let collectionsAt = bs.collectionsAt ?? 0
    if (force || Date.now() - collectionsAt > COLLECTION_CHECK_MS) {
      const byCol = new Map()
      for (const r of movieRows) {
        const c = refs[r.id]?.collection
        if (c?.id && !byCol.has(c.id)) byCol.set(c.id, { name: c.name, rowId: r.id })
      }
      const index = buildArchiveIndex(profileId, board, rows)
      const next = {}
      await mapLimit([...byCol.entries()], 4, async ([colId, info]) => {
        const d = await tmdbGet(`/collection/${colId}`, { language: tmdbLang() }, apiKey)
        if (!d) {
          if (collections[colId]) next[colId] = collections[colId]
          return
        }
        const prev = collections[colId]
        if (prev) {
          for (const part of d.parts ?? []) {
            if (prev.includes(part.id)) continue
            const card = toCard(part, 'movie')
            if (index.has(card)) continue
            pushNotification(profileId, {
              key: `collection:${colId}:${part.id}`,
              type: 'collection',
              boardId,
              rowId: info.rowId,
              title: stt('{0} serisi', String(d.name || info.name).replace(/\s*\[seri\]\s*/i, '').replace(/\s+(serisi|koleksiyonu|collection)$/i, '').trim()),
              text: part.release_date
                ? stt('Seriye yeni bir film eklendi: {0} ({1}).', card.title, langDate(part.release_date))
                : stt('Seriye yeni bir film eklendi: {0}.', card.title),
            })
          }
        }
        next[colId] = (d.parts ?? []).map((x) => x.id)
      })
      collections = next
      collectionsAt = Date.now()
    }

    const all = readJson(stateFile, {})
    all[boardId] = { at: Date.now(), providers, collections, collectionsAt }
    writeJson(stateFile, all)
  } finally {
    watchlistRunning.delete(k)
  }
}

// Günde bir: takip edilen kişilerin önümüzdeki 120 gün içinde çıkacak (ya da son 7 günde çıkmış) yapımları
export async function checkFollows(profileId, apiKey) {
  const home = readJson(profileHomeSettingsFile(profileId), {})
  if (!home?.extras?.follow) return
  const follows = readJson(followFile(profileId), {})
  const ids = Object.keys(follows)
  if (!ids.length) return
  const stFile = path.join(PROFILES_DIR, profileId, 'takip-durum.json')
  const st = readJson(stFile, {})
  if (Date.now() - (st.at ?? 0) < 20 * 3600e3) return
  st.at = Date.now()
  writeJson(stFile, st)
  const today = new Date()
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayStr = ymd(today)
  const from = ymd(new Date(today.getTime() - 7 * 864e5))
  const to = ymd(new Date(today.getTime() + 120 * 864e5))
  for (const pid of ids) {
    const f = follows[pid]
    const cr = await tmdbGet(`/person/${pid}/combined_credits`, { language: tmdbLang() }, apiKey)
    if (!cr) continue
    const list = f.role === 'directing' ? (cr.crew ?? []).filter((c) => c.job === 'Director') : (cr.cast ?? []).filter((c) => (c.order ?? 99) < 8)
    for (const c of list) {
      const date = (c.media_type === 'tv' ? c.first_air_date : c.release_date) || ''
      if (!date || date < from || date > to) continue
      const title = c.title || c.name || ''
      const soon = date > todayStr
      pushNotification(profileId, {
        key: `takip:${pid}:${c.media_type}:${c.id}`,
        type: 'follow',
        title: f.role === 'directing' ? stt('{0} yönetmeninin yeni yapımı', f.name) : stt('{0} yeni bir yapımda', f.name),
        text: soon ? stt('"{0}" {1} tarihinde çıkıyor.', title, date.split('-').reverse().join('.')) : stt('"{0}" çıktı.', title),
        link: '/takvim?ay=' + date.slice(0, 7),
      })
    }
  }
}

// Ekstralar › Haftalık özet (v1.23.4): Pazar 18:00'den sonra bir kez, haftanın (Pzt–Paz) özeti zile ve Windows bildirimine
export function checkWeekly(profileId) {
  try {
    const now = new Date()
    if (now.getDay() !== 0 || now.getHours() < 18) return
    const home = readJson(profileHomeSettingsFile(profileId), {})
    if (!home?.extras?.weekly || !home.boardId) return
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const sunday = ymd(now)
    const mon = new Date(now)
    mon.setDate(mon.getDate() - 6)
    const from = ymd(mon)
    const loaded = loadBoardAndRows(profileId, home.boardId)
    if (!loaded) return
    const { board, rows } = loaded
    const dateProp = resolveRole(board, 'izlemeTarihi')
    const kategori = resolveRole(board, 'kategori')
    const sure = resolveRole(board, 'sure')
    const puan = resolveRole(board, 'puan')
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    const isSeries = (r) => /dizi|series|tv/i.test(kategori?.options?.find((o) => o.id === r.values?.[kategori.id])?.label ?? '')
    const perDay = Array(7).fill(0)
    const dayIdx = (d) => Math.round((new Date(d + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5)
    let films = 0
    let minutes = 0
    let fav = null
    for (const r of rows) {
      const v = dateProp ? r.values?.[dateProp.id] : null
      const dates = (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).map((x) => String(x).split('/').sort().pop().slice(0, 10))
      const hit = dates.filter((d) => d >= from && d <= sunday)
      if (!hit.length || isSeries(r)) continue
      films++
      minutes += sure && typeof r.values[sure.id] === 'number' ? r.values[sure.id] : 0
      for (const d of hit) perDay[dayIdx(d)]++
      const s = puan ? r.values?.[puan.id] : null
      const avg = s && typeof s === 'object' ? Object.values(s).filter((n) => typeof n === 'number') : []
      const a = avg.length ? avg.reduce((x, y) => x + y, 0) / avg.length : null
      if (a !== null && (!fav || a > fav.a)) fav = { a, t: tp ? String(r.values?.[tp.id] ?? '') : '' }
    }
    let eps = 0
    for (const m of Object.values(readJson(profileWatchedFile(profileId), {})))
      for (const list of Object.values(m ?? {}))
        for (const d of Array.isArray(list) ? list : []) {
          const k = String(d).slice(0, 10)
          if (k >= from && k <= sunday) {
            eps++
            perDay[dayIdx(k)]++
          }
        }
    if (!films && !eps) return
    minutes += eps * 45
    const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
    const busiest = perDay.indexOf(Math.max(...perDay))
    pushNotification(profileId, {
      key: 'haftalik:' + sunday,
      type: 'weekly',
      title: stt('Haftan böyle geçti'),
      text: stt('{0} film, {1} bölüm, yaklaşık {2} saat. En çok {3} izledin.', films, eps, Math.round(minutes / 60), stt(days[busiest])) + (fav ? ' ' + stt('Haftanın favorisi: {0} ({1}).', fav.t, fav.a.toFixed(1)) : ''),
      link: '/takvim',
    })
  } catch (e) {
    console.error('haftalık özet hata:', e)
  }
}

// Sunucu açıkken saatte bir: her profilin ana sayfa arşivi (yoksa ilk arşivi) için takip turu (günde birden
// fazla çalışmaz, bkz. WATCHLIST_CHECK_MS). İlki açılıştan 1 dakika sonra — açılışı yavaşlatmasın.
export function watchlistTick() {
  let ids = []
  try {
    ids = readProfiles().map((p) => p.id)
  } catch {
    return
  }
  for (const profileId of ids) {
    try {
      watchlistTickOne(profileId)
    } catch (e) {
      console.error('takip hata:', e)
    }
  }
}
export function watchlistTickOne(profileId) {
  {
    const apiKey = readProfileApiKey(profileId)
    if (!apiKey) return
    const home = readJson(profileHomeSettingsFile(profileId), {})
    const boards = readJson(profileBoardsFile(profileId), [])
    const boardId = boards.some((b) => b.id === home.boardId) ? home.boardId : boards[0]?.id
    if (boardId) checkWatchlist(profileId, boardId, apiKey).catch((e) => console.error('takip hata:', e))
    checkFollows(profileId, apiKey).catch((e) => console.error('kişi takibi hata:', e))
    checkWeekly(profileId)
  }
}
