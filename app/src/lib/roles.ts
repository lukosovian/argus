import type { Board, PropertyDef, PropertyType, StatMapping } from '../types'
import { tt } from './i18n'
import { COLUMN_NAMES, STATUS_NAMES, isName, nameOf, type NamePair } from './names'

// Sütun "görevleri": uygulamanın bazı özellikleri (poster göstermek, durum rozetleri, TMDB
// doldurma, istatistikler, Sağlık Kontrolü…) belirli bir İŞİ gören sütunu bulmak zorunda.
// Eskiden bu iş sütun ADIYLA yapılıyordu ("Poster", "Durum"…) — kullanıcı bir sütunun adını
// değiştirince o özellik hiçbir uyarı vermeden sessizce bozuluyordu. Artık her görev için
// board.roles[görev] = sütun id'si saklanıyor; ad ne olursa olsun görev takip ediliyor.
//
// Çözüm sırası (resolveRole): 1) board.roles'ta açık bir kayıt varsa o (null = "bu görevi
// kullanma"), 2) eski İstatistikler eşleştirmesi (board.statMapping) varsa o, 3) hiçbiri yoksa
// varsayılan ada + tipe göre otomatik bulma — "Medya Arşivi" şablonundan gelen arşivler hiç
// ayar gerektirmeden çalışsın diye. Yeniden adlandırmada (bkz. lockRolesForProperty) ad ile
// bulunan görevler o anda açık kayda çevrilir, böylece yeni ad görevi kaybettirmez.
//
// NOT: Aynı tablo sunucuda da var (server/roles.js) — TMDB doldurma sunucuda çalışıyor.
// Birinde bir görev eklenir/değişirse diğeri de güncellenmeli.

export type RoleKey =
  | 'durum'
  | 'kategori'
  | 'tur'
  | 'ulke'
  | 'vizyon'
  | 'izlemeTarihi'
  | 'sure'
  | 'puan'
  | 'oyuncular'
  | 'yonetmen'
  | 'orjinalAdi'
  | 'sinopsis'
  | 'poster'
  | 'banner'
  | 'video'
  | 'yas'

export interface RoleDef {
  key: RoleKey
  label: string
  types: PropertyType[]
  // Yeni sütun açılırken seçili dildeki ad; tanırken iki dildeki ad da (names) geçerli
  defaultName: string
  names: NamePair
  hint: string
  legacyStatKey?: keyof StatMapping
}

export const ROLE_DEFS: RoleDef[] = [
  { key: 'durum', label: tt('Durum'), types: ['select'], defaultName: nameOf(COLUMN_NAMES.durum), names: COLUMN_NAMES.durum, hint: tt('İzlendi / İzlenecek gibi durum'), legacyStatKey: 'durumId' },
  { key: 'kategori', label: tt('Kategori'), types: ['select'], defaultName: nameOf(COLUMN_NAMES.kategori), names: COLUMN_NAMES.kategori, hint: tt('Film / Dizi gibi tür ayrımı'), legacyStatKey: 'kategoriId' },
  { key: 'tur', label: tt('Tür'), types: ['multiselect', 'select'], defaultName: nameOf(COLUMN_NAMES.tur), names: COLUMN_NAMES.tur, hint: tt('Bilim Kurgu, Dram…'), legacyStatKey: 'turId' },
  { key: 'ulke', label: tt('Ülke'), types: ['multiselect', 'select'], defaultName: nameOf(COLUMN_NAMES.ulke), names: COLUMN_NAMES.ulke, hint: tt('Yapım ülkesi'), legacyStatKey: 'ulkeId' },
  { key: 'vizyon', label: tt('Vizyon Tarihi'), types: ['date'], defaultName: nameOf(COLUMN_NAMES.vizyon), names: COLUMN_NAMES.vizyon, hint: tt('Çıkış tarihi'), legacyStatKey: 'vizyonId' },
  { key: 'izlemeTarihi', label: tt('İzleme Tarihi'), types: ['multidate', 'date'], defaultName: nameOf(COLUMN_NAMES.izlemeTarihi), names: COLUMN_NAMES.izlemeTarihi, hint: tt('Ne zaman izlediğin') },
  { key: 'sure', label: tt('Süre'), types: ['number'], defaultName: nameOf(COLUMN_NAMES.sure), names: COLUMN_NAMES.sure, hint: tt('Dakika'), legacyStatKey: 'sureId' },
  { key: 'puan', label: tt('Puan'), types: ['rating'], defaultName: nameOf(COLUMN_NAMES.puan), names: COLUMN_NAMES.puan, hint: tt('Kriterli puan'), legacyStatKey: 'puanId' },
  { key: 'oyuncular', label: tt('Oyuncular'), types: ['multiselect'], defaultName: nameOf(COLUMN_NAMES.oyuncular), names: COLUMN_NAMES.oyuncular, hint: tt('Oyuncu listesi'), legacyStatKey: 'oyuncularId' },
  { key: 'yonetmen', label: tt('Yönetmen'), types: ['text'], defaultName: nameOf(COLUMN_NAMES.yonetmen), names: COLUMN_NAMES.yonetmen, hint: tt('Yönetmen / yaratıcı') },
  { key: 'orjinalAdi', label: tt('Orjinal Adı'), types: ['text'], defaultName: nameOf(COLUMN_NAMES.orjinalAdi), names: COLUMN_NAMES.orjinalAdi, hint: tt('TMDB aramasında kullanılır') },
  { key: 'sinopsis', label: tt('Sinopsis'), types: ['longtext'], defaultName: nameOf(COLUMN_NAMES.sinopsis), names: COLUMN_NAMES.sinopsis, hint: tt('Özet') },
  { key: 'poster', label: tt('Poster'), types: ['image'], defaultName: nameOf(COLUMN_NAMES.poster), names: COLUMN_NAMES.poster, hint: tt('Dikey afiş') },
  { key: 'banner', label: tt('Banner'), types: ['image'], defaultName: nameOf(COLUMN_NAMES.banner), names: COLUMN_NAMES.banner, hint: tt('Yatay görsel') },
  { key: 'video', label: tt('Fragman'), types: ['url'], defaultName: nameOf(COLUMN_NAMES.video), names: COLUMN_NAMES.video, hint: tt('YouTube fragman linki') },
  { key: 'yas', label: tt('Yaş Sınırı'), types: ['text'], defaultName: nameOf(COLUMN_NAMES.yas), names: COLUMN_NAMES.yas, hint: '13+, 18+…' },
]

const ROLE_BY_KEY = new Map(ROLE_DEFS.map((r) => [r.key, r]))


// Açık kayıt (roles / eski statMapping) varsa onu döndürür: PropertyDef, "kullanma" için null,
// hiç kayıt yoksa undefined.
function explicitRole(board: Board, def: RoleDef): PropertyDef | null | undefined {
  const fromRoles = board.roles?.[def.key]
  if (fromRoles === null) return null
  if (fromRoles) {
    const p = board.properties.find((x) => x.id === fromRoles)
    // Sütun silinmişse kayıt geçersiz — ada göre bulmaya düşülür. Sütun duruyor ama tipi artık
    // bu göreve uymuyorsa görev boş kalır (kullanıcı bilerek bu sütuna vermişti).
    if (p) return def.types.includes(p.type) ? p : null
  }
  if (def.legacyStatKey) {
    const legacy = board.statMapping?.[def.legacyStatKey]
    if (legacy === null) return null
    if (legacy) {
      const p = board.properties.find((x) => x.id === legacy)
      if (p && def.types.includes(p.type)) return p
    }
  }
  return undefined
}

function byName(board: Board, def: RoleDef): PropertyDef | undefined {
  const named = board.properties.find((p) => isName(p.name, def.names) && def.types.includes(p.type))
  if (named) return named
  // Sinopsis için eski davranış korunuyor: adı ne olursa olsun ilk uzun metin sütunu.
  if (def.key === 'sinopsis') return board.properties.find((p) => p.type === 'longtext')
  // Fragman için de: adı ne olursa olsun ilk bağlantı sütunu (eski davranış).
  if (def.key === 'video') return board.properties.find((p) => p.type === 'url')
  return undefined
}

export function resolveRole(board: Board | null | undefined, key: RoleKey): PropertyDef | undefined {
  if (!board) return undefined
  const def = ROLE_BY_KEY.get(key)
  if (!def) return undefined
  const explicit = explicitRole(board, def)
  if (explicit === null) return undefined
  if (explicit) return explicit
  return byName(board, def)
}

// Bu sütunun şu an üstlendiği görevler (menüde göstermek için).
export function rolesOfProperty(board: Board, propertyId: string): RoleKey[] {
  return ROLE_DEFS.filter((d) => resolveRole(board, d.key)?.id === propertyId).map((d) => d.key)
}

// Bu tipteki bir sütunun üstlenebileceği görevler.
export function rolesForType(type: PropertyType): RoleDef[] {
  return ROLE_DEFS.filter((d) => d.types.includes(type))
}

// Yeniden adlandırmadan ÖNCE çağrılır: bu sütunun sadece ADI sayesinde üstlendiği görevleri
// açık kayda çevirir — yoksa ad değişince görev sessizce kaybolurdu. Değişiklik yoksa null.
export function lockRolesForProperty(board: Board, propertyId: string): Board['roles'] | null {
  let changed = false
  const next = { ...(board.roles ?? {}) }
  for (const def of ROLE_DEFS) {
    if (explicitRole(board, def) !== undefined) continue
    if (byName(board, def)?.id === propertyId) {
      next[def.key] = propertyId
      changed = true
    }
  }
  return changed ? next : null
}

// Bir sütuna görev ata ya da görevini kaldır. `roleKey` null ise bu sütunun TÜM görevleri
// "kullanma" olarak işaretlenir (ad eşleşmesi tekrar devreye girmesin diye).
export function assignRole(board: Board, propertyId: string, roleKey: RoleKey | null): Board['roles'] {
  const next = { ...(board.roles ?? {}) }
  for (const key of rolesOfProperty(board, propertyId)) next[key] = null
  if (roleKey) next[roleKey] = propertyId
  return next
}

export function roleLabel(key: RoleKey): string {
  return ROLE_BY_KEY.get(key)?.label ?? key
}

// ---- Durum seçenekleri ----------------------------------------------------------------------
// "İzlenecek olarak ekle", "izleniyor olan diziler" gibi özellikler Durum sütununun hangi
// seçeneğinin hangi anlama geldiğini bilmek zorunda. board.statusOptions'ta açık kayıt varsa o,
// yoksa etiketine göre (büyük/küçük harf farketmeden) bulunur.

export type StatusKey = 'izlenecek' | 'izleniyor' | 'izlendi'

export const STATUS_DEFS: { key: StatusKey; label: string }[] = [
  { key: 'izlenecek', label: tt('İzlenecek') },
  { key: 'izleniyor', label: tt('İzleniyor') },
  { key: 'izlendi', label: tt('İzlendi') },
]

export function resolveStatusOption(board: Board, key: StatusKey): string | undefined {
  const durum = resolveRole(board, 'durum')
  if (!durum) return undefined
  const explicit = board.statusOptions?.[key]
  if (explicit && durum.options?.some((o) => o.id === explicit)) return explicit
  return durum.options?.find((o) => isName(o.label, STATUS_NAMES[key]))?.id
}
