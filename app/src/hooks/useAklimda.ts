import { useEffect, useSyncExternalStore } from 'react'
import { api, type AklimdaData, type AklimdaItem, type AklimdaPatch, type AklimdaTmdb } from '../lib/api'
import { onDataChanged } from '../lib/dataEvents'
import { useProfiles } from './useProfiles'
import { tt } from '../lib/i18n'

// "Aklımda" listesi TEK ortak kaynakta (detay penceresindeki düğme, ana sayfa satırı ve Aklımda sayfası aynı
// kopyayı görsün — bkz. useHomeSettings). Değişiklik önce ekranda görünür, sonra sunucuya gider.

interface Store {
  profileId: string | null
  data: AklimdaData
  loaded: boolean
}

const EMPTY: AklimdaData = { items: {}, tmdbOf: {} }
let store: Store = { profileId: null, data: EMPTY, loaded: false }
const listeners = new Set<() => void>()
let loadingFor: string | null = null
// Kaydedilmeyi bekleyen değişiklik varken gelen (eski) liste ekrandakini ezmesin
let saving = 0

function setStore(patch: Partial<Store>) {
  store = { ...store, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function load(profileId: string, force = false) {
  if (!force && loadingFor === profileId) return
  loadingFor = profileId
  if (store.profileId !== profileId) setStore({ profileId, data: EMPTY, loaded: false })
  api
    .getAklimda()
    .then((data) => {
      if (store.profileId !== profileId) return
      if (saving === 0) setStore({ data: { items: data.items ?? {}, tmdbOf: data.tmdbOf ?? {}, limit: data.limit }, loaded: true })
      else setStore({ loaded: true })
    })
    .catch(() => {
      if (store.profileId === profileId) setStore({ loaded: true })
    })
    .finally(() => {
      if (loadingFor === profileId) loadingFor = null
    })
}

// Arşive bir şey eklenince (ör. Aklımda'daki bir TMDB önerisi İzlenecek'e alındı) sunucu kaydı arşive bağlıyor
onDataChanged(() => {
  if (store.profileId) load(store.profileId, true)
})

// Kullanıcı "aklımda kısmına içerik ekleme sınırı ekleyelim" dedi: liste dolunca yeni ekleme yapılmaz, önce biri
// çıkarılmalı (sınır düşürülünce fazlalar silinmez, sadece yenisi eklenemez). Aklımda sayfasından değişir.
export const AKLIMDA_DEFAULT_LIMIT = 20
export const AKLIMDA_LIMITS = [10, 20, 30, 50, 0]

export const tmdbAklimdaKey = (mediaType: string, id: number) => `tmdb:${mediaType}:${id}`

async function save(patch: AklimdaPatch) {
  const before = store.data
  const items = { ...before.items }
  for (const [k, v] of Object.entries(patch.items)) {
    if (v === null) delete items[k]
    else {
      const merged = { ...(items[k] ?? {}), ...v } as Record<string, unknown>
      for (const [mk, mv] of Object.entries(merged)) if (mv === null) delete merged[mk]
      if (!merged.addedAt) merged.addedAt = Date.now()
      items[k] = merged as unknown as AklimdaItem
    }
  }
  setStore({ data: { ...before, items, ...(patch.limit !== undefined ? { limit: patch.limit } : {}) } })
  saving++
  try {
    await api.saveAklimda(patch)
  } catch (e) {
    setStore({ data: before })
    throw e
  } finally {
    saving--
  }
}

export function useAklimda() {
  const { activeProfileId } = useProfiles()
  const snap = useSyncExternalStore(subscribe, () => store)

  useEffect(() => {
    if (activeProfileId && store.profileId !== activeProfileId) load(activeProfileId)
  }, [activeProfileId])

  const current = snap.profileId === activeProfileId
  const data = current ? snap.data : EMPTY
  const items = data.items

  // Arşivdeki bir kaydın ya da bir TMDB yapımının listede olup olmadığı (arşivdeki kaydın TMDB kimliğiyle de bakılır)
  function keyForTmdb(mediaType: string, id: number): string | null {
    const k = tmdbAklimdaKey(mediaType, id)
    if (items[k]) return k
    const ref = `${mediaType}:${id}`
    for (const [rowId, r] of Object.entries(data.tmdbOf ?? {})) if (r === ref && items[rowId]) return rowId
    return null
  }

  const limit = data.limit ?? AKLIMDA_DEFAULT_LIMIT
  const count = Object.keys(items).length
  const full = limit > 0 && count >= limit
  function guard() {
    if (full) throw new Error(tt('Aklın dolu ({0}/{1}). Yenisini eklemek için önce Aklımda sayfasından birini çıkar ya da sınırı artır.', count, limit))
  }

  return {
    items,
    count,
    limit,
    full,
    setLimit: (n: number) => save({ limit: n, items: {} }),
    loaded: current && snap.loaded,
    keyForTmdb,
    addRow: async (boardId: string, rowId: string) => {
      guard()
      await save({ items: { [rowId]: { boardId, addedAt: Date.now() } } })
    },
    addTmdb: async (tmdb: AklimdaTmdb) => {
      guard()
      await save({ items: { [tmdbAklimdaKey(tmdb.mediaType, tmdb.id)]: { tmdb, addedAt: Date.now() } } })
    },
    remove: (key: string) => save({ items: { [key]: null } }),
  }
}
