import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useBoard } from '../hooks/useBoard'
import { useBoards } from '../hooks/useBoards'
import { useRows } from '../hooks/useRows'
import { api } from '../lib/api'
import {
  emptyRow,
  makeId,
  ratingAverage,
  type PropertyDef,
  type PropertyType,
  type PropertyValue,
  type Row,
  type SelectOption,
} from '../types'
import { rowMatchesFilter } from '../components/BoardGallery'
import { hasAnyImage } from '../lib/rowMeta'
import BoardTable, { type BoardTableHandle } from '../components/BoardTable'
import RowDetailModal from '../components/RowDetailModal'
import HealthCheckModal from '../components/HealthCheckModal'
import TableGuideModal from '../components/TableGuideModal'
import OptionBadge from '../components/OptionBadge'
import ToggleSwitch from '../components/ToggleSwitch'
import Select from '../components/Select'
import { useToast } from '../hooks/useToast'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import {
  BulkRefreshIcon,
  ColumnsIcon,
  FilterIcon,
  GearIcon,
  HealthIcon,
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
function TmdbFieldsPopover({
  excludedKeys,
  onToggle,
  overwriteExisting,
  onToggleOverwrite,
}: {
  excludedKeys: Set<string>
  onToggle: (key: string) => void
  overwriteExisting: boolean
  onToggleOverwrite: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <ToolbarIconButton
        onClick={() => setOpen((v) => !v)}
        title="API'den hangi alanlar çekilsin"
        active={excludedKeys.size > 0 || overwriteExisting}
      >
        <GearIcon />
      </ToolbarIconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-72 bg-neutral-900 border border-neutral-800 rounded-xl p-2 shadow-lg">
            <p className="text-[11px] text-neutral-500 px-2 pb-1.5">
              "API eşitle" (tek satır ya da Genel Güncelleme) sadece işaretli alanları doldursun — aşağıdaki anahtar
              kapalıyken zaten dolu bir alana dokunulmaz, sadece boşken doldurulur.
            </p>
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-800 border-b border-neutral-800 mb-1">
              <span className="text-sm text-neutral-300">Dolu alanları da güncelle</span>
              <ToggleSwitch checked={overwriteExisting} onChange={onToggleOverwrite} label="Dolu alanları da güncelle" />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-0.5">
              {FETCHABLE_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-800">
                  <span className="text-sm text-neutral-300 truncate">{f.label}</span>
                  <ToggleSwitch checked={!excludedKeys.has(f.key)} onChange={() => onToggle(f.key)} label={f.label} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Toolbar ikon butonları (arama/filtre/sırala) için ortak görünüm — ikisi de "kapalıyken
// ikon, tıklanınca genişleyen" mantığıyla çalışıyor (bkz. GlobalSearch.tsx'teki aynı desen).
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
  return (
    <button
      onClick={onClick}
      title={title}
      className={`h-9 w-9 flex items-center justify-center rounded-lg transition ${
        active ? 'text-[#00c0fa] bg-[#015eea]/10' : 'text-neutral-400 hover:text-[#00c0fa] hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
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
    const dates = Array.isArray(v) ? (v as string[]) : []
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
// sütun + seçenek seçimi. Bir filtre aktifken ikon mavi kalıyor (uygulanmış olduğunu
// hatırlatmak için) — panel kapalı olsa bile.
function FilterPopover({
  filterableProps,
  activeFilterProp,
  filterPropertyId,
  selectedOption,
  showOptionSearch,
  optionSearch,
  setOptionSearch,
  visibleOptions,
  optionCount,
  setFilter,
}: {
  filterableProps: PropertyDef[]
  activeFilterProp: PropertyDef | null
  filterPropertyId: string | null
  selectedOption: SelectOption | null
  showOptionSearch: boolean
  optionSearch: string
  setOptionSearch: (v: string) => void
  visibleOptions: SelectOption[]
  optionCount: number
  setFilter: (propertyId: string | null, optionId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  if (filterableProps.length === 0) return null

  return (
    <div className="relative">
      <ToolbarIconButton onClick={() => setOpen((v) => !v)} title="Filtrele" active={Boolean(filterPropertyId)}>
        <FilterIcon />
      </ToolbarIconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-72 bg-neutral-900 border border-neutral-800 rounded-xl p-3 shadow-lg space-y-2">
            <Select
              value={filterPropertyId ?? ''}
              onChange={(v) => {
                setFilter(v || null, null)
                setOptionSearch('')
              }}
              options={[{ value: '', label: 'Filtrele...' }, ...filterableProps.map((p) => ({ value: p.id, label: p.name }))]}
            />

            {activeFilterProp && (
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedOption && (
                  <OptionBadge
                    label={selectedOption.label}
                    colorIndex={selectedOption.colorIndex}
                    image={selectedOption.image}
                    selected
                    onClick={() => setFilter(filterPropertyId, null)}
                  />
                )}
                {showOptionSearch && (
                  <input
                    value={optionSearch}
                    onChange={(e) => setOptionSearch(e.target.value)}
                    placeholder={`${activeFilterProp.name} ara... (${optionCount})`}
                    className="w-full text-sm bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-neutral-300 outline-none"
                  />
                )}
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {visibleOptions.map((o) => (
                    <OptionBadge
                      key={o.id}
                      label={o.label}
                      colorIndex={o.colorIndex}
                      image={o.image}
                      onClick={() => {
                        setFilter(filterPropertyId, o.id)
                        setOptionSearch('')
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
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
              Kapattığın sütunlar bu tarayıcıda kalıcı olarak gizlenir, veriler silinmez.
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
  const [optionSearch, setOptionSearch] = useState('')
  const [sortPropertyId, setSortPropertyId] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Hangi sütunların kapalı olduğu bu tarayıcıda kalıcı (localStorage) — sekme/tarayıcı/
  // bilgisayar kapansa da kaybolmasın diye. Arşive özel (id bazlı anahtar): farklı arşivlerin
  // sütunları birbirini etkilemesin.
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
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const bulkCancelRef = useRef(false)

  // Filtre URL'de tutuluyor (?filterProp=&filterOption=) — böylece başka bir yerden (ör.
  // detay penceresindeki bir oyuncu rozetine tıklayınca) doğrudan bu arşive, o değere göre
  // filtrelenmiş halde bağlantı verebiliyoruz.
  const [searchParams, setSearchParams] = useSearchParams()
  const filterPropertyId = searchParams.get('filterProp')
  const filterOptionId = searchParams.get('filterOption')

  function setFilter(propertyId: string | null, optionId: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (propertyId) next.set('filterProp', propertyId)
      else next.delete('filterProp')
      if (optionId) next.set('filterOption', optionId)
      else next.delete('filterOption')
      return next
    })
  }

  const filterableProps = useMemo(
    () => board?.properties.filter((p) => p.type === 'select' || p.type === 'multiselect') ?? [],
    [board],
  )
  const activeFilterProp = filterableProps.find((p) => p.id === filterPropertyId) ?? null
  const selectedOption = activeFilterProp?.options?.find((o) => o.id === filterOptionId) ?? null

  // Oyuncular gibi yüzlerce/binlerce seçeneği olan bir sütunda hepsini tek seferde rozet
  // olarak dökmek kullanılamaz bir duvar yaratıyordu — belli bir sayıdan sonra arama kutusu
  // çıkıyor ve aratmadan liste boş kalıyor (sadece seçili olan her zaman ayrı gösteriliyor).
  const optionCount = activeFilterProp?.options?.length ?? 0
  const showOptionSearch = optionCount > 12
  const optionQuery = optionSearch.trim().toLocaleLowerCase('tr')
  const visibleOptions = (activeFilterProp?.options ?? [])
    .filter((o) => o.id !== filterOptionId)
    .filter((o) => {
      if (optionQuery) return o.label.toLocaleLowerCase('tr').includes(optionQuery)
      return !showOptionSearch
    })
    .slice(0, 100)

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

  const filteredRows = useMemo(() => {
    if (!board) return []
    const result = rows.filter((row) => {
      if (!rowMatchesFilter(row, filterPropertyId, filterOptionId)) return false
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
    return result
  }, [rows, filterPropertyId, filterOptionId, search, board, sortProperty, sortDirection, searchOptionMaps])

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
  const posterProp = board?.properties.find((p) => p.name === 'Poster' && p.type === 'image')
  const synopsisProp = board?.properties.find((p) => p.type === 'longtext')
  const videoProp = board?.properties.find((p) => p.name.toLocaleLowerCase('tr') === 'video' && p.type === 'url')
  const ulkeProp = board?.properties.find((p) => p.name === 'Ülke' && p.type === 'multiselect')
  const yonetmenProp = board?.properties.find((p) => p.name === 'Yönetmen' && p.type === 'text')
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
    return incompletenessChecks.some((p) => {
      const v = row.values[p.id]
      return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    })
  }

  // Sağlık Kontrolü panelinin ilk iki listesi — board+rows'tan saf istemci tarafında
  // hesaplanabiliyor, üçüncü liste (bozuk dosya bağlantıları) modalın kendisi açılınca
  // ayrıca sunucudan çekiliyor (bkz. HealthCheckModal.tsx).
  const [healthOpen, setHealthOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
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
    if (filterPropertyId === propertyId) setFilter(null, null)
  }

  function renameProperty(propertyId: string, name: string) {
    if (!board) return
    setProperties(board.properties.map((p) => (p.id === propertyId ? { ...p, name } : p)))
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

  function reorderProperties(orderedIds: string[]) {
    if (!board) return
    const byId = new Map(board.properties.map((p) => [p.id, p]))
    const next = orderedIds.map((id) => byId.get(id)).filter((p): p is PropertyDef => Boolean(p))
    setProperties(next)
  }

  function updateCell(rowId: string, propertyId: string, value: PropertyValue) {
    const row = rows.find((r) => r.id === rowId)
    if (!row) return
    saveRow({ values: { ...row.values, [propertyId]: value }, createdAt: row.createdAt, updatedAt: Date.now() }, rowId)
    // Başlık sütununa yazınca, aynı isimde başka bir kayıt zaten varsa bilgilendir — yanlışlıkla
    // aynı içeriği iki kez eklemenin önüne geçmek için (kaydı engellemiyor, sadece uyarıyor).
    if (board && propertyId === board.titlePropertyId && typeof value === 'string' && value.trim()) {
      const norm = value.trim().toLocaleLowerCase('tr')
      const dup = rows.find(
        (r) => r.id !== rowId && typeof r.values[propertyId] === 'string' && (r.values[propertyId] as string).trim().toLocaleLowerCase('tr') === norm,
      )
      if (dup) notify(`"${value.trim()}" adında zaten bir kayıt var — yine de aynı isimde ikinci bir kayıt eklendi.`)
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
    const ok = await confirm({
      message: tmdbOverwriteExisting
        ? `"Dolu alanları da güncelle" açık — ${targets.length} kaydın TÜMÜ (eksik olsun olmasın) TMDB'nin güncel verisiyle güncellenecek. Kayıt sayısına göre biraz sürebilir, istediğin an "Durdur"a basabilirsin.`
        : `${targets.length} kayıt eksik görünüyor (poster, sinopsis, ülke, yönetmen ya da fragmandan biri boş). TMDB'den doldurulsun mu? Kayıt sayısına göre biraz sürebilir, istediğin an "Durdur"a basabilirsin.`,
      confirmLabel: 'Doldur',
      tone: tmdbOverwriteExisting ? 'danger' : 'info',
    })
    if (!ok) return

    setBulkUpdating(true)
    bulkCancelRef.current = false
    let updated = 0
    let failed = 0

    for (let i = 0; i < targets.length; i++) {
      if (bulkCancelRef.current) break
      setBulkProgress({ done: i, total: targets.length })
      try {
        await api.fetchTmdb(board.id, targets[i].id, [...tmdbExcludeFields], tmdbOverwriteExisting)
        updated++
      } catch {
        failed++
      }
      if (i % 15 === 14) await Promise.all([reloadBoard(), reloadRows()])
    }

    await Promise.all([reloadBoard(), reloadRows()])
    const stoppedEarly = bulkCancelRef.current
    setBulkProgress(null)
    setBulkUpdating(false)
    notify(
      `${stoppedEarly ? 'Durduruldu — ' : 'Tamamlandı — '}${updated} kayıt güncellendi${
        failed > 0 ? `, ${failed} kayıtta eşleşme bulunamadı/hata oluştu` : ''
      }.`,
    )
  }

  return (
    <div className="px-4 py-6">
      <button
        onClick={() => navigate('/arsivlerim')}
        className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-50 border border-neutral-800 hover:border-neutral-600 rounded-lg px-3 py-1.5 mb-3 transition"
      >
        <ArrowLeftIcon />
        Arşivlerim
      </button>
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <BoardNameInput name={board.name} onSave={(name) => saveBoard({ name })} />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <TableSearchInput onSearch={setSearch} />
          <FilterPopover
            filterableProps={filterableProps}
            activeFilterProp={activeFilterProp}
            filterPropertyId={filterPropertyId}
            selectedOption={selectedOption}
            showOptionSearch={showOptionSearch}
            optionSearch={optionSearch}
            setOptionSearch={setOptionSearch}
            visibleOptions={visibleOptions}
            optionCount={optionCount}
            setFilter={setFilter}
          />
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
          <TmdbFieldsPopover
            excludedKeys={tmdbExcludeFields}
            onToggle={toggleTmdbField}
            overwriteExisting={tmdbOverwriteExisting}
            onToggleOverwrite={toggleTmdbOverwrite}
          />
          <ToolbarIconButton onClick={() => setHealthOpen(true)} title="Sağlık Kontrolü — sorunlu kayıtları listele">
            <HealthIcon />
          </ToolbarIconButton>

          {bulkUpdating ? (
            <div className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5">
              <BulkRefreshIcon spinning />
              {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : 'Güncelleniyor...'}
              <button onClick={() => (bulkCancelRef.current = true)} className="text-rose-400 hover:underline">
                Durdur
              </button>
            </div>
          ) : (
            <ToolbarIconButton onClick={handleBulkUpdate} title="Genel Güncelleme — eksik kayıtları TMDB'den doldur">
              <BulkRefreshIcon />
            </ToolbarIconButton>
          )}

          <ToolbarIconButton onClick={() => setGuideOpen(true)} title="Bu tablo nasıl kullanılır?">
            <InfoIcon />
          </ToolbarIconButton>

          <button
            onClick={createRow}
            style={primaryButtonStyle}
            className={`text-sm px-3 py-1.5 rounded-lg whitespace-nowrap ${PRIMARY_BUTTON}`}
          >
            + Yeni Ekle
          </button>
        </div>
      </div>

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
          onOpenDetail={setDetailRow}
          onBulkDeleteRows={bulkDeleteRows}
          onReorderProperties={reorderProperties}
          onSetCoverProperty={setCoverProperty}
          onSetTitleImageProperty={setTitleImageProperty}
          onFetchTmdb={fetchTmdb}
        />
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

      {healthOpen && (
        <HealthCheckModal
          board={board}
          rows={rows}
          missingImageRows={missingImageRows}
          incompleteRows={incompleteRowsForHealth}
          incompleteChecks={incompletenessChecks}
          onOpenRow={(row) => {
            setHealthOpen(false)
            setDetailRow(row)
          }}
          onClose={() => setHealthOpen(false)}
        />
      )}
    </div>
  )
}
