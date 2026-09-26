import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoards } from '../hooks/useBoards'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useThemeMode } from '../hooks/useThemeMode'
import { ratingAverage, type Board, type PropertyDef, type PropertyType, type Row, type StatMapping } from '../types'
import { BRAND_GRADIENT, BRAND_TEXT, PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import HelpHint from '../components/HelpHint'
import { ROLE_DEFS, resolveRole, resolveStatusOption, type RoleKey } from '../lib/roles'
import Select from '../components/Select'

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
  { key: 'durum', label: 'Durum', type: 'select', hint: '"İzlenen" sayısı ve durum dağılımı grafiği için — tek seçimli bir sütun (ör. İzlendi/İzlenecek).' },
  { key: 'kategori', label: 'Kategori', type: 'select', hint: 'Kategori dağılımı grafiği için — tek seçimli bir sütun (ör. Film/Dizi).' },
  { key: 'tur', label: 'Tür', type: 'multiselect', hint: '"En çok geçen türler" için — çoklu seçim bir sütun.' },
  { key: 'ulke', label: 'Ülke', type: 'multiselect', hint: '"En çok geçen ülkeler" için — çoklu seçim bir sütun.' },
  { key: 'vizyon', label: 'Vizyon / Yayın Tarihi', type: 'date', hint: 'Yıla göre dağılım grafiği için — tarih tipi bir sütun.' },
  {
    key: 'sure',
    label: 'Süre',
    type: 'number',
    hint: 'Toplam izleme süresi için — dakika cinsinden sayı sütunu. Not: TMDB otomatik doldurma bu alanı şu an SADECE filmler için dolduruyor, dizilerin bölüm süreleri toplanmıyor — "Toplam süre" bu yüzden aslında yalnızca izlediğin filmleri sayar.',
  },
  { key: 'puan', label: 'Puan', type: 'rating', hint: 'Ortalama puan ve puan dağılımı için — "Puan (kriterli)" tipi bir sütun.' },
  { key: 'oyuncular', label: 'Oyuncular', type: 'multiselect', hint: '"En çok karşına çıkan oyuncular" için — çoklu seçim bir sütun.' },
  { key: 'izlemeTarihi', label: 'İzleme Tarihi', type: 'multidate', hint: '"Son 12 ay" grafiği ve "bu yıl izlediğin" sayısı için — tarih ya da çoklu tarih sütunu.' },
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
  return [...kept, { id: '__other', label: 'Diğer', count: all.slice(7).reduce((s, b) => s + b.count, 0) }]
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
  if (mins <= 0) return { value: '0 saat', rest: '' }
  const days = Math.floor(mins / (60 * 24))
  const hours = Math.floor((mins % (60 * 24)) / 60)
  if (days > 0) return { value: `${days} gün`, rest: hours ? `+ ${hours} saat · ` : '' }
  return { value: `${hours} saat`, rest: '' }
}

const TR_MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

function useStats(board: Board | null | undefined, rows: Row[]) {
  return useMemo(() => {
    if (!board) return null

    const durumProp = resolveRole(board, 'durum')
    const kategoriProp = resolveRole(board, 'kategori')
    const turProp = resolveRole(board, 'tur')
    const ulkeProp = resolveRole(board, 'ulke')
    const vizyonProp = resolveRole(board, 'vizyon')
    const sureProp = resolveRole(board, 'sure')
    const puanProp = resolveRole(board, 'puan')
    const oyuncularProp = resolveRole(board, 'oyuncular')
    const tarihProp = resolveRole(board, 'izlemeTarihi')

    // "İzlendi"/"İzlenecek" seçenekleri artık etiket yerine Durum görevinden bulunuyor (bkz. roles.ts)
    // — etiketin adı değişse de sayılar bozulmasın diye.
    const izlendiId = resolveStatusOption(board, 'izlendi')
    const izlenecekId = resolveStatusOption(board, 'izlenecek')
    const izlendiRows = durumProp && izlendiId ? rows.filter((r) => r.values[durumProp.id] === izlendiId) : []
    const izlenecekCount = durumProp && izlenecekId ? rows.filter((r) => r.values[durumProp.id] === izlenecekId).length : 0

    let totalMinutes = 0
    if (sureProp) for (const r of izlendiRows) if (typeof r.values[sureProp.id] === 'number') totalMinutes += r.values[sureProp.id] as number

    const ratings: number[] = []
    if (puanProp) {
      for (const r of rows) {
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
      for (const r of rows) {
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

    // Son 12 ay: İzleme Tarihi'ndeki her tarih bir izleme (tekrar izleme de sayılır).
    const now = new Date()
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, month: d.getMonth(), year: d.getFullYear(), count: 0 }
    })
    const monthIndex = new Map(months.map((m, i) => [m.key, i]))
    let thisYearRows = 0
    let anyDate = false
    if (tarihProp) {
      const yearPrefix = String(now.getFullYear())
      for (const r of rows) {
        const v = r.values[tarihProp.id]
        const dates = Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []
        if (dates.length) anyDate = true
        if (dates.some((d) => d.startsWith(yearPrefix))) thisYearRows++
        for (const d of dates) {
          const i = monthIndex.get(d.slice(0, 7))
          if (i !== undefined) months[i].count++
        }
      }
    }

    return {
      total: rows.length,
      izlendiCount: izlendiRows.length,
      izlenecekCount,
      hasDurum: Boolean(durumProp),
      totalMinutes,
      hasSureProp: Boolean(sureProp),
      avgRating,
      ratedCount: ratings.length,
      ratingBins,
      thisYearRows,
      hasDates: Boolean(tarihProp) && anyDate,
      months,
      durumBreakdown: selectBreakdown(rows, durumProp),
      kategoriBreakdown: selectBreakdown(rows, kategoriProp),
      genreBreakdown: multiBreakdown(turProp, rows, 8),
      countryBreakdown: multiBreakdown(ulkeProp, rows, 8),
      actorBreakdown: multiBreakdown(oyuncularProp, rows, 10),
      decadeBreakdown,
    }
  }, [board, rows])
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
function useTip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const bind = (title: string, value: string) => ({
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, title, value }),
    onMouseLeave: () => setTip(null),
  })
  const node = tip ? (
    <div
      className="fixed z-50 pointer-events-none rounded-lg border border-neutral-700 bg-neutral-900/95 backdrop-blur-sm shadow-xl px-3 py-2"
      style={{ left: Math.min(tip.x + 14, window.innerWidth - 200), top: Math.max(tip.y - 52, 8) }}
    >
      <p className="text-[11px] text-neutral-400">{tip.title}</p>
      <p className="text-sm font-semibold text-neutral-50">{tip.value}</p>
    </div>
  ) : null
  return { bind, node, active: tip?.title }
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

function StatTile({ label, value, sub, hint, accent = false, progress }: { label: string; value: string; sub?: string; hint?: ReactNode; accent?: boolean; progress?: number }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 md:p-5 min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500 truncate">{label}</p>
        {hint && <HelpHint>{hint}</HelpHint>}
      </div>
      <p className="text-2xl md:text-3xl font-bold mt-1 tracking-tight truncate" style={accent ? { color: BRAND_TEXT } : undefined}>
        <span className={accent ? undefined : 'text-neutral-50'}>{value}</span>
      </p>
      {sub && <p className="text-xs text-neutral-500 mt-0.5 truncate">{sub}</p>}
      {progress !== undefined && (
        <div className="h-1.5 rounded-full bg-neutral-800 mt-2.5 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, background: BRAND_GRADIENT }} />
        </div>
      )}
    </div>
  )
}

function Empty() {
  return <p className="text-sm text-neutral-600">Henüz veri yok.</p>
}

// ---- grafikler -----------------------------------------------------------------------------

// Parça-bütün (Durum, Kategori): tek yatay bölünmüş çubuk, dilimler arasında 2px boşluk, altında
// renk + ad + sayı + yüzde her zaman yazılı (renk tek başına anlam taşımıyor).
function StackedBar({ buckets, palette }: { buckets: Bucket[]; palette: Palette }) {
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
            {...bind(b.label, `${b.count} kayıt · ${pct(b.count)}`)}
            style={{ width: `${(b.count / total) * 100}%`, background: color(b, i), opacity: active && active !== b.label ? 0.45 : 1 }}
            className="min-w-[3px] transition-opacity first:rounded-l-md last:rounded-r-md"
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
        {buckets.map((b, i) => (
          <div key={b.id} className="flex items-center gap-2 text-sm min-w-0">
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
function MagnitudeBars({ buckets, otherCount, otherLabel, palette }: { buckets: Bucket[]; otherCount: number; otherLabel: string; palette: Palette }) {
  const { bind, node } = useTip()
  if (buckets.length === 0) return <Empty />
  const max = Math.max(...buckets.map((b) => b.count), 1)
  return (
    <div className="space-y-2">
      {buckets.map((b, i) => (
        <div key={b.id} className="group flex items-center gap-3" {...bind(b.label, `${b.count} kayıt`)}>
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
      {otherCount > 0 && <p className="text-xs text-neutral-500 pt-2 pl-7">+ {otherLabel}: {otherCount} işaretleme daha</p>}
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
}: {
  data: { key: string; label: string; tipTitle: string; count: number; strong?: boolean }[]
  palette: Palette
  height?: number
}) {
  const { bind, node, active } = useTip()
  if (data.every((d) => d.count === 0)) return <Empty />
  const max = Math.max(...data.map((d) => d.count), 1)
  const maxKey = data.find((d) => d.count === max)?.key
  return (
    <div>
      <div className="flex items-end gap-1.5 sm:gap-2 border-b border-neutral-700" style={{ height }}>
        {data.map((d) => (
          <div key={d.key} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center" {...bind(d.tipTitle, `${d.count} kayıt`)}>
            {d.key === maxKey && <span className="text-[11px] font-semibold text-neutral-300 mb-1 tabular-nums">{d.count}</span>}
            <div
              className="w-full max-w-[36px] rounded-t-[4px] transition-opacity"
              style={{
                height: d.count ? `${Math.max((d.count / max) * (height - 22), 3)}px` : 0,
                background: palette.sequential,
                opacity: active && active !== d.tipTitle ? 0.45 : 1,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 sm:gap-2 mt-1.5">
        {data.map((d) => (
          <span key={d.key} className={`flex-1 min-w-0 text-center text-[10px] sm:text-[11px] truncate ${d.strong ? 'text-neutral-300 font-medium' : 'text-neutral-500'}`}>
            {d.label}
          </span>
        ))}
      </div>
      {node}
    </div>
  )
}

// En çok karşına çıkan oyuncular: fotoğraflı kartlar, sıra numarası ve kayıt sayısı; altında
// birinciye göre ince bir çubuk.
function ActorGrid({ buckets, palette }: { buckets: Bucket[]; palette: Palette }) {
  if (buckets.length === 0) return <Empty />
  const max = buckets[0].count
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {buckets.map((b, i) => (
        <div key={b.id} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 flex flex-col items-center text-center">
          <div className="relative">
            <span className="block h-16 w-16 rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center text-lg text-neutral-500">
              {b.image ? <img src={b.image} alt="" className="h-full w-full object-cover" /> : b.label.slice(0, 1)}
            </span>
            <span
              className="absolute -top-1 -left-1 h-6 w-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center"
              style={{ background: BRAND_GRADIENT }}
            >
              {i + 1}
            </span>
          </div>
          <p className="text-sm text-neutral-100 font-medium mt-2 leading-tight line-clamp-2 min-h-[2.5em]">{b.label}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{b.count} kayıt</p>
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
          <span className="block font-medium">Sütunları Eşleştir</span>
          <span className="block text-xs text-neutral-500 mt-0.5">Grafikler yanlış ya da boş görünüyorsa hangi sütundan beslendiklerini buradan seç.</span>
        </span>
        <span className="text-neutral-500 text-xs shrink-0">{open ? 'Gizle ▲' : 'Göster ▼'}</span>
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
                    { value: '__auto__', label: 'Otomatik (adına göre bul)' },
                    { value: '__none__', label: 'Kullanma' },
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

export default function Istatistikler() {
  const { settings, loading: settingsLoading } = useHomeSettings()
  const { boards, loading: boardsLoading } = useBoards()
  const { theme } = useThemeMode()
  const palette = PALETTE[theme === 'light' ? 'light' : 'dark']
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)

  // Varsayılan seçim: Ana Sayfa'da gösterilen arşiv, yoksa listedeki ilk arşiv.
  useEffect(() => {
    if (selectedBoardId || boardsLoading) return
    if (settings.boardId && boards.some((b) => b.id === settings.boardId)) setSelectedBoardId(settings.boardId)
    else if (boards.length > 0) setSelectedBoardId(boards[0].id)
  }, [boardsLoading, boards, settings.boardId, selectedBoardId])

  const { board, loading: boardLoading, saveBoard } = useBoard(selectedBoardId ?? undefined)
  const { rows, loading: rowsLoading } = useRows(selectedBoardId ?? undefined)
  const stats = useStats(board, rows)

  if (settingsLoading || boardsLoading) return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>

  if (boards.length === 0) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-neutral-500 text-sm mb-4">İstatistik gösterebilmek için önce en az bir arşivin olması lazım — henüz hiç arşivin yok.</p>
        <Link to="/arsivlerim" style={primaryButtonStyle} className={`inline-block text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}>
          Arşiv Oluştur
        </Link>
      </div>
    )
  }

  if (boardLoading || rowsLoading || !board || !stats) return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>

  const year = new Date().getFullYear()
  const monthTotal = stats.months.reduce((s, m) => s + m.count, 0)
  const izlendiShare = stats.total ? stats.izlendiCount / stats.total : 0

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/60 px-6 py-8 md:px-8">
        <div
          className="pointer-events-none absolute -top-28 -right-20 h-64 w-[36rem] max-w-[140%] rounded-full blur-3xl opacity-20"
          style={{ background: BRAND_GRADIENT }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-50 tracking-tight">İstatistikler</h1>
            <p className="text-sm text-neutral-400 mt-1.5">
              <span style={{ color: BRAND_TEXT }}>{board.name}</span> arşivindeki {stats.total} kayda göre.
            </p>
          </div>
          {boards.length > 1 && (
            <div className="min-w-48">
              <label className="block text-xs text-neutral-500 mb-1">Hangi arşiv?</label>
              <Select value={selectedBoardId ?? ''} onChange={setSelectedBoardId} options={boards.map((b) => ({ value: b.id, label: b.name }))} />
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="Toplam kayıt" value={String(stats.total)} accent />
        <StatTile
          label="İzlenen"
          value={stats.hasDurum ? String(stats.izlendiCount) : '—'}
          sub={stats.hasDurum && stats.total ? `arşivinin %${Math.round(izlendiShare * 100)}'i` : undefined}
          progress={stats.hasDurum ? izlendiShare : undefined}
        />
        <StatTile label="İzlenecek" value={stats.hasDurum ? String(stats.izlenecekCount) : '—'} sub="listende bekliyor" />
        <StatTile
          label={`${year}'te izlediğin`}
          value={stats.hasDates ? String(stats.thisYearRows) : '—'}
          sub="izleme tarihine göre"
          hint={stats.hasDates ? undefined : 'Bu sayı için kayıtlarda İzleme Tarihi dolu olmalı.'}
        />
        <StatTile
          label="Toplam süre"
          value={stats.hasSureProp ? formatTotalMinutes(stats.totalMinutes).value : '—'}
          sub={stats.hasSureProp ? `${formatTotalMinutes(stats.totalMinutes).rest}izlediklerinin` : undefined}
          hint={
            stats.hasSureProp
              ? 'Sadece "İzlendi" durumundaki kayıtların süresi toplanıyor. Şu an yalnızca filmlerin süresi TMDB\'den otomatik doluyor — dizilerin bölüm süreleri bu sayıya dahil değil.'
              : 'Bu arşivde süre için eşleştirilmiş bir sütun yok — en alttaki "Sütunları Eşleştir"den bir sayı sütunu seçebilirsin.'
          }
        />
        <StatTile
          label="Ortalama puan"
          value={stats.avgRating !== null ? stats.avgRating.toFixed(1) : '—'}
          sub={stats.avgRating !== null ? `10 üzerinden · ${stats.ratedCount} kayıt` : undefined}
        />
      </div>

      {stats.hasDates && (
        <Card title="Son 12 ayda izlediklerin" subtitle={`İzleme tarihine göre aylık · toplam ${monthTotal} izleme (tekrar izlemeler dahil)`}>
          <Columns
            palette={palette}
            data={stats.months.map((m) => ({
              key: m.key,
              label: m.month === 0 ? `'${String(m.year).slice(2)}` : TR_MONTHS_SHORT[m.month],
              strong: m.month === 0,
              tipTitle: `${TR_MONTHS[m.month]} ${m.year}`,
              count: m.count,
            }))}
          />
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.kategoriBreakdown.length > 0 && (
          <Card title="Kategori dağılımı" subtitle="Arşivindeki her şey, kategorisine göre">
            <StackedBar buckets={stats.kategoriBreakdown} palette={palette} />
          </Card>
        )}
        {stats.durumBreakdown.length > 0 && (
          <Card title="Durum dağılımı" subtitle="İzlediklerin, izleyeceklerin ve yarım kalanlar">
            <StackedBar buckets={stats.durumBreakdown} palette={palette} />
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.genreBreakdown.top.length > 0 && (
          <Card title="En çok geçen türler" subtitle="En sık işaretlenen 8 tür">
            <MagnitudeBars buckets={stats.genreBreakdown.top} otherCount={stats.genreBreakdown.otherCount} otherLabel="diğer türlerde" palette={palette} />
          </Card>
        )}
        {stats.countryBreakdown.top.length > 0 && (
          <Card title="En çok geçen ülkeler" subtitle="En sık işaretlenen 8 ülke">
            <MagnitudeBars buckets={stats.countryBreakdown.top} otherCount={stats.countryBreakdown.otherCount} otherLabel="diğer ülkelerde" palette={palette} />
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.decadeBreakdown.length > 0 && (
          <Card title="Vizyon yılına göre" subtitle="On yıllık dilimlere göre kayıt sayısı">
            <Columns
              palette={palette}
              data={stats.decadeBreakdown.map(([decade, count]) => ({
                key: String(decade),
                label: `${String(decade).slice(2)}'ler`,
                tipTitle: `${decade}'ler`,
                count,
              }))}
            />
          </Card>
        )}
        {stats.ratedCount > 0 && (
          <Card title="Puan dağılımı" subtitle={`Verdiğin puanların ortalamasına göre · ${stats.ratedCount} kayıt`}>
            <Columns
              palette={palette}
              data={stats.ratingBins.map((b) => ({
                key: String(b.from),
                label: String(b.from + 1),
                tipTitle: b.from === 9 ? '9 – 10 puan' : `${b.from} – ${b.from + 1} puan`,
                count: b.count,
              }))}
            />
          </Card>
        )}
      </div>

      {stats.actorBreakdown.top.length > 0 && (
        <Card title="En çok karşına çıkan oyuncular" subtitle="En çok kayıtta rol aldığı ilk 10">
          <ActorGrid buckets={stats.actorBreakdown.top} palette={palette} />
        </Card>
      )}

      <MappingPanel board={board} onSave={(patch) => saveBoard(patch)} />
    </div>
  )
}
