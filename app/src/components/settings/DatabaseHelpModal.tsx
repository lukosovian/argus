import { BRAND_TEXT } from '../../lib/theme'

// Ayarlar → Veritabanı başlığının yanındaki "?" ile açılan, bu bölümün nasıl çalıştığını
// Yardım Merkezi'yle aynı derinlikte anlatan pencere — her bir alt-sekme (Arşivler/Şablonlar/
// İçe Aktar/API) kendi wireframe'iyle, artı satır menüsü ve API alan-seçme dişlisi için ayrı
// iki wireframe daha. İlk sürüm sadece kısa paragraflardı, kullanıcı "yardım merkezi gibi daha
// detaylı anlat" dedi — buradaki altı bölüm de Yardım Merkezi'ndeki wireframe diliyle
// (WireframeCard, filled=görsel alanı/stroke=arayüz çerçevesi/BRAND_TEXT=tek vurgu rengi
// kuralı) çiziliyor, aynı dosyada tutuluyor (YardimMerkezi.tsx'e coupling yaratmamak için
// bilerek küçük bir tekrar).
// Sabit hex yerine CSS değişkenine işaret ediyorlar (bkz. YardimMerkezi.tsx'teki aynı not) —
// açık temada da doğru renklere dönsünler diye.
const WF_FILL = 'var(--color-neutral-800)'
const WF_STROKE = 'var(--color-neutral-600)'
const WF_LINE = 'var(--color-neutral-700)'
const WF_EMPHASIS = 'var(--color-neutral-400)'

function WireframeCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800">
        <span className="h-2 w-2 rounded-full bg-neutral-700" />
        <span className="h-2 w-2 rounded-full bg-neutral-700" />
        <span className="h-2 w-2 rounded-full bg-neutral-700" />
      </div>
      <svg viewBox="0 0 300 150" className="w-full h-auto block">
        {children}
      </svg>
    </div>
  )
}

// Arşivler: birkaç "arşiv kartı" (ad + sütun sayısı) yan yana — Arşivler sekmesinin arşiv
// ızgarasının taslağı.
function ArsivlerWireframe() {
  const cards = [15, 108, 201]
  return (
    <WireframeCard>
      {cards.map((x) => (
        <g key={x}>
          <rect x={x} y={20} width={84} height={80} rx={8} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={1.5} />
          <rect x={x + 12} y={35} width={55} height={8} rx={3} fill={WF_EMPHASIS} />
          <rect x={x + 12} y={52} width={35} height={6} rx={3} fill={WF_LINE} />
        </g>
      ))}
      <rect x={15} y={115} width={270} height={20} rx={6} fill="none" stroke={BRAND_TEXT} strokeWidth={1.5} strokeDasharray="4 3" />
      <path d="M143 121v8M139 125h8" stroke={BRAND_TEXT} strokeWidth={2} strokeLinecap="round" />
    </WireframeCard>
  )
}

// Şablonlar: bir şablon kartı (sütun rozetleri) + altında "Şablonu Kullan" düğmesi.
function SablonlarWireframe() {
  const badges = [
    [15, 55],
    [65, 55],
    [125, 55],
    [15, 78],
    [80, 78],
  ]
  return (
    <WireframeCard>
      <rect x={15} y={20} width={200} height={10} rx={4} fill={WF_EMPHASIS} />
      {badges.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={40} height={14} rx={7} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={1.2} />
      ))}
      <rect x={15} y={105} width={110} height={26} rx={7} fill={BRAND_TEXT} />
      <rect x={35} y={114} width={70} height={8} rx={3} fill="#0a0a0a" opacity={0.85} />
    </WireframeCard>
  )
}

// İçe Aktar: bir CSV dosyası simgesi -> ok -> eşlenmiş sütunlar.
function IceAktarWireframe() {
  return (
    <WireframeCard>
      <rect x={20} y={35} width={60} height={75} rx={6} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={1.5} />
      <path d="M33 55h34M33 68h34M33 81h24" stroke={WF_LINE} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M95 72h40M126 63l10 9-10 9" stroke={BRAND_TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x={150} y={35} width={135} height={75} rx={6} fill="none" stroke={WF_STROKE} strokeWidth={1.5} />
      <line x1={150} y1={55} x2={285} y2={55} stroke={WF_STROKE} strokeWidth={1} />
      <line x1={200} y1={35} x2={200} y2={110} stroke={WF_STROKE} strokeWidth={1} />
      <line x1={245} y1={35} x2={245} y2={110} stroke={WF_STROKE} strokeWidth={1} />
      <rect x={158} y={42} width={35} height={7} rx={3} fill={WF_EMPHASIS} />
    </WireframeCard>
  )
}

// API: bir anahtar simgesi + metin girişi kutusu.
function ApiWireframe() {
  return (
    <WireframeCard>
      <circle cx={45} cy={75} r={18} fill="none" stroke={BRAND_TEXT} strokeWidth={2.5} />
      <circle cx={45} cy={75} r={6} fill="none" stroke={BRAND_TEXT} strokeWidth={2} />
      <path d="M61 75h55M96 75v12M110 75v8" stroke={BRAND_TEXT} strokeWidth={2.5} strokeLinecap="round" />
      <rect x={15} y={25} width={270} height={30} rx={7} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={1.5} />
      <rect x={28} y={36} width={130} height={8} rx={3} fill={WF_LINE} />
    </WireframeCard>
  )
}

// Bir tablo satırı: solda vurgulanmış altı-nokta tutamaç, hemen altında açılan menüde üç
// aksiyon (Doldur/Ekle/Sil) — gerçek BoardTable.tsx'teki RowMenu'nün taslağı.
function RowMenuWireframe() {
  return (
    <WireframeCard>
      <rect x={15} y={15} width={270} height={26} rx={4} fill="none" stroke={WF_STROKE} strokeWidth={1.5} />
      <circle cx={26} cy={24} r={1.6} fill={BRAND_TEXT} />
      <circle cx={32} cy={24} r={1.6} fill={BRAND_TEXT} />
      <circle cx={26} cy={30} r={1.6} fill={BRAND_TEXT} />
      <circle cx={32} cy={30} r={1.6} fill={BRAND_TEXT} />
      <circle cx={26} cy={36} r={1.6} fill={BRAND_TEXT} />
      <circle cx={32} cy={36} r={1.6} fill={BRAND_TEXT} />
      <rect x={48} y={21} width={70} height={8} rx={3} fill={WF_LINE} />
      <rect x={130} y={21} width={40} height={8} rx={3} fill={WF_LINE} />

      <rect x={15} y={55} width={160} height={78} rx={8} fill={WF_FILL} stroke={BRAND_TEXT} strokeWidth={1.5} />
      <rect x={27} y={67} width={70} height={7} rx={3} fill={WF_EMPHASIS} />
      <rect x={27} y={80} width={50} height={6} rx={3} fill={WF_LINE} />
      <rect x={27} y={94} width={55} height={6} rx={3} fill={WF_LINE} />
      <rect x={27} y={108} width={45} height={6} rx={3} fill={WF_LINE} />
      <line x1={15} y1={95} x2={175} y2={95} stroke={WF_STROKE} strokeWidth={1} />
      <line x1={15} y1={108.5} x2={175} y2={108.5} stroke={WF_STROKE} strokeWidth={1} />
    </WireframeCard>
  )
}

function ToggleRow({ y, on }: { y: number; on: boolean }) {
  return (
    <g>
      <rect x={25} y={y} width={130} height={8} rx={4} fill={WF_LINE} />
      <rect x={230} y={y - 7} width={44} height={22} rx={11} fill={on ? BRAND_TEXT : WF_FILL} stroke={WF_STROKE} strokeWidth={on ? 0 : 1.5} />
      <circle cx={on ? 262 : 241} cy={y + 4} r={7} fill={on ? 'white' : WF_STROKE} />
    </g>
  )
}

function GearWireframe() {
  return (
    <WireframeCard>
      <ToggleRow y={30} on />
      <ToggleRow y={62} on />
      <ToggleRow y={94} on={false} />
      <ToggleRow y={126} on />
    </WireframeCard>
  )
}

const SECTIONS: { title: string; wireframe: React.ReactNode; text: React.ReactNode }[] = [
  {
    title: '1. Arşivler',
    wireframe: <ArsivlerWireframe />,
    text: (
      <>
        Birden fazla arşiv oluşturabilirsin (filmler, kitaplar, oyunlar...). Her birinin kendi sütunları vardır,
        istediğin gibi ekleyip/silebilirsin, arşivin içinde <strong className="text-neutral-200">Tablo</strong> ya da{' '}
        <strong className="text-neutral-200">Galeri</strong> görünümü arasında geçebilirsin. "+ Yeni Arşiv"e basınca
        boş mı başlayacağını yoksa bir şablon mu kullanacağını seçersin.
      </>
    ),
  },
  {
    title: '2. Şablonlar',
    wireframe: <SablonlarWireframe />,
    text: (
      <>
        Hazır ya da kendi oluşturduğun bir sütun setiyle <strong className="text-neutral-200">tek tıkla</strong> yeni
        arşiv açar. "Şablonu Kullan"a basınca hangi sütunları istediğini seçersin, isteğe bağlı olarak bir CSV'yi de
        doğrudan bu adımda içe aktarabilir, hatta eksikleri TMDB'den otomatik doldurtabilirsin — üçü de aynı ekranda.
      </>
    ),
  },
  {
    title: '3. İçe Aktar',
    wireframe: <IceAktarWireframe />,
    text: (
      <>
        Bir CSV dosyasından (Notion'dan dışa aktardığın ya da başka bir yerden gelen) yeni bir arşiv oluşturur. Her
        CSV sütununu hangi arşiv sütununa gideceğini kendin seçersin (adı benzer olanlar otomatik eşlenir), görsel
        sütunu varsa görsel dosyalarını da ayrıca seçersin.
      </>
    ),
  },
  {
    title: '4. API',
    wireframe: <ApiWireframe />,
    text: (
      <>
        TMDB'den otomatik bilgi çekmek istersen kendi ücretsiz anahtarını girdiğin yer — herkes kendi anahtarını
        girmek zorunda, tek bir ortak anahtar yok. Girmezsen uygulamanın geri kalanı hiç etkilenmez, sadece aşağıdaki
        otomatik doldurma özelliği kullanılamaz.
      </>
    ),
  },
  {
    title: '5. Bir kaydı TMDB’den doldurma',
    wireframe: <RowMenuWireframe />,
    text: (
      <>
        Bir arşivin içinde her satırın solundaki <strong className="text-neutral-200">⠿</strong> simgesine tıkla —
        açılan menüden o kaydı <strong className="text-neutral-200">TMDB'den Doldur</strong>abilir (başlığa bakarak
        poster, oyuncular, tür, sinopsis gibi boş alanları tek tek doldurur), altına yeni satır ekleyebilir ya da
        silebilirsin. Bunun için önce API sekmesinden bir anahtar girmiş olman gerekir.
      </>
    ),
  },
  {
    title: '6. Hangi alanlar doldurulsun',
    wireframe: <GearWireframe />,
    text: (
      <>
        Tablonun üstündeki <strong className="text-neutral-200">⚙</strong> ikonundan, API'nin hangi alanları
        doldurup dolduramayacağını tek tek açıp kapatırsın — zaten dolu bir alana asla dokunulmaz, bu sadece boşken
        doldurulsun mu diye seçer.
      </>
    ),
  },
]

export default function DatabaseHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-sm flex items-start justify-center px-4 py-10 overflow-y-auto"
      onClick={onClose}
    >
      <div className="w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-neutral-50">Veritabanı Nasıl Çalışır?</h2>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="h-8 w-8 shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-500 flex items-center justify-center text-neutral-400 hover:text-neutral-50 text-lg leading-none transition"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-neutral-500 mb-6">
          Bu sekmenin dört bölümü ve içindeki bir arşivde API'nin nasıl kullanılacağı — Yardım Merkezi'ndeki gibi,
          burada da her adımın küçük bir taslağı var.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-8">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              {s.wireframe}
              <h3 className="text-sm font-semibold text-neutral-50 mt-3 mb-1">{s.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
