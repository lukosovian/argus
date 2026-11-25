// ARGUS Android: telefonun kendi özellikleri — ana ekran kutusu (Y11), telefon bildirimleri (Y12/Y25),
// paylaş menüsü (Y13), simge kısayolları (Y15), arka plan eşitlemesi (G4), ev ağı izni (H18), eşleştirme
// bağlantısı (A8). main.tsx açılışta initNativeFeatures'ı çağırır.
import { App } from '@capacitor/app'
import { LocalNotifications } from '@capacitor/local-notifications'
import { ArgusNative, type NativeIntent } from './native'
import { getApiProfileId } from '../api'
import { loadPhoneData, upcomingEvents, widgetItems } from './phoneData'
import { tt } from '../i18n'

// ---- Telefon ayarları (sadece bu telefonda; PC'ye gitmez) ----
export interface PhonePrefs {
  yeniBolum: boolean
  vizyon: boolean
  gecmisYil: boolean
  arkaPlan: boolean
  biyometri: boolean
}
const PREFS_KEY = 'mobil.telefon'
// Kullanıcı istediği için açık; "geçmiş yıllarda bugün" sabah hatırlatması ise isteyene (Y25)
const DEFAULTS: PhonePrefs = { yeniBolum: true, vizyon: true, gecmisYil: false, arkaPlan: true, biyometri: true }
export function getPhonePrefs(): PhonePrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<PhonePrefs>) }
  } catch {
    return DEFAULTS
  }
}
export function setPhonePrefs(patch: Partial<PhonePrefs>) {
  const next = { ...getPhonePrefs(), ...patch }
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    /* yer yok */
  }
  if ('yeniBolum' in patch || 'vizyon' in patch || 'gecmisYil' in patch) refreshPhone({ askPermission: true })
  if ('arkaPlan' in patch) mirrorQueue()
  return next
}

// ---- Sayfa açma (uygulamanın dışından: kutu, kısayol, bildirim) ----
// React Router tarayıcının geçmişini dinliyor: adres değiştirilip "popstate" atılınca o sayfa çizilir.
export function navigateTo(path: string) {
  if (!path.startsWith('/')) return
  if (location.pathname + location.search === path) return
  history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
}

function whenProfile(): Promise<void> {
  return new Promise((resolve) => {
    if (getApiProfileId()) return resolve()
    const t = setInterval(() => {
      if (getApiProfileId()) {
        clearInterval(t)
        resolve()
      }
    }, 400)
  })
}

// ---- A8: PC'deki kare kod → argus://pair?host=…&port=…&code=… ----
export interface PairLink {
  host: string
  code: string
}
export function parsePairLink(text: string): PairLink | null {
  try {
    const u = new URL(text.trim())
    if (u.protocol !== 'argus:' || u.hostname !== 'pair') return null
    const host = (u.searchParams.get('host') ?? '').trim()
    const code = (u.searchParams.get('code') ?? '').replace(/\D/g, '')
    if (!/^[0-9a-z.:-]+$/i.test(host) || code.length !== 6) return null
    return { host, code }
  } catch {
    return null
  }
}
let pendingPair: PairLink | null = null
export function takePairLink(): PairLink | null {
  const p = pendingPair
  pendingPair = null
  return p
}

// ---- Y13 / Y15: dışarıdan gelen istekler ----
async function handleIntent(it: NativeIntent) {
  if (it.kind === 'share') {
    await whenProfile()
    openQuickAdd({ text: [it.subject, it.text].filter(Boolean).join('\n') })
    return
  }
  let u: URL
  try {
    u = new URL(it.url)
  } catch {
    return
  }
  const what = u.hostname
  if (what === 'pair') {
    const p = parsePairLink(it.url)
    if (p) {
      pendingPair = p
      window.dispatchEvent(new Event('argus-pair-link'))
    }
    return
  }
  await whenProfile()
  if (what === 'git') navigateTo(u.searchParams.get('yol') ?? '/')
  else if (what === 'ne-izlesem') {
    navigateTo('/')
    setTimeout(() => window.dispatchEvent(new Event('argus-ne-izlesem')), 300)
  } else if (what === 'ara') {
    // Arama kutusu Ctrl+K ile açılıyor (bkz. GlobalSearch)
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })), 300)
  } else if (what === 'ekle') openQuickAdd({ text: '', today: true })
}

async function drainIntents() {
  const { items } = await ArgusNative.takeIntents().catch(() => ({ items: [] as NativeIntent[] }))
  for (const it of items) handleIntent(it).catch((e) => console.error('telefon isteği:', e))
}

// Hızlı ekleme penceresi (paylaş menüsü, "Bugün izlediğimi ekle"): ayrı bir kökte çizilir (bkz. QuickAddSheet)
let quickAddHost: ((o: { text: string; today?: boolean }) => void) | null = null
const quickAddQueue: { text: string; today?: boolean }[] = []
export function registerQuickAdd(fn: typeof quickAddHost) {
  quickAddHost = fn
  if (fn) while (quickAddQueue.length) fn(quickAddQueue.shift()!)
}
function openQuickAdd(o: { text: string; today?: boolean }) {
  if (quickAddHost) quickAddHost(o)
  else {
    quickAddQueue.push(o)
    import('../../components/mobile/QuickAddSheet').then((m) => m.mountQuickAdd())
  }
}

// ---- Y11 + Y12/Y25: eşitleme bitince ve açılışta ----
const NOTIF_BASE = 41000
const NOTIF_MAX = 60
const CHANNEL = 'argus-yayin'
let permAsked = false
let refreshing: Promise<void> | null = null
let again = false

export function refreshPhone(o: { askPermission?: boolean } = {}): Promise<void> {
  if (refreshing) {
    again = true
    return refreshing
  }
  refreshing = (async () => {
    try {
      if (!getApiProfileId()) return
      const d = await loadPhoneData()
      if (!d) {
        await ArgusNative.setWidget({ items: [], empty: tt('Ana sayfa için bir arşiv seçince burada görünür.') }).catch(() => {})
        return
      }
      await ArgusNative.setWidget({ items: widgetItems(d), empty: tt('İzlemekte olduğun bir dizi yok. Bir yapımı "İzleniyor" yapınca burada sıradaki bölümü görürsün.') }).catch(() => {})
      await scheduleNotifications(upcomingEvents(d), o.askPermission === true)
    } catch (e) {
      console.error('telefon kutusu/bildirimleri güncellenemedi:', e)
    } finally {
      refreshing = null
      if (again) {
        again = false
        refreshPhone()
      }
    }
  })()
  return refreshing
}

function at(date: string, hour: number, minute = 0) {
  const d = new Date(date + 'T00:00:00')
  d.setHours(hour, minute, 0, 0)
  return d
}

async function scheduleNotifications(events: ReturnType<typeof upcomingEvents>, ask: boolean) {
  const p = getPhonePrefs()
  const wanted = events.filter((e) => p[e.kind])
  // Önce bizim eski planladıklarımız kaldırılır, sonra güncel liste yeniden kurulur
  const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] as { id: number }[] }))
  const ours = pending.notifications.filter((n) => n.id >= NOTIF_BASE && n.id < NOTIF_BASE + 1000)
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) }).catch(() => {})
  if (!wanted.length) return
  let perm = await LocalNotifications.checkPermissions().catch(() => ({ display: 'denied' as const }))
  // İzin bir kez (ya da ayar açılınca) sorulur — her açılışta sormasın
  if (perm.display !== 'granted' && (ask || !localStorage.getItem('mobil.bildirimIzniSoruldu')) && !permAsked) {
    permAsked = true
    localStorage.setItem('mobil.bildirimIzniSoruldu', '1')
    perm = await LocalNotifications.requestPermissions().catch(() => perm)
  }
  if (perm.display !== 'granted') return
  await LocalNotifications.createChannel({ id: CHANNEL, name: tt('Yeni bölüm ve vizyon'), description: tt('ARGUS telefon bildirimleri'), importance: 3, visibility: 1 }).catch(() => {})
  const now = Date.now()
  const list = wanted
    .map((e) => ({ e, when: e.kind === 'gecmisYil' ? at(e.date, 9, 30) : at(e.date, 10) }))
    .filter((x) => x.when.getTime() > now + 30_000)
    .slice(0, NOTIF_MAX)
  if (!list.length) return
  await LocalNotifications.schedule({
    notifications: list.map(({ e, when }, i) => ({
      id: NOTIF_BASE + i,
      title: e.title,
      body: e.body,
      schedule: { at: when, allowWhileIdle: true },
      channelId: CHANNEL,
      smallIcon: 'ic_stat_argus',
      iconColor: '#00c0fa',
      extra: { yol: e.yol },
    })),
  }).catch((err) => console.error('bildirim planlanamadı:', err))
}

// ---- G4: bekleyen değişikliklerin kopyası arka plan işine ----
let mirrorTimer: ReturnType<typeof setTimeout> | null = null
export function mirrorQueue() {
  if (mirrorTimer) clearTimeout(mirrorTimer)
  mirrorTimer = setTimeout(async () => {
    mirrorTimer = null
    try {
      const [{ getConfig }, { queueAll }] = await Promise.all([import('./connection'), import('./store')])
      const c = getConfig()
      if (!c) return
      const enabled = getPhonePrefs().arkaPlan
      const ops = enabled ? (await queueAll()).map(({ op }) => ({ id: op.id, at: op.at, method: op.method, path: op.path, ...(op.body !== undefined ? { body: op.body } : {}) })) : []
      await ArgusNative.setBackgroundSync({ enabled, serverId: c.serverId, ops })
    } catch (e) {
      console.error('arka plan eşitlemesi hazırlanamadı:', e)
    }
  }, 600)
}

// Arka plan işi PC'yi yeni bir adreste bulduysa (modem yeni IP verdi), uygulama eski adreste beklemesin
export async function adoptBackgroundHost() {
  try {
    const { getConfig, saveConfig } = await import('./connection')
    const c = getConfig()
    if (!c) return
    const info = await ArgusNative.backgroundInfo()
    if (info.host && info.host !== c.host && info.serverId === c.serverId) await saveConfig({ ...c, host: info.host })
  } catch {
    /* eski telefon katmanı */
  }
}

// H18: Android 17+ ev ağı izni (uygulama API 37'yi hedefleyince gerekir; o zamana kadar Android kendiliğinden verir)
export async function ensureLocalNetwork() {
  await ArgusNative.localNetworkPermission({ request: true }).catch(() => {})
}

let started = false
export async function initNativeFeatures(mode: 'pair' | 'app') {
  if (started) return
  started = true
  ArgusNative.addListener('intent', () => drainIntents()).catch(() => {})
  drainIntents()
  if (mode === 'pair') return

  LocalNotifications.addListener('localNotificationActionPerformed', async (a) => {
    const yol = (a.notification.extra as { yol?: string } | undefined)?.yol
    if (yol) {
      await whenProfile()
      navigateTo(yol)
    }
  }).catch(() => {})

  window.addEventListener('argus-sync-done', () => {
    refreshPhone()
    mirrorQueue()
  })
  // Açılışta: profil seçilince telefondaki kopyadan
  whenProfile().then(() => setTimeout(() => refreshPhone(), 1500))
  // Bekleyen değişiklik sayısı değiştikçe kopyası güncellensin; uygulama arka plana geçerken de
  import('./connection').then(({ subscribe }) => {
    let last = -1
    subscribe((s) => {
      if (s.pending !== last) {
        last = s.pending
        mirrorQueue()
      }
    })
  })
  App.addListener('pause', () => mirrorQueue()).catch(() => {})
  // Profil değişince kutu yeni profile göre
  let lastProfile = getApiProfileId()
  setInterval(() => {
    const p = getApiProfileId()
    if (p !== lastProfile) {
      lastProfile = p
      if (p) refreshPhone()
    }
  }, 3000)
  mirrorQueue()
}
