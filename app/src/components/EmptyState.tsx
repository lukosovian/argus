import { useId } from 'react'

// Boş sayfalar için (henüz arşiv yok, kayıt yok, bildirim yok…) düz "boş" yazısı yerine küçük bir çizim, başlık,
// açıklama ve varsa ne yapılacağını gösteren düğme. Yeni profil açan biri ilk gördüğünde ne yapacağını bilsin.
export type EmptyArt = 'arsiv' | 'kayit' | 'bildirim' | 'evren' | 'istatistik' | 'ara'

export default function EmptyState({
  art,
  title,
  text,
  children,
  compact = false,
}: {
  art: EmptyArt
  title: string
  text?: React.ReactNode
  children?: React.ReactNode // düğme(ler)
  compact?: boolean // pencere/panel içinde daha küçük
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'px-4 py-8' : 'px-4 py-16'}`} style={{ animation: 'argus-fade-in .5s ease-out' }}>
      <Art kind={art} size={compact ? 72 : 112} />
      <h2 className={`${compact ? 'text-sm mt-3' : 'text-xl mt-5'} font-semibold text-neutral-100`}>{title}</h2>
      {text && <p className={`${compact ? 'text-xs' : 'text-sm'} text-neutral-500 max-w-md mt-1.5 leading-relaxed`}>{text}</p>}
      {children && <div className={`flex flex-wrap justify-center gap-2 ${compact ? 'mt-4' : 'mt-6'}`}>{children}</div>}
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
