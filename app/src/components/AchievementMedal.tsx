import { useId, useMemo } from 'react'
import { TIER_COLORS, type Achievement } from '../lib/achievements'
import Icon from './Icon'

// Başarım madalyası (v1.23.6 — kullanıcı "çizimleri de güzelleştir" dedi). Seviye arttıkça süslenir:
//   kilitli : soluk, kesik çizgili kenar, kilit
//   bronz   : tırtıllı metal kenar + rozetin renginde kabartmalı iç daire + kurdele
//   gümüş   : + defne dalları
//   altın   : + arkada yavaşça dönen ışınlar ve tepede yıldız
// Etrafındaki ince halka sıradaki seviyeye ilerlemeyi gösterir. Üstüne gelince ışık süzülür (kartta group sınıfı).
export default function AchievementMedal({ a, progress, size = 104 }: { a: Achievement; progress: number; size?: number }) {
  const id = useId().replace(/:/g, '')
  const metal = TIER_COLORS[a.level]
  const locked = a.level === 0
  const seal = useMemo(() => {
    const pts: string[] = []
    for (let i = 0; i < 40; i++) {
      const r = i % 2 ? 37.5 : 40.5
      const an = (i / 40) * Math.PI * 2 - Math.PI / 2
      pts.push(`${(60 + Math.cos(an) * r).toFixed(2)},${(56 + Math.sin(an) * r).toFixed(2)}`)
    }
    return pts.join(' ')
  }, [])
  const leaves = useMemo(() => {
    const out: { x: number; y: number; rot: number }[] = []
    for (let i = 0; i < 7; i++) {
      const an = ((200 - i * 14) * Math.PI) / 180 // soldan aşağıdan yukarı
      out.push({ x: 60 + Math.cos(an) * 47, y: 56 - Math.sin(an) * 47, rot: -((200 - i * 14) - 90) })
    }
    return out
  }, [])
  const rays = useMemo(() => Array.from({ length: 18 }, (_, i) => (i * 360) / 18), [])
  const C = 2 * Math.PI * 44
  const dots = useMemo(() => Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2), [])
  return (
    <div className="relative" style={{ width: size, height: size * (130 / 120) }}>
      <svg viewBox="0 0 120 130" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={metal[1]} />
            <stop offset=".45" stopColor={metal[0]} />
            <stop offset=".7" stopColor={metal[1]} />
            <stop offset="1" stopColor={metal[0]} />
          </linearGradient>
          <radialGradient id={`c${id}`} cx=".38" cy=".32" r=".8">
            <stop offset="0" stopColor={a.colors[1]} />
            <stop offset=".7" stopColor={a.colors[0]} />
            <stop offset="1" stopColor={a.colors[0]} stopOpacity=".9" />
          </radialGradient>
          <radialGradient id={`r${id}`}>
            <stop offset="0" stopColor={metal[1]} stopOpacity=".55" />
            <stop offset="1" stopColor={metal[1]} stopOpacity="0" />
          </radialGradient>
          <clipPath id={`k${id}`}>
            <circle cx="60" cy="56" r="29" />
          </clipPath>
        </defs>

        {/* altın: dönen ışınlar */}
        {a.level === 3 && (
          <g style={{ transformOrigin: '60px 56px', animation: 'argus-madalya-don 24s linear infinite' }}>
            {rays.map((r) => (
              <path key={r} d="M60 56 L57.5 4 L62.5 4 Z" fill={`url(#r${id})`} transform={`rotate(${r} 60 56)`} />
            ))}
          </g>
        )}

        {/* kurdele */}
        {!locked && (
          <g style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.35))' }}>
            <path d="M46 82 L34 124 L41 118 L47 126 L57 88 Z" fill={a.colors[0]} />
            <path d="M74 82 L86 124 L79 118 L73 126 L63 88 Z" fill={a.colors[0]} />
            <path d="M46 82 L34 124 L41 118 L44 121 L52 86 Z" fill={a.colors[1]} opacity=".35" />
          </g>
        )}

        {/* gümüş ve altın: defne dalları */}
        {a.level >= 2 && (
          <g fill={metal[1]} opacity=".95">
            {leaves.map((l, i) => (
              <g key={i}>
                <ellipse cx={l.x} cy={l.y} rx="6" ry="2.6" transform={`rotate(${l.rot} ${l.x} ${l.y})`} />
                <ellipse cx={120 - l.x} cy={l.y} rx="6" ry="2.6" transform={`rotate(${-l.rot} ${120 - l.x} ${l.y})`} />
              </g>
            ))}
          </g>
        )}

        {/* ilerleme halkası */}
        {a.level < 3 && (
          <>
            <circle cx="60" cy="56" r="44" fill="none" stroke="var(--color-neutral-800)" strokeWidth="2" />
            <circle cx="60" cy="56" r="44" fill="none" stroke={locked ? '#00c0fa' : metal[1]} strokeWidth="2" strokeLinecap="round" strokeDasharray={`${progress * C} ${C}`} transform="rotate(-90 60 56)" />
          </>
        )}

        <g style={{ filter: locked ? 'grayscale(1) brightness(.42)' : `drop-shadow(0 5px 10px ${a.colors[0]}99)` }}>
          <polygon points={seal} fill={`url(#m${id})`} />
          <circle cx="60" cy="56" r="33.5" fill="rgba(0,0,0,.28)" />
          <circle cx="60" cy="56" r="31.5" fill={`url(#m${id})`} />
          <circle cx="60" cy="56" r="29" fill={`url(#c${id})`} />
          {/* kabartma noktalar */}
          {dots.map((an, i) => (
            <circle key={i} cx={60 + Math.cos(an) * 25.5} cy={56 + Math.sin(an) * 25.5} r=".7" fill="rgba(255,255,255,.35)" />
          ))}
          <g clipPath={`url(#k${id})`}>
            <ellipse cx="52" cy="40" rx="24" ry="12" fill="rgba(255,255,255,.14)" />
            <rect x="-70" y="10" width="26" height="100" fill="rgba(255,255,255,.35)" transform="skewX(-20)" className="transition-transform duration-700 ease-out group-hover:translate-x-[170px]" />
          </g>
          {locked && <circle cx="60" cy="56" r="40.5" fill="none" stroke="#a1a1aa" strokeWidth="1" strokeDasharray="3 3" />}
        </g>

        {/* altın: tepede yıldız */}
        {a.level === 3 && <path d="M60 4.5l2.6 5.3 5.8.85-4.2 4.1 1 5.8L60 17.8l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z" fill="#fde68a" stroke="#a16207" strokeWidth=".8" style={{ filter: 'drop-shadow(0 0 4px rgba(253,230,138,.8))' }} />}
      </svg>
      <span
        className="absolute flex items-center justify-center text-white"
        style={{ left: 0, right: 0, top: `${(56 / 130) * 100}%`, transform: 'translateY(-50%)', opacity: locked ? 0.35 : 1, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))' }}
      >
        <Icon name={a.icon} style={{ width: size * 0.3, height: size * 0.3 }} />
      </span>
      {locked && (
        <span className="absolute flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 ring-1 ring-neutral-600" style={{ left: '50%', top: `${(80 / 130) * 100}%`, transform: 'translate(-50%,-50%)' }}>
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-neutral-300" fill="currentColor">
            <path d="M7 10V7.5a5 5 0 0 1 10 0V10h.5c.83 0 1.5.67 1.5 1.5v8c0 .83-.67 1.5-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-8C5 10.67 5.67 10 6.5 10zm2.2 0h5.6V7.5a2.8 2.8 0 0 0-5.6 0z" />
          </svg>
        </span>
      )}
    </div>
  )
}
