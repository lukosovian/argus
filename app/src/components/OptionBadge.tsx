import { OPTION_COLORS } from '../types'
import { splitFlagEmoji } from '../lib/flagEmoji'

export default function OptionBadge({
  label,
  colorIndex,
  image,
  onClick,
  selected,
  dim = true,
  wrap = false,
}: {
  label: string
  colorIndex: number
  image?: string
  onClick?: () => void
  selected?: boolean
  // "Seçilmemiş" olduğunu göstermek için soluk başlayıp üzerine gelince canlanan stil, bir
  // seçim listesinde (picker) mantıklı ama salt bilgi amaçlı gösterimlerde (ör. detay
  // penceresindeki Tür/Ülke rozetleri) hep soluk durup kafa karıştırıyordu — o kullanım
  // yerleri bunu false geçerek normal/canlı görünümde kalsın diye bu prop eklendi.
  dim?: boolean
  // Dar yerde (tablonun "Rahat" görünümü) uzun etiket kesilmesin, alt satıra geçsin
  wrap?: boolean
}) {
  const c = OPTION_COLORS[colorIndex % OPTION_COLORS.length]
  const { flagCode, rest } = splitFlagEmoji(label)
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[11px] leading-none px-1.5 py-1 border ${wrap ? 'max-w-full whitespace-normal break-words rounded-lg' : 'whitespace-nowrap rounded-full'} ${c.bg} ${c.text} ${c.border} ${
        onClick ? 'cursor-pointer' : ''
      } ${onClick && dim && !selected ? 'opacity-40 hover:opacity-100' : ''} transition`}
    >
      {image && <img src={image} alt="" className="h-4 w-4 rounded-full object-cover shrink-0 -ml-0.5" />}
      {flagCode && <span className={`fi fi-${flagCode} rounded-[2px] shrink-0`} />}
      {rest}
    </span>
  )
}
