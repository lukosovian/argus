import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { TmdbChoice } from '../lib/api'

// Güncelle'ye basınca TMDB'de birden fazla yapım çıkarsa hangisi olduğunu kullanıcıya seçtiren pencere —
// kullanıcı "birden fazla sonuç bulursa kendi birini mi seçiyor, ekrana getirsin ben seçeyim" dedi.
// Adı yazdığınla birebir tutanlar üstte ve "adı tutuyor" etiketli. Seçince o yapımdan doldurulur.
export default function TmdbChoiceModal({
  query,
  choices,
  onPick,
  onCancel,
}: {
  query: string
  choices: TmdbChoice[]
  onPick: (c: TmdbChoice) => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-neutral-950/85 backdrop-blur-sm flex items-start justify-center px-4 py-10 overflow-y-auto" onClick={onCancel}>
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-50">Hangisi?</h2>
            <p className="text-sm text-neutral-500 mt-1">
              TMDB'de "<span className="text-neutral-300">{query}</span>" için birden fazla yapım çıktı. Doğru olanı seç, bilgiler ondan doldurulsun.
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Kapat"
            className="h-8 w-8 shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-500 flex items-center justify-center text-neutral-400 hover:text-neutral-50 text-lg leading-none transition"
          >
            ×
          </button>
        </div>
        <ul className="mt-5 space-y-2">
          {choices.map((c) => {
            const others = [c.originalTitle, c.englishTitle].filter((t, i, a) => t && t !== c.title && a.indexOf(t) === i)
            return (
              <li key={`${c.mediaType}:${c.tmdbId}`}>
                <button
                  onClick={() => onPick(c)}
                  className="w-full flex gap-4 text-left rounded-xl border border-neutral-800 hover:border-[#00c0fa]/60 hover:bg-neutral-800/60 p-2.5 transition"
                >
                  {c.poster ? (
                    <img src={c.poster} alt="" loading="lazy" className="h-24 w-16 shrink-0 rounded-md object-cover bg-neutral-800" />
                  ) : (
                    <div className="h-24 w-16 shrink-0 rounded-md bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-600">görsel yok</div>
                  )}
                  <div className="min-w-0 flex-1 py-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-neutral-50">{c.title || c.originalTitle}</span>
                      {c.year && <span className="text-xs text-neutral-400">{c.year}</span>}
                      <span className="text-[11px] rounded border border-neutral-700 text-neutral-400 px-1.5 py-px">{c.mediaType === 'tv' ? 'Dizi' : 'Film'}</span>
                      {c.exact && <span className="text-[11px] rounded border border-[#00c0fa]/50 text-[#7fdcff] bg-[#00c0fa]/10 px-1.5 py-px">adı tutuyor</span>}
                    </div>
                    {others.length > 0 && <p className="text-xs text-neutral-500 mt-0.5 truncate">{others.join(' · ')}</p>}
                    {c.overview && <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed line-clamp-2">{c.overview}</p>}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex justify-end mt-4">
          <button onClick={onCancel} className="text-sm text-neutral-400 hover:text-neutral-50 px-3 py-1.5 transition">
            Vazgeç
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
