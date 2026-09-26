import { useState, type ReactNode } from 'react'
import { GizliSutunVisual, GuncelleVisual, KesfetVisual, SaglikVisual, YeniBolumlerVisual } from '../components/PatchVisuals'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BRAND_GRADIENT, BRAND_TEXT, PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import { useToast } from '../hooks/useToast'

// Küçük rozet-ikon (başlığın yanındaki) — büyük "wireframe" görselden ayrı, sadece o bölümü
// tek bakışta tanımak için. Gradyanlı kare arka plan + beyaz stroke ikon, hepsi aynı 24x24
// viewBox/1.8 kalınlık kuralına uyuyor (yeni bir ikon eklenirse de aynı kurala uysun).
function Pictogram({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: BRAND_GRADIENT }} className="h-11 w-11 rounded-xl flex items-center justify-center text-white shrink-0">
      {children}
    </div>
  )
}

function ProfileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.2 3.6-7 8-7s8 2.8 8 7" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
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
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <rect x="3" y="3" width="18" height="18" rx="6" />
      <circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <path d="M8.5 15c1 1.1 2.2 1.7 3.5 1.7s2.5-.6 3.5-1.7" />
    </svg>
  )
}

function DatabaseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9c.1.36.5 1 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function PlayCircleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
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
// Sabit hex yerine CSS değişkenine (bkz. index.css'teki açık tema override'ı) işaret ediyorlar —
// böylece bu taslaklar da açık temada otomatik olarak doğru renklere dönüyor, aynı `neutral-*`
// skalasının geri kalanı gibi. Kullanıcı "ordaki çizimler... beyaz temaya uygun değil" dedi.
const WF_FILL = 'var(--color-neutral-800)' // "görsel/kapak" alanları
const WF_STROKE = 'var(--color-neutral-600)' // kutu çerçeveleri
const WF_LINE = 'var(--color-neutral-700)' // metin/etiket çizgileri
const WF_EMPHASIS = 'var(--color-neutral-400)' // vurgulu (daha büyük/önemli) metin çizgileri

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
          <rect
            x={x}
            y={20}
            width={70}
            height={70}
            rx={12}
            fill={i < 2 ? WF_FILL : 'none'}
            stroke={WF_STROKE}
            strokeWidth={2}
            strokeDasharray={i < 2 ? undefined : '5 5'}
          />
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
      <rect x={62} y={50} width={70} height={7} rx={3.5} fill={WF_EMPHASIS} />
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
          <path
            d={`M${x + 9} 82c1.3 1.4 2.8 2 4.5 2s3.2-.6 4.5-2`}
            stroke={BRAND_TEXT}
            strokeWidth={1.6}
            strokeLinecap="round"
            fill="none"
          />
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
      <rect x={30} y={24} width={45} height={8} rx={4} fill={WF_EMPHASIS} />
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
          <rect
            x={230}
            y={y - 7}
            width={44}
            height={22}
            rx={11}
            fill={on ? BRAND_TEXT : WF_FILL}
            stroke={WF_STROKE}
            strokeWidth={on ? 0 : 2}
          />
          <circle cx={on ? 262 : 241} cy={y + 4} r={7} fill={on ? 'white' : WF_STROKE} />
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
      <circle cx={38} cy={34} r={7} fill="none" stroke={WF_EMPHASIS} strokeWidth={2} />
      <line x1={43} y1={39} x2={48} y2={44} stroke={WF_EMPHASIS} strokeWidth={2} strokeLinecap="round" />
      <rect x={58} y={31} width={90} height={6} rx={3} fill={WF_LINE} />
      {results.map((y) => (
        <g key={y}>
          <rect x={20} y={y} width={28} height={28} rx={6} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={2} />
          <rect x={58} y={y + 5} width={130} height={7} rx={3.5} fill={WF_LINE} />
          <rect x={58} y={y + 17} width={80} height={6} rx={3} fill={WF_LINE} />
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
      <rect x={15} y={98} width={140} height={10} rx={4} fill={WF_EMPHASIS} />
      <rect x={15} y={115} width={90} height={7} rx={3.5} fill={WF_LINE} />
      {cast.map((x) => (
        <rect key={x} x={x} y={130} width={28} height={28} rx={14} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={2} />
      ))}
    </WireframeCard>
  )
}

// İstatistikler sayfasının taslağı: üstte dört özet kutucuk, altında çubuk grafik.
function IstatistikWireframe() {
  const bars = [60, 90, 45, 110, 75, 30]
  return (
    <WireframeCard>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={16 + i * 70} y={14} width={62} height={34} rx={6} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={1.5} />
          <rect x={24 + i * 70} y={22} width={30} height={5} rx={2.5} fill={WF_LINE} />
          <rect x={24 + i * 70} y={33} width={20} height={8} rx={3} fill={i === 0 ? BRAND_TEXT : WF_EMPHASIS} />
        </g>
      ))}
      <rect x={16} y={58} width={268} height={92} rx={8} fill="none" stroke={WF_STROKE} strokeWidth={1.5} />
      {bars.map((h, i) => (
        <rect
          key={i}
          x={36 + i * 42}
          y={142 - h * 0.7}
          width={24}
          height={h * 0.7}
          rx={3}
          fill={i === 3 ? BRAND_TEXT : WF_FILL}
          stroke={WF_STROKE}
          strokeWidth={1}
        />
      ))}
    </WireframeCard>
  )
}

// Profil menüsü + sağ alttaki güncelleme bildirimi.
function MenuWireframe() {
  const items = ['Ayarlar', 'İstatistikler', 'Yardım Merkezi', 'Yama Notları', 'Açık / Koyu Tema']
  return (
    <WireframeCard>
      <circle cx={268} cy={16} r={9} fill={WF_FILL} stroke={BRAND_TEXT} strokeWidth={1.5} />
      <rect x={150} y={30} width={132} height={104} rx={8} fill={WF_FILL} stroke={WF_STROKE} strokeWidth={1.5} />
      {items.map((t, i) => (
        <text
          key={t}
          x={162}
          y={50 + i * 19}
          fontSize={9}
          fill={i === 4 ? BRAND_TEXT : 'var(--color-neutral-400)'}
          style={{ fontFamily: 'inherit' }}
        >
          {t}
        </text>
      ))}
      <rect x={14} y={112} width={124} height={38} rx={7} fill={WF_FILL} stroke={BRAND_TEXT} strokeWidth={1.2} />
      <rect x={22} y={121} width={70} height={5} rx={2.5} fill={WF_EMPHASIS} />
      <rect x={22} y={133} width={52} height={10} rx={3} fill={BRAND_TEXT} />
    </WireframeCard>
  )
}

// Yama Notları'ndaki çizimleri (bkz. components/PatchVisuals.tsx) Yardım Merkezi'nin pencere
// görünümlü çerçevesiyle aynı kılıfa koyar — iki tür çizim yan yana tutarlı dursun diye.
function VisualCard({ children }: { children: ReactNode }) {
  return (
    <div className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden shadow-lg shadow-black/20">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800">
        <span className="h-2 w-2 rounded-full bg-neutral-700" />
        <span className="h-2 w-2 rounded-full bg-neutral-700" />
        <span className="h-2 w-2 rounded-full bg-neutral-700" />
      </div>
      <div className="p-2">{children}</div>
    </div>
  )
}

type Group = 'baslarken' | 'ana-sayfa' | 'arsiv' | 'kesfet' | 'diger'

const GROUPS: { id: Group; label: string; hint: string }[] = [
  { id: 'baslarken', label: 'Başlarken', hint: 'Profiller ve ana sayfaya ilk bakış' },
  { id: 'ana-sayfa', label: 'Ana Sayfa', hint: 'Vitrin, satırlar ve mod satırı' },
  { id: 'arsiv', label: 'Arşiv', hint: 'Veritabanı, tablo, TMDB, Keşfet, Sağlık Kontrolü' },
  { id: 'kesfet', label: 'Keşfet ve İzle', hint: 'Arama, Ne İzlesem ve kayıt detayı' },
  { id: 'diger', label: 'Diğer', hint: 'İstatistikler, tema ve güncellemeler' },
]

interface Topic {
  group: Group
  icon: ReactNode
  title: string
  // Uygulamada nereden ulaşılır — kısa bir yol ("Ayarlar › Veritabanı" gibi).
  where: string
  text: string
  tips?: string[]
  visual: ReactNode
}

// İçerik 26 Eylül 2026'da (v1.8.1) uygulamanın o anki haline göre baştan gözden geçirildi. Yeni bir
// özellik eklenince ilgili konuya bir cümle ya da ipucu eklemek yeterli.
const TOPICS: Topic[] = [
  {
    group: 'baslarken',
    icon: <ProfileIcon />,
    title: 'Kim izliyor?',
    where: 'Açılışta · Sağ üstteki profil resmi',
    text: "ARGUS'u açtığında ilk gördüğün ekran. Evdeki herkes kendi profiliyle girer; arşivler, ana sayfa ayarları ve TMDB anahtarı her profilde ayrıdır, kimsenin listesi birbirine karışmaz.",
    tips: [
      'Sağ üstteki profil resmine tıklayıp açılan menüden başka bir profile anında geçebilirsin.',
      'Profil eklemek, adını ya da resmini değiştirmek için: Ayarlar › Profil Ayarları.',
    ],
    visual: <KimIzliyorWireframe />,
  },
  {
    group: 'baslarken',
    icon: <HomeIcon />,
    title: 'Ana Sayfa',
    where: 'Üst menü › Ana Sayfa',
    text: 'En üstte öne çıkan bir vitrin, altında "Tümü" ve eklediğin diğer satırlar sırayla dizilir. Bir kartın üzerine gelince kısa bir önizleme ve bilgileri çıkar; tıklayınca o kaydın detay penceresi açılır.',
    tips: [
      'Vitrindeki fragman sessiz başlar; sağ alttaki düğmelerle sesini açabilir ya da durdurabilirsin.',
      'Üst menüye eklediğin sayfalar (Diziler, Filmler gibi) tıklayınca kendi listesini açar.',
      'Satırlarda sağa sola kaydırmak için fareyle satırın üzerine gelip kenardaki oklara bas.',
    ],
    visual: <AnaSayfaWireframe />,
  },
  {
    group: 'ana-sayfa',
    icon: <GearIcon />,
    title: 'Vitrin ve görünüm',
    where: 'Ayarlar › Ana Sayfa Ayarları › Görünüm',
    text: 'Ana sayfanın nasıl görüneceğini buradan seçersin: kartların Yatay ya da Dikey olması ve boyutu, satır başlıklarının büyüklüğü ve vitrinin görünümü.',
    tips: [
      'Vitrin görünümü: Klasik (fragmanlı, kenarlardan içeride), Sinema (ekranı kenardan kenara kaplar) ya da Slayt (fragman yok, birkaç içerik 8 saniyede bir değişir).',
      'Vitrinde hangi içeriklerin çıkacağını bir türe ya da kategoriye göre daraltabilirsin.',
      '"Kart bilgilerini her zaman göster" açıkken kartların altındaki bilgi şeridi fareyle üzerine gelmeden de görünür.',
    ],
    visual: <AyarlarWireframe />,
  },
  {
    group: 'ana-sayfa',
    icon: <PlayCircleIcon />,
    title: 'Satırlar: Yeni Bölümler, En İyi 10 ve daha fazlası',
    where: 'Ayarlar › Ana Sayfa Ayarları › Görünüm › Satırlar',
    text: 'Vitrinin altındaki satırları açıp kapatabilir, bazılarının kaçıncı sırada duracağını seçebilirsin.',
    tips: [
      'Yeni Bölümler: durumu "İzleniyor" olan dizilerin yeni çıkan ve bu hafta çıkacak bölümleri.',
      'Arşivindeki En İyi 10: en yüksek puan verdiğin 10 içerik, yanlarında büyük sıra numaralarıyla.',
      'Otomatik doldur: en altta her girişte rastgele satırlar (bir tür, bir ülke…) çıkar; kaç tane geleceğini seçebilirsin.',
      '"Tümü" satırını kapatabilir, kartlarını karışık ya da sıralı getirebilirsin; kapak görseli olmayan kayıtları gizleyebilirsin.',
      'Kendi listelerin için: Ayarlar › Ana Sayfa Ayarları › Sayfalar — bir türe ya da duruma göre liste oluşturup üst menüye ya da ana sayfanın gövdesine eklersin.',
    ],
    visual: (
      <VisualCard>
        <YeniBolumlerVisual />
      </VisualCard>
    ),
  },
  {
    group: 'ana-sayfa',
    icon: <MoodFaceIcon />,
    title: 'Mod satırı',
    where: 'Ayarlar › Ana Sayfa Ayarları › Modlar',
    text: '"İzlenecek" listenden, ruh haline (moduna) göre öneriler gösteren özel satır. Her modun kendi görseli ve tür filtresi vardır; her mod günde bir kez yeni bir öneriye geçer.',
    tips: [
      '10 hazır modla başlarsın; açıp kapatabilir, düzenleyebilir ya da yenisini ekleyebilirsin.',
      'Satırın adını ve ana sayfada kaçıncı sırada duracağını da aynı yerden seçersin.',
    ],
    visual: <ModWireframe />,
  },
  {
    group: 'arsiv',
    icon: <DatabaseIcon />,
    title: 'Veritabanı',
    where: 'Ayarlar › Veritabanı',
    text: 'Bütün kayıtlarının durduğu yer. Dört bölümden oluşur: Arşivler, Şablonlar, İçe Aktar ve API.',
    tips: [
      'Arşivler: birden fazla arşiv açabilirsin (filmler, kitaplar, oyunlar…); her birinin kendi sütunları olur. Ana sayfada gösterilen arşivin yanında "Ana sayfada" yazar.',
      'Şablonlar: hazır ya da kendi oluşturduğun bir sütun setiyle tek tıkla yeni arşiv açarsın.',
      'İçe Aktar: bir CSV dosyasından (Notion dışa aktarımı ya da başka bir liste) kayıt getirirsin.',
      'API: TMDB\'den otomatik doldurma için kendi ücretsiz anahtarını girersin (bkz. "TMDB ile doldurma").',
    ],
    visual: <VeritabaniWireframe />,
  },
  {
    group: 'arsiv',
    icon: <DatabaseIcon />,
    title: 'Arşiv tablosu',
    where: 'Ayarlar › Veritabanı › bir arşive tıkla',
    text: 'Kayıtlarını bir tablo olarak düzenlediğin yer. Sağ üstteki araçlarla arayabilir, filtreleyebilir, sıralayabilir ve istemediğin sütunları gizleyebilirsin. Tablonun sağ üstündeki "i" düğmesi her şeyi çizimlerle anlatan kısa bir rehber açar.',
    tips: [
      'Tablonun üstündeki düğmelerle (Hepsi · İzlendi · İzlenecek…) tek tıkla duruma göre süzersin; başlığın altında kaç kayıt olduğu yazar.',
      'Sağa kaydırınca kaydın adı ve küçük afişi solda sabit kalır. Hücreye sığmayan etiketler için "+2" gibi bir sayı çıkar, üzerine gelince hepsi görünür.',
      'Satır simgesiyle (üç çizgi) Rahat ve Sıkı görünüm arasında geçersin; araç çubuğundaki simgelerin üzerine gelince ne işe yaradıkları yazar.',
      'Bir hücreye tıklayıp değerini değiştirirsin; açılan kutuyu "Kapat" ile kapatırsın. Puan kutusunda × ile tek kriteri, "Puanı kaldır" ile hepsini silersin.',
      'Satırın solundaki altı nokta: Güncelle, Altına Satır Ekle, Çoğalt, Sil. Göz ikonu o kaydın detayını açar.',
      'Sütun başlığını sürükleyip yerini değiştirebilirsin; başlığa tıklayınca adını, tipini, görevini değiştirebilir, sütunu temizleyebilir ya da silebilirsin.',
      'Satırların başındaki kutucuklarla birden fazla kaydı seçip toplu silebilirsin.',
      'Sütunların bir "görevi" vardır (Poster, Durum, Tür…): adını istediğin gibi değiştirsen de poster, istatistikler ya da TMDB doldurma bozulmaz.',
    ],
    visual: (
      <VisualCard>
        <GizliSutunVisual />
      </VisualCard>
    ),
  },
  {
    group: 'arsiv',
    icon: <GearIcon />,
    title: 'TMDB ile doldurma',
    where: 'Tabloda altı nokta › Güncelle · Araç çubuğu › Genel Güncelleme',
    text: "Bir kaydın sadece adını yazman yeterli: poster, yatay görsel, logo, özet, tür, ülke, yönetmen, oyuncular, süre, yaş sınırı, fragman ve dizilerde sezon/bölüm listesi TMDB'den gelir. Önce Ayarlar › Veritabanı › API'ye ücretsiz TMDB anahtarını girmen gerekir.",
    tips: [
      'Tek bir kayıt için: satırdaki altı nokta › Güncelle (detay penceresinde de aynı düğme var).',
      'Hepsi için: araç çubuğundaki Genel Güncelleme, eksik görünen kayıtları sırayla doldurur; istediğin an durdurabilirsin.',
      'Dişli simgesinden hangi alanların çekileceğini seçersin; "Dolu alanları da güncelle" açıkken dolu alanların üzerine de yazılır.',
      "Türkçe adını bilmiyorsan İngilizce ya da orijinal adıyla yazman yeterli; Kategori'yi Film/Dizi seçersen eşleşme daha isabetli olur.",
    ],
    visual: (
      <VisualCard>
        <GuncelleVisual />
      </VisualCard>
    ),
  },
  {
    group: 'arsiv',
    icon: <SearchIcon />,
    title: 'Keşfet',
    where: 'Arşiv tablosu › sağ üstteki pusula',
    text: "Arşivinde olmayan filmleri ve dizileri TMDB'den getirir: film ya da dizi, tür, kaç tane ve sıralama seçersin.",
    tips: [
      '"+ İzlenecek" ile listene eklersin; izlediysen "İzledim" deyip tarih ve puan verirsin (tarihi hatırlamıyorsan boş bırakabilirsin).',
      'İstemediğin bir öneriyi gizlersen bir daha karşına çıkmaz.',
    ],
    visual: (
      <VisualCard>
        <KesfetVisual />
      </VisualCard>
    ),
  },
  {
    group: 'arsiv',
    icon: <PlayCircleIcon />,
    title: 'Sağlık Kontrolü',
    where: 'Arşiv tablosu › sağ üstteki kalp atışı simgesi',
    text: 'Arşivindeki sorunlu kayıtları tek listede toplar: kapak görseli olmayanlar, eksik bilgisi olanlar (yönetmen, fragman…) ve görseli bilgisayardan silinmiş olanlar. Her kaydın yanında tam olarak neyinin eksik olduğu yazar.',
    tips: [
      'Üstteki düğmelerle "Video yok", "Yönetmen yok" gibi tek bir soruna göre süzebilirsin.',
      'Gerçekten olmayan bir şey için (ör. hiç fragmanı olmayan bir film) × ile "bu kayıtta bir daha sorma" diyebilirsin.',
    ],
    visual: (
      <VisualCard>
        <SaglikVisual />
      </VisualCard>
    ),
  },
  {
    group: 'kesfet',
    icon: <SearchIcon />,
    title: 'Arama ve Ne İzlesem?',
    where: 'Sağ üstteki büyüteç ve yanındaki kart simgesi',
    text: 'Büyüteç her yerden ulaşabileceğin genel arama: başlık, oyuncu, tür ya da ülke adına göre sonuç getirir, başlığa tam uyanlar en üstte çıkar. Yanındaki kart simgesi "Ne İzlesem?": kararsız kaldığında rastgele bir şey seçer.',
    tips: [
      'Klavyeden "/" tuşuna basınca arama kutusu açılır. Aradığın isim bir oyuncuya, türe ya da ülkeye uyuyorsa sonuçların en üstünde fotoğraflı olarak çıkar; tıklayınca onun listesi açılır.',
      'Ne İzlesem animasyonunu yarıda kesmek için sağ üstteki "Vazgeç"e ya da Esc tuşuna bas.',
      "Ne İzlesem arşivinden ya da TMDB'den (arşivinde olmayanlardan) seçebilir: Ayarlar › Ana Sayfa Ayarları › Ne İzlesem?",
      'Aynı yerden hangi kayıtlar arasından seçileceğini, kaç kartın döneceğini ve kartların dikey mi yatay mı olacağını ayarlarsın.',
      'TMDB\'den seçtiğinde çıkan pencereden tek tıkla İzlenecek\'e ekleyebilir ya da "bir daha gösterme" diyebilirsin.',
    ],
    visual: <AramaWireframe />,
  },
  {
    group: 'kesfet',
    icon: <PlayCircleIcon />,
    title: 'Kayıt detayı',
    where: 'Bir karta ya da tablodaki göz ikonuna tıkla',
    text: "Kaydın bütün bilgileri tek pencerede: fragman, özet, oyuncu kadrosu (rolleriyle), dizilerde sezon ve bölüm listesi, Türkiye'de hangi platformda izlenebildiği (Nerede İzlenir) ve benzer içerikler.",
    tips: [
      'Sağdaki bilgi sütunu sen aşağı kaydırırken yanında kalır: "Puanın" kartında kriter kriter puanların, "İzleme" kartında izleme tarihlerin ve dizilerde kaç bölüm izlediğin, altında da bilgiler ve Nerede İzlenir görünür.',
      'Bir oyuncuya tıklayınca oynadığı diğer kayıtları görürsün; "Filtreyi Kaldır ve Geri Dön" seni kaldığın yere geri götürür.',
      'Benzer İçerikler\'de bir afişe tıklayınca o içeriğin önizlemesi açılır; "+ İzlenecek" ile tek tıkla eklersin.',
      "Tablodan (göz ikonuyla) açtığında izlediğin bölümleri işaretleyebilir, yeni izleme tarihi ekleyebilir ve Güncelle ile TMDB'den yenileyebilirsin.",
    ],
    visual: <DetayWireframe />,
  },
  {
    group: 'diger',
    icon: <HomeIcon />,
    title: 'İstatistikler',
    where: 'Profil menüsü › İstatistikler',
    text: 'Arşivinin özeti: toplam kayıt, izlenen ve izlenecek sayısı, bu yıl izlediklerin, toplam izleme süresi ve ortalama puan; son 12 ayda aylara göre izlediklerin, kategori ve durum dağılımı, en çok geçen türler ve ülkeler, vizyon yılına ve verdiğin puanlara göre dağılım ve en çok karşına çıkan oyuncular. Grafiklerin üzerine gelince tam sayılar görünür.',
    visual: <IstatistikWireframe />,
  },
  {
    group: 'diger',
    icon: <ProfileIcon />,
    title: 'Tema, güncellemeler ve Yama Notları',
    where: 'Profil menüsü',
    text: "Sağ üstteki profil resmine tıklayınca açılan menüden Ayarlar'a, İstatistikler'e, bu sayfaya ve Yama Notları'na ulaşırsın; açık ve koyu tema arasında da buradan geçersin.",
    tips: [
      'Yeni bir sürüm çıkınca sağ altta bildirim belirir; "Şimdi Güncelle"ye basman yeterli.',
      "Her sürümde nelerin değiştiğini çizimleriyle birlikte Yama Notları'nda görebilirsin.",
    ],
    visual: <MenuWireframe />,
  },
]

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Verilerim nerede saklanıyor?',
    a: 'Hepsi kendi bilgisayarında, ARGUS klasörünün içinde: kayıtlar ve ayarlar "data", görseller "medya" klasöründe. Hiçbir buluta ya da sunucuya gönderilmez; internete sadece TMDB\'den bilgi çekerken çıkılır.',
  },
  {
    q: 'TMDB API anahtarını nasıl alırım?',
    a: "themoviedb.org'da ücretsiz bir hesap aç, hesap ayarlarındaki API bölümünden anahtarını oluştur ve Ayarlar › Veritabanı › API'ye yapıştır. Oradaki adımlar da aynı şeyi anlatıyor.",
  },
  {
    q: 'Bir sütunun adını değiştirirsem bir şey bozulur mu?',
    a: 'Hayır. Sütunların bir görevi vardır (Poster, Durum, Tür…) ve uygulama sütunu adıyla değil göreviyle bulur. Görevini sütun başlığına tıklayınca açılan menüden görebilir ve değiştirebilirsin.',
  },
  {
    q: 'Yanlışlıkla sildiğim bir şeyi geri getirebilir miyim?',
    a: 'Silme kalıcıdır, geri alınamaz. Bu yüzden her silmede tıkladığın yerin hemen yanında "emin misin?" diye sorulur.',
  },
  {
    q: 'Başka bir yerden (Notion, Excel, bir liste) kayıt aktarabilir miyim?',
    a: "Evet: listeni CSV olarak kaydet ve Ayarlar › Veritabanı › İçe Aktar ile getir. Başlıklar geldikten sonra tablodaki Genel Güncelleme ile eksik bilgileri TMDB'den doldurabilirsin.",
  },
  {
    q: 'Bir sütunu gizledim, verileri kaybolur mu?',
    a: 'Hayır. Gizlemek sadece görünümü değiştirir; sütun ve içindeki bilgiler yerinde durur, istediğin an yeniden gösterebilirsin.',
  },
  {
    q: 'Güncellemeler nasıl geliyor?',
    a: 'Yeni bir sürüm çıkınca sağ altta bildirim çıkar, "Şimdi Güncelle"ye basman yeterli. Nelerin değiştiğini Yama Notları\'nda görürsün; kurulu sürümün numarası da orada yazar.',
  },
]

function norm(s: string) {
  return s.toLocaleLowerCase('tr')
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function TopicCard({ topic, flip }: { topic: Topic; flip: boolean }) {
  return (
    <article className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-5 md:p-7">
      <div className={`flex flex-col gap-6 md:gap-8 md:items-center ${flip ? 'md:flex-row-reverse' : 'md:flex-row'}`}>
        <div className="w-full md:w-[46%] shrink-0">{topic.visual}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <Pictogram>{topic.icon}</Pictogram>
            <h3 className="text-lg md:text-xl font-semibold text-neutral-50">{topic.title}</h3>
          </div>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-1 bg-[#00c0fa]/10 text-[#00c0fa]">
            <span aria-hidden>📍</span>
            {topic.where}
          </p>
          <p className="text-sm text-neutral-300 leading-relaxed mt-3">{topic.text}</p>
          {topic.tips && topic.tips.length > 0 && (
            <ul className="mt-4 space-y-2">
              {topic.tips.map((t) => (
                <li key={t} className="flex gap-2.5 text-sm text-neutral-400 leading-relaxed">
                  <span
                    className="h-5 w-5 shrink-0 mt-px rounded-full flex items-center justify-center bg-[#00c0fa]/10"
                    style={{ color: BRAND_TEXT }}
                  >
                    <CheckIcon />
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  )
}

// pp menüsündeki "Yardım Merkezi" butonundan açılan, uygulamanın nasıl kullanılacağını anlatan
// sayfa. Kullanıcı "yardım merkezimiz ve içeriği görünüm olarak güzellikten nasibini alsın... bilgiler
// güncel mi kontrol et" dedi (26 Eylül 2026): üstte arama kutulu bir giriş, gruplara ayrılmış konular
// (her birinde taslak çizim + "nerede?" etiketi + ipuçları) ve en altta sık sorulan sorular. `?ilk=1`
// ile açıldığında (bkz. App.tsx'teki useAutoShowHelpOnce) "hoş geldin" yazısı ve en altta TEK bir
// "Anladım, Kapat" butonu eklenir.
export default function YardimMerkezi() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { notify } = useToast()
  const isFirstVisit = searchParams.get('ilk') === '1'
  const [query, setQuery] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  function handleClose() {
    notify("Yardım Merkezi'ne istediğin zaman sağ üstteki profil menüsünden ulaşabilirsin.")
    navigate('/')
  }

  const q = norm(query.trim())
  const topics = q ? TOPICS.filter((t) => norm([t.title, t.where, t.text, ...(t.tips ?? [])].join(' ')).includes(q)) : TOPICS
  const faq = q ? FAQ.filter((f) => norm(f.q + ' ' + f.a).includes(q)) : FAQ
  const visibleGroups = GROUPS.filter((g) => topics.some((t) => t.group === g.id))

  function jump(id: string) {
    document.getElementById(`yardim-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  let topicIndex = 0

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/60 px-6 pt-10 pb-7 mb-6">
        <div
          className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 h-64 w-[40rem] max-w-[140%] rounded-full blur-3xl opacity-20"
          style={{ background: BRAND_GRADIENT }}
        />
        <div className="relative flex flex-col items-center text-center">
          <img src="/logoblue.png" alt="ARGUS" className="h-14 w-14 mb-4 drop-shadow-[0_0_24px_rgba(0,192,250,0.35)]" />
          {isFirstVisit && <p className="text-xs font-semibold tracking-wide text-[#00c0fa] mb-2">👋 HOŞ GELDİN</p>}
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-50 tracking-tight">ARGUS Nasıl Çalışır?</h1>
          <p className="text-neutral-400 text-sm mt-2 max-w-md">
            {isFirstVisit
              ? 'Başlamadan önce uygulamanın bölümlerine hızlıca bir göz at — istersen aşağı kaydırıp oku, istersen direkt geç.'
              : 'Merak ettiğin bir şey olursa buradan hatırlayabilirsin — aşağıdan bir konu seç ya da ara.'}
          </p>
          <div className="relative w-full max-w-md mt-6">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Bir konu ara… (ör. fragman, TMDB, puan)"
              className="w-full rounded-xl bg-neutral-950/70 border border-neutral-700 focus:border-[#00c0fa]/60 pl-10 pr-4 py-2.5 text-sm text-neutral-100 outline-none transition"
            />
          </div>
        </div>
      </section>

      {!q && (
        <div className="sticky top-16 z-10 -mx-4 px-4 py-2 mb-8 bg-neutral-950/85 backdrop-blur-sm">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                onClick={() => jump(g.id)}
                className="shrink-0 text-xs font-medium rounded-full px-3 py-1.5 border border-neutral-800 text-neutral-400 hover:text-neutral-50 hover:border-neutral-600 transition"
              >
                {g.label}
              </button>
            ))}
            <button
              onClick={() => jump('sss')}
              className="shrink-0 text-xs font-medium rounded-full px-3 py-1.5 border border-[#00c0fa]/40 text-[#00c0fa] bg-[#00c0fa]/10 transition"
            >
              Sık Sorulanlar
            </button>
          </div>
        </div>
      )}

      {q && topics.length === 0 && faq.length === 0 && (
        <p className="text-center text-sm text-neutral-500 py-10">"{query}" ile ilgili bir şey bulamadım — başka bir kelimeyle dene.</p>
      )}

      <div className="space-y-12">
        {visibleGroups.map((g) => (
          <section key={g.id} id={`yardim-${g.id}`} className="scroll-mt-32">
            <div className="flex items-baseline gap-3 mb-4">
              <h2 className="text-2xl font-bold text-neutral-50 tracking-tight">{g.label}</h2>
              <span className="text-xs text-neutral-500">{g.hint}</span>
            </div>
            <div className="space-y-5">
              {topics
                .filter((t) => t.group === g.id)
                .map((t) => (
                  <TopicCard key={t.title} topic={t} flip={topicIndex++ % 2 === 1} />
                ))}
            </div>
          </section>
        ))}

        {faq.length > 0 && (
          <section id="yardim-sss" className="scroll-mt-32">
            <div className="flex items-baseline gap-3 mb-4">
              <h2 className="text-2xl font-bold text-neutral-50 tracking-tight">Sık Sorulanlar</h2>
            </div>
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 divide-y divide-neutral-800">
              {faq.map((f, i) => {
                const open = q ? true : openFaq === i
                return (
                  <div key={f.q}>
                    <button
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="w-full flex items-center justify-between gap-4 text-left px-5 md:px-6 py-4"
                    >
                      <span className="text-sm md:text-[15px] font-medium text-neutral-100">{f.q}</span>
                      <span className={`text-neutral-500 transition-transform ${open ? 'rotate-45' : ''}`} aria-hidden>
                        +
                      </span>
                    </button>
                    {open && <p className="px-5 md:px-6 pb-5 -mt-1 text-sm text-neutral-400 leading-relaxed">{f.a}</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {isFirstVisit && (
        <div className="flex justify-center mt-14">
          <button onClick={handleClose} style={primaryButtonStyle} className={`text-sm px-5 py-2.5 rounded-lg ${PRIMARY_BUTTON}`}>
            Anladım, Kapat
          </button>
        </div>
      )}
    </div>
  )
}
