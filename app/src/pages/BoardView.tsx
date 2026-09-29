import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useBoard } from '../hooks/useBoard'
import { useBoards } from '../hooks/useBoards'
import { useRows } from '../hooks/useRows'
import { api } from '../lib/api'
import {
  emptyRow,
  makeId,
  ratingAverage,
  titleText,
  type PropertyDef,
  type PropertyType,
  type PropertyValue,
  type Row,
  type Board,
} from '../types'
import MultiFilterEditor from '../components/MultiFilterEditor'
import { decodeConditions, encodeConditions, rowMatchesConditions, type FilterCondition } from '../lib/filters'
import { hasAnyImage } from '../lib/rowMeta'
import { ROLE_DEFS, assignRole, lockRolesForProperty, resolveRole, type RoleKey, type StatusKey } from '../lib/roles'
import BoardTable, { type BoardTableHandle } from '../components/BoardTable'
import RowDetailModal from '../components/RowDetailModal'
import HealthCheckModal from '../components/HealthCheckModal'
import TableGuideModal from '../components/TableGuideModal'
import DiscoverModal from '../components/DiscoverModal'
import TmdbFillAdviceModal from '../components/TmdbFillAdviceModal'
import HistoryModal from '../components/HistoryModal'
import BulkUpdatePanel, { type BulkLogEntry, type BulkState } from '../components/BulkUpdatePanel'
import { beginBusy } from '../lib/busy'
import ToggleSwitch from '../components/ToggleSwitch'
import Select from '../components/Select'
import { useToast } from '../hooks/useToast'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import { OPTION_COLORS } from '../types'
import { entryEnd } from '../lib/dateRange'
import {
  BulkRefreshIcon,
  ColumnsIcon,
  CompassIcon,
  FilterIcon,
  GearIcon,
  HealthIcon,
  HistoryIcon,
  InfoIcon,
  SearchIcon,
  SortIcon,
} from '../components/toolbarIcons'

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  )
}

// Doldurulan alan → o alanın sütun görevi (Genel Güncelleme öncesi "tablonda bu sütun yok" listesi için).
const FIELD_ROLE: Record<string, RoleKey> = {
  kategori: 'kategori',
  orjinalAdi: 'orjinalAdi',
  vizyonTarihi: 'vizyon',
  sinopsis: 'sinopsis',
  poster: 'poster',
  banner: 'banner',
  tur: 'tur',
  ulke: 'ulke',
  yonetmen: 'yonetmen',
  sure: 'sure',
  yasSiniri: 'yas',
  video: 'video',
  kadro: 'oyuncular',
}

// Tabloda sütunu hiç olmayan alanlar ("kullanma" diye bilerek kapatılmış görevler hariç).
// Bir alanın şu an yazdığı sütun (görevinden ya da adından) ve yazabileceği uygun sütunlar.
// Kullanıcı "adamın sütun adı farklı olabilir (ör. Sinopsis yerine Özet)" dedi — dişli menüsünde
// ve Genel Güncelleme öncesi pencerede hangi sütuna yazılacağı seçilebiliyor.
function fieldColumn(board: Board, key: string): PropertyDef | undefined {
  if (key === 'kapakAdi') {
    return (
      board.properties.find((p) => p.type === 'image' && p.id === board.titleImagePropertyId) ??
      board.properties.find((p) => p.type === 'image' && p.name.trim().toLocaleLowerCase('tr') === 'kapak adı')
    )
  }
  const role = FIELD_ROLE[key]
  return role ? resolveRole(board, role) : undefined
}

function fieldCandidates(board: Board, key: string): PropertyDef[] {
  const types: PropertyType[] = key === 'kapakAdi' ? ['image'] : (ROLE_DEFS.find((d) => d.key === FIELD_ROLE[key])?.types ?? [])
  return board.properties.filter((p) => p.id !== board.titlePropertyId && types.includes(p.type))
}

function missingFillColumns(board: Board): { key: string; label: string }[] {
  return FETCHABLE_FIELDS.filter((f) => {
    if (f.key === 'kapakAdi') {
      return !board.properties.some(
        (p) => p.type === 'image' && (p.id === board.titleImagePropertyId || p.name.trim().toLocaleLowerCase('tr') === 'kapak adı'),
      )
    }
    const role = FIELD_ROLE[f.key]
    if (!role || board.roles?.[role] === null) return false
    return !resolveRole(board, role)
  })
}

const FETCHABLE_FIELDS: { key: string; label: string }[] = [
  { key: 'kategori', label: 'Kategori' },
  { key: 'orjinalAdi', label: 'Orjinal Adı' },
  { key: 'vizyonTarihi', label: 'Vizyon Tarihi' },
  { key: 'sinopsis', label: 'Sinopsis' },
  { key: 'poster', label: 'Poster' },
  { key: 'banner', label: 'Banner' },
  { key: 'kapakAdi', label: 'Kapak Adı (logo)' },
  { key: 'tur', label: 'Tür' },
  { key: 'ulke', label: 'Ülke' },
  { key: 'yonetmen', label: 'Yönetmen' },
  { key: 'sure', label: 'Süre' },
  { key: 'yasSiniri', label: 'Yaş Sınırı' },
  { key: 'video', label: 'Fragman' },
  { key: 'sezonlar', label: 'Sezon/Bölüm listesi (dizi)' },
  { key: 'kadro', label: 'Oyuncular/Kadro' },
]

// "API eşitle" (tek satır 🔄 ve toplu "Genel Güncelleme") hangi alanları doldursun — kullanıcı
// kimi sütunu TMDB'nin hiç ellememesini isteyebilir (ör. elle özenle yazdığı bir Sinopsis'in
// yerine TMDB'ninkinin gelmesini istemeyebilir, ya da o sütunu hiç kullanmıyordur). Aynı
// localStorage deseni (bkz. ColumnVisibilityPopover): arşive özel, kalıcı.
// Her alanın ARGUS'ta nerede işe yaradığı — dişli menüsünde küçük açıklama olarak.
const FIELD_HINTS: Record<string, string> = {
  kategori: 'Film mi dizi mi — arama da daha isabetli olur',
  orjinalAdi: 'TMDB aramasında kullanılır',
  vizyonTarihi: 'Yıl, sıralama ve istatistikler',
  sinopsis: 'Detay penceresi, vitrin ve Ne İzlesem özeti',
  poster: 'Kartlar, Ne İzlesem ve detay penceresi',
  banner: 'Vitrin ve detay penceresinin büyük görseli',
  kapakAdi: 'Vitrinde ve detayda adın yerine çıkan logo',
  tur: 'Filtreler, otomatik satırlar, modlar, istatistikler',
  ulke: 'Filtreler, otomatik satırlar, istatistikler',
  yonetmen: 'Detay penceresi ve arama',
  sure: 'Detay, vitrin ve toplam izleme süresi',
  yasSiniri: 'Yaş sınırı rozeti',
  video: 'Vitrinde ve detayda oynayan fragman',
  sezonlar: 'Bölümler, bölüm işaretleme, Yeni Bölümler satırı',
  kadro: 'Oyuncu fotoğrafları, oyuncuya göre filtre',
}

// "API'den hangi alanlar çekilsin" (dişli). Kullanıcı "daha anlaşılır olsun, kullanıcıda olmayan
// sütunların yanında 'sende yok, ekle' olsun" dedi: her alanın ne işe yaradığı yazıyor, tabloda
// sütunu olmayanlarda tek tıkla ekleme var, hepsini açmak da tek tık.
function TmdbFieldsPopover({
  excludedKeys,
  onToggle,
  onOpenAll,
  board,
  onSetColumn,
  overwriteExisting,
  onToggleOverwrite,
}: {
  excludedKeys: Set<string>
  onToggle: (key: string) => void
  onOpenAll: () => void
  board: Board
  // propertyId ya da '__new__' (yeni sütun ekle)
  onSetColumn: (key: string, propertyId: string) => void
  overwriteExisting: boolean
  onToggleOverwrite: () => void
}) {
  const [open, setOpen] = useState(false)
  const closedCount = FETCHABLE_FIELDS.filter((f) => excludedKeys.has(f.key)).length
  const unmapped = FETCHABLE_FIELDS.filter((f) => f.key !== 'sezonlar' && !fieldColumn(board, f.key))

  return (
    <div className="relative">
      <ToolbarIconButton
        onClick={() => setOpen((v) => !v)}
        title="TMDB'den neler gelsin — Güncelle ve Genel Güncelleme'nin dolduracağı alanlar"
        active={excludedKeys.size > 0 || overwriteExisting || unmapped.length > 0}
      >
        <GearIcon />
      </ToolbarIconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-[22rem] max-w-[calc(100vw-2rem)] bg-neutral-900 border border-neutral-800 rounded-xl shadow-lg">
            <div className="p-3 border-b border-neutral-800">
              <p className="text-sm font-semibold text-neutral-100">TMDB'den neler gelsin?</p>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                "Güncelle" ve "Genel Güncelleme" açık olan alanları doldurur; her birinin altında hangi sütununa yazacağı var, istersen
                değiştir. Önerimiz hepsinin açık olması — ARGUS en iyi böyle çalışır ve görünür.
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span className={closedCount ? 'text-amber-400' : 'text-emerald-400'}>
                  {closedCount ? `${closedCount} alan kapalı` : '✓ Hepsi açık'}
                </span>
                {unmapped.length > 0 && <span className="text-amber-400">{unmapped.length} alanın sütunu yok</span>}
                {closedCount > 0 && (
                  <button onClick={onOpenAll} className="ml-auto text-[#00c0fa] hover:underline">
                    Hepsini aç
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[22rem] overflow-y-auto p-1.5 space-y-0.5">
              {FETCHABLE_FIELDS.map((f) => {
                const on = !excludedKeys.has(f.key)
                const col = f.key === 'sezonlar' ? undefined : fieldColumn(board, f.key)
                const cands = f.key === 'sezonlar' ? [] : fieldCandidates(board, f.key)
                return (
                  <div key={f.key} className="px-2 py-2 rounded-md hover:bg-neutral-800/70">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${on ? 'text-neutral-200' : 'text-neutral-500'}`}>{f.label}</p>
                        <p className="text-[11px] text-neutral-500 truncate">{FIELD_HINTS[f.key]}</p>
                      </div>
                      <ToggleSwitch checked={on} onChange={() => onToggle(f.key)} label={f.label} />
                    </div>
                    {on && f.key !== 'sezonlar' && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-neutral-500 shrink-0">→ Yazdığı sütun</span>
                        <Select
                          value={col?.id ?? ''}
                          onChange={(v) => onSetColumn(f.key, v)}
                          placeholder={cands.length ? 'Seçilmedi' : 'Sende yok'}
                          options={[...cands.map((c) => ({ value: c.id, label: c.name })), { value: '__new__', label: `+ Yeni "${f.key === 'kapakAdi' ? 'Kapak Adı' : ROLE_DEFS.find((d) => d.key === FIELD_ROLE[f.key])?.defaultName ?? f.label}" sütunu ekle` }]}
                          className="flex-1 min-w-0"
                        />
                        {!col && <span className="text-[10px] text-amber-400 shrink-0">{cands.length ? 'seç' : 'yok'}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between gap-2 p-3 border-t border-neutral-800">
              <span>
                <span className="block text-sm text-neutral-300">Dolu alanları da güncelle</span>
                <span className="block text-[11px] text-neutral-500">Kapalıyken sadece boş alanlar doldurulur, yazdıkların ezilmez.</span>
              </span>
              <ToggleSwitch checked={overwriteExisting} onChange={onToggleOverwrite} label="Dolu alanları da güncelle" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Toolbar ikon butonları (arama/filtre/sırala) için ortak görünüm — ikisi de "kapalıyken
// ikon, tıklanınca genişleyen" mantığıyla çalışıyor (bkz. GlobalSearch.tsx'teki aynı desen).
// Kullanıcı ikonların ne işe yaradığının belli olmadığını söyleyince (26 Eylül 2026) üzerine gelince
// altta küçük bir ad etiketi çıkıyor — tarayıcının geç açılan kendi ipucu (title) yerine anında.
function ToolbarIconButton({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void
  title: string
  active?: boolean
  children: React.ReactNode
}) {
  const short = title.split(' — ')[0]
  return (
    <span className="relative group/tip inline-flex">
      <button
        onClick={onClick}
        aria-label={title}
        className={`h-9 w-9 flex items-center justify-center rounded-lg transition ${
          active ? 'text-[#00c0fa] bg-[#015eea]/10' : 'text-neutral-400 hover:text-[#00c0fa] hover:bg-neutral-800'
        }`}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 z-40 whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-200 shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity delay-150">
        {short}
      </span>
    </span>
  )
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-6 w-px bg-neutral-800" />
}

function DensityIcon({ roomy }: { roomy: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4">
      {roomy ? (
        <path d="M4 6h16M4 12h16M4 18h16" />
      ) : (
        <path d="M4 5h16M4 9.5h16M4 14h16M4 18.5h16" />
      )}
    </svg>
  )
}

const SORTABLE_TYPES = new Set<PropertyType>(['text', 'longtext', 'url', 'number', 'date', 'multidate', 'select', 'rating', 'checkbox'])

// Farklı sütun tiplerini tek bir karşılaştırılabilir değere indirger — sıralama butonunun
// "neye göre sıralayacağını seçeceğim" ihtiyacı için, tip bazlı tek bir yer.
function sortValue(row: Row, property: PropertyDef): string | number | boolean {
  const v = row.values[property.id]
  if (property.type === 'rating') return ratingAverage(v, property) ?? -Infinity
  if (property.type === 'number') return typeof v === 'number' ? v : -Infinity
  if (property.type === 'checkbox') return Boolean(v)
  // En son (en büyük) tarihe göre sıralanır — ISO ("YYYY-MM-DD") string'ler zaten
  // sözlüksel sırayla kronolojik sırayla aynı, ekstra bir tarih ayrıştırmaya gerek yok.
  if (property.type === 'multidate') {
    const dates = Array.isArray(v) ? (v as string[]).map(entryEnd) : []
    return dates.length > 0 ? dates.slice().sort().at(-1)! : ''
  }
  if (property.type === 'select') {
    const label = property.options?.find((o) => o.id === v)?.label
    return label ? label.toLocaleLowerCase('tr') : ''
  }
  return typeof v === 'string' ? v.toLocaleLowerCase('tr') : ''
}

// Kendi taslak state'ini kendi içinde tutuyor — böylece isim yazılırken tetiklenen
// render sadece bu küçük input'u etkiliyor, binlerce oyuncu seçeneğini tarayan koca
// tabloyu (BoardTable) her tuş vuruşunda yeniden render etmiyor.
function BoardNameInput({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    if (draft !== null && draft.trim() && draft !== name) onSave(draft.trim())
    setDraft(null)
  }

  return (
    <input
      value={draft ?? name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="text-xl font-semibold text-neutral-50 bg-transparent outline-none border-b border-transparent hover:border-neutral-700 focus:border-neutral-500 w-full min-w-0"
    />
  )
}

// Aynı sebepten BoardNameInput gibi kendi taslağını tutuyor: `onSearch` her tuş vuruşunda
// değil, 200ms'lik bir yazma duraklamasından sonra tetikleniyor — kutu anında yazılabilir
// kalırken, 837 satırı filtreleyip koca (memoize edilmemiş) BoardTable'ı yeniden render
// eden asıl pahalı iş yazarken değil, yazma durunca bir kere çalışıyor. Daha önce denenen
// `useDeferredValue` tek başına yetmedi — React'in "acil" render geçişi (input'u güncelleyen)
// BoardTable'ı hâlâ senkron olarak (memo'lanmamış bir bileşen olduğu için) tekrar çağırıyordu;
// gerçek çözüm BoardView'ın kendisinin her tuş vuruşunda hiç re-render olmaması.
// Tıklanmadan sadece bir büyüteç ikonu olarak durur — ana sayfadaki GlobalSearch ile aynı mantık.
function TableSearchInput({ onSearch }: { onSearch: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(value: string) {
    setDraft(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSearch(value), 200)
  }

  function close() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setDraft('')
    onSearch('')
    setOpen(false)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!open) {
    return (
      <ToolbarIconButton onClick={() => setOpen(true)} title="Ara">
        <SearchIcon />
      </ToolbarIconButton>
    )
  }

  return (
    <div className="relative flex items-center">
      <input
        autoFocus
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        placeholder="Ara..."
        className="bg-neutral-900 border border-neutral-700 rounded-lg pl-3 pr-8 py-1.5 text-sm text-neutral-100 outline-none focus:border-[#00c0fa] w-48"
      />
      <button
        onClick={close}
        title="Aramayı kapat"
        className="absolute right-2 h-5 w-5 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-50 hover:bg-neutral-700 transition"
      >
        <CloseIcon />
      </button>
    </div>
  )
}

// Filtre de aynı şekilde kapalıyken bir huni ikonu, tıklayınca aşağı açılan bir panelde
// çoklu / ters filtre (bkz. MultiFilterEditor). Bir filtre aktifken ikon mavi kalıyor
// (uygulanmış olduğunu hatırlatmak için) — panel kapalı olsa bile.
function FilterPopover({
  board,
  conditions,
  onChange,
}: {
  board: Board
  conditions: FilterCondition[]
  onChange: (c: FilterCondition[]) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <ToolbarIconButton onClick={() => setOpen((v) => !v)} title="Filtrele" active={conditions.length > 0}>
        <FilterIcon />
      </ToolbarIconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-xl p-3 shadow-lg">
            <p className="text-sm font-semibold text-neutral-100 mb-2">Filtrele</p>
            <MultiFilterEditor
              board={board}
              conditions={conditions}
              onChange={onChange}
              compact
              emptyText="Bir sütunu aç; göstermek istediklerine bir kez (✓), gizlemek istediklerine iki kez (✕) tıkla."
            />
          </div>
        </>
      )}
    </div>
  )
}

// Sıralama da aynı ikon+panel deseninde: hangi sütuna göre (ve hangi yönde) sıralanacağı.
function SortPopover({
  sortableProps,
  sortPropertyId,
  sortDirection,
  onChange,
}: {
  sortableProps: PropertyDef[]
  sortPropertyId: string | null
  sortDirection: 'asc' | 'desc'
  onChange: (propertyId: string | null, direction: 'asc' | 'desc') => void
}) {
  const [open, setOpen] = useState(false)
  if (sortableProps.length === 0) return null

  return (
    <div className="relative">
      <ToolbarIconButton onClick={() => setOpen((v) => !v)} title="Sırala" active={Boolean(sortPropertyId)}>
        <SortIcon />
      </ToolbarIconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-56 bg-neutral-900 border border-neutral-800 rounded-xl p-2 shadow-lg space-y-2">
            {sortPropertyId && (
              <div className="flex gap-1 px-1">
                <button
                  onClick={() => onChange(sortPropertyId, 'asc')}
                  className={`flex-1 text-xs rounded-md px-2 py-1 transition ${
                    sortDirection === 'asc' ? 'bg-neutral-700 text-neutral-50' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Artan
                </button>
                <button
                  onClick={() => onChange(sortPropertyId, 'desc')}
                  className={`flex-1 text-xs rounded-md px-2 py-1 transition ${
                    sortDirection === 'desc' ? 'bg-neutral-700 text-neutral-50' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Azalan
                </button>
              </div>
            )}
            <div className="max-h-52 overflow-y-auto space-y-0.5">
              <button
                onClick={() => onChange(null, sortDirection)}
                className={`block w-full text-left text-xs rounded-md px-2 py-1.5 transition ${
                  !sortPropertyId ? 'bg-neutral-700 text-neutral-50' : 'text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                Varsayılan (eklenme sırası)
              </button>
              {sortableProps.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onChange(p.id, sortDirection)}
                  className={`block w-full text-left text-xs rounded-md px-2 py-1.5 transition ${
                    sortPropertyId === p.id ? 'bg-neutral-700 text-neutral-50' : 'text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Yavaşlık şikayeti üzerine eklendi: özellikle görsel sütunları (Banner/Poster/KAPAK ADI) her
// satırda birer <img> yüklüyor — kullanıcı istemediği sütunları burada kapatıp tabloyu daha
// hafif tutabilir. Aynı ikon+panel deseninde (bkz. Filtre/Sırala), her sütun için bir onay
// kutusu. Başlık sütunu listede yok — kapatılabilir bir şey değil, tablonun kimliği o.
function ColumnVisibilityPopover({
  columns,
  hiddenIds,
  onToggle,
}: {
  columns: PropertyDef[]
  hiddenIds: Set<string>
  onToggle: (propertyId: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (columns.length === 0) return null

  return (
    <div className="relative">
      <ToolbarIconButton onClick={() => setOpen((v) => !v)} title="Sütunları göster/gizle" active={hiddenIds.size > 0}>
        <ColumnsIcon />
      </ToolbarIconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-64 bg-neutral-900 border border-neutral-800 rounded-xl p-2 shadow-lg">
            <p className="text-[11px] text-neutral-500 px-2 pb-1.5">
              Kapattığın sütunlar kalıcı olarak gizlenir, veriler silinmez.
            </p>
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {columns.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-800">
                  <span className="text-sm text-neutral-300 truncate">{p.name}</span>
                  <ToggleSwitch checked={!hiddenIds.has(p.id)} onChange={() => onToggle(p.id)} label={p.name} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function BoardView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { board, loading: boardLoading, setProperties, saveBoard, reload: reloadBoard } = useBoard(id)
  const { rows, loading: rowsLoading, saveRow, removeRow, reload: reloadRows } = useRows(id)
  const { boards, loading: boardsLoading } = useBoards()
  const { confirm, notify } = useToast()
  const boardTableRef = useRef<BoardTableHandle>(null)
  // "+ Yeni Ekle" ile satır eklendiğinde kaydırma hedefi buraya konur — `rows`/`filteredRows`
  // state güncellemesi asenkron olduğu için satırı ekleyen fonksiyonun hemen ardından değil,
  // aşağıdaki effect'te o satır gerçekten listede belirince kaydırılıyor (yarış durumunu önler).
  const [pendingScrollRowId, setPendingScrollRowId] = useState<string | null>(null)
  // Altı-noktalı tutamacın yanındaki göz ikonu — ana sayfadaki kart tıklamasıyla açılan aynı
  // RowDetailModal'ı tablo görünümünden de açabilmek için.
  const [detailRow, setDetailRow] = useState<Row | null>(null)

  // Bir arşiv açıkken profil değiştirilirse (bkz. useBoard.ts'nin activeProfileId bağımlılığı),
  // URL'deki board id yeni profilde muhtemelen yok — eskiden bu hep "Arşiv bulunamadı" gösterip
  // kullanıcıyı elle Arşivlerim'e dönmeye zorluyordu, kendi arşivi başka bir yerde duruyor
  // olabilecekken bile. Artık: yeni profilde tek arşiv varsa doğrudan oraya atlanır (tek
  // makul seçenek), hiç arşiv yoksa aşağıdaki mesaj gösterilir, birden fazla arşiv varsa
  // hangisi olduğu tahmin edilemeyeceğinden seçim listesine (Arşivlerim) yönlendirilir.
  useEffect(() => {
    if (boardLoading || boardsLoading || board) return
    if (boards.length === 1) navigate(`/board/${boards[0].id}`, { replace: true })
    else if (boards.length > 1) navigate('/arsivlerim', { replace: true })
  }, [boardLoading, boardsLoading, board, boards, navigate])

  // TableSearchInput kendi anlık yazdığını kendi içinde tutuyor, buraya sadece 200ms'lik
  // yazma duraklamasından sonra bildiriyor (bkz. TableSearchInput'un başındaki not).
  const [search, setSearch] = useState('')
  const [sortPropertyId, setSortPropertyId] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Hangi sütunların kapalı olduğu bu tarayıcıda kalıcı (localStorage) — sekme/tarayıcı/
  // bilgisayar kapansa da kaybolmasın diye. Arşive özel (id bazlı anahtar): farklı arşivlerin
  // sütunları birbirini etkilemesin.
  // Satır sıklığı ("Rahat" / "Sıkı") — gizli sütunlar gibi bu tarayıcıda, arşive özel saklanıyor.
  const densityKey = id ? `argus_table_density_${id}` : null
  const [density, setDensity] = useState<'rahat' | 'siki'>('siki')
  useEffect(() => {
    if (!densityKey) return
    try {
      setDensity(localStorage.getItem(densityKey) === 'rahat' ? 'rahat' : 'siki')
    } catch {
      setDensity('siki')
    }
  }, [densityKey])
  function toggleDensity() {
    const next = density === 'rahat' ? 'siki' : 'rahat'
    setDensity(next)
    try {
      if (densityKey) localStorage.setItem(densityKey, next)
    } catch {
      // saklanamasa da bu oturumda çalışır
    }
  }

  const hiddenColumnsKey = id ? `argus_hidden_columns_${id}` : null
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!hiddenColumnsKey) return
    try {
      const raw = localStorage.getItem(hiddenColumnsKey)
      setHiddenColumnIds(raw ? new Set(JSON.parse(raw)) : new Set())
    } catch {
      setHiddenColumnIds(new Set())
    }
  }, [hiddenColumnsKey])

  function toggleColumnHidden(propertyId: string) {
    if (!hiddenColumnsKey) return
    setHiddenColumnIds((prev) => {
      const next = new Set(prev)
      if (next.has(propertyId)) next.delete(propertyId)
      else next.add(propertyId)
      try {
        localStorage.setItem(hiddenColumnsKey, JSON.stringify([...next]))
      } catch {
        // localStorage dolu/kapalı olabilir — sorun değil, sadece bu oturumda hatırlanmaz
      }
      return next
    })
  }

  // Genel Güncelleme öncesi bilgilendirme penceresi (bkz. TmdbFillAdviceModal). "Bir daha sorma"
  // arşiv başına hatırlanıyor.
  const [fillAdvice, setFillAdvice] = useState<{
    count: number
    missing: { key: string; label: string; candidates: { id: string; name: string }[] }[]
    closed: { key: string; label: string }[]
    resolve: (r: { skip: string[]; mute: boolean; columns: Record<string, string> } | null) => void
  } | null>(null)
  const adviceMuteKey = id ? `argus_tmdb_advice_muted_${id}` : null

  function saveTmdbExclude(next: Set<string>) {
    setTmdbExcludeFields(next)
    try {
      if (tmdbExcludeKey) localStorage.setItem(tmdbExcludeKey, JSON.stringify([...next]))
    } catch {
      // saklanamasa da bu oturumda çalışır
    }
  }

  // API'den doldurulmasını istemediği alanlar — aynı kalıcılık deseni (bkz. hiddenColumnsKey).
  const tmdbExcludeKey = id ? `argus_tmdb_fetch_exclude_${id}` : null
  const [tmdbExcludeFields, setTmdbExcludeFields] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!tmdbExcludeKey) return
    try {
      const raw = localStorage.getItem(tmdbExcludeKey)
      setTmdbExcludeFields(raw ? new Set(JSON.parse(raw)) : new Set())
    } catch {
      setTmdbExcludeFields(new Set())
    }
  }, [tmdbExcludeKey])

  function toggleTmdbField(key: string) {
    if (!tmdbExcludeKey) return
    setTmdbExcludeFields((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try {
        localStorage.setItem(tmdbExcludeKey, JSON.stringify([...next]))
      } catch {
        // localStorage dolu/kapalı olabilir — sorun değil, sadece bu oturumda hatırlanmaz
      }
      return next
    })
  }

  // "API eşitle" varsayılan olarak sadece BOŞ alanları doldurur — kullanıcı "sadece boş olan
  // satırları dolduruyo ya doluları da güncelleyim mi diye sorsun" dedi. Bu açık olunca zaten
  // dolu bir alanın üzerine de TMDB'nin güncel verisi yazılır (ör. eski bannerları silip API'den
  // yeniden çektirmek için). Alanlar-hariç-tutma ayarıyla aynı kalıcılık deseni.
  const tmdbOverwriteKey = id ? `argus_tmdb_overwrite_${id}` : null
  const [tmdbOverwriteExisting, setTmdbOverwriteExisting] = useState(false)
  useEffect(() => {
    if (!tmdbOverwriteKey) return
    try {
      setTmdbOverwriteExisting(localStorage.getItem(tmdbOverwriteKey) === '1')
    } catch {
      setTmdbOverwriteExisting(false)
    }
  }, [tmdbOverwriteKey])

  function toggleTmdbOverwrite() {
    if (!tmdbOverwriteKey) return
    setTmdbOverwriteExisting((prev) => {
      const next = !prev
      try {
        localStorage.setItem(tmdbOverwriteKey, next ? '1' : '0')
      } catch {
        // localStorage dolu/kapalı olabilir — sorun değil, sadece bu oturumda hatırlanmaz
      }
      return next
    })
  }

  // "Genel Güncelleme" — tek tek satırlardaki 🔄 butonunun toplu hali: eksik görünen (poster/
  // sinopsis/ülke/yönetmen/fragmanından biri boş) her kaydı sırayla TMDB'den doldurur.
  // Tek seferde tüm satırları paralel çağırmak yerine sırayla gidiyor (TMDB'yi yormamak için,
  // Python scriptlerindeki `time.sleep` mantığıyla aynı sebep) — bu yüzden uzun sürebilir,
  // istediği an durdurabilsin diye bulkCancelRef ile iptal edilebiliyor.
  const [bulkUpdating, setBulkUpdating] = useState(false)
  // Arşiv geçmişi penceresi (row verilirse sadece o kaydın geçmişi).
  const [historyFor, setHistoryFor] = useState<{ row: Row | null } | null>(null)
  const bulkCancelRef = useRef(false)
  // Ayrıntı kutusu (bkz. BulkUpdatePanel) ve "kaldığı yerden devam": kalan kayıtlar arşiv başına
  // tarayıcıda saklanıyor — durdurunca, sayfa yenilenince ya da ARGUS kapanıp açılınca da devam edilebilsin.
  const [bulk, setBulk] = useState<BulkState | null>(null)
  const bulkResumeKey = id ? `argus_bulk_resume_${id}` : null
  type BulkSaved = { ids: string[]; done: number; total: number; updated: number; failed: number; exclude: string[]; overwrite: boolean }
  function readBulkSaved(): BulkSaved | null {
    try {
      const raw = bulkResumeKey ? localStorage.getItem(bulkResumeKey) : null
      return raw ? (JSON.parse(raw) as BulkSaved) : null
    } catch {
      return null
    }
  }
  function writeBulkSaved(v: BulkSaved | null) {
    try {
      if (!bulkResumeKey) return
      if (v && v.ids.length > 0) localStorage.setItem(bulkResumeKey, JSON.stringify(v))
      else localStorage.removeItem(bulkResumeKey)
    } catch {
      // saklanamazsa sadece bu oturumda devam edilebilir
    }
  }
  // Arşiv açılınca yarım kalmış bir güncelleme varsa kutu "durduruldu" haliyle görünsün.
  useEffect(() => {
    const saved = readBulkSaved()
    setBulk(
      saved
        ? { running: false, done: saved.done, total: saved.total, updated: saved.updated, failed: saved.failed, current: null, startedAt: Date.now(), sessionDone: 0, log: [] }
        : null,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkResumeKey])

  // Filtre URL'de tutuluyor (?filterProp=&filterOption=) — böylece başka bir yerden (ör.
  // detay penceresindeki bir oyuncu rozetine tıklayınca) doğrudan bu arşive, o değere göre
  // filtrelenmiş halde bağlantı verebiliyoruz.
  const [searchParams, setSearchParams] = useSearchParams()
  const filterPropertyId = searchParams.get('filterProp')
  const filterOptionId = searchParams.get('filterOption')

  // Bir detay penceresinden oyuncu/seçenek filtresine gidip "Filtreyi Kaldır"a basınca buraya
  // ?detay=<satır> ile dönülüyor (bkz. RowDetailModal.goToFilter) — kullanıcı "kaldığım yere atsın
  // beni" dedi. Tablo yüklenince önce eski kaydırma konumuna gidip sonra o detay penceresi açılıyor
  // (pencere açılırken o anki konumu kilitleyip kapanınca oraya döndüğü için sıra önemli).
  const detayParam = searchParams.get('detay')
  useEffect(() => {
    // Tablo ancak arşiv listesi (boardsLoading) de yüklenince çiziliyor — onu beklemeden kaydırınca
    // sayfa henüz kısa olduğu için kaydırma boşa gidiyordu.
    if (!detayParam || !board || rowsLoading || boardsLoading) return
    const row = rows.find((r) => r.id === detayParam)
    const scrollY = (location.state as { scrollY?: number } | null)?.scrollY
    if (row) {
      // Sayfa o konuma kaydırılabilecek kadar uzayana kadar birkaç kare dene, sonra pencereyi aç.
      let tries = 0
      const restore = () => {
        if (typeof scrollY === 'number') window.scrollTo(0, scrollY)
        if (typeof scrollY === 'number' && Math.abs(window.scrollY - scrollY) > 2 && ++tries < 30) {
          requestAnimationFrame(restore)
          return
        }
        setDetailRow(row)
      }
      restore()
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('detay')
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detayParam, board, rowsLoading, boardsLoading, rows])

  function setFilter(propertyId: string | null, optionId: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('filtre')
      if (propertyId) next.set('filterProp', propertyId)
      else next.delete('filterProp')
      if (optionId) next.set('filterOption', optionId)
      else next.delete('filterOption')
      return next
    })
  }

  // Çoklu / ters filtre adres çubuğunda ?filtre=... olarak duruyor (bkz. lib/filters.ts). Eski
  // tek değerli bağlantılar (detay penceresinden bir oyuncuya tıklayınca gelen filterProp/
  // filterOption, üstteki durum düğmeleri) de aynı listeye tek bir "gelsin" koşulu olarak katılıyor.
  const filtreParam = searchParams.get('filtre')
  const tableConditions = useMemo(() => {
    const list = decodeConditions(filtreParam)
    if (filterPropertyId && filterOptionId && !list.some((c) => c.propertyId === filterPropertyId)) {
      list.unshift({ propertyId: filterPropertyId, include: [filterOptionId], exclude: [] })
    }
    return list
  }, [filtreParam, filterPropertyId, filterOptionId])

  function setTableConditions(conds: FilterCondition[]) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('filterProp')
      next.delete('filterOption')
      const enc = encodeConditions(conds)
      if (enc) next.set('filtre', enc)
      else next.delete('filtre')
      return next
    })
  }

  const sortableProps = useMemo(() => board?.properties.filter((p) => SORTABLE_TYPES.has(p.type)) ?? [], [board])
  const sortProperty = sortableProps.find((p) => p.id === sortPropertyId) ?? null

  // Arama kutusu seçim/çoklu-seçim sütunlarındaki (Tür/Ülke/Oyuncular gibi) ETİKETLERİ de
  // taramalı — değerler board'da bir option ID olarak tutuluyor, aramadan önce ID -> etiket
  // eşlemesi gerekiyor. Oyuncular gibi binlerce seçenekli bir sütunda her tuş vuruşunda
  // `.find()` ile taramak yerine (GlobalSearch.tsx'teki aynı performans deseni) tek seferlik
  // bir Map inşa edilip filtre geçişinde O(1) bakılıyor.
  const searchOptionMaps = useMemo(() => {
    const maps = new Map<string, Map<string, string>>()
    if (!board) return maps
    for (const p of board.properties) {
      if (p.type !== 'select' && p.type !== 'multiselect') continue
      const m = new Map<string, string>()
      for (const o of p.options ?? []) m.set(o.id, o.label)
      maps.set(p.id, m)
    }
    return maps
  }, [board])

  // Başlıktaki "727 kayıt · 308 izlendi…" ve üstteki tek tıkla durum filtresi: Durum görevindeki sütunun
  // seçenekleri, sütundaki kendi sırasıyla ve kayıt sayılarıyla (filtreden bağımsız, bütün kayıtlar).
  const statusProp = board ? resolveRole(board, 'durum') : undefined
  const statusSummary = useMemo(() => {
    if (!statusProp) return []
    const counts = new Map<string, number>()
    for (const r of rows) {
      const v = r.values[statusProp.id]
      if (typeof v === 'string' && v) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return (statusProp.options ?? [])
      .map((o) => ({ id: o.id as string | null, label: o.label, count: counts.get(o.id) ?? 0, colorIndex: o.colorIndex }))
      .filter((o) => o.count > 0)
  }, [rows, statusProp])

  const filteredRows = useMemo(() => {
    if (!board) return []
    // Arama sırası: adı (başlık ya da orijinal adı) aramayla başlayanlar en üstte, sonra adında bir
    // kelimesi öyle başlayanlar, sonra adının içinde geçenler, en son başka sütunlarda geçenler
    // ("harry" yazınca Dolittle değil Harry Potter'lar önce gelsin).
    const nameProps = [board.properties.find((p) => p.id === board.titlePropertyId), resolveRole(board, 'orjinalAdi')].filter(Boolean)
    const searchRank = new Map<string, number>()
    const result = rows.filter((row) => {
      if (!rowMatchesConditions(row, tableConditions)) return false
      if (search.trim()) {
        const q = search.trim().toLocaleLowerCase('tr')
        const hay = board.properties
          .map((p) => {
            const v = row.values[p.id]
            if (v === undefined || v === null || v === '') return ''
            if (p.type === 'select') return searchOptionMaps.get(p.id)?.get(v as string) ?? ''
            if (p.type === 'multiselect' && Array.isArray(v)) {
              const m = searchOptionMaps.get(p.id)
              return m ? v.map((optId) => m.get(optId) ?? '').join(' ') : ''
            }
            return typeof v === 'string' ? v : ''
          })
          .join(' ')
          .toLocaleLowerCase('tr')
        const title = ((row.values[board.titlePropertyId] as string) ?? '').toLocaleLowerCase('tr')
        if (!hay.includes(q) && !title.includes(q)) return false
        let rank = 4
        for (const p of nameProps) {
          const v = row.values[p!.id]
          const name = (typeof v === 'string' ? v : '').toLocaleLowerCase('tr')
          if (!name.includes(q)) continue
          const wordStart = name.split(/[\s:(\-–.,]+/).some((w) => w.startsWith(q))
          const r = name === q ? 0 : name.startsWith(q) ? 1 : wordStart ? 2 : 3
          rank = Math.min(rank, r)
        }
        searchRank.set(row.id, rank)
      }
      return true
    })
    if (sortProperty) {
      result.sort((a, b) => {
        const av = sortValue(a, sortProperty)
        const bv = sortValue(b, sortProperty)
        let cmp: number
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
        else if (typeof av === 'boolean' && typeof bv === 'boolean') cmp = Number(av) - Number(bv)
        else cmp = String(av).localeCompare(String(bv), 'tr')
        return sortDirection === 'asc' ? cmp : -cmp
      })
    }
    if (searchRank.size) {
      // sort() kararlı: aynı derecedekiler seçili sıralamayı korur
      result.sort((a, b) => (searchRank.get(a.id) ?? 4) - (searchRank.get(b.id) ?? 4))
    }
    return result
  }, [rows, tableConditions, search, board, sortProperty, sortDirection, searchOptionMaps])

  // Yeni eklenen satır listede gerçekten görününce (bkz. pendingScrollRowId'nin tanımındaki not)
  // BoardTable'a kaydırma komutunu veriyor.
  useEffect(() => {
    if (!pendingScrollRowId) return
    if (filteredRows.some((r) => r.id === pendingScrollRowId)) {
      boardTableRef.current?.scrollToRow(pendingScrollRowId)
      setPendingScrollRowId(null)
    }
  }, [pendingScrollRowId, filteredRows])

  // "Genel Güncelleme"nin hangi kayıtları eksik sayacağı — TMDB'nin doldurduğu en temel
  // alanlar (bkz. server/index.js'teki aynı isimli sütunlar). Board'da bu sütunlardan hangisi
  // yoksa (kullanıcı silmişse) o alan kontrolden muaf tutulur.
  const posterProp = resolveRole(board, 'poster')
  const synopsisProp = resolveRole(board, 'sinopsis')
  const videoProp = resolveRole(board, 'video')
  const ulkeProp = resolveRole(board, 'ulke')
  const yonetmenProp = resolveRole(board, 'yonetmen')
  const incompletenessChecks = [posterProp, synopsisProp, videoProp, ulkeProp, yonetmenProp].filter(
    (p): p is PropertyDef => Boolean(p),
  )

  function hasTitleFilled(row: Row): boolean {
    if (!board) return false
    const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
    const titleValue = titleProp ? row.values[titleProp.id] : undefined
    return typeof titleValue === 'string' ? titleValue.trim().length > 0 : Boolean(titleValue)
  }

  function isIncomplete(row: Row): boolean {
    if (!hasTitleFilled(row)) return false
    // Sağlık Kontrolü'nde "bir daha sorma" denen alanlar eksik sayılmıyor — Genel Güncelleme de
    // sırf onlar için bu kayda tekrar TMDB isteği atmasın.
    const ignored = new Set(board?.healthIgnore?.[row.id] ?? [])
    return incompletenessChecks.some((p) => {
      if (ignored.has(p.id)) return false
      const v = row.values[p.id]
      return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    })
  }

  // Sağlık Kontrolü panelinin ilk iki listesi — board+rows'tan saf istemci tarafında
  // hesaplanabiliyor, üçüncü liste (bozuk dosya bağlantıları) modalın kendisi açılınca
  // ayrıca sunucudan çekiliyor (bkz. HealthCheckModal.tsx).
  const [healthOpen, setHealthOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const missingImageRows = useMemo(
    () => (board ? rows.filter((r) => hasTitleFilled(r) && !hasAnyImage(board, r)) : []),
    [board, rows, hasTitleFilled],
  )
  const incompleteRowsForHealth = useMemo(() => rows.filter(isIncomplete), [rows, isIncomplete])

  if (boardLoading || boardsLoading) return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>
  if (!board) {
    // boards.length 1 ya da >1 ise yukarıdaki effect zaten yönlendirmiş olacak (o gerçekleşene
    // kadar burası kısa bir an görünebilir) — burada sadece gerçekten arşivi olmayan (0 arşiv)
    // profil için kalıcı bir mesaj gösteriliyor.
    if (boards.length === 0) {
      return (
        <div className="px-4 py-16 flex flex-col items-center text-center">
          <h1 className="text-2xl font-semibold text-neutral-50 mb-2">Arşiv Bulunamadı</h1>
          <p className="text-neutral-500 text-sm max-w-md">Bu hesabın henüz bir arşivi yok — önce bir arşiv oluşturman lazım.</p>
          <button onClick={() => navigate('/arsivlerim')} style={primaryButtonStyle} className={`mt-6 text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}>
            Arşiv Oluştur
          </button>
        </div>
      )
    }
    return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>
  }

  // Dişli menüsündeki "Sende yok → + Ekle": o alanın sütununu (görevi otomatik tanınacak adla) ekler.
  function addFillColumn(key: string) {
    if (!board) return
    if (key === 'kapakAdi') {
      const prop = { id: makeId(), name: 'Kapak Adı', type: 'image' as PropertyType }
      saveBoard({ properties: [...board.properties, prop], titleImagePropertyId: prop.id })
      notify('"Kapak Adı" sütunu eklendi — Güncelle ile logolar gelir.')
      return
    }
    const role = FIELD_ROLE[key]
    const def = ROLE_DEFS.find((d) => d.key === role)
    if (!def) return
    addProperty(def.defaultName, def.types[0])
    notify(`"${def.defaultName}" sütunu eklendi — Güncelle ile doldurulur.`)
  }

  // Dişli menüsünde bir alanın yazacağı sütunu değiştirme — sütun menüsündeki "Görevi" ile aynı kayıt.
  async function setFieldColumn(key: string, propertyId: string) {
    if (!board) return
    if (propertyId === '__new__') return addFillColumn(key)
    const name = board.properties.find((p) => p.id === propertyId)?.name ?? ''
    const label = FETCHABLE_FIELDS.find((f) => f.key === key)?.label ?? key
    if (key === 'kapakAdi') await saveBoard({ titleImagePropertyId: propertyId })
    else {
      const role = FIELD_ROLE[key]
      if (!role) return
      await saveBoard({ roles: { ...(board.roles ?? {}), [role]: propertyId } })
    }
    notify(`${label} artık "${name}" sütununa yazılacak.`)
  }

  function addProperty(name: string, type: PropertyType) {
    if (!board) return
    const needsOptions = type === 'select' || type === 'multiselect'
    const prop = {
      id: makeId(),
      name,
      type,
      ...(needsOptions ? { options: [] } : {}),
      ...(type === 'rating' ? { criteria: [] } : {}),
    }
    setProperties([...board.properties, prop])
  }

  async function deleteProperty(propertyId: string) {
    if (!board) return
    const ok = await confirm({
      message: 'Bu sütunu silmek istediğine emin misin? Kayıtlardaki bu sütuna ait veriler görünmez olur.',
      confirmLabel: 'Sil',
    })
    if (!ok) return
    setProperties(board.properties.filter((p) => p.id !== propertyId))
    if (tableConditions.some((c) => c.propertyId === propertyId)) setTableConditions(tableConditions.filter((c) => c.propertyId !== propertyId))
  }

  function renameProperty(propertyId: string, name: string) {
    if (!board) return
    const properties = board.properties.map((p) => (p.id === propertyId ? { ...p, name } : p))
    // Sütun bir görevi sadece varsayılan ADI sayesinde görüyorsa (ör. "Poster"), yeni ad o görevi
    // kaybettirmesin diye görev önce bu sütuna sabitleniyor (bkz. lib/roles.ts).
    const roles = lockRolesForProperty(board, propertyId)
    saveBoard(roles ? { properties, roles } : { properties })
  }

  function setPropertyRole(propertyId: string, role: RoleKey | null) {
    if (!board) return
    saveBoard({ roles: assignRole(board, propertyId, role) })
  }

  function setStatusOption(key: StatusKey, optionId: string) {
    if (!board) return
    const next = { ...(board.statusOptions ?? {}) }
    if (optionId) next[key] = optionId
    else delete next[key]
    saveBoard({ statusOptions: next })
  }

  function changePropertyType(propertyId: string, type: PropertyType) {
    if (!board) return
    setProperties(
      board.properties.map((p) => {
        if (p.id !== propertyId) return p
        const needsOptions = type === 'select' || type === 'multiselect'
        const next = { ...p, type }
        if (needsOptions) next.options = p.options ?? []
        else delete next.options
        if (type === 'rating') next.criteria = p.criteria ?? []
        else delete next.criteria
        return next
      }),
    )
  }

  function addOptionToProperty(propertyId: string, label: string): string {
    if (!board) return ''
    const newId = makeId()
    const nextProps = board.properties.map((p) => {
      if (p.id !== propertyId) return p
      const options = p.options ?? []
      return { ...p, options: [...options, { id: newId, label, colorIndex: options.length }] }
    })
    setProperties(nextProps)
    return newId
  }

  function addCriterionToProperty(propertyId: string, name: string): string {
    if (!board) return ''
    const newId = makeId()
    setProperties(
      board.properties.map((p) => {
        if (p.id !== propertyId) return p
        return { ...p, criteria: [...(p.criteria ?? []), { id: newId, name }] }
      }),
    )
    return newId
  }

  function renameCriterion(propertyId: string, criterionId: string, name: string) {
    if (!board) return
    setProperties(
      board.properties.map((p) =>
        p.id !== propertyId ? p : { ...p, criteria: (p.criteria ?? []).map((c) => (c.id === criterionId ? { ...c, name } : c)) },
      ),
    )
  }

  function deleteCriterion(propertyId: string, criterionId: string) {
    if (!board) return
    setProperties(
      board.properties.map((p) =>
        p.id !== propertyId ? p : { ...p, criteria: (p.criteria ?? []).filter((c) => c.id !== criterionId) },
      ),
    )
  }

  function renameOption(propertyId: string, optionId: string, label: string) {
    if (!board) return
    setProperties(
      board.properties.map((p) =>
        p.id !== propertyId ? p : { ...p, options: (p.options ?? []).map((o) => (o.id === optionId ? { ...o, label } : o)) },
      ),
    )
  }

  function changeOptionColor(propertyId: string, optionId: string, colorIndex: number) {
    if (!board) return
    setProperties(
      board.properties.map((p) =>
        p.id !== propertyId ? p : { ...p, options: (p.options ?? []).map((o) => (o.id === optionId ? { ...o, colorIndex } : o)) },
      ),
    )
  }

  function deleteOption(propertyId: string, optionId: string) {
    if (!board) return
    setProperties(
      board.properties.map((p) => (p.id !== propertyId ? p : { ...p, options: (p.options ?? []).filter((o) => o.id !== optionId) })),
    )
  }

  // Tek tek deleteOption'ı bir döngüde çağırmak GÜVENLİ değil — her çağrı `board.properties`'i
  // aynı (henüz güncellenmemiş) kapanıştan okuyup sunucuya ayrı bir PATCH atar, sonuncusu
  // öbürlerinin üzerine yazar (Oyuncular gibi çok seçenekli bir sütunda toplu silme "sadece
  // sonuncusu silindi" gibi görünürdü). Bu yüzden filtrelemeyi TEK seferde, tek bir setProperties
  // çağrısıyla yapıyoruz.
  function deleteOptions(propertyId: string, optionIds: string[]) {
    if (!board) return
    const toRemove = new Set(optionIds)
    setProperties(
      board.properties.map((p) => (p.id !== propertyId ? p : { ...p, options: (p.options ?? []).filter((o) => !toRemove.has(o.id)) })),
    )
  }

  // Bir sütunun değerini TÜM satırlarda boşaltır — herhangi bir tip için, sadece Seçim/Çoklu
  // Seçim'e özel değil (kullanıcı: "amaç bi sütunun altındaki satırlardakileri komple
  // silebilmek mesela banner eklenmiş ama ben o bannerları silicem api den çektiricem").
  // Sunucuda TEK seferde yazılıyor (bkz. server/index.js) — satır sayısı çok olabileceği için.
  async function clearColumn(propertyId: string, propertyName: string) {
    if (!board) return
    const ok = await confirm({
      message: `"${propertyName}" sütununun değeri TÜM kayıtlarda boşaltılacak. Bu geri alınamaz, emin misin?`,
      confirmLabel: 'Temizle',
      tone: 'danger',
    })
    if (!ok) return
    const result = await api.clearColumn(board.id, propertyId)
    await reloadRows()
    notify(`"${propertyName}" ${result.count} kayıtta temizlendi.`, 'success')
  }

  function resizeProperty(propertyId: string, width: number) {
    if (!board) return
    setProperties(board.properties.map((p) => (p.id === propertyId ? { ...p, width } : p)))
  }

  function setCoverProperty(propertyId: string | null) {
    saveBoard({ coverPropertyId: propertyId })
  }

  function setTitleImageProperty(propertyId: string | null) {
    saveBoard({ titleImagePropertyId: propertyId })
  }

  // `orderedIds` tabloda GÖRÜNEN sütunların yeni sırası — gizli sütunlar bu listede yok. Eskiden
  // sadece bu liste kaydediliyordu ve gizli sütunlar şemadan siliniyordu (değerleri satırlarda
  // kalsa da sütun kayboluyor, TMDB araması da yerine boş yenilerini açıyordu). Artık listede
  // olmayan sütunlar kendi yerlerinde kalıyor; sadece listedekilerin yerleri kendi aralarında
  // yeni sıraya göre dolduruluyor.
  function reorderProperties(orderedIds: string[]) {
    if (!board) return
    const byId = new Map(board.properties.map((p) => [p.id, p]))
    const moved = orderedIds.map((id) => byId.get(id)).filter((p): p is PropertyDef => Boolean(p))
    const movedIds = new Set(moved.map((p) => p.id))
    let i = 0
    const next = board.properties.map((p) => (movedIds.has(p.id) ? moved[i++] : p))
    setProperties(next)
  }

  function updateCell(rowId: string, propertyId: string, value: PropertyValue) {
    const row = rows.find((r) => r.id === rowId)
    if (!row) return
    saveRow({ values: { ...row.values, [propertyId]: value }, createdAt: row.createdAt, updatedAt: Date.now() }, rowId)
    // Başlık sütununa yazınca, aynı isimde başka bir kayıt zaten varsa bilgilendir — yanlışlıkla
    // aynı içeriği iki kez eklemenin önüne geçmek için (kaydı engellemiyor, sadece uyarıyor).
    // Orjinal Adı'na yazınca da, ve başlık ↔ orijinal ad çapraz karşılaştırılıyor (birinin Türkçe adına
    // İngilizcesi yazılmış olabilir). Daha kesin kontrol TMDB güncellemesinde (aynı TMDB yapımı) ve
    // Sağlık Kontrolü'ndeki "Mükerrer kayıtlar"da.
    const origProp = board ? resolveRole(board, 'orjinalAdi') : undefined
    const nameProps = [board?.titlePropertyId, origProp?.id].filter((x): x is string => Boolean(x))
    if (board && nameProps.includes(propertyId) && typeof value === 'string' && value.trim()) {
      const norm = value.trim().toLocaleLowerCase('tr')
      const dup = rows.find(
        (r) => r.id !== rowId && nameProps.some((pid) => typeof r.values[pid] === 'string' && (r.values[pid] as string).trim().toLocaleLowerCase('tr') === norm),
      )
      if (dup) {
        const t = board.titlePropertyId ? String(dup.values[board.titlePropertyId] ?? '').trim() : ''
        notify(`"${value.trim()}" arşivde zaten var${t && t.toLocaleLowerCase('tr') !== norm ? ` ("${t}")` : ''} — mükerrer olabilir, Sağlık Kontrolü'nden birleştirebilirsin.`)
      }
    }
  }

  // "+ Yeni Ekle" tıklanınca sadece boş bir satır eklemekle kalmıyor, kullanıcıyı da o satıra
  // götürüyor — butonun asıl amacı bu, aksi halde (yeni satır genelde listenin sonuna düştüğü
  // için) kullanıcı elle en alta inmek zorunda kalıyordu.
  async function createRow() {
    const row = await saveRow(emptyRow())
    if (row) setPendingScrollRowId(row.id)
  }

  // Satır menüsündeki "Altına Satır Ekle" (ve "Çoğalt") — listenin sonuna değil, tıklanan
  // satırın HEMEN ALTINA düşsün diye yeni satırın `createdAt`'ı o satırla bir sonraki satır
  // arasına enterpole ediliyor (sıralama tamamen createdAt'a göre, bkz. useRows.ts'teki
  // byCreatedAtAsc) — son satırdan sonra ekleniyorsa sadece +1ms yeterli. `valuesOverride`
  // verilmezse boş bir satır (Ekle), verilirse o değerlerin bir kopyası (Çoğalt) eklenir.
  async function insertRowAfter(afterRowId: string, valuesOverride?: Row['values']) {
    const idx = rows.findIndex((r) => r.id === afterRowId)
    const base = valuesOverride ? { ...emptyRow(), values: valuesOverride } : emptyRow()
    if (idx === -1) {
      const row = await saveRow(base)
      if (row) setPendingScrollRowId(row.id)
      return
    }
    const current = rows[idx].createdAt
    const next = rows[idx + 1]?.createdAt
    const createdAt = next !== undefined && next > current ? (current + next) / 2 : current + 1
    const row = await saveRow({ ...base, createdAt })
    if (row) setPendingScrollRowId(row.id)
  }

  function createRowAfter(afterRowId: string) {
    return insertRowAfter(afterRowId)
  }

  // Satır menüsündeki "Çoğalt" — aynı satırın değerlerinin (JSON ile ayrık) bir kopyasını,
  // orijinalin hemen altına yeni bir kayıt olarak ekler.
  function duplicateRow(rowId: string) {
    const row = rows.find((r) => r.id === rowId)
    if (!row) return
    return insertRowAfter(rowId, JSON.parse(JSON.stringify(row.values)))
  }

  async function deleteRowDirect(rowId: string) {
    const ok = await confirm({ message: 'Bu kaydı silmek istediğine emin misin?', confirmLabel: 'Sil' })
    if (!ok) return
    await removeRow(rowId)
  }

  // Toplu silme (tablo başlığındaki "tümünü seç" ya da tek tek işaretlenen satırlar) —
  // onayı BoardTable'ın kendi toplu-işlem çubuğu zaten soruyor, burada tekrar sormuyoruz
  // (aksi halde N kayıt için N kere "emin misin" sorardı).
  async function bulkDeleteRows(rowIds: string[]) {
    for (const id of rowIds) {
      await removeRow(id)
    }
  }

  // Tablo satırındaki 🔄 butonu — sadece başlığa bakıp TMDB'den film/dizi bilgilerini
  // (poster, banner, ülke, yönetmen, sinopsis, oyuncular, diziyse sezon/bölüm) doldurur/
  // yeniler. Sadece bu tıklama anında TMDB'ye çıkar, sonucu board/rows'a yazar ve
  // buradaki state'i tazeler.
  async function fetchTmdb(rowId: string) {
    if (!board) return
    const result = await api.fetchTmdb(board.id, rowId, [...tmdbExcludeFields], tmdbOverwriteExisting)
    await Promise.all([reloadBoard(), reloadRows()])
    if (result.duplicateOf) {
      notify(`Bu içerik arşivde zaten var: "${result.duplicateOf.title}" — mükerrer olabilir, Sağlık Kontrolü'nden birleştirebilirsin.`, 'danger')
    }
    return result
  }

  // Üstteki "Genel Güncelleme" butonu — tüm arşivi tarayıp eksik görünen (poster/sinopsis/
  // ülke/yönetmen/fragmanından biri boş) her kaydı sırayla TMDB'den doldurur. "Dolu alanları da
  // güncelle" açıksa (tmdbOverwriteExisting) bunun yerine başlığı olan HER kayıt hedef olur —
  // eksik olsun olmasın, zaten dolu alanların üzerine de TMDB'nin güncel verisi yazılır.
  async function handleBulkUpdate() {
    if (!board || bulkUpdating) return
    const targets = tmdbOverwriteExisting ? rows.filter(hasTitleFilled) : rows.filter(isIncomplete)
    if (targets.length === 0) {
      notify(tmdbOverwriteExisting ? 'Başlığı dolu bir kayıt yok.' : 'Eksik görünen bir kayıt yok, hepsi dolu görünüyor.')
      return
    }
    // Eksik sütun ya da kapatılmış alan varsa önce bilgilendirme penceresi (onay yerine geçer).
    let exclude = tmdbExcludeFields
    let muted = false
    try {
      muted = Boolean(adviceMuteKey && localStorage.getItem(adviceMuteKey))
    } catch {
      // yoksa sorulur
    }
    const missing = missingFillColumns(board)
      .filter((f) => !tmdbExcludeFields.has(f.key))
      .map((f) => ({ ...f, candidates: fieldCandidates(board, f.key).map((p) => ({ id: p.id, name: p.name })) }))
    const closed = FETCHABLE_FIELDS.filter((f) => tmdbExcludeFields.has(f.key))
    if (!muted && (missing.length > 0 || closed.length > 0)) {
      const answer = await new Promise<{ skip: string[]; mute: boolean; columns: Record<string, string> } | null>((resolve) =>
        setFillAdvice({ count: targets.length, missing, closed, resolve }),
      )
      setFillAdvice(null)
      if (!answer) return
      if (answer.mute && adviceMuteKey) {
        try {
          localStorage.setItem(adviceMuteKey, '1')
        } catch {
          // olmazsa yine sorulur
        }
      }
      // "Şu var olan sütuna yaz" dediklerini kaydet (sunucu okumadan önce).
      const colEntries = Object.entries(answer.columns)
      if (colEntries.length > 0) {
        const roles = { ...(board.roles ?? {}) }
        let titleImagePropertyId = board.titleImagePropertyId
        for (const [k, pid] of colEntries) {
          if (k === 'kapakAdi') titleImagePropertyId = pid
          else if (FIELD_ROLE[k]) roles[FIELD_ROLE[k]] = pid
        }
        await saveBoard({ roles, titleImagePropertyId })
      }
      // Pencerede verilen karar kalıcı: açılanlar açık, "gelmesin" denenler dişli menüsünde kapalı kalır.
      const asked = new Set([...missing, ...closed].map((f) => f.key))
      exclude = new Set([...[...tmdbExcludeFields].filter((k) => !asked.has(k)), ...answer.skip])
      saveTmdbExclude(exclude)
    } else if (
      !(await confirm({
      message: tmdbOverwriteExisting
        ? `"Dolu alanları da güncelle" açık — ${targets.length} kaydın TÜMÜ (eksik olsun olmasın) TMDB'nin güncel verisiyle güncellenecek. Kayıt sayısına göre biraz sürebilir, istediğin an "Durdur"a basabilirsin.`
        : `${targets.length} kayıt eksik görünüyor (poster, sinopsis, ülke, yönetmen ya da fragmandan biri boş). TMDB'den doldurulsun mu? Kayıt sayısına göre biraz sürebilir, istediğin an "Durdur"a basabilirsin.`,
      confirmLabel: 'Doldur',
      tone: tmdbOverwriteExisting ? 'danger' : 'info',
    }))
    )
      return

    await runBulk({
      ids: targets.map((r) => r.id),
      done: 0,
      total: targets.length,
      updated: 0,
      failed: 0,
      exclude: [...exclude],
      overwrite: tmdbOverwriteExisting,
    })
  }

  function rowTitleOf(row: Row): string {
    const tp = board?.properties.find((p) => p.id === board.titlePropertyId)
    return (tp ? titleText(tp, row.values[tp.id]) : '') || 'İsimsiz'
  }

  async function runBulk(start: BulkSaved) {
    if (!board) return
    setBulkUpdating(true)
    const endBusy = beginBusy()
    bulkCancelRef.current = false
    const state = { ...start, ids: [...start.ids] }
    const log: BulkLogEntry[] = []
    const startedAt = Date.now()
    let sessionDone = 0
    const push = (current: string | null) =>
      setBulk({
        running: true,
        done: state.done,
        total: state.total,
        updated: state.updated,
        failed: state.failed,
        current,
        startedAt,
        sessionDone,
        log: [...log],
      })
    writeBulkSaved(state)
    push(null)

    let sinceReload = 0
    while (state.ids.length > 0) {
      if (bulkCancelRef.current) break
      const rowId = state.ids[0]
      const row = rows.find((r) => r.id === rowId)
      if (!row) {
        // Bu arada silinmiş kayıt: atla.
        state.ids.shift()
        state.done++
        writeBulkSaved(state)
        continue
      }
      const title = rowTitleOf(row)
      push(title)
      try {
        const res = await api.fetchTmdb(board.id, rowId, state.exclude, state.overwrite)
        state.updated++
        const bits = [...res.filled]
        if (res.newEpisodes > 0) bits.push(`${res.newEpisodes} yeni bölüm`)
        if (res.newActors > 0) bits.push(`${res.newActors} yeni oyuncu`)
        log.unshift(
          bits.length > 0
            ? { title, kind: 'ok', text: `${res.mediaType === 'tv' ? 'Dizi' : 'Film'} · eklendi: ${bits.join(', ')}` }
            : { title, kind: 'same', text: 'TMDB\'de bulundu, eklenecek yeni bilgi yoktu' },
        )
      } catch (e) {
        state.failed++
        log.unshift({ title, kind: 'fail', text: e instanceof Error ? e.message.split(' — ')[0] : 'Hata oluştu' })
      }
      if (log.length > 30) log.length = 30
      state.ids.shift()
      state.done++
      sessionDone++
      writeBulkSaved(state)
      if (++sinceReload >= 15) {
        sinceReload = 0
        await Promise.all([reloadBoard(), reloadRows()])
      }
    }

    await Promise.all([reloadBoard(), reloadRows()])
    const stoppedEarly = state.ids.length > 0
    setBulkUpdating(false)
    endBusy()
    setBulk({
      running: false,
      done: state.done,
      total: state.total,
      updated: state.updated,
      failed: state.failed,
      current: null,
      startedAt,
      sessionDone,
      log: [...log],
    })
    notify(
      `${stoppedEarly ? 'Durduruldu — ' : 'Tamamlandı — '}${state.updated} kayıt güncellendi${
        state.failed > 0 ? `, ${state.failed} kayıtta eşleşme bulunamadı/hata oluştu` : ''
      }${stoppedEarly ? `. Kalan ${state.ids.length} kayda "Devam et" ile kaldığın yerden devam edebilirsin.` : '.'}`,
    )
  }

  function resumeBulk() {
    const saved = readBulkSaved()
    if (!saved || bulkUpdating) return
    runBulk(saved)
  }

  function discardBulk() {
    writeBulkSaved(null)
    setBulk(null)
  }

  return (
    <div className="px-4 py-6">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 px-4 sm:px-5 py-4 mb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <button
            onClick={() => navigate('/arsivlerim')}
            title="Arşivlerime dön"
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 hover:text-neutral-50 hover:border-neutral-600 transition"
          >
            <ArrowLeftIcon />
          </button>
          <div className="flex-1 min-w-[12rem]">
            <BoardNameInput name={board.name} onSave={(name) => saveBoard({ name })} />
            <p className="text-xs text-neutral-500 mt-0.5">
              {rows.length} kayıt
              {statusSummary.map((s) => ` · ${s.count} ${s.label.toLocaleLowerCase('tr')}`).join('')}
            </p>
          </div>

        <div className="flex flex-wrap items-center gap-1">
          <TableSearchInput onSearch={setSearch} />
          <FilterPopover board={board} conditions={tableConditions} onChange={setTableConditions} />
          <SortPopover
            sortableProps={sortableProps}
            sortPropertyId={sortPropertyId}
            sortDirection={sortDirection}
            onChange={(propertyId, direction) => {
              setSortPropertyId(propertyId)
              setSortDirection(direction)
            }}
          />
          <ColumnVisibilityPopover
            columns={board.properties.filter((p) => p.id !== board.titlePropertyId)}
            hiddenIds={hiddenColumnIds}
            onToggle={toggleColumnHidden}
          />
          <ToolbarIconButton
            onClick={toggleDensity}
            title={density === 'rahat' ? 'Satırlar: Rahat — sıkıya geçmek için tıkla' : 'Satırlar: Sıkı — rahata geçmek için tıkla'}
            active={density === 'rahat'}
          >
            <DensityIcon roomy={density === 'rahat'} />
          </ToolbarIconButton>
          <ToolbarDivider />
          <TmdbFieldsPopover
            excludedKeys={tmdbExcludeFields}
            onToggle={toggleTmdbField}
            onOpenAll={() => saveTmdbExclude(new Set())}
            board={board}
            onSetColumn={setFieldColumn}
            overwriteExisting={tmdbOverwriteExisting}
            onToggleOverwrite={toggleTmdbOverwrite}
          />
          {bulkUpdating ? (
            <div className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5">
              <BulkRefreshIcon spinning />
              {bulk ? `${bulk.done}/${bulk.total}` : 'Güncelleniyor...'}
              <button onClick={() => (bulkCancelRef.current = true)} className="text-rose-400 hover:underline">
                Durdur
              </button>
            </div>
          ) : bulk && bulk.done < bulk.total ? (
            <ToolbarIconButton onClick={resumeBulk} title={`Devam et — Genel Güncelleme'nin kalan ${bulk.total - bulk.done} kaydı`} active>
              <BulkRefreshIcon />
            </ToolbarIconButton>
          ) : (
            <ToolbarIconButton onClick={handleBulkUpdate} title="Genel Güncelleme — eksik kayıtları TMDB'den doldur">
              <BulkRefreshIcon />
            </ToolbarIconButton>
          )}

          <ToolbarDivider />
          <ToolbarIconButton onClick={() => setHistoryFor({ row: null })} title="Geçmiş — arşivdeki bütün değişiklikler, geri alma">
            <HistoryIcon />
          </ToolbarIconButton>
          <ToolbarIconButton onClick={() => setHealthOpen(true)} title="Sağlık Kontrolü — sorunlu kayıtları listele">
            <HealthIcon />
          </ToolbarIconButton>
          <ToolbarIconButton onClick={() => setDiscoverOpen(true)} title="Keşfet — arşivinde olmayan içerikleri bul">
            <CompassIcon />
          </ToolbarIconButton>

          <ToolbarIconButton onClick={() => setGuideOpen(true)} title="Bu tablo nasıl kullanılır?">
            <InfoIcon />
          </ToolbarIconButton>

          <button
            onClick={createRow}
            style={primaryButtonStyle}
            className={`ml-1 text-sm px-3 py-1.5 rounded-lg whitespace-nowrap ${PRIMARY_BUTTON}`}
          >
            + Yeni Ekle
          </button>
        </div>
        </div>
      </section>

      {bulk && (
        <BulkUpdatePanel state={bulk} onStop={() => (bulkCancelRef.current = true)} onResume={resumeBulk} onDiscard={discardBulk} />
      )}

      {statusProp && statusSummary.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4">
          {[{ id: null as string | null, label: 'Hepsi', count: rows.length, colorIndex: -1 }, ...statusSummary].map((s) => {
            const active =
              s.id === null
                ? tableConditions.length === 0
                : tableConditions.length === 1 &&
                  tableConditions[0].propertyId === statusProp.id &&
                  tableConditions[0].exclude.length === 0 &&
                  tableConditions[0].include.length === 1 &&
                  tableConditions[0].include[0] === s.id
            const c = s.colorIndex >= 0 ? OPTION_COLORS[s.colorIndex % OPTION_COLORS.length] : null
            return (
              <button
                key={s.id ?? 'hepsi'}
                onClick={() => (s.id === null ? setFilter(null, null) : setFilter(statusProp.id, s.id))}
                className={`shrink-0 inline-flex items-center gap-2 text-sm rounded-full border px-3.5 py-1.5 transition ${
                  active ? 'border-[#00c0fa]/50 bg-[#00c0fa]/10 text-neutral-50' : 'border-neutral-800 text-neutral-400 hover:text-neutral-100 hover:border-neutral-600'
                }`}
              >
                {c && <span className={`h-2 w-2 rounded-full border ${c.bg} ${c.border}`} />}
                {s.label}
                <span className={`text-xs tabular-nums ${active ? 'text-[#00c0fa]' : 'text-neutral-500'}`}>{s.count}</span>
              </button>
            )
          })}
        </div>
      )}

      {rowsLoading ? (
        <p className="text-neutral-500 text-sm">Yükleniyor...</p>
      ) : (
        <BoardTable
          ref={boardTableRef}
          board={board}
          rows={filteredRows}
          hiddenColumnIds={hiddenColumnIds}
          onAddProperty={addProperty}
          onDeleteProperty={deleteProperty}
          onRenameProperty={renameProperty}
          onChangePropertyType={changePropertyType}
          onResizeProperty={resizeProperty}
          onRenameOption={renameOption}
          onChangeOptionColor={changeOptionColor}
          onDeleteOption={deleteOption}
          onDeleteOptions={deleteOptions}
          onClearColumn={clearColumn}
          onAddOption={addOptionToProperty}
          onAddCriterion={addCriterionToProperty}
          onRenameCriterion={renameCriterion}
          onDeleteCriterion={deleteCriterion}
          onUpdateCell={updateCell}
          onCreateRow={createRow}
          onAddRowAfter={createRowAfter}
          onDuplicateRow={duplicateRow}
          onDeleteRow={deleteRowDirect}
          onShowRowHistory={(row) => setHistoryFor({ row })}
          onOpenDetail={setDetailRow}
          onBulkDeleteRows={bulkDeleteRows}
          onReorderProperties={reorderProperties}
          onSetCoverProperty={setCoverProperty}
          onSetTitleImageProperty={setTitleImageProperty}
          onSetPropertyRole={setPropertyRole}
          onSetStatusOption={setStatusOption}
          onFetchTmdb={fetchTmdb}
          density={density}
        />
      )}

      {!rowsLoading && filteredRows.length !== rows.length && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-sm text-neutral-500">
          <span>
            {rows.length} kayıttan <span className="text-neutral-200 font-medium">{filteredRows.length}</span> tanesi gösteriliyor
          </span>
          {tableConditions.length > 0 && (
            <button onClick={() => setTableConditions([])} className="text-[#00c0fa] hover:underline">
              Filtreyi temizle
            </button>
          )}
          {search && <span className="text-neutral-600">(arama açık — büyüteçteki kutuyu boşaltınca hepsi gelir)</span>}
        </div>
      )}

      {detailRow && (
        <RowDetailModal
          board={board}
          row={rows.find((r) => r.id === detailRow.id) ?? detailRow}
          onClose={() => setDetailRow(null)}
          editable
          onFetchTmdb={fetchTmdb}
        />
      )}

      {guideOpen && <TableGuideModal onClose={() => setGuideOpen(false)} />}

      {historyFor && (
        <HistoryModal
          board={board}
          row={historyFor.row}
          onClose={() => setHistoryFor(null)}
          onChanged={() => {
            reloadBoard()
            reloadRows()
          }}
        />
      )}

      {fillAdvice && (
        <TmdbFillAdviceModal
          count={fillAdvice.count}
          overwrite={tmdbOverwriteExisting}
          missing={fillAdvice.missing}
          closed={fillAdvice.closed}
          onDone={fillAdvice.resolve}
        />
      )}

      {discoverOpen && <DiscoverModal boardId={board.id} exclude={[...tmdbExcludeFields]} onClose={() => setDiscoverOpen(false)} />}

      {healthOpen && (
        <HealthCheckModal
          board={board}
          rows={rows}
          missingImageRows={missingImageRows}
          incompleteRows={incompleteRowsForHealth}
          incompleteChecks={incompletenessChecks}
          onIgnore={(rowIds, propertyId) => {
            const next = { ...(board.healthIgnore ?? {}) }
            for (const id of rowIds) next[id] = [...new Set([...(next[id] ?? []), propertyId])]
            saveBoard({ healthIgnore: next })
            const name = board.properties.find((p) => p.id === propertyId)?.name ?? 'Bu alan'
            notify(rowIds.length === 1 ? `Bu kayıtta ${name} artık sorulmayacak.` : `${rowIds.length} kayıtta ${name} artık sorulmayacak.`)
          }}
          onUnignore={(pairs) => {
            const next = { ...(board.healthIgnore ?? {}) }
            for (const { rowId, propertyId } of pairs) {
              const left = (next[rowId] ?? []).filter((id) => id !== propertyId)
              if (left.length) next[rowId] = left
              else delete next[rowId]
            }
            saveBoard({ healthIgnore: next })
            notify(pairs.length === 1 ? 'Bu alan yine sorulacak.' : `${pairs.length} alan yine sorulacak.`)
          }}
          onResetIgnored={() => {
            saveBoard({ healthIgnore: {} })
            notify('Sorulmayan alanların hepsi yine sorulacak.')
          }}
          onOpenRow={(row) => {
            setHealthOpen(false)
            setDetailRow(row)
          }}
          onMerge={async (keepId, removeIds) => {
            try {
              const res = await api.mergeRows(board.id, keepId, removeIds)
              await reloadRows()
              notify(
                res.movedFields.length > 0
                  ? `${removeIds.length} mükerrer kayıt birleştirildi, aktarılan: ${res.movedFields.join(', ')}`
                  : `${removeIds.length} mükerrer kayıt silindi (aktarılacak ek bilgi yoktu).`,
                'success',
              )
            } catch {
              notify('Birleştirilemedi.', 'danger')
            }
          }}
          onIgnoreDuplicate={(rowIds) => {
            const pairs = new Set(board.duplicateIgnore ?? [])
            for (const a of rowIds) for (const b of rowIds) if (a < b) pairs.add(`${a}|${b}`)
            saveBoard({ duplicateIgnore: [...pairs] })
            notify('Bu kayıtlar bir daha mükerrer diye gösterilmeyecek.')
          }}
          onClose={() => setHealthOpen(false)}
        />
      )}
    </div>
  )
}
