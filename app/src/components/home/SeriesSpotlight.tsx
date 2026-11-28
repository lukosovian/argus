import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Board, HomeSettings, Row } from '../../types'
import { titleText, ratingAverage } from '../../types'
import { api, type KoleksiyonInfo } from '../../lib/api'
import { buildKoleksiyonItems, buildShelves } from '../../lib/koleksiyonRaflar'
import { autoShelf } from '../../lib/shelves'
import { isWatchedStatus, resolveRole, resolveStatusOption } from '../../lib/roles'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'
import { useAmbientTint } from '../../hooks/useAmbientTint'
import { tt } from '../../lib/i18n'
import Icon from '../Icon'

// "Seri vitrini" (öneri A4): Koleksiyon'daki raflardan (Harry Potter, Kingsman…) biri, ara sıra vitrinin yerine
// dergi kapağı gibi geniş bir bantta: serinin görseli, logosu, kaçını izlediğin, ortalama puanın, bütün filmlerin
// afişleri (izlediklerinde tik). Ana Sayfa Ayarları › Vitrin'den açılıp kapanır, kaç açılışta bir geleceği seçilir.

export const SERIES_SPOT_DEFAULTS = { enabled: true, every: 3, onlyUnfinished: true }
export const SERIES_SPOT_EVERY = [1, 2, 3, 5, 10]

export interface SpotMember {
  row: Row
  title: string
  poster: string
  year: string
  watched: boolean
}
export interface SeriesSpot {
  key: string
  name: string
  members: SpotMember[]
  watched: number
  films: boolean
  avg: number | null
  backdrop: string
  logo: string
  next: Row | null
}

// Açılış sayacı: sayfa (uygulama) her açıldığında profil başına bir kez artar; o oturum boyunca karar sabit kalır
const COUNT_KEY = 'argus_seri_vitrini_n_'
const sessionCount = new Map<string, number>()
const sessionPick = new Map<string, string>()
function loadCount(profileId: string): number {
  const hit = sessionCount.get(profileId)
  if (hit !== undefined) return hit
  let n = 0
  try {
    n = Number(localStorage.getItem(COUNT_KEY + profileId)) || 0
  } catch {
    /* kapalı */
  }
  n += 1
  try {
    localStorage.setItem(COUNT_KEY + profileId, String(n))
  } catch {
    /* kapalı */
  }
  sessionCount.set(profileId, n)
  return n
}

export function useSeriesSpot(
  board: Board | null | undefined,
  rows: Row[],
  profileId: string | null,
  settings: HomeSettings,
  active: boolean,
): { status: 'off' | 'loading' | 'ready'; spot: SeriesSpot | null } {
  const cfg = { ...SERIES_SPOT_DEFAULTS, ...settings.seriesSpot }
  const n = profileId ? loadCount(profileId) : 0
  const due = Boolean(profileId) && cfg.enabled && active && (n - 1) % Math.max(1, cfg.every) === 0
  const [info, setInfo] = useState<{ boardId: string; info: KoleksiyonInfo } | null>(null)
  const [failed, setFailed] = useState(false)
  const boardId = board?.id
  useEffect(() => {
    if (!due || !boardId || info?.boardId === boardId) return
    let alive = true
    setFailed(false)
    api
      .getKoleksiyon(boardId)
      .then((d) => alive && setInfo({ boardId, info: d }))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [due, boardId, info?.boardId])

  const spots = useMemo(() => {
    if (!due || !board || !info || info.boardId !== board.id) return null
    return buildSpots(board, rows, info.info)
  }, [due, board, rows, info])

  if (!due || !board) return { status: 'off', spot: null }
  if (failed) return { status: 'off', spot: null }
  if (!spots) return { status: 'loading', spot: null }
  const pool = cfg.onlyUnfinished ? spots.filter((s) => s.watched < s.members.length) : spots
  if (pool.length === 0) return { status: 'off', spot: null }
  // Bu oturumda seçilen seri sabit kalsın (veri yenilenince başka seriye atlamasın)
  const pickKey = `${profileId}:${board.id}:${cfg.onlyUnfinished ? 1 : 0}`
  let spot = pool.find((s) => s.key === sessionPick.get(pickKey))
  if (!spot) {
    // Bitmemiş seriler öne: önce onların içinden rastgele
    const unfinished = pool.filter((s) => s.watched < s.members.length)
    const from = unfinished.length ? unfinished : pool
    spot = from[Math.floor(Math.random() * from.length)]
    sessionPick.set(pickKey, spot.key)
  }
  return { status: 'ready', spot }
}

function buildSpots(board: Board, rows: Row[], info: KoleksiyonInfo): SeriesSpot[] {
  const durum = resolveRole(board, 'durum')
  const later = resolveStatusOption(board, 'izlenecek')
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  const orig = resolveRole(board, 'orjinalAdi')
  const kategori = resolveRole(board, 'kategori')
  const posterProp = resolveRole(board, 'poster')
  const vizyon = resolveRole(board, 'vizyon')
  const puan = resolveRole(board, 'puan')
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  const bannerProp = resolveRole(board, 'banner')
  const str = (r: Row, id?: string) => (id && typeof r.values[id] === 'string' ? (r.values[id] as string) : '')

  const { shelves } = buildShelves(buildKoleksiyonItems(board, rows, info), info)
  // İzlenecek'teki yapımlar da kendi serisinin rafına (Koleksiyon'daki halkayla aynı yol)
  const laterByKey = new Map<string, Row[]>()
  if (durum && later)
    for (const r of rows) {
      if (r.values[durum.id] !== later) continue
      const title = tp ? titleText(tp, r.values[tp.id]) : ''
      const original = str(r, orig?.id) || title
      if (!original) continue
      const col = info.laterCollections?.[r.id]
      const isSeries = info.mediaTypes[r.id] ? info.mediaTypes[r.id] === 'tv' : /dizi/i.test(kategori?.options?.find((o) => o.id === r.values[kategori.id])?.label ?? '')
      const k = autoShelf(col?.name ?? original, isSeries, Boolean(col)).key
      if (k) laterByKey.set(k, [...(laterByKey.get(k) ?? []), r])
    }

  const out: SeriesSpot[] = []
  for (const sh of shelves) {
    if (sh.manual) continue
    const memberRows = [...sh.items.map((it) => it.row), ...(laterByKey.get(sh.key) ?? [])]
    const seen = new Set<string>()
    const members: SpotMember[] = []
    for (const r of memberRows) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      members.push({
        row: r,
        title: tp ? titleText(tp, r.values[tp.id]) : '',
        poster: str(r, posterProp?.id) || str(r, coverProp?.id),
        year: str(r, vizyon?.id).slice(0, 4),
        watched: Boolean(durum && isWatchedStatus(board, r.values[durum.id])),
      })
    }
    if (members.length < 2) continue
    members.sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999'))
    const next = members.find((m) => !m.watched)?.row ?? null
    const pick = next ?? members[members.length - 1].row
    const backdrop = str(pick, coverProp?.id) || str(pick, bannerProp?.id) || members.map((m) => str(m.row, coverProp?.id)).find(Boolean) || ''
    if (!backdrop) continue
    const scores = puan ? members.map((m) => ratingAverage(m.row.values[puan.id], puan)).filter((x): x is number => x !== null && x > 0) : []
    out.push({
      key: sh.key,
      name: sh.name,
      members,
      watched: members.filter((m) => m.watched).length,
      films: sh.items.every((it) => !it.isSeries),
      avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      backdrop,
      logo: members.map((m) => str(m.row, board.titleImagePropertyId ?? undefined)).find(Boolean) ?? '',
      next,
    })
  }
  return out
}

function Ring({ value, label }: { value: number; label: string }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <span className="relative inline-flex h-[54px] w-[54px] shrink-0 items-center justify-center">
      <svg viewBox="0 0 54 54" className="absolute inset-0 -rotate-90">
        <circle cx="27" cy="27" r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="5" />
        <circle cx="27" cy="27" r={r} fill="none" stroke="url(#argus-spot-ring)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} />
        <defs>
          <linearGradient id="argus-spot-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#015eea" />
            <stop offset="1" stopColor="#00c0fa" />
          </linearGradient>
        </defs>
      </svg>
      <span className="relative text-[11px] font-bold text-white">{label}</span>
    </span>
  )
}

export default function SeriesSpotlight({ spot, onOpenDetail }: { spot: SeriesSpot; onOpenDetail: (row: Row) => void }) {
  const navigate = useNavigate()
  // Bant serinin kendi renginde koyulaşır (yazılar hep beyaz, açık temada da)
  const tint = useAmbientTint(spot.backdrop, { lightness: 0.07, maxSat: 0.5, inLight: true })
  const base = tint ?? '#080808'
  const total = spot.members.length
  const done = spot.watched === total
  return (
    <div className="relative mx-3 sm:mx-6 overflow-hidden rounded-[20px] border border-white/[0.08] shadow-2xl shadow-black/40" style={{ animation: 'argus-fade-in .6s ease-out' }}>
      <img src={spot.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(90deg, ${base}f5 28%, ${base}8c 60%, ${base}33), linear-gradient(0deg, ${base}e6, transparent 45%)` }}
      />
      <div className="relative z-[2] flex min-h-[340px] flex-col px-6 py-6 sm:px-8 sm:py-7 text-white">
        <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.2em] text-amber-300">
          <Icon name="layers" className="h-3.5 w-3.5" />
          {(spot.films ? tt('SERİ · {0} FİLM', total) : tt('SERİ · {0} YAPIM', total)).toLocaleUpperCase('tr')}
        </div>
        {spot.logo ? (
          <img src={spot.logo} alt={spot.name} className="my-3 max-h-[90px] max-w-[300px] object-contain object-left" style={{ filter: 'drop-shadow(0 2px 10px rgba(0,0,0,.6))' }} />
        ) : (
          <p className="my-3 text-4xl font-bold tracking-tight">{spot.name}</p>
        )}
        <p className="max-w-[420px] text-sm leading-relaxed text-white/80">
          {done ? tt('{0} yapımın hepsini izledin.', total) : tt('{0} / {1} izledin.', spot.watched, total)}
          {spot.avg !== null && (
            <>
              {' '}
              {tt('Ortalama puanın {0}.', spot.avg.toFixed(1))}
            </>
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Ring value={total ? spot.watched / total : 0} label={`${spot.watched}/${total}`} />
          <button
            onClick={() => navigate(`/koleksiyon?raf=${encodeURIComponent(spot.key)}`)}
            style={primaryButtonStyle}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${PRIMARY_BUTTON}`}
          >
            <Icon name="layers" className="h-4 w-4" />
            {tt('Seriyi aç')}
          </button>
          {spot.next && (
            <button
              onClick={() => spot.next && onOpenDetail(spot.next)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/15 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/25"
            >
              <Icon name="play" className="h-4 w-4" />
              {tt('Sıradakini aç')}
            </button>
          )}
        </div>
        <div className="no-scrollbar mt-auto flex gap-2 overflow-x-auto pt-5 pb-1 pr-2 -mr-2">
          {spot.members.map((m) => {
            const isNext = spot.next?.id === m.row.id
            return (
              <button
                key={m.row.id}
                onClick={() => onOpenDetail(m.row)}
                title={m.year ? `${m.title} (${m.year})` : m.title}
                className="group relative w-14 shrink-0 pt-1 pr-1"
              >
                <span
                  className={`block aspect-[2/3] overflow-hidden rounded-md bg-white/10 shadow-[0_6px_18px_rgba(0,0,0,.6)] transition-transform duration-300 group-hover:-translate-y-1 ${
                    isNext ? 'ring-2 ring-[#00c0fa]' : ''
                  } ${m.watched || isNext ? '' : 'opacity-60 group-hover:opacity-100'}`}
                >
                  {m.poster ? (
                    <img src={m.poster} alt={m.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center p-1 text-center text-[9px] leading-tight text-white/70">{m.title}</span>
                  )}
                </span>
                {m.watched && (
                  <span className="absolute right-0 top-0 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-green-500 text-[#04210f] shadow">
                    <Icon name="check" className="h-[11px] w-[11px]" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
