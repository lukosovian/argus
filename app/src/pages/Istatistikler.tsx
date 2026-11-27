import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoards } from '../hooks/useBoards'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useThemeMode } from '../hooks/useThemeMode'
import { ratingAverage, titleText, type Board, type PropertyDef, type PropertyType, type Row, type StatMapping } from '../types'
import { BRAND_GRADIENT, BRAND_TEXT, PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import HelpHint from '../components/HelpHint'
import { ROLE_DEFS, resolveRole, resolveStatusOption, type RoleKey, watchedStatusIds } from '../lib/roles'
import Select from '../components/Select'
import { entryEnd, isFullDate, isUnknownDate, isYearOnly, toEntries } from '../lib/dateRange'
import { dayIso, entryInWindow, episodeDatesInWindow, isSeriesRow, minutesInWindow, rowEntriesInWindow, type DateWindow } from '../lib/watchWindow'
import { withLocative } from '../lib/turkce'
import { tt, ttx, monthNames, getLang } from '../lib/i18n'
import EmptyState from '../components/EmptyState'
import Icon, { type IconName } from '../components/Icon'
import PageSkeleton from '../components/Skeleton'
import GoalRow from '../components/GoalRow'
import { api } from '../lib/api'
import type { WatchedMap } from '../types'
import { useProfiles } from '../hooks/useProfiles'
import PersonModal from '../components/PersonModal'
import DateField from '../components/DateField'

// Kullanıcı "istatistikleri güzelleştir" dedi (26 Eylül 2026). Renkler dataviz becerisindeki doğrulanmış
// varsayılan paletten — artık uygulamada açık tema da olduğu için İKİ mod da seçili: her mod kendi
// adımlarını kullanıyor, ikisi de validate_palette.js ile uygulamanın kart zeminine (koyu #171717,
// açık #f5f5f5) karşı ölçüldü. Açık modda 4 renk zeminle 3:1'in altında kaldığı için parça-bütün
// grafiklerinde (Kategori/Durum) renklerin yanında sayı ve yüzde HER ZAMAN yazılı (becerinin "relief"
// kuralı). Kategorik sıra sabit, asla döngüsel/otomatik üretilmiyor; 8'den fazla dilim "Diğer"e toplanır.
const PALETTE = {
  dark: {
    categorical: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    sequential: '#3987e5',
    other: '#5b5b58',
  },
  light: {
    categorical: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    sequential: '#2a78d6',
    other: '#a3a29c',
  },
}
type Palette = (typeof PALETTE)['dark']

// İstatistiklerin hangi sütunu kullanacağını belirleyen "yuvalar" — uygulamanın genel sütun
// görevlerine (bkz. lib/roles.ts) bağlı; burada yapılan eşleştirme tablodaki sütun menüsünün "Görevi"
// seçimiyle aynı şey, iki ayrı ayar değil.
interface StatSlot {
  key: RoleKey
  label: string
  type: PropertyType
  hint: string
}

const STAT_SLOTS: StatSlot[] = [
  { key: 'durum', label: tt('Durum'), type: 'select', hint: tt('"İzlenen" sayısı ve durum dağılımı grafiği için — tek seçimli bir sütun (ör. İzlendi/İzlenecek).') },
  { key: 'kategori', label: tt('Kategori'), type: 'select', hint: tt('Kategori dağılımı grafiği için — tek seçimli bir sütun (ör. Film/Dizi).') },
  { key: 'tur', label: tt('Tür'), type: 'multiselect', hint: tt('"En çok geçen türler" için — çoklu seçim bir sütun.') },
  { key: 'ulke', label: tt('Ülke'), type: 'multiselect', hint: tt('"En çok geçen ülkeler" için — çoklu seçim bir sütun.') },
  { key: 'vizyon', label: tt('Vizyon / Yayın Tarihi'), type: 'date', hint: tt('Yıla göre dağılım grafiği için — tarih tipi bir sütun.') },
  {
    key: 'sure',
    label: tt('Süre'),
    type: 'number',
    hint: tt('Toplam izleme süresi için — dakika cinsinden sayı sütunu. Not: TMDB otomatik doldurma bu alanı şu an SADECE filmler için dolduruyor, dizilerin bölüm süreleri toplanmıyor — "Toplam süre" bu yüzden aslında yalnızca izlediğin filmleri sayar.'),
  },
  { key: 'puan', label: tt('Puan'), type: 'rating', hint: tt('Ortalama puan ve puan dağılımı için — "Puan (kriterli)" tipi bir sütun.') },
  { key: 'oyuncular', label: tt('Oyuncular'), type: 'multiselect', hint: tt('"En çok karşına çıkan oyuncular" için — çoklu seçim bir sütun.') },
  { key: 'izlemeTarihi', label: tt('İzleme Tarihi'), type: 'multidate', hint: tt('"Son 12 ay" grafiği ve "bu yıl izlediğin" sayısı için — tarih ya da çoklu tarih sütunu.') },
]

interface Bucket {
  id: string
  label: string
  count: number
  image?: string
}

// Tek-seçim (Durum, Kategori gibi) bir sütunun, sütunun kendi seçenek sırasına göre dağılımı.
function selectBreakdown(rows: Row[], prop: PropertyDef | undefined): Bucket[] {
  if (!prop) return []
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = r.values[prop.id]
    if (typeof v === 'string' && v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const all = (prop.options ?? []).map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) ?? 0 })).filter((b) => b.count > 0)
  // 8'den fazla dilim olursa (paletteki renk sayısı) fazlası "Diğer"e toplanır — renk asla üretilmez.
  if (all.length <= 8) return all
  const kept = all.slice(0, 7)
  return [...kept, { id: '__other', label: tt('Diğer'), count: all.slice(7).reduce((s, b) => s + b.count, 0) }]
}

// Çoklu-seçim (Tür, Ülke, Oyuncular) bir sütunun en çok geçen N değeri.
function multiBreakdown(prop: PropertyDef | undefined, rows: Row[], topN: number): { top: Bucket[]; otherCount: number } {
  if (!prop) return { top: [], otherCount: 0 }
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = r.values[prop.id]
    if (Array.isArray(v)) for (const id of v) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const optionMap = new Map((prop.options ?? []).map((o) => [o.id, o]))
  const sorted: Bucket[] = []
  for (const [id, count] of counts.entries()) {
    const opt = optionMap.get(id)
    if (!opt || !opt.label) continue
    sorted.push({ id, count, label: opt.label, image: opt.image })
  }
  sorted.sort((a, b) => b.count - a.count)
  return { top: sorted.slice(0, topN), otherCount: sorted.slice(topN).reduce((sum, b) => sum + b.count, 0) }
}

// Kutucuğa sığsın diye büyük değer tek birim (gün ya da saat), kalanı alt satırda.
function formatTotalMinutes(mins: number): { value: string; rest: string } {
  if (mins <= 0) return { value: tt('0 saat'), rest: '' }
  const days = Math.floor(mins / (60 * 24))
  const hours = Math.floor((mins % (60 * 24)) / 60)
  if (days > 0) return { value: tt('{0} gün', days), rest: hours ? tt('+ {0} saat · ', hours) : '' }
  return { value: tt('{0} saat', hours), rest: '' }
}

const TR_MONTHS_SHORT = monthNames('short')
const TR_MONTHS = monthNames()

// Aylar listesi: aralık yoksa son 12 ay, varsa aralığın ayları (en çok son 24 ay)
function monthsFor(win: DateWindow | null, now: Date) {
  const mk = (d: Date) => ({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, month: d.getMonth(), year: d.getFullYear(), count: 0 })
  if (!win) return Array.from({ length: 12 }, (_, i) => mk(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)))
  const [fy, fm] = win.from.split('-').map(Number)
  const [ty, tm] = win.to.split('-').map(Number)
  const out: ReturnType<typeof mk>[] = []
  for (let d = new Date(fy, fm - 1, 1); d <= new Date(ty, tm - 1, 1); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push(mk(d))
  return out.slice(-24)
}

// Bütün istatistikler tek yerde; `win` verilirse sadece o tarih aralığında izlenenler (İzleme Tarihi ya da bölüm
// tiki aralıkta olan kayıtlar) sayılır — tarih aralığı seçimi ve yıl kıyası aynı hesabı kullanıyor (v1.25).
function computeStats(board: Board, rows: Row[], watched: WatchedMap, win: DateWindow | null) {
  const durumProp = resolveRole(board, 'durum')
  const kategoriProp = resolveRole(board, 'kategori')
  const turProp = resolveRole(board, 'tur')
  const ulkeProp = resolveRole(board, 'ulke')
  const vizyonProp = resolveRole(board, 'vizyon')
  const sureProp = resolveRole(board, 'sure')
  const puanProp = resolveRole(board, 'puan')
  const oyuncularProp = resolveRole(board, 'oyuncular')
  const tarihProp = resolveRole(board, 'izlemeTarihi')

  // Aralık seçiliyse: aralıkta izleme tarihi ya da bölüm tiki olan kayıtlar
  const scope = win ? rows.filter((r) => rowEntriesInWindow(board, r, win).length > 0 || episodeDatesInWindow(watched, r.id, win).length > 0) : rows

  // "İzlendi"/"İzlenecek" seçenekleri artık etiket yerine Durum görevinden bulunuyor (bkz. roles.ts)
  // — etiketin adı değişse de sayılar bozulmasın diye.
  const izlendiId = resolveStatusOption(board, 'izlendi')
  const izlenecekId = resolveStatusOption(board, 'izlenecek')
  const doneIds = watchedStatusIds(board)
  const izlendiRows = durumProp && izlendiId ? scope.filter((r) => doneIds.has(r.values[durumProp.id] as string)) : []
  const izlenecekCount = durumProp && izlenecekId ? scope.filter((r) => r.values[durumProp.id] === izlenecekId).length : 0

  let totalMinutes = 0
  // Dizilerde Süre bölüm süresi (v1.24) — toplam süreye sadece filmler girer
  if (sureProp) for (const r of izlendiRows) if (typeof r.values[sureProp.id] === 'number' && !isSeriesRow(board, r)) totalMinutes += r.values[sureProp.id] as number

  const ratings: number[] = []
  if (puanProp) {
    for (const r of scope) {
      const avg = ratingAverage(r.values[puanProp.id], puanProp)
      if (avg !== null) ratings.push(avg)
    }
  }
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
  // 0-1, 1-2 … 9-10 dilimleri (10 tam puan son dilime girer).
  const ratingBins = Array.from({ length: 10 }, (_, i) => ({ from: i, count: 0 }))
  for (const v of ratings) ratingBins[Math.min(Math.floor(v), 9)].count++

  const decadeCounts = new Map<number, number>()
  if (vizyonProp) {
    for (const r of scope) {
      const v = r.values[vizyonProp.id]
      if (typeof v === 'string' && v.length >= 4) {
        const year = Number(v.slice(0, 4))
        if (!Number.isNaN(year) && year > 1800 && year < 2100) {
          const decade = Math.floor(year / 10) * 10
          decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1)
        }
      }
    }
  }
  const decadeBreakdown = [...decadeCounts.entries()].sort((a, b) => a[0] - b[0])

  // Aylık: İzleme Tarihi'ndeki her tarih bir izleme (tekrar izleme de sayılır).
  const now = new Date()
  const months = monthsFor(win, now)
  const monthIndex = new Map(months.map((m, i) => [m.key, i]))
  let thisYearRows = 0
  // "Geçen yıla göre" kıyası iki tarafta da AYNI kuralla: sadece günü belli tarihler (sadece yılı bilinenler
  // geçen yılın "bu zamana kadar"ına sokulamadığı için bu yılın tarafında da sayılmıyor)
  let thisYearSoFar = 0
  let lastYearSoFar = 0
  let anyDate = false
  const todayCut = dayIso(now)
  const lastYearCut = `${now.getFullYear() - 1}-${todayCut.slice(5)}`
  const lastYearPrefix = String(now.getFullYear() - 1)
  // Isı haritasının yılı: aralık seçiliyse aralığın bittiği yıl, yoksa bu yıl
  const heatYear = win ? Number(win.to.slice(0, 4)) : now.getFullYear()
  const heatPrefix = String(heatYear)
  // Yılın her günü kaç izleme (yıl ısı haritası için)
  const daily = new Map<string, number>()
  if (tarihProp) {
    const yearPrefix = String(now.getFullYear())
    for (const r of rows) {
      const v = r.values[tarihProp.id]
      // Aralıklarda (başladım → bitirdim) bitiş günü sayılır.
      const dates = (Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []).map(entryEnd).filter(Boolean)
      if (dates.length) anyDate = true
      if (dates.some((d) => d.startsWith(yearPrefix))) thisYearRows++
      if (dates.some((d) => d.startsWith(yearPrefix) && d.length >= 10 && d.slice(0, 10) <= todayCut)) thisYearSoFar++
      if (dates.some((d) => d.startsWith(lastYearPrefix) && d.length >= 10 && d.slice(0, 10) <= lastYearCut)) lastYearSoFar++
      for (const d of dates) {
        if (d.startsWith(heatPrefix) && d.length >= 10) daily.set(d.slice(0, 10), (daily.get(d.slice(0, 10)) ?? 0) + 1)
        if (win && !entryInWindow(d, win)) continue
        const i = monthIndex.get(d.slice(0, 7))
        if (i !== undefined) months[i].count++
      }
    }
  }

  // Aralıktaki izleme özeti: film izlemeleri, bölümler, yaklaşık süre (film süresi + bölüm × bölüm süresi), aktif gün
  let windowSummary: { films: number; episodes: number; minutes: number; activeDays: number } | null = null
  if (win) {
    let films = 0
    let episodes = 0
    let minutes = 0
    const days = new Set<string>()
    for (const r of scope) {
      const m = minutesInWindow(board, r, watched, win, false)
      episodes += m.episodes
      minutes += m.minutes
      if (!isSeriesRow(board, r)) films += m.views
      for (const e of rowEntriesInWindow(board, r, win, true)) days.add(entryEnd(e).slice(0, 10))
      for (const d of episodeDatesInWindow(watched, r.id, win)) days.add(d)
    }
    windowSummary = { films, episodes, minutes, activeDays: days.size }
  }

  // Günü bilinmeyen izlemeler (v1.26, G10): sadece yılı bilinenler ("2019") ve hiç bilinmeyenler ("?") aylık grafiğe ve
  // ısı haritasına giremiyor — kaç tanesinin dışarıda kaldığı grafiğin altında yazsın ki boşluklar doğru okunsun.
  const shownYears = new Set<string>([...months.map((m) => String(m.year)), String(heatYear)])
  const yearOnlyByYear = new Map<string, number>()
  let unknownCount = 0
  let undatedEpisodes = 0
  if (tarihProp)
    for (const r of rows)
      for (const e of toEntries(r.values[tarihProp.id])) {
        if (isUnknownDate(e)) unknownCount++
        else if (isYearOnly(e) && shownYears.has(e)) yearOnlyByYear.set(e, (yearOnlyByYear.get(e) ?? 0) + 1)
      }
  const rowIds = new Set(rows.map((r) => r.id))
  for (const [rowId, eps] of Object.entries(watched)) {
    if (!rowIds.has(rowId)) continue
    for (const list of Object.values(eps)) for (const d of list ?? []) if (d && !isFullDate(d) && (isUnknownDate(d) || shownYears.has(d.slice(0, 4)))) undatedEpisodes++
  }
  const undated = {
    yearOnly: [...yearOnlyByYear.values()].reduce((x, y) => x + y, 0),
    unknown: unknownCount,
    episodes: undatedEpisodes,
    // Takvim'de "günü bilinmeyenler" rafı açılacak yıl: en çok yıllık izleme olan
    topYear: [...yearOnlyByYear.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
  }

  // En çok tekrar izlenen filmler (v1.26, Y22): İzleme Tarihi'ndeki her öğe bir izleme; aralık seçiliyse sadece aralıktakiler.
  // Dizilerde birden fazla tarih genelde başladım/bitirdim ya da sezonlar olduğu için sayılmıyor (bkz. Takvim).
  const rewatched: { id: string; title: string; poster: string; count: number; last: string }[] = []
  if (tarihProp) {
    const posterP = resolveRole(board, 'poster')
    const coverP = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
    const titleP = board.properties.find((p) => p.id === board.titlePropertyId)
    for (const r of rows) {
      if (isSeriesRow(board, r)) continue
      const es = toEntries(r.values[tarihProp.id])
      const inWin = win ? es.filter((e) => entryInWindow(e, win)) : es
      if (inWin.length < 2) continue
      rewatched.push({
        id: r.id,
        title: titleP ? titleText(titleP, r.values[titleP.id]) : '',
        poster: (posterP && (r.values[posterP.id] as string)) || (coverP && (r.values[coverP.id] as string)) || '',
        count: inWin.length,
        last: inWin.map(entryEnd).filter(isFullDate).sort().pop() ?? '',
      })
    }
    rewatched.sort((x, y) => y.count - x.count || y.last.localeCompare(x.last))
    rewatched.splice(5)
  }

  return {
    total: scope.length,
    izlendiCount: izlendiRows.length,
    izlenecekCount,
    hasDurum: Boolean(durumProp),
    totalMinutes,
    hasSureProp: Boolean(sureProp),
    avgRating,
    ratedCount: ratings.length,
    ratingBins,
    thisYearRows,
    thisYearSoFar,
    lastYearSoFar,
    daily,
    heatYear,
    hasDates: Boolean(tarihProp) && anyDate,
    months,
    windowSummary,
    durumBreakdown: selectBreakdown(scope, durumProp),
    kategoriBreakdown: selectBreakdown(scope, kategoriProp),
    genreBreakdown: multiBreakdown(turProp, scope, 8),
    countryBreakdown: multiBreakdown(ulkeProp, scope, 8),
    actorBreakdown: multiBreakdown(oyuncularProp, scope, 10),
    decadeBreakdown,
    undated,
    rewatched,
  }
}
type Stats = ReturnType<typeof computeStats>

function useStats(board: Board | null | undefined, rows: Row[], watched: WatchedMap, win: DateWindow | null) {
  return useMemo(() => (board ? computeStats(board, rows, watched, win) : null), [board, rows, watched, win])
}

// ---- ortak parçalar ------------------------------------------------------------------------

// Her çubuğun üzerine gelince çıkan küçük bilgi kutusu (becerinin "hover katmanı"): imleci takip
// eder, ekranın dışına taşmaz.
interface Tip {
  x: number
  y: number
  title: string
  value: string
}
// Bilgi kutusunun konumu küçük ayrı bir depoda: fare her kıpırdadığında bütün grafik (ısı haritasında 365 kare)
// yeniden çizilmesin diye sadece kutunun kendisi güncellenir (kare başına en çok bir kez, rAF ile). Grafik
// yalnızca üzerine gelinen öğe DEĞİŞİNCE (vurgulama için) yeniden çizilir; ısı haritası onu da istemiyor.
function createTipStore() {
  let tip: Tip | null = null
  const subs = new Set<() => void>()
  return {
    get: () => tip,
    set: (t: Tip | null) => {
      tip = t
      subs.forEach((f) => f())
    },
    subscribe: (f: () => void) => {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
  }
}
type TipStore = ReturnType<typeof createTipStore>
function TipLayer({ store }: { store: TipStore }) {
  const tip = useSyncExternalStore(store.subscribe, store.get)
  if (!tip) return null
  return (
    <div
      className="fixed z-50 pointer-events-none rounded-lg border border-neutral-700 bg-neutral-900/95 backdrop-blur-sm shadow-xl px-3 py-2"
      style={{ left: Math.min(tip.x + 14, window.innerWidth - 200), top: Math.max(tip.y - 52, 8) }}
    >
      <p className="text-[11px] text-neutral-400">{tip.title}</p>
      <p className="text-sm font-semibold text-neutral-50">{tip.value}</p>
    </div>
  )
}
function useTip(trackActive = true) {
  const [store] = useState(createTipStore)
  const [active, setActive] = useState<string | undefined>(undefined)
  const activeRef = useRef<string | undefined>(undefined)
  const frame = useRef(0)
  const pending = useRef<Tip | null>(null)
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    },
    [],
  )
  const setActiveOnce = (t: string | undefined) => {
    if (!trackActive || activeRef.current === t) return
    activeRef.current = t
    setActive(t)
  }
  const bind = (title: string, value: string) => ({
    onMouseMove: (e: React.MouseEvent) => {
      pending.current = { x: e.clientX, y: e.clientY, title, value }
      if (!frame.current)
        frame.current = requestAnimationFrame(() => {
          frame.current = 0
          store.set(pending.current)
        })
      setActiveOnce(title)
    },
    onMouseLeave: () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      frame.current = 0
      pending.current = null
      store.set(null)
      setActiveOnce(undefined)
    },
  })
  const node = <TipLayer store={store} />
  return { bind, node, active }
}

function Card({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 md:p-6 ${className}`}>
      <h2 className="text-base font-semibold text-neutral-50">{title}</h2>
      {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

// Kartın arkasındaki küçük çizgi grafik (son 12 ay)
function Spark({ points, color }: { points: number[]; color: string }) {
  const max = Math.max(...points, 1)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * 100).toFixed(1)},${(40 - (p / max) * 34).toFixed(1)}`).join(' ')
  const id = 'sp' + color.replace('#', '')
  return (
    <svg className="pointer-events-none absolute right-0 bottom-0 h-9 w-1/2 opacity-60" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L100,40 L0,40Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function StatTile({
  label,
  value,
  sub,
  hint,
  accent = false,
  progress,
  icon,
  color,
  spark,
  delta,
}: {
  label: string
  value: string
  sub?: string
  hint?: ReactNode
  accent?: boolean
  progress?: number
  // v1.23.3 (öneri S1): her kartın kendi rengi ve ikonu, istenirse arkasında son 12 ay ve değişim oku
  icon?: IconName
  color?: string
  spark?: number[]
  delta?: { text: string; up: boolean }
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 md:p-5 min-w-0">
      {spark && color && spark.some((n) => n > 0) && <Spark points={spark} color={color} />}
      {icon && color && (
        <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}22`, color }}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      )}
      <div className="relative flex items-center gap-1.5">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500 truncate">{label}</p>
        {hint && <HelpHint>{hint}</HelpHint>}
      </div>
      <p className="text-2xl md:text-3xl font-bold mt-1 tracking-tight truncate" style={accent ? { color: BRAND_TEXT } : undefined}>
        <span className={accent ? undefined : 'text-neutral-50'}>{value}</span>
      </p>
      {delta && (
        <p className={`relative text-xs font-semibold mt-0.5 truncate ${delta.up ? 'text-emerald-400' : 'text-rose-400'}`}>
          {delta.up ? '▲' : '▼'} {delta.text}
        </p>
      )}
      {sub && <p className="relative text-xs text-neutral-500 mt-0.5 truncate">{sub}</p>}
      {progress !== undefined && (
        <div className="h-1.5 rounded-full bg-neutral-800 mt-2.5 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, background: BRAND_GRADIENT }} />
        </div>
      )}
    </div>
  )
}

function Empty() {
  return <p className="text-sm text-neutral-600">{tt('Henüz veri yok.')}</p>
}

// ---- grafikler -----------------------------------------------------------------------------

// "Diğer" dilimi birden çok değerin toplamı — tek bir filtreye karşılık gelmediği için tıklanmaz
function canPick(onPick: ((b: Bucket) => void) | undefined, b: Bucket) {
  return Boolean(onPick) && b.id !== '__other'
}

// Parça-bütün (Durum, Kategori): tek yatay bölünmüş çubuk, dilimler arasında 2px boşluk, altında
// renk + ad + sayı + yüzde her zaman yazılı (renk tek başına anlam taşımıyor).
// onPick verilirse dilime / açıklama satırına tıklayınca o değerin kayıtları açılır ("Diğer" hariç)
function StackedBar({ buckets, palette, onPick }: { buckets: Bucket[]; palette: Palette; onPick?: (b: Bucket) => void }) {
  const { bind, node, active } = useTip()
  const total = buckets.reduce((s, b) => s + b.count, 0)
  if (total === 0) return <Empty />
  const color = (b: Bucket, i: number) => (b.id === '__other' ? palette.other : palette.categorical[i])
  const pct = (n: number) => `%${Math.round((n / total) * 100)}`
  return (
    <div>
      <div className="flex h-7 gap-[2px]">
        {buckets.map((b, i) => (
          <div
            key={b.id}
            {...bind(b.label, tt('{0} kayıt · {1}', b.count, pct(b.count)))}
            onClick={canPick(onPick, b) ? () => onPick!(b) : undefined}
            style={{ width: `${(b.count / total) * 100}%`, background: color(b, i), opacity: active && active !== b.label ? 0.45 : 1 }}
            className={`min-w-[3px] transition-[opacity,filter] first:rounded-l-md last:rounded-r-md ${canPick(onPick, b) ? 'cursor-pointer hover:brightness-125' : ''}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
        {buckets.map((b, i) => (
          <div
            key={b.id}
            onClick={canPick(onPick, b) ? () => onPick!(b) : undefined}
            className={`flex items-center gap-2 text-sm min-w-0 rounded-md ${canPick(onPick, b) ? 'cursor-pointer -mx-1.5 px-1.5 hover:bg-white/5 transition' : ''}`}
          >
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color(b, i) }} />
            <span className="text-neutral-300 truncate">{b.label}</span>
            <span className="ml-auto text-neutral-500 tabular-nums shrink-0">
              {b.count} <span className="text-neutral-600">· {pct(b.count)}</span>
            </span>
          </div>
        ))}
      </div>
      {node}
    </div>
  )
}

// Büyüklük karşılaştırması (tür, ülke): tek tonlu yatay çubuklar, değer ucunda yazılı. Geri kalanların
// toplamı ("Diğer") çubuk olarak çizilmiyor — onlarca değerin toplamı olduğu için en büyük çubuk olur ve
// asıl karşılaştırmayı ezerdi; altta tek satırlık bir not olarak duruyor.
function MagnitudeBars({
  buckets,
  otherCount,
  otherLabel,
  palette,
  onPick,
}: {
  buckets: Bucket[]
  otherCount: number
  otherLabel: string
  palette: Palette
  onPick?: (b: Bucket) => void
}) {
  const { bind, node } = useTip()
  if (buckets.length === 0) return <Empty />
  const max = Math.max(...buckets.map((b) => b.count), 1)
  return (
    <div className="space-y-2">
      {buckets.map((b, i) => (
        <div
          key={b.id}
          className={`group flex items-center gap-3 ${onPick ? 'cursor-pointer rounded-md -mx-1.5 px-1.5 hover:bg-white/5 transition' : ''}`}
          onClick={onPick ? () => onPick(b) : undefined}
          {...bind(b.label, onPick ? tt('{0} kayıt · görmek için tıkla', b.count) : tt('{0} kayıt', b.count))}
        >
          <span className="text-xs text-neutral-500 w-4 text-right tabular-nums shrink-0">{i + 1}</span>
          <span className="text-sm text-neutral-300 w-24 sm:w-32 truncate shrink-0">{b.label}</span>
          <div className="flex-1 h-6 flex items-center">
            <div
              className="h-full rounded-r-[4px] rounded-l-[2px] transition-[filter] group-hover:brightness-110"
              style={{ width: `${Math.max((b.count / max) * 100, 1.5)}%`, background: palette.sequential }}
            />
          </div>
          <span className="text-xs text-neutral-400 w-9 text-right tabular-nums shrink-0">{b.count}</span>
        </div>
      ))}
      {otherCount > 0 && <p className="text-xs text-neutral-500 pt-2 pl-7">{ttx('+ {0}: {1} işaretleme daha', otherLabel, otherCount)}</p>}
      {node}
    </div>
  )
}

// Dikey sütunlar (aylar, on yıllar, puan dilimleri): tek ton, yuvarlak üst uç, taban çizgisi,
// en yüksek sütunun değeri yazılı (her sütuna sayı yazmak kalabalık olur), hepsi hover'da.
function Columns({
  data,
  palette,
  height = 150,
  onPick,
  highlightKey,
  showAvg = false,
}: {
  data: { key: string; label: string; tipTitle: string; count: number; strong?: boolean; sublabel?: string }[]
  palette: Palette
  height?: number
  onPick?: (key: string) => void
  // v1.23.3 (öneri S2): vurgulanan sütun (bu ay), kesik ortalama çizgisi, her sütunun sayısı üstüne gelince
  highlightKey?: string
  showAvg?: boolean
}) {
  const { bind, node, active } = useTip()
  if (data.every((d) => d.count === 0)) return <Empty />
  const max = Math.max(...data.map((d) => d.count), 1)
  const maxKey = data.find((d) => d.count === max)?.key
  const avg = data.reduce((s, d) => s + d.count, 0) / data.length
  const fancy = Boolean(highlightKey || showAvg)
  return (
    <div>
      <div className="relative flex items-end gap-1.5 sm:gap-2 border-b border-neutral-700" style={{ height }}>
        {showAvg && avg > 0 && (
          <div className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-white/25" style={{ bottom: Math.max((avg / max) * (height - 22), 3) }}>
            <span className="absolute right-0 -top-4 px-1 text-[10px] text-neutral-400 bg-neutral-900">{tt('ort. {0}', avg.toFixed(1).replace('.', ','))}</span>
          </div>
        )}
        {data.map((d) => (
          <div
            key={d.key}
            className={`flex-1 min-w-0 h-full flex flex-col justify-end items-center ${onPick ? 'cursor-pointer' : ''}`}
            onClick={onPick ? () => onPick(d.key) : undefined}
            {...bind(d.tipTitle, onPick ? tt('{0} kayıt · takvimde görmek için tıkla', d.count) : tt('{0} kayıt', d.count))}
          >
            {(fancy ? active === d.tipTitle || (!active && d.key === highlightKey) : d.key === maxKey) && (
              <span className="text-[11px] font-semibold text-neutral-300 mb-1 tabular-nums">{d.count}</span>
            )}
            <div
              className={`w-full max-w-[36px] transition-[opacity,filter] ${fancy ? 'rounded-t-[7px] rounded-b-[2px] origin-bottom' : 'rounded-t-[4px]'}`}
              style={{
                height: d.count ? `${Math.max((d.count / max) * (height - 22), 3)}px` : 0,
                background: !fancy
                  ? palette.sequential
                  : d.key === highlightKey
                    ? 'linear-gradient(180deg,#00c0fa,#015eea)'
                    : `linear-gradient(180deg,${palette.sequential},${palette.sequential}99)`,
                boxShadow: fancy && d.key === highlightKey ? '0 0 22px rgba(0,192,250,.45)' : undefined,
                opacity: active && active !== d.tipTitle ? 0.45 : 1,
                animation: fancy ? 'argus-sutun-buyu .9s cubic-bezier(.2,.8,.2,1) both' : undefined,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 sm:gap-2 mt-1.5">
        {data.map((d) => (
          <span
            key={d.key}
            className={`flex-1 min-w-0 text-center text-[10px] sm:text-[11px] truncate ${d.key === highlightKey ? 'text-neutral-50 font-bold' : d.strong ? 'text-neutral-300 font-medium' : 'text-neutral-500'}`}
          >
            {d.label}
            {d.sublabel && <span className="block text-[10px] font-bold" style={{ color: BRAND_TEXT }}>{d.sublabel}</span>}
          </span>
        ))}
      </div>
      {node}
    </div>
  )
}

// Parça-bütün için halka (Kategori): ortada toplam, yanında renkli açıklama (v1.23.3, öneri S3)
function Donut({ buckets, palette, onPick }: { buckets: Bucket[]; palette: Palette; onPick?: (b: Bucket) => void }) {
  const { bind, node, active } = useTip()
  const total = buckets.reduce((s, b) => s + b.count, 0)
  if (total === 0) return <Empty />
  const color = (b: Bucket, i: number) => (b.id === '__other' ? palette.other : palette.categorical[i])
  const pct = (n: number) => `%${Math.round((n / total) * 100)}`
  const R = 15.9155
  let acc = 0
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width="132" height="132" viewBox="0 0 42 42" className="shrink-0 -rotate-90">
        <circle cx="21" cy="21" r={R} fill="none" stroke="var(--color-neutral-800)" strokeWidth="5" />
        {buckets.map((b, i) => {
          const p = (b.count / total) * 100
          const gap = buckets.length > 1 ? 0.8 : 0
          const el = (
            <circle
              key={b.id}
              cx="21"
              cy="21"
              r={R}
              fill="none"
              stroke={color(b, i)}
              strokeWidth={active === b.label ? 6.2 : 5}
              strokeDasharray={`${Math.max(p - gap, 0.5)} ${100 - Math.max(p - gap, 0.5)}`}
              strokeDashoffset={-acc}
              className={`transition-[stroke-width] ${canPick(onPick, b) ? 'cursor-pointer' : 'cursor-default'}`}
              onClick={canPick(onPick, b) ? () => onPick!(b) : undefined}
              {...bind(b.label, tt('{0} kayıt · {1}', b.count, pct(b.count)))}
            />
          )
          acc += p
          return el
        })}
        <g className="rotate-90 origin-center">
          <text x="21" y="21.5" textAnchor="middle" fill="var(--color-neutral-50)" fontSize="7" fontWeight="800">
            {total}
          </text>
          <text x="21" y="27" textAnchor="middle" fill="var(--color-neutral-500)" fontSize="2.8">
            {tt('kayıt')}
          </text>
        </g>
      </svg>
      <div className="flex-1 min-w-[160px] space-y-2.5">
        {buckets.map((b, i) => (
          <div
            key={b.id}
            onClick={canPick(onPick, b) ? () => onPick!(b) : undefined}
            className={`flex items-center gap-2 text-sm min-w-0 rounded-md ${canPick(onPick, b) ? 'cursor-pointer -mx-1.5 px-1.5 hover:bg-white/5 transition' : ''}`}
          >
            <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: color(b, i) }} />
            <span className="text-neutral-300 truncate">{b.label}</span>
            <span className="ml-auto text-neutral-500 tabular-nums shrink-0">
              {b.count} <span className="text-neutral-600">· {pct(b.count)}</span>
            </span>
          </div>
        ))}
      </div>
      {node}
    </div>
  )
}

// Bütün yıl tek karede: her gün bir kare, izlediğin günler maviden parlak maviye (v1.23.3, öneri S3)
function YearHeatmap({ daily: titles, eps, year, onPick }: { daily: Map<string, number>; eps: Map<string, number>; year: number; onPick: (day: string) => void }) {
  // gün başına yapım (İzleme Tarihi) + bölüm (bölüm tikleri)
  const daily = new Map<string, number>()
  for (const [d, n] of titles) daily.set(d, n)
  for (const [d, n] of eps) daily.set(d, (daily.get(d) ?? 0) + n)
  const tip = (c: string) => {
    const t = titles.get(c) ?? 0
    const e = eps.get(c) ?? 0
    if (!t && !e) return tt('izleme yok')
    return [t ? tt('{0} yapım', t) : '', e ? tt('{0} bölüm', e) : ''].filter(Boolean).join(' · ')
  }
  const { bind, node } = useTip(false)
  const start = new Date(year, 0, 1)
  const lead = (start.getDay() + 6) % 7
  const today = new Date()
  const end = year === today.getFullYear() ? today : new Date(year, 11, 31)
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1))
    cells.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  const weeks = Math.ceil(cells.length / 7)
  // Renk ölçeği: en yoğun tek gün (ör. 60 bölümlük maraton) bütün haritayı soluk bırakmasın — üst sınır, dolu günlerin %90'ı
  const vals = [...daily.values()].filter((n) => n > 0).sort((x, y) => x - y)
  const max = Math.max(1, vals[Math.floor((vals.length - 1) * 0.9)] ?? 1)
  const active = [...daily.values()].filter((n) => n > 0).length
  let best = 0
  let run = 0
  for (const c of cells) {
    if (c && (daily.get(c) ?? 0) > 0) best = Math.max(best, ++run)
    else if (c) run = 0
  }
  const lvl = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)))
  const bg = ['var(--color-neutral-800)', '#0b3a6e', '#0b5ac0', '#0a85e8', '#00c0fa']
  const monthStarts = Array.from({ length: 12 }, (_, m) => {
    const idx = cells.indexOf(`${year}-${String(m + 1).padStart(2, '0')}-01`)
    return idx < 0 ? null : { m, col: Math.floor(idx / 7) }
  }).filter(Boolean) as { m: number; col: number }[]
  return (
    <div>
      <p className="text-xs text-neutral-500 mb-3">{tt('{0} gün izledin · en uzun seri {1} gün', active, best)}</p>
      <div className="overflow-x-auto no-scrollbar">
        <div className="grid gap-[3px] min-w-[620px]" style={{ gridTemplateRows: 'repeat(7, minmax(0,1fr))', gridAutoFlow: 'column', gridTemplateColumns: `repeat(${weeks}, minmax(0,1fr))` }}>
          {cells.map((c, i) =>
            c ? (
              <button
                key={c}
                onClick={() => onPick(c)}
                {...bind(c.split('-').reverse().join('.'), tip(c))}
                aria-label={`${c.split('-').reverse().join('.')}: ${tip(c)}`}
                className="aspect-square rounded-[3px] hover:ring-1 hover:ring-neutral-300 transition"
                style={{ background: bg[lvl(daily.get(c) ?? 0)], boxShadow: lvl(daily.get(c) ?? 0) === 4 ? '0 0 6px rgba(0,192,250,.6)' : undefined }}
              />
            ) : (
              <span key={'b' + i} />
            ),
          )}
        </div>
        <div className="relative h-4 mt-1.5 min-w-[620px]">
          {monthStarts.map(({ m, col }) => (
            <span key={m} className="absolute text-[10px] text-neutral-500" style={{ left: `${(col / weeks) * 100}%` }}>
              {TR_MONTHS_SHORT[m]}
            </span>
          ))}
        </div>
      </div>
      {node}
    </div>
  )
}

// En çok karşına çıkan oyuncular: fotoğraflı kartlar, sıra numarası ve kayıt sayısı; altında
// birinciye göre ince bir çubuk.
function ActorGrid({ buckets, palette, onPick }: { buckets: Bucket[]; palette: Palette; onPick?: (b: Bucket) => void }) {
  if (buckets.length === 0) return <Empty />
  const max = buckets[0].count
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {buckets.map((b, i) => (
        <div
          key={b.id}
          role={onPick ? 'button' : undefined}
          tabIndex={onPick ? 0 : undefined}
          onClick={onPick ? () => onPick(b) : undefined}
          onKeyDown={onPick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(b)) : undefined}
          className={`rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 flex flex-col items-center text-center ${onPick ? 'cursor-pointer hover:border-neutral-600 hover:bg-neutral-800/60 transition' : ''}`}
        >
          <div className="relative">
            <span className="block h-16 w-16 rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center text-lg text-neutral-500">
              {b.image ? <img src={b.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : b.label.slice(0, 1)}
            </span>
            <span
              className="absolute -top-1 -left-1 h-6 w-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center"
              style={{ background: BRAND_GRADIENT }}
            >
              {i + 1}
            </span>
          </div>
          <p className="text-sm text-neutral-100 font-medium mt-2 leading-tight line-clamp-2 min-h-[2.5em]">{b.label}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{ttx('{0} kayıt', b.count)}</p>
          <div className="w-full h-1 rounded-full bg-neutral-800 mt-2 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(b.count / max) * 100}%`, background: palette.sequential }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// "Sütunları Eşleştir" — her grafiğin hangi sütundan besleneceği (sütun görevleriyle aynı ayar).
function MappingPanel({ board, onSave }: { board: Board; onSave: (patch: Partial<Board>) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  async function handleChange(s: StatSlot, value: string) {
    setSaving(s.key)
    const roles = { ...(board.roles ?? {}) }
    if (value === '__auto__') delete roles[s.key]
    else if (value === '__none__') roles[s.key] = null
    else roles[s.key] = value
    // Eski (sadece İstatistikler'e özel) eşleştirme kaydı varsa temizleniyor — artık tek kaynak roles.
    const legacyKey = ROLE_DEFS.find((d) => d.key === s.key)?.legacyStatKey
    const statMapping: StatMapping = { ...board.statMapping }
    if (legacyKey) delete statMapping[legacyKey]
    await onSave({ roles, statMapping })
    setSaving(null)
  }

  function currentValue(s: StatSlot): string {
    const mapped = board.roles?.[s.key]
    if (mapped === null) return '__none__'
    if (mapped) return mapped
    return '__auto__'
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left text-sm text-neutral-300 hover:text-neutral-50 transition"
      >
        <span>
          <span className="block font-medium">{tt('Sütunları Eşleştir')}</span>
          <span className="block text-xs text-neutral-500 mt-0.5">{tt('Grafikler yanlış ya da boş görünüyorsa hangi sütundan beslendiklerini buradan seç.')}</span>
        </span>
        <span className="text-neutral-500 text-xs shrink-0">{open ? tt('Gizle ▲') : tt('Göster ▼')}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-neutral-800 pt-4 space-y-3">
          {STAT_SLOTS.map((s) => {
            const options = board.properties.filter((p) => ROLE_DEFS.find((d) => d.key === s.key)?.types.includes(p.type))
            return (
              <div key={s.key} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                <div className="sm:w-44 shrink-0 flex items-center gap-1.5">
                  <span className="text-sm text-neutral-300">{s.label}</span>
                  <HelpHint>{s.hint}</HelpHint>
                </div>
                <Select
                  value={currentValue(s)}
                  onChange={(v) => handleChange(s, v)}
                  disabled={saving === s.key}
                  className="flex-1"
                  options={[
                    { value: '__auto__', label: tt('Otomatik (adına göre bul)') },
                    { value: '__none__', label: tt('Kullanma') },
                    ...options.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// "Puan zevkin" — kullanıcı önerilen "puan zevki özeti"ni istedi: kriter kriter ortalamalar (hangi kritere en
// cömert / en sert puan veriyorsun) ve türlere göre öne çıkanlar ("Bilim Kurgu'da Görsellik ortalaman 8,7").
// Sadece kriter kriter puanlanmış kayıtlar sayılır; bir türün sayılması için en az 5 puanlı kaydı olmalı.
function fmt1(n: number) {
  return n.toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function RatingTasteCard({ board, rows, palette }: { board: Board; rows: Row[]; palette: Palette }) {
  const data = useMemo(() => {
    const puanProp = resolveRole(board, 'puan')
    const turProp = resolveRole(board, 'tur')
    const criteria = puanProp?.criteria ?? []
    if (!puanProp || criteria.length === 0) return null
    const scoresOf = (r: Row) => {
      const v = r.values[puanProp.id]
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {}
    }
    const avgFor = (list: Row[], cid: string) => {
      const ns = list.map((r) => scoresOf(r)[cid]).filter((n): n is number => typeof n === 'number')
      return ns.length ? { avg: ns.reduce((a, b) => a + b, 0) / ns.length, n: ns.length } : null
    }
    const scored = rows.filter((r) => criteria.some((c) => typeof scoresOf(r)[c.id] === 'number'))
    if (scored.length < 5) return null
    const perCriterion = criteria
      .map((c) => ({ id: c.id, name: c.name, ...(avgFor(scored, c.id) ?? { avg: 0, n: 0 }) }))
      .filter((c) => c.n > 0)
    // Tür × kriter: genel ortalamasından en çok ayrışan (yukarı) eşleşmeler
    const insights: { genre: string; criterion: string; avg: number; diff: number; n: number }[] = []
    if (turProp) {
      for (const opt of turProp.options ?? []) {
        const inGenre = scored.filter((r) => Array.isArray(r.values[turProp.id]) && (r.values[turProp.id] as string[]).includes(opt.id))
        if (inGenre.length < 5) continue
        for (const c of perCriterion) {
          const a = avgFor(inGenre, c.id)
          if (a && a.n >= 5) insights.push({ genre: opt.label, criterion: c.name, avg: a.avg, diff: a.avg - c.avg, n: a.n })
        }
      }
    }
    const seen = new Set<string>()
    const top = insights
      .sort((a, b) => b.diff - a.diff)
      .filter((x) => x.diff > 0.2 && !seen.has(x.genre) && seen.add(x.genre))
      .slice(0, 5)
    // Türlere göre genel ortalama: en beğendiğin ve en az beğendiğin tür
    const genreAvg: { genre: string; avg: number }[] = []
    if (turProp) {
      for (const opt of turProp.options ?? []) {
        const vals = scored
          .filter((r) => Array.isArray(r.values[turProp.id]) && (r.values[turProp.id] as string[]).includes(opt.id))
          .map((r) => ratingAverage(r.values[puanProp.id], puanProp))
          .filter((n): n is number => n !== null)
        if (vals.length >= 5) genreAvg.push({ genre: opt.label, avg: vals.reduce((a, b) => a + b, 0) / vals.length })
      }
      genreAvg.sort((a, b) => b.avg - a.avg)
    }
    return { count: scored.length, perCriterion, top, bestGenre: genreAvg[0], worstGenre: genreAvg.length > 1 ? genreAvg[genreAvg.length - 1] : undefined }
  }, [board, rows])

  if (!data) return null
  const sorted = [...data.perCriterion].sort((a, b) => b.avg - a.avg)
  const generous = sorted[0]
  const strict = sorted[sorted.length - 1]
  return (
    <Card title={tt('Puan zevkin')} subtitle={tt('Kriter kriter verdiğin puanlara göre · {0} kayıt', data.count)}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2.5">
          {sorted.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className="text-sm text-neutral-300 w-28 sm:w-36 truncate shrink-0">{c.name}</span>
              <div className="flex-1 h-5 rounded bg-neutral-800/60 overflow-hidden">
                <div className="h-full rounded-r" style={{ width: `${(c.avg / 10) * 100}%`, background: palette.sequential }} />
              </div>
              <span className="text-sm font-semibold text-neutral-100 w-9 text-right tabular-nums shrink-0">{fmt1(c.avg)}</span>
            </div>
          ))}
        </div>
        <ul className="space-y-2.5 text-sm text-neutral-300">
          {generous && strict && generous.id !== strict.id && (
            <li>
              {ttx('En cömert olduğun kriter {0} ({1}), en sert olduğun {2} ({3}).', <strong className="text-neutral-50">{generous.name}</strong>, fmt1(generous.avg), <strong className="text-neutral-50">{strict.name}</strong>, fmt1(strict.avg))}
            </li>
          )}
          {data.bestGenre && (
            <li>
              {ttx('En yüksek puanı verdiğin tür {0} (ortalama {1}).', <strong className="text-neutral-50">{data.bestGenre.genre}</strong>, fmt1(data.bestGenre.avg))}
              {data.worstGenre && <> {ttx('En düşük: {0} ({1}).', <strong className="text-neutral-50">{data.worstGenre.genre}</strong>, fmt1(data.worstGenre.avg))}</>}
            </li>
          )}
          {data.top.map((x) => (
            <li key={x.genre}>
              {ttx('{0} yapımlarda {1} ortalaman {2} — genelinden {3} puan yüksek.', <strong className="text-neutral-50">{x.genre}</strong>, x.criterion, fmt1(x.avg), fmt1(x.diff))}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

// Tarih aralığı seçimi (v1.25): Tüm zamanlar (eskisi gibi bütün arşiv), Bu yıl, Son 12 ay, Özel aralık ve iki yılı
// yan yana koyan "Yıl kıyasla". Seçim bu tarayıcıda hatırlanır.
type RangeMode = 'tum' | 'yil' | 'son12' | 'ozel' | 'kiyas'
const RANGE_KEY = 'argus_stats_range'
function readRange(): { mode: RangeMode; from: string; to: string; a: number; b: number } {
  const y = new Date().getFullYear()
  const def = { mode: 'tum' as RangeMode, from: `${y}-01-01`, to: dayIso(new Date()), a: y, b: y - 1 }
  try {
    const raw = localStorage.getItem(RANGE_KEY)
    if (!raw) return def
    const v = JSON.parse(raw)
    return {
      mode: ['tum', 'yil', 'son12', 'ozel', 'kiyas'].includes(v?.mode) ? v.mode : def.mode,
      from: typeof v?.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.from) ? v.from : def.from,
      to: typeof v?.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.to) ? v.to : def.to,
      a: Number.isInteger(v?.a) ? v.a : def.a,
      b: Number.isInteger(v?.b) ? v.b : def.b,
    }
  } catch {
    return def
  }
}
const yearWindow = (y: number): DateWindow => ({ from: `${y}-01-01`, to: `${y}-12-31` })

function RangeBar({
  mode,
  setMode,
  from,
  to,
  setFrom,
  setTo,
}: {
  mode: RangeMode
  setMode: (m: RangeMode) => void
  from: string
  to: string
  setFrom: (v: string) => void
  setTo: (v: string) => void
}) {
  const chip = (on: boolean) => `text-sm rounded-xl px-3 py-1.5 border transition ${on ? 'border-neutral-400 text-neutral-50 bg-neutral-800' : 'border-neutral-800 text-neutral-400 hover:text-neutral-100'}`
  const opts: { value: RangeMode; label: string }[] = [
    { value: 'tum', label: tt('Tüm zamanlar') },
    { value: 'yil', label: tt('Bu yıl') },
    { value: 'son12', label: tt('Son 12 ay') },
    { value: 'ozel', label: tt('Özel aralık') },
    { value: 'kiyas', label: tt('Yıl kıyasla') },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {opts.map((o) => (
        <button key={o.value} onClick={() => setMode(o.value)} className={chip(mode === o.value)} aria-pressed={mode === o.value}>
          {o.label}
        </button>
      ))}
      {mode === 'ozel' && (
        <span className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          <DateField value={from} max={to} allowEmpty={false} onChange={(d) => d && setFrom(d)} className="w-36" ariaLabel={tt('Başlangıç')} />
          <span>→</span>
          <DateField value={to} min={from} allowEmpty={false} onChange={(d) => d && setTo(d)} className="w-36" ariaLabel={tt('Bitiş')} />
        </span>
      )}
    </div>
  )
}

// İki yıl yan yana: film, bölüm, saat, en çok türler ve üst üste aylık sütunlar
function YearCompare({ board, rows, watched, years, a, b, setA, setB, palette }: { board: Board; rows: Row[]; watched: WatchedMap; years: number[]; a: number; b: number; setA: (y: number) => void; setB: (y: number) => void; palette: Palette }) {
  const sa = useMemo(() => computeStats(board, rows, watched, yearWindow(a)), [board, rows, watched, a])
  const sb = useMemo(() => computeStats(board, rows, watched, yearWindow(b)), [board, rows, watched, b])
  const { bind, node, active } = useTip()
  const ca = palette.categorical[0]
  const cb = palette.categorical[1]
  const yearOpts = [...new Set([...years, a, b])].sort((x, y) => y - x).map((y) => ({ value: String(y), label: String(y) }))
  const hoursOf = (s: Stats) => Math.round((s.windowSummary?.minutes ?? 0) / 60)
  const rowsOf: { label: string; va: number; vb: number }[] = [
    { label: tt('Film izleme'), va: sa.windowSummary?.films ?? 0, vb: sb.windowSummary?.films ?? 0 },
    { label: tt('Bölüm'), va: sa.windowSummary?.episodes ?? 0, vb: sb.windowSummary?.episodes ?? 0 },
    { label: tt('Yaklaşık saat'), va: hoursOf(sa), vb: hoursOf(sb) },
    { label: tt('İzlediğin gün'), va: sa.windowSummary?.activeDays ?? 0, vb: sb.windowSummary?.activeDays ?? 0 },
    { label: tt('Yapım'), va: sa.total, vb: sb.total },
  ]
  const maxMonth = Math.max(1, ...sa.months.map((m) => m.count), ...sb.months.map((m) => m.count))
  const H = 160
  return (
    <Card title={tt('Yıl kıyasla')} subtitle={tt('İki yılı yan yana koy: ne kadar izledin, neleri izledin')}>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: ca }} />
        <Select value={String(a)} onChange={(v) => setA(Number(v))} options={yearOpts} className="w-28" />
        <span className="text-neutral-500 text-sm">{tt('ile')}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: cb }} />
        <Select value={String(b)} onChange={(v) => setB(Number(v))} options={yearOpts} className="w-28" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2.5">
          {rowsOf.map((r) => {
            const max = Math.max(r.va, r.vb, 1)
            return (
              <div key={r.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-neutral-300">{r.label}</span>
                  <span className="tabular-nums text-neutral-400">
                    <b style={{ color: ca }}>{r.va}</b> · <b style={{ color: cb }}>{r.vb}</b>
                  </span>
                </div>
                <div className="mt-1 space-y-1">
                  <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(r.va / max) * 100}%`, background: ca }} />
                  </div>
                  <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(r.vb / max) * 100}%`, background: cb }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { y: a, s: sa, c: ca },
            { y: b, s: sb, c: cb },
          ].map(({ y, s, c }, i) => (
            <div key={i} className="min-w-0">
              <p className="text-xs font-semibold mb-2" style={{ color: c }}>
                {tt('{0} · en çok türler', y)}
              </p>
              {s.genreBreakdown.top.length === 0 ? (
                <Empty />
              ) : (
                <ol className="space-y-1 text-sm">
                  {s.genreBreakdown.top.slice(0, 5).map((g, k) => (
                    <li key={g.id} className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-neutral-500 w-3 tabular-nums">{k + 1}</span>
                      <span className="text-neutral-300 truncate">{g.label}</span>
                      <span className="ml-auto text-neutral-500 tabular-nums">{g.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6">
        <p className="text-xs text-neutral-500 mb-2">{tt('Aylık izleme (izleme tarihine göre)')}</p>
        <div className="flex items-end gap-1.5 sm:gap-2 border-b border-neutral-700" style={{ height: H }}>
          {sa.months.map((m, i) => {
            const mb = sb.months[i]
            const title = TR_MONTHS[m.month]
            return (
              <div key={m.key} className="flex-1 min-w-0 h-full flex items-end justify-center gap-[2px]" {...bind(title, `${a}: ${m.count} · ${b}: ${mb?.count ?? 0}`)}>
                {[
                  { n: m.count, c: ca },
                  { n: mb?.count ?? 0, c: cb },
                ].map((x, k) => (
                  <div
                    key={k}
                    className="w-1/2 max-w-[16px] rounded-t-[4px] transition-opacity"
                    style={{ height: x.n ? Math.max((x.n / maxMonth) * (H - 10), 3) : 0, background: x.c, opacity: active && active !== title ? 0.45 : 1 }}
                  />
                ))}
              </div>
            )
          })}
        </div>
        <div className="flex gap-1.5 sm:gap-2 mt-1.5">
          {sa.months.map((m) => (
            <span key={m.key} className="flex-1 min-w-0 text-center text-[10px] sm:text-[11px] truncate text-neutral-500">
              {TR_MONTHS_SHORT[m.month]}
            </span>
          ))}
        </div>
      </div>
      {node}
    </Card>
  )
}

// Grafiğin altındaki "günü bilinmeyen izlemeler" notu (v1.26, G10). "Tarih ver" Takvim'in yıl görünümündeki
// "günü bilinmeyenler" rafını açar; tarihsiz bölüm işaretleri için Sağlık Kontrolü'ne gidilir.
function UndatedNote({ stats, boardId }: { stats: Stats; boardId: string }) {
  const navigate = useNavigate()
  const u = stats.undated
  const views = u.yearOnly + u.unknown
  if (!views && !u.episodes) return null
  const calYear = u.topYear ?? String(stats.heatYear)
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/90">
      <Icon name="calendar" className="h-3.5 w-3.5 shrink-0 text-amber-300" />
      <span>
        {views > 0 && tt('{0} izlemenin günü bilinmiyor', views)}
        {views > 0 && u.episodes > 0 && ', '}
        {u.episodes > 0 && tt('{0} bölüm işaretinin tarihi yok', u.episodes)}
        {tt(' — bu grafiklerde sayılmıyor.')}
      </span>
      {views > 0 && (
        <button onClick={() => navigate(`/takvim?gorunum=yil&ay=${calYear}-01#gunu-bilinmeyenler`)} className="font-semibold text-amber-100 hover:underline">
          {tt('Tarih ver ›')}
        </button>
      )}
      {u.episodes > 0 && (
        <button onClick={() => navigate(`/board/${boardId}?saglik=1`)} className="font-semibold text-amber-100 hover:underline">
          {tt('Sağlık Kontrolü ›')}
        </button>
      )}
    </p>
  )
}

// En çok tekrar izlediklerin (v1.26, Y22): afiş + "4 kez" rozeti, tıklayınca kaydın detayı
function RewatchGrid({ items, onOpen }: { items: Stats['rewatched']; onOpen: (rowId: string) => void }) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      {items.map((it, i) => (
        <button key={it.id} onClick={() => onOpen(it.id)} title={it.title} className="group w-[112px] sm:w-[136px] shrink-0 text-left">
          <span className="relative block aspect-[2/3] rounded-xl overflow-hidden bg-neutral-800 shadow-lg shadow-black/40">
            {it.poster ? (
              <img src={it.poster} alt={it.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-neutral-400">{it.title}</span>
            )}
            <span className="absolute top-1.5 left-1.5 h-6 w-6 rounded-full bg-black/75 text-[11px] font-bold text-neutral-100 flex items-center justify-center">{i + 1}</span>
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-[#00c0fa] px-2 py-0.5 text-[11px] font-bold text-neutral-950 shadow">
              <Icon name="repeat" className="h-3 w-3" />
              {tt('{0} kez', it.count)}
            </span>
          </span>
          <span className="block mt-1.5 text-xs text-neutral-200 truncate">{it.title}</span>
        </button>
      ))}
    </div>
  )
}

export default function Istatistikler() {
  const { settings, loading: settingsLoading } = useHomeSettings()
  const { boards, loading: boardsLoading } = useBoards()
  const navigate = useNavigate()
  const { theme } = useThemeMode()
  const palette = PALETTE[theme === 'light' ? 'light' : 'dark']
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [range, setRange] = useState(readRange)
  const updateRange = (patch: Partial<typeof range>) =>
    setRange((r) => {
      const next = { ...r, ...patch }
      try {
        localStorage.setItem(RANGE_KEY, JSON.stringify(next))
      } catch {
        /* kapalı — sadece hatırlanmaz */
      }
      return next
    })
  const win = useMemo<DateWindow | null>(() => {
    const now = new Date()
    if (range.mode === 'yil') return { from: `${now.getFullYear()}-01-01`, to: dayIso(now) }
    if (range.mode === 'son12') {
      const f = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      return { from: dayIso(f), to: dayIso(now) }
    }
    if (range.mode === 'ozel') return range.from <= range.to ? { from: range.from, to: range.to } : { from: range.to, to: range.from }
    return null
  }, [range.mode, range.from, range.to])

  // Varsayılan seçim: Ana Sayfa'da gösterilen arşiv, yoksa listedeki ilk arşiv.
  useEffect(() => {
    if (selectedBoardId || boardsLoading) return
    if (settings.boardId && boards.some((b) => b.id === settings.boardId)) setSelectedBoardId(settings.boardId)
    else if (boards.length > 0) setSelectedBoardId(boards[0].id)
  }, [boardsLoading, boards, settings.boardId, selectedBoardId])

  const { board, loading: boardLoading, saveBoard } = useBoard(selectedBoardId ?? undefined)
  const { rows, loading: rowsLoading } = useRows(selectedBoardId ?? undefined)
  // Isı haritası takvimle aynı şeyi göstersin: İzleme Tarihi'ne ek olarak bölüm tikleri de (kullanıcı "takvimde eylül
  // neredeyse dolu, ısı haritasında niye dolu değil" dedi — dizi bölümleri sadece bitirdiğin gün sayılıyordu).
  const [watched, setWatched] = useState<WatchedMap>({})
  const { activeProfileId } = useProfiles()
  useEffect(() => {
    let alive = true
    try {
      api
        .getWatched()
        .then((w) => alive && setWatched(w))
        .catch(() => {})
    } catch {
      /* profil yoksa boş */
    }
    return () => {
      alive = false
    }
  }, [selectedBoardId, activeProfileId])
  const stats = useStats(board, rows, watched, range.mode === 'kiyas' ? null : win)
  // Grafikten kayıtlara (K2): bir dilime tıklayınca arşiv tablosu o değerle süzülmüş açılır (?filterProp=&filterOption=,
  // bkz. BoardView). Sütun koda gömülü değil — o grafiği besleyen görevdeki sütun kullanılıyor.
  function openFiltered(role: RoleKey, b: Bucket) {
    const prop = board ? resolveRole(board, role) : undefined
    if (!board || !prop || b.id === '__other') return
    navigate(`/board/${board.id}?filterProp=${encodeURIComponent(prop.id)}&filterOption=${encodeURIComponent(b.id)}`)
  }
  // Oyuncu kartı → kişi penceresi (filmografi + "içerikleri gör")
  const [person, setPerson] = useState<Bucket | null>(null)
  const heatYear = stats?.heatYear ?? new Date().getFullYear()
  const episodesDaily = useMemo(() => {
    const m = new Map<string, number>()
    const ids = new Set(rows.map((r) => r.id))
    const y = String(heatYear)
    for (const [rowId, eps] of Object.entries(watched)) {
      if (!ids.has(rowId)) continue
      // Sadece günü belli tikler — "2026" gibi yılı bilinen toplu tikler haritada sahte bir "gün" olup ölçeği bozuyordu
      for (const list of Object.values(eps)) for (const d of list) if (d.startsWith(y) && isFullDate(d)) m.set(d.slice(0, 10), (m.get(d.slice(0, 10)) ?? 0) + 1)
    }
    return m
  }, [watched, rows, heatYear])
  // Yıl kıyası için seçilebilecek yıllar: izleme tarihlerinde ve bölüm tiklerinde geçen yıllar (+ bu yıl)
  const years = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()])
    const tarih = board ? resolveRole(board, 'izlemeTarihi') : undefined
    const ids = new Set(rows.map((r) => r.id))
    if (tarih)
      for (const r of rows) {
        const v = r.values[tarih.id]
        for (const e of Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []) {
          const y = Number(entryEnd(e).slice(0, 4))
          if (y > 1900 && y < 2100) set.add(y)
        }
      }
    for (const [rowId, eps] of Object.entries(watched)) {
      if (!ids.has(rowId)) continue
      for (const list of Object.values(eps))
        for (const d of list) {
          const y = Number(d.slice(0, 4))
          if (y > 1900 && y < 2100) set.add(y)
        }
    }
    return [...set].sort((x, y) => y - x)
  }, [board, rows, watched])

  if (settingsLoading || boardsLoading) return <PageSkeleton />

  if (boards.length === 0) {
    return (
      <EmptyState art="istatistik" title={tt('Henüz istatistik yok')} text={tt('İstatistik gösterebilmek için önce en az bir arşivin olması lazım — henüz hiç arşivin yok.')}>
        <Link to="/arsivlerim" style={primaryButtonStyle} className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}>
          {tt('Arşiv Oluştur')}
        </Link>
      </EmptyState>
    )
  }

  if (boardLoading || rowsLoading || !board || !stats) return <PageSkeleton />

  const year = new Date().getFullYear()
  const monthTotal = stats.months.reduce((s, m) => s + m.count, 0)
  const izlendiShare = stats.total ? stats.izlendiCount / stats.total : 0
  const monthSeries = stats.months.map((m) => m.count)
  // Geçen yılla kıyas iki tarafta da sadece günü belli tarihlerle (bkz. computeStats › thisYearSoFar)
  const yearDelta =
    stats.hasDates && stats.lastYearSoFar > 0
      ? { up: stats.thisYearSoFar >= stats.lastYearSoFar, text: tt('geçen yıl bu zamana kadar {0}', stats.lastYearSoFar) }
      : undefined
  const ws = stats.windowSummary
  const compare = range.mode === 'kiyas'
  const thisMonthKey = stats.months[stats.months.length - 1]?.key

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/60 px-6 py-8 md:px-8">
        <div
          className="pointer-events-none absolute -top-28 -right-20 h-64 w-[36rem] max-w-[140%] rounded-full blur-3xl opacity-20"
          style={{ background: BRAND_GRADIENT }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-50 tracking-tight">{tt('İstatistikler')}</h1>
            <p className="text-sm text-neutral-400 mt-1.5">
              {ttx('{0} arşivindeki {1} kayda göre.', <span style={{ color: BRAND_TEXT }}>{board.name}</span>, stats.total)}
            </p>
          </div>
          {boards.length > 1 && (
            <div className="min-w-48">
              <label className="block text-xs text-neutral-500 mb-1">{tt('Hangi arşiv?')}</label>
              <Select value={selectedBoardId ?? ''} onChange={setSelectedBoardId} options={boards.map((b) => ({ value: b.id, label: b.name }))} />
            </div>
          )}
        </div>
      </section>

      {selectedBoardId === settings.boardId && <GoalRow titleClass="text-lg font-semibold text-neutral-100" />}

      <RangeBar
        mode={range.mode}
        setMode={(mode) => updateRange({ mode })}
        from={range.from}
        to={range.to}
        setFrom={(from) => updateRange({ from })}
        setTo={(to) => updateRange({ to })}
      />

      {compare && <YearCompare board={board} rows={rows} watched={watched} years={years} a={range.a} b={range.b} setA={(a) => updateRange({ a })} setB={(b) => updateRange({ b })} palette={palette} />}

      {!compare && ws && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatTile label={tt('Aralıkta izlenen')} value={String(stats.total)} sub={tt('yapım')} accent icon="table" color="#3fa9ff" />
          <StatTile icon="film" color="#22c55e" label={tt('Film izleme')} value={String(ws.films)} sub={tt('tekrar izlemeler dahil')} />
          <StatTile icon="tv" color="#f97316" label={tt('Bölüm')} value={String(ws.episodes)} sub={tt('işaretlenen bölüm tikleri')} />
          <StatTile
            icon="clock"
            color="#a78bfa"
            label={tt('Yaklaşık süre')}
            value={formatTotalMinutes(ws.minutes).value}
            sub={tt('{0}{1} gün izledin', formatTotalMinutes(ws.minutes).rest, ws.activeDays)}
            hint={tt('Filmlerde film süresi, dizilerde işaretlediğin her bölüm × bölüm süresi (bilinmiyorsa 40 dk).')}
          />
          <StatTile
            icon="star"
            color="#eab308"
            label={tt('Ortalama puan')}
            value={stats.avgRating !== null ? stats.avgRating.toFixed(1) : '—'}
            sub={stats.avgRating !== null ? tt('10 üzerinden · {0} kayıt', stats.ratedCount) : undefined}
          />
        </div>
      )}

      {!compare && !ws && (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label={tt('Toplam kayıt')} value={String(stats.total)} accent icon="table" color="#3fa9ff" />
        <StatTile
          icon="check"
          color="#22c55e"
          label={tt('İzlenen')}
          value={stats.hasDurum ? String(stats.izlendiCount) : '—'}
          sub={stats.hasDurum && stats.total ? tt('arşivinin %{0}\'i', Math.round(izlendiShare * 100)) : undefined}
          progress={stats.hasDurum ? izlendiShare : undefined}
        />
        <StatTile icon="clock" color="#f97316" label={tt('İzlenecek')} value={stats.hasDurum ? String(stats.izlenecekCount) : '—'} sub={tt('listende bekliyor')} />
        <StatTile
          icon="calendar"
          color="#00c0fa"
          spark={stats.hasDates ? monthSeries : undefined}
          delta={yearDelta}
          label={tt('{0} izlediğin', getLang() === 'tr' ? withLocative(year) : tt('{0} yılında', year))}
          value={stats.hasDates ? String(stats.thisYearRows) : '—'}
          sub={yearDelta ? undefined : tt('izleme tarihine göre')}
          hint={stats.hasDates ? undefined : tt('Bu sayı için kayıtlarda İzleme Tarihi dolu olmalı.')}
        />
        <StatTile
          icon="tv"
          color="#a78bfa"
          label={tt('Toplam süre')}
          value={stats.hasSureProp ? formatTotalMinutes(stats.totalMinutes).value : '—'}
          sub={stats.hasSureProp ? tt('{0}izlediklerinin', formatTotalMinutes(stats.totalMinutes).rest) : undefined}
          hint={
            stats.hasSureProp
              ? tt('İzlediğin filmlerin süresi toplanıyor. Dizilerde Süre bölüm başına süre olduğu için bu sayıya dahil değil.')
              : tt('Bu arşivde süre için eşleştirilmiş bir sütun yok — en alttaki "Sütunları Eşleştir"den bir sayı sütunu seçebilirsin.')
          }
        />
        <StatTile
          icon="star"
          color="#eab308"
          label={tt('Ortalama puan')}
          value={stats.avgRating !== null ? stats.avgRating.toFixed(1) : '—'}
          sub={stats.avgRating !== null ? tt('10 üzerinden · {0} kayıt', stats.ratedCount) : undefined}
        />
      </div>
      )}

      {!compare && (
      <>
      {stats.hasDates && (
        <Card title={ws ? tt('Seçili aralıkta aylık izlediklerin') : tt('Son 12 ayda izlediklerin')} subtitle={tt('İzleme tarihine göre aylık · toplam {0} izleme (tekrar izlemeler dahil) · bir aya tıklayınca Takvim\'de açılır', monthTotal)}>
          <Columns
            palette={palette}
            height={190}
            highlightKey={thisMonthKey}
            showAvg
            onPick={(key) => navigate(`/takvim?ay=${key}`)}
            data={stats.months.map((m) => ({
              key: m.key,
              label: TR_MONTHS_SHORT[m.month],
              sublabel: m.month === 0 ? String(m.year) : undefined,
              tipTitle: `${TR_MONTHS[m.month]} ${m.year}`,
              count: m.count,
            }))}
          />
          <UndatedNote stats={stats} boardId={board.id} />
        </Card>
      )}

      {(stats.hasDates || episodesDaily.size > 0) && (
        <Card title={tt('{0} yılında izlediğin günler', heatYear)} subtitle={tt('Her kare bir gün; ne kadar çok izlediysen o kadar parlak · bir güne tıklayınca Takvim\'de açılır')}>
          <YearHeatmap daily={stats.daily} eps={episodesDaily} year={heatYear} onPick={(d) => navigate(`/takvim?ay=${d.slice(0, 7)}&gun=${d}`)} />
          {!stats.hasDates && <UndatedNote stats={stats} boardId={board.id} />}
        </Card>
      )}

      {stats.rewatched.length > 0 && (
        <Card
          title={tt('En çok tekrar izlediklerin')}
          subtitle={ws ? tt('Seçili aralıkta birden fazla izlediğin filmler') : tt('İzleme tarihlerine göre, dönüp dönüp izlediğin filmler')}
        >
          <RewatchGrid items={stats.rewatched} onOpen={(id) => navigate(`/?detay=${id}`)} />
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.kategoriBreakdown.length > 0 && (
          <Card title={tt('Kategori dağılımı')} subtitle={tt('Arşivindeki her şey, kategorisine göre')}>
            <Donut buckets={stats.kategoriBreakdown} palette={palette} onPick={(b) => openFiltered('kategori', b)} />
          </Card>
        )}
        {stats.durumBreakdown.length > 0 && (
          <Card title={tt('Durum dağılımı')} subtitle={tt('İzlediklerin, izleyeceklerin ve yarım kalanlar')}>
            <StackedBar buckets={stats.durumBreakdown} palette={palette} onPick={(b) => openFiltered('durum', b)} />
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.genreBreakdown.top.length > 0 && (
          <Card title={tt('En çok geçen türler')} subtitle={tt('En sık işaretlenen 8 tür')}>
            <MagnitudeBars buckets={stats.genreBreakdown.top} otherCount={stats.genreBreakdown.otherCount} otherLabel={tt('diğer türlerde')} palette={palette} onPick={(b) => openFiltered('tur', b)} />
          </Card>
        )}
        {stats.countryBreakdown.top.length > 0 && (
          <Card title={tt('En çok geçen ülkeler')} subtitle={tt('En sık işaretlenen 8 ülke')}>
            <MagnitudeBars buckets={stats.countryBreakdown.top} otherCount={stats.countryBreakdown.otherCount} otherLabel={tt('diğer ülkelerde')} palette={palette} onPick={(b) => openFiltered('ulke', b)} />
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.decadeBreakdown.length > 0 && (
          <Card title={tt('Vizyon yılına göre')} subtitle={tt('On yıllık dilimlere göre kayıt sayısı')}>
            <Columns
              palette={palette}
              data={stats.decadeBreakdown.map(([decade, count]) => ({
                key: String(decade),
                label: tt("{0}'ler", String(decade).slice(2)),
                tipTitle: tt("{0}'ler", decade),
                count,
              }))}
            />
          </Card>
        )}
        {stats.ratedCount > 0 && (
          <Card title={tt('Puan dağılımı')} subtitle={tt('Verdiğin puanların ortalamasına göre · {0} kayıt', stats.ratedCount)}>
            <Columns
              palette={palette}
              data={stats.ratingBins.map((b) => ({
                key: String(b.from),
                label: String(b.from + 1),
                tipTitle: b.from === 9 ? tt('9 – 10 puan') : tt('{0} – {1} puan', b.from, b.from + 1),
                count: b.count,
              }))}
            />
          </Card>
        )}
      </div>

      <RatingTasteCard board={board} rows={rows} palette={palette} />

      {stats.actorBreakdown.top.length > 0 && (
        <Card title={tt('En çok karşına çıkan oyuncular')} subtitle={tt('En çok kayıtta rol aldığı ilk 10')}>
          <ActorGrid buckets={stats.actorBreakdown.top} palette={palette} onPick={(b) => setPerson(b)} />
        </Card>
      )}
      </>
      )}

      <MappingPanel board={board} onSave={(patch) => saveBoard(patch)} />
      {person && (
        <PersonModal
          boardId={board.id}
          name={person.label}
          role="acting"
          onClose={() => setPerson(null)}
          onShowContents={() => {
            const b = person
            setPerson(null)
            openFiltered('oyuncular', b)
          }}
          onOpenRow={(id) => navigate(`/board/${board.id}?detay=${id}`)}
        />
      )}
    </div>
  )
}
