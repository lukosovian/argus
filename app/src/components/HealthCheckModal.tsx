import { useEffect, useState } from 'react'
import type { Board, PropertyDef, PropertyValue, Row } from '../types'
import { titleText } from '../types'
import { api } from '../lib/api'
import { BRAND_GRADIENT } from '../lib/theme'
import { HealthIcon } from './toolbarIcons'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { toEntries, UNKNOWN_DATE } from '../lib/dateRange'
import { useToast } from '../hooks/useToast'
import { useEscape } from '../hooks/useEscape'
import { tt, ttx } from '../lib/i18n'

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
  onUnignore,
  onResetIgnored,
  onOpenRow,
  onMerge,
  onIgnoreDuplicate,
  onSetValues,
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
  // "Sorulmayanlar"dan geri alma: kullanıcı "bir daha gelmesin dediklerimi sonradan gelsin
  // diyebileyim" dedi — tek tek (kayıt + alan) ya da bir alanın hepsi birden.
  onUnignore: (pairs: { rowId: string; propertyId: string }[]) => void
  onResetIgnored: () => void
  onOpenRow: (row: Row) => void
  // Mükerrer kayıtlar: `keepId` kalır, diğerlerinin dolu alanları ona aktarılıp silinir (sunucuda).
  onMerge: (keepId: string, removeIds: string[]) => Promise<void>
  // "Bunlar farklı" — bu grup bir daha mükerrer diye gösterilmez (board.duplicateIgnore).
  onIgnoreDuplicate: (rowIds: string[]) => void
  // Kayıtlara toplu değer yazma (durum/izleme tarihi uyumsuzluklarını düzeltmek için)
  onSetValues: (changes: { rowId: string; values: Record<string, PropertyValue> }[]) => Promise<void>
  onClose: () => void
}) {
  useEscape(true, onClose)
  const [brokenLoading, setBrokenLoading] = useState(true)
  const [brokenImages, setBrokenImages] = useState<{ rowId: string; propertyName: string; value: string }[]>([])
  const [duplicates, setDuplicates] = useState<string[][]>([])
  const [merging, setMerging] = useState(false)
  const { confirm } = useToast()

  useEffect(() => {
    let cancelled = false
    setBrokenLoading(true)
    api
      .getBoardHealth(board.id)
      .then((res) => {
        if (!cancelled) {
          setBrokenImages(res.brokenImages)
          setDuplicates((res.duplicates ?? []).map((g) => g.rowIds))
        }
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
    return titleProp ? titleText(titleProp, row.values[titleProp.id]) || tt('İsimsiz') : tt('İsimsiz')
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
  // Sorulmayan (kayıt, alan) çiftleri — silinmiş kayıtlar/sütunlar atlanır.
  const ignoredPairs = Object.entries(board.healthIgnore ?? {}).flatMap(([rowId, propIds]) => {
    const row = rowById(rowId)
    if (!row) return []
    return propIds.flatMap((pid) => {
      const prop = board.properties.find((p) => p.id === pid)
      return prop ? [{ row, prop }] : []
    })
  })
  const [ignoredFilter, setIgnoredFilter] = useState<string | null>(null)
  const ignoredProps = [...new Map(ignoredPairs.map((x) => [x.prop.id, x.prop])).values()]
  const shownIgnored = ignoredFilter ? ignoredPairs.filter((x) => x.prop.id === ignoredFilter) : ignoredPairs
  function filledCount(row: Row): number {
    return board.properties.filter((p) => {
      const v = row.values[p.id]
      return !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0))
    }).length
  }
  // Mükerrer gruplar — silinmiş kayıtlar düşülür; her grupta en çok alanı dolu olan önce (o kalır).
  const dupGroups = duplicates
    .map((ids) => ids.map(rowById).filter((r): r is Row => Boolean(r)))
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => filledCount(b) - filledCount(a) || a.createdAt - b.createdAt))
  const dupRowCount = dupGroups.reduce((n, g) => n + g.length - 1, 0)

  // Grupları ayırt etmeye yarayan kısa özet: "Film · 2019 · İzlendi · 2 izleme · puanlı · 14 alan dolu".
  function rowSummary(row: Row): string {
    const parts: string[] = []
    for (const key of ['kategori', 'vizyon', 'durum'] as const) {
      const p = resolveRole(board, key)
      const v = p ? row.values[p.id] : null
      if (!p || !v) continue
      if (key === 'vizyon') parts.push(String(v).slice(0, 4))
      else parts.push(titleText(p, v))
    }
    const dates = resolveRole(board, 'izlemeTarihi')
    const dv = dates ? row.values[dates.id] : null
    const n = Array.isArray(dv) ? dv.length : dv ? 1 : 0
    if (n > 0) parts.push(tt('{0} izleme', n))
    const puan = resolveRole(board, 'puan')
    const pv = puan ? row.values[puan.id] : null
    if (pv && typeof pv === 'object' && Object.keys(pv).length > 0) parts.push(tt('puanlı'))
    parts.push(tt('{0} alan dolu', filledCount(row)))
    return parts.filter(Boolean).join(' · ')
  }

  async function merge(keep: Row, group: Row[]) {
    setMerging(true)
    try {
      await onMerge(
        keep.id,
        group.filter((r) => r.id !== keep.id).map((r) => r.id),
      )
      setDuplicates((prev) => prev.filter((ids) => !ids.includes(keep.id)))
    } finally {
      setMerging(false)
    }
  }

  async function mergeAll() {
    const ok = await confirm({
      message: tt('{0} grupta bilgisi az olan {1} kayıt silinecek; dolu alanları (izleme tarihleri, puan...) kalan kayda aktarılacak. Devam edilsin mi?', dupGroups.length, dupRowCount),
      confirmLabel: tt('Hepsini birleştir'),
    })
    if (!ok) return
    setMerging(true)
    try {
      for (const g of dupGroups) {
        await onMerge(
          g[0].id,
          g.slice(1).map((r) => r.id),
        )
      }
      setDuplicates([])
    } finally {
      setMerging(false)
    }
  }

  // Durum ile izleme tarihi uyuşmayanlar: "İzlendi" ama hiç tarihi yok (takvim/istatistik/Flashback'te
  // görünmüyor) ve "İzlenecek" ama izleme tarihi girilmiş (muhtemelen izlenmiş).
  const durumProp = resolveRole(board, 'durum')
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const izlendiId = resolveStatusOption(board, 'izlendi')
  const izlenecekId = resolveStatusOption(board, 'izlenecek')
  const izlendiLabel = durumProp?.options?.find((o) => o.id === izlendiId)?.label ?? tt('İzlendi')
  const izlenecekLabel = durumProp?.options?.find((o) => o.id === izlenecekId)?.label ?? tt('İzlenecek')
  const hasDates = (r: Row) => (dateProp ? toEntries(r.values[dateProp.id]).length > 0 : false)
  const watchedNoDate = durumProp && dateProp && izlendiId ? rows.filter((r) => r.values[durumProp.id] === izlendiId && !hasDates(r)) : []
  const todoWithDate = durumProp && dateProp && izlenecekId ? rows.filter((r) => r.values[durumProp.id] === izlenecekId && hasDates(r)) : []
  const [fixing, setFixing] = useState(false)
  async function fix(changes: { rowId: string; values: Record<string, PropertyValue> }[]) {
    setFixing(true)
    try {
      await onSetValues(changes)
    } finally {
      setFixing(false)
    }
  }
  const unknownDate = (r: Row) => ({ rowId: r.id, values: { [dateProp!.id]: dateProp!.type === 'multidate' ? [UNKNOWN_DATE] : UNKNOWN_DATE } })
  const markWatched = (r: Row) => ({ rowId: r.id, values: { [durumProp!.id]: izlendiId! } })

  const ignoredByRow = new Map<string, { row: Row; props: PropertyDef[] }>()
  for (const x of shownIgnored) {
    const e = ignoredByRow.get(x.row.id)
    if (e) e.props.push(x.prop)
    else ignoredByRow.set(x.row.id, { row: x.row, props: [x.prop] })
  }

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-sm flex items-start justify-center px-4 py-10 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-white" style={{ background: BRAND_GRADIENT }}>
              <HealthIcon className="h-5 w-5" />
            </span>
            <h2 className="text-xl font-semibold text-neutral-50">{tt('Sağlık Kontrolü')}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label={tt('Kapat')}
            className="h-8 w-8 shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-500 flex items-center justify-center text-neutral-400 hover:text-neutral-50 text-lg leading-none transition"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-neutral-500 mt-2 mb-4">
          {tt('Bu arşivdeki dikkat edilmesi gereken kayıtlar — bir başlığa tıklayınca liste açılır, bir kayda tıklayınca detayı açılır.')}
        </p>
        {(() => {
          // Özet: en az bir sorunu olan kayıt sayısı (aynı kayıt iki listede olsa da bir kez sayılır).
          const problem = new Set(
            [...missingImageRows, ...incompleteRows, ...dupGroups.flatMap((g) => g.slice(1)), ...watchedNoDate, ...todoWithDate].map((r) => r.id),
          ).size
          const healthy = rows.length ? Math.round(((rows.length - problem) / rows.length) * 100) : 100
          return (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 mb-5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-neutral-400">
                  {ttx('{0} kayıt ·', rows.length)}{' '}{problem > 0 ? <span className="text-amber-400">{ttx('{0} tanesinde sorun var', problem)}</span> : <span className="text-emerald-400">{tt('sorun yok')}</span>}
                </span>
                <span className="text-neutral-100 font-semibold tabular-nums">{ttx('%{0} sağlıklı', healthy)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-neutral-800 mt-2.5 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${healthy}%` }} />
              </div>
            </div>
          )
        })()}

        <div className="space-y-3">
          <DuplicateSection
            groups={dupGroups}
            loading={brokenLoading}
            busy={merging}
            rowTitle={rowTitle}
            rowSummary={rowSummary}
            onOpenRow={onOpenRow}
            onMerge={merge}
            onMergeAll={mergeAll}
            onIgnore={(g) => {
              onIgnoreDuplicate(g.map((r) => r.id))
              setDuplicates((prev) => prev.filter((ids) => !ids.includes(g[0].id)))
            }}
          />
          {durumProp && dateProp && (
            <>
              <HealthSection
                title={tt('{0} ama izleme tarihi yok', izlendiLabel)}
                hint={tt('Bunlar Takvim\'de, İstatistikler\'de ve Flashback\'te görünmüyor. Kayda tıklayıp tarihi ya da "Sadece yıl" ile yılını yazabilirsin; hiç hatırlamıyorsan "Hatırlamıyorum".')}
                count={watchedNoDate.length}
                filters={
                  watchedNoDate.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <button
                        disabled={fixing}
                        onClick={() => fix(watchedNoDate.map(unknownDate))}
                        className="text-xs rounded-full px-2.5 py-1 border border-dashed border-neutral-600 text-neutral-300 hover:text-neutral-50 hover:border-neutral-400 transition disabled:opacity-50"
                      >
                        {ttx('Hiçbirini hatırlamıyorum ({0} kayıt)', watchedNoDate.length)}
                      </button>
                    </div>
                  )
                }
                items={watchedNoDate.map((row) => ({
                  key: row.id,
                  row,
                  label: rowTitle(row),
                  tags: [],
                  action: { label: tt('Hatırlamıyorum'), title: tt('Tarih bilinmiyor olarak işaretle, bir daha sorulmaz'), disabled: fixing, onClick: () => fix([unknownDate(row)]) },
                }))}
                onOpenRow={onOpenRow}
              />
              <HealthSection
                title={tt('{0} ama izleme tarihi var', izlenecekLabel)}
                hint={tt('İzleme tarihi girilmiş ama durumu hâlâ {0}. Büyük ihtimalle izlemişsin.', izlenecekLabel)}
                count={todoWithDate.length}
                filters={
                  todoWithDate.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <button
                        disabled={fixing}
                        onClick={() => fix(todoWithDate.map(markWatched))}
                        className="text-xs rounded-full px-2.5 py-1 border border-dashed border-neutral-600 text-neutral-300 hover:text-neutral-50 hover:border-neutral-400 transition disabled:opacity-50"
                      >
                        {ttx('Hepsini {0} yap ({1} kayıt)', izlendiLabel, todoWithDate.length)}
                      </button>
                    </div>
                  )
                }
                items={todoWithDate.map((row) => ({
                  key: row.id,
                  row,
                  label: rowTitle(row),
                  tags: [],
                  action: { label: tt('{0} yap', izlendiLabel), disabled: fixing, onClick: () => fix([markWatched(row)]) },
                }))}
                onOpenRow={onOpenRow}
              />
            </>
          )}
          <HealthSection
            title={tt('Hiç görseli olmayan kayıtlar')}
            hint={tt('Hiçbir görsel sütununda (Poster, Banner, Kapak Adı...) değeri yok.')}
            count={missingImageRows.length}
            items={missingImageRows.map((row) => ({ key: row.id, row, label: rowTitle(row), tags: [] }))}
            onOpenRow={onOpenRow}
          />
          <HealthSection
            title={tt('Eksik bilgisi olan kayıtlar')}
            hint={tt('Her kaydın yanında boş olan alanlar yazıyor. Gerçekten olmayan bir şeyse (ör. fragmanı hiç yok) yanındaki × ile bir daha sorma.')}
            count={incompleteRows.length}
            filters={
              incompleteRows.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <FilterChip active={missingFilter === null} onClick={() => setMissingFilter(null)}>
                    {ttx('Hepsi ({0})', incompleteRows.length)}</FilterChip>
                  {missingCounts
                    .filter((m) => m.count > 0)
                    .map((m) => (
                      <FilterChip key={m.prop.id} active={missingFilter === m.prop.id} onClick={() => setMissingFilter(m.prop.id)}>
                        {ttx('{0} yok ({1})', m.prop.name, m.count)}</FilterChip>
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
                      {ttx('Bu {0} kayıtta "{1}" sorulmasın', shownIncomplete.length, filterProp.name)}
                    </button>
                  )}
                </div>
              )
            }
            footer={
              ignoredCount > 0 && (
                <p className="text-xs text-neutral-600 mt-2 px-2.5">
                  {ttx('{0} alan "sorma" olarak işaretli — aşağıdaki "Sorulmayanlar"dan geri açabilirsin.', ignoredCount)}
                </p>
              )
            }
            items={shownIncomplete.map((row) => ({
              key: row.id,
              row,
              label: rowTitle(row),
              tags: missingFields(row).map((p) => ({
                label: p.name,
                dismissTitle: tt('Bu kayıtta {0} yok — bir daha sorma', p.name),
                onDismiss: () => onIgnore([row.id], p.id),
              })),
            }))}
            onOpenRow={onOpenRow}
          />
          {ignoredPairs.length > 0 && (
            <HealthSection
              title={tt('Sorulmayanlar')}
              hint={tt('"Bir daha sorma" dediğin alanlar. Yanındaki ↺ ile o alan yine sorulur.')}
              count={ignoredByRow.size}
              neutral
              filters={
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <FilterChip active={ignoredFilter === null} onClick={() => setIgnoredFilter(null)}>
                    {ttx('Hepsi ({0})', ignoredPairs.length)}</FilterChip>
                  {ignoredProps.map((p) => (
                    <FilterChip key={p.id} active={ignoredFilter === p.id} onClick={() => setIgnoredFilter(p.id)}>
                      {p.name} ({ignoredPairs.filter((x) => x.prop.id === p.id).length})
                    </FilterChip>
                  ))}
                  <button
                    onClick={() => {
                      if (ignoredFilter) onUnignore(shownIgnored.map((x) => ({ rowId: x.row.id, propertyId: x.prop.id })))
                      else onResetIgnored()
                      setIgnoredFilter(null)
                    }}
                    className="text-xs rounded-full px-2.5 py-1 border border-dashed border-neutral-600 text-neutral-400 hover:text-neutral-50 hover:border-neutral-400 transition"
                  >
                    {ignoredFilter
                      ? tt('Bu {0} kayıtta "{1}" yine sorulsun', shownIgnored.length, ignoredProps.find((p) => p.id === ignoredFilter)?.name)
                      : tt('Hepsi yine sorulsun')}
                  </button>
                </div>
              }
              items={[...ignoredByRow.values()].map(({ row, props }) => ({
                key: row.id,
                row,
                label: rowTitle(row),
                tags: props.map((p) => ({
                  label: p.name,
                  undo: true,
                  dismissTitle: tt('Bu kayıtta {0} yine sorulsun', p.name),
                  onDismiss: () => onUnignore([{ rowId: row.id, propertyId: p.id }]),
                })),
              }))}
              onOpenRow={onOpenRow}
            />
          )}
          <HealthSection
            title={tt('Görsel dosyası silinmiş kayıtlar')}
            hint={tt('Sütunda bir görsel kayıtlı ama dosyası medya klasöründe artık yok.')}
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

// Mükerrer kayıtlar — gruplar halinde (aynı içerik iki-üç kez eklenmiş). Her grupta en çok alanı dolu olan
// üstte ve "kalır" işaretli; "Birleştir" diğerlerinin dolu alanlarını ona aktarıp onları siler. Başka bir
// kaydın kalmasını istersen o satırdaki "Bu kalsın". Aynı adlı ama gerçekten farklı yapımlar için "Bunlar farklı".
function DuplicateSection({
  groups,
  loading,
  busy,
  rowTitle,
  rowSummary,
  onOpenRow,
  onMerge,
  onMergeAll,
  onIgnore,
}: {
  groups: Row[][]
  loading: boolean
  busy: boolean
  rowTitle: (row: Row) => string
  rowSummary: (row: Row) => string
  onOpenRow: (row: Row) => void
  onMerge: (keep: Row, group: Row[]) => void
  onMergeAll: () => void
  onIgnore: (group: Row[]) => void
}) {
  const [open, setOpen] = useState(false)
  const count = groups.length
  return (
    <div className="border border-neutral-800 rounded-xl">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading || count === 0}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-default"
      >
        <div>
          <h3 className="text-sm font-semibold text-neutral-50">{tt('Mükerrer kayıtlar')}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">{tt('Aynı içerik birden fazla kez eklenmiş (aynı TMDB yapımı ya da aynı Türkçe/orijinal ad).')}</p>
        </div>
        <span
          className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 ${
            loading ? 'text-neutral-500' : count === 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-500 bg-amber-500/10'
          }`}
        >
          {loading ? tt('Kontrol ediliyor...') : count === 0 ? tt('Sorun yok') : `${tt('{0} grup', count)} ${open ? '▴' : '▾'}`}
        </span>
      </button>
      {open && count > 0 && (
        <div className="px-4 pb-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-neutral-500">
              {tt('"Birleştir": en dolu kayıt kalır, diğerlerinin dolu alanları (izleme tarihleri, puan, bölüm işaretleri...) ona aktarılıp silinir.')}
            </p>
            {count > 1 && (
              <button
                onClick={onMergeAll}
                disabled={busy}
                className="text-xs rounded-full px-2.5 py-1 border border-dashed border-neutral-600 text-neutral-300 hover:text-neutral-50 hover:border-neutral-400 transition disabled:opacity-50"
              >
                {ttx('Hepsini birleştir ({0} grup)', count)}
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {groups.map((g) => (
              <div key={g.map((r) => r.id).join('|')} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-2">
                <ul className="space-y-0.5">
                  {g.map((row, i) => (
                    <li key={row.id} className="flex items-center gap-3 rounded-md hover:bg-neutral-800 px-2 py-1 transition">
                      <button onClick={() => onOpenRow(row)} className="flex-1 min-w-0 text-left py-0.5">
                        <span className="block text-sm text-neutral-200 hover:text-[#00c0fa] truncate">{rowTitle(row)}</span>
                        <span className="block text-[11px] text-neutral-500 truncate">{rowSummary(row)}</span>
                      </button>
                      {i === 0 ? (
                        <span className="shrink-0 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5">{tt('kalır')}</span>
                      ) : (
                        <button
                          onClick={() => onMerge(row, g)}
                          disabled={busy}
                          title={tt('Bu kayıt kalsın, diğerleri buna birleştirilsin')}
                          className="shrink-0 text-[11px] text-neutral-400 hover:text-neutral-50 border border-neutral-700 hover:border-neutral-500 rounded px-1.5 py-0.5 transition disabled:opacity-50"
                        >
                          {tt('Bu kalsın')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end gap-1.5 mt-1.5">
                  <button
                    onClick={() => onIgnore(g)}
                    disabled={busy}
                    className="text-xs rounded-full px-2.5 py-1 border border-neutral-700 text-neutral-400 hover:text-neutral-50 hover:border-neutral-500 transition disabled:opacity-50"
                  >
                    {tt('Bunlar farklı')}
                  </button>
                  <button
                    onClick={() => onMerge(g[0], g)}
                    disabled={busy}
                    className="text-xs rounded-full px-2.5 py-1 border border-[#00c0fa]/60 text-[#7fdcff] hover:bg-[#00c0fa]/10 transition disabled:opacity-50"
                  >
                    {tt('Birleştir')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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

type HealthTag = { label: string; dismissTitle?: string; onDismiss?: () => void; undo?: boolean }
type HealthItem = {
  key: string
  row: Row
  label: string
  tags: HealthTag[]
  // Satırın sağında tek tıkla düzeltme düğmesi (ör. "İzlendi yap")
  action?: { label: string; title?: string; disabled?: boolean; onClick: () => void }
}

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
  neutral = false,
  onOpenRow,
}: {
  title: string
  hint: string
  count: number
  items: HealthItem[]
  filters?: React.ReactNode
  footer?: React.ReactNode
  loading?: boolean
  // Sorun değil, bilgi listesi (Sorulmayanlar) — sayı rozeti gri.
  neutral?: boolean
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
            loading ? 'text-neutral-500' : neutral ? 'text-neutral-300 bg-neutral-800' : count === 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-500 bg-amber-500/10'
          }`}
        >
          {loading ? tt('Kontrol ediliyor...') : count === 0 ? tt('Sorun yok') : tt('{0} kayıt {1}', count, open ? '▴' : '▾')}
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
                          <button
                            onClick={t.onDismiss}
                            title={t.dismissTitle}
                            className={`text-neutral-500 leading-none ${t.undo ? 'hover:text-emerald-400' : 'hover:text-rose-400'}`}
                          >
                            {t.undo ? '↺' : '×'}
                          </button>
                        )}
                      </span>
                    ))}
                  </span>
                )}
                {item.action && (
                  <button
                    onClick={item.action.onClick}
                    disabled={item.action.disabled}
                    title={item.action.title}
                    className="shrink-0 text-[11px] text-[#7fdcff] border border-[#00c0fa]/50 hover:bg-[#00c0fa]/10 rounded px-1.5 py-0.5 transition disabled:opacity-50"
                  >
                    {item.action.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {items.length > MAX_SHOWN && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs text-[#00c0fa] hover:underline px-2.5">
              {showAll ? tt('Daha az göster') : tt('Tümünü göster (+{0} kayıt daha)', items.length - MAX_SHOWN)}
            </button>
          )}
          {footer}
        </div>
      )}
    </div>
  )
}
