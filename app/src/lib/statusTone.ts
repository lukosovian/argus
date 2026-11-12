import { isName, STATUS_NAMES } from './names'

// Durumlar için tek renk dili (v1.23.3, öneri G3): İzlendi yeşil, İzlenecek turuncu, Yarım mavi, İzleniyor sarı —
// arşiv tablosunda, detay penceresinde, Aklımda'da, Takvim'de ve telefonda hep aynı. Başlarında küçük bir nokta var,
// İzleniyor'unki nabız gibi atıyor. Durum sütunu adla bulunduğu gibi (bkz. roles.ts) dört durum da adla tanınıyor;
// tanınmayan (kullanıcının kendi eklediği) seçenekler kendi seçtiği renkte kalır.

export type StatusKey = keyof typeof STATUS_NAMES

export const STATUS_STYLE: Record<StatusKey, { chip: string; solid: string; dot: string; hex: string }> = {
  izlendi: { chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', solid: 'bg-emerald-500 text-white', dot: 'bg-emerald-400', hex: '#22c55e' },
  izlenecek: { chip: 'bg-orange-500/15 text-orange-400 border-orange-500/30', solid: 'bg-orange-500 text-white', dot: 'bg-orange-400', hex: '#f97316' },
  yarim: { chip: 'bg-sky-500/15 text-sky-400 border-sky-500/30', solid: 'bg-sky-500 text-white', dot: 'bg-sky-400', hex: '#38bdf8' },
  izleniyor: { chip: 'bg-amber-500/15 text-amber-400 border-amber-500/30', solid: 'bg-amber-400 text-neutral-950', dot: 'bg-amber-400', hex: '#f59e0b' },
}

export function statusKeyOf(label: string | undefined | null): StatusKey | null {
  if (!label) return null
  for (const k of Object.keys(STATUS_NAMES) as StatusKey[]) if (isName(label, STATUS_NAMES[k])) return k
  return null
}
