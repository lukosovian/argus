import { useMemo, useState, type RefObject } from 'react'
import { searchFold } from '../lib/search'
import Select from './Select'
import { OPTION_COLORS, type PropertyDef, type PropertyType, type RatingCriterion, type Row, type SelectOption } from '../types'
import AnchoredMenu from './AnchoredMenu'
import PropertyTypePicker from './PropertyTypePicker'
import Checkbox from './Checkbox'
import { useToast } from '../hooks/useToast'
import { tt, ttx } from '../lib/i18n'

function CriterionRow({
  criterion,
  onRename,
  onDelete,
}: {
  criterion: RatingCriterion
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(criterion.name)

  function commit() {
    if (name.trim() && name.trim() !== criterion.name) onRename(name.trim())
  }

  return (
    <div className="flex items-center gap-1 mb-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="flex-1 min-w-0 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-100 text-xs outline-none focus:border-neutral-500"
      />
      <button onClick={onDelete} aria-label={tt('{0} kriterini sil', criterion.name)} title={tt('Sil')} className="text-neutral-600 hover:text-rose-400 text-xs shrink-0 px-1">
        ×
      </button>
    </div>
  )
}

function OptionRow({
  option,
  onRename,
  onChangeColor,
  onDelete,
  bulkMode,
  selected,
  onToggleSelect,
  count,
  draggable,
  dragOver,
  onDragStart,
  onDragOverRow,
  onDropRow,
  onDragEnd,
  onStartMerge,
  merging,
}: {
  option: SelectOption
  onRename: (label: string) => void
  onChangeColor: (colorIndex: number) => void
  onDelete: () => void
  // A6: bu seçeneği taşıyan kayıt sayısı (bilinmiyorsa gösterilmez)
  count?: number
  // A6: soldaki tutamaçtan sürükleyerek sıralama
  draggable?: boolean
  dragOver?: boolean
  onDragStart?: () => void
  onDragOverRow?: () => void
  onDropRow?: () => void
  onDragEnd?: () => void
  // A6: "başka bir seçenekle birleştir" seçicisini aç/kapa
  onStartMerge?: () => void
  merging?: boolean
  // Toplu seçim modu — açıkken renk noktasının solunda bir onay kutusu belirir (kullanıcı
  // "sütun bazlı silme ekle... toplu olarak onları silebilme gelsin" dedi, ör. Oyuncular
  // sütununda birikmiş onlarca etiketi tek tek değil topluca silebilmek için).
  bulkMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const [label, setLabel] = useState(option.label)
  const [pickingColor, setPickingColor] = useState(false)

  function commit() {
    if (label.trim() && label.trim() !== option.label) onRename(label.trim())
  }

  return (
    <div
      className={`mb-1.5 border-t-2 ${dragOver ? 'border-sky-400' : 'border-transparent'}`}
      onDragOver={
        draggable
          ? (e) => {
              e.preventDefault()
              onDragOverRow?.()
            }
          : undefined
      }
      onDrop={
        draggable
          ? (e) => {
              e.preventDefault()
              onDropRow?.()
            }
          : undefined
      }
    >
      <div className="flex items-center gap-1">
        {draggable && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', option.id)
              onDragStart?.()
            }}
            onDragEnd={onDragEnd}
            title={tt('Sürükleyerek sırala')}
            className="cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-300 text-[10px] leading-none shrink-0 select-none px-0.5"
            aria-hidden
          >
            ⋮⋮
          </span>
        )}
        {bulkMode && <Checkbox checked={Boolean(selected)} onChange={() => onToggleSelect?.()} label={tt('{0} seç', option.label)} />}
        <button
          type="button"
          onClick={() => setPickingColor((v) => !v)}
          title={tt('Renk seç')}
          aria-label={tt('Renk seç')}
          aria-expanded={pickingColor}
          className={`h-4 w-4 rounded-full border shrink-0 ${OPTION_COLORS[option.colorIndex % OPTION_COLORS.length].bg} ${OPTION_COLORS[option.colorIndex % OPTION_COLORS.length].border}`}
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="flex-1 min-w-0 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-100 text-xs outline-none focus:border-neutral-500"
        />
        {count !== undefined && (
          <span className={`text-[10px] tabular-nums shrink-0 min-w-[1.5rem] text-right ${count === 0 ? 'text-neutral-600' : 'text-neutral-400'}`} title={tt('{0} kayıtta kullanılıyor', count)}>
            {count}
          </span>
        )}
        {onStartMerge && (
          <button
            type="button"
            onClick={onStartMerge}
            title={tt('Başka bir seçenekle birleştir')}
            aria-label={tt('{0} seçeneğini başka bir seçenekle birleştir', option.label)}
            aria-expanded={merging}
            className={`text-xs shrink-0 px-0.5 transition ${merging ? 'text-sky-400' : 'text-neutral-600 hover:text-sky-400'}`}
          >
            ⇢
          </button>
        )}
        <button onClick={onDelete} aria-label={tt('{0} seçeneğini sil', option.label)} className="text-neutral-600 hover:text-rose-400 text-xs shrink-0 px-1">
          ×
        </button>
      </div>
      {pickingColor && (
        <div className="flex flex-wrap gap-1 mt-1 pl-5">
          {OPTION_COLORS.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChangeColor(i)
                setPickingColor(false)
              }}
              aria-label={tt('Renk {0}', i + 1)}
              aria-pressed={i === option.colorIndex}
              className={`h-4 w-4 rounded-full border ${c.bg} ${c.border} ${i === option.colorIndex ? 'ring-2 ring-white/60' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// A6: birleştirilecek hedef seçeneği aratıp seçtirir (Oyuncular gibi binlerce seçenekte de en fazla 8 sonuç)
function MergePicker({
  from,
  options,
  counts,
  onPick,
  onCancel,
}: {
  from: SelectOption
  options: SelectOption[]
  counts: Map<string, number> | null
  onPick: (target: SelectOption) => void
  onCancel: () => void
}) {
  const [q, setQ] = useState('')
  const fq = searchFold(q.trim())
  const matches = options.filter((o) => o.id !== from.id && (!fq || searchFold(o.label).includes(fq))).slice(0, 8)
  return (
    <div className="mb-2 ml-3 rounded-md border border-sky-500/30 bg-neutral-950/60 p-1.5 space-y-1">
      <p className="text-[10px] text-neutral-400">{tt('"{0}" hangisine katılsın? Kayıtları ona geçer, bu seçenek silinir.', from.label)}</p>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCancel()
          }
          if (e.key === 'Enter' && matches[0]) onPick(matches[0])
        }}
        placeholder={tt('Seçenek ara…')}
        className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-100 text-xs outline-none focus:border-neutral-500"
      />
      {matches.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onPick(o)}
          className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50"
        >
          <span className={`h-2.5 w-2.5 rounded-full border shrink-0 ${OPTION_COLORS[o.colorIndex % OPTION_COLORS.length].bg} ${OPTION_COLORS[o.colorIndex % OPTION_COLORS.length].border}`} />
          <span className="truncate flex-1">{o.label}</span>
          {counts && <span className="text-[10px] text-neutral-500 tabular-nums">{counts.get(o.id) ?? 0}</span>}
        </button>
      ))}
      {matches.length === 0 && <p className="text-[10px] text-neutral-600 px-1">{tt('Eşleşen yok.')}</p>}
      <button type="button" onClick={onCancel} className="text-[10px] text-neutral-500 hover:text-neutral-200 px-1">
        {tt('Vazgeç')}
      </button>
    </div>
  )
}

function NewCriterionInput({ onAdd }: { onAdd: (name: string) => string }) {
  const [name, setName] = useState('')

  function commit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setName('')
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit())}
        placeholder={tt('Yeni kriter...')}
        className="flex-1 min-w-0 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-100 text-xs outline-none focus:border-neutral-500"
      />
      <button type="button" onClick={commit} className="text-xs text-neutral-400 hover:text-neutral-50 shrink-0 px-1">
        {tt('+ Ekle')}
      </button>
    </div>
  )
}

export default function ColumnMenu({
  anchorRef,
  property,
  canDelete,
  isCover,
  isTitleImage,
  onClose,
  onRename,
  onChangeType,
  onDelete,
  onRenameOption,
  onChangeOptionColor,
  onDeleteOption,
  onDeleteOptions,
  onClearColumn,
  onAddCriterion,
  onRenameCriterion,
  onDeleteCriterion,
  onToggleCover,
  onToggleTitleImage,
  roleChoices,
  currentRole,
  onChangeRole,
  statusChoices,
  onChangeStatusOption,
  rows,
  onReorderOptions,
  onMergeOption,
}: {
  anchorRef: RefObject<HTMLElement | null>
  property: PropertyDef
  canDelete: boolean
  isCover?: boolean
  isTitleImage?: boolean
  onClose: () => void
  onRename: (name: string) => void
  onChangeType: (type: PropertyType) => void
  onDelete: () => void
  onRenameOption: (optionId: string, label: string) => void
  onChangeOptionColor: (optionId: string, colorIndex: number) => void
  onDeleteOption: (optionId: string) => void
  onDeleteOptions: (optionIds: string[]) => void
  onClearColumn: () => void
  onAddCriterion: (name: string) => string
  onRenameCriterion: (criterionId: string, name: string) => void
  onDeleteCriterion: (criterionId: string) => void
  onToggleCover?: () => void
  onToggleTitleImage?: () => void
  // Bu sütunun üstlenebileceği görevler (bkz. lib/roles.ts) — boşsa bölüm hiç gösterilmez.
  roleChoices: { value: string; label: string }[]
  currentRole: string
  onChangeRole: (role: string) => void
  // Sadece Durum görevindeki sütunda: "İzlenecek/İzleniyor/İzlendi" hangi seçenek.
  statusChoices?: { key: string; label: string; value: string }[]
  onChangeStatusOption?: (key: string, optionId: string) => void
  // A6: arşivin BÜTÜN kayıtları (filtrelenmiş değil) — seçenek başına kayıt sayısı ve "kullanılmayanlar" için.
  // Kayıtlar henüz yüklenmediyse verilmez; o zaman sayılar ve temizleme düğmesi görünmez.
  rows?: Row[]
  onReorderOptions?: (orderedIds: string[]) => void
  onMergeOption?: (fromId: string, toId: string) => void
}) {
  const { confirm } = useToast()
  const [name, setName] = useState(property.name)
  const hasOptions = property.type === 'select' || property.type === 'multiselect'
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Oyuncular gibi binlerce seçenekli sütunlarda hepsini birden çizmek menüyü donduruyordu —
  // çok seçenek varsa arama kutusu çıkıyor ve en fazla OPT_LIMIT tanesi gösteriliyor.
  const [optQuery, setOptQuery] = useState('')
  const OPT_LIMIT = 80
  const allOptions = property.options ?? []
  const optQ = searchFold(optQuery.trim())
  const matchedOptions = optQ ? allOptions.filter((o) => searchFold(o.label).includes(optQ)) : allOptions
  const shownOptions = matchedOptions.slice(0, OPT_LIMIT)
  // A6: seçenek → kayıt sayısı, tek geçişte (binlerce kayıt × binlerce seçenekte de her kayıt bir kez dolaşılır)
  const counts = useMemo(() => {
    if (!rows || !hasOptions) return null
    const m = new Map<string, number>()
    for (const r of rows) {
      const v = r.values[property.id]
      if (Array.isArray(v)) {
        for (const id of new Set(v as string[])) m.set(id, (m.get(id) ?? 0) + 1)
      } else if (typeof v === 'string' && v) m.set(v, (m.get(v) ?? 0) + 1)
    }
    return m
  }, [rows, property.id, hasOptions])
  // Durum sütununda İzlenecek/İzlendi… olarak bağlı seçenekler 0 kayıtta olsa da silinmesin/birleşmesin
  // (bağlantı koparsa uygulama "İzlendi"yi bulamaz).
  const protectedIds = useMemo(() => new Set((statusChoices ?? []).map((s) => s.value).filter(Boolean)), [statusChoices])
  const unusedIds = counts ? allOptions.filter((o) => !counts.get(o.id) && !protectedIds.has(o.id)).map((o) => o.id) : []
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [mergeFrom, setMergeFrom] = useState<string | null>(null)

  // Sürüklenen seçenek bırakıldığı seçeneğin önüne geçer (arama açıkken de tam listede yer değiştirir)
  function dropOn(targetId: string) {
    const from = dragId
    setDragId(null)
    setOverId(null)
    if (!from || from === targetId || !onReorderOptions) return
    const ids = allOptions.map((o) => o.id).filter((id) => id !== from)
    const at = ids.indexOf(targetId)
    if (at === -1) return
    ids.splice(at, 0, from)
    onReorderOptions(ids)
  }

  async function handleMerge(from: SelectOption, to: SelectOption) {
    setMergeFrom(null)
    if (!onMergeOption) return
    const n = counts?.get(from.id) ?? 0
    // Kayıt yoksa sormaya gerek yok; varsa kısa bir onay (ardından "Geri al" bildirimi de çıkıyor)
    if (n > 0) {
      const ok = await confirm({
        message: tt('"{0}" seçeneğindeki {1} kayıt "{2}" seçeneğine geçecek ve "{0}" silinecek. Sonra geri alabilirsin.', from.label, n, to.label),
        confirmLabel: tt('Birleştir'),
      })
      if (!ok) return
    }
    onMergeOption(from.id, to.id)
  }

  async function handleCleanUnused() {
    if (unusedIds.length === 0) return
    const ok = await confirm({
      message: tt('Hiçbir kayıtta kullanılmayan {0} seçenek silinsin mi?', unusedIds.length),
      confirmLabel: tt('Temizle'),
      tone: 'danger',
    })
    if (ok) onDeleteOptions(unusedIds)
  }

  // Tek bir seçeneği silmek de onay istiyor — yanlışlıkla "İzlendi"ye basınca yüzlerce kaydın durumu
  // sessizce boşalıyordu.
  async function handleDeleteOption(o: SelectOption) {
    const ok = await confirm({
      message: tt('"{0}" seçeneği silinsin mi? Bu seçeneği kullanan kayıtlarda bu alan boşalır.', o.label),
      confirmLabel: tt('Sil'),
      tone: 'danger',
    })
    if (ok) onDeleteOption(o.id)
  }

  function commitName() {
    if (name.trim() && name.trim() !== property.name) onRename(name.trim())
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitBulkMode() {
    setBulkMode(false)
    setSelectedIds(new Set())
  }

  async function handleBulkDelete() {
    const count = selectedIds.size
    if (count === 0) return
    const ok = await confirm({
      message: tt('{0} seçeneği kalıcı olarak silmek istediğine emin misin?', count),
      confirmLabel: tt('Sil'),
      tone: 'danger',
    })
    if (!ok) return
    onDeleteOptions(Array.from(selectedIds))
    exitBulkMode()
  }

  return (
    <AnchoredMenu anchorRef={anchorRef} align="left" width={hasOptions ? 270 : 240} onClose={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-3 normal-case max-h-[70vh] overflow-y-auto">
        <p className="text-[11px] text-neutral-500 mb-1">{tt('Sütun adı')}</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-neutral-100 text-sm mb-3 outline-none focus:border-neutral-500"
        />
        <p className="text-[11px] text-neutral-500 mb-1.5">{tt('Tip')}</p>
        <PropertyTypePicker value={property.type} onChange={onChangeType} />

        {roleChoices.length > 0 && (
          <div className="mt-3 pt-3 border-t border-neutral-800">
            <p className="text-[11px] text-neutral-500 mb-1">{tt('Görevi')}</p>
            <Select
              value={currentRole}
              onChange={onChangeRole}
              options={[{ value: '', label: tt('Yok') }, ...roleChoices]}
            />
            <p className="text-[11px] text-neutral-600 mt-1">
              {tt('Uygulama bu sütunu bu iş için kullanır (ör. Poster, Durum). Sütunun adını değiştirsen de görevi kalır.')}
            </p>
          </div>
        )}

        {statusChoices && statusChoices.length > 0 && onChangeStatusOption && (
          <div className="mt-3 pt-3 border-t border-neutral-800 space-y-1.5">
            <p className="text-[11px] text-neutral-500">{tt('Seçeneklerin anlamı')}</p>
            {statusChoices.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="text-xs text-neutral-400 w-20 shrink-0">{s.label}</span>
                <div className="flex-1 min-w-0">
                  <Select
                    value={s.value}
                    onChange={(v) => onChangeStatusOption(s.key, v)}
                    options={[{ value: '', label: tt('Seçilmedi') }, ...(property.options ?? []).map((o) => ({ value: o.id, label: o.label }))]}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {property.type === 'image' && (
          <div className="mt-3 pt-3 border-t border-neutral-800 space-y-1">
            <button
              type="button"
              onClick={onToggleCover}
              className={`block w-full text-left text-xs rounded-lg px-2 py-1.5 transition ${
                isCover ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50'
              }`}
            >
              {isCover ? tt('✓ Kapak Görseli') : tt('Kapak Görseli Yap')}
            </button>
            <button
              type="button"
              onClick={onToggleTitleImage}
              className={`block w-full text-left text-xs rounded-lg px-2 py-1.5 transition ${
                isTitleImage ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50'
              }`}
            >
              {isTitleImage ? tt('✓ Vitrin Başlık Görseli') : tt('Vitrin Başlık Görseli Yap')}
            </button>
            <p className="text-[11px] text-neutral-600 px-2">
              {tt('Bir kayıtta bu görsel doluysa vitrinde/detayda yazı yerine bu görsel gösterilir, boşsa başlık yazısına dönülür.')}
            </p>
          </div>
        )}

        {hasOptions && (property.options?.length ?? 0) > 0 && (
          <div className="mt-3 pt-3 border-t border-neutral-800">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <p className="text-[11px] text-neutral-500">{tt('Seçenekler (renk için soldaki noktaya tıkla)')}</p>
              <button
                type="button"
                onClick={() => (bulkMode ? exitBulkMode() : setBulkMode(true))}
                className="text-[11px] text-sky-400 hover:text-sky-300 shrink-0"
              >
                {bulkMode ? tt('Vazgeç') : tt('Toplu Seç')}
              </button>
            </div>
            {allOptions.length > OPT_LIMIT && (
              <input
                value={optQuery}
                onChange={(e) => setOptQuery(e.target.value)}
                placeholder={tt('{0} seçenek içinde ara…', allOptions.length)}
                className="w-full mb-2 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-100 text-xs outline-none focus:border-neutral-500"
              />
            )}
            {onReorderOptions && allOptions.length > 1 && !bulkMode && (
              <p className="text-[10px] text-neutral-600 mb-1">{tt('Soldaki ⋮⋮ ile sürükleyip sırala; sağdaki sayı kaç kayıtta kullanıldığı.')}</p>
            )}
            {shownOptions.map((o) => (
              <div key={o.id}>
                <OptionRow
                  option={o}
                  onRename={(label) => onRenameOption(o.id, label)}
                  onChangeColor={(colorIndex) => onChangeOptionColor(o.id, colorIndex)}
                  onDelete={() => void handleDeleteOption(o)}
                  bulkMode={bulkMode}
                  selected={selectedIds.has(o.id)}
                  onToggleSelect={() => toggleSelect(o.id)}
                  count={counts ? (counts.get(o.id) ?? 0) : undefined}
                  draggable={Boolean(onReorderOptions) && !bulkMode && allOptions.length > 1}
                  dragOver={dragId !== null && overId === o.id && dragId !== o.id}
                  onDragStart={() => setDragId(o.id)}
                  onDragOverRow={() => {
                    if (overId !== o.id) setOverId(o.id)
                  }}
                  onDropRow={() => dropOn(o.id)}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverId(null)
                  }}
                  onStartMerge={
                    onMergeOption && !bulkMode && allOptions.length > 1 && !protectedIds.has(o.id)
                      ? () => setMergeFrom(mergeFrom === o.id ? null : o.id)
                      : undefined
                  }
                  merging={mergeFrom === o.id}
                />
                {mergeFrom === o.id && (
                  <MergePicker from={o} options={allOptions} counts={counts} onPick={(t) => void handleMerge(o, t)} onCancel={() => setMergeFrom(null)} />
                )}
              </div>
            ))}
            {matchedOptions.length > shownOptions.length && (
              <p className="text-[11px] text-neutral-500 px-1 py-1">{tt('+{0} seçenek daha — aramayla daralt.', matchedOptions.length - shownOptions.length)}</p>
            )}
            {bulkMode && (
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0}
                className="w-full text-left text-xs text-rose-400 hover:text-rose-300 disabled:opacity-40 disabled:hover:text-rose-400 mt-1 pt-2 border-t border-neutral-800"
              >
                {ttx('Seçilenleri Sil ({0})', selectedIds.size)}</button>
            )}
            {counts && !bulkMode && unusedIds.length > 0 && (
              <button
                type="button"
                onClick={() => void handleCleanUnused()}
                className="w-full text-left text-xs text-amber-400 hover:text-amber-300 mt-1 pt-2 border-t border-neutral-800"
              >
                {ttx('Kullanılmayanları temizle ({0})', unusedIds.length)}
              </button>
            )}
          </div>
        )}

        {property.type === 'rating' && (
          <div className="mt-3 pt-3 border-t border-neutral-800">
            <p className="text-[11px] text-neutral-500 mb-1.5">{tt('Puanlama kriterleri')}</p>
            {(property.criteria ?? []).map((c) => (
              <CriterionRow
                key={c.id}
                criterion={c}
                onRename={(name) => onRenameCriterion(c.id, name)}
                onDelete={() => onDeleteCriterion(c.id)}
              />
            ))}
            <NewCriterionInput onAdd={onAddCriterion} />
          </div>
        )}

        {canDelete && (
          <>
            <button
              onClick={onClearColumn}
              className="w-full text-left text-amber-400 hover:text-amber-300 text-xs mt-3 pt-3 border-t border-neutral-800"
            >
              {tt('Sütunu Temizle (tüm kayıtlarda boşalt)')}
            </button>
            <button onClick={onDelete} className="w-full text-left text-rose-400 hover:text-rose-300 text-xs mt-1.5">
              {tt('Sütunu Sil')}
            </button>
          </>
        )}
      </div>
    </AnchoredMenu>
  )
}
