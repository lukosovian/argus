import type { ComponentType } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BRAND_GRADIENT } from '../lib/theme'
import ArchivesPanel from '../components/settings/ArchivesPanel'
import HomeSettingsPanel from '../components/settings/HomeSettingsPanel'
import ProfileSettingsPanel from '../components/settings/ProfileSettingsPanel'

type Tab = 'veritabani' | 'ana-sayfa' | 'profil'

function DatabaseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  )
}

function HomeGearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.2 3.6-7 8-7s8 2.8 8 7" />
    </svg>
  )
}

const TABS: { key: Tab; label: string; hint: string; icon: ComponentType }[] = [
  { key: 'veritabani', label: 'Veritabanı', hint: 'Arşivler, şablonlar, içe aktarma, API', icon: DatabaseIcon },
  { key: 'ana-sayfa', label: 'Ana Sayfa Ayarları', hint: 'Görünüm, sayfalar, modlar, Ne İzlesem', icon: HomeGearIcon },
  { key: 'profil', label: 'Profil Ayarları', hint: 'Profil ekle, düzenle, değiştir', icon: UserIcon },
]

function isTab(v: string | null): v is Tab {
  return TABS.some((t) => t.key === v)
}

// Ayarlar sayfası: solda ikonlu sekme menüsü (telefonda üstte yatay şerit), sağda seçilen sekmenin
// içeriği bir kartın içinde. Eskiden bu dosya (route/dosya adı hâlâ aynı, `/arsivlerim`) tek başına
// arşiv listesi + "Ana Sayfa Ayarları" aç/kapa paneliydi — üçü de artık kendi sekmesi olan ayrı panel
// bileşenleri (bkz. components/settings/). Seçili sekme adreste (?sekme=) tutuluyor; sayfa
// yenilenince ya da geri gelince aynı sekme açılıyor.
export default function Boards() {
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('sekme')
  const tab: Tab = isTab(param) ? param : 'veritabani'

  function setTab(key: Tab) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('sekme', key)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-50 tracking-tight">Ayarlar</h1>
        <p className="text-sm text-neutral-500 mt-1">Arşivlerini, ana sayfanı ve profillerini buradan yönet.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-5 md:gap-8 items-stretch md:items-start">
        <nav className="md:w-64 shrink-0 md:sticky md:top-24 flex md:flex-col gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {TABS.map(({ key, label, hint, icon: Icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative shrink-0 md:w-full flex items-center gap-3 text-left rounded-xl px-3 py-2.5 border transition ${
                  active
                    ? 'bg-[#00c0fa]/[0.07] border-[#00c0fa]/30 text-neutral-50'
                    : 'border-transparent text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900'
                }`}
              >
                {active && (
                  <span
                    className="hidden md:block absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full"
                    style={{ background: BRAND_GRADIENT }}
                  />
                )}
                <span
                  className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${
                    active ? 'bg-[#00c0fa]/15 text-[#00c0fa]' : 'bg-neutral-900 border border-neutral-800 text-neutral-400'
                  }`}
                >
                  <Icon />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium whitespace-nowrap">{label}</span>
                  <span className="hidden md:block text-[11px] text-neutral-500 truncate">{hint}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="flex-1 min-w-0 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4 sm:p-6 md:p-7">
          {tab === 'veritabani' && <ArchivesPanel />}
          {tab === 'ana-sayfa' && <HomeSettingsPanel />}
          {tab === 'profil' && <ProfileSettingsPanel />}
        </div>
      </div>
    </div>
  )
}
