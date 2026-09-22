import type { Board, CastMap, EpisodesMap, HomeSettings, Profile, Row, Template, WatchedMap } from '../types'

// Yerel sunucuyla konuşan tek nokta. Vite dev sunucusu /api ve /medya
// isteklerini otomatik olarak arka plandaki Node sunucusuna (server/index.js) yönlendirir.
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    let message = `Sunucu isteği başarısız oldu (${res.status}). Yerel sunucu çalışıyor mu?`
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      // yanıt JSON değildi — genel mesaj kalsın
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function json(body: unknown): RequestInit {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

// Her profilin (Netflix'teki "kim izliyor" gibi) kendi board/satır/ayar verisi var —
// board/row/home-settings/cast/episodes uç noktaları hep `/api/profiles/<id>/...` altında.
// Bunu her hook'a tek tek parametre olarak taşımak yerine, ProfilesProvider aktif profil
// değiştikçe burayı güncelliyor; api.ts bu tek yerden okuyor.
let activeProfileId: string | null = null

export function setApiProfileId(id: string | null) {
  activeProfileId = id
}

function profilePath(suffix: string): string {
  if (!activeProfileId) throw new Error('Aktif bir profil seçilmeden bu işlem yapılamaz.')
  return `/api/profiles/${activeProfileId}${suffix}`
}

export const api = {
  getBoards: () => request<Board[]>(profilePath('/boards')),
  createBoard: (data: Omit<Board, 'id'>) => request<{ id: string }>(profilePath('/boards'), { method: 'POST', ...json(data) }),
  patchBoard: (id: string, patch: Partial<Omit<Board, 'id'>>) =>
    request<Board>(profilePath(`/boards/${id}`), { method: 'PATCH', ...json(patch) }),
  deleteBoard: (id: string) => request<{ ok: true }>(profilePath(`/boards/${id}`), { method: 'DELETE' }),

  getRows: (boardId: string) => request<Row[]>(profilePath(`/boards/${boardId}/rows`)),
  createRow: (boardId: string, data: Omit<Row, 'id'>) =>
    request<Row>(profilePath(`/boards/${boardId}/rows`), { method: 'POST', ...json(data) }),
  updateRow: (boardId: string, id: string, data: Omit<Row, 'id'>) =>
    request<Row>(profilePath(`/boards/${boardId}/rows/${id}`), { method: 'PUT', ...json(data) }),
  deleteRow: (boardId: string, id: string) =>
    request<{ ok: true }>(profilePath(`/boards/${boardId}/rows/${id}`), { method: 'DELETE' }),
  bulkAddRows: (boardId: string, items: Omit<Row, 'id'>[]) =>
    request<{ ok: true; count: number }>(profilePath(`/boards/${boardId}/rows/bulk`), { method: 'POST', ...json(items) }),
  // Bir sütunun değerini TÜM satırlarda tek seferde boşaltır (ör. Banner'ları silip API'den
  // yeniden çektirmek için) — kullanıcı "genel olarak olsun... bi sütunun altındaki
  // satırlardakileri komple silebilmek" dedi, sadece Seçim/Çoklu Seçim'e özel değil.
  clearColumn: (boardId: string, propertyId: string) =>
    request<{ ok: true; count: number }>(profilePath(`/boards/${boardId}/clear-column/${propertyId}`), { method: 'POST' }),
  getBoardHealth: (boardId: string) =>
    request<{ brokenImages: { rowId: string; propertyId: string; propertyName: string; value: string }[] }>(
      profilePath(`/boards/${boardId}/health`),
    ),

  // Profillerin kendisi (isim/fotoğraf) profile-scoped DEĞİL — hepsi ortak, aktif profil
  // seçilmeden de listelenebilmesi/oluşturulabilmesi gerekiyor (kim izliyor ekranı için).
  getProfiles: () => request<Profile[]>('/api/profiles'),
  createProfile: (data: Omit<Profile, 'id'>) => request<Profile>('/api/profiles', { method: 'POST', ...json(data) }),
  updateProfile: (id: string, data: Omit<Profile, 'id'>) =>
    request<Profile>(`/api/profiles/${id}`, { method: 'PUT', ...json(data) }),
  deleteProfile: (id: string) => request<{ ok: true }>(`/api/profiles/${id}`, { method: 'DELETE' }),

  getHomeSettings: () => request<HomeSettings | null>(profilePath('/home-settings')),
  saveHomeSettings: (settings: HomeSettings) =>
    request<{ ok: true }>(profilePath('/home-settings'), { method: 'PUT', ...json(settings) }),

  getTemplates: () => request<Template[]>(profilePath('/templates')),
  createTemplate: (data: Omit<Template, 'id'>) => request<Template>(profilePath('/templates'), { method: 'POST', ...json(data) }),
  deleteTemplate: (id: string) => request<{ ok: true }>(profilePath(`/templates/${id}`), { method: 'DELETE' }),

  getApiKey: () => request<{ tmdbApiKey: string }>(profilePath('/api-key')),
  saveApiKey: (tmdbApiKey: string) => request<{ ok: true }>(profilePath('/api-key'), { method: 'PUT', ...json({ tmdbApiKey }) }),

  getCast: () => request<CastMap>(profilePath('/cast')),
  getEpisodes: () => request<EpisodesMap>(profilePath('/episodes')),
  getWatched: () => request<WatchedMap>(profilePath('/watched')),
  saveRowWatched: (rowId: string, map: Record<string, string[]>) =>
    request<{ ok: true }>(profilePath(`/watched/${rowId}`), { method: 'PUT', ...json(map) }),
  fetchTmdb: (boardId: string, rowId: string, exclude: string[] = [], overwrite = false) =>
    request<{ ok: true; mediaType: 'movie' | 'tv'; filled: string[]; newEpisodes: number; newActors: number }>(
      profilePath(`/fetch-tmdb/${boardId}/${rowId}`),
      { method: 'POST', ...json({ exclude, overwrite }) },
    ),

  // Profile bağlı değil — ARGUS klasörünün git durumuna göre (bkz. server/index.js).
  checkUpdate: () => request<{ updateAvailable: boolean; commitsBehind: number }>('/api/update-check'),
  // Sunucu kodu hemen çeker, sonra kendini kapatıp yerine yeni bir ARGUS.bat başlatır — bu
  // yüzden istek "tamamlanmadan" bağlantı kopabilir, çağıran taraf bunu normal karşılamalı
  // (bkz. useUpdateCheck.ts).
  applyUpdate: () => request<{ ok: true }>('/api/apply-update', { method: 'POST' }),

  // Medya klasörü tüm profiller arasında ortak (görsel dosyaları profile özel değil).
  getMedyaFiles: () => request<string[]>('/api/medya'),
  uploadMedya: async (file: File): Promise<{ filename: string }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/medya/upload', { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Dosya yüklenemedi (${res.status})`)
    return res.json()
  },
}
