import { useEffect, useState } from 'react'
import { SettingsSection } from '../settings/SettingsUi'
import { useToast } from '../../hooks/useToast'
import { clearConfig, getConfig, prefetchPosters, syncNow } from '../../lib/mobile/connection'
import { ArgusNative } from '../../lib/mobile/native'
import { wipeAll } from '../../lib/mobile/store'
import { useMobileState } from './MobileStatusBar'
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
    s.status === 'online' ? tt('Bağlı') : s.status === 'syncing' ? tt('Eşitleniyor...') : tt('Çevrimdışı — PC ile aynı Wi-Fi\'a girince eşitlenir')

  return (
    <SettingsSection title={tt('PC bağlantısı')} description={tt('Telefonda yaptığın değişiklikler, PC ile aynı Wi-Fi\'a girince kendiliğinden PC\'ye gider.')}>
      <div className="space-y-1">
        <p className="text-sm text-neutral-100">{c?.pcName || 'ARGUS'}</p>
        <p className="text-xs text-neutral-500">
          {c?.host} · {statusText}
        </p>
        <p className="text-xs text-neutral-500">{s.lastSync ? tt('Son eşitleme: {0}', fmtTime(s.lastSync)) : tt('Henüz eşitlenmedi')}</p>
        {s.pending > 0 && <p className="text-xs text-amber-300">{tt('{0} değişiklik PC\'ye gönderilmeyi bekliyor', s.pending)}</p>}
        {s.failed > 0 && <p className="text-xs text-red-400">{tt('{0} değişiklik PC\'de uygulanamadı (ör. kayıt PC\'de silinmişti).', s.failed)}</p>}
        <button
          onClick={() => syncNow().then(() => notify(tt('Eşitlendi.'), 'success'))}
          disabled={s.status === 'syncing'}
          className="mt-2 text-xs rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-neutral-200 disabled:opacity-50"
        >
          {tt('Şimdi eşitle')}
        </button>
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
  )
}
