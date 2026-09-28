import type { Board, CastMap, EpisodesMap, HomeSettings, Profile, Row, Template, WatchedMap } from '../types'
import type { HistoryDay, HistoryEntry } from './history'
import { pingNotifications, type AppNotification, type ShowInfo } from './notifications'
import { notifyDataChanged } from './dataEvents'

// TMDB'deki bir içeriğin kart bilgisi (Benzerler / Keşfet sonuçları).
// Seri / kişi sayfalarındaki kartlar: TMDB kartı + arşivdeki durumu
export interface ArchiveCard extends TmdbCard {
  rowId: string | null
  status: string | null
  watched: boolean
  character?: string
}
export interface PersonInfo {
  id: number
  name: string
  bio: string
  birthday: string
  deathday: string
  place: string
  image: string | null
  department: string
}

// Koleksiyon (bkz. pages/Koleksiyon.tsx): kullanıcının eklediği semboller, raf adları ve raf değişiklikleri.
// items[rowId].shelf: kaydın elle seçilen rafı ('' = rafsız); yoksa raf kendiliğinden bulunur.
export interface KoleksiyonData {
  items: Record<string, { image?: string; shelf?: string }>
  shelves: Record<string, { image?: string; name?: string }>
}
export interface KoleksiyonInfo {
  collections: Record<string, { id: number; name: string }>
  mediaTypes: Record<string, 'movie' | 'tv'>
  pending: { done: number; total: number } | null
  data: KoleksiyonData
}
export type KoleksiyonPatch = {
  items?: Record<string, { image?: string | null; shelf?: string | null } | null>
  shelves?: Record<string, { image?: string | null; name?: string | null } | null>
}

export interface BackupInfo {
  settings: { target: string; auto: 'off' | 'daily' | 'weekly'; keep: number; lastAt: number | null; lastError: string | null }
  snapshots: string[]
  job: { kind: 'backup' | 'restore'; running: boolean; phase: string; done: number; total: number; error: string | null; result: unknown } | null
  suggestions: { label: string; path: string }[]
  targetExists: boolean
}

export interface TmdbCard {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  title: string
  originalTitle: string
  year: string
  poster: string | null
  backdrop?: string | null
  overview: string
  rating: number | null
  inArchive?: boolean
}

export interface WatchProvider {
  name: string
  logo: string | null
}

export interface WatchProviders {
  link: string | null
  flatrate: WatchProvider[]
  free: WatchProvider[]
  rent: WatchProvider[]
  buy: WatchProvider[]
}

// Arşivde olmayan tek bir TMDB içeriğinin önizlemesi (Ne İzlesem'in TMDB modu).
export interface TmdbItem extends TmdbCard {
  logo: string | null
  trailer: string | null
  genres: string[]
  runtime: number | null
  seasons: number | null
  providers: WatchProviders | null
}

export interface TmdbExtras {
  needsApiKey?: boolean
  notFound?: boolean
  providers?: WatchProviders | null
  similar?: TmdbCard[]
}

export interface EpisodeRef {
  season: number
  episode: number
  name: string
  airDate: string
}

export interface NewEpisodeItem {
  rowId: string
  tracking: boolean
  unwatchedCount: number
  nextToWatch: { season: number; episode: number } | null
  latest: EpisodeRef
  latestIsNew: boolean
  upcoming: EpisodeRef | null
}

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
  // Sunucu bir kaydın yeni İzlendi olduğunu ve puanının boş olduğunu söylüyorsa puan penceresi açılsın
  // (bkz. RatePrompt.tsx, server/index.js'teki shouldAskRating).
  const ask = res.headers.get('X-Argus-Ask-Rating')
  if (ask) {
    try {
      window.dispatchEvent(new CustomEvent('argus-ask-rating', { detail: JSON.parse(decodeURIComponent(ask)) }))
    } catch {
      // bozuk başlık — önemsiz
    }
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
  // Sunucu, dizinin çıkmış bütün bölümleri işaretlenince durumu kendiliğinden İzlendi yapıyor
  // (autoWatched) — o zaman açık ekranlar yenilensin ve zil baksın.
  saveRowWatched: async (rowId: string, map: Record<string, string[]>) => {
    const res = await request<{
      ok: true
      autoWatched?: { title: string; boardId: string } | null
      autoWatching?: { title: string; boardId: string } | null
    }>(profilePath(`/watched/${rowId}`), {
      method: 'PUT',
      ...json(map),
    })
    const changed = res.autoWatched ?? res.autoWatching
    if (changed) {
      notifyDataChanged(changed.boardId)
      pingNotifications()
    }
    return res
  },
  getNotifications: () => request<{ items: AppNotification[] }>(profilePath('/notifications')),
  markNotificationsRead: (ids?: string[]) =>
    request<{ ok: true }>(profilePath('/notifications/read'), { method: 'POST', ...json(ids ? { ids } : {}) }),
  clearNotifications: () => request<{ ok: true }>(profilePath('/notifications'), { method: 'DELETE' }),
  getShowStatus: () => request<Record<string, ShowInfo>>(profilePath('/show-status')),
  fetchTmdb: (boardId: string, rowId: string, exclude: string[] = [], overwrite = false) =>
    request<{ ok: true; mediaType: 'movie' | 'tv'; filled: string[]; newEpisodes: number; newActors: number }>(
      profilePath(`/fetch-tmdb/${boardId}/${rowId}`),
      { method: 'POST', ...json({ exclude, overwrite }) },
    ),

  // ---- TMDB keşif özellikleri (bkz. server/index.js'teki "TMDB tabanlı keşif" bölümü) ----
  getTmdbExtras: (boardId: string, rowId: string) =>
    request<TmdbExtras>(profilePath(`/tmdb-extras/${boardId}/${rowId}`)),
  addFromTmdb: (
    boardId: string,
    item: { tmdbId: number; mediaType: 'movie' | 'tv'; status: 'izlenecek' | 'izlendi'; watchedDate?: string; rating?: number; exclude?: string[] },
  ) => request<{ ok: true; rowId: string; title: string; filled: boolean }>(profilePath(`/tmdb-add/${boardId}`), { method: 'POST', ...json(item) }),
  getTmdbGenres: (type: 'movie' | 'tv') =>
    request<{ genres: { id: number; name: string }[]; needsApiKey?: boolean }>(profilePath(`/tmdb-genres?type=${type}`)),
  discoverTmdb: (
    boardId: string,
    query: {
      type: 'movie' | 'tv'
      genreIds: number[]
      excludeGenreIds?: number[]
      count: number
      sort: 'popular' | 'top' | 'new'
      random?: boolean
    },
  ) =>
    request<{ items: TmdbCard[] }>(profilePath(`/tmdb-discover/${boardId}`), { method: 'POST', ...json(query) }),
  dismissTmdb: (item: { tmdbId: number; mediaType: 'movie' | 'tv' }) =>
    request<{ ok: true; count: number }>(profilePath('/tmdb-dismiss'), { method: 'POST', ...json(item) }),
  getDismissedCount: () => request<{ count: number }>(profilePath('/tmdb-dismiss')),
  resetDismissed: () => request<{ ok: true }>(profilePath('/tmdb-dismiss'), { method: 'DELETE' }),
  getTmdbItem: (boardId: string, mediaType: 'movie' | 'tv', tmdbId: number) =>
    request<TmdbItem>(profilePath(`/tmdb-item/${boardId}/${mediaType}/${tmdbId}`)),
  getNewEpisodes: (boardId: string) => request<{ items: NewEpisodeItem[] }>(profilePath(`/new-episodes/${boardId}`)),

  // Profile bağlı değil — ARGUS klasörünün git durumuna göre (bkz. server/index.js).
  checkUpdate: () => request<{ updateAvailable: boolean; commitsBehind: number }>('/api/update-check'),
  // Sunucu kodu hemen çeker, sonra kendini kapatıp yerine yeni bir ARGUS.bat başlatır — bu
  // yüzden istek "tamamlanmadan" bağlantı kopabilir, çağıran taraf bunu normal karşılamalı
  // (bkz. useUpdateCheck.ts).
  applyUpdate: () => request<{ ok: true }>('/api/apply-update', { method: 'POST' }),

  // Arşiv geçmişi (bkz. server/history.js)
  getHistoryDays: (boardId: string) => request<{ days: HistoryDay[] }>(profilePath(`/history/${boardId}/days`)),
  getHistoryDay: (boardId: string, day: string) =>
    request<{ entries: HistoryEntry[] }>(profilePath(`/history/${boardId}/day/${encodeURIComponent(day)}`)),
  getRowHistory: (boardId: string, rowId: string) => request<{ entries: HistoryEntry[] }>(profilePath(`/history/${boardId}/row/${rowId}`)),
  undoHistory: (boardId: string, entryId: string) =>
    request<{ ok: true }>(profilePath(`/history/${boardId}/undo`), { method: 'POST', ...json({ entryId }) }),
  restoreHistoryDay: (boardId: string, day: string) =>
    request<{ ok: true; count: number }>(profilePath(`/history/${boardId}/restore-day`), { method: 'POST', ...json({ day }) }),
  // Yedekleme (bkz. server/backup.js) — profile bağlı değil, bütün veriyi kapsar.
  getBackup: () => request<BackupInfo>('/api/backup'),
  // Flashback (yıllık özet): dizilerin bölüm süreleri (TMDB'den arka planda öğrenilir) ve kaydedilmiş izleme saatleri
  // Son izleme verisi girilen kayıtlar, en yeni önce (Takvim'in hızlı seçimi için)
  getRecentWatch: () => request<{ rowId: string; t: number }[]>(profilePath('/recent-watch')),
  getFlashback: (boardId: string, year: string) =>
    request<{ runtimes: Record<string, number>; hours: number[]; timed: number; pending: { done: number; total: number } | null }>(
      profilePath(`/flashback/${boardId}?year=${year}`),
    ),
  getKoleksiyon: (boardId: string) => request<KoleksiyonInfo>(profilePath(`/koleksiyon/${boardId}`)),
  saveKoleksiyon: (patch: KoleksiyonPatch) => request<KoleksiyonData>(profilePath('/koleksiyon'), { method: 'POST', ...json(patch) }),
  // İnternetteki bir görseli medya klasörüne indirir (Koleksiyon'da adres yapıştırarak sembol ekleme)
  medyaFromUrl: (url: string) => request<{ filename: string }>('/api/medya/from-url', { method: 'POST', ...json({ url }) }),
  getCollection: (boardId: string, rowId: string) =>
    request<{ collection: { id: number; name: string; backdrop: string | null } | null; parts?: (ArchiveCard & { released: boolean; releaseDate: string })[] }>(
      profilePath(`/collection/${boardId}/${rowId}`),
    ),
  getPerson: (boardId: string, name: string, role: 'acting' | 'directing') =>
    request<{ person: PersonInfo | null; inArchive: ArchiveCard[]; notInArchive: ArchiveCard[]; needsApiKey?: boolean }>(
      profilePath(`/person/${boardId}?name=${encodeURIComponent(name)}&role=${role}`),
    ),
  saveBackupSettings: (patch: { target?: string; auto?: 'off' | 'daily' | 'weekly'; keep?: number }) =>
    request<{ ok: true }>('/api/backup/settings', { method: 'POST', ...json(patch) }),
  runBackup: () => request<{ ok: true }>('/api/backup/run', { method: 'POST', ...json({}) }),
  restoreBackup: (snapshot: string) => request<{ ok: true }>('/api/backup/restore', { method: 'POST', ...json({ snapshot }) }),
  getHistoryStatus: () => request<{ bytes: number; limitBytes: number; over: boolean }>('/api/history/status'),
  setHistoryLimit: (limitBytes: number) => request<{ ok: true }>('/api/history/limit', { method: 'POST', ...json({ limitBytes }) }),
  trimHistory: () => request<{ ok: true; removed: number; bytes: number }>('/api/history/trim', { method: 'POST', ...json({}) }),

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
