import { useEffect, useMemo, useState } from 'react'
import type { Board, Row, WatchedMap } from '../types'
import { titleText } from '../types'
import { api } from '../lib/api'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { isName, STATUS_NAMES } from '../lib/names'
import { notifyDataChanged } from '../lib/dataEvents'
import { useToast } from '../hooks/useToast'
import { tt, ttx } from '../lib/i18n'

// "Unuttukların" satırı — kullanıcı önerilen "unutulanlar hatırlatması"nı istedi: İzleniyor'da olup 2 aydır hiç
// izlenmemiş içerikler ("Devam mı, bırakalım mı?") ve İzlenecek listesinde 6 aydan uzun bekleyenler. Yarım'dakiler
// zaten bilerek bırakılmış, gösterilmiyor. "Bırak" İzleniyor'u Yarım'a alır; "Gizle" kartı bu satırdan kaldırır.
const HIDDEN_KEY = 'argus_forgotten_hidden'
const STALE_DAYS = 60
const WAITING_DAYS = 180

function hiddenIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function daysSince(day: string): number {
  return Math.floor((Date.now() - new Date(day + 'T12:00:00').getTime()) / 864e5)
}

function dayOf(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ageLabel(days: number): string {
  if (days >= 365) return tt('{0} yıldır', Math.floor(days / 365))
  if (days >= 60) return tt('{0} aydır', Math.floor(days / 30))
  return tt('{0} gündür', days)
}

type Item = { row: Row; days: number; kind: 'stale' | 'waiting' }

export default function ForgottenRow({ board, rows, onOpenDetail, titleClass }: { board: Board; rows: Row[]; onOpenDetail: (row: Row) => void; titleClass: string }) {
  const { notify } = useToast()
  const [watched, setWatched] = useState<WatchedMap | null>(null)
  const [hidden, setHidden] = useState<string[]>(hiddenIds)

  useEffect(() => {
    let alive = true
    api
      .getWatched()
      .then((w) => alive && setWatched(w))
      .catch(() => alive && setWatched({}))
    return () => {
      alive = false
    }
  }, [])

  const durumProp = resolveRole(board, 'durum')
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const posterProp = resolveRole(board, 'poster')
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId)
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const izleniyor = resolveStatusOption(board, 'izleniyor')
  const yarim = durumProp?.options?.find((o) => isName(o.label, STATUS_NAMES.yarim))?.id
  const izlenecek = resolveStatusOption(board, 'izlenecek')

  const items = useMemo<Item[]>(() => {
    if (!watched || !durumProp) return []
    const skip = new Set(hidden)
    const out: Item[] = []
    for (const r of rows) {
      if (skip.has(r.id)) continue
      const st = r.values[durumProp.id]
      if (st && st === izleniyor) {
        // Son hareket: bölüm işaretleri, izleme tarihleri, yoksa eklendiği gün
        const dv = dateProp ? r.values[dateProp.id] : null
        const days = [
          ...Object.values(watched[r.id] ?? {}).flat(),
          ...(Array.isArray(dv) ? dv : typeof dv === 'string' && dv ? [dv] : []).map((x) => String(x).split('/').pop() ?? ''),
        ]
          .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
          .sort()
        const last = days[days.length - 1] ?? (r.createdAt ? dayOf(r.createdAt) : '')
        if (last && daysSince(last) >= STALE_DAYS) out.push({ row: r, days: daysSince(last), kind: 'stale' })
      } else if (st && st === izlenecek && r.createdAt) {
        const d = daysSince(dayOf(r.createdAt))
        if (d >= WAITING_DAYS) out.push({ row: r, days: d, kind: 'waiting' })
      }
    }
    // Önce yarım kalanlar (en eskiden), sonra en uzun bekleyen 8 izlenecek
    const stale = out.filter((x) => x.kind === 'stale').sort((a, b) => b.days - a.days)
    const waiting = out.filter((x) => x.kind === 'waiting').sort((a, b) => b.days - a.days).slice(0, 8)
    return [...stale, ...waiting]
  }, [watched, rows, hidden, durumProp, dateProp, izleniyor, izlenecek])

  function hide(id: string) {
    const next = [...hidden, id]
    setHidden(next)
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next.slice(-500)))
    } catch {
      /* önemsiz */
    }
  }

  async function drop(row: Row) {
    if (!durumProp || !yarim) return hide(row.id)
    try {
      await api.updateRow(board.id, row.id, { values: { ...row.values, [durumProp.id]: yarim }, createdAt: row.createdAt, updatedAt: Date.now() }, [durumProp.id])
      notifyDataChanged(board.id)
      notify(tt('"{0}" Yarım olarak işaretlendi.', titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''))
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Kaydedilemedi.'), 'danger')
    }
    hide(row.id)
  }

  if (items.length === 0) return null
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className={titleClass}>{tt('Unuttukların')}</h2>
        <span className="text-xs text-neutral-500">{tt('yarıda kalıp unuttukların ve listende en uzun bekleyenler')}</span>
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto -mx-4 px-4 pt-1 pb-3">
        {items.map(({ row, days, kind }) => {
          const img = (posterProp && (row.values[posterProp.id] as string)) || (coverProp && (row.values[coverProp.id] as string)) || ''
          const name = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
          const isWatching = durumProp && row.values[durumProp.id] === izleniyor
          return (
            <div key={row.id} className="w-[120px] shrink-0">
              <button onClick={() => onOpenDetail(row)} title={name} className="group relative block w-full aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 shadow-lg shadow-black/40">
                {img ? (
                  <img src={img} alt={name} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-neutral-400">{name}</span>
                )}
                <span className={`absolute top-1.5 left-1.5 text-[10px] font-semibold rounded px-1.5 py-0.5 ${kind === 'stale' ? 'bg-amber-400 text-neutral-950' : 'bg-black/70 text-neutral-100'}`}>
                  {kind === 'stale' ? ttx('{0} izlemedin', ageLabel(days)) : ttx('{0} bekliyor', ageLabel(days))}
                </span>
              </button>
              <p className="text-xs text-neutral-200 mt-1.5 truncate">{name}</p>
              <div className="flex gap-1 mt-1">
                <button
                  onClick={() => onOpenDetail(row)}
                  className="flex-1 text-[11px] rounded-md border border-neutral-700 text-neutral-200 hover:border-[#00c0fa] hover:text-[#7fdcff] py-1 transition"
                >
                  {kind === 'stale' ? tt('Devam') : tt('Bak')}
                </button>
                <button
                  onClick={() => (isWatching ? drop(row) : hide(row.id))}
                  title={isWatching ? tt('Yarım olarak işaretle') : tt('Bu satırda bir daha gösterme')}
                  className="flex-1 text-[11px] rounded-md border border-neutral-700 text-neutral-400 hover:border-rose-500 hover:text-rose-300 py-1 transition"
                >
                  {isWatching ? tt('Bırak') : tt('Gizle')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
