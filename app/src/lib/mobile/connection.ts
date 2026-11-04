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
import { cacheGet, cacheKeys, cacheSet, metaGet, metaSet, queueAll, queueCount, queueDelete, type QueuedOp } from './store'
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
    case 'koleksiyon.json': {
      const boards = ((await cacheGet<{ id: string }[]>(`${base}/boards`)) ?? []).map((b) => `${base}/koleksiyon/${b.id}`)
      return boards
    }
    case 'songs.json':
      return cacheKeys(`${base}/songs/`)
    default:
      return []
  }
}

async function fetchAndStore(path: string) {
  const r = await pcRequest(path, { timeoutMs: 60000 })
  if (r.status === 200) await cacheSet(path, r.data)
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
    if (r.status >= 400) {
      const failed = ((await metaGet<unknown[]>('failed')) ?? []).slice(-49)
      await metaSet('failed', [...failed, { op, status: r.status, error: (r.data as { error?: string })?.error ?? null, t: Date.now() }])
      setState({ failed: failed.length + 1 })
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

type Manifest = { serverId: string; files: Record<string, { m: number; s: number }> }

async function pull(full: boolean) {
  const r = await pcRequest('/api/sync/manifest')
  if (r.status !== 200) throw new NetworkError('manifest ' + r.status)
  const next = r.data as Manifest
  const prev = full ? null : await metaGet<Manifest>('manifest')
  // boards önce (koleksiyon adresleri ona bakıyor)
  const changed = Object.keys(next.files)
    .filter((f) => !prev || prev.files[f]?.m !== next.files[f].m || prev.files[f]?.s !== next.files[f].s)
    .sort((a, b) => Number(b.endsWith('boards.json')) - Number(a.endsWith('boards.json')))
  for (const f of changed) for (const p of await pathsForFile(f)) await fetchAndStore(p)
  if (full) {
    // Dosyası olmayan ama ekranların ilk açılışta istediği okumalar
    const profiles = (await cacheGet<{ id: string }[]>('/api/profiles')) ?? []
    for (const p of profiles) {
      for (const s of ['/home-settings', '/watched', '/notifications', '/recent-watch', '/templates']) {
        const key = `/api/profiles/${p.id}${s}`
        if ((await cacheGet(key)) === undefined) await fetchAndStore(key).catch(() => {})
      }
    }
    await fetchAndStore('/api/features').catch(() => {})
  }
  await metaSet('manifest', next)
  return changed.length
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
      const changed = await pull(Boolean(opts.full) || !(await metaGet('manifest')))
      const now = Date.now()
      await metaSet('lastSync', now)
      setState({ status: 'online', lastSync: now })
      if (changed) {
        notifyDataChanged()
        window.dispatchEvent(new Event('argus-notifications'))
      }
      prefetchPosters()
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
  check()
  setInterval(() => {
    if (document.visibilityState === 'visible') check()
  }, 8000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
}
