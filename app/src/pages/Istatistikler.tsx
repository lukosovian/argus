import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoards } from '../hooks/useBoards'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { ratingAverage, type Board, type PropertyDef, type PropertyType, type Row, type StatMapping } from '../types'
import { BRAND_TEXT, PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import HelpHint from '../components/HelpHint'
import { ROLE_DEFS, resolveRole, type RoleKey } from '../lib/roles'
import Select from '../components/Select'

// dataviz becerisindeki doğrulanmış varsayılan paletin KOYU-mod adımları — ARGUS hep koyu
// temada olduğu için sadece bu adımlar kullanılıyor (bkz. references/palette.md). Sıra sabit,
// asla döngüsel/otomatik üretilmiyor (kategori kimliğinin CVD-güvenli kalma mekanizması budur).
const CATEGORICAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
const SEQUENTIAL_BLUE = '#3987e5'
const OTHER_GRAY = '#5b5b58'


// İstatistiklerin hangi sütunu kullanacağını belirleyen 8 "yuva". "Medya Arşivi" şablonundan
// gelen arşivlerde (ya da aynı adları kullanan herhangi bir arşivde) hiçbir ayar gerekmeden
// adına bakarak otomatik bulunur (bkz. resolveStatProp) — kendi adlarını kullanan boş/özel bir
// arşivde ise kullanıcı "Sütunları Eşleştir" panelinden hangi sütunun hangi grafiğe gideceğini
// elle seçer (bkz. board.statMapping, types.ts). Yeni bir istatistik eklenecekse önce buraya bir
// yuva eklenir, `useStats` o yuvayı kullanır — böylece sütun adı hiçbir yerde iki kez yazılmaz.
// Yuvalar artık uygulamanın genel sütun görevlerine (bkz. lib/roles.ts) bağlı — burada yapılan
// eşleştirme tablodaki sütun menüsünün "Görevi" seçimiyle aynı şey, iki ayrı ayar değil.
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
  { key: 'puan', label: 'Puan', type: 'rating', hint: 'Ortalama puan için — "Puan (kriterli)" tipi bir sütun.' },
  { key: 'oyuncular', label: 'Oyuncular', type: 'multiselect', hint: '"En çok karşına çıkan oyuncular" için — çoklu seçim bir sütun.' },
]

// Bir yuva için kullanılacak gerçek sütunu bulur: kullanıcı elle bir şey seçtiyse onu (id hâlâ
// geçerli ve tipi uyuyorsa), bilerek "kullanma" dediyse hiçbirini (undefined), hiç karar
// vermediyse (statMapping'te bu anahtar hiç yoksa) adına+tipine göre otomatik dener.
function resolveStatProp(board: Board, slot: StatSlot): PropertyDef | undefined {
  return resolveRole(board, slot.key)
}

interface Bucket {
  id: string
  label: string
  count: number
  image?: string
}

// Tek-seçim (Durum, Kategori gibi) bir sütunun, sütunun kendi seçenek sırasına göre (sayıya
// göre değil) dağılımı — parça-bütün ilişkisi olduğu için kategorik renk kullanılacak.
function selectBreakdown(rows: Row[], prop: PropertyDef | undefined): Bucket[] {
  if (!prop) return []
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = r.values[prop.id]
    if (typeof v === 'string' && v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return (prop.options ?? [])
    .map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) ?? 0 }))
    .filter((b) => b.count > 0)
}

// Çoklu-seçim (Tür, Ülke, Oyuncular gibi) bir sütunun en çok geçen N değeri — büyüklük
// karşılaştırması olduğu için TEK ton (sequential) kullanılacak, kategorik değil.
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
  const top = sorted.slice(0, topN)
  const otherCount = sorted.slice(topN).reduce((sum, b) => sum + b.count, 0)
  return { top, otherCount }
}

function formatTotalMinutes(mins: number): string {
  if (mins <= 0) return '0 saat'
  const days = Math.floor(mins / (60 * 24))
  const hours = Math.floor((mins % (60 * 24)) / 60)
  if (days > 0) return `${days} gün ${hours} saat`
  return `${hours} saat`
}

function useStats(board: Board | null | undefined, rows: Row[]) {
  return useMemo(() => {
    if (!board) return null

    const durumProp = resolveStatProp(board, STAT_SLOTS[0])
    const kategoriProp = resolveStatProp(board, STAT_SLOTS[1])
    const turProp = resolveStatProp(board, STAT_SLOTS[2])
    const ulkeProp = resolveStatProp(board, STAT_SLOTS[3])
    const vizyonProp = resolveStatProp(board, STAT_SLOTS[4])
    const sureProp = resolveStatProp(board, STAT_SLOTS[5])
    const puanProp = resolveStatProp(board, STAT_SLOTS[6])
    const oyuncularProp = resolveStatProp(board, STAT_SLOTS[7])

    const durumBreakdown = selectBreakdown(rows, durumProp)
    const kategoriBreakdown = selectBreakdown(rows, kategoriProp)
    const genreBreakdown = multiBreakdown(turProp, rows, 8)
    const countryBreakdown = multiBreakdown(ulkeProp, rows, 8)
    const actorBreakdown = multiBreakdown(oyuncularProp, rows, 10)

    const izlendiId = durumProp?.options?.find((o) => o.label === 'İzlendi')?.id
    const izlendiRows = durumProp && izlendiId ? rows.filter((r) => r.values[durumProp.id] === izlendiId) : []

    let totalMinutes = 0
    if (sureProp) {
      for (const r of izlendiRows) {
        const v = r.values[sureProp.id]
        if (typeof v === 'number') totalMinutes += v
      }
    }

    let ratingSum = 0
    let ratingCount = 0
    if (puanProp) {
      for (const r of rows) {
        const avg = ratingAverage(r.values[puanProp.id], puanProp)
        if (avg !== null) {
          ratingSum += avg
          ratingCount++
        }
      }
    }
    const avgRating = ratingCount > 0 ? ratingSum / ratingCount : null

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

    return {
      total: rows.length,
      izlendiCount: izlendiRows.length,
      totalMinutes,
      hasSureProp: Boolean(sureProp),
      avgRating,
      durumBreakdown,
      kategoriBreakdown,
      genreBreakdown,
      countryBreakdown,
      actorBreakdown,
      decadeBreakdown,
    }
  }, [board, rows])
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
      <h2 className="text-base font-semibold text-neutral-50">{title}</h2>
      {subtitle && <p className="text-xs text-neutral-500 mt-0.5 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  )
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
      <div className="flex items-center gap-1.5">
        <p className="text-sm text-neutral-400">{label}</p>
        {hint && <HelpHint>{hint}</HelpHint>}
      </div>
      <p className="text-3xl font-semibold text-neutral-50 mt-1">{value}</p>
    </div>
  )
}

// Parça-bütün ilişkisi (Durum, Kategori) için tek bir yatay, bölünmüş çubuk — her dilim
// kategorik bir renk taşır, aralarında 2px yüzey boşluğu var (dataviz becerisi: stacked bar
// segment spacer). Altında bir lejant (renk + isim + sayı) her zaman gösteriliyor.
function StackedBar({ buckets }: { buckets: Bucket[] }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const total = buckets.reduce((s, b) => s + b.count, 0)
  if (total === 0) return <p className="text-sm text-neutral-600">Veri yok.</p>
  return (
    <div>
      <div className="flex h-6 gap-[2px] rounded-md overflow-hidden">
        {buckets.map((b, i) => (
          <div
            key={b.id}
            onMouseEnter={() => setHovered(b.id)}
            onMouseLeave={() => setHovered((h) => (h === b.id ? null : h))}
            title={`${b.label}: ${b.count}`}
            style={{
              width: `${(b.count / total) * 100}%`,
              background: CATEGORICAL[i % CATEGORICAL.length],
              filter: hovered === b.id ? 'brightness(1.25)' : undefined,
            }}
            className="transition-[filter] first:rounded-l-md last:rounded-r-md"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {buckets.map((b, i) => (
          <div key={b.id} className="flex items-center gap-1.5 text-xs text-neutral-400">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
            <span className="text-neutral-300">{b.label}</span>
            <span>{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Büyüklük karşılaştırması (en çok geçen tür/ülke/oyuncu) için tek tonlu yatay çubuklar —
// değer her zaman çubuğun ucunda, direkt etiket olarak duruyor (hover'a bağlı değil).
function MagnitudeBars({ buckets, otherCount, showAvatars }: { buckets: Bucket[]; otherCount: number; showAvatars?: boolean }) {
  const all = otherCount > 0 ? [...buckets, { id: '__other', label: 'Diğer', count: otherCount }] : buckets
  const max = Math.max(...all.map((b) => b.count), 1)
  if (all.length === 0) return <p className="text-sm text-neutral-600">Veri yok.</p>
  return (
    <div className="space-y-2.5">
      {all.map((b) => {
        const isOther = b.id === '__other'
        return (
          <div key={b.id} className="flex items-center gap-2.5">
            {showAvatars && (
              <span className="h-6 w-6 rounded-full overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center text-[9px] text-neutral-600">
                {b.image ? <img src={b.image} alt="" className="h-full w-full object-cover" /> : b.label.slice(0, 1)}
              </span>
            )}
            <span className="text-xs text-neutral-400 w-28 sm:w-36 truncate shrink-0" title={b.label}>
              {b.label}
            </span>
            <div className="flex-1 h-5 rounded-full bg-neutral-800/60 overflow-hidden">
              <div
                className="h-full rounded-full transition-[filter] hover:brightness-125"
                style={{ width: `${(b.count / max) * 100}%`, background: isOther ? OTHER_GRAY : SEQUENTIAL_BLUE }}
                title={`${b.label}: ${b.count}`}
              />
            </div>
            <span className="text-xs text-neutral-500 w-8 text-right shrink-0">{b.count}</span>
          </div>
        )
      })}
    </div>
  )
}

// Vizyon yılına göre (on yıllık dilimlerle) dağılım — tek seri, zaman içinde büyüklük -> tek
// ton sütun grafiği, her sütunun tepesinde doğrudan sayı etiketi (sadece birkaç on yıl olduğu
// için hepsini etiketlemek "az sayıda noktayı etiketle" kuralına aykırı değil).
function DecadeColumns({ data }: { data: [number, number][] }) {
  if (data.length === 0) return <p className="text-sm text-neutral-600">Veri yok.</p>
  const max = Math.max(...data.map(([, c]) => c), 1)
  return (
    <div className="flex items-end gap-2 h-40 overflow-x-auto pb-1">
      {data.map(([decade, count]) => (
        <div key={decade} className="flex flex-col items-center gap-1 shrink-0" style={{ width: 44 }}>
          <span className="text-[11px] text-neutral-400">{count}</span>
          <div
            className="w-6 rounded-t-[4px] transition-[filter] hover:brightness-125"
            style={{ height: `${Math.max((count / max) * 112, 3)}px`, background: SEQUENTIAL_BLUE }}
            title={`${decade}'ler: ${count}`}
          />
          <span className="text-[11px] text-neutral-500">{decade}</span>
        </div>
      ))}
    </div>
  )
}

// "Sütunları Eşleştir" — her yuva için bu arşivin uygun tipteki sütunlarından birini seç, ya da
// "Otomatik"/"Kullanma" de. Kapalı başlar, sadece isteyen açsın diye ("kim izliyor" sayfasındaki
// gibi uzun ayrıntı varsayılanda gizli kalsın ilkesiyle aynı, bkz. Import.tsx'teki HelpHint'ler).
function MappingPanel({ board, onSave }: { board: Board; onSave: (patch: Partial<Board>) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  async function handleChange(slot: StatSlot, value: string) {
    setSaving(slot.key)
    const roles = { ...(board.roles ?? {}) }
    if (value === '__auto__') delete roles[slot.key]
    else if (value === '__none__') roles[slot.key] = null
    else roles[slot.key] = value
    // Eski (sadece İstatistikler'e özel) eşleştirme kaydı varsa temizleniyor — artık tek kaynak roles.
    const legacyKey = ROLE_DEFS.find((d) => d.key === slot.key)?.legacyStatKey
    const statMapping: StatMapping = { ...board.statMapping }
    if (legacyKey) delete statMapping[legacyKey]
    await onSave({ roles, statMapping })
    setSaving(null)
  }

  function currentValue(slot: StatSlot): string {
    const mapped = board.roles?.[slot.key]
    if (mapped === null) return '__none__'
    if (mapped) return mapped
    return '__auto__'
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm text-neutral-300 hover:text-neutral-50 transition"
      >
        <span className="font-medium">Sütunları Eşleştir</span>
        <span className="text-neutral-500 text-xs">{open ? 'Gizle ▲' : 'Göster ▼'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-neutral-800 pt-4 space-y-3">
          <p className="text-sm text-neutral-500 -mt-1 mb-1">
            "{board.name}" arşivinde grafikler için gereken sütun adları farklıysa (ya da boş bir arşivde kendi
            sütun adlarını kullandıysan), her grafiğin hangi sütundan besleneceğini burada elle seçebilirsin.
          </p>
          {STAT_SLOTS.map((slot) => {
            const options = board.properties.filter((p) => ROLE_DEFS.find((d) => d.key === slot.key)?.types.includes(p.type))
            return (
              <div key={slot.key} className="flex items-center gap-3">
                <div className="w-40 shrink-0 flex items-center gap-1.5">
                  <span className="text-sm text-neutral-300">{slot.label}</span>
                  <HelpHint>{slot.hint}</HelpHint>
                </div>
                <Select
                  value={currentValue(slot)}
                  onChange={(v) => handleChange(slot, v)}
                  disabled={saving === slot.key}
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
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)

  // Varsayılan seçim: Ana Sayfa'da gösterilen arşiv (zaten seçiliyse en tanıdık davranış) yoksa
  // listedeki ilk arşiv — kullanıcı hâlâ istediği an üstteki seçiciden değiştirebilir.
  useEffect(() => {
    if (selectedBoardId || boardsLoading) return
    if (settings.boardId && boards.some((b) => b.id === settings.boardId)) {
      setSelectedBoardId(settings.boardId)
    } else if (boards.length > 0) {
      setSelectedBoardId(boards[0].id)
    }
  }, [boardsLoading, boards, settings.boardId, selectedBoardId])

  const { board, loading: boardLoading, saveBoard } = useBoard(selectedBoardId ?? undefined)
  const { rows, loading: rowsLoading } = useRows(selectedBoardId ?? undefined)
  const stats = useStats(board, rows)

  if (settingsLoading || boardsLoading) {
    return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>
  }

  if (boards.length === 0) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-neutral-500 text-sm mb-4">
          İstatistik gösterebilmek için önce en az bir arşivin olması lazım — henüz hiç arşivin yok.
        </p>
        <Link to="/arsivlerim" style={primaryButtonStyle} className={`inline-block text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}>
          Arşiv Oluştur
        </Link>
      </div>
    )
  }

  if (boardLoading || rowsLoading || !board || !stats) {
    return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50 mb-1">İstatistikler</h1>
          <p className="text-sm text-neutral-500">
            <span style={{ color: BRAND_TEXT }}>{board.name}</span> arşivindeki {stats.total} kayda göre.
          </p>
        </div>
        {boards.length > 1 && (
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Hangi arşiv?</label>
            <Select
              value={selectedBoardId ?? ''}
              onChange={setSelectedBoardId}
              options={boards.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
        )}
      </div>

      <MappingPanel board={board} onSave={(patch) => saveBoard(patch)} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Toplam kayıt" value={String(stats.total)} />
        <StatTile label="İzlenen" value={String(stats.izlendiCount)} />
        <StatTile
          label="Toplam süre"
          value={stats.hasSureProp ? formatTotalMinutes(stats.totalMinutes) : '—'}
          hint={
            stats.hasSureProp
              ? 'Sadece "İzlendi" durumundaki kayıtların süresi toplanıyor. Şu an yalnızca filmlerin süresi TMDB\'den otomatik doluyor — dizilerin bölüm süreleri bu sayıya dahil değil.'
              : 'Bu arşivde süre için eşleştirilmiş bir sütun yok — aşağıdaki "Sütunları Eşleştir"den bir sayı sütunu seçebilirsin, ya da bu arşivde süre takip etmiyorsan hiç dokunmana gerek yok.'
          }
        />
        <StatTile label="Ortalama puan" value={stats.avgRating !== null ? `${stats.avgRating.toFixed(1)} / 10` : '—'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.kategoriBreakdown.length > 0 && (
          <Card title="Kategori dağılımı">
            <StackedBar buckets={stats.kategoriBreakdown} />
          </Card>
        )}
        {stats.durumBreakdown.length > 0 && (
          <Card title="Durum dağılımı">
            <StackedBar buckets={stats.durumBreakdown} />
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.genreBreakdown.top.length > 0 && (
          <Card title="En çok geçen türler" subtitle="En sık işaretlenen 8 tür">
            <MagnitudeBars buckets={stats.genreBreakdown.top} otherCount={stats.genreBreakdown.otherCount} />
          </Card>
        )}
        {stats.countryBreakdown.top.length > 0 && (
          <Card title="En çok geçen ülkeler" subtitle="En sık işaretlenen 8 ülke">
            <MagnitudeBars buckets={stats.countryBreakdown.top} otherCount={stats.countryBreakdown.otherCount} />
          </Card>
        )}
      </div>

      {stats.decadeBreakdown.length > 0 && (
        <Card title="Vizyon yılına göre" subtitle="On yıllık dilimlere göre kayıt sayısı">
          <DecadeColumns data={stats.decadeBreakdown} />
        </Card>
      )}

      {stats.actorBreakdown.top.length > 0 && (
        <Card title="En çok karşına çıkan oyuncular" subtitle="En sık rol aldığı kayıt sayısına göre ilk 10">
          <MagnitudeBars buckets={stats.actorBreakdown.top} otherCount={0} showAvatars />
        </Card>
      )}
    </div>
  )
}
