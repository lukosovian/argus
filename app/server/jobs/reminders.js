// v1.26 hatırlatmaları ve zamanlı işleri: izlediğin dizinin yeni bölümü (Y2), unutulan puanlar (Y4), sabah bülteni (Y10),
// yaklaşan sinema seansı (Y26), haftalık otomatik Genel Güncelleme (Y6), uzun süredir bağlanmayan telefon (G3).
// Hepsi var olan bildirim sistemine (zil → Windows bildirimi, bkz. notifications.js ve desktop/main.cjs) düşer; her biri
// Ayarlar › Uygulama Ayarları › Zil bildirimleri'nden kapatılabilir (home-settings.json › extras.<anahtar> === false).
// Sunucu açıkken 5 dakikada bir bakılır (TMDB'ye gidenler daha seyrek); durumları profiles/<id>/hatirlatma.json'da.
import path from 'node:path'
import { resolveRole, resolveStatusOption, watchedStatusIds } from '../roles.js'
import { pushNotification } from '../notifications.js'
import { langDate, stt } from '../lang.js'
import {
  DATA_DIR,
  loadBoardAndRows,
  localDay,
  profileBoardsFile,
  profileDir,
  profileEpisodesFile,
  profileHomeSettingsFile,
  profileTmdbFile,
  profileWatchedFile,
  rawWriteJson,
  readJson,
  readJsonShared,
  readProfileApiKey,
  readProfiles,
} from '../storage.js'
import { getTvStatus, saveShowInfo } from '../tmdb.js'
import { hideForKid } from '../kid.js'
import { isBulkRunning, lastBulkJob, startBulkJob } from './bulk.js'
import { UI_PREFS_FILE } from '../routes/system.js'

const stateFile = (profileId) => path.join(profileDir(profileId), 'hatirlatma.json')
function readState(profileId) {
  const s = readJson(stateFile(profileId), {})
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {}
}
function patchState(profileId, patch) {
  try {
    rawWriteJson(stateFile(profileId), { ...readState(profileId), ...patch })
  } catch {
    /* önemsiz — bir dahaki turda yeniden denenir */
  }
}

// Zil bildirimi açık mı (varsayılan AÇIK — kullanıcı istedi; Ayarlar'dan kapatılınca extras.<k> === false)
export function extraOn(home, k) {
  return home?.extras?.[k] !== false
}

function homeBoard(profileId) {
  const home = readJsonShared(profileHomeSettingsFile(profileId), {}) ?? {}
  const boards = readJsonShared(profileBoardsFile(profileId), [])
  const boardId = Array.isArray(boards) && boards.some((b) => b.id === home.boardId) ? home.boardId : boards?.[0]?.id
  return { home, boardId }
}

const dayOf = (v) => String(v ?? '').split('/').pop().slice(0, 10)
const dates = (v) =>
  (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [])
    .map(dayOf)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
const addDays = (n, d = new Date()) => localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12))
const titleOf = (board, row) => {
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  return String((tp && row.values?.[tp.id]) || stt('İsimsiz'))
}

// ---- Y2: İzleniyor durumundaki dizinin yeni bölümü --------------------------------------------------------
// Eskiden sadece bitirdiğin (İzlendi) dizilere yeni bölüm gelince haber geliyordu (bkz. watchlist.js checkFinishedSeries).
// İzleniyor dizilerde son/sıradaki bölüme bakılır; yayın gününde (ya da ertesi gün ilk açılışta) "S2B4 bugün çıktı" —
// her bölüm bir kez. Anahtar checkFinishedSeries'tekiyle aynı (new:<kayıt>:<sezon-bölüm>): aynı bölüm iki kez bildirilmez.
const WATCHING_CHECK_MS = 3 * 3600e3
export async function checkWatchingSeries(profileId, apiKey) {
  const { home, boardId } = homeBoard(profileId)
  if (!boardId || !extraOn(home, 'newEpisodes')) return
  const st = readState(profileId)
  if (Date.now() - (st.watchingAt ?? 0) < WATCHING_CHECK_MS) return
  patchState(profileId, { watchingAt: Date.now() })
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return
  const { board } = loaded
  const durum = resolveRole(board, 'durum')
  const izleniyor = resolveStatusOption(board, 'izleniyor')
  if (!durum || !izleniyor) return
  const refs = readJsonShared(profileTmdbFile(profileId), {})
  const watched = readJsonShared(profileWatchedFile(profileId), {})
  const today = localDay()
  const yesterday = addDays(-1)
  for (const row of hideForKid(profileId, boardId, loaded.rows)) {
    if (row.values?.[durum.id] !== izleniyor) continue
    const ref = refs[row.id]
    if (!ref || ref.mediaType !== 'tv') continue
    let info = null
    try {
      info = await getTvStatus(ref.id, apiKey)
    } catch {
      continue
    }
    if (!info) continue
    saveShowInfo(profileId, row.id, info)
    const seen = watched[row.id] ?? {}
    for (const ep of [info.last, info.next]) {
      if (!ep?.airDate || ep.airDate > today || ep.airDate < yesterday) continue
      const k = `${ep.season}-${ep.episode}`
      if (Array.isArray(seen[k]) && seen[k].length) continue
      pushNotification(profileId, {
        key: `new:${row.id}:${k}`,
        type: 'newEpisode',
        boardId,
        rowId: row.id,
        title: titleOf(board, row),
        text: ep.airDate === today ? stt('S{0}B{1} bugün çıktı.', ep.season, ep.episode) : stt('S{0}B{1} dün çıktı.', ep.season, ep.episode),
      })
    }
  }
}

// ---- Y4: unutulan puanlar ----------------------------------------------------------------------------------
// Puan penceresi "Sonra" ile kapatılınca yapım puansız kalıyordu. Akşam (19:00'dan sonra) tek bir toplu bildirim: son
// 7 günde (bugün hariç) İzlendi olup puanı boş kalanlar. Tıklayınca puan penceresi sırayla afişleriyle açılır
// (bkz. RatePrompt.tsx › ?puanla=). Her yapım için en çok bir kez hatırlatılır, günde en çok bir bildirim.
export function checkRateReminder(profileId, now = new Date()) {
  if (now.getHours() < 19) return
  const { home, boardId } = homeBoard(profileId)
  if (!boardId || !extraOn(home, 'rateRemind')) return
  const today = localDay(now)
  const st = readState(profileId)
  if (st.rateDay === today) return
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return
  const { board } = loaded
  const durum = resolveRole(board, 'durum')
  const puan = resolveRole(board, 'puan')
  const tarih = resolveRole(board, 'izlemeTarihi')
  if (!durum || !puan || !tarih) return
  const done = watchedStatusIds(board)
  const from = addDays(-7, now)
  const reminded = new Set(Array.isArray(st.rated) ? st.rated : [])
  const picks = []
  for (const row of hideForKid(profileId, boardId, loaded.rows)) {
    if (!done.has(row.values?.[durum.id]) || reminded.has(row.id)) continue
    const score = row.values?.[puan.id]
    if (score && typeof score === 'object' && Object.keys(score).length) continue
    const last = dates(row.values?.[tarih.id]).pop()
    if (!last || last < from || last >= today) continue
    picks.push({ id: row.id, title: titleOf(board, row), last })
  }
  patchState(profileId, { rateDay: today })
  if (!picks.length) return
  picks.sort((a, b) => (a.last < b.last ? 1 : -1))
  const list = picks.slice(0, 12)
  const names = list.slice(0, 3).map((p) => p.title).join(', ')
  pushNotification(profileId, {
    key: `puan:${today}`,
    type: 'rateRemind',
    title: stt('Puan vermeyi unuttukların'),
    text:
      picks.length === 1
        ? stt('Bu hafta izlediğin {0} için puan vermedin. Şimdi puanlamak için tıkla.', names)
        : stt('Bu hafta izlediğin {0} yapıma puan vermedin ({1}{2}). Şimdi puanlamak için tıkla.', picks.length, names, picks.length > 3 ? '…' : ''),
    link: `/?puanla=${boardId}:${list.map((p) => p.id).join(',')}`,
  })
  patchState(profileId, { rated: [...reminded, ...picks.map((p) => p.id)].slice(-3000) })
}

// ---- Y10: sabah bülteni ----------------------------------------------------------------------------------------
// Her sabah (09:00–13:00 arası ilk turda, günde bir) tek bildirim: bugün çıkan bölümler (arşivindeki diziler) ve bugün
// vizyona giren filmler (arşivinde Vizyon tarihi bugün olanlar). Bugün hiçbir şey yoksa bildirim gelmez.
export function checkMorning(profileId, now = new Date()) {
  if (now.getHours() < 9 || now.getHours() >= 13) return
  const { home, boardId } = homeBoard(profileId)
  if (!boardId || !extraOn(home, 'morning')) return
  const today = localDay(now)
  const st = readState(profileId)
  if (st.morningDay === today) return
  patchState(profileId, { morningDay: today })
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return
  const { board } = loaded
  const vizyon = resolveRole(board, 'vizyon')
  const episodes = readJsonShared(profileEpisodesFile(profileId), {})
  const refs = readJsonShared(profileTmdbFile(profileId), {})
  const eps = []
  const films = []
  for (const row of hideForKid(profileId, boardId, loaded.rows)) {
    const title = titleOf(board, row)
    const found = new Set()
    for (const s of Array.isArray(episodes[row.id]) ? episodes[row.id] : [])
      for (const e of s.episodes ?? []) if (e.airDate === today && s.seasonNumber >= 1) found.add(`${s.seasonNumber}-${e.episodeNumber}`)
    const show = refs[row.id]?.show
    for (const e of [show?.next, show?.last]) if (e?.airDate === today) found.add(`${e.season}-${e.episode}`)
    if (found.size) {
      const [s, e] = [...found].sort()[0].split('-')
      eps.push(found.size > 1 ? stt('{0} S{1}B{2} (+{3})', title, s, e, found.size - 1) : stt('{0} S{1}B{2}', title, s, e))
    }
    if (vizyon && refs[row.id]?.mediaType !== 'tv' && dayOf(row.values?.[vizyon.id]) === today) films.push(stt('{0} vizyonda', title))
  }
  const parts = [...eps, ...films]
  if (!parts.length) return
  const shown = parts.slice(0, 5).join(', ') + (parts.length > 5 ? stt(' ve {0} tane daha', parts.length - 5) : '')
  pushNotification(profileId, {
    key: `sabah:${today}`,
    type: 'morning',
    title: stt('Bugün ne çıkıyor'),
    text: stt('Bugün: {0}', shown),
    link: `/takvim?ay=${today.slice(0, 7)}&gun=${today}`,
  })
}

// ---- Y26: yaklaşan sinema seansı ------------------------------------------------------------------------------
// İleri tarihli biletler (Koleksiyon › Biletlerim › Yaklaşan seans) için: seans günü sabah bir haber, seans saatinden ~2 saat
// önce bir hatırlatma (saat yazılmadıysa sadece sabah). Seans saati geçince puan sorma ve izlendi işaretleme arayüzde
// (Biletlerim, koleksiyon ajanı) — burada tekrarlanmaz.
const biletFile = (profileId) => path.join(profileDir(profileId), 'biletler.json')
export function checkTickets(profileId, now = new Date()) {
  const { home } = homeBoard(profileId)
  if (!extraOn(home, 'seans')) return
  const data = readJsonShared(biletFile(profileId), { items: {} })
  const items = data?.items && typeof data.items === 'object' ? data.items : {}
  const today = localDay(now)
  for (const [id, b] of Object.entries(items)) {
    if (!b || typeof b !== 'object' || b.date !== today || !b.title) continue
    const time = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(b.time ?? ''))
    const start = time ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(time[1]), Number(time[2])) : null
    const msLeft = start ? start.getTime() - now.getTime() : null
    if (start && msLeft <= 0) continue // seans başladı / geçti
    const where = [b.cinema, b.hall ? stt('Salon {0}', b.hall) : '', b.seat ? stt('Koltuk {0}', b.seat) : ''].filter(Boolean).join(' · ')
    const hhmm = time ? `${time[1].padStart(2, '0')}:${time[2]}` : ''
    // ~2 saat kala (2 saatten az kaldıysa ilk turda)
    if (start && msLeft <= 2 * 3600e3) {
      const mins = Math.max(1, Math.round(msLeft / 60000))
      pushNotification(profileId, {
        key: `seans-yakin:${id}:${today}T${hhmm}`,
        type: 'seans',
        title: b.title,
        text: (mins >= 60 ? stt("Seans saat {0}'da — {1} sa {2} dk kaldı.", hhmm, Math.floor(mins / 60), mins % 60) : stt("Seans saat {0}'da — {1} dakika kaldı.", hhmm, mins)) + (where ? ' ' + where : ''),
        link: '/koleksiyon?sekme=biletler',
      })
      continue
    }
    // Seans günü sabahı (08:00'den sonra ilk turda)
    if (now.getHours() >= 8)
      pushNotification(profileId, {
        key: `seans-sabah:${id}:${today}`,
        type: 'seans',
        title: stt('Bugün sinema günü'),
        text: (hhmm ? stt('{0} — saat {1}.', b.title, hhmm) : stt('{0} — bugün.', b.title)) + (where ? ' ' + where : ''),
        link: '/koleksiyon?sekme=biletler',
      })
  }
}

// ---- Y6: haftalık otomatik Genel Güncelleme (gece) ----------------------------------------------------------
// Afiş, sinopsis, yeni sezon gibi bilgiler zamanla eskiyor. Haftada bir, ARGUS açıkken gece (01:00–06:00) sessiz bir tur:
// sadece BOŞ alanlar doldurulur (yazdıkların ezilmez), dizilerin bölüm listesi yenilenir. Arşivdeki "dişli" menüsünde
// kapatılan alanlara dokunulmaz. Sonuç sabah zilde (bkz. bulk.js notifyDone). Bilgisayar gece hep kapalıysa 14 günü geçince
// gündüz de yapılır. Kullanıcının durdurup "Devam et" için beklettiği bir iş varsa ona dokunulmaz.
const AUTO_BULK_EVERY = 7 * 864e5
const FILL_ROLES = ['poster', 'sinopsis', 'ulke', 'yonetmen', 'video', 'sure', 'tur', 'orjinalAdi', 'banner']
export function checkAutoBulk(profileId, now = new Date()) {
  const { home, boardId } = homeBoard(profileId)
  if (!boardId || !extraOn(home, 'autoBulk')) return
  const st = readState(profileId)
  if (st.autoBulkAt === undefined) {
    // İlk kez: bir hafta sonrasını beklemeden ilk uygun gece yapılsın, ama gündüz yedeği (14 gün) hemen tetiklenmesin
    patchState(profileId, { autoBulkAt: Date.now() - AUTO_BULK_EVERY })
    return
  }
  const since = Date.now() - st.autoBulkAt
  if (since < AUTO_BULK_EVERY) return
  const night = now.getHours() >= 1 && now.getHours() < 6
  if (!night && since < 14 * 864e5) return
  if (isBulkRunning(profileId)) return
  const last = lastBulkJob(profileId)?.job
  if (last && !last.auto && last.state === 'cancelled' && last.total > last.done && Date.now() - (last.finishedAt ?? 0) < 7 * 864e5) return
  const apiKey = readProfileApiKey(profileId)
  if (!apiKey) return
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return
  const { board, rows } = loaded
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  const refs = readJsonShared(profileTmdbFile(profileId), {})
  let exclude = []
  try {
    const raw = readJsonShared(UI_PREFS_FILE, { prefs: {} })?.prefs?.[`argus_tmdb_fetch_exclude_${boardId}`]
    if (raw) exclude = JSON.parse(raw).filter((x) => typeof x === 'string')
  } catch {
    exclude = []
  }
  const roles = FILL_ROLES.map((k) => resolveRole(board, k)).filter(Boolean)
  const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
  const targets = rows.filter((r) => {
    if (!tp || empty(r.values?.[tp.id])) return false
    if (refs[r.id]?.mediaType === 'tv') return true // yeni sezon / bölüm gelsin
    return roles.some((p) => empty(r.values?.[p.id]))
  })
  patchState(profileId, { autoBulkAt: Date.now() })
  if (!targets.length) return
  startBulkJob(profileId, boardId, { rowIds: targets.map((r) => r.id), exclude, overwrite: false, label: stt('Haftalık otomatik güncelleme'), auto: true })
}

// ---- G3: uzun süredir bağlanmayan telefon ---------------------------------------------------------------------
// 60 gündür bağlanmayan eşleşmiş telefon için zile öneri; tıklayınca Ayarlar › Uygulama Ayarları › Telefon açılır, orada
// tek tuşla kaldırılır (telefon kaybolduysa ya da değiştiyse eski cihaz bağlı kalmasın).
export const STALE_DEVICE_DAYS = 60
export function checkStaleDevices(profileIds) {
  let devices = []
  try {
    devices = readJson(path.join(DATA_DIR, 'devices.json'), [])
  } catch {
    return
  }
  if (!Array.isArray(devices)) return
  for (const d of devices) {
    const days = Math.floor((Date.now() - (d.lastSeen || d.pairedAt || Date.now())) / 864e5)
    if (days < STALE_DEVICE_DAYS) continue
    for (const pid of profileIds)
      pushNotification(pid, {
        key: `cihaz-eski:${d.id}:${Math.floor(days / 30)}`,
        type: 'device',
        title: stt('Eski telefon: {0}', d.name || stt('Telefon')),
        text: stt('{0} gündür bağlanmadı. Kaybolduysa ya da artık kullanmıyorsan bağlantısını kesmek için tıkla.', days),
        link: '/arsivlerim?sekme=uygulama&telefon=1',
      })
  }
}

// ---- zamanlayıcı ----------------------------------------------------------------------------------------------
let tickRunning = false
let lastDeviceCheck = 0
export async function remindersTick() {
  if (tickRunning) return
  tickRunning = true
  try {
    let ids = []
    try {
      ids = readProfiles().map((p) => p.id)
    } catch {
      return
    }
    const now = new Date()
    for (const id of ids) {
      for (const fn of [checkTickets, checkMorning, checkRateReminder, checkAutoBulk]) {
        try {
          fn(id, now)
        } catch (e) {
          console.error('hatırlatma hata:', e)
        }
      }
      const apiKey = readProfileApiKey(id)
      if (apiKey) await checkWatchingSeries(id, apiKey).catch((e) => console.error('yeni bölüm kontrolü hata:', e))
    }
    if (Date.now() - lastDeviceCheck > 12 * 3600e3) {
      lastDeviceCheck = Date.now()
      try {
        checkStaleDevices(ids)
      } catch {}
    }
  } finally {
    tickRunning = false
  }
}

export function startReminders() {
  setTimeout(remindersTick, 90_000)
  setInterval(remindersTick, 5 * 60_000)
}
