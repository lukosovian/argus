import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import type { Board, PropertyDef, Row } from '../types'
import { titleText } from '../types'
import { HomeCard } from '../pages/AnaSayfa'

const MAX_RESULTS = 30

// propertyId -> (optionId -> label) — select/multiselect etiketlerini her tuş vuruşunda
// `.find()` ile ~11.500 seçenek arasında tek tek aramak yerine (Oyuncular listesi bu
// büyüklüğe ulaştıktan sonra aramayı ciddi şekilde yavaşlatan asıl sebep buydu, bkz.
// BoardTable.tsx'teki aynı sınıf performans düzeltmesi) O(1) bakışla çözülsün diye.
type OptionMaps = Map<string, Map<string, string>>

function buildOptionMaps(board: Board): OptionMaps {
  const maps: OptionMaps = new Map()
  for (const p of board.properties) {
    if (p.type !== 'select' && p.type !== 'multiselect') continue
    const m = new Map<string, string>()
    for (const o of p.options ?? []) m.set(o.id, o.label)
    maps.set(p.id, m)
  }
  return maps
}

// Eşleşmeyi tek bir "var/yok" yerine bir sıralama puanına çeviriyoruz — kullanıcı "harry"
// yazınca başlığı "Harry Potter..." olan kayıt en üstte çıksın, adında hiç geçmeyip sadece
// bir oyuncusu/başka bir alanı eşleşen bir kayıt (ör. bir oyuncunun oynadığı "Dolittle")
// daha aşağıda kalsın. Düşük puan = daha iyi eşleşme.
function matchScore(
  board: Board,
  row: Row,
  query: string,
  titleProp: PropertyDef | undefined,
  optionMaps: OptionMaps,
): number | null {
  const title = titleProp ? titleText(titleProp, row.values[titleProp.id]).toLocaleLowerCase('tr') : ''
  if (title) {
    if (title.startsWith(query)) return 0
    if (title.includes(query)) return 1
  }
  for (const p of board.properties) {
    if (p.id === titleProp?.id) continue
    const v = row.values[p.id]
    if (v === undefined || v === null || v === '') continue
    if (p.type === 'select') {
      const label = optionMaps.get(p.id)?.get(v as string)
      if (label && label.toLocaleLowerCase('tr').includes(query)) return 2
    } else if (p.type === 'multiselect' && Array.isArray(v)) {
      const map = optionMaps.get(p.id)
      if (map && v.some((id) => map.get(id)?.toLocaleLowerCase('tr').includes(query))) return 2
    } else if (typeof v === 'string' && (p.type === 'text' || p.type === 'longtext' || p.type === 'url')) {
      if (v.toLocaleLowerCase('tr').includes(query)) return 2
    }
  }
  return null
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows } = useRows(settings.boardId ?? undefined)

  const query = q.trim().toLocaleLowerCase('tr')
  const titleProp = useMemo(
    () => (board ? board.properties.find((p) => p.id === board.titlePropertyId) : undefined),
    [board],
  )
  const optionMaps = useMemo(() => (board ? buildOptionMaps(board) : new Map()), [board])

  const results = useMemo(() => {
    if (!query || !board) return []
    const scored: { row: Row; score: number }[] = []
    for (const r of rows) {
      const score = matchScore(board, r, query, titleProp, optionMaps)
      if (score !== null) scored.push({ row: r, score })
    }
    scored.sort((a, b) => a.score - b.score)
    return scored.slice(0, MAX_RESULTS).map((s) => s.row)
  }, [query, board, rows, titleProp, optionMaps])

  // Ana sayfa hangi kart şeklini kullanıyorsa (dikey afiş ya da geniş "yatay" küçük resim)
  // sonuçlar da aynı şekli kullansın istendi — burada sabit bir şekil seçmek yerine aynı
  // ayarı okuyoruz.
  const landscape = settings.layout === 'yatay'

  // Arama açıkken bir sonuca tıklayıp detay penceresini açtıktan sonra, oradan bir oyuncuya
  // tıklayıp "İçerikleri gör" ile bambaşka bir filtrelenmiş listeye (?filterProp=...) ya da bir
  // bölüme (?bolum=...) geçildiğinde — arama kendi state'ini (open/q) hâlâ koruduğu için eski
  // arama sonuçları paneli yeni sayfanın ÜSTÜNDE kalıp altındaki gerçek içeriği görünmez
  // kılıyordu; kullanıcı görebilmek için aramayı elle kapatmak zorunda kalıyordu. Böyle bir
  // "başka bir filtreye/bölüme geçildi" navigasyonu olduğunda aramayı otomatik kapatıyoruz —
  // sadece kendi sonucuna (?detay=...) tıklanan durumda kasıtlı olarak açık bırakıyoruz.
  useEffect(() => {
    if (searchParams.get('filterProp') || searchParams.get('bolum')) {
      setOpen(false)
      setQ('')
    }
  }, [searchParams])

  // Kutu açık ama BOŞSA (henüz bir sonuç paneli yokken) başka bir yere tıklamak kapatsın —
  // sonuç paneli varken (query doluyken) kasıtlı olarak kapatmıyoruz: o panel `createPortal`
  // ile body'ye taşındığı için bu sarmalayıcının DIŞINDA sayılır, bir sonuç kartına tıklamak
  // da "dışarı tıklama" gibi görünüp aramayı istemeden kapatırdı (bkz. yukarıdaki "sonuçların
  // üzerinde kalmaya devam edersin" notu).
  useEffect(() => {
    if (!open || query) return
    function onOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open, query])

  // Karta tıklayınca detay penceresi açılır ama arama sonuçları (ve yazdığın metin) kaybolmaz —
  // detay penceresi kapatılınca aynı arama sonuçlarının üzerinde kalmaya devam edersin.
  function openResult(rowId: string) {
    navigate(`/?detay=${rowId}`)
  }

  function close() {
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={wrapperRef} className="relative flex items-center">
      {open && (
        <div className="absolute right-11 top-0 z-40 flex items-center">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Arama yap..."
            disabled={!board}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            className="w-64 rounded-lg bg-neutral-900 border border-neutral-700 pl-3 pr-8 py-2 text-neutral-100 outline-none focus:border-[#00c0fa] text-sm disabled:opacity-50"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              title="Aramayı temizle"
              className="absolute right-2 h-5 w-5 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-50 hover:bg-neutral-700 transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-neutral-900 text-neutral-50 hover:text-[#00c0fa] transition relative z-40"
        title="Ara"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>

      {/* Sonuçlar geldiğinde sayfanın kendi içeriğinin (vitrin vb.) üzerine, navbar'ın hemen
          altına tam genişlikte biner — arama kutusu boşalınca (ya da kapatılınca) kaybolup
          altta hep aynı yerde duran gerçek sayfa içeriği tekrar görünür olur. Boş bir yere
          tıklamak artık kapatmıyor — sadece kutuyu temizlemek/Escape kapatıyor.
          `createPortal` ile `document.body`'ye taşınıyor: bu panel `<header>`'ın içinde
          kalsaydı, sayfa kaydırılınca navbar'ın kendi arka planı `backdrop-blur` almaya
          başlıyor (Navbar.tsx'teki `scrolled` durumu) — CSS'te `backdrop-filter` bir öğeyi
          `position: fixed` torunları için yeni bir "containing block" yapar, yani bu panel
          artık ekrana değil o küçük navbar kutusuna göre sabitlenmiş oluyordu ve aşağı
          kayınca gözden kayboluyordu. Body'ye taşınınca bu sorun kökten ortadan kalkıyor. */}
      {open &&
        query &&
        createPortal(
          <div className="fixed inset-x-0 top-16 bottom-0 z-30 bg-neutral-950 overflow-y-auto">
            <div className="px-4 py-6">
              <h2 className="text-lg font-semibold text-neutral-200 mb-3">"{q}" için sonuçlar</h2>
              {results.length > 0 && board ? (
                // flex-wrap'te kartlar kendi aralarında sıkı diziliyordu ama her satırın SONUNDA
                // (satır tam kartla bölünmeyince) sabit bir boşluk kalıyordu — kartlar sabit
                // piksel genişlikte olduğu için satır genişliği tam katlarına gelmiyordu.
                // `auto-fill`+`minmax(...,1fr)` ile sığan kadar sütun açılıp kalan pay o
                // sütunlara EŞİT dağıtılıyor, satırın sonunda tek bir boş blok kalmıyor — kart
                // da `fill` ile o sütunun tamamını dolduruyor (HomeCard'daki sabit w-36/w-64 yerine).
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${landscape ? '15rem' : '8.5rem'}, 1fr))` }}
                >
                  {results.map((r) => (
                    <HomeCard key={r.id} board={board} row={r} landscape={landscape} fill onOpenDetail={(row) => openResult(row.id)} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Sonuç bulunamadı.</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
