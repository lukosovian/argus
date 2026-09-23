// Sütun görevlerinin sunucu tarafı — istemcideki src/lib/roles.ts ile AYNI tablo ve AYNI çözüm
// sırası (açık kayıt → eski statMapping → varsayılan ad). TMDB doldurma sunucuda çalıştığı için
// burada da gerekiyor. Birinde bir görev eklenir/değişirse diğeri de güncellenmeli.

export const ROLE_DEFS = [
  { key: 'durum', types: ['select'], defaultName: 'Durum', legacyStatKey: 'durumId' },
  { key: 'kategori', types: ['select'], defaultName: 'Kategori', legacyStatKey: 'kategoriId' },
  { key: 'tur', types: ['multiselect', 'select'], defaultName: 'Tür', legacyStatKey: 'turId' },
  { key: 'ulke', types: ['multiselect', 'select'], defaultName: 'Ülke', legacyStatKey: 'ulkeId' },
  { key: 'vizyon', types: ['date'], defaultName: 'Vizyon Tarihi', legacyStatKey: 'vizyonId' },
  { key: 'izlemeTarihi', types: ['multidate', 'date'], defaultName: 'İzleme Tarihi' },
  { key: 'sure', types: ['number'], defaultName: 'Süre', legacyStatKey: 'sureId' },
  { key: 'puan', types: ['rating'], defaultName: 'Puan', legacyStatKey: 'puanId' },
  { key: 'oyuncular', types: ['multiselect'], defaultName: 'Oyuncular', legacyStatKey: 'oyuncularId' },
  { key: 'yonetmen', types: ['text'], defaultName: 'Yönetmen' },
  { key: 'orjinalAdi', types: ['text'], defaultName: 'Orjinal Adı' },
  { key: 'sinopsis', types: ['longtext'], defaultName: 'Sinopsis' },
  { key: 'poster', types: ['image'], defaultName: 'Poster' },
  { key: 'banner', types: ['image'], defaultName: 'Banner' },
  { key: 'video', types: ['url'], defaultName: 'Video' },
  { key: 'yas', types: ['text'], defaultName: 'Yaş Sınırı' },
]

const ROLE_BY_KEY = new Map(ROLE_DEFS.map((r) => [r.key, r]))

function sameName(a, b) {
  return a.trim().toLocaleLowerCase('tr') === b.trim().toLocaleLowerCase('tr')
}

// PropertyDef | null ("bu görevi kullanma") | undefined (kayıt yok)
function explicitRole(board, def) {
  const fromRoles = board.roles?.[def.key]
  if (fromRoles === null) return null
  if (fromRoles) {
    const p = board.properties.find((x) => x.id === fromRoles)
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

function byName(board, def) {
  const named = board.properties.find((p) => sameName(p.name, def.defaultName) && def.types.includes(p.type))
  if (named) return named
  if (def.key === 'sinopsis') return board.properties.find((p) => p.type === 'longtext')
  if (def.key === 'video') return board.properties.find((p) => p.type === 'url')
  return undefined
}

export function resolveRole(board, key) {
  const def = ROLE_BY_KEY.get(key)
  if (!def) return undefined
  const explicit = explicitRole(board, def)
  if (explicit === null) return undefined
  if (explicit) return explicit
  return byName(board, def)
}

// Görevi gören sütunu döndürür; arşivde hiç yoksa varsayılan adla oluşturur. Kullanıcı bu görevi
// bilerek kapattıysa ("Yok" seçtiyse) OLUŞTURMAZ, undefined döner — o alan doldurulmaz.
export function ensureRole(board, key, makeId, extra) {
  const def = ROLE_BY_KEY.get(key)
  const found = resolveRole(board, key)
  if (found) return found
  if (explicitRole(board, def) === null) return undefined
  const p = { id: makeId(), name: def.defaultName, type: def.types[0], ...(extra ?? {}) }
  board.properties.push(p)
  return p
}

// Durum sütununun "İzlenecek/İzleniyor/İzlendi" seçeneği — açık kayıt yoksa etiketine göre.
const STATUS_LABELS = { izlenecek: 'İzlenecek', izleniyor: 'İzleniyor', izlendi: 'İzlendi' }

export function resolveStatusOption(board, key) {
  const durum = resolveRole(board, 'durum')
  if (!durum) return undefined
  const explicit = board.statusOptions?.[key]
  if (explicit && durum.options?.some((o) => o.id === explicit)) return explicit
  return durum.options?.find((o) => sameName(o.label, STATUS_LABELS[key]))?.id
}

// Gerekirse seçeneği oluşturarak döndürür (ör. hiç "İzlenecek" seçeneği olmayan bir arşive
// keşfetten içerik eklenirken).
export function ensureStatusOption(board, key, makeId) {
  const durum = resolveRole(board, 'durum')
  if (!durum) return undefined
  const existing = resolveStatusOption(board, key)
  if (existing) return existing
  if (!durum.options) durum.options = []
  const opt = { id: makeId(), label: STATUS_LABELS[key], colorIndex: durum.options.length % 9 }
  durum.options.push(opt)
  return opt.id
}
