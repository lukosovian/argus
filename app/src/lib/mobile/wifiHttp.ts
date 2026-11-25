// H3: PC'ye giden istekler telefonun Wi-Fi ağı üzerinden (Java: ArgusPlugin.request → WifiAg). Eskiden Capacitor'ın
// kendi HTTP'si kullanılıyordu; Android'in "Wi-Fi zayıfsa mobil veriye geç" ayarı açıkken evdeki PC'ye giden
// istekler mobil veriden gitmeye çalışıp düşüyordu. Cevap biçimi CapacitorHttp ile aynı (JSON ise çözülmüş).
import { CapacitorHttp } from '@capacitor/core'
import { ArgusNative } from './native'

export interface WifiResponse {
  status: number
  headers: Record<string, string>
  data: unknown
}

function parse(headers: Record<string, string>, text: string): unknown {
  const ct = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''
  if (!ct.includes('json')) return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

let nativeMissing = false

// Ağ hatasında hata fırlatır (çağıran NetworkError'a çevirir).
export async function wifiRequest(o: { host: string; port: number; path: string; method: string; headers: Record<string, string>; body?: string; connectTimeout: number; readTimeout: number }): Promise<WifiResponse> {
  if (!nativeMissing) {
    try {
      const r = await ArgusNative.request({ host: o.host, path: o.path, method: o.method, headers: o.headers, body: o.body, connectTimeout: o.connectTimeout, readTimeout: o.readTimeout })
      return { status: r.status, headers: r.headers ?? {}, data: parse(r.headers ?? {}, r.data ?? '') }
    } catch (e) {
      // Eski telefon katmanı (yöntem yok): eskisi gibi Capacitor'ın HTTP'si
      if ((e as { code?: string })?.code !== 'UNIMPLEMENTED') throw e
      nativeMissing = true
    }
  }
  let data: unknown = undefined
  if (o.body !== undefined) {
    try {
      data = JSON.parse(o.body)
    } catch {
      data = o.body
    }
  }
  const r = await CapacitorHttp.request({
    url: `http://${o.host}:${o.port}${o.path}`,
    method: o.method,
    headers: o.headers,
    data,
    connectTimeout: o.connectTimeout,
    readTimeout: o.readTimeout,
  })
  return { status: r.status, headers: r.headers ?? {}, data: r.data }
}
