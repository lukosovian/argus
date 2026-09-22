import { useRef, useState } from 'react'

const inputClass =
  'w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm'

// Çoklu Tarih (multidate) alanının ve bölüm bazlı izleme tiklerinin (SeasonsBrowser)
// ikisinin de kullandığı, tekrarı önlemek için ortak küçük düzenleyici: bir tarih dizisi
// (ISO "YYYY-MM-DD") artı kaldırılabilir kutucuklar + yeni tarih ekleme.
export default function DateChipEditor({
  dates,
  onChange,
  autoFocus,
}: {
  dates: string[]
  onChange: (dates: string[]) => void
  autoFocus?: boolean
}) {
  const [newDate, setNewDate] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Bir gün seçilir seçilmez (takvimden tıklanarak ya da gün/ay/yıl elle doldurularak) ANINDA
  // eklenir — ayrı bir "Ekle" tıklaması beklemiyoruz artık. Sebebi sadece kolaylık değil, gerçek
  // bir hatanın düzeltmesi: bu bileşen dışarı tıklayınca kapanan bir popover'ın (AnchoredMenu)
  // içinde açılıyor, ve tarayıcının kendi takvim açılır penceresinden bir güne tıklamak bazı
  // tarayıcılarda "popover'ın dışına tıklama" sayılıp popover'ı ayrı bir "Ekle" tıklaması
  // gelmeden ANINDA kapatabiliyordu — kullanıcı "eskiye dönük tarih giremiyorum" dedi, bu
  // yarış durumu (seç → popover kapanır → Ekle'ye hiç basılamaz) en olası sebepti. Tarayıcı
  // `input.value`'yu gün/ay/yıl'ın TAMAMI dolmadan asla boş string'ten farklı vermediği için
  // (native davranış) bu, yarım/eksik bir tarihi yanlışlıkla eklemez.
  function commit(v: string) {
    if (!v || dates.includes(v)) return
    onChange([...dates, v].sort())
    setNewDate('')
  }

  // Var olan bir tarihin YAZISINA (çarpıya değil) tıklayınca o tarihi listeden çıkarıp aşağıdaki
  // giriş kutusuna yükler, kutuya odaklanır — kullanıcı "girdiğim tarihi güncelleyemiyorum" dedi;
  // önceden tek yol "sil, sonra sıfırdan yeniden yaz"dı, artık tek tıkla düzenlemeye başlanıyor
  // (kutu zaten o tarihle dolu geldiği için sadece değiştirmek istediği gün/ay/yıl'ı değiştirir).
  function startEdit(d: string) {
    onChange(dates.filter((x) => x !== d))
    setNewDate(d)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="space-y-2">
      {dates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[...dates].sort().map((d) => {
            const [y, m, day] = d.split('-')
            return (
              <span
                key={d}
                className="inline-flex items-center gap-1 text-xs bg-neutral-800 border border-neutral-700 rounded-full pl-2.5 pr-1.5 py-1 text-neutral-300"
              >
                <button type="button" onClick={() => startEdit(d)} title="Bu tarihi düzenle" className="hover:text-neutral-50 transition">
                  {y && m && day ? `${day}.${m}.${y}` : d}
                </button>
                <button
                  type="button"
                  onClick={() => onChange(dates.filter((x) => x !== d))}
                  title="Bu tarihi sil"
                  className="h-4 w-4 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-50 hover:bg-neutral-700 transition"
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        type="date"
        value={newDate}
        onChange={(e) => {
          setNewDate(e.target.value)
          commit(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          commit(newDate)
        }}
        className={`${inputClass} text-sm`}
      />
    </div>
  )
}
