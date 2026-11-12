import { useEffect, useState } from 'react'
import { tt } from '../lib/i18n'
import { MOBILE } from '../lib/mobile/ui'

// Sayfa yüklenirken düz "Yükleniyor..." yazısı yerine sayfanın silik taslağı (gri, hafifçe nabız atan kutular) —
// sayfa açılırken boşluk/zıplama olmasın, ne geleceği baştan belli olsun. Yükleme çok kısa sürerse (çoğu zaman
// öyle) hiç görünmesin diye kısa bir gecikmeyle beliriyor; yoksa bir anlık yanıp sönme olurdu.
const DELAY_MS = 180

function useDelayed() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), DELAY_MS)
    return () => clearTimeout(t)
  }, [])
  return show
}

function Block({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  // Üstünden soldan sağa ışık geçen gri kutu (v1.23.3, öneri G4; bkz. index.css .argus-parilti)
  return <div className={`argus-parilti rounded-lg ${className}`} style={style} />
}

export type SkeletonKind = 'home' | 'table' | 'rows' | 'calendar' | 'page' | 'posters'

export default function PageSkeleton({ kind = 'page' }: { kind?: SkeletonKind }) {
  const show = useDelayed()
  return (
    <div role="status" aria-label={tt('Yükleniyor...')} className="transition-opacity duration-300" style={{ opacity: show ? 1 : 0 }}>
      {kind === 'home' && <HomeSkeleton />}
      {kind === 'table' && <TableSkeleton />}
      {kind === 'rows' && <RowsSkeleton />}
      {kind === 'calendar' && <CalendarSkeleton />}
      {kind === 'page' && <GenericSkeleton />}
      {kind === 'posters' && <PostersSkeleton />}
    </div>
  )
}

// Ana sayfa: büyük vitrin + afiş satırları
function HomeSkeleton() {
  const cards = MOBILE ? 3 : 6
  return (
    <div>
      <div className="relative w-full bg-neutral-900" style={{ height: MOBILE ? '58vh' : 'min(56vh, 620px)' }}>
        <div className="absolute left-4 sm:left-10 bottom-10 space-y-3 w-[min(420px,70%)]">
          <Block className="h-16 w-3/4" />
          <Block className="h-3 w-full" />
          <Block className="h-3 w-5/6" />
          <div className="flex gap-2 pt-2">
            <Block className="h-10 w-28 rounded-full" />
            <Block className="h-10 w-28 rounded-full" />
          </div>
        </div>
      </div>
      <div className="px-3 sm:px-6 pt-8 space-y-9">
        {[0, 1, 2].map((r) => (
          <div key={r}>
            <Block className="h-4 w-40 mb-3" />
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: cards }).map((_, i) => (
                <Block key={i} className={`shrink-0 ${MOBILE ? 'aspect-[2/3]' : 'aspect-video'}`} style={{ width: MOBILE ? '30%' : `calc((100% - ${(cards - 1) * 12}px) / ${cards})` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Arşiv tablosu: araç çubuğu + satırlar
function TableSkeleton() {
  return (
    <div className="px-3 sm:px-6 py-6">
      <Block className="h-7 w-56 mb-5" />
      <div className="flex gap-2 mb-5">
        {[24, 20, 28, 16].map((w, i) => (
          <Block key={i} className="h-8 rounded-full" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <RowsSkeleton />
    </div>
  )
}

// Sadece tablo satırları (araç çubuğu zaten görünürken)
function RowsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Block className="h-12 w-8 shrink-0 rounded-md" />
          <Block className="h-3.5" style={{ width: `${30 + ((i * 37) % 30)}%` }} />
          <Block className="h-3.5 w-20 ml-auto" />
          <Block className="h-3.5 w-16 hidden sm:block" />
        </div>
      ))}
    </div>
  )
}

// Takvim: başlık + 7 sütunlu ay ızgarası
function CalendarSkeleton() {
  return (
    <div className="px-3 sm:px-6 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <Block className="h-7 w-48" />
        <Block className="h-8 w-32 rounded-full" />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }).map((_, i) => (
          <Block key={i} className="aspect-square sm:aspect-[4/3] rounded-md" />
        ))}
      </div>
    </div>
  )
}

// Diğer sayfalar (İstatistikler, Evrenler, Flashback…): başlık + kartlar
function GenericSkeleton() {
  return (
    <div className="px-3 sm:px-6 py-8 max-w-6xl mx-auto">
      <Block className="h-8 w-60 mb-2" />
      <Block className="h-3.5 w-80 max-w-full mb-8" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Block className="h-56 rounded-2xl" />
        <Block className="h-56 rounded-2xl" />
      </div>
    </div>
  )
}

// Afişli sayfalar (Evren detayı, Koleksiyon…): büyük başlık kutusu + afiş ızgarası
function PostersSkeleton() {
  return (
    <div className="px-3 sm:px-6 py-8 max-w-6xl mx-auto">
      <div className="rounded-3xl border border-neutral-800 p-6 sm:p-10 mb-6">
        <Block className="h-3 w-16 mb-3" />
        <Block className="h-10 w-96 max-w-full mb-4" />
        <Block className="h-2 w-[min(560px,100%)] rounded-full mb-3" />
        <Block className="h-3.5 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
        {Array.from({ length: 14 }).map((_, i) => (
          <Block key={i} className="aspect-[2/3]" />
        ))}
      </div>
    </div>
  )
}

// Panel/pencere içinde küçük taslak: birkaç gri satır (Ayarlar panelleri, Geçmiş, TMDB bilgileri…)
export function LineSkeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  const show = useDelayed()
  return (
    <div role="status" aria-label={tt('Yükleniyor...')} className={`space-y-2.5 py-1 transition-opacity duration-300 ${className}`} style={{ opacity: show ? 1 : 0 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Block key={i} className="h-3.5" style={{ width: `${92 - ((i * 23) % 40)}%` }} />
      ))}
    </div>
  )
}
