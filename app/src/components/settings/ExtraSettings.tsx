import type { ReactNode } from 'react'
import { SettingsSection } from './SettingsUi'
import ToggleSwitch from '../ToggleSwitch'
import Select from '../Select'
import { deviceSet, PICKER_ANIMS, useDevice, useExtras, type DeviceExtra, type IntroStyle, type PickerAnim, type ProfileExtra } from '../../lib/extras'
import { playIntro } from '../IntroFx'
import { tt } from '../../lib/i18n'

// İsteğe bağlı özelliklerin ayarları (v1.23.4'te tek bir "Ekstralar" sekmesindeydi). Kullanıcı "ilgili yerlere taşı,
// ilgili yer yoksa yap" dedi (v1.23.5): her parça kendi sekmesinde kullanılıyor —
//   Ana Sayfa › Ne İzlesem?  → PickerExtras
//   Açılış (yeni sekme)       → OpeningPanel
//   Profil Ayarları           → ProfileExtras
//   Uygulama Ayarları         → NotifyExtras

export function XRow({ title, hint, children, dim }: { title: string; hint?: string; children: ReactNode; dim?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${dim ? 'opacity-50' : ''}`}>
      <span className="min-w-0">
        <span className="block text-sm text-neutral-200">{title}</span>
        {hint && <span className="block text-xs text-neutral-500 mt-0.5 leading-relaxed">{hint}</span>}
      </span>
      <span className="shrink-0 pt-0.5">{children}</span>
    </div>
  )
}

function useProfileToggle() {
  const { on, set } = useExtras()
  return (k: ProfileExtra, title: string, hint: string, dim?: boolean) => (
    <XRow key={k} title={title} hint={hint} dim={dim}>
      <ToggleSwitch checked={on(k)} onChange={(v) => set(k, v)} label={title} disabled={dim} />
    </XRow>
  )
}

function DeviceToggle({ k, title, hint }: { k: DeviceExtra; title: string; hint: string }) {
  const v = useDevice(k) === '1'
  return (
    <XRow title={title} hint={hint}>
      <ToggleSwitch checked={v} onChange={(nv) => deviceSet(k, nv ? '1' : '0')} label={title} />
    </XRow>
  )
}

// Ana Sayfa Ayarları › Ne İzlesem?
export function PickerExtras() {
  const { settings, saveSettings } = useExtras()
  const P = useProfileToggle()
  return (
    <SettingsSection title={tt('Seçim ve sonuç')} description={tt('Kazananın nasıl seçileceği ve sonuç ekranında neler olacağı.')}>
      <XRow title={tt('Seçim animasyonu')} hint={tt('Klasik dağılma, çark, slot makinesi, kart destesi, film şeridi ya da her seferinde farklı.')}>
        <Select
          value={settings.pickerAnim ?? 'klasik'}
          onChange={(v) => saveSettings({ ...settings, pickerAnim: v as PickerAnim })}
          options={PICKER_ANIMS.map((a) => ({ value: a.id, label: a.label }))}
          className="w-48"
        />
      </XRow>
      {P('pickerTrio', tt('Üç aday modu'), tt('Tek sonuç yerine üç aday gelir; istemediğini elersin, son kalan seçilir.'))}
      {P('pickerWizard', tt('"Bu akşam" soruları'), tt('Başlamadan önce üç soru: kiminle, ne kadar vaktin var, nasıl hissetmek istiyorsun.'))}
      {P('pickerEndTime', tt('Bitiş saati ve "neden bu?"'), tt('Sonuçta "şimdi başlarsan bitiş: 23:47" ve neden seçildiği. Boşluk tuşu tekrar getirir.'))}
    </SettingsSection>
  )
}

export const INTRO_STYLES: { value: IntroStyle; label: string }[] = [
  { value: 'kapali', label: tt('Kapalı') },
  { value: 'argus', label: tt('ARGUS (göz açılışı)') },
  { value: 'sinema', label: tt('Sinema projektörü') },
  { value: 'geri-sayim', label: tt('Film geri sayımı') },
  { value: 'perde', label: tt('Tiyatro perdesi') },
  { value: 'sirayla', label: tt('Sırayla (her açılışta sıradaki)') },
  { value: 'rastgele', label: tt('Rastgele') },
]
const PREVIEWABLE = ['argus', 'sinema', 'geri-sayim', 'perde'] as const

// Ayarlar › Açılış (yeni sekme): bu bilgisayarda ARGUS açılırken olanlar
export function OpeningPanel() {
  const intro = (useDevice('argus_intro') as IntroStyle | null) ?? 'kapali'
  return (
    <div className="space-y-5">
      <SettingsSection title={tt('Giriş animasyonu')} description={tt('ARGUS penceresi açılınca bir kez oynar. Tıklayınca ya da bir tuşa basınca geçilir. Bu bilgisayar için.')}>
        <XRow title={tt('Hangi animasyon')} hint={tt('"Sırayla" seçersen her açılışta bir sonrakine geçer.')}>
          <Select value={intro} onChange={(v) => deviceSet('argus_intro', v)} options={INTRO_STYLES} className="w-60" />
        </XRow>
        <div>
          <p className="text-xs text-neutral-500 mb-2">{tt('Şimdi izle:')}</p>
          <div className="flex flex-wrap gap-2">
            {PREVIEWABLE.map((s) => (
              <button
                key={s}
                onClick={() => playIntro(s)}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:border-[#00c0fa]/60 hover:text-white transition"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                  <path d="M8 5.3v13.4c0 .8.86 1.28 1.54.86l10.7-6.7a1 1 0 0 0 0-1.72L9.54 4.44C8.86 4.02 8 4.5 8 5.3z" />
                </svg>
                {INTRO_STYLES.find((x) => x.value === s)!.label}
              </button>
            ))}
          </div>
        </div>
        <DeviceToggle k="argus_intro_ses" title={tt('Giriş sesi')} hint={tt('Animasyona eşlik eden kısa bir ses.')} />
      </SettingsSection>

      <SettingsSection title={tt('Açılış penceresi')} description={tt('ARGUS hazırlanırken görünen küçük logolu pencere. Değişiklik bir sonraki açılışta görünür.')}>
        <DeviceToggle k="argus_splash_ciz" title={tt('Arkada afiş duvarı')} hint={tt('Pencerenin arkasında son eklediklerinin afişleri yavaşça akar.')} />
      </SettingsSection>

      <SettingsSection title={tt('Kim izliyor?')} description={tt('Profil seçme ekranı.')}>
        <DeviceToggle k="argus_profil_gecis" title={tt('Profil seçince avatar ekrana yayılsın')} hint={tt('Seçtiğin avatar ortaya gelir, parlar ve bütün ekrana yayılarak ana sayfaya dönüşür.')} />
      </SettingsSection>
    </div>
  )
}

// Profil Ayarları (bu profil)
export function ProfileExtras() {
  const { on } = useExtras()
  const P = useProfileToggle()
  return (
    <div className="space-y-5 mt-8">
      <SettingsSection title={tt('Profil fotoğrafı')} description={tt('Bu profil için.')}>
        {P('moodAvatar', tt('Canlı duygu avatarı'), tt('Avatarın son izlediğine, verdiğin puana ve saate göre ifade değiştirir.'))}
        {P('avatarTabs', tt('Avatarlar sekmelerde'), tt('Duygular ve Kahramanlar ayrı; en çok izlediğin türün kahramanı "Sana uygun".'))}
        {P('avatarCrop', tt('Kırpma ve arşivden seçme'), tt('Fotoğraf yükleyince sürükleyip yakınlaştırırsın; afişlerinden ya da oyunculardan avatar seçebilirsin.'))}
        {P('avatarFrames', tt('Kazanılan çerçeveler'), tt('İzledikçe avatarına bronz, gümüş, altın ve neon çerçeve.'))}
      </SettingsSection>
      <SettingsSection title={tt('Profil menüsündeki sayfalar')} description={tt('Açtıkların sağ üstteki profil menüsünde görünür.')}>
        {P('together', tt('Birlikte izle'), tt('Başka bir profille ortak izlenecekleriniz ve ikiniz için Ne İzlesem.'))}
        {P('taste', tt('Zevk uyumu'), tt('Birlikte izle sayfasında iki profilin puan uyumu ve "Bunu ona öner".'), !on('together'))}
        {P('achievements', tt('Başarımlar'), tt('İzledikçe kazanılan rozetler; kazanınca bildirim gelir.'))}
        {P('quiz', tt('Sahneden bil'), tt('Arşivindeki yapımlardan gerçek sahneler gelir, hangi yapım olduğunu tahmin edersin.'))}
      </SettingsSection>
      <SettingsSection title={tt('Detay penceresi')} description={tt('Bir yapımın detayını açınca.')}>
        {P('seriesPlan', tt('Dizi bitirme planı'), tt('"X günde bitir"; kalan bölümler günlere bölünür, takvimde görünür.'))}
        {P('shareCard', tt('Paylaşım kartı'), tt('"Aklımda tut"un yanında "Paylaş" düğmesi: arkadaşına göndermek için dikey bir görsel.'))}
      </SettingsSection>
    </div>
  )
}

// Uygulama Ayarları › Zil bildirimleri (bu profil)
export function NotifyExtras() {
  const P = useProfileToggle()
  return (
    <SettingsSection title={tt('Zil bildirimleri')} description={tt('Bu profil için. Sağ üstteki zile düşer.')}>
      {P('follow', tt('Oyuncu ve yönetmen takibi'), tt('Oyuncu sayfasında "Takip et"; yeni filmi duyurulunca bildirim.'))}
      {P('weekly', tt('Haftalık özet'), tt('Her Pazar akşamı haftanın özeti bildirim olarak gelir.'))}
    </SettingsSection>
  )
}
