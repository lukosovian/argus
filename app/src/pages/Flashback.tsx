import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useProfiles } from '../hooks/useProfiles'
import { canSeeWrapped, markWrappedSeen, setFeaturesCache, useFeatures } from '../hooks/useFeatures'
import { useToast } from '../hooks/useToast'
import { api, type KoleksiyonInfo } from '../lib/api'
import { resolveRole } from '../lib/roles'
import { entryEnd, toEntries } from '../lib/dateRange'
import { computeStats, fmtDuration, TR_DAYS, TR_DAYS_SHORT, TR_MONTHS, type TitleInfo } from '../lib/flashback'
import type { Row, WatchedMap } from '../types'
import { BRAND_GRADIENT } from '../lib/theme'
import RowDetailModal from '../components/RowDetailModal'
import YearPosterWall from '../components/YearPosterWall'
import FlashbackStory, { type StoryData } from '../components/FlashbackStory'
import BackgroundProgress from '../components/BackgroundProgress'

// Flashback — yıllık özet (Spotify Wrapped gibi). Kullanıcı "adı Flashback olsun, dizi filmlere uyumlu"
// dedi ve şu kutuları istedi: toplam ekran süresi (film + dizi), puanlama profili ve yılın en düşük
// puanı, nostalji radarı, haftanın günü / saat dilimi, izleyici unvanı, maraton/seri tespiti, oyuncu ↔
// yönetmen geçişi ve 9:16 hikâye kartı. Hesaplar lib/flashback.ts'de. Geliştirici bilgisayarında hep
// görünür; diğerlerinde features.json'daki anahtar açıksa (açıp kapatınca kendisi gönderilir).

type Extra = { runtimes: Record<string, number>; hours: number[]; timed: number; pending: { done: number; total: number } | null }

const CARD = 'rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5'

function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-lg font-bold text-neutral-50">{children}</p>
      {sub && <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function Bars({ values, labels, highlight, height = 'h-24' }: { values: number[]; labels: string[]; highlight: number; height?: string }) {
  const max = Math.max(...values, 1)
  return (
    <div className={`flex items-end gap-1 ${height}`}>
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <div className="w-full rounded-t" style={{ height: `${Math.max(3, (v / max) * 100)}%`, background: i === highlight ? BRAND_GRADIENT : 'var(--color-neutral-700)' }} />
          <span className="text-[9px] text-neutral-500 mt-1 truncate max-w-full">{labels[i]}</span>
        </div>
      ))}
    </div>
  )
}

export default function Flashback() {
  const features = useFeatures()
  const { settings } = useHomeSettings()
  const { activeProfileId } = useProfiles()
  const { notify } = useToast()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const [watched, setWatched] = useState<WatchedMap>({})
  const [params, setParams] = useSearchParams()
  const [detail, setDetail] = useState<Row | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [extra, setExtra] = useState<Extra | null>(null)
  const [kol, setKol] = useState<KoleksiyonInfo | null>(null)
  const [people, setPeople] = useState<'oyuncu' | 'yonetmen'>('oyuncu')
  const [story, setStory] = useState<StoryData | null>(null)

  useEffect(() => {
    markWrappedSeen()
  }, [])

  useEffect(() => {
    if (!activeProfileId) return
    api
      .getWatched()
      .then(setWatched)
      .catch(() => {})
  }, [activeProfileId])

  // Verisi olan yıllar — yılda en az 3 izleme (0001 gibi hatalı ya da tek tük eski tarihler kalabalık etmesin)
  const years = useMemo(() => {
    if (!board) return []
    const dateProp = resolveRole(board, 'izlemeTarihi')
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

  // Bölüm süreleri ve seri bilgileri arka planda öğreniliyorsa bitene kadar arada bir yenile
  const loadExtra = useCallback(() => {
    if (!board) return
    api
      .getFlashback(board.id, year)
      .then(setExtra)
      .catch(() => {})
    api
      .getKoleksiyon(board.id)
      .then(setKol)
      .catch(() => {})
  }, [board, year])
  useEffect(() => {
    if (activeProfileId) loadExtra()
  }, [loadExtra, activeProfileId])
  useEffect(() => {
    if (!extra?.pending && !kol?.pending) return
    const t = setTimeout(loadExtra, 4000)
    return () => clearTimeout(t)
  }, [extra, kol, loadExtra])

  const stats = useMemo(
    () =>
      board
        ? computeStats(board, rows, watched, year, {
            runtimes: extra?.runtimes ?? {},
            hours: extra?.hours ?? Array(24).fill(0),
            timed: extra?.timed ?? 0,
            collections: kol?.collections ?? {},
            mediaTypes: kol?.mediaTypes ?? {},
          })
        : null,
    [board, rows, watched, year, extra, kol],
  )

  if (features && !canSeeWrapped(features)) {
    return <p className="text-neutral-500 text-sm p-10 text-center">Flashback henüz açık değil.</p>
  }
  if (!board || loading || !stats) return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>

  const total = stats.filmMinutes + stats.seriesMinutes
  const busiestMonth = stats.months.indexOf(Math.max(...stats.months))
  const busiestDay = stats.weekdays.indexOf(Math.max(...stats.weekdays))
  const collage = stats.order.filter((t) => t.poster).slice(0, 18)
  const dayparts = [
    { label: 'Sabah', sub: '06–12', hours: [6, 7, 8, 9, 10, 11] },
    { label: 'Öğlen', sub: '12–17', hours: [12, 13, 14, 15, 16] },
    { label: 'Akşam', sub: '17–22', hours: [17, 18, 19, 20, 21] },
    { label: 'Gece', sub: '22–06', hours: [22, 23, 0, 1, 2, 3, 4, 5] },
  ].map((p) => ({ ...p, n: p.hours.reduce((s, h) => s + (stats.hours[h] ?? 0), 0) }))
  const topDaypart = dayparts.reduce((a, b) => (b.n > a.n ? b : a))
  const avg = stats.scores.avg
  const judge = avg === null ? '' : avg >= 8.5 ? 'Cömert jüri' : avg <= 6.5 ? 'Zor beğenen' : 'Dengeli eleştirmen'
  const peopleList = people === 'oyuncu' ? stats.topActors : stats.topDirectors

  function openStory() {
    const s = stats!
    const sp = (t: TitleInfo) => ({ title: t.title, poster: t.poster, score: t.score, year: t.releaseYear })
    setStory({
      year,
      titles: s.order.length,
      activeDays: s.activeDays,
      films: s.films,
      episodes: s.episodes,
      seriesFinished: s.seriesFinished,
      totalMin: total,
      filmMin: s.filmMinutes,
      seriesMin: s.seriesMinutes,
      persona: s.persona,
      months: s.months,
      weekdays: s.weekdays,
      streak: s.longestStreak,
      top: s.scores.top.map(sp),
      avg: s.scores.avg,
      judge,
      lowest: s.scores.lowest ? sp(s.scores.lowest) : null,
      genres: s.topGenres,
      countries: s.topCountries,
      marathons: s.marathons.slice(0, 3).map((m) => ({
        name: m.name,
        kind: m.kind,
        line: m.kind === 'seri' ? `${m.count} yapım, ${m.days} günde` : `${m.days} günde ${m.count} bölüm`,
        posters: m.titles.map((t) => t.poster).filter(Boolean),
      })),
      actors: s.topActors,
      decades: s.decades,
      newShare: s.newShare,
      classicShare: s.classicShare,
      oldest: s.oldest ? sp(s.oldest) : null,
      posters: s.order.filter((t) => t.poster).map((t) => t.poster),
    })
  }

  // Ayar değişince sunucu onu kendisi Git'e gönderiyor (bkz. server/featurePublish.js)
  async function toggleForAll(v: boolean) {
    if (publishing || features?.wrappedForAll === v) return
    setPublishing(true)
    try {
      const r = await fetch('/api/features', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wrappedForAll: v }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setFeaturesCache({ developer: true, wrappedForAll: d.wrappedForAll })
      if (d.pushed)
        notify(
          v
            ? 'Flashback diğer kullanıcılara açıldı ve gönderildi. ARGUS\'ları açıksa yaklaşık bir dakika içinde menülerinde çıkacak, bildirim de gelecek (güncelleme gerekmez).'
            : 'Flashback diğer kullanıcılara kapatıldı ve gönderildi. Yaklaşık bir dakika içinde menülerinden kalkacak.',
        )
      else notify(`Ayar bu bilgisayarda kaydedildi ama gönderilemedi: ${d.reason ?? 'bilinmeyen bir sorun'}`, 'danger')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Kaydedilemedi.', 'danger')
    } finally {
      setPublishing(false)
    }
  }

  const MiniPoster = ({ t, badge }: { t: TitleInfo; badge?: ReactNode }) => (
    <button onClick={() => setDetail(t.row)} className="text-left min-w-0">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-neutral-800">
        {t.poster && <img src={t.poster} alt="" loading="lazy" className="h-full w-full object-cover" />}
        {badge}
      </div>
      <p className="text-xs text-neutral-200 mt-1.5 line-clamp-2 leading-tight">{t.title}</p>
    </button>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Kapak */}
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-10 sm:px-10 sm:py-14">
        <div className="absolute inset-0 grid grid-cols-6 sm:grid-cols-9 opacity-25 pointer-events-none">
          {collage.map((c, i) => (
            <img key={i} src={c.poster} alt="" className="w-full aspect-[2/3] object-cover" />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-950/95 via-neutral-950/80 to-[#5b21b6]/40 pointer-events-none" />
        {/* film şeridi delikleri */}
        <div className="absolute inset-x-0 top-2 flex justify-around pointer-events-none opacity-30">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className="h-2.5 w-4 rounded-sm bg-white/40" />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-2 flex justify-around pointer-events-none opacity-30">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className="h-2.5 w-4 rounded-sm bg-white/40" />
          ))}
        </div>
        <div className="relative">
          <p className="text-sm font-semibold tracking-[0.3em] text-[#7fdcff]">ARGUS</p>
          <h1 className="font-black tracking-tight leading-none mt-2">
            <span className="block text-5xl sm:text-7xl text-neutral-50">FLASHBACK</span>
            <span className="block text-6xl sm:text-8xl bg-gradient-to-r from-[#00c0fa] to-[#8b5cf6] bg-clip-text text-transparent">{year}</span>
          </h1>
          <p className="text-lg text-neutral-300 mt-4 max-w-xl">
            Bu yıl <span className="font-bold text-neutral-50">{stats.order.length}</span> farklı yapım izledin
            {stats.activeDays ? (
              <>
                , <span className="font-bold text-neutral-50">{stats.activeDays}</span> gün ekran başındaydın.
              </>
            ) : (
              '.'
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-5">
            <button onClick={openStory} className="text-sm font-semibold rounded-full px-4 py-1.5 bg-white text-neutral-950 hover:bg-neutral-200 transition">
              Hikâye kartları
            </button>
            {years.length > 1 &&
              years.map((y) => (
                <button
                  key={y}
                  onClick={() => setParams({ yil: y })}
                  className={`text-sm rounded-full px-3.5 py-1 border transition ${y === year ? 'border-[#00c0fa] text-[#7fdcff] bg-[#00c0fa]/10' : 'border-neutral-700 text-neutral-400 hover:text-neutral-100'}`}
                >
                  {y}
                </button>
              ))}
          </div>
        </div>
      </section>

      {(extra?.pending || kol?.pending) && (
        <BackgroundProgress
          title={
            extra?.pending
              ? 'İlk açılış: dizilerinin bölüm süreleri TMDB\'den öğreniliyor (toplam ekran süresi için)'
              : 'İlk açılış: filmlerinin hangi seriden olduğu TMDB\'den öğreniliyor (maratonlar için)'
          }
          done={(extra?.pending ?? kol!.pending!).done}
          total={(extra?.pending ?? kol!.pending!).total}
          note="Sayılar bu sırada kendiliğinden güncelleniyor. Bu sadece ilk seferde olur."
        />
      )}

      {/* Toplam ekran süresi + sayılar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 relative overflow-hidden rounded-3xl border border-neutral-800 p-6" style={{ background: 'radial-gradient(ellipse at 0% 0%, rgba(0,192,250,0.18), transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(139,92,246,0.18), transparent 60%), #0b0b0f' }}>
          <p className="text-sm text-neutral-400">Toplam ekran süren</p>
          <p className="text-5xl sm:text-6xl font-black text-neutral-50 tracking-tight mt-1">{fmtDuration(total)}</p>
          <p className="text-sm text-neutral-400 mt-2">
            Film {Math.round(stats.filmMinutes / 60)} saat · Dizi {Math.round(stats.seriesMinutes / 60)} saat
          </p>
          <p className="text-[11px] text-neutral-600 mt-1">
            Dizi süresi, izlediğin bölüm sayısı × dizinin ortalama bölüm süresi
            {stats.seriesEstimated ? ' (süresi bilinmeyen birkaç dizi için yaklaşık 42 dk sayıldı)' : ''}.
          </p>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-1 gap-3">
          {[
            [stats.films, 'film', stats.rewatches ? `${stats.rewatches} tanesi tekrar` : ''],
            [stats.seriesFinished, 'dizi bitirdin', ''],
            [stats.episodes, 'bölüm', ''],
          ].map(([n, l, s]) => (
            <div key={l as string} className="rounded-3xl border border-neutral-800 bg-neutral-900/60 px-5 py-4">
              <p className="text-3xl font-black text-neutral-50 tabular-nums">{n}</p>
              <p className="text-sm text-neutral-300">{l}</p>
              {s && <p className="text-[11px] text-neutral-500">{s}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* İzleyici unvanı */}
      <section className="relative overflow-hidden rounded-3xl border border-[#8b5cf6]/40 p-6" style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(139,92,246,0.25), transparent 60%), #0b0b0f' }}>
        <p className="text-sm text-[#c4b5fd]">Bu yılın unvanı</p>
        <p className="text-4xl sm:text-5xl font-black text-neutral-50 tracking-tight mt-1">{stats.persona.title}</p>
        {stats.persona.why && <p className="text-neutral-300 mt-2">{stats.persona.why}.</p>}
        {stats.persona.badges.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {stats.persona.badges.map((b) => (
              <span key={b.title} className="rounded-2xl border border-neutral-700 bg-neutral-950/60 px-3 py-2">
                <span className="block text-sm font-semibold text-neutral-100">{b.title}</span>
                <span className="block text-[11px] text-neutral-500">{b.why}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Maratonlar */}
      {stats.marathons.length > 0 && (
        <section className={CARD}>
          <Title sub="Aynı seriden art arda izlediklerin ve birkaç günde bitirdiğin diziler">Maratonların</Title>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stats.marathons.map((m) => (
              <button key={m.kind + m.name} onClick={() => setDetail(m.titles[0].row)} className="flex items-center gap-4 rounded-2xl bg-neutral-950/50 border border-neutral-800 hover:border-neutral-600 p-3 text-left transition">
                <div className="relative h-20 shrink-0" style={{ width: `${48 + Math.min(m.titles.length - 1, 3) * 14}px` }}>
                  {m.titles.slice(0, 4).map((t, i) => (
                    <div key={t.row.id} className="absolute top-0 h-20 w-12 rounded-lg overflow-hidden bg-neutral-800 border border-neutral-900 shadow" style={{ left: i * 14, zIndex: 10 - i }}>
                      {t.poster && <img src={t.poster} alt="" className="h-full w-full object-cover" />}
                    </div>
                  ))}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-wide text-[#7fdcff] uppercase">{m.kind === 'seri' ? (m.days <= 30 || m.count >= 3 ? 'Seriyi tükettin' : 'Seri') : 'Dizi maratonu'}</p>
                  <p className="text-neutral-50 font-bold truncate">{m.name}</p>
                  <p className="text-sm text-neutral-400">{m.kind === 'seri' ? `${m.count} yapım, ${m.days} günde` : `${m.days} günde ${m.count} bölüm`}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Puanlama profili */}
      {stats.scores.count > 0 && (
        <section className={CARD}>
          <Title sub={`${stats.scores.count} yapıma puan verdin`}>Puanlama profilin</Title>
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-end">
            <div>
              <p className="text-6xl font-black text-neutral-50 tabular-nums">
                {avg!.toFixed(1)}
                <span className="text-xl text-neutral-500 font-bold"> /10</span>
              </p>
              <p className="text-sm text-amber-300 mt-1">{judge}</p>
            </div>
            <Bars values={stats.scores.histogram} labels={['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']} highlight={stats.scores.histogram.indexOf(Math.max(...stats.scores.histogram))} />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-6">
            {stats.scores.top.map((t, i) => (
              <MiniPoster
                key={t.row.id}
                t={t}
                badge={
                  <>
                    <span className="absolute top-1.5 left-1.5 h-7 w-7 rounded-full bg-black/70 text-white font-black flex items-center justify-center">{i + 1}</span>
                    <span className="absolute bottom-1.5 left-1.5 text-[11px] font-bold bg-amber-400 text-neutral-950 rounded px-1.5 py-0.5">★ {t.score!.toFixed(1)}</span>
                  </>
                }
              />
            ))}
            {stats.scores.lowest && (
              <div className="col-span-3 sm:col-span-1 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-2">
                <p className="text-[11px] font-semibold text-rose-300 mb-1.5">Yılın hayal kırıklığı</p>
                <MiniPoster t={stats.scores.lowest} badge={<span className="absolute bottom-1.5 left-1.5 text-[11px] font-bold bg-rose-500 text-white rounded px-1.5 py-0.5">★ {stats.scores.lowest.score!.toFixed(1)}</span>} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Zaman alışkanlıkları */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={CARD}>
          <p className="text-sm text-neutral-400">En yoğun ayın</p>
          <p className="text-3xl font-black text-neutral-50 mt-1">{stats.months[busiestMonth] ? TR_MONTHS[busiestMonth] : '—'}</p>
          <div className="mt-4">
            <Bars values={stats.months} labels={TR_MONTHS.map((m) => m.slice(0, 3))} highlight={busiestMonth} />
          </div>
        </div>
        <div className={CARD}>
          <p className="text-sm text-neutral-400">En çok ekran başında olduğun gün</p>
          <p className="text-3xl font-black text-neutral-50 mt-1">{Math.max(...stats.weekdays) ? `${TR_DAYS[busiestDay]} günleri` : '—'}</p>
          <div className="mt-4">
            <Bars values={stats.weekdays} labels={TR_DAYS_SHORT} highlight={busiestDay} />
          </div>
        </div>
        <div className={CARD}>
          <p className="text-sm text-neutral-400">Günün hangi saatinde?</p>
          {stats.timed >= 5 ? (
            <>
              <p className="text-3xl font-black text-neutral-50 mt-1">{topDaypart.label}</p>
              <div className="grid grid-cols-4 gap-2 mt-4">
                {dayparts.map((p) => (
                  <div key={p.label} className={`rounded-xl p-2 text-center border ${p === topDaypart ? 'border-[#00c0fa] bg-[#00c0fa]/10' : 'border-neutral-800'}`}>
                    <p className="text-lg font-bold text-neutral-100 tabular-nums">%{Math.round((p.n / stats.timed) * 100)}</p>
                    <p className="text-xs text-neutral-300">{p.label}</p>
                    <p className="text-[10px] text-neutral-600">{p.sub}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-500 mt-3">
              ARGUS izleme saatlerini yeni tutmaya başladı: bir şeyi "bugün izledim" diye işaretlediğin saat kaydediliyor. Birkaç izlemeden sonra burada sabahçı mı, gece kuşu mu olduğun görünecek.
            </p>
          )}
        </div>
        <div className={`${CARD} flex flex-col justify-between`}>
          <div>
            <p className="text-sm text-neutral-400">En uzun serin</p>
            <p className="text-3xl font-black text-neutral-50 mt-1">{stats.longestStreak.days} gün üst üste</p>
            {stats.longestStreak.days > 1 && (
              <p className="text-xs text-neutral-500 mt-1">
                {Number(stats.longestStreak.start.slice(8))} {TR_MONTHS[Number(stats.longestStreak.start.slice(5, 7)) - 1]} – {Number(stats.longestStreak.end.slice(8))}{' '}
                {TR_MONTHS[Number(stats.longestStreak.end.slice(5, 7)) - 1]}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            {([
              ['Yılın ilki', stats.order[0]],
              ['Yılın sonuncusu', [...stats.order].sort((a, b) => (a.last < b.last ? 1 : -1))[0]],
            ] as const).map(([label, t]) =>
              t ? (
                <button key={label} onClick={() => setDetail(t.row)} className="flex items-center gap-2 text-left min-w-0">
                  {t.poster && <img src={t.poster} alt="" className="h-14 w-10 rounded object-cover shrink-0" />}
                  <span className="min-w-0">
                    <span className="block text-[11px] text-neutral-500">{label}</span>
                    <span className="block text-sm text-neutral-100 truncate">{t.title}</span>
                  </span>
                </button>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {/* Nostalji radarı */}
      {stats.decades.length > 0 && (
        <section className={CARD}>
          <Title sub="İzlediklerinin çıkış yıllarına göre">Nostalji radarı</Title>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-6">
            <div className="space-y-1.5">
              {stats.decades.map((d) => {
                const max = Math.max(...stats.decades.map((x) => x.count))
                return (
                  <div key={d.label} className="flex items-center gap-3">
                    <span className="w-16 text-right text-xs text-neutral-400 tabular-nums">{d.label}</span>
                    <div className="flex-1 h-4 rounded bg-neutral-800 overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${(d.count / max) * 100}%`, background: BRAND_GRADIENT }} />
                    </div>
                    <span className="w-8 text-xs text-neutral-500 tabular-nums">{d.count}</span>
                  </div>
                )
              })}
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-neutral-800 p-3">
                  <p className="text-2xl font-black text-neutral-50">%{Math.round(stats.newShare * 100)}</p>
                  <p className="text-[11px] text-neutral-400">yeni yapım ({Number(year) - 1}–{year})</p>
                </div>
                <div className="rounded-2xl border border-neutral-800 p-3">
                  <p className="text-2xl font-black text-neutral-50">%{Math.round(stats.classicShare * 100)}</p>
                  <p className="text-[11px] text-neutral-400">20 yıldan eski</p>
                </div>
              </div>
              {stats.oldest && (
                <button onClick={() => setDetail(stats.oldest!.row)} className="flex items-center gap-3 text-left w-full rounded-2xl border border-neutral-800 p-2 hover:border-neutral-600 transition">
                  {stats.oldest.poster && <img src={stats.oldest.poster} alt="" className="h-16 w-11 rounded object-cover shrink-0" />}
                  <span className="min-w-0">
                    <span className="block text-[11px] text-neutral-500">En eski izlediğin</span>
                    <span className="block text-sm text-neutral-100 truncate">{stats.oldest.title}</span>
                    <span className="block text-xs text-amber-300">{stats.oldest.releaseYear}</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Türler / ülkeler */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {([
          ['En çok izlediğin türler', stats.topGenres],
          ['En çok izlediğin ülkeler', stats.topCountries],
        ] as const).map(([title, l]) =>
          l.length ? (
            <section key={title} className={CARD}>
              <p className="text-lg font-bold text-neutral-50 mb-3">{title}</p>
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
          ) : null,
        )}
      </div>

      {/* Oyuncular ↔ yönetmenler */}
      {(stats.topActors.length > 0 || stats.topDirectors.length > 0) && (
        <section className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-lg font-bold text-neutral-50">{people === 'oyuncu' ? 'En çok karşına çıkan oyuncular' : 'En çok izlediğin yönetmenler'}</p>
            <div className="grid grid-cols-2 rounded-xl bg-neutral-950/60 border border-neutral-800 p-1 text-sm">
              {(['oyuncu', 'yonetmen'] as const).map((k) => (
                <button key={k} onClick={() => setPeople(k)} className={`px-3 py-1 rounded-lg transition ${people === k ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:text-neutral-100'}`}>
                  {k === 'oyuncu' ? 'Oyuncular' : 'Yönetmenler'}
                </button>
              ))}
            </div>
          </div>
          {peopleList.length ? (
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
              {peopleList.map((a) => (
                <div key={a.label} className="min-w-0 text-center">
                  <div className="aspect-[2/3] rounded-xl overflow-hidden bg-neutral-800">{a.image && <img src={a.image} alt="" className={`h-full w-full object-cover ${people === 'oyuncu' ? 'object-top' : 'opacity-80'}`} />}</div>
                  <p className="text-xs text-neutral-200 mt-1.5 line-clamp-2 leading-tight">{a.label}</p>
                  <p className="text-[11px] text-neutral-500">{a.count} yapım</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Bu yıl birden fazla yapımını izlediğin bir yönetmen yok.</p>
          )}
        </section>
      )}

      <YearPosterWall year={year} items={stats.order.map((t) => ({ title: t.title, poster: t.poster, date: t.first }))} onOpen={(i) => setDetail(stats.order[i].row)} onStory={openStory} />

      <p className="text-center text-sm text-neutral-500">
        Gün gün ne izlediğini{' '}
        <Link to={`/takvim?ay=${year}-01&gorunum=yil`} className="text-[#00c0fa] hover:underline">
          Takvim
        </Link>
        'de görebilirsin.
      </p>

      {features?.developer && (
        <section className="rounded-2xl border border-dashed border-neutral-700 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-neutral-200">Diğer kullanıcılara açık mı?</p>
            <p className="text-xs text-neutral-500">
              {publishing
                ? 'Gönderiliyor…'
                : features.wrappedForAll
                  ? 'Diğer kullanıcılarda açık. Kapatırsan hemen gönderilir; yaklaşık bir dakika içinde menülerinden kalkar.'
                  : 'Şu an sadece sen görüyorsun. Açarsan hemen gönderilir; diğerlerinde güncelleme gerekmeden, yaklaşık bir dakika içinde menüde çıkar ve bildirim gelir.'}
            </p>
          </div>
          <div className="grid grid-cols-2 rounded-xl bg-neutral-950/60 border border-neutral-800 p-1 text-sm">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                onClick={() => toggleForAll(v)}
                disabled={publishing}
                className={`px-3 py-1 rounded-lg transition disabled:opacity-50 ${features.wrappedForAll === v ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:text-neutral-100'}`}
              >
                {v ? 'Açık' : 'Kapalı'}
              </button>
            ))}
          </div>
        </section>
      )}

      {story && <FlashbackStory data={story} onClose={() => setStory(null)} />}
      {detail && <RowDetailModal board={board} row={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
