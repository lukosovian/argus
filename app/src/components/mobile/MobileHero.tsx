import AgeRatingChip from '../AgeRatingChip'
import { tt } from '../../lib/i18n'

// ARGUS Android › Ana Sayfa vitrini. Kullanıcı "Netflix uygulamasındaki gibi, logolar çok büyük duruyor" dedi:
// ekranı kaplayan video yerine ortada büyük, köşeleri yuvarlak bir kart — görsel, küçük başlık logosu, kısa
// bilgi ve iki düğme. Arkada kartın renklerinden yumuşak bir ışık.
export default function MobileHero({
  image,
  title,
  titleImage,
  meta,
  ageRating,
  onDetails,
  onNext,
}: {
  image: string
  title: string
  titleImage: string
  meta: string[]
  ageRating: string
  onDetails: () => void
  onNext?: () => void
}) {
  return (
    <div className="relative">
      {image && (
        <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-52 h-[135%] overflow-hidden">
          <img src={image} alt="" className="h-full w-full object-cover blur-3xl opacity-45 scale-110" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-neutral-950/30 to-neutral-950" />
        </div>
      )}
      <button
        onClick={onDetails}
        className="relative block w-full aspect-[4/5] rounded-2xl overflow-hidden bg-neutral-800 shadow-2xl shadow-black/60 ring-1 ring-white/10 text-left"
      >
        {image && <img src={image} alt={title} className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-5 pb-[4.75rem] flex flex-col items-center text-center">
          {titleImage ? (
            <img src={titleImage} alt={title} className="max-h-16 max-w-[68%] w-auto object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]" />
          ) : (
            <p className="text-2xl font-bold text-white leading-tight line-clamp-2" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
              {title}
            </p>
          )}
          {(meta.length > 0 || ageRating) && (
            <div className="mt-2.5 flex items-center justify-center gap-2 text-[13px] text-white/85">
              <span className="truncate">{meta.join(' • ')}</span>
              {ageRating && <AgeRatingChip raw={ageRating} className="h-5 min-w-5 text-[10px]" />}
            </div>
          )}
        </div>
      </button>
      {/* Düğmeler kartın içinde, en altta (kartın kendi tıklamasından ayrı) */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4 flex gap-2.5">
        <button onClick={onDetails} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white py-2.5 text-[15px] font-semibold text-black active:bg-neutral-200">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z" />
          </svg>
          {tt('Detaylar')}
        </button>
        {onNext && (
          <button onClick={onNext} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-neutral-500/40 backdrop-blur-sm py-2.5 text-[15px] font-semibold text-white active:bg-neutral-500/60">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
            </svg>
            {tt('Başka Öner')}
          </button>
        )}
      </div>
    </div>
  )
}
