import { useEffect, useState } from 'react'
import { SettingsSection } from '../settings/SettingsUi'
import { useToast } from '../../hooks/useToast'
import { clearConfig, getConfig, getState, prefetchPosters, reconnectNow } from '../../lib/mobile/connection'
import { ArgusNative } from '../../lib/mobile/native'
import { wipeAll } from '../../lib/mobile/store'
import { useMobileState } from './MobileStatusBar'
import PhoneExtrasSection from './PhoneExtrasSection'

// PendingChanges'i buraya almadan (o ayrı parçada) açar — ekranı üstteki gösterge (MobileStatusBar) tutuyor
const openPendingChanges = () => window.dispatchEvent(new Event('argus-bekleyenler-ac'))
import { locale, tt } from '../../lib/i18n'

// ARGUS Android › Ayarlar › Uygulama Ayarları: hangi PC'ye bağlı, son eşitleme, bekleyen değişiklikler,
// telefondaki görseller ve bağlantıyı kaldırma.
function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString(locale(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}
function fmtBytes(n: number): string {
  if (n > 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  return `${Math.round(n / 1024 ** 2)} MB`
}

export default function MobileConnectionPanel() {
  const { notify, confirm } = useToast()
  const s = useMobileState()
  const c = getConfig()
  const [media, setMedia] = useState<{ count: number; bytes: number } | null>(null)

  useEffect(() => {
    ArgusNative.mediaInfo().then(setMedia).catch(() => {})
  }, [s.prefetch, s.lastSync])

  async function unpair() {
    if (!(await confirm({ message: tt('Bu telefonun PC ile bağlantısı kaldırılsın mı? Telefondaki kopya ve PC\'ye gönderilmemiş değişiklikler silinir.'), confirmLabel: tt('Kaldır'), tone: 'danger' }))) return
    await wipeAll().catch(() => {})
    await ArgusNative.clearMedia().catch(() => {})
    await ArgusNative.clearServer().catch(() => {})
    clearConfig()
    location.reload()
  }

  const statusText =
    s.status === 'online' ? tt('Bağlı') : s.status === 'syncing' ? tt('Eşitleniyor...') : s.unpaired ? tt('PC bu telefonu artık tanımıyor — yeniden bağlan') : tt('Çevrimdışı — PC ile aynı Wi-Fi\'a girince eşitlenir')

  return (
    <>
    <SettingsSection title={tt('PC bağlantısı')} description={tt('Telefonda yaptığın değişiklikler, PC ile aynı Wi-Fi\'a girince kendiliğinden PC\'ye gider.')}>
      <div className="space-y-1">
        <p className="text-sm text-neutral-100">{c?.pcName || 'ARGUS'}</p>
        <p className="text-xs text-neutral-500">
          {c?.host} · {statusText}
        </p>
        <p className="text-xs text-neutral-500">{s.lastSync ? tt('Son eşitleme: {0}', fmtTime(s.lastSync)) : tt('Henüz eşitlenmedi')}</p>
        {s.pending > 0 && <p className="text-xs text-amber-300">{tt('{0} değişiklik PC\'ye gönderilmeyi bekliyor', s.pending)}</p>}
        {s.failed > 0 && <p className="text-xs text-red-400">{tt('{0} değişiklik PC\'de uygulanamadı (ör. kayıt PC\'de silinmişti).', s.failed)}</p>}
        {s.skipped > 0 && <p className="text-xs text-amber-300">{tt("{0} değişiklik uygulanmadı — PC'de daha yeni hali var. Hangisinin kalacağını Bekleyen değişiklikler'den seç.", s.skipped)}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={async () => {
              // Eskiden PC'ye ulaşılamasa da "Eşitlendi." deniyordu; artık gerekirse ağı tarayıp PC'yi arıyor
              if (await reconnectNow()) notify(tt('Eşitlendi.'), 'success')
              else if (getState().unpaired) notify(tt('PC bu telefonu artık tanımıyor. Yeniden bağlanman gerekiyor.'), 'danger')
              else notify(tt('PC bulunamadı. PC\'de ARGUS açık mı, telefon aynı Wi-Fi\'da mı?'), 'danger')
            }}
            disabled={s.status === 'syncing'}
            className="text-xs rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-neutral-200 disabled:opacity-50"
          >
            {tt('Şimdi eşitle')}
          </button>
          {s.unpaired && s.status === 'offline' && (
            <button onClick={() => window.dispatchEvent(new Event('argus-yeniden-bagla'))} className="text-xs rounded-lg border border-[#00c0fa]/50 bg-[#00c0fa]/10 px-3 py-1.5 text-[#bdeeff]">
              {tt('Yeniden bağlan')}
            </button>
          )}
          {(s.pending > 0 || s.failed > 0 || s.skipped > 0) && (
            <button onClick={openPendingChanges} className="text-xs rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-neutral-200">
              {tt('Bekleyen değişiklikler')}
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-neutral-100">{tt('Görseller')}</p>
        <p className="text-xs text-neutral-500 leading-relaxed">
          {tt('Afişler PC yokken de görünsün diye telefona indirilir; diğer görseller açtıkça kaydedilir.')}{' '}
          {media && tt('Telefonda {0} görsel ({1}).', media.count, fmtBytes(media.bytes))}
        </p>
        {s.prefetch && <p className="text-xs text-[#3fa9ff]">{tt('Afişler indiriliyor: {0} / {1}', s.prefetch.done, s.prefetch.total)}</p>}
        <button
          onClick={() => prefetchPosters().then(() => notify(tt('Eksik afişler indiriliyor.')))}
          disabled={s.status !== 'online'}
          className="mt-2 text-xs rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-neutral-200 disabled:opacity-50"
        >
          {tt('Eksik afişleri indir')}
        </button>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-neutral-500">{tt('Başka bir PC\'ye bağlamak ya da sıfırdan kurmak için.')}</p>
        <button onClick={unpair} className="shrink-0 text-xs text-neutral-400 hover:text-red-400">
          {tt('Bağlantıyı kaldır')}
        </button>
      </div>
    </SettingsSection>
    {/* Telefon bildirimleri, arka plan eşitlemesi, parmak izi, ana ekran kutusu (bkz. PhoneExtrasSection) */}
    <PhoneExtrasSection />
    </>
  )
}
