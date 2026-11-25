import { useEffect, useState } from 'react'
import { SettingsSection } from '../settings/SettingsUi'
import ToggleSwitch from '../ToggleSwitch'
import { ArgusNative } from '../../lib/mobile/native'
import { getPhonePrefs, setPhonePrefs, type PhonePrefs } from '../../lib/mobile/nativeFeatures'
import { locale, tt } from '../../lib/i18n'

// Telefon ayarları (Ayarlar › PC bağlantısının altında): telefon bildirimleri (Y12/Y25), arka planda eşitleme (G4),
// parmak izi (Y24) ve ana ekran kutusunun (Y11) nasıl ekleneceği. Ayarlar sadece bu telefonda tutulur.
function when(ms: number) {
  return ms ? new Date(ms).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}

export default function PhoneExtrasSection() {
  const [p, setP] = useState<PhonePrefs>(getPhonePrefs)
  const [bio, setBio] = useState(false)
  const [bg, setBg] = useState<{ lastReach: number; sent: number; sentAt: number } | null>(null)
  useEffect(() => {
    ArgusNative.biometricAvailable().then((r) => setBio(r.available)).catch(() => {})
    ArgusNative.backgroundInfo().then(setBg).catch(() => {})
  }, [])
  const set = (patch: Partial<PhonePrefs>) => setP(setPhonePrefs(patch))

  const row = (label: string, hint: string, key: keyof PhonePrefs, disabled = false) => (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-neutral-100">{label}</p>
        <p className="text-xs text-neutral-500 leading-relaxed">{hint}</p>
      </div>
      <ToggleSwitch checked={p[key] && !disabled} disabled={disabled} onChange={(v) => set({ [key]: v })} label={label} />
    </div>
  )

  return (
    <SettingsSection title={tt('Telefon')} description={tt('Bu ayarlar sadece bu telefonda geçerli.')}>
      {row(tt('Yeni bölüm bildirimi'), tt('İzlediğin dizinin yeni bölümü yayınlandığı gün sabah haber verir.'), 'yeniBolum')}
      {row(tt('Vizyon günü bildirimi'), tt('Beklediğin yapım çıktığı gün haber verir.'), 'vizyon')}
      {row(tt('Geçmiş yıllarda bugün'), tt('Sabahları, geçmiş yıllarda o gün izlediğin bir yapımı hatırlatır (günde en fazla bir kez).'), 'gecmisYil')}
      {row(
        tt('Arka planda eşitle'),
        tt('Uygulama kapalıyken de Wi-Fi\'dayken arada bir PC aranır, bekleyen değişikliklerin gönderilir.') +
          (bg?.lastReach ? ' ' + tt('PC en son {0} bulundu.', when(bg.lastReach)) : '') +
          (bg?.sent ? ' ' + tt('Arka planda {0} değişiklik gönderildi (en son {1}).', bg.sent, when(bg.sentAt)) : ''),
        'arkaPlan',
      )}
      {row(tt('Kilitli profili parmak iziyle aç'), bio ? tt('PIN yerine telefonun parmak izi / yüz kilidi sorulur; olmazsa PIN girersin.') : tt('Bu telefonda kayıtlı parmak izi ya da yüz kilidi yok.'), 'biyometri', !bio)}
      <div>
        <p className="text-sm text-neutral-100">{tt('Ana ekranda "Sıradaki bölüm"')}</p>
        <p className="text-xs text-neutral-500 leading-relaxed">{tt('Telefonun ana ekranında boş bir yere basılı tut › Widget\'lar › ARGUS. İzlediğin dizilerin sıradaki bölümü görünür, PC kapalıyken de.')}</p>
      </div>
    </SettingsSection>
  )
}
