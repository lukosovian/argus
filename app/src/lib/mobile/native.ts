// ARGUS Android uygulamasında mıyız, ve telefonun kendisine (Java: mobile/android/.../ArgusPlugin.java) erişim.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export function isMobileApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export interface FoundServer {
  host: string
  serverId: string
  pcName: string
  version: string
}

export type NativeIntent = { kind: 'share'; text: string; subject: string } | { kind: 'url'; url: string }

interface ArgusNativePlugin {
  setServer(o: { host: string; token: string }): Promise<void>
  clearServer(): Promise<void>
  markReachable(): Promise<void>
  findServers(o: { hints: string[]; scan: boolean }): Promise<{ servers: FoundServer[]; ips: string[] }>
  prefetch(o: { paths: string[] }): Promise<{ missing: number }>
  mediaInfo(): Promise<{ count: number; bytes: number }>
  clearMedia(): Promise<void>
  appVersion(): Promise<{ version: string; code: number }>
  installUpdate(): Promise<{ needsPermission?: boolean; started?: boolean }>
  // H3: PC'ye istek, Wi-Fi ağına bağlı (bkz. WifiAg.java). Ağ hatası → reject (code NETWORK)
  request(o: { host: string; path: string; method?: string; headers?: Record<string, string>; body?: string; connectTimeout?: number; readTimeout?: number }): Promise<{ status: number; headers: Record<string, string>; data: string }>
  // H18: Android 17+ ev ağı izni (uygulama API 37'yi hedefleyene kadar needed=false)
  localNetworkPermission(o: { request?: boolean }): Promise<{ state: 'granted' | 'prompt'; needed: boolean }>
  // Y11: ana ekran kutusu
  setWidget(o: { items: { title: string; sub: string; poster?: string; yol: string }[]; empty?: string }): Promise<void>
  // G4: arka plan eşitlemesi (bekleyen değişikliklerin kopyası) ve durumu
  setBackgroundSync(o: { enabled: boolean; serverId?: string; ops?: { id: string; at: number; method: string; path: string; body?: string }[] }): Promise<void>
  backgroundInfo(): Promise<{ host: string | null; serverId: string | null; lastRun: number; lastReach: number; sent: number; sentAt: number; pending: number }>
  // Y13/Y15: paylaş menüsü, kısayollar, kutu ve bildirimlerden gelen istekler
  takeIntents(): Promise<{ items: NativeIntent[] }>
  // Y24
  biometricAvailable(): Promise<{ available: boolean }>
  biometricAuth(o: { title: string; subtitle?: string; cancel: string }): Promise<{ ok: boolean; code?: number; error?: string }>
  // A8
  scanQr(): Promise<{ text?: string; cancelled?: boolean }>
  // v1.27 T2: yazı boyutu (WebView textZoom, yüzde); T3: sesle arama (telefonun ses tanıma penceresi)
  setTextZoom(o: { percent: number }): Promise<{ percent: number }>
  getTextZoom(): Promise<{ percent: number }>
  voiceAvailable(): Promise<{ available: boolean }>
  voiceSearch(o: { lang?: string; prompt?: string }): Promise<{ text?: string; cancelled?: boolean }>
  addListener(event: 'intent', fn: () => void): Promise<PluginListenerHandle>
  addListener(event: 'prefetch', fn: (e: { done: number; total: number }) => void): Promise<PluginListenerHandle>
  addListener(event: 'update', fn: (e: { percent: number }) => void): Promise<PluginListenerHandle>
}

export const ArgusNative = registerPlugin<ArgusNativePlugin>('ArgusNative')
