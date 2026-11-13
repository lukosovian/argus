import { useCallback, useEffect, useRef, useState } from 'react'
import type { Profile } from '../types'
import { useProfiles } from '../hooks/useProfiles'
import { useToast } from '../hooks/useToast'
import ProfileSetupModal from './ProfileSetupModal'
import { tt } from '../lib/i18n'
import { MOBILE } from '../lib/mobile/ui'
import { averageColor, darkTone, type RGB } from '../lib/imageColor'
import MobileProfileHero, { LAST_PROFILE_KEY, useHeroSlides } from './mobile/MobileProfileHero'
import Icon from './Icon'
import { deviceOn } from '../lib/extras'
import { frameFor } from '../lib/profileStats'

// Ekstralar › Profil seçince avatar ekrana yayılsın (v1.23.4): tıklanan avatarın kopyası tam ekrana büyür, bulanıp
// solarken arkasında ana sayfa açılır (siyah perde yerine)
function morphFrom(el: HTMLElement | null, photo: string, done: () => void) {
  if (!el || !photo) return done()
  const r = el.getBoundingClientRect()
  const g = document.createElement('div')
  Object.assign(g.style, {
    position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', zIndex: '120', borderRadius: '12px', overflow: 'hidden',
    transition: 'all .7s cubic-bezier(.7,0,.2,1)', pointerEvents: 'none', backgroundImage: `url("${photo}")`, backgroundSize: 'cover', backgroundPosition: 'center',
  })
  document.body.appendChild(g)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const s = Math.max(window.innerWidth, window.innerHeight) * 1.3
      Object.assign(g.style, { left: (window.innerWidth - s) / 2 + 'px', top: (window.innerHeight - s) / 2 + 'px', width: s + 'px', height: s + 'px', borderRadius: '0', filter: 'blur(6px) brightness(.55)' })
    }),
  )
  setTimeout(() => {
    done()
    g.style.transition = 'opacity .8s ease-out'
    g.style.opacity = '0'
    setTimeout(() => g.remove(), 850)
  }, 720)
}

// Profil seçilince App.tsx'e "ekranı karanlıktan aç" haberi (Navbar'daki profil değiştirme de kullanır)
export const PROFILE_SWITCH_EVENT = 'argus-profil-gecis'
const LEAVE_MS = 450

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
  // Seçilen profil: kutusu hafifçe büyür, ekran kararır, sonra uygulama karanlıktan belirir (bkz. App.tsx ProfileCurtain)
  const [leaving, setLeaving] = useState<string | null>(null)

  function pick(id: string) {
    if (managing || leaving) return
    try {
      localStorage.setItem(LAST_PROFILE_KEY, id)
    } catch {
      /* önemli değil */
    }
    const go = () => {
      window.dispatchEvent(new Event(PROFILE_SWITCH_EVENT))
      setActiveProfileId(id)
      setLeaving(null)
      onClose?.()
    }
    if (embedded) return go()
    const prof = profiles.find((p) => p.id === id)
    if (!MOBILE && deviceOn('argus_profil_gecis') && prof?.photo && !prof.pin) {
      setLeaving(id)
      morphFrom(document.querySelector<HTMLElement>(`[data-profil-kutu="${id}"]`), prof.photo, () => {
        setActiveProfileId(id)
        setLeaving(null)
        onClose?.()
      })
      return
    }
    setLeaving(id)
    setTimeout(go, LEAVE_MS)
  }

  // Klavyeyle seçim: 1, 2, 3… sıradaki profil (Ayarlar'daki gömülü hali ve bir pencere açıkken değil)
  const pickRef = useRef(pick)
  pickRef.current = pick
  useEffect(() => {
    if (embedded || editing || managing) return
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > profiles.length) return
      e.preventDefault()
      pickRef.current(profiles[n - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [embedded, editing, managing, profiles])

  async function handleSave(data: { username: string; photo: string; pin?: string; kid?: boolean }) {
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
        leaving={leaving}
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

  // Ayarlar › Profil Ayarları sekmesi (bilgisayar ve telefon)
  if (embedded) {
    return <div className="flex flex-col items-center px-4 py-2">{content}</div>
  }

  // Bilgisayarda Netflix'in "Kim izliyor?" ekranı gibi: arkada ekranı kaplayan yapım görseli, sol altta logosu,
  // ortada altta profiller ve "Profil Yönetimi"
  return (
    <DesktopPicker
      profiles={profiles}
      managing={managing}
      leaving={leaving}
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
    </DesktopPicker>
  )
}

function DesktopPicker({
  profiles,
  managing,
  leaving,
  onPick,
  onAdd,
  onToggleManage,
  onClose,
  children,
}: {
  profiles: Profile[]
  managing: boolean
  leaving: string | null
  onPick: (id: string) => void
  onAdd: () => void
  onToggleManage: () => void
  onClose?: () => void
  children?: React.ReactNode
}) {
  // Bilgisayarda görsel daha yavaş değişsin (geniş ekranda sık değişmesi göz yorar)
  const { slides, index } = useHeroSlides(
    profiles.map((p) => p.id),
    8000,
  )
  const current = slides[index]
  const tile = 'relative h-32 w-32 rounded-lg overflow-hidden flex items-center justify-center transition duration-200'
  // Ekstralar › Kazanılan çerçeveler: çerçeveyi açmış profillerin izlediği sayısı (sunucudan)
  const [frames, setFrames] = useState<Record<string, number>>({})
  useEffect(() => {
    fetch('/api/profile-frames')
      .then((r) => (r.ok ? r.json() : {}))
      .then(setFrames)
      .catch(() => {})
  }, [])
  // Her profil resminin ortalama rengi — üstüne gelince o renkte parlasın
  const [glow, setGlow] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    for (const p of profiles)
      if (p.photo)
        averageColor(p.photo).then((c: RGB | null) => {
          if (alive && c) setGlow((g) => ({ ...g, [p.id]: `rgba(${c[0]},${c[1]},${c[2]},0.75)` }))
        })
    return () => {
      alive = false
    }
  }, [profiles])
  return (
    <div className="fixed inset-0 z-50 bg-neutral-950 overflow-hidden select-none">
      {slides.map((s, i) => (
        <img
          key={s.image + i}
          src={s.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms]"
          style={{ opacity: i === index ? 1 : 0 }}
        />
      ))}
      {/* Netflix'teki gibi sağa ve alta doğru kararan perde: yazılar ve profiller okunur kalsın */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.85) 100%)' }} />
      <div className="absolute inset-x-0 bottom-0 h-3/5 pointer-events-none bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-32 pointer-events-none bg-gradient-to-b from-black/60 to-transparent" />

      <img src="/logoblue-yatay.png" alt={tt('ARGUS')} className="absolute top-8 left-12 h-8 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]" />

      {current && (
        <div key={current.image} className="absolute left-12 bottom-10 max-w-[20vw] pointer-events-none" style={{ animation: 'argus-fade-in .8s ease-out' }}>
          {current.logo ? (
            <img src={current.logo} alt={current.title} className="max-h-24 max-w-full object-contain object-left drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]" />
          ) : (
            <p className="text-3xl font-bold text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
              {current.title}
            </p>
          )}
          {current.caption && (
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white/85" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
              <Icon name={current.icon} className="h-4 w-4" />
              {current.caption}
            </p>
          )}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-10" style={{ paddingTop: 0 }}>
        <h1 className="text-[32px] font-bold text-white mb-7" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}>
          {managing ? tt('Profil Yönetimi') : tt('Kim izliyor?')}
        </h1>
        <div className="flex flex-wrap justify-center gap-x-10 gap-y-6 max-w-[62vw] mb-14">
          {profiles.map((p) => (
            <button key={p.id} onClick={() => onPick(p.id)} className="w-32 flex flex-col items-center gap-4 group outline-none" style={{ ['--profil-isik' as string]: glow[p.id] ?? 'rgba(0,192,250,0.55)' }}>
              {/* Üstüne gelince yaylanarak kalkar ve resminin renginde parlar (v1.23.3, öneri G5) */}
              <span className="block rounded-[11px] p-[3px] -m-[3px]" style={frames[p.id] !== undefined ? frameFor(frames[p.id])?.style : undefined} title={frames[p.id] !== undefined ? frameFor(frames[p.id])?.label : undefined}>
              <span
                data-profil-kutu={p.id}
                className={`${tile} bg-white/10 ring-white group-hover:ring-[3px] group-focus-visible:ring-[3px] shadow-[0_6px_24px_rgba(0,0,0,0.5)] group-hover:shadow-[0_18px_50px_-8px_var(--profil-isik)] !duration-300 ease-[cubic-bezier(.3,1.5,.5,1)] ${leaving === p.id ? 'scale-115 ring-[3px]' : 'group-hover:scale-[1.07] group-hover:-translate-y-2'}`}
              >
                {p.photo ? <img src={p.photo} alt={p.username} className="h-full w-full object-cover" /> : <span className="text-5xl text-white/70">{p.username.slice(0, 1).toUpperCase()}</span>}
                {managing && (
                  <span className="absolute inset-0 bg-black/55 flex items-center justify-center text-white">
                    <PencilIcon />
                  </span>
                )}
              </span>
              </span>
              <span className="w-full truncate text-center text-[17px] font-semibold text-white/75 group-hover:text-white transition" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
                {p.username}
              </span>
            </button>
          ))}
          <button onClick={onAdd} className="w-32 flex flex-col items-center gap-4 group outline-none">
            <span className={`${tile} bg-black/40 backdrop-blur-sm border-2 border-dashed border-white/35 text-white/70 text-6xl font-light group-hover:border-white group-hover:text-white group-hover:scale-105`}>+</span>
            <span className="text-[17px] font-semibold text-white/75 group-hover:text-white transition" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
              {tt('Profil Ekle')}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleManage}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              managing ? 'bg-white text-black hover:bg-white/85' : 'border border-white/70 text-white bg-black/30 backdrop-blur-sm hover:bg-white/15'
            }`}
          >
            {!managing && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            )}
            {managing ? tt('Bitti') : tt('Profil Yönetimi')}
          </button>
          {onClose && (
            <button onClick={onClose} className="text-sm text-white/60 hover:text-white px-2">
              {tt('Vazgeç')}
            </button>
          )}
        </div>
      </div>
      {/* Profil seçilince ekran kararır */}
      <div className="absolute inset-0 z-40 bg-black pointer-events-none transition-opacity duration-300 delay-150" style={{ opacity: leaving ? 1 : 0 }} />
      {children}
    </div>
  )
}

// Telefonda Netflix uygulamasındaki gibi: arkada ekranı kaplayan, birkaç saniyede bir değişen yapım görseli (bkz.
// MobileProfileHero); altta görselin rengine bürünen, üstü kavisli bölümde "Profilini seç" ve 3 sütunlu kutular.
function MobilePicker({
  profiles,
  managing,
  leaving,
  onPick,
  onAdd,
  onToggleManage,
  onClose,
  children,
}: {
  profiles: Profile[]
  managing: boolean
  leaving: string | null
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
  const tint = rgb ? darkTone(rgb) : 'rgb(23,23,23)'
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
                <span className={`${tile} relative bg-white/10 transition-transform duration-300 ${managing ? 'ring-2 ring-white' : ''} ${leaving === p.id ? 'scale-110 ring-2 ring-white' : ''}`}>
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
      {/* Profil seçilince ekran kararır */}
      <div className="absolute inset-0 z-40 bg-black pointer-events-none transition-opacity duration-300 delay-150" style={{ opacity: leaving ? 1 : 0 }} />
      {children}
    </div>
  )
}
