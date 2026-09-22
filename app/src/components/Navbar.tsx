import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
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
        <div className="px-4 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center shrink-0">
            <img src="/logoblue-yatay.png" alt="ARGUS" className="h-9 w-auto" />
          </Link>
          <Link
            to="/"
            style={isHome ? gradientBorderStyle() : undefined}
            className={`text-base rounded-lg px-3 py-1.5 transition border-[1.5px] ${
              isHome ? 'text-white' : 'text-neutral-300 hover:text-neutral-50 border-transparent'
            }`}
          >
            Ana Sayfa
          </Link>
          {pinnedSections.map((s) => (
            <Link
              key={s.id}
              to={`/?bolum=${s.id}`}
              style={activeSection === s.id ? gradientBorderStyle() : undefined}
              className={`text-base rounded-lg px-3 py-1.5 transition border-[1.5px] ${
                activeSection === s.id ? 'text-white' : 'text-neutral-300 hover:text-neutral-50 border-transparent'
              }`}
            >
              {s.name}
            </Link>
          ))}
          <div className="flex-1" />

          <GlobalSearch />
          <RandomPickerButton />

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="h-12 w-12 rounded-lg bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center text-sm text-neutral-400 hover:border-neutral-500 transition shrink-0"
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
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-14 z-40 w-56 bg-neutral-900 border border-neutral-800 rounded-xl py-1 shadow-lg">
                  <p className="px-3 py-2 text-sm text-neutral-100 font-medium border-b border-neutral-800 truncate">
                    {activeProfile?.username || 'Profil'}
                  </p>

                  {otherProfiles.length > 0 && (
                    <div className="py-1 border-b border-neutral-800">
                      {otherProfiles.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setActiveProfileId(p.id)
                            setMenuOpen(false)
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition"
                        >
                          <span className="h-8 w-8 rounded-full overflow-hidden bg-neutral-800 border border-neutral-700 shrink-0 flex items-center justify-center text-[11px] text-neutral-400">
                            {p.photo ? (
                              <img src={p.photo} alt={p.username} className="h-full w-full object-cover" />
                            ) : (
                              p.username.slice(0, 1).toUpperCase()
                            )}
                          </span>
                          <span className="truncate">{p.username}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <Link
                    to="/arsivlerim"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition"
                  >
                    Ayarlar
                  </Link>
                  <Link
                    to="/istatistikler"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition"
                  >
                    İstatistikler
                  </Link>
                  <Link
                    to="/yardim"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition"
                  >
                    Yardım Merkezi
                  </Link>
                  <Link
                    to="/yama-notlari"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition"
                  >
                    Yama Notları
                    <span className="text-[10px] text-neutral-600 ml-auto">{APP_VERSION}</span>
                  </Link>
                  <button
                    onClick={toggleTheme}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition border-t border-neutral-800"
                  >
                    {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                    {theme === 'light' ? 'Koyu Tema' : 'Açık Tema'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  )
}
