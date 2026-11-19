// Profile özel küçük JSON depoları (sunucuda /api/profiles/:id/store/:ad). Yeni, küçük ayarlar için
// (ör. 'abonelik' aylık ücretleri) ayrı uç nokta açmadan kullanılıyor. Ad: küçük harf, rakam, tire (en çok 40).
const NAME_RE = /^[a-z0-9-]{1,40}$/

function storeUrl(profileId: string, name: string) {
  if (!NAME_RE.test(name)) throw new Error(`geçersiz depo adı: ${name}`)
  return `/api/profiles/${encodeURIComponent(profileId)}/store/${name}`
}

// Depoyu okur; yoksa (ya da sunucu henüz bu uç noktayı bilmiyorsa) boş nesne döner
export async function readStore<T extends object>(profileId: string, name: string): Promise<Partial<T>> {
  const res = await fetch(storeUrl(profileId, name))
  if (res.status === 404) return {}
  if (!res.ok) throw new Error(`depo okunamadı (${res.status})`)
  const data = (await res.json()) as unknown
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Partial<T>) : {}
}

// Depoyu verilen JSON ile tamamen değiştirir
export async function writeStore<T extends object>(profileId: string, name: string, data: T): Promise<void> {
  const res = await fetch(storeUrl(profileId, name), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`depo kaydedilemedi (${res.status})`)
}
