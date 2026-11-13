import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import type { Board, PropertyDef, Row, SelectOption } from '../types'
import { titleText } from '../types'
import { HomeCard } from '../pages/AnaSayfa'
import { tt, ttx } from '../lib/i18n'
import { MOBILE } from '../lib/mobile/ui'
import Icon from './Icon'

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
    return scored.slice(0, MAX_RESULTS)
  }, [query, board, rows, titleProp, optionMaps])
  const titleResults = results.filter((r) => r.score <= 1).map((r) => r.row)
  const otherResults = results.filter((r) => r.score > 1).map((r) => r.row)

  // Aranan şey bir oyuncuya, türe, ülkeye… (seçim sütunlarının değerleri) uyuyorsa onları da ayrı bir
  // satırda göster — tıklayınca o değerin listesi açılır (detay penceresindeki oyuncu tıklamasıyla aynı).
  // Kullanıcı adı yazınca ("Tom") oyuncunun kendisine gidebilsin diye.
  const tagMatches = useMemo(() => {
    if (!query || !board) return [] as { prop: PropertyDef; opt: SelectOption; count: number }[]
    const counts = new Map<string, number>()
    for (const r of rows) {
      for (const p of board.properties) {
        if (p.type !== 'select' && p.type !== 'multiselect') continue
        const v = r.values[p.id]
        for (const id of Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []) {
          const k = p.id + ':' + id
          counts.set(k, (counts.get(k) ?? 0) + 1)
        }
      }
    }
    const out: { prop: PropertyDef; opt: SelectOption; count: number }[] = []
    for (const p of board.properties) {
      if (p.type !== 'select' && p.type !== 'multiselect') continue
      for (const o of p.options ?? []) {
        const label = o.label.toLocaleLowerCase('tr')
        const count = counts.get(p.id + ':' + o.id) ?? 0
        if (count > 0 && label.includes(query)) out.push({ prop: p, opt: o, count })
      }
    }
    // Adı arananla başlayanlar ve fotoğraflılar önce, sonra kayıt sayısı.
    out.sort(
      (a, b) =>
        Number(b.opt.label.toLocaleLowerCase('tr').startsWith(query)) - Number(a.opt.label.toLocaleLowerCase('tr').startsWith(query)) ||
        Number(Boolean(b.opt.image)) - Number(Boolean(a.opt.image)) ||
        b.count - a.count,
    )
    return out.slice(0, 12)
  }, [query, board, rows])

  // Ana sayfa hangi kart şeklini kullanıyorsa (dikey afiş ya da geniş "yatay" küçük resim)
  // sonuçlar da aynı şekli kullansın istendi — burada sabit bir şekil seçmek yerine aynı
  // ayarı okuyoruz.
  const landscape = settings.layout !== 'izgara'

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
  // Sonuç katmanı açıkken arkadaki sayfanın kendi kaydırma çubuğu da görünüyordu (sağda iki çubuk) —
  // katman açık olduğu sürece sayfanın kaydırması kapatılıyor, kapanınca eski haline dönüyor.
  const resultsOpen = open && Boolean(query)
  useEffect(() => {
    if (!resultsOpen) return
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prev
    }
  }, [resultsOpen])

  // Arama açılıp kapanınca haber ver — arşiv tablosunun menüye taşınan araç çubuğu arama açıkken gizlenir
  // (bkz. BoardView; kullanıcı "arama yaparken görünmesin" dedi).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('argus-global-search', { detail: { open } }))
  }, [open])

  // Klavyeden "/" ile aramayı aç (bir yazı kutusunun içindeyken değil).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl+K her yerden (yazı kutusunun içindeyken de) açar; "/" sadece yazı kutusu dışındayken
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
        return
      }
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function openTag(propertyId: string, optionId: string) {
    close()
    navigate(`/?filterProp=${propertyId}&filterOption=${optionId}`)
  }

  function openResult(rowId: string) {
    navigate(`/?detay=${rowId}`)
  }

  function close() {
    setOpen(false)
    setQ('')
  }

  // Telefonda: arama tam ekran ayrı bir sayfada açılır (kullanıcı "arama kısmı yeni ekrana açılabilir" dedi)
  if (MOBILE) {
    const cover = board?.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
    const titleP = board?.properties.find((p) => p.id === board.titlePropertyId)
    const recent = board ? [...rows].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 15) : []
    return (
      <>
        <button onClick={() => setOpen(true)} className="h-10 w-10 flex items-center justify-center rounded-full text-neutral-50" title={tt('Ara')}>
          <Icon name="search" className="h-6 w-6" />
        </button>
        {open &&
          createPortal(
            <div className="fixed inset-0 z-[60] bg-neutral-950 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
              <div className="flex items-center gap-2 px-3 h-16 shrink-0">
                <button onClick={close} aria-label={tt('Kapat')} className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full text-neutral-200 text-2xl active:bg-neutral-800">
                  ‹
                </button>
                <label className="flex-1 min-w-0 flex items-center gap-2 rounded-full bg-neutral-900 border border-neutral-800 px-4 h-11 text-neutral-500">
                  <Icon name="search" className="h-5 w-5" />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && close()}
                    placeholder={tt('Film, dizi, oyuncu, tür ara…')}
                    className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-neutral-100 placeholder:text-neutral-500"
                  />
                  {q && (
                    <button onClick={() => setQ('')} className="text-neutral-500 text-xl leading-none">
                      ×
                    </button>
                  )}
                </label>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-10">
                {!query ? (
                  <>
                    <h2 className="text-[17px] font-bold text-neutral-50 mt-2 mb-3">{tt('Son eklenenler')}</h2>
                    <div className="space-y-2">
                      {recent.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => {
                            close()
                            openResult(r.id)
                          }}
                          className="w-full flex items-center gap-3 text-left active:bg-neutral-900 rounded-md"
                        >
                          <span className="w-36 shrink-0 aspect-video rounded-md overflow-hidden bg-neutral-800">
                            {cover && r.values[cover.id] ? <img src={r.values[cover.id] as string} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                          </span>
                          <span className="flex-1 min-w-0 text-[15px] text-neutral-100 line-clamp-2">{titleP ? titleText(titleP, r.values[titleP.id]) : ''}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-6 pt-1">
                    {tagMatches.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
                        {tagMatches.map(({ prop, opt, count }) => (
                          <button key={prop.id + opt.id} onClick={() => openTag(prop.id, opt.id)} className="shrink-0 flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 pl-1 pr-3.5 py-1">
                            <span className="h-8 w-8 rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center text-xs text-neutral-500 shrink-0">
                              {opt.image ? <img src={opt.image} alt="" className="h-full w-full object-cover" /> : opt.label.slice(0, 1)}
                            </span>
                            <span className="text-left">
                              <span className="block text-[13px] text-neutral-100 leading-tight">{opt.label}</span>
                              <span className="block text-[10px] text-neutral-500">{ttx('{0} · {1} kayıt', prop.name, count)}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {board && results.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {[...titleResults, ...otherResults].map((r) => (
                          <HomeCard
                            key={r.id}
                            board={board}
                            row={r}
                            landscape={false}
                            fill
                            onOpenDetail={(row) => {
                              close()
                              openResult(row.id)
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {results.length + tagMatches.length === 0 && (
                      <div className="text-center py-16">
                        <p className="text-neutral-300">{tt('Bu aramaya uyan bir şey yok.')}</p>
                        <p className="text-sm text-neutral-500 mt-1">{tt('Başka bir kelime dene — ad, oyuncu, tür ya da ülke adıyla arayabilirsin.')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )}
      </>
    )
  }

  return (
    <div ref={wrapperRef} className="relative flex items-center">
      {open && (
        <div className="absolute right-11 top-0 z-40 flex items-center">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tt('Film, dizi, oyuncu, tür ara…')}
            disabled={!board}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            className="w-52 sm:w-72 rounded-full bg-neutral-900 border border-neutral-700 pl-4 pr-8 py-2 text-neutral-100 outline-none focus:border-[#00c0fa] focus:ring-2 focus:ring-[#00c0fa]/20 text-sm disabled:opacity-50 shadow-lg shadow-black/30 transition"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              title={tt('Aramayı temizle')}
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
        className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-neutral-900 text-neutral-50 hover:text-[#00c0fa] transition relative z-40"
        title={tt('Ara (Ctrl+K ya da "/")')}
      >
        <Icon name="search" className="h-[22px] w-[22px]" />
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
            <div className="px-4 py-6 space-y-8">
              <p className="text-sm text-neutral-500">
                {ttx('{0} için {1}', <span className="text-neutral-100 font-semibold">"{q}"</span>, results.length + tagMatches.length > 0 ? tt('{0} kayıt{1} bulundu', results.length, tagMatches.length ? tt(' ve {0} kişi/etiket', tagMatches.length) : '') : tt('bir şey bulunamadı'))}
                {results.length >= MAX_RESULTS && <span className="text-neutral-600">{' '}{ttx('(ilk {0} gösteriliyor)', MAX_RESULTS)}</span>}
              </p>

              {tagMatches.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold text-neutral-100 mb-3">{tt('Kişiler ve etiketler')}</h2>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {tagMatches.map(({ prop, opt, count }) => (
                      <button
                        key={prop.id + opt.id}
                        onClick={() => openTag(prop.id, opt.id)}
                        className="shrink-0 flex items-center gap-2.5 rounded-full border border-neutral-800 bg-neutral-900 hover:border-[#00c0fa]/50 pl-1.5 pr-4 py-1.5 transition"
                      >
                        <span className="h-9 w-9 rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center text-xs text-neutral-500 shrink-0">
                          {opt.image ? <img src={opt.image} alt="" className="h-full w-full object-cover" /> : opt.label.slice(0, 1)}
                        </span>
                        <span className="text-left">
                          <span className="block text-sm text-neutral-100 leading-tight">{opt.label}</span>
                          <span className="block text-[11px] text-neutral-500">
                            {ttx('{0} · {1} kayıt', prop.name, count)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {board &&
                [
                  { title: tt('Adında geçenler'), rows: titleResults },
                  { title: titleResults.length ? tt('Diğer eşleşmeler') : tt('Eşleşen kayıtlar'), rows: otherResults },
                ]
                  .filter((g) => g.rows.length > 0)
                  .map((g) => (
                    <section key={g.title}>
                      <h2 className="text-lg font-semibold text-neutral-100 mb-3">
                        {g.title} <span className="text-xs font-normal text-neutral-500">{g.rows.length}</span>
                      </h2>
                      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${landscape ? '15rem' : '8.5rem'}, 1fr))` }}>
                        {g.rows.map((r) => (
                          <HomeCard key={r.id} board={board} row={r} landscape={landscape} fill onOpenDetail={(row) => openResult(row.id)} />
                        ))}
                      </div>
                    </section>
                  ))}

              {results.length + tagMatches.length === 0 && (
                <div className="text-center py-16">
                  <p className="mb-3 text-neutral-600"><Icon name="search" className="h-10 w-10" /></p>
                  <p className="text-neutral-300">{tt('Bu aramaya uyan bir şey yok.')}</p>
                  <p className="text-sm text-neutral-500 mt-1">{tt('Başka bir kelime dene — ad, oyuncu, tür ya da ülke adıyla arayabilirsin.')}</p>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
