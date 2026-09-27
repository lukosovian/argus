import { createPortal } from 'react-dom'
import type { SelectOption } from '../types'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'

// Bayrak emojisi (iki "regional indicator" harfi) Windows'ta "us" gibi harf olarak görünüyor — ayıkla.
export function stripFlags(s: string): string {
  return s.replace(/[\u{1F1E6}-\u{1F1FF}]{2}\s*/gu, '')
}

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
  // document.body'ye çiziliyor: detay penceresinin arka planındaki bulanıklık efekti (backdrop-blur)
  // içindeki "tam ekran" pencereleri kendi kaydırılan içeriğine hapsediyordu — kullanıcı aşağıdayken
  // oyuncuya tıklayınca pencere sayfanın en üstünde açılıyor, görünmüyordu.
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center px-4" onClick={onClose}>
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
        {/* Doğum yerindeki bayrak işareti Windows'ta "us" gibi harf olarak görünüyordu — ayıklanıyor. */}
        {option.subtitle && <p className="text-sm text-neutral-400 mt-1">{stripFlags(option.subtitle)}</p>}
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
    </div>,
    document.body,
  )
}
