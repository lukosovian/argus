import { useRef, useState } from 'react'

// Tarayıcının çıplak "Dosya Seç" düğmesi yerine: tıklanabilir ya da üzerine dosya sürüklenip
// bırakılabilen kesik çizgili bir alan (İçe Aktar'daki CSV ve görsel seçimleri).
export default function FileDrop({
  accept,
  multiple = false,
  title,
  hint,
  selectedText,
  onFiles,
}: {
  accept: string
  multiple?: boolean
  title: string
  hint?: string
  // Seçim yapıldıysa gösterilecek kısa bilgi (ör. "✓ 124 dosya seçildi").
  selectedText?: string
  onFiles: (files: FileList) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files)
      }}
      className={`cursor-pointer rounded-2xl border-2 border-dashed px-5 py-7 text-center transition ${
        over ? 'border-[#00c0fa] bg-[#00c0fa]/10' : 'border-neutral-700 hover:border-[#00c0fa]/50 bg-neutral-900/40'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files)
        }}
      />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 mx-auto text-[#00c0fa] mb-2">
        <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      <p className="text-sm font-medium text-neutral-100">{title}</p>
      {hint && <p className="text-xs text-neutral-500 mt-1">{hint}</p>}
      {selectedText && <p className="text-sm text-emerald-400 mt-2">{selectedText}</p>}
    </div>
  )
}
