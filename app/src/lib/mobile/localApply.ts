// PC yokken yapılan bir değişikliği telefondaki kopyaya hemen işler ve PC'ye gönderilecek hale getirir.
// Sadece günlük işler çevrimdışı yapılabiliyor (kayıt düzenleme/ekleme/silme, bölüm işaretleme, ana sayfa
// ayarları, Koleksiyon, Aklımda, bildirimleri okundu sayma). Arşiv yapısını değiştiren işler (sütun ekleme, toplu
// içe aktarma, TMDB doldurma…) PC'ye bağlıyken yapılır: null döner.
//
// Sunucudaki otomatik kurallar (bölüm işaretleyince İzleniyor, puan sorma…) burada çalışmaz; değişiklik
// PC'ye ulaşınca orada uygulanır ve eşitlemeyle telefona geri gelir.
import { cacheGet, cacheKeys, cacheSet, type QueuedOp } from './store'

type Row = { id: string; values: Record<string, unknown>; [k: string]: unknown }
type WatchedMap = Record<string, Record<string, string[]>>

export interface OfflineResult {
  // Arayüze dönecek cevap
  response: unknown
  // PC'ye gönderilecek hali (bazı değişiklikler farklı bir adrese gider, ör. bölümler → fark)
  op: QueuedOp
}

function makeId() {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0')
}

function parse(body?: string): unknown {
  if (!body) return undefined
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

export async function applyOffline(op: QueuedOp): Promise<OfflineResult | null> {
  const { method, path } = op
  const body = parse(op.body) as Record<string, unknown> | undefined
  let m: RegExpExecArray | null

  // Kayıt düzenleme — sunucudaki PUT ile aynı birleştirme (_changed: sadece o sütunlar)
  if (method === 'PUT' && (m = /^\/api\/profiles\/([^/]+)\/boards\/([^/]+)\/rows\/([^/?]+)$/.exec(path))) {
    const key = `/api/profiles/${m[1]}/boards/${m[2]}/rows`
    const rows = ((await cacheGet<Row[]>(key)) ?? []).slice()
    const idx = rows.findIndex((r) => r.id === m![3])
    const before = idx === -1 ? null : rows[idx]
    const { _changed, ...rest } = (body ?? {}) as Row & { _changed?: string[] }
    let saved: Row
    if (before && Array.isArray(_changed)) {
      const values = { ...before.values }
      const incoming = rest.values ?? {}
      for (const k of _changed) {
        if (k in incoming) values[k] = incoming[k]
        else delete values[k]
      }
      saved = { ...before, values, id: m[3], updatedAt: rest.updatedAt ?? Date.now() }
      if ('sortKey' in rest) saved.sortKey = rest.sortKey
    } else {
      saved = { ...(rest as Row), id: m[3], updatedAt: Date.now() }
      if (before && before.sortKey !== undefined && !('sortKey' in rest)) saved.sortKey = before.sortKey
    }
    if (idx === -1) rows.unshift(saved)
    else rows[idx] = saved
    await cacheSet(key, rows)
    return { response: saved, op }
  }

  // Yeni kayıt — kimliği telefon verir, PC de aynısını kullanır
  if (method === 'POST' && (m = /^\/api\/profiles\/([^/]+)\/boards\/([^/]+)\/rows$/.exec(path))) {
    const key = `/api/profiles/${m[1]}/boards/${m[2]}/rows`
    const row = { ...(body ?? {}), id: typeof body?.id === 'string' ? body.id : makeId() } as Row
    const rows = (await cacheGet<Row[]>(key)) ?? []
    await cacheSet(key, [row, ...rows])
    return { response: row, op: { ...op, body: JSON.stringify(row) } }
  }

  if (method === 'DELETE' && (m = /^\/api\/profiles\/([^/]+)\/boards\/([^/]+)\/rows\/([^/?]+)$/.exec(path))) {
    const key = `/api/profiles/${m[1]}/boards/${m[2]}/rows`
    await cacheSet(key, ((await cacheGet<Row[]>(key)) ?? []).filter((r) => r.id !== m![3]))
    return { response: { ok: true }, op }
  }

  // Bölüm işaretleme: PC'ye tam liste değil FARK gider (PC'de bu arada işaretlenenler kaybolmasın)
  if (method === 'PUT' && (m = /^\/api\/profiles\/([^/]+)\/watched\/([^/?]+)$/.exec(path))) {
    const key = `/api/profiles/${m[1]}/watched`
    const all = { ...((await cacheGet<WatchedMap>(key)) ?? {}) }
    const before = all[m[2]] ?? {}
    const after = (body ?? {}) as Record<string, string[]>
    const add: Record<string, string[]> = {}
    const remove: Record<string, string[]> = {}
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const a = Array.isArray(before[k]) ? before[k] : []
      const b = Array.isArray(after[k]) ? after[k] : []
      const plus = b.filter((d) => !a.includes(d))
      const minus = a.filter((d) => !b.includes(d))
      if (plus.length) add[k] = plus
      if (minus.length) remove[k] = minus
    }
    all[m[2]] = after
    await cacheSet(key, all)
    return {
      response: { ok: true, autoWatched: null, autoWatching: null },
      op: { ...op, method: 'PATCH', path: `${path}/diff`, body: JSON.stringify({ add, remove }) },
    }
  }

  if (method === 'PUT' && (m = /^\/api\/profiles\/([^/]+)\/home-settings$/.exec(path))) {
    await cacheSet(path, body ?? null)
    return { response: { ok: true }, op }
  }

  // Koleksiyon: { items: { rowId: {...} | null }, shelves: {...} } — null siler (sunucudakiyle aynı)
  if (method === 'POST' && (m = /^\/api\/profiles\/([^/]+)\/koleksiyon$/.exec(path))) {
    type K = { data: { items: Record<string, Record<string, unknown>>; shelves: Record<string, Record<string, unknown>> } }
    let result: K['data'] | null = null
    for (const key of await cacheKeys(`/api/profiles/${m[1]}/koleksiyon/`)) {
      const info = await cacheGet<K>(key)
      if (!info?.data) continue
      const data = { items: { ...(info.data.items ?? {}) }, shelves: { ...(info.data.shelves ?? {}) } }
      for (const kind of ['items', 'shelves'] as const) {
        const patch = body?.[kind] as Record<string, Record<string, unknown> | null> | undefined
        if (!patch) continue
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete data[kind][k]
          else {
            const merged = { ...(data[kind][k] ?? {}), ...v }
            for (const [mk, mv] of Object.entries(merged)) if (mv === null) delete merged[mk]
            if (Object.keys(merged).length) data[kind][k] = merged
            else delete data[kind][k]
          }
        }
      }
      await cacheSet(key, { ...info, data })
      result = data
    }
    return { response: result ?? { items: {}, shelves: {} }, op }
  }

  // Aklımda: { items: { anahtar: {...} | null } } — null siler (sunucudakiyle aynı)
  if (method === 'POST' && (m = /^\/api\/profiles\/([^/]+)\/aklimda$/.exec(path))) {
    const cur = (await cacheGet<{ items?: Record<string, Record<string, unknown>>; tmdbOf?: Record<string, string> }>(path)) ?? {}
    const items = { ...(cur.items ?? {}) }
    const patch = (body?.items ?? {}) as Record<string, Record<string, unknown> | null>
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete items[k]
      else {
        const merged = { ...(items[k] ?? {}), ...v }
        for (const [mk, mv] of Object.entries(merged)) if (mv === null) delete merged[mk]
        if (!merged.addedAt) merged.addedAt = Date.now()
        items[k] = merged
      }
    }
    const limit = Number.isInteger(body?.limit) ? (body!.limit as number) : (cur as { limit?: number }).limit
    await cacheSet(path, { ...cur, items, limit })
    return { response: { items, limit }, op }
  }

  if (method === 'POST' && (m = /^\/api\/profiles\/([^/]+)\/notifications\/read$/.exec(path))) {
    const key = `/api/profiles/${m[1]}/notifications`
    const ids = Array.isArray(body?.ids) ? new Set(body.ids as string[]) : null
    const cur = (await cacheGet<{ items: { id: string; read: boolean }[] }>(key)) ?? { items: [] }
    await cacheSet(key, { items: cur.items.map((x) => (!ids || ids.has(x.id) ? { ...x, read: true } : x)) })
    return { response: { ok: true }, op }
  }

  if (method === 'DELETE' && (m = /^\/api\/profiles\/([^/]+)\/notifications$/.exec(path))) {
    await cacheSet(path, { items: [] })
    return { response: { ok: true }, op }
  }

  if (method === 'DELETE' && (m = /^\/api\/profiles\/([^/]+)\/songs\/([^/]+)\/([^/?]+)$/.exec(path))) {
    const key = `/api/profiles/${m[1]}/songs/${m[2]}`
    const list = (await cacheGet<{ id: string }[]>(key)) ?? []
    await cacheSet(key, list.filter((s) => s.id !== m![3]))
    return { response: { ok: true }, op }
  }

  return null
}
