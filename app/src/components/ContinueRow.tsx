import { useEffect, useMemo, useState } from 'react'
import type { Board, EpisodesMap, Row, WatchedMap } from '../types'
import { titleText, episodeKey, todayIso } from '../types'
import { api } from '../lib/api'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { onDataChanged } from '../lib/dataEvents'
import { isName, STATUS_NAMES } from '../lib/names'
import { tt, EP } from '../lib/i18n'
import Icon from './Icon'

// Ana sayfadaki "Kaldığın yerden" satırı (v1.23.3, öneri A2; Ana Sayfa Ayarları › Satırlar'dan açılır):
// durumu İzleniyor ya da Yarım olanlar, en son dokunduğun en başta. Dikey afiş yerine yatay görsel + logo,
// altında ne kadar ilerlediğini gösteren çizgi. Dizide ilerleme izlenen bölümlerden, filmde Nook'un yazdığı
// kaldığın yerden (progress.json) geliyor.

type Prog = Record<string, { atMs: number | null; durationMs: number | null }>

export default function ContinueRow({
  board,
  rows,
  episodes,
  onOpenDetail,
  titleClass,
}: {
  board: Board
  rows: Row[]
  episodes: EpisodesMap
  onOpenDetail: (row: Row) => void
  titleClass?: string
}) {
  const [watched, setWatched] = useState<WatchedMap>({})
  const [prog, setProg] = useState<Prog>({})
  const [brokenStill, setBrokenStill] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    const load = () => {
      api.getWatched().then((w) => !cancelled && setWatched(w)).catch(() => {})
      api.getAllProgress().then((p) => !cancelled && setProg(p)).catch(() => {})
    }
    load()
    const off = onDataChanged(() => load())
    return () => {
      cancelled = true
      off()
    }
  }, [board.id])

  const durum = resolveRole(board, 'durum')
  const live = resolveStatusOption(board, 'izleniyor')
  const half = durum?.options?.find((o) => isName(o.label, STATUS_NAMES.yarim))?.id

  const list = useMemo(() => {
    if (!durum || (!live && !half)) return []
    return rows
      .filter((r) => {
        const v = r.values[durum.id]
        return (live && v === live) || (half && v === half)
      })
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
      .slice(0, 16)
  }, [rows, durum, live, half])

  if (list.length === 0) return null

  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  const logoProp = board.properties.find((p) => p.id === board.titleImagePropertyId && p.type === 'image')
  const bannerProp = resolveRole(board, 'banner')
  const posterProp = resolveRole(board, 'poster')

  // still: sıradaki bölümün karesi (TMDB), episode: "S2 · B5 · Bölüm adı" (v1.26, A12)
  function info(row: Row): { pct: number | null; text: string; still?: string; episode?: string } {
    const seasons = (episodes[row.id] ?? []).filter((s) => s.seasonNumber > 0)
    if (seasons.length) {
      const w = watched[row.id] ?? {}
      let total = 0
      let seen = 0
      let next: string | null = null
      let nextEp: { name: string; still: string | null } | null = null
      const today = todayIso()
      for (const s of seasons)
        for (const e of s.episodes) {
          // Henüz yayınlanmamış bölümler ilerlemeye ve "sıradaki"ye girmez (izlenmişse yine sayılır)
          const done = Boolean(w[episodeKey(s.seasonNumber, e.episodeNumber)]?.length)
          if (!done && e.airDate && e.airDate > today) continue
          total++
          if (w[episodeKey(s.seasonNumber, e.episodeNumber)]?.length) seen++
          else if (!next) {
            next = `S${s.seasonNumber} · ${EP()}${e.episodeNumber}`
            nextEp = { name: e.name, still: e.stillUrl }
          }
        }
      // Genel adlar ("Bölüm 5", "Episode 5") bölüm adı sayılmaz
      const epName = nextEp?.name && !/^(bölüm|episode|b)\s*\d+$/i.test(nextEp.name.trim()) ? nextEp.name.trim() : ''
      return {
        pct: total ? seen / total : null,
        text: next ?? tt('{0}/{1} bölüm', seen, total),
        still: nextEp?.still || undefined,
        episode: next ? (epName ? `${next} · ${epName}` : next) : undefined,
      }
    }
    const p = prog[row.id]
    if (p?.atMs && p.durationMs) {
      const left = Math.max(0, Math.round((p.durationMs - p.atMs) / 60000))
      return { pct: p.atMs / p.durationMs, text: left >= 60 ? tt('{0}s {1}dk kaldı', Math.floor(left / 60), left % 60) : tt('{0}dk kaldı', left) }
    }
    return { pct: null, text: row.values[durum!.id] === half ? tt('Yarım kaldı') : tt('İzleniyor') }
  }

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className={titleClass ?? 'text-xl font-semibold text-neutral-200'}>{tt('Kaldığın yerden')}</h2>
        <span className="text-xs text-neutral-500">{tt('izlediğin ve yarım bıraktıkların')}</span>
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto -mx-4 px-4 pt-1 pb-3">
        {list.map((row) => {
          const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
          const fallback = [coverProp, bannerProp, posterProp].map((p) => (p ? (row.values[p.id] as string) : '')).find(Boolean) ?? ''
          const logo = logoProp ? ((row.values[logoProp.id] as string) ?? '') : ''
          const { pct, text, still, episode } = info(row)
          // Dizide sıradaki bölümün kendi karesi; yoksa (ya da yüklenemezse) eski görsel
          const image = (still && !brokenStill.has(row.id) ? still : '') || fallback
          return (
            <button
              key={row.id}
              onClick={() => onOpenDetail(row)}
              title={title}
              className="group w-[300px] shrink-0 text-left rounded-xl overflow-hidden bg-neutral-900 shadow-lg shadow-black/40 transition duration-300 hover:-translate-y-1 hover:shadow-black/70"
            >
              <span className="relative block aspect-video bg-neutral-800">
                {image && (
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => image !== fallback && setBrokenStill((b) => new Set(b).add(row.id))}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                {logo ? (
                  <img src={logo} alt={title} loading="lazy" decoding="async" className="absolute left-3 bottom-3 max-h-[38%] max-w-[60%] object-contain" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.8))' }} />
                ) : (
                  <span className="absolute left-3 bottom-2.5 right-3 text-base font-bold text-white truncate" style={{ textShadow: '0 1px 6px rgba(0,0,0,.8)' }}>
                    {title}
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <span className="h-12 w-12 rounded-full border-2 border-white bg-black/50 flex items-center justify-center text-white">
                    <Icon name="play" className="h-5 w-5 ml-0.5" />
                  </span>
                </span>
              </span>
              <span className="block h-[3px] bg-neutral-800">
                {pct !== null && <span className="block h-full" style={{ width: `${Math.max(3, Math.round(pct * 100))}%`, background: 'linear-gradient(90deg,#015eea,#00c0fa)' }} />}
              </span>
              {episode ? (
                <span className="block px-3 py-2 text-xs">
                  <span className="block font-semibold text-neutral-100 truncate">{title}</span>
                  <span className="block text-neutral-400 truncate mt-0.5">{episode}</span>
                </span>
              ) : (
                <span className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="font-semibold text-neutral-100 truncate">{title}</span>
                  <span className="shrink-0 text-neutral-400">{text}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
