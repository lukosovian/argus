import { useEffect, useState } from 'react'
import type { Board, Row } from '../types'
import { api, type TmdbCard, type TmdbExtras as Extras, type WatchProvider } from '../lib/api'
import { notifyDataChanged } from '../lib/dataEvents'
import { BRAND_TEXT } from '../lib/theme'
import { useToast } from '../hooks/useToast'

// Detay penceresinin altındaki iki bölüm: "Nerede İzlenir" (Türkiye'de hangi platformda var)
// ve "Benzer İçerikler" (TMDB önerileri, tek tıkla "İzlenecek" olarak arşive eklenebilir).
// Platform bilgisi hiç kaydedilmiyor, her açılışta TMDB'den (JustWatch verisi) canlı çekiliyor —
// kullanıcı "platformlar sürekli değişiyo" dedi, saklanan bilgi hızla eskirdi.
export default function TmdbExtras({ board, row }: { board: Board; row: Row }) {
  const { notify } = useToast()
  const [data, setData] = useState<Extras | null>(null)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)
  const [added, setAdded] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    setData(null)
    setFailed(false)
    api
      .getTmdbExtras(board.id, row.id)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [board.id, row.id])

  async function addToWatchlist(card: TmdbCard) {
    setAdding(card.tmdbId)
    try {
      const res = await api.addFromTmdb(board.id, { tmdbId: card.tmdbId, mediaType: card.mediaType, status: 'izlenecek' })
      setAdded((prev) => new Set(prev).add(card.tmdbId))
      notifyDataChanged(board.id)
      notify(`"${res.title}" izlenecekler listene eklendi.`)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Eklenemedi.', 'danger')
    } finally {
      setAdding(null)
    }
  }

  // API anahtarı yoksa ya da içerik TMDB'de bulunamadıysa bu bölümler hiç gösterilmiyor —
  // detay penceresi eskisi gibi kalıyor.
  if (failed || data?.needsApiKey || data?.notFound) return null

  const loading = data === null
  const p = data?.providers
  const groups: { label: string; items: WatchProvider[] }[] = p
    ? [
        { label: 'Abonelikle', items: p.flatrate },
        { label: 'Ücretsiz', items: p.free },
        { label: 'Kirala', items: p.rent },
        { label: 'Satın al', items: p.buy },
      ].filter((g) => g.items.length > 0)
    : []
  const similar = data?.similar ?? []

  return (
    <>
      <div className="pt-6 border-t border-neutral-800">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <p className="text-sm font-bold" style={{ color: BRAND_TEXT }}>
            Nerede İzlenir
          </p>
          {p?.link && (
            <a href={p.link} target="_blank" rel="noreferrer" className="text-xs text-neutral-500 hover:text-neutral-50 transition">
              Tüm seçenekler ↗
            </a>
          )}
        </div>
        {loading ? (
          <p className="text-sm text-neutral-500">Yükleniyor...</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-neutral-500">Şu an Türkiye'de hiçbir platformda görünmüyor.</p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.label} className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-neutral-500 w-20 shrink-0">{g.label}</span>
                {g.items.map((it) => (
                  <span
                    key={it.name}
                    className="inline-flex items-center gap-2 rounded-lg bg-neutral-800 border border-neutral-700 pl-1 pr-2.5 py-1"
                  >
                    {it.logo && <img src={it.logo} alt="" className="h-6 w-6 rounded" />}
                    <span className="text-xs text-neutral-200">{it.name}</span>
                  </span>
                ))}
              </div>
            ))}
            <p className="text-[11px] text-neutral-600">Bilgi TMDB/JustWatch'tan anlık alınıyor, platformlar zamanla değişebilir.</p>
          </div>
        )}
      </div>

      {(loading || similar.length > 0) && (
        <div className="pt-6 border-t border-neutral-800">
          <p className="text-sm font-bold mb-3" style={{ color: BRAND_TEXT }}>
            Benzer İçerikler
          </p>
          {loading ? (
            <p className="text-sm text-neutral-500">Yükleniyor...</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {similar.map((c) => {
                const inArchive = c.inArchive || added.has(c.tmdbId)
                return (
                  <div key={`${c.mediaType}-${c.tmdbId}`} className="w-28 sm:w-32 shrink-0" title={c.overview}>
                    <div className="relative">
                      {c.poster ? (
                        <img src={c.poster} alt={c.title} loading="lazy" className="w-full aspect-[2/3] object-cover rounded-lg bg-neutral-800" />
                      ) : (
                        <div className="w-full aspect-[2/3] rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-600 text-xs text-center p-2">
                          {c.title}
                        </div>
                      )}
                      {c.rating !== null && c.rating > 0 && (
                        <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold text-white bg-black/70 rounded px-1.5 py-0.5">
                          ★ {c.rating}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-300 mt-1.5 leading-tight line-clamp-2">{c.title}</p>
                    <p className="text-[11px] text-neutral-500">
                      {c.year}
                      {c.year && ' · '}
                      {c.mediaType === 'tv' ? 'Dizi' : 'Film'}
                    </p>
                    {inArchive ? (
                      <p className="mt-1.5 text-[11px] text-emerald-500">✓ Arşivinde</p>
                    ) : (
                      <button
                        onClick={() => addToWatchlist(c)}
                        disabled={adding !== null}
                        className="mt-1.5 w-full text-[11px] rounded-md border border-neutral-700 hover:border-[#00c0fa] text-neutral-300 hover:text-[#00c0fa] py-1 transition disabled:opacity-50"
                      >
                        {adding === c.tmdbId ? 'Ekleniyor...' : '+ İzlenecek'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
