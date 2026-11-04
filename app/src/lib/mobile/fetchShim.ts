// ARGUS Android: arayüzün "/api/..." istekleri buradan geçer (window.fetch sarılıyor — böylece api.ts ve
// doğrudan fetch kullanan yerler değişmeden çalışıyor).
//   - PC'ye bağlıyken: istek PC'ye gider, okuma cevapları telefonda saklanır.
//   - PC yokken: okumalar telefondaki kopyadan gelir; günlük değişiklikler kopyaya işlenir ve sıraya girer
//     (bkz. localApply.ts); diğerleri "PC'ye bağlıyken yapılabilir" diye reddedilir.
import { cacheGet, cacheSet, queueAdd, type QueuedOp } from './store'
import { applyOffline } from './localApply'
import { NetworkError, getConfig, getState, markOffline, pcRequest, refreshPending, sendOp, syncNow } from './connection'
import { tt } from '../i18n'

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  if (status === 204) return new Response(null, { status, headers })
  return new Response(data === undefined ? 'null' : typeof data === 'string' ? data : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

const errorResponse = (message: string, status = 503) => jsonResponse({ error: message }, status)

function opId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Telefonda PC'ye hiç gitmeyen adresler
function localOnly(method: string, path: string): Response | null {
  // Arayüz tercihleri telefonun kendisinde kalır (PC'deki tercihleri ezmesin)
  if (path.startsWith('/api/ui-prefs')) return jsonResponse(method === 'GET' ? { prefs: {} } : { ok: true })
  // PC'deki ARGUS'un kendi güncellemesi telefonu ilgilendirmiyor
  if (path.startsWith('/api/update-check')) return jsonResponse({ updateAvailable: false, commitsBehind: 0 })
  if (path.startsWith('/api/apply-update')) return errorResponse(tt('Bu işlem sadece PC\'deki ARGUS\'tan yapılabilir.'), 403)
  return null
}

// Arşiv yapısı gibi PC'ye bağlıyken okunmamış ama boş da olabilecek okumalar
const EMPTY_DEFAULTS: [RegExp, unknown][] = [
  [/\/notifications$/, { items: [] }],
  [/\/recent-watch$/, []],
  [/\/songs\/[^/]+$/, []],
  [/\/templates$/, []],
  [/\/tmdb-dismiss$/, []],
]

async function handleGet(path: string): Promise<Response> {
  if (getState().status === 'online') {
    try {
      const r = await pcRequest(path)
      if (r.status === 200 && r.data !== undefined) cacheSet(path, r.data).catch(() => {})
      return jsonResponse(r.data, r.status, pickHeaders(r.headers))
    } catch (e) {
      if (!(e instanceof NetworkError)) throw e
      markOffline()
    }
  }
  const cached = await cacheGet(path)
  if (cached !== undefined) return jsonResponse(cached)
  const def = EMPTY_DEFAULTS.find(([re]) => re.test(path.split('?')[0]))
  if (def) return jsonResponse(def[1])
  return errorResponse(tt('Bu bilgi telefonda yok. PC\'ye bağlanınca gelir.'))
}

function pickHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === 'x-argus-ask-rating') out['X-Argus-Ask-Rating'] = v
  return out
}

async function handleWrite(method: string, path: string, body: BodyInit | null | undefined): Promise<Response> {
  if (body !== undefined && body !== null && typeof body !== 'string') {
    // Dosya yükleme vb. — sadece PC'ye bağlıyken
    return errorResponse(tt('Bu işlem için PC\'ye bağlı olmalısın.'))
  }
  const op: QueuedOp = { id: opId(), at: Date.now(), method, path, body: body ?? undefined }
  if (getState().status === 'online' && getState().pending === 0) {
    try {
      const r = await sendOp(op)
      return jsonResponse(r.data, r.status, pickHeaders(r.headers))
    } catch (e) {
      if (!(e instanceof NetworkError)) throw e
      // İstek PC'ye ulaşmış ama cevap kaybolmuş olabilir — sıraya aynı kimlikle girer, PC ikinci kez uygulamaz.
      markOffline()
    }
  }
  const local = await applyOffline(op)
  if (!local) return errorResponse(tt('Bu işlem için PC\'ye bağlı olmalısın.'))
  await queueAdd(local.op)
  await refreshPending()
  if (getState().status === 'online') syncNow()
  return jsonResponse(local.response)
}

export function installFetchShim() {
  const orig = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const u = new URL(href, location.href)
    if (u.origin !== location.origin || !u.pathname.startsWith('/api/')) return orig(input, init)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const path = u.pathname + u.search
    const local = localOnly(method, path)
    if (local) return local
    if (!getConfig()) return errorResponse(tt('Telefon henüz bir PC\'ye bağlanmadı.'))
    if (method === 'GET') return handleGet(path)
    return handleWrite(method, path, init?.body)
  }
}
