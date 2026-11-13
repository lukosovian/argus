import { useState, type ComponentType } from 'react'
import Icon from '../components/Icon'
import { useSearchParams } from 'react-router-dom'
import { BRAND_GRADIENT } from '../lib/theme'
import ArchivesPanel from '../components/settings/ArchivesPanel'
import HomeSettingsPanel from '../components/settings/HomeSettingsPanel'
import ProfileSettingsPanel from '../components/settings/ProfileSettingsPanel'
import AppSettingsPanel from '../components/settings/AppSettingsPanel'
import { OpeningPanel } from '../components/settings/ExtraSettings'
import { PanelHeader } from '../components/settings/SettingsUi'
import { tt } from '../lib/i18n'

type Tab = 'veritabani' | 'ana-sayfa' | 'uygulama' | 'profil' | 'acilis'

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

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  )
}

const TABS: { key: Tab; label: string; hint: string; icon: ComponentType }[] = [
  { key: 'veritabani', label: tt('Veritabanı'), hint: tt('Arşivler, şablonlar, içe aktarma, API'), icon: DatabaseIcon },
  { key: 'ana-sayfa', label: tt('Ana Sayfa Ayarları'), hint: tt('Görünüm, sayfalar, modlar, Ne İzlesem'), icon: HomeGearIcon },
  { key: 'uygulama', label: tt('Uygulama Ayarları'), hint: tt('Başlangıç, kapatma, tepsi'), icon: MonitorIcon },
  { key: 'profil', label: tt('Profil Ayarları'), hint: tt('Profil ekle, düzenle, değiştir'), icon: UserIcon },
  { key: 'acilis', label: tt('Açılış'), hint: tt('Giriş animasyonu, açılış penceresi'), icon: SparkleIcon },
]

// Ayar arama dizini (v1.23.3, öneri Y1): "yedek" yazınca ilgili ayarlar ve hangi sekmede oldukları çıkar,
// tıklayınca o sekme (ve alt sekmesi) açılır. Yeni bir ayar eklenince buraya da bir satır eklenir.
const SEARCH: { label: string; tab: Tab; alt?: string; where: string; words?: string }[] = [
  { label: tt('Yeni arşiv oluştur'), tab: 'veritabani', alt: 'arsivler', where: tt('Veritabanı › Arşivler'), words: 'tablo board' },
  { label: tt('Sütun şablonları'), tab: 'veritabani', alt: 'sablonlar', where: tt('Veritabanı › Şablonlar'), words: 'şablon kolon' },
  { label: tt('İçe aktar (CSV, Notion, Netflix)'), tab: 'veritabani', alt: 'ice-aktar', where: tt('Veritabanı › İçe Aktar'), words: 'import csv notion netflix' },
  { label: tt('TMDB API anahtarı'), tab: 'veritabani', alt: 'api', where: tt('Veritabanı › API'), words: 'tmdb key anahtar' },
  { label: tt('Yedekleme klasörü ve otomatik yedek'), tab: 'veritabani', alt: 'yedek', where: tt('Veritabanı › Yedekleme'), words: 'yedek backup' },
  { label: tt('Yedekten geri yükle'), tab: 'veritabani', alt: 'yedek', where: tt('Veritabanı › Yedekleme'), words: 'yedek geri restore' },
  { label: tt('Vitrin ve vitrin görünümü'), tab: 'ana-sayfa', alt: 'gorunum', where: tt('Ana Sayfa › Görünüm'), words: 'vitrin sinema slayt klasik fragman' },
  { label: tt('Vitrin süsleri'), tab: 'ana-sayfa', alt: 'gorunum', where: tt('Ana Sayfa › Görünüm'), words: 'vitrin süs özet aklımda' },
  { label: tt('Kart boyutu ve bilgileri her zaman göster'), tab: 'ana-sayfa', alt: 'gorunum', where: tt('Ana Sayfa › Görünüm'), words: 'kart boyut' },
  { label: tt('Satırlar ve sıraları'), tab: 'ana-sayfa', alt: 'gorunum', where: tt('Ana Sayfa › Görünüm'), words: 'satır sıra kaldığın yerden aklında yeni bölümler unuttukların en iyi' },
  { label: tt('Üst menüdeki sayfalar'), tab: 'ana-sayfa', alt: 'sayfalar', where: tt('Ana Sayfa › Sayfalar'), words: 'diziler filmler sayfa menü' },
  { label: tt('Mod satırı'), tab: 'ana-sayfa', alt: 'mod', where: tt('Ana Sayfa › Modlar'), words: 'mod ruh hali' },
  { label: tt('Ne İzlesem? havuzu ve animasyonu'), tab: 'ana-sayfa', alt: 'nizlesem', where: tt('Ana Sayfa › Ne İzlesem?'), words: 'ne izlesem rastgele' },
  { label: tt('Bilgisayar açılınca başlat'), tab: 'uygulama', where: tt('Uygulama Ayarları'), words: 'açılış başlangıç' },
  { label: tt('Kapatınca tepsiye küçült'), tab: 'uygulama', where: tt('Uygulama Ayarları'), words: 'kapatma tepsi' },
  { label: tt('Bildirimler'), tab: 'uygulama', where: tt('Uygulama Ayarları'), words: 'bildirim' },
  { label: tt('Güncellemeler'), tab: 'uygulama', where: tt('Uygulama Ayarları'), words: 'güncelleme sürüm' },
  { label: tt('Yakınlaştırma ve kısayollar'), tab: 'uygulama', where: tt('Uygulama Ayarları'), words: 'zoom yakınlaştır kısayol ctrl' },
  { label: tt('Profil ekle, adı ve resmi'), tab: 'profil', where: tt('Profil Ayarları'), words: 'profil resim ad pin kilit çocuk' },
  { label: tt('Ne İzlesem? seçim animasyonu, üç aday, bu akşam soruları'), tab: 'ana-sayfa', alt: 'nizlesem', where: tt('Ana Sayfa › Ne İzlesem?'), words: 'çark slot deste şerit aday sihirbaz bitiş saati' },
  { label: tt('Giriş animasyonu'), tab: 'acilis', where: tt('Açılış'), words: 'intro sinema perde geri sayım göz sırayla rastgele ses' },
  { label: tt('Açılış penceresi afiş duvarı'), tab: 'acilis', where: tt('Açılış'), words: 'splash afiş logo' },
  { label: tt('Profil seçince avatar ekrana yayılsın'), tab: 'acilis', where: tt('Açılış'), words: 'kim izliyor geçiş avatar' },
  { label: tt('Duygu avatarı, avatar sekmeleri, kırpma, çerçeveler'), tab: 'profil', where: tt('Profil Ayarları'), words: 'avatar fotoğraf çerçeve kırp duygu' },
  { label: tt('Birlikte izle, zevk uyumu, Başarımlar, Sahneden bil'), tab: 'profil', where: tt('Profil Ayarları'), words: 'birlikte zevk başarım rozet sahne oyun' },
  { label: tt('Dizi bitirme planı ve paylaşım kartı'), tab: 'profil', where: tt('Profil Ayarları'), words: 'plan paylaş kart' },
  { label: tt('Oyuncu takibi ve haftalık özet'), tab: 'uygulama', where: tt('Uygulama Ayarları'), words: 'takip haftalık özet bildirim' },
]

function SparkleIcon() {
  return <Icon name="sparkle" className="h-5 w-5" />
}

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

  function setTab(key: Tab, alt?: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('sekme', key)
        if (alt) next.set('alt', alt)
        else next.delete('alt')
        return next
      },
      { replace: true },
    )
  }
  const [q, setQ] = useState('')
  const norm = (s: string) => s.toLocaleLowerCase('tr')
  const hits = q.trim() ? SEARCH.filter((s) => norm(`${s.label} ${s.where} ${s.words ?? ''}`).includes(norm(q.trim()))) : []
  const alt = searchParams.get('alt') ?? ''

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-50 tracking-tight">{tt('Ayarlar')}</h1>
        <p className="text-sm text-neutral-500 mt-1">{tt('Arşivlerini, ana sayfanı, uygulamayı ve profillerini buradan yönet.')}</p>
      </div>

      <div className="flex flex-col md:flex-row gap-5 md:gap-8 items-stretch md:items-start">
        <div className="md:w-64 shrink-0 md:sticky md:top-24 space-y-3">
        <label className="hidden md:flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-neutral-500 focus-within:border-[#00c0fa]/60 transition">
          <Icon name="search" className="h-4 w-4 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
            placeholder={tt('Ayarlarda ara…')}
            className="min-w-0 flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
          />
        </label>
        {q.trim() && (
          <div className="hidden md:block overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/80">
            {hits.length === 0 && <p className="px-3 py-2.5 text-xs text-neutral-500">{tt('Bu adla bir ayar bulunamadı.')}</p>}
            {hits.map((h) => (
              <button
                key={h.label}
                onClick={() => {
                  setTab(h.tab, h.alt)
                  setQ('')
                }}
                className="block w-full border-b border-neutral-800/70 last:border-0 px-3 py-2 text-left hover:bg-neutral-800/70 transition"
              >
                <span className="block text-sm text-neutral-100">{h.label}</span>
                <span className="block text-[11px] text-neutral-500">{h.where}</span>
              </button>
            ))}
          </div>
        )}
        <nav className="flex md:flex-col gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {TABS.map(({ key, label, hint, icon: Icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative shrink-0 md:w-full flex items-center gap-3 text-left rounded-lg px-3 py-2.5 border transition ${
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
        </div>

        <div className="flex-1 min-w-0 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4 sm:p-6 md:p-7">
          {tab === 'veritabani' && <ArchivesPanel key={alt} />}
          {tab === 'ana-sayfa' && <HomeSettingsPanel key={alt} />}
          {tab === 'uygulama' && <AppSettingsPanel />}
          {tab === 'profil' && <ProfileSettingsPanel />}
          {tab === 'acilis' && (
            <div>
              <PanelHeader title={tt('Açılış')} description={tt('ARGUS bu bilgisayarda açılırken görünenler.')} />
              <OpeningPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
