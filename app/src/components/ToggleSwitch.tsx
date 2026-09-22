import { BRAND_GRADIENT } from '../lib/theme'

// Uygulama genelinde tek bir açık/kapalı ayar için kullanılan ortak anahtar (switch) —
// Yardım Merkezi'ndeki "Ana Sayfa Ayarları" wireframe'inde çizdiğimiz haliyle: kapalıyken düz
// gri bir hap, açıkken marka gradyanıyla dolu, düğme (knob) sağa kayıyor. Düz bir onay kutusunun
// ("şunu dahil et" gibi bir LİSTEDEN seçim) yerine değil — sadece TEK bir ayarı açıp kapatan
// yerlerde kullanılır (ör. "vitrin açık mı", "API bu alanı doldursun mu").
export default function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  /** Erişilebilirlik için — görünür bir metin etiketi ayrıca varsa boş bırakılabilir. */
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={checked ? { background: BRAND_GRADIENT } : undefined}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? '' : 'bg-neutral-700'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
