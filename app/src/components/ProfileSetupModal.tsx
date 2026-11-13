import { useRef, useState } from 'react'
import type { Profile } from '../types'
import { PRESET_AVATARS } from '../types'
import { fileToCompressedDataUrl } from '../lib/imageUtils'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import { tt } from '../lib/i18n'
import { useEscape } from '../hooks/useEscape'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useProfiles } from '../hooks/useProfiles'
import ToggleSwitch from './ToggleSwitch'
import { ArchivePick, AvatarTabs, CropEditor } from './AvatarExtras'

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
  onSave: (data: { username: string; photo: string; pin?: string; kid?: boolean }) => void | Promise<void>
  onCancel?: () => void
  onDelete?: () => void
}) {
  const [username, setUsername] = useState(profile?.username ?? '')
  const [photo, setPhoto] = useState(profile?.photo ?? '')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // v1.23.4: PIN ve çocuk profili; Ekstralar'dan açılan avatar sekmeleri ve kırpma (düzenlenen profil aktif profilse)
  const [pin, setPin] = useState(profile?.pin ?? '')
  const [kid, setKid] = useState(Boolean(profile?.kid))
  const { settings } = useHomeSettings()
  const { activeProfileId } = useProfiles()
  const own = !profile || profile.id === activeProfileId
  const ext = own ? (settings.extras ?? {}) : {}
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  useEscape(!!onCancel, () => onCancel?.())

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (ext.avatarCrop) {
      setCropSrc(await fileToCompressedDataUrl(file, 1400, 0.9))
      e.target.value = ''
      return
    }
    const dataUrl = await fileToCompressedDataUrl(file, 200, 0.8)
    setPhoto(dataUrl)
  }

  async function handleSave() {
    if (!username.trim() || (pin && !/^\d{4}$/.test(pin))) return
    setBusy(true)
    if (pin && !/^\d{4}$/.test(pin)) {
      setBusy(false)
      return
    }
    await onSave({ username: username.trim(), photo, pin: pin || '', kid })
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
          <h2 className="text-lg font-semibold text-neutral-50">{profile ? tt('Profili Düzenle') : tt('Profil Oluştur')}</h2>
          {onCancel && (
            <button
              onClick={onCancel}
              aria-label={tt('Kapat')}
              className="h-8 w-8 shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-500 flex items-center justify-center text-neutral-400 hover:text-neutral-50 text-lg leading-none transition"
            >
              ×
            </button>
          )}
        </div>
        <p className="text-neutral-500 text-sm mb-5">{tt('Bir kullanıcı adı ve istersen bir profil fotoğrafı seç.')}</p>

        <div className="flex flex-col items-center mb-6">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="h-24 w-24 rounded-xl bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center text-neutral-500 text-xs hover:border-neutral-500 transition"
          >
            {photo ? <img src={photo} alt={tt('Profil')} className="h-full w-full object-cover" /> : tt('Fotoğraf Seç')}
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
        </div>

        {cropSrc && (
          <CropEditor
            src={cropSrc}
            onCancel={() => setCropSrc(null)}
            onDone={(d) => {
              setPhoto(d)
              setCropSrc(null)
            }}
          />
        )}
        {ext.avatarCrop && !cropSrc && <ArchivePick onPick={(src) => setCropSrc(src)} />}

        <p className="text-sm text-neutral-400 mb-3">{tt('ya da hazır bir avatar seç')}</p>
        {ext.avatarTabs ? <AvatarTabs photo={photo} setPhoto={setPhoto} /> : <div className="grid grid-cols-6 gap-3 mb-6">
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
        </div>}

        <label className="block text-xs text-neutral-400 mb-1">{tt('Kullanıcı adı')}</label>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder={tt('Kullanıcı adın')}
          className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-[#00c0fa] text-sm mb-5"
        />

        <div className="grid grid-cols-2 gap-3 mb-5">
          <label className="block">
            <span className="block text-xs text-neutral-400 mb-1">{tt('PIN (isteğe bağlı, 4 rakam)')}</span>
            <input
              value={pin}
              inputMode="numeric"
              maxLength={4}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className={`w-full rounded-lg bg-neutral-800 border px-3 py-2 text-neutral-100 outline-none text-sm tracking-[0.4em] ${pin && pin.length !== 4 ? 'border-amber-500' : 'border-neutral-700 focus:border-[#00c0fa]'}`}
            />
          </label>
          <div className="flex items-end justify-between gap-2 pb-1">
            <span className="text-sm text-neutral-300">
              {tt('Çocuk profili')}
              <span className="block text-[11px] text-neutral-500">{tt('13+ ve üstü yapımlar görünmez')}</span>
            </span>
            <ToggleSwitch checked={kid} onChange={setKid} label={tt('Çocuk profili')} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!username.trim() || busy}
            style={primaryButtonStyle}
            className={`flex-1 rounded-lg py-2 text-sm ${PRIMARY_BUTTON}`}
          >
            {busy ? tt('Kaydediliyor...') : tt('Kaydet')}
          </button>
          {onDelete && (
            <button onClick={onDelete} className="text-rose-400 hover:text-rose-300 text-sm px-2">
              {tt('Profili Sil')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
