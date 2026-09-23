import { useEffect, useMemo, useRef, useState } from 'react'
import type { Board, Mood, Row } from '../types'
import { titleText, BUILTIN_MOODS } from '../types'
import { parseYouTubeUrl } from '../lib/youtube'
import { hoverCardMeta } from '../lib/rowMeta'
import { resolveRole } from '../lib/roles'
import { isScrolling } from '../lib/scrollGuard'
import { useProfiles } from '../hooks/useProfiles'
import { useThemeMode } from '../hooks/useThemeMode'
import HoverPreviewVideo from './HoverPreviewVideo'
import { gradientBorderStyle, BRAND_GRADIENT } from '../lib/theme'

// Uygulamayla gelen 10 varsayılan mod görseli koyu temada duracak şekilde (beyaz ikon,
// saydam arka plan) hazırlandı. CSS `filter: invert()` denendi ama güvenilir çalışmadı
// (kullanıcı "onu da düzelt gerekirse siyah hallerini mods un içine at onu kullan hep" dedi) —
// bunun yerine `app/public/moods/siyah/` altında GERÇEK siyah PNG kopyaları var (aynı dosya
// adlarıyla, sadece RGB kanalları ters çevrilmiş, saydamlık korunmuş), açık temada doğrudan o
// dosya gösteriliyor. Kullanıcının kendi yüklediği mod görsellerine KARIŞMIYOR — sadece bu 10
// tanesi. Klasöre göre değil DOSYA ADINA göre eşleştiriyoruz çünkü kullanıcının ZATEN seçili
// olan modları hâlâ eski `/medya/enerjik.png` gibi yolları taşıyabiliyor (o veri geriye dönük
// güncellenmedi) — sadece `/moods/` önekine bakan bir kontrol bu yüzden gerçek veride eşleşmezdi.
const DEFAULT_MOOD_FILENAMES = new Set(BUILTIN_MOODS.map((m) => m.image.split('/').pop()))
function resolveMoodImageSrc(path: string, theme: 'dark' | 'light'): string {
  const filename = path.split('/').pop()
  if (theme !== 'light' || !filename || !DEFAULT_MOOD_FILENAMES.has(filename)) return path
  return `/moods/siyah/${filename}`
}

// Dinlenme genişliği (dikey poster) ve üzerine gelince açılan yatay genişlik — MoodCard'ın
// kendi ölçüleri, satırın kaydırma miktarını hesaplarken de kullanılıyor.
const REST_WIDTH = 144
const HOVER_WIDTH = 320
const DAY_MS = 24 * 60 * 60 * 1000

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
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

// Dinlenirken dikey bir afiş (Poster, yoksa kapak), üzerine gelince YATAY bir kutuya açılıp
// (video varsa oynatılır, yoksa Banner/kapak görseli) altında başlık+bilgi şeridi belirir —
// HomeCard'ın "aynı oranda kalıp sadece büyüyen" hover'ından farklı olarak burada en/boy
// oranının kendisi değişiyor (bkz. kullanıcının attığı mod.png referansı). `scrollRef` doğrudan
// verilir (parentElement zincirini tırmanmak yerine) çünkü bu kart artık [mod görseli + kart]
// çiftinin İÇİNDE, tek başına satırın doğrudan çocuğu değil — sabit "iki üst ata" varsayımı
// burada geçersiz olurdu.
function MoodCard({
  board,
  row,
  scrollRef,
  onOpenDetail,
}: {
  board: Board
  row: Row
  scrollRef: React.RefObject<HTMLDivElement | null>
  onOpenDetail: (row: Row) => void
}) {
  const [hovering, setHovering] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Büyüme yönü (transform-origin), dizideki konuma değil o anki EKRAN konumuna göre
  // ölçülüyor — bkz. HomeCard'daki aynı deseni ("hangi kenara yakınsa dışarı taşmasın").
  const [origin, setOrigin] = useState<'left' | 'right' | 'center'>('center')

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    }
  }, [])

  function handleMouseEnter() {
    if (isScrolling()) return
    hoverTimer.current = setTimeout(() => {
      const btn = buttonRef.current
      const container = scrollRef.current
      if (btn && container) {
        const cardRect = btn.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        const overflowMargin = HOVER_WIDTH * 0.3
        if (cardRect.left - containerRect.left < overflowMargin) setOrigin('left')
        else if (containerRect.right - cardRect.right < overflowMargin) setOrigin('right')
        else setOrigin('center')
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
  const posterProp = resolveRole(board, 'poster')
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const urlProp = resolveRole(board, 'video')

  const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
  const poster = posterProp ? ((row.values[posterProp.id] as string) ?? '') : ''
  const banner = coverProp ? ((row.values[coverProp.id] as string) ?? '') : ''
  const restImage = poster || banner
  const hoverImage = banner || poster
  const link = urlProp ? ((row.values[urlProp.id] as string) ?? '') : ''
  const yt = link ? parseYouTubeUrl(link) : null
  const meta = hoverCardMeta(board, row)

  // Büyüme bir `width` değişimiyle oluyor (bkz. AnaSayfa'daki `scale` tabanlı hover'dan farklı
  // olarak burada en/boy oranının kendisi de değişiyor), `transform-origin` bu yüzden hiçbir işe
  // yaramaz — sabitlenmesi gereken kenarı `left`/`right` anchor'ını origin'e göre değiştirerek
  // yapıyoruz: sağ kenara yakın kartlar sağdan sabitlenip SOLA doğru büyüsün, sayfanın dışına
  // taşmasın (kullanıcının bildirdiği "en sağdaki poster taşıyor" hatası).
  const anchorStyle: React.CSSProperties = origin === 'right' ? { right: 0 } : { left: 0 }

  return (
    <div className="relative shrink-0" style={{ width: REST_WIDTH, aspectRatio: '2 / 3' }}>
      <button
        ref={buttonRef}
        onClick={() => onOpenDetail(row)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width: hovering ? HOVER_WIDTH : REST_WIDTH,
          ...anchorStyle,
          ...(hovering ? gradientBorderStyle('#262626') : {}),
        }}
        className={`absolute top-0 text-left rounded-lg bg-neutral-800 border-[1.5px] border-transparent transition-all duration-200 ${
          hovering ? 'z-20 shadow-2xl' : ''
        }`}
      >
        <div
          className="relative w-full rounded-lg overflow-hidden bg-neutral-800 transition-all duration-200"
          style={{ aspectRatio: hovering ? '16 / 9' : '2 / 3' }}
        >
          {hovering && yt ? (
            <HoverPreviewVideo videoId={yt.id} startSeconds={yt.start} />
          ) : (
            (hovering ? hoverImage : restImage) && (
              <img
                src={hovering ? hoverImage : restImage}
                alt={title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            )
          )}
          {hovering && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pointer-events-none">
              <p className="text-white text-sm font-semibold truncate" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                {title}
              </p>
            </div>
          )}
        </div>
        {hovering && (
          <div className="bg-neutral-900 rounded-b-lg px-2.5 py-2 flex items-center justify-between gap-1">
            {meta.length > 0 ? (
              <p className="text-[14px] font-bold text-neutral-400 line-clamp-2">{meta.join(' • ')}</p>
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

// Her mod için TEK bir temsilci kayıt seçer (bkz. kullanıcı düzeltmesi: "hepsinden 1'er tane
// gelecek", ayrı satırlar değil) — seçim ziyaretten ziyarete değil GÜNDE bir değişsin diye
// localStorage'a zaman damgasıyla yazılıp okunuyor. Tek bir hook çağrısı içinde TÜM modlar
// için döngüyle hesaplanıyor (her mod için ayrı bir hook çağırmak — ör. bir alt bileşende
// map içinde useDailyPick çağırmak — mod sayısı değiştikçe hook sayısını değiştirip React'ın
// Hooks kurallarını bozardı).
function useDailyMoodPicks(moods: Mood[], rows: Row[], profileId: string | null): { mood: Mood; row: Row }[] {
  const [result, setResult] = useState<{ mood: Mood; row: Row }[]>([])
  const moodsKey = moods.map((m) => `${m.id}:${m.propertyId ?? ''}:${m.optionIds.join('.')}:${m.image}:${m.name}`).join('|')
  const rowsKey = rows.map((r) => r.id).join(',')

  useEffect(() => {
    const next: { mood: Mood; row: Row }[] = []
    for (const mood of moods) {
      if (!mood.propertyId || mood.optionIds.length === 0) continue
      const pool = rows.filter((row) => {
        const v = row.values[mood.propertyId!]
        if (Array.isArray(v)) return v.some((id) => mood.optionIds.includes(id))
        return typeof v === 'string' && mood.optionIds.includes(v)
      })
      if (pool.length === 0) continue

      const cacheKey = `argus_mood_pick_${profileId ?? 'x'}_${mood.id}`
      let cached: { rowId: string; generatedAt: number } | null = null
      try {
        const raw = localStorage.getItem(cacheKey)
        if (raw) cached = JSON.parse(raw)
      } catch {
        cached = null
      }
      const isFresh = Boolean(cached) && Date.now() - cached!.generatedAt < DAY_MS
      const stillThere = isFresh && cached ? pool.find((r) => r.id === cached!.rowId) : undefined

      if (stillThere) {
        next.push({ mood, row: stillThere })
        continue
      }
      const picked = pool[Math.floor(Math.random() * pool.length)]
      next.push({ mood, row: picked })
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ rowId: picked.id, generatedAt: Date.now() }))
      } catch {
        // localStorage dolu/kapalı olabilir — sorun değil, sadece her ziyarette yeniden seçilir
      }
    }
    setResult(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moodsKey, rowsKey, profileId])

  return result
}

// TEK bir satır: kullanıcının tanımladığı her modun görseli, o moda uyan (Durum="İzlenecek"
// havuzundan) TEK bir kaydın dikey kartıyla yan yana, hepsi aynı yatay kaydırmalı şeritte —
// kullanıcının attığı mod.png referansındaki "Top 10" satırının aynı yapısı (numara yerine
// modun görseli, tek bir satırda yan yana diziliyor). Her modun gösterdiği kayıt günde bir
// değişir (bkz. useDailyMoodPicks) — pill/seçici YOK, ayrı-ayrı-satır YOK, hepsi tek satırda.
export default function MoodRow({
  title,
  moods,
  board,
  rows,
  onOpenDetail,
}: {
  title: string
  moods: Mood[]
  board: Board
  // İzlenecek listesinin tamamı (henüz mod filtresi uygulanmamış) — her mod burada kendi
  // filtresine göre daraltılıp o havuzdan tek bir kayıt seçiyor.
  rows: Row[]
  onOpenDetail: (row: Row) => void
}) {
  const { activeProfileId } = useProfiles()
  const { theme } = useThemeMode()
  // Kapatılan (silinmeyen, sadece devre dışı bırakılan) modlar ana sayfada hiç görünmez —
  // bkz. MoodRowEditor.tsx'teki ToggleSwitch, Mood.enabled eski kayıtlarda yoksa true sayılır.
  const enabledMoods = useMemo(() => moods.filter((m) => m.enabled ?? true), [moods])
  const items = useDailyMoodPicks(enabledMoods, rows, activeProfileId)
  const scrollRef = useRef<HTMLDivElement>(null)
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
  }, [items])

  function scroll(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * 7 * (REST_WIDTH + 80), behavior: 'smooth' })
  }

  // Bkz. BoardTable.tsx'teki aynı düzeltme: yatay kaydırılabilir bir kutunun üzerinde fare
  // tekerleğiyle dikey kaydırmaya çalışınca tarayıcı bunu kutunun kendi yatay kaydırmasına
  // çeviriyordu — baskın eksen dikeyse sayfayı elle kaydırıp kutunun davranışını engelliyoruz.
  function handleWheel(e: React.WheelEvent) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault()
      window.scrollBy({ top: e.deltaY, left: 0 })
    }
  }

  if (items.length === 0) return null

  return (
    <div className="group/row">
      {title && <h2 className="text-xl font-semibold text-neutral-200 mb-2">{title}</h2>}
      {/* `flow-root`: bkz. HomeRow'daki aynı düzeltme — çıplak bir `relative` div, tek
          çocuğunun -mt/-mb marjlarını dışarı sızdırıp kendi yüksekliğini kart yerine
          dolgulu kutunun tam boyuna eşitliyordu. */}
      <div className="relative" style={{ display: 'flow-root' }}>
        {canScrollLeft && (
          <button
            onClick={() => scroll(-1)}
            title="Sola kaydır"
            className="absolute left-1 top-1/2 -translate-y-1/2 z-30 text-white opacity-0 group-hover/row:opacity-100 hover:scale-110 transition"
            style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }}
          >
            <ChevronLeftIcon />
          </button>
        )}
        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="no-scrollbar flex items-end gap-8 overflow-x-auto px-4 -mx-4 pt-16 pb-16 -mt-16 -mb-16 scroll-smooth"
        >
          {items.map(({ mood, row }) => (
            <div key={mood.id} className="flex items-end shrink-0">
              {/* Sağ tarafı silik/soluk (linear-gradient mask) ve biraz grileştirilmiş (filter) —
                  poster kartı bu soluk kısmın üzerine bindiriliyor (negatif margin), kullanıcının
                  attığı "Top 10" referansındaki numara/poster üst üste binmesiyle aynı görünüm. */}
              <img
                src={resolveMoodImageSrc(mood.image, theme)}
                alt={mood.name}
                title={mood.name}
                className="shrink-0 h-auto w-auto object-contain"
                style={{
                  height: REST_WIDTH * 1.5,
                  filter: 'grayscale(45%) brightness(0.85)',
                  WebkitMaskImage: 'linear-gradient(to right, black 35%, transparent 85%)',
                  maskImage: 'linear-gradient(to right, black 35%, transparent 85%)',
                }}
              />
              <div className="relative z-10" style={{ marginLeft: -40 }}>
                <MoodCard board={board} row={row} scrollRef={scrollRef} onOpenDetail={onOpenDetail} />
              </div>
            </div>
          ))}
        </div>
        {canScrollRight && (
          <button
            onClick={() => scroll(1)}
            title="Sağa kaydır"
            className="absolute right-1 top-1/2 -translate-y-1/2 z-30 text-white opacity-0 group-hover/row:opacity-100 hover:scale-110 transition"
            style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }}
          >
            <ChevronRightIcon />
          </button>
        )}
      </div>
    </div>
  )
}
