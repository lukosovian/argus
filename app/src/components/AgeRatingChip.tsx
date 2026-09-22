import { normalizeAgeRating } from '../lib/ageRating'

// Sadece rozet (metin/açıklama yok) — vitrindeki gibi az yer kaplaması gereken yerler için.
// Açıklama tamamen kaybolmasın diye native `title` tooltip'i olarak hâlâ hover'da okunabiliyor.
// Eşlenemeyen bir ham değer gelirse hiçbir şey göstermiyor (vitrin sade kalsın, ham kod basılmasın).
export default function AgeRatingChip({ raw, className = '' }: { raw: string; className?: string }) {
  const tier = normalizeAgeRating(raw)
  if (!tier) return null
  return (
    <span
      title={tier.description}
      style={{ background: tier.color }}
      className={`inline-flex items-center justify-center rounded-md text-white text-xs font-bold px-1.5 shrink-0 ${className}`}
    >
      {tier.label}
    </span>
  )
}
