import type { Board, PropertyDef, PropertyType, StatMapping } from '../types'

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
  defaultName: string
  hint: string
  legacyStatKey?: keyof StatMapping
}

export const ROLE_DEFS: RoleDef[] = [
  { key: 'durum', label: 'Durum', types: ['select'], defaultName: 'Durum', hint: 'İzlendi / İzlenecek gibi durum', legacyStatKey: 'durumId' },
  { key: 'kategori', label: 'Kategori', types: ['select'], defaultName: 'Kategori', hint: 'Film / Dizi gibi tür ayrımı', legacyStatKey: 'kategoriId' },
  { key: 'tur', label: 'Tür', types: ['multiselect', 'select'], defaultName: 'Tür', hint: 'Bilim Kurgu, Dram…', legacyStatKey: 'turId' },
  { key: 'ulke', label: 'Ülke', types: ['multiselect', 'select'], defaultName: 'Ülke', hint: 'Yapım ülkesi', legacyStatKey: 'ulkeId' },
  { key: 'vizyon', label: 'Vizyon Tarihi', types: ['date'], defaultName: 'Vizyon Tarihi', hint: 'Çıkış tarihi', legacyStatKey: 'vizyonId' },
  { key: 'izlemeTarihi', label: 'İzleme Tarihi', types: ['multidate', 'date'], defaultName: 'İzleme Tarihi', hint: 'Ne zaman izlediğin' },
  { key: 'sure', label: 'Süre', types: ['number'], defaultName: 'Süre', hint: 'Dakika', legacyStatKey: 'sureId' },
  { key: 'puan', label: 'Puan', types: ['rating'], defaultName: 'Puan', hint: 'Kriterli puan', legacyStatKey: 'puanId' },
  { key: 'oyuncular', label: 'Oyuncular', types: ['multiselect'], defaultName: 'Oyuncular', hint: 'Oyuncu listesi', legacyStatKey: 'oyuncularId' },
  { key: 'yonetmen', label: 'Yönetmen', types: ['text'], defaultName: 'Yönetmen', hint: 'Yönetmen / yaratıcı' },
  { key: 'orjinalAdi', label: 'Orjinal Adı', types: ['text'], defaultName: 'Orjinal Adı', hint: 'TMDB aramasında kullanılır' },
  { key: 'sinopsis', label: 'Sinopsis', types: ['longtext'], defaultName: 'Sinopsis', hint: 'Özet' },
  { key: 'poster', label: 'Poster', types: ['image'], defaultName: 'Poster', hint: 'Dikey afiş' },
  { key: 'banner', label: 'Banner', types: ['image'], defaultName: 'Banner', hint: 'Yatay görsel' },
  { key: 'video', label: 'Fragman', types: ['url'], defaultName: 'Video', hint: 'YouTube fragman linki' },
  { key: 'yas', label: 'Yaş Sınırı', types: ['text'], defaultName: 'Yaş Sınırı', hint: '13+, 18+…' },
]

const ROLE_BY_KEY = new Map(ROLE_DEFS.map((r) => [r.key, r]))

function sameName(a: string, b: string) {
  return a.trim().toLocaleLowerCase('tr') === b.trim().toLocaleLowerCase('tr')
}

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
  const named = board.properties.find((p) => sameName(p.name, def.defaultName) && def.types.includes(p.type))
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
  { key: 'izlenecek', label: 'İzlenecek' },
  { key: 'izleniyor', label: 'İzleniyor' },
  { key: 'izlendi', label: 'İzlendi' },
]

export function resolveStatusOption(board: Board, key: StatusKey): string | undefined {
  const durum = resolveRole(board, 'durum')
  if (!durum) return undefined
  const explicit = board.statusOptions?.[key]
  if (explicit && durum.options?.some((o) => o.id === explicit)) return explicit
  const label = STATUS_DEFS.find((s) => s.key === key)!.label
  return durum.options?.find((o) => sameName(o.label, label))?.id
}
