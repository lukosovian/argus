import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { STATUS_DEFS, resolveRole, resolveStatusOption, rolesForType, rolesOfProperty, type RoleKey, type StatusKey } from '../lib/roles'
import { createPortal } from 'react-dom'
import type { Board, PropertyDef, PropertyValue, Row, SelectOption } from '../types'
import type { PropertyType } from '../types'
import { titleText, ratingAverage, DEFAULT_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from '../types'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { formatStamp, summarizeEntry, type HistoryEntry } from '../lib/history'
import OptionBadge from './OptionBadge'
import Checkbox from './Checkbox'
import AddPropertyPopover from './AddPropertyPopover'
import ColumnMenu from './ColumnMenu'
import CellEditor from './CellEditor'
import InlineValueEditor from './InlineValueEditor'
import { entryEnd, formatEntry } from '../lib/dateRange'
import { isoDate, tt } from '../lib/i18n'
import Icon from './Icon'
import { isModalOpen, isPopoverOpen, isTypingTarget } from './table/keys'
import { cellToText, parseClipboardGrid, rememberCopy } from './table/clipboard'
import WatchedButton from './table/WatchedButton'

const TITLE_DEFAULT_WIDTH = 220
const ACTIONS_COLUMN_WIDTH = 44
// "Eklendi" / "Düzenlendi" sütunu (G7)
const ADDED_COLUMN_WIDTH = 124

// "3 gün önce" — kaydın eklenme / değişme zamanı
function relativeAgo(ms: number): string {
  const now = new Date()
  const d = new Date(ms)
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day(now) - day(d)) / 86400000)
  if (days <= 0) {
    const mins = Math.max(0, Math.round((now.getTime() - ms) / 60000))
    if (mins < 1) return tt('az önce')
    if (mins < 60) return tt('{0} dk önce', mins)
    return tt('bugün')
  }
  if (days === 1) return tt('dün')
  if (days < 7) return tt('{0} gün önce', days)
  if (days < 30) return tt('{0} hafta önce', Math.floor(days / 7))
  if (days < 365) return tt('{0} ay önce', Math.max(1, Math.floor(days / 30)))
  return tt('{0} yıl önce', Math.floor(days / 365))
}
// Artık çoklu-seçim kutucuğu + altı-noktalı menü tutamacı + "Detayı Gör" göz ikonunu bir arada
// barındırıyor (bkz. aşağıdaki RowMenu ve seçim çubuğu notları) — önceden sadece tutamaç vardı,
// 40px yetiyordu, sonra kutucuk eklenince 64'e çıktı, göz ikonu için bir tık daha genişletildi.
// Sol altta sabit duran "en üste / en alta" düğmeleri (BoardView › ScrollEndsButtons) bu kontrollerin
// üstüne biniyordu; kullanıcı "biraz sağa alırsan düzelir" dedi — solda 44px boşluk (HANDLE_PAD_LEFT).
const HANDLE_PAD_LEFT = 44
const HANDLE_COLUMN_WIDTH = 92 + HANDLE_PAD_LEFT - 6
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
// Satırın TMDB'den güncellendiğini gösteren katman: güncellenirken soldan sağa tekrar tekrar geçen mavi
// ışık hüzmesi ('beam'), bitince satırın bir an maviye ('done') ya da hata olduysa kırmızıya ('fail')
// parlayıp sönmesi. Animasyonlar index.css'te (argus-row-beam / argus-row-done).
function RowActivity({ mode, width }: { mode: 'beam' | 'done' | 'fail'; width: number }) {
  if (mode === 'beam') {
    return (
      <div className="pointer-events-none absolute left-0 top-0 h-full overflow-hidden" style={{ width, background: 'rgba(0,192,250,0.06)' }}>
        <div
          className="absolute top-0 h-full"
          style={{
            width: '35%',
            background: 'linear-gradient(90deg, rgba(0,192,250,0) 0%, rgba(0,192,250,0.28) 55%, rgba(125,220,255,0.45) 80%, rgba(0,192,250,0) 100%)',
            animation: 'argus-row-beam 1.1s ease-in-out infinite',
          }}
        />
        <div className="absolute left-0 bottom-0 h-px w-full" style={{ background: 'rgba(0,192,250,0.6)' }} />
      </div>
    )
  }
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 h-full"
      style={{
        width,
        background: mode === 'done' ? 'rgba(0,192,250,0.18)' : 'rgba(244,63,94,0.18)',
        animation: 'argus-row-done 1.3s ease-out forwards',
      }}
    />
  )
}

function RowMenu({
  board,
  row,
  hasTitle,
  refreshing,
  onFetchTmdb,
  onAddRow,
  onDuplicate,
  onDelete,
  onShowHistory,
  duplicate = false,
  onDragRow,
  onDragRowEnd,
}: {
  board: Board
  row: Row
  hasTitle: boolean
  // Mükerrer olabilir (bkz. Sağlık Kontrolü) — tutamacın yerinde küçük kırmızı nokta.
  duplicate?: boolean
  refreshing: boolean
  onFetchTmdb: () => void
  onAddRow: () => void
  onDuplicate: () => void
  onDelete: () => void
  // "Tüm geçmişi" — arşiv geçmişi penceresini bu kayda süzülmüş açar.
  onShowHistory?: () => void
  // Altı noktadan tutup sürükleyerek satırı taşıma (tıklayınca yine menü açılır).
  onDragRow?: (e: React.DragEvent<HTMLButtonElement>) => void
  onDragRowEnd?: () => void
}) {
  const [open, setOpen] = useState(false)
  // Menünün altında: ne zaman eklendi, en son ne zaman değişti ve son değişiklikler (arşiv geçmişinden).
  // Kullanıcı "ne zaman eklediğimi görmek istiyorum, altı noktaya basınca altta yazsın" dedi.
  const [recent, setRecent] = useState<HistoryEntry[] | null>(null)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.resolve()
      .then(() => api.getRowHistory(board.id, row.id))
      .then((r) => !cancelled && setRecent(r.entries))
      .catch(() => !cancelled && setRecent([]))
    return () => {
      cancelled = true
    }
  }, [open, board.id, row.id])
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function handleToggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen((v) => !v)
  }

  // Menü her zaman tutamacın ALTINA açılıyordu — ekranın en altındaki satırlarda alt seçenekler
  // (Çoğalt, Sil) ekranın dışında kalıp görünmüyordu. Menü çizildikten sonra gerçek yüksekliği
  // ölçülüp altta yer yoksa tutamacın ÜSTÜNE açılıyor (tarayıcı ekrana basmadan önce, titremeden).
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const h = menuRef.current.offsetHeight
    const below = rect.bottom + 4
    const top = below + h > window.innerHeight - 8 ? Math.max(8, rect.top - h - 4) : below
    const left = Math.min(rect.left, window.innerWidth - menuRef.current.offsetWidth - 8)
    setMenuPos((p) => (p && p.top === top && p.left === left ? p : { top, left }))
  }, [open])

  return (
    <div className="relative">
      {/* Kullanıcı "mükerrer kayıtların soluna, altı noktanın oralara kırmızı küçük bir yuvarlak koy" dedi.
          Satırın üstüne gelince tutamaç görünsün diye nokta kayboluyor. */}
      {duplicate && !open && (
        <span
          title={tt('Mükerrer olabilir — Sağlık Kontrolü\'nden birleştirebilirsin')}
          className="absolute inset-0 flex items-center justify-center group-hover:opacity-0 transition pointer-events-none"
        >
          <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]" />
        </span>
      )}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        draggable={Boolean(onDragRow)}
        onDragStart={onDragRow}
        onDragEnd={onDragRowEnd}
        title={onDragRow ? tt('Satır ayarları için tıkla, taşımak için sürükle') : tt('Satır ayarları')}
        className={`h-7 w-7 flex items-center justify-center rounded-md text-neutral-600 hover:text-neutral-200 hover:bg-neutral-800 transition ${onDragRow ? 'cursor-grab active:cursor-grabbing' : ''} ${
          open ? 'opacity-100 bg-neutral-800 text-neutral-200' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
        }`}
        aria-label={tt('Satır ayarları')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <DragHandleIcon />
      </button>
      {open &&
        menuPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div
              ref={menuRef}
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-40 w-72 bg-neutral-900 border border-neutral-800 rounded-xl py-1 shadow-lg"
            >
              {hasTitle && (
                <button
                  onClick={() => {
                    setOpen(false)
                    onFetchTmdb()
                  }}
                  disabled={refreshing}
                  title={tt('TMDB\'den güncelle: boş bilgileri doldurur, dizilerde yeni bölümleri de getirir')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition disabled:opacity-50"
                >
                  <RefreshIcon spinning={refreshing} />
                  {refreshing ? tt('Çekiliyor...') : tt('Güncelle')}
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
                {tt('Altına Satır Ekle')}
              </button>
              <button
                onClick={() => {
                  setOpen(false)
                  onDuplicate()
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition"
              >
                <CopyIcon />
                {tt('Çoğalt')}
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
                {tt('Sil')}
              </button>
              <div className="mt-1 border-t border-neutral-800 px-3 pt-2 pb-1.5 space-y-1 text-[11px] text-neutral-500">
                <p>
                  {tt('Eklendi:')}{' '}<span className="text-neutral-300">{row.createdAt ? formatStamp(row.createdAt) : '—'}</span>
                </p>
                {row.updatedAt && row.createdAt && row.updatedAt - row.createdAt > 60_000 && (
                  <p>
                    {tt('Son değişiklik:')}{' '}<span className="text-neutral-300">{formatStamp(row.updatedAt)}</span>
                  </p>
                )}
                {recent === null ? (
                  <p className="text-neutral-600">{tt('Değişiklikler yükleniyor...')}</p>
                ) : (
                  (() => {
                    const list = recent.filter((e) => e.type === 'update').slice(0, 3)
                    return list.length > 0 ? (
                      <div className="pt-1 space-y-0.5">
                        {list.map((e) => (
                          <p key={e.id} className="truncate" title={summarizeEntry(board, e)}>
                            <span className="text-neutral-600">{formatStamp(e.t, false)} · </span>
                            <span className="text-neutral-400">{summarizeEntry(board, e)}</span>
                          </p>
                        ))}
                      </div>
                    ) : null
                  })()
                )}
                {onShowHistory && (
                  <button
                    onClick={() => {
                      setOpen(false)
                      onShowHistory()
                    }}
                    className="pt-0.5 text-[#00c0fa] hover:underline"
                  >
                    {tt('Tüm geçmişi ›')}
                  </button>
                )}
              </div>
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
  // Yıl tam yazılır (kullanıcı "yılları tam yaz" dedi — "23.09.94" hangi yüzyıl belli değildi)
  return isoDate(iso)
}

// Bir hücreye sığmayan etiketleri/tarihleri kesmek yerine sığanları gösterip kalanı için "+N" yazar
// (kullanıcı: Tür'de "Anim…", İzleme Tarihi'nde "04.08.24, 05…" gibi yarım kalanlar). Her öğenin
// genişliği ilk çizimde ölçülüp saklanıyor; sütun genişliği değişince bu ölçülerle yeniden hesaplanıyor.
// Üzerine gelince hepsi (title) görünüyor.
const MORE_BADGE_WIDTH = 30

// "Rahat" görünümde çoklu değerler alta sarılır ama en fazla ROOMY_MAX_LINES satır; sığmayanlar "+N" olur
// (kullanıcı önce "+2 olmasın, hepsini göster" dedi, sonra 20 oyunculu bir satır bütün ekranı kaplayınca
// "birkaç satır + N olsun" dedi). Önce hepsi çizilip satırlara bakılıyor, sonra sığan kadarı + rozet bırakılıyor.
const ROOMY_MAX_LINES = 3
function WrapClamp({ items, title, gap }: { items: { key: string; node: React.ReactNode }[]; title: string; gap: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(items.length)
  const [width, setWidth] = useState(0)
  const sig = items.map((i) => i.key).join('|')
  // Değerler ya da genişlik değişince yeniden hepsiyle başla
  useLayoutEffect(() => setShown(items.length), [sig, width, items.length])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const kids = [...el.children] as HTMLElement[]
    if (!kids.length) return
    const tops = [...new Set(kids.map((k) => k.offsetTop))].sort((a, b) => a - b)
    if (tops.length <= ROOMY_MAX_LINES) return
    const limit = tops[ROOMY_MAX_LINES] // bu satırdan başlayan öğeler sığmıyor
    const hasBadge = shown < items.length
    const itemKids = hasBadge ? kids.slice(0, -1) : kids
    const fit = itemKids.filter((k) => k.offsetTop < limit).length
    // Rozete yer açmak için bir öğe daha bırak
    const next = Math.max(1, Math.min(shown, fit) - 1)
    if (next < shown) setShown(next)
  })
  const rest = items.length - shown
  return (
    <div ref={ref} title={rest > 0 ? title : undefined} className={`flex flex-wrap ${gap} min-w-0 w-full`}>
      {items.slice(0, shown).map((i) => (
        <span key={i.key} className="max-w-full">
          {i.node}
        </span>
      ))}
      {rest > 0 && <span className="text-[11px] text-neutral-400 bg-neutral-800 border border-neutral-700 rounded-full px-1.5 py-0.5 leading-none self-center">+{rest}</span>}
    </div>
  )
}
function FitRow({ items, title }: { items: { key: string; node: React.ReactNode }[]; title: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const widths = useRef<number[]>([])
  const [visible, setVisible] = useState(items.length)
  const itemsKey = items.map((i) => i.key).join('|')

  useLayoutEffect(() => {
    setVisible(items.length)
    widths.current = []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    function measure() {
      if (!el) return
      if (widths.current.length !== items.length) {
        const kids = Array.from(el.querySelectorAll<HTMLElement>('[data-fit]'))
        if (kids.length !== items.length) return
        widths.current = kids.map((k) => k.offsetWidth + 4)
      }
      const avail = el.clientWidth
      let used = 0
      let n = 0
      for (let i = 0; i < widths.current.length; i++) {
        const rest = i < widths.current.length - 1 ? MORE_BADGE_WIDTH : 0
        if (used + widths.current[i] + rest > avail) break
        used += widths.current[i]
        n++
      }
      setVisible(Math.max(1, n))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, visible === items.length])

  const hidden = items.length - visible
  return (
    <div ref={ref} className="flex flex-nowrap items-center gap-1 overflow-hidden min-w-0 w-full" title={title}>
      {items.slice(0, visible).map((i, idx) => (
        // Sığmayanlar varken ilk öğe gerekirse kısalıyor (kırpılıyor) ki "+N" hep görünür kalsın.
        <span key={i.key} data-fit className={`flex ${hidden > 0 && idx === 0 ? 'min-w-0 shrink overflow-hidden' : 'shrink-0'}`}>
          {i.node}
        </span>
      ))}
      {hidden > 0 && (
        <span className="shrink-0 text-[11px] leading-none px-1.5 py-1 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
          +{hidden}
        </span>
      )}
    </div>
  )
}

function Cell({
  property,
  value,
  optionMaps,
  roomy = false,
}: {
  property: PropertyDef
  value: PropertyValue
  optionMaps: OptionMaps
  // "Rahat" satır sıklığında görseller biraz daha büyük; çoklu değerler "+N" yerine alta sarılarak hepsi,
  // yazılar kesilmeden görünür (kullanıcı "rahat görünümde +2 olmasın, satırı alta doğru genişleterek tüm
  // bilgileri göstersin" dedi). Satır yüksekliği içeriğe göre büyür (bkz. useVirtualRows).
  roomy?: boolean
}) {
  if (property.type === 'rating') {
    const avg = ratingAverage(value, property)
    if (avg === null) return null
    return <span className="text-neutral-300 inline-flex items-center gap-1"><Icon name="star" className="h-3.5 w-3.5 text-amber-400" />{avg.toFixed(1)}</span>
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
    // En yeni tarih önce — sığmazsa eskiler "+N"e girer. Aralıklar "09.08.24 → 12.08.24" (bkz. lib/dateRange.ts).
    const dates = (Array.isArray(value) ? (value as string[]) : []).slice().sort((a, b) => (entryEnd(a) < entryEnd(b) ? 1 : -1))
    // Aynı gün iki kez izlendiyse (v1.26, H4) tek tarih "×2" diye yazılır
    const counted = new Map<string, number>()
    for (const d of dates.map((x) => formatEntry(x, (y) => formatDateShort(y) ?? y)).filter(Boolean)) counted.set(d, (counted.get(d) ?? 0) + 1)
    const formatted = [...counted].map(([d, n]) => (n > 1 ? `${d} ×${n}` : d))
    if (formatted.length === 0) return null
    if (roomy)
      return (
        <WrapClamp
          title={formatted.join(', ')}
          gap="gap-x-1.5 gap-y-0.5"
          items={formatted.map((d, i) => ({
            key: `${d}-${i}`,
            node: (
              <span className="text-neutral-300 whitespace-nowrap">
                {d}
                {i < formatted.length - 1 ? ',' : ''}
              </span>
            ),
          }))}
        />
      )
    return (
      <FitRow
        title={formatted.join(', ')}
        items={formatted.map((d, i) => ({ key: `${d}-${i}`, node: <span className="text-neutral-300">{d}{i < formatted.length - 1 ? ',' : ''}</span> }))}
      />
    )
  }

  if (property.type === 'select') {
    const opt = optionMaps.get(property.id)?.get(value as string)
    return opt ? <OptionBadge label={opt.label} colorIndex={opt.colorIndex} image={opt.image} wrap={roomy} /> : null
  }

  if (property.type === 'multiselect') {
    const ids = Array.isArray(value) ? value : []
    const propMap = optionMaps.get(property.id)
    const opts = ids.map((id) => propMap?.get(id)).filter(Boolean)
    if (opts.length === 0) return null
    if (roomy)
      return (
        <WrapClamp
          title={opts.map((o) => o!.label).join(', ')}
          gap="gap-1"
          items={opts.map((o) => ({ key: o!.id, node: <OptionBadge label={o!.label} colorIndex={o!.colorIndex} image={o!.image} wrap /> }))}
        />
      )
    return (
      <FitRow
        title={opts.map((o) => o!.label).join(', ')}
        items={opts.map((o) => ({ key: o!.id, node: <OptionBadge label={o!.label} colorIndex={o!.colorIndex} image={o!.image} /> }))}
      />
    )
  }

  if (property.type === 'image') {
    return <img src={value as string} alt="" loading="lazy" className={`${roomy ? 'h-12 w-8' : 'h-8 w-6'} object-cover rounded`} />
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
        {tt('Link')}
      </a>
    )
  }

  // Rahatta yazı kesilmez, alta geçer (uzun metin — ör. Sinopsis — en fazla 4 satır)
  // Rahatta yazı alta geçer ama en fazla 3 satır (fazlası … — üzerine gelince tamamı)
  if (roomy) return <span title={String(value)} className="break-words line-clamp-3 text-neutral-300">{String(value)}</span>
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
// Satır yüksekliği = hücre içeriği + 1px'lik üst çizgi (border-t). "Sıkı" h-9 (36px), "Rahat" h-14 (56px) —
// sanal liste (useVirtualRows) ve satıra kaydırma bu değerle hesaplandığı için ikisi hep eşleşmeli.
const ROW_HEIGHT = 37
const ROW_HEIGHT_ROOMY = 57
// Gruplamada her grubun başlık satırı (h-9 + üst çizgi)
const GROUP_HEADER_HEIGHT = 37
const OVERSCAN = 10
const EMPTY_GROUP = '__bos__'

// Sanal listedeki bir öğe: gruplama açıkken grupların başlık satırları da kayıtlarla aynı listede (v1.25).
type TableItem = { kind: 'group'; key: string; optionId: string | null; count: number } | { kind: 'row'; row: Row }

// offsets[i] = i. satırın tablodaki üst kenarı (offsets[n] = toplam yükseklik). "Sıkı"da her satır aynı
// yükseklikte; "Rahat"ta satırlar içeriğe göre büyüdüğü için ölçülen gerçek yükseklikler kullanılıyor.
function lowerBound(arr: number[], v: number) {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < v) lo = mid + 1
    else hi = mid
  }
  return lo
}

function useVirtualRows(containerRef: React.RefObject<HTMLDivElement | null>, offsets: number[]) {
  const rowCount = offsets.length - 1
  const [range, setRange] = useState({ start: 0, end: Math.min(rowCount, 60) })

  useEffect(() => {
    function update() {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const visibleTop = Math.max(0, -rect.top)
      const visibleBottom = visibleTop + window.innerHeight
      const start = Math.max(0, lowerBound(offsets, visibleTop + 1) - 1 - OVERSCAN)
      const end = Math.min(rowCount, lowerBound(offsets, visibleBottom) + OVERSCAN)
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [containerRef, offsets, rowCount])

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
    // Toplu seçenek silme (ör. Oyuncular sütunundaki birikmiş onlarca oyuncu etiketini tek tek
    // silmek yerine seçip topluca kaldırmak) — kullanıcı "sütun bazlı silme ekle... toplu olarak
    // onları silebilme gelsin" dedi.
    onDeleteOptions: (propertyId: string, optionIds: string[]) => void
    // Bir sütunun değerini TÜM satırlarda boşaltır — herhangi bir sütun tipi için (sadece
    // Seçim/Çoklu Seçim değil), kullanıcı "genel olarak olsun... bi sütunun altındaki
    // satırlardakileri komple silebilmek" dedi.
    onClearColumn: (propertyId: string, propertyName: string) => void
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
    // Altı nokta menüsündeki "Tüm geçmişi" — arşiv geçmişini bu kayda süzülmüş açar.
    onShowRowHistory?: (row: Row) => void
    // Toplu silme — seçim çubuğu tek bir onay soruyor (bkz. handleBulkDelete), bu yüzden
    // burası (tek satır silmenin aksine) kendi başına ayrıca sormuyor.
    onBulkDeleteRows: (rowIds: string[]) => Promise<void>
    // Seçim değişince (Genel Güncelleme menüsündeki "Seçili kayıtlar" için) ve seçim çubuğundaki
    // "Seçilenleri Güncelle" / "Bölümlerini Yenile" — onayı BoardView soruyor.
    onSelectionChange?: (rowIds: string[]) => void
    onBulkUpdateRows?: (rowIds: string[], mode: 'fill' | 'bolum') => void
    bulkUpdating?: boolean
    onReorderProperties: (orderedPropertyIds: string[]) => void
    onSetCoverProperty: (propertyId: string | null) => void
    onSetTitleImageProperty: (propertyId: string | null) => void
    onSetPropertyRole: (propertyId: string, role: RoleKey | null) => void
    onSetStatusOption: (key: StatusKey, optionId: string) => void
    // Satır sıklığı: 'siki' (eskisi gibi) ya da 'rahat' (daha yüksek satır, daha büyük poster).
    density?: 'rahat' | 'siki'
    // Mükerrer olabilecek kayıtlar (sunucudaki mükerrer kontrolü) — altı noktanın yerinde kırmızı nokta.
    duplicateRowIds?: Set<string>
    // Altı noktadan tutup sürükleyip başka bir satırın üstüne bırakınca: satırı oraya taşı.
    onMoveRow?: (rowId: string, targetRowId: string) => void
    // Dizilerde bölümlere girilmiş en son izleme tarihi (satır id → YYYY-MM-DD). Kullanıcı "arşiv tablosundaki
    // izleme tarihi diziden herhangi bir bölüme girilmiş en son tarihi alsın" dedi — İzleme Tarihi sütunu
    // dizide bu tarihi (ya da kaydın kendi tarihi daha yeniyse onu) tek tarih olarak gösterir.
    lastEpisodeDates?: Map<string, string>
    // Bu Seçim sütununa göre gruplanır (v1.25): grup başlıkları seçeneklerin sırasıyla, "(boş)" en sonda
    groupByProp?: PropertyDef | null
    // Alt özet satırı (kayıt sayısı, ortalamalar, boşlar) görünsün mü
    showFooter?: boolean
    onHideFooter?: () => void
    // Seçim çubuğundaki "İzledim…" (Y20): seçili kayıtlara bu tarih eklenir, İzlendi olur
    onMarkWatched?: (rowIds: string[], entry: string) => void
    // Yapıştırma (Y19): etkin hücreden başlayarak hücrelere gelen yazılar; `overflow`: tabloya sığmayan hücre sayısı
    onPasteCells?: (cells: { rowId: string; propertyId: string; text: string }[], overflow: number) => void
    // "Eklendi" / "Düzenlendi" sütunu (G7): kaydın eklenme ya da son değişme zamanı ("3 gün önce")
    addedColumn?: 'created' | 'updated' | null
    onHideAddedColumn?: () => void
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
    onDeleteOptions,
    onClearColumn,
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
    onShowRowHistory,
    onBulkDeleteRows,
    onSelectionChange,
    onBulkUpdateRows,
    bulkUpdating,
    onReorderProperties,
    onSetCoverProperty,
    onSetTitleImageProperty,
    onSetPropertyRole,
    onSetStatusOption,
    onFetchTmdb,
    density = 'siki',
    duplicateRowIds,
    onMoveRow,
    lastEpisodeDates,
    groupByProp = null,
    showFooter = false,
    onHideFooter,
    onMarkWatched,
    onPasteCells,
    addedColumn = null,
    onHideAddedColumn,
  },
  ref,
) {
  // "Geri al" bildirimi sonradan tıklandığında eski kopyası (eski satır değerleriyle) değil en güncel hali çağrılsın
  const onUpdateCellRef = useRef(onUpdateCell)
  useEffect(() => {
    onUpdateCellRef.current = onUpdateCell
  }, [onUpdateCell])
  const roomy = density === 'rahat'
  const watchDateProp = resolveRole(board, 'izlemeTarihi')
  // Dizide Süre bir bölümün süresi (v1.24): tabloda "45 dk/bölüm" diye yazılır
  const sureRoleProp = resolveRole(board, 'sure')
  const kategoriRoleProp = resolveRole(board, 'kategori')
  const isSeriesRow = (row: Row) => /dizi|series|tv/i.test(kategoriRoleProp?.options?.find((o) => o.id === row.values[kategoriRoleProp.id])?.label ?? '')
  const rowH = roomy ? ROW_HEIGHT_ROOMY : ROW_HEIGHT
  // Rahat: en az h-14, içerik sığmazsa satır büyür
  const cellH = roomy ? 'min-h-14 py-1' : 'h-9'
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
  // Satır sürükleme (sütun sürüklemeden ayrı): sürüklenen satır ve üstünde bulunulan satır — hedefin
  // üstünde/altında mavi çizgi çıkıyor (aşağı taşınıyorsa altına, yukarı taşınıyorsa üstüne düşer).
  const [dragRowId, setDragRowId] = useState<string | null>(null)
  const [dropRowId, setDropRowId] = useState<string | null>(null)
  const rowIndexById = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows])
  // TMDB'den güncellenen satırlar (aynı anda birkaçı olabilir) ve az önce bitenler — satırın üstünde
  // ışık hüzmesi / bitince kısa bir parlama (bkz. RowActivity).
  const [refreshingRowIds, setRefreshingRowIds] = useState<Set<string>>(new Set())
  const [doneRow, setDoneRow] = useState<{ id: string; ok: boolean; n: number } | null>(null)
  const flashN = useRef(0)

  async function handleRefreshClick(rowId: string) {
    setRefreshingRowIds((s) => new Set(s).add(rowId))
    // 'none': "Hangisi?" penceresinde vazgeçildi — satır parlamasın
    let ok: boolean | 'none' = false
    try {
      const result = await onFetchTmdb(rowId)
      ok = result ? true : 'none'
      if (result) {
        const parts: string[] = []
        if (result.filled.length > 0) parts.push(`dolduruldu: ${result.filled.join(', ')}`)
        if (result.newEpisodes > 0) parts.push(tt('{0} yeni bölüm', result.newEpisodes))
        if (result.newActors > 0) parts.push(tt('{0} yeni oyuncu', result.newActors))
        notify(parts.length > 0 ? parts.join(' · ') : tt('TMDB eşleşmesi bulundu ama eklenecek yeni bir şey yoktu.'), 'success')
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('TMDB\'den çekerken bir hata oluştu.'), 'danger')
    } finally {
      setRefreshingRowIds((s) => {
        const next = new Set(s)
        next.delete(rowId)
        return next
      })
      const n = ++flashN.current
      if (ok !== 'none') setDoneRow({ id: rowId, ok, n })
      setTimeout(() => setDoneRow((d) => (d && d.n === n ? null : d)), 1400)
    }
  }

  // Birden fazla satır seçiliyken seçili satırlardan birinde yapılan hücre değişikliği seçili HEPSİNE
  // uygulanır — kullanıcı "eklediğim birkaç içeriği seçip durumlarını aynı anda İzlendi yapacağım" dedi.
  // Tek değerli sütunlarda aynı değer yazılır; çoklu değerlerde (Tür, Oyuncular, İzleme Tarihi…) her
  // kaydın kendi listesine sadece eklenen eklenir, çıkarılan çıkarılır (diğerlerinin kendi değerleri
  // silinmesin). Başlık (ad) sütunu hariç — her kaydın adı kendine.
  function updateCellForSelection(rowId: string, propertyId: string, value: PropertyValue) {
    const many = selectedRowIds.size > 1 && selectedRowIds.has(rowId) && propertyId !== titleProp?.id
    if (!many) {
      onUpdateCell(rowId, propertyId, value)
      return
    }
    // Geri al için seçili kayıtların değişiklikten ÖNCEKİ değerleri. Çoklu seçim penceresi her tıklamada kaydettiği için
    // aynı sütunda art arda yapılan değişiklikler tek bir "oturum" sayılır; geri al hepsinden önceki hale döndürür.
    const now = Date.now()
    let session = bulkEditSession.current
    const fresh = !session || session.propertyId !== propertyId || now - lastBulkNotice.current > 4000
    if (fresh || !session) {
      session = { propertyId, prev: new Map() }
      bulkEditSession.current = session
    }
    for (const id of selectedRowIds) {
      if (!session.prev.has(id)) session.prev.set(id, rows.find((r) => r.id === id)?.values[propertyId])
    }
    const before = rows.find((r) => r.id === rowId)?.values[propertyId]
    const prev: unknown[] = Array.isArray(before) ? before : []
    const added = Array.isArray(value) ? (value as unknown[]).filter((x) => !prev.includes(x)) : []
    const removed = Array.isArray(value) ? prev.filter((x) => !(value as unknown[]).includes(x)) : []
    for (const id of selectedRowIds) {
      if (id === rowId || !Array.isArray(value)) {
        onUpdateCell(id, propertyId, value)
        continue
      }
      const theirs = rows.find((r) => r.id === id)?.values[propertyId]
      const cur: unknown[] = Array.isArray(theirs) ? theirs : []
      const next = [...cur.filter((x) => !removed.includes(x)), ...added.filter((x) => !cur.includes(x))]
      onUpdateCell(id, propertyId, next as PropertyValue)
    }
    // Çoklu seçim penceresi her tıklamada kaydediyor — bildirim her seferinde tekrar çıkmasın.
    if (fresh) {
      const name = board.properties.find((p) => p.id === propertyId)?.name ?? tt('Değişiklik')
      const snapshot = session
      notify(tt('{0} seçili {1} kayda uygulandı.', name, selectedRowIds.size), 'success', {
        action: {
          label: tt('Geri al'),
          onClick: () => {
            if (bulkEditSession.current === snapshot) bulkEditSession.current = null
            for (const [id, v] of snapshot.prev) onUpdateCellRef.current(id, snapshot.propertyId, (v ?? null) as PropertyValue)
          },
        },
      })
    }
    lastBulkNotice.current = now
  }
  const lastBulkNotice = useRef(0)
  const bulkEditSession = useRef<{ propertyId: string; prev: Map<string, PropertyValue | undefined> } | null>(null)

  // Satır listesi değişince (filtre, arama, silme...) artık listede olmayan id'ler seçimden
  // düşer — aksi halde "N seçili" gerçekte görünmeyen/var olmayan kayıtları sayabilirdi.
  useEffect(() => {
    setSelectedRowIds((prev) => {
      const rowIdSet = new Set(rows.map((r) => r.id))
      const next = new Set([...prev].filter((id) => rowIdSet.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [rows])

  useEffect(() => {
    onSelectionChange?.([...selectedRowIds])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRowIds])

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
      message: tt('{0} kaydı silmek istediğine emin misin? Yanlışlıkla silersen bildirimdeki "Geri al" ile ya da Geçmiş\'ten geri getirebilirsin.', ids.length),
      confirmLabel: tt('Sil'),
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
  const footerScrollRef = useRef<HTMLDivElement>(null)
  const syncingScroll = useRef(false)

  function syncScrollLeft(source: HTMLDivElement) {
    if (syncingScroll.current) return
    syncingScroll.current = true
    const left = source.scrollLeft
    for (const el of [headerScrollRef.current, scrollContainerRef.current, bottomScrollRef.current, footerScrollRef.current]) {
      if (el && el !== source) el.scrollLeft = left
    }
    syncingScroll.current = false
  }

  const { liveWidth, startResize } = useColumnResize(onResizeProperty)
  const optionMaps = useMemo(() => buildOptionMaps(board.properties), [board.properties])
  // Rahat görünümde satır yükseklikleri ölçülüyor (ResizeObserver) — ölçülmemiş satırlar için tahmini yükseklik
  const measured = useRef(new Map<string, number>())
  const [measureVersion, setMeasureVersion] = useState(0)
  const observerRef = useRef<ResizeObserver | null>(null)
  const observedEls = useRef(new Map<string, Element>())
  useEffect(() => {
    if (!roomy) return
    const ro = new ResizeObserver((entries) => {
      let changed = false
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.rowId
        if (!id) continue
        const h = Math.round((e.target as HTMLElement).getBoundingClientRect().height)
        if (h > 0 && measured.current.get(id) !== h) {
          measured.current.set(id, h)
          changed = true
        }
      }
      if (changed) setMeasureVersion((v) => v + 1)
    })
    observerRef.current = ro
    for (const el of observedEls.current.values()) ro.observe(el)
    return () => {
      ro.disconnect()
      observerRef.current = null
    }
  }, [roomy])
  function observeRow(id: string, el: HTMLTableRowElement | null) {
    const prev = observedEls.current.get(id)
    if (prev === el) return
    if (prev) observerRef.current?.unobserve(prev)
    if (el) {
      observedEls.current.set(id, el)
      observerRef.current?.observe(el)
    } else observedEls.current.delete(id)
  }
  // Gruplama (v1.25): kapatılan gruplar bu tarayıcıda, arşiv ve sütun başına hatırlanır.
  const groupProp = groupByProp && groupByProp.type === 'select' ? groupByProp : null
  const collapsedKey = groupProp ? `argus_table_collapsed_${board.id}_${groupProp.id}` : null
  const [collapsed, setCollapsed] = useState<{ key: string | null; set: Set<string> }>({ key: null, set: new Set() })
  if (collapsed.key !== collapsedKey) {
    let set = new Set<string>()
    try {
      const raw = collapsedKey ? localStorage.getItem(collapsedKey) : null
      if (raw) set = new Set(JSON.parse(raw) as string[])
    } catch {
      // okunamazsa hepsi açık
    }
    setCollapsed({ key: collapsedKey, set })
  }
  function toggleGroup(key: string) {
    const next = new Set(collapsed.set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCollapsed({ key: collapsedKey, set: next })
    try {
      if (collapsedKey) localStorage.setItem(collapsedKey, JSON.stringify([...next]))
    } catch {
      // saklanamasa da bu oturumda çalışır
    }
  }
  // Satırın hangi grupta olduğu
  function groupKeyOf(row: Row): string {
    if (!groupProp) return ''
    const v = row.values[groupProp.id]
    return typeof v === 'string' && v && optionMaps.get(groupProp.id)?.has(v) ? v : EMPTY_GROUP
  }
  const items = useMemo<TableItem[]>(() => {
    if (!groupProp) return rows.map((row) => ({ kind: 'row' as const, row }))
    const buckets = new Map<string, Row[]>()
    for (const o of groupProp.options ?? []) buckets.set(o.id, [])
    const empty: Row[] = []
    for (const r of rows) {
      const v = r.values[groupProp.id]
      const b = typeof v === 'string' ? buckets.get(v) : undefined
      if (b) b.push(r)
      else empty.push(r)
    }
    const out: TableItem[] = []
    const add = (key: string, optionId: string | null, list: Row[]) => {
      if (list.length === 0) return
      out.push({ kind: 'group', key, optionId, count: list.length })
      if (!collapsed.set.has(key)) for (const row of list) out.push({ kind: 'row', row })
    }
    for (const [id, list] of buckets) add(id, id, list)
    add(EMPTY_GROUP, null, empty)
    return out
  }, [rows, groupProp, collapsed.set])
  // Klavyeyle gezinilen (görünen) kayıtlar, ekrandaki sırayla
  const navRows = useMemo(() => items.flatMap((it) => (it.kind === 'row' ? [it.row] : [])), [items])
  const itemIndexByRowId = useMemo(() => {
    const m = new Map<string, number>()
    items.forEach((it, i) => it.kind === 'row' && m.set(it.row.id, i))
    return m
  }, [items])

  const offsets = useMemo(() => {
    const cum = new Array<number>(items.length + 1)
    cum[0] = 0
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      cum[i + 1] = cum[i] + (it.kind === 'group' ? GROUP_HEADER_HEIGHT : roomy ? (measured.current.get(it.row.id) ?? rowH) : rowH)
    }
    return cum
    // measureVersion: ölçümler değişince yeniden hesapla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, roomy, rowH, measureVersion])
  const { start: visibleStart, end: visibleEnd } = useVirtualRows(scrollContainerRef, offsets)
  const visibleItems = items.slice(visibleStart, visibleEnd)

  // Sayfayı bir öğenin (satırın) görüneceği yere kaydırır. `onlyIfHidden`: zaten görünüyorsa kıpırdama (klavye gezintisi).
  function scrollItemIntoView(index: number, onlyIfHidden: boolean) {
    const el = scrollContainerRef.current
    if (!el || index < 0) return
    const rect = el.getBoundingClientRect()
    const top = rect.top + window.scrollY + offsets[index]
    const bottom = rect.top + window.scrollY + offsets[index + 1]
    // Sticky navbar (64px) + tablonun kendi sticky başlığı (37px) (+ seçim çubuğu) satırın üstünü kapatmasın.
    const coverTop = 64 + 37 + (selectedRowIds.size > 0 ? 40 : 0) + 8
    // Altta: yatay kaydırma şeridi (14px) + özet satırı
    const coverBottom = 14 + (showFooter ? 30 : 0) + 8
    if (onlyIfHidden) {
      if (top < window.scrollY + coverTop) window.scrollTo(0, Math.max(0, top - coverTop))
      else if (bottom > window.scrollY + window.innerHeight - coverBottom) window.scrollTo(0, bottom - window.innerHeight + coverBottom)
      return
    }
    // `behavior: 'smooth'` bazı ortamlarda (ör. otomatik/uzaktan kontrollü tarayıcılarda) sessizce hiç
    // kaydırmıyor — güvenilir olsun diye anlık (varsayılan) kaydırma kullanılıyor.
    window.scrollTo(0, Math.max(0, top - 64 - rowH - 16))
  }

  // "+ Yeni Ekle" sonrası kaydırma: satır kapalı bir gruptaysa önce grup açılır, satır listede belirince kaydırılır.
  const [scrollTarget, setScrollTarget] = useState<string | null>(null)
  useEffect(() => {
    if (!scrollTarget) return
    const index = itemIndexByRowId.get(scrollTarget)
    if (index !== undefined) {
      scrollItemIntoView(index, false)
      setScrollTarget(null)
      return
    }
    const row = rows.find((r) => r.id === scrollTarget)
    if (!row) return
    const g = groupKeyOf(row)
    if (g && collapsed.set.has(g)) toggleGroup(g)
    else setScrollTarget(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget, itemIndexByRowId])

  useImperativeHandle(
    ref,
    () => ({
      scrollToRow(rowId: string) {
        setScrollTarget(rowId)
      },
    }),
    [],
  )

  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const otherProps = board.properties.filter((p) => p.id !== board.titlePropertyId && !hiddenColumnIds.has(p.id))
  // Adın solundaki küçük afiş: "Poster" görevindeki sütun, yoksa kapak görseli sütunu.
  const thumbProp =
    resolveRole(board, 'poster') ?? board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')

  // Başlığı dolu olan her kayıtta TMDB butonu gösterilir — yeni eklenmiş, başka hiçbir
  // alanı doldurulmamış bir kayıtta bile ilk çekimi bu tetikleyebilsin diye (film/dizi
  // ayrımını TMDB'nin kendisi, gerekirse karışık aramayla, buluyor).
  // Başlık boşsa Orjinal Adı da yeter — kullanıcı "orijinal adı kısmına yazınca da arama yapabilsin" dedi.
  const origPropForSearch = resolveRole(board, 'orjinalAdi')
  function hasTitle(row: Row) {
    for (const p of [titleProp, origPropForSearch]) {
      if (!p) continue
      const v = row.values[p.id]
      if (typeof v === 'string' ? v.trim().length > 0 : Boolean(v)) return true
    }
    return false
  }
  const menuProp = board.properties.find((p) => p.id === menuFor)
  const editingProp = editingCell ? board.properties.find((p) => p.id === editingCell.propertyId) : null
  const editingRow = editingCell ? rows.find((r) => r.id === editingCell.rowId) : null

  // ---- Klavyeyle gezinme (Notion'daki gibi, v1.25) ----
  // Bir hücreye tıklayınca o hücre "etkin" olur (mavi çerçeve); oklarla/Tab ile hücreler arasında gezilir, Enter
  // düzenleyiciyi açar (tıklamayla aynı), Esc çıkar. Hiçbir hücre etkin değilken oklar sayfayı eskisi gibi kaydırır.
  const [activeCell, setActiveCell] = useState<{ rowId: string; propertyId: string } | null>(null)
  const navByKey = useRef(false)
  const tableRootRef = useRef<HTMLDivElement>(null)
  const navCols = useMemo(
    () => [
      ...board.properties.filter((p) => p.id === board.titlePropertyId),
      ...board.properties.filter((p) => p.id !== board.titlePropertyId && !hiddenColumnIds.has(p.id)),
    ],
    [board.properties, board.titlePropertyId, hiddenColumnIds],
  )
  // Etkin hücrenin satırı listeden çıkarsa (filtre, silme, grup kapandı) etkinlik düşer
  if (activeCell && !itemIndexByRowId.has(activeCell.rowId)) setActiveCell(null)
  function activate(rowId: string, propertyId: string) {
    navByKey.current = false
    setActiveCell({ rowId, propertyId })
  }
  // Tablonun dışına (açılır menüler/pencereler hariç) tıklanınca etkin hücre bırakılır
  useEffect(() => {
    if (!activeCell) return
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null
      if (!t || tableRootRef.current?.contains(t) || t.closest('.fixed')) return
      setActiveCell(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [activeCell])
  const navRef = useRef<(e: KeyboardEvent) => void>(() => {})
  navRef.current = (e: KeyboardEvent) => {
    if (!activeCell || editingCell || menuFor || showAddCol) return
    // Ctrl+C (Y19): etkin hücrenin değeri panoya (Excel'e de yapıştırılabilen düz yazı). Sayfada seçili bir yazı varsa
    // tarayıcının kendi kopyalaması çalışır.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'c') {
      if (e.defaultPrevented || isTypingTarget(e.target) || isModalOpen()) return
      if (window.getSelection()?.toString()) return
      const row = navRows.find((x) => x.id === activeCell.rowId)
      const p = navCols.find((x) => x.id === activeCell.propertyId)
      if (!row || !p) return
      e.preventDefault()
      const text = cellToText(p, row.values[p.id])
      rememberCopy(text, p, row.values[p.id])
      const short = text.length > 40 ? text.slice(0, 40) + '…' : text
      navigator.clipboard
        ?.writeText(text)
        .then(() => notify(text ? tt('Kopyalandı: {0}', short) : tt('Boş hücre kopyalandı.')))
        .catch(() => notify(tt('Panoya kopyalanamadı.'), 'danger'))
      return
    }
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
    if (isTypingTarget(e.target) || isPopoverOpen() || isModalOpen()) return
    const r = navRows.findIndex((x) => x.id === activeCell.rowId)
    const c = navCols.findIndex((x) => x.id === activeCell.propertyId)
    if (r < 0 || c < 0) return
    let nr = r
    let nc = c
    switch (e.key) {
      case 'ArrowUp':
        nr = Math.max(0, r - 1)
        break
      case 'ArrowDown':
        nr = Math.min(navRows.length - 1, r + 1)
        break
      case 'ArrowLeft':
        nc = Math.max(0, c - 1)
        break
      case 'ArrowRight':
        nc = Math.min(navCols.length - 1, c + 1)
        break
      case 'Tab':
        if (e.shiftKey) {
          if (c > 0) nc = c - 1
          else if (r > 0) [nr, nc] = [r - 1, navCols.length - 1]
        } else if (c < navCols.length - 1) nc = c + 1
        else if (r < navRows.length - 1) [nr, nc] = [r + 1, 0]
        break
      case 'Enter': {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'BUTTON' || tag === 'A') return
        e.preventDefault()
        const p = navCols[c]
        const row = navRows[r]
        if (p.type === 'checkbox') updateCellForSelection(row.id, p.id, !row.values[p.id])
        else setEditingCell({ rowId: row.id, propertyId: p.id })
        return
      }
      case 'Escape':
        e.preventDefault()
        setActiveCell(null)
        return
      default:
        return
    }
    e.preventDefault()
    navByKey.current = true
    setActiveCell({ rowId: navRows[nr].id, propertyId: navCols[nc].id })
  }
  useEffect(() => {
    const on = (e: KeyboardEvent) => navRef.current(e)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  // Ctrl+V (Y19): etkin hücreden başlayarak yapıştırır. Excel'den birkaç satır/sütun gelirse alt alta / yan yana hücrelere
  // dağılır; tek bir değer yapıştırılırken etkin hücre seçili kayıtlardan biriyse seçili hepsine yazılır.
  const pasteRef = useRef<(e: ClipboardEvent) => void>(() => {})
  pasteRef.current = (e: ClipboardEvent) => {
    if (!onPasteCells || !activeCell || editingCell || menuFor || showAddCol) return
    if (isTypingTarget(e.target) || isModalOpen() || isPopoverOpen()) return
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text) return
    e.preventDefault()
    const grid = parseClipboardGrid(text)
    // Excel kopyaladığı bloğun sonuna boş bir satır ekler
    while (grid.length > 1 && grid[grid.length - 1].every((c) => c === '')) grid.pop()
    const r0 = navRows.findIndex((x) => x.id === activeCell.rowId)
    const c0 = navCols.findIndex((x) => x.id === activeCell.propertyId)
    if (r0 < 0 || c0 < 0 || grid.length === 0) return
    const cells: { rowId: string; propertyId: string; text: string }[] = []
    let overflow = 0
    if (grid.length === 1 && grid[0].length === 1 && selectedRowIds.size > 1 && selectedRowIds.has(activeCell.rowId)) {
      for (const r of navRows) if (selectedRowIds.has(r.id)) cells.push({ rowId: r.id, propertyId: navCols[c0].id, text: grid[0][0] })
    } else {
      grid.forEach((line, i) =>
        line.forEach((cellText, j) => {
          const r = navRows[r0 + i]
          const p = navCols[c0 + j]
          if (r && p) cells.push({ rowId: r.id, propertyId: p.id, text: cellText })
          else overflow++
        }),
      )
    }
    if (cells.length) onPasteCells(cells, overflow)
  }
  useEffect(() => {
    const on = (e: ClipboardEvent) => pasteRef.current(e)
    window.addEventListener('paste', on)
    return () => window.removeEventListener('paste', on)
  }, [])
  // Klavyeyle gidilen hücre ekranda görünsün: önce dikey (sanal liste o satırı çizsin), sonra yatay.
  useEffect(() => {
    if (!activeCell || !navByKey.current) return
    scrollItemIntoView(itemIndexByRowId.get(activeCell.rowId) ?? -1, true)
    const id = requestAnimationFrame(() => {
      const box = scrollContainerRef.current
      const td = cellRefs.current[`${activeCell.rowId}:${activeCell.propertyId}`]
      if (!box || !td) return
      // Soldaki sabit sütunlar (seçim + başlık) hücrenin üstüne binmesin
      const stickyW = HANDLE_COLUMN_WIDTH + (titleProp && activeCell.propertyId !== titleProp.id ? colWidth(titleProp, TITLE_DEFAULT_WIDTH) : 0)
      const left = td.offsetLeft
      const right = left + td.offsetWidth
      if (activeCell.propertyId === titleProp?.id) return
      if (left - box.scrollLeft < stickyW) box.scrollLeft = Math.max(0, left - stickyW)
      else if (right - box.scrollLeft > box.clientWidth) box.scrollLeft = right - box.clientWidth
      syncScrollLeft(box)
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCell])
  const ACTIVE_CELL = 'outline outline-2 -outline-offset-2 outline-[#00c0fa]/80'
  const isActive = (rowId: string, propertyId: string) => activeCell?.rowId === rowId && activeCell.propertyId === propertyId

  // ---- Alt özet satırı (v1.25): o an görünen (filtrelenmiş) kayıtlar için ----
  const footerStats = useMemo(() => {
    if (!showFooter) return null
    const stats = new Map<string, { empty: number; text?: string; title?: string }>()
    const isEmpty = (v: PropertyValue) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    for (const p of navCols) {
      let empty = 0
      let sum = 0
      let n = 0
      for (const r of rows) {
        const v = r.values[p.id]
        if (p.type === 'rating') {
          const avg = ratingAverage(v, p)
          if (avg === null) empty++
          else {
            sum += avg
            n++
          }
          continue
        }
        if (p.type === 'checkbox') {
          if (v) n++
          continue
        }
        if (isEmpty(v)) {
          empty++
          continue
        }
        if (p.type === 'number' && typeof v === 'number') {
          // Süre: dizilerde bölüm başına olduğu için toplama katılmıyor
          if (p.id === sureRoleProp?.id && isSeriesRow(r)) continue
          sum += v
          n++
        }
      }
      const s: { empty: number; text?: string; title?: string } = { empty }
      if (p.type === 'checkbox') s.text = tt('{0} işaretli', n)
      else if (p.id === sureRoleProp?.id && p.type === 'number' && n > 0) {
        s.text = tt('toplam {0} sa', (sum / 60).toLocaleString('tr', { maximumFractionDigits: 1 }))
        s.title = tt('Dizilerde süre bölüm başına olduğu için dizi kayıtları toplama katılmadı')
      } else if ((p.type === 'number' || p.type === 'rating') && n > 0) s.text = tt('ort. {0}', (sum / n).toLocaleString('tr', { maximumFractionDigits: p.type === 'rating' ? 1 : 2 }))
      stats.set(p.id, s)
    }
    return stats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFooter, rows, navCols])

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
    (addedColumn ? ADDED_COLUMN_WIDTH : 0) +
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

  // Solda sabit kalan sütunlar (seçim/tutamaç + başlık): sağa kaydırınca hangi satırda olduğun kaybolmasın
  // diye yerinde duruyorlar. Arka planları dolu olmalı ki altından kayan hücreler görünmesin.
  const STICKY_TITLE_STYLE = { position: 'sticky' as const, left: HANDLE_COLUMN_WIDTH, zIndex: 2 }
  const STICKY_HANDLE_STYLE = { position: 'sticky' as const, left: 0, zIndex: 2, paddingLeft: HANDLE_PAD_LEFT }

  function headerCell(p: PropertyDef, fallback: number, reorderable: boolean, sticky = false) {
    return (
      <th
        key={p.id}
        style={sticky ? STICKY_TITLE_STYLE : undefined}
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
          // Klavyeyle de açılsın (Tab ile gelip Enter / Boşluk)
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setMenuFor(menuFor === p.id ? null : p.id)
            }
          }}
          aria-haspopup="menu"
          aria-expanded={menuFor === p.id}
          className="block truncate cursor-pointer hover:text-neutral-200 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#00c0fa]/60"
          title={reorderable ? tt('Sütun ayarları için tıkla, taşımak için sürükle') : tt('Sütun ayarları için tıkla')}
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
        {addedColumn && <col style={{ width: ADDED_COLUMN_WIDTH }} />}
        <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
      </colgroup>
    )
  }

  // Dizinin İzleme Tarihi hücresi: bölümlere girilmiş en son tarih (kaydın kendi tarihi daha yeniyse o).
  // Bölüm tarihi olmayan kayıtlarda (filmler) null — normal hücre çizilir.
  function seriesWatchDate(row: Row, p: PropertyDef) {
    if (p.id === sureRoleProp?.id) {
      const v = row.values[p.id]
      return typeof v === 'number' && v > 0 && isSeriesRow(row) ? (
        <span className="text-neutral-300 whitespace-nowrap" title={tt('Bir bölümün ortalama süresi')}>
          {tt('{0} dk/bölüm', v)}
        </span>
      ) : null
    }
    if (p.id !== watchDateProp?.id) return null
    const ep = lastEpisodeDates?.get(row.id)
    if (!ep) return null
    const v = row.values[p.id]
    const own = (Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []).map(entryEnd).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    const latest = [ep, ...own].sort().at(-1)!
    return (
      <span className="text-neutral-300 whitespace-nowrap" title={tt('Bölümlere girilmiş en son izleme tarihi')}>
        {formatDateShort(latest) ?? latest}
      </span>
    )
  }

  function dataCell(row: Row, p: PropertyDef) {
    const key = `${row.id}:${p.id}`
    if (p.type === 'checkbox') {
      return (
        <td
          key={p.id}
          ref={(el) => {
            cellRefs.current[key] = el
          }}
          onClick={() => {
            activate(row.id, p.id)
            updateCellForSelection(row.id, p.id, !row.values[p.id])
          }}
          className={`px-3 overflow-hidden cursor-pointer border-r border-neutral-800 ${isActive(row.id, p.id) ? ACTIVE_CELL : ''}`}
        >
          <div className={`${cellH} flex items-center overflow-hidden`}>
            <Cell property={p} value={row.values[p.id]} optionMaps={optionMaps} roomy={roomy} />
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
            onCommit={(v) => updateCellForSelection(row.id, p.id, v)}
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
        onClick={() => {
          activate(row.id, p.id)
          setEditingCell({ rowId: row.id, propertyId: p.id })
        }}
        className={`px-3 overflow-hidden cursor-pointer hover:bg-neutral-800/40 border-r border-neutral-800 ${isActive(row.id, p.id) ? ACTIVE_CELL : ''}`}
      >
        <div className={`${cellH} flex items-center overflow-hidden`}>
          {seriesWatchDate(row, p) ?? <Cell property={p} value={row.values[p.id]} optionMaps={optionMaps} roomy={roomy} />}
        </div>
      </td>
    )
  }

  const totalColumns = 1 + (titleProp ? 1 : 0) + otherProps.length + (addedColumn ? 1 : 0) + 1
  // Sabit sütunların dolu arka planı — satırın kendi hover/seçili rengine uyar.
  function stickyBg(selected: boolean) {
    return selected ? 'bg-neutral-900' : 'bg-neutral-950 group-hover:bg-neutral-900'
  }

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
    // data-table-busy: bir hücre düzenleyicisi ya da sütun menüsü açıkken BoardView'ın "/" ve "N" kısayolları susar
    <div ref={tableRootRef} data-table-busy={editingCell || menuFor || showAddCol ? '1' : undefined}>
      {selectedRowIds.size > 0 && (
        <div className="sticky top-16 z-20 flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-t-xl px-4 py-2.5">
          <p className="text-sm text-neutral-300">
            <span className="font-medium text-neutral-50">{selectedRowIds.size}</span>{' '}{tt('kayıt seçili')}
            {selectedRowIds.size > 1 && <span className="text-neutral-500">{' '}{tt('· seçili birinde bir hücreyi değiştirirsen hepsine uygulanır')}</span>}
          </p>
          <button
            onClick={() => setSelectedRowIds(new Set())}
            className="text-sm text-neutral-400 hover:text-neutral-200 px-2 py-1 transition"
          >
            {tt('Seçimi Temizle')}
          </button>
          {onMarkWatched && <WatchedButton count={selectedRowIds.size} onPick={(entry) => onMarkWatched([...selectedRowIds], entry)} />}
          {onBulkUpdateRows && (
            <>
              <button
                onClick={() => onBulkUpdateRows([...selectedRowIds], 'fill')}
                disabled={bulkUpdating}
                title={tt('Seçili kayıtları TMDB\'den güncelle (boş alanlar dolar, dizilerin bölümleri yenilenir)')}
                className="flex items-center gap-1.5 text-sm text-[#00c0fa] hover:bg-[#00c0fa]/10 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
              >
                <RefreshIcon />
                {tt('Seçilenleri Güncelle')}
              </button>
              <button
                onClick={() => onBulkUpdateRows([...selectedRowIds], 'bolum')}
                disabled={bulkUpdating}
                title={tt('Seçili dizilerin sadece sezon/bölüm listesini yenile')}
                className="text-sm text-neutral-300 hover:text-[#00c0fa] hover:bg-neutral-800 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
              >
                {tt('Bölümlerini Yenile')}
              </button>
            </>
          )}
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
          >
            <TrashIcon />
            {bulkDeleting ? tt('Siliniyor...') : tt('Seçilenleri Sil')}
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
              <th className="bg-neutral-900 px-2.5" style={STICKY_HANDLE_STYLE}>
                <Checkbox
                  checked={allSelected}
                  indeterminate={selectedRowIds.size > 0 && !allSelected}
                  onChange={toggleSelectAll}
                  label={tt('Tümünü seç')}
                />
              </th>
              {titleProp && headerCell(titleProp, TITLE_DEFAULT_WIDTH, false, true)}
              {otherProps.map((p) => headerCell(p, DEFAULT_COLUMN_WIDTH, true))}
              {addedColumn && (
                <th className="bg-neutral-900 px-3 py-2">
                  <span className="flex items-center gap-1">
                    <span className="truncate" title={tt('Otomatik: kaydın {0} zamanı', addedColumn === 'created' ? tt('eklenme') : tt('son değişme'))}>
                      {addedColumn === 'created' ? tt('Eklendi') : tt('Düzenlendi')}
                    </span>
                    {onHideAddedColumn && (
                      <button
                        onClick={onHideAddedColumn}
                        title={tt('Bu sütunu gizle (Sütunlar menüsünden yine açabilirsin)')}
                        className="ml-auto h-5 w-5 shrink-0 flex items-center justify-center rounded text-neutral-600 hover:text-neutral-200 hover:bg-neutral-800 normal-case"
                      >
                        ×
                      </button>
                    )}
                  </span>
                </th>
              )}
              <th className="bg-neutral-900 px-2 py-2 text-right">
                <button
                  ref={addColRef}
                  onClick={() => setShowAddCol((v) => !v)}
                  title={tt('Sütun ekle')}
                  aria-label={tt('Sütun ekle')}
                  aria-expanded={showAddCol}
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
            <tr aria-hidden style={{ height: offsets[visibleStart] }}>
              <td colSpan={totalColumns} />
            </tr>
          )}
          {visibleItems.map((item) => {
            if (item.kind === 'group') {
              const opt = item.optionId ? optionMaps.get(groupProp!.id)?.get(item.optionId) : undefined
              const isClosed = collapsed.set.has(item.key)
              return (
                <tr key={`g:${item.key}`} className="border-t border-neutral-800 bg-neutral-900/70 hover:bg-neutral-900 cursor-pointer" onClick={() => toggleGroup(item.key)}>
                  <td colSpan={totalColumns} className="p-0">
                    {/* Yatay kaydırınca grup adı solda kalsın */}
                    <div className="h-9 flex items-center gap-2 text-sm sticky left-0 w-max" style={{ paddingLeft: HANDLE_PAD_LEFT + 6 }}>
                      <span className={`text-neutral-500 text-xs transition-transform ${isClosed ? '-rotate-90' : ''}`}>▾</span>
                      {opt ? <OptionBadge label={opt.label} colorIndex={opt.colorIndex} image={opt.image} /> : <span className="text-neutral-400 italic">{tt('(boş)')}</span>}
                      <span className="text-xs text-neutral-500 tabular-nums">{item.count}</span>
                    </div>
                  </td>
                </tr>
              )
            }
            const row = item.row
            const isSelected = selectedRowIds.has(row.id)
            // Sürüklenirken bu satırın üstündeysek: aşağı taşınıyorsa altına, yukarı taşınıyorsa üstüne mavi çizgi.
            let dropLine = ''
            if (dragRowId && dropRowId === row.id && dragRowId !== row.id) {
              const down = rowIndexById.get(dragRowId)! < rowIndexById.get(row.id)!
              dropLine = down ? '[&>td]:shadow-[inset_0_-2px_0_#00c0fa]' : '[&>td]:shadow-[inset_0_2px_0_#00c0fa]'
            }
            return (
            <tr
              key={row.id}
              data-row-id={row.id}
              ref={roomy ? (el) => observeRow(row.id, el) : undefined}
              onDragOver={
                dragRowId
                  ? (e) => {
                      e.preventDefault()
                      if (dropRowId !== row.id) setDropRowId(row.id)
                    }
                  : undefined
              }
              onDrop={
                dragRowId
                  ? (e) => {
                      e.preventDefault()
                      const from = dragRowId
                      setDragRowId(null)
                      setDropRowId(null)
                      onMoveRow?.(from, row.id)
                    }
                  : undefined
              }
              className={`group border-t border-neutral-800 hover:bg-neutral-900 ${isSelected ? 'bg-sky-500/5' : ''} ${dragRowId === row.id ? 'opacity-40' : ''} ${dropLine}`}
            >
              <td
                className={`px-1.5 ${stickyBg(isSelected)}`}
                // Işık hüzmesi bu hücrenin içinden bütün satıra yayılıyor; sabit başlık hücresinin altında kalmasın diye bir kat üstte.
                style={refreshingRowIds.has(row.id) || doneRow?.id === row.id ? { ...STICKY_HANDLE_STYLE, zIndex: 3 } : STICKY_HANDLE_STYLE}
              >
                {(refreshingRowIds.has(row.id) || doneRow?.id === row.id) && (
                  <RowActivity
                    key={refreshingRowIds.has(row.id) ? 'beam' : `done-${doneRow?.n}`}
                    mode={refreshingRowIds.has(row.id) ? 'beam' : doneRow?.ok ? 'done' : 'fail'}
                    width={scrollContainerRef.current?.clientWidth ?? tableWidth}
                  />
                )}
                <div className={`${cellH} flex items-center gap-1`}>
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleSelectRow(row.id)}
                    label={tt('Satırı seç')}
                    className={selectedRowIds.size > 0 || isSelected ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}
                  />
                  <RowMenu
                    board={board}
                    row={row}
                    onShowHistory={onShowRowHistory ? () => onShowRowHistory(row) : undefined}
                    duplicate={duplicateRowIds?.has(row.id)}
                    onDragRow={
                      // Gruplamada satırlar gruplarına göre dizildiği için taşıma kapalı
                      onMoveRow && !groupProp
                        ? (e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', row.id)
                            const tr = e.currentTarget.closest('tr')
                            if (tr) e.dataTransfer.setDragImage(tr, 60, 18)
                            // Sürükleme başladıktan sonra (dragstart içinde DOM değişirse Chrome sürüklemeyi iptal edebiliyor)
                            setTimeout(() => setDragRowId(row.id), 0)
                          }
                        : undefined
                    }
                    onDragRowEnd={() => {
                      setDragRowId(null)
                      setDropRowId(null)
                    }}
                    hasTitle={hasTitle(row)}
                    refreshing={refreshingRowIds.has(row.id)}
                    onFetchTmdb={() => handleRefreshClick(row.id)}
                    onAddRow={() => onAddRowAfter(row.id)}
                    onDuplicate={() => onDuplicateRow(row.id)}
                    onDelete={() => onDeleteRow(row.id)}
                  />
                  <button
                    onClick={() => onOpenDetail(row)}
                    title={tt('Detayı Gör')}
                    aria-label={tt('Detayı Gör')}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-neutral-600 hover:text-neutral-200 hover:bg-neutral-800 transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
                      <td key={titleProp.id} className={`px-1 border-r border-neutral-800 ${stickyBg(isSelected)}`} style={STICKY_TITLE_STYLE}>
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
                      onClick={() => {
                        activate(row.id, titleProp.id)
                        setEditingCell({ rowId: row.id, propertyId: titleProp.id })
                      }}
                      style={STICKY_TITLE_STYLE}
                      className={`px-3 text-neutral-100 font-medium overflow-hidden cursor-pointer border-r border-neutral-800 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.45)] ${stickyBg(isSelected)} ${isActive(row.id, titleProp.id) ? ACTIVE_CELL : ''}`}
                    >
                      <div className={`${cellH} flex items-center gap-2.5 overflow-hidden`}>
                        {thumbProp && (
                          <span className={`${roomy ? 'h-12 w-8' : 'h-7 w-5'} shrink-0 rounded overflow-hidden bg-neutral-800`}>
                            {typeof row.values[thumbProp.id] === 'string' && row.values[thumbProp.id] ? (
                              <img src={row.values[thumbProp.id] as string} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ) : null}
                          </span>
                        )}
                        <span className={roomy ? 'break-words line-clamp-2' : 'block truncate'}>{titleText(titleProp, row.values[titleProp.id])}</span>
                      </div>
                    </td>
                  )
                })()}
              {otherProps.map((p) => dataCell(row, p))}
              {addedColumn && (
                <td className="px-3 border-r border-neutral-800 text-xs text-neutral-400 whitespace-nowrap overflow-hidden">
                  {(() => {
                    const ms = addedColumn === 'created' ? row.createdAt : row.updatedAt
                    return ms ? (
                      <span title={formatStamp(ms)} className={`${cellH} flex items-center`}>
                        {relativeAgo(ms)}
                      </span>
                    ) : null
                  })()}
                </td>
              )}
              <td />
            </tr>
            )
          })}
          {visibleEnd < items.length && (
            <tr aria-hidden style={{ height: offsets[items.length] - offsets[visibleEnd] }}>
              <td colSpan={totalColumns} />
            </tr>
          )}
          <tr className="border-t border-neutral-800 hover:bg-neutral-900/60 cursor-pointer" onClick={onCreateRow}>
            <td colSpan={otherProps.length + 3 + (addedColumn ? 1 : 0)} className="px-3" style={{ paddingLeft: HANDLE_PAD_LEFT + 6 }}>
              <div className="h-9 flex items-center text-neutral-500">{tt('+ Yeni Ekle')}</div>
            </td>
          </tr>
        </tbody>
        </table>
      </div>

      {/* Görünür yatay kaydırma çubuğu — pencerenin altına yapışık, tablo görünürken hep
          erişilebilir kalır. İçeriği (aşağıdaki boş div) sadece kaydırma aralığını doğru
          vermek için tablo genişliğinde; kendisi görünmez, sadece tarayıcının kendi çubuğu
          görünür. */}
      {footerStats && (
        <div
          ref={footerScrollRef}
          onScroll={(e) => syncScrollLeft(e.currentTarget)}
          onWheel={handleTableWheel}
          className="sticky bottom-[14px] z-10 overflow-x-auto no-scrollbar bg-neutral-900 border-x border-t border-neutral-800"
        >
          <table className="w-full text-[11px] text-left" style={{ tableLayout: 'fixed' }}>
            {renderColgroup()}
            <tbody>
              <tr className="text-neutral-500">
                <td className="bg-neutral-900" style={{ ...STICKY_HANDLE_STYLE, paddingLeft: HANDLE_PAD_LEFT - 4 }}>
                  <div className="h-7 flex items-center gap-1">
                    {onHideFooter && (
                      <button
                        onClick={onHideFooter}
                        title={tt('Özet satırını gizle (… menüsünden yine açabilirsin)')}
                        className="h-5 w-5 flex items-center justify-center rounded text-neutral-600 hover:text-neutral-200 hover:bg-neutral-800"
                      >
                        ×
                      </button>
                    )}
                    <span className="text-neutral-300 tabular-nums whitespace-nowrap">{tt('{0} kayıt', rows.length)}</span>
                  </div>
                </td>
                {navCols.map((p) => {
                  const s = footerStats.get(p.id)
                  const parts = [s?.text, s && s.empty > 0 ? tt('{0} boş', s.empty) : null].filter(Boolean)
                  return (
                    <td
                      key={p.id}
                      title={s?.title}
                      style={p.id === titleProp?.id ? STICKY_TITLE_STYLE : undefined}
                      className={`px-3 border-r border-neutral-800 truncate tabular-nums ${p.id === titleProp?.id ? 'bg-neutral-900' : ''}`}
                    >
                      <div className="h-7 flex items-center overflow-hidden whitespace-nowrap">
                        {parts.map((x, i) => (
                          <span key={i} className={i === 0 && s?.text ? 'text-neutral-300' : ''}>
                            {i > 0 ? ' · ' : ''}
                            {x}
                          </span>
                        ))}
                      </div>
                    </td>
                  )
                })}
                {addedColumn && <td className="border-r border-neutral-800" />}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

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
          onDeleteOptions={(optionIds) => onDeleteOptions(menuProp.id, optionIds)}
          onClearColumn={() => onClearColumn(menuProp.id, menuProp.name)}
          onAddCriterion={(name) => onAddCriterion(menuProp.id, name)}
          onRenameCriterion={(criterionId, name) => onRenameCriterion(menuProp.id, criterionId, name)}
          onDeleteCriterion={(criterionId) => onDeleteCriterion(menuProp.id, criterionId)}
          onToggleCover={() => onSetCoverProperty(board.coverPropertyId === menuProp.id ? null : menuProp.id)}
          onToggleTitleImage={() =>
            onSetTitleImageProperty(board.titleImagePropertyId === menuProp.id ? null : menuProp.id)
          }
          roleChoices={
            menuProp.id === board.titlePropertyId ? [] : rolesForType(menuProp.type).map((r) => ({ value: r.key, label: r.label }))
          }
          currentRole={rolesOfProperty(board, menuProp.id)[0] ?? ''}
          onChangeRole={(role) => onSetPropertyRole(menuProp.id, (role || null) as RoleKey | null)}
          statusChoices={
            resolveRole(board, 'durum')?.id === menuProp.id
              ? STATUS_DEFS.map((s) => ({ key: s.key, label: s.label, value: resolveStatusOption(board, s.key) ?? '' }))
              : undefined
          }
          onChangeStatusOption={(key, optionId) => onSetStatusOption(key as StatusKey, optionId)}
        />
      )}

      {editingCell && editingProp && editingRow && !INLINE_TYPES.has(editingProp.type) && editingProp.type !== 'checkbox' && (
        <CellEditor
          anchorRef={{ current: cellRefs.current[`${editingCell.rowId}:${editingCell.propertyId}`] }}
          property={editingProp}
          value={editingRow.values[editingProp.id]}
          onCommit={(v) => updateCellForSelection(editingCell.rowId, editingCell.propertyId, v)}
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
