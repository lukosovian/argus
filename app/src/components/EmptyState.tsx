import { useId } from 'react'
import Icon, { type IconName } from './Icon'

// Boş sayfalar için (henüz arşiv yok, kayıt yok, bildirim yok…) düz "boş" yazısı yerine küçük bir çizim, başlık,
// açıklama ve varsa ne yapılacağını gösteren düğme. Yeni profil açan biri ilk gördüğünde ne yapacağını bilsin.
// 'afis': kesik çizgili afiş yuvaları + ortada (varsa) soluk bir afiş ve simge (Arayüz Önerileri 3 · H4)
export type EmptyArt = 'arsiv' | 'kayit' | 'bildirim' | 'evren' | 'istatistik' | 'ara' | 'afis'

export default function EmptyState({
  art,
  title,
  text,
  children,
  compact = false,
  poster,
  icon,
}: {
  art: EmptyArt
  title: string
  text?: React.ReactNode
  children?: React.ReactNode // düğme(ler)
  compact?: boolean // pencere/panel içinde daha küçük
  poster?: string // art='afis': ortadaki soluk afiş
  icon?: IconName // art='afis': ortadaki simge
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'px-4 py-8' : 'px-4 py-16'}`} style={{ animation: 'argus-fade-in .5s ease-out' }}>
      {art === 'afis' ? <GhostPosters poster={poster} icon={icon ?? 'plus'} compact={compact} /> : <Art kind={art} size={compact ? 72 : 112} />}
      <h2 className={`${compact ? 'text-sm mt-3' : 'text-xl mt-5'} font-semibold text-neutral-100`}>{title}</h2>
      {text && <p className={`${compact ? 'text-xs' : 'text-sm'} text-neutral-500 max-w-md mt-1.5 leading-relaxed`}>{text}</p>}
      {children && <div className={`flex flex-wrap justify-center gap-2 ${compact ? 'mt-4' : 'mt-6'}`}>{children}</div>}
    </div>
  )
}

// Üç eğik afiş yuvası: yanlar kesik çizgili boş, ortadaki soluk afiş (yoksa koyu kutu) ve üstünde marka renkli simge
function GhostPosters({ poster, icon, compact }: { poster?: string; icon: IconName; compact: boolean }) {
  const w = compact ? 56 : 84
  return (
    <div aria-hidden className="relative" style={{ width: w * 2.6, height: w * 1.75 }}>
      <span className="absolute rounded-[9px] border-[1.5px] border-dashed border-neutral-700 bg-neutral-900" style={{ width: w, aspectRatio: '2/3', left: w * 0.12, top: w * 0.12, transform: 'rotate(-10deg)' }} />
      <span className="absolute rounded-[9px] border-[1.5px] border-dashed border-neutral-700 bg-neutral-900" style={{ width: w, aspectRatio: '2/3', right: w * 0.12, top: w * 0.12, transform: 'rotate(10deg)' }} />
      <span className="absolute z-[2] overflow-hidden rounded-[9px] bg-neutral-800 shadow-2xl shadow-black/60" style={{ width: w, aspectRatio: '2/3', left: w * 0.8, top: 0 }}>
        {poster && <img src={poster} alt="" className="h-full w-full object-cover" style={{ filter: 'grayscale(.6) brightness(.55)' }} />}
      </span>
      <span
        className="absolute z-[3] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full text-white"
        style={{ width: compact ? 34 : 44, height: compact ? 34 : 44, background: 'linear-gradient(135deg,#00c0fa,#0a6cff)', boxShadow: '0 6px 20px rgba(0,192,250,.5)' }}
      >
        <Icon name={icon} className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </span>
    </div>
  )
}

// Marka mavisiyle çizilmiş küçük resimler (gri gövde + mavi vurgu; açık temada da okunur)
function Art({ kind, size }: { kind: EmptyArt; size: number }) {
  const id = useId().replace(/:/g, '')
  const g = `url(#eg${id})`
  const body = 'fill-neutral-800'
  const line = 'stroke-neutral-700'
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={`eg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#00c0fa" />
          <stop offset="1" stopColor="#0a6cff" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="56" className="fill-neutral-900" />
      {kind === 'arsiv' && (
        <>
          <rect x="30" y="34" width="34" height="50" rx="5" className={body} transform="rotate(-10 47 59)" />
          <rect x="52" y="30" width="34" height="50" rx="5" className={body} transform="rotate(8 69 55)" />
          <rect x="40" y="38" width="36" height="52" rx="5" className="fill-neutral-700" />
          <circle cx="80" cy="82" r="13" fill={g} />
          <path d="M80 76v12M74 82h12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      {kind === 'kayit' && (
        <>
          <rect x="28" y="36" width="64" height="44" rx="6" className={body} />
          <path d="M28 46h64" className={line} strokeWidth="2" />
          {[34, 46, 58, 70, 82].map((x) => (
            <rect key={x} x={x - 3} y="38.5" width="6" height="5" rx="1" className="fill-neutral-700" />
          ))}
          <path d="M54 56l12 7-12 7z" fill={g} />
          <rect x="40" y="86" width="40" height="5" rx="2.5" className="fill-neutral-800" />
        </>
      )}
      {kind === 'bildirim' && (
        <>
          <path d="M60 30c-11 0-19 8-19 19v13l-6 9h50l-6-9V49c0-11-8-19-19-19z" className={body} />
          <circle cx="60" cy="78" r="6" className="fill-neutral-700" />
          <path d="M74 32c4 2 7 5 9 9M46 32c-4 2-7 5-9 9" stroke={g} strokeWidth="3" strokeLinecap="round" fill="none" />
          <text x="60" y="58" textAnchor="middle" fontSize="16" fontWeight="700" fill={g}>
            z
          </text>
        </>
      )}
      {kind === 'evren' && (
        <>
          <ellipse cx="60" cy="60" rx="38" ry="14" fill="none" className={line} strokeWidth="2" transform="rotate(-20 60 60)" />
          <circle cx="60" cy="60" r="16" fill={g} />
          <circle cx="27" cy="70" r="5" className="fill-neutral-700" />
          <circle cx="92" cy="48" r="4" className="fill-neutral-700" />
          <circle cx="40" cy="34" r="2" className="fill-neutral-700" />
          <circle cx="86" cy="84" r="2.5" className="fill-neutral-700" />
        </>
      )}
      {kind === 'istatistik' && (
        <>
          <rect x="30" y="64" width="12" height="22" rx="3" className={body} />
          <rect x="47" y="50" width="12" height="36" rx="3" className={body} />
          <rect x="64" y="40" width="12" height="46" rx="3" fill={g} />
          <rect x="81" y="56" width="12" height="30" rx="3" className={body} />
          <path d="M28 90h66" className={line} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {kind === 'ara' && (
        <>
          <circle cx="54" cy="54" r="20" fill="none" className="stroke-neutral-700" strokeWidth="6" />
          <path d="M69 69l16 16" stroke={g} strokeWidth="8" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
