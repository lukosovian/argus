import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Board, PropertyDef, PropertyValue, Row, SelectOption } from '../types'
import { titleText, episodeKey, todayIso } from '../types'
import { parseYouTubeUrl } from '../lib/youtube'
import { metaSummary, formatRuntime } from '../lib/rowMeta'
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
import AgeRatingChip from './AgeRatingChip'

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
  onOptionClick,
}: {
  property: PropertyDef
  value: PropertyValue
  onOptionClick: (propertyId: string, option: SelectOption) => void
}) {
  if (property.type === 'checkbox') return <span className="text-neutral-300 text-base">{value ? 'Evet' : 'Hayır'}</span>
  if (property.type === 'date') return <span className="text-neutral-300 text-base">{formatDate(value as string)}</span>
  if (property.type === 'multidate') {
    const dates = (Array.isArray(value) ? (value as string[]) : []).slice().sort()
    if (dates.length === 0) return null
    return <span className="text-neutral-300 text-base">{dates.map(formatDate).join(', ')}</span>
  }
  if (property.name === 'Süre' && property.type === 'number' && typeof value === 'number') {
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
  // BoardTable.tsx'in satır menüsündeki "TMDB'den Doldur" ile birebir aynı işlev — sadece
  // BoardView'dan (editable=true) geçiriliyor, kullanıcı bu pencereden de erişmek istedi
  // ("tmdb den doldur özelliğini veritabanından girdiğim detay penceresine de ekle").
  onFetchTmdb?: (
    rowId: string,
  ) => Promise<{ ok: true; mediaType: 'movie' | 'tv'; filled: string[]; newEpisodes: number; newActors: number } | undefined>
}) {
  const navigate = useNavigate()
  const cast = useCast()
  const { episodes, reload: reloadEpisodes } = useEpisodes()
  const { watched, saveRowWatched } = useWatched()
  const { notify } = useToast()
  const [refreshing, setRefreshing] = useState(false)
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
  function goToFilter(propertyId: string, optionId: string) {
    onClose()
    navigate(`/?filterProp=${propertyId}&filterOption=${optionId}`)
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
  const synopsisProp = board.properties.find((p) => p.type === 'longtext')
  const urlProp = board.properties.find((p) => p.type === 'url')
  // "Poster" (dikey afiş) ve "Oyuncular" bu pencerede kendi özel alanlarında ayrıca
  // gösteriliyor — genel ızgaraya/özete tekrar düşmesinler diye usedIds'e ekleniyor.
  const posterProp = board.properties.find((p) => p.name === 'Poster' && p.type === 'image')
  const oyuncularProp = board.properties.find((p) => p.name === 'Oyuncular' && p.type === 'multiselect')
  // "Yaş Sınırı" de kendi rozet+açıklama gösterimine sahip, genel metin ızgarasına düşmesin diye
  // aynı şekilde usedIds'e ekleniyor (bkz. AgeRatingBadge).
  const yasProp = board.properties.find((p) => p.name === 'Yaş Sınırı' && p.type === 'text')

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
  // Çoklu seçim alanları (Tür, Ülke gibi) zaten aşağıdaki ızgarada kendi rozetleriyle tam
  // olarak gösteriliyor — üstteki özet satırında bir de virgüllü metin olarak tekrar
  // etmesinler diye üst özete dahil edilmiyor (types listesinden 'multiselect' çıkarıldı).
  const metaBits = metaSummary(board, row, usedIds, ['select', 'date', 'rating'])

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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 overflow-y-auto py-6 px-4 sm:px-10 md:px-16"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 rounded-xl w-full max-w-6xl mx-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <ShowcaseBanner
            imageUrl={cover}
            videoId={yt?.id ?? null}
            startSeconds={yt?.start ?? 0}
            title={title || 'İsimsiz'}
            titleImageUrl={titleImage}
            aspect="21/9"
            titleAlwaysVisible
            bottomFadeColor="#171717"
          />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-full bg-black/70 hover:bg-black/90 text-white text-lg z-10 transition"
          >
            ×
          </button>
        </div>
        <div className="p-6 space-y-8">
          <div className="flex gap-5">
            {poster && (
              <img
                src={poster}
                alt={title}
                className="w-28 sm:w-40 md:w-48 aspect-[2/3] object-cover rounded-lg shrink-0 bg-neutral-800"
              />
            )}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Banner'daki logo (KAPAK ADI) varsa yazılı başlığın yerini alıyor — Türkçe Adı
                  o zaman hiçbir yerde görünmüyordu, kullanıcı isteğiyle burada ayrıca ekleniyor. */}
              {title && <h2 className="text-2xl font-semibold text-neutral-50">{title}</h2>}
              {metaBits.length > 0 && <p className="text-neutral-300 text-base font-medium">{metaBits.join('  •  ')}</p>}
              {editable && onFetchTmdb && hasTitle && (
                <button
                  onClick={handleFetchTmdb}
                  disabled={refreshing}
                  title={
                    seasons && seasons.length > 0
                      ? "Yeni bölüm var mı kontrol et / eksik bilgiyi tamamla (TMDB'ye bağlanır)"
                      : "TMDB'den doldur (poster, ülke, yönetmen, oyuncular vb.)"
                  }
                  className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-50 border border-neutral-700 hover:border-neutral-500 rounded-lg px-2.5 py-1.5 transition disabled:opacity-50"
                >
                  <RefreshIcon spinning={refreshing} />
                  {refreshing ? 'Çekiliyor...' : seasons && seasons.length > 0 ? 'Bölümleri Güncelle' : "TMDB'den Doldur"}
                </button>
              )}
              {yasValue && <AgeRatingBadge raw={yasValue} />}
              {synopsis && <p className="text-neutral-300 text-base leading-relaxed">{synopsis}</p>}
              {gridProps.length > 0 && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-800">
                  {gridProps.map((p) => {
                    const v = row.values[p.id]
                    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return null
                    return (
                      <div key={p.id}>
                        <p className="text-xs font-bold mb-1" style={{ color: BRAND_TEXT }}>
                          {p.name}
                        </p>
                        <DetailValue property={p} value={v} onOptionClick={(propId, opt) => handleOptionClick(propId, opt)} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {seasons && seasons.length > 0 && (
            <div className="pt-6 border-t border-neutral-800">
              <p className="text-sm font-bold mb-3" style={{ color: BRAND_TEXT }}>
                Sezonlar
              </p>
              <SeasonsBrowser
                seasons={seasons}
                watched={rowWatched}
                onSetEpisodeDates={setEpisodeDates}
                onMarkSeasonWatched={markSeasonWatched}
                onUnmarkSeasonWatched={unmarkSeasonWatched}
                editable={editable}
              />
            </div>
          )}

          {oyuncularProp && actorIds.length > 0 && (
            <div className="pt-6 border-t border-neutral-800">
              <p className="text-sm font-bold mb-3" style={{ color: BRAND_TEXT }}>
                {oyuncularProp.name}
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {actorIds.map((id) => {
                  const opt = oyuncularProp.options?.find((o) => o.id === id)
                  if (!opt) return null
                  const entry = castByOptionId.get(id)
                  const roleLine = entry?.episodeCount ? `${entry.character} · ${entry.episodeCount} bölüm` : entry?.character
                  return (
                    <button
                      key={id}
                      onClick={() => handleOptionClick(oyuncularProp.id, opt, roleLine)}
                      className="w-20 sm:w-24 shrink-0 text-left group"
                    >
                      {opt.image ? (
                        <img
                          src={opt.image}
                          alt={opt.label}
                          className="w-full aspect-[2/3] object-cover rounded-lg bg-neutral-800 border-2 border-transparent group-hover:border-[#3fa9ff] transition"
                        />
                      ) : (
                        <div className="w-full aspect-[2/3] rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-600 text-2xl border-2 border-transparent group-hover:border-[#3fa9ff] transition">
                          🎭
                        </div>
                      )}
                      <p className="text-xs text-neutral-300 mt-1.5 leading-tight line-clamp-2">{opt.label}</p>
                      {roleLine && <p className="text-[11px] text-neutral-500 leading-tight line-clamp-1">{roleLine}</p>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
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
