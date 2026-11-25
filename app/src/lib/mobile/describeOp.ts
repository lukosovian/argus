// Bekleyen / gönderilemeyen bir değişikliği kullanıcının anlayacağı dille anlatır: ne tür bir değişiklik ve
// (telefondaki kopyadan bulunabiliyorsa) hangi yapım. Bkz. components/mobile/PendingChanges.tsx
import { cacheGet, cacheKeys, type QueuedOp } from './store'
import { ratingAverage, titleText, type Board, type PropertyDef, type PropertyValue, type Row } from '../../types'
import { tt } from '../i18n'

export interface OpInfo {
  kind: string
  title: string | null
}

function parse(body?: string): Record<string, unknown> {
  if (!body) return {}
  try {
    const v = JSON.parse(body)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function rowTitle(profile: string, boardId: string | null, rowId: string, fromBody?: Row): Promise<string | null> {
  const boards = (await cacheGet<Board[]>(`/api/profiles/${profile}/boards`)) ?? []
  const keys = boardId ? [`/api/profiles/${profile}/boards/${boardId}/rows`] : (await cacheKeys(`/api/profiles/${profile}/boards/`)).filter((k) => k.endsWith('/rows'))
  for (const key of keys) {
    const bId = key.split('/')[5]
    const board = boards.find((b) => b.id === bId)
    const tp = board?.properties.find((p) => p.id === board.titlePropertyId)
    if (!tp) continue
    const row = fromBody ?? ((await cacheGet<Row[]>(key)) ?? []).find((r) => r.id === rowId)
    if (row) {
      const t = titleText(tp, row.values?.[tp.id] ?? null)
      if (t) return t
    }
  }
  return null
}

export async function describeOp(op: QueuedOp): Promise<OpInfo> {
  const { method, path } = op
  const body = parse(op.body)
  let m: RegExpExecArray | null
  try {
    if ((m = /^\/api\/profiles\/([^/]+)\/boards\/([^/]+)\/rows(?:\/([^/?]+))?$/.exec(path))) {
      const [, p, b, id] = m
      if (method === 'POST') return { kind: tt('Yeni kayıt eklendi'), title: await rowTitle(p, b, String(body.id ?? ''), body as unknown as Row) }
      if (method === 'DELETE') return { kind: tt('Kayıt silindi'), title: id ? await rowTitle(p, b, id) : null }
      return { kind: tt('Kayıt düzenlendi'), title: id ? await rowTitle(p, b, id) : null }
    }
    if ((m = /^\/api\/profiles\/([^/]+)\/watched\/([^/?]+)/.exec(path))) {
      return { kind: tt('Bölüm işaretlendi'), title: await rowTitle(m[1], null, decodeURIComponent(m[2])) }
    }
    if (/\/home-settings$/.test(path)) return { kind: tt('Ana sayfa ayarları değişti'), title: null }
    if ((m = /^\/api\/profiles\/([^/]+)\/koleksiyon$/.exec(path))) {
      const ids = Object.keys((body.items as Record<string, unknown>) ?? {})
      return { kind: tt('Koleksiyon değişti'), title: ids[0] ? await rowTitle(m[1], null, ids[0]) : null }
    }
    if (/\/aklimda$/.test(path)) {
      const items = Object.values((body.items as Record<string, { title?: string } | null>) ?? {})
      const t = items.find((x) => x?.title)?.title
      return { kind: tt('Aklımda listesi değişti'), title: t ?? null }
    }
    if ((m = /^\/api\/profiles\/([^/]+)\/biletler$/.exec(path))) {
      const entries = Object.entries((body.items as Record<string, { title?: string } | null>) ?? {})
      const removed = entries.length > 0 && entries.every(([, v]) => v === null)
      let t = entries.map(([, v]) => v?.title).find(Boolean) ?? null
      if (!t && entries[0]) {
        const cur = await cacheGet<{ items?: Record<string, { title?: string }> }>(path)
        t = cur?.items?.[entries[0][0]]?.title ?? null
      }
      return { kind: removed ? tt('Sinema bileti silindi') : tt('Sinema bileti kaydedildi'), title: t }
    }
    if (/\/notifications\/read$/.test(path)) return { kind: tt('Bildirimler okundu sayıldı'), title: null }
    if (/\/notifications$/.test(path)) return { kind: tt('Bildirimler temizlendi'), title: null }
    if (/\/songs\//.test(path)) return { kind: tt('Şarkı silindi'), title: null }
    if (/\/store\/[^/?]+$/.test(path)) return { kind: tt('Ayar kaydedildi'), title: null }
    if (/\/oduller$/.test(path)) return { kind: tt('Ödül işlemi'), title: null }
  } catch {
    /* anlatılamadı — genel ad */
  }
  return { kind: tt('Diğer değişiklik'), title: null }
}

// PC'nin reddetme sebebi, sade dille
export function failReason(status: number, error: string | null): string {
  if (error) return error
  if (status === 404) return tt('PC\'de bu kayıt artık yok.')
  if (status === 409) return tt('PC\'deki hâliyle çakıştı.')
  if (status >= 500) return tt('PC\'de bir hata oldu.')
  return tt('PC bu değişikliği kabul etmedi ({0}).', status)
}

// ---- PC'nin uygulamadığı sütunlar (v1.26, bkz. connection › SkippedOp) ----
export interface SkippedField {
  name: string
  pc: string
  phone: string
}

function shortValue(prop: PropertyDef | undefined, v: unknown): string {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return tt('(boş)')
  if (v && typeof v === 'object' && (v as { _uzun?: boolean })._uzun) return tt('(uzun metin)')
  if (prop?.type === 'rating') {
    const avg = ratingAverage(v as PropertyValue, prop)
    return avg === null ? tt('(boş)') : avg.toFixed(1)
  }
  if (prop?.type === 'checkbox') return v ? tt('Evet') : tt('Hayır')
  const label = (id: unknown) => prop?.options?.find((o) => o.id === id)?.label ?? String(id)
  if (prop?.type === 'select') return label(v)
  if (Array.isArray(v)) return v.map((x) => (prop?.type === 'multiselect' ? label(x) : String(x))).join(', ')
  if (prop?.type === 'image') return tt('(görsel)')
  if (typeof v === 'object') return tt('(değişti)')
  const s = String(v)
  return s.length > 80 ? s.slice(0, 79) + '…' : s
}

// Hangi sütun, PC'deki değer, telefondaki değer — sade yazıyla
export async function describeSkippedFields(op: QueuedOp, fields: { id: string; pc?: unknown }[]): Promise<SkippedField[]> {
  const m = /^\/api\/profiles\/([^/]+)\/boards\/([^/]+)\/rows\/([^/?]+)$/.exec(op.path)
  if (!m) return []
  const [, p, b, rowId] = m
  const board = ((await cacheGet<Board[]>(`/api/profiles/${p}/boards`)) ?? []).find((x) => x.id === b)
  const cachedRow = ((await cacheGet<Row[]>(`/api/profiles/${p}/boards/${b}/rows`)) ?? []).find((r) => r.id === rowId)
  const values = (parse(op.body).values ?? {}) as Record<string, unknown>
  return fields.map((f) => {
    const prop = board?.properties.find((x) => x.id === f.id)
    const pc = 'pc' in f ? f.pc : cachedRow?.values?.[f.id]
    return { name: prop?.name ?? tt('Bir sütun'), pc: shortValue(prop, pc), phone: shortValue(prop, values[f.id]) }
  })
}
