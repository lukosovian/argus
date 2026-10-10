import ProfilePicker from '../ProfilePicker'
import { PanelHeader } from './SettingsUi'
import { tt } from '../../lib/i18n'

// "Profil Ayarları" sekmesi — eskiden pp menüsündeki "Profili Düzenle"/"Profil Değiştir"
// butonlarının açtığı ayrı modallar buradaydı, artık ProfilePicker'ın `embedded` haliyle
// (bkz. ProfilePicker.tsx) doğrudan Ayarlar sayfasının içinde: profil ekleme/düzenleme/silme/
// değiştirme hepsi aynı kart grid'i üzerinden.
export default function ProfileSettingsPanel() {
  return (
    <div>
      <PanelHeader title={tt('Profil Ayarları')} description={tt('Profil ekle, adını ya da resmini değiştir, profiller arasında geçiş yap.')} />
      <ProfilePicker embedded />
    </div>
  )
}
