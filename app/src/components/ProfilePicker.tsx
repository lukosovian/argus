import { useCallback, useEffect, useRef, useState } from 'react'
import type { Profile } from '../types'
import { useProfiles } from '../hooks/useProfiles'
import { useToast } from '../hooks/useToast'
import ProfileSetupModal from './ProfileSetupModal'
import { tt } from '../lib/i18n'
import { MOBILE } from '../lib/mobile/ui'
import MobileProfileHero, { LAST_PROFILE_KEY } from './mobile/MobileProfileHero'

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

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
    if (MOBILE) localStorage.setItem(LAST_PROFILE_KEY, id)
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
      message: tt('"{0}" profilini silmek istediğine emin misin? Bu profile ait tüm arşivler ve kayıtlar da silinir.', profile.username),
      confirmLabel: tt('Sil'),
      tone: 'danger',
    })
    if (!ok) return
    await removeProfile(profile.id)
    setEditing(null)
    notify(tt('"{0}" profili silindi.', profile.username), 'success')
  }

  const content = (
    <>
      {!embedded && (
        <>
          <img src="/logoblue.png" alt={tt('ARGUS')} className="h-16 w-16 mb-6" />
          <h1 className="text-3xl md:text-4xl font-semibold text-neutral-50 mb-8">{tt('Kim izliyor?')}</h1>
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
                  {tt('Düzenle')}
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
          <span className="text-base text-neutral-400">{tt('Profil Ekle')}</span>
        </button>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => setManaging((v) => !v)}
          className="text-sm text-neutral-400 hover:text-neutral-50 border border-neutral-700 hover:border-neutral-500 rounded-lg px-4 py-2 transition"
        >
          {managing ? tt('Bitti') : tt('Profilleri Yönet')}
        </button>
        {onClose && (
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-300 px-2">
            {tt('Vazgeç')}
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

  // Telefonda Netflix uygulamasındaki gibi: üstte büyük afiş, altta "Profilini seç" ve 3 sütunlu profil kutuları
  if (MOBILE && !embedded) {
    return (
      <MobilePicker
        profiles={profiles}
        managing={managing}
        onPick={(id) => (managing ? setEditing(profiles.find((x) => x.id === id) ?? null) : pick(id))}
        onAdd={() => setEditing('new')}
        onToggleManage={() => setManaging((v) => !v)}
        onClose={onClose}
      >
        {editing && (
          <ProfileSetupModal
            profile={editing === 'new' ? undefined : editing}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
            onDelete={editing !== 'new' && profiles.length > 1 ? handleDelete : undefined}
          />
        )}
      </MobilePicker>
    )
  }

  if (embedded) {
    return <div className="flex flex-col items-center px-4 py-2">{content}</div>
  }

  return <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center px-4">{content}</div>
}

// Telefonda Netflix uygulamasındaki gibi: arkada ekranı kaplayan, birkaç saniyede bir değişen yapım görseli (bkz.
// MobileProfileHero); altta görselin rengine bürünen, üstü kavisli bölümde "Profilini seç" ve 3 sütunlu kutular.
// Görselin baskın renginden koyu ama canlı bir ton (HSL: doygunluk artırılır, açıklık sabit düşük)
function tintOf([r, g, b]: [number, number, number]): string {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  const d = max - min
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return `hsl(${Math.round(h)}, ${Math.round(Math.min(0.75, s * 1.6) * 100)}%, 15%)`
}

function MobilePicker({
  profiles,
  managing,
  onPick,
  onAdd,
  onToggleManage,
  onClose,
  children,
}: {
  profiles: Profile[]
  managing: boolean
  onPick: (id: string) => void
  onAdd: () => void
  onToggleManage: () => void
  onClose?: () => void
  children?: React.ReactNode
}) {
  const [rgb, setRgb] = useState<[number, number, number] | null>(null)
  const [panelH, setPanelH] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = panel.current
    if (!el) return
    const ro = new ResizeObserver(() => setPanelH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const onColor = useCallback((c: [number, number, number] | null) => setRgb(c), [])
  // Görselin renginin koyusu (Netflix'teki gibi alt bölüm görselle aynı renk ailesinde)
  const tint = rgb ? tintOf(rgb) : 'rgb(23,23,23)'
  const tile = 'w-full aspect-square rounded-lg overflow-hidden flex items-center justify-center'
  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden" style={{ ['--profil-panel' as string]: `${panelH}px` }}>
      <MobileProfileHero profileIds={profiles.map((p) => p.id)} onColor={onColor} />
      {/* Görsel alttaki bölümün rengine yumuşakça geçsin */}
      <div className="absolute inset-x-0 pointer-events-none transition-[background] duration-1000" style={{ bottom: panelH, height: '38%', background: `linear-gradient(to top, ${tint}, transparent)` }} />
      <div ref={panel} className="absolute inset-x-0 bottom-0 transition-colors duration-1000" style={{ background: tint }}>
        {/* Üstteki kavis */}
        <div className="absolute -top-7 -inset-x-[15%] h-16 rounded-[50%] transition-colors duration-1000" style={{ background: tint }} />
        <div className="relative px-7 pt-1" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.75rem)' }}>
          <p className="text-center text-[15px] text-white/70 mb-4">{managing ? tt('Düzenlemek istediğin profile dokun') : tt('Profilini seç')}</p>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            {profiles.map((p) => (
              <button key={p.id} onClick={() => onPick(p.id)} className="flex flex-col items-center gap-2 min-w-0 active:scale-95 transition-transform">
                <span className={`${tile} relative bg-white/10 ${managing ? 'ring-2 ring-white' : ''}`}>
                  {p.photo ? <img src={p.photo} alt={p.username} className="h-full w-full object-cover" /> : <span className="text-3xl text-white/70">{p.username.slice(0, 1).toUpperCase()}</span>}
                  {managing && (
                    <span className="absolute inset-0 bg-black/55 flex items-center justify-center text-white">
                      <PencilIcon />
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center text-[15px] font-semibold text-white">{p.username}</span>
              </button>
            ))}
            <button onClick={onAdd} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
              <span className={`${tile} bg-white/15 text-white/85 text-4xl font-light`}>+</span>
              <span className="text-[15px] font-semibold text-white">{tt('Profil Ekle')}</span>
            </button>
            <button onClick={onToggleManage} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
              <span className={`${tile} ${managing ? 'bg-white text-black' : 'bg-white/15 text-white/85'}`}>
                <PencilIcon />
              </span>
              <span className="text-[15px] font-semibold text-white">{managing ? tt('Bitti') : tt('Düzenle')}</span>
            </button>
          </div>
          {onClose && (
            <button onClick={onClose} className="mt-5 w-full text-sm text-white/60">
              {tt('Vazgeç')}
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
