// Sütun görevlerinin sunucu tarafı — istemcideki src/lib/roles.ts ile AYNI tablo ve AYNI çözüm
// sırası (açık kayıt → eski statMapping → varsayılan ad). TMDB doldurma sunucuda çalıştığı için
// burada da gerekiyor. Birinde bir görev eklenir/değişirse diğeri de güncellenmeli.

import { COLUMN_NAMES, STATUS_NAMES, isName, nameOf } from './names.js'

export const ROLE_DEFS = [
  { key: 'durum', types: ['select'], names: COLUMN_NAMES.durum, legacyStatKey: 'durumId' },
  { key: 'kategori', types: ['select'], names: COLUMN_NAMES.kategori, legacyStatKey: 'kategoriId' },
  { key: 'tur', types: ['multiselect', 'select'], names: COLUMN_NAMES.tur, legacyStatKey: 'turId' },
  { key: 'ulke', types: ['multiselect', 'select'], names: COLUMN_NAMES.ulke, legacyStatKey: 'ulkeId' },
  { key: 'vizyon', types: ['date'], names: COLUMN_NAMES.vizyon, legacyStatKey: 'vizyonId' },
  { key: 'izlemeTarihi', types: ['multidate', 'date'], names: COLUMN_NAMES.izlemeTarihi },
  { key: 'sure', types: ['number'], names: COLUMN_NAMES.sure, legacyStatKey: 'sureId' },
  { key: 'puan', types: ['rating'], names: COLUMN_NAMES.puan, legacyStatKey: 'puanId' },
  { key: 'oyuncular', types: ['multiselect'], names: COLUMN_NAMES.oyuncular, legacyStatKey: 'oyuncularId' },
  { key: 'yonetmen', types: ['text'], names: COLUMN_NAMES.yonetmen },
  { key: 'orjinalAdi', types: ['text'], names: COLUMN_NAMES.orjinalAdi },
  { key: 'sinopsis', types: ['longtext'], names: COLUMN_NAMES.sinopsis },
  { key: 'poster', types: ['image'], names: COLUMN_NAMES.poster },
  { key: 'banner', types: ['image'], names: COLUMN_NAMES.banner },
  { key: 'video', types: ['url'], names: COLUMN_NAMES.video },
  { key: 'yas', types: ['text'], names: COLUMN_NAMES.yas },
]

const ROLE_BY_KEY = new Map(ROLE_DEFS.map((r) => [r.key, r]))


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
  const named = board.properties.find((p) => isName(p.name, def.names) && def.types.includes(p.type))
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
  const p = { id: makeId(), name: nameOf(def.names), type: def.types[0], ...(extra ?? {}) }
  board.properties.push(p)
  return p
}

// Durum sütununun "İzlenecek/İzleniyor/İzlendi" seçeneği — açık kayıt yoksa etiketine göre (iki dilde de).

export function resolveStatusOption(board, key) {
  const durum = resolveRole(board, 'durum')
  if (!durum) return undefined
  const explicit = board.statusOptions?.[key]
  if (explicit && durum.options?.some((o) => o.id === explicit)) return explicit
  return durum.options?.find((o) => isName(o.label, STATUS_NAMES[key]))?.id
}

// Gerekirse seçeneği oluşturarak döndürür (ör. hiç "İzlenecek" seçeneği olmayan bir arşive
// keşfetten içerik eklenirken).
export function ensureStatusOption(board, key, makeId) {
  const durum = resolveRole(board, 'durum')
  if (!durum) return undefined
  const existing = resolveStatusOption(board, key)
  if (existing) return existing
  if (!durum.options) durum.options = []
  const opt = { id: makeId(), label: nameOf(STATUS_NAMES[key]), colorIndex: durum.options.length % 9 }
  durum.options.push(opt)
  return opt.id
}
