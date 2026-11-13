import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useProfiles } from '../hooks/useProfiles'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useThemeMode } from '../hooks/useThemeMode'
import { sortByOrder } from './HomeSectionEditor'
import GlobalSearch from './GlobalSearch'
import RandomPickerButton, { StackedCardsIcon } from './RandomPickerButton'
import NotificationBell from './NotificationBell'
import { APP_VERSION } from '../lib/version'
import { canSeeWrapped, useFeatures, wrappedIsNew } from '../hooks/useFeatures'
import { tt } from '../lib/i18n'
import { MOBILE } from '../lib/mobile/ui'
import { PROFILE_SWITCH_EVENT } from './ProfilePicker'
import Icon, { type IconName } from './Icon'
import { useNavigate } from 'react-router-dom'
import ProfileMenuV2, { EVREN_SEEN_KEY, YAMA_SEEN_KEY } from './ProfileMenuV2'
import { frameFor, useProfileStats } from '../lib/profileStats'
import { api } from '../lib/api'
import AchievementWatcher from './AchievementWatcher'

// Profil menüsündeki satırların ikonları — ARGUS'un dolgulu ikonları (bkz. Icon.tsx); kullanıcı dış çizgili
// yerine dolgulu istedi.
const MENU_ICONS = {
  tablo: 'table',
  ayarlar: 'gear',
  istatistik: 'chart',
  takvim: 'calendar',
  koleksiyon: 'trophy',
  aklimda: 'bookmark',
  evren: 'planet',
  abonelik: 'tv',
  ozet: 'clock',
  yardim: 'help',
  yama: 'sparkle',
} satisfies Record<string, IconName>
// compact: yeni profil menüsündeki satırlarla aynı ölçü (orada dış boşluğu menü veriyor)
function MenuLink({ to, icon, label, extra, onClick, compact }: { to: string; icon: keyof typeof MENU_ICONS; label: string; extra?: React.ReactNode; onClick: () => void; compact?: boolean }) {
  return (
    <Link to={to} onClick={onClick} className={`group flex items-center gap-3 px-2.5 rounded-lg ${compact ? 'py-1.5' : 'mx-1.5 py-2'} text-sm text-neutral-300 hover:text-neutral-50 hover:bg-neutral-800 transition`}>
      <span className="text-neutral-500 group-hover:text-[#00c0fa] transition">
        <Icon name={MENU_ICONS[icon]} className={compact ? 'h-[17px] w-[17px]' : 'h-[18px] w-[18px]'} />
      </span>
      <span className="flex-1">{label}</span>
      {extra}
    </Link>
  )
}

// Telefonda alttaki yüzen menünün kapladığı yükseklik (+ telefonun alt boşluğu) — menü paneli bunun üstünde açılır.
const TABBAR_OFFSET = 'calc(5.25rem + env(safe-area-inset-bottom))'
const inSheet = (n: React.ReactNode) => (MOBILE ? createPortal(n, document.body) : n)

// Telefonun alt menüsündeki ikonlar — profil menüsüyle aynı dolgulu ARGUS ikonları
function TabIcon({ name }: { name: IconName }) {
  return <Icon name={name} className="h-[22px] w-[22px]" />
}

// ARGUS Android: alttaki yüzen menü — Ana Sayfa, Arşiv, Takvim, Ne İzlesem, Diğer (profil menüsü).
// Kullanıcı "Netflix uygulamasındaki gibi" istedi: yuvarlak köşeli, kenarlardan ayrık bir hap; seçili sekme vurgulu.
function MobileTabBar({ boardId, menuOpen, onMenu, onNavigate }: { boardId: string | null; menuOpen: boolean; onMenu: () => void; onNavigate: () => void }) {
  const location = useLocation()
  const p = location.pathname
  const tab = (active: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition ${active ? 'bg-neutral-50/[0.09] text-neutral-50' : 'text-neutral-400'}`
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pointer-events-none" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}>
      <div className="pointer-events-auto grid grid-cols-5 gap-1 h-[4.25rem] p-1.5 rounded-full border border-white/10 bg-neutral-900/90 backdrop-blur-md shadow-2xl shadow-black/70">
        <Link to="/" onClick={onNavigate} className={tab(p === '/' && !menuOpen)}>
          <TabIcon name="home" />
          {tt('Ana Sayfa')}
        </Link>
        <Link to={boardId ? `/board/${boardId}` : '/arsivlerim'} onClick={onNavigate} className={tab(p.startsWith('/board/') && !menuOpen)}>
          <TabIcon name="grid" />
          {tt('Arşiv')}
        </Link>
        <Link to="/takvim" onClick={onNavigate} className={tab(p.startsWith('/takvim') && !menuOpen)}>
          <TabIcon name="calendar" />
          {tt('Takvim')}
        </Link>
        <button
          onClick={() => {
            onNavigate()
            window.dispatchEvent(new Event('argus-ne-izlesem'))
          }}
          className={tab(false)}
        >
          <span className="h-[22px] w-[22px] flex items-center justify-center">
            <StackedCardsIcon />
          </span>
          {tt('Ne İzlesem')}
        </button>
        <button onClick={onMenu} className={tab(menuOpen)}>
          <TabIcon name="menu" />
          {tt('Diğer')}
        </button>
      </div>
    </nav>
  )
}

export default function Navbar() {
  const { profiles, activeProfile, activeProfileId, setActiveProfileId } = useProfiles()
  const { settings } = useHomeSettings()
  const features = useFeatures()
  const { theme, toggleTheme } = useThemeMode()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const activeSection = location.pathname === '/' ? searchParams.get('bolum') : null
  const isHome = location.pathname === '/' && !activeSection
  const currentPage = (
    [
      ['/board/', tt('Arşiv Tablosu')],
      ['/takvim', tt('Takvim')],
      ['/istatistikler', tt('İstatistikler')],
      ['/koleksiyon', tt('Koleksiyon')],
      ['/aklimda', tt('Aklımda')],
      ['/evrenler', tt('Evrenler')],
      ['/abonelik', tt('Abonelik önerisi')],
      ['/birlikte', tt('Birlikte izle')],
      ['/basarimlar', tt('Başarımlar')],
      ['/sahneden-bil', tt('Sahneden bil')],
      ['/flashback', 'Flashback'],
      ['/arsivlerim', tt('Ayarlar')],
      ['/yardim', tt('Yardım Merkezi')],
      ['/yama-notlari', tt('Yama Notları')],
    ] as const
  ).find(([p]) => location.pathname.startsWith(p))?.[1]
  const mobileTitle = location.pathname.startsWith('/board/')
    ? tt('Arşiv')
    : location.pathname === '/'
      ? ((activeSection && (settings.sections ?? []).find((s) => s.id === activeSection)?.name) || tt('Ana Sayfa'))
      : (currentPage ?? '')
  const pinnedSections = sortByOrder((settings.sections ?? []).filter((s) => s.pinnedToNav), settings.navOrder ?? [])
  const [menuOpen, setMenuOpen] = useState(false)
  // Ekstralar (v1.23.4): yeni menü, duygu avatarı, çerçeve, yeni sayfaların bağlantıları, kısayollar
  const ext = settings.extras ?? {}
  const stats = useProfileStats(!MOBILE || Boolean(ext.moodAvatar || ext.avatarFrames))
  const navigate = useNavigate()
  const avatarSrc = ext.moodAvatar && stats ? `/avatars/profil${stats.mood.avatar}.png` : activeProfile?.photo
  const frame = ext.avatarFrames && stats ? frameFor(stats.watchedCount) : null
  const extraLinks: { to: string; icon: IconName; label: string }[] = [
    ...(ext.together ? [{ to: '/birlikte', icon: 'person' as IconName, label: tt('Birlikte izle') }] : []),
    ...(ext.achievements ? [{ to: '/basarimlar', icon: 'trophy' as IconName, label: tt('Başarımlar') }] : []),
    ...(ext.quiz ? [{ to: '/sahneden-bil', icon: 'film' as IconName, label: tt('Sahneden bil') }] : []),
  ]
  // Görülen yama / evren eklemeleri (yeni menüdeki mavi noktalar)
  useEffect(() => {
    try {
      if (location.pathname.startsWith('/yama-notlari')) localStorage.setItem(YAMA_SEEN_KEY, APP_VERSION)
      if (location.pathname.startsWith('/evrenler'))
        api
          .evrenOtoStatus()
          .then((s) => localStorage.setItem(EVREN_SEEN_KEY, String(s.added)))
          .catch(() => {})
    } catch {
      /* önemsiz */
    }
  }, [location.pathname])
  // Kısayollar (bilgisayarda): G sonra harf, Ctrl+, ayarlar, Alt+1..9 profil
  useEffect(() => {
    if (MOBILE) return
    let gAt = 0
    const map: Record<string, string> = { a: settings.boardId ? `/board/${settings.boardId}` : '/arsivlerim', m: '/aklimda', k: '/koleksiyon', e: '/evrenler', i: '/istatistikler', 'ı': '/istatistikler', t: '/takvim', h: '/' }
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        navigate('/arsivlerim')
        return
      }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const p = profiles.filter((x) => x.id !== activeProfileId)[Number(e.key) - 1]
        if (p) {
          e.preventDefault()
          window.dispatchEvent(new Event(PROFILE_SWITCH_EVENT))
          setActiveProfileId(p.id)
        }
        return
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return
      const k = e.key.toLocaleLowerCase('tr')
      if (k === 'g') {
        gAt = Date.now()
        return
      }
      if (Date.now() - gAt < 1200 && map[k]) {
        gAt = 0
        navigate(map[k])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settings.boardId, profiles, activeProfileId])
  // Seçili sayfanın altındaki parlak çizgi: kutu yerine sayfalar arasında kayarak gider (v1.23.3, öneri G1)
  const navRef = useRef<HTMLElement>(null)
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    function place() {
      const nav = navRef.current
      const el = nav?.querySelector<HTMLElement>('[data-nav-active="1"]')
      if (!nav || !el) return setBar(null)
      setBar({ left: el.offsetLeft + 10, width: Math.max(el.offsetWidth - 20, 12) })
    }
    place()
    window.addEventListener('resize', place)
    document.fonts?.ready.then(place).catch(() => {})
    return () => window.removeEventListener('resize', place)
  }, [location.pathname, activeSection, currentPage, pinnedSections.length])
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
          scrolled ? 'bg-neutral-950/75 backdrop-blur-xl backdrop-saturate-150 shadow-[0_1px_0_rgba(255,255,255,0.05)]' : 'bg-transparent'
        }`}
        // Telefonda sayfa durum çubuğunun arkasına uzanıyor; menü onun altından başlasın
        style={MOBILE ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
      >
        <div className="px-2.5 sm:px-4 h-16 flex items-center gap-1 sm:gap-4">
          <Link to="/" className="flex items-center shrink-0">
            {MOBILE ? (
              <img src="/logoblue.png" alt={tt('ARGUS')} className="h-8 w-8 object-contain" />
            ) : (
              <img src="/logoblue-yatay.png" alt={tt('ARGUS')} className="h-6 sm:h-9 w-auto" />
            )}
          </Link>
          {/* Sayfa bağlantıları tek satırda kalıyor (telefonda "Ana Sayfa" iki satıra kayıyordu); sığmazsa
              yana kaydırılıyor. */}
          {/* Sayfaların menünün ortasına koyabildiği yer — ör. arşiv tablosunun araç çubuğu, sayfa aşağı
              kaydırılınca buraya gelir (bkz. BoardView). Sığmıyorsa o sayfa kendisi göstermez. */}
          {!MOBILE && <div id="navbar-center-slot" className="absolute left-1/2 top-0 h-16 -translate-x-1/2 flex items-center pointer-events-none z-10" />}
          {/* Telefonda sayfa bağlantıları alttaki sekme çubuğunda; üstte sadece bulunulan sayfanın adı */}
          {MOBILE ? (
            // Telefonda (Netflix'teki gibi) logonun yanında büyük sayfa adı
            <span className="flex-1 min-w-0 truncate pl-2.5 text-[22px] font-bold tracking-tight text-neutral-50">{mobileTitle}</span>
          ) : (
          <nav ref={navRef} data-navbar-links className="relative flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {[{ id: null as string | null, name: tt('Ana Sayfa'), to: '/' }, ...pinnedSections.map((s) => ({ id: s.id as string | null, name: s.name, to: `/?bolum=${s.id}` }))].map((l) => {
              const active = l.id === null ? isHome : activeSection === l.id
              return (
                <Link
                  key={l.id ?? 'home'}
                  to={l.to}
                  data-nav-active={active ? '1' : undefined}
                  className={`shrink-0 whitespace-nowrap text-sm sm:text-base rounded-lg px-2.5 sm:px-3 py-2 transition-colors ${
                    active ? 'text-white font-semibold' : 'font-medium text-neutral-400 hover:text-neutral-50'
                  }`}
                >
                  {l.name}
                </Link>
              )
            })}
            {/* Menüde bağlantısı olmayan bir sayfadaysan (Arşiv Tablosu, Takvim…) adı seçili olarak görünür —
                yeni kullanıcı denemesinde her sayfada sadece "Ana Sayfa" yazdığı için nerede olduğu belli değildi. */}
            {currentPage && (
              <span data-nav-active="1" className="shrink-0 whitespace-nowrap text-sm sm:text-base font-semibold rounded-lg px-2.5 sm:px-3 py-2 text-white">
                {currentPage}
              </span>
            )}
            {bar && (
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-0.5 h-[2.5px] rounded-full transition-all duration-[400ms] ease-[cubic-bezier(.3,1.4,.5,1)]"
                style={{ left: bar.left, width: bar.width, background: 'linear-gradient(90deg,#015eea,#00c0fa)', boxShadow: '0 0 12px rgba(0,192,250,.75)' }}
              />
            )}
          </nav>
          )}

          <GlobalSearch />
          <RandomPickerButton hideButton={MOBILE} />
          <NotificationBell />
          {ext.achievements && activeProfileId && <AchievementWatcher profileId={activeProfileId} />}

          <div className="relative shrink-0">
            <span className={`block rounded-full ${frame ? 'p-[2.5px]' : ''}`} style={frame?.style} title={frame?.label}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={`h-10 w-10 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center text-sm text-neutral-400 transition ${frame ? '' : 'ring-2'} ${
                menuOpen ? 'ring-[#00c0fa]' : 'ring-neutral-700 hover:ring-neutral-500'
              }`}
              title={ext.moodAvatar && stats ? stats.mood.reason : activeProfile?.username || tt('Profil')}
            >
              {avatarSrc ? (
                <img key={avatarSrc} src={avatarSrc} alt={activeProfile?.username} className="h-full w-full object-cover" style={ext.moodAvatar ? { animation: 'argus-toast-in .35s ease-out' } : undefined} />
              ) : (
                activeProfile?.username.slice(0, 1).toUpperCase() || '?'
              )}
            </button>
            </span>

            {menuOpen &&
              inSheet(
              <>
                {/* "Dışarı tıklayınca kapan" katmanı body'ye çiziliyor — header'ın içinde kalsaydı,
                    sayfa kaydırılınca header'a eklenen bulanıklık efekti yüzünden sadece header'ı
                    kaplıyordu (bkz. RandomPickerButton'daki not). z-[19]: header'ın (z-20) hemen
                    altında, böylece menünün kendisi tıklanabilir kalıyor. */}
                {createPortal(<div className="fixed inset-0 z-[19]" onClick={() => setMenuOpen(false)} />, document.body)}
                <div
                  className={
                    MOBILE
                      ? 'fixed inset-x-0 z-40 max-h-[75vh] overflow-y-auto bg-neutral-900 border-t border-neutral-800 rounded-t-2xl pb-3 shadow-2xl shadow-black/60'
                      : 'absolute right-0 top-13 mt-1 z-40 w-72 bg-neutral-900 border border-neutral-800 rounded-2xl pb-1.5 shadow-2xl shadow-black/40 overflow-hidden'
                  }
                  style={{ ...(MOBILE ? { bottom: TABBAR_OFFSET } : {}), animation: 'argus-toast-in .15s ease-out', ...(!MOBILE ? { width: 340 } : {}) }}
                >
                  {!MOBILE ? (
                    <ProfileMenuV2
                      active={activeProfile ?? null}
                      others={otherProfiles}
                      stats={stats}
                      boardId={settings.boardId ?? null}
                      extraLinks={extraLinks}
                      flashback={
                        canSeeWrapped(features) ? (
                          <MenuLink
                            to="/flashback"
                            icon="ozet"
                            label={tt('Flashback')}
                            extra={wrappedIsNew(features) ? <span className="text-[10px] font-bold text-white bg-fuchsia-500 rounded-full px-2 py-0.5">{tt('YENİ')}</span> : undefined}
                            onClick={() => setMenuOpen(false)}
                            compact
                          />
                        ) : null
                      }
                      onClose={() => setMenuOpen(false)}
                      onSwitch={(id) => {
                        window.dispatchEvent(new Event(PROFILE_SWITCH_EVENT))
                        setActiveProfileId(id)
                        setMenuOpen(false)
                      }}
                      themeSwitch={
                        <div className="mx-3 mt-1.5 pt-2.5 border-t border-neutral-800">
                          <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-950/60 border border-neutral-800 p-1">
                            {(['dark', 'light'] as const).map((t) => (
                              <button
                                key={t}
                                onClick={() => theme !== t && toggleTheme()}
                                className={`flex items-center justify-center gap-1.5 text-xs rounded-lg py-1.5 transition ${theme === t ? 'bg-neutral-800 text-neutral-50 ring-1 ring-[#00c0fa]/40' : 'text-neutral-500 hover:text-neutral-200'}`}
                              >
                                <Icon name={t === 'dark' ? 'moon' : 'sun'} className="h-4 w-4" />
                                {t === 'dark' ? tt('Koyu') : tt('Açık')}
                              </button>
                            ))}
                          </div>
                        </div>
                      }
                    />
                  ) : (
                  <>
                  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-800 bg-neutral-950/40">
                    <span className="h-11 w-11 rounded-full overflow-hidden bg-neutral-800 ring-2 ring-[#00c0fa]/60 shrink-0 flex items-center justify-center text-sm text-neutral-400">
                      {activeProfile?.photo ? (
                        <img src={activeProfile.photo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        activeProfile?.username.slice(0, 1).toUpperCase() || '?'
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-neutral-50 truncate">{activeProfile?.username || tt('Profil')}</span>
                      <span className="block text-xs text-neutral-500">{tt('Şu an bu profildesin')}</span>
                    </span>
                  </div>

                  {otherProfiles.length > 0 && (
                    <div className="py-1.5 border-b border-neutral-800">
                      <p className="px-4 pt-1 pb-1.5 text-[11px] uppercase tracking-wide text-neutral-500">{tt('Profil değiştir')}</p>
                      {otherProfiles.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            window.dispatchEvent(new Event(PROFILE_SWITCH_EVENT))
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
                    {/* Yeni kullanıcı denemesinde arşiv tablosuna her seferinde Ayarlar › Veritabanı › Arşivler yolundan gidiliyordu */}
                    {settings.boardId && <MenuLink to={`/board/${settings.boardId}`} icon="tablo" label={tt('Arşiv Tablosu')} onClick={() => setMenuOpen(false)} />}
                    <MenuLink to="/arsivlerim" icon="ayarlar" label={tt('Ayarlar')} onClick={() => setMenuOpen(false)} />
                    <MenuLink to="/istatistikler" icon="istatistik" label={tt('İstatistikler')} onClick={() => setMenuOpen(false)} />
                    <MenuLink to="/takvim" icon="takvim" label={tt('Takvim')} onClick={() => setMenuOpen(false)} />
                    <MenuLink to="/aklimda" icon="aklimda" label={tt('Aklımda')} onClick={() => setMenuOpen(false)} />
                    <MenuLink to="/koleksiyon" icon="koleksiyon" label={tt('Koleksiyon')} onClick={() => setMenuOpen(false)} />
                    <MenuLink to="/evrenler" icon="evren" label={tt('Evrenler')} onClick={() => setMenuOpen(false)} />
                    <MenuLink to="/abonelik" icon="abonelik" label={tt('Abonelik önerisi')} onClick={() => setMenuOpen(false)} />
                    {extraLinks.map((l) => (
                      <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)} className="group flex items-center gap-3 mx-1.5 px-2.5 py-2 rounded-lg text-sm text-neutral-300 hover:text-neutral-50 hover:bg-neutral-800 transition">
                        <span className="text-neutral-500 group-hover:text-[#00c0fa] transition">
                          <Icon name={l.icon} className="h-[18px] w-[18px]" />
                        </span>
                        <span className="flex-1">{l.label}</span>
                      </Link>
                    ))}
                    {canSeeWrapped(features) && (
                      <MenuLink
                        to="/flashback"
                        icon="ozet"
                        label={tt('Flashback')}
                        extra={wrappedIsNew(features) ? <span className="text-[10px] font-bold text-white bg-fuchsia-500 rounded-full px-2 py-0.5">{tt('YENİ')}</span> : undefined}
                        onClick={() => setMenuOpen(false)}
                      />
                    )}
                    <MenuLink to="/yardim" icon="yardim" label={tt('Yardım Merkezi')} onClick={() => setMenuOpen(false)} />
                    <MenuLink
                      to="/yama-notlari"
                      icon="yama"
                      label={tt('Yama Notları')}
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
                          <Icon name={t === 'dark' ? 'moon' : 'sun'} className="h-4 w-4" />
                          {t === 'dark' ? tt('Koyu') : tt('Açık')}
                        </button>
                      ))}
                    </div>
                  </div>
                  </>
                  )}
                </div>
              </>,
              )}
          </div>
        </div>
        {/* Telefonda Ana Sayfa'nın bölümleri (Diziler, Filmler…) başlığın altında yana kayan düğmeler */}
        {MOBILE && location.pathname === '/' && pinnedSections.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 pb-2">
            {[{ id: null as string | null, name: tt('Tümü'), to: '/' }, ...pinnedSections.map((s) => ({ id: s.id as string | null, name: s.name, to: `/?bolum=${s.id}` }))].map((l) => {
              const active = l.id === null ? isHome : activeSection === l.id
              return (
                <Link
                  key={l.id ?? 'home'}
                  to={l.to}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition ${
                    active ? 'border-[#00c0fa]/60 bg-[#00c0fa]/15 text-neutral-50' : 'border-neutral-700 bg-neutral-900/70 text-neutral-300'
                  }`}
                >
                  {l.name}
                </Link>
              )
            })}
          </div>
        )}
      </header>
      {MOBILE &&
        createPortal(
          <MobileTabBar
            boardId={settings.boardId ?? null}
            menuOpen={menuOpen}
            onMenu={() => setMenuOpen((v) => !v)}
            onNavigate={() => setMenuOpen(false)}
          />,
          document.body,
        )}
    </>
  )
}
