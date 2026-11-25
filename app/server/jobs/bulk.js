// Genel Güncelleme sunucuda (v1.25): eskiden tarayıcı kayıtları tek tek TMDB'den doldurtuyordu — sayfa kapanınca,
// bilgisayar uyuyunca ya da ARGUS yeniden başlayınca iş yarıda kalıyordu. Artık iş burada sırayla yürür, her kayıttan
// sonra data/profiles/<id>/bulk-job.json'a yazılır; ARGUS kapanıp açılınca kaldığı yerden devam eder.
// Profil başına aynı anda tek iş. Arayüz ilerlemeyi GET ile sorar, DELETE ile durdurur.
import fs from 'node:fs'
import path from 'node:path'
import { app } from '../app.js'
import { stt } from '../lang.js'
import { PROFILES_DIR, makeId, profileBoardsFile, profileDir, profileRowsFile, rawWriteJson, readJson, readJsonShared } from '../storage.js'
import { fillRowFromTmdb } from '../fill.js'
import { pushNotification } from '../notifications.js'

const LOG_MAX = 200
const jobs = new Map() // profileId → { job, params: { rowIds, exclude, overwrite, next } }

function jobFile(profileId) {
  return path.join(profileDir(profileId), 'bulk-job.json')
}
function save(profileId, st) {
  try {
    rawWriteJson(jobFile(profileId), st)
  } catch (e) {
    console.error('bulk-job yazılamadı:', e)
  }
}
// Durdurulup hemen yenisi başlatılan bir işin eski döngüsü (o an TMDB cevabını bekliyordu) bitince dosyaya kendi
// (durdurulmuş) halini yazıp yeni işin ilerlemesini ezmesin — yoksa ARGUS yeniden açılınca yeni iş devam etmiyordu.
function saveIfCurrent(profileId, st) {
  if (jobs.get(profileId) === st) save(profileId, st)
}
function current(profileId) {
  return jobs.get(profileId) ?? readJson(jobFile(profileId), null)
}

async function run(profileId) {
  const st = jobs.get(profileId)
  if (!st) return
  const { job, params } = st
  try {
    while (job.state === 'running' && params.next < params.rowIds.length) {
      const rowId = params.rowIds[params.next]
      const board = readJsonShared(profileBoardsFile(profileId), []).find((b) => b.id === job.boardId)
      const row = board ? readJsonShared(profileRowsFile(profileId, job.boardId), []).find((r) => r.id === rowId) : null
      if (!board) {
        job.state = 'cancelled'
        break
      }
      if (row) {
        const tp = board.properties.find((p) => p.id === board.titlePropertyId)
        const title = String((tp && row.values?.[tp.id]) || stt('İsimsiz'))
        job.current = title
        let out
        try {
          out = await fillRowFromTmdb(profileId, job.boardId, rowId, { exclude: params.exclude, overwrite: params.overwrite })
        } catch (e) {
          out = { status: 500, data: { error: e?.message || String(e) } }
        }
        const deleted = out.status === 404 && !readJsonShared(profileRowsFile(profileId, job.boardId), []).some((r) => r.id === rowId)
        if (!deleted) {
          const ok = out.status === 200 && out.data?.ok === true
          if (ok) job.updated++
          else {
            job.failed++
            // "Hata verenleri tekrar dene" (Y5) için: günlük 200 satırla sınırlı, hata verenlerin hepsi ayrıca tutuluyor
            params.failedIds = [...(params.failedIds ?? []), rowId].slice(-5000)
            job.retryable = params.failedIds.length
          }
          job.log.unshift({
            rowId,
            title,
            ok,
            ...(ok ? { filled: out.data.filled ?? [], newEpisodes: out.data.newEpisodes ?? 0, newActors: out.data.newActors ?? 0 } : { error: out.data?.error || stt('Güncellenemedi') }),
          })
          if (job.log.length > LOG_MAX) job.log.length = LOG_MAX
        }
      }
      // Bu arada silinen kayıtlar atlanır (bitti sayılır, hata sayılmaz)
      job.done++
      params.next++
      saveIfCurrent(profileId, st)
    }
  } catch (e) {
    console.error('Genel Güncelleme hata:', e)
  } finally {
    if (job.state === 'running') job.state = 'done'
    job.current = null
    job.finishedAt = job.finishedAt ?? Date.now()
    saveIfCurrent(profileId, st)
    if (job.state === 'done' && jobs.get(profileId) === st) notifyDone(profileId, job)
  }
}

// İş bitince zile (ve oradan Windows bildirimine) haber (v1.26, Y5). Gece kendiliğinden yapılan haftalık tur da
// sonucunu buradan bırakır — sabah zilde görünür.
function notifyDone(profileId, job) {
  try {
    const name = job.auto ? stt('Haftalık otomatik güncelleme') : job.label || stt('Genel Güncelleme')
    pushNotification(profileId, {
      key: `bulk:${job.id}`,
      type: 'bulkDone',
      title: stt('{0} bitti', name),
      text:
        job.failed > 0
          ? stt('{0} kayıt güncellendi, {1} kayıtta hata/eşleşme yok. Arşivdeki kutudan "Hata verenleri tekrar dene" diyebilirsin.', job.updated, job.failed)
          : stt('{0} kayıt güncellendi.', job.updated),
      link: `/board/${job.boardId}`,
    })
  } catch {
    /* bildirim yazılamadıysa önemsiz */
  }
}

// ARGUS açılırken yarıda kalmış iş varsa devam eder
export function resumeBulkJobs() {
  let ids = []
  try {
    ids = fs.readdirSync(PROFILES_DIR)
  } catch {
    return
  }
  for (const profileId of ids) {
    const st = readJson(path.join(PROFILES_DIR, profileId, 'bulk-job.json'), null)
    if (st?.job?.state !== 'running' || !st.params) continue
    jobs.set(profileId, st)
    console.log(`Genel Güncelleme kaldığı yerden sürüyor (${profileId}): ${st.job.done}/${st.job.total}`)
    run(profileId)
  }
}

export function isBulkRunning(profileId) {
  return jobs.get(profileId)?.job.state === 'running'
}
export function lastBulkJob(profileId) {
  return current(profileId)
}

// Yeni iş başlatır (arayüzden, "Hata verenleri tekrar dene"den ya da haftalık otomatik turdan)
export function startBulkJob(profileId, boardId, { rowIds, exclude = [], overwrite = false, label = '', auto = false }) {
  const job = {
    id: makeId(),
    boardId,
    label: typeof label === 'string' ? label.slice(0, 120) : '',
    total: rowIds.length,
    done: 0,
    updated: 0,
    failed: 0,
    current: null,
    state: 'running',
    startedAt: Date.now(),
    log: [],
    ...(auto ? { auto: true } : {}),
  }
  const st = { job, params: { rowIds, exclude, overwrite: Boolean(overwrite), next: 0, failedIds: [] } }
  jobs.set(profileId, st)
  save(profileId, st)
  run(profileId)
  return job
}

app.post('/api/profiles/:profileId/boards/:boardId/bulk-job', (req, res) => {
  const { profileId, boardId } = req.params
  const prev = jobs.get(profileId)
  if (prev?.job.state === 'running') return res.status(409).json({ error: stt('Zaten süren bir Genel Güncelleme var.'), job: prev.job })
  if (!readJsonShared(profileBoardsFile(profileId), []).some((b) => b.id === boardId)) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
  const b = req.body ?? {}
  const rowIds = Array.isArray(b.rowIds) ? [...new Set(b.rowIds.filter((x) => typeof x === 'string' && x))] : []
  const job = startBulkJob(profileId, boardId, {
    rowIds,
    exclude: Array.isArray(b.exclude) ? b.exclude.filter((x) => typeof x === 'string') : [],
    overwrite: Boolean(b.overwrite),
    label: b.label,
  })
  res.json({ job })
})

// "Hata verenleri tekrar dene" (v1.26, Y5): son işte hata veren kayıtlarla, aynı ayarlarla yeni bir iş
app.post('/api/profiles/:profileId/bulk-job/retry', (req, res) => {
  const { profileId } = req.params
  const prev = current(profileId)
  if (prev?.job?.state === 'running') return res.status(409).json({ error: stt('Zaten süren bir Genel Güncelleme var.'), job: prev.job })
  const ids = [...new Set(prev?.params?.failedIds ?? [])]
  if (!prev?.job || !ids.length) return res.status(400).json({ error: stt('Tekrar denenecek hatalı kayıt yok.') })
  const boardId = prev.job.boardId
  if (!readJsonShared(profileBoardsFile(profileId), []).some((b) => b.id === boardId)) return res.status(404).json({ error: stt('Arşiv bulunamadı') })
  const live = new Set(readJsonShared(profileRowsFile(profileId, boardId), []).map((r) => r.id))
  const rowIds = ids.filter((id) => live.has(id))
  if (!rowIds.length) return res.status(400).json({ error: stt('Hata veren kayıtlar artık arşivde yok.') })
  const job = startBulkJob(profileId, boardId, { rowIds, exclude: prev.params.exclude ?? [], overwrite: prev.params.overwrite, label: stt('Hata verenleri tekrar deneme') })
  res.json({ job })
})

app.get('/api/profiles/:profileId/bulk-job', (req, res) => {
  res.json({ job: current(req.params.profileId)?.job ?? null })
})

app.delete('/api/profiles/:profileId/bulk-job', (req, res) => {
  const { profileId } = req.params
  const st = current(profileId)
  if (!st?.job) return res.json({ job: null })
  if (st.job.state === 'running') {
    st.job.state = 'cancelled'
    st.job.finishedAt = Date.now()
    if (!jobs.has(profileId)) st.job.current = null
    save(profileId, st)
  }
  res.json({ job: st.job })
})
