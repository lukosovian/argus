import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
import RowDetailModal from '../components/RowDetailModal'
import YearPosterWall from '../components/YearPosterWall'
import FlashbackStory, { type StoryData } from '../components/FlashbackStory'
import BackgroundProgress from '../components/BackgroundProgress'
import { tt, ttx, fmtDate, ttc, monthNames } from '../lib/i18n'
import PageSkeleton from '../components/Skeleton'
import Icon from '../components/Icon'
import { FbMark } from '../components/flashback/FbLogo'
import FbIntro from '../components/flashback/FbIntro'
import {
  Compare,
  Credits,
  Delta,
  droppedTitles,
  Dropped,
  FbTitle,
  GenreDna,
  Guess,
  Heatmap,
  Letter,
  NextGoal,
  PersonaCard,
  Podium,
  Reveal,
  Songs,
  Tickets,
  useYearColors,
  useYearSongs,
  useYearTickets,
} from '../components/flashback/FbSections'

// Flashback — yıllık özet (Spotify Wrapped gibi). Kullanıcı "adı Flashback olsun, dizi filmlere uyumlu"
// dedi ve şu kutuları istedi: toplam ekran süresi (film + dizi), puanlama profili ve yılın en düşük
// puanı, nostalji radarı, haftanın günü / saat dilimi, izleyici unvanı, maraton/seri tespiti, oyuncu ↔
// yönetmen geçişi ve 9:16 hikâye kartı. Hesaplar lib/flashback.ts'de. Geliştirici bilgisayarında hep
// görünür; diğerlerinde features.json'daki anahtar açıksa ya da tarih aralığındaysa (v1.24: 9–16 Aralık).
//
// v1.24: kullanıcı sunumdan "Bozuk Sinyal" logosunu ve 16 fikri seçti; "Flashback'in teması da seçtiklerimle aynı
// temada olsun" dedi. Sayfa artık hep karanlık, eski bant görüntüsü havasında (bkz. index.css › .fb-*); yeni
// bölümler components/flashback/'te.

type Extra = { runtimes: Record<string, number>; hours: number[]; timed: number; pending: { done: number; total: number } | null }

const CARD = 'fb-card'

// Ekrana girince sıfırdan sayarak yükselen sayı (v1.23.3, öneri F1). Yıl değişince yeniden sayar.
function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const run = () => {
      const t0 = performance.now()
      const step = (t: number) => {
        const p = Math.min((t - t0) / 1400, 1)
        setShown(value * (1 - Math.pow(1 - p, 3)))
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        io.disconnect()
        run()
      }
    }, { threshold: 0.3 })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value])
  return <span ref={ref}>{format(shown)}</span>
}

const HL = 'linear-gradient(180deg, #00e1ff, #ff2d8a)'
function Bars({ values, labels, highlight, height = 'h-24' }: { values: number[]; labels: string[]; highlight: number; height?: string }) {
  const max = Math.max(...values, 1)
  return (
    <div className={`flex items-end gap-1 ${height}`}>
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <div className="w-full rounded-t" style={{ height: `${Math.max(3, (v / max) * 100)}%`, background: i === highlight ? HL : 'rgba(255,255,255,0.12)', boxShadow: i === highlight ? '0 0 14px rgba(0,225,255,.35)' : undefined }} />
          <span className="text-[9px] text-neutral-500 mt-1 truncate max-w-full">{labels[i]}</span>
        </div>
      ))}
    </div>
  )
}

const introKey = (y: string) => `argus_fb_intro_${y}`
const NO_TITLES: TitleInfo[] = []

export default function Flashback() {
  const features = useFeatures()
  const { settings } = useHomeSettings()
  const { activeProfileId, activeProfile } = useProfiles()
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
  const [intro, setIntro] = useState<boolean | null>(null)

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

  const extras = useMemo(
    () => ({
      runtimes: extra?.runtimes ?? {},
      hours: extra?.hours ?? Array(24).fill(0),
      timed: extra?.timed ?? 0,
      collections: kol?.collections ?? {},
      mediaTypes: kol?.mediaTypes ?? {},
    }),
    [extra, kol],
  )
  const stats = useMemo(() => (board ? computeStats(board, rows, watched, year, extras) : null), [board, rows, watched, year, extras])
  // F13: geçen yılın sen'i — geçen yıl en az 3 yapım varsa
  const prev = useMemo(() => {
    if (!board) return null
    const p = computeStats(board, rows, watched, String(Number(year) - 1), extras)
    return p.order.length >= 3 ? p : null
  }, [board, rows, watched, year, extras])

  const colors = useYearColors(stats?.order ?? NO_TITLES)
  const songs = useYearSongs(year)
  const tickets = useYearTickets(year)
  const dropped = board && stats ? droppedTitles(board, stats.order) : NO_TITLES

  // F1: her yılın Flashback'i ilk açılışta bir kez geri sarılır
  useEffect(() => {
    // Kayıtlar ve bölüm işaretleri yüklenip yılın yapımları belli olunca karar verilir
    if (!stats || loading || intro !== null || stats.order.length === 0) return
    try {
      setIntro(!localStorage.getItem(introKey(year)))
    } catch {
      setIntro(false)
    }
  }, [stats, year, intro, loading])
  const endIntro = () => {
    try {
      localStorage.setItem(introKey(year), '1')
    } catch {
      /* önemsiz */
    }
    setIntro(false)
  }

  // F6: yılın unvan kartı Koleksiyon'a düşer — yıl bittiyse ya da Flashback açılış gününden (9 Aralık) sonra
  useEffect(() => {
    if (!stats || !stats.order.length) return
    const now = new Date()
    const Y = Number(year)
    const ready = Y < now.getFullYear() || (Y === now.getFullYear() && now.getMonth() === 11 && now.getDate() >= 9)
    if (!ready) return
    const top = stats.scores.top[0] ?? stats.order.find((t) => t.poster)
    api
      .saveFbCard({
        year,
        title: stats.persona.title,
        why: stats.persona.why,
        badges: stats.persona.badges,
        poster: top?.poster ?? '',
        films: stats.films,
        episodes: stats.episodes,
        titles: stats.order.length,
      })
      .catch(() => {})
  }, [stats, year])

  if (features && !canSeeWrapped(features)) {
    return <p className="text-neutral-500 text-sm p-10 text-center">{tt('Flashback henüz açık değil.')}</p>
  }
  if (!board || loading || !stats) return <PageSkeleton />

  const total = stats.filmMinutes + stats.seriesMinutes
  const busiestMonth = stats.months.indexOf(Math.max(...stats.months))
  const busiestDay = stats.weekdays.indexOf(Math.max(...stats.weekdays))
  const collage = stats.order.filter((t) => t.poster).slice(0, 18)
  const dayparts = [
    { label: tt('Sabah'), sub: '06–12', hours: [6, 7, 8, 9, 10, 11] },
    { label: tt('Öğlen'), sub: '12–17', hours: [12, 13, 14, 15, 16] },
    { label: tt('Akşam'), sub: '17–22', hours: [17, 18, 19, 20, 21] },
    { label: tt('Gece'), sub: '22–06', hours: [22, 23, 0, 1, 2, 3, 4, 5] },
  ].map((p) => ({ ...p, n: p.hours.reduce((s, h) => s + (stats.hours[h] ?? 0), 0) }))
  const topDaypart = dayparts.reduce((a, b) => (b.n > a.n ? b : a))
  const avg = stats.scores.avg
  const judge = avg === null ? '' : avg >= 8.5 ? tt('Cömert jüri') : avg <= 6.5 ? tt('Zor beğenen') : tt('Dengeli eleştirmen')
  const peopleList = people === 'oyuncu' ? stats.topActors : stats.topDirectors
  const titleById = new Map(rows.map((r) => [r.id, r]))
  const titleOf = (rowId: string) => {
    const r = titleById.get(rowId)
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    return r && tp ? String(r.values[tp.id] ?? '') : ''
  }
  const topSong = songs?.songs[0] ? { title: songs.songs[0].title, artist: songs.songs[0].artist } : null
  const finished = stats.films + stats.seriesFinished
  const open = (t: TitleInfo) => setDetail(t.row)

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
        line: m.kind === 'seri' ? tt('{0} yapım, {1} günde', m.count, m.days) : tt('{0} günde {1} bölüm', m.days, m.count),
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
    if (publishing || (features?.wrappedManual ?? features?.wrappedForAll) === v) return
    setPublishing(true)
    try {
      const r = await fetch('/api/features', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wrappedForAll: v }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setFeaturesCache({ developer: true, wrappedForAll: d.wrappedForAll, wrappedManual: d.wrappedManual, wrappedWindow: d.wrappedWindow })
      if (d.pushed)
        notify(
          v
            ? tt('Flashback diğer kullanıcılara açıldı ve gönderildi. ARGUS\'ları açıksa yaklaşık bir dakika içinde menülerinde çıkacak, bildirim de gelecek (güncelleme gerekmez).')
            : tt('Flashback diğer kullanıcılara kapatıldı ve gönderildi. Yaklaşık bir dakika içinde menülerinden kalkacak.'),
        )
      else notify(tt('Ayar bu bilgisayarda kaydedildi ama gönderilemedi: {0}', d.reason ?? tt('bilinmeyen bir sorun')), 'danger')
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Kaydedilemedi.'), 'danger')
    } finally {
      setPublishing(false)
    }
  }

  const MiniPoster = ({ t, badge }: { t: TitleInfo; badge?: ReactNode }) => (
    <button onClick={() => open(t)} className="text-left min-w-0">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-neutral-800">
        {t.poster && <img src={t.poster} alt="" loading="lazy" className="h-full w-full object-cover" />}
        {badge}
      </div>
      <p className="text-xs text-neutral-200 mt-1.5 line-clamp-2 leading-tight">{t.title}</p>
    </button>
  )

  const win = features?.wrappedWindow
  const winText = win ? `${fmtDate(null, Number(win.from.slice(5, 7)) - 1, Number(win.from.slice(8)))} – ${fmtDate(null, Number(win.until.slice(5, 7)) - 1, Number(win.until.slice(8)) - 1)}` : ''
  const pageStyle = { ...(colors.a ? { '--fb-a': colors.a } : {}), ...(colors.b ? { '--fb-b': colors.b } : {}) } as CSSProperties

  return (
    <div className="fb-page" style={pageStyle}>
      <div className="fb-bg" />
      {intro && <FbIntro year={year} posters={stats.order.map((t) => t.poster)} onDone={endIntro} />}
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Kapak */}
        <section className="fb-hover relative overflow-hidden rounded-3xl border border-white/10 px-6 py-10 sm:px-10 sm:py-14 bg-black">
          <div className="absolute inset-0 grid grid-cols-6 sm:grid-cols-9 opacity-25 pointer-events-none">
            {collage.map((c, i) => (
              <img key={i} src={c.poster} alt="" className="w-full aspect-[2/3] object-cover" />
            ))}
          </div>
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(110deg, rgba(5,5,7,.97) 30%, rgba(5,5,7,.75) 65%, color-mix(in srgb, var(--fb-b) 35%, transparent))' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px)' }} />
          {/* film şeridi delikleri */}
          {['top-2', 'bottom-2'].map((p) => (
            <div key={p} className={`absolute inset-x-0 ${p} flex justify-around pointer-events-none opacity-30`}>
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i} className="h-2.5 w-4 rounded-sm bg-white/40" />
              ))}
            </div>
          ))}
          <div className="relative">
            <p className="text-sm font-semibold tracking-[0.3em] text-white/50">{tt('ARGUS')}</p>
            <div className="flex items-center gap-4 sm:gap-6 mt-3">
              <FbMark className="h-14 w-14 sm:h-28 sm:w-28 shrink-0" anim="always" />
              <h1 className="leading-none">
                <span className="fb-wordmark block text-[42px] sm:text-8xl">FLASHBACK</span>
                <span className="fb-wordmark block text-4xl sm:text-7xl mt-1" style={{ color: 'transparent', WebkitTextStroke: '1.5px #fff' }}>
                  {year}
                </span>
              </h1>
            </div>
            <p className="text-lg text-neutral-200 mt-6 max-w-xl">
              {tt('Bu yıl')} <span className="font-bold text-white">{stats.order.length}</span> {tt('farklı yapım izledin')}
              {stats.activeDays ? (
                <>
                  , <span className="font-bold text-white">{stats.activeDays}</span> {tt('gün ekran başındaydın.')}
                </>
              ) : (
                '.'
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-5">
              <button onClick={openStory} className="text-sm font-bold rounded-full px-4 py-1.5 text-white" style={{ background: 'linear-gradient(90deg,#00b8d9,#ff2d8a)' }}>
                {tt('▶ Hikâye kartları')}
              </button>
              <button onClick={() => setIntro(true)} className="text-sm font-semibold rounded-full px-3.5 py-1.5 border border-white/20 text-white/80 hover:text-white hover:border-white/50">
                {tt('◀◀ Baştan sar')}
              </button>
              {years.length > 1 &&
                years.map((y) => (
                  <button
                    key={y}
                    onClick={() => {
                      setParams({ yil: y })
                      setIntro(null)
                    }}
                    className={`text-sm rounded-full px-3.5 py-1 border transition ${y === year ? 'fb-chip-on' : 'border-white/15 text-neutral-400 hover:text-white'}`}
                  >
                    {y}
                  </button>
                ))}
            </div>
            {/* F4: yılın renkleri */}
            {colors.swatches.length > 1 && (
              <div className="mt-6 flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-bold tracking-[0.25em] text-white/50">{tt('YILIN RENKLERİ')}</span>
                <div className="flex gap-1.5">
                  {colors.swatches.map((c) => (
                    <span key={c.poster} title={c.title} className="h-7 w-7 rounded-full border-2 border-white/20 overflow-hidden" style={{ background: c.hex }}>
                      <img src={c.poster} alt="" className="h-full w-full object-cover opacity-0 hover:opacity-100 transition" />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {(extra?.pending || kol?.pending) && (
          <BackgroundProgress
            title={
              extra?.pending
                ? tt('İlk açılış: dizilerinin bölüm süreleri TMDB\'den öğreniliyor (toplam ekran süresi için)')
                : tt('İlk açılış: filmlerinin hangi seriden olduğu TMDB\'den öğreniliyor (maratonlar için)')
            }
            done={(extra?.pending ?? kol!.pending!).done}
            total={(extra?.pending ?? kol!.pending!).total}
            note={tt('Sayılar bu sırada kendiliğinden güncelleniyor. Bu sadece ilk seferde olur.')}
          />
        )}

        {/* F11: önce tahmin et */}
        {stats.episodes + stats.films >= 10 && (
          <Reveal className={CARD}>
            <Guess key={`${year}-${stats.episodes}-${stats.films}`} year={year} real={stats.episodes >= stats.films ? stats.episodes : stats.films} what={stats.episodes >= stats.films ? tt('bölüm') : tt('film')} />
          </Reveal>
        )}

        {/* Toplam ekran süresi + sayılar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Reveal className={`${CARD} md:col-span-2 !p-6`}>
            <p className="text-sm text-neutral-400">{tt('Toplam ekran süren')}</p>
            <p className="fb-title text-6xl sm:text-7xl mt-3">
              <CountUp key={year} value={total} format={(n) => fmtDuration(Math.round(n))} />
            </p>
            <p className="text-sm text-neutral-400 mt-2">{ttx('Film {0} saat · Dizi {1} saat', Math.round(stats.filmMinutes / 60), Math.round(stats.seriesMinutes / 60))}</p>
            <p className="text-[11px] text-neutral-600 mt-1">
              {ttx('Dizi süresi, izlediğin bölüm sayısı × dizinin ortalama bölüm süresi{0}.', stats.seriesEstimated ? tt(' (süresi bilinmeyen birkaç dizi için yaklaşık 42 dk sayıldı)') : '')}
            </p>
            {stats.months.some((n) => n > 0) && (
              <div className="mt-6">
                <Bars values={stats.months} labels={monthNames('short')} highlight={busiestMonth} height="h-20" />
              </div>
            )}
          </Reveal>
          <div className="grid grid-cols-3 md:grid-cols-1 gap-3">
            {(
              [
                [stats.films, tt('film'), stats.rewatches ? tt('{0} tanesi tekrar', stats.rewatches) : '', prev?.films ?? null],
                [stats.seriesFinished, tt('dizi bitirdin'), '', prev?.seriesFinished ?? null],
                [stats.episodes, tt('bölüm'), '', prev?.episodes ?? null],
              ] as const
            ).map(([n, l, s, before], i) => (
              <Reveal key={l} className={`${CARD} !px-5 !py-4`} delay={i * 120}>
                <p className="fb-title text-4xl tabular-nums">
                  <CountUp key={year} value={Number(n)} />
                </p>
                <p className="text-sm text-neutral-300">{l}</p>
                {s && <p className="text-[11px] text-neutral-500">{s}</p>}
                <Delta now={Number(n)} before={before} />
              </Reveal>
            ))}
          </div>
        </div>

        {/* F6: unvan kartı */}
        <Reveal className={`${CARD} !p-6`}>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-8 items-center">
            <div className="mx-auto">
              <PersonaCard year={year} title={stats.persona.title} why={stats.persona.why} badges={stats.persona.badges} poster={(stats.scores.top[0] ?? stats.order.find((t) => t.poster))?.poster} />
            </div>
            <div>
              <p className="text-sm text-neutral-400">{tt('Bu yılın unvanı')}</p>
              <p className="fb-title text-5xl sm:text-6xl mt-1">{stats.persona.title}</p>
              {stats.persona.why && <p className="text-neutral-200 mt-2">{stats.persona.why}.</p>}
              {stats.persona.badges.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {stats.persona.badges.map((b) => (
                    <span key={b.title} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                      <span className="block text-sm font-semibold text-white">{b.title}</span>
                      <span className="block text-[11px] text-neutral-400">{b.why}</span>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-neutral-500 mt-4">{tt('Bu kart yıl sonunda Koleksiyon\'a düşer; her yıl bir tane birikir. Fareyle oynatınca parlar.')}</p>
            </div>
          </div>
        </Reveal>

        {/* Maratonlar */}
        {stats.marathons.length > 0 && (
          <Reveal className={CARD}>
            <FbTitle sub={tt('Aynı seriden art arda izlediklerin ve birkaç günde bitirdiğin diziler')}>{tt('Maratonların')}</FbTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stats.marathons.map((m) => (
                <button key={m.kind + m.name} onClick={() => setDetail(m.titles[0].row)} className="flex items-center gap-4 rounded-2xl bg-black/40 border border-white/10 hover:border-white/30 p-3 text-left transition">
                  <div className="relative h-20 shrink-0" style={{ width: `${48 + Math.min(m.titles.length - 1, 3) * 14}px` }}>
                    {m.titles.slice(0, 4).map((t, i) => (
                      <div key={t.row.id} className="absolute top-0 h-20 w-12 rounded-lg overflow-hidden bg-neutral-800 border border-black shadow" style={{ left: i * 14, zIndex: 10 - i }}>
                        {t.poster && <img src={t.poster} alt="" className="h-full w-full object-cover" />}
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold tracking-wide fb-accent uppercase">{m.kind === 'seri' ? (m.days <= 30 || m.count >= 3 ? tt('Seriyi tükettin') : tt('Seri')) : tt('Dizi maratonu')}</p>
                    <p className="text-white font-bold truncate">{m.name}</p>
                    <p className="text-sm text-neutral-400">{m.kind === 'seri' ? tt('{0} yapım, {1} günde', m.count, m.days) : tt('{0} günde {1} bölüm', m.days, m.count)}</p>
                  </div>
                </button>
              ))}
            </div>
          </Reveal>
        )}

        {/* Puanlama profili + F9 podyum */}
        {stats.scores.count > 0 && (
          <Reveal className={CARD}>
            <FbTitle sub={tt('{0} yapıma puan verdin', stats.scores.count)}>{tt('Puanlama profilin')}</FbTitle>
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-end">
              <div>
                <p className="fb-title text-7xl tabular-nums normal-case">
                  {avg!.toFixed(1)}
                  <span className="text-xl text-neutral-500"> /10</span>
                </p>
                <p className="text-sm text-amber-300 mt-1">{judge}</p>
              </div>
              <Bars values={stats.scores.histogram} labels={['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']} highlight={stats.scores.histogram.indexOf(Math.max(...stats.scores.histogram))} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 mt-6 items-end">
              <Podium top={stats.scores.top} onOpen={open} />
              {stats.scores.lowest && (
                <div className="w-36 mx-auto rounded-2xl border border-rose-500/30 bg-rose-500/5 p-2">
                  <p className="text-[11px] font-semibold text-rose-300 mb-1.5">{tt('Yılın hayal kırıklığı')}</p>
                  <MiniPoster
                    t={stats.scores.lowest}
                    badge={
                      <span className="absolute bottom-1.5 left-1.5 text-[11px] font-bold bg-rose-500 text-white rounded px-1.5 py-0.5">
                        <Icon name="star" className="h-[0.95em] w-[0.95em]" /> {stats.scores.lowest.score!.toFixed(1)}
                      </span>
                    }
                  />
                </div>
              )}
            </div>
          </Reveal>
        )}

        {/* Zaman alışkanlıkları */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Reveal className={CARD}>
            <p className="text-sm text-neutral-400">{tt('En yoğun ayın')}</p>
            <p className="fb-title text-4xl mt-1">{stats.months[busiestMonth] ? TR_MONTHS[busiestMonth] : '—'}</p>
            <div className="mt-4">
              <Bars values={stats.months} labels={TR_MONTHS.map((m) => m.slice(0, 3))} highlight={busiestMonth} />
            </div>
          </Reveal>
          <Reveal className={CARD} delay={100}>
            <p className="text-sm text-neutral-400">{tt('En çok ekran başında olduğun gün')}</p>
            <p className="fb-title text-4xl mt-1">{Math.max(...stats.weekdays) ? tt('{0} günleri', TR_DAYS[busiestDay]) : '—'}</p>
            <div className="mt-4">
              <Bars values={stats.weekdays} labels={TR_DAYS_SHORT} highlight={busiestDay} />
            </div>
          </Reveal>
          <Reveal className={CARD}>
            <p className="text-sm text-neutral-400">{tt('Günün hangi saatinde?')}</p>
            {stats.timed >= 5 ? (
              <>
                <p className="fb-title text-4xl mt-1">{topDaypart.label}</p>
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {dayparts.map((p) => (
                    <div key={p.label} className={`rounded-xl p-2 text-center border ${p === topDaypart ? 'fb-chip-on' : 'border-white/10'}`}>
                      <p className="text-lg font-bold text-white tabular-nums">%{Math.round((p.n / stats.timed) * 100)}</p>
                      <p className="text-xs text-neutral-300">{p.label}</p>
                      <p className="text-[10px] text-neutral-500">{p.sub}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-500 mt-3">
                {tt('ARGUS izleme saatlerini yeni tutmaya başladı: bir şeyi "bugün izledim" diye işaretlediğin saat kaydediliyor. Birkaç izlemeden sonra burada sabahçı mı, gece kuşu mu olduğun görünecek.')}
              </p>
            )}
          </Reveal>
          <Reveal className={`${CARD} flex flex-col justify-between`} delay={100}>
            <div>
              <p className="text-sm text-neutral-400">{tt('En uzun serin')}</p>
              <p className="fb-title text-4xl mt-1">{ttx('{0} gün üst üste', stats.longestStreak.days)}</p>
              {stats.longestStreak.days > 1 && (
                <p className="text-xs text-neutral-500 mt-1">
                  {fmtDate(null, Number(stats.longestStreak.start.slice(5, 7)) - 1, Number(stats.longestStreak.start.slice(8)))} – {fmtDate(null, Number(stats.longestStreak.end.slice(5, 7)) - 1, Number(stats.longestStreak.end.slice(8)))}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              {(
                [
                  [tt('Yılın ilki'), stats.order[0]],
                  [tt('Yılın sonuncusu'), [...stats.order].sort((a, b) => (a.last < b.last ? 1 : -1))[0]],
                ] as const
              ).map(([label, t]) =>
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
          </Reveal>
        </div>

        {/* F10: ısı haritası */}
        {stats.activeDays > 0 && (
          <Reveal className={CARD}>
            <FbTitle sub={tt('Her kare bir gün; ne kadar çok izlediysen o kadar parlak')}>{tt('Yılın ısı haritası')}</FbTitle>
            <Heatmap year={year} dayCounts={stats.dayCounts} />
          </Reveal>
        )}

        {/* Nostalji radarı */}
        {stats.decades.length > 0 && (
          <Reveal className={CARD}>
            <FbTitle sub={tt('İzlediklerinin çıkış yıllarına göre')}>{tt('Nostalji radarı')}</FbTitle>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-6">
              <div className="space-y-1.5">
                {stats.decades.map((d) => {
                  const max = Math.max(...stats.decades.map((x) => x.count))
                  return (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="w-16 text-right text-xs text-neutral-400 tabular-nums">{d.label}</span>
                      <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${(d.count / max) * 100}%`, background: 'linear-gradient(90deg,#00e1ff,#ff2d8a)' }} />
                      </div>
                      <span className="w-8 text-xs text-neutral-500 tabular-nums">{d.count}</span>
                    </div>
                  )
                })}
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white/10 p-3">
                    <p className="fb-title text-3xl">%{Math.round(stats.newShare * 100)}</p>
                    <p className="text-[11px] text-neutral-400">{ttx('yeni yapım ({0}–{1})', Number(year) - 1, year)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 p-3">
                    <p className="fb-title text-3xl">%{Math.round(stats.classicShare * 100)}</p>
                    <p className="text-[11px] text-neutral-400">{tt('20 yıldan eski')}</p>
                  </div>
                </div>
                {stats.oldest && (
                  <button onClick={() => setDetail(stats.oldest!.row)} className="flex items-center gap-3 text-left w-full rounded-2xl border border-white/10 p-2 hover:border-white/30 transition">
                    {stats.oldest.poster && <img src={stats.oldest.poster} alt="" className="h-16 w-11 rounded object-cover shrink-0" />}
                    <span className="min-w-0">
                      <span className="block text-[11px] text-neutral-500">{tt('En eski izlediğin')}</span>
                      <span className="block text-sm text-neutral-100 truncate">{stats.oldest.title}</span>
                      <span className="block text-xs text-amber-300">{stats.oldest.releaseYear}</span>
                    </span>
                  </button>
                )}
              </div>
            </div>
          </Reveal>
        )}

        {/* F8: tür DNA'sı + ülkeler */}
        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-3">
          {stats.genreShares.length > 0 && (
            <Reveal className={CARD}>
              <FbTitle>{tt('Tür DNA\'n')}</FbTitle>
              <GenreDna genres={stats.genreShares} />
            </Reveal>
          )}
          {stats.topCountries.length > 0 && (
            <Reveal className={CARD} delay={100}>
              <FbTitle>{tt('En çok izlediğin ülkeler')}</FbTitle>
              <ol className="space-y-2">
                {stats.topCountries.map((x, i) => (
                  <li key={x.label} className="flex items-center gap-3">
                    <span className={`w-6 text-right font-black ${i === 0 ? 'fb-accent text-xl' : 'text-neutral-500'}`}>{i + 1}</span>
                    <span className="flex-1 text-neutral-100">{x.label}</span>
                    <span className="text-sm text-neutral-500 tabular-nums">{x.count}</span>
                  </li>
                ))}
              </ol>
            </Reveal>
          )}
        </div>

        {/* Oyuncular ↔ yönetmenler */}
        {(stats.topActors.length > 0 || stats.topDirectors.length > 0) && (
          <Reveal className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="fb-title text-2xl">{people === 'oyuncu' ? tt('En çok karşına çıkan oyuncular') : tt('En çok izlediğin yönetmenler')}</p>
              <div className="grid grid-cols-2 rounded-xl bg-black/50 border border-white/10 p-1 text-sm">
                {(['oyuncu', 'yonetmen'] as const).map((k) => (
                  <button key={k} onClick={() => setPeople(k)} className={`px-3 py-1 rounded-lg transition ${people === k ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white'}`}>
                    {k === 'oyuncu' ? tt('Oyuncular') : tt('Yönetmenler')}
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
                    <p className="text-[11px] text-neutral-500">{ttx('{0} yapım', a.count)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">{tt('Bu yıl birden fazla yapımını izlediğin bir yönetmen yok.')}</p>
            )}
          </Reveal>
        )}

        {/* F12: yılın film müzikleri */}
        {songs && songs.songs.length > 0 && (
          <Reveal className={CARD}>
            <FbTitle sub={tt('Nook\'un izlerken tanıdığı şarkılar')}>{tt('Yılın film müzikleri')}</FbTitle>
            <Songs data={songs} titleOf={titleOf} />
          </Reveal>
        )}

        {/* F15: sinemada bu yıl */}
        {tickets && tickets.length > 0 && (
          <Reveal className={CARD}>
            <FbTitle>{tt('Sinemada bu yıl')}</FbTitle>
            <Tickets items={tickets} />
          </Reveal>
        )}

        {/* F14: yılın vazgeçtiklerin */}
        {dropped.length > 0 && (
          <Reveal className={CARD}>
            <FbTitle sub={tt('Bu yıl başlayıp Yarım bıraktıkların')}>{tt('Yılın vazgeçtiklerin')}</FbTitle>
            <Dropped board={board} items={dropped} onOpen={open} />
          </Reveal>
        )}

        {/* F13: geçen yılın sen'i */}
        {prev && (
          <Reveal className={CARD}>
            <FbTitle sub={tt('{0} ile {1} yan yana', Number(year) - 1, year)}>{tt('Geçen yılın sen\'i')}</FbTitle>
            <Compare year={year} cur={stats} prev={prev} />
          </Reveal>
        )}

        <YearPosterWall year={year} items={stats.order.map((t) => ({ title: t.title, poster: t.poster, date: t.first }))} onOpen={(i) => setDetail(stats.order[i].row)} onStory={openStory} />

        {/* F17: kapanış mektubu */}
        <Reveal className={`${CARD} !p-7`}>
          <Letter year={year} name={activeProfile?.username ?? ''} stats={stats} song={topSong} />
        </Reveal>

        {/* F16: yılın jeneriği */}
        <Reveal className={`${CARD} !p-0`}>
          <Credits year={year} stats={stats} song={topSong} />
        </Reveal>

        {/* F18: gelecek yıl için hedef */}
        <Reveal className={CARD}>
          <FbTitle>{tt('{0} için hedefin', Number(year) + 1)}</FbTitle>
          <NextGoal year={year} done={finished} />
        </Reveal>

        <p className="text-center text-sm text-neutral-500">
          {tt('Gün gün ne izlediğini')}{' '}
          <Link to={`/takvim?ay=${year}-01&gorunum=yil`} className="fb-accent hover:underline">
            {tt('Takvim')}
          </Link>
          {tt('\'de görebilirsin.')}
        </p>

        {features?.developer && (
          <section className="rounded-2xl border border-dashed border-white/15 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-neutral-200">{tt('Diğer kullanıcılara açık mı?')}</p>
              <p className="text-xs text-neutral-500">
                {publishing
                  ? tt('Gönderiliyor…')
                  : features.wrappedManual
                    ? tt('Diğer kullanıcılarda açık. Kapatırsan hemen gönderilir; yaklaşık bir dakika içinde menülerinden kalkar.')
                    : tt('Şu an sadece sen görüyorsun. Açarsan hemen gönderilir; diğerlerinde güncelleme gerekmeden, yaklaşık bir dakika içinde menüde çıkar ve bildirim gelir.')}
              </p>
              {winText && (
                <p className="text-xs text-neutral-400 mt-1">
                  {features.wrappedForAll && !features.wrappedManual ? tt('Şu an tarih aralığında olduğu için herkese açık ({0}).', winText) : tt('{0} arasında kendiliğinden herkese açılır, sonra kapanır.', winText)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 rounded-xl bg-black/50 border border-white/10 p-1 text-sm">
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => toggleForAll(v)}
                  disabled={publishing}
                  className={`px-3 py-1 rounded-lg transition disabled:opacity-50 ${Boolean(features.wrappedManual) === v ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white'}`}
                >
                  {v ? ttc('acik-kapali', 'Açık') : tt('Kapalı')}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {story && <FlashbackStory data={story} onClose={() => setStory(null)} />}
      {detail && <RowDetailModal board={board} row={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
