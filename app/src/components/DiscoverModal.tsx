import { useEffect, useState } from 'react'
import { api, type TmdbCard } from '../lib/api'
import { notifyDataChanged } from '../lib/dataEvents'
import { todayIso } from '../types'
import { useToast } from '../hooks/useToast'
import { BRAND_GRADIENT, PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import { CompassIcon } from './toolbarIcons'

// Arşiv tablosunun araç çubuğundaki pusula — "Keşfet". Kullanıcının fikri: "sayısını
// belirliycez dizi mi film mi... türünü belirliycez... bizde olmayan tablomuzda olmayan
// içerikleri getirecek sevdiklerimizi izlenecek olarak ekliycez istemediklerimizi silicez eğer
// izlemişsek izleme tarihi ve puan falan giricez". "İstemiyorum" denenler bir daha gelmiyor
// (sunucuda tmdb-dismissed.json), altta sayısı ve sıfırlama bağlantısı var.

type MediaType = 'movie' | 'tv'
type Sort = 'popular' | 'top' | 'new'

const COUNTS = [5, 10, 20, 40]
const SORTS: { value: Sort; label: string }[] = [
  { value: 'popular', label: 'Popüler' },
  { value: 'top', label: 'En yüksek puanlı' },
  { value: 'new', label: 'Yeni çıkanlar' },
]

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`text-xs rounded-lg border px-3 py-1.5 transition ${
            value === o.value
              ? 'bg-neutral-700 border-neutral-500 text-neutral-50'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// "İzledim" formu (isteğe bağlı tarih + isteğe bağlı puan) — Ne İzlesem'in TMDB önizlemesi de
// kullanıyor. Tarih zorunlu değil: kullanıcı "izleme tarihi hatırlamıyosam girmeyebileyim" dedi —
// "Hatırlamıyorum" ile kaldırılınca kayıt tarihsiz eklenir.
export function WatchedForm({ onSave, onCancel, busy }: { onSave: (date: string | null, rating: number | null) => void; onCancel: () => void; busy: boolean }) {
  const [date, setDate] = useState<string | null>(todayIso())
  const [rating, setRating] = useState<number | null>(null)
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-neutral-800/70 border border-neutral-700 p-2.5">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">İzleme tarihi</span>
          {date === null ? (
            <button onClick={() => setDate(todayIso())} className="text-[11px] text-[#00c0fa] hover:underline">
              Tarih ekle
            </button>
          ) : (
            <button onClick={() => setDate(null)} className="text-[11px] text-neutral-500 hover:text-neutral-300">
              Hatırlamıyorum
            </button>
          )}
        </div>
        {date !== null && (
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value || null)}
            className="mt-0.5 w-full rounded-md bg-neutral-900 border border-neutral-700 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-neutral-500"
          />
        )}
      </div>
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">Puan</span>
          {rating === null ? (
            <button onClick={() => setRating(7)} className="text-[11px] text-[#00c0fa] hover:underline">
              Puan ver
            </button>
          ) : (
            <button onClick={() => setRating(null)} className="text-[11px] text-neutral-500 hover:text-neutral-300">
              Puansız
            </button>
          )}
        </div>
        {rating !== null && (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className="flex-1 accent-[#00c0fa]"
            />
            <span className="text-xs text-neutral-200 w-7 text-right">{rating}</span>
          </div>
        )}
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => onSave(date, rating)}
          disabled={busy}
          className="flex-1 text-[11px] rounded-md bg-[#00c0fa] text-white font-semibold py-1 disabled:opacity-50"
        >
          {busy ? 'Ekleniyor...' : 'Kaydet'}
        </button>
        <button onClick={onCancel} disabled={busy} className="text-[11px] rounded-md border border-neutral-700 text-neutral-400 px-2 py-1">
          Vazgeç
        </button>
      </div>
    </div>
  )
}

export default function DiscoverModal({ boardId, exclude, onClose }: { boardId: string; exclude: string[]; onClose: () => void }) {
  const { notify } = useToast()
  const [type, setType] = useState<MediaType>('movie')
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([])
  const [selectedGenres, setSelectedGenres] = useState<Set<number>>(new Set())
  const [count, setCount] = useState(10)
  const [sort, setSort] = useState<Sort>('popular')
  const [needsApiKey, setNeedsApiKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<TmdbCard[] | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [watchedFormFor, setWatchedFormFor] = useState<number | null>(null)
  const [dismissedCount, setDismissedCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setSelectedGenres(new Set())
    api
      .getTmdbGenres(type)
      .then((d) => {
        if (cancelled) return
        setGenres(d.genres)
        setNeedsApiKey(Boolean(d.needsApiKey))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [type])

  useEffect(() => {
    api
      .getDismissedCount()
      .then((d) => setDismissedCount(d.count))
      .catch(() => {})
  }, [])

  function toggleGenre(id: number) {
    setSelectedGenres((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function fetchItems() {
    setLoading(true)
    setWatchedFormFor(null)
    try {
      const res = await api.discoverTmdb(boardId, { type, genreIds: [...selectedGenres], count, sort })
      setItems(res.items)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Sonuçlar alınamadı.', 'danger')
    } finally {
      setLoading(false)
    }
  }

  function removeItem(card: TmdbCard) {
    setItems((prev) => (prev ? prev.filter((c) => !(c.tmdbId === card.tmdbId && c.mediaType === card.mediaType)) : prev))
  }

  async function add(card: TmdbCard, status: 'izlenecek' | 'izlendi', watchedDate?: string | null, rating?: number | null) {
    setBusyId(card.tmdbId)
    try {
      const res = await api.addFromTmdb(boardId, {
        tmdbId: card.tmdbId,
        mediaType: card.mediaType,
        status,
        watchedDate: watchedDate ?? undefined,
        rating: rating ?? undefined,
        exclude,
      })
      removeItem(card)
      setWatchedFormFor(null)
      notifyDataChanged(boardId)
      notify(status === 'izlendi' ? `"${res.title}" izlediklerine eklendi.` : `"${res.title}" izlenecekler listene eklendi.`)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Eklenemedi.', 'danger')
    } finally {
      setBusyId(null)
    }
  }

  async function dismiss(card: TmdbCard) {
    removeItem(card)
    try {
      const res = await api.dismissTmdb({ tmdbId: card.tmdbId, mediaType: card.mediaType })
      setDismissedCount(res.count)
    } catch {
      // Gizleme kaydedilemese bile kart listeden kalkmış olsun — bir sonraki aramada tekrar gelir.
    }
  }

  async function resetDismissed() {
    await api.resetDismissed()
    setDismissedCount(0)
    notify('Gizlediğin içerikler Keşfet\'te yeniden görünecek.')
  }

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-sm flex items-start justify-center px-4 py-8" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[calc(100vh-4rem)] flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 border-b border-neutral-800 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-white" style={{ background: BRAND_GRADIENT }}>
              <CompassIcon className="h-5 w-5" />
            </span>
              <div>
                <h2 className="text-xl font-semibold text-neutral-50">Keşfet</h2>
                <p className="text-sm text-neutral-500 mt-0.5">Arşivinde olmayan içerikler. Beğendiğini ekle, istemediğini gizle.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Kapat"
              className="h-8 w-8 shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-500 flex items-center justify-center text-neutral-400 hover:text-neutral-50 text-lg leading-none transition"
            >
              ×
            </button>
          </div>

          {needsApiKey ? (
            <p className="text-sm text-amber-500">Keşfet için önce Ayarlar → Veritabanı → API'den TMDB anahtarını girmelisin.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">Ne</span>
                  <Segmented<MediaType>
                    value={type}
                    onChange={setType}
                    options={[
                      { value: 'movie', label: 'Film' },
                      { value: 'tv', label: 'Dizi' },
                    ]}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">Kaç tane</span>
                  <Segmented<number> value={count} onChange={setCount} options={COUNTS.map((c) => ({ value: c, label: String(c) }))} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">Sıralama</span>
                  <Segmented<Sort> value={sort} onChange={setSort} options={SORTS} />
                </div>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1.5">Tür (hiçbiri seçilmezse hepsi; birden fazla seçersen hepsini birden taşıyanlar gelir)</p>
                <div className="flex flex-wrap gap-1.5">
                  {genres.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => toggleGenre(g.id)}
                      className={`text-xs rounded-full px-2.5 py-1 border transition ${
                        selectedGenres.has(g.id)
                          ? 'border-[#00c0fa] text-[#00c0fa] bg-[#00c0fa]/10'
                          : 'border-neutral-700 text-neutral-400 hover:text-neutral-50 hover:border-neutral-500'
                      }`}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={fetchItems} disabled={loading} style={primaryButtonStyle} className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}>
                  {loading ? 'Getiriliyor...' : items ? 'Yeniden Getir' : 'Getir'}
                </button>
                {dismissedCount > 0 && (
                  <span className="text-xs text-neutral-500">
                    Gizlediğin {dismissedCount} içerik gösterilmiyor ·{' '}
                    <button onClick={resetDismissed} className="text-neutral-400 hover:text-neutral-50 underline">
                      sıfırla
                    </button>
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="overflow-y-auto p-6">
          {items === null ? (
            <p className="text-sm text-neutral-500">Seçimlerini yapıp "Getir"e bas.</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-500">Bu seçimlere uyan, arşivinde olmayan başka içerik kalmadı. Farklı tür ya da sıralama dene.</p>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))' }}>
              {items.map((c) => {
                const busy = busyId === c.tmdbId
                return (
                  <div key={`${c.mediaType}-${c.tmdbId}`} className="flex flex-col">
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
                      <button
                        onClick={() => dismiss(c)}
                        disabled={busy}
                        title="İstemiyorum — bir daha gösterme"
                        className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/70 hover:bg-rose-600 text-white text-sm flex items-center justify-center transition"
                      >
                        ×
                      </button>
                    </div>
                    <p className="text-sm text-neutral-200 font-medium mt-2 leading-tight line-clamp-2 min-h-[2.5em]">{c.title}</p>
                    <p className="text-xs text-neutral-500">
                      {c.year}
                      {c.originalTitle && c.originalTitle !== c.title ? ` · ${c.originalTitle}` : ''}
                    </p>
                    <p className="text-xs text-neutral-400 mt-1 mb-2 line-clamp-3" title={c.overview}>
                      {c.overview}
                    </p>
                    {watchedFormFor === c.tmdbId ? (
                      <WatchedForm busy={busy} onCancel={() => setWatchedFormFor(null)} onSave={(date, rating) => add(c, 'izlendi', date, rating)} />
                    ) : (
                      <div className="flex gap-1.5 mt-auto">
                        <button
                          onClick={() => add(c, 'izlenecek')}
                          disabled={busyId !== null}
                          className="flex-1 text-[11px] rounded-md border border-neutral-700 hover:border-[#00c0fa] text-neutral-300 hover:text-[#00c0fa] py-1.5 transition disabled:opacity-50"
                        >
                          {busy ? 'Ekleniyor...' : '+ İzlenecek'}
                        </button>
                        <button
                          onClick={() => setWatchedFormFor(c.tmdbId)}
                          disabled={busyId !== null}
                          className="flex-1 text-[11px] rounded-md border border-neutral-700 hover:border-emerald-500 text-neutral-300 hover:text-emerald-500 py-1.5 transition disabled:opacity-50"
                        >
                          ✓ İzledim
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
