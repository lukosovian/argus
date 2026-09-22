import { useEffect, useState } from 'react'
import { useBoards } from '../../hooks/useBoards'
import { useHomeSettings } from '../../hooks/useHomeSettings'
import { HOME_LAYOUT_LABELS, type HomeLayout, type HomeSection, type MoodRowSettings } from '../../types'
import HomeSectionEditor from '../HomeSectionEditor'
import MoodRowEditor from '../MoodRowEditor'
import PropertyFilterPicker from '../PropertyFilterPicker'
import ToggleSwitch from '../ToggleSwitch'
import Select from '../Select'
import { BRAND_TEXT } from '../../lib/theme'

const TABS = [
  { id: 'gorunum', label: 'Görünüm' },
  { id: 'sayfalar', label: 'Sayfalar' },
  { id: 'mod', label: 'Modlar' },
  { id: 'nizlesem', label: 'Ne İzlesem?' },
] as const
type TabId = (typeof TABS)[number]['id']

// Sabit hex yerine CSS değişkenine işaret ediyorlar (bkz. YardimMerkezi.tsx'teki aynı not) —
// açık temada da doğru renklere dönsünler diye.
const WF_FILL = 'var(--color-neutral-800)'
const WF_STROKE = 'var(--color-neutral-600)'
const WF_LINE = 'var(--color-neutral-700)'
const WF_EMPHASIS = 'var(--color-neutral-400)'

// İki taslak da AYNI yapıyı (sayfa boyunca alt alta dizilen, HER BİRİ kendi içinde sağa-sola
// kaydırmalı satırlar) gösteriyor — kullanıcı "bu dikey görünümün farkı dikey posterlerin
// gelmesi sadece" dedi: "Izgara" hiçbir yerde çok-satırlı bir ızgaraya dönüşmüyor, SADECE
// kartların kendisi (yatay banner / dikey poster) farklı. Bu yüzden iki taslak da iki satır
// gösteriyor, tek fark satırlardaki kartların en/boy oranı.
function TwoRowsSvg({ wide }: { wide: boolean }) {
  const cardW = wide ? 58 : 30
  const cardH = wide ? 34 : 40
  const xs = wide ? [8, 74, 140] : [8, 46, 84, 122]
  const lastW = wide ? 32 : 20
  const arrowX = wide ? 160 : 152
  const rowY = [6, 50]
  return (
    <svg viewBox="0 0 180 100" className="w-full h-auto block">
      {rowY.map((y) => (
        <g key={y}>
          {xs.slice(0, -1).map((x) => (
            <rect key={x} x={x} y={y} width={cardW} height={cardH} rx={4} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={1.2} />
          ))}
          <rect x={xs[xs.length - 1]} y={y} width={lastW} height={cardH} rx={4} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={1.2} opacity={0.45} />
          <path
            d={`M${arrowX} ${y + cardH / 2}h9M${arrowX + 5} ${y + cardH / 2 - 5}l5 5-5 5`}
            stroke={BRAND_TEXT}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      ))}
    </svg>
  )
}

// "Yatay" — YATAY/geniş (aspect-video) kartlar, HomeCard'ın `landscape=true` hâliyle aynı.
function YataySvg() {
  return <TwoRowsSvg wide />
}

// "Dikey" (eski adı "Izgara (grid)" — kullanıcı "ızgara grid in adı dikey olsun" dedi, sadece
// etiket değişti, veri anahtarı hâlâ 'izgara', bkz. types.ts) — DİKEY (aspect-[2/3]) poster
// kartlar, HomeCard'ın `landscape=false` hâliyle aynı; yapı (iki kaydırmalı satır) YATAY ile
// birebir aynı, sadece kart oranı farklı.
function DikeySvg() {
  return <TwoRowsSvg wide={false} />
}

// Vitrin ayarının taslağı — geniş bir afiş (oynat üçgeni + iki metin çubuğu) üstte, altında
// üç küçük kart: "ana sayfanın en üstünde, gerisinin üzerinde durur" fikrini tek bakışta anlatıyor.
function VitrinSvg() {
  return (
    <svg viewBox="0 0 180 90" className="w-full h-auto block">
      <rect x={4} y={4} width={172} height={48} rx={6} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={1.2} />
      <circle cx={28} cy={28} r={10} fill="none" stroke={BRAND_TEXT} strokeWidth={1.6} />
      <path d="M25 23v10l9-5-9-5Z" fill={BRAND_TEXT} />
      <rect x={48} y={18} width={62} height={7} rx={3} fill={WF_EMPHASIS} />
      <rect x={48} y={30} width={42} height={5} rx={2.5} fill={WF_LINE} />
      {[4, 62, 120].map((x) => (
        <rect key={x} x={x} y={60} width={54} height={26} rx={4} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={1} />
      ))}
    </svg>
  )
}

// Düz bir sayısal <input>, her tuş vuruşunda `onChange`de min/max'a kırpıp kaydediyorsa
// (önceki sürüm) çok basamaklı bir sayı yazmak imkansız oluyor — ör. min=6 iken "45" yazmak
// isteyince ilk "4" hemen "6"ya kırpılıyor, ikinci tuşla "65" oluyor. Kullanıcı "sayı
// giremiyorum düzgünce" dedi. Bunun yerine serbestçe yazılabilen bir taslak tutuluyor,
// kırpma/kaydetme sadece odak kaybedince (blur) ya da Enter'a basınca oluyor.
function ClampedNumberInput({
  value,
  min,
  max,
  onCommit,
  className,
}: {
  value: number
  min: number
  max: number
  onCommit: (v: number) => void
  className?: string
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  function commit() {
    const n = Math.max(min, Math.min(max, Number(draft) || min))
    setDraft(String(n))
    if (n !== value) onCommit(n)
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={className}
    />
  )
}

function moveInArray<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const next = index + dir
  if (index < 0 || next < 0 || next >= arr.length) return arr
  const copy = [...arr]
  ;[copy[index], copy[next]] = [copy[next], copy[index]]
  return copy
}

// order dizisini, list'teki mevcut id'lerin tamamını içerecek şekilde normalize eder
// (eksik olanlar önceki sırasıyla sona eklenir, artık listede olmayanlar düşer).
function normalizeOrder(order: string[], currentIds: string[]): string[] {
  const kept = order.filter((id) => currentIds.includes(id))
  const missing = currentIds.filter((id) => !kept.includes(id))
  return [...kept, ...missing]
}

// "Ana Sayfa Ayarları" sekmesinin içeriği — üstte üç alt-sekme: Görünüm (hangi arşiv, görünüm
// tarzı, vitrin, kapak-yok gizleme), Sayfalar (HomeSectionEditor, değişmeden), Mod (MoodRowEditor,
// değişmeden). Eskiden Boards.tsx'in aç/kapa panelindeydi, artık Ayarlar'ın kendi sekmesi.
//
// Görünüm sekmesi bu turda iki şekilde değişti: (1) native <select> (arşiv seçimi, ve
// PropertyFilterPicker'ın içindeki) yerine tema'ya uygun `Select` bileşeni, (2) sıra: vitrin
// (artık wireframe'li) → vitrin filtresi hemen altında → kapaksız gizle → (ayraç) → otomatik
// doldur en altta — kullanıcının istediği tam bu sıra.
export default function HomeSettingsPanel() {
  const { boards } = useBoards()
  const { settings, saveSettings } = useHomeSettings()
  const board = boards.find((b) => b.id === settings.boardId)
  const [tab, setTab] = useState<TabId>('gorunum')

  async function handleBoardIdChange(id: string) {
    // Farklı bir arşive geçiliyor — eski arşivin sütunlarına bağlı sayfalar/vitrin filtresi geçersiz
    // olur. Modlar da (moodRow.moods) eski arşivin "Tür" sütununun propertyId/optionIds'lerini
    // taşıyordu — sıfırlanmayınca yeni arşivde hiçbir satıra eşleşmediği için "modlar ekrana
    // gelemiyor" gibi görünüyordu (satır sayısı 0 olunca satırın kendisi hiç render edilmiyor).
    // `seeded: false` + boş `moods` ile AnaSayfa.tsx'teki seed effect'i yeni arşive göre otomatik
    // yeniden dolduruyor; enabled/title/position (görünüm tercihleri, arşive bağlı değil) korunuyor.
    await saveSettings({
      ...settings,
      boardId: id || null,
      sections: [],
      navOrder: [],
      bodyOrder: [],
      showcaseFilter: { propertyId: null, optionIds: [] },
      randomPickerFilter: { propertyId: null, optionIds: [] },
      moodRow: {
        enabled: settings.moodRow?.enabled ?? false,
        title: settings.moodRow?.title ?? 'Bunları da İzle',
        position: settings.moodRow?.position ?? 1,
        moods: [],
        seeded: false,
      },
    })
  }

  // Dikey + Küçük kart kombinasyonunda "Bilgileri her zaman göster" iyi durmuyor (kullanıcı
  // "dikey görünüm tarzının küçük kart boyutu ayarında olmasın güzel durmuyo" dedi) — bu
  // kombinasyonda ayar hem devre dışı bırakılıyor hem de (zaten açıksa) otomatik kapatılıyor,
  // sadece görsel olarak gizlenmiyor; AnaSayfa.tsx'te de aynı kombinasyon için ayrıca korunuyor
  // (bkz. oradaki `effectiveShowInfoAlways`) — eski kayıtlardan gelen bir uyumsuzluk da kapsansın diye.
  const infoAlwaysUnavailable = settings.layout === 'izgara' && (settings.cardSize ?? 'orta') === 'kucuk'

  function changeLayout(l: HomeLayout) {
    const nextUnavailable = l === 'izgara' && (settings.cardSize ?? 'orta') === 'kucuk'
    saveSettings({ ...settings, layout: l, ...(nextUnavailable ? { showInfoAlways: false } : {}) })
  }

  function changeCardSize(s: 'kucuk' | 'orta' | 'buyuk') {
    const nextUnavailable = settings.layout === 'izgara' && s === 'kucuk'
    saveSettings({ ...settings, cardSize: s, ...(nextUnavailable ? { showInfoAlways: false } : {}) })
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-50 mb-5">Ana Sayfa Ayarları</h2>

      <div className="flex gap-2 mb-6 border-b border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-sm font-semibold px-4 py-2.5 -mb-px border-b-2 transition ${
              tab === t.id
                ? 'text-neutral-50 border-[#00c0fa]'
                : 'text-neutral-400 border-transparent hover:text-neutral-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'gorunum' && (
        <div className="space-y-5 max-w-xl">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Ana sayfada hangi arşiv gösterilsin</label>
            <Select
              value={settings.boardId ?? ''}
              onChange={handleBoardIdChange}
              options={[{ value: '', label: 'Seçilmedi' }, ...boards.map((b) => ({ value: b.id, label: b.name }))]}
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-2">Görünüm tarzı</label>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(HOME_LAYOUT_LABELS) as HomeLayout[]).map((l) => (
                <button
                  key={l}
                  onClick={() => changeLayout(l)}
                  className={`rounded-xl border-2 p-3 text-left transition ${
                    settings.layout === l ? 'border-[#00c0fa] bg-neutral-800/50' : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'
                  }`}
                >
                  {l === 'yatay' ? <YataySvg /> : <DikeySvg />}
                  <p className={`text-xs font-medium mt-2 ${settings.layout === l ? 'text-neutral-50' : 'text-neutral-400'}`}>
                    {HOME_LAYOUT_LABELS[l]}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-2">Kart boyutu (Yatay ve Dikey ikisinde de geçerli)</label>
            <div className="flex gap-2">
              {(['kucuk', 'orta', 'buyuk'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => changeCardSize(s)}
                  className={`flex-1 text-xs rounded-lg border px-2 py-2 transition ${
                    (settings.cardSize ?? 'orta') === s
                      ? 'bg-neutral-700 border-neutral-500 text-neutral-50'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {s === 'kucuk' ? 'Küçük' : s === 'orta' ? 'Orta' : 'Büyük'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-neutral-300">
              Kart bilgilerini her zaman göster
              <span className="block text-xs text-neutral-600 mt-0.5">
                {infoAlwaysUnavailable
                  ? 'Dikey + Küçük kart boyutunda güzel durmadığı için bu kombinasyonda kullanılamıyor.'
                  : 'Durum/kategori/yıl şeridi fareyle üzerine gelmeden de görünür kalır. Açıkken kartlar üzerine gelince artık büyümez.'}
              </span>
            </span>
            <ToggleSwitch
              checked={!infoAlwaysUnavailable && (settings.showInfoAlways ?? false)}
              onChange={(v) => saveSettings({ ...settings, showInfoAlways: v })}
              disabled={infoAlwaysUnavailable}
              label="Bilgileri her zaman göster"
            />
          </div>

          <div className="pt-3 border-t border-neutral-800 space-y-3">
            <div className="max-w-[220px]">
              <VitrinSvg />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-neutral-300">Üstte öne çıkan bir vitrin göster</span>
              <ToggleSwitch
                checked={settings.showcase}
                onChange={(v) => saveSettings({ ...settings, showcase: v })}
                label="Vitrini göster"
              />
            </div>

            {settings.showcase && (
              <div>
                <label className="block text-xs text-neutral-400 mb-1">
                  Vitrinde ne gösterilsin (her girişte bu havuzdan rastgele bir tanesi seçilir)
                </label>
                <PropertyFilterPicker
                  board={board}
                  propertyId={settings.showcaseFilter?.propertyId ?? ''}
                  optionIds={settings.showcaseFilter?.optionIds ?? []}
                  onChange={(propertyId, optionIds) =>
                    saveSettings({ ...settings, showcaseFilter: { propertyId: propertyId || null, optionIds } })
                  }
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-neutral-800">
            <span className="text-sm text-neutral-300">
              Ana sayfada "Tümü" satırını göster
              <span className="block text-xs text-neutral-600 mt-0.5">
                Vitrinin altındaki, arşivin tamamını listeleyen varsayılan satır — bölümlerin (alt sayfaların)
                kendi satırlarını etkilemez.
              </span>
            </span>
            <ToggleSwitch
              checked={settings.showAllSection ?? true}
              onChange={(v) => saveSettings({ ...settings, showAllSection: v })}
              label="Tümü satırını göster"
            />
          </div>

          {(settings.showAllSection ?? true) && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-neutral-400">Tümü satırındaki kartların sırası</span>
              <div className="flex gap-1.5">
                {(['karisik', 'sirali'] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => saveSettings({ ...settings, allSectionOrder: o })}
                    className={`text-xs rounded-lg border px-3 py-1.5 transition ${
                      (settings.allSectionOrder ?? 'karisik') === o
                        ? 'bg-neutral-700 border-neutral-500 text-neutral-50'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {o === 'karisik' ? 'Karışık Getir' : 'Sıralı Getir'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-neutral-800">
            <span className="text-sm text-neutral-300">Kapak görseli olmayan kayıtları ana sayfada gösterme</span>
            <ToggleSwitch
              checked={settings.hideWithoutCover ?? false}
              onChange={(v) => saveSettings({ ...settings, hideWithoutCover: v })}
              label="Kapaksız kayıtları gizle"
            />
          </div>

          <div className="pt-3 border-t border-neutral-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-neutral-300">En altta, her girişte rastgele satırlarla otomatik doldur</span>
              <ToggleSwitch
                checked={settings.autoFill?.enabled ?? false}
                onChange={(v) =>
                  saveSettings({
                    ...settings,
                    autoFill: { count: settings.autoFill?.count ?? 4, enabled: v },
                  })
                }
                label="Otomatik doldur"
              />
            </div>
            <p className="text-xs text-neutral-600">
              Arşivdeki seçim sütunlarından (Tür, Ülke, Kategori...) her seferinde rastgele seçilen bir değer, o
              değeri taşıyan kayıtlarla birlikte kendi satırını oluşturur — başlık olarak o değerin adı kullanılır.
            </p>
            {settings.autoFill?.enabled && (
              <div className="flex items-center gap-2 pt-1">
                <label className="text-xs text-neutral-400 shrink-0">Kaç satır gelsin</label>
                <ClampedNumberInput
                  value={settings.autoFill?.count ?? 4}
                  min={1}
                  max={20}
                  onCommit={(n) => saveSettings({ ...settings, autoFill: { enabled: true, count: n } })}
                  className="w-20 rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-neutral-100 text-sm outline-none focus:border-neutral-500"
                />
                <span className="text-xs text-neutral-600">(1-20 arası)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'sayfalar' && (
        <div className="space-y-3">
          <HomeSectionEditor
            board={board}
            sections={settings.sections ?? []}
            navOrder={settings.navOrder ?? []}
            bodyOrder={settings.bodyOrder ?? []}
            onAdd={(section: HomeSection) => {
              const nextSections = [...(settings.sections ?? []), section]
              const nextNavOrder = section.pinnedToNav ? [...(settings.navOrder ?? []), section.id] : (settings.navOrder ?? [])
              const nextBodyOrder = section.showInBody ? [...(settings.bodyOrder ?? []), section.id] : (settings.bodyOrder ?? [])
              saveSettings({ ...settings, sections: nextSections, navOrder: nextNavOrder, bodyOrder: nextBodyOrder })
            }}
            onUpdate={(section: HomeSection) => {
              const nextSections = (settings.sections ?? []).map((s) => (s.id === section.id ? section : s))
              // Düzenlerken "üstte menüde" / "altta gövdede" kutuları açılıp kapanabiliyor —
              // yeni açılan yere sıranın sonuna eklenir, kapatılan yerden çıkarılır.
              const navOrderBase = settings.navOrder ?? []
              const nextNavOrder = section.pinnedToNav
                ? navOrderBase.includes(section.id)
                  ? navOrderBase
                  : [...navOrderBase, section.id]
                : navOrderBase.filter((id) => id !== section.id)
              const bodyOrderBase = settings.bodyOrder ?? []
              const nextBodyOrder = section.showInBody
                ? bodyOrderBase.includes(section.id)
                  ? bodyOrderBase
                  : [...bodyOrderBase, section.id]
                : bodyOrderBase.filter((id) => id !== section.id)
              saveSettings({ ...settings, sections: nextSections, navOrder: nextNavOrder, bodyOrder: nextBodyOrder })
            }}
            onDelete={(id) =>
              saveSettings({
                ...settings,
                sections: (settings.sections ?? []).filter((s) => s.id !== id),
                navOrder: (settings.navOrder ?? []).filter((nid) => nid !== id),
                bodyOrder: (settings.bodyOrder ?? []).filter((nid) => nid !== id),
              })
            }
            onMoveNav={(id, dir) => {
              const pinnedIds = (settings.sections ?? []).filter((s) => s.pinnedToNav).map((s) => s.id)
              const order = normalizeOrder(settings.navOrder ?? [], pinnedIds)
              const idx = order.indexOf(id)
              saveSettings({ ...settings, navOrder: moveInArray(order, idx, dir) })
            }}
            onMoveBody={(id, dir) => {
              const bodyIds = (settings.sections ?? []).filter((s) => s.showInBody !== false).map((s) => s.id)
              const order = normalizeOrder(settings.bodyOrder ?? [], bodyIds)
              const idx = order.indexOf(id)
              saveSettings({ ...settings, bodyOrder: moveInArray(order, idx, dir) })
            }}
          />
        </div>
      )}

      {tab === 'mod' && (
        <div className="space-y-3">
          <MoodRowEditor
            board={board}
            // `settings.moodRow` eski (title/position eklenmeden önce kaydedilmiş) verilerde
            // var olabilir ama bu iki alanı içermeyebilir — eksik alanları burada tamamlamazsak
            // input'lar `undefined` değerle "controlled'dan uncontrolled'a" React uyarısı verir.
            settings={{ enabled: false, title: 'Bunları da İzle', position: 1, moods: [], ...settings.moodRow }}
            onChange={(moodRow: MoodRowSettings) => saveSettings({ ...settings, moodRow })}
          />
        </div>
      )}

      {tab === 'nizlesem' && (
        <div className="space-y-3 max-w-xl">
          <p className="text-sm text-neutral-300">
            Üstteki arama kutusunun yanındaki kart butonu — tıklanınca aşağıdaki havuzdan rastgele bir kayıt seçip
            detayını açar.
          </p>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">
              Hangi havuzdan seçilsin (hiçbir filtre seçilmezse arşivdeki her şeyden rastgele seçilir)
            </label>
            <PropertyFilterPicker
              board={board}
              propertyId={settings.randomPickerFilter?.propertyId ?? ''}
              optionIds={settings.randomPickerFilter?.optionIds ?? []}
              onChange={(propertyId, optionIds) =>
                saveSettings({ ...settings, randomPickerFilter: { propertyId: propertyId || null, optionIds } })
              }
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <label className="text-xs text-neutral-400 shrink-0">Ekranda kaç poster dağılsın</label>
            <ClampedNumberInput
              value={settings.randomPickerCount ?? 30}
              min={6}
              max={60}
              onCommit={(n) => saveSettings({ ...settings, randomPickerCount: n })}
              className="w-20 rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-neutral-100 text-sm outline-none focus:border-neutral-500"
            />
            <span className="text-xs text-neutral-600">(6-60 arası)</span>
          </div>
        </div>
      )}
    </div>
  )
}
