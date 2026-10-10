import { useRef } from 'react'
import { ACCENT, Box, Chip, Frame, Highlight, Label, Line, Pin } from './wireframe'
import {
  BulkRefreshIcon,
  ColumnsIcon,
  CompassIcon,
  FilterIcon,
  GearIcon,
  HealthIcon,
  HistoryIcon,
  InfoIcon,
  SearchIcon,
  SortIcon,
} from './toolbarIcons'
import { useEscape } from '../hooks/useEscape'
import { tt } from '../lib/i18n'

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
  const icons = [SearchIcon, FilterIcon, SortIcon, ColumnsIcon, DensityGlyph, GearIcon, BulkRefreshIcon, HistoryIcon, HealthIcon, CompassIcon, InfoIcon]
  // Grup aralarındaki boşluk: 5. ve 7. düğmeden sonra.
  const xs = icons.map((_, i) => 122 + i * 30 + (i >= 5 ? 10 : 0) + (i >= 7 ? 10 : 0))
  return (
    <Frame viewBox="0 0 550 150">
      <Box x={4} y={4} w={542} h={142} r={10} />
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
      <rect x={474} y={18} width={64} height={24} rx={6} fill={ACCENT} fillOpacity={0.9} />
      <text x={506} y={34} fontSize={9} textAnchor="middle" fill="#fff" fontWeight={600} style={{ fontFamily: 'inherit' }}>
        {tt('+ Yeni Ekle')}
      </text>
      <Pin x={506} y={56} n={12} />
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
      <Label x={60} y={26} size={9} muted>{tt('Türkçe Adı')}</Label>
      <Label x={200} y={26} size={9} muted>{tt('Durum')}</Label>
      <Label x={300} y={26} size={9} muted>{tt('Tür')}</Label>
      <Label x={420} y={26} size={9} muted>{tt('Poster')}</Label>
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
      <Label x={62} y={144} size={9} muted>{tt('+ Yeni satır')}</Label>
      <Pin x={120} y={141} n={4} />
    </Frame>
  )
}

function ColumnWire() {
  return (
    <Frame viewBox="0 0 520 200">
      <Box x={10} y={10} w={340} h={24} r={4} strong />
      <Label x={24} y={26} size={9} muted>{tt('Türkçe Adı')}</Label>
      <Label x={124} y={26} size={9}>{tt('Durum')}</Label>
      <Label x={224} y={26} size={9} muted>{tt('Tür')}</Label>
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
      <Label x={126} y={96} size={8} muted>{tt('Sütun adı')}</Label>
      <Box x={126} y={100} w={180} h={16} r={4} />
      <Label x={132} y={111} size={8}>{tt('Durum')}</Label>
      <Label x={126} y={130} size={8} muted>{tt('Tip')}</Label>
      {[tt('Metin'), tt('Seçim'), tt('Tarih'), tt('Görsel')].map((t, i) => (
        <g key={t}>
          <rect x={126 + i * 45} y={134} width={41} height={14} rx={3} className={i === 1 ? 'fill-neutral-600' : 'fill-neutral-900 stroke-neutral-700'} />
          <Label x={146 + i * 45} y={144} size={7} anchor="middle">{t}</Label>
        </g>
      ))}
      <Chip x={126} y={156} w={40} color="#22c55e" text={tt('İzlendi')} />
      <Chip x={170} y={156} w={46} color="#eab308" text={tt('İzlenecek')} />
      <Label x={126} y={184} size={8} muted>{tt('Sütunu Temizle · Sütunu Sil')}</Label>
      <Pin x={330} y={96} n={2} />
      {/* yeni sütun popover */}
      <Box x={380} y={60} w={130} h={80} r={8} strong />
      <Box x={390} y={70} w={110} h={16} r={4} />
      <Label x={396} y={81} size={8} muted>{tt('Sütun adı')}</Label>
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
      <Label x={20} y={32} size={9} muted>{tt('Oyuncular')}</Label>
      <Chip x={90} y={21} w={60} color="#3b82f6" text={tt('Tom Hanks')} />
      <Chip x={154} y={21} w={70} color="#f97316" text={tt('Meg Ryan')} />
      <Highlight x={86} y={16} w={150} h={24} />
      <Pin x={250} y={28} n={1} />
      {/* açılan seçici */}
      <Box x={10} y={52} w={230} h={100} r={8} strong />
      <Box x={20} y={62} w={210} h={18} r={4} />
      <Label x={26} y={74} size={8}>{tt('Leonardo Di|')}</Label>
      <Chip x={20} y={90} w={62} color="#22c55e" text={tt('Leo Firth')} />
      <rect x={88} y={90} width={120} height={14} rx={7} className="fill-none stroke-neutral-500" strokeDasharray="3 2" />
      <Label x={148} y={100} size={8} anchor="middle">{tt('+ "Leonardo Di…" ekle')}</Label>
      <Pin x={220} y={97} n={2} />
      <Label x={20} y={124} size={8} muted>{tt('Enter → yeni oyuncu eklenir,')}</Label>
      <Label x={20} y={136} size={8} muted>{tt('sonra her kayıtta listeden seçilir')}</Label>
      {/* TMDB yolu */}
      <Box x={280} y={14} w={230} h={138} r={8} />
      <Label x={292} y={32} size={9}>{tt('Otomatik yol')}</Label>
      <Box x={292} y={42} w={120} h={18} r={4} strong />
      <Label x={352} y={54} size={8} anchor="middle">{tt('Güncelle')}</Label>
      <Pin x={424} y={51} n={3} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <circle cx={306 + i * 46} cy={92} r={14} className="fill-neutral-700" />
          <Line x={292 + i * 46} y={112} w={28} light />
        </g>
      ))}
      <Label x={292} y={138} size={8} muted>{tt('Oyuncular fotoğraflarıyla gelir')}</Label>
    </Frame>
  )
}

function RatingWire() {
  const crit = [
    [tt('Senaryo'), 0.8],
    [tt('Oyunculuk'), 0.65],
    [tt('Görsellik'), 0.9],
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
      <Label x={22} y={100} size={8} muted>{tt('+ kriter ekle')}</Label>
      <Pin x={80} y={97} n={1} />
      <path d="M270 60 h40" stroke={ACCENT} strokeWidth={1.2} markerEnd="url(#arrow2)" />
      <defs>
        <marker id="arrow2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={ACCENT} />
        </marker>
      </defs>
      <Box x={320} y={42} w={90} h={36} r={6} />
      <Label x={365} y={65} size={14} anchor="middle">7.8</Label>
      <Label x={420} y={64} size={8} muted>{tt('tabloda ortalama')}</Label>
      <Pin x={410} y={42} n={2} />
    </Frame>
  )
}

// ---- Sütun tipi tablosu ------------------------------------------------------------------

const TYPE_GUIDE: { type: string; use: string; example: string }[] = [
  { type: tt('Metin'), use: tt('Kısa, tek satırlık yazılar'), example: tt('Türkçe Adı, Orjinal Adı, Yönetmen') },
  { type: tt('Sinopsis / Açıklama'), use: tt('Uzun, çok satırlı yazılar'), example: tt('Sinopsis, notların') },
  { type: tt('Seçim'), use: tt('Her kayıtta sadece BİR değer seçilecekse'), example: tt('Durum (İzlendi / İzlenecek), Kategori (Film / Dizi)') },
  { type: tt('Çoklu Seçim'), use: tt('Bir kayıtta BİRDEN FAZLA değer olabilecekse'), example: tt('Tür, Ülke, Oyuncular') },
  { type: tt('Sayı'), use: tt('Hesap yapılacak rakamlar'), example: tt('Süre (dakika), Sıra') },
  { type: tt('Tarih'), use: tt('Tek bir gün'), example: tt('Vizyon Tarihi') },
  { type: tt('Çoklu Tarih'), use: tt('Aynı şey birden çok kez olduysa'), example: tt('İzleme Tarihi (tekrar izlediklerin)') },
  { type: tt('Onay Kutusu'), use: tt('Evet / hayır'), example: tt('Favori mi?, Sahibim') },
  { type: tt('Bağlantı / Fragman Linki'), use: tt('İnternet adresi'), example: tt('Video (YouTube fragmanı — vitrinde oynar)') },
  { type: tt('Görsel'), use: tt('Resim dosyası'), example: tt('Poster (dikey), Banner (yatay), Kapak Adı (logo)') },
  { type: tt('Puan'), use: tt('Kendi kriterlerinle 10 üzerinden puan'), example: tt('Puan (Senaryo, Oyunculuk, Müzik…)') },
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
  { id: 'rehber-arac', label: tt('Araç çubuğu') },
  { id: 'rehber-satir', label: tt('Satırlar') },
  { id: 'rehber-sutun', label: tt('Sütunlar') },
  { id: 'rehber-tip', label: tt('Hangi tip ne için?') },
  { id: 'rehber-oyuncu', label: tt('Oyuncu ekleme') },
  { id: 'rehber-puan', label: tt('Puanlama') },
  { id: 'rehber-ipucu', label: tt('İpuçları') },
]

export default function TableGuideModal({ onClose }: { onClose: () => void }) {
  useEscape(true, onClose)
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
              <h2 className="text-lg font-semibold text-neutral-50">{tt('Arşiv tablosu nasıl kullanılır?')}</h2>
              <p className="text-sm text-neutral-500 mt-1">
                {tt('Burası arşivinin tamamı: her satır bir film/dizi, her sütun onun bir bilgisi. Sütunları sen belirlersin, istediğini ekler, silersin.')}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label={tt('Kapat')}
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
          <Section id="rehber-arac" title={tt('Araç çubuğu')} intro={tt('Tablonun sağ üstündeki düğmeler, soldan sağa (üzerine gelince adları da yazar):')} wire={<ToolbarWire />}>
            <Steps
              items={[
                { n: 1, title: tt('Ara'), text: tt('Başlık, oyuncu, tür, ülke… herhangi bir yazıya göre tabloyu süzer.') },
                { n: 2, title: tt('Filtrele'), text: tt('Bir ya da birden fazla sütuna göre süzer: bir değere bir kez tıklarsan ✓ gelsin, iki kez tıklarsan ✕ gelmesin (ör. Tür: ✓ Korku, Ülke: ✕ ABD).') },
                { n: 3, title: tt('Sırala'), text: tt('Tabloyu bir sütuna göre A→Z, yeniden eskiye vb. dizer.') },
                { n: 4, title: tt('Sütunları göster/gizle'), text: tt('Görmek istemediğin sütunları kapatırsın. Veri silinmez, sadece gizlenir.') },
                { n: 5, title: tt('Satır sıklığı'), text: tt('Sıkı (daha çok satır sığar) ile Rahat (daha büyük satır ve afiş) arasında geçer. Seçimin bu arşiv için hatırlanır.') },
                { n: 6, title: tt('TMDB\'den neler gelsin'), text: tt('TMDB\'den bilgi çekerken hangi alanların doldurulacağını, her birinin hangi sütununa yazılacağını ve dolu alanların üzerine yazılıp yazılmayacağını seçersin.') },
                { n: 7, title: tt('Genel Güncelleme'), text: tt('Eksik bilgisi olan kayıtları TMDB\'den doldurur ya da sadece dizilerin bölümlerini yeniler; bütün arşive, filtreyle görünenlere ya da seçtiklerine. Tablonun üstünde o an ne yaptığını görürsün; durdurursan kaldığı yerden devam ettirebilirsin.') },
                { n: 8, title: tt('Geçmiş'), text: tt('Arşivdeki her ekleme, değişiklik ve silme gün gün burada. Tek tek geri alabilir, silineni geri getirebilir ya da arşivi bir günün başındaki haline döndürebilirsin.') },
                { n: 9, title: tt('Sağlık Kontrolü'), text: tt('Görseli, fragmanı, yönetmeni vb. eksik kayıtları ve neyinin eksik olduğunu listeler.') },
                { n: 10, title: tt('Keşfet'), text: tt('Film mi dizi mi, hangi türde, kaç tane istediğini seçersin; arşivinde OLMAYAN içerikleri getirir. Beğendiğini "+ İzlenecek" ile eklersin, izlediysen "İzledim" deyip tarih ve puan girersin, istemediğini × ile gizlersin (bir daha gelmez).') },
                { n: 11, title: tt('Bu rehber'), text: tt('Şu an okuduğun sayfa.') },
                { n: 12, title: tt('+ Yeni Ekle'), text: tt('Tabloya boş bir satır ekler. Adını yazıp satır menüsünden "Güncelle" dersen gerisi TMDB\'den otomatik gelir.') },
                { title: tt('Durum düğmeleri'), text: tt('Tablonun hemen üstündeki "Hepsi · İzlendi · İzlenecek…" düğmeleri tek tıkla duruma göre süzer; yanlarında kaç kayıt olduğu yazar.') },
              ]}
            />
          </Section>

          <Section id="rehber-satir" title={tt('Satırlar (kayıtlar)')} wire={<RowWire />}>
            <Steps
              items={[
                { n: 1, title: tt('Onay kutusu'), text: tt('Birden çok satırı seçip topluca silebilirsin. Başlıktaki kutu hepsini seçer.') },
                { n: 2, title: tt('Altı nokta ve göz'), text: tt('Satırın üzerine gelince belirir. Altı nokta satır menüsünü açar (Güncelle, Altına Satır Ekle, Çoğalt, Sil); göz ikonu kaydın detay penceresini açar.') },
                { n: 3, title: tt('Hücreye tıkla'), text: tt('Herhangi bir hücreye tıklayıp değerini değiştirirsin. Yazı yazılır, seçim listeden seçilir, görsel bilgisayardan ya da medya klasöründen seçilir.') },
                { n: 4, title: tt('Yeni satır'), text: tt('Tablonun en altından ya da "+ Yeni Ekle" ile eklersin.') },
                { title: tt('Adın yanındaki afiş'), text: tt('Her kaydın adının solunda küçük afişi durur; sağa kaydırınca ad ve afiş solda sabit kalır.') },
                { title: tt('"+2" gibi sayılar'), text: tt('Hücreye sığmayan etiketler ya da tarihler için kaç tane daha olduğunu gösterir; üzerine gelince hepsi yazar.') },
                { title: tt('Kapat'), text: tt('Bir hücreyi düzenlerken açılan kutuyu "Kapat" ile ya da boş bir yere tıklayarak kapatırsın; değişiklik kaydedilir.') },
              ]}
            />
          </Section>

          <Section id="rehber-sutun" title={tt('Sütunlar')} intro={tt('Sütunlar tamamen senin — hazır bir liste yok, neye ihtiyacın varsa onu eklersin.')} wire={<ColumnWire />}>
            <Steps
              items={[
                { n: 1, title: tt('Sütun ekle'), text: tt('Başlık satırının en sağındaki "+" ile. Bir ad yazıp tipini seçersin (hangi tipi seçeceğin aşağıda).') },
                { n: 2, title: tt('Sütun ayarları'), text: tt('Sütun adına tıkla: adını ve tipini değiştir, seçeneklerin renklerini ayarla, tüm değerleri temizle ya da sütunu sil. Görsel sütunlarında "Kapak Görseli Yap" (kartlarda görünen) ve "Vitrin Başlık Görseli Yap" (logo) da buradadır.') },
                { n: 3, title: tt('Genişlik'), text: tt('Sütun başlığının sağ kenarından tutup sürükle.') },
                { n: 4, title: tt('Sıra'), text: tt('Sütun başlığını tutup başka bir sütunun üstüne sürükle.') },
                { title: tt('Görevi'), text: tt('Sütun menüsündeki "Görevi" uygulamaya o sütunun ne işe yaradığını söyler (Poster, Durum, Tür, Puan…). Poster, istatistikler, TMDB doldurma ve Keşfet bunu kullanır. Görev sütunun adına bağlı değil — adını istediğin gibi değiştirebilirsin, hiçbir şey bozulmaz. Durum sütununda ayrıca hangi seçeneğin "İzlenecek / İzleniyor / İzlendi" anlamına geldiğini de seçebilirsin.') },
              ]}
            />
          </Section>

          <Section id="rehber-tip" title={tt('Hangi sütun tipini seçmeliyim?')} intro={tt('Kısa kural: tek değer → Seçim, birden çok değer → Çoklu Seçim, serbest yazı → Metin.')}>
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-800/60 text-left text-xs text-neutral-400">
                    <th className="px-3 py-2 font-medium">{tt('Tip')}</th>
                    <th className="px-3 py-2 font-medium">{tt('Ne zaman')}</th>
                    <th className="px-3 py-2 font-medium hidden sm:table-cell">{tt('Örnek')}</th>
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
            title={tt('Oyuncu ekleme')}
            intro={tt('Oyuncular ayrı bir şey değil — tipi Çoklu Seçim olan bir sütun. Her oyuncu o sütunun bir seçeneği.')}
            wire={<ActorWire />}
          >
            <Steps
              items={[
                { n: 1, title: tt('Hücreye tıkla'), text: tt('Kaydın Oyuncular hücresine tıkla.') },
                { n: 2, title: tt('Adı yaz'), text: tt('Listede varsa tıklayıp seç; yoksa "+ ekle"ye bas (ya da Enter). Oyuncu bir kere eklenince bütün kayıtlarda listeden seçilebilir.') },
                { n: 3, title: tt('Ya da otomatik'), text: tt('Satır menüsündeki "Güncelle" oyuncuları fotoğraflarıyla birlikte TMDB\'den kendisi ekler.') },
                { title: tt('Oyuncunun filmleri'), text: tt('Detay penceresinde bir oyuncunun adına tıklarsan o oyuncunun oynadığı tüm kayıtlar listelenir. Tür, Ülke gibi diğer etiketler de aynı şekilde çalışır.') },
              ]}
            />
          </Section>

          <Section id="rehber-puan" title={tt('Puanlama')} intro={tt('Puan tipi sütun, kendi belirlediğin kriterlere ayrı ayrı not vermeni sağlar.')} wire={<RatingWire />}>
            <Steps
              items={[
                { n: 1, title: tt('Kriterler'), text: tt('Puan hücresine tıkla, her kriter için kaydırıcıyı ayarla. "+ kriter ekle" ile kendi kriterini ekle (ör. Müzik, Final).') },
                { n: 2, title: tt('Ortalama'), text: tt('Tabloda tüm kriterlerin ortalaması tek bir puan olarak görünür.') },
                { title: tt('Puanı kaldırma'), text: tt('Kriterin yanındaki × o kriterin puanını, alttaki "Puanı kaldır" hepsini siler.') },
              ]}
            />
          </Section>

          <Section id="rehber-ipucu" title={tt('İpuçları')}>
            <Steps
              items={[
                { title: tt('TMDB anahtarı'), text: tt('Otomatik doldurma için bir kere Ayarlar → Veritabanı → API\'den TMDB anahtarını girmen gerekir.') },
                { title: tt('Kapak ve vitrin'), text: tt('Ana sayfadaki kartlarda hangi görselin görüneceğini sütun ayarlarındaki "Kapak Görseli Yap" belirler.') },
                { title: tt('Fragman'), text: tt('Video sütununa YouTube linki koyarsan vitrinde ve kartın üzerine gelince oynar.') },
                { title: tt('Nerede izlenir ve benzerler'), text: tt('Bir kaydın detay penceresinin en altında Türkiye\'de hangi platformda izlenebildiği (anlık bilgi) ve benzer içerikler var; benzerleri tek tıkla "İzlenecek" olarak ekleyebilirsin.') },
                { title: tt('Yeni bölümler'), text: tt('Durumu "İzleniyor" olan dizilerin yeni çıkan ya da bu hafta çıkacak bölümleri ana sayfanın en üstünde görünür. Bölümleri tek tek işaretliyorsan kaç bölüm geride olduğunu da yazar.') },
                { title: tt('Silme'), text: tt('Sütun silmek içindeki tüm bilgiyi de siler. Sadece görmek istemiyorsan gizlemek daha güvenli.') },
              ]}
            />
          </Section>
        </div>
      </div>
    </div>
  )
}
