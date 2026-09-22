import ProfilePicker from '../ProfilePicker'

// "Profil Ayarları" sekmesi — eskiden pp menüsündeki "Profili Düzenle"/"Profil Değiştir"
// butonlarının açtığı ayrı modallar buradaydı, artık ProfilePicker'ın `embedded` haliyle
// (bkz. ProfilePicker.tsx) doğrudan Ayarlar sayfasının içinde: profil ekleme/düzenleme/silme/
// değiştirme hepsi aynı kart grid'i üzerinden.
export default function ProfileSettingsPanel() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-50 mb-5">Profil Ayarları</h2>
      <ProfilePicker embedded />
    </div>
  )
}
