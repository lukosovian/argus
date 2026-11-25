import { useEffect, useState, type ReactNode } from 'react'
import { PanelHeader, SettingsSection, choiceClass } from './SettingsUi'
import ToggleSwitch from '../ToggleSwitch'
import PhonePanel from './PhonePanel'
import MobileConnectionPanel from '../mobile/MobileConnectionPanel'
import { isMobileApp } from '../../lib/mobile/native'
import { useToast } from '../../hooks/useToast'
import type { AppSettings } from '../../lib/desktopApp'
import { LANGS, getLang, setLang, tt } from '../../lib/i18n'
import { LineSkeleton } from '../Skeleton'
import { NotifyExtras } from './ExtraSettings'

// Ayarlar › Uygulama Ayarları — kullanıcı "ana sayfa ayarlarının altına Windows ayarları gibi bir yer; bilgisayar
// açılırken açılsın, kapatınca tepsiye küçülsün" dedi, sonra önerilenlerin hepsini istedi (bildirimler, yazı
// boyutu, büyütülmüş açılış, kısayol tuşu, tepsi menüsü kısayolları, güncelleme tercihi). Bu ayarlar bu
// bilgisayardaki ARGUS uygulamasına ait; uygulama (desktop/preload.cjs) `window.argusApp` köprüsünü açıyor.

function Row({ title, description, children, dim }: { title: string; description?: ReactNode; children: ReactNode; dim?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${dim ? 'opacity-60' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm text-neutral-100">{title}</p>
        {description && <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="pt-0.5 shrink-0">{children}</div>
    </div>
  )
}

// Sessiz saatler (v1.26, Y7): bu aralıkta Windows bildirimi çıkmaz, haberler zilde birikir; aralık bitince tek bir özet
// bildirim gelir (bkz. desktop/main.cjs inQuietHours). Ayarlar bu bilgisayardaki uygulamada (ayarlar.json).
type QuietSettings = AppSettings & { sessiz: boolean; sessizBas: string; sessizBit: string }
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
function QuietHoursRow({ s, dim, onChange }: { s: QuietSettings; dim: boolean; onChange: (patch: Partial<QuietSettings>, message: string) => void }) {
  const sel = 'rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs text-neutral-100 outline-none disabled:opacity-40'
  return (
    <Row
      title={tt('Sessiz saatler')}
      description={tt('Bu saatler arasında Windows bildirimi çıkmaz, ses de gelmez; haberler zilde birikir ve aralık bitince tek bir özet bildirim olarak çıkar.')}
      dim={dim}
    >
      <div className="flex flex-col items-end gap-2">
        <ToggleSwitch
          label={tt('Sessiz saatler')}
          checked={s.sessiz}
          disabled={dim}
          onChange={(v) => onChange({ sessiz: v }, v ? tt('Sessiz saatler açık: {0}–{1}.', s.sessizBas, s.sessizBit) : tt('Sessiz saatler kapatıldı.'))}
        />
        <div className={`flex items-center gap-1.5 ${s.sessiz ? '' : 'opacity-50'}`}>
          <select value={s.sessizBas} disabled={dim || !s.sessiz} onChange={(e) => onChange({ sessizBas: e.target.value }, tt('Sessiz saatler: {0}–{1}.', e.target.value, s.sessizBit))} className={sel}>
            {[...new Set([...HOURS, s.sessizBas])].sort().map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <span className="text-xs text-neutral-500">–</span>
          <select value={s.sessizBit} disabled={dim || !s.sessiz} onChange={(e) => onChange({ sessizBit: e.target.value }, tt('Sessiz saatler: {0}–{1}.', s.sessizBas, e.target.value))} className={sel}>
            {[...new Set([...HOURS, s.sessizBit])].sort().map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Row>
  )
}

const ZOOMS: [number, string][] = [
  [0.9, '%90'],
  [1, '%100'],
  [1.1, '%110'],
  [1.25, '%125'],
]

export default function AppSettingsPanel() {
  const { notify } = useToast()
  const bridge = typeof window !== 'undefined' ? window.argusApp : undefined
  const [s, setS] = useState<AppSettings | null>(null)
  const mobile = isMobileApp()

  useEffect(() => {
    bridge
      ?.getSettings()
      .then(setS)
      .catch(() => {})
  }, [bridge])

  async function update(patch: Partial<AppSettings>, message: string) {
    if (!bridge) return
    try {
      const next = await bridge.setSettings(patch)
      setS(next)
      if (patch.kisayol && !next.kisayolCalisiyor) notify(tt('Ctrl+Alt+A başka bir program tarafından kullanılıyor, kısayol çalışmayacak.'), 'danger')
      else notify(message)
    } catch {
      notify(tt('Ayar kaydedilemedi.'), 'danger')
    }
  }

  return (
    <div className="space-y-5">
      <PanelHeader
        title={tt('Uygulama Ayarları')}
        description={mobile ? tt('Telefondaki ARGUS\'un dili ve PC ile bağlantısı.') : tt('ARGUS uygulamasının bu bilgisayarda nasıl açılıp kapanacağı, bildirimleri ve görünümü.')}
      />
      {/* Dil: tarayıcıda açıkken de değiştirilebilir. Seçenek adları her zaman kendi dilinde yazar. */}
      <SettingsSection title={getLang() === 'tr' ? 'Dil · Language' : 'Language · Dil'}>
        <Row title={tt('Arayüz dili')} description={tt('Menüler, yazılar ve bildirimler bu dilde olur. TMDB\'den yeni gelen bilgiler (özet, türler, başlıklar) de bu dilde gelir; arşivindeki mevcut kayıtlar değişmez.')}>
          <div className="flex gap-1">
            {LANGS.map((l) => (
              <button key={l.id} onClick={() => l.id !== getLang() && setLang(l.id)} className={`text-xs rounded-lg border px-2.5 py-1.5 transition ${choiceClass(getLang() === l.id)}`}>
                {l.label}
              </button>
            ))}
          </div>
        </Row>
      </SettingsSection>
      {mobile ? (
        // Telefondaki ARGUS: bilgisayara özel ayarlar (açılış, tepsi…) yerine PC bağlantısı
        <MobileConnectionPanel />
      ) : (
        <PhonePanel />
      )}
      {!mobile && <NotifyExtras />}
      {mobile ? null : !bridge ? (
        <p className="text-sm text-neutral-400 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          {tt('Bu ayarlar ARGUS uygulamasında çalışır. Şu an ARGUS\'u tarayıcıda açmışsın; masaüstündeki ARGUS simgesinden açınca buradan değiştirebilirsin.')}
        </p>
      ) : !s ? (
        <LineSkeleton />
      ) : (
        <>
          <SettingsSection title={tt('Açılış')} description={tt('Bilgisayarını açtığında ve ARGUS\'u açtığında ne olacağı.')}>
            <Row title={tt('Bilgisayar açılınca ARGUS\'u da aç')} description={tt('Windows\'a giriş yaptığında ARGUS kendiliğinden başlar.')}>
              <ToggleSwitch
                label={tt('Bilgisayar açılınca ARGUS\'u da aç')}
                checked={s.baslangic}
                disabled={!s.exeVar}
                onChange={(v) => update({ baslangic: v }, v ? tt('ARGUS bilgisayar açılınca kendiliğinden başlayacak.') : tt('ARGUS artık bilgisayar açılınca başlamayacak.'))}
              />
            </Row>
            <Row
              title={tt('Pencereyi açmadan, tepside başlasın')}
              description={
                s.tepsi
                  ? tt('Bilgisayar açılınca ARGUS pencere açmadan saatin yanındaki simgelerde bekler; simgesine tıklayınca açılır.')
                  : tt('Bunun için aşağıdaki "Kapatınca tepsiye küçült" açık olmalı.')
              }
              dim={!s.baslangic || !s.tepsi}
            >
              <ToggleSwitch
                label={tt('Pencereyi açmadan, tepside başlasın')}
                checked={s.gizliBasla && s.tepsi}
                disabled={!s.baslangic || !s.tepsi}
                onChange={(v) => update({ gizliBasla: v }, v ? tt('Bilgisayar açılınca ARGUS tepside başlayacak.') : tt('Bilgisayar açılınca ARGUS penceresiyle açılacak.'))}
              />
            </Row>
            <Row title={tt('Hep büyütülmüş pencereyle aç')} description={tt('ARGUS her açılışta ekranı kaplayan büyütülmüş pencereyle açılır.')}>
              <ToggleSwitch
                label={tt('Hep büyütülmüş pencereyle aç')}
                checked={s.buyukBasla}
                onChange={(v) => update({ buyukBasla: v }, v ? tt('ARGUS hep büyütülmüş açılacak.') : tt('ARGUS son bıraktığın boyutta açılacak.'))}
              />
            </Row>
          </SettingsSection>

          <SettingsSection title={tt('Kapatma ve tepsi')} description={tt('Pencerenin sağ üstündeki × düğmesine bastığında ne olacağı.')}>
            <Row
              title={tt('Kapatınca tepsiye küçült')}
              description={
                <>
                  {tt('Açıksa × ARGUS\'u kapatmaz, saatin yanındaki simgelere (sistem tepsisi) küçültür; ARGUS arkada çalışmaya devam eder, otomatik yedekleme ve yeni bölüm kontrolleri de sürer. Simgeye tıklayınca açılır; sağ tıklayınca en üstte "Kaldığın yerden" (izlediğin son 3 dizinin sıradaki bölümü, tek tıkla bugünün tarihiyle işaretlenir), sonra "Ne İzlesem?", "Takvim" ve "Bugün izlediğimi ekle" kısayolları ile "ARGUS\'u kapat" çıkar. Kapalıysa × ARGUS\'u tamamen kapatır.')}
                </>
              }
            >
              <ToggleSwitch
                label={tt('Kapatınca tepsiye küçült')}
                checked={s.tepsi}
                onChange={(v) => update({ tepsi: v }, v ? tt('× artık ARGUS\'u tepsiye küçültecek.') : tt('× artık ARGUS\'u tamamen kapatacak.'))}
              />
            </Row>
          </SettingsSection>

          <SettingsSection title={tt('Bildirimler')}>
            <Row
              title={tt('Yeni bölüm ve sezon haberlerini Windows bildirimi olarak göster')}
              description={tt('Zildeki haberler (izlediğin diziye yeni bölüm geldi, yeni sezon açıklandı…) ekranın köşesinde Windows bildirimi olarak da çıkar — ARGUS tepsideyken bile. Bildirime tıklayınca o dizinin detayı açılır.')}
            >
              <ToggleSwitch
                label={tt('Windows bildirimleri')}
                checked={s.bildirim}
                onChange={(v) => update({ bildirim: v }, v ? tt('Yeni haberler Windows bildirimi olarak da çıkacak.') : tt('Windows bildirimleri kapatıldı (zil yine çalışır).'))}
              />
            </Row>
            {/* v1.26 (Y7): sessiz saatler — uygulamanın eski sürümü bu alanları bilmiyorsa satır görünmez */}
            {typeof (s as QuietSettings).sessiz === 'boolean' && (
              <QuietHoursRow
                s={s as QuietSettings}
                dim={!s.bildirim}
                onChange={(patch, message) => update(patch as Partial<AppSettings>, message)}
              />
            )}
          </SettingsSection>

          <SettingsSection title={tt('Görünüm ve kısayollar')}>
            <Row title={tt('Yazı ve arayüz boyutu')} description={tt('Her şeyi biraz büyütür ya da küçültür. Klavyeden Ctrl + ve Ctrl − ile de değişir, Ctrl 0 ile %100\'e döner.')}>
              <div className="flex gap-1">
                {ZOOMS.map(([z, label]) => (
                  <button key={z} onClick={() => update({ zoom: z }, tt('Yazı ve arayüz boyutu: {0}', label))} className={`text-xs rounded-lg border px-2.5 py-1.5 transition ${choiceClass(s.zoom === z)}`}>
                    {label}
                  </button>
                ))}
              </div>
            </Row>
            <Row
              title={tt('Ctrl + Alt + A ile ARGUS\'u öne getir')}
              description={
                s.kisayol && !s.kisayolCalisiyor
                  ? tt('Bu tuş birleşimini başka bir program kullanıyor, şu an çalışmıyor.')
                  : tt('Hangi programda olursan ol, bu tuşlara basınca ARGUS öne gelir (tepsideyse açılır).')
              }
            >
              <ToggleSwitch
                label={tt('Ctrl + Alt + A kısayolu')}
                checked={s.kisayol}
                onChange={(v) => update({ kisayol: v }, v ? tt('Ctrl + Alt + A ile ARGUS öne gelecek.') : tt('Kısayol kapatıldı.'))}
              />
            </Row>
          </SettingsSection>

          <SettingsSection title={tt('Güncellemeler')}>
            <Row
              title={tt('Yeni sürüm çıkınca')}
              description={
                s.guncelleme === 'sor'
                  ? tt('ARGUS açılırken yeni sürüm varsa açılış penceresinde sorar: "Güncelle" ya da "Şimdilik atla". Atlarsan ARGUS içinden "Şimdi Güncelle" ile sonra da güncelleyebilirsin.')
                  : tt('ARGUS açılırken yeni sürüm varsa kendiliğinden güncellenir.')
              }
            >
              <div className="flex gap-1">
                {(
                  [
                    ['otomatik', tt('Kendiliğinden güncelle')],
                    ['sor', tt('Önce sor')],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} onClick={() => update({ guncelleme: k }, k === 'sor' ? tt('Yeni sürüm çıkınca önce sorulacak.') : tt('Yeni sürümler kendiliğinden yüklenecek.'))} className={`text-xs rounded-lg border px-2.5 py-1.5 transition ${choiceClass(s.guncelleme === k)}`}>
                    {label}
                  </button>
                ))}
              </div>
            </Row>
          </SettingsSection>
        </>
      )}
    </div>
  )
}
