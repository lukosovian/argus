// Arayüz tercihlerinin sunucuyla eşitlenmesi. Tercihler (kapatılan sütunlar, tablo sıklığı, tema, TMDB
// tercihleri, "bir daha sorma"lar…) kodun her yerinde localStorage'a yazılıyor; ARGUS kendi uygulamasına
// (Electron) geçince uygulamanın hafızası tarayıcınınkinden ayrı olduğu için hepsi kaybolacaktı.
// Bu dosya, "argus_" ile başlayan localStorage yazmalarını sunucuya da gönderir (server: /api/ui-prefs) ve
// açılışta sunucudakileri yerel hafızaya yükler — böylece tek tek her kullanım yerini değiştirmeye gerek
// kalmadan uygulama ve tarayıcı aynı tercihleri görür. Sunucuda olmayan yerel tercihler (eski tarayıcı
// hafızası) açılışta bir kez yukarı gönderilir; bu da tarayıcıdaki eski tercihleri uygulamaya taşır.

// Önbellek niteliğindeki ve eski sürümlerden kalma (artık kullanılmayan) anahtarlar eşitlenmez
const SKIP = [/^argus_mood_pick_/, /^argus_demo_/, /^argus_active_profile_id$/]
const synced = (k: string) => k.startsWith('argus_') && !SKIP.some((re) => re.test(k))

let queue: { set: Record<string, string>; remove: Set<string> } = { set: {}, remove: new Set() }
let timer: ReturnType<typeof setTimeout> | null = null

function flush() {
  timer = null
  const body = { set: queue.set, remove: [...queue.remove] }
  queue = { set: {}, remove: new Set() }
  if (!Object.keys(body.set).length && !body.remove.length) return
  fetch('/api/ui-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {})
}
function schedule() {
  if (!timer) timer = setTimeout(flush, 400)
}

export async function initUiPrefs() {
  let ls: Storage
  try {
    ls = window.localStorage
  } catch {
    return
  }
  const origSet = Storage.prototype.setItem
  const origRemove = Storage.prototype.removeItem
  let server: Record<string, string> = {}
  try {
    const r = await fetch('/api/ui-prefs')
    if (r.ok) server = ((await r.json()) as { prefs?: Record<string, string> }).prefs ?? {}
  } catch {
    /* sunucuya ulaşılamadı — yerel hafızayla devam */
  }
  // Sunucudakiler yerel hafızaya (sunucu esas)
  for (const [k, v] of Object.entries(server)) {
    try {
      if (ls.getItem(k) !== v) origSet.call(ls, k, v)
    } catch {
      /* dolu/kapalı */
    }
  }
  // Sunucuda olmayan yerel tercihler bir kez yukarı (eski tarayıcı hafızasından taşıma)
  const up: Record<string, string> = {}
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i)
    if (k && synced(k) && !(k in server)) up[k] = ls.getItem(k) ?? ''
  }
  const migrate = new URLSearchParams(location.search).has('ayar-tasi')
  if (Object.keys(up).length || migrate)
    await fetch('/api/ui-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ set: up, migrate }) }).catch(() => {})

  // Bundan sonraki yazmalar sunucuya da gider
  Storage.prototype.setItem = function (k: string, v: string) {
    origSet.call(this, k, v)
    if (this === ls && synced(k)) {
      queue.set[k] = String(v)
      queue.remove.delete(k)
      schedule()
    }
  }
  Storage.prototype.removeItem = function (k: string) {
    origRemove.call(this, k)
    if (this === ls && synced(k)) {
      delete queue.set[k]
      queue.remove.add(k)
      schedule()
    }
  }
  window.addEventListener('pagehide', flush)
}
