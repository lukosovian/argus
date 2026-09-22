import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Board, PropertyDef, PropertyValue, Row, SelectOption } from '../types'
import type { PropertyType } from '../types'
import { titleText, ratingAverage, DEFAULT_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from '../types'
import { useEpisodes } from '../hooks/useEpisodes'
import { useToast } from '../hooks/useToast'
import OptionBadge from './OptionBadge'
import Checkbox from './Checkbox'
import AddPropertyPopover from './AddPropertyPopover'
import ColumnMenu from './ColumnMenu'
import CellEditor from './CellEditor'
import InlineValueEditor from './InlineValueEditor'

const TITLE_DEFAULT_WIDTH = 220
const ACTIONS_COLUMN_WIDTH = 44
// Artık çoklu-seçim kutucuğu + altı-noktalı menü tutamacı + "Detayı Gör" göz ikonunu bir arada
// barındırıyor (bkz. aşağıdaki RowMenu ve seçim çubuğu notları) — önceden sadece tutamaç vardı,
// 40px yetiyordu, sonra kutucuk eklenince 64'e çıktı, göz ikonu için bir tık daha genişletildi.
const HANDLE_COLUMN_WIDTH = 92
const INLINE_TYPES = new Set<PropertyType>(['text', 'number', 'date', 'url', 'longtext'])

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`}
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// Notion'daki gibi: satırın en solundaki altı-noktalı tutamaç, tıklanınca o satırla ilgili
// üç aksiyonu (TMDB'den doldur, altına yeni satır ekle, sil) tek bir menüde açar — önceden bu
// üçü (aslında ikisi, satır ekleme yoktu) satırın SAĞINDA ayrı ayrı hover'da beliren ikonlardı.
// Sadece satır satır hover'da görünür (`opacity-0 group-hover:opacity-100`), tutamağın kendisi
// bir sürükleme değil sadece tıklanabilir bir menü açıcı (gerçek satır sürükleme/yeniden
// sıralama henüz yok — ikon sadece Notion'daki tanıdık görsel dili ödünç alıyor).
//
// Menü `createPortal` ile doğrudan `document.body`'ye çiziliyor, `<td>`'nin içinde DEĞİL —
// gerçek bir hata burada bulundu: tablo gövdesinin kaydırma kutusu `overflow-x-auto` (bkz.
// dosyanın en altındaki genel not), ve CSS'te bir eksende `overflow` 'visible' dışında bir
// değer alınca tarayıcı diğer ekseni de örtük biçimde bir kaydırma kutusu sayıyor — yani tablo
// az sayıda (ör. tek) satırlıyken menü, `<td>` içinde kalsaydı bu kısacık kutunun sınırında
// KESİLİYORDU (sadece ilk seçenek görünüyor, geri kalanı görünmüyordu). Portal + `position:
// fixed` + tutamacın gerçek ekran konumundan hesaplanan koordinat bu kesilmeyi tamamen ortadan
// kaldırıyor, tablo kaç satır olursa olsun.
function RowMenu({
  hasTitle,
  hasEpisodes,
  refreshing,
  onFetchTmdb,
  onAddRow,
  onDuplicate,
  onDelete,
}: {
  hasTitle: boolean
  hasEpisodes: boolean
  refreshing: boolean
  onFetchTmdb: () => void
  onAddRow: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  function handleToggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen((v) => !v)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        title="Satır ayarları"
        className={`h-7 w-7 flex items-center justify-center rounded-md text-neutral-600 hover:text-neutral-200 hover:bg-neutral-800 transition ${
          open ? 'opacity-100 bg-neutral-800 text-neutral-200' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <DragHandleIcon />
      </button>
      {open &&
        menuPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-40 w-56 bg-neutral-900 border border-neutral-800 rounded-xl py-1 shadow-lg"
            >
              {hasTitle && (
                <button
                  onClick={() => {
                    setOpen(false)
                    onFetchTmdb()
                  }}
                  disabled={refreshing}
                  title={
                    hasEpisodes
                      ? "Yeni bölüm var mı kontrol et / eksik bilgiyi tamamla (TMDB'ye bağlanır)"
                      : "TMDB'den doldur (poster, ülke, yönetmen, oyuncular vb.)"
                  }
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition disabled:opacity-50"
                >
                  <RefreshIcon spinning={refreshing} />
                  {refreshing ? 'Çekiliyor...' : hasEpisodes ? 'Bölümleri Güncelle' : "TMDB'den Doldur"}
                </button>
              )}
              <button
                onClick={() => {
                  setOpen(false)
                  onAddRow()
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition"
              >
                <PlusIcon />
                Altına Satır Ekle
              </button>
              <button
                onClick={() => {
                  setOpen(false)
                  onDuplicate()
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition"
              >
                <CopyIcon />
                Çoğalt
              </button>
              <div className="my-1 border-t border-neutral-800" />
              <button
                onClick={() => {
                  setOpen(false)
                  onDelete()
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition"
              >
                <TrashIcon />
                Sil
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}

// Oyuncular gibi binlerce seçeneği olan bir sütunda her hücrede `.find()` ile doğrusal
// arama yapmak (satır sayısı × seçenek sayısı büyüdükçe) tabloyu -hatta bu tabloyla
// hiç ilgisi olmayan bir state değişiminde bile- gözle görülür şekilde yavaşlatıyordu.
// Bunun yerine board.properties her değiştiğinde bir kere kurulan id->seçenek Map'i kullanılır.
type OptionMaps = Map<string, Map<string, SelectOption>>

function buildOptionMaps(properties: PropertyDef[]): OptionMaps {
  const maps: OptionMaps = new Map()
  for (const p of properties) {
    if (p.options) maps.set(p.id, new Map(p.options.map((o) => [o.id, o])))
  }
  return maps
}

// 'date' ve 'multidate' aynı ISO ("YYYY-MM-DD") biçimini aynı kısa "gg.aa.yy" görünümüne
// çeviriyor — iki yerde ayrı ayrı yazmak yerine tek yerden.
function formatDateShort(iso: string): string | null {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return null
  return `${d}.${m}.${y.slice(2)}`
}

function Cell({ property, value, optionMaps }: { property: PropertyDef; value: PropertyValue; optionMaps: OptionMaps }) {
  if (property.type === 'rating') {
    const avg = ratingAverage(value, property)
    return avg === null ? null : <span className="text-neutral-300">⭐ {avg.toFixed(1)}</span>
  }

  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return null
  }

  if (property.type === 'checkbox') return <span className="text-neutral-300">{value ? '✓' : ''}</span>

  if (property.type === 'date') {
    const formatted = formatDateShort(value as string)
    return formatted ? <span className="text-neutral-300">{formatted}</span> : null
  }

  if (property.type === 'multidate') {
    const dates = (Array.isArray(value) ? (value as string[]) : []).slice().sort()
    const formatted = dates.map(formatDateShort).filter((d): d is string => Boolean(d))
    if (formatted.length === 0) return null
    return <span className="block truncate text-neutral-300">{formatted.join(', ')}</span>
  }

  if (property.type === 'select') {
    const opt = optionMaps.get(property.id)?.get(value as string)
    return opt ? <OptionBadge label={opt.label} colorIndex={opt.colorIndex} image={opt.image} /> : null
  }

  if (property.type === 'multiselect') {
    const ids = Array.isArray(value) ? value : []
    const propMap = optionMaps.get(property.id)
    const opts = ids.map((id) => propMap?.get(id)).filter(Boolean)
    if (opts.length === 0) return null
    return (
      <div className="flex flex-nowrap gap-1 overflow-hidden">
        {opts.map((o) => (
          <OptionBadge key={o!.id} label={o!.label} colorIndex={o!.colorIndex} image={o!.image} />
        ))}
      </div>
    )
  }

  if (property.type === 'image') {
    return <img src={value as string} alt="" className="h-8 w-6 object-cover rounded" />
  }

  if (property.type === 'url') {
    return (
      <a
        href={value as string}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-sky-400 hover:underline"
      >
        Link
      </a>
    )
  }

  return <span className="block truncate text-neutral-300">{String(value)}</span>
}

function useColumnResize(onResize: (propertyId: string, width: number) => void) {
  const [liveWidth, setLiveWidth] = useState<{ id: string; width: number } | null>(null)
  const dragRef = useRef<{ id: string; startX: number; startWidth: number; current: number } | null>(null)

  function startResize(e: React.MouseEvent, propertyId: string, currentWidth: number) {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { id: propertyId, startX: e.clientX, startWidth: currentWidth, current: currentWidth }
    setLiveWidth({ id: propertyId, width: currentWidth })

    function onMove(ev: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      const next = Math.max(MIN_COLUMN_WIDTH, d.startWidth + (ev.clientX - d.startX))
      d.current = next
      setLiveWidth({ id: d.id, width: next })
    }
    function onUp() {
      const d = dragRef.current
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      dragRef.current = null
      setLiveWidth(null)
      if (d) onResize(d.id, d.current)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return { liveWidth, startResize }
}

// Satır sayısı arttıkça (837+ kayıt) her filtre/arama değişiminde TÜM satırları DOM'a
// basmak — filtre sonucu ister 20 ister 800 satır olsun — hep en kötü senaryo kadar yavaş
// kalıyordu ("çalışıyo ama yavaş"). Gerçek, veri boyutundan bağımsız ("stabil") bir hız için
// klasik pencereleme (virtualization): sadece o an ekranda GÖRÜNEN satırlar (+ birkaç tampon
// satır) gerçekten render edilir, öncesi/sonrası tek bir boş `<tr>` ile (doğru yükseklikte)
// telafi edilir — DOM'da hep sabit sayıda (~30-40) satır bulunur, 800 değil.
//
// Tablo artık kendi kaydırma kutusu DEĞİL — sayfanın kendisiyle birlikte kayıyor (kullanıcı
// isteği: "tablo tablo olarak durmasın sayfayı kullansın"), bu yüzden görünürlük hesap edilirken
// bir konteynerin kendi scrollTop'u değil, tablonun sayfa içindeki konumu + PENCERENİN kaydırma
// konumu kullanılıyor.
const ROW_HEIGHT = 37 // h-9 (36px) hücre içeriği + 1px'lik üst çizgi (border-t)
const OVERSCAN = 10

function useVirtualRows(containerRef: React.RefObject<HTMLDivElement | null>, rowCount: number) {
  const [range, setRange] = useState({ start: 0, end: Math.min(rowCount, 60) })

  useEffect(() => {
    function update() {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const visibleTop = Math.max(0, -rect.top)
      const visibleBottom = visibleTop + window.innerHeight
      const start = Math.max(0, Math.floor(visibleTop / ROW_HEIGHT) - OVERSCAN)
      const end = Math.min(rowCount, Math.ceil(visibleBottom / ROW_HEIGHT) + OVERSCAN)
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [containerRef, rowCount])

  return range
}

// Yatay kaydırılabilir kutuların (başlık/gövde) üzerinde fare tekerleğiyle DİKEY kaydırmaya
// çalışınca, tarayıcı bu dikey hareketi kutunun kendi yatay kaydırmasına çeviriyordu (yatay
// kaydırılabilir kutularda tarayıcıların bilinen/kasıtlı bir davranışı) — sonuç: fare tablonun
// üzerindeyken sayfa hiç aşağı kaymıyordu. Baskın eksen dikeyse elle `window.scrollBy` ile
// asıl sayfayı kaydırıp kutunun kendi (yanlış) davranışını `preventDefault` ile engelliyoruz;
// yatay/eğik hareket (deltaX baskınsa) olduğu gibi kutunun kendi yatay kaydırmasına bırakılıyor.
function handleTableWheel(e: React.WheelEvent) {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault()
    window.scrollBy({ top: e.deltaY, left: 0 })
  }
}

export interface BoardTableHandle {
  // "+ Yeni Ekle" butonu tıklandıktan sonra kullanıcıyı yeni (genelde listenin en altındaki)
  // satıra götürmek için — sayfa artık kendi kaydırmasını kullandığından (bkz. useVirtualRows'un
  // başındaki not) BoardView bu satırın nerede olduğunu bilemez, o yüzden bu imperative metot
  // BoardTable'ın kendi `rows` sırasına bakıp oraya kaydırıyor.
  scrollToRow: (rowId: string) => void
}

const BoardTable = forwardRef<
  BoardTableHandle,
  {
    board: Board
    rows: Row[]
    // Kullanıcının tarayıcıda kalıcı olarak kapattığı sütunlar (bkz. BoardView'daki
    // localStorage'a yazan ColumnVisibilityPopover) — yavaşlık şikayeti üzerine eklendi,
    // özellikle görsel sütunlar her satırda birer <img> yükleyip tabloyu ağırlaştırıyordu.
    hiddenColumnIds: Set<string>
    onAddProperty: (name: string, type: PropertyType) => void
    onDeleteProperty: (propertyId: string) => void
    onRenameProperty: (propertyId: string, name: string) => void
    onChangePropertyType: (propertyId: string, type: PropertyType) => void
    onResizeProperty: (propertyId: string, width: number) => void
    onRenameOption: (propertyId: string, optionId: string, label: string) => void
    onChangeOptionColor: (propertyId: string, optionId: string, colorIndex: number) => void
    onDeleteOption: (propertyId: string, optionId: string) => void
    onAddOption: (propertyId: string, label: string) => string
    onAddCriterion: (propertyId: string, name: string) => string
    onRenameCriterion: (propertyId: string, criterionId: string, name: string) => void
    onDeleteCriterion: (propertyId: string, criterionId: string) => void
    onUpdateCell: (rowId: string, propertyId: string, value: PropertyValue) => void
    onCreateRow: () => void
    onAddRowAfter: (rowId: string) => void
    onDuplicateRow: (rowId: string) => void
    onDeleteRow: (rowId: string) => void
    // Altı-noktalı tutamacın yanındaki göz ikonu — satırı tablo hücresi olarak değil, tam
    // detay penceresi (RowDetailModal, ana sayfadaki kart tıklamasıyla açılanın aynısı) olarak
    // görmek isteyen kullanıcı için ("o altı noktanın yanına ... detay penceresini görebileceğim
    // bi buton eklesene").
    onOpenDetail: (row: Row) => void
    // Toplu silme — seçim çubuğu tek bir onay soruyor (bkz. handleBulkDelete), bu yüzden
    // burası (tek satır silmenin aksine) kendi başına ayrıca sormuyor.
    onBulkDeleteRows: (rowIds: string[]) => Promise<void>
    onReorderProperties: (orderedPropertyIds: string[]) => void
    onSetCoverProperty: (propertyId: string | null) => void
    onSetTitleImageProperty: (propertyId: string | null) => void
    // TMDB'den doldur/yenile butonu — sadece bu tıklama anında TMDB'ye çıkar, ARGUS'un geri
    // kalanı internetsiz kalır. Sadece başlığa bakarak film/dizi olduğunu kendisi bulur.
    onFetchTmdb: (
      rowId: string,
    ) => Promise<{ ok: true; mediaType: 'movie' | 'tv'; filled: string[]; newEpisodes: number; newActors: number } | undefined>
  }
>(function BoardTable(
  {
    board,
    rows,
    hiddenColumnIds,
    onAddProperty,
    onDeleteProperty,
    onRenameProperty,
    onChangePropertyType,
    onResizeProperty,
    onRenameOption,
    onChangeOptionColor,
    onDeleteOption,
    onAddOption,
    onAddCriterion,
    onRenameCriterion,
    onDeleteCriterion,
    onUpdateCell,
    onCreateRow,
    onAddRowAfter,
    onDuplicateRow,
    onDeleteRow,
    onOpenDetail,
    onBulkDeleteRows,
    onReorderProperties,
    onSetCoverProperty,
    onSetTitleImageProperty,
    onFetchTmdb,
  },
  ref,
) {
  const { confirm, notify } = useToast()
  const [showAddCol, setShowAddCol] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ rowId: string; propertyId: string } | null>(null)
  // Çoklu seçim (bkz. satırın solundaki kutucuk + başlıktaki "tümünü seç") — satır listesi
  // her değiştiğinde (filtre/silme sonrası) artık orada olmayan id'ler otomatik düşer, aksi
  // halde "3 seçili" yazısı gerçekte var olmayan kayıtları sayabilirdi.
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [refreshingRowId, setRefreshingRowId] = useState<string | null>(null)
  const { episodes } = useEpisodes()

  async function handleRefreshClick(rowId: string) {
    setRefreshingRowId(rowId)
    try {
      const result = await onFetchTmdb(rowId)
      if (result) {
        const parts: string[] = []
        if (result.filled.length > 0) parts.push(`dolduruldu: ${result.filled.join(', ')}`)
        if (result.newEpisodes > 0) parts.push(`${result.newEpisodes} yeni bölüm`)
        if (result.newActors > 0) parts.push(`${result.newActors} yeni oyuncu`)
        notify(parts.length > 0 ? parts.join(' · ') : 'TMDB eşleşmesi bulundu ama eklenecek yeni bir şey yoktu.', 'success')
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "TMDB'den çekerken bir hata oluştu.", 'danger')
    } finally {
      setRefreshingRowId(null)
    }
  }

  // Satır listesi değişince (filtre, arama, silme...) artık listede olmayan id'ler seçimden
  // düşer — aksi halde "N seçili" gerçekte görünmeyen/var olmayan kayıtları sayabilirdi.
  useEffect(() => {
    setSelectedRowIds((prev) => {
      const rowIdSet = new Set(rows.map((r) => r.id))
      const next = new Set([...prev].filter((id) => rowIdSet.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [rows])

  function toggleSelectRow(rowId: string) {
    setSelectedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const allSelected = rows.length > 0 && selectedRowIds.size === rows.length
  function toggleSelectAll() {
    setSelectedRowIds(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }

  async function handleBulkDelete() {
    const ids = [...selectedRowIds]
    if (ids.length === 0) return
    const ok = await confirm({
      message: `${ids.length} kaydı silmek istediğine emin misin? Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
    })
    if (!ok) return
    setBulkDeleting(true)
    try {
      await onBulkDeleteRows(ids)
      setSelectedRowIds(new Set())
    } finally {
      setBulkDeleting(false)
    }
  }

  const addColRef = useRef<HTMLButtonElement>(null)
  const headerRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const cellRefs = useRef<Record<string, HTMLTableCellElement | null>>({})
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Başlık kendi ayrı sticky konteynerinde (bkz. aşağıdaki genel not). Yatay kaydırma çubuğu
  // görünür halde EN ALTTA, pencerenin altına yapışık dursun istendi ("sağa sola kaydırma
  // barı sayfanın altında olsun") — koca (binlerce satırlık) gövdenin kendi çubuğu orada
  // kullanışsız kalırdı (sayfanın gerçek en altında olurdu), o yüzden ayrı, ince, sticky bir
  // üçüncü şerit bu işi görüyor; içeriği görünmez ama tablo kadar geniş tek bir div. Üçü
  // (başlık/gövde/alt çubuk) JS ile senkronize — hangisi kaydırılırsa kaydırılsın diğer ikisi
  // de aynı konuma gelir. `syncing` sonsuz döngüyü önlüyor.
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const syncingScroll = useRef(false)

  function syncScrollLeft(source: HTMLDivElement) {
    if (syncingScroll.current) return
    syncingScroll.current = true
    const left = source.scrollLeft
    for (const el of [headerScrollRef.current, scrollContainerRef.current, bottomScrollRef.current]) {
      if (el && el !== source) el.scrollLeft = left
    }
    syncingScroll.current = false
  }

  const { liveWidth, startResize } = useColumnResize(onResizeProperty)
  const optionMaps = useMemo(() => buildOptionMaps(board.properties), [board.properties])
  const { start: visibleStart, end: visibleEnd } = useVirtualRows(scrollContainerRef, rows.length)
  const visibleRows = rows.slice(visibleStart, visibleEnd)

  useImperativeHandle(
    ref,
    () => ({
      scrollToRow(rowId: string) {
        const index = rows.findIndex((r) => r.id === rowId)
        if (index === -1 || !scrollContainerRef.current) return
        const rect = scrollContainerRef.current.getBoundingClientRect()
        const rowTop = rect.top + window.scrollY + index * ROW_HEIGHT
        // Sticky navbar (64px) + tablonun kendi sticky başlığı (37px) satırın üstünü
        // kapatmasın diye biraz pay bırakılıyor. `behavior: 'smooth'` bazı ortamlarda
        // (ör. otomatik/uzaktan kontrollü tarayıcılarda) sessizce hiç kaydırmıyor —
        // güvenilir olsun diye anlık (varsayılan) kaydırma kullanılıyor.
        window.scrollTo(0, Math.max(0, rowTop - 64 - ROW_HEIGHT - 16))
      },
    }),
    [rows],
  )

  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const otherProps = board.properties.filter((p) => p.id !== board.titlePropertyId && !hiddenColumnIds.has(p.id))

  // Başlığı dolu olan her kayıtta TMDB butonu gösterilir — yeni eklenmiş, başka hiçbir
  // alanı doldurulmamış bir kayıtta bile ilk çekimi bu tetikleyebilsin diye (film/dizi
  // ayrımını TMDB'nin kendisi, gerekirse karışık aramayla, buluyor).
  function hasTitle(row: Row) {
    if (!titleProp) return false
    const v = row.values[titleProp.id]
    return typeof v === 'string' ? v.trim().length > 0 : Boolean(v)
  }
  const menuProp = board.properties.find((p) => p.id === menuFor)
  const editingProp = editingCell ? board.properties.find((p) => p.id === editingCell.propertyId) : null
  const editingRow = editingCell ? rows.find((r) => r.id === editingCell.rowId) : null

  function colWidth(p: PropertyDef, fallback: number) {
    if (liveWidth?.id === p.id) return liveWidth.width
    return p.width ?? fallback
  }

  // Alt kaydırma çubuğunun kaydırılabilir "içi" tablonun gerçek toplam genişliği kadar
  // olmalı ki kaydırma aralığı doğru olsun — colgroup'u üreten aynı genişliklerden toplanıyor,
  // DOM'dan ölçmeye gerek yok (sütun genişlikleri zaten sabit piksel değerler).
  const tableWidth =
    HANDLE_COLUMN_WIDTH +
    (titleProp ? colWidth(titleProp, TITLE_DEFAULT_WIDTH) : 0) +
    otherProps.reduce((sum, p) => sum + colWidth(p, DEFAULT_COLUMN_WIDTH), 0) +
    ACTIONS_COLUMN_WIDTH

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      return
    }
    const ids = otherProps.map((p) => p.id)
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(targetId)
    setDraggedId(null)
    if (from === -1 || to === -1) return
    ids.splice(from, 1)
    ids.splice(to, 0, draggedId)
    onReorderProperties(titleProp ? [titleProp.id, ...ids] : ids)
  }

  function headerCell(p: PropertyDef, fallback: number, reorderable: boolean) {
    return (
      <th
        key={p.id}
        draggable={reorderable}
        onDragStart={reorderable ? () => setDraggedId(p.id) : undefined}
        onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
        onDrop={reorderable ? () => handleDrop(p.id) : undefined}
        className={`bg-neutral-900 relative px-3 py-2 ${reorderable ? 'cursor-grab' : ''} ${
          draggedId === p.id ? 'opacity-40' : ''
        }`}
      >
        <span
          ref={(el) => {
            headerRefs.current[p.id] = el
          }}
          role="button"
          tabIndex={0}
          onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
          className="block truncate cursor-pointer hover:text-neutral-200"
          title={reorderable ? 'Sütun ayarları için tıkla, taşımak için sürükle' : 'Sütun ayarları için tıkla'}
        >
          {p.name}
        </span>
        <div
          onMouseDown={(e) => startResize(e, p.id, colWidth(p, fallback))}
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-sky-500/50"
        />
      </th>
    )
  }

  // Başlık ve gövde artık iki ayrı <table> (bkz. aşağıdaki genel not) — sütun genişlikleri
  // ikisinde de birebir aynı olmalı ki hizalı görünsünler, o yüzden tek yerden üretiliyor.
  function renderColgroup() {
    return (
      <colgroup>
        <col style={{ width: HANDLE_COLUMN_WIDTH }} />
        {titleProp && <col style={{ width: colWidth(titleProp, TITLE_DEFAULT_WIDTH) }} />}
        {otherProps.map((p) => (
          <col key={p.id} style={{ width: colWidth(p, DEFAULT_COLUMN_WIDTH) }} />
        ))}
        <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
      </colgroup>
    )
  }

  function dataCell(row: Row, p: PropertyDef) {
    const key = `${row.id}:${p.id}`
    if (p.type === 'checkbox') {
      return (
        <td
          key={p.id}
          onClick={() => onUpdateCell(row.id, p.id, !row.values[p.id])}
          className="px-3 overflow-hidden cursor-pointer border-r border-neutral-800"
        >
          <div className="h-9 flex items-center overflow-hidden">
            <Cell property={p} value={row.values[p.id]} optionMaps={optionMaps} />
          </div>
        </td>
      )
    }
    const isEditingThis = editingCell?.rowId === row.id && editingCell.propertyId === p.id
    if (isEditingThis && INLINE_TYPES.has(p.type)) {
      return (
        <td key={p.id} className="px-1 border-r border-neutral-800">
          <InlineValueEditor
            property={p}
            value={row.values[p.id]}
            onCommit={(v) => onUpdateCell(row.id, p.id, v)}
            onDone={() => setEditingCell(null)}
          />
        </td>
      )
    }
    return (
      <td
        key={p.id}
        ref={(el) => {
          cellRefs.current[key] = el
        }}
        onClick={() => setEditingCell({ rowId: row.id, propertyId: p.id })}
        className="px-3 overflow-hidden cursor-pointer hover:bg-neutral-800/40 border-r border-neutral-800"
      >
        <div className="h-9 flex items-center overflow-hidden">
          <Cell property={p} value={row.values[p.id]} optionMaps={optionMaps} />
        </div>
      </td>
    )
  }

  const totalColumns = 1 + (titleProp ? 1 : 0) + otherProps.length + 1

  return (
    // Başlık, gövde ve alt kaydırma çubuğu ÜÇ AYRI yatay-kaydırmalı kutu, JS ile senkronize
    // (bkz. syncScrollLeft). Sebebi: tek bir kutuda hem `overflow-x-auto` (geniş tablolarda
    // yatay kaydırma için) hem de içindeki başlığın `position: sticky` ile PENCEREYE göre
    // yapışması aynı anda mümkün değil — CSS'te bir eksende (x) 'visible' dışında bir değer
    // verilince tarayıcılar diğer ekseni (y) de bir "kaydırma kutusu" gibi ele alıyor, bu da
    // sticky'nin artık pencereye değil o (yüksekliği sınırsız, hiç kendi kaymayan) kutuya göre
    // hesaplanmasına sebep oluyor (gerçek, yaygın bilinen bir CSS kısıtı). Çözüm: sticky'yi
    // kendi ayrı, dar (tek satırlık) kutusuna taşımak — o kutunun KENDİSİ `overflow-x-auto`
    // olabilir, bu onun KENDİ sticky'liğini bozmaz. Kaydırma çubuğu görünür halde EN ALTTA,
    // pencerenin altına yapışık dursun istendiği için (koca gövdenin kendi çubuğu sayfanın
    // gerçek en altında kalıp ulaşılamaz olurdu) üçüncü, ince, sticky bir alt şerit bu işi
    // görüyor — başlığın kendi çubuğu artık gizli.
    <div>
      {selectedRowIds.size > 0 && (
        <div className="sticky top-16 z-20 flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-t-xl px-4 py-2.5">
          <p className="text-sm text-neutral-300">
            <span className="font-medium text-neutral-50">{selectedRowIds.size}</span> kayıt seçili
          </p>
          <button
            onClick={() => setSelectedRowIds(new Set())}
            className="text-sm text-neutral-400 hover:text-neutral-200 px-2 py-1 transition"
          >
            Seçimi Temizle
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
          >
            <TrashIcon />
            {bulkDeleting ? 'Siliniyor...' : 'Seçilenleri Sil'}
          </button>
        </div>
      )}
      <div
        ref={headerScrollRef}
        onScroll={(e) => syncScrollLeft(e.currentTarget)}
        onWheel={handleTableWheel}
        className={`sticky z-10 overflow-x-auto no-scrollbar bg-neutral-900 border border-neutral-800 ${
          selectedRowIds.size > 0 ? 'top-[104px] border-t-0' : 'top-16 rounded-t-xl'
        }`}
      >
        <table className="w-full text-sm text-left" style={{ tableLayout: 'fixed' }}>
          {renderColgroup()}
          <thead className="text-neutral-400 text-xs uppercase">
            <tr>
              <th className="bg-neutral-900 px-2.5">
                <Checkbox
                  checked={allSelected}
                  indeterminate={selectedRowIds.size > 0 && !allSelected}
                  onChange={toggleSelectAll}
                  label="Tümünü seç"
                />
              </th>
              {titleProp && headerCell(titleProp, TITLE_DEFAULT_WIDTH, false)}
              {otherProps.map((p) => headerCell(p, DEFAULT_COLUMN_WIDTH, true))}
              <th className="bg-neutral-900 px-2 py-2 text-right">
                <button
                  ref={addColRef}
                  onClick={() => setShowAddCol((v) => !v)}
                  title="Sütun ekle"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-50 text-base leading-none transition"
                >
                  +
                </button>
              </th>
            </tr>
          </thead>
        </table>
      </div>
      <div
        ref={scrollContainerRef}
        onScroll={(e) => syncScrollLeft(e.currentTarget)}
        onWheel={handleTableWheel}
        className="overflow-x-auto no-scrollbar border-x border-t-0 border-neutral-800"
      >
        <table className="w-full text-sm text-left" style={{ tableLayout: 'fixed' }}>
          {renderColgroup()}
          <tbody>
          {visibleStart > 0 && (
            <tr aria-hidden style={{ height: visibleStart * ROW_HEIGHT }}>
              <td colSpan={totalColumns} />
            </tr>
          )}
          {visibleRows.map((row) => {
            const isSelected = selectedRowIds.has(row.id)
            return (
            <tr key={row.id} className={`group border-t border-neutral-800 hover:bg-neutral-900/60 ${isSelected ? 'bg-sky-500/5' : ''}`}>
              <td className="px-1.5">
                <div className="h-9 flex items-center gap-1">
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleSelectRow(row.id)}
                    label="Satırı seç"
                    className={selectedRowIds.size > 0 || isSelected ? '' : 'opacity-0 group-hover:opacity-100'}
                  />
                  <RowMenu
                    hasTitle={hasTitle(row)}
                    hasEpisodes={Boolean(episodes[row.id])}
                    refreshing={refreshingRowId === row.id}
                    onFetchTmdb={() => handleRefreshClick(row.id)}
                    onAddRow={() => onAddRowAfter(row.id)}
                    onDuplicate={() => onDuplicateRow(row.id)}
                    onDelete={() => onDeleteRow(row.id)}
                  />
                  <button
                    onClick={() => onOpenDetail(row)}
                    title="Detayı Gör"
                    className="h-7 w-7 flex items-center justify-center rounded-md text-neutral-600 hover:text-neutral-200 hover:bg-neutral-800 transition opacity-0 group-hover:opacity-100"
                  >
                    <EyeIcon />
                  </button>
                </div>
              </td>
              {titleProp &&
                (() => {
                  const key = `${row.id}:${titleProp.id}`
                  const isEditingThis = editingCell?.rowId === row.id && editingCell.propertyId === titleProp.id
                  if (isEditingThis && INLINE_TYPES.has(titleProp.type)) {
                    return (
                      <td key={titleProp.id} className="px-1 border-r border-neutral-800">
                        <InlineValueEditor
                          property={titleProp}
                          value={row.values[titleProp.id]}
                          onCommit={(v) => onUpdateCell(row.id, titleProp.id, v)}
                          onDone={() => setEditingCell(null)}
                        />
                      </td>
                    )
                  }
                  return (
                    <td
                      ref={(el) => {
                        cellRefs.current[key] = el
                      }}
                      onClick={() => setEditingCell({ rowId: row.id, propertyId: titleProp.id })}
                      className="px-3 text-neutral-100 font-medium overflow-hidden cursor-pointer hover:bg-neutral-800/40 border-r border-neutral-800"
                    >
                      <div className="h-9 flex items-center overflow-hidden">
                        <span className="block truncate">{titleText(titleProp, row.values[titleProp.id])}</span>
                      </div>
                    </td>
                  )
                })()}
              {otherProps.map((p) => dataCell(row, p))}
              <td />
            </tr>
            )
          })}
          {visibleEnd < rows.length && (
            <tr aria-hidden style={{ height: (rows.length - visibleEnd) * ROW_HEIGHT }}>
              <td colSpan={totalColumns} />
            </tr>
          )}
          <tr className="border-t border-neutral-800 hover:bg-neutral-900/60 cursor-pointer" onClick={onCreateRow}>
            <td colSpan={otherProps.length + 3} className="px-3">
              <div className="h-9 flex items-center text-neutral-500">+ Yeni Ekle</div>
            </td>
          </tr>
        </tbody>
        </table>
      </div>

      {/* Görünür yatay kaydırma çubuğu — pencerenin altına yapışık, tablo görünürken hep
          erişilebilir kalır. İçeriği (aşağıdaki boş div) sadece kaydırma aralığını doğru
          vermek için tablo genişliğinde; kendisi görünmez, sadece tarayıcının kendi çubuğu
          görünür. */}
      <div
        ref={bottomScrollRef}
        onScroll={(e) => syncScrollLeft(e.currentTarget)}
        onWheel={handleTableWheel}
        className="sticky bottom-0 z-10 overflow-x-auto bg-neutral-900 border-x border-b border-neutral-800 rounded-b-xl"
        style={{ height: 14 }}
      >
        <div style={{ width: tableWidth, height: 1 }} />
      </div>

      {showAddCol && (
        <AddPropertyPopover
          anchorRef={addColRef}
          onClose={() => setShowAddCol(false)}
          onSubmit={(name, type) => {
            onAddProperty(name, type)
            setShowAddCol(false)
          }}
        />
      )}

      {menuProp && (
        <ColumnMenu
          anchorRef={{ current: headerRefs.current[menuProp.id] }}
          property={menuProp}
          canDelete={menuProp.id !== board.titlePropertyId}
          isCover={board.coverPropertyId === menuProp.id}
          isTitleImage={board.titleImagePropertyId === menuProp.id}
          onClose={() => setMenuFor(null)}
          onRename={(name) => onRenameProperty(menuProp.id, name)}
          onChangeType={(type) => onChangePropertyType(menuProp.id, type)}
          onDelete={() => {
            onDeleteProperty(menuProp.id)
            setMenuFor(null)
          }}
          onRenameOption={(optionId, label) => onRenameOption(menuProp.id, optionId, label)}
          onChangeOptionColor={(optionId, colorIndex) => onChangeOptionColor(menuProp.id, optionId, colorIndex)}
          onDeleteOption={(optionId) => onDeleteOption(menuProp.id, optionId)}
          onAddCriterion={(name) => onAddCriterion(menuProp.id, name)}
          onRenameCriterion={(criterionId, name) => onRenameCriterion(menuProp.id, criterionId, name)}
          onDeleteCriterion={(criterionId) => onDeleteCriterion(menuProp.id, criterionId)}
          onToggleCover={() => onSetCoverProperty(board.coverPropertyId === menuProp.id ? null : menuProp.id)}
          onToggleTitleImage={() =>
            onSetTitleImageProperty(board.titleImagePropertyId === menuProp.id ? null : menuProp.id)
          }
        />
      )}

      {editingCell && editingProp && editingRow && !INLINE_TYPES.has(editingProp.type) && editingProp.type !== 'checkbox' && (
        <CellEditor
          anchorRef={{ current: cellRefs.current[`${editingCell.rowId}:${editingCell.propertyId}`] }}
          property={editingProp}
          value={editingRow.values[editingProp.id]}
          onCommit={(v) => onUpdateCell(editingCell.rowId, editingCell.propertyId, v)}
          onClose={() => setEditingCell(null)}
          onAddOption={
            editingProp.type === 'select' || editingProp.type === 'multiselect'
              ? (label) => onAddOption(editingProp.id, label)
              : undefined
          }
          onAddCriterion={editingProp.type === 'rating' ? (name) => onAddCriterion(editingProp.id, name) : undefined}
        />
      )}
    </div>
  )
})

export default BoardTable
