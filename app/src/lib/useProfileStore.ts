import { useCallback, useEffect, useRef, useState } from 'react'
import type { OdulData, OdulReward, OdulTier } from './api'
import { useProfiles } from '../hooks/useProfiles'

// Profil başına küçük JSON kayıtları için hook (v1.25): sunucudaki /api/profiles/<id>/store/<ad>. Ödüller'in
// tamamlanan setleri ('odul-setler') ve "Birlikte izledik" etiketleri ('birlikte-izledik') burada durur.
// lib/api.ts'teki profil yollarıyla aynı biçim; profil id'si useProfiles'tan gelir.

const storeUrl = (profileId: string, name: string) => `/api/profiles/${encodeURIComponent(profileId)}/store/${name}`

async function getJson<T extends object>(profileId: string, name: string): Promise<T> {
  const res = await fetch(storeUrl(profileId, name))
  if (res.status === 404) return {} as T
  if (!res.ok) throw new Error(`store ${res.status}`)
  const body = (await res.json()) as unknown
  return (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as T
}

async function putJson<T extends object>(profileId: string, name: string, data: T) {
  const res = await fetch(storeUrl(profileId, name), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  if (!res.ok) throw new Error(`store ${res.status}`)
}

const EVT = 'argus-store-degisti'

// Bir kaydı okur; değiştirince sunucuya yazar ve aynı kaydı kullanan diğer bileşenlere haber verir.
export function useStore<T extends object>(name: string, enabled = true) {
  const { activeProfileId } = useProfiles()
  const [data, setData] = useState<T | null>(null)
  const current = useRef(activeProfileId)
  useEffect(() => {
    current.current = activeProfileId
  }, [activeProfileId])
  const on = enabled && Boolean(activeProfileId)
  const load = useCallback(() => {
    if (!on || !activeProfileId) return
    const pid = activeProfileId
    getJson<T>(pid, name)
      .then((d) => {
        // Bu arada profil değiştiyse eski cevap yazılmasın
        if (pid === current.current) setData(d)
      })
      .catch(() => {
        if (pid === current.current) setData((d) => d ?? ({} as T))
      })
  }, [on, activeProfileId, name])
  useEffect(() => {
    setData(null)
    load()
    const h = (e: Event) => {
      if ((e as CustomEvent<string>).detail === name) load()
    }
    window.addEventListener(EVT, h)
    return () => window.removeEventListener(EVT, h)
  }, [load, name])
  // Yazmadan önce sunucudaki en güncel hali okunur (başka cihazda eklenenler silinmesin)
  const update = useCallback(
    async (fn: (cur: T) => T) => {
      if (!activeProfileId) return null
      const cur = await getJson<T>(activeProfileId, name)
      const next = fn(cur)
      await putJson(activeProfileId, name, next)
      setData(next)
      window.dispatchEvent(new CustomEvent(EVT, { detail: name }))
      return next
    },
    [activeProfileId, name],
  )
  return { data, update, reload: load }
}

// Paket açılışı (H7): istemcinin bildiği açılmış paket sayısı da gider; başka cihazda açıldıysa sunucu 409 döner.
export class PackConflict extends Error {
  data: OdulData | null
  constructor(data: OdulData | null) {
    super('conflict')
    this.data = data
  }
}
export async function openPackRequest(profileId: string, body: { tier: OdulTier; opId: string; pity: number; rewards: OdulReward[]; expectOpened: number }): Promise<OdulData> {
  const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/oduller`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'open', ...body }),
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  if (res.status === 409) throw new PackConflict((json as { data?: OdulData } | null)?.data ?? null)
  if (!res.ok) throw new Error((json as { error?: string } | null)?.error || `HTTP ${res.status}`)
  return json as OdulData
}
