import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type ArchiveCard, type PersonInfo, type TmdbCard } from '../lib/api'
import { notifyDataChanged } from '../lib/dataEvents'
import { useToast } from '../hooks/useToast'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import TmdbPreviewModal from './TmdbPreviewModal'
import { useEscape } from '../hooks/useEscape'

// Oyuncu / yönetmen sayfası — kullanıcı "oyuncuya tıklayınca arşivimde olmayan filmlerini de göreyim,
// tek tıkla ekleyeyim" dedi. TMDB'den kişinin bilgileri ve filmografisi: arşivinde olanlar (izlediklerin
// işaretli) ve olmayanlar (en bilinenler önce, "+ İzlenecek" ya da tıklayınca önizleme).
const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
function trDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return d && m ? `${d} ${TR_MONTHS[m - 1]} ${y}` : iso
}

export default function PersonModal({
  boardId,
  name,
  role,
  character,
  onClose,
  onShowContents,
  onOpenRow,
  paused = false,
}: {
  boardId: string
  name: string
  role: 'acting' | 'directing'
  // Açıldığı kayıttaki rolü (ör. "Tyrion Lannister · 73 bölüm")
  character?: string
  onClose: () => void
  // Arşivde bu kişiye göre filtrele (tablo / ana sayfa)
  onShowContents?: () => void
  // Arşivindeki bir kartın detay penceresini aç (kullanıcı "arşivimdekilere tıklayıp detayını
  // açamıyorum" dedi) — pencere bunun üstünde açılır, kapatınca bu sayfaya dönülür.
  onOpenRow?: (rowId: string) => void
  // Üstte başka bir pencere açıkken Esc bu sayfayı kapatmasın
  paused?: boolean
}) {
  const { notify } = useToast()
  const [data, setData] = useState<{ person: PersonInfo | null; inArchive: ArchiveCard[]; notInArchive: ArchiveCard[]; needsApiKey?: boolean } | null>(null)
  const [bioOpen, setBioOpen] = useState(false)
  const [preview, setPreview] = useState<TmdbCard | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .getPerson(boardId, name, role)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ person: null, inArchive: [], notInArchive: [] }))
    return () => {
      alive = false
    }
  }, [boardId, name, role])

  // Üstünde önizleme ya da başka bir pencere açıkken Esc onları kapatır, bu sayfayı değil
  useEscape(true, () => {
    if (preview) setPreview(null)
    else if (!paused) onClose()
  })

  async function addWatchlist(c: ArchiveCard) {
    const k = `${c.mediaType}:${c.tmdbId}`
    setBusy(k)
    try {
      const res = await api.addFromTmdb(boardId, { tmdbId: c.tmdbId, mediaType: c.mediaType, status: 'izlenecek' })
      notifyDataChanged(boardId)
      setAdded((s) => new Set(s).add(k))
      // Üstteki "Arşivinde N" sayısı ve liste de güncellensin (eskiden eklenen yapım "olmayanlar"da kalıyordu)
      setData((d) =>
        d
          ? {
              ...d,
              inArchive: [...d.inArchive, { ...c, rowId: res.rowId, status: 'İzlenecek', watched: false }],
              notInArchive: d.notInArchive.filter((x) => !(x.tmdbId === c.tmdbId && x.mediaType === c.mediaType)),
            }
          : d,
      )
      notify(`"${res.title}" izlenecekler listene eklendi.`)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Eklenemedi.', 'danger')
    } finally {
      setBusy(null)
    }
  }

  const p = data?.person
  const watchedCount = data?.inArchive.filter((c) => c.watched).length ?? 0

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/80 overflow-y-auto py-6 px-4 sm:px-8" onClick={onClose}>
      <div className="relative w-full max-w-4xl mx-auto bg-neutral-900 rounded-2xl border border-neutral-800 p-5 sm:p-6 space-y-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Kapat" className="absolute top-4 right-4 h-9 w-9 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-lg">
          ×
        </button>
        {!data ? (
          <p className="text-sm text-neutral-500 py-10 text-center">{name} yükleniyor...</p>
        ) : data.needsApiKey ? (
          <p className="text-sm text-amber-400">Bunun için Ayarlar › Veritabanı › API'den TMDB anahtarını girmelisin.</p>
        ) : !p ? (
          <p className="text-sm text-neutral-500 py-10 text-center">"{name}" TMDB'de bulunamadı.</p>
        ) : (
          <>
            <div className="flex items-start gap-5">
              {p.image && <img src={p.image} alt={p.name} className="w-28 sm:w-36 aspect-[2/3] rounded-xl object-cover object-top shrink-0 self-start bg-neutral-800" />}
              <div className="min-w-0 flex-1 pr-8">
                <h2 className="text-2xl font-bold text-neutral-50">{p.name}</h2>
                <p className="text-sm text-neutral-400 mt-1">
                  {[role === 'directing' ? 'Yönetmen' : 'Oyuncu', p.birthday && `${trDate(p.birthday)}${p.deathday ? ` – ${trDate(p.deathday)}` : ''}`, p.place]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {character && <p className="text-sm text-neutral-300 mt-1">Bu yapımdaki rolü: {character}</p>}
                <p className="text-xs text-neutral-500 mt-1">
                  Arşivinde {data.inArchive.length} yapımı var{watchedCount ? `, ${watchedCount} tanesini izledin` : ''}.
                </p>
                {p.bio && (
                  <p className={`text-sm text-neutral-300 leading-relaxed mt-3 ${bioOpen ? '' : 'line-clamp-4'}`}>
                    {p.bio}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 mt-2">
                  {p.bio && p.bio.length > 300 && (
                    <button onClick={() => setBioOpen((v) => !v)} className="text-xs text-[#00c0fa] hover:underline">
                      {bioOpen ? 'Daha az' : 'Devamını oku'}
                    </button>
                  )}
                  {onShowContents && (
                    <button onClick={onShowContents} style={primaryButtonStyle} className={`text-xs px-3 py-1.5 rounded-lg ${PRIMARY_BUTTON}`}>
                      Arşivindekileri listele
                    </button>
                  )}
                </div>
              </div>
            </div>

            {data.inArchive.length > 0 && (
              <section>
                <h3 className="text-base font-semibold text-neutral-100 mb-3">
                  Arşivinde <span className="text-xs font-normal text-neutral-500">{data.inArchive.length}</span>
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
                  {data.inArchive.map((c) => (
                    <div key={`${c.mediaType}:${c.tmdbId}`} className="min-w-0">
                      <button
                        onClick={() => c.rowId && onOpenRow?.(c.rowId)}
                        disabled={!c.rowId || !onOpenRow}
                        className="block w-full relative aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 group enabled:cursor-pointer disabled:cursor-default"
                      >
                        {c.poster && <img src={c.poster} alt={c.title} loading="lazy" className="h-full w-full object-cover group-enabled:group-hover:scale-105 transition" />}
                        {c.watched ? (
                          <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold bg-emerald-500 text-white rounded px-1.5 py-0.5">✓ İzledin</span>
                        ) : c.status ? (
                          <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold bg-black/70 text-neutral-100 rounded px-1.5 py-0.5">{c.status}</span>
                        ) : null}
                      </button>
                      <p className="text-xs text-neutral-200 mt-1.5 line-clamp-2 leading-tight">{c.title}</p>
                      <p className="text-[11px] text-neutral-500 truncate">
                        {[c.year, c.character].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.notInArchive.length > 0 && (
              <section>
                <h3 className="text-base font-semibold text-neutral-100 mb-3">
                  Arşivinde olmayanlar <span className="text-xs font-normal text-neutral-500">en bilinenler önce</span>
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
                  {data.notInArchive.map((c) => {
                    const k = `${c.mediaType}:${c.tmdbId}`
                    return (
                      <div key={k} className="min-w-0">
                        <button onClick={() => setPreview(c)} className="block w-full relative aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 group">
                          {c.poster && <img src={c.poster} alt={c.title} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition" />}
                          {c.rating ? <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold bg-black/70 text-amber-300 rounded px-1.5 py-0.5">★ {c.rating}</span> : null}
                        </button>
                        <p className="text-xs text-neutral-200 mt-1.5 line-clamp-2 leading-tight">{c.title}</p>
                        <p className="text-[11px] text-neutral-500 truncate">{[c.year, c.mediaType === 'tv' ? 'Dizi' : 'Film'].filter(Boolean).join(' · ')}</p>
                        {added.has(k) ? (
                          <p className="text-[11px] text-emerald-400 mt-1">✓ Eklendi</p>
                        ) : (
                          <button
                            onClick={() => addWatchlist(c)}
                            disabled={busy === k}
                            className="mt-1 w-full text-[11px] rounded-md border border-neutral-700 text-neutral-300 hover:border-[#00c0fa] hover:text-[#7fdcff] py-1 transition disabled:opacity-50"
                          >
                            {busy === k ? 'Ekleniyor...' : '+ İzlenecek'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {preview && (
        <div onClick={(e) => e.stopPropagation()}>
          <TmdbPreviewModal boardId={boardId} card={preview} onClose={() => setPreview(null)} onAdded={() => setAdded((s) => new Set(s).add(`${preview.mediaType}:${preview.tmdbId}`))} />
        </div>
      )}
    </div>,
    document.body,
  )
}
