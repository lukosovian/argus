import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useBoard } from '../hooks/useBoard'
import { useBoards } from '../hooks/useBoards'
import { useRows } from '../hooks/useRows'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { titleText, resolveBuiltinMoods, type Board, type Row } from '../types'
import { parseYouTubeUrl } from '../lib/youtube'
import { showcaseMeta, hoverCardMeta, rowsForFilter, shuffle } from '../lib/rowMeta'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { useEpisodes } from '../hooks/useEpisodes'
import { isScrolling } from '../lib/scrollGuard'
import ShowcaseBanner from '../components/ShowcaseBanner'
import RowDetailModal from '../components/RowDetailModal'
import HoverPreviewVideo from '../components/HoverPreviewVideo'
import MoodRow from '../components/MoodRow'
import NewEpisodesRow from '../components/NewEpisodesRow'
import AgeRatingChip from '../components/AgeRatingChip'
import { sortByOrder } from '../components/HomeSectionEditor'
import { PRIMARY_BUTTON, primaryButtonStyle, gradientBorderStyle, BRAND_GRADIENT } from '../lib/theme'

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

// Dikey (landscape=false) kartlarda hover'da büyüme oranı — MoodCard'daki AYNI değerler
// (144 -> 320, bkz. MoodRow.tsx), `fill` modunda (Izgara'daki "Tümü") gerçek hücre genişliği
// sabit olmadığından bu ORAN, ölçülen dinlenme genişliğine uygulanıyor.
const REST_CARD_WIDTH = 144
const HOVER_CARD_WIDTH = 320

// Ayarlar'daki "Kart boyutu" seçiminin (Küçük/Orta/Büyük) her iki görünüm tarzı (Yatay/Dikey)
// için piksel karşılığı — "Orta" eski sabit değerlerle (144/256) birebir aynı, geri kalanı
// aynı orandan (yatay ~1.33x, dikey ~1.35x) türetildi. Sadece HomeRow'un (Tümü/bölümler/
// otomatik doldur) kullandığı kartları etkiler — arama sonuçları grid'i (activeFilter) ayrı,
// bu ayardan bilerek etkilenmiyor.
const CARD_WIDTHS: Record<'kucuk' | 'orta' | 'buyuk', { yatay: number; dikey: number }> = {
  kucuk: { yatay: 192, dikey: 112 },
  orta: { yatay: 256, dikey: 144 },
  buyuk: { yatay: 340, dikey: 192 },
}

export function HomeCard({
  board,
  row,
  landscape,
  onOpenDetail,
  fill,
  width,
  showInfoAlways,
}: {
  board: Board
  row: Row
  landscape: boolean
  onOpenDetail: (row: Row) => void
  // Yatay kaydırmalı satırlarda (HomeRow) kart sabit bir piksel genişliğinde olmalı — flex
  // satırın kendisi kaydırılıyor. Bir CSS grid'e (ör. arama sonuçları) yerleştirildiğindeyse
  // sabit genişlik, grid hücresinin gerçek payını doldurmuyor ve satırın sonunda/kartlar
  // arasında boş alan bırakıyordu — `fill` true olduğunda kart, sabit genişlik yerine kendi
  // grid hücresinin tamamını (`w-full`) kaplar, en-boy oranı hücrenin genişliğine göre
  // otomatik ayarlanır.
  fill?: boolean
  // Dinlenme hâlindeki piksel genişliği (fill=true iken kullanılmaz) — Ayarlar'daki "Kart
  // boyutu" seçimine göre HomeRow bunu hesaplayıp geçiriyor, bkz. CARD_WIDTHS. Verilmezse eski
  // sabit değerlere (144/256) düşer.
  width?: number
  // "Bilgileri her zaman göster" açıksa meta şeridi (Durum/Kategori/yıl) fareyle üzerine
  // gelmeden de görünür — varsayılan kapalı (kullanıcı "default olarak kapalı getir" dedi).
  showInfoAlways?: boolean
}) {
  const [hovering, setHovering] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Hangi kenardan büyüyeceği artık dizideki KONUMUNA değil, o anki EKRAN konumuna göre
  // ölçülüyor — dizinin gerçek başı/sonu olmasa bile (ör. bir satırı sağa kaydırıp satırın o an
  // görünen ilk/son kartına gelince) kart, kaydırma kutusunun/gridin görünür kenarına yakınsa
  // yine sayfa dışına taşıyordu; eski kod sadece index===0/count-1 olan gerçek uç kartları
  // koruyordu.
  const [origin, setOrigin] = useState<'left' | 'right' | 'center'>('center')
  // Dikey kartlarda (bkz. aşağıdaki not) hover'da ne kadar genişleyeceği ÖLÇÜLEN dinlenme
  // genişliğine göre hesaplanıyor — `fill` modunda sabit bir piksel değeri yok.
  const [restWidth, setRestWidth] = useState(REST_CARD_WIDTH)

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    }
  }, [])

  // İmleç bir kartın üzerinden geçerken (kaydırırken ya da sıradaki kartlara giderken) her
  // seferinde anında büyümesin diye, sadece 1 saniye kıpırdamadan durulursa büyüsün.
  //
  // "Bilgileri her zaman göster" açıkken büyüme/video önizlemesine hiç gerek yok — bilgiler
  // zaten görünür durumda, kullanıcı "kartlar üzerine gelince büyümesin gerek yok büyümemiş
  // haliyle de üzerine tıklayıp detay penceresini görebilelim" dedi. `hovering` hiç true
  // olmadığı için aşağıdaki TÜM hover'a bağlı render dalları (scale, genişlik değişimi, video
  // önizleme) otomatik olarak kapalı kalıyor — tıklama (`onClick`) hover'dan bağımsız olduğu
  // için detay penceresi yine normal açılıyor.
  function handleMouseEnter() {
    if (showInfoAlways) return
    if (isScrolling()) return
    hoverTimer.current = setTimeout(() => {
      const btn = buttonRef.current
      // İki üst ata: kartın kendi sabit boyutlu sarmalayıcısı, ondan sonra gerçek satır/grid
      // konteyneri — hem HomeRow'un yatay kaydırma kutusunda hem de sabit gridlerde aynı yapı.
      const container = btn?.parentElement?.parentElement
      if (btn && container) {
        const cardRect = btn.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        if (!landscape) {
          // Dikey kart: MoodCard'daki gibi GENİŞLİK değişerek yatay bir önizlemeye dönüşüyor
          // (bkz. render'daki aspectRatio geçişi) — taşma payı ölçülen genişliğin büyüme
          // oranına göre.
          setRestWidth(cardRect.width)
          const hoverWidth = cardRect.width * (HOVER_CARD_WIDTH / REST_CARD_WIDTH)
          const overflowMargin = hoverWidth - cardRect.width
          if (cardRect.left - containerRect.left < overflowMargin) setOrigin('left')
          else if (containerRect.right - cardRect.right < overflowMargin) setOrigin('right')
          else setOrigin('center')
        } else {
          // Yatay kart: eskisi gibi ortadan (transform-origin) scale-[1.55] ile büyüyor.
          const overflowMargin = cardRect.width * 0.3
          if (cardRect.left - containerRect.left < overflowMargin) setOrigin('left')
          else if (containerRect.right - cardRect.right < overflowMargin) setOrigin('right')
          else setOrigin('center')
        }
      }
      setHovering(true)
    }, 500)
  }

  function handleMouseLeave() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setHovering(false)
  }

  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  const titleImageProp = board.properties.find((p) => p.id === board.titleImagePropertyId && p.type === 'image')
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const urlProp = resolveRole(board, 'video')

  const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
  const titleImage = titleImageProp ? ((row.values[titleImageProp.id] as string) ?? '') : ''
  const cover = coverProp ? (row.values[coverProp.id] as string) : ''
  const link = urlProp ? ((row.values[urlProp.id] as string) ?? '') : ''
  const yt = link ? parseYouTubeUrl(link) : null
  // Kart küçük olduğu için üstte sadece kısa, sabit bir özet gösteriliyor: Durum, Kategori, yıl.
  const meta = hoverCardMeta(board, row)
  // Tailwind derleyicisi sınıf adını kaynak kodda TAM bir metin olarak görmeli — bir template
  // literal içinde `origin-${origin}` gibi parçalı birleştirme ile üretilirse hangi sınıfların
  // gerekebileceğini anlayamaz ve hiçbirini derlemez.
  const originClass = origin === 'left' ? 'origin-left' : origin === 'right' ? 'origin-right' : 'origin-center'
  // Dikey kartlar (landscape=false) hover'da MoodCard'daki gibi genişlik değiştirip yatay
  // (16:9) bir önizlemeye dönüşür — "modlardaki gibi düzgünce açılsın" isteğinin karşılığı;
  // yatay kartlar (landscape=true) eskisi gibi aynı oranda kalıp scale ile büyür.
  const widthMorph = !landscape
  const hoverWidth = restWidth * (HOVER_CARD_WIDTH / REST_CARD_WIDTH)
  const morphAnchorStyle: React.CSSProperties = origin === 'right' ? { right: 0, left: 'auto' } : { left: 0 }

  const restPxWidth = width ?? (landscape ? 256 : 144)

  // Kartın satırdaki normal boyutunu (ve komşu kartların yerini) hiç değiştirmeden, üzerine
  // gelince görselin ALTINA gerçek bir meta bölümü ekleyip kartı bir bütün olarak büyütüyoruz —
  // detay penceresindeki gibi görsel üstte, bilgiler onun altında, üst üste binmeden.
  return (
    <div
      className={`relative ${fill ? 'w-full' : 'shrink-0'} ${landscape ? 'aspect-video' : 'aspect-[2/3]'}`}
      style={fill ? undefined : { width: restPxWidth }}
    >
      <button
        ref={buttonRef}
        onClick={() => onOpenDetail(row)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          ...(hovering ? gradientBorderStyle('#262626') : {}),
          ...(widthMorph && hovering ? { width: hoverWidth, ...morphAnchorStyle } : {}),
        }}
        className={`absolute top-0 text-left rounded-lg bg-neutral-800 border-[1.5px] border-transparent transition-all duration-200 ${
          widthMorph && hovering ? '' : 'left-0 w-full'
        } ${!widthMorph ? originClass : ''} ${hovering ? 'z-20 shadow-2xl' : ''} ${!widthMorph && hovering ? 'scale-[1.55]' : ''}`}
      >
        <div
          className="relative w-full rounded-lg overflow-hidden bg-neutral-800 transition-all duration-200"
          style={{ aspectRatio: landscape ? '16 / 9' : hovering ? '16 / 9' : '2 / 3' }}
        >
          {hovering && yt ? <HoverPreviewVideo videoId={yt.id} startSeconds={yt.start} /> : null}
          {(!hovering || !yt) && cover && (
            <img src={cover} alt={title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
          )}

          {/* Başlık artık dinlenme halinde de görünür (KAPAK ADI logosu varsa küçük halde, yoksa
              düz yazı) — bannerlar yazısız hale getirildikten sonra kart üzerine gelmeden
              hangi içerik olduğu hiç belli olmuyordu. */}
          {(titleImage || title) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pointer-events-none">
              {titleImage ? (
                <img src={titleImage} alt={title} className="h-7 w-auto max-w-[85%] object-contain" />
              ) : (
                <p className="text-white text-sm font-semibold truncate" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                  {title}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Meta bölümü normalde sadece üzerine gelince, görselin ALTINDA (üstüne binmeden)
            beliriyor — "Bilgileri her zaman göster" açıksa hover beklemeden hep görünür. Metin
            `min-h-[2.4em]` ile hep 2 satırlık yer kaplıyor (tek satıra sığan bir metin dolgusuz
            kısa kalıp kartı komşusundan daha kısa göstermesin diye) — kullanıcı "biri 2 satır
            biri tek satır geliyo... biri biraz uzun biri biraz kısa duruyo" dedi, özellikle
            "her zaman göster" açıkken (kartlar sabit durduğu için fark sürekli görünür oluyor)
            önemli, ama hover'daki (geçici) haliyle de aynı tutarlılık için genel geçerli. */}
        {(hovering || showInfoAlways) && (
          <div className="bg-neutral-900 rounded-b-lg px-2.5 py-2 flex items-center justify-between gap-1">
            {meta.length > 0 ? (
              <p className="text-[14px] font-bold text-neutral-400 line-clamp-2 leading-tight min-h-[2.4em]">{meta.join(' • ')}</p>
            ) : (
              <span />
            )}
            <span
              style={{ background: BRAND_GRADIENT }}
              className="shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-white"
              title="Daha fazla bilgi"
            >
              <ChevronDownIcon />
            </span>
          </div>
        )}
      </button>
    </div>
  )
}

// Vitrin yazıları her zaman koyu görselin/videonun üstünde duruyor — açık temada ters çevrilen
// neutral-* renkleri (bkz. index.css) burada siyaha dönüp okunmaz oluyordu, bu yüzden temadan
// bağımsız sabit beyaz + hafif gölge kullanılıyor.
const OVERLAY_TEXT_SHADOW = { textShadow: '0 1px 6px rgba(0,0,0,0.7)' }

function FeaturedOverlay({
  title,
  titleImage,
  meta,
  ageRating,
  synopsis,
  onMoreInfo,
}: {
  title: string
  titleImage: string
  meta: string[]
  ageRating: string
  synopsis: string
  onMoreInfo: () => void
}) {
  // Sinopsis 10 saniye ekranda kaldıktan sonra aşağı kayarak kayboluyor — vitrin uzun
  // süre açık kalırsa afiş sadeleşsin diye. Öne çıkan kayıt değiştiğinde (yeni sinopsis
  // metni geldiğinde) sayaç sıfırlanıp tekrar baştan başlıyor.
  const [synopsisHidden, setSynopsisHidden] = useState(false)
  useEffect(() => {
    setSynopsisHidden(false)
    const timer = setTimeout(() => setSynopsisHidden(true), 10000)
    return () => clearTimeout(timer)
  }, [synopsis])

  return (
    <div className="absolute inset-0 flex items-end bg-gradient-to-r from-black/60 via-black/5 to-transparent rounded-xl pointer-events-none">
      <div className="pl-6 md:pl-10 pb-10 md:pb-12 max-w-2xl pointer-events-auto">
        {titleImage ? (
          <img src={titleImage} alt={title} className="h-36 md:h-44 w-auto max-w-full object-contain" />
        ) : (
          <p className="text-white text-6xl md:text-7xl font-bold uppercase tracking-wide">{title}</p>
        )}
        {(meta.length > 0 || ageRating) && (
          <div className="flex items-center gap-2.5 mt-3">
            {meta.length > 0 && (
              <p className="text-white/90 text-lg font-bold whitespace-nowrap" style={OVERLAY_TEXT_SHADOW}>
                {meta.join('  •  ')}
              </p>
            )}
            {ageRating && <AgeRatingChip raw={ageRating} className="h-6 min-w-6" />}
          </div>
        )}
        {synopsis && (
          <div
            className={`overflow-hidden transition-all duration-700 ease-in ${
              synopsisHidden ? 'max-h-0 opacity-0 -translate-y-4 mt-0 pointer-events-none' : 'max-h-64 opacity-100 translate-y-0 mt-2'
            }`}
          >
            <p className="text-white/90 text-lg max-w-xl" style={OVERLAY_TEXT_SHADOW}>
              {synopsis}
            </p>
          </div>
        )}
        <button
          onClick={onMoreInfo}
          style={primaryButtonStyle}
          className={`mt-5 text-base px-5 py-2.5 rounded-lg ${PRIMARY_BUTTON}`}
        >
          Daha Fazla Bilgi
        </button>
      </div>
    </div>
  )
}

// "En altta rastgele satırlarla doldur" özelliği için aday havuzu: arşivin seçim/çoklu-seçim
// sütunlarından (Tür, Ülke, Kategori... hangileri olduğu hardcode değil, board'un o anki şemasına
// göre bulunuyor), en az bir kaydı olan HER değer bir aday satır. Oyuncular gibi binlerce
// seçenekli bir sütun taramaya girip yavaşlatmasın diye (bkz. performans notları) makul sayıda
// seçeneği olan sütunlarla sınırlı — Map ile tek geçişte kayıt-seçenek eşleşmesi çıkarılıyor,
// her seçenek için ayrı ayrı .filter() TARANMIYOR (aynı O(n) yerine O(n²) tuzağından kaçınma).
const AUTO_FILL_MAX_OPTIONS = 300

interface AutoFillCandidate {
  propertyId: string
  optionId: string
  label: string
  rows: Row[]
}

function buildAutoFillPool(board: Board, rows: Row[]): AutoFillCandidate[] {
  const eligibleProps = board.properties.filter(
    (p) =>
      (p.type === 'select' || p.type === 'multiselect') &&
      (p.options?.length ?? 0) > 0 &&
      (p.options?.length ?? 0) <= AUTO_FILL_MAX_OPTIONS,
  )
  if (eligibleProps.length === 0) return []

  const rowsByOption = new Map<string, Row[]>()
  for (const row of rows) {
    for (const prop of eligibleProps) {
      const v = row.values[prop.id]
      const ids = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []
      for (const id of ids) {
        const list = rowsByOption.get(id)
        if (list) list.push(row)
        else rowsByOption.set(id, [row])
      }
    }
  }

  const candidates: AutoFillCandidate[] = []
  for (const prop of eligibleProps) {
    for (const opt of prop.options ?? []) {
      const matched = rowsByOption.get(opt.id)
      if (matched && matched.length > 0) {
        candidates.push({ propertyId: prop.id, optionId: opt.id, label: opt.label, rows: matched })
      }
    }
  }
  return candidates
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function HomeRow({
  title,
  board,
  rows,
  landscape,
  onOpenDetail,
  cardWidth,
  showInfoAlways,
}: {
  title: string
  board: Board
  rows: Row[]
  landscape: boolean
  onOpenDetail: (row: Row) => void
  // Ayarlar'daki "Kart boyutu" seçiminin bu yön (yatay/dikey) için piksel karşılığı — bkz.
  // CARD_WIDTHS. Verilmezse HomeCard kendi eski sabit değerlerine (144/256) düşer.
  cardWidth?: number
  showInfoAlways?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Kaydıracak bir şey yokken (satır zaten tamamen görünüyorsa, ya da baştaysak/sondaysak)
  // okları göstermeye gerek yok — sadece gerçekten kaydırılabilecek yönde görünsünler.
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function update() {
      setCanScrollLeft(el!.scrollLeft > 4)
      setCanScrollRight(el!.scrollLeft + el!.clientWidth < el!.scrollWidth - 4)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [rows])

  if (rows.length === 0) return null

  function scroll(dir: 1 | -1) {
    const width = cardWidth ?? (landscape ? 256 : 144)
    scrollRef.current?.scrollBy({ left: dir * 7 * (width + 12), behavior: 'smooth' })
  }

  return (
    <div className="group/row">
      <h2 className="text-xl font-semibold text-neutral-200 mb-2">{title}</h2>
      {/* `flow-root`: bu sarmalayıcının hiç kendi padding/border'ı yoksa, içindeki satırın
          -mt/-mb (taşma payı telafisi) marjları düz bir `relative` div'in içinden dışarı
          "sızıp" bu kutunun kendi yüksekliğini kart yerine dolgulu (pt+pb dahil) kutunun
          tam boyuna eşitliyordu — ok bu yüzden kartlara değil, o şişmiş kutuya göre
          ortalanıyordu. `flow-root` yeni bir "block formatting context" açıp bu marj
          sızmasını (margin collapsing) engelliyor, taşma payını (overflow: visible kalarak)
          kırpmadan; artık bu kutunun yüksekliği gerçek kart yüksekliğiyle birebir eşit. */}
      <div className="relative" style={{ display: 'flow-root' }}>
        {canScrollLeft && (
          <button
            onClick={() => scroll(-1)}
            title="Sola kaydır"
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 text-white opacity-0 group-hover/row:opacity-100 hover:scale-110 transition"
            style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }}
          >
            <ChevronLeftIcon />
          </button>
        )}
        {/* Kart üzerine gelince 1.55 kat büyüyor (bkz. HomeCard); en baştaki/sondaki kartlar
            origin-left/origin-right ile kendi kenarından büyüyüp satırın dışına taşmasa da,
            büyüyen kartın gölgesi (shadow-2xl) kutunun kendi kenarının biraz dışına taşıyor —
            bu yüzden satırın kendi kırpma kutusuna küçük bir tampon pay veriliyor (px-4,
            -mx-4 ile kartların gerçek başlangıç konumu değişmeden telafi ediliyor). */}
        <div
          ref={scrollRef}
          className="no-scrollbar flex items-start gap-3 overflow-x-auto px-4 -mx-4 pt-16 pb-32 -mt-16 -mb-32 scroll-smooth"
        >
          {rows.map((row) => (
            <HomeCard
              key={row.id}
              board={board}
              row={row}
              landscape={landscape}
              onOpenDetail={onOpenDetail}
              width={cardWidth}
              showInfoAlways={showInfoAlways}
            />
          ))}
        </div>
        {canScrollRight && (
          <button
            onClick={() => scroll(1)}
            title="Sağa kaydır"
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 text-white opacity-0 group-hover/row:opacity-100 hover:scale-110 transition"
            style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }}
          >
            <ChevronRightIcon />
          </button>
        )}
      </div>
    </div>
  )
}

export default function AnaSayfa() {
  const { settings, loading: settingsLoading, saveSettings } = useHomeSettings()
  const { boards, loading: boardsLoading } = useBoards()
  const { board, loading: boardLoading } = useBoard(settings.boardId ?? undefined)
  const { rows, loading: rowsLoading } = useRows(settings.boardId ?? undefined)
  const { episodes } = useEpisodes()
  const [detailRow, setDetailRow] = useState<Row | null>(null)
  const [videoShowing, setVideoShowing] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // Uygulamayla gelen 10 varsayılan mod (bkz. types.ts'teki BUILTIN_MOODS) — SADECE bu board
  // için daha önce hiç denenmediyse (moodSeedKey, StrictMode'un aynı effect'i iki kez art arda
  // çalıştırmasına karşı senkron bir kilit — bkz. useToast.tsx'teki aynı gerekçe) VE mod satırı
  // gerçekten boşsa (kullanıcının kendi eklediği modları asla ezmez, ör. bu oturumda Luko'nun
  // zaten var olan 10 modu — sadece gerçekten yeni/boş bir profil için tetiklenir). Kullanıcı
  // "benim eklediğim 10 tane modu ve görsellerini default olarak" dedi.
  const moodSeedKey = useRef<string | null>(null)
  useEffect(() => {
    if (!board || settings.moodRow?.seeded) return
    if (moodSeedKey.current === board.id) return
    moodSeedKey.current = board.id
    if ((settings.moodRow?.moods?.length ?? 0) > 0) return
    const builtins = resolveBuiltinMoods(board)
    saveSettings({
      ...settings,
      moodRow: {
        // Her zaman açık — 10 mod her zaman üretildiği için (bazıları kapalı olsa bile, bkz.
        // resolveBuiltinMoods) burayı görünür bırakmak, kullanıcının bu özelliği fark etmesi
        // için önemli ("adam bu modların gelebileceğini nerden bilecek").
        enabled: true,
        title: settings.moodRow?.title ?? 'Bunları da İzle',
        position: settings.moodRow?.position ?? 1,
        moods: builtins,
        seeded: true,
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, settings.moodRow?.seeded])

  const coverProp = board ? board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image') : undefined
  const titleProp = board ? board.properties.find((p) => p.id === board.titlePropertyId) : undefined
  const titleImageProp = board
    ? board.properties.find((p) => p.id === board.titleImagePropertyId && p.type === 'image')
    : undefined
  const synopsisProp = resolveRole(board, 'sinopsis')
  const urlProp = resolveRole(board, 'video')
  const yasProp = resolveRole(board, 'yas')

  // Kapak görseli olmayan kayıtlar, ayardan açılınca ana sayfanın (vitrin dahil) hiçbir
  // yerinde gösterilmiyor — ama başka bir yerden (ör. arama, detay linki) doğrudan açılabilsin
  // diye `rows`'un kendisinden değil, sadece burada türetilen listelerden çıkarılıyor.
  const visibleRows = settings.hideWithoutCover && coverProp ? rows.filter((r) => Boolean(r.values[coverProp.id])) : rows

  // "Bunları da İzle" (mod) satırının havuzu: Durum'u "İzlenecek" olan tüm kayıtlar — aktif
  // bölüm/filtreden bağımsız, her zaman arşivin tamamına bakar (bkz. kullanıcı isteği
  // "izlenecekler listemden ... çekecek").
  const durumProp = resolveRole(board, 'durum')
  const izlenecekOptionId = board ? resolveStatusOption(board, 'izlenecek') : undefined
  const izlenecekPool =
    durumProp && izlenecekOptionId ? visibleRows.filter((r) => r.values[durumProp.id] === izlenecekOptionId) : []

  const bolumId = searchParams.get('bolum')
  const activeSection = bolumId ? (settings.sections ?? []).find((s) => s.id === bolumId) : undefined

  // Bir oyuncu (ya da herhangi bir çoklu-seçim/seçim) rozetine tıklanınca buraya gelinir —
  // isimli bir "bölüm" değil, anlık bir filtre: o değere sahip kayıtları kart olarak listeler.
  const filterPropId = searchParams.get('filterProp')
  const filterOptionId = searchParams.get('filterOption')
  const filterProperty = filterPropId ? board?.properties.find((p) => p.id === filterPropId) : undefined
  const filterOption = filterProperty?.options?.find((o) => o.id === filterOptionId)
  const adHocFilter = filterProperty && filterOption ? { propertyId: filterProperty.id, optionIds: [filterOption.id] } : null

  const activeFilter = activeSection ?? adHocFilter
  const scopedRows = activeFilter ? rowsForFilter(activeFilter, visibleRows) : visibleRows
  const displayRows = [...scopedRows].reverse()
  const sectionTitle = activeSection?.name ?? (adHocFilter ? 'Kayıtlar' : 'Tümü')

  // "Tümü" kartları varsayılan olarak her girişte karışık sırada gelir — ama artık Ayarlar'dan
  // "Sıralı Getir" seçilebiliyor (bkz. HomeSettingsPanel.tsx'teki allSectionOrder), o zaman
  // olduğu gibi (ekleme sırasına göre) kalır. Bir isimli bölüm/anlık filtre sayfasındaysak
  // (activeFilter varsa) bu ayardan bağımsız, sıralama zaten hiç karışmaz. Bağımlılık dizisi
  // (içerik id'lerinin birleşimi) referans değil İÇERİK bazlı — yoksa her render'da (ör. detay
  // penceresi açılınca) yeniden karışırdı.
  const scopedRowsKey = scopedRows.map((r) => r.id).join(',')
  const allSectionOrder = settings.allSectionOrder ?? 'karisik'
  const tumuRows = useMemo(() => {
    if (activeFilter || allSectionOrder === 'sirali') return displayRows
    return shuffle(displayRows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRowsKey, activeFilter, allSectionOrder])

  // "En altta rastgele satırlarla doldur" — her girişte (bu bileşen her mount olduğunda,
  // showcase'in "her ziyarette rastgele" mantığıyla aynı fikir) yeni bir seçim yapılır, aynı
  // içerik değişmediği sürece render'lar arasında sabit kalır.
  const autoFillEnabled = Boolean(settings.autoFill?.enabled) && Boolean(board)
  const autoFillCount = Math.max(0, settings.autoFill?.count ?? 0)
  const visibleRowsKey = visibleRows.map((r) => r.id).join(',')
  const autoFillPicks = useMemo(() => {
    if (!autoFillEnabled || !board || autoFillCount === 0) return []
    return shuffle(buildAutoFillPool(board, visibleRows)).slice(0, autoFillCount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFillEnabled, autoFillCount, board?.id, visibleRowsKey])

  // Vitrinin rastgele seçileceği havuz: bir bölüm sayfasındaysak o bölümün kayıtları,
  // değilsek Ana Sayfa Ayarları'ndaki vitrin filtresi (yoksa arşivin tamamı). Anlık oyuncu/seçenek
  // filtresinde vitrin hiç gösterilmiyor — rastgele bir video/afişin araya girmesi yerine, sade
  // bir liste olarak kalsın istendi.
  // Filtre/bölüm sayfası olup olmadığı adres çubuğundan (URL) HEMEN belli — arşiv bilgisinin
  // yüklenmesini beklemiyoruz. Eskiden kayıtlar arşiv bilgisinden önce yüklenirse vitrin
  // "filtre yok" sanıp arşivin tamamından rastgele bir kayıt seçiyor, arşiv sonra yüklenip filtre
  // anlaşılınca da o seçim temizlenmediği için oyuncu sayfasının üstünde vitrin kalıyordu.
  const adHocRequested = Boolean(filterPropId)
  const sectionPending = Boolean(bolumId) && !activeSection
  const showcasePool = adHocRequested || sectionPending
    ? []
    : activeSection
      ? scopedRows
      : settings.showcaseFilter?.propertyId && settings.showcaseFilter.optionIds.length > 0
        ? rowsForFilter(settings.showcaseFilter, visibleRows)
        : visibleRows

  const showcaseFilterKey = `${settings.showcaseFilter?.propertyId ?? ''}:${(settings.showcaseFilter?.optionIds ?? []).join(',')}`
  // Anlık oyuncu/seçenek filtresi de havuz anahtarına dahil — yoksa uygulama içinden (sayfa
  // yenilenmeden) bir rozete tıklanınca, önceki vitrin state'i temizlenmeden kalıp görünmeye devam ediyordu.
  const adHocFilterKey = `${filterPropId ?? ''}:${filterOptionId ?? ''}`
  const poolKey = `${bolumId ?? ''}:${activeSection?.id ?? ''}|${showcaseFilterKey}|${adHocFilterKey}`

  // Vitrinde her girişte havuzdan rastgele bir kayıt seçilir, ama o ziyaret boyunca (aynı
  // bölüm/filtre havuzunda kaldığı sürece) sabit kalır — art arda değişip durmaz.
  const [featured, setFeatured] = useState<Row | undefined>(undefined)
  const pickedForKey = useRef<string | null>(null)

  useEffect(() => {
    if (pickedForKey.current !== poolKey) {
      pickedForKey.current = poolKey
      setFeatured(undefined)
      setVideoShowing(false)
    }
  }, [poolKey])

  useEffect(() => {
    if (!settings.showcase || featured || showcasePool.length === 0) return
    setFeatured(showcasePool[Math.floor(Math.random() * showcasePool.length)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.showcase, showcasePool, featured])

  const featuredTitle = featured && titleProp ? titleText(titleProp, featured.values[titleProp.id]) : ''
  const featuredTitleImage = featured && titleImageProp ? ((featured.values[titleImageProp.id] as string) ?? '') : ''
  const featuredImage = featured && coverProp ? ((featured.values[coverProp.id] as string) ?? '') : ''
  const featuredLink = featured && urlProp ? ((featured.values[urlProp.id] as string) ?? '') : ''
  const featuredYt = featuredLink ? parseYouTubeUrl(featuredLink) : null
  const featuredMeta = featured && board ? showcaseMeta(board, featured, episodes[featured.id]?.length) : []
  const featuredAgeRating = featured && yasProp ? ((featured.values[yasProp.id] as string) ?? '').trim() : ''
  const featuredSynopsis = featured && synopsisProp ? ((featured.values[synopsisProp.id] as string) ?? '') : ''

  // Video oynarken YouTube'un embed'ini bir <canvas>'a çizip anlık renk okumak mümkün değil
  // (iframe içeriği farklı bir kaynaktan geldiği için tarayıcı güvenliği engelliyor) — bu yüzden
  // "anlık" ambiyans için en yakın gerçekçi çözüm, video oynarken YouTube'un kendi kapak
  // görselini (thumbnail) ambiyans kaynağı yapmak; video bitip/durdurulup afişe dönülünce
  // ambiyans da arşivdeki kapak görseline geri döner.
  const videoThumbnail = featuredYt ? `https://img.youtube.com/vi/${featuredYt.id}/hqdefault.jpg` : ''
  const ambientSource = videoShowing && videoThumbnail ? videoThumbnail : featuredImage

  const detayParam = searchParams.get('detay')
  const openRow = detailRow ?? (detayParam ? (rows.find((r) => r.id === detayParam) ?? null) : null)

  function closeDetail() {
    setDetailRow(null)
    if (searchParams.get('detay')) {
      setSearchParams(
        (prev) => {
          prev.delete('detay')
          return prev
        },
        { replace: true },
      )
    }
  }

  if (settingsLoading || boardsLoading) return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>

  if (!settings.boardId) {
    // İki farklı durum, iki farklı mesaj: hiç arşiv yoksa önce bir tane oluşturması lazım
    // (seçecek bir şey yok); arşivi varsa ama ana sayfa için seçilmemişse asıl sorun sadece bu.
    const hasAnyBoard = boards.length > 0
    return (
      <div className="px-4 py-16 flex flex-col items-center text-center">
        <h1 className="text-2xl font-semibold text-neutral-50 mb-2">Ana Sayfa</h1>
        <p className="text-neutral-500 text-sm max-w-md">
          {hasAnyBoard
            ? 'Ana sayfada hangi arşivin gösterileceğini henüz seçmedin. Ayarlar → Ana Sayfa Ayarları → Görünüm\'den seçebilirsin.'
            : 'Henüz bir arşivin yok — burada bir şey göstermeden önce en az bir arşiv oluşturman lazım.'}
        </p>
        <Link to="/arsivlerim" style={primaryButtonStyle} className={`mt-6 text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}>
          {hasAnyBoard ? 'Ayarlara Git' : 'Arşiv Oluştur'}
        </Link>
      </div>
    )
  }

  if (boardLoading || rowsLoading) return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>
  if (!board) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-neutral-500 text-sm">Seçili arşiv bulunamadı, Ana Sayfa Ayarları'ndan tekrar seç.</p>
      </div>
    )
  }

  const landscape = settings.layout === 'yatay'
  const bodySections = sortByOrder((settings.sections ?? []).filter((s) => s.showInBody !== false), settings.bodyOrder ?? [])
  const cardSize = settings.cardSize ?? 'orta'
  const cardWidth = landscape ? CARD_WIDTHS[cardSize].yatay : CARD_WIDTHS[cardSize].dikey
  // Dikey + Küçük'te "her zaman göster" güzel durmuyor (bkz. HomeSettingsPanel.tsx'teki
  // infoAlwaysUnavailable) — ayarlar panelinde bu kombinasyonda hem devre dışı bırakılıp hem
  // otomatik kapatılıyor, ama eski (bu kısıtlamadan önce kaydedilmiş) veriler için burada da
  // aynı kombinasyonda savunmacı olarak yok sayılıyor.
  const showInfoAlways = (settings.showInfoAlways ?? false) && !(!landscape && cardSize === 'kucuk')

  // Ana içerik ("Tümü" ya da bir filtre/bölümün grid'i) ve bölüm satırları önce ayrı ayrı
  // hazırlanıyor, sonra mod satırı kullanıcının Ayarlar'dan seçtiği `position`e göre bu
  // dizinin içine ekleniyor — böylece mod satırı sabit bir yere değil, istenen "kaçıncı satır"a
  // yerleşiyor (1 = en üstte, "Tümü"den önce).
  const mainContentNode =
    scopedRows.length === 0 ? (
      <p key="main" className="text-neutral-500 text-sm px-3 sm:px-6">
        {adHocFilter ? 'Bu değeri taşıyan başka kayıt yok.' : 'Bu arşivde henüz kayıt yok.'}
      </p>
    ) : activeFilter ? (
      // Bir oyuncu/seçenek rozetine tıklayınca gelinen liste (adHocFilter) VE üstteki
      // menüye eklenmiş, tıklanınca kendi sayfası açılan "bölüm"ler (activeSection) —
      // ana düzen ayarı "yatay" (tek satır kaydırmalı) olsa bile, ikisi de arama
      // sonuçlarıyla aynı şekilde aşağı doğru listelensin istendi. Kart şekli (landscape)
      // yine ayarı takip ediyor, sadece dizilişi HomeRow'un tek-satır kaydırması değil,
      // arama sonuçlarındaki gibi auto-fill grid (bkz. GlobalSearch.tsx'teki aynı desen).
      <div key="main">
        {/* adHocFilter kendi başlığını (oyuncu fotoğrafı/adıyla) yukarıda zaten gösteriyor —
            burada sadece isimli bir "bölüm" sayfasındaysak (activeSection) HomeRow'un eskiden
            gösterdiği başlığı kaybetmeyelim diye tekrar ediyoruz. */}
        {activeSection && <h2 className="text-xl font-semibold text-neutral-200 mb-2">{sectionTitle}</h2>}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${landscape ? '15rem' : '8.5rem'}, 1fr))` }}
        >
          {displayRows.map((row) => (
            <HomeCard key={row.id} board={board} row={row} landscape={landscape} fill onOpenDetail={setDetailRow} />
          ))}
        </div>
      </div>
    ) : (
      // "Tümü" de (isimli bölümler/autoFill gibi) HER ZAMAN yatay kaydırmalı tek satır —
      // "Izgara" ayarı hiçbir yerde çok-satırlı bir grid'e dönüşmüyor, SADECE HomeCard'ın kart
      // şeklini (dikey poster / yatay banner) değiştiriyor. İlk sürümde "Tümü" gerçek bir
      // çok-satırlı grid'e dönüyordu, kullanıcı düzeltti: "o da yatay görünümdeki gibi olacak
      // alta doğru listelenmeyecek sağa sola kaydırmalı olacak yani bu dikey görünümün farkı
      // dikey posterlerin gelmesi sadece" — `layout` ayarı artık SADECE `landscape` boolean'ı
      // üzerinden kart en/boy oranını değiştiriyor, yapısal hiçbir farkı yok.
      <HomeRow
        key="main"
        title={sectionTitle}
        board={board}
        rows={tumuRows}
        landscape={landscape}
        onOpenDetail={setDetailRow}
        cardWidth={cardWidth}
        showInfoAlways={showInfoAlways}
      />
    )

  // Adlı bölümler de aynı sebeple hep yatay kaydırmalı tek satır (bkz. yukarıdaki not) —
  // `landscape` burada da SADECE HomeCard'ın kart şeklini değiştiriyor, yapıyı değil.
  const bodyRowNodes = bodySections.map((section) => (
    <HomeRow
      key={section.id}
      title={section.name}
      board={board}
      rows={rowsForFilter(section, displayRows)}
      landscape={landscape}
      onOpenDetail={setDetailRow}
      cardWidth={cardWidth}
      showInfoAlways={showInfoAlways}
    />
  ))

  // "Tümü" satırını tamamen kapatabilme — kullanıcı "bu ana sayfadaki tümü kısmı var ya o
  // istesek de istemesek de geliyo... onu da kapatıp açabileceğim bi şey olarak ekle" dedi.
  // Sadece bileşik (varsayılan) ana sayfa görünümünü etkiler — bir bölüm/anlık filtre
  // sayfasındayken (activeFilter) mainContentNode zaten ayrı bir dalda render ediliyor,
  // bu ayardan etkilenmez.
  const showAllSection = settings.showAllSection ?? true
  const moodEnabled = Boolean(settings.moodRow?.enabled) && izlenecekPool.length > 0
  let defaultViewRows: React.ReactNode[] = [...(showAllSection ? [mainContentNode] : []), ...bodyRowNodes]
  // "Yeni Bölümler" her zaman en üstte — izlemeye devam edilen dizilerin haberi en önemli bilgi.
  if (board && (settings.newEpisodesRow ?? true)) {
    defaultViewRows = [<NewEpisodesRow key="new-episodes" board={board} rows={rows} onOpenDetail={setDetailRow} />, ...defaultViewRows]
  }
  if (moodEnabled && settings.moodRow) {
    const insertAt = Math.min(Math.max(Math.round(settings.moodRow.position ?? 1) - 1, 0), defaultViewRows.length)
    const moodNode = (
      <MoodRow
        key="mood-row"
        title={settings.moodRow.title ?? ''}
        moods={settings.moodRow.moods}
        board={board}
        rows={izlenecekPool}
        onOpenDetail={setDetailRow}
      />
    )
    defaultViewRows = [...defaultViewRows.slice(0, insertAt), moodNode, ...defaultViewRows.slice(insertAt)]
  }

  // "En altta rastgele satırlarla doldur" — her zaman en sonda, mod satırından da sonra, ve
  // bölümlerle aynı sebeple hep yatay kaydırmalı (bkz. bodyRowNodes'daki not).
  if (autoFillPicks.length > 0) {
    defaultViewRows = [
      ...defaultViewRows,
      ...autoFillPicks.map((c) => (
        <HomeRow
          key={`autofill-${c.optionId}`}
          title={c.label}
          board={board}
          rows={c.rows}
          landscape={landscape}
          onOpenDetail={setDetailRow}
          cardWidth={cardWidth}
          showInfoAlways={showInfoAlways}
        />
      )),
    ]
  }

  return (
    <div className="px-4 py-6 space-y-8">
      {featured && !adHocRequested && (
        <div className="relative mx-3 sm:mx-6">
          {ambientSource && (
            // 70px'lik tam boyutlu bir blur, kaydırma sırasında her karede yeniden boyanıp
            // ciddi bir takılmaya sebep oluyordu. Aynı görünümü, görseli 1/4 boyutunda (1/16
            // piksel alanında) blurlayıp CSS transform'la 4 kat büyüterek çok daha ucuza elde
            // ediyoruz — blur maliyeti raster alanıyla orantılı, büyütme ise neredeyse bedava.
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 opacity-60"
              style={{
                top: '-90px',
                bottom: '50%',
                transform: 'scale(1.15)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 100%)',
                maskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 100%)',
              }}
            >
              {/* Vitrinin kenarlarından yumuşakça taşıp devam etsin diye kırpma yok — küçük
                  boyutta blurlayıp büyüterek ucuzlattığımız katman burada da aynı taşmayı
                  (eski tam boyutlu blur'un doğal kenar bulanıklığını) koruyor. */}
              <div
                className="absolute top-0 left-0 transition-[background-image] duration-700"
                style={{
                  width: '25%',
                  height: '25%',
                  backgroundImage: `url(${ambientSource})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(15px) saturate(1.2)',
                  transform: 'scale(4)',
                  transformOrigin: 'top left',
                  willChange: 'transform',
                }}
              />
            </div>
          )}
          <ShowcaseBanner
            imageUrl={featuredImage}
            // Detay penceresi açıkken (openRow) bu vitrin videosu arkada, görünmez halde
            // oynamaya devam ediyordu — detay penceresinin kendi videosuyla aynı anda iki
            // oynatıcı çalışmış oluyordu. Pencere açıkken null vererek durduruyoruz, pencere
            // kapanınca (openRow tekrar boşalınca) vitrin videosu normal şekilde geri gelir.
            videoId={openRow ? null : (featuredYt?.id ?? null)}
            startSeconds={featuredYt?.start ?? 0}
            title=""
            onShowingVideoChange={setVideoShowing}
          />
          <FeaturedOverlay
            title={featuredTitle}
            titleImage={featuredTitleImage}
            meta={featuredMeta}
            ageRating={featuredAgeRating}
            synopsis={featuredSynopsis}
            onMoreInfo={() => setDetailRow(featured)}
          />
        </div>
      )}

      {adHocFilter && (
        <div className="px-3 sm:px-6 flex items-center gap-4">
          {filterOption?.image && (
            <img
              src={filterOption.image}
              alt={filterOption.label}
              className="w-16 aspect-[2/3] object-cover rounded-lg bg-neutral-800 shrink-0"
            />
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-neutral-50">{filterOption?.label}</h1>
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-50 border border-neutral-800 hover:border-neutral-600 rounded-lg px-3 py-1.5 transition"
              >
                <CloseIcon />
                Filtreyi Kaldır
              </Link>
            </div>
            {filterOption?.subtitle && <p className="text-sm text-neutral-400 mt-1">{filterOption.subtitle}</p>}
          </div>
        </div>
      )}

      {activeFilter ? mainContentNode : defaultViewRows}

      {openRow && <RowDetailModal board={board} row={openRow} onClose={closeDetail} />}
    </div>
  )
}
