import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Board, PropertyDef, PropertyValue, Row, SelectOption } from '../types'
import { titleText, episodeKey, todayIso, ratingAverage } from '../types'
import { parseYouTubeUrl } from '../lib/youtube'
import { formatRuntime } from '../lib/rowMeta'
import { resolveRole } from '../lib/roles'
import { normalizeAgeRating } from '../lib/ageRating'
import { BRAND_TEXT } from '../lib/theme'
import { useCast } from '../hooks/useCast'
import { useEpisodes } from '../hooks/useEpisodes'
import { useWatched } from '../hooks/useWatched'
import { useToast } from '../hooks/useToast'
import ShowcaseBanner from './ShowcaseBanner'
import OptionBadge from './OptionBadge'
import OptionDetailModal from './OptionDetailModal'
import SeasonsBrowser from './SeasonsBrowser'
import TmdbExtras from './TmdbExtras'
import SectionTitle from './SectionTitle'
import AgeRatingChip from './AgeRatingChip'

const CAST_PREVIEW = 12

function formatDate(v: string) {
  const [y, m, d] = v.split('-')
  if (!y || !m || !d) return v
  return `${d}.${m}.${y.slice(2)}`
}

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

// "Yaş Sınırı" kaynağa göre (TR sertifikası, ABD sinema/TV kodu) karışık formatlarda gelebiliyor
// — burada hep aynı renkli rozet (AgeRatingChip) + Türkçe kademe adı + kısa açıklama olarak
// gösteriliyor (vitrindeki sade haliyle farklı olarak burada açıklama metni de var). Eşlenemeyen
// bir değer gelirse (ör. beklenmedik bir kod) rozetsiz, olduğu gibi düz metin basılır.
function AgeRatingBadge({ raw }: { raw: string }) {
  const tier = normalizeAgeRating(raw)
  if (!tier) return <span className="text-neutral-300 text-base">{raw}</span>
  return (
    <div className="flex items-center gap-2.5">
      <AgeRatingChip raw={raw} className="h-8 min-w-8 text-xs" />
      <p className="text-neutral-400 text-sm leading-snug">{tier.description}</p>
    </div>
  )
}

function DetailValue({
  property,
  value,
  isRuntime,
  onOptionClick,
}: {
  property: PropertyDef
  value: PropertyValue
  // Bu sütun "Süre" görevindeyse (bkz. lib/roles.ts) dakika "1 sa 52 dk" gibi gösterilir.
  isRuntime: boolean
  onOptionClick: (propertyId: string, option: SelectOption) => void
}) {
  if (property.type === 'checkbox') return <span className="text-neutral-300 text-base">{value ? 'Evet' : 'Hayır'}</span>
  if (property.type === 'date') return <span className="text-neutral-300 text-base">{formatDate(value as string)}</span>
  if (property.type === 'multidate') {
    const dates = (Array.isArray(value) ? (value as string[]) : []).slice().sort()
    if (dates.length === 0) return null
    return <span className="text-neutral-300 text-base">{dates.map(formatDate).join(', ')}</span>
  }
  if (isRuntime && typeof value === 'number') {
    return <span className="text-neutral-300 text-base">{formatRuntime(value)}</span>
  }
  if (property.type === 'multiselect') {
    const ids = Array.isArray(value) ? value : []
    return (
      <div className="flex flex-wrap gap-1">
        {ids.map((id) => {
          const opt = property.options?.find((o) => o.id === id)
          return opt ? (
            <OptionBadge
              key={id}
              label={opt.label}
              colorIndex={opt.colorIndex}
              image={opt.image}
              dim={false}
              onClick={() => onOptionClick(property.id, opt)}
            />
          ) : null
        })}
      </div>
    )
  }
  return <span className="text-neutral-300 text-base">{String(value)}</span>
}

export default function RowDetailModal({
  board,
  row,
  onClose,
  editable = false,
  onFetchTmdb,
}: {
  board: Board
  row: Row
  onClose: () => void
  // Bölüm izleme tiklerini/tekrar izleme eklemeyi düzenleyebilme — sadece BoardView'ın
  // "Detayı Gör" (veritabanı) girişinden true, ana sayfadan (kart tıklayınca) açılan aynı
  // pencerede bilerek false: kullanıcı "izlendi ekleme kısmı sadece veritabanından detay gör
  // diyince gelsin, ana sayfadan normal görelim" dedi.
  editable?: boolean
  // BoardTable.tsx'in satır menüsündeki "Güncelle" ile birebir aynı işlev — sadece
  // BoardView'dan (editable=true) geçiriliyor, kullanıcı bu pencereden de erişmek istedi
  // ("tmdb den doldur özelliğini veritabanından girdiğim detay penceresine de ekle").
  onFetchTmdb?: (
    rowId: string,
  ) => Promise<{ ok: true; mediaType: 'movie' | 'tv'; filled: string[]; newEpisodes: number; newActors: number } | undefined>
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const cast = useCast()
  const { episodes, reload: reloadEpisodes } = useEpisodes()
  const { watched, saveRowWatched } = useWatched()
  const { notify } = useToast()
  const [refreshing, setRefreshing] = useState(false)
  // Oyuncular ızgarası: ilk iki sıra görünür, "Tümünü göster" ile hepsi açılır (kullanıcı yatay
  // kaydırmalı şeritte oyuncuların hepsini göremiyordu).
  const [showAllCast, setShowAllCast] = useState(false)
  const [detailOption, setDetailOption] = useState<{ propertyId: string; option: SelectOption; role?: string } | null>(
    null,
  )

  // Bu pencere açıkken arkadaki sayfanın kendi kaydırma çubuğu da aktif kalıyordu — biri
  // pencerenin, biri arkadaki sayfanın olmak üzere aynı anda iki kaydırma çubuğu görünüyordu.
  // Pencere açıkken sayfanın gövdesini kilitleyip sadece bu pencerenin içi kaysın istiyoruz.
  // Sadece `overflow: hidden` yetmiyordu: tarayıcı bunu uygularken sayfayı görünürde ANINDA
  // en başa sıçratıyor (kapanışta eski konuma dönsek bile pencere AÇIKKEN arka plan hep en
  // üstü gösteriyordu — kullanıcı bildirdi). Bunun yerine body'yi olduğu kaydırma konumunda
  // `position: fixed` ile sabitleyip negatif bir `top` veriyoruz — bu, arka planı tam o anki
  // görünümünde donduran standart "scroll lock" tekniği; kapanışta hem stilleri hem gerçek
  // kaydırma konumunu geri veriyoruz.
  useEffect(() => {
    const scrollY = window.scrollY
    const body = document.body
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.width = prev.width
      body.style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [])

  // Bir çoklu-seçim değerine (ör. bir oyuncu rozetine) tıklayınca, ana sayfada o değere göre
  // filtrelenmiş bir kart listesi açıyoruz — "bu oyuncu başka nerede oynamış" sorusuna genel
  // bir cevap, ham veritabanı tablosuna değil.
  // Filtre sayfasındaki "Filtreyi Kaldır" kullanıcıyı eskiden hep ana sayfaya atıyordu —
  // kullanıcı "kaldığım yere atsın beni" dedi. Bu yüzden şu anki sayfa (ör. veritabanı tablosu,
  // kendi filtresiyle) + bu detay penceresi (?detay=) + kaydırma konumu yanımızda taşınıyor.
  function goToFilter(propertyId: string, optionId: string) {
    const back = new URLSearchParams(location.search)
    back.set('detay', row.id)
    // Pencere açıkken sayfa kilitli (bkz. yukarıdaki scroll lock) — gerçek konum body'nin top'unda.
    const scrollY = -parseInt(document.body.style.top || '0', 10) || 0
    onClose()
    navigate(`/?filterProp=${propertyId}&filterOption=${optionId}`, {
      state: { returnTo: `${location.pathname}?${back.toString()}`, scrollY },
    })
  }

  // Görseli olan bir seçenek (ör. fotoğrafı çekilmiş bir oyuncu) tıklanınca önce onun
  // kendi bilgi kartını gösteriyoruz; oradan "içerikleri gör" ile filtreye geçiliyor.
  // Görseli olmayan seçenekler (Tür/Ülke gibi) eskisi gibi doğrudan filtreye gider.
  function handleOptionClick(propertyId: string, option: SelectOption, role?: string) {
    if (option.image || option.subtitle || role) setDetailOption({ propertyId, option, role })
    else goToFilter(propertyId, option.id)
  }
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const titleImageProp = board.properties.find((p) => p.id === board.titleImagePropertyId && p.type === 'image')
  const synopsisProp = resolveRole(board, 'sinopsis')
  const urlProp = resolveRole(board, 'video')
  // "Poster" (dikey afiş) ve "Oyuncular" bu pencerede kendi özel alanlarında ayrıca
  // gösteriliyor — genel ızgaraya/özete tekrar düşmesinler diye usedIds'e ekleniyor.
  const posterProp = resolveRole(board, 'poster')
  const oyuncularProp = resolveRole(board, 'oyuncular')
  // "Yaş Sınırı" de kendi rozet+açıklama gösterimine sahip, genel metin ızgarasına düşmesin diye
  // aynı şekilde usedIds'e ekleniyor (bkz. AgeRatingBadge).
  const yasProp = resolveRole(board, 'yas')
  const sureProp = resolveRole(board, 'sure')

  const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
  const titleImage = titleImageProp ? ((row.values[titleImageProp.id] as string) ?? '') : ''
  const cover = coverProp ? ((row.values[coverProp.id] as string) ?? '') : ''
  const poster = posterProp ? ((row.values[posterProp.id] as string) ?? '') : ''
  const synopsis = synopsisProp ? ((row.values[synopsisProp.id] as string) ?? '') : ''
  const link = urlProp ? ((row.values[urlProp.id] as string) ?? '') : ''
  const yt = link ? parseYouTubeUrl(link) : null
  const yasValue = yasProp ? ((row.values[yasProp.id] as string) ?? '').trim() : ''

  const usedIds = new Set([
    board.titlePropertyId,
    coverProp?.id,
    titleImageProp?.id,
    synopsisProp?.id,
    urlProp?.id,
    posterProp?.id,
    oyuncularProp?.id,
    yasProp?.id,
  ])

  // Seçim/tarih tipindeki değerler ("Dizi", "2026" gibi) üstte kompakt bir satırda
  // özetlenir; geri kalanı (çoklu seçim, metin vb.) aşağıdaki ızgarada listelenir.
  const gridProps = board.properties.filter(
    (p) => !usedIds.has(p.id) && p.type !== 'select' && p.type !== 'date' && p.type !== 'rating',
  )

  const actorIds = oyuncularProp && Array.isArray(row.values[oyuncularProp.id]) ? (row.values[oyuncularProp.id] as string[]) : []
  const castByOptionId = new Map((cast[row.id] ?? []).map((c) => [c.optionId, c]))
  const seasons = episodes[row.id]
  const rowWatched = watched[row.id] ?? {}
  const hasTitle = title.trim().length > 0

  // BoardTable.tsx'in kendi handleRefreshClick'iyle aynı mantık — `row` prop'u BoardView'da
  // zaten `rows.find(...)`e bağlı olduğundan (bkz. çağıran yer) board/row alanları PATCH sonrası
  // otomatik tazeleniyor; sadece bu pencerenin KENDİ `useEpisodes()`'ı ayrıca `reload()` edilmeli
  // ki "Sezonlar" bölümü ilk kez gelen bölüm verisinde anında görünsün.
  async function handleFetchTmdb() {
    if (!onFetchTmdb) return
    setRefreshing(true)
    try {
      const result = await onFetchTmdb(row.id)
      if (result) {
        const parts: string[] = []
        if (result.filled.length > 0) parts.push(`dolduruldu: ${result.filled.join(', ')}`)
        if (result.newEpisodes > 0) parts.push(`${result.newEpisodes} yeni bölüm`)
        if (result.newActors > 0) parts.push(`${result.newActors} yeni oyuncu`)
        notify(parts.length > 0 ? parts.join(' · ') : 'TMDB eşleşmesi bulundu ama eklenecek yeni bir şey yoktu.', 'success')
        if (result.newEpisodes > 0) reloadEpisodes()
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "TMDB'den çekerken bir hata oluştu.", 'danger')
    } finally {
      setRefreshing(false)
    }
  }

  // Bir bölümün tik'i (ya da açılan popover'daki tekrar izleme düzenlemesi) — her seferinde
  // o kaydın TÜM bölüm haritasını (sadece bu bir anahtarı değil) sunucuya gönderiyoruz, satırın
  // kendi `values`'ını kaydetmeyle aynı "tam nesneyi PUT'la" deseni (bkz. useWatched.ts).
  function setEpisodeDates(key: string, dates: string[]) {
    const next = { ...rowWatched }
    if (dates.length === 0) delete next[key]
    else next[key] = dates
    saveRowWatched(row.id, next)
  }

  // "Sezonu İzlendi İşaretle" — sadece henüz hiç tarihi olmayan bölümlere bugünün tarihini
  // ekler, zaten işaretli (ör. daha önce farklı bir tarihte tekli tiklenmiş) bölümlere
  // dokunmaz — mevcut tekil kayıtları ezmeden toplu ilerleme sağlar.
  function markSeasonWatched(seasonNumber: number) {
    const targetSeason = seasons?.find((s) => s.seasonNumber === seasonNumber)
    if (!targetSeason) return
    const next = { ...rowWatched }
    const today = todayIso()
    for (const ep of targetSeason.episodes) {
      const key = episodeKey(seasonNumber, ep.episodeNumber)
      if (!next[key] || next[key].length === 0) next[key] = [today]
    }
    saveRowWatched(row.id, next)
  }

  // Tersi — sezondaki TÜM bölümlerin izlenme (ve varsa tekrar izleme) tarihlerini siler.
  // Yıkıcı bir işlem olduğu için (SeasonsBrowser zaten bir onay soruyor) burada ikinci bir
  // soru yok — bu fonksiyon doğrudan uygular.
  function unmarkSeasonWatched(seasonNumber: number) {
    const targetSeason = seasons?.find((s) => s.seasonNumber === seasonNumber)
    if (!targetSeason) return
    const next = { ...rowWatched }
    for (const ep of targetSeason.episodes) {
      delete next[episodeKey(seasonNumber, ep.episodeNumber)]
    }
    saveRowWatched(row.id, next)
  }

  // ---- 26 Eylül 2026 yenilemesi: üstte etiketler, puan ve izleme kartları, bölüm başlıkları, hızlı geçiş ----
  const puanProp = resolveRole(board, 'puan')
  const tarihProp = resolveRole(board, 'izlemeTarihi')
  const scores =
    puanProp && row.values[puanProp.id] && typeof row.values[puanProp.id] === 'object' && !Array.isArray(row.values[puanProp.id])
      ? (row.values[puanProp.id] as Record<string, number>)
      : {}
  const scoredCriteria = (puanProp?.criteria ?? []).filter((c) => typeof scores[c.id] === 'number')
  const avgScore = puanProp ? ratingAverage(row.values[puanProp.id], puanProp) : null
  const watchDates = (() => {
    if (!tarihProp) return [] as string[]
    const v = row.values[tarihProp.id]
    return (Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []).slice().sort().reverse()
  })()
  // Dizilerde bölüm ilerlemesi: yayınlanmış bölümlerden kaçının işaretli olduğu.
  const episodeProgress = (() => {
    if (!seasons || seasons.length === 0) return null
    const today = todayIso()
    let aired = 0
    let seen = 0
    for (const s of seasons) {
      for (const ep of s.episodes) {
        if (ep.airDate && ep.airDate > today) continue
        aired++
        if ((rowWatched[episodeKey(s.seasonNumber, ep.episodeNumber)] ?? []).length > 0) seen++
      }
    }
    // Hiç bölüm işaretlenmemişse (bölüm bölüm takip etmiyorsan) "0 / 73" gibi yanıltıcı bir çubuk gösterme.
    return aired > 0 && seen > 0 ? { aired, seen } : null
  })()

  // Üstteki etiketler: seçim sütunları (Durum, Kategori…) kendi renkleriyle, yıl, süre ve puan.
  const pillSelects = board.properties.filter((p) => !usedIds.has(p.id) && p.type === 'select')
  const vizyonProp = resolveRole(board, 'vizyon')
  const vizyonYear = vizyonProp && typeof row.values[vizyonProp.id] === 'string' ? (row.values[vizyonProp.id] as string).slice(0, 4) : ''
  const runtime = sureProp && typeof row.values[sureProp.id] === 'number' ? formatRuntime(row.values[sureProp.id] as number) : ''
  // Kendi kartlarında gösterilenler bilgi kartına tekrar düşmesin.
  const infoProps = gridProps.filter((p) => p.id !== tarihProp?.id && p.id !== sureProp?.id)

  // Kullanıcı ikinci hali de sevmedi ("detay penceresini sevemedim, daha güzel yap", 26 Eylül 2026):
  // artık afiş gibi — poster, logo/ad, etiketler ve düğmeler büyük görselin alt kısmına biniyor;
  // altında iki sütun: solda özet, bölümler, oyuncular ve benzerler; sağda dar bir bilgi sütunu
  // (puanın, izleme, bilgiler, nerede izlenir).
  const hasInfo = infoProps.some((p) => {
    const v = row.values[p.id]
    return !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))
  })
  const origProp = resolveRole(board, 'orjinalAdi')
  const origTitle = origProp && typeof row.values[origProp.id] === 'string' ? (row.values[origProp.id] as string).trim() : ''
  const sideCard = 'rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4'

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm overflow-y-auto py-6 px-3 sm:px-8 md:px-14" onClick={onClose}>
      <div
        className="relative bg-neutral-900 rounded-3xl w-full max-w-6xl mx-auto shadow-2xl shadow-black/60 ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst: büyük görsel (fragman varsa oynar). Başlık kendi bölümümüzde gösterildiği için görselin
            kendi logo şeridi kapalı. */}
        <div className="relative rounded-t-3xl overflow-hidden">
          <ShowcaseBanner
            imageUrl={cover}
            videoId={yt?.id ?? null}
            startSeconds={yt?.start ?? 0}
            title=""
            aspect="21/9"
            bottomFadeColor="#171717"
            controlsTop
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent" />
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="absolute top-4 right-4 h-10 w-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-sm text-white text-xl z-10 transition"
          >
            ×
          </button>
        </div>

        {/* Afiş bölümü: görselin altına biniyor */}
        <div className="relative z-10 px-4 sm:px-8 md:px-10 -mt-14 sm:-mt-28 md:-mt-40">
          <div className="flex items-end gap-4 sm:gap-7">
            {poster && (
              <img
                src={poster}
                alt={title}
                className="w-24 sm:w-40 md:w-52 aspect-[2/3] object-cover rounded-2xl shrink-0 bg-neutral-800 shadow-2xl shadow-black/60 ring-1 ring-white/15"
              />
            )}
            <div className="flex-1 min-w-0 pb-1 space-y-3">
              {titleImage ? (
                <img
                  src={titleImage}
                  alt={title}
                  className="max-h-14 sm:max-h-24 md:max-h-28 max-w-full w-auto object-contain object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)]"
                />
              ) : null}
              <div>
                <h2 className={`${titleImage ? 'text-base sm:text-lg text-neutral-200' : 'text-2xl sm:text-4xl text-neutral-50'} font-bold tracking-tight leading-tight`}>
                  {title}
                </h2>
                {origTitle && origTitle !== title && <p className="text-xs sm:text-sm text-neutral-500 mt-0.5 truncate">{origTitle}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {avgScore !== null && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400 text-neutral-950">
                    ★ {avgScore.toFixed(1)}
                  </span>
                )}
                {pillSelects.map((p) => {
                  const opt = p.options?.find((o) => o.id === row.values[p.id])
                  return opt ? <OptionBadge key={p.id} label={opt.label} colorIndex={opt.colorIndex} image={opt.image} dim={false} /> : null
                })}
                {[vizyonYear, runtime].filter(Boolean).map((t) => (
                  <span key={t} className="text-[11px] leading-none px-2 py-1 rounded-full border border-neutral-600 text-neutral-200 bg-black/20">
                    {t}
                  </span>
                ))}
                {yasValue && <AgeRatingChip raw={yasValue} className="h-6 min-w-6" />}
              </div>
              {editable && onFetchTmdb && hasTitle && (
                <button
                  onClick={handleFetchTmdb}
                  disabled={refreshing}
                  title={"TMDB'den güncelle: boş bilgileri doldurur, dizilerde yeni bölümleri de getirir"}
                  className="hidden sm:inline-flex items-center gap-1.5 text-xs text-neutral-300 hover:text-neutral-50 border border-neutral-600 hover:border-neutral-400 bg-black/20 rounded-full px-3 py-1.5 transition disabled:opacity-50"
                >
                  <RefreshIcon spinning={refreshing} />
                  {refreshing ? 'Çekiliyor...' : 'Güncelle'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 md:px-10 pt-6 pb-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-8 lg:gap-10">
          {/* Sol: ana içerik */}
          <div className="min-w-0 space-y-10">
            {(synopsis || yasValue) && (
              <section className="space-y-3">
                {synopsis && <p className="text-neutral-200 text-base sm:text-[17px] leading-relaxed">{synopsis}</p>}
                {yasValue && <AgeRatingBadge raw={yasValue} />}
                {editable && onFetchTmdb && hasTitle && (
                  <button
                    onClick={handleFetchTmdb}
                    disabled={refreshing}
                    className="sm:hidden inline-flex items-center gap-1.5 text-xs text-neutral-300 border border-neutral-700 rounded-full px-3 py-1.5 disabled:opacity-50"
                  >
                    <RefreshIcon spinning={refreshing} />
                    {refreshing ? 'Çekiliyor...' : 'Güncelle'}
                  </button>
                )}
              </section>
            )}

            {seasons && seasons.length > 0 && (
              <section id="rd-bolumler">
                <SectionTitle title="Bölümler" count={`${seasons.length} sezon`} />
                <SeasonsBrowser
                  seasons={seasons}
                  watched={rowWatched}
                  onSetEpisodeDates={setEpisodeDates}
                  onMarkSeasonWatched={markSeasonWatched}
                  onUnmarkSeasonWatched={unmarkSeasonWatched}
                  editable={editable}
                />
              </section>
            )}

            {oyuncularProp && actorIds.length > 0 && (
              <section id="rd-oyuncular">
                <SectionTitle title={oyuncularProp.name} count={String(actorIds.length)} />
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-3 gap-y-5">
                  {(showAllCast ? actorIds : actorIds.slice(0, CAST_PREVIEW)).map((id) => {
                    const opt = oyuncularProp.options?.find((o) => o.id === id)
                    if (!opt) return null
                    const entry = castByOptionId.get(id)
                    const roleLine = entry?.episodeCount ? `${entry.character} · ${entry.episodeCount} bölüm` : entry?.character
                    return (
                      <button key={id} onClick={() => handleOptionClick(oyuncularProp.id, opt, roleLine)} className="min-w-0 text-center group">
                        <span className="block mx-auto h-24 w-24 sm:h-[104px] sm:w-[104px] rounded-full overflow-hidden bg-neutral-800 ring-2 ring-neutral-800 group-hover:ring-[#3fa9ff] transition">
                          {opt.image ? (
                            <img src={opt.image} alt={opt.label} loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <span className="h-full w-full flex items-center justify-center text-2xl text-neutral-600">🎭</span>
                          )}
                        </span>
                        <p className="text-xs text-neutral-100 font-medium mt-2 leading-tight line-clamp-2">{opt.label}</p>
                        {roleLine && <p className="text-[11px] text-neutral-500 leading-tight line-clamp-2 mt-0.5">{roleLine}</p>}
                      </button>
                    )
                  })}
                </div>
                {actorIds.length > CAST_PREVIEW && (
                  <button
                    onClick={() => setShowAllCast((v) => !v)}
                    className="mt-5 w-full text-sm text-neutral-300 hover:text-neutral-50 border border-neutral-800 hover:border-neutral-600 rounded-xl py-2 transition"
                  >
                    {showAllCast ? 'Daha az göster' : `Tümünü göster (${actorIds.length})`}
                  </button>
                )}
              </section>
            )}

            <TmdbExtras board={board} row={row} part="similar" />
          </div>

          {/* Sağ: bilgi sütunu */}
          <aside className="space-y-4 lg:sticky lg:top-6 self-start">
            {scoredCriteria.length > 0 && avgScore !== null && (
              <div className={sideCard}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="h-12 w-12 shrink-0 rounded-xl bg-amber-400/15 text-amber-300 flex items-center justify-center text-lg font-bold tabular-nums">
                    {avgScore.toFixed(1)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-neutral-100">Puanın</p>
                    <p className="text-xs text-neutral-500">{scoredCriteria.length} kritere göre, 10 üzerinden</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {scoredCriteria.map((c) => (
                    <div key={c.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-neutral-400 truncate">{c.name}</span>
                        <span className="text-neutral-200 tabular-nums">{scores[c.id]}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${(scores[c.id] / 10) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(watchDates.length > 0 || episodeProgress) && (
              <div className={`${sideCard} space-y-3`}>
                <p className="text-sm font-semibold text-neutral-100">İzleme</p>
                {episodeProgress && (
                  <div>
                    <div className="flex items-baseline justify-between text-xs mb-1.5">
                      <span className="text-neutral-400">
                        <span className="text-neutral-50 font-semibold">{episodeProgress.seen}</span> / {episodeProgress.aired} bölüm
                      </span>
                      <span className="text-neutral-500 tabular-nums">%{Math.round((episodeProgress.seen / episodeProgress.aired) * 100)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(episodeProgress.seen / episodeProgress.aired) * 100}%`, background: BRAND_TEXT }} />
                    </div>
                  </div>
                )}
                {watchDates.length > 0 && (
                  <div>
                    <p className="text-xs text-neutral-500 mb-1.5">{watchDates.length === 1 ? 'İzlediğin tarih' : `${watchDates.length} kez izledin`}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {watchDates.map((d, i) => (
                        <span key={`${d}-${i}`} className="text-xs px-2 py-1 rounded-md bg-neutral-800 text-neutral-200 tabular-nums">
                          {formatDate(d)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {hasInfo && (
              <div className={`${sideCard} space-y-3.5`}>
                {infoProps.map((p) => {
                  const v = row.values[p.id]
                  if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return null
                  return (
                    <div key={p.id} className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">{p.name}</p>
                      <DetailValue property={p} value={v} isRuntime={p.id === sureProp?.id} onOptionClick={(propId, opt) => handleOptionClick(propId, opt)} />
                    </div>
                  )
                })}
              </div>
            )}

            <TmdbExtras board={board} row={row} part="providers" providersClassName={sideCard} />
          </aside>
        </div>
      </div>
      {detailOption && (
        <OptionDetailModal
          option={detailOption.option}
          role={detailOption.role}
          onClose={() => setDetailOption(null)}
          onShowContents={() => goToFilter(detailOption.propertyId, detailOption.option.id)}
        />
      )}
    </div>
  )
}
