import { useEffect, useState } from 'react'
import type { Board, PropertyDef, Row } from '../types'
import { titleText } from '../types'
import { api } from '../lib/api'
import { BRAND_GRADIENT } from '../lib/theme'
import { HealthIcon } from './toolbarIcons'

const MAX_SHOWN = 40

// Ayarlar/Yardım'daki gibi bir "?" değil, arşivin kendi içindeki sorunlu kayıtları TEK YERDE
// listeleyen bir panel — kullanıcı "sağlık kontrolü" önerisini onayladı: eksik kapak görseli,
// eksik görünen (poster/sinopsis/ülke/yönetmen/fragmandan biri boş) ve diskte artık var olmayan
// bir dosyaya işaret eden (elden silinmiş) görsel bağlantıları. İlk ikisi board+rows'tan saf
// istemci tarafında hesaplanabiliyor (BoardView zaten bunları TMDB toplu güncelleme için
// hesaplıyor, aynı listeler buraya prop olarak geliyor) — üçüncüsü sadece sunucu diski
// kontrol edebildiği için modal açılınca ayrı bir istek atılıyor.
export default function HealthCheckModal({
  board,
  rows,
  missingImageRows,
  incompleteRows,
  incompleteChecks,
  onIgnore,
  onResetIgnored,
  onOpenRow,
  onClose,
}: {
  board: Board
  rows: Row[]
  missingImageRows: Row[]
  incompleteRows: Row[]
  // "Eksik görünen" sayılmak için kontrol edilen sütunlar (bkz. BoardView'daki
  // incompletenessChecks) — her kaydın yanında TAM OLARAK hangilerinin boş olduğunu
  // gösterebilmek için. Kullanıcı "bişeyi yok diyo ama nesi yok tam bilemiyorum" dedi.
  incompleteChecks: PropertyDef[]
  // "Bu kayıtta bu alan yok, bir daha sorma" — örn. TMDB'de hiç fragmanı olmayan filmler
  // listede sonsuza kadar "eksik" görünmesin diye (bkz. board.healthIgnore).
  onIgnore: (rowIds: string[], propertyId: string) => void
  onResetIgnored: () => void
  onOpenRow: (row: Row) => void
  onClose: () => void
}) {
  const [brokenLoading, setBrokenLoading] = useState(true)
  const [brokenImages, setBrokenImages] = useState<{ rowId: string; propertyName: string; value: string }[]>([])

  useEffect(() => {
    let cancelled = false
    setBrokenLoading(true)
    api
      .getBoardHealth(board.id)
      .then((res) => {
        if (!cancelled) setBrokenImages(res.brokenImages)
      })
      .catch(() => {
        if (!cancelled) setBrokenImages([])
      })
      .finally(() => {
        if (!cancelled) setBrokenLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [board.id])

  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  function rowTitle(row: Row): string {
    return titleProp ? titleText(titleProp, row.values[titleProp.id]) || 'İsimsiz' : 'İsimsiz'
  }
  function rowById(id: string): Row | undefined {
    return rows.find((r) => r.id === id)
  }

  function missingFields(row: Row): PropertyDef[] {
    const ignored = new Set(board.healthIgnore?.[row.id] ?? [])
    return incompleteChecks.filter((p) => {
      if (ignored.has(p.id)) return false
      const v = row.values[p.id]
      return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    })
  }

  // Eksik alanlara göre süzme — "Hepsi" (null) ya da tek bir sütun. Her düğmede o alanı boş
  // olan kayıt sayısı yazıyor, böylece neyin ne kadar eksik olduğu bir bakışta görülüyor.
  const [missingFilter, setMissingFilter] = useState<string | null>(null)
  const missingCounts = incompleteChecks.map((p) => ({
    prop: p,
    count: incompleteRows.filter((r) => missingFields(r).some((m) => m.id === p.id)).length,
  }))
  const shownIncomplete = missingFilter
    ? incompleteRows.filter((r) => missingFields(r).some((m) => m.id === missingFilter))
    : incompleteRows
  const filterProp = incompleteChecks.find((p) => p.id === missingFilter)
  const ignoredCount = Object.values(board.healthIgnore ?? {}).reduce((n, ids) => n + ids.length, 0)

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-sm flex items-start justify-center px-4 py-10 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-white" style={{ background: BRAND_GRADIENT }}>
              <HealthIcon className="h-5 w-5" />
            </span>
            <h2 className="text-xl font-semibold text-neutral-50">Sağlık Kontrolü</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="h-8 w-8 shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-500 flex items-center justify-center text-neutral-400 hover:text-neutral-50 text-lg leading-none transition"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-neutral-500 mt-2 mb-4">
          Bu arşivdeki dikkat edilmesi gereken kayıtlar — bir başlığa tıklayınca liste açılır, bir kayda tıklayınca detayı açılır.
        </p>
        {(() => {
          // Özet: en az bir sorunu olan kayıt sayısı (aynı kayıt iki listede olsa da bir kez sayılır).
          const problem = new Set([...missingImageRows, ...incompleteRows].map((r) => r.id)).size
          const healthy = rows.length ? Math.round(((rows.length - problem) / rows.length) * 100) : 100
          return (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 mb-5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-neutral-400">
                  {rows.length} kayıt · {problem > 0 ? <span className="text-amber-400">{problem} tanesinde sorun var</span> : <span className="text-emerald-400">sorun yok</span>}
                </span>
                <span className="text-neutral-100 font-semibold tabular-nums">%{healthy} sağlıklı</span>
              </div>
              <div className="h-1.5 rounded-full bg-neutral-800 mt-2.5 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${healthy}%` }} />
              </div>
            </div>
          )
        })()}

        <div className="space-y-3">
          <HealthSection
            title="Hiç görseli olmayan kayıtlar"
            hint="Hiçbir görsel sütununda (Poster, Banner, Kapak Adı...) değeri yok."
            count={missingImageRows.length}
            items={missingImageRows.map((row) => ({ key: row.id, row, label: rowTitle(row), tags: [] }))}
            onOpenRow={onOpenRow}
          />
          <HealthSection
            title="Eksik bilgisi olan kayıtlar"
            hint="Her kaydın yanında boş olan alanlar yazıyor. Gerçekten olmayan bir şeyse (ör. fragmanı hiç yok) yanındaki × ile bir daha sorma."
            count={incompleteRows.length}
            filters={
              incompleteRows.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <FilterChip active={missingFilter === null} onClick={() => setMissingFilter(null)}>
                    Hepsi ({incompleteRows.length})
                  </FilterChip>
                  {missingCounts
                    .filter((m) => m.count > 0)
                    .map((m) => (
                      <FilterChip key={m.prop.id} active={missingFilter === m.prop.id} onClick={() => setMissingFilter(m.prop.id)}>
                        {m.prop.name} yok ({m.count})
                      </FilterChip>
                    ))}
                  {filterProp && shownIncomplete.length > 0 && (
                    <button
                      onClick={() => {
                        onIgnore(
                          shownIncomplete.map((r) => r.id),
                          filterProp.id,
                        )
                        setMissingFilter(null)
                      }}
                      className="text-xs rounded-full px-2.5 py-1 border border-dashed border-neutral-600 text-neutral-400 hover:text-neutral-50 hover:border-neutral-400 transition"
                    >
                      Bu {shownIncomplete.length} kayıtta "{filterProp.name}" sorulmasın
                    </button>
                  )}
                </div>
              )
            }
            footer={
              ignoredCount > 0 && (
                <p className="text-xs text-neutral-600 mt-2 px-2.5">
                  {ignoredCount} alan "sorma" olarak işaretli ·{' '}
                  <button onClick={onResetIgnored} className="text-neutral-400 hover:text-neutral-50 underline">
                    hepsini tekrar sor
                  </button>
                </p>
              )
            }
            items={shownIncomplete.map((row) => ({
              key: row.id,
              row,
              label: rowTitle(row),
              tags: missingFields(row).map((p) => ({
                label: p.name,
                dismissTitle: `Bu kayıtta ${p.name} yok — bir daha sorma`,
                onDismiss: () => onIgnore([row.id], p.id),
              })),
            }))}
            onOpenRow={onOpenRow}
          />
          <HealthSection
            title="Görsel dosyası silinmiş kayıtlar"
            hint="Sütunda bir görsel kayıtlı ama dosyası medya klasöründe artık yok."
            count={brokenImages.length}
            loading={brokenLoading}
            items={brokenImages.flatMap((b, i) => {
              const row = rowById(b.rowId)
              return row ? [{ key: `${b.rowId}-${i}`, row, label: rowTitle(row), tags: [{ label: b.propertyName }] }] : []
            })}
            onOpenRow={onOpenRow}
          />
        </div>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs rounded-full px-2.5 py-1 border transition ${
        active
          ? 'border-[#00c0fa] text-[#00c0fa] bg-neutral-800'
          : 'border-neutral-700 text-neutral-400 hover:text-neutral-50 hover:border-neutral-500'
      }`}
    >
      {children}
    </button>
  )
}

type HealthTag = { label: string; dismissTitle?: string; onDismiss?: () => void }
type HealthItem = { key: string; row: Row; label: string; tags: HealthTag[] }

// Her bölüm kapalı gelir (başlık + sayı), tıklayınca açılır — üç uzun liste alt alta tek
// seferde dökülünce panel okunmaz oluyordu. Açıkken ilk MAX_SHOWN kayıt görünür, kalanlar
// "Tümünü göster" ile açılır (eskiden sadece "+N kayıt daha" yazıyordu, görmenin yolu yoktu).
function HealthSection({
  title,
  hint,
  count,
  items,
  filters,
  footer,
  loading = false,
  onOpenRow,
}: {
  title: string
  hint: string
  count: number
  items: HealthItem[]
  filters?: React.ReactNode
  footer?: React.ReactNode
  loading?: boolean
  onOpenRow: (row: Row) => void
}) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, MAX_SHOWN)
  return (
    <div className="border border-neutral-800 rounded-xl">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading || count === 0}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-default"
      >
        <div>
          <h3 className="text-sm font-semibold text-neutral-50">{title}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">{hint}</p>
        </div>
        <span
          className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 ${
            loading ? 'text-neutral-500' : count === 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-500 bg-amber-500/10'
          }`}
        >
          {loading ? 'Kontrol ediliyor...' : count === 0 ? 'Sorun yok' : `${count} kayıt ${open ? '▴' : '▾'}`}
        </span>
      </button>
      {open && count === 0 && footer && <div className="px-4 pb-3">{footer}</div>}
      {open && count > 0 && (
        <div className="px-4 pb-4">
          {filters}
          <ul className="space-y-0.5 max-h-[50vh] overflow-y-auto">
            {visible.map((item) => (
              <li key={item.key} className="flex items-center gap-3 rounded-lg hover:bg-neutral-800 px-2.5 py-1 transition">
                <button
                  onClick={() => onOpenRow(item.row)}
                  className="flex-1 min-w-0 text-left text-sm text-neutral-300 hover:text-[#00c0fa] py-0.5 truncate"
                >
                  {item.label}
                </button>
                {item.tags.length > 0 && (
                  <span className="flex flex-wrap justify-end gap-1 shrink-0">
                    {item.tags.map((t) => (
                      <span
                        key={t.label}
                        className="inline-flex items-center gap-1 text-[11px] text-neutral-400 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5"
                      >
                        {t.label}
                        {t.onDismiss && (
                          <button onClick={t.onDismiss} title={t.dismissTitle} className="text-neutral-500 hover:text-rose-400 leading-none">
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {items.length > MAX_SHOWN && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs text-[#00c0fa] hover:underline px-2.5">
              {showAll ? 'Daha az göster' : `Tümünü göster (+${items.length - MAX_SHOWN} kayıt daha)`}
            </button>
          )}
          {footer}
        </div>
      )}
    </div>
  )
}
