import type { ReactNode } from 'react'
import { PanelHeader, SettingsSection } from './SettingsUi'
import ToggleSwitch from '../ToggleSwitch'
import Select from '../Select'
import { deviceSet, PICKER_ANIMS, useDevice, useExtras, type DeviceExtra, type IntroStyle, type PickerAnim, type ProfileExtra } from '../../lib/extras'
import { tt } from '../../lib/i18n'

// Ayarlar › Ekstralar (v1.23.4): isteğe bağlı bütün yenilikler tek yerde, hepsi varsayılan kapalı (bkz. lib/extras.ts).

function Row({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-neutral-800/70 last:border-0">
      <span className="min-w-0">
        <span className="block text-sm text-neutral-200">{title}</span>
        <span className="block text-xs text-neutral-500 mt-0.5 leading-relaxed">{hint}</span>
      </span>
      <span className="shrink-0 pt-0.5">{children}</span>
    </div>
  )
}

export default function ExtrasPanel() {
  const { on, set, settings, saveSettings } = useExtras()
  const P = (k: ProfileExtra, title: string, hint: string) => (
    <Row title={title} hint={hint}>
      <ToggleSwitch checked={on(k)} onChange={(v) => set(k, v)} label={title} />
    </Row>
  )
  const intro = (useDevice('argus_intro') as IntroStyle | null) ?? 'kapali'
  const D = (k: DeviceExtra, title: string, hint: string) => <DeviceToggle k={k} title={title} hint={hint} />

  return (
    <div className="space-y-5">
      <PanelHeader title={tt('Ekstralar')} description={tt('İsteğe bağlı yenilikler. Hepsi kapalı başlar; istediğini aç. "Bu profil" yazanlar sadece bu profilde, "bu bilgisayar" yazanlar herkes için geçerli.')} />

      <SettingsSection title={tt('Ne İzlesem?')} description={tt('Bu profil')}>
        <Row title={tt('Seçim animasyonu')} hint={tt('Kazanan nasıl seçilsin: klasik dağılma, çark, slot makinesi, kart destesi, film şeridi ya da her seferinde farklı.')}>
          <Select
            value={settings.pickerAnim ?? 'klasik'}
            onChange={(v) => saveSettings({ ...settings, pickerAnim: v as PickerAnim })}
            options={PICKER_ANIMS.map((a) => ({ value: a.id, label: a.label }))}
            className="w-48"
          />
        </Row>
        {P('pickerTrio', tt('Üç aday modu'), tt('Tek sonuç yerine üç aday gelir; istemediğini ✕ ile elersin, son kalan seçilir.'))}
        {P('pickerWizard', tt('"Bu akşam" soruları'), tt('Başlamadan önce üç soru: kiminle, ne kadar vaktin var, nasıl hissetmek istiyorsun.'))}
        {P('pickerEndTime', tt('Bitiş saati ve "neden bu?"'), tt('Sonuçta "şimdi başlarsan bitiş: 23:47" ve neden seçildiği. Boşluk tuşu tekrar getirir.'))}
      </SettingsSection>

      <SettingsSection title={tt('Açılış')} description={tt('Bu bilgisayar')}>
        <Row title={tt('Giriş animasyonu')} hint={tt('ARGUS açılınca kısa bir giriş: sinema ışıkları, eski film geri sayımı ya da tiyatro perdesi.')}>
          <Select
            value={intro}
            onChange={(v) => deviceSet('argus_intro', v)}
            options={[
              { value: 'kapali', label: tt('Kapalı') },
              { value: 'sinema', label: tt('Sinema') },
              { value: 'geri-sayim', label: tt('Film geri sayımı') },
              { value: 'perde', label: tt('Perde') },
            ]}
            className="w-44"
          />
        </Row>
        {D('argus_intro_ses' as DeviceExtra, tt('Giriş sesi'), tt('Giriş animasyonunda kısa bir ses.'))}
        {D('argus_splash_ciz', tt('Açılış penceresinde logo çizimi'), tt('Açılış penceresinde logo çizilerek gelir, arkada son eklediklerinin afişleri akar.'))}
        {D('argus_splash_bilgi', tt('Açılış penceresinde bugünün haberi'), tt('Beklerken yeni bölümler, geçen yıl bugün izlediğin ve evren turunda sıradaki.'))}
        {D('argus_profil_gecis', tt('Profil seçince avatar ekrana yayılsın'), tt('"Kim izliyor?" ekranında seçtiğin avatar büyüyerek ana sayfaya dönüşür.'))}
        {D('argus_mevsim', tt('Mevsimlik dokunuşlar'), tt('Kışın kar, Cadılar Bayramı\'nda yarasalar, yılbaşında yıldızlar: açılış penceresinde ve vitrinde.'))}
      </SettingsSection>

      <SettingsSection title={tt('Menü ve arama')} description={tt('Bu profil')}>
        {P('menuV2', tt('Yeni profil menüsü'), tt('Bu ayın özeti, hızlı işlemler (Ne İzlesem, Bugün izledim, Yeni ekle, Takvim), gruplu bağlantılar ve kısayollar.'))}
        {P('searchV2', tt('Gelişmiş arama'), tt('Son aramalar, ">" ile komutlar, TMDB\'den ekleme, "korku 2010 8+" gibi akıllı arama, Türkçe karakter esnekliği, ok tuşlarıyla gezinme.'))}
      </SettingsSection>

      <SettingsSection title={tt('Profil fotoğrafı')} description={tt('Bu profil')}>
        {P('moodAvatar', tt('Canlı duygu avatarı'), tt('Avatarın son izlediğine, verdiğin puana ve saate göre ifade değiştirir.'))}
        {P('avatarTabs', tt('Avatarlar sekmelerde'), tt('Duygular ve Kahramanlar ayrı; en çok izlediğin türün kahramanı "Sana uygun".'))}
        {P('avatarCrop', tt('Kırpma ve arşivden seçme'), tt('Fotoğraf yükleyince sürükleyip yakınlaştırırsın; afişlerinden ya da oyunculardan avatar seçebilirsin.'))}
        {P('avatarFrames', tt('Kazanılan çerçeveler'), tt('İzledikçe avatarına bronz, gümüş, altın ve neon çerçeve.'))}
      </SettingsSection>

      <SettingsSection title={tt('Yeni özellikler')} description={tt('Bu profil')}>
        {P('together', tt('Birlikte izle'), tt('Başka bir profille ortak izlenecekleriniz ve ikiniz için Ne İzlesem. Profil menüsünde.'))}
        {P('taste', tt('Zevk uyumu'), tt('Birlikte izle sayfasında iki profilin puan uyumu ve "Bunu ona öner".'))}
        {P('achievements', tt('Başarımlar'), tt('Kalıcı rozetler; kazanınca bildirim. Profil menüsünde.'))}
        <Row title={tt('Yıllık hedef')} hint={tt('Bu yıl kaç yapım bitirmek istiyorsun? Ana sayfada ve menüde halka. 0 = kapalı.')}>
          <input
            type="number"
            min={0}
            max={2000}
            value={settings.yearGoal ?? 0}
            onChange={(e) => saveSettings({ ...settings, yearGoal: Math.max(0, Math.min(2000, Number(e.target.value) || 0)) })}
            className="w-24 rounded-lg bg-neutral-800 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]"
          />
        </Row>
        {P('follow', tt('Oyuncu ve yönetmen takibi'), tt('Oyuncu sayfasında "Takip et"; yeni filmi duyurulunca bildirim.'))}
        {P('seriesPlan', tt('Dizi bitirme planı'), tt('Dizinin detayında "X günde bitir"; kalan bölümler günlere bölünür, takvimde görünür.'))}
        {P('quiz', tt('Sahneden bil'), tt('Arşivindeki görsellerle bulanık başlayan tahmin oyunu. Profil menüsünde.'))}
        {P('weekly', tt('Haftalık özet'), tt('Her Pazar akşamı haftanın özeti bildirim olarak gelir.'))}
        {P('shareCard', tt('"Bunu izle!" kartı'), tt('Detay penceresinde, paylaşmak için dikey bir görsel.'))}
      </SettingsSection>
      <p className="text-xs text-neutral-500">{tt('PIN ve çocuk profili, profil düzenleme penceresinde (Ayarlar › Profil Ayarları).')}</p>
    </div>
  )
}

function DeviceToggle({ k, title, hint }: { k: DeviceExtra; title: string; hint: string }) {
  const v = useDevice(k) === '1'
  return (
    <Row title={title} hint={hint}>
      <ToggleSwitch checked={v} onChange={(nv) => deviceSet(k, nv ? '1' : '0')} label={title} />
    </Row>
  )
}
