import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api'
import { cleanupSymbol, hasFlatBackground, loadImage } from '../lib/imageCleanup'
import { useToast } from '../hooks/useToast'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import Select from './Select'
import { useEscape } from '../hooks/useEscape'

// Koleksiyon'da bir yapımın ya da rafın sembolünü değiştirme penceresi. Sembol: bilgisayardan dosya
// (sürükle-bırak da olur), panodan yapıştırma (Ctrl+V), internetteki bir görselin adresi ya da
// ARGUS'la gelen hazır sembollerden biri. Düz arka planlı görsellerde "Arka planı temizle" önerilir.
export const STARTER_SYMBOLS: { src: string; label: string }[] = [
  { src: '/semboller/delta.svg', label: 'Starfleet deltası' },
  { src: '/semboller/olum-yadigarlari.svg', label: 'Ölüm Yadigarları' },
  { src: '/semboller/tek-yuzuk.svg', label: 'Tek Yüzük' },
  { src: '/semboller/tron.svg', label: 'TRON diski' },
]

type Source = { kind: 'file'; file: File; preview: string } | { kind: 'path'; path: string }

export default function SymbolEditor({
  heading,
  subheading,
  current,
  fallback,
  name,
  shelf,
  onSave,
  onOpenDetail,
  onDelete,
  onClose,
}: {
  heading: string
  subheading?: string
  // Şu anki sembol (yoksa null) ve sembol yokken görünen (logo / raf varsayılanı)
  current: string | null
  fallback: string | null
  // Raf düzenlerken: raf adı
  name?: { value: string; placeholder: string }
  // Yapım düzenlerken: hangi rafta
  shelf?: { value: string; options: { value: string; label: string }[] }
  onSave: (r: { image: string | null | undefined; name?: string; shelf?: string }) => Promise<void>
  onOpenDetail?: () => void
  // Elle oluşturulan rafı kaldırma (sol altta kırmızı düğme)
  onDelete?: { label: string; run: () => Promise<void> }
  onClose: () => void
}) {
  const { notify } = useToast()
  const [source, setSource] = useState<Source | null>(null)
  const [removed, setRemoved] = useState(false)
  const [cleanBg, setCleanBg] = useState(false)
  const [flat, setFlat] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [nameValue, setNameValue] = useState(name?.value ?? '')
  const [shelfValue, setShelfValue] = useState(shelf?.value ?? '')
  const [newShelf, setNewShelf] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const previewSrc = source ? (source.kind === 'file' ? source.preview : source.path) : removed ? null : current
  const shown = previewSrc ?? fallback

  // Esc: sadece en üstteki pencere kapanır (bkz. hooks/useEscape)
  useEscape(true, onClose)

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) {
        e.preventDefault()
        pickFile(file)
        return
      }
      const text = e.clipboardData?.getData('text')?.trim()
      if (text && /^https?:\/\//i.test(text) && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        setUrl(text)
        fetchUrl(text)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('paste', onPaste)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  // Yeni seçilen görselde düz arka plan var mı? Varsa temizleme kendiliğinden açık gelsin.
  useEffect(() => {
    if (!source) return
    let alive = true
    const src = source.kind === 'file' ? source.preview : source.path
    if (src.endsWith('.svg')) {
      setFlat(false)
      setCleanBg(false)
      return
    }
    loadImage(src)
      .then((img) => {
        if (!alive) return
        const f = hasFlatBackground(img)
        setFlat(f)
        setCleanBg(f)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [source])

  function pickFile(file: File) {
    if (!file.type.startsWith('image/')) {
      notify('Bu bir görsel dosyası değil.', 'danger')
      return
    }
    setRemoved(false)
    setSource({ kind: 'file', file, preview: URL.createObjectURL(file) })
  }

  async function fetchUrl(u = url) {
    if (!u.trim()) return
    setBusy('url')
    try {
      const { filename } = await api.medyaFromUrl(u.trim())
      setRemoved(false)
      setSource({ kind: 'path', path: `/medya/${filename}` })
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Görsel getirilemedi.', 'danger')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setBusy('save')
    try {
      let image: string | null | undefined = undefined
      if (source) {
        const src = source.kind === 'file' ? source.preview : source.path
        if (cleanBg && flat) {
          const blob = await cleanupSymbol(await loadImage(src), true)
          const { filename } = await api.uploadMedya(new File([blob], `sembol_${Date.now().toString(36)}.png`, { type: 'image/png' }))
          image = `/medya/${filename}`
        } else if (source.kind === 'file') {
          const { filename } = await api.uploadMedya(source.file)
          image = `/medya/${filename}`
        } else image = source.path
      } else if (removed) image = null
      await onSave({
        image,
        name: name ? nameValue.trim() : undefined,
        shelf: shelf ? (shelfValue === '__yeni' ? newShelf.trim() : shelfValue) : undefined,
      })
      onClose()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Kaydedilemedi.', 'danger')
    } finally {
      setBusy(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/80 overflow-y-auto py-8 px-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl mx-auto bg-neutral-900 rounded-2xl border border-neutral-800 p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Kapat" className="absolute top-4 right-4 h-9 w-9 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-lg">
          ×
        </button>
        <h2 className="text-xl font-bold text-neutral-50 pr-10">{heading}</h2>
        {subheading && <p className="text-sm text-neutral-500 mt-0.5">{subheading}</p>}

        <div className="grid sm:grid-cols-[220px_1fr] gap-5 mt-5">
          {/* Önizleme — koleksiyondaki gibi koyu, üstten ışıklı */}
          <div>
            <div
              className="aspect-square rounded-2xl border border-neutral-800 flex items-center justify-center p-6 overflow-hidden"
              style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.10), transparent 70%), #0a0a0a' }}
            >
              {shown ? (
                <img src={shown} alt="" className={`max-h-full max-w-full object-contain ${previewSrc ? 'drop-shadow-[0_0_18px_rgba(255,255,255,0.18)]' : 'opacity-60'}`} />
              ) : (
                <span className="text-sm text-neutral-600">Sembol yok</span>
              )}
            </div>
            <p className="text-[11px] text-neutral-500 mt-2 text-center">{previewSrc ? (source ? 'Yeni sembol (kaydedince yerleşir)' : 'Şu anki sembol') : 'Sembol yok — logosu görünüyor'}</p>
            {flat && source && (
              <label className="mt-2 flex items-start gap-2 text-xs text-neutral-300 cursor-pointer select-none">
                <input type="checkbox" checked={cleanBg} onChange={(e) => setCleanBg(e.target.checked)} className="mt-0.5 accent-[#00c0fa]" />
                <span>
                  Arka planı temizle
                  <span className="block text-neutral-500">Görselin düz bir arka planı var; kaydederken silinir.</span>
                </span>
              </label>
            )}
            {(current || source) && !removed && (
              <button
                onClick={() => {
                  setSource(null)
                  setRemoved(true)
                }}
                className="mt-2 w-full text-xs text-red-400 hover:text-red-300"
              >
                Sembolü kaldır
              </button>
            )}
          </div>

          <div className="space-y-4 min-w-0">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
                if (file) pickFile(file)
                else {
                  const u = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text')
                  if (u && /^https?:\/\//i.test(u.trim())) {
                    setUrl(u.trim())
                    fetchUrl(u.trim())
                  }
                }
              }}
              onClick={() => fileRef.current?.click()}
              className={`rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer transition ${dragOver ? 'border-[#00c0fa] bg-[#00c0fa]/10' : 'border-neutral-700 hover:border-neutral-500'}`}
            >
              <p className="text-sm text-neutral-200">Görseli buraya sürükle ya da tıklayıp seç</p>
              <p className="text-xs text-neutral-500 mt-1">Kopyaladığın bir görseli Ctrl+V ile de yapıştırabilirsin</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) pickFile(f)
                  e.target.value = ''
                }}
              />
            </div>

            <div>
              <p className="text-xs text-neutral-400 mb-1.5">ya da internetteki görselin adresi</p>
              <div className="flex gap-2">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchUrl()}
                  placeholder="https://.../sembol.png"
                  className="flex-1 min-w-0 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]"
                />
                <button onClick={() => fetchUrl()} disabled={!url.trim() || busy === 'url'} className="text-sm rounded-lg px-3 border border-neutral-700 text-neutral-200 hover:border-[#00c0fa] disabled:opacity-40">
                  {busy === 'url' ? 'Getiriliyor…' : 'Getir'}
                </button>
              </div>
              <p className="text-[11px] text-neutral-600 mt-1">Görsele sağ tıklayıp "Resim adresini kopyala" dediğin adres.</p>
            </div>

            <div>
              <p className="text-xs text-neutral-400 mb-1.5">ya da hazır sembollerden</p>
              <div className="flex flex-wrap gap-2">
                {STARTER_SYMBOLS.map((s) => (
                  <button
                    key={s.src}
                    title={s.label}
                    onClick={() => {
                      setRemoved(false)
                      setSource({ kind: 'path', path: s.src })
                    }}
                    className="h-14 w-14 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-[#00c0fa] p-2 transition"
                  >
                    <img src={s.src} alt={s.label} className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            </div>

            {name && (
              <div>
                <p className="text-xs text-neutral-400 mb-1.5">Raf adı</p>
                <input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  placeholder={name.placeholder}
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]"
                />
              </div>
            )}

            {shelf && (
              <div>
                <p className="text-xs text-neutral-400 mb-1.5">Hangi rafta?</p>
                <Select value={shelfValue} onChange={setShelfValue} options={[...shelf.options, { value: '__yeni', label: '+ Yeni raf…' }]} />
                {shelfValue === '__yeni' && (
                  <input
                    autoFocus
                    value={newShelf}
                    onChange={(e) => setNewShelf(e.target.value)}
                    placeholder="Yeni rafın adı (ör. Marvel)"
                    className="mt-2 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
          {onOpenDetail ? (
            <button onClick={onOpenDetail} className="text-sm text-[#00c0fa] hover:underline">
              Detayını aç
            </button>
          ) : onDelete ? (
            <button
              onClick={async () => {
                setBusy('delete')
                try {
                  await onDelete.run()
                  onClose()
                } catch (e) {
                  notify(e instanceof Error ? e.message : 'Kaldırılamadı.', 'danger')
                } finally {
                  setBusy(null)
                }
              }}
              disabled={busy === 'delete'}
              className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              {onDelete.label}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm rounded-lg px-4 py-2 text-neutral-300 hover:bg-neutral-800">
              Vazgeç
            </button>
            <button
              onClick={save}
              disabled={busy === 'save' || (shelfValue === '__yeni' && !newShelf.trim())}
              style={primaryButtonStyle}
              className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON} disabled:opacity-50`}
            >
              {busy === 'save' ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
