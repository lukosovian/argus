import { useRef } from 'react'
import { ACCENT, Box, Chip, Frame, Highlight, Label, Line, Pin } from './wireframe'
import {
  BulkRefreshIcon,
  ColumnsIcon,
  CompassIcon,
  FilterIcon,
  GearIcon,
  HealthIcon,
  InfoIcon,
  SearchIcon,
  SortIcon,
} from './toolbarIcons'

// Arşiv tablosunun sağ üstündeki "i" butonuyla açılan kullanım rehberi — kullanıcı "burası
// nedir nasıl kullanılır wireframelerle bi infografik hazırla... oyuncu ekleme, sütun tipini
// neyde ne seçicek... wireframeler açık ve koyu temaya uyumlu olsun" dedi.
//
// Çizimler (wireframe) düz SVG ama renkleri sabit değil: `fill-neutral-*`/`stroke-neutral-*`
// class'ları kullanılıyor — açık temada neutral skalası ters çevrildiği için (bkz. index.css)
// aynı çizim her iki temada da kendiliğinden doğru görünüyor. Vurgu rengi (#00c0fa) iki temada
// da okunur olduğu için sabit.

// ---- Wireframeler ------------------------------------------------------------------------

// Satır sıklığı (Rahat/Sıkı) düğmesinin ikonu — BoardView'daki DensityIcon'un aynısı.
function DensityGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className}>
      <path d="M4 5h16M4 9.5h16M4 14h16M4 18.5h16" />
    </svg>
  )
}

function ToolbarWire() {
  // Gerçek araç çubuğundaki ikonların aynısı (bkz. toolbarIcons.tsx), aynı sırayla ve aynı üç grupta
  // (26 Eylül 2026'da araç çubuğu gruplara ayrılıp Rahat/Sıkı düğmesi eklendi).
  const icons = [SearchIcon, FilterIcon, SortIcon, ColumnsIcon, DensityGlyph, GearIcon, BulkRefreshIcon, HealthIcon, CompassIcon, InfoIcon]
  // Grup aralarındaki boşluk: 5. ve 7. düğmeden sonra.
  const xs = icons.map((_, i) => 122 + i * 30 + (i >= 5 ? 10 : 0) + (i >= 7 ? 10 : 0))
  return (
    <Frame viewBox="0 0 520 150">
      <Box x={4} y={4} w={512} h={142} r={10} />
      <Line x={20} y={30} w={90} />
      {[270, 340].map((x) => (
        <line key={x} x1={x} x2={x} y1={20} y2={40} className="stroke-neutral-700" strokeWidth={1} />
      ))}
      {icons.map((Icon, i) => {
        const x = xs[i]
        return (
          <g key={i}>
            <Box x={x} y={18} w={24} h={24} r={6} strong />
            {/* İç içe svg: 24 birimlik kendi alanında ikonu tam doldurur, dışarıda 16 birim yer kaplar. */}
            <svg x={x + 4} y={22} width={16} height={16} viewBox="0 0 24 24" className="text-neutral-300">
              <Icon className="w-full h-full" />
            </svg>
            <Pin x={x + 12} y={56} n={i + 1} />
          </g>
        )
      })}
      <rect x={444} y={18} width={64} height={24} rx={6} fill={ACCENT} fillOpacity={0.9} />
      <text x={476} y={34} fontSize={9} textAnchor="middle" fill="#fff" fontWeight={600} style={{ fontFamily: 'inherit' }}>
        + Yeni Ekle
      </text>
      <Pin x={476} y={56} n={11} />
      {/* altında küçük tablo izlenimi */}
      <Box x={20} y={80} w={480} h={20} r={3} strong />
      {[0, 1].map((r) => (
        <g key={r}>
          <Box x={20} y={100 + r * 20} w={480} h={20} r={0} />
          <Line x={30} y={107 + r * 20} w={90} />
          <Line x={170} y={107 + r * 20} w={60} light />
          <Line x={300} y={107 + r * 20} w={80} light />
        </g>
      ))}
    </Frame>
  )
}

function RowWire() {
  return (
    <Frame viewBox="0 0 520 170">
      {/* başlık satırı */}
      <Box x={10} y={10} w={500} h={24} r={4} strong />
      <Label x={60} y={26} size={9} muted>Türkçe Adı</Label>
      <Label x={200} y={26} size={9} muted>Durum</Label>
      <Label x={300} y={26} size={9} muted>Tür</Label>
      <Label x={420} y={26} size={9} muted>Poster</Label>
      {[0, 1, 2].map((r) => {
        const y = 34 + r * 30
        const active = r === 1
        return (
          <g key={r}>
            <rect x={10} y={y} width={500} height={30} className={active ? 'fill-neutral-800' : 'fill-neutral-900'} />
            <line x1={10} x2={510} y1={y + 30} y2={y + 30} className="stroke-neutral-800" />
            {/* onay kutusu */}
            <rect x={18} y={y + 10} width={10} height={10} rx={2} className="fill-none stroke-neutral-600" />
            {/* altı nokta tutamaç + göz */}
            {active && (
              <g>
                {[0, 1, 2].map((d) => (
                  <g key={d}>
                    <circle cx={36} cy={y + 10 + d * 5} r={1.3} className="fill-neutral-400" />
                    <circle cx={40} cy={y + 10 + d * 5} r={1.3} className="fill-neutral-400" />
                  </g>
                ))}
                <ellipse cx={51} cy={y + 15} rx={5} ry={3.2} className="fill-none stroke-neutral-400" />
              </g>
            )}
            <Line x={62} y={y + 13} w={90 - r * 10} />
            <Chip x={200} y={y + 8} w={52} color={['#22c55e', '#eab308', '#3b82f6'][r]} />
            <Chip x={300} y={y + 8} w={40} color="#a855f7" />
            <Chip x={344} y={y + 8} w={34} color="#ec4899" />
            <rect x={420} y={y + 4} width={16} height={22} rx={2} className="fill-neutral-700" />
          </g>
        )
      })}
      <Highlight x={14} y={70} w={10 + 18} h={22} />
      <Pin x={24} y={140} n={1} />
      <line x1={24} y1={132} x2={24} y2={97} stroke={ACCENT} strokeWidth={1} />
      <Highlight x={31} y={66} w={27} h={26} />
      <Pin x={46} y={150} n={2} />
      <line x1={46} y1={142} x2={46} y2={94} stroke={ACCENT} strokeWidth={1} />
      <Highlight x={196} y={69} w={60} h={22} />
      <Pin x={226} y={140} n={3} />
      <line x1={226} y1={132} x2={226} y2={93} stroke={ACCENT} strokeWidth={1} />
      {/* altta satır ekleme */}
      <Label x={62} y={144} size={9} muted>+ Yeni satır</Label>
      <Pin x={120} y={141} n={4} />
    </Frame>
  )
}

function ColumnWire() {
  return (
    <Frame viewBox="0 0 520 200">
      <Box x={10} y={10} w={340} h={24} r={4} strong />
      <Label x={24} y={26} size={9} muted>Türkçe Adı</Label>
      <Label x={124} y={26} size={9}>Durum</Label>
      <Label x={224} y={26} size={9} muted>Tür</Label>
      {/* sağdaki "+" */}
      <Box x={356} y={10} w={24} h={24} r={4} dashed />
      <Label x={368} y={26} size={13} anchor="middle">+</Label>
      <Pin x={368} y={48} n={1} />
      {/* boyutlandırma kenarı */}
      <rect x={212} y={10} width={3} height={24} fill={ACCENT} />
      <Pin x={213} y={48} n={3} />
      {/* sürükleme oku */}
      <path d="M150 40 q 20 14 45 0" fill="none" stroke={ACCENT} strokeWidth={1.2} markerEnd="url(#arrow)" />
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={ACCENT} />
        </marker>
      </defs>
      <Pin x={172} y={62} n={4} />
      <Highlight x={116} y={12} w={70} h={20} />
      {/* açılan sütun menüsü */}
      <Box x={116} y={80} w={200} h={112} r={8} strong />
      <Label x={126} y={96} size={8} muted>Sütun adı</Label>
      <Box x={126} y={100} w={180} h={16} r={4} />
      <Label x={132} y={111} size={8}>Durum</Label>
      <Label x={126} y={130} size={8} muted>Tip</Label>
      {['Metin', 'Seçim', 'Tarih', 'Görsel'].map((t, i) => (
        <g key={t}>
          <rect x={126 + i * 45} y={134} width={41} height={14} rx={3} className={i === 1 ? 'fill-neutral-600' : 'fill-neutral-900 stroke-neutral-700'} />
          <Label x={146 + i * 45} y={144} size={7} anchor="middle">{t}</Label>
        </g>
      ))}
      <Chip x={126} y={156} w={40} color="#22c55e" text="İzlendi" />
      <Chip x={170} y={156} w={46} color="#eab308" text="İzlenecek" />
      <Label x={126} y={184} size={8} muted>Sütunu Temizle · Sütunu Sil</Label>
      <Pin x={330} y={96} n={2} />
      {/* yeni sütun popover */}
      <Box x={380} y={60} w={130} h={80} r={8} strong />
      <Box x={390} y={70} w={110} h={16} r={4} />
      <Label x={396} y={81} size={8} muted>Sütun adı</Label>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={390 + (i % 2) * 56} y={92 + Math.floor(i / 2) * 18} width={52} height={14} rx={3} className="fill-neutral-900 stroke-neutral-700" />
      ))}
      <line x1={368} y1={56} x2={390} y2={66} stroke={ACCENT} strokeWidth={1} />
    </Frame>
  )
}

function ActorWire() {
  return (
    <Frame viewBox="0 0 520 170">
      {/* hücre */}
      <Box x={10} y={14} w={230} h={28} r={4} strong />
      <Label x={20} y={32} size={9} muted>Oyuncular</Label>
      <Chip x={90} y={21} w={60} color="#3b82f6" text="Tom Hanks" />
      <Chip x={154} y={21} w={70} color="#f97316" text="Meg Ryan" />
      <Highlight x={86} y={16} w={150} h={24} />
      <Pin x={250} y={28} n={1} />
      {/* açılan seçici */}
      <Box x={10} y={52} w={230} h={100} r={8} strong />
      <Box x={20} y={62} w={210} h={18} r={4} />
      <Label x={26} y={74} size={8}>Leonardo Di|</Label>
      <Chip x={20} y={90} w={62} color="#22c55e" text="Leo Firth" />
      <rect x={88} y={90} width={120} height={14} rx={7} className="fill-none stroke-neutral-500" strokeDasharray="3 2" />
      <Label x={148} y={100} size={8} anchor="middle">+ "Leonardo Di…" ekle</Label>
      <Pin x={220} y={97} n={2} />
      <Label x={20} y={124} size={8} muted>Enter → yeni oyuncu eklenir,</Label>
      <Label x={20} y={136} size={8} muted>sonra her kayıtta listeden seçilir</Label>
      {/* TMDB yolu */}
      <Box x={280} y={14} w={230} h={138} r={8} />
      <Label x={292} y={32} size={9}>Otomatik yol</Label>
      <Box x={292} y={42} w={120} h={18} r={4} strong />
      <Label x={352} y={54} size={8} anchor="middle">Güncelle</Label>
      <Pin x={424} y={51} n={3} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <circle cx={306 + i * 46} cy={92} r={14} className="fill-neutral-700" />
          <Line x={292 + i * 46} y={112} w={28} light />
        </g>
      ))}
      <Label x={292} y={138} size={8} muted>Oyuncular fotoğraflarıyla gelir</Label>
    </Frame>
  )
}

function RatingWire() {
  const crit = [
    ['Senaryo', 0.8],
    ['Oyunculuk', 0.65],
    ['Görsellik', 0.9],
  ] as const
  return (
    <Frame viewBox="0 0 520 120">
      <Box x={10} y={10} w={250} h={100} r={8} strong />
      {crit.map(([name, v], i) => (
        <g key={name}>
          <Label x={22} y={32 + i * 22} size={9}>{name}</Label>
          <rect x={100} y={27 + i * 22} width={120} height={4} rx={2} className="fill-neutral-700" />
          <rect x={100} y={27 + i * 22} width={120 * v} height={4} rx={2} fill={ACCENT} />
          <circle cx={100 + 120 * v} cy={29 + i * 22} r={5} fill={ACCENT} />
          <Label x={232} y={32 + i * 22} size={8} muted>{(v * 10).toFixed(1)}</Label>
        </g>
      ))}
      <Label x={22} y={100} size={8} muted>+ kriter ekle</Label>
      <Pin x={80} y={97} n={1} />
      <path d="M270 60 h40" stroke={ACCENT} strokeWidth={1.2} markerEnd="url(#arrow2)" />
      <defs>
        <marker id="arrow2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={ACCENT} />
        </marker>
      </defs>
      <Box x={320} y={42} w={90} h={36} r={6} />
      <Label x={365} y={65} size={14} anchor="middle">7.8</Label>
      <Label x={420} y={64} size={8} muted>tabloda ortalama</Label>
      <Pin x={410} y={42} n={2} />
    </Frame>
  )
}

// ---- Sütun tipi tablosu ------------------------------------------------------------------

const TYPE_GUIDE: { type: string; use: string; example: string }[] = [
  { type: 'Metin', use: 'Kısa, tek satırlık yazılar', example: 'Türkçe Adı, Orjinal Adı, Yönetmen' },
  { type: 'Sinopsis / Açıklama', use: 'Uzun, çok satırlı yazılar', example: 'Sinopsis, notların' },
  { type: 'Seçim', use: 'Her kayıtta sadece BİR değer seçilecekse', example: 'Durum (İzlendi / İzlenecek), Kategori (Film / Dizi)' },
  { type: 'Çoklu Seçim', use: 'Bir kayıtta BİRDEN FAZLA değer olabilecekse', example: 'Tür, Ülke, Oyuncular' },
  { type: 'Sayı', use: 'Hesap yapılacak rakamlar', example: 'Süre (dakika), Sıra' },
  { type: 'Tarih', use: 'Tek bir gün', example: 'Vizyon Tarihi' },
  { type: 'Çoklu Tarih', use: 'Aynı şey birden çok kez olduysa', example: 'İzleme Tarihi (tekrar izlediklerin)' },
  { type: 'Onay Kutusu', use: 'Evet / hayır', example: 'Favori mi?, Sahibim' },
  { type: 'Bağlantı / Fragman Linki', use: 'İnternet adresi', example: 'Video (YouTube fragmanı — vitrinde oynar)' },
  { type: 'Görsel', use: 'Resim dosyası', example: 'Poster (dikey), Banner (yatay), Kapak Adı (logo)' },
  { type: 'Puan', use: 'Kendi kriterlerinle 10 üzerinden puan', example: 'Puan (Senaryo, Oyunculuk, Müzik…)' },
]

// ---- Bölümler ----------------------------------------------------------------------------

type Step = { n?: number; title: string; text: React.ReactNode }

function Steps({ items }: { items: Step[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2.5">
          {s.n !== undefined ? (
            <span className="h-5 w-5 shrink-0 rounded-full text-white text-[11px] font-bold flex items-center justify-center mt-0.5" style={{ background: ACCENT }}>
              {s.n}
            </span>
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-500 mt-2" />
          )}
          <p className="text-sm text-neutral-300 leading-relaxed">
            <span className="font-semibold text-neutral-50">{s.title}</span> — {s.text}
          </p>
        </li>
      ))}
    </ol>
  )
}

function Section({ id, title, intro, wire, children }: { id: string; title: string; intro?: string; wire?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 border border-neutral-800 rounded-2xl p-5">
      <h3 className="text-base font-semibold text-neutral-50">{title}</h3>
      {intro && <p className="text-sm text-neutral-500 mt-1">{intro}</p>}
      {wire && <div className="mt-4 rounded-xl bg-neutral-950 border border-neutral-800 p-3">{wire}</div>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const SECTIONS = [
  { id: 'rehber-arac', label: 'Araç çubuğu' },
  { id: 'rehber-satir', label: 'Satırlar' },
  { id: 'rehber-sutun', label: 'Sütunlar' },
  { id: 'rehber-tip', label: 'Hangi tip ne için?' },
  { id: 'rehber-oyuncu', label: 'Oyuncu ekleme' },
  { id: 'rehber-puan', label: 'Puanlama' },
  { id: 'rehber-ipucu', label: 'İpuçları' },
]

export default function TableGuideModal({ onClose }: { onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  function jump(id: string) {
    const el = scrollRef.current?.querySelector(`#${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-sm flex items-start justify-center px-4 py-8" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[calc(100vh-4rem)] flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 border-b border-neutral-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-50">Arşiv tablosu nasıl kullanılır?</h2>
              <p className="text-sm text-neutral-500 mt-1">
                Burası arşivinin tamamı: her satır bir film/dizi, her sütun onun bir bilgisi. Sütunları sen belirlersin, istediğini ekler, silersin.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Kapat"
              className="h-8 w-8 shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-500 flex items-center justify-center text-neutral-400 hover:text-neutral-50 text-lg leading-none transition"
            >
              ×
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-4">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => jump(s.id)}
                className="text-xs rounded-full px-2.5 py-1 border border-neutral-700 text-neutral-400 hover:text-[#00c0fa] hover:border-[#00c0fa] transition"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div ref={scrollRef} className="overflow-y-auto p-6 space-y-5">
          <Section id="rehber-arac" title="Araç çubuğu" intro="Tablonun sağ üstündeki düğmeler, soldan sağa (üzerine gelince adları da yazar):" wire={<ToolbarWire />}>
            <Steps
              items={[
                { n: 1, title: 'Ara', text: 'Başlık, oyuncu, tür, ülke… herhangi bir yazıya göre tabloyu süzer.' },
                { n: 2, title: 'Filtrele', text: 'Bir Seçim/Çoklu Seçim sütununa göre sadece belli kayıtları gösterir (ör. Durum = İzlenecek).' },
                { n: 3, title: 'Sırala', text: 'Tabloyu bir sütuna göre A→Z, yeniden eskiye vb. dizer.' },
                { n: 4, title: 'Sütunları göster/gizle', text: 'Görmek istemediğin sütunları kapatırsın. Veri silinmez, sadece gizlenir.' },
                { n: 5, title: 'Satır sıklığı', text: 'Sıkı (daha çok satır sığar) ile Rahat (daha büyük satır ve afiş) arasında geçer. Seçimin bu arşiv için hatırlanır.' },
                { n: 6, title: 'API alanları', text: 'TMDB\'den bilgi çekerken hangi alanların doldurulacağını ve dolu alanların üzerine yazılıp yazılmayacağını seçersin.' },
                { n: 7, title: 'Genel Güncelleme', text: 'Eksik bilgisi olan tüm kayıtları tek seferde TMDB\'den doldurur. İstediğin an durdurabilirsin.' },
                { n: 8, title: 'Sağlık Kontrolü', text: 'Görseli, fragmanı, yönetmeni vb. eksik kayıtları ve neyinin eksik olduğunu listeler.' },
                { n: 9, title: 'Keşfet', text: 'Film mi dizi mi, hangi türde, kaç tane istediğini seçersin; arşivinde OLMAYAN içerikleri getirir. Beğendiğini "+ İzlenecek" ile eklersin, izlediysen "İzledim" deyip tarih ve puan girersin, istemediğini × ile gizlersin (bir daha gelmez).' },
                { n: 10, title: 'Bu rehber', text: 'Şu an okuduğun sayfa.' },
                { n: 11, title: '+ Yeni Ekle', text: 'Tabloya boş bir satır ekler. Adını yazıp satır menüsünden "Güncelle" dersen gerisi TMDB\'den otomatik gelir.' },
                { title: 'Durum düğmeleri', text: 'Tablonun hemen üstündeki "Hepsi · İzlendi · İzlenecek…" düğmeleri tek tıkla duruma göre süzer; yanlarında kaç kayıt olduğu yazar.' },
              ]}
            />
          </Section>

          <Section id="rehber-satir" title="Satırlar (kayıtlar)" wire={<RowWire />}>
            <Steps
              items={[
                { n: 1, title: 'Onay kutusu', text: 'Birden çok satırı seçip topluca silebilirsin. Başlıktaki kutu hepsini seçer.' },
                { n: 2, title: 'Altı nokta ve göz', text: 'Satırın üzerine gelince belirir. Altı nokta satır menüsünü açar (Güncelle, Altına Satır Ekle, Çoğalt, Sil); göz ikonu kaydın detay penceresini açar.' },
                { n: 3, title: 'Hücreye tıkla', text: 'Herhangi bir hücreye tıklayıp değerini değiştirirsin. Yazı yazılır, seçim listeden seçilir, görsel bilgisayardan ya da medya klasöründen seçilir.' },
                { n: 4, title: 'Yeni satır', text: 'Tablonun en altından ya da "+ Yeni Ekle" ile eklersin.' },
                { title: 'Adın yanındaki afiş', text: 'Her kaydın adının solunda küçük afişi durur; sağa kaydırınca ad ve afiş solda sabit kalır.' },
                { title: '"+2" gibi sayılar', text: 'Hücreye sığmayan etiketler ya da tarihler için kaç tane daha olduğunu gösterir; üzerine gelince hepsi yazar.' },
                { title: 'Kapat', text: 'Bir hücreyi düzenlerken açılan kutuyu "Kapat" ile ya da boş bir yere tıklayarak kapatırsın; değişiklik kaydedilir.' },
              ]}
            />
          </Section>

          <Section id="rehber-sutun" title="Sütunlar" intro="Sütunlar tamamen senin — hazır bir liste yok, neye ihtiyacın varsa onu eklersin." wire={<ColumnWire />}>
            <Steps
              items={[
                { n: 1, title: 'Sütun ekle', text: 'Başlık satırının en sağındaki "+" ile. Bir ad yazıp tipini seçersin (hangi tipi seçeceğin aşağıda).' },
                { n: 2, title: 'Sütun ayarları', text: 'Sütun adına tıkla: adını ve tipini değiştir, seçeneklerin renklerini ayarla, tüm değerleri temizle ya da sütunu sil. Görsel sütunlarında "Kapak Görseli Yap" (kartlarda görünen) ve "Vitrin Başlık Görseli Yap" (logo) da buradadır.' },
                { n: 3, title: 'Genişlik', text: 'Sütun başlığının sağ kenarından tutup sürükle.' },
                { n: 4, title: 'Sıra', text: 'Sütun başlığını tutup başka bir sütunun üstüne sürükle.' },
                { title: 'Görevi', text: 'Sütun menüsündeki "Görevi" uygulamaya o sütunun ne işe yaradığını söyler (Poster, Durum, Tür, Puan…). Poster, istatistikler, TMDB doldurma ve Keşfet bunu kullanır. Görev sütunun adına bağlı değil — adını istediğin gibi değiştirebilirsin, hiçbir şey bozulmaz. Durum sütununda ayrıca hangi seçeneğin "İzlenecek / İzleniyor / İzlendi" anlamına geldiğini de seçebilirsin.' },
              ]}
            />
          </Section>

          <Section id="rehber-tip" title="Hangi sütun tipini seçmeliyim?" intro="Kısa kural: tek değer → Seçim, birden çok değer → Çoklu Seçim, serbest yazı → Metin.">
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-800/60 text-left text-xs text-neutral-400">
                    <th className="px-3 py-2 font-medium">Tip</th>
                    <th className="px-3 py-2 font-medium">Ne zaman</th>
                    <th className="px-3 py-2 font-medium hidden sm:table-cell">Örnek</th>
                  </tr>
                </thead>
                <tbody>
                  {TYPE_GUIDE.map((t) => (
                    <tr key={t.type} className="border-t border-neutral-800 align-top">
                      <td className="px-3 py-2 font-medium text-neutral-50 whitespace-nowrap">{t.type}</td>
                      <td className="px-3 py-2 text-neutral-300">
                        {t.use}
                        <span className="block sm:hidden text-xs text-neutral-500 mt-0.5">{t.example}</span>
                      </td>
                      <td className="px-3 py-2 text-neutral-500 hidden sm:table-cell">{t.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            id="rehber-oyuncu"
            title="Oyuncu ekleme"
            intro="Oyuncular ayrı bir şey değil — tipi Çoklu Seçim olan bir sütun. Her oyuncu o sütunun bir seçeneği."
            wire={<ActorWire />}
          >
            <Steps
              items={[
                { n: 1, title: 'Hücreye tıkla', text: 'Kaydın Oyuncular hücresine tıkla.' },
                { n: 2, title: 'Adı yaz', text: 'Listede varsa tıklayıp seç; yoksa "+ ekle"ye bas (ya da Enter). Oyuncu bir kere eklenince bütün kayıtlarda listeden seçilebilir.' },
                { n: 3, title: 'Ya da otomatik', text: 'Satır menüsündeki "Güncelle" oyuncuları fotoğraflarıyla birlikte TMDB\'den kendisi ekler.' },
                { title: 'Oyuncunun filmleri', text: 'Detay penceresinde bir oyuncunun adına tıklarsan o oyuncunun oynadığı tüm kayıtlar listelenir. Tür, Ülke gibi diğer etiketler de aynı şekilde çalışır.' },
              ]}
            />
          </Section>

          <Section id="rehber-puan" title="Puanlama" intro="Puan tipi sütun, kendi belirlediğin kriterlere ayrı ayrı not vermeni sağlar." wire={<RatingWire />}>
            <Steps
              items={[
                { n: 1, title: 'Kriterler', text: 'Puan hücresine tıkla, her kriter için kaydırıcıyı ayarla. "+ kriter ekle" ile kendi kriterini ekle (ör. Müzik, Final).' },
                { n: 2, title: 'Ortalama', text: 'Tabloda tüm kriterlerin ortalaması tek bir puan olarak görünür.' },
                { title: 'Puanı kaldırma', text: 'Kriterin yanındaki × o kriterin puanını, alttaki "Puanı kaldır" hepsini siler.' },
              ]}
            />
          </Section>

          <Section id="rehber-ipucu" title="İpuçları">
            <Steps
              items={[
                { title: 'TMDB anahtarı', text: 'Otomatik doldurma için bir kere Ayarlar → Veritabanı → API\'den TMDB anahtarını girmen gerekir.' },
                { title: 'Kapak ve vitrin', text: 'Ana sayfadaki kartlarda hangi görselin görüneceğini sütun ayarlarındaki "Kapak Görseli Yap" belirler.' },
                { title: 'Fragman', text: 'Video sütununa YouTube linki koyarsan vitrinde ve kartın üzerine gelince oynar.' },
                { title: 'Nerede izlenir ve benzerler', text: 'Bir kaydın detay penceresinin en altında Türkiye\'de hangi platformda izlenebildiği (anlık bilgi) ve benzer içerikler var; benzerleri tek tıkla "İzlenecek" olarak ekleyebilirsin.' },
                { title: 'Yeni bölümler', text: 'Durumu "İzleniyor" olan dizilerin yeni çıkan ya da bu hafta çıkacak bölümleri ana sayfanın en üstünde görünür. Bölümleri tek tek işaretliyorsan kaç bölüm geride olduğunu da yazar.' },
                { title: 'Silme', text: 'Sütun silmek içindeki tüm bilgiyi de siler. Sadece görmek istemiyorsan gizlemek daha güvenli.' },
              ]}
            />
          </Section>
        </div>
      </div>
    </div>
  )
}
