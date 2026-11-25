// ARGUS Android: PC ile bağlantı ve eşitleme. Kullanıcı "telefondan değiştirdiğim şeyi telefon hafızasında
// tutsun, PC'ye bağlanınca ikisi aynı ağda olunca iletişimi kursun, bunlar bunlar değişti desin" dedi.
//
//   - Eşleşme bilgisi (PC adresi, anahtar) localStorage'da "mobil.server" (argus_ ile başlamıyor: uiPrefs
//     onu PC'ye göndermesin) ve Java tarafında (görseller için, ArgusNative.setServer).
//   - Birkaç saniyede bir PC'ye "orada mısın" denir. Ulaşılınca: önce bekleyen değişiklikler sırayla gönderilir
//     (sunucu kendi kurallarını uygular, aynısı iki kez işlenmez — bkz. server/sync.js), sonra PC'de değişen
//     dosyalara karşılık gelen veriler yeniden çekilir (manifest).
//   - PC'nin adresi değiştiyse (modem yeni IP verdi) aynı ağda taranıp aynı ARGUS (serverId) bulunur.
import { wifiRequest } from './wifiHttp'
import { App } from '@capacitor/app'
import { ArgusNative } from './native'
import { cacheAllKeys, cacheDelete, cacheGet, cacheKeys, cacheSet, metaGet, metaSet, queueAdd, queueAll, queueCount, queueDelete, shouldCache, withLock, type QueuedOp } from './store'
import { opCacheKey, opTouches, replayOnCache } from './localApply'
import { notifyDataChanged } from '../dataEvents'

export interface ServerConfig {
  host: string
  token: string
  serverId: string
  pcName: string
  deviceId: string
}

export type MobileStatus = 'offline' | 'syncing' | 'online'

export interface MobileState {
  status: MobileStatus
  pending: number
  lastSync: number | null
  failed: number
  prefetch: { done: number; total: number } | null
  // PC'deki ARGUS'ta telefon uygulamasının daha yeni bir sürümü var (bkz. checkAppUpdate)
  update: { version: string } | null
  // Güncelleme indiriliyor (%)
  updating: number | null
  // PC'deki ARGUS açık ve ulaşılıyor ama bu telefonu artık tanımıyor (PC'de telefon kaldırılmış / eşleşme
  // silinmiş). Eskiden bu durumda telefon sessizce "Çevrimdışı" kalıyordu; yeniden eşleşmek gerekiyor.
  unpaired: boolean
  // PC'nin uygulamadığı telefon değişiklikleri (PC'de daha yeni hali var / kayıt PC'de silinmiş — bkz. SkippedOp)
  skipped: number
  // Son eşitlemelerde yeni eklenen "uygulanmadı" sayısı (eşitleme sonrası alttaki kart; bkz. ackSkipped)
  newSkipped: number
}

const CONFIG_KEY = 'mobil.server'
const PORT = 4000

export function getConfig(): ServerConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? (JSON.parse(raw) as ServerConfig) : null
  } catch {
    return null
  }
}

export async function saveConfig(c: ServerConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c))
  await ArgusNative.setServer({ host: c.host, token: c.token }).catch(() => {})
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY)
}

let state: MobileState = { status: 'offline', pending: 0, lastSync: null, failed: 0, prefetch: null, update: null, updating: null, unpaired: false, skipped: 0, newSkipped: 0 }
const listeners = new Set<(s: MobileState) => void>()
function setState(patch: Partial<MobileState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l(state)
}
export function getState() {
  return state
}
export function subscribe(fn: (s: MobileState) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
export async function refreshPending() {
  setState({ pending: await queueCount().catch(() => state.pending) })
}

export class NetworkError extends Error {}

export interface PcResponse {
  status: number
  headers: Record<string, string>
  data: unknown
}

// PC'deki ARGUS'a istek (telefonun kendi HTTP'si — tarayıcı kısıtlamalarına takılmaz). Ağ hatası → NetworkError.
export async function pcRequest(
  path: string,
  o: { method?: string; body?: string; headers?: Record<string, string>; timeoutMs?: number; host?: string; token?: string } = {},
): Promise<PcResponse> {
  const c = getConfig()
  const host = o.host ?? c?.host
  if (!host) throw new NetworkError('no host')
  const headers: Record<string, string> = { ...(o.headers ?? {}) }
  const token = o.token ?? c?.token
  if (token) headers['X-Argus-Token'] = token
  if (o.body !== undefined) headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
  const t = o.timeoutMs ?? 15000
  try {
    // H3: Wi-Fi ağı üzerinden (bkz. wifiHttp.ts)
    return await wifiRequest({ host, port: PORT, path, method: o.method ?? 'GET', headers, body: o.body, connectTimeout: Math.min(t, 4000), readTimeout: t })
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : String(e))
  }
}

// Manifest'teki dosya → telefonda tutulan okuma adresleri
async function pathsForFile(file: string): Promise<string[]> {
  if (file === 'profile.json') return ['/api/profiles']
  const m = /^profiles\/([^/]+)\/(.+)$/.exec(file)
  if (!m) return []
  const [, p, rest] = m
  const base = `/api/profiles/${p}`
  const rows = /^rows\/(.+)\.json$/.exec(rest)
  if (rows) return [`${base}/boards/${rows[1]}/rows`]
  switch (rest) {
    case 'boards.json':
      return [`${base}/boards`]
    case 'cast.json':
      return [`${base}/cast`]
    case 'episodes.json':
      return [`${base}/episodes`]
    case 'watched.json':
      return [`${base}/watched`]
    case 'home-settings.json':
      return [`${base}/home-settings`]
    case 'templates.json':
      return [`${base}/templates`]
    case 'notifications.json':
      return [`${base}/notifications`]
    case 'recent-watch.json':
      return [`${base}/recent-watch`]
    case 'aklimda.json':
      return [`${base}/aklimda`]
    case 'biletler.json':
      return [`${base}/biletler`]
    case 'oduller.json':
      return [`${base}/oduller`]
    case 'koleksiyon.json': {
      const boards = ((await cacheGet<{ id: string }[]>(`${base}/boards`)) ?? []).map((b) => `${base}/koleksiyon/${b.id}`)
      return boards
    }
    case 'songs.json':
      return cacheKeys(`${base}/songs/`)
    default: {
      // Genel kayıtlar: profiles/<id>/store/<ad>.json → /api/profiles/<id>/store/<ad>
      const st = /^store\/([^/]+)\.json$/.exec(rest)
      return st ? [`${base}/store/${st[1]}`] : []
    }
  }
}

// PC'den gelen bir okumayı telefona yazar. O adreste PC'ye henüz gitmemiş değişiklik varsa PC'nin kopyasının
// üstüne yeniden işlenir — yoksa eşitleme sürerken telefonda yapılan değişiklik, PC'nin (o değişikliği henüz
// bilmeyen) kopyasıyla ezilip bir sonraki eşitlemeye kadar kayboluyordu. Arayüze dönecek son hali verir.
export function storeFromPc(path: string, data: unknown): Promise<unknown> {
  return withLock(async () => {
    await cacheSet(path, data)
    const ops = (await queueAll()).filter(({ op }) => opTouches(op, path))
    if (!ops.length) return data
    for (const { op } of ops) await replayOnCache(op).catch((e) => console.error('yeniden işlenemedi:', e))
    return cacheGet(path)
  })
}

// PC'ye bağlıyken ekranların istediği bölüm / izleme / oyuncu listesi de parça parça gelir (her açılışta 4–5 MB
// inmesin). PC bunu desteklemiyorsa ya da olmadıysa undefined → normal (tam) okuma. Bkz. fetchShim › handleGet.
export async function readViaDelta(path: string): Promise<unknown | undefined> {
  const m = /^\/api\/profiles\/([A-Za-z0-9_-]+)\/(episodes|watched|cast)$/.exec(path)
  if (!m) return undefined
  try {
    const man = await metaGet<Manifest>('manifest').catch(() => undefined)
    if (!man?.delta?.includes(`${m[2]}.json`)) return undefined
    const st = await deltaFetchAndStore(`profiles/${m[1]}/${m[2]}.json`, path, false)
    return st === 200 ? cacheGet(path) : undefined
  } catch (e) {
    if (e instanceof NetworkError) throw e
    return undefined
  }
}

// Durum kodunu döner: 500 ve üstü (PC dosyayı o an okuyamadı vb.) → o dosya "alındı" sayılmaz, sonra yeniden denenir
async function fetchAndStore(path: string): Promise<number> {
  const r = await pcRequest(path, { timeoutMs: 60000 })
  if (r.status === 200) await storeFromPc(path, r.data)
  return r.status
}

// Parça parça çekme (v1.26, bkz. server/sync.js /api/sync/delta): bölümler / izleme işaretleri / oyuncular gibi yapım
// başına anahtarlı dosyalarda sadece PC'de değişen yapımlar gelir. Telefon PC'den aldığı her anahtarın özetini
// "kh:<adres>" altında tutar. Özet yoksa (ilk kez / tam eşitleme) hepsi gelir. Durum kodunu döner.
async function deltaFetchAndStore(file: string, path: string, full: boolean): Promise<number> {
  const khKey = 'kh:' + path
  const cached = full ? undefined : await cacheGet<unknown>(path)
  const usable = cached !== undefined && cached !== null && typeof cached === 'object' && !Array.isArray(cached)
  const kh = usable ? ((await metaGet<Record<string, string>>(khKey)) ?? null) : null
  const r = await pcRequest('/api/sync/delta', { method: 'POST', body: JSON.stringify({ file, hashes: kh ?? {} }), timeoutMs: 60000 })
  // PC bu adresi bilmiyor / kabul etmedi: eski yol (tam dosya)
  if (r.status === 404 || r.status === 400) return fetchAndStore(path)
  if (r.status !== 200) return r.status
  const d = r.data as { set?: Record<string, unknown> | null; del?: string[]; hashes?: Record<string, string> } | null
  const set = d?.set
  if (!set || typeof set !== 'object') return fetchAndStore(path)
  await withLock(async () => {
    let data: Record<string, unknown>
    let hashes: Record<string, string>
    if (kh) {
      data = { ...((await cacheGet<Record<string, unknown>>(path)) ?? {}) }
      hashes = { ...kh }
      for (const k of d?.del ?? []) {
        delete data[k]
        delete hashes[k]
      }
      for (const [k, v] of Object.entries(set)) {
        data[k] = v
        if (d?.hashes?.[k]) hashes[k] = d.hashes[k]
        else delete hashes[k]
      }
    } else {
      data = set
      hashes = { ...(d?.hashes ?? {}) }
    }
    await cacheSet(path, data)
    await metaSet(khKey, hashes)
    // PC'ye henüz gitmemiş değişiklikler yeni kopyanın üstüne yeniden işlenir (bkz. storeFromPc)
    for (const { op } of (await queueAll()).filter(({ op }) => opTouches(op, path))) await replayOnCache(op).catch((e) => console.error('yeniden işlenemedi:', e))
  })
  return 200
}

// Bekleyen değişiklikleri sırayla PC'ye gönderir. Ağ koparsa durur (false). PC reddederse (ör. kayıt artık yok)
// o değişiklik bırakılır ve "gönderilemedi" listesine yazılır — liste tıkanmasın.
async function flush(): Promise<boolean> {
  for (const { key, op } of await queueAll()) {
    let r: PcResponse
    try {
      r = await sendOp(op)
    } catch (e) {
      if (e instanceof NetworkError) return false
      throw e
    }
    // PC şu an kabul etmiyorsa (eşleşme kalkmış: 401/403, çok istek: 429, geçici sunucu hatası: 502-504)
    // değişiklik ATILMIYOR — kuyrukta kalıp sonra tekrar deneniyor. Eskiden bunlar da "gönderilemedi"
    // deyip siliniyordu, telefonda yapılan değişiklik kalıcı olarak kayboluyordu. (500 gibi kalıcı
    // hatalar eskisi gibi "gönderilemedi"ye düşüyor — tek bir bozuk değişiklik bütün kuyruğu tıkamasın.)
    if ([401, 403, 429, 502, 503, 504].includes(r.status)) {
      // PC anahtarı tanımıyor (bkz. pull) — sıradakiler bekler, kullanıcıya "yeniden bağlan" denir
      if (r.status === 401 || r.status === 403) setState({ unpaired: true })
      return false
    }
    if (r.status < 400) await noteSkipped(op, r)
    if (r.status >= 400) {
      await withLock(async () => {
        const failed = ((await metaGet<FailedOp[]>('failed')) ?? []).slice(-49)
        await metaSet('failed', [...failed, { op, status: r.status, error: (r.data as { error?: string })?.error ?? null, t: Date.now() }])
        setState({ failed: failed.length + 1 })
      })
      // Telefondaki kopyada bu değişiklik hâlâ görünüyor — sonraki eşitlemede PC'deki hali yeniden çekilsin
      await markRefetch(op)
    }
    await queueDelete(key)
    setState({ pending: Math.max(0, state.pending - 1) })
  }
  return true
}

export function sendOp(op: QueuedOp) {
  return pcRequest(op.path, {
    method: op.method,
    body: op.body,
    // force: yapıldığı an gönderilmez — PC "son yapılan kazanır" kuralını uygulamaz (bkz. applySkippedFromPhone)
    headers: op.force ? { 'X-Argus-Op-Id': op.id } : { 'X-Argus-Op-Id': op.id, 'X-Argus-Op-At': String(op.at) },
  })
}

// ---- PC'nin uygulamadığı değişiklikler (v1.26) -----------------------------------------------------------
// Telefon bir kaydı değiştirdi ama PC'de o sütun daha sonra değişmişti ("son yapılan kazanır") ya da kayıt PC'de
// silinmişti: eskiden değişiklik sessizce düşüyordu. PC artık bunu cevapta bildiriyor (X-Argus-Skipped, bkz.
// server/sync.js reportSkipped); burada saklanıp Bekleyen değişiklikler ekranında gösterilir.
export interface SkippedOp {
  op: QueuedOp
  t: number
  deleted?: boolean
  // PC'de daha yeni olan sütunlar; pc: PC'deki değer (çok uzunsa yok)
  fields?: { id: string; pc?: unknown; pcAt?: number | null }[]
}

function headerOf(h: Record<string, string>, name: string): string | null {
  const want = name.toLowerCase()
  for (const [k, v] of Object.entries(h ?? {})) if (k.toLowerCase() === want) return v
  return null
}

export async function noteSkipped(op: QueuedOp, r: PcResponse) {
  const raw = headerOf(r.headers, 'X-Argus-Skipped')
  if (!raw) return
  let info: { deleted?: boolean; fields?: SkippedOp['fields'] }
  try {
    info = JSON.parse(decodeURIComponent(raw))
  } catch {
    return
  }
  if (!info.deleted && !info.fields?.length) return
  await withLock(async () => {
    const list = ((await metaGet<SkippedOp[]>('skipped')) ?? []).filter((x) => x.op.id !== op.id).slice(-49)
    const next: SkippedOp[] = [...list, { op, t: Date.now(), deleted: info.deleted ? true : undefined, fields: info.fields }]
    await metaSet('skipped', next)
    setState({ skipped: next.length, newSkipped: state.newSkipped + 1 })
  })
}

export const getSkipped = async () => (await metaGet<SkippedOp[]>('skipped')) ?? []

async function removeSkipped(item: SkippedOp) {
  await withLock(async () => {
    const rest = (await getSkipped()).filter((x) => !(x.op.id === item.op.id && x.t === item.t))
    await metaSet('skipped', rest)
    setState({ skipped: rest.length })
  })
}

// "PC'deki kalsın": telefondaki kopya zaten eşitlemede PC'deki hale döndü — sadece listeden çıkar
export async function keepSkippedOnPc(item: SkippedOp) {
  await removeSkipped(item)
}

// "Telefondakini kullan": aynı değişiklik zorla (PC'deki daha yeni değer olsa da) yeniden gönderilir. Kayıt PC'de
// silinmişse telefondaki haliyle yeniden oluşturulur. PC yoksa sıraya girer.
export async function applySkippedFromPhone(item: SkippedOp) {
  let body: Record<string, unknown> = {}
  try {
    body = item.op.body ? (JSON.parse(item.op.body) as Record<string, unknown>) : {}
  } catch {
    /* boş */
  }
  if (item.deleted) delete body._changed
  else body._changed = (item.fields ?? []).map((f) => f.id)
  const op: QueuedOp = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    at: Date.now(),
    method: item.op.method,
    path: item.op.path,
    body: JSON.stringify(body),
    force: true,
  }
  await withLock(async () => {
    await queueAdd(op)
    await replayOnCache(op).catch(() => {})
  })
  await removeSkipped(item)
  await refreshPending()
  notifyDataChanged()
  if (state.status !== 'offline') await syncNow()
  else check()
}

// Eşitleme sonrası kart görüldü / kapatıldı
export function ackSkipped() {
  if (state.newSkipped) setState({ newSkipped: 0 })
}

export interface FailedOp {
  op: QueuedOp
  status: number
  error: string | null
  t: number
}

// Bekleyen değişiklikler ekranı (bkz. components/mobile/PendingChanges.tsx)
export const getFailed = async () => (await metaGet<FailedOp[]>('failed')) ?? []
const sameFailed = (a: FailedOp, b: FailedOp) => a.op.id === b.op.id && a.t === b.t

// Gönderilemeyen değişiklikleri sıraya geri koyar ve eşitler
export async function retryFailed(items: FailedOp[]) {
  await withLock(async () => {
    for (const f of items) {
      await queueAdd(f.op)
      // Telefondaki kopyada da yeniden görünsün
      await replayOnCache(f.op).catch(() => {})
    }
    const rest = (await getFailed()).filter((f) => !items.some((x) => sameFailed(f, x)))
    await metaSet('failed', rest)
    setState({ failed: rest.length })
  })
  await refreshPending()
  if (state.status !== 'offline') await syncNow()
  else check()
}

export async function dropFailed(item: FailedOp) {
  await withLock(async () => {
    const rest = (await getFailed()).filter((f) => !sameFailed(f, item))
    await metaSet('failed', rest)
    setState({ failed: rest.length })
  })
}

// Sıradaki bir değişikliği PC'ye göndermeden siler. Telefondaki kopyada görünen hali PC'deki haline döner
// (PC'ye bağlıyken hemen, değilse bağlanınca).
export async function dropPending(key: IDBValidKey, op: QueuedOp) {
  await withLock(() => queueDelete(key))
  await refreshPending()
  await markRefetch(op)
  if (state.status === 'online') await syncNow()
}

// Telefondaki kopyası PC'dekinden farklı kalmış olabilecek adresler: sonraki eşitlemede yeniden çekilir
async function markRefetch(op: QueuedOp) {
  const k = opCacheKey(op)
  if (!k) return
  await withLock(async () => {
    const list = (await metaGet<string[]>('refetch')) ?? []
    if (!list.includes(k)) await metaSet('refetch', [...list, k].slice(-50))
  })
}

// incomplete: eşitleme yarıda kaldı (bkz. pull)
// delta: PC'nin parça parça verebildiği dosya adları (eski PC'lerde yok)
type Manifest = { serverId: string; files: Record<string, { m: number; s: number }>; incomplete?: boolean; delta?: string[] }

async function pull(full: boolean): Promise<{ changed: number; rows: boolean }> {
  const r = await pcRequest('/api/sync/manifest')
  // PC açık ama anahtarı tanımıyor: bekleyip durmanın anlamı yok, kullanıcıya söylenir (bkz. MobileStatusBar)
  if (r.status === 401 || r.status === 403) {
    setState({ unpaired: true })
    throw new NetworkError('manifest ' + r.status)
  }
  if (r.status !== 200) throw new NetworkError('manifest ' + r.status)
  if (state.unpaired) setState({ unpaired: false })
  const next = r.data as Manifest
  const prev = full ? null : await metaGet<Manifest>('manifest')
  // boards önce (koleksiyon adresleri ona bakıyor)
  const changed = Object.keys(next.files)
    .filter((f) => !prev || prev.files[f]?.m !== next.files[f].m || prev.files[f]?.s !== next.files[f].s)
    .sort((a, b) => Number(b.endsWith('boards.json')) - Number(a.endsWith('boards.json')))
  // Her dosyadan sonra ilerleme kaydedilir: eskiden manifest sadece en sonda yazılıyordu, Wi-Fi yarıda koparsa
  // (ya da uygulama kapatılırsa) bir sonraki eşitleme her şeyi baştan çekiyordu — büyük arşivde hiç bitmeyebiliyordu.
  const progress: Manifest = { serverId: next.serverId, files: { ...(prev?.files ?? {}) }, incomplete: true }
  // PC'nin o an okuyamadığı (500+) dosyalar "alındı" sayılmaz: eskiden telefon onları PC'de tekrar değişene kadar
  // eski kopyada bırakıyordu. Diğer dosyalar yine çekilir — sürekli hata veren tek dosya eşitlemeyi kilitlemez.
  const retry: string[] = []
  const deltaOk = new Set(next.delta ?? [])
  for (const f of changed) {
    const paths = await pathsForFile(f)
    const name = f.split('/').pop() ?? ''
    const delta = paths.length === 1 && deltaOk.has(name) && /^profiles\/[^/]+\/[a-z]+\.json$/.test(f)
    let ok = true
    for (const p of paths) {
      const st = delta ? await deltaFetchAndStore(f, p, full) : await fetchAndStore(p)
      if (st >= 500) ok = false
    }
    if (ok) progress.files[f] = next.files[f]
    else retry.push(f)
    await metaSet('manifest', progress)
  }
  // Bekleyen değişikliği silinen / PC'de uygulanamayan adresler (bkz. markRefetch)
  const refetch = (await metaGet<string[]>('refetch')) ?? []
  const refetchLeft: string[] = []
  for (const k of refetch) {
    for (const p of k.endsWith('/') ? await cacheKeys(k) : [k]) {
      const st = await fetchAndStore(p).catch(() => 0)
      if ((st === 0 || st >= 500) && !refetchLeft.includes(k)) refetchLeft.push(k)
    }
  }
  // Bu arada eklenenler kalsın; alınamayanlar sonraki eşitlemede yeniden denenir
  if (refetch.length)
    await withLock(async () => metaSet('refetch', [...refetchLeft, ...((await metaGet<string[]>('refetch')) ?? []).filter((k) => !refetch.includes(k))]))
  if (full || !prev || prev.incomplete) {
    // Dosyası olmayan ama ekranların ilk açılışta istediği okumalar (ilk eşitleme yarıda kaldıysa da)
    const profiles = (await cacheGet<{ id: string }[]>('/api/profiles')) ?? []
    for (const p of profiles) {
      for (const s of ['/home-settings', '/watched', '/notifications', '/recent-watch', '/templates', '/aklimda', '/biletler']) {
        const key = `/api/profiles/${p.id}${s}`
        if ((await cacheGet(key)) === undefined) await fetchAndStore(key).catch(() => {})
      }
    }
    await fetchAndStore('/api/features').catch(() => {})
  }
  const done: Manifest = { ...next, files: { ...next.files } }
  for (const f of retry) delete done.files[f]
  await metaSet('manifest', done)
  // Afişler sadece arşiv kayıtları (ya da profil fotoğrafları) değiştiyse yeniden taranır
  return { changed: changed.length + refetch.length, rows: changed.some((f) => f === 'profile.json' || /\/rows\//.test(f)) }
}

// Afişler (ve profil fotoğrafları) PC yokken de görünsün diye önceden indirilir; diğer görseller görüldükçe birikir.
export async function prefetchPosters() {
  const paths = new Set<string>()
  const visit = (v: unknown) => {
    if (typeof v === 'string') {
      if (v.startsWith('/medya/tmdb_poster_')) paths.add(v)
    } else if (Array.isArray(v)) v.forEach(visit)
  }
  for (const p of (await cacheGet<{ id: string; photo?: string }[]>('/api/profiles')) ?? []) {
    if (p.photo?.startsWith('/medya/')) paths.add(p.photo)
    for (const key of await cacheKeys(`/api/profiles/${p.id}/boards/`)) {
      if (!key.endsWith('/rows')) continue
      for (const row of (await cacheGet<{ values?: Record<string, unknown> }[]>(key)) ?? []) Object.values(row.values ?? {}).forEach(visit)
    }
  }
  if (paths.size) await ArgusNative.prefetch({ paths: [...paths] }).catch(() => {})
}

let syncing: Promise<void> | null = null
export function syncNow(opts: { full?: boolean } = {}): Promise<void> {
  if (syncing) return syncing
  syncing = (async () => {
    setState({ status: 'syncing' })
    try {
      await refreshPending()
      if (!(await flush())) throw new NetworkError('flush')
      const { changed, rows } = await pull(Boolean(opts.full) || !(await metaGet('manifest')))
      const now = Date.now()
      await metaSet('lastSync', now)
      setState({ status: 'online', lastSync: now })
      if (changed) {
        notifyDataChanged()
        window.dispatchEvent(new Event('argus-notifications'))
      }
      // Eskiden her eşitlemeden sonra (değişiklik beklerken 8 sn'de bir) bütün arşiv taranıyordu
      if (rows) prefetchPosters()
      checkAppUpdate()
      // Ana ekran parçacığı, telefon bildirimleri vb. (native tarafı) eşitleme bitince güncellensin
      window.dispatchEvent(new Event('argus-sync-done'))
    } catch (e) {
      setState({ status: 'offline' })
      if (!(e instanceof NetworkError)) console.error('eşitleme hatası:', e)
    } finally {
      syncing = null
    }
    // Eşitleme sürerken yeni değişiklik yapıldıysa onlar da gitsin
    if (state.status === 'online' && (await queueCount()) > 0) await syncNow()
  })()
  return syncing
}

// Telefon uygulaması güncellemesi: PC'deki ARGUS GitHub'dan güncellenince yanında yeni APK da gelir (app/mobile/ARGUS.apk).
// PC'ye bağlanınca sürümü sorulur; telefondakinden yeniyse üstte "Güncelle" çıkar (bkz. MobileStatusBar).
export async function checkAppUpdate() {
  try {
    const [own, r] = await Promise.all([ArgusNative.appVersion(), pcRequest('/api/mobile/info')])
    const info = r.data as { available?: boolean; version?: string; code?: number }
    setState({ update: r.status === 200 && info?.available && (info.code ?? 0) > own.code ? { version: info.version ?? '' } : null })
  } catch {
    /* PC'ye ulaşılamadı — sonra */
  }
}

export async function startAppUpdate(): Promise<'izin' | 'basladi' | 'hata'> {
  setState({ updating: 0 })
  try {
    const r = await ArgusNative.installUpdate()
    if (r.needsPermission) {
      setState({ updating: null })
      return 'izin'
    }
    setState({ updating: null })
    return 'basladi'
  } catch {
    setState({ updating: null })
    return 'hata'
  }
}

// İstek sırasında PC'ye ulaşılamadığı anlaşıldı
export function markOffline() {
  if (state.status !== 'offline') setState({ status: 'offline' })
}

async function hello(host: string, timeoutMs = 1500): Promise<{ serverId: string; pcName: string } | null> {
  try {
    const r = await pcRequest('/api/sync/hello', { host, timeoutMs })
    const d = r.data as { app?: string; serverId?: string; pcName?: string }
    return r.status === 200 && d?.app === 'ARGUS' && d.serverId ? { serverId: d.serverId, pcName: d.pcName ?? '' } : null
  } catch {
    return null
  }
}

let misses = 0
let lastScan = 0
let checking: Promise<void> | null = null
// scanNow: kayıtlı adreste PC yoksa hemen ağı tara (uygulama açılınca / öne gelince / "Şimdi eşitle"). Eskiden tarama
// ancak iki başarısız denemeden sonra (en az ~8 sn) başlıyordu: PC'nin adresi değiştiyse (modem yeni IP verdi)
// uygulamayı kısa süre açıp kapatan kullanıcının telefonu PC'yi hiç bulamıyor, günlerce eşitlenmiyordu.
function check(o: { scanNow?: boolean } = {}): Promise<void> {
  if (checking) return checking
  checking = doCheck(o).finally(() => {
    checking = null
  })
  return checking
}
async function doCheck(o: { scanNow?: boolean }) {
  const c = getConfig()
  if (!c || syncing) return
  const h = await hello(c.host)
  if (h && h.serverId === c.serverId) {
    misses = 0
    if (state.status === 'offline') {
      ArgusNative.markReachable().catch(() => {})
      // Eşitleme yarıda kalsa bile yeni telefon sürümü görünsün
      checkAppUpdate()
      await syncNow()
    } else if (state.pending > 0) await syncNow()
    return
  }
  markOffline()
  // PC'nin adresi değişmiş olabilir: ara sıra ağı tara, aynı ARGUS'u bul
  misses++
  if ((o.scanNow || misses >= 2) && Date.now() - lastScan > (o.scanNow ? 15_000 : 60_000)) {
    lastScan = Date.now()
    const { servers } = await ArgusNative.findServers({ hints: [], scan: true }).catch(() => ({ servers: [] as { host: string; serverId: string }[] }))
    const same = servers.find((s) => s.serverId === c.serverId)
    if (same) {
      if (same.host !== c.host) await saveConfig({ ...c, host: same.host })
      misses = 0
      ArgusNative.markReachable().catch(() => {})
      checkAppUpdate()
      await syncNow()
    }
  }
}

// "Şimdi eşitle": PC'yi (gerekirse ağı tarayarak) arar ve eşitler. Bağlanabildiyse true.
export async function reconnectNow(): Promise<boolean> {
  if (syncing) await syncing
  else if (state.status !== 'offline') await syncNow()
  else {
    if (checking) await checking
    if (state.status === 'offline') {
      lastScan = 0
      await check({ scanNow: true })
    }
  }
  return state.status === 'online'
}

// Bir kereye mahsus: eskiden her okuma (arama sözcüğü, tarih aralığı…) saklanıyordu — artık saklanmayanları sil
async function cleanCacheOnce() {
  try {
    if (await metaGet('cacheTemiz1')) return
    for (const k of await cacheAllKeys()) if (!shouldCache(k)) await cacheDelete(k)
    await metaSet('cacheTemiz1', Date.now())
  } catch (e) {
    console.error('telefondaki kopya temizlenemedi:', e)
  }
}

let started = false
export async function startConnection() {
  if (started) return
  started = true
  const last = await metaGet<number>('lastSync').catch(() => undefined)
  setState({
    lastSync: last ?? null,
    failed: ((await metaGet<unknown[]>('failed').catch(() => [])) ?? []).length,
    skipped: ((await metaGet<unknown[]>('skipped').catch(() => [])) ?? []).length,
  })
  await refreshPending()
  const c = getConfig()
  if (c) await ArgusNative.setServer({ host: c.host, token: c.token }).catch(() => {})
  ArgusNative.addListener('prefetch', (e) => setState({ prefetch: e.done >= e.total ? null : e })).catch(() => {})
  ArgusNative.addListener('update', (e) => setState({ updating: e.percent })).catch(() => {})
  cleanCacheOnce()
  check({ scanNow: true })
  setInterval(() => {
    if (document.visibilityState === 'visible') check()
  }, 8000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check({ scanNow: true }))
  // Arka plandan dönüş: WebView her zaman "visibilitychange" göndermeyebiliyor — Android'in kendi bildirimi de dinlenir
  App.addListener('resume', () => check({ scanNow: true })).catch(() => {})
}
