// ARGUS Android: PC ile bağlantı ve eşitleme. Kullanıcı "telefondan değiştirdiğim şeyi telefon hafızasında
// tutsun, PC'ye bağlanınca ikisi aynı ağda olunca iletişimi kursun, bunlar bunlar değişti desin" dedi.
//
//   - Eşleşme bilgisi (PC adresi, anahtar) localStorage'da "mobil.server" (argus_ ile başlamıyor: uiPrefs
//     onu PC'ye göndermesin) ve Java tarafında (görseller için, ArgusNative.setServer).
//   - Birkaç saniyede bir PC'ye "orada mısın" denir. Ulaşılınca: önce bekleyen değişiklikler sırayla gönderilir
//     (sunucu kendi kurallarını uygular, aynısı iki kez işlenmez — bkz. server/sync.js), sonra PC'de değişen
//     dosyalara karşılık gelen veriler yeniden çekilir (manifest).
//   - PC'nin adresi değiştiyse (modem yeni IP verdi) aynı ağda taranıp aynı ARGUS (serverId) bulunur.
import { CapacitorHttp } from '@capacitor/core'
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

let state: MobileState = { status: 'offline', pending: 0, lastSync: null, failed: 0, prefetch: null, update: null, updating: null }
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
  let data: unknown = undefined
  if (o.body !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
    try {
      data = JSON.parse(o.body)
    } catch {
      data = o.body
    }
  }
  const t = o.timeoutMs ?? 15000
  try {
    const r = await CapacitorHttp.request({
      url: `http://${host}:${PORT}${path}`,
      method: o.method ?? 'GET',
      headers,
      data,
      connectTimeout: Math.min(t, 4000),
      readTimeout: t,
    })
    return { status: r.status, headers: r.headers ?? {}, data: r.data }
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

async function fetchAndStore(path: string) {
  const r = await pcRequest(path, { timeoutMs: 60000 })
  if (r.status === 200) await storeFromPc(path, r.data)
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
    if ([401, 403, 429, 502, 503, 504].includes(r.status)) return false
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
    headers: { 'X-Argus-Op-Id': op.id, 'X-Argus-Op-At': String(op.at) },
  })
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

type Manifest = { serverId: string; files: Record<string, { m: number; s: number }> }

async function pull(full: boolean): Promise<{ changed: number; rows: boolean }> {
  const r = await pcRequest('/api/sync/manifest')
  if (r.status !== 200) throw new NetworkError('manifest ' + r.status)
  const next = r.data as Manifest
  const prev = full ? null : await metaGet<Manifest>('manifest')
  // boards önce (koleksiyon adresleri ona bakıyor)
  const changed = Object.keys(next.files)
    .filter((f) => !prev || prev.files[f]?.m !== next.files[f].m || prev.files[f]?.s !== next.files[f].s)
    .sort((a, b) => Number(b.endsWith('boards.json')) - Number(a.endsWith('boards.json')))
  for (const f of changed) for (const p of await pathsForFile(f)) await fetchAndStore(p)
  // Bekleyen değişikliği silinen / PC'de uygulanamayan adresler (bkz. markRefetch)
  const refetch = (await metaGet<string[]>('refetch')) ?? []
  for (const k of refetch) for (const p of k.endsWith('/') ? await cacheKeys(k) : [k]) await fetchAndStore(p).catch(() => {})
  // Bu arada eklenenler kalsın
  if (refetch.length) await withLock(async () => metaSet('refetch', ((await metaGet<string[]>('refetch')) ?? []).filter((k) => !refetch.includes(k))))
  if (full) {
    // Dosyası olmayan ama ekranların ilk açılışta istediği okumalar
    const profiles = (await cacheGet<{ id: string }[]>('/api/profiles')) ?? []
    for (const p of profiles) {
      for (const s of ['/home-settings', '/watched', '/notifications', '/recent-watch', '/templates', '/aklimda', '/biletler']) {
        const key = `/api/profiles/${p.id}${s}`
        if ((await cacheGet(key)) === undefined) await fetchAndStore(key).catch(() => {})
      }
    }
    await fetchAndStore('/api/features').catch(() => {})
  }
  await metaSet('manifest', next)
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
async function check() {
  const c = getConfig()
  if (!c || syncing) return
  const h = await hello(c.host)
  if (h && h.serverId === c.serverId) {
    misses = 0
    if (state.status === 'offline') {
      ArgusNative.markReachable().catch(() => {})
      await syncNow()
    } else if (state.pending > 0) await syncNow()
    return
  }
  markOffline()
  // PC'nin adresi değişmiş olabilir: ara sıra ağı tara, aynı ARGUS'u bul
  misses++
  if (misses >= 2 && Date.now() - lastScan > 60_000) {
    lastScan = Date.now()
    const { servers } = await ArgusNative.findServers({ hints: [], scan: true }).catch(() => ({ servers: [] as { host: string; serverId: string }[] }))
    const same = servers.find((s) => s.serverId === c.serverId)
    if (same && same.host !== c.host) {
      await saveConfig({ ...c, host: same.host })
      await syncNow()
    }
  }
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
  setState({ lastSync: last ?? null, failed: ((await metaGet<unknown[]>('failed').catch(() => [])) ?? []).length })
  await refreshPending()
  const c = getConfig()
  if (c) await ArgusNative.setServer({ host: c.host, token: c.token }).catch(() => {})
  ArgusNative.addListener('prefetch', (e) => setState({ prefetch: e.done >= e.total ? null : e })).catch(() => {})
  ArgusNative.addListener('update', (e) => setState({ updating: e.percent })).catch(() => {})
  cleanCacheOnce()
  check()
  setInterval(() => {
    if (document.visibilityState === 'visible') check()
  }, 8000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
}
