import { useEffect, useState, type ReactNode } from 'react'
import { PanelHeader, SettingsSection, choiceClass } from './SettingsUi'
import ToggleSwitch from '../ToggleSwitch'
import { useToast } from '../../hooks/useToast'
import type { AppSettings } from '../../lib/desktopApp'

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
      if (patch.kisayol && !next.kisayolCalisiyor) notify('Ctrl+Alt+A başka bir program tarafından kullanılıyor, kısayol çalışmayacak.', 'danger')
      else notify(message)
    } catch {
      notify('Ayar kaydedilemedi.', 'danger')
    }
  }

  return (
    <div className="space-y-5">
      <PanelHeader title="Uygulama Ayarları" description="ARGUS uygulamasının bu bilgisayarda nasıl açılıp kapanacağı, bildirimleri ve görünümü." />
      {!bridge ? (
        <p className="text-sm text-neutral-400 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          Bu ayarlar ARGUS uygulamasında çalışır. Şu an ARGUS'u tarayıcıda açmışsın; masaüstündeki ARGUS simgesinden açınca buradan değiştirebilirsin.
        </p>
      ) : !s ? (
        <p className="text-sm text-neutral-500">Yükleniyor...</p>
      ) : (
        <>
          <SettingsSection title="Açılış" description="Bilgisayarını açtığında ve ARGUS'u açtığında ne olacağı.">
            <Row title="Bilgisayar açılınca ARGUS'u da aç" description="Windows'a giriş yaptığında ARGUS kendiliğinden başlar.">
              <ToggleSwitch
                label="Bilgisayar açılınca ARGUS'u da aç"
                checked={s.baslangic}
                disabled={!s.exeVar}
                onChange={(v) => update({ baslangic: v }, v ? 'ARGUS bilgisayar açılınca kendiliğinden başlayacak.' : 'ARGUS artık bilgisayar açılınca başlamayacak.')}
              />
            </Row>
            <Row
              title="Pencereyi açmadan, tepside başlasın"
              description={
                s.tepsi
                  ? 'Bilgisayar açılınca ARGUS pencere açmadan saatin yanındaki simgelerde bekler; simgesine tıklayınca açılır.'
                  : 'Bunun için aşağıdaki "Kapatınca tepsiye küçült" açık olmalı.'
              }
              dim={!s.baslangic || !s.tepsi}
            >
              <ToggleSwitch
                label="Pencereyi açmadan, tepside başlasın"
                checked={s.gizliBasla && s.tepsi}
                disabled={!s.baslangic || !s.tepsi}
                onChange={(v) => update({ gizliBasla: v }, v ? 'Bilgisayar açılınca ARGUS tepside başlayacak.' : 'Bilgisayar açılınca ARGUS penceresiyle açılacak.')}
              />
            </Row>
            <Row title="Hep büyütülmüş pencereyle aç" description="ARGUS her açılışta ekranı kaplayan büyütülmüş pencereyle açılır.">
              <ToggleSwitch
                label="Hep büyütülmüş pencereyle aç"
                checked={s.buyukBasla}
                onChange={(v) => update({ buyukBasla: v }, v ? 'ARGUS hep büyütülmüş açılacak.' : 'ARGUS son bıraktığın boyutta açılacak.')}
              />
            </Row>
          </SettingsSection>

          <SettingsSection title="Kapatma ve tepsi" description="Pencerenin sağ üstündeki × düğmesine bastığında ne olacağı.">
            <Row
              title="Kapatınca tepsiye küçült"
              description={
                <>
                  Açıksa × ARGUS'u kapatmaz, saatin yanındaki simgelere (sistem tepsisi) küçültür; ARGUS arkada çalışmaya devam eder, otomatik yedekleme ve yeni bölüm
                  kontrolleri de sürer. Simgeye tıklayınca açılır; sağ tıklayınca "Ne İzlesem?", "Takvim" ve "Bugün izlediğimi ekle" kısayolları ile "ARGUS'u kapat"
                  çıkar. Kapalıysa × ARGUS'u tamamen kapatır.
                </>
              }
            >
              <ToggleSwitch
                label="Kapatınca tepsiye küçült"
                checked={s.tepsi}
                onChange={(v) => update({ tepsi: v }, v ? '× artık ARGUS\'u tepsiye küçültecek.' : '× artık ARGUS\'u tamamen kapatacak.')}
              />
            </Row>
          </SettingsSection>

          <SettingsSection title="Bildirimler">
            <Row
              title="Yeni bölüm ve sezon haberlerini Windows bildirimi olarak göster"
              description="Zildeki haberler (izlediğin diziye yeni bölüm geldi, yeni sezon açıklandı…) ekranın köşesinde Windows bildirimi olarak da çıkar — ARGUS tepsideyken bile. Bildirime tıklayınca o dizinin detayı açılır."
            >
              <ToggleSwitch
                label="Windows bildirimleri"
                checked={s.bildirim}
                onChange={(v) => update({ bildirim: v }, v ? 'Yeni haberler Windows bildirimi olarak da çıkacak.' : 'Windows bildirimleri kapatıldı (zil yine çalışır).')}
              />
            </Row>
          </SettingsSection>

          <SettingsSection title="Görünüm ve kısayollar">
            <Row title="Yazı ve arayüz boyutu" description="Her şeyi biraz büyütür ya da küçültür. Klavyeden Ctrl + ve Ctrl − ile de değişir, Ctrl 0 ile %100'e döner.">
              <div className="flex gap-1">
                {ZOOMS.map(([z, label]) => (
                  <button key={z} onClick={() => update({ zoom: z }, `Yazı ve arayüz boyutu: ${label}`)} className={`text-xs rounded-lg border px-2.5 py-1.5 transition ${choiceClass(s.zoom === z)}`}>
                    {label}
                  </button>
                ))}
              </div>
            </Row>
            <Row
              title="Ctrl + Alt + A ile ARGUS'u öne getir"
              description={
                s.kisayol && !s.kisayolCalisiyor
                  ? 'Bu tuş birleşimini başka bir program kullanıyor, şu an çalışmıyor.'
                  : 'Hangi programda olursan ol, bu tuşlara basınca ARGUS öne gelir (tepsideyse açılır).'
              }
            >
              <ToggleSwitch
                label="Ctrl + Alt + A kısayolu"
                checked={s.kisayol}
                onChange={(v) => update({ kisayol: v }, v ? 'Ctrl + Alt + A ile ARGUS öne gelecek.' : 'Kısayol kapatıldı.')}
              />
            </Row>
          </SettingsSection>

          <SettingsSection title="Güncellemeler">
            <Row
              title="Yeni sürüm çıkınca"
              description={
                s.guncelleme === 'sor'
                  ? 'ARGUS açılırken yeni sürüm varsa açılış penceresinde sorar: "Güncelle" ya da "Şimdilik atla". Atlarsan ARGUS içinden "Şimdi Güncelle" ile sonra da güncelleyebilirsin.'
                  : 'ARGUS açılırken yeni sürüm varsa kendiliğinden güncellenir.'
              }
            >
              <div className="flex gap-1">
                {(
                  [
                    ['otomatik', 'Kendiliğinden güncelle'],
                    ['sor', 'Önce sor'],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} onClick={() => update({ guncelleme: k }, k === 'sor' ? 'Yeni sürüm çıkınca önce sorulacak.' : 'Yeni sürümler kendiliğinden yüklenecek.')} className={`text-xs rounded-lg border px-2.5 py-1.5 transition ${choiceClass(s.guncelleme === k)}`}>
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
