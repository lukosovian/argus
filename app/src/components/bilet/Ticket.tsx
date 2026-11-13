import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { averageColor, darkTone } from '../../lib/imageColor'
import { barcode, longDay, serialOf, shortDay, weekday, type Bilet } from '../../lib/bilet'
import { tt } from '../../lib/i18n'

// Koleksiyonluk sinema bileti (v1.23.11). Ön yüz: yapımın görseli, logosu/adı, tarih-seans ve sinema; sağda yırtılabilir
// koçan (salon, koltuk, barkod). Arka yüz: kağıt dokusu, bütün bilgiler, notun ve barkod. Gerçek biletin fotoğrafı
// yüklendiyse o yüzde fotoğraf görünür. Ölçüler "em" cinsinden: kapsayıcının yazı boyutu (genişlik / 48) her şeyi ölçekler.
// v1.23.12: üç tasarım (Sinema, Klasik, Altın), kullanıcının seçtiği görsel + konumu/yakınlığı, hologram mühür.

export type BiletItem = Bilet & { id: string }
export const TICKET_RATIO = 2.4
export const STUB = 0.27 // koçanın genişliği (oran)

export type TicketStyle = 'sinema' | 'klasik' | 'altin' | 'neon'
export const TICKET_STYLES: { id: TicketStyle; label: () => string }[] = [
  { id: 'sinema', label: () => tt('Sinema') },
  { id: 'klasik', label: () => tt('Klasik') },
  { id: 'altin', label: () => tt('Altın') },
  // v1.24: Ödüller'deki kart paketlerinden çıkar (bilet:neon); çıkmadıysa seçicide görünmez
  { id: 'neon', label: () => tt('Neon') },
]
export function styleOf(b: Bilet): TicketStyle {
  return b.style === 'klasik' || b.style === 'altin' || b.style === 'neon' ? b.style : 'sinema'
}

const PAPER = '#f2ece1'
const INK = '#1a1612'
const CREAM = '#efe3c6'
const MAROON = '#6e1d1d'
const NIGHT = '#0c0b09'
const GOLD = '#d9b56a'
const GOLD_FOIL = 'linear-gradient(100deg, #8a6a2f 0%, #f4dc93 22%, #b8913f 40%, #fff3c4 55%, #a8843a 72%, #f0d58a 88%, #8a6a2f 100%)'
const SERIF = 'Georgia, "Times New Roman", serif'
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3CfeColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.3 0 0 0 0 0.25 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")"

// Koçan çizgisinin üstünde ve altında yarım daire delikler
function notchMask(at: number): CSSProperties {
  const g = (y: string) => `radial-gradient(circle at ${at * 100}% ${y}, transparent 0.85em, #000 calc(0.85em + 0.5px))`
  const m = `${g('0')}, ${g('100%')}`
  return { WebkitMaskImage: m, maskImage: m, WebkitMaskComposite: 'source-in', maskComposite: 'intersect' }
}

export function useTicketTint(src?: string) {
  const [rgb, setRgb] = useState<[number, number, number] | null>(null)
  useEffect(() => {
    let alive = true
    if (src) void averageColor(src).then((c) => alive && setRgb(c))
    else setRgb(null)
    return () => {
      alive = false
    }
  }, [src])
  return useMemo(() => {
    const c: [number, number, number] = rgb ?? [30, 70, 110]
    return { deep: darkTone(c, 0.1, 0.65), mid: darkTone(c, 0.22, 0.7), accent: darkTone(c, 0.62, 0.85) }
  }, [rgb])
}

// Biletin görseli: seçilen görsel (art) yoksa yapımın kapağı / afişi. Konum "x y" (yüzde), yakınlık 1–3.
export function artOf(b: Bilet, portrait = false) {
  const src = b.art || (portrait ? b.poster || b.cover : b.cover || b.poster) || ''
  const fromPoster = !b.art && src === b.poster
  const m = /^(-?[\d.]+) (-?[\d.]+)$/.exec(b.artPos ?? '')
  const pos: [number, number] = m ? [Number(m[1]), Number(m[2])] : [50, fromPoster ? 20 : 30]
  const zoom = Math.min(3, Math.max(1, Number(b.artZoom) || 1))
  return { src, pos, zoom }
}

function ArtImg({ b, portrait, style }: { b: Bilet; portrait?: boolean; style?: CSSProperties }) {
  const { src, pos, zoom } = artOf(b, portrait)
  if (!src) return null
  const p = `${pos[0]}% ${pos[1]}%`
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      style={{ objectPosition: p, transform: zoom > 1 ? `scale(${zoom})` : undefined, transformOrigin: p, ...style }}
      draggable={false}
    />
  )
}

export function priceText(p?: string) {
  const v = (p ?? '').trim()
  return /^\d+([.,]\d+)?$/.test(v) ? `${v} ₺` : v
}

function Barcode({ seed, n, style }: { seed: string; n?: number; style?: CSSProperties }) {
  const bars = useMemo(() => barcode(seed, n), [seed, n])
  return (
    <div className="flex items-stretch" style={style}>
      {bars.map((w, i) => (
        <span key={i} style={{ width: `${w * 0.09}em`, marginRight: `${(i % 3) * 0.05 + 0.07}em`, background: i % 2 ? 'transparent' : 'currentColor' }} />
      ))}
    </div>
  )
}

const Label = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <span className="block uppercase" style={{ fontSize: '0.5em', letterSpacing: '0.22em', opacity: 0.55, fontWeight: 700, ...style }}>
    {children}
  </span>
)

function Glare() {
  return <div className="bilet-glare pointer-events-none absolute inset-0" />
}

// Hologram mühür: yanardöner, fareyle bileti oynatınca renkleri döner (--ha)
function HoloSeal({ size = 3.2, style }: { size?: number; style?: CSSProperties }) {
  return (
    <div
      className="absolute flex items-center justify-center rounded-full"
      style={{
        width: `${size}em`,
        height: `${size}em`,
        background: 'conic-gradient(from var(--ha, 20deg), #ff9ad5, #9fd8ff, #b8ffb0, #fff3a0, #ffb3e6, #a6c8ff, #ff9ad5)',
        boxShadow: 'inset 0 0 0 0.12em rgba(255,255,255,.55), 0 0.1em 0.3em rgba(0,0,0,.25)',
        opacity: 0.92,
        ...style,
      }}
    >
      <div className="absolute inset-[0.35em] rounded-full" style={{ background: 'repeating-radial-gradient(circle, rgba(255,255,255,.35) 0 0.06em, transparent 0.06em 0.22em)', mixBlendMode: 'overlay' }} />
      <img src="/logoblue.png" alt="" style={{ width: '46%', filter: 'grayscale(1) brightness(2.2)', opacity: 0.75, mixBlendMode: 'overlay' }} draggable={false} />
    </div>
  )
}

function PhotoFace({ src, glare }: { src: string; glare?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[0.9em] bg-neutral-900">
      <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
      {glare && <Glare />}
    </div>
  )
}

const dayLine = (b: Bilet) => [weekday(b.date), longDay(b.date)].filter(Boolean).join(', ') || tt('Tarih yok')

export function TicketFront({ b, no, glare }: { b: BiletItem; no: number; glare?: boolean }) {
  if (b.front) return <PhotoFace src={b.front} glare={glare} />
  const s = styleOf(b)
  if (s === 'klasik') return <KlasikFront b={b} no={no} glare={glare} />
  if (s === 'altin') return <AltinFront b={b} no={no} glare={glare} />
  if (s === 'neon') return <NeonFront b={b} no={no} glare={glare} />
  return <SinemaFront b={b} no={no} glare={glare} />
}

// ── Sinema: yapımın görseli, renkli gölge, beyaz kağıt koçan ──
function SinemaFront({ b, no, glare }: { b: BiletItem; no: number; glare?: boolean }) {
  const tint = useTicketTint(b.poster || b.cover)
  return (
    <div className="relative flex h-full w-full overflow-hidden rounded-[0.9em]" style={{ ...notchMask(1 - STUB), background: tint.deep }}>
      <div className="relative h-full overflow-hidden" style={{ width: `${(1 - STUB) * 100}%` }}>
        <ArtImg b={b} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${tint.deep} 0%, ${tint.deep}d9 24%, ${tint.deep}40 55%, transparent 100%), linear-gradient(0deg, ${tint.deep}cc 0%, transparent 42%)` }} />
        <div className="absolute inset-0 opacity-[.18] mix-blend-overlay" style={{ backgroundImage: NOISE }} />
        <div className="relative flex h-full flex-col justify-between text-white" style={{ padding: '1.5em 2em 1.4em' }}>
          <div className="flex items-center gap-[0.5em]">
            <img src="/logoblue.png" alt="" style={{ height: '1.25em' }} draggable={false} />
            <span style={{ fontSize: '0.62em', letterSpacing: '0.42em', fontWeight: 700, opacity: 0.85 }}>{tt('ARGUS SİNEMA')}</span>
            {b.format && (
              <span className="ml-auto rounded-[0.3em] border border-white/40 backdrop-blur-sm" style={{ fontSize: '0.58em', padding: '0.2em 0.6em', letterSpacing: '0.18em', fontWeight: 700, background: 'rgba(0,0,0,.2)' }}>
                {b.format.toLocaleUpperCase('tr')}
              </span>
            )}
          </div>
          <div style={{ maxWidth: '62%' }}>
            {b.logo ? (
              <img src={b.logo} alt={b.title} className="object-contain object-left drop-shadow-[0_0.15em_0.4em_rgba(0,0,0,.6)]" style={{ maxHeight: '4.6em', maxWidth: '100%' }} draggable={false} />
            ) : (
              <p className="font-black leading-[1.02] drop-shadow-[0_0.1em_0.3em_rgba(0,0,0,.6)] line-clamp-2" style={{ fontSize: '2.5em', letterSpacing: '-0.01em' }}>
                {b.title}
              </p>
            )}
            {b.year && <p style={{ fontSize: '0.7em', opacity: 0.7, marginTop: '0.5em', letterSpacing: '0.1em' }}>{b.year}</p>}
          </div>
          <div>
            <p className="font-semibold capitalize drop-shadow-[0_0.1em_0.3em_rgba(0,0,0,.5)]" style={{ fontSize: '1em' }}>
              {dayLine(b)}
              {b.time && <span style={{ opacity: 0.75 }}>{' · '}{b.time}</span>}
            </p>
            {b.cinema && (
              <p className="uppercase" style={{ fontSize: '0.62em', letterSpacing: '0.28em', opacity: 0.75, marginTop: '0.45em', fontWeight: 600 }}>
                {b.cinema}
              </p>
            )}
          </div>
        </div>
      </div>
      {/* koçan */}
      <div className="relative flex flex-1 flex-col justify-between" style={{ background: PAPER, color: INK, padding: '1.3em 1.3em 1.1em 1.5em', borderLeft: '0.14em dashed rgba(26,22,18,.35)' }}>
        <div className="absolute inset-0 opacity-50 mix-blend-multiply" style={{ backgroundImage: NOISE }} />
        <div className="absolute left-0 right-0 top-0" style={{ height: '0.35em', background: tint.accent }} />
        <HoloSeal size={2.6} style={{ right: '1.1em', bottom: '5.1em' }} />
        <div className="relative">
          <Label>{tt('Giriş')}</Label>
          <div className="mt-[0.5em] grid grid-cols-2 gap-x-[0.8em] gap-y-[0.6em]">
            <div>
              <Label>{tt('Salon')}</Label>
              <p className="font-black leading-none" style={{ fontSize: '1.7em', marginTop: '0.12em' }}>{b.hall || '—'}</p>
            </div>
            <div>
              <Label>{tt('Koltuk')}</Label>
              <p className="font-black leading-none" style={{ fontSize: '1.7em', marginTop: '0.12em' }}>{b.seat || '—'}</p>
            </div>
          </div>
          <p className="font-semibold" style={{ fontSize: '0.7em', marginTop: '0.9em', opacity: 0.75 }}>{shortDay(b.date)}{b.time ? `  ${b.time}` : ''}</p>
          <p className="font-bold leading-tight line-clamp-2" style={{ fontSize: '0.78em', marginTop: '0.7em' }}>{b.title}</p>
          {b.price && <p style={{ fontSize: '0.62em', marginTop: '0.35em', opacity: 0.6 }}>{priceText(b.price)}</p>}
        </div>
        <div className="relative">
          <Barcode seed={b.id} n={30} style={{ height: '2.1em' }} />
          <p className="font-mono" style={{ fontSize: '0.5em', marginTop: '0.5em', letterSpacing: '0.12em', opacity: 0.6 }}>{serialOf(no, b.date)}</p>
        </div>
      </div>
      {glare && <Glare />}
    </div>
  )
}

// ── Klasik: krem kağıt, bordo mürekkep, çift çerçeve, çerçeveli görsel ve damga ──
function KlasikFront({ b, no, glare }: { b: BiletItem; no: number; glare?: boolean }) {
  return (
    <div className="relative flex h-full w-full overflow-hidden rounded-[0.7em]" style={{ ...notchMask(1 - STUB), background: CREAM, color: MAROON }}>
      <div className="absolute inset-0 opacity-70 mix-blend-multiply" style={{ backgroundImage: NOISE }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(110,60,20,.18) 100%)' }} />
      <div className="relative h-full" style={{ width: `${(1 - STUB) * 100}%`, padding: '1em' }}>
        <div className="flex h-full" style={{ border: `0.12em solid ${MAROON}`, padding: '0.25em' }}>
          <div className="flex h-full w-full gap-[1.3em]" style={{ border: `0.05em solid ${MAROON}`, padding: '0.9em 1.2em 0.9em 0.9em' }}>
            <div className="relative h-full shrink-0 overflow-hidden" style={{ width: '10.5em', boxShadow: `0 0 0 0.08em ${MAROON}, 0 0 0 0.3em ${CREAM}, 0 0 0 0.38em ${MAROON}` }}>
              <ArtImg b={b} portrait style={{ filter: 'sepia(.25) contrast(1.05)' }} />
              <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 1.4em rgba(60,25,10,.45)' }} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between text-center">
              <div>
                <p style={{ fontSize: '0.58em', letterSpacing: '0.45em', fontWeight: 700 }}>★ {tt('ARGUS SİNEMASI')} ★</p>
                <div className="mx-auto" style={{ height: '0.06em', width: '70%', background: MAROON, opacity: 0.6, marginTop: '0.55em' }} />
              </div>
              <div>
                <p className="line-clamp-3 font-bold leading-[1.05]" style={{ fontFamily: SERIF, fontSize: b.title.length > 28 ? '1.65em' : '2.1em', color: '#3d0f0f' }}>
                  {b.title}
                </p>
                <p style={{ fontSize: '0.62em', letterSpacing: '0.3em', marginTop: '0.7em', fontWeight: 700, opacity: 0.8 }}>
                  {[b.year, b.format?.toLocaleUpperCase('tr')].filter(Boolean).join('  ·  ')}
                </p>
              </div>
              <div>
                <p className="capitalize" style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '0.95em' }}>
                  {dayLine(b)}
                  {b.time ? ` — ${b.time}` : ''}
                </p>
                {b.cinema && <p className="uppercase" style={{ fontSize: '0.56em', letterSpacing: '0.32em', marginTop: '0.45em', fontWeight: 700, opacity: 0.75 }}>{b.cinema}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* koçan */}
      <div className="relative flex flex-1 flex-col items-center justify-between text-center" style={{ background: MAROON, color: CREAM, padding: '1.4em 1.1em 1.2em', borderLeft: `0.16em dotted ${CREAM}` }}>
        <div className="absolute inset-0 opacity-30 mix-blend-multiply" style={{ backgroundImage: NOISE }} />
        <div className="absolute inset-[0.55em] rounded-[0.3em]" style={{ border: `0.06em solid ${CREAM}`, opacity: 0.45 }} />
        <p className="relative" style={{ fontSize: '0.58em', letterSpacing: '0.4em', fontWeight: 700 }}>{tt('GİRİŞ BİLETİ')}</p>
        <div className="relative flex w-full justify-around">
          <div>
            <Label style={{ opacity: 0.7 }}>{tt('Salon')}</Label>
            <p style={{ fontFamily: SERIF, fontSize: '2em', fontWeight: 700, lineHeight: 1, marginTop: '0.1em' }}>{b.hall || '—'}</p>
          </div>
          <div>
            <Label style={{ opacity: 0.7 }}>{tt('Koltuk')}</Label>
            <p style={{ fontFamily: SERIF, fontSize: '2em', fontWeight: 700, lineHeight: 1, marginTop: '0.1em' }}>{b.seat || '—'}</p>
          </div>
        </div>
        <div className="relative">
          <p style={{ fontSize: '0.68em', opacity: 0.85 }}>{shortDay(b.date)}{b.time ? `  ${b.time}` : ''}</p>
          {b.price && <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '0.8em', marginTop: '0.2em' }}>{priceText(b.price)}</p>}
        </div>
        <div className="relative flex items-center justify-center rounded-full" style={{ width: '4.4em', height: '4.4em', border: `0.12em solid ${CREAM}`, transform: 'rotate(-14deg)', opacity: 0.55 }}>
          <div className="absolute inset-[0.25em] rounded-full" style={{ border: `0.05em dashed ${CREAM}` }} />
          <p style={{ fontSize: '0.5em', letterSpacing: '0.12em', fontWeight: 800, lineHeight: 1.25 }}>
            ARGUS
            <br />№ {String(no).padStart(3, '0')}
          </p>
        </div>
      </div>
      {glare && <Glare />}
    </div>
  )
}

// ── Altın: gece siyahı, altın varak yazılar ve çerçeve, görsel sağdan karanlığa erir ──
const foil = (extra?: CSSProperties): CSSProperties => ({
  backgroundImage: GOLD_FOIL,
  backgroundSize: '220% 100%',
  backgroundPosition: 'var(--hx, 40%) 0',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  ...extra,
})
function AltinFront({ b, no, glare }: { b: BiletItem; no: number; glare?: boolean }) {
  return (
    <div className="relative flex h-full w-full overflow-hidden rounded-[0.9em]" style={{ ...notchMask(1 - STUB), background: NIGHT, color: GOLD }}>
      <div className="relative h-full overflow-hidden" style={{ width: `${(1 - STUB) * 100}%` }}>
        <div className="absolute inset-y-0 right-0" style={{ left: '28%', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 45%)', maskImage: 'linear-gradient(90deg, transparent, #000 45%)' }}>
          <ArtImg b={b} style={{ filter: 'saturate(.85) contrast(1.05)' }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(0deg, ${NIGHT} 0%, transparent 40%), linear-gradient(180deg, ${NIGHT}aa 0%, transparent 30%)` }} />
        </div>
        <div className="absolute rounded-[0.5em]" style={{ inset: '0.8em', border: '0.07em solid rgba(217,181,106,.55)' }} />
        <div className="absolute rounded-[0.35em]" style={{ inset: '1.05em', border: '0.04em solid rgba(217,181,106,.25)' }} />
        {[
          { left: '0.55em', top: '0.55em' },
          { right: '0.55em', top: '0.55em' },
          { left: '0.55em', bottom: '0.55em' },
          { right: '0.55em', bottom: '0.55em' },
        ].map((p, i) => (
          <span key={i} className="absolute" style={{ ...p, width: '0.6em', height: '0.6em', transform: 'rotate(45deg)', backgroundImage: GOLD_FOIL, backgroundSize: '300% 100%' }} />
        ))}
        <div className="relative flex h-full flex-col justify-between" style={{ padding: '1.9em 2.3em 1.8em' }}>
          <div className="flex items-center gap-[0.7em]">
            <span style={foil({ fontSize: '0.62em', letterSpacing: '0.5em', fontWeight: 800 })}>ARGUS</span>
            <span style={{ width: '1.6em', height: '0.05em', background: GOLD, opacity: 0.5 }} />
            <span style={{ fontSize: '0.55em', letterSpacing: '0.4em', fontWeight: 600, opacity: 0.75 }}>{tt('ÖZEL GÖSTERİM')}</span>
          </div>
          <div style={{ maxWidth: '58%' }}>
            {b.logo ? (
              <img src={b.logo} alt={b.title} className="object-contain object-left" style={{ maxHeight: '4.4em', maxWidth: '100%', filter: 'drop-shadow(0 0.15em 0.5em rgba(0,0,0,.8))' }} draggable={false} />
            ) : (
              <p className="line-clamp-2 font-bold leading-[1.05]" style={foil({ fontFamily: SERIF, fontSize: '2.3em' })}>
                {b.title}
              </p>
            )}
            <p style={{ fontSize: '0.62em', letterSpacing: '0.32em', marginTop: '0.8em', fontWeight: 600, opacity: 0.8 }}>
              {[b.year, b.format?.toLocaleUpperCase('tr')].filter(Boolean).join('  ◆  ')}
            </p>
          </div>
          <div>
            <p className="capitalize" style={foil({ fontSize: '1em', fontWeight: 700 })}>
              {dayLine(b)}
              {b.time ? ` · ${b.time}` : ''}
            </p>
            {b.cinema && <p className="uppercase" style={{ fontSize: '0.58em', letterSpacing: '0.34em', marginTop: '0.5em', fontWeight: 600, opacity: 0.7 }}>{b.cinema}</p>}
          </div>
        </div>
      </div>
      {/* koçan */}
      <div className="relative flex flex-1 flex-col justify-between" style={{ background: '#15130f', padding: '1.5em 1.4em 1.3em 1.6em', borderLeft: '0.14em dashed rgba(217,181,106,.4)' }}>
        <div className="absolute inset-0 opacity-25 mix-blend-screen" style={{ backgroundImage: NOISE }} />
        <HoloSeal size={2.6} style={{ right: '1.2em', bottom: '5.1em' }} />
        <div className="relative">
          <Label style={{ opacity: 0.7 }}>{tt('Giriş')}</Label>
          <div className="mt-[0.6em] grid grid-cols-2 gap-x-[0.8em]">
            <div>
              <Label style={{ opacity: 0.6 }}>{tt('Salon')}</Label>
              <p className="leading-none" style={foil({ fontFamily: SERIF, fontWeight: 700, fontSize: '1.9em', marginTop: '0.12em' })}>{b.hall || '—'}</p>
            </div>
            <div>
              <Label style={{ opacity: 0.6 }}>{tt('Koltuk')}</Label>
              <p className="leading-none" style={foil({ fontFamily: SERIF, fontWeight: 700, fontSize: '1.9em', marginTop: '0.12em' })}>{b.seat || '—'}</p>
            </div>
          </div>
          <p style={{ fontSize: '0.68em', marginTop: '1em', opacity: 0.75 }}>{shortDay(b.date)}{b.time ? `  ${b.time}` : ''}</p>
          {b.price && <p style={{ fontSize: '0.62em', marginTop: '0.35em', opacity: 0.6 }}>{priceText(b.price)}</p>}
        </div>
        <div className="relative">
          <Barcode seed={b.id} n={30} style={{ height: '2em', color: GOLD, opacity: 0.85 }} />
          <p className="font-mono" style={{ fontSize: '0.5em', marginTop: '0.5em', letterSpacing: '0.12em', opacity: 0.6 }}>{serialOf(no, b.date)}</p>
        </div>
      </div>
      {glare && <Glare />}
    </div>
  )
}

// ── Neon (v1.24, ödül paketinden): gece mavisi zemin, pembe-camgöbeği ışıklı çerçeve ve yazı, renkleri kaydırılmış görsel ──
const NEON_P = '#ff3fd0'
const NEON_C = '#3ff0ff'
const neonText = (c: string): CSSProperties => ({ color: '#fff', textShadow: `0 0 0.15em #fff, 0 0 0.35em ${c}, 0 0 0.8em ${c}, 0 0 1.6em ${c}` })
function NeonFront({ b, no, glare }: { b: BiletItem; no: number; glare?: boolean }) {
  return (
    <div className="relative flex h-full w-full overflow-hidden rounded-[0.9em]" style={{ ...notchMask(1 - STUB), background: '#07051a' }}>
      <div className="relative h-full overflow-hidden" style={{ width: `${(1 - STUB) * 100}%` }}>
        <ArtImg b={b} style={{ filter: 'grayscale(1) contrast(1.15) brightness(.9)' }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${NEON_P}, #5b2bff 50%, ${NEON_C})`, mixBlendMode: 'color', opacity: 0.85 }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, #07051a 0%, #07051ad0 26%, #07051a30 60%, transparent 100%), linear-gradient(0deg, #07051a 0%, transparent 45%)' }} />
        <div className="absolute inset-0 opacity-30" style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 0.08em, transparent 0.08em 0.32em)' }} />
        <div className="absolute rounded-[0.6em]" style={{ inset: '0.7em', boxShadow: `inset 0 0 0 0.12em ${NEON_P}, inset 0 0 0.9em ${NEON_P}, 0 0 0.9em ${NEON_P}`, animation: 'argus-neon-flicker 6s infinite' }} />
        <div className="relative flex h-full flex-col justify-between" style={{ padding: '1.7em 2.2em 1.6em' }}>
          <div className="flex items-center gap-[0.6em]">
            <span style={{ fontSize: '0.62em', letterSpacing: '0.5em', fontWeight: 800, ...neonText(NEON_C) }}>{tt('ARGUS SİNEMA')}</span>
            {b.format && (
              <span className="ml-auto rounded-[0.3em]" style={{ fontSize: '0.58em', padding: '0.2em 0.6em', letterSpacing: '0.18em', fontWeight: 800, color: NEON_C, boxShadow: `inset 0 0 0 0.1em ${NEON_C}, 0 0 0.6em ${NEON_C}` }}>
                {b.format.toLocaleUpperCase('tr')}
              </span>
            )}
          </div>
          <div style={{ maxWidth: '64%' }}>
            {b.logo ? (
              <img src={b.logo} alt={b.title} className="object-contain object-left" style={{ maxHeight: '4.4em', maxWidth: '100%', filter: `brightness(0) invert(1) drop-shadow(0 0 0.25em ${NEON_P}) drop-shadow(0 0 0.6em ${NEON_P})` }} draggable={false} />
            ) : (
              <p className="font-black leading-[1.05] line-clamp-2" style={{ fontSize: '2.4em', letterSpacing: '0.01em', ...neonText(NEON_P) }}>
                {b.title}
              </p>
            )}
            {b.year && <p style={{ fontSize: '0.7em', marginTop: '0.6em', letterSpacing: '0.3em', fontWeight: 700, ...neonText(NEON_C) }}>{b.year}</p>}
          </div>
          <div style={{ color: '#f5e9ff' }}>
            <p className="font-semibold capitalize" style={{ fontSize: '1em' }}>
              {dayLine(b)}
              {b.time && <span style={{ color: NEON_C }}>{' · '}{b.time}</span>}
            </p>
            {b.cinema && (
              <p className="uppercase" style={{ fontSize: '0.62em', letterSpacing: '0.28em', opacity: 0.75, marginTop: '0.45em', fontWeight: 600 }}>
                {b.cinema}
              </p>
            )}
          </div>
        </div>
      </div>
      {/* koçan */}
      <div className="relative flex flex-1 flex-col justify-between" style={{ background: 'linear-gradient(180deg,#120a2e,#07051a)', color: '#f5e9ff', padding: '1.3em 1.3em 1.1em 1.5em', borderLeft: `0.14em dashed ${NEON_C}88` }}>
        <div className="absolute left-0 right-0 top-0" style={{ height: '0.3em', background: `linear-gradient(90deg, ${NEON_P}, ${NEON_C})`, boxShadow: `0 0 0.8em ${NEON_P}` }} />
        <HoloSeal size={2.6} style={{ right: '1.1em', bottom: '5.1em' }} />
        <div className="relative">
          <Label style={{ color: NEON_C, opacity: 0.9 }}>{tt('Giriş')}</Label>
          <div className="mt-[0.5em] grid grid-cols-2 gap-x-[0.8em] gap-y-[0.6em]">
            <div>
              <Label>{tt('Salon')}</Label>
              <p className="font-black leading-none" style={{ fontSize: '1.7em', marginTop: '0.12em', ...neonText(NEON_P) }}>{b.hall || '—'}</p>
            </div>
            <div>
              <Label>{tt('Koltuk')}</Label>
              <p className="font-black leading-none" style={{ fontSize: '1.7em', marginTop: '0.12em', ...neonText(NEON_P) }}>{b.seat || '—'}</p>
            </div>
          </div>
          <p className="font-semibold" style={{ fontSize: '0.7em', marginTop: '0.9em', opacity: 0.75 }}>{shortDay(b.date)}{b.time ? `  ${b.time}` : ''}</p>
          <p className="font-bold leading-tight line-clamp-2" style={{ fontSize: '0.78em', marginTop: '0.7em' }}>{b.title}</p>
          {b.price && <p style={{ fontSize: '0.62em', marginTop: '0.35em', opacity: 0.6 }}>{priceText(b.price)}</p>}
        </div>
        <div className="relative" style={{ color: NEON_C, filter: `drop-shadow(0 0 0.25em ${NEON_C})` }}>
          <Barcode seed={b.id} n={30} style={{ height: '2.1em' }} />
          <p className="font-mono" style={{ fontSize: '0.5em', marginTop: '0.5em', letterSpacing: '0.12em', opacity: 0.8 }}>{serialOf(no, b.date)}</p>
        </div>
      </div>
      {glare && <Glare />}
    </div>
  )
}

// Arka yüzün renkleri tasarıma göre
function backTheme(s: TicketStyle, accent: string) {
  if (s === 'klasik') return { bg: CREAM, ink: MAROON, line: 'rgba(110,29,29,.35)', bar: MAROON, noise: 0.7, blend: 'multiply' as const, title: { fontFamily: SERIF, color: '#3d0f0f' } as CSSProperties }
  if (s === 'neon') return { bg: '#07051a', ink: '#f5e9ff', line: 'rgba(63,240,255,.45)', bar: `linear-gradient(90deg, ${NEON_P}, ${NEON_C})`, noise: 0.15, blend: 'screen' as const, title: neonText(NEON_P) }
  if (s === 'altin') return { bg: '#100f0c', ink: GOLD, line: 'rgba(217,181,106,.35)', bar: `linear-gradient(90deg, #8a6a2f, #f4dc93, #8a6a2f)`, noise: 0.25, blend: 'screen' as const, title: foil({ fontFamily: SERIF }) }
  return { bg: PAPER, ink: INK, line: 'rgba(26,22,18,.35)', bar: accent, noise: 0.6, blend: 'multiply' as const, title: {} as CSSProperties }
}

export function TicketBack({ b, no, glare }: { b: BiletItem; no: number; glare?: boolean }) {
  const tint = useTicketTint(b.poster || b.cover)
  if (b.back) return <PhotoFace src={b.back} glare={glare} />
  const s = styleOf(b)
  const th = backTheme(s, tint.accent)
  const fields: [string, string | undefined][] = [
    [tt('Tarih'), longDay(b.date)],
    [tt('Seans'), b.time],
    [tt('Sinema'), b.cinema],
    [tt('Salon'), b.hall],
    [tt('Koltuk'), b.seat],
    [tt('Format'), b.format],
    [tt('Kiminle'), b.withWho],
    [tt('Fiyat'), priceText(b.price)],
  ]
  const shown = fields.filter(([, v]) => v)
  return (
    <div className="relative flex h-full w-full overflow-hidden rounded-[0.9em]" style={{ ...notchMask(STUB), background: th.bg, color: th.ink }}>
      <div className="absolute inset-0" style={{ backgroundImage: NOISE, opacity: th.noise, mixBlendMode: th.blend }} />
      {/* koçanın arkası */}
      <div className="relative flex flex-col items-center justify-between" style={{ width: `${STUB * 100}%`, padding: '1.3em 1.2em', borderRight: `0.14em dashed ${th.line}` }}>
        {b.poster ? (
          <img src={b.poster} alt="" className="rounded-[0.35em] object-cover shadow-[0_0.2em_0.6em_rgba(0,0,0,.25)]" style={{ width: '58%', aspectRatio: '2 / 3', filter: s === 'altin' ? 'saturate(.8)' : 'sepia(.15)', boxShadow: s === 'altin' ? `0 0 0 0.08em ${GOLD}` : undefined }} draggable={false} />
        ) : (
          <img src="/logoblue.png" alt="" style={{ width: '40%', opacity: 0.5 }} draggable={false} />
        )}
        <div className="text-center">
          <p className="font-black leading-none" style={{ fontSize: '1.6em', ...(s === 'altin' ? foil() : s === 'klasik' ? { fontFamily: SERIF } : {}) }}>№ {String(no).padStart(3, '0')}</p>
          <Label>{tt('Koleksiyon')}</Label>
        </div>
      </div>
      <div className="relative flex flex-1 flex-col" style={{ padding: '1.3em 1.8em 1.1em' }}>
        <div className="absolute left-0 right-0 top-0" style={{ height: '0.35em', background: th.bar }} />
        <div className="flex items-baseline justify-between gap-[1em]">
          <p className="font-black leading-tight line-clamp-1" style={{ fontSize: '1.55em', ...th.title }}>{b.title}</p>
          <img src="/logoblue.png" alt="" style={{ height: '1.2em', opacity: 0.8 }} draggable={false} />
        </div>
        <div className="mt-[1.2em] grid grid-cols-4 gap-x-[1em] gap-y-[1.1em]">
          {shown.map(([k, v]) => (
            <div key={k} className={`min-w-0 ${(k === tt('Sinema') || k === tt('Kiminle')) && (v ?? '').length > 12 ? 'col-span-2' : ''}`}>
              <Label>{k}</Label>
              <p className="font-bold truncate" style={{ fontSize: '0.98em', marginTop: '0.25em' }}>{v}</p>
            </div>
          ))}
        </div>
        {b.note && (
          <p className="mt-[1.1em] line-clamp-2" style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '1.05em', opacity: 0.85 }}>
            “{b.note}”
          </p>
        )}
        <div className="mt-auto flex items-end justify-between gap-[1em]">
          <div>
            <p style={{ fontSize: '0.5em', letterSpacing: '0.14em', opacity: 0.55, fontWeight: 600 }} className="uppercase">
              {tt('Bu bilet ARGUS koleksiyonunun bir parçasıdır')}
            </p>
            <p className="font-mono" style={{ fontSize: '0.55em', marginTop: '0.3em', opacity: 0.6, letterSpacing: '0.12em' }}>{serialOf(no, b.date)}</p>
          </div>
          <Barcode seed={b.id + 'b'} n={40} style={{ height: '1.9em' }} />
        </div>
      </div>
      {glare && <Glare />}
    </div>
  )
}

// Duvardaki küçük bilet (sadece ön yüz)
export function TicketThumb({ b, no, width }: { b: BiletItem; no: number; width: number }) {
  return (
    <div style={{ width, height: width / TICKET_RATIO, fontSize: width / 48 }}>
      <TicketFront b={b} no={no} />
    </div>
  )
}
