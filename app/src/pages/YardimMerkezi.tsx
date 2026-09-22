import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BRAND_GRADIENT, BRAND_TEXT, PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import { useToast } from '../hooks/useToast'

// Küçük rozet-ikon (başlığın yanındaki) — büyük "wireframe" görselden ayrı, sadece o bölümü
// tek bakışta tanımak için. Gradyanlı kare arka plan + beyaz stroke ikon, hepsi aynı 24x24
// viewBox/1.8 kalınlık kuralına uyuyor (yeni bir ikon eklenirse de aynı kurala uysun).
function Pictogram({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ background: BRAND_GRADIENT }}
      className="h-11 w-11 rounded-xl flex items-center justify-center text-white shrink-0"
    >
      {children}
    </div>
  )
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.2 3.6-7 8-7s8 2.8 8 7" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  )
}

// Mod satırı ikonu — hafif yuvarlatılmış köşeli bir kare, içinde iki yuvarlak göz ve gülümseyen
// bir ağız: "ruh hali/mod" fikrini bir yüzle anlatmak, soyut bir kıvılcım/sparkle ikonundan daha
// doğrudan anlaşılır. Aşağıdaki ModWireframe'in içindeki minik yüzlerle de aynı dil.
function MoodFaceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="3" width="18" height="18" rx="6" />
      <circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <path d="M8.5 15c1 1.1 2.2 1.7 3.5 1.7s2.5-.6 3.5-1.7" />
    </svg>
  )
}

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9c.1.36.5 1 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function PlayCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" />
    </svg>
  )
}

// ---- "Wireframe" mockup'lar ----
// Her bölüm için, o ekranın gerçek yapısını basitçe taklit eden küçük bir çizim — ekran
// görüntüsü değil, kutu/çizgi düzeyinde bir taslak (klasik "wireframe" dili): görsel/kapak
// alanları dolu (fill) dikdörtgenlerle, metin/arayüz elemanları ince çizgilerle gösteriliyor.
// Hepsi aynı 0 0 300 160 viewBox'ı kullanıyor ki WireframeCard içinde aynı oranda otursunlar.
const WF_FILL = '#262626' // neutral-800 — "görsel/kapak" alanları
const WF_STROKE = '#525252' // neutral-600 — kutu çerçeveleri
const WF_LINE = '#404040' // neutral-700 — metin/etiket çizgileri

function WireframeCard({ children }: { children: ReactNode }) {
  return (
    <div className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden shadow-lg shadow-black/20">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800">
        <span className="h-2 w-2 rounded-full bg-neutral-700" />
        <span className="h-2 w-2 rounded-full bg-neutral-700" />
        <span className="h-2 w-2 rounded-full bg-neutral-700" />
      </div>
      <svg viewBox="0 0 300 160" className="w-full h-auto block">
        {children}
      </svg>
    </div>
  )
}

function KimIzliyorWireframe() {
  const tiles = [20, 115, 210]
  return (
    <WireframeCard>
      {tiles.map((x, i) => (
        <g key={x}>
          <rect x={x} y={20} width={70} height={70} rx={12} fill={i < 2 ? WF_FILL : 'none'} stroke={WF_STROKE} strokeWidth={2} strokeDasharray={i < 2 ? undefined : '5 5'} />
          {i < 2 ? (
            <circle cx={x + 35} cy={55} r={16} fill={WF_STROKE} />
          ) : (
            <path d={`M${x + 35} 40v30M${x + 20} 55h30`} stroke={WF_STROKE} strokeWidth={3} strokeLinecap="round" />
          )}
          {i < 2 && <rect x={x + 15} y={100} width={40} height={7} rx={3.5} fill={WF_LINE} />}
        </g>
      ))}
    </WireframeCard>
  )
}

function AnaSayfaWireframe() {
  const cards = [15, 71, 127, 183, 239]
  return (
    <WireframeCard>
      <rect x={15} y={15} width={270} height={55} rx={10} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={2} />
      <path d="M35 34v18l16-9-16-9Z" fill={BRAND_TEXT} />
      <rect x={62} y={50} width={70} height={7} rx={3.5} fill="#a3a3a3" />
      {cards.map((x) => (
        <rect key={x} x={x} y={85} width={46} height={48} rx={7} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={2} />
      ))}
      <rect x={15} y={142} width={54} height={6} rx={3} fill={WF_LINE} />
    </WireframeCard>
  )
}

function ModWireframe() {
  const pairs = [15, 118, 220]
  return (
    <WireframeCard>
      {pairs.map((x) => (
        <g key={x}>
          <rect x={x} y={65} width={28} height={28} rx={8} fill="none" stroke={BRAND_TEXT} strokeWidth={2} />
          <circle cx={x + 10} cy={76} r={1.4} fill={BRAND_TEXT} />
          <circle cx={x + 18} cy={76} r={1.4} fill={BRAND_TEXT} />
          <path d={`M${x + 9} 82c1.3 1.4 2.8 2 4.5 2s3.2-.6 4.5-2`} stroke={BRAND_TEXT} strokeWidth={1.6} strokeLinecap="round" fill="none" />
          <rect x={x + 22} y={40} width={40} height={72} rx={8} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={2} />
        </g>
      ))}
    </WireframeCard>
  )
}

function VeritabaniWireframe() {
  const cols = [20, 110, 167, 224, 280]
  const rows = [15, 41, 67, 93, 119, 145]
  return (
    <WireframeCard>
      <rect x={20} y={15} width={260} height={26} fill={WF_FILL} />
      <rect x={20} y={15} width={260} height={130} fill="none" stroke={WF_STROKE} strokeWidth={2} rx={4} />
      {rows.slice(1, -1).map((y) => (
        <line key={y} x1={20} y1={y} x2={280} y2={y} stroke={WF_STROKE} strokeWidth={1} />
      ))}
      {cols.slice(1, -1).map((x) => (
        <line key={x} x1={x} y1={15} x2={x} y2={145} stroke={WF_STROKE} strokeWidth={1} />
      ))}
      <rect x={30} y={24} width={45} height={8} rx={4} fill="#a3a3a3" />
    </WireframeCard>
  )
}

function AyarlarWireframe() {
  const rows: { y: number; on: boolean }[] = [
    { y: 32, on: false },
    { y: 76, on: true },
    { y: 120, on: false },
  ]
  return (
    <WireframeCard>
      {rows.map(({ y, on }) => (
        <g key={y}>
          <rect x={25} y={y} width={110} height={8} rx={4} fill={WF_LINE} />
          <rect x={230} y={y - 7} width={44} height={22} rx={11} fill={on ? BRAND_TEXT : WF_FILL} stroke={WF_STROKE} strokeWidth={on ? 0 : 2} />
          <circle cx={on ? 262 : 241} cy={y + 4} r={7} fill={on ? '#0a0a0a' : WF_STROKE} />
        </g>
      ))}
    </WireframeCard>
  )
}

function AramaWireframe() {
  const results = [68, 104, 140]
  return (
    <WireframeCard>
      <rect x={20} y={18} width={260} height={32} rx={16} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={2} />
      <circle cx={38} cy={34} r={7} fill="none" stroke="#a3a3a3" strokeWidth={2} />
      <line x1={43} y1={39} x2={48} y2={44} stroke="#a3a3a3" strokeWidth={2} strokeLinecap="round" />
      <rect x={58} y={31} width={90} height={6} rx={3} fill={WF_LINE} />
      {results.map((y) => (
        <g key={y}>
          <rect x={20} y={y} width={28} height={28} rx={6} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={2} />
          <rect x={58} y={y + 5} width={130} height={7} rx={3.5} fill={WF_LINE} />
          <rect x={58} y={y + 17} width={80} height={6} rx={3} fill="#333333" />
        </g>
      ))}
    </WireframeCard>
  )
}

function DetayWireframe() {
  const cast = [15, 50, 85, 120]
  return (
    <WireframeCard>
      <rect x={15} y={15} width={270} height={70} rx={10} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={2} />
      <circle cx={150} cy={50} r={14} fill="none" stroke={BRAND_TEXT} strokeWidth={2} />
      <path d="M146 44v12l11-6-11-6Z" fill={BRAND_TEXT} />
      <rect x={15} y={98} width={140} height={10} rx={4} fill="#a3a3a3" />
      <rect x={15} y={115} width={90} height={7} rx={3.5} fill={WF_LINE} />
      {cast.map((x) => (
        <rect key={x} x={x} y={130} width={28} height={28} rx={14} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={2} />
      ))}
    </WireframeCard>
  )
}

const SECTIONS: { icon: ReactNode; title: string; text: string; wireframe: ReactNode }[] = [
  {
    icon: <ProfileIcon />,
    title: '1. Kim izliyor?',
    text: "ARGUS’ı açtığında ilk gördüğün ekran budur — evdeki herkes kendi profiliyle girer, izlediklerin/izleyeceklerin karışmaz. Sağ üstteki profil resmine tıklayıp listeden anında başka bir profile geçebilirsin; yeni profil eklemek ya da mevcut birini düzenlemek için aynı menüdeki “Ayarlar → Profil Ayarları”na gidersin.",
    wireframe: <KimIzliyorWireframe />,
  },
  {
    icon: <HomeIcon />,
    title: '2. Ana Sayfa',
    text: 'En üstte öne çıkan bir vitrin, altında "Tümü" ve eklediğin diğer satırlar (bir türe göre liste, ruh haline göre mod satırı vb.) sırayla aşağı doğru dizilir. Bir kart üzerine gelince detayları görürsün, tıklayınca tüm bilgileri (oyuncular, sezonlar, sinopsis) açan pencere gelir.',
    wireframe: <AnaSayfaWireframe />,
  },
  {
    icon: <MoodFaceIcon />,
    title: '3. Mod satırı',
    text: '"İzlenecek" listenden, tanımladığın ruh hallerine (modlara) göre önerilen içerikleri gösteren özel bir satır. Her modun kendi görseli ve tür/kategori filtresi vardır; gösterilen içerik günde bir kez yenilenir. Ayarlar → Ana Sayfa Ayarları → Mod Ekle’den kendi modlarını tanımlarsın.',
    wireframe: <ModWireframe />,
  },
  {
    icon: <DatabaseIcon />,
    title: '4. Veritabanı',
    text: 'Tüm kayıtların bulunduğu yer, Ayarlar → Veritabanı altında dört bölüm: Arşivler (birden fazla arşiv oluşturabilirsin — filmler, diziler, kitaplar... her birinin kendi sütunları vardır, istediğin gibi ekleyip/silebilirsin, Tablo/Galeri görünümü arasında geçebilirsin), Şablonlar (hazır ya da kendi oluşturduğun bir sütun setiyle tek tıkla yeni arşiv açmanı sağlar), İçe Aktar (bir CSV dosyasından — Notion’dan ya da başka bir yerden — veri getirir) ve API (TMDB’den otomatik poster/oyuncu/yönetmen doldurmak istersen kendi ücretsiz anahtarını girdiğin, isteğe bağlı bölüm).',
    wireframe: <VeritabaniWireframe />,
  },
  {
    icon: <GearIcon />,
    title: '5. Ana Sayfa Ayarları',
    text: 'Ana sayfanın hangi arşivi göstereceğini, görünüm tarzını (yatay kaydırmalı ya da ızgara), vitrin ve mod satırının açık/kapalı olmasını buradan yönetirsin. "Sayfalar" kısmından, bir türe/kategoriye göre kendi listelerini oluşturup üst menüye ya da ana sayfanın gövdesine ekleyebilirsin.',
    wireframe: <AyarlarWireframe />,
  },
  {
    icon: <SearchIcon />,
    title: '6. Arama',
    text: 'Sağ üstteki büyüteç ikonuyla her yerden ulaşabileceğin genel arama — başlık, oyuncu, tür ya da ülke adına göre sonuç getirir; başlığa tam uyanlar en üstte çıkar.',
    wireframe: <AramaWireframe />,
  },
  {
    icon: <PlayCircleIcon />,
    title: '7. Kayıt detayı',
    text: 'Bir karta tıkladığında açılan pencerede o kaydın tüm bilgilerini, oyuncu kadrosunu (varsa rolleriyle birlikte) ve dizilerde sezon/bölüm listesini görürsün. Bir oyuncuya tıklayınca o oyuncunun oynadığı diğer tüm kayıtları listeleyebilirsin.',
    wireframe: <DetayWireframe />,
  },
]

// pp menüsündeki "Yardım Merkezi" butonundan açılan, uygulamanın nasıl kullanılacağını anlatan
// sayfa. Sayfanın tamamını kullanan, satır satır (bölümü solda/sağda değişen) bir düzen: her
// bölümün küçük bir "wireframe" taslağı (WireframeCard + yukarıdaki *Wireframe bileşenleri, o
// ekranın gerçek kutu/çizgi yapısını taklit eder — ekran görüntüsü değil, taslak) yanında kısa
// bir açıklama. `?ilk=1` ile açıldığında (bkz. App.tsx'teki useAutoShowHelpOnce) küçük bir "hoş
// geldin" çerçevesi ve en altta TEK bir "Anladım, Kapat" butonu eklenir (üstte tekrar yok —
// sayfanın kendisi zaten Navbar'ın altında, istenen an üstteki menüden başka bir yere gidilebilir).
export default function YardimMerkezi() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { notify } = useToast()
  const isFirstVisit = searchParams.get('ilk') === '1'

  function handleClose() {
    notify('Yardım Merkezi\'ne istediğin zaman sağ üstteki profil menüsünden ulaşabilirsin.')
    navigate('/')
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex flex-col items-center text-center mb-16">
        <img src="/logoblue.png" alt="ARGUS" className="h-16 w-16 mb-4" />
        {isFirstVisit && <p className="text-xs font-medium tracking-wide text-sky-400 mb-2">👋 HOŞ GELDİN</p>}
        <h1 className="text-2xl md:text-3xl font-semibold text-neutral-50 mb-2">ARGUS Nasıl Çalışır?</h1>
        <p className="text-neutral-500 text-sm max-w-md">
          {isFirstVisit
            ? 'Başlamadan önce uygulamanın temel bölümlerine hızlı bir bakış atalım — istersen aşağı kaydırıp okuyabilir, istersen direkt geçebilirsin.'
            : 'Uygulamanın temel bölümlerine kısa bir bakış — merak ettiğin bir şey olursa buradan hatırlayabilirsin.'}
        </p>
      </div>

      <div className="space-y-14 md:space-y-20">
        {SECTIONS.map((s, i) => (
          <div key={s.title} className={`flex flex-col md:items-center gap-6 md:gap-10 ${i % 2 === 1 ? 'md:flex-row-reverse' : 'md:flex-row'}`}>
            <div className="w-full md:w-1/2">{s.wireframe}</div>
            <div className="w-full md:w-1/2">
              <div className="flex items-center gap-3 mb-2">
                <Pictogram>{s.icon}</Pictogram>
                <h2 className="text-lg font-semibold text-neutral-50">{s.title}</h2>
              </div>
              <p className="text-sm text-neutral-400 leading-relaxed">{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      {isFirstVisit && (
        <div className="flex justify-center mt-16">
          <button onClick={handleClose} style={primaryButtonStyle} className={`text-sm px-5 py-2.5 rounded-lg ${PRIMARY_BUTTON}`}>
            Anladım, Kapat
          </button>
        </div>
      )}
    </div>
  )
}
