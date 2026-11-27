import { useEffect, useState } from 'react'
import { SettingsSection, choiceClass } from '../settings/SettingsUi'
import ToggleSwitch from '../ToggleSwitch'
import { ArgusNative } from '../../lib/mobile/native'
import { deviceSet, useDevice, type IntroStyle } from '../../lib/extras'
import { INTRO_STYLES } from '../settings/ExtraSettings'
import { normalizeIntro, playIntro } from '../IntroFx'
import { tt } from '../../lib/i18n'

// Telefon Ayarları › Görünüm ve açılış (v1.27, T1–T2): yazı boyutu (telefonun WebView yazı yakınlaştırması; düzen
// bozulmasın diye sayfa değil yazılar büyür, bkz. ArgusPlugin.setTextZoom), giriş animasyonu, giriş sesi ve profil
// geçişi. PC'dekilerle aynı anahtarlar ama telefonda PC'ye eşlenmez (ui-prefs telefonda yerel), yani ayarlar bu telefona ait.
const SIZES: [number, string][] = [
  [90, '%90'],
  [100, '%100'],
  [110, '%110'],
  [125, '%125'],
]
// Telefonda "Sırayla" yerine kısa liste: Kapalı / İmza / Işık / Odak / Rastgele
const PHONE_INTROS = INTRO_STYLES.filter((x) => x.value !== 'sirayla')

export default function PhoneLookSection() {
  const [zoom, setZoom] = useState<number | null>(null)
  const intro = normalizeIntro(useDevice('argus_intro'))
  const sound = useDevice('argus_intro_ses') === '1'
  const morph = useDevice('argus_profil_gecis') === '1'
  useEffect(() => {
    ArgusNative.getTextZoom()
      .then((r) => setZoom(r.percent))
      .catch(() => setZoom(100))
  }, [])

  async function pickZoom(p: number) {
    setZoom(p)
    try {
      await ArgusNative.setTextZoom({ percent: p })
    } catch {
      /* eski uygulama: yoksay */
    }
  }
  function pickIntro(v: IntroStyle) {
    deviceSet('argus_intro', v)
    // Seçilen hemen bir kez oynasın ki nasıl olduğu görülsün
    if (v === 'argus' || v === 'isik' || v === 'odak') playIntro(v)
  }

  const row = (title: string, hint: string, on: boolean, set: (v: boolean) => void) => (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-neutral-100">{title}</p>
        <p className="text-xs text-neutral-500 leading-relaxed">{hint}</p>
      </div>
      <ToggleSwitch checked={on} onChange={set} label={title} />
    </div>
  )

  return (
    <SettingsSection title={tt('Görünüm ve açılış')} description={tt('Bu ayarlar sadece bu telefonda geçerli.')}>
      <div>
        <p className="text-sm text-neutral-100">{tt('Yazı boyutu')}</p>
        <p className="text-xs text-neutral-500 leading-relaxed mb-2">{tt('Uygulamadaki bütün yazılar büyür ya da küçülür.')}</p>
        <div className="flex gap-1.5">
          {SIZES.map(([p, label]) => (
            <button key={p} onClick={() => pickZoom(p)} className={`flex-1 text-sm rounded-lg border py-2 transition ${choiceClass(zoom === p)}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm text-neutral-100">{tt('Giriş animasyonu')}</p>
        <p className="text-xs text-neutral-500 leading-relaxed mb-2">{tt('ARGUS açılırken bir kez oynar; dokununca geçilir.')}</p>
        <div className="flex flex-wrap gap-1.5">
          {PHONE_INTROS.map((x) => (
            <button key={x.value} onClick={() => pickIntro(x.value)} className={`text-xs rounded-full border px-3.5 py-1.5 transition ${choiceClass(intro === x.value)}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {intro !== 'kapali' &&
        row(tt('Giriş sesi'), tt('Animasyona eşlik eden kısa bir akor. Telefonun medya sesi kısıksa duyulmaz.'), sound, (v) => deviceSet('argus_intro_ses', v ? '1' : '0'))}
      {row(tt('Profil seçince avatar ekrana yayılsın'), tt('Seçtiğin avatar ortaya gelir, parlar ve bütün ekrana yayılarak ana sayfaya dönüşür.'), morph, (v) => deviceSet('argus_profil_gecis', v ? '1' : '0'))}
    </SettingsSection>
  )
}
