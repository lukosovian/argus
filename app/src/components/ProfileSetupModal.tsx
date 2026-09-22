import { useRef, useState } from 'react'
import type { Profile } from '../types'
import { PRESET_AVATARS } from '../types'
import { fileToCompressedDataUrl } from '../lib/imageUtils'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'

// `profile` dışarıdan (zaten yüklenmiş bir listeden) veriliyor — bileşenin kendisi profili
// asenkron çekmiyor, bu yüzden "veri daha gelmeden boş state ile mount olma" hatası
// (kullanıcı adı/fotoğraf görünmüyordu şikayeti) burada yapısal olarak oluşmuyor.
export default function ProfileSetupModal({
  profile,
  onSave,
  onCancel,
  onDelete,
}: {
  profile?: Profile
  onSave: (data: { username: string; photo: string }) => void | Promise<void>
  onCancel?: () => void
  onDelete?: () => void
}) {
  const [username, setUsername] = useState(profile?.username ?? '')
  const [photo, setPhoto] = useState(profile?.photo ?? '')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await fileToCompressedDataUrl(file, 200, 0.8)
    setPhoto(dataUrl)
  }

  async function handleSave() {
    if (!username.trim()) return
    setBusy(true)
    await onSave({ username: username.trim(), photo })
    setBusy(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={() => onCancel?.()}
    >
      <div
        className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-neutral-50">{profile ? 'Profili Düzenle' : 'Profil Oluştur'}</h2>
          {onCancel && (
            <button
              onClick={onCancel}
              aria-label="Kapat"
              className="h-8 w-8 shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-500 flex items-center justify-center text-neutral-400 hover:text-neutral-50 text-lg leading-none transition"
            >
              ×
            </button>
          )}
        </div>
        <p className="text-neutral-500 text-sm mb-5">Bir kullanıcı adı ve istersen bir profil fotoğrafı seç.</p>

        <div className="flex flex-col items-center mb-6">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="h-24 w-24 rounded-xl bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center text-neutral-500 text-xs hover:border-neutral-500 transition"
          >
            {photo ? <img src={photo} alt="Profil" className="h-full w-full object-cover" /> : 'Fotoğraf Seç'}
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
        </div>

        <p className="text-sm text-neutral-400 mb-3">ya da hazır bir avatar seç</p>
        <div className="grid grid-cols-6 gap-3 mb-6">
          {PRESET_AVATARS.map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setPhoto(src)}
              className={`aspect-square rounded-xl overflow-hidden border-2 transition ${
                photo === src ? 'border-[#00c0fa]' : 'border-transparent hover:border-neutral-600'
              }`}
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        <label className="block text-xs text-neutral-400 mb-1">Kullanıcı adı</label>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="Kullanıcı adın"
          className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-[#00c0fa] text-sm mb-5"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!username.trim() || busy}
            style={primaryButtonStyle}
            className={`flex-1 rounded-lg py-2 text-sm ${PRIMARY_BUTTON}`}
          >
            {busy ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          {onDelete && (
            <button onClick={onDelete} className="text-rose-400 hover:text-rose-300 text-sm px-2">
              Profili Sil
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
