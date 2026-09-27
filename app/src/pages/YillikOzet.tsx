import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useProfiles } from '../hooks/useProfiles'
import { canSeeWrapped, setFeaturesCache, useFeatures } from '../hooks/useFeatures'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { resolveRole } from '../lib/roles'
import { entryEnd, parseEntry, toEntries } from '../lib/dateRange'
import { ratingAverage, titleText, type Board, type Row, type WatchedMap } from '../types'
import { BRAND_GRADIENT } from '../lib/theme'
import RowDetailModal from '../components/RowDetailModal'
import YearPosterWall from '../components/YearPosterWall'

// Yıllık Özet (Spotify Wrapped gibi) — kullanıcı "şimdilik sadece ben göreyim, diğer kullanıcılara açıp
// kapatabileyim" dedi. Geliştirici bilgisayarında her zaman görünür; diğerlerinde features.json'daki
// anahtar açıksa. Bir yılda izlenenler: İzleme Tarihi'nin (aralıksa bitiş günü) o yıla düşenleri ve o yıl
// işaretlenen bölümler.
const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Stats {
  titles: Row[]
  // o yıl ilk izlendiği güne göre sıralı (aynı gün içindeyse arşivdeki sıra)
  order: { row: Row; date: string }[]
  films: number
  seriesFinished: number
  episodes: number
  filmMinutes: number
  activeDays: number
  longestStreak: number
  months: number[]
  topGenres: { label: string; count: number }[]
  topCountries: { label: string; count: number }[]
  topRated: { row: Row; score: number }[]
  topActors: { label: string; image?: string; count: number }[]
  first: { row: Row; date: string } | null
  last: { row: Row; date: string } | null
  rewatches: Row[]
}

function computeStats(board: Board, rows: Row[], watched: WatchedMap, year: string): Stats {
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const kategoriProp = resolveRole(board, 'kategori')
  const turProp = resolveRole(board, 'tur')
  const ulkeProp = resolveRole(board, 'ulke')
  const puanProp = resolveRole(board, 'puan')
  const sureProp = resolveRole(board, 'sure')
  const oyuncuProp = resolveRole(board, 'oyuncular')
  const isSeries = (r: Row) => /dizi/i.test(kategoriProp?.options?.find((o) => o.id === r.values[kategoriProp.id])?.label ?? '')
  const days = new Set<string>()
  const months = Array(12).fill(0)
  const titleSet = new Map<string, Row>()
  const firstSeen = new Map<string, string>()
  let films = 0
  let seriesFinished = 0
  let episodes = 0
  let filmMinutes = 0
  let first: { row: Row; date: string } | null = null
  let last: { row: Row; date: string } | null = null
  const rewatches: Row[] = []
  const touch = (row: Row, date: string) => {
    days.add(date)
    months[Number(date.slice(5, 7)) - 1]++
    titleSet.set(row.id, row)
    const prev = firstSeen.get(row.id)
    if (!prev || date < prev) firstSeen.set(row.id, date)
    if (!first || date < first.date) first = { row, date }
    if (!last || date > last.date) last = { row, date }
  }
  for (const row of rows) {
    const entries = dateProp ? toEntries(row.values[dateProp.id]).sort() : []
    entries.forEach((e, i) => {
      const end = entryEnd(e)
      if (!end.startsWith(year)) return
      touch(row, end)
      const start = parseEntry(e).start
      if (start.startsWith(year)) days.add(start)
      if (isSeries(row)) seriesFinished++
      else {
        films++
        const m = sureProp ? row.values[sureProp.id] : null
        if (typeof m === 'number') filmMinutes += m
        if (i > 0) rewatches.push(row)
      }
    })
    for (const ds of Object.values(watched[row.id] ?? {})) {
      for (const d of ds ?? []) {
        if (!d.startsWith(year)) continue
        episodes++
        touch(row, d)
      }
    }
  }
  // en uzun seri
  let best = 0
  let run = 0
  for (let d = new Date(Number(year), 0, 1); d.getFullYear() === Number(year); d.setDate(d.getDate() + 1)) {
    if (days.has(ymd(d))) {
      run++
      best = Math.max(best, run)
    } else run = 0
  }
  const titles = [...titleSet.values()]
  const count = (prop: typeof turProp) => {
    if (!prop) return []
    const m = new Map<string, number>()
    for (const r of titles) {
      const v = r.values[prop.id]
      for (const id of Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []) m.set(id, (m.get(id) ?? 0) + 1)
    }
    return [...m.entries()]
      .map(([id, c]) => ({ label: prop.options?.find((o) => o.id === id)?.label ?? '?', count: c, image: prop.options?.find((o) => o.id === id)?.image }))
      .sort((a, b) => b.count - a.count)
  }
  const topRated = puanProp
    ? titles
        .map((row) => ({ row, score: ratingAverage(row.values[puanProp.id], puanProp) }))
        .filter((x): x is { row: Row; score: number } => typeof x.score === 'number')
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
    : []
  const order = titles.map((row) => ({ row, date: firstSeen.get(row.id)! })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return {
    titles,
    order,
    films,
    seriesFinished,
    episodes,
    filmMinutes,
    activeDays: days.size,
    longestStreak: best,
    months,
    topGenres: count(turProp).slice(0, 5),
    topCountries: count(ulkeProp).slice(0, 5),
    topRated,
    topActors: count(oyuncuProp).slice(0, 8),
    first,
    last,
    rewatches: [...new Set(rewatches)],
  }
}

export default function YillikOzet() {
  const features = useFeatures()
  const { settings } = useHomeSettings()
  const { activeProfileId } = useProfiles()
  const { notify } = useToast()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const [watched, setWatched] = useState<WatchedMap>({})
  const [params, setParams] = useSearchParams()
  const [detail, setDetail] = useState<Row | null>(null)

  useEffect(() => {
    if (!activeProfileId) return
    Promise.resolve()
      .then(() => api.getWatched())
      .then(setWatched)
      .catch(() => {})
  }, [activeProfileId])

  // Verisi olan yıllar
  const years = useMemo(() => {
    if (!board) return []
    const dateProp = resolveRole(board, 'izlemeTarihi')
    // Yılda en az 3 izleme olan yıllar (0001 gibi hatalı ya da tek tük eski tarihler listeyi kalabalıklaştırmasın)
    const count = new Map<string, number>()
    const add = (y: string) => count.set(y, (count.get(y) ?? 0) + 1)
    for (const r of rows) {
      if (dateProp) for (const e of toEntries(r.values[dateProp.id])) add(entryEnd(e).slice(0, 4))
      for (const ds of Object.values(watched[r.id] ?? {})) for (const d of ds ?? []) add(d.slice(0, 4))
    }
    const now = new Date().getFullYear()
    return [...count.entries()]
      .filter(([y, n]) => /^\d{4}$/.test(y) && Number(y) >= 1990 && Number(y) <= now && n >= 3)
      .map(([y]) => y)
      .sort()
      .reverse()
  }, [board, rows, watched])
  const year = params.get('yil') ?? years[0] ?? String(new Date().getFullYear())
  const stats = useMemo(() => (board ? computeStats(board, rows, watched, year) : null), [board, rows, watched, year])

  if (features && !canSeeWrapped(features)) {
    return <p className="text-neutral-500 text-sm p-10 text-center">Yıllık Özet henüz açık değil.</p>
  }
  if (!board || loading || !stats) return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>

  const look = (r: Row) => {
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    const poster = resolveRole(board, 'poster')
    const banner = resolveRole(board, 'banner')
    return {
      title: (tp ? titleText(tp, r.values[tp.id]) : '') || 'İsimsiz',
      poster: (poster && (r.values[poster.id] as string)) || '',
      banner: (banner && (r.values[banner.id] as string)) || '',
    }
  }
  const hours = Math.round(stats.filmMinutes / 60)
  const maxMonth = Math.max(...stats.months, 1)
  const busiestMonth = stats.months.indexOf(Math.max(...stats.months))
  const collage = stats.titles.map(look).filter((x) => x.poster).slice(0, 18)
  const Big = ({ n, label, sub }: { n: string | number; label: string; sub?: string }) => (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
      <p className="text-4xl sm:text-5xl font-black text-neutral-50 tabular-nums tracking-tight">{n}</p>
      <p className="text-sm text-neutral-300 mt-1">{label}</p>
      {sub && <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>}
    </div>
  )

  async function toggleForAll(v: boolean) {
    try {
      const r = await fetch('/api/features', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wrappedForAll: v }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setFeaturesCache({ developer: true, wrappedForAll: d.wrappedForAll })
      notify(v ? 'Yıllık Özet diğer kullanıcılara açılacak — güncellemeyi gönderdiğinde onlarda da görünür.' : 'Yıllık Özet diğer kullanıcılara kapatıldı (güncellemeyi gönderince).')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Kaydedilemedi.', 'danger')
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Kapak */}
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-10 sm:px-10 sm:py-14">
        <div className="absolute inset-0 grid grid-cols-6 sm:grid-cols-9 opacity-25 pointer-events-none">
          {collage.map((c, i) => (
            <img key={i} src={c.poster} alt="" className="w-full aspect-[2/3] object-cover" />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-950/95 via-neutral-950/80 to-[#015eea]/40 pointer-events-none" />
        <div className="relative">
          <p className="text-sm font-semibold tracking-widest text-[#7fdcff]">ARGUS · YILLIK ÖZET</p>
          <h1 className="text-5xl sm:text-7xl font-black text-neutral-50 tracking-tight mt-2">{year}</h1>
          <p className="text-lg text-neutral-300 mt-3 max-w-xl">
            Bu yıl <span className="font-bold text-neutral-50">{stats.titles.length}</span> farklı yapım izledin
            {stats.activeDays ? (
              <>
                , <span className="font-bold text-neutral-50">{stats.activeDays}</span> gün ekran başındaydın.
              </>
            ) : (
              '.'
            )}
          </p>
          {years.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-5">
              {years.map((y) => (
                <button
                  key={y}
                  onClick={() => setParams({ yil: y })}
                  className={`text-sm rounded-full px-3.5 py-1 border transition ${y === year ? 'border-[#00c0fa] text-[#7fdcff] bg-[#00c0fa]/10' : 'border-neutral-700 text-neutral-400 hover:text-neutral-100'}`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Big n={stats.films} label="film izledin" sub={stats.rewatches.length ? `${stats.rewatches.length} tanesini tekrar` : undefined} />
        <Big n={stats.seriesFinished} label="dizi bitirdin" />
        <Big n={stats.episodes} label="bölüm izledin" />
        <Big n={hours} label="saat film" sub="filmlerin süresine göre" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
          <p className="text-sm text-neutral-400">En yoğun ayın</p>
          <p className="text-3xl font-black text-neutral-50 mt-1">{stats.months[busiestMonth] ? TR_MONTHS[busiestMonth] : '—'}</p>
          <div className="flex items-end gap-1 h-24 mt-4">
            {stats.months.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="w-full rounded-t" style={{ height: `${Math.max(3, (m / maxMonth) * 100)}%`, background: i === busiestMonth ? BRAND_GRADIENT : 'var(--color-neutral-700)' }} />
                <span className="text-[9px] text-neutral-500 mt-1">{TR_MONTHS[i].slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5 flex flex-col justify-between">
          <div>
            <p className="text-sm text-neutral-400">En uzun serin</p>
            <p className="text-3xl font-black text-neutral-50 mt-1">{stats.longestStreak} gün üst üste</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[
              ['Yılın ilki', stats.first],
              ['Yılın sonuncusu', stats.last],
            ].map(([label, x]) => {
              const it = x as { row: Row; date: string } | null
              if (!it) return null
              const l = look(it.row)
              return (
                <button key={label as string} onClick={() => setDetail(it.row)} className="flex items-center gap-2 text-left min-w-0">
                  {l.poster && <img src={l.poster} alt="" className="h-14 w-10 rounded object-cover shrink-0" />}
                  <span className="min-w-0">
                    <span className="block text-[11px] text-neutral-500">{label as string}</span>
                    <span className="block text-sm text-neutral-100 truncate">{l.title}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {stats.topRated.length > 0 && (
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
          <p className="text-lg font-bold text-neutral-50 mb-4">Yılın favorilerin</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {stats.topRated.map(({ row, score }, i) => {
              const l = look(row)
              return (
                <button key={row.id} onClick={() => setDetail(row)} className="text-left">
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-neutral-800">
                    {l.poster && <img src={l.poster} alt="" className="h-full w-full object-cover" />}
                    <span className="absolute top-1.5 left-1.5 h-7 w-7 rounded-full bg-black/70 text-white font-black flex items-center justify-center">{i + 1}</span>
                    <span className="absolute bottom-1.5 left-1.5 text-[11px] font-bold bg-amber-400 text-neutral-950 rounded px-1.5 py-0.5">★ {score.toFixed(1)}</span>
                  </div>
                  <p className="text-xs text-neutral-200 mt-1.5 line-clamp-2">{l.title}</p>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          ['En çok izlediğin türler', stats.topGenres],
          ['En çok izlediğin ülkeler', stats.topCountries],
        ].map(([title, list]) => {
          const l = list as { label: string; count: number }[]
          if (!l.length) return null
          return (
            <section key={title as string} className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
              <p className="text-lg font-bold text-neutral-50 mb-3">{title as string}</p>
              <ol className="space-y-2">
                {l.map((x, i) => (
                  <li key={x.label} className="flex items-center gap-3">
                    <span className={`w-6 text-right font-black ${i === 0 ? 'text-[#7fdcff] text-xl' : 'text-neutral-500'}`}>{i + 1}</span>
                    <span className="flex-1 text-neutral-100">{x.label}</span>
                    <span className="text-sm text-neutral-500 tabular-nums">{x.count}</span>
                  </li>
                ))}
              </ol>
            </section>
          )
        })}
      </div>

      {stats.topActors.length > 0 && (
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
          <p className="text-lg font-bold text-neutral-50 mb-4">En çok karşına çıkan oyuncular</p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {stats.topActors.map((a) => (
              <div key={a.label} className="min-w-0 text-center">
                <div className="aspect-[2/3] rounded-xl overflow-hidden bg-neutral-800">{a.image && <img src={a.image} alt="" className="h-full w-full object-cover object-top" />}</div>
                <p className="text-xs text-neutral-200 mt-1.5 line-clamp-2 leading-tight">{a.label}</p>
                <p className="text-[11px] text-neutral-500">{a.count} yapım</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <YearPosterWall
        year={year}
        items={stats.order.map(({ row, date }) => ({ ...look(row), date }))}
        onOpen={(i) => setDetail(stats.order[i].row)}
      />

      <p className="text-center text-sm text-neutral-500">
        Gün gün ne izlediğini <Link to={`/takvim?ay=${year}-01&gorunum=yil`} className="text-[#00c0fa] hover:underline">Takvim</Link>'de görebilirsin.
      </p>

      {features?.developer && (
        <section className="rounded-2xl border border-dashed border-neutral-700 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-neutral-200">Diğer kullanıcılara açık mı?</p>
            <p className="text-xs text-neutral-500">Şu an sadece sen görüyorsun. Açarsan, güncellemeyi gönderdiğinde herkesin menüsünde çıkar.</p>
          </div>
          <div className="grid grid-cols-2 rounded-xl bg-neutral-950/60 border border-neutral-800 p-1 text-sm">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                onClick={() => toggleForAll(v)}
                className={`px-3 py-1 rounded-lg transition ${features.wrappedForAll === v ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:text-neutral-100'}`}
              >
                {v ? 'Açık' : 'Kapalı'}
              </button>
            ))}
          </div>
        </section>
      )}

      {detail && <RowDetailModal board={board} row={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
