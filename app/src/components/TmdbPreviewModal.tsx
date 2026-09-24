import { useEffect, useState } from 'react'
import { api, type TmdbCard, type TmdbItem } from '../lib/api'
import { notifyDataChanged } from '../lib/dataEvents'
import { formatRuntime } from '../lib/rowMeta'
import { BRAND_TEXT } from '../lib/theme'
import { useToast } from '../hooks/useToast'
import { WatchProviderList } from './TmdbExtras'
import { WatchedForm } from './DiscoverModal'
import ShowcaseBanner from './ShowcaseBanner'
import { parseYouTubeUrl } from '../lib/youtube'

// Ne İzlesem'in TMDB modunda kazanan içerik arşivde olmadığı için normal detay penceresi
// açılamıyor — bunun yerine bu önizleme: görsel, özet, türler, Türkiye'de nerede izlenir ve
// "+ İzlenecek" / "İzledim" / "Bir daha gösterme" seçenekleri.
// Detay penceresindeki "Benzer İçerikler" kartları da bunu açıyor (kullanıcı "benzer içerikler
// kısmındakilere tıklayıp detay pencerelerini görebileyim" dedi) — orada "Başka bir şey seç"
// anlamsız olduğu için onPickAgain verilmiyor.
export default function TmdbPreviewModal({
  boardId,
  card,
  onClose,
  onPickAgain,
  onAdded,
}: {
  boardId: string
  card: TmdbCard
  onClose: () => void
  onPickAgain?: () => void
  onAdded?: () => void
}) {
  const { notify } = useToast()
  const [item, setItem] = useState<TmdbItem | null>(null)
  // Ayrıntılar alınamazsa (ör. sunucu eski sürümde kaldıysa ya da internet yoksa) sonsuza kadar
  // "Yükleniyor..." yazmasın — eldeki kart bilgisiyle devam edilip bir not gösteriliyor.
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [watchedForm, setWatchedForm] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .getTmdbItem(boardId, card.mediaType, card.tmdbId)
      .then((d) => !cancelled && setItem(d))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [boardId, card.mediaType, card.tmdbId])

  async function add(status: 'izlenecek' | 'izlendi', watchedDate?: string | null, rating?: number | null) {
    setBusy(true)
    try {
      const res = await api.addFromTmdb(boardId, { tmdbId: card.tmdbId, mediaType: card.mediaType, status, watchedDate: watchedDate ?? undefined, rating: rating ?? undefined })
      notifyDataChanged(boardId)
      setWatchedForm(false)
      onAdded?.()
      setDone(status === 'izlendi' ? 'İzlediklerine eklendi' : 'İzlenecekler listene eklendi')
      notify(status === 'izlendi' ? `"${res.title}" izlediklerine eklendi.` : `"${res.title}" izlenecekler listene eklendi.`)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Eklenemedi.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function dismiss() {
    try {
      await api.dismissTmdb({ tmdbId: card.tmdbId, mediaType: card.mediaType })
      notify(`"${card.title}" bir daha önerilmeyecek.`)
    } catch {
      // kaydedilemese de pencere kapansın
    }
    onClose()
  }

  const shown = item ?? card
  const trailerYt = item?.trailer ? parseYouTubeUrl(item.trailer) : null
  const metaBits = [
    card.mediaType === 'tv' ? 'Dizi' : 'Film',
    shown.year,
    item?.runtime ? formatRuntime(item.runtime) : '',
    item?.seasons ? `${item.seasons} Sezon` : '',
    ...(item?.genres.slice(0, 3) ?? []),
  ].filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 bg-black/80 overflow-y-auto py-6 px-4 sm:px-10" onClick={onClose}>
      <div className="bg-neutral-900 rounded-xl w-full max-w-4xl mx-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          {/* Arşivdeki detay penceresiyle aynı üst bölüm: yatay görsel, üstünde başlık logosu,
              fragman varsa oynar. Ayrıntılar gelene kadar kartın kendi yatay görseli gösteriliyor. */}
          <ShowcaseBanner
            imageUrl={shown.backdrop || shown.poster || ''}
            videoId={trailerYt?.id ?? null}
            startSeconds={trailerYt?.start ?? 0}
            title={shown.title}
            titleImageUrl={item?.logo ?? undefined}
            aspect="21/9"
            titleAlwaysVisible
            bottomFadeColor="#171717"
          />
          {!card.inArchive && !item?.inArchive && (
            <span className="absolute top-3 right-14 z-10 text-[11px] font-semibold text-white bg-black/60 rounded px-2 py-1">
              Arşivinde yok · TMDB'den öneri
            </span>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-black/70 hover:bg-black/90 text-white text-lg transition"
          >
            ×
          </button>
        </div>

        <div className="p-6 flex gap-5">
          {shown.poster && <img src={shown.poster} alt={shown.title} className="w-28 sm:w-40 md:w-48 aspect-[2/3] object-cover rounded-lg shrink-0 self-start bg-neutral-800" />}
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <h2 className="text-2xl font-semibold text-neutral-50">{shown.title}</h2>
              {shown.originalTitle && shown.originalTitle !== shown.title && <p className="text-sm text-neutral-500">{shown.originalTitle}</p>}
            </div>
            <p className="text-neutral-300 text-sm font-medium">
              {metaBits.join('  •  ')}
              {shown.rating ? `  •  ★ ${shown.rating}` : ''}
            </p>
            {shown.overview && <p className="text-neutral-300 text-base leading-relaxed">{shown.overview}</p>}

            {card.inArchive || item?.inArchive || done ? (
              <p className="text-sm text-emerald-500 pt-1">✓ {done ?? 'Zaten arşivinde'}</p>
            ) : watchedForm ? (
              <div className="max-w-xs">
                <WatchedForm busy={busy} onCancel={() => setWatchedForm(false)} onSave={(date, rating) => add('izlendi', date, rating)} />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => add('izlenecek')}
                  disabled={busy}
                  className="text-sm rounded-lg bg-[#00c0fa] text-white font-semibold px-4 py-2 disabled:opacity-50"
                >
                  {busy ? 'Ekleniyor...' : '+ İzlenecek'}
                </button>
                <button
                  onClick={() => setWatchedForm(true)}
                  disabled={busy}
                  className="text-sm rounded-lg border border-neutral-700 hover:border-emerald-500 text-neutral-300 hover:text-emerald-500 px-4 py-2 transition"
                >
                  ✓ İzledim
                </button>
                <button
                  onClick={dismiss}
                  disabled={busy}
                  className="text-sm rounded-lg border border-neutral-700 hover:border-rose-500 text-neutral-400 hover:text-rose-400 px-4 py-2 transition"
                >
                  Bir daha gösterme
                </button>
              </div>
            )}
            {onPickAgain && (
              <button onClick={onPickAgain} className="text-xs text-neutral-500 hover:text-neutral-50 transition">
                ↻ Başka bir şey seç
              </button>
            )}
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="pt-5 border-t border-neutral-800">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <p className="text-sm font-bold" style={{ color: BRAND_TEXT }}>
                Nerede İzlenir
              </p>
              {item?.providers?.link && (
                <a href={item.providers.link} target="_blank" rel="noreferrer" className="text-xs text-neutral-500 hover:text-neutral-50 transition">
                  Tüm seçenekler ↗
                </a>
              )}
            </div>
            {item ? (
              <WatchProviderList providers={item.providers} />
            ) : failed ? (
              <p className="text-sm text-neutral-500">Bu bilgi şu an alınamadı. ARGUS'u kapatıp yeniden açmayı dene.</p>
            ) : (
              <p className="text-sm text-neutral-500">Yükleniyor...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
