import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { averageColor, darkTone } from '../../lib/imageColor'
import { barcode, longDay, serialOf, shortDay, weekday, type Bilet } from '../../lib/bilet'
import { tt } from '../../lib/i18n'

// Koleksiyonluk sinema bileti (v1.23.11). Ön yüz: yapımın görseli, logosu/adı, tarih-seans ve sinema; sağda yırtılabilir
// koçan (salon, koltuk, barkod). Arka yüz: kağıt dokusu, bütün bilgiler, notun ve barkod. Gerçek biletin fotoğrafı
// yüklendiyse o yüzde fotoğraf görünür. Ölçüler "em" cinsinden: kapsayıcının yazı boyutu (genişlik / 48) her şeyi ölçekler.

export type BiletItem = Bilet & { id: string }
export const TICKET_RATIO = 2.4
export const STUB = 0.27 // koçanın genişliği (oran)

const PAPER = '#f2ece1'
const INK = '#1a1612'
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

function Barcode({ seed, n, className = '', style }: { seed: string; n?: number; className?: string; style?: CSSProperties }) {
  const bars = useMemo(() => barcode(seed, n), [seed, n])
  return (
    <div className={`flex items-stretch ${className}`} style={style}>
      {bars.map((w, i) => (
        <span key={i} style={{ width: `${w * 0.09}em`, marginRight: `${(i % 3) * 0.05 + 0.07}em`, background: i % 2 ? 'transparent' : 'currentColor' }} />
      ))}
    </div>
  )
}

const Label = ({ children }: { children: React.ReactNode }) => <span className="block uppercase" style={{ fontSize: '0.5em', letterSpacing: '0.22em', opacity: 0.55, fontWeight: 700 }}>{children}</span>

function Glare() {
  return <div className="bilet-glare pointer-events-none absolute inset-0" />
}

export function TicketFront({ b, no, glare }: { b: BiletItem; no: number; glare?: boolean }) {
  const tint = useTicketTint(b.poster || b.cover)
  const bg = b.cover || b.poster
  if (b.front)
    return (
      <div className="relative h-full w-full overflow-hidden rounded-[0.9em] bg-neutral-900">
        <img src={b.front} alt="" className="h-full w-full object-cover" draggable={false} />
        {glare && <Glare />}
      </div>
    )
  return (
    <div className="relative flex h-full w-full overflow-hidden rounded-[0.9em]" style={{ ...notchMask(1 - STUB), background: tint.deep }}>
      <div className="relative h-full overflow-hidden" style={{ width: `${(1 - STUB) * 100}%` }}>
        {bg && <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: b.cover ? 'center 30%' : 'center 20%' }} draggable={false} />}
        <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${tint.deep} 0%, ${tint.deep}e6 30%, ${tint.deep}55 62%, transparent 100%), linear-gradient(0deg, ${tint.deep}cc 0%, transparent 45%)` }} />
        <div className="absolute inset-0 opacity-[.18] mix-blend-overlay" style={{ backgroundImage: NOISE }} />
        <div className="relative flex h-full flex-col justify-between text-white" style={{ padding: '1.5em 2em 1.4em' }}>
          <div className="flex items-center gap-[0.5em]">
            <img src="/logoblue.png" alt="" style={{ height: '1.25em' }} draggable={false} />
            <span style={{ fontSize: '0.62em', letterSpacing: '0.42em', fontWeight: 700, opacity: 0.85 }}>{tt('ARGUS SİNEMA')}</span>
            {b.format && (
              <span className="ml-auto rounded-[0.3em] border border-white/40" style={{ fontSize: '0.58em', padding: '0.2em 0.6em', letterSpacing: '0.18em', fontWeight: 700 }}>
                {b.format.toLocaleUpperCase('tr')}
              </span>
            )}
          </div>
          <div style={{ maxWidth: '68%' }}>
            {b.logo ? (
              <img src={b.logo} alt={b.title} className="object-contain object-left drop-shadow-[0_0.15em_0.4em_rgba(0,0,0,.6)]" style={{ maxHeight: '4.6em', maxWidth: '100%' }} draggable={false} />
            ) : (
              <p className="font-black leading-[1.02] drop-shadow-[0_0.1em_0.3em_rgba(0,0,0,.6)] line-clamp-2" style={{ fontSize: '2.5em', letterSpacing: '-0.01em' }}>
                {b.title}
              </p>
            )}
            {b.year && <p style={{ fontSize: '0.7em', opacity: 0.7, marginTop: '0.5em', letterSpacing: '0.1em' }}>{b.year}</p>}
          </div>
          <div className="flex items-end justify-between gap-[1em]">
            <div>
              <p className="font-semibold capitalize" style={{ fontSize: '1em' }}>
                {[weekday(b.date), longDay(b.date)].filter(Boolean).join(', ') || tt('Tarih yok')}
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
      </div>
      {/* koçan */}
      <div className="relative flex flex-1 flex-col justify-between" style={{ background: PAPER, color: INK, padding: '1.3em 1.3em 1.1em 1.5em', borderLeft: '0.14em dashed rgba(26,22,18,.35)' }}>
        <div className="absolute inset-0 opacity-50 mix-blend-multiply" style={{ backgroundImage: NOISE }} />
        <div className="absolute left-0 right-0 top-0" style={{ height: '0.35em', background: tint.accent }} />
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
          <p className="font-bold leading-tight line-clamp-2" style={{ fontSize: '0.78em', marginTop: '0.9em' }}>{b.title}</p>
          {b.price && <p style={{ fontSize: '0.62em', marginTop: '0.35em', opacity: 0.6 }}>{b.price}</p>}
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

export function TicketBack({ b, no, glare }: { b: BiletItem; no: number; glare?: boolean }) {
  const tint = useTicketTint(b.poster || b.cover)
  if (b.back)
    return (
      <div className="relative h-full w-full overflow-hidden rounded-[0.9em] bg-neutral-900">
        <img src={b.back} alt="" className="h-full w-full object-cover" draggable={false} />
        {glare && <Glare />}
      </div>
    )
  const fields: [string, string | undefined][] = [
    [tt('Tarih'), longDay(b.date)],
    [tt('Seans'), b.time],
    [tt('Sinema'), b.cinema],
    [tt('Salon'), b.hall],
    [tt('Koltuk'), b.seat],
    [tt('Format'), b.format],
    [tt('Kiminle'), b.withWho],
    [tt('Fiyat'), b.price],
  ]
  const shown = fields.filter(([, v]) => v)
  return (
    <div className="relative flex h-full w-full overflow-hidden rounded-[0.9em]" style={{ ...notchMask(STUB), background: PAPER, color: INK }}>
      <div className="absolute inset-0 opacity-60 mix-blend-multiply" style={{ backgroundImage: NOISE }} />
      {/* koçanın arkası */}
      <div className="relative flex flex-col items-center justify-between" style={{ width: `${STUB * 100}%`, padding: '1.3em 1.2em', borderRight: '0.14em dashed rgba(26,22,18,.35)' }}>
        {b.poster ? (
          <img src={b.poster} alt="" className="rounded-[0.35em] object-cover shadow-[0_0.2em_0.6em_rgba(0,0,0,.25)]" style={{ width: '58%', aspectRatio: '2 / 3', filter: 'sepia(.15)' }} draggable={false} />
        ) : (
          <img src="/logoblue.png" alt="" style={{ width: '40%', opacity: 0.5 }} draggable={false} />
        )}
        <div className="text-center">
          <p className="font-black leading-none" style={{ fontSize: '1.6em' }}>№ {String(no).padStart(3, '0')}</p>
          <Label>{tt('Koleksiyon')}</Label>
        </div>
      </div>
      <div className="relative flex flex-1 flex-col" style={{ padding: '1.3em 1.8em 1.1em' }}>
        <div className="absolute left-0 right-0 top-0" style={{ height: '0.35em', background: tint.accent }} />
        <div className="flex items-baseline justify-between gap-[1em]">
          <p className="font-black leading-tight line-clamp-1" style={{ fontSize: '1.55em' }}>{b.title}</p>
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
          <p className="mt-[1.1em] line-clamp-2" style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontSize: '1.05em', opacity: 0.85 }}>
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
