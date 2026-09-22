import { useState } from 'react'
import type { Profile } from '../types'
import { useProfiles } from '../hooks/useProfiles'
import { useToast } from '../hooks/useToast'
import ProfileSetupModal from './ProfileSetupModal'

// Netflix'teki "Kim izliyor?" ekranı — birden fazla profil arasından seçim yapılır.
// `onClose` verilmezse (App.tsx'teki zorunlu ilk-açılış kapısı gibi) kapatma butonu
// gösterilmez: en az bir profil seçilene/oluşturulana kadar ekranda kalır.
// `embedded` true olduğunda (Ayarlar sayfasının "Profil Ayarları" sekmesi) tam ekran
// overlay/logo/başlık kalkar, sadece kart grid'i + ekle/düzenle/sil mantığı kalır — profil
// seçme/değiştirme davranışı (aynı bileşen) burada da birebir aynı şekilde çalışır.
export default function ProfilePicker({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const { profiles, activeProfileId, setActiveProfileId, addProfile, updateProfile, removeProfile } = useProfiles()
  const { confirm, notify } = useToast()
  const [managing, setManaging] = useState(false)
  const [editing, setEditing] = useState<Profile | 'new' | null>(null)

  function pick(id: string) {
    if (managing) return
    setActiveProfileId(id)
    onClose?.()
  }

  async function handleSave(data: { username: string; photo: string }) {
    if (editing === 'new') {
      const created = await addProfile(data)
      setEditing(null)
      // Yeni oluşturulan profil, ilk profilse ya da hiç aktif profil yoksa otomatik seçilsin.
      if (!activeProfileId) {
        setActiveProfileId(created.id)
        onClose?.()
      }
    } else if (editing) {
      await updateProfile(editing.id, data)
      setEditing(null)
    }
  }

  // Silme doğrudan değil, önce uygulama içi bildirim (sağ altta beliren kart) üzerinden
  // onay sorar — tarayıcının `confirm` pop-up'ı bilerek kullanılmıyor. Profilin klasörü
  // sunucuda tamamen siliniyor (arşivleri/kayıtları dahil), o yüzden metinde bu da yazıyor.
  async function handleDelete() {
    if (!editing || editing === 'new') return
    const profile = editing
    const ok = await confirm({
      message: `"${profile.username}" profilini silmek istediğine emin misin? Bu profile ait tüm arşivler ve kayıtlar da silinir.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    })
    if (!ok) return
    await removeProfile(profile.id)
    setEditing(null)
    notify(`"${profile.username}" profili silindi.`, 'success')
  }

  const content = (
    <>
      {!embedded && (
        <>
          <img src="/logoblue.png" alt="ARGUS" className="h-16 w-16 mb-6" />
          <h1 className="text-3xl md:text-4xl font-semibold text-neutral-50 mb-8">Kim izliyor?</h1>
        </>
      )}

      <div className="flex flex-wrap justify-center gap-7 max-w-3xl mb-10">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => (managing ? setEditing(p) : pick(p.id))}
            className="w-36 flex flex-col items-center gap-3 group"
          >
            <div
              className={`relative h-36 w-36 rounded-xl overflow-hidden bg-neutral-800 border-2 transition ${
                managing ? 'border-[#00c0fa]' : 'border-transparent group-hover:border-neutral-500'
              }`}
            >
              {p.photo ? (
                <img src={p.photo} alt={p.username} className="h-full w-full object-cover" />
              ) : (
                <span className="h-full w-full flex items-center justify-center text-4xl text-neutral-500">
                  {p.username.slice(0, 1).toUpperCase()}
                </span>
              )}
              {managing && (
                <span className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-sm font-medium">
                  Düzenle
                </span>
              )}
            </div>
            <span className="text-base text-neutral-300 truncate w-full text-center">{p.username}</span>
          </button>
        ))}

        <button onClick={() => setEditing('new')} className="w-36 flex flex-col items-center gap-3 group">
          <div className="h-36 w-36 rounded-xl bg-neutral-900 border-2 border-dashed border-neutral-700 flex items-center justify-center text-neutral-500 text-5xl group-hover:border-neutral-500 group-hover:text-neutral-300 transition">
            +
          </div>
          <span className="text-base text-neutral-400">Profil Ekle</span>
        </button>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => setManaging((v) => !v)}
          className="text-sm text-neutral-400 hover:text-neutral-50 border border-neutral-700 hover:border-neutral-500 rounded-lg px-4 py-2 transition"
        >
          {managing ? 'Bitti' : 'Profilleri Yönet'}
        </button>
        {onClose && (
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-300 px-2">
            Vazgeç
          </button>
        )}
      </div>

      {editing && (
        <ProfileSetupModal
          profile={editing === 'new' ? undefined : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          onDelete={editing !== 'new' && profiles.length > 1 ? handleDelete : undefined}
        />
      )}
    </>
  )

  if (embedded) {
    return <div className="flex flex-col items-center px-4 py-2">{content}</div>
  }

  return <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center px-4">{content}</div>
}
