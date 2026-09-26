import type { ReactNode } from 'react'

// Detay penceresindeki bölüm başlıkları (Bölümler, Oyuncular, Nerede İzlenir, Benzer İçerikler) — hepsi
// aynı görünümde, yanında küçük bir sayı ya da not; sağda isteğe bağlı bir bağlantı.
// small: dar yan sütun için (ör. detay penceresinde Nerede İzlenir).
export default function SectionTitle({ title, count, right, small = false }: { title: string; count?: string; right?: ReactNode; small?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2.5 ${small ? 'mb-3' : 'mb-4'}`}>
      <h3 className={`${small ? 'text-sm' : 'text-lg sm:text-xl'} font-semibold text-neutral-50 tracking-tight whitespace-nowrap`}>{title}</h3>
      {count && <span className="text-xs text-neutral-500">{count}</span>}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  )
}
