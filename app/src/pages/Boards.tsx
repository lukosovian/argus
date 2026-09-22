import { useState, type ComponentType } from 'react'
import ArchivesPanel from '../components/settings/ArchivesPanel'
import HomeSettingsPanel from '../components/settings/HomeSettingsPanel'
import ProfileSettingsPanel from '../components/settings/ProfileSettingsPanel'

type Tab = 'veritabani' | 'ana-sayfa' | 'profil'

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  )
}

function HomeGearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.2 3.6-7 8-7s8 2.8 8 7" />
    </svg>
  )
}

const TABS: { key: Tab; label: string; icon: ComponentType }[] = [
  { key: 'veritabani', label: 'Veritabanı', icon: DatabaseIcon },
  { key: 'ana-sayfa', label: 'Ana Sayfa Ayarları', icon: HomeGearIcon },
  { key: 'profil', label: 'Profil Ayarları', icon: UserIcon },
]

// Ayarlar sayfası: solda ikon+etiketli bir sekme menüsü, sağda seçilen sekmenin içeriği.
// Eskiden bu dosya (route/dosya adı hâlâ aynı, `/arsivlerim`) tek başına arşiv listesi +
// "Ana Sayfa Ayarları" aç/kapa paneliydi — üçü de (Veritabanı/Arşivler, Ana Sayfa Ayarları,
// Profil Ayarları) artık kendi sekmesi olan ayrı panel bileşenleri (bkz. components/settings/).
export default function Boards() {
  const [tab, setTab] = useState<Tab>('veritabani')

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex gap-8 items-start">
      <nav className="w-56 shrink-0 sticky top-24 space-y-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`w-full flex items-center gap-3 text-sm rounded-lg px-3 py-2.5 transition ${
              tab === key ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1 min-w-0">
        {tab === 'veritabani' && <ArchivesPanel />}
        {tab === 'ana-sayfa' && <HomeSettingsPanel />}
        {tab === 'profil' && <ProfileSettingsPanel />}
      </div>
    </div>
  )
}
