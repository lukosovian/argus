import type { CSSProperties, ReactNode } from 'react'

// Sayfa başlıklarında o sayfanın kendi afişleri (Arayüz Önerileri 3 · H3, v1.27.2): başlık kutusunun arkasına
// sayfadaki yapımların afişleri eğik bir duvar olarak dizilir, solda koyulaşır; yazı okunur kalır. Afiş yoksa
// sadece renkli zemin kalır (eski görünüm). Afişler tekrarlanarak duvar doldurulur.
export default function PosterWallHero({
  posters,
  tint = 'rgba(0,192,250,0.12)',
  className = '',
  style,
  children,
}: {
  posters: string[]
  tint?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const list = posters.filter(Boolean).slice(0, 14)
  const wall = list.length ? Array.from({ length: 36 }, (_, i) => list[i % list.length]) : []
  return (
    <section
      className={`relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-8 sm:px-10 ${className}`}
      style={{ background: `radial-gradient(ellipse at 12% 0%, ${tint}, transparent 60%), var(--color-neutral-950)`, ...style }}
    >
      {wall.length > 0 && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute grid gap-2 opacity-70"
            style={{ inset: '-90px -40px', gridTemplateColumns: 'repeat(12, minmax(0,1fr))', transform: 'rotate(-8deg) translateX(22%)' }}
          >
            {wall.map((src, i) => (
              <img key={i} src={src} alt="" loading="lazy" draggable={false} className="w-full aspect-[2/3] object-cover rounded-lg" />
            ))}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: `linear-gradient(90deg, var(--color-neutral-950) 32%, color-mix(in srgb, var(--color-neutral-950) 78%, transparent) 55%, color-mix(in srgb, var(--color-neutral-950) 20%, transparent)), linear-gradient(0deg, color-mix(in srgb, var(--color-neutral-950) 60%, transparent), transparent 50%), radial-gradient(ellipse at 12% 0%, ${tint}, transparent 60%)` }}
          />
        </>
      )}
      <div className="relative">{children}</div>
    </section>
  )
}
