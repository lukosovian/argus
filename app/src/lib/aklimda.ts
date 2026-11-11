import type { AklimdaItem } from './api'
import type { Board, Row } from '../types'
import { titleText } from '../types'
import { resolveRole, resolveStatusOption } from './roles'
import { isName, STATUS_NAMES } from './names'
import { tt } from './i18n'

// Aklımda kayıtlarını ekranda gösterilecek hale getirir (ana sayfa satırı ve Aklımda sayfası ortak kullanıyor).
// Arşivdeki kayıtların afişi/adı/durumu arşivden okunur; silinmiş kayıtlar ve başka arşivin kayıtları atlanır.

export type AklimdaStatus = 'izlenecek' | 'yarim' | 'izlendi' | 'yok' | 'diger'

export interface AklimdaEntry {
  key: string
  item: AklimdaItem
  row: Row | null
  title: string
  poster: string
  year: string
  status: AklimdaStatus
  statusLabel: string
}

export function aklimdaEntries(board: Board | null, rows: Row[], items: Record<string, AklimdaItem>): AklimdaEntry[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const titleProp = board?.properties.find((p) => p.id === board.titlePropertyId)
  const posterProp = board ? resolveRole(board, 'poster') : undefined
  const coverProp = board?.properties.find((p) => p.id === board.coverPropertyId)
  const durumProp = board ? resolveRole(board, 'durum') : undefined
  const vizyonProp = board ? resolveRole(board, 'vizyon') : undefined
  const opt = (k: 'izlenecek' | 'izleniyor' | 'izlendi') => (board ? resolveStatusOption(board, k) : undefined)
  const izlenecek = opt('izlenecek')
  const izleniyor = opt('izleniyor')
  const izlendi = opt('izlendi')
  const yarim = durumProp?.options?.find((o) => isName(o.label, STATUS_NAMES.yarim))?.id

  const out: AklimdaEntry[] = []
  for (const [key, item] of Object.entries(items)) {
    if (item.tmdb) {
      out.push({ key, item, row: null, title: item.tmdb.title, poster: item.tmdb.poster ?? '', year: item.tmdb.year, status: 'yok', statusLabel: tt('Arşivinde yok') })
      continue
    }
    if (!board || item.boardId !== board.id) continue
    const row = byId.get(key)
    if (!row) continue
    const st = durumProp ? row.values[durumProp.id] : undefined
    const status: AklimdaStatus = st && st === izlenecek ? 'izlenecek' : st && (st === izleniyor || st === yarim) ? 'yarim' : st && st === izlendi ? 'izlendi' : 'diger'
    const statusLabel = (durumProp && durumProp.options?.find((o) => o.id === st)?.label) || ''
    const vz = vizyonProp ? row.values[vizyonProp.id] : undefined
    out.push({
      key,
      item,
      row,
      title: titleProp ? titleText(titleProp, row.values[titleProp.id]) : '',
      poster: (posterProp && (row.values[posterProp.id] as string)) || (coverProp && (row.values[coverProp.id] as string)) || '',
      year: typeof vz === 'string' ? vz.slice(0, 4) : '',
      status,
      statusLabel,
    })
  }
  return out.sort((a, b) => (b.item.addedAt ?? 0) - (a.item.addedAt ?? 0))
}

export const STATUS_TONE: Record<AklimdaStatus, string> = {
  izlenecek: 'bg-[#00c0fa] text-white',
  yarim: 'bg-amber-400 text-neutral-950',
  izlendi: 'bg-emerald-500 text-white',
  yok: 'bg-violet-500 text-white',
  diger: 'bg-black/70 text-neutral-100',
}

export function daysAgoLabel(t: number): string {
  const d = Math.floor((Date.now() - t) / 864e5)
  if (d <= 0) return tt('bugün')
  if (d === 1) return tt('dün')
  if (d < 30) return tt('{0} gün önce', d)
  if (d < 365) return tt('{0} ay önce', Math.floor(d / 30))
  return tt('{0} yıl önce', Math.floor(d / 365))
}
