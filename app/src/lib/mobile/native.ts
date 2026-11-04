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
  addListener(event: 'prefetch', fn: (e: { done: number; total: number }) => void): Promise<PluginListenerHandle>
  addListener(event: 'update', fn: (e: { percent: number }) => void): Promise<PluginListenerHandle>
}

export const ArgusNative = registerPlugin<ArgusNativePlugin>('ArgusNative')
