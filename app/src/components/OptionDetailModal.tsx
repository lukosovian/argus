import type { SelectOption } from '../types'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'

export default function OptionDetailModal({
  option,
  role,
  onClose,
  onShowContents,
}: {
  option: SelectOption
  // Bu pencere hangi kayıttan açıldıysa, o kayıttaki rolü/karakteri (TMDB'den
  // çekilmiş, satıra özel bir bilgi) — genel seçenek bilgisinin (image/subtitle) parçası değil.
  role?: string
  onClose: () => void
  onShowContents: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="bg-neutral-900 rounded-xl w-full max-w-sm overflow-hidden text-center p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {option.image && (
          <img
            src={option.image}
            alt={option.label}
            className="w-32 aspect-[2/3] object-cover rounded-lg mx-auto mb-4 border border-neutral-700"
          />
        )}
        <h3 className="text-lg font-medium text-neutral-100">{option.label}</h3>
        {option.subtitle && <p className="text-sm text-neutral-400 mt-1">{option.subtitle}</p>}
        {role && <p className="text-sm text-neutral-300 mt-1">Bu yapımdaki rolü: {role}</p>}
        <div className="flex items-center justify-center gap-2 mt-5">
          <button onClick={onShowContents} style={primaryButtonStyle} className={`text-sm rounded-lg px-4 py-2 ${PRIMARY_BUTTON}`}>
            İçerikleri gör
          </button>
          <button
            onClick={onClose}
            className="text-sm bg-neutral-800 text-neutral-300 rounded-lg px-4 py-2 hover:bg-neutral-700 transition"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
