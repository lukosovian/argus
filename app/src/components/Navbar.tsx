import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useProfiles } from '../hooks/useProfiles'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useThemeMode } from '../hooks/useThemeMode'
import { sortByOrder } from './HomeSectionEditor'
import GlobalSearch from './GlobalSearch'
import RandomPickerButton from './RandomPickerButton'
import { gradientBorderStyle } from '../lib/theme'
import { APP_VERSION } from '../lib/version'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M20.4 14.7A8.5 8.5 0 1 1 9.3 3.6a7 7 0 0 0 11.1 11.1Z" />
    </svg>
  )
}

// Profil menüsündeki satırların ikonları — hepsi aynı 24'lük çizgi ikon kuralında.
function MenuIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d={d} />
    </svg>
  )
}
const ICONS = {
  ayarlar:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  istatistik: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  yardim: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  yama: 'M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3ZM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z',
}

function MenuLink({ to, icon, label, extra, onClick }: { to: string; icon: keyof typeof ICONS; label: string; extra?: React.ReactNode; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex items-center gap-3 mx-1.5 px-2.5 py-2 rounded-lg text-sm text-neutral-300 hover:text-neutral-50 hover:bg-neutral-800 transition">
      <span className="text-neutral-500">
        <MenuIcon d={ICONS[icon]} />
      </span>
      <span className="flex-1">{label}</span>
      {extra}
    </Link>
  )
}

export default function Navbar() {
  const { profiles, activeProfile, activeProfileId, setActiveProfileId } = useProfiles()
  const { settings } = useHomeSettings()
  const { theme, toggleTheme } = useThemeMode()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const activeSection = location.pathname === '/' ? searchParams.get('bolum') : null
  const isHome = location.pathname === '/' && !activeSection
  const pinnedSections = sortByOrder((settings.sections ?? []).filter((s) => s.pinnedToNav), settings.navOrder ?? [])
  const [menuOpen, setMenuOpen] = useState(false)
  const otherProfiles = profiles.filter((p) => p.id !== activeProfileId)

  // En üstteyken navbar saydam (altındaki vitrinin üzerinde durur), aşağı kayınca arkasında
  // içerik olduğu için okunaklı kalsın diye koyu bir zemine geçer.
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 4)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Bu bir SPA olduğu için sayfa/bölüm değiştiğinde tarayıcı kendiliğinden en başa sarmıyor —
  // aynı "/" rotasında kalıp sadece ?bolum= değişince (ya da tamamen başka bir sayfaya
  // geçilince) sayfa nerede kaldıysa orada kalıyordu. Üstteki menülerden birine tıklayınca
  // (Ana Sayfa, pinlenmiş bir bölüm, ya da profil menüsündeki diğer sayfalar) en üste atsın.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname, activeSection])

  return (
    <>
      <header
        className={`sticky top-0 z-20 transition-colors duration-300 ${
          scrolled ? 'bg-neutral-950/95 backdrop-blur-sm' : 'bg-transparent'
        }`}
      >
        <div className="px-3 sm:px-4 h-16 flex items-center gap-2 sm:gap-4">
          <Link to="/" className="flex items-center shrink-0">
            <img src="/logoblue-yatay.png" alt="ARGUS" className="h-7 sm:h-9 w-auto" />
          </Link>
          {/* Sayfa bağlantıları tek satırda kalıyor (telefonda "Ana Sayfa" iki satıra kayıyordu); sığmazsa
              yana kaydırılıyor. */}
          <nav className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {[{ id: null as string | null, name: 'Ana Sayfa', to: '/' }, ...pinnedSections.map((s) => ({ id: s.id as string | null, name: s.name, to: `/?bolum=${s.id}` }))].map((l) => {
              const active = l.id === null ? isHome : activeSection === l.id
              return (
                <Link
                  key={l.id ?? 'home'}
                  to={l.to}
                  style={active ? gradientBorderStyle() : undefined}
                  className={`shrink-0 whitespace-nowrap text-sm sm:text-base font-medium rounded-lg px-2.5 sm:px-3 py-1.5 transition border-[1.5px] ${
                    active ? 'text-white' : 'text-neutral-300 hover:text-neutral-50 border-transparent'
                  }`}
                >
                  {l.name}
                </Link>
              )
            })}
          </nav>

          <GlobalSearch />
          <RandomPickerButton />

          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={`h-10 w-10 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center text-sm text-neutral-400 ring-2 transition ${
                menuOpen ? 'ring-[#00c0fa]' : 'ring-neutral-700 hover:ring-neutral-500'
              }`}
              title={activeProfile?.username || 'Profil'}
            >
              {activeProfile?.photo ? (
                <img src={activeProfile.photo} alt={activeProfile.username} className="h-full w-full object-cover" />
              ) : (
                activeProfile?.username.slice(0, 1).toUpperCase() || '?'
              )}
            </button>

            {menuOpen && (
              <>
                {/* "Dışarı tıklayınca kapan" katmanı body'ye çiziliyor — header'ın içinde kalsaydı,
                    sayfa kaydırılınca header'a eklenen bulanıklık efekti yüzünden sadece header'ı
                    kaplıyordu (bkz. RandomPickerButton'daki not). z-[19]: header'ın (z-20) hemen
                    altında, böylece menünün kendisi tıklanabilir kalıyor. */}
                {createPortal(<div className="fixed inset-0 z-[19]" onClick={() => setMenuOpen(false)} />, document.body)}
                <div
                  className="absolute right-0 top-13 mt-1 z-40 w-72 bg-neutral-900 border border-neutral-800 rounded-2xl pb-1.5 shadow-2xl shadow-black/40 overflow-hidden"
                  style={{ animation: 'argus-toast-in .15s ease-out' }}
                >
                  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-800 bg-neutral-950/40">
                    <span className="h-11 w-11 rounded-full overflow-hidden bg-neutral-800 ring-2 ring-[#00c0fa]/60 shrink-0 flex items-center justify-center text-sm text-neutral-400">
                      {activeProfile?.photo ? (
                        <img src={activeProfile.photo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        activeProfile?.username.slice(0, 1).toUpperCase() || '?'
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-neutral-50 truncate">{activeProfile?.username || 'Profil'}</span>
                      <span className="block text-xs text-neutral-500">Şu an bu profildesin</span>
                    </span>
                  </div>

                  {otherProfiles.length > 0 && (
                    <div className="py-1.5 border-b border-neutral-800">
                      <p className="px-4 pt-1 pb-1.5 text-[11px] uppercase tracking-wide text-neutral-500">Profil değiştir</p>
                      {otherProfiles.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setActiveProfileId(p.id)
                            setMenuOpen(false)
                          }}
                          className="w-[calc(100%-0.75rem)] mx-1.5 flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-sm text-neutral-300 hover:text-neutral-50 hover:bg-neutral-800 transition"
                        >
                          <span className="h-8 w-8 rounded-full overflow-hidden bg-neutral-800 ring-1 ring-neutral-700 shrink-0 flex items-center justify-center text-[11px] text-neutral-400">
                            {p.photo ? <img src={p.photo} alt={p.username} className="h-full w-full object-cover" /> : p.username.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="truncate">{p.username}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="pt-1.5">
                    <MenuLink to="/arsivlerim" icon="ayarlar" label="Ayarlar" onClick={() => setMenuOpen(false)} />
                    <MenuLink to="/istatistikler" icon="istatistik" label="İstatistikler" onClick={() => setMenuOpen(false)} />
                    <MenuLink to="/yardim" icon="yardim" label="Yardım Merkezi" onClick={() => setMenuOpen(false)} />
                    <MenuLink
                      to="/yama-notlari"
                      icon="yama"
                      label="Yama Notları"
                      onClick={() => setMenuOpen(false)}
                      extra={<span className="text-[10px] font-medium text-[#00c0fa] bg-[#00c0fa]/10 rounded-full px-2 py-0.5">{APP_VERSION}</span>}
                    />
                  </div>

                  <div className="mx-3 mt-1.5 pt-2.5 border-t border-neutral-800">
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-950/60 border border-neutral-800 p-1">
                      {(['dark', 'light'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => theme !== t && toggleTheme()}
                          className={`flex items-center justify-center gap-1.5 text-xs rounded-lg py-1.5 transition ${
                            theme === t ? 'bg-neutral-800 text-neutral-50 ring-1 ring-[#00c0fa]/40' : 'text-neutral-500 hover:text-neutral-200'
                          }`}
                        >
                          {t === 'dark' ? <MoonIcon /> : <SunIcon />}
                          {t === 'dark' ? 'Koyu' : 'Açık'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  )
}
