import { useRef, useState } from 'react'
import { makeEntry, parseEntry } from '../lib/dateRange'

const inputClass =
  'w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm'

function fmt(iso: string): string {
  const [y, m, day] = iso.split('-')
  return y && m && day ? `${day}.${m}.${y}` : iso
}

// Çoklu Tarih (multidate) alanının ve bölüm bazlı izleme tiklerinin (SeasonsBrowser)
// ikisinin de kullandığı, tekrarı önlemek için ortak küçük düzenleyici: bir tarih dizisi
// (ISO "YYYY-MM-DD") artı kaldırılabilir kutucuklar + yeni tarih ekleme.
// `allowRange`: İzleme Tarihi gibi alanlarda bir tarihe BİTİŞ de eklenebilir ("başladım → bitirdim",
// kullanıcı Notion'daki end date mantığını istedi; bkz. lib/dateRange.ts). Bölüm tiklerinde yok.
export default function DateChipEditor({
  dates,
  onChange,
  autoFocus,
  allowRange = false,
}: {
  dates: string[]
  onChange: (dates: string[]) => void
  autoFocus?: boolean
  allowRange?: boolean
}) {
  const [newDate, setNewDate] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Bitişi eklenen/düzenlenen öğe (öğenin kendisi, ör. "2025-04-06" ya da "2025-04-06/2025-04-07")
  const [endFor, setEndFor] = useState<string | null>(null)
  const [endValue, setEndValue] = useState('')

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
    // Yeni eklenen tarihe hemen bitiş eklenebilsin (ör. "dün başladım, bugün bitirdim").
    if (allowRange) {
      setEndFor(v)
      setEndValue('')
    }
  }

  // Bitiş seçilince (anında) o öğe aralığa dönüşür; başlangıçla aynı gün seçilirse tek güne döner.
  function commitEnd(target: string, end: string) {
    if (!end) return
    const { start } = parseEntry(target)
    const next = makeEntry(start, end)
    onChange(dates.map((d) => (d === target ? next : d)).sort())
    setEndFor(null)
    setEndValue('')
  }

  function removeEnd(target: string) {
    onChange(dates.map((d) => (d === target ? parseEntry(d).start : d)).sort())
  }

  // Var olan bir tarihin YAZISINA (çarpıya değil) tıklayınca o tarihi listeden çıkarıp aşağıdaki
  // giriş kutusuna yükler, kutuya odaklanır — kullanıcı "girdiğim tarihi güncelleyemiyorum" dedi;
  // önceden tek yol "sil, sonra sıfırdan yeniden yaz"dı, artık tek tıkla düzenlemeye başlanıyor
  // (kutu zaten o tarihle dolu geldiği için sadece değiştirmek istediği gün/ay/yıl'ı değiştirir).
  function startEdit(d: string) {
    onChange(dates.filter((x) => x !== d))
    setNewDate(parseEntry(d).start)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="space-y-2">
      {dates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[...dates].sort().map((d) => {
            const e = parseEntry(d)
            return (
              <span
                key={d}
                className={`inline-flex items-center gap-1 text-xs border rounded-full pl-2.5 pr-1.5 py-1 text-neutral-300 ${
                  endFor === d ? 'bg-[#00c0fa]/10 border-[#00c0fa]/50' : 'bg-neutral-800 border-neutral-700'
                }`}
              >
                <button type="button" onClick={() => startEdit(d)} title="Başlangıç tarihini düzenle" className="hover:text-neutral-50 transition">
                  {fmt(e.start)}
                </button>
                {e.end && (
                  <>
                    <span className="text-neutral-500">→</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEndFor(d)
                        setEndValue(e.end!)
                      }}
                      title="Bitiş tarihini düzenle"
                      className="hover:text-neutral-50 transition"
                    >
                      {fmt(e.end)}
                    </button>
                  </>
                )}
                {allowRange && !e.end && endFor !== d && (
                  <button
                    type="button"
                    onClick={() => {
                      setEndFor(d)
                      setEndValue('')
                    }}
                    title="Bitiş tarihi ekle (ör. başladığın ve bitirdiğin gün farklıysa)"
                    className="text-neutral-500 hover:text-[#00c0fa] transition"
                  >
                    →
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (e.end && endFor === d ? removeEnd(d) : onChange(dates.filter((x) => x !== d)))}
                  title={e.end && endFor === d ? 'Bitişi kaldır' : 'Bu tarihi sil'}
                  className="h-4 w-4 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-50 hover:bg-neutral-700 transition"
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}

      {allowRange && endFor && dates.includes(endFor) && (
        <div className="rounded-lg border border-[#00c0fa]/30 bg-[#00c0fa]/5 p-2 space-y-1.5">
          <p className="text-[11px] text-neutral-400">
            {fmt(parseEntry(endFor).start)} tarihinde başladın — bitirdiğin gün farklıysa seç:
          </p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={endValue}
              min={parseEntry(endFor).start}
              onChange={(ev) => {
                setEndValue(ev.target.value)
                commitEnd(endFor, ev.target.value)
              }}
              className={`${inputClass} text-sm`}
            />
            <button
              type="button"
              onClick={() => {
                setEndFor(null)
                setEndValue('')
              }}
              className="shrink-0 text-xs text-neutral-400 hover:text-neutral-100"
            >
              Aynı gün
            </button>
          </div>
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
      {allowRange && <p className="text-[10px] text-neutral-600">Başladığın ve bitirdiğin gün farklıysa tarihin yanındaki → ile bitişini ekle.</p>}
    </div>
  )
}
