import type { Board, CastMap, EpisodesMap, HomeSettings, Profile, Row, Template, WatchedMap } from '../types'
import type { HistoryDay, HistoryEntry } from './history'
import { pingNotifications, type AppNotification, type ShowInfo } from './notifications'
import { notifyDataChanged } from './dataEvents'
import { tt } from './i18n'

// İçerikte çalan bir şarkı — Nook'un Hum'u izlerken bulup yazıyor (bkz. server/index.js songs uç noktaları).
// season/episode: dizide hangi bölüm (filmde null); atMs: içeriğin kaçıncı ms'sinde (bilinmiyorsa null).
export interface Song {
  id: string
  key: string
  title: string
  artist: string
  album: string | null
  cover: string | null
  url: string | null
  season: number | null
  episode: number | null
  atMs: number | null
  // atMs tahmini (oynatıcı konum vermedi, izlenen süreden)
  approx?: boolean
  // Elle eklendi (Nook bulmadı)
  manual?: boolean
  foundAt: number
}

// Evrenler (bkz. pages/Evrenler.tsx, server/evrenler.js): sinematik evrenlerin yapımları ve arşivdeki durumları.
export interface EvrenItem {
  key: string
  type: 'movie' | 'tv'
  tmdbId: number | null
  season: number | null
  title: string
  archiveTitle: string | null
  date: string
  released: boolean
  poster: string | null
  minutes: number | null
  group: string | null
  extra: boolean
  // Ana hikâyeye katkısı yok: atlansa bir şey kaçırılmaz
  optional?: boolean
  // TMDB'den kendiliğinden eklendi (bkz. server/evrenOto.js)
  auto?: boolean
  rowId: string | null
  status: string | null
  watched: boolean
  // Her bitirişin tarihi ("2024-03-12", "2019", "?") — tekrar izleme = ikinci tarih
  watches: string[]
  progress: { seen: number; total: number } | null
  // İzleme turundaki durumu (tur yoksa null): dizide seen/total = turda izlenen bölümler
  tour: { done: boolean; seen: number | null; total: number | null; active?: boolean } | null
}
export interface Evren {
  id: string
  name: string
  short: string
  color: string
  builtin: boolean
  from: string | null
  groups: { id: string; name: string }[]
  story: string[]
  // "Bunu izlemeden önce": key → doğrudan gerekenler (need) ve izlersen iyi olurlar (good)
  deps: Record<string, { need: string[]; good: string[] }>
  items: EvrenItem[]
}
// Hangi aboneliği almalıyım? (bkz. pages/Abonelik.tsx)
export interface PlatformOzet {
  providers: { id: number; name: string; logo: string | null; count: number; minutes: number; items: { title: string; poster: string | null; key: string }[] }[]
  none: { title: string; poster: string | null }[]
  noneCount: number
  total: number
  totalMinutes: number
  mine: number[]
  // Abone olunanlarla izlenebilenler ve onlara eklemek için en iyi platform (abonelik işaretliyse)
  mineCover?: { count: number; minutes: number } | null
  bestNew?: { id: number; count: number; minutes: number } | null
  combo: { ids: number[]; count: number; minutes: number } | null
  // 3 aylık plan: her ay öncekilerde olmayanlardan en çok süreyi karşılayan platform (eski sunucuda yok)
  plan?: { id: number; count: number; minutes: number; items: { title: string; poster: string | null; key: string }[] }[]
  needsApiKey?: boolean
}
// maraton: "baştan izliyorum" başlangıç günü; ek: yan yapımlar görünsün; sira: son seçilen sıralama
export interface EvrenPrefs {
  maraton?: string
  ek?: boolean
  sira?: 'cikis' | 'hikaye'
  // Turun hedef bitiş günü ve biten turlar (başlangıç, bitiş, izlenen/toplam)
  hedef?: string
  // Sadece bu yapımlarla tur ("Bunu izlemeden önce"den), hedef yapım ve turda atlananlar
  turKeys?: string[]
  turHedefKey?: string
  atla?: string[]
  gecmis?: { bas: string; bit: string; done: number; total: number; ad?: string }[]
}
export interface EvrenSaveItem {
  key: string
  type: 'movie' | 'tv'
  tmdbId?: number
  rowId?: string
  season?: number
  title: string
  en?: string
  date: string
  poster?: string
  minutes?: number
  group?: string
  extra?: boolean
  optional?: boolean
}
export interface EvrenSave {
  name: string
  short?: string
  color: string
  from?: string
  groups?: { id: string; name: string }[]
  items: EvrenSaveItem[]
  story: string[]
}

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
  // manual: kullanıcının "+ Yeni raf" ile oluşturduğu raf (içi boş da olsa görünür, silinebilir); rows: içindeki
  // yapımlar — bunlar kendi raflarında da durur (elle açılan raf "ek" raf, taşımaz)
  shelves: Record<string, { image?: string; name?: string; manual?: boolean; rows?: string[] }>
}
export interface KoleksiyonInfo {
  collections: Record<string, { id: number; name: string }>
  // İzlenecek'teki yapımların serisi (eski sunucuda yok)
  laterCollections?: Record<string, { id: number; name: string }>
  mediaTypes: Record<string, 'movie' | 'tv'>
  pending: { done: number; total: number } | null
  data: KoleksiyonData
}
export type KoleksiyonPatch = {
  items?: Record<string, { image?: string | null; shelf?: string | null } | null>
  shelves?: Record<string, { image?: string | null; name?: string | null; manual?: boolean | null; rows?: string[] | null } | null>
}

// Koleksiyon › Ödüller (v1.24, bkz. lib/oduller.ts): kart paketleri
export type OdulTier = 'bronz' | 'gumus' | 'altin'
export interface OdulCard {
  n: number
  at: number
  r: number
  title: string
  poster: string
  year?: string
  rating?: number | null
  foil?: boolean
}
export interface OdulData {
  startedAt: string | null
  opened: Partial<Record<OdulTier, number>>
  bonus: Partial<Record<OdulTier, number>>
  makara: number
  pity: number
  items: Record<string, { n: number; at: number; r: number }>
  cards: Record<string, OdulCard>
  equip: { frame?: string; back?: string }
}
export type OdulReward =
  | { kind: 'item'; key: string; r: number }
  | { kind: 'card'; rowId: string; r: number; title: string; poster: string; year?: string; rating?: number | null; foil?: boolean }
export type OdulAction =
  | { action: 'start' }
  | { action: 'open'; tier: OdulTier; opId: string; pity: number; rewards: OdulReward[] }
  | { action: 'equip'; slot: 'frame' | 'back'; key: string | null }
  | { action: 'buy'; tier: OdulTier }

// Koleksiyon › Biletlerim (bkz. pages/Biletlerim.tsx): sinemada izlediklerinin koleksiyonluk biletleri
export interface Bilet {
  title: string
  poster?: string
  cover?: string
  logo?: string
  year?: string
  rowId?: string
  boardId?: string
  date?: string
  time?: string
  cinema?: string
  hall?: string
  seat?: string
  format?: string
  withWho?: string
  price?: string
  note?: string
  front?: string
  back?: string
  // v1.23.12: biletin görseli (seçilen TMDB görseli), konumu ("x y" yüzde), yakınlığı ve tasarımı
  art?: string
  artPos?: string
  artZoom?: string
  style?: string
  createdAt?: number
}
export interface BiletGorsel {
  path: string
  kind: 'sahne' | 'afis'
  w: number
  h: number
  text?: boolean
}
export interface BiletData {
  items: Record<string, Bilet>
}

// Aklımda (bkz. hooks/useAklimda.ts): "bir ara bakarım belki" dediğin yapımlar.
// Anahtar arşivdeki kayıtsa rowId, arşivde olmayan TMDB önerisiyse "tmdb:movie:603".
export interface AklimdaTmdb {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
  poster: string | null
  year: string
}
export interface AklimdaItem {
  boardId?: string
  tmdb?: AklimdaTmdb
  note?: string
  addedAt: number
}
export interface AklimdaData {
  items: Record<string, AklimdaItem>
  // arşiv kaydı → "movie:603" (TMDB önizlemesinde "aklında" görünsün diye)
  tmdbOf?: Record<string, string>
  // En fazla kaç yapım: 0 = sınırsız, yoksa AKLIMDA_DEFAULT_LIMIT
  limit?: number
}
export type AklimdaPatch = { limit?: number; items: Record<string, Partial<{ [K in keyof AklimdaItem]: AklimdaItem[K] | null }> | null> }

export interface BackupInfo {
  settings: { target: string; auto: 'off' | 'daily' | 'weekly'; keep: number; lastAt: number | null; lastError: string | null }
  snapshots: string[]
  job: { kind: 'backup' | 'restore'; running: boolean; phase: string; done: number; total: number; error: string | null; result: unknown } | null
  suggestions: { label: string; path: string }[]
  targetExists: boolean
}

// Telefon bağlama (bkz. server/sync.js, components/settings/PhonePanel.tsx)
export interface SyncDevice {
  id: string
  name: string
  pairedAt: number
  lastSeen: number
}
export interface SyncDevicesInfo {
  devices: SyncDevice[]
  pairing: { code: string; expiresAt: number } | null
  addresses: string[]
}

// Güncelle'de birden fazla TMDB adayı çıkınca kullanıcıya gösterilen seçenek (bkz. TmdbChoiceModal).
export interface TmdbChoice {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  title: string
  originalTitle: string
  englishTitle: string
  year: string
  poster: string | null
  overview: string
  // Adı yazdığınla birebir tutuyor
  exact: boolean
}

// Keşfet / Ne İzlesem sıralaması: popüler, en yüksek puanlı, yeni çıkanlar, gizli kalmışlar, her şeyden
export type TmdbSort = 'popular' | 'top' | 'new' | 'gem' | 'any'

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
    let message = tt('Sunucu isteği başarısız oldu ({0}). Yerel sunucu çalışıyor mu?', res.status)
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
  if (!activeProfileId) throw new Error(tt('Aktif bir profil seçilmeden bu işlem yapılamaz.'))
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
  // `changed`: sadece bu sütunlar kaydedilir, gerisi sunucudaki en güncel halinden kalır (bkz. server PUT).
  updateRow: (boardId: string, id: string, data: Omit<Row, 'id'>, changed?: string[]) =>
    request<Row>(profilePath(`/boards/${boardId}/rows/${id}`), {
      method: 'PUT',
      ...json(changed ? { ...data, _changed: changed } : data),
    }),
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
    request<{
      brokenImages: { rowId: string; propertyId: string; propertyName: string; value: string }[]
      duplicates: { rowIds: string[] }[]
      tmdbMissing?: Record<string, { props: string[]; at: number | null }>
      undatedSeries?: { rowId: string; seasons: { season: number; total: number; undated: number }[] }[]
    }>(profilePath(`/boards/${boardId}/health`)),
  // Sağlık Kontrolü: tarihsiz bölümlere tarih yaz (date: YYYY-MM-DD, YYYY, "?" ya da "kayit")
  dateEpisodes: (boardId: string, items: { rowId: string; seasons?: number[] }[], date: string) =>
    request<{ ok: boolean; episodes: number }>(profilePath(`/boards/${boardId}/date-episodes`), { method: 'POST', ...json({ items, date }) }),
  getDuplicates: (boardId: string) => request<{ duplicates: { rowIds: string[] }[] }>(profilePath(`/boards/${boardId}/duplicates`)),
  mergeRows: (boardId: string, keepId: string, removeIds: string[]) =>
    request<{ ok: true; movedFields: string[] }>(profilePath(`/boards/${boardId}/merge-rows`), { method: 'POST', ...json({ keepId, removeIds }) }),

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
  getSongs: (rowId: string) => request<Song[]>(profilePath(`/songs/${rowId}`)),
  addSong: (rowId: string, song: { key: string; title: string; artist: string; season: number | null; episode: number | null; atMs: number | null; manual: true }) =>
    request<{ ok: true; duplicate: boolean; song: Song }>(profilePath(`/songs/${rowId}`), { method: 'POST', ...json(song) }),
  // Yarım kalan filmde kaldığın yer (Nook yazıyor; bkz. server/index.js progress)
  getAllProgress: () => request<Record<string, { atMs: number | null; durationMs: number | null; day: string; at?: number }>>(profilePath('/progress')),
  getProgress: (rowId: string) => request<{ atMs: number | null; durationMs: number | null; day: string } | null>(profilePath(`/progress/${rowId}`)),
  clearProgress: (rowId: string) => request<{ ok: true }>(profilePath(`/progress/${rowId}`), { method: 'DELETE' }),
  deleteSong: (rowId: string, songId: string) => request<{ ok: true }>(profilePath(`/songs/${rowId}/${songId}`), { method: 'DELETE' }),
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
  // `ask`: kesin tek eşleşme yoksa doldurmak yerine `choose` (adaylar) döner — sadece tek satır Güncelle'de.
  // `forced`: kullanıcının listeden seçtiği yapım (arama yapılmaz).
  fetchTmdb: (boardId: string, rowId: string, exclude: string[] = [], overwrite = false, opts: { ask?: boolean; recheck?: boolean; forced?: { tmdbId: number; mediaType: 'movie' | 'tv' } } = {}) =>
    request<{
      ok: true
      mediaType: 'movie' | 'tv'
      filled: string[]
      newEpisodes: number
      newActors: number
      duplicateOf?: { rowId: string; title: string } | null
      choose?: TmdbChoice[]
    }>(profilePath(`/fetch-tmdb/${boardId}/${rowId}`), { method: 'POST', ...json({ exclude, overwrite, ...opts }) }),

  // ---- TMDB keşif özellikleri (bkz. server/index.js'teki "TMDB tabanlı keşif" bölümü) ----
  getTmdbExtras: (boardId: string, rowId: string) =>
    request<TmdbExtras>(profilePath(`/tmdb-extras/${boardId}/${rowId}`)),
  addFromTmdb: (
    boardId: string,
    item: {
      tmdbId: number
      mediaType: 'movie' | 'tv'
      status: 'izlenecek' | 'izlendi'
      watchedDate?: string
      rating?: number
      scores?: Record<string, number>
      exclude?: string[]
    },
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
      sort: TmdbSort
      random?: boolean
      yearFrom?: number | null
      yearTo?: number | null
      skip?: string[]
      maxMinutes?: number | null
      platforms?: number[]
    },
  ) =>
    request<{ items: TmdbCard[] }>(profilePath(`/tmdb-discover/${boardId}`), { method: 'POST', ...json(query) }),
  dismissTmdb: (item: { tmdbId: number; mediaType: 'movie' | 'tv' }) =>
    request<{ ok: true; count: number }>(profilePath('/tmdb-dismiss'), { method: 'POST', ...json(item) }),
  getDismissedCount: () => request<{ count: number }>(profilePath('/tmdb-dismiss')),
  resetDismissed: () => request<{ ok: true }>(profilePath('/tmdb-dismiss'), { method: 'DELETE' }),
  getTmdbItem: (boardId: string, mediaType: 'movie' | 'tv', tmdbId: number) =>
    request<TmdbItem>(profilePath(`/tmdb-item/${boardId}/${mediaType}/${tmdbId}`)),
  trailerCandidates: (src: { rowId?: string; mediaType?: 'movie' | 'tv'; tmdbId?: number }) => {
    const q = new URLSearchParams()
    if (src.rowId) q.set('rowId', src.rowId)
    if (src.mediaType) q.set('mediaType', src.mediaType)
    if (src.tmdbId != null) q.set('tmdbId', String(src.tmdbId))
    return request<{ keys: string[] }>(profilePath(`/fragman-adaylari?${q}`))
  },
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
  // Telefon bağlama (bkz. server/sync.js) — sadece PC'deki ARGUS'ta.
  getSyncDevices: () => request<SyncDevicesInfo>('/api/sync/devices'),
  newPairCode: () => request<{ code: string; expiresAt: number; addresses: string[]; port: number }>('/api/sync/pair-code', { method: 'POST' }),
  getMobileInfo: () => request<{ available: boolean; version?: string; size?: number }>('/api/mobile/info'),
  removeSyncDevice: (id: string) => request<{ ok: true }>(`/api/sync/devices/${id}`, { method: 'DELETE' }),
  // Flashback (yıllık özet): dizilerin bölüm süreleri (TMDB'den arka planda öğrenilir) ve kaydedilmiş izleme saatleri
  // Son izleme verisi girilen kayıtlar, en yeni önce (Takvim'in hızlı seçimi için)
  getRecentWatch: () => request<{ rowId: string; t: number }[]>(profilePath('/recent-watch')),
  getFlashback: (boardId: string, year: string) =>
    request<{ runtimes: Record<string, number>; hours: number[]; timed: number; pending: { done: number; total: number } | null }>(
      profilePath(`/flashback/${boardId}?year=${year}`),
    ),
  getTmdbMediaTypes: () => request<Record<string, 'movie' | 'tv'>>(profilePath('/tmdb-media')),
  evrenOtoStatus: () => request<{ lastRun: number | null; running: boolean; added: number }>(profilePath('/evrenler-oto')),
  evrenOtoRun: () =>
    request<{ added: { uid: string; key: string; title: string; season: number | null; date: string }[]; dates: number }>(profilePath('/evrenler-oto'), { method: 'POST' }),
  evrenOtoRemove: (uid: string, key: string) => request<{ ok: true }>(profilePath('/evrenler-oto/cikar'), { method: 'POST', ...json({ uid, key }) }),
  getEvrenler: (boardId: string) => request<{ universes: Evren[]; prefs: Record<string, EvrenPrefs>; today: string }>(profilePath(`/evrenler/${boardId}`)),
  saveEvrenler: (patch: { custom?: Record<string, EvrenSave | null>; prefs?: Record<string, EvrenPrefs | null> }) =>
    request<{ ok: true }>(profilePath('/evrenler-veri'), { method: 'POST', ...json(patch) }),
  markEvren: (boardId: string, body: { uid: string; key: string; date: string; remove?: boolean }) =>
    request<{ ok: true; rowId?: string; created?: boolean }>(profilePath(`/evrenler/${boardId}/isaretle`), { method: 'POST', ...json(body) }),
  addEvren: (boardId: string, body: { uid: string; key: string; status?: 'izlendi'; date?: string }) =>
    request<{ ok: true; rowId: string; created: boolean }>(profilePath(`/evrenler/${boardId}/ekle`), { method: 'POST', ...json(body) }),
  searchEvren: (boardId: string, q: string) =>
    request<{ items: (ArchiveCard & { date: string; posterPath: string | null })[]; needsApiKey?: boolean }>(profilePath(`/evren-ara/${boardId}?q=${encodeURIComponent(q)}`)),
  getEvrenSeasons: (tmdbId: number) =>
    request<{ seasons: { season: number; date: string; episodes: number; poster: string | null }[]; runtime: number | null }>(profilePath(`/evren-sezonlar/${tmdbId}`)),
  platformOzet: (boardId: string, items?: { type: 'movie' | 'tv'; tmdbId: number; title: string; poster: string | null; minutes: number }[]) =>
    request<PlatformOzet>(profilePath(`/platform-ozet/${boardId}`), { method: 'POST', ...json(items ? { items } : {}) }),
  getBiletler: () => request<BiletData>(profilePath('/biletler')),
  biletGorselleri: (q: { rowId?: string; title?: string; year?: string }) =>
    request<{ items: BiletGorsel[]; needsApiKey?: boolean }>(profilePath(`/bilet-gorselleri?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`)),
  biletGorselIndir: (path: string, kind: 'sahne' | 'afis') => request<{ url: string }>(profilePath('/bilet-gorsel'), { method: 'POST', ...json({ path, kind }) }),
  saveBiletler: (items: Record<string, Partial<Record<keyof Bilet, string | null>> | null>) =>
    request<BiletData>(profilePath('/biletler'), { method: 'POST', ...json({ items }) }),
  getOduller: () => request<OdulData>(profilePath('/oduller')),
  odulAction: (a: OdulAction) => request<OdulData>(profilePath('/oduller'), { method: 'POST', ...json(a) }),
  getAklimda: () => request<AklimdaData>(profilePath('/aklimda')),
  saveAklimda: (patch: AklimdaPatch) => request<AklimdaData>(profilePath('/aklimda'), { method: 'POST', ...json(patch) }),
  getKoleksiyon: (boardId: string) => request<KoleksiyonInfo>(profilePath(`/koleksiyon/${boardId}`)),
  saveKoleksiyon: (patch: KoleksiyonPatch) => request<KoleksiyonData>(profilePath('/koleksiyon'), { method: 'POST', ...json(patch) }),
  // İnternetteki bir görseli medya klasörüne indirir (Koleksiyon'da adres yapıştırarak sembol ekleme)
  medyaFromUrl: (url: string) => request<{ filename: string }>('/api/medya/from-url', { method: 'POST', ...json({ url }) }),
  getCollection: (boardId: string, rowId: string) =>
    request<{ collection: { id: number; name: string; backdrop: string | null } | null; parts?: (ArchiveCard & { released: boolean; releaseDate: string })[] }>(
      profilePath(`/collection/${boardId}/${rowId}`),
    ),
  getCollectionByTmdb: (boardId: string, tmdbId: number) =>
    request<{ collection: { id: number; name: string; backdrop: string | null } | null; parts?: (ArchiveCard & { released: boolean; releaseDate: string })[] }>(
      profilePath(`/collection-tmdb/${boardId}/${tmdbId}`),
    ),
  getRowPlatforms: (boardId: string) => request<{ ready: boolean; platforms: Record<string, number[]> }>(profilePath(`/row-platforms/${boardId}`)),
  getPlatforms: () => request<{ items: { id: number; name: string; logo: string | null }[]; needsApiKey?: boolean }>(profilePath('/tmdb-platforms')),
  getReleases: (boardId: string, from: string, to: string) =>
    request<{ items: (ArchiveCard & { releaseDate: string })[]; needsApiKey?: boolean }>(profilePath(`/tmdb-releases/${boardId}?from=${from}&to=${to}`)),
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
    if (!res.ok) throw new Error(tt('Dosya yüklenemedi ({0})', res.status))
    return res.json()
  },
}
