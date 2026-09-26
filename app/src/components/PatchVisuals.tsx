import { ACCENT, Box, Chip, Frame, Highlight, Label, Line, Pin } from './wireframe'
import { CompassIcon, HealthIcon, InfoIcon } from './toolbarIcons'

// Yama Notları'nda "ne değişti/ne eklendi"yi gösteren küçük çizimler. Hepsi aynı boyutta
// (320×180) — sayfada iki sütunlu bir ızgarada yan yana duruyorlar. Mavi (ACCENT) her zaman
// "yeni olan şey"i işaret ediyor.

const VB = '0 0 320 180'

// Mavi "YENİ" etiketi
function NewTag({ x, y, text = 'YENİ' }: { x: number; y: number; text?: string }) {
  const w = text.length * 5.6 + 10
  return (
    <g>
      <rect x={x} y={y} width={w} height={13} rx={3} fill={ACCENT} />
      <text x={x + w / 2} y={y + 9.5} fontSize={7.5} fontWeight={700} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit' }}>
        {text}
      </text>
    </g>
  )
}

function Poster({ x, y, w = 34, dim = false }: { x: number; y: number; w?: number; dim?: boolean }) {
  return <rect x={x} y={y} width={w} height={w * 1.5} rx={3} className={dim ? 'fill-neutral-800' : 'fill-neutral-700'} />
}

function MiniButton({ x, y, w, text, accent = false }: { x: number; y: number; w: number; text: string; accent?: boolean }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={11}
        rx={2.5}
        fill={accent ? ACCENT : 'none'}
        className={accent ? undefined : 'stroke-neutral-600'}
        strokeWidth={accent ? 0 : 0.8}
      />
      <text
        x={x + w / 2}
        y={y + 8}
        fontSize={6.5}
        textAnchor="middle"
        fill={accent ? '#fff' : undefined}
        className={accent ? undefined : 'fill-neutral-300'}
        style={{ fontFamily: 'inherit' }}
      >
        {text}
      </text>
    </g>
  )
}

// Gerçek araç çubuğu ikonlarını çizimin içine yerleştirmek için (bkz. TableGuideModal'daki aynı yöntem).
function IconAt({ x, y, size = 12, Icon, accent = false }: { x: number; y: number; size?: number; Icon: (p: { className?: string }) => React.ReactNode; accent?: boolean }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 24 24" className={accent ? undefined : 'text-neutral-400'} style={accent ? { color: ACCENT } : undefined}>
      <Icon className="w-full h-full" />
    </svg>
  )
}

// ---- v1.6.1 --------------------------------------------------------------------------------

export function KesfetVisual() {
  return (
    <Frame viewBox={VB}>
      {/* araç çubuğunda pusula */}
      <Box x={196} y={8} w={116} h={22} r={6} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={204 + i * 20} y={13} width={12} height={12} rx={3} className="fill-neutral-800" />
      ))}
      <rect x={264} y={11} width={16} height={16} rx={4} fill={ACCENT} fillOpacity={0.15} />
      <IconAt x={266} y={13} Icon={CompassIcon} accent />
      <rect x={285} y={13} width={20} height={12} rx={3} className="fill-neutral-800" />
      <Pin x={272} y={40} n={1} />
      {/* keşfet penceresi */}
      <Box x={8} y={8} w={180} h={164} r={8} strong />
      <Label x={16} y={22} size={9}>Keşfet</Label>
      <MiniButton x={16} y={28} w={26} text="Film" accent />
      <MiniButton x={45} y={28} w={26} text="Dizi" />
      <Chip x={76} y={27} w={40} color="#a855f7" text="Bilim K." />
      <Chip x={119} y={27} w={30} color="#22c55e" text="Dram" />
      {[0, 1, 2, 3].map((i) => {
        const x = 16 + i * 42
        return (
          <g key={i}>
            <Poster x={x} y={48} w={36} />
            <circle cx={x + 31} cy={53} r={4} className="fill-neutral-900" />
            <text x={x + 31} y={55.5} fontSize={6} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
              ×
            </text>
            <Line x={x} y={106} w={30} light />
            <MiniButton x={x} y={116} w={17} text="+" accent={i === 0} />
            <MiniButton x={x + 19} y={116} w={17} text="✓" />
          </g>
        )
      })}
      <Highlight x={14} y={113} w={40} h={17} />
      <Pin x={34} y={144} n={2} />
      <Label x={46} y={147} size={7} muted>+ İzlenecek · ✓ İzledim · × gizle</Label>
      <NewTag x={16} y={156} text="ARŞİVİNDE OLMAYANLAR" />
    </Frame>
  )
}

export function DetayEkleriVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={304} h={164} r={8} strong />
      {/* üstteki büyük görsel + poster + başlık */}
      <rect x={8} y={8} width={304} height={30} rx={8} className="fill-neutral-700" />
      <Poster x={18} y={24} w={22} />
      <Line x={48} y={45} w={90} />
      <Line x={48} y={54} w={140} light />
      {/* nerede izlenir */}
      <Label x={18} y={78} size={8}>Nerede İzlenir</Label>
      <NewTag x={82} y={69} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={18 + i * 44} y={83} width={40} height={14} rx={4} className="fill-neutral-900 stroke-neutral-700" strokeWidth={0.8} />
          <rect x={21 + i * 44} y={86} width={8} height={8} rx={2} fill={['#e50914', '#113ccf', '#7b2cbf'][i]} />
          <Line x={32 + i * 44} y={87.5} w={22} light />
        </g>
      ))}
      {/* benzer içerikler: poster + altında düğme, düğmeler hep aynı hizada */}
      <Label x={18} y={112} size={8}>Benzer İçerikler</Label>
      <NewTag x={90} y={103} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = 18 + i * 48
        return (
          <g key={i}>
            <Poster x={x + 9} y={117} w={24} />
            <MiniButton x={x} y={157} w={42} text={i === 1 ? '✓ Arşivinde' : '+ İzlenecek'} accent={i === 0} />
          </g>
        )
      })}
    </Frame>
  )
}

export function YeniBolumlerVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={304} h={164} r={8} />
      <rect x={16} y={16} width={288} height={50} rx={6} className="fill-neutral-800" />
      <Line x={26} y={46} w={70} />
      <Label x={16} y={84} size={9}>Yeni Bölümler</Label>
      <NewTag x={80} y={75} />
      {[0, 1, 2].map((i) => {
        const x = 16 + i * 98
        return (
          <g key={i}>
            <rect x={x} y={92} width={90} height={50} rx={5} className="fill-neutral-700" />
            <rect x={x + 5} y={97} width={i === 1 ? 62 : 58} height={11} rx={2.5} fill={ACCENT} />
            <text x={x + 8} y={105} fontSize={6.2} fontWeight={700} fill="#fff" style={{ fontFamily: 'inherit' }}>
              {i === 1 ? '3 izlenmemiş bölüm' : i === 0 ? 'Yeni bölüm: S4 B2' : 'Yakında: S1 B5'}
            </text>
            <Line x={x} y={147} w={60} />
            <Line x={x} y={156} w={44} light />
          </g>
        )
      })}
    </Frame>
  )
}

export function GorevVisual() {
  return (
    <Frame viewBox={VB}>
      {/* tablo başlığı */}
      <Box x={8} y={10} w={304} h={20} r={4} strong />
      <Label x={16} y={23} size={8} muted>Türkçe Adı</Label>
      <Label x={96} y={23} size={8}>Afiş</Label>
      <Label x={176} y={23} size={8} muted>Tür</Label>
      <Label x={250} y={23} size={8} muted>Hal</Label>
      <Highlight x={90} y={12} w={60} h={16} />
      <Pin x={120} y={42} n={1} />
      {/* sütun menüsü */}
      <Box x={90} y={52} w={150} h={116} r={7} strong />
      <Label x={100} y={66} size={7} muted>Sütun adı</Label>
      <Box x={100} y={70} w={130} h={14} r={3} />
      <Label x={105} y={80} size={7.5}>Afiş</Label>
      <Label x={100} y={98} size={7} muted>Görevi</Label>
      <NewTag x={128} y={89} />
      <rect x={100} y={102} width={130} height={16} rx={3} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={1} />
      <Label x={106} y={113} size={8}>Poster</Label>
      <text x={222} y={113} fontSize={8} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        ▾
      </text>
      <Label x={100} y={132} size={6.5} muted>Adını değiştirsen de</Label>
      <Label x={100} y={141} size={6.5} muted>görevi kalır — hiçbir şey bozulmaz.</Label>
      <Pin x={250} y={110} n={2} />
    </Frame>
  )
}

// ---- v1.6.2 --------------------------------------------------------------------------------

export function NeIzlesemTmdbVisual() {
  return (
    <Frame viewBox={VB}>
      {/* ayar */}
      <Box x={8} y={8} w={140} h={60} r={7} />
      <Label x={16} y={22} size={7} muted>Nereden seçilsin</Label>
      <MiniButton x={16} y={28} w={50} text="Arşivimden" />
      <MiniButton x={70} y={28} w={70} text="TMDB'den" accent />
      <Chip x={16} y={46} w={30} color="#a855f7" />
      <Chip x={50} y={46} w={26} color="#22c55e" />
      <NewTag x={96} y={47} />
      {/* dağılan posterler */}
      {[
        [20, 92, -12],
        [52, 100, 8],
        [86, 88, -4],
        [118, 104, 14],
      ].map(([x, y, r], i) => (
        <rect key={i} x={x} y={y} width={26} height={39} rx={3} transform={`rotate(${r} ${x + 13} ${y + 19})`} className="fill-neutral-700" opacity={0.7} />
      ))}
      <path d="M150 110 h18" stroke={ACCENT} strokeWidth={1.3} markerEnd="url(#pv-arrow)" />
      <defs>
        <marker id="pv-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={ACCENT} />
        </marker>
      </defs>
      {/* önizleme */}
      <Box x={172} y={8} w={140} h={164} r={7} strong />
      <rect x={172} y={8} width={140} height={52} rx={7} className="fill-neutral-700" />
      <rect x={180} y={42} width={50} height={10} rx={2} className="fill-neutral-500" />
      <Label x={236} y={50} size={6} muted>logo</Label>
      <Poster x={180} y={66} w={26} />
      <Line x={212} y={70} w={80} />
      <Line x={212} y={80} w={60} light />
      <Line x={212} y={88} w={70} light />
      <MiniButton x={180} y={112} w={42} text="+ İzlenecek" accent />
      <MiniButton x={225} y={112} w={36} text="✓ İzledim" />
      <MiniButton x={264} y={112} w={40} text="Gösterme" />
      <Label x={180} y={138} size={7}>Nerede İzlenir</Label>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={180 + i * 20} y={144} width={14} height={14} rx={3} fill={['#e50914', '#113ccf', '#7b2cbf'][i]} />
      ))}
    </Frame>
  )
}

// ---- v1.6 ----------------------------------------------------------------------------------

export function GorselSekliVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={304} h={164} r={8} />
      <Label x={16} y={24} size={7} muted>Hangi görsel kullanılsın</Label>
      <MiniButton x={16} y={30} w={44} text="Otomatik" />
      <MiniButton x={63} y={30} w={34} text="Dikey" accent />
      <MiniButton x={100} y={30} w={34} text="Yatay" />
      <NewTag x={140} y={29} />
      {/* dikey */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={24 + i * 30} y={62 + (i % 2) * 8} width={24} height={36} rx={3} transform={`rotate(${[-10, 6, -4][i]} ${36 + i * 30} ${80})`} className="fill-neutral-700" />
      ))}
      <Label x={40} y={128} size={7.5}>Dikey → posterler</Label>
      {/* yatay */}
      {[0, 1].map((i) => (
        <rect key={i} x={176 + i * 56} y={66 + i * 6} width={52} height={29} rx={3} transform={`rotate(${[-6, 8][i]} ${202 + i * 56} 82)`} className="fill-neutral-700" />
      ))}
      <Label x={190} y={128} size={7.5}>Yatay → bannerlar</Label>
      <line x1={160} x2={160} y1={56} y2={140} className="stroke-neutral-800" />
    </Frame>
  )
}

export function SaglikVisual() {
  const rows = [
    ['Video', 'Yönetmen'],
    ['Video'],
    ['Poster', 'Video'],
  ]
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={304} h={164} r={8} strong />
      <IconAt x={16} y={15} Icon={HealthIcon} />
      <Label x={32} y={24} size={9}>Sağlık Kontrolü</Label>
      <Chip x={16} y={34} w={40} color="#737373" text="Hepsi" />
      <Chip x={60} y={34} w={62} color={ACCENT} text="Video yok (104)" />
      <Chip x={126} y={34} w={70} color="#737373" text="Yönetmen yok (54)" />
      {rows.map((tags, i) => {
        const y = 60 + i * 26
        // Etiketler sağdan sola, her biri kendi genişliği kadar yer kaplayarak diziliyor.
        let right = 298
        const placed = [...tags].reverse().map((t) => {
          const w = t.length * 5 + 16
          right -= w
          const x = right
          right -= 4
          return { t, x, w }
        })
        return (
          <g key={i}>
            <rect x={16} y={y} width={288} height={20} rx={4} className={i === 0 ? 'fill-neutral-800' : 'fill-neutral-900'} />
            <Line x={24} y={y + 8} w={90 - i * 12} />
            {placed.map(({ t, x, w }) => {
              const first = i === 0 && t === tags[0]
              return (
                <g key={t}>
                  <rect x={x} y={y + 4} width={w} height={12} rx={2.5} className="fill-neutral-800 stroke-neutral-700" strokeWidth={0.8} />
                  <text x={x + 5} y={y + 12.5} fontSize={6.5} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
                    {t}
                  </text>
                  <text x={x + w - 8} y={y + 12.5} fontSize={7.5} fontWeight={700} fill={first ? ACCENT : undefined} className={first ? undefined : 'fill-neutral-500'} style={{ fontFamily: 'inherit' }}>
                    ×
                  </text>
                  {first && <Highlight x={x - 3} y={y + 1} w={w + 6} h={18} />}
                </g>
              )
            })}
          </g>
        )
      })}
      <Label x={16} y={150} size={7} muted>Her kaydın yanında neyinin eksik olduğu yazıyor;</Label>
      <Label x={16} y={160} size={7} muted>× ile "bu kayıtta bir daha sorma".</Label>
    </Frame>
  )
}

export function RehberVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={304} h={26} r={6} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={150 + i * 20} y={14} width={14} height={14} rx={3} className="fill-neutral-800" />
      ))}
      <rect x={250} y={12} width={18} height={18} rx={4} fill={ACCENT} fillOpacity={0.15} />
      <IconAt x={253} y={15} Icon={InfoIcon} accent />
      <rect x={274} y={14} width={32} height={14} rx={3} fill={ACCENT} />
      <Pin x={259} y={46} n={1} />
      <Box x={40} y={58} w={240} h={112} r={8} strong />
      <Label x={50} y={74} size={8.5}>Arşiv tablosu nasıl kullanılır?</Label>
      <NewTag x={196} y={65} />
      <Box x={50} y={82} w={220} h={44} r={5} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={60 + i * 26} y={92} width={16} height={16} rx={3} className="fill-neutral-800" />
          <Pin x={68 + i * 26} y={117} n={i + 1} />
        </g>
      ))}
      <Line x={50} y={136} w={180} light />
      <Line x={50} y={146} w={150} light />
      <Line x={50} y={156} w={165} light />
    </Frame>
  )
}

// Mavi ok ucu — her çizim kendi id'siyle tanımlıyor (aynı sayfada birden fazla SVG var).
function ArrowDef({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill={ACCENT} />
      </marker>
    </defs>
  )
}

// ---- v1.7 ----------------------------------------------------------------------------------

export function GizliSutunVisual() {
  const cols = [
    { x: 16, w: 62, t: 'Türkçe Adı', hidden: false },
    { x: 82, w: 48, t: 'Durum', hidden: false },
    { x: 134, w: 48, t: 'Poster', hidden: true },
    { x: 186, w: 44, t: 'Tür', hidden: false },
    { x: 234, w: 70, t: 'Oyuncular', hidden: true },
  ]
  return (
    <Frame viewBox={VB}>
      <ArrowDef id="pv-arrow-g" />
      <Box x={8} y={8} w={304} h={74} r={7} />
      {cols.map((c) => (
        <g key={c.t}>
          <rect
            x={c.x}
            y={18}
            width={c.w}
            height={18}
            rx={3}
            className={c.hidden ? 'fill-none stroke-neutral-600' : 'fill-neutral-800'}
            strokeDasharray={c.hidden ? '3 2' : undefined}
          />
          <Label x={c.x + 5} y={30} size={7} muted={c.hidden}>
            {c.t}
          </Label>
          {c.hidden && (
            <Label x={c.x + c.w - 11} y={30} size={7} muted>
              ⊘
            </Label>
          )}
          <Line x={c.x + 4} y={46} w={c.w - 16} light />
          <Line x={c.x + 4} y={58} w={c.w - 22} light />
        </g>
      ))}
      {/* Tür sütunu sürükleniyor */}
      <rect x={182} y={14} width={52} height={26} rx={4} fill="none" stroke={ACCENT} strokeWidth={1.3} />
      <path d="M190 70 C 170 90, 120 90, 104 44" fill="none" stroke={ACCENT} strokeWidth={1.3} markerEnd="url(#pv-arrow-g)" />
      <Pin x={24} y={104} n={1} />
      <Label x={38} y={107} size={8}>Bir sütunu sürükleyip yerini değiştir</Label>
      <Pin x={24} y={128} n={2} />
      <Label x={38} y={131} size={8}>Gizli sütunlar (⊘) yerinde kalıyor,</Label>
      <Label x={38} y={143} size={8}>içlerindeki bilgiler kaybolmuyor</Label>
      <NewTag x={38} y={152} text="DÜZELTİLDİ" />
    </Frame>
  )
}

export function KapatPuanVisual() {
  const crit: [string, number][] = [
    ['Senaryo', 0.8],
    ['Oyunculuk', 0.65],
    ['Görsellik', 0.7],
  ]
  return (
    <Frame viewBox={VB}>
      {/* tablodaki puan hücresi */}
      <Box x={8} y={10} w={90} h={18} r={3} strong />
      <Label x={14} y={22} size={7.5}>
        ★ 7.2
      </Label>
      <NewTag x={104} y={13} />
      {/* açılan puan kutusu */}
      <Box x={40} y={34} w={200} h={138} r={8} strong />
      {crit.map(([name, v], i) => {
        const y = 46 + i * 24
        return (
          <g key={name}>
            <Label x={50} y={y + 4} size={7}>
              {name}
            </Label>
            <text x={214} y={y + 4} fontSize={7} textAnchor="end" className="fill-neutral-50" style={{ fontFamily: 'inherit' }}>
              {Math.round(v * 20) / 2}
            </text>
            <text
              x={224}
              y={y + 4.5}
              fontSize={9}
              fontWeight={700}
              textAnchor="middle"
              fill={i === 1 ? ACCENT : undefined}
              className={i === 1 ? undefined : 'fill-neutral-500'}
              style={{ fontFamily: 'inherit' }}
            >
              ×
            </text>
            <rect x={50} y={y + 9} width={170} height={3} rx={1.5} className="fill-neutral-700" />
            <rect x={50} y={y + 9} width={170 * v} height={3} rx={1.5} className="fill-neutral-300" />
          </g>
        )
      })}
      <Highlight x={217} y={63} w={14} h={14} r={4} />
      <line x1={50} x2={230} y1={120} y2={120} className="stroke-neutral-700" />
      <Label x={50} y={133} size={7} muted>
        Ortalama: 7.2 / 10
      </Label>
      <text x={230} y={133} fontSize={7} textAnchor="end" fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        Puanı kaldır
      </text>
      <MiniButton x={196} y={148} w={34} text="Kapat" accent />
      <Pin x={256} y={70} n={1} />
      <Label x={268} y={73} size={6.5} muted>
        tek kriteri sil
      </Label>
      <Pin x={256} y={130} n={2} />
      <Label x={268} y={133} size={6.5} muted>
        hepsini sil
      </Label>
      <Pin x={256} y={154} n={3} />
      <Label x={268} y={157} size={6.5} muted>
        kaydet, kapat
      </Label>
    </Frame>
  )
}

export function BenzerDetayVisual() {
  return (
    <Frame viewBox={VB}>
      <ArrowDef id="pv-arrow-b" />
      {/* detay penceresinin altındaki Benzer İçerikler */}
      <Box x={8} y={8} w={140} h={164} r={8} />
      <Label x={16} y={24} size={8}>
        Benzer İçerikler
      </Label>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Poster x={16 + i * 42} y={32} w={36} />
          <Line x={16 + i * 42} y={90} w={30} light />
        </g>
      ))}
      <Highlight x={55} y={29} w={42} h={70} />
      <Pin x={76} y={116} n={1} />
      <Label x={16} y={140} size={7} muted>
        Afişe ya da ada tıkla
      </Label>
      <NewTag x={16} y={150} />
      <path d="M150 60 h18" stroke={ACCENT} strokeWidth={1.3} markerEnd="url(#pv-arrow-b)" />
      {/* açılan önizleme */}
      <Box x={172} y={8} w={140} h={164} r={7} strong />
      <rect x={172} y={8} width={140} height={48} rx={7} className="fill-neutral-700" />
      <Poster x={180} y={62} w={26} />
      <Line x={212} y={66} w={80} />
      <Line x={212} y={76} w={60} light />
      <Line x={212} y={84} w={70} light />
      <MiniButton x={180} y={110} w={50} text="+ İzlenecek" accent />
      <MiniButton x={234} y={110} w={40} text="✓ İzledim" />
      <Label x={180} y={138} size={7}>
        Nerede İzlenir
      </Label>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={180 + i * 20} y={144} width={14} height={14} rx={3} fill={['#e50914', '#113ccf', '#7b2cbf'][i]} />
      ))}
      <Pin x={296} y={40} n={2} />
    </Frame>
  )
}

export function FiltreDonusVisual() {
  return (
    <Frame viewBox={VB}>
      <ArrowDef id="pv-arrow-f" />
      {/* oyuncu filtresi sayfası */}
      <Box x={8} y={8} w={140} h={164} r={8} />
      <Poster x={16} y={16} w={22} />
      <Line x={44} y={20} w={60} />
      <rect x={44} y={30} width={98} height={13} rx={3} fill={ACCENT} fillOpacity={0.15} stroke={ACCENT} strokeWidth={1} />
      <Label x={48} y={39} size={6}>
        × Filtreyi Kaldır ve Geri Dön
      </Label>
      {[0, 1, 2].map((i) => (
        <Poster key={i} x={16 + i * 42} y={62} w={36} dim />
      ))}
      <Pin x={128} y={52} n={1} />
      <Label x={16} y={148} size={6.5} muted>
        Tabloya, kaldığın satıra ve
      </Label>
      <Label x={16} y={158} size={6.5} muted>
        açık olan detaya geri döner
      </Label>
      <path d="M150 36 C 162 36, 158 60, 170 60" fill="none" stroke={ACCENT} strokeWidth={1.3} markerEnd="url(#pv-arrow-f)" />
      {/* kaldığın yerdeki tablo + açık detay penceresi */}
      <Box x={172} y={8} w={140} h={164} r={7} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <g key={i}>
          <Line x={180} y={20 + i * 18} w={40} light />
          <Line x={226} y={20 + i * 18} w={70} light />
        </g>
      ))}
      <Box x={196} y={46} w={100} h={80} r={6} strong />
      <rect x={196} y={46} width={100} height={26} rx={6} className="fill-neutral-700" />
      <Line x={204} y={80} w={60} />
      <Line x={204} y={90} w={76} light />
      <Line x={204} y={98} w={50} light />
      <Pin x={246} y={146} n={2} />
    </Frame>
  )
}

// ---- v1.7.1 --------------------------------------------------------------------------------

export function OnayYeriVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={304} h={164} r={8} />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={16} y={18 + i * 20} width={10} height={10} rx={2} className="fill-neutral-800" />
          <Line x={34} y={21 + i * 20} w={90} light />
          <Line x={136} y={21 + i * 20} w={60} light />
        </g>
      ))}
      {/* 6 nokta menüsü */}
      <Box x={16} y={62} w={70} h={34} r={5} strong />
      <Label x={24} y={75} size={6.5} muted>
        Çoğalt
      </Label>
      <Label x={24} y={89} size={6.5}>
        Sil
      </Label>
      <Highlight x={18} y={80} w={66} h={13} r={3} />
      <Pin x={98} y={86} n={1} />
      {/* onay kartı hemen yanında */}
      <rect x={30} y={104} width={150} height={50} rx={6} className="fill-neutral-900" stroke="#f43f5e" strokeOpacity={0.5} />
      <Label x={38} y={118} size={7}>
        Bu kaydı silmek istediğine
      </Label>
      <Label x={38} y={128} size={7}>
        emin misin?
      </Label>
      <rect x={38} y={135} width={24} height={12} rx={3} fill="#e11d48" />
      <text x={50} y={143.5} fontSize={6.5} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit' }}>
        Sil
      </text>
      <Label x={70} y={144} size={6.5} muted>
        Vazgeç
      </Label>
      <Pin x={192} y={128} n={2} />
      <NewTag x={204} y={122} text="TIKLADIĞIN YERDE" />
      {/* eski yer: sağ alt köşe, soluk */}
      <rect x={236} y={146} width={70} height={20} rx={4} fill="none" className="stroke-neutral-700" strokeDasharray="3 2" />
      <Label x={271} y={159} size={6} anchor="middle" muted>
        eskiden burada
      </Label>
    </Frame>
  )
}

// ---- v1.8 ----------------------------------------------------------------------------------

export function GuncelleVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={304} h={164} r={8} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <text x={18} y={30 + i * 22} fontSize={9} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
            ⠿
          </text>
          <Line x={32} y={25 + i * 22} w={100} light />
          <Line x={144} y={25 + i * 22} w={60} light />
        </g>
      ))}
      <Highlight x={14} y={20} w={14} h={14} r={3} />
      {/* menü */}
      <Box x={40} y={50} w={110} h={70} r={6} strong />
      <rect x={44} y={54} width={102} height={16} rx={3} fill={ACCENT} fillOpacity={0.15} />
      <text x={52} y={65} fontSize={8} fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        ↻ Güncelle
      </text>
      <Label x={52} y={84} size={7} muted>
        Altına Satır Ekle
      </Label>
      <Label x={52} y={98} size={7} muted>
        Çoğalt
      </Label>
      <Label x={52} y={112} size={7} muted>
        Sil
      </Label>
      <Pin x={162} y={62} n={1} />
      <Label x={180} y={100} size={7} muted>
        Eskiden kayda göre değişiyordu:
      </Label>
      <Label x={180} y={114} size={7} muted>
        {"\"TMDB'den Doldur\" /"}
      </Label>
      <Label x={180} y={126} size={7} muted>
        "Bölümleri Güncelle"
      </Label>
      <NewTag x={180} y={138} text="ARTIK HEP AYNI" />
    </Frame>
  )
}

// ---- v1.8.1 --------------------------------------------------------------------------------

export function SinemaVisual() {
  return (
    <Frame viewBox={VB}>
      {/* kenardan kenara vitrin, menü üstünde */}
      <rect x={0} y={0} width={320} height={78} className="fill-neutral-700" />
      <rect x={0} y={50} width={320} height={28} className="fill-neutral-900" opacity={0.6} />
      <Line x={12} y={6} w={30} />
      <Line x={250} y={6} w={58} light />
      <rect x={14} y={30} width={70} height={10} rx={2} className="fill-neutral-400" />
      <MiniButton x={14} y={46} w={40} text="Daha Fazla" accent />
      <Pin x={300} y={40} n={1} />
      {/* En İyi 10 */}
      <Label x={12} y={96} size={8}>
        Arşivindeki En İyi 10
      </Label>
      <NewTag x={98} y={87} />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <text x={12 + i * 62} y={148} fontSize={42} fontWeight={900} fill="none" className="stroke-neutral-500" strokeWidth={1.2} style={{ fontFamily: 'inherit' }}>
            {i + 1}
          </text>
          <Poster x={34 + i * 62} y={104} w={26} />
        </g>
      ))}
      <Pin x={300} y={126} n={2} />
      {/* slayt noktaları */}
      <Label x={12} y={168} size={7} muted>
        Vitrin: Klasik · Sinema · Slayt
      </Label>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={230 + i * 9} y={163} width={i === 0 ? 14 : 5} height={4} rx={2} fill={i === 0 ? ACCENT : undefined} className={i === 0 ? undefined : 'fill-neutral-600'} transform={i > 0 ? 'translate(9 0)' : undefined} />
      ))}
    </Frame>
  )
}
