import { BRAND_GRADIENT } from '../lib/theme'

// Uygulama genelinde LİSTEDEN seçim (çoklu seçim, "hangilerini dahil et" gibi) için ortak,
// temaya uygun kutucuk — düz tarayıcı onay kutusunun sadece `accent-color` ile mavi'ye
// boyanmış hali "klasik" durmaya devam ediyordu (kullanıcı geri bildirimi). Bunun yerine
// `ToggleSwitch` ile aynı yaklaşım: gerçek bir `<button>`, işaretliyken marka gradyanıyla dolu
// ve içinde beyaz bir onay işareti — köşe yuvarlaklığı da uygulamadaki diğer küçük kontrollerle
// (IconButton, ToggleSwitch) aynı ölçekte. Tek bir ayaç açma/kapama (bkz. ToggleSwitch) DEĞİL,
// birden çok öğeden seçim yapılan yerler için (satır seçimi, sütun/CSV listesi vb.).
export default function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className = '',
}: {
  checked: boolean
  /** "Bazıları seçili" durumu — ör. başlıktaki "tümünü seç" bazı satırlar seçiliyken. */
  indeterminate?: boolean
  onChange: () => void
  label?: string
  className?: string
}) {
  const active = checked || indeterminate
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      style={active ? { background: BRAND_GRADIENT } : undefined}
      className={`h-4 w-4 shrink-0 rounded flex items-center justify-center border transition ${
        active ? 'border-transparent' : 'border-neutral-600 bg-neutral-800 hover:border-neutral-400'
      } ${className}`}
    >
      {indeterminate ? (
        <span className="h-0.5 w-2 rounded-full bg-white" />
      ) : checked ? (
        <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
          <path d="M3 8.2 6.4 11.5 13 4.5" />
        </svg>
      ) : null}
    </button>
  )
}
