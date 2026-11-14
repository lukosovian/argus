import { useId } from 'react'

// Flashback'in logosu (v1.24, kullanıcının sunumdan seçtiği "Bozuk Sinyal"): eski bandın bozulan görüntüsü —
// FB harflerinin camgöbeği ve eflatun kopyaları yana kaymış, ortadan bir şerit yana kaçmış. `anim`:
// 'always' sürekli hafifçe titrer, 'hover' üstüne gelince (en yakın .fb-hover kapsayıcısı), false durur.
// Yazı karakteri Anton (public/fonts, internetsiz de çalışır). Renkler ve hareket index.css'te (.fb-*).

export const FB_CYAN = '#00e1ff'
export const FB_PINK = '#ff2d8a'

export function FbMark({ className = '', anim = 'hover', bg = true }: { className?: string; anim?: 'always' | 'hover' | false; bg?: boolean }) {
  const u = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 200 200" className={`${className} ${anim === 'always' ? 'fb-anim' : anim === 'hover' ? 'fb-anim-hover' : ''}`} aria-hidden>
      <defs>
        <clipPath id={`${u}t`}>
          <rect x="0" y="0" width="200" height="96" />
        </clipPath>
        <clipPath id={`${u}m`}>
          <rect x="0" y="96" width="200" height="16" />
        </clipPath>
        <clipPath id={`${u}b`}>
          <rect x="0" y="112" width="200" height="88" />
        </clipPath>
      </defs>
      {bg && <rect x="10" y="10" width="180" height="180" rx="36" fill="#050507" />}
      <g fontFamily="Anton, Impact, 'Arial Narrow', sans-serif" fontSize="112" textAnchor="middle">
        <g className="fb-c">
          <text x="96" y="146" fill={FB_CYAN} opacity=".9">
            FB
          </text>
        </g>
        <g className="fb-p">
          <text x="104" y="146" fill={FB_PINK} opacity=".9">
            FB
          </text>
        </g>
        <text x="100" y="146" fill="#fff" clipPath={`url(#${u}t)`}>
          FB
        </text>
        <g className="fb-slice">
          <text x="107" y="146" fill="#fff" clipPath={`url(#${u}m)`}>
            FB
          </text>
        </g>
        <text x="100" y="146" fill="#fff" clipPath={`url(#${u}b)`}>
          FB
        </text>
      </g>
      <rect className="fb-line1" x="22" y="60" width="38" height="3" fill="#fff" opacity=".5" />
      <rect className="fb-line2" x="140" y="150" width="30" height="3" fill={FB_CYAN} opacity=".7" />
    </svg>
  )
}

// "FLASHBACK" yazısı: Anton, renk kayması gölgeli
export function FbWordmark({ className = '', children = 'FLASHBACK' }: { className?: string; children?: React.ReactNode }) {
  return <span className={`fb-wordmark ${className}`}>{children}</span>
}
