import { useEffect, useMemo, useState } from 'react'
import type { Board, EpisodesMap, Row, WatchedMap } from '../types'
import { titleText, episodeKey, todayIso } from '../types'
import { api } from '../lib/api'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { isName, STATUS_NAMES } from '../lib/names'
import { notifyDataChanged, onDataChanged } from '../lib/dataEvents'
import { useToast } from '../hooks/useToast'
import { tt, ttx } from '../lib/i18n'
import { MOBILE } from '../lib/mobile/ui'
import { useAmbientTint } from '../hooks/useAmbientTint'
import Icon from './Icon'

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

// Dizide nerede kaldın: izlenmemiş ilk (yayınlanmış) bölüm ve izlenen / toplam bölüm
function progressOf(row: Row, episodes: EpisodesMap | undefined, watched: WatchedMap | null): { season: number; episode: number; seen: number; total: number } | null {
  const seasons = (episodes?.[row.id] ?? []).filter((s) => s.seasonNumber > 0)
  if (!seasons.length) return null
  const w = watched?.[row.id] ?? {}
  const today = todayIso()
  let seen = 0
  let total = 0
  let next: { season: number; episode: number } | null = null
  for (const s of seasons)
    for (const e of s.episodes) {
      const done = Boolean(w[episodeKey(s.seasonNumber, e.episodeNumber)]?.length)
      if (!done && e.airDate && e.airDate > today) continue
      total++
      if (done) seen++
      else if (!next) next = { season: s.seasonNumber, episode: e.episodeNumber }
    }
  if (!total || !next) return null
  return { ...next, seen, total }
}

export default function ForgottenRow({
  board,
  rows,
  onOpenDetail,
  titleClass,
  episodes,
}: {
  board: Board
  rows: Row[]
  onOpenDetail: (row: Row) => void
  titleClass: string
  // Dizilerde "nerede kaldın" ve ilerleme çubuğu için (verilmezse sadece süre etiketi)
  episodes?: EpisodesMap
}) {
  const { notify } = useToast()
  const [watched, setWatched] = useState<WatchedMap | null>(null)
  const [hidden, setHidden] = useState<string[]>(hiddenIds)
  const [dropped, setDropped] = useState<string[]>([])

  const [hiddenOpen, setHiddenOpen] = useState(false)

  // Bölüm işaretleyince satır sayfa yenilenmeden güncellensin (v1.26, H11)
  useEffect(() => {
    let alive = true
    const load = () =>
      api
        .getWatched()
        .then((w) => alive && setWatched(w))
        .catch(() => alive && setWatched((cur) => cur ?? {}))
    load()
    const off = onDataChanged((_b, kind) => {
      if (kind === 'watched' || kind === 'all') load()
    })
    return () => {
      alive = false
      off()
    }
  }, [board.id])

  const durumProp = resolveRole(board, 'durum')
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const posterProp = resolveRole(board, 'poster')
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId)
  const bannerProp = resolveRole(board, 'banner')
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const izleniyor = resolveStatusOption(board, 'izleniyor')
  const yarim = durumProp?.options?.find((o) => isName(o.label, STATUS_NAMES.yarim))?.id
  const izlenecek = resolveStatusOption(board, 'izlenecek')

  const items = useMemo<Item[]>(() => {
    if (!watched || !durumProp) return []
    const skip = new Set([...hidden, ...dropped])
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
  }, [watched, rows, hidden, dropped, durumProp, dateProp, izleniyor, izlenecek])

  function saveHidden(next: string[]) {
    setHidden(next)
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next.slice(-500)))
    } catch {
      /* önemsiz */
    }
  }
  function hide(id: string) {
    saveHidden([...hidden.filter((x) => x !== id), id])
  }
  function unhide(id: string) {
    saveHidden(hiddenIds().filter((x) => x !== id))
  }
  const nameOf = (row: Row) => (titleProp ? titleText(titleProp, row.values[titleProp.id]) : '')

  // Gizlemeyi geri alabilmek için (v1.26, G9): altta "Geri al" düğmeli bildirim
  function hideWithUndo(row: Row) {
    hide(row.id)
    notify(tt('"{0}" bu satırdan gizlendi.', nameOf(row)), 'info', { action: { label: tt('Geri al'), onClick: () => unhide(row.id) } })
  }

  // Bu arşivde gizlenmiş kayıtlar (başlığın yanındaki "3 gizli" bağlantısıyla görülüp geri açılır)
  const hiddenRows = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r]))
    // Sadece hâlâ bu satıra girebilecek olanlar (İzleniyor / İzlenecek) — sonradan izlenip bitenler sayılmaz
    return [...hidden]
      .reverse()
      .map((id) => byId.get(id))
      .filter((r): r is Row => Boolean(r) && Boolean(durumProp) && (r!.values[durumProp!.id] === izleniyor || r!.values[durumProp!.id] === izlenecek))
  }, [hidden, rows, durumProp, izleniyor, izlenecek])
  useEffect(() => {
    if (hiddenOpen && hiddenRows.length === 0) setHiddenOpen(false)
  }, [hiddenOpen, hiddenRows.length])

  async function drop(row: Row) {
    if (!durumProp || !yarim) return hideWithUndo(row)
    try {
      await api.updateRow(board.id, row.id, { values: { ...row.values, [durumProp.id]: yarim }, createdAt: row.createdAt, updatedAt: Date.now() }, [durumProp.id])
      notifyDataChanged(board.id)
      notify(tt('"{0}" Yarım olarak işaretlendi.', nameOf(row)))
      // Kayıtlar yenilenene kadar kart hemen kalksın; "gizlenenler" listesine girmez (durumu artık Yarım)
      setDropped((d) => [...d, row.id])
    } catch (e) {
      // Kaydedilemediyse kart yerinde kalsın — yoksa "bıraktım" sanıp İzleniyor'da unutuluyordu
      notify(e instanceof Error ? e.message : tt('Kaydedilemedi.'), 'danger')
    }
  }

  if (items.length === 0 && hiddenRows.length === 0) return null
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <h2 className={titleClass}>{tt('Unuttukların')}</h2>
        <span className="text-xs text-neutral-500">{tt('yarıda kalıp unuttukların ve listende en uzun bekleyenler')}</span>
        {hiddenRows.length > 0 && (
          <button onClick={() => setHiddenOpen((v) => !v)} className={`text-xs transition ${hiddenOpen ? 'text-[#7fdcff]' : 'text-neutral-500 hover:text-[#00c0fa]'}`}>
            {hiddenOpen ? tt('Gizlenenleri kapat') : tt('{0} gizli', hiddenRows.length)}
          </button>
        )}
      </div>
      {hiddenOpen && (
        <div className="mb-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-2.5">
          <p className="text-[11px] text-neutral-500 px-1 pb-2">{tt('Bu satırdan gizlediklerin — geri getirince koşula uyuyorsa yine burada görünür.')}</p>
          <div className="flex flex-wrap gap-1.5">
            {hiddenRows.map((row) => {
              const img = (posterProp && (row.values[posterProp.id] as string)) || (coverProp && (row.values[coverProp.id] as string)) || ''
              return (
                <span key={row.id} className="inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-950/60 pl-1 pr-1 py-1 max-w-full">
                  <span className="h-7 w-5 shrink-0 rounded overflow-hidden bg-neutral-800">{img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}</span>
                  <button onClick={() => onOpenDetail(row)} className="min-w-0 truncate text-xs text-neutral-200 hover:text-neutral-50 max-w-[12rem]">
                    {nameOf(row)}
                  </button>
                  <button onClick={() => unhide(row.id)} className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#7fdcff] bg-[#00c0fa]/10 hover:bg-[#00c0fa]/20 transition">
                    {tt('Geri getir')}
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      )}
      {items.length === 0 && !hiddenOpen && <p className="text-xs text-neutral-600 pb-3">{tt('Şu an hatırlatılacak bir şey yok.')}</p>}
      {!MOBILE && items.length > 0 && (
        // Geniş kartlar (öneri A2): yapımın yatay görseli, logo, "N aydır izlemedin", nerede kaldığın ve ilerleme
        // çubuğu; "Devam et" / "Bırak" kartın içinde (davranışları eskisiyle aynı). Telefonda eski küçük afişler.
        <div className="no-scrollbar flex gap-3.5 overflow-x-auto -mx-4 px-4 pt-1 pb-3">
          {items.map(({ row, days, kind }) => {
            const isWatching = Boolean(durumProp && row.values[durumProp.id] === izleniyor)
            const wide = [coverProp, bannerProp, posterProp].map((p) => (p ? ((row.values[p.id] as string) ?? '') : '')).find(Boolean) ?? ''
            const logoVal = board.titleImagePropertyId ? row.values[board.titleImagePropertyId] : ''
            return (
              <ForgottenCard
                key={row.id}
                name={nameOf(row)}
                image={wide}
                logo={typeof logoVal === 'string' ? logoVal : ''}
                chip={kind === 'stale' ? ttx('{0} izlemedin', ageLabel(days)) : ttx('{0} bekliyor', ageLabel(days))}
                stale={kind === 'stale'}
                progress={kind === 'stale' ? progressOf(row, episodes, watched) : null}
                primary={kind === 'stale' ? tt('Devam et') : tt('Bak')}
                secondary={isWatching ? tt('Bırak') : tt('Gizle')}
                secondaryTitle={isWatching ? tt('Yarım olarak işaretle') : tt('Bu satırda bir daha gösterme')}
                onOpen={() => onOpenDetail(row)}
                onSecondary={() => (isWatching ? drop(row) : hideWithUndo(row))}
              />
            )
          })}
        </div>
      )}
      {MOBILE && (
      <div className="no-scrollbar flex gap-3 overflow-x-auto -mx-4 px-4 pt-1 pb-3">
        {items.map(({ row, days, kind }) => {
          const img = (posterProp && (row.values[posterProp.id] as string)) || (coverProp && (row.values[coverProp.id] as string)) || ''
          const name = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
          const isWatching = durumProp && row.values[durumProp.id] === izleniyor
          return (
            <div key={row.id} className="w-[120px] shrink-0">
              <button onClick={() => onOpenDetail(row)} title={name} className="group relative block w-full aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 shadow-lg shadow-black/40">
                {img ? (
                  <img src={img} alt={name} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
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
                  onClick={() => (isWatching ? drop(row) : hideWithUndo(row))}
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
      )}
    </div>
  )
}

function ForgottenCard({
  name,
  image,
  logo,
  chip,
  stale,
  progress,
  primary,
  secondary,
  secondaryTitle,
  onOpen,
  onSecondary,
}: {
  name: string
  image: string
  logo: string
  chip: React.ReactNode
  stale: boolean
  progress: { season: number; episode: number; seen: number; total: number } | null
  primary: string
  secondary: string
  secondaryTitle: string
  onOpen: () => void
  onSecondary: () => void
}) {
  // Kartın altı yapımın kendi renginde koyulaşır (yazılar hep beyaz, açık temada da)
  const tint = useAmbientTint(image, { lightness: 0.1, maxSat: 0.6, inLight: true })
  const fade = tint ?? '#000000'
  const pct = progress ? Math.round((progress.seen / progress.total) * 100) : null
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        onOpen()
      }}
      title={name}
      className="group relative w-[340px] shrink-0 aspect-[16/10] rounded-2xl overflow-hidden bg-neutral-800 border border-white/[0.06] shadow-lg shadow-black/40 cursor-pointer text-left transition duration-300 hover:-translate-y-1"
      style={tint ? { boxShadow: `0 14px 34px -16px ${tint}` } : undefined}
    >
      {image && (
        <img src={image} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      )}
      <span className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(to top, ${fade}f0 8%, ${fade}66 52%, rgba(0,0,0,.35))` }} />
      <div className="absolute inset-0 flex flex-col px-3.5 py-3">
        <span
          className={`self-start inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            stale ? 'bg-amber-400/95 text-[#1a1000]' : 'bg-black/60 text-white border border-white/15 backdrop-blur-sm'
          }`}
        >
          <Icon name="clock" className="h-3 w-3" />
          {chip}
        </span>
        <div className="mt-auto">
          {logo ? (
            <img
              src={logo}
              alt={name}
              loading="lazy"
              decoding="async"
              className="max-h-10 max-w-[60%] object-contain object-left-bottom"
              style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.8))' }}
            />
          ) : (
            <p className="text-lg font-bold text-white truncate" style={{ textShadow: '0 1px 6px rgba(0,0,0,.8)' }}>
              {name}
            </p>
          )}
          {progress && pct !== null && (
            <>
              <div className="mt-2 mb-1.5 flex justify-between gap-2 text-xs text-white/80">
                <span className="truncate">{ttx('{0}. Sezon · {1}. bölümde kaldın', progress.season, progress.episode)}</span>
                <span className="shrink-0">
                  {progress.seen} / {progress.total}
                </span>
              </div>
              <div className="h-[3px] rounded-full bg-white/20 overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: 'linear-gradient(90deg,#015eea,#00c0fa)' }} />
              </div>
            </>
          )}
          <div className="mt-2.5 flex gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-bold text-black hover:bg-white/85 transition"
            >
              <Icon name="play" className="h-3.5 w-3.5" />
              {primary}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSecondary()
              }}
              title={secondaryTitle}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-[12.5px] font-bold text-white backdrop-blur-sm hover:bg-rose-500/30 hover:border-rose-400/50 transition"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
              {secondary}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
