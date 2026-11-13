import { ACCENT, Box, Chip, Frame, Highlight, Label, Line, Pin } from './wireframe'
import { CompassIcon, HealthIcon, InfoIcon } from './toolbarIcons'
import { tt, EP, ttc } from '../lib/i18n'
import Icon, { type IconName } from './Icon'

// Yama Notları'nda "ne değişti/ne eklendi"yi gösteren küçük çizimler. Hepsi aynı boyutta
// (320×180) — sayfada iki sütunlu bir ızgarada yan yana duruyorlar. Mavi (ACCENT) her zaman
// "yeni olan şey"i işaret ediyor.

const VB = '0 0 320 180'

// Metnin yaklaşık genişliği (çizimler Türkçe metne göre ölçüldü; İngilizce daha uzun olabiliyor)
const textW = (t: string, size: number) => t.length * size * 0.52
// Kutusuna sığmayan metin sıkıştırılır (SVG textLength)
const fit = (t: string, size: number, max: number) => (textW(t, size) > max ? { textLength: max, lengthAdjust: 'spacingAndGlyphs' as const } : {})

// Mavi "YENİ" etiketi (çizimin sağ kenarından taşmaz)
function NewTag({ x: x0, y, text = tt('YENİ') }: { x: number; y: number; text?: string }) {
  const w = text.length * 5.6 + 10
  const x = Math.min(x0, 316 - w)
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
        {...fit(text, 6.5, w - 3)}
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
      <Label x={16} y={22} size={9}>{tt('Keşfet')}</Label>
      <MiniButton x={16} y={28} w={26} text={tt('Film')} accent />
      <MiniButton x={45} y={28} w={26} text={tt('Dizi')} />
      <Chip x={76} y={27} w={40} color="#a855f7" text={tt('Bilim K.')} />
      <Chip x={119} y={27} w={30} color="#22c55e" text={tt('Dram')} />
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
      <Label x={46} y={147} size={7} muted>{tt('+ İzlenecek · ✓ İzledim · × gizle')}</Label>
      <NewTag x={16} y={156} text={tt('ARŞİVİNDE OLMAYANLAR')} />
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
      <Label x={18} y={78} size={8}>{tt('Nerede İzlenir')}</Label>
      <NewTag x={82} y={69} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={18 + i * 44} y={83} width={40} height={14} rx={4} className="fill-neutral-900 stroke-neutral-700" strokeWidth={0.8} />
          <rect x={21 + i * 44} y={86} width={8} height={8} rx={2} fill={['#e50914', '#113ccf', '#7b2cbf'][i]} />
          <Line x={32 + i * 44} y={87.5} w={22} light />
        </g>
      ))}
      {/* benzer içerikler: poster + altında düğme, düğmeler hep aynı hizada */}
      <Label x={18} y={112} size={8}>{tt('Benzer İçerikler')}</Label>
      <NewTag x={90} y={103} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = 18 + i * 48
        return (
          <g key={i}>
            <Poster x={x + 9} y={117} w={24} />
            <MiniButton x={x} y={157} w={42} text={i === 1 ? tt('✓ Arşivinde') : tt('+ İzlenecek')} accent={i === 0} />
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
      <Label x={16} y={84} size={9}>{tt('Yeni Bölümler')}</Label>
      <NewTag x={80} y={75} />
      {[0, 1, 2].map((i) => {
        const x = 16 + i * 98
        return (
          <g key={i}>
            <rect x={x} y={92} width={90} height={50} rx={5} className="fill-neutral-700" />
            <rect x={x + 5} y={97} width={80} height={11} rx={2.5} fill={ACCENT} />
            <text x={x + 8} y={105} fontSize={6.2} fontWeight={700} fill="#fff" style={{ fontFamily: 'inherit' }} {...fit(i === 1 ? tt('3 izlenmemiş bölüm') : i === 0 ? tt('Yeni bölüm: S4 B2') : tt('Yakında: S1 B5'), 6.2, 74)}>
              {i === 1 ? tt('3 izlenmemiş bölüm') : i === 0 ? tt('Yeni bölüm: S4 B2') : tt('Yakında: S1 B5')}
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
      <Label x={16} y={23} size={8} muted>{tt('Türkçe Adı')}</Label>
      <Label x={96} y={23} size={8}>{tt('Afiş')}</Label>
      <Label x={176} y={23} size={8} muted>{tt('Tür')}</Label>
      <Label x={250} y={23} size={8} muted>{tt('Hal')}</Label>
      <Highlight x={90} y={12} w={60} h={16} />
      <Pin x={120} y={42} n={1} />
      {/* sütun menüsü */}
      <Box x={90} y={52} w={150} h={116} r={7} strong />
      <Label x={100} y={66} size={7} muted>{tt('Sütun adı')}</Label>
      <Box x={100} y={70} w={130} h={14} r={3} />
      <Label x={105} y={80} size={7.5}>{tt('Afiş')}</Label>
      <Label x={100} y={98} size={7} muted>{tt('Görevi')}</Label>
      <NewTag x={128} y={89} />
      <rect x={100} y={102} width={130} height={16} rx={3} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={1} />
      <Label x={106} y={113} size={8}>{tt('Poster')}</Label>
      <text x={222} y={113} fontSize={8} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        ▾
      </text>
      <Label x={100} y={132} size={6.5} muted>{tt('Adını değiştirsen de')}</Label>
      <Label x={100} y={141} size={6.5} muted>{tt('görevi kalır — hiçbir şey bozulmaz.')}</Label>
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
      <Label x={16} y={22} size={7} muted>{tt('Nereden seçilsin')}</Label>
      <MiniButton x={16} y={28} w={50} text={tt('Arşivimden')} />
      <MiniButton x={70} y={28} w={70} text={tt('TMDB\'den')} accent />
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
      <Label x={236} y={50} size={6} muted>{tt('logo')}</Label>
      <Poster x={180} y={66} w={26} />
      <Line x={212} y={70} w={80} />
      <Line x={212} y={80} w={60} light />
      <Line x={212} y={88} w={70} light />
      <MiniButton x={180} y={112} w={42} text={tt('+ İzlenecek')} accent />
      <MiniButton x={225} y={112} w={36} text={tt('✓ İzledim')} />
      <MiniButton x={264} y={112} w={40} text={tt('Gösterme')} />
      <Label x={180} y={138} size={7}>{tt('Nerede İzlenir')}</Label>
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
      <Label x={16} y={24} size={7} muted>{tt('Hangi görsel kullanılsın')}</Label>
      <MiniButton x={16} y={30} w={44} text={tt('Otomatik')} />
      <MiniButton x={63} y={30} w={34} text={tt('Dikey')} accent />
      <MiniButton x={100} y={30} w={34} text={tt('Yatay')} />
      <NewTag x={140} y={29} />
      {/* dikey */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={24 + i * 30} y={62 + (i % 2) * 8} width={24} height={36} rx={3} transform={`rotate(${[-10, 6, -4][i]} ${36 + i * 30} ${80})`} className="fill-neutral-700" />
      ))}
      <Label x={40} y={128} size={7.5}>{tt('Dikey → posterler')}</Label>
      {/* yatay */}
      {[0, 1].map((i) => (
        <rect key={i} x={176 + i * 56} y={66 + i * 6} width={52} height={29} rx={3} transform={`rotate(${[-6, 8][i]} ${202 + i * 56} 82)`} className="fill-neutral-700" />
      ))}
      <Label x={190} y={128} size={7.5}>{tt('Yatay → bannerlar')}</Label>
      <line x1={160} x2={160} y1={56} y2={140} className="stroke-neutral-800" />
    </Frame>
  )
}

export function SaglikVisual() {
  const rows = [
    ['Video', tt('Yönetmen')],
    ['Video'],
    ['Poster', 'Video'],
  ]
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={304} h={164} r={8} strong />
      <IconAt x={16} y={15} Icon={HealthIcon} />
      <Label x={32} y={24} size={9}>{tt('Sağlık Kontrolü')}</Label>
      <Chip x={16} y={34} w={40} color="#737373" text={tt('Hepsi')} />
      <Chip x={60} y={34} w={62} color={ACCENT} text={tt('Video yok (104)')} />
      <Chip x={126} y={34} w={70} color="#737373" text={tt('Yönetmen yok (54)')} />
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
      <Label x={16} y={150} size={7} muted>{tt('Her kaydın yanında neyinin eksik olduğu yazıyor;')}</Label>
      <Label x={16} y={160} size={7} muted>{tt('× ile "bu kayıtta bir daha sorma".')}</Label>
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
      <Label x={50} y={74} size={8.5}>{tt('Arşiv tablosu nasıl kullanılır?')}</Label>
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
    { x: 16, w: 62, t: tt('Türkçe Adı'), hidden: false },
    { x: 82, w: 48, t: tt('Durum'), hidden: false },
    { x: 134, w: 48, t: 'Poster', hidden: true },
    { x: 186, w: 44, t: tt('Tür'), hidden: false },
    { x: 234, w: 70, t: tt('Oyuncular'), hidden: true },
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
      <Label x={38} y={107} size={8}>{tt('Bir sütunu sürükleyip yerini değiştir')}</Label>
      <Pin x={24} y={128} n={2} />
      <Label x={38} y={131} size={8}>{tt('Gizli sütunlar (⊘) yerinde kalıyor,')}</Label>
      <Label x={38} y={143} size={8}>{tt('içlerindeki bilgiler kaybolmuyor')}</Label>
      <NewTag x={38} y={152} text={tt('DÜZELTİLDİ')} />
    </Frame>
  )
}

export function KapatPuanVisual() {
  const crit: [string, number][] = [
    [tt('Senaryo'), 0.8],
    [tt('Oyunculuk'), 0.65],
    [tt('Görsellik'), 0.7],
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
        {tt('Ortalama: 7.2 / 10')}
      </Label>
      <text x={230} y={133} fontSize={7} textAnchor="end" fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        {tt('Puanı kaldır')}
      </text>
      <MiniButton x={196} y={148} w={34} text={tt('Kapat')} accent />
      <Pin x={256} y={70} n={1} />
      <Label x={268} y={73} size={6.5} muted>
        {tt('tek kriteri sil')}
      </Label>
      <Pin x={256} y={130} n={2} />
      <Label x={268} y={133} size={6.5} muted>
        {tt('hepsini sil')}
      </Label>
      <Pin x={256} y={154} n={3} />
      <Label x={268} y={157} size={6.5} muted>
        {tt('kaydet, kapat')}
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
        {tt('Benzer İçerikler')}
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
        {tt('Afişe ya da ada tıkla')}
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
      <MiniButton x={180} y={110} w={50} text={tt('+ İzlenecek')} accent />
      <MiniButton x={234} y={110} w={40} text={tt('✓ İzledim')} />
      <Label x={180} y={138} size={7}>
        {tt('Nerede İzlenir')}
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
        {tt('× Filtreyi Kaldır ve Geri Dön')}
      </Label>
      {[0, 1, 2].map((i) => (
        <Poster key={i} x={16 + i * 42} y={62} w={36} dim />
      ))}
      <Pin x={128} y={52} n={1} />
      <Label x={16} y={148} size={6.5} muted>
        {tt('Tabloya, kaldığın satıra ve')}
      </Label>
      <Label x={16} y={158} size={6.5} muted>
        {tt('açık olan detaya geri döner')}
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
        {tt('Çoğalt')}
      </Label>
      <Label x={24} y={89} size={6.5}>
        {tt('Sil')}
      </Label>
      <Highlight x={18} y={80} w={66} h={13} r={3} />
      <Pin x={98} y={86} n={1} />
      {/* onay kartı hemen yanında */}
      <rect x={30} y={104} width={150} height={50} rx={6} className="fill-neutral-900" stroke="#f43f5e" strokeOpacity={0.5} />
      <Label x={38} y={118} size={7}>
        {tt('Bu kaydı silmek istediğine')}
      </Label>
      <Label x={38} y={128} size={7}>
        {tt('emin misin?')}
      </Label>
      <rect x={38} y={135} width={24} height={12} rx={3} fill="#e11d48" />
      <text x={50} y={143.5} fontSize={6.5} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit' }}>
        {tt('Sil')}
      </text>
      <Label x={70} y={144} size={6.5} muted>
        {tt('Vazgeç')}
      </Label>
      <Pin x={192} y={128} n={2} />
      <NewTag x={204} y={122} text={tt('TIKLADIĞIN YERDE')} />
      {/* eski yer: sağ alt köşe, soluk */}
      <rect x={236} y={146} width={70} height={20} rx={4} fill="none" className="stroke-neutral-700" strokeDasharray="3 2" />
      <Label x={271} y={159} size={6} anchor="middle" muted>
        {tt('eskiden burada')}
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
        {tt('↻ Güncelle')}
      </text>
      <Label x={52} y={84} size={7} muted>
        {tt('Altına Satır Ekle')}
      </Label>
      <Label x={52} y={98} size={7} muted>
        {tt('Çoğalt')}
      </Label>
      <Label x={52} y={112} size={7} muted>
        {tt('Sil')}
      </Label>
      <Pin x={162} y={62} n={1} />
      <Label x={180} y={100} size={7} muted>
        {tt('Eskiden kayda göre değişiyordu:')}
      </Label>
      <Label x={180} y={114} size={7} muted>
        {tt('"TMDB\'den Doldur" /')}
      </Label>
      <Label x={180} y={126} size={7} muted>
        {tt('"Bölümleri Güncelle"')}
      </Label>
      <NewTag x={180} y={138} text={tt('ARTIK HEP AYNI')} />
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
      <MiniButton x={14} y={46} w={40} text={tt('Daha Fazla')} accent />
      <Pin x={300} y={40} n={1} />
      {/* En İyi 10 */}
      <Label x={12} y={96} size={8}>
        {tt('Arşivindeki En İyi 10')}
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
        {tt('Vitrin: Klasik · Sinema · Slayt')}
      </Label>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={230 + i * 9} y={163} width={i === 0 ? 14 : 5} height={4} rx={2} fill={i === 0 ? ACCENT : undefined} className={i === 0 ? undefined : 'fill-neutral-600'} transform={i > 0 ? 'translate(9 0)' : undefined} />
      ))}
    </Frame>
  )
}

// ---- v1.8.2 / v1.9 --------------------------------------------------------------------------

const GREEN = '#34d399'
const RED = '#f87171'

// Bir tık ✓ gelsin, iki tık ✕ gelmesin rozeti
function TriChip({ x, y, w, state, text }: { x: number; y: number; w: number; state: 'in' | 'out' | 'none'; text: string }) {
  const color = state === 'in' ? GREEN : state === 'out' ? RED : undefined
  return (
    <g opacity={state === 'none' ? 0.55 : 1}>
      <rect
        x={x}
        y={y}
        width={w}
        height={13}
        rx={6.5}
        fill={color ?? 'none'}
        fillOpacity={color ? 0.15 : 0}
        stroke={color}
        className={color ? undefined : 'stroke-neutral-600'}
        strokeWidth={1}
      />
      <text x={x + w / 2} y={y + 9} fontSize={7} textAnchor="middle" className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {state === 'in' ? '✓ ' : state === 'out' ? '✕ ' : ''}
        {text}
      </text>
    </g>
  )
}

export function OtomatikFiltreVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={304} h={164} r={8} strong />
      <Label x={18} y={24} size={8.5}>
        {tt('Hangi satırlar gelsin, hangileri gelmesin')}
      </Label>
      <NewTag x={196} y={15} />
      <Label x={18} y={42} size={7} muted>
        {tt('Tür')}
      </Label>
      <TriChip x={46} y={33} w={44} state="in" text={tt('Korku')} />
      <TriChip x={94} y={33} w={52} state="in" text={tt('Gerilim')} />
      <TriChip x={150} y={33} w={52} state="out" text={tt('Komedi')} />
      <TriChip x={206} y={33} w={40} state="none" text={tt('Dram')} />
      <Pin x={292} y={40} n={1} />
      <Label x={18} y={64} size={7} muted>
        {tt('Ülke')}
      </Label>
      <TriChip x={50} y={55} w={40} state="out" text={tt('ABD')} />
      <TriChip x={94} y={55} w={50} state="none" text={tt('Türkiye')} />
      <line x1={16} y1={80} x2={304} y2={80} className="stroke-neutral-700" />
      <Label x={18} y={96} size={7.5}>
        {tt('Durum')}
      </Label>
      <MiniButton x={236} y={88} w={62} text={tt('Hiç gelmesin')} />
      <Pin x={226} y={94} n={2} />
      <line x1={16} y1={108} x2={304} y2={108} className="stroke-neutral-700" />
      {/* ülke adları: bayraksız, Türkçe */}
      <Label x={18} y={128} size={7} muted>
        {tt('Yeni eklenen ülkeler artık böyle:')}
      </Label>
      <TriChip x={18} y={136} w={60} state="none" text={tt('Hırvatistan')} />
      <TriChip x={82} y={136} w={54} state="none" text={tt('Porto Riko')} />
      <text x={148} y={146} fontSize={7} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('(önceden "HR Croatia")')}
      </text>
      <Pin x={292} y={142} n={3} />
    </Frame>
  )
}

export function TakvimAyVisual() {
  const cw = 42
  const x0 = 13
  const tall: Record<number, number> = { 2: 3, 8: 1, 10: 2, 15: 1 }
  return (
    <Frame viewBox={VB}>
      <Label x={12} y={16} size={9}>
        {tt('‹ Nisan 2025 ›')}
      </Label>
      <NewTag x={78} y={7} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={200 + i * 38} y={8} width={34} height={11} rx={5.5} className="fill-neutral-800 stroke-neutral-700" strokeWidth={0.8} />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={`d${i}`} x={x0 + 4 + i * cw} y={26} width={16} height={4} rx={2} className="fill-neutral-700" />
      ))}
      {/* iki hafta: ilk satırda bir gün uzamış */}
      {[0, 1].map((w) => {
        const rowH = w === 0 ? 76 : 50
        const y = w === 0 ? 34 : 112
        return Array.from({ length: 7 }, (_, i) => {
          const idx = w * 7 + i
          const n = tall[idx] ?? 0
          const today = idx === 11
          const upcoming = idx === 13
          return (
            <g key={idx}>
              <rect x={x0 + i * cw} y={y} width={cw - 3} height={rowH} rx={3} className="fill-neutral-900 stroke-neutral-700" strokeWidth={0.8} />
              <circle cx={x0 + 7 + i * cw} cy={y + 6} r={3.5} fill={today ? ACCENT : undefined} className={today ? undefined : 'fill-neutral-700'} />
              {Array.from({ length: n }, (_, k) => (
                <g key={k}>
                  <rect x={x0 + 3 + i * cw} y={y + 13 + k * 20} width={cw - 9} height={17} rx={2} className="fill-neutral-800" />
                  <rect x={x0 + 5 + i * cw} y={y + 15 + k * 20} width={8} height={13} rx={1} className="fill-neutral-600" />
                  <rect x={x0 + 15 + i * cw} y={y + 17 + k * 20} width={16} height={3} rx={1.5} className="fill-neutral-500" />
                  <rect x={x0 + 15 + i * cw} y={y + 23 + k * 20} width={11} height={2.5} rx={1.2} fill={k === 1 && idx === 2 ? GREEN : undefined} className={k === 1 && idx === 2 ? undefined : 'fill-neutral-700'} />
                </g>
              ))}
              {upcoming && (
                <rect x={x0 + 3 + i * cw} y={y + 13} width={cw - 9} height={17} rx={2} fill="none" stroke={ACCENT} strokeWidth={0.9} strokeDasharray="3 2" />
              )}
            </g>
          )
        })
      })}
      <Pin x={x0 + 2 * cw + 20} y={116} n={1} />
      <Pin x={x0 + 6 * cw + 20} y={170} n={2} />
    </Frame>
  )
}

export function TakvimGunVisual() {
  return (
    <Frame viewBox={VB}>
      {/* soldaki soluk takvim */}
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={8 + (i % 4) * 36} y={10 + Math.floor(i / 4) * 54} width={32} height={50} rx={3} className="fill-neutral-900 stroke-neutral-800" strokeWidth={0.8} />
      ))}
      {/* sağdan açılan gün paneli */}
      <Box x={150} y={4} w={166} h={172} r={6} strong />
      <Label x={158} y={18} size={8}>
        {tt('22 Nisan 2025')}
      </Label>
      {[0, 1].map((i) => (
        <g key={i}>
          <rect x={158} y={24 + i * 20} width={128} height={17} rx={3} className="fill-neutral-700" />
          <rect x={161} y={26 + i * 20} width={8} height={13} rx={1} className="fill-neutral-500" />
          <Line x={173} y={30 + i * 20} w={50} />
          <rect x={290} y={24 + i * 20} width={17} height={17} rx={3} fill="none" stroke={RED} strokeOpacity={0.7} />
          <text x={298.5} y={36 + i * 20} fontSize={9} textAnchor="middle" fill={RED} style={{ fontFamily: 'inherit' }}>
            ×
          </text>
        </g>
      ))}
      <Pin x={300} y={72} n={1} />
      <Label x={158} y={78} size={7} muted>
        {tt('Son izlediklerin')}
      </Label>
      {[0, 1].map((i) => (
        <g key={i}>
          <rect x={158} y={82 + i * 15} width={8} height={12} rx={1} className="fill-neutral-600" />
          <Line x={170} y={85 + i * 15} w={56} />
          <text x={306} y={91 + i * 15} fontSize={6.5} textAnchor="end" fill={ACCENT} style={{ fontFamily: 'inherit' }}>
            {tt('Bölüm seç ›')}
          </text>
        </g>
      ))}
      <Pin x={140} y={96} n={2} />
      {/* bölüm listesi */}
      <rect x={158} y={116} width={150} height={54} rx={4} fill="none" stroke={ACCENT} strokeOpacity={0.5} />
      {[`${EP()}1`, `${EP()}2`, `${EP()}3`].map((b, i) => (
        <g key={b}>
          <rect x={163} y={122 + i * 15} width={8} height={8} rx={1.5} fill={i < 2 ? ACCENT : 'none'} className={i < 2 ? undefined : 'stroke-neutral-500'} strokeWidth={0.8} />
          <text x={176} y={129 + i * 15} fontSize={6.5} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
            {b}
          </text>
          <Line x={190} y={125 + i * 15} w={50} light />
          {i !== 1 && (
            <text x={303} y={129 + i * 15} fontSize={6.5} textAnchor="end" fill={GREEN} style={{ fontFamily: 'inherit' }}>
              ✓ 12.03.25
            </text>
          )}
        </g>
      ))}
      <Pin x={140} y={144} n={3} />
    </Frame>
  )
}

export function TakvimYilVisual() {
  const levels = ['fill-neutral-800', '', '', '', '']
  const op = [0, 0.25, 0.45, 0.7, 1]
  return (
    <Frame viewBox={VB}>
      {[tt('İzleme günü'), tt('En uzun seri'), tt('Şu anki seri'), tt('En yoğun')].map((t, i) => (
        <g key={t}>
          <Box x={8 + i * 77} y={8} w={72} h={30} r={5} />
          <text x={14 + i * 77} y={19} fontSize={6.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
            {t}
          </text>
          <rect x={14 + i * 77} y={24} width={i === 1 ? 30 : 22} height={8} rx={2} fill={i === 1 ? ACCENT : undefined} className={i === 1 ? undefined : 'fill-neutral-500'} />
        </g>
      ))}
      <Pin x={300} y={48} n={1} />
      {[0, 1, 2, 3].map((m) => (
        <g key={m}>
          <Box x={8 + m * 77} y={56} w={72} h={70} r={5} />
          <Line x={14 + m * 77} y={62} w={24} />
          {Array.from({ length: 30 }, (_, d) => {
            const lv = (d * 7 + m * 3) % 11 < 5 ? 0 : ((d + m) % 4) + 1
            return (
              <rect
                key={d}
                x={14 + m * 77 + (d % 7) * 9}
                y={72 + Math.floor(d / 7) * 10}
                width={7}
                height={7}
                rx={1.5}
                className={lv === 0 ? levels[0] : undefined}
                fill={lv === 0 ? undefined : ACCENT}
                fillOpacity={op[lv]}
              />
            )
          })}
        </g>
      ))}
      <Label x={8} y={146} size={7} muted>
        {tt('Ne kadar koyu, o gün o kadar çok izleme · bir güne tıkla, o ay açılsın')}
      </Label>
      <Label x={8} y={166} size={7.5}>
        {tt('Profil menüsü › Takvim')}
      </Label>
      <NewTag x={100} y={157} />
    </Frame>
  )
}

export function CokluFiltreVisual() {
  return (
    <Frame viewBox={VB}>
      {/* araç çubuğu + açık filtre paneli */}
      <Box x={150} y={6} w={162} h={20} r={5} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={158 + i * 18} y={10} width={12} height={12} rx={3} fill={i === 1 ? ACCENT : undefined} fillOpacity={i === 1 ? 0.3 : 1} className={i === 1 ? undefined : 'fill-neutral-800'} />
      ))}
      <Box x={100} y={32} w={212} h={140} r={7} strong />
      <Label x={108} y={46} size={8.5}>
        {tt('Filtrele')}
      </Label>
      {/* özet */}
      <text x={108} y={60} fontSize={6.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Tür:')}
      </text>
      <TriChip x={108 + textW(tt('Ülke:'), 6.5) + 4} y={52} w={44} state="in" text={tt('Korku')} />
      <TriChip x={156 + textW(tt('Ülke:'), 6.5) + 4} y={52} w={52} state="out" text={tt('Komedi')} />
      <text x={108} y={78} fontSize={6.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Ülke:')}
      </text>
      <TriChip x={108 + textW(tt('Ülke:'), 6.5) + 4} y={70} w={40} state="out" text={tt('ABD')} />
      <Pin x={296} y={66} n={1} />
      <line x1={106} y1={90} x2={306} y2={90} className="stroke-neutral-700" />
      <Label x={108} y={103} size={7.5}>
        {tt('▾ Tür')}
      </Label>
      {[tt('Dram'), tt('Korku'), tt('Komedi'), tt('Aile'), tt('Suç')].map((t, i) => (
        <TriChip key={t} x={108 + i * 40} y={110} w={36} state={t === 'Korku' ? 'in' : t === 'Komedi' ? 'out' : 'none'} text={t} />
      ))}
      <Label x={108} y={140} size={6.5} muted>
        {tt('1 tık ✓ gelsin · 2 tık ✕ gelmesin · 3 tık kaldır')}
      </Label>
      <Pin x={296} y={138} n={2} />
      <Label x={108} y={160} size={7.5}>
        {tt('▸ Ülke · ▸ Kategori · ▸ Oyuncular')}
      </Label>
      {/* nerelerde */}
      {[tt('Tablo'), tt('Vitrin'), tt('Ne İzlesem'), tt('Sayfalar'), tt('Modlar'), tt('Takvim')].map((t, i) => (
        <g key={t}>
          <rect x={8} y={34 + i * 22} width={84} height={17} rx={4} className="fill-neutral-900 stroke-neutral-700" strokeWidth={0.8} />
          <text x={16} y={45.5 + i * 22} fontSize={7} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
            ✓ {t}
          </text>
        </g>
      ))}
      <Pin x={80} y={20} n={3} />
    </Frame>
  )
}

export function NeIzlesemSonucVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={0} y={0} width={320} height={180} className="fill-neutral-900" />
      <defs>
        <radialGradient id="pickGlow">
          <stop offset="0%" stopColor={ACCENT} stopOpacity={0.55} />
          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse cx={80} cy={78} rx={75} ry={70} fill="url(#pickGlow)" />
      <rect x={52} y={22} width={58} height={87} rx={5} className="fill-neutral-600" />
      <Pin x={46} y={20} n={1} />
      {/* logo + bilgiler */}
      <rect x={130} y={26} width={88} height={16} rx={2} className="fill-neutral-400" />
      <Line x={130} y={48} w={60} />
      <rect x={130} y={58} width={22} height={9} rx={4.5} fill="#fbbf24" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={156 + i * 26} y={58} width={22} height={9} rx={4.5} className="fill-neutral-800 stroke-neutral-600" strokeWidth={0.6} />
      ))}
      <Line x={130} y={74} w={170} light />
      <Line x={130} y={82} w={160} light />
      <Line x={130} y={90} w={120} light />
      <Pin x={306} y={36} n={2} />
      <MiniButton x={130} y={100} w={58} text={tt('+ İzlenecek')} accent />
      <MiniButton x={192} y={100} w={40} text={tt('İzledim')} />
      <MiniButton x={236} y={100} w={66} text={tt('Bir daha gösterme')} />
      <Pin x={306} y={112} n={3} />
      {/* tekrar getir */}
      <rect x={112} y={140} width={78} height={18} rx={9} fill={ACCENT} />
      <text x={151} y={152} fontSize={7.5} fontWeight={700} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit' }}>
        {tt('↻ Tekrar getir')}
      </text>
      <text x={200} y={152} fontSize={7} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Kapat')}
      </text>
    </Frame>
  )
}

export function GenelGuncellemeVisual() {
  return (
    <Frame viewBox={VB}>
      {/* ayrıntı kutusu */}
      <rect x={8} y={8} width={304} height={78} rx={7} fill={ACCENT} fillOpacity={0.06} stroke={ACCENT} strokeOpacity={0.35} />
      <Label x={16} y={22} size={8}>
        {tt('Genel Güncelleme sürüyor · 42/120')}
      </Label>
      <text x={16} y={33} fontSize={6.5} fill={GREEN} style={{ fontFamily: 'inherit' }}>
        {tt('39 güncellendi')}
      </text>
      <text x={70} y={33} fontSize={6.5} fill={RED} style={{ fontFamily: 'inherit' }}>
        {tt('· 3 bulunamadı · yaklaşık 4 dk')}
      </text>
      <MiniButton x={250} y={14} w={52} text={tt('⏸ Durdur')} />
      <rect x={16} y={40} width={288} height={4} rx={2} className="fill-neutral-800" />
      <rect x={16} y={40} width={101} height={4} rx={2} fill={ACCENT} />
      <circle cx={19} cy={54} r={2.2} fill={ACCENT} />
      <Line x={26} y={52} w={120} />
      {[0, 1].map((i) => (
        <g key={i}>
          <text x={16} y={68 + i * 9} fontSize={6.5} fill={i === 0 ? GREEN : RED} style={{ fontFamily: 'inherit' }}>
            {i === 0 ? '✓' : '✕'}
          </text>
          <Line x={26} y={64 + i * 9} w={46} />
          <Line x={78} y={64 + i * 9} w={110} light />
        </g>
      ))}
      <Pin x={296} y={60} n={1} />
      {/* dişli menüsü */}
      <Box x={8} y={94} w={200} h={80} r={7} strong />
      <Label x={16} y={107} size={8}>
        {tt('TMDB\'den neler gelsin?')}
      </Label>
      {[tt('Sinopsis'), tt('Kapak Adı')].map((t, i) => (
        <g key={t}>
          <Label x={16} y={122 + i * 26} size={7.5}>
            {t}
          </Label>
          <rect x={174} y={115 + i * 26} width={24} height={11} rx={5.5} fill={ACCENT} />
          <circle cx={192} cy={120.5 + i * 26} r={4} fill="#fff" />
          <text x={16} y={133 + i * 26} fontSize={6.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
            {tt('→ Yazdığı sütun')}
          </text>
          <rect x={72} y={126 + i * 26} width={96} height={10} rx={3} className="fill-neutral-900 stroke-neutral-600" strokeWidth={0.7} />
          <text x={77} y={133.5 + i * 26} fontSize={6.5} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
            {i === 0 ? tt('Özet ▾') : tt('+ Yeni sütun ekle ▾')}
          </text>
        </g>
      ))}
      <Pin x={220} y={130} n={2} />
      <MiniButton x={236} y={122} w={72} text={tt('▶ Devam et (78)')} accent />
      <Label x={236} y={146} size={6.5} muted>
        {tt('Durdurduğun yerden')}
      </Label>
      <Label x={236} y={155} size={6.5} muted>
        {tt('devam eder')}
      </Label>
      <Pin x={300} y={108} n={3} />
    </Frame>
  )
}

// ---- v1.9.1 --------------------------------------------------------------------------------

export function NeIzlesemPencereVisual() {
  return (
    <Frame viewBox={VB}>
      {/* arkada açık kalan sonuç ekranı */}
      <rect x={0} y={0} width={320} height={180} className="fill-neutral-900" />
      <rect x={14} y={30} width={50} height={75} rx={4} className="fill-neutral-700" />
      <rect x={76} y={34} width={64} height={11} rx={2} className="fill-neutral-600" />
      <Line x={76} y={52} w={90} light />
      <Line x={76} y={60} w={80} light />
      <MiniButton x={76} y={76} w={46} text={tt('+ İzlenecek')} accent />
      <MiniButton x={126} y={76} w={34} text={tt('İzledim')} />
      <MiniButton x={164} y={76} w={58} text={tt('Fragman · Nerede')} />
      {/* sağ üst: Tekrar getir (mavi çerçeve) + Kapat (kırmızı çerçeve) */}
      <rect x={200} y={7} width={58} height={13} rx={6.5} fill="none" stroke={ACCENT} strokeWidth={1} />
      <text x={229} y={16} fontSize={6.5} fontWeight={700} textAnchor="middle" fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        {tt('↻ Tekrar getir')}
      </text>
      <rect x={264} y={7} width={46} height={13} rx={6.5} fill="none" stroke="#f43f5e" strokeWidth={1} />
      <text x={287} y={16} fontSize={6.5} fontWeight={700} textAnchor="middle" fill="#fb7185" style={{ fontFamily: 'inherit' }}>
        {tt('Kapat Esc')}
      </text>
      <Pin x={190} y={14} n={1} />
      {/* üstte açılan fragman penceresi */}
      <rect x={92} y={98} width={160} height={76} rx={6} className="fill-neutral-800 stroke-neutral-600" strokeWidth={1} />
      <rect x={96} y={102} width={152} height={34} rx={3} className="fill-neutral-700" />
      <polygon points="166,112 166,126 178,119" fill="#fff" opacity={0.8} />
      <Line x={100} y={144} w={70} />
      <Line x={100} y={153} w={110} light />
      <text x={244} y={112} fontSize={9} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        ×
      </text>
      <Pin x={262} y={140} n={2} />
    </Frame>
  )
}

export function GecmisVisual() {
  const tag = (x: number, y: number, t: string, c: string) => (
    <g>
      <rect x={x} y={y} width={t.length * 4.2 + 8} height={10} rx={5} fill={c} fillOpacity={0.15} stroke={c} strokeOpacity={0.5} strokeWidth={0.8} />
      <text x={x + (t.length * 4.2 + 8) / 2} y={y + 7.3} fontSize={6} textAnchor="middle" fill={c} style={{ fontFamily: 'inherit' }}>
        {t}
      </text>
    </g>
  )
  return (
    <Frame viewBox={VB}>
      {/* altı nokta menüsü */}
      <Box x={8} y={8} w={118} h={122} r={6} strong />
      {[tt('Güncelle'), tt('Altına Satır Ekle'), tt('Çoğalt'), tt('Sil')].map((t, i) => (
        <text key={t} x={16} y={24 + i * 13} fontSize={7} className={i === 3 ? undefined : 'fill-neutral-300'} fill={i === 3 ? '#fb7185' : undefined} style={{ fontFamily: 'inherit' }}>
          {t}
        </text>
      ))}
      <line x1={12} y1={72} x2={122} y2={72} className="stroke-neutral-700" />
      <text x={16} y={84} fontSize={6.5} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('Eklendi: 27 Eyl 2026 09:57')}
      </text>
      <text x={16} y={94} fontSize={6.5} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('Son değişiklik: 27 Eyl 14:11')}
      </text>
      <text x={16} y={105} fontSize={6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('27 Eyl · Durum: İzlenecek → İzlendi')}
      </text>
      <text x={16} y={120} fontSize={6.5} fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        {tt('Tüm geçmişi ›')}
      </text>
      <Pin x={118} y={90} n={1} />
      {/* geçmiş penceresi */}
      <Box x={136} y={8} w={176} h={164} r={7} strong />
      <Label x={144} y={22} size={8}>
        {tt('Arşiv Geçmişi')}
      </Label>
      <text x={144} y={31} fontSize={5.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('2.8 MB / 5 GB')}
      </text>
      <MiniButton x={242} y={13} w={52} text={tt('⚙ Alan ayarları')} />
      <Pin x={302} y={19} n={3} />
      <rect x={144} y={38} width={48} height={22} rx={4} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeOpacity={0.5} />
      <text x={148} y={47} fontSize={6} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {tt('27 Eylül')}
      </text>
      <text x={148} y={55} fontSize={5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }} {...fit(tt('1 değişti · 1 silindi'), 5, 42)}>
        {tt('1 değişti · 1 silindi')}
      </text>
      <rect x={144} y={64} width={48} height={22} rx={4} fill="none" className="stroke-neutral-700" />
      <rect x={198} y={38} width={108} height={14} rx={4} fill="none" stroke="#f59e0b" strokeOpacity={0.6} />
      <text x={252} y={47.5} fontSize={5.8} textAnchor="middle" fill="#fbbf24" style={{ fontFamily: 'inherit' }}>
        {tt('Arşivi bu hale döndür')}
      </text>
      {[
        [tt('Silindi'), '#fb7185', tt('Geri getir')],
        [tt('Değişti'), ACCENT, tt('Geri al')],
        [tt('Eklendi'), '#34d399', tt('Geri al')],
      ].map(([t, c, u], i) => (
        <g key={t}>
          <rect x={198} y={58 + i * 24} width={108} height={20} rx={4} className="fill-neutral-900 stroke-neutral-700" strokeWidth={0.8} />
          {tag(202, 63 + i * 24, t, c)}
          <Line x={240} y={65.5 + i * 24} w={26} />
          <MiniButton x={272} y={62.5 + i * 24} w={30} text={u} />
        </g>
      ))}
      <Pin x={194} y={80} n={2} />
      <Label x={144} y={144} size={6.5} muted>
        {tt('Her ekleme, değişiklik ve silme')}
      </Label>
      <Label x={144} y={154} size={6.5} muted>
        {tt('kendiliğinden kaydedilir.')}
      </Label>
    </Frame>
  )
}

// ---- v1.9.2 --------------------------------------------------------------------------------

export function BildirimVisual() {
  return (
    <Frame viewBox={VB}>
      {/* üst menü: zil + rozet */}
      <rect x={0} y={0} width={320} height={26} className="fill-neutral-900" />
      <Line x={10} y={10} w={34} />
      {[0, 1].map((i) => (
        <circle key={i} cx={236 + i * 22} cy={13} r={6} className="fill-neutral-700" />
      ))}
      <path d="M275 17 a6 6 0 0 1 12 0 c0 0 1 1 2 2 h-16 c1 -1 2 -2 2 -2 Z" fill={ACCENT} />
      <circle cx={288} cy={7} r={5} fill="#f43f5e" />
      <text x={288} y={9.5} fontSize={6.5} fontWeight={700} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit' }}>
        3
      </text>
      <circle cx={306} cy={13} r={7} className="fill-neutral-600" />
      <Pin x={270} y={40} n={1} />
      {/* bildirim listesi */}
      <Box x={150} y={30} w={164} h={112} r={7} strong />
      <Label x={158} y={43} size={7.5}>
        {tt('Bildirimler')}
      </Label>
      {[
        ['✓', '#34d399', 'Star Trek SNW', tt('İzlendi yapıldı')],
        ['▶', ACCENT, 'The Boys', tt('İzleniyor\'a alındı')],
        ['📅', '#fbbf24', 'Silo', tt('3. sezon: 12 Mart')],
      ].map(([ic, c, t, x], i) => (
        <g key={t}>
          <circle cx={164} cy={60 + i * 26} r={7} fill={c} fillOpacity={0.18} />
          <text x={164} y={62.5 + i * 26} fontSize={7} textAnchor="middle" fill={c} style={{ fontFamily: 'inherit' }}>
            {ic}
          </text>
          <text x={176} y={58 + i * 26} fontSize={6.8} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
            {t}
          </text>
          <text x={176} y={67 + i * 26} fontSize={6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
            {x}
          </text>
        </g>
      ))}
      <Pin x={140} y={86} n={2} />
      {/* detaydaki etiket */}
      <Box x={8} y={34} w={128} h={108} r={6} />
      <rect x={16} y={44} width={26} height={39} rx={3} className="fill-neutral-700" />
      <Line x={48} y={48} w={60} />
      <rect x={48} y={58} width={18} height={8} rx={4} fill="#fbbf24" />
      <rect x={70} y={58} width={20} height={8} rx={4} className="fill-neutral-700" />
      <rect x={48} y={70} width={80} height={10} rx={5} fill="#f59e0b" fillOpacity={0.12} stroke="#f59e0b" strokeOpacity={0.6} strokeWidth={0.8} />
      <text x={88} y={77.3} fontSize={6} textAnchor="middle" fill="#fbbf24" style={{ fontFamily: 'inherit' }}>
        {tt('Yeni sezon bekleniyor')}
      </text>
      <Pin x={24} y={100} n={3} />
      <text x={36} y={104} fontSize={6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Dizi bitti · 4. sezon: 12 Mart')}
      </text>
      {/* akış */}
      <text x={8} y={160} fontSize={6.8} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('Bütün bölümler işaretlendi → İzlendi · yeni bölüm çıktı → İzleniyor')}
      </text>
      <NewTag x={8} y={165} />
    </Frame>
  )
}

// ---- v1.9.3 --------------------------------------------------------------------------------

export function TarihAraligiVisual() {
  return (
    <Frame viewBox={VB}>
      {/* tarih düzenleyicisi */}
      <Box x={8} y={8} w={150} h={96} r={6} strong />
      <Label x={16} y={22} size={7.5}>
        {tt('İzleme Tarihi')}
      </Label>
      <rect x={16} y={30} width={118} height={14} rx={7} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeOpacity={0.5} />
      <text x={24} y={40} fontSize={7} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        09.08.24 → 12.08.24
      </text>
      <rect x={16} y={50} width={60} height={14} rx={7} className="fill-neutral-800 stroke-neutral-600" strokeWidth={0.8} />
      <text x={24} y={60} fontSize={7} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        03.08.25
      </text>
      <text x={68} y={60} fontSize={8} fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        →
      </text>
      <Pin x={146} y={42} n={1} />
      <text x={16} y={80} fontSize={6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Tarihin yanındaki → ile bitiş günü eklenir')}
      </text>
      {/* takvim: başladın / bitirdin */}
      {Array.from({ length: 4 }, (_, i) => (
        <g key={i}>
          <rect x={170 + i * 36} y={8} width={33} height={60} rx={3} className="fill-neutral-900 stroke-neutral-700" strokeWidth={0.8} />
          <circle cx={177 + i * 36} cy={14} r={3} className="fill-neutral-700" />
        </g>
      ))}
      <rect x={173} y={22} width={27} height={17} rx={2} className="fill-neutral-800" />
      <text x={186.5} y={34} fontSize={5.2} textAnchor="middle" className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('Başladın')}
      </text>
      <rect x={281} y={22} width={27} height={17} rx={2} className="fill-neutral-800" />
      <text x={294.5} y={34} fontSize={5.2} textAnchor="middle" fill="#34d399" style={{ fontFamily: 'inherit' }}>
        {tt('Bitirdin')}
      </text>
      <line x1={200} y1={30} x2={281} y2={30} stroke={ACCENT} strokeOpacity={0.4} strokeDasharray="3 3" />
      <Pin x={240} y={80} n={2} />
      {/* dizi bitince aralık */}
      <Box x={8} y={114} w={304} h={58} r={6} />
      <text x={16} y={130} fontSize={7} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('Dizinin son bölümünü işaretledin → İzlendi')}
      </text>
      <text x={16} y={144} fontSize={7} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('İzleme Tarihi: ilk bölümü izlediğin gün → son bölümü izlediğin gün')}
      </text>
      <rect x={16} y={151} width={112} height={13} rx={6.5} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeOpacity={0.5} />
      <text x={22} y={160} fontSize={6.5} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        14.07.25 → 18.08.25
      </text>
      <Pin x={300} y={140} n={3} />
    </Frame>
  )
}

// ---- v1.9.4 --------------------------------------------------------------------------------

export function OyuncuPencereVisual() {
  return (
    <Frame viewBox={VB}>
      {/* aşağı kaydırılmış detay penceresi, dikey oyuncu kartları */}
      <Box x={8} y={8} w={304} h={164} r={8} />
      <Label x={18} y={24} size={8}>
        {tt('Oyuncular')}
      </Label>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <rect x={18 + i * 48} y={32} width={40} height={60} rx={5} className="fill-neutral-700" />
          <Line x={20 + i * 48} y={98} w={34} />
        </g>
      ))}
      <Pin x={300} y={40} n={1} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={`b${i}`} x={18 + i * 48} y={112} width={40} height={50} rx={5} className="fill-neutral-800" />
      ))}
      {/* ekranın ortasında açılan oyuncu penceresi */}
      <rect x={0} y={0} width={320} height={180} className="fill-neutral-950" opacity={0.55} />
      <Box x={108} y={40} w={104} h={112} r={8} strong />
      <rect x={140} y={48} width={40} height={60} rx={4} className="fill-neutral-600" />
      <Line x={128} y={116} w={64} />
      <Line x={132} y={125} w={56} light />
      <MiniButton x={122} y={135} w={44} text={tt('İçerikleri gör')} accent />
      <MiniButton x={170} y={135} w={32} text={tt('Kapat')} />
      <Pin x={220} y={46} n={2} />
    </Frame>
  )
}

// ---- v1.9.5 --------------------------------------------------------------------------------

export function YedekVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={304} h={164} r={8} strong />
      <Label x={18} y={24} size={8.5}>
        {tt('Ayarlar › Veritabanı › Yedekleme')}
      </Label>
      <NewTag x={186} y={15} />
      {[tt('OneDrive (buluta gider)'), tt('Belgeler')].map((t, i) => (
        <g key={t}>
          <rect x={18 + i * 118} y={34} width={112} height={24} rx={5} fill={i === 0 ? ACCENT : 'none'} fillOpacity={i === 0 ? 0.12 : 0} stroke={i === 0 ? ACCENT : undefined} className={i === 0 ? undefined : 'stroke-neutral-600'} strokeWidth={0.8} />
          <text x={24 + i * 118} y={48} fontSize={6.8} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
            {t}
          </text>
        </g>
      ))}
      <Pin x={292} y={46} n={1} />
      <text x={18} y={76} fontSize={6.8} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('Yedek alınıyor · görseller 1.500 / 31.000')}
      </text>
      <rect x={18} y={82} width={270} height={4} rx={2} className="fill-neutral-800" />
      <rect x={18} y={82} width={60} height={4} rx={2} fill={ACCENT} />
      <Pin x={300} y={84} n={2} />
      <text x={18} y={104} fontSize={6.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Otomatik:')}
      </text>
      {[tt('Kapalı'), tt('Her gün'), tt('Her hafta')].map((t, i) => (
        <MiniButton key={t} x={56 + i * 44} y={97} w={40} text={t} accent={i === 2} />
      ))}
      <line x1={16} y1={118} x2={304} y2={118} className="stroke-neutral-700" />
      {[tt('27 Eylül 2026, 23:10'), tt('20 Eylül 2026, 21:00')].map((t, i) => (
        <g key={t}>
          <text x={18} y={134 + i * 16} fontSize={6.8} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
            {t}
          </text>
          <MiniButton x={250} y={126 + i * 16} w={48} text={tt('Geri yükle')} />
        </g>
      ))}
      <Pin x={236} y={140} n={3} />
    </Frame>
  )
}

export function SeriKisiVisual() {
  return (
    <Frame viewBox={VB}>
      {/* seri */}
      <Label x={10} y={16} size={8}>
        {tt('Transformers serisi · 1/5 izledin')}
      </Label>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={10 + i * 30} y={22} width={26} height={39} rx={3} className="fill-neutral-700" stroke={i === 0 ? ACCENT : undefined} strokeWidth={i === 0 ? 1.2 : 0} />
          <text x={14 + i * 30} y={30} fontSize={6} fill="#fff" style={{ fontFamily: 'inherit' }}>
            {i + 1}
          </text>
          {i === 0 && <rect x={12} y={53} width={22} height={6} rx={2} fill="#10b981" />}
        </g>
      ))}
      <MiniButton x={40} y={66} w={44} text={tt('+ İzlenecek')} />
      <Pin x={168} y={40} n={1} />
      {/* kişi sayfası */}
      <Box x={178} y={8} w={134} h={164} r={7} strong />
      <rect x={186} y={16} width={30} height={44} rx={3} className="fill-neutral-600" />
      <Label x={222} y={26} size={7.5}>
        {tt('Christopher Nolan')}
      </Label>
      <text x={222} y={36} fontSize={5.8} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Yönetmen · arşivinde 3 yapımı')}
      </text>
      <Line x={222} y={44} w={80} light />
      <Line x={222} y={52} w={70} light />
      <text x={186} y={72} fontSize={6.5} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('Arşivinde')}
      </text>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={186 + i * 24} y={76} width={20} height={30} rx={2} className="fill-neutral-700" />
      ))}
      <text x={186} y={118} fontSize={6.5} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('Arşivinde olmayanlar')}
      </text>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={186 + i * 24} y={122} width={20} height={30} rx={2} className="fill-neutral-700" />
          <rect x={186 + i * 24} y={155} width={20} height={7} rx={2} fill="none" stroke={ACCENT} strokeWidth={0.7} />
        </g>
      ))}
      <Pin x={300} y={112} n={2} />
      {/* puan kartı */}
      <Box x={10} y={100} w={160} h={72} r={7} strong />
      <rect x={18} y={108} width={14} height={20} rx={2} className="fill-neutral-600" />
      <text x={38} y={116} fontSize={6.8} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        {tt('İzledin! Kaç puan verirsin?')}
      </text>
      {[0, 1].map((i) => (
        <g key={i}>
          <rect x={38} y={124 + i * 10} width={110} height={3} rx={1.5} className="fill-neutral-700" />
          <rect x={38} y={124 + i * 10} width={70 + i * 15} height={3} rx={1.5} fill="#fbbf24" />
        </g>
      ))}
      <MiniButton x={18} y={152} w={36} text={tt('Kaydet')} accent />
      <MiniButton x={58} y={152} w={30} text={tt('Sonra')} />
      <Pin x={160} y={110} n={3} />
    </Frame>
  )
}

// ---- v1.10 -----------------------------------------------------------------------------------

const DELTA_PATH = 'M50 0 C64 22 84 72 97 130 C84 113 67 103 50 103 C33 103 16 113 3 130 C16 72 36 22 50 0 Z'

function Exhibit({ x, y, s = 34, children }: { x: number; y: number; s?: number; children?: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={s} height={s} rx={5} className="fill-neutral-950 stroke-neutral-700" strokeWidth={0.7} />
      {children}
    </g>
  )
}

export function KoleksiyonVisual() {
  return (
    <Frame viewBox={VB}>
      <Label x={10} y={16} size={9}>
        {tt('Koleksiyon')}
      </Label>
      <NewTag x={Math.max(46, 14 + textW(tt('Koleksiyon'), 9))} y={7} />
      {/* raf */}
      <Box x={8} y={24} w={304} h={78} r={7} />
      <Exhibit x={16} y={31} s={48}>
        <path d={DELTA_PATH} transform="translate(29 36) scale(0.3)" fill="#e3c26a" />
      </Exhibit>
      <text x={16} y={92} fontSize={7} fontWeight={700} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        {tt('Star Trek')}
      </text>
      <Pin x={70} y={34} n={1} />
      {[0, 1, 2, 3, 4].map((i) => (
        <Exhibit key={i} x={82 + i * 44} y={33} s={38}>
          {i === 3 ? (
            <path d={DELTA_PATH} transform={`translate(${93 + i * 44} 39) scale(0.17)`} fill="#d4d4d4" />
          ) : (
            <Line x={88 + i * 44} y={52} w={26} light />
          )}
        </Exhibit>
      ))}
      <rect x={82} y={78} width={216} height={2} rx={1} className="fill-neutral-600" />
      <Pin x={264} y={30} n={2} />
      {/* tek başına olanlar */}
      <Label x={10} y={116} size={7.5}>
        {tt('Tek başına olanlar')}
      </Label>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Exhibit key={i} x={10 + i * 43} y={122} s={36}>
          <Line x={16 + i * 43} y={140} w={24} light />
        </Exhibit>
      ))}
      {/* sembol penceresi */}
      <Box x={196} y={96} w={116} h={78} r={6} strong />
      <rect x={202} y={103} width={40} height={40} rx={4} className="fill-neutral-950" />
      <path d={DELTA_PATH} transform="translate(211 110) scale(0.2)" fill="#e3c26a" />
      <rect x={248} y={103} width={58} height={20} rx={3} fill="none" strokeDasharray="3 2" className="stroke-neutral-500" strokeWidth={0.7} />
      <text x={252} y={115} fontSize={5.2} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('Sürükle / Ctrl+V')}
      </text>
      <text x={248} y={133} fontSize={5.2} className="fill-neutral-500" style={{ fontFamily: 'inherit' }} {...fit(tt('ya da adres, hazır sembol'), 5.2, 64)}>
        {tt('ya da adres, hazır sembol')}
      </text>
      <MiniButton x={270} y={156} w={36} text={tt('Kaydet')} accent />
      <Pin x={194} y={100} n={3} />
    </Frame>
  )
}

// ---- v1.10.1 ---------------------------------------------------------------------------------

export function IlerlemeVisual() {
  return (
    <Frame viewBox={VB}>
      <Label x={10} y={18} size={9}>
        {tt('Koleksiyon')}
      </Label>
      <Box x={8} y={28} w={304} h={52} r={7} strong />
      <circle cx={24} cy={44} r={5} fill="none" stroke={ACCENT} strokeWidth={1.6} strokeDasharray="20 12" />
      <text x={36} y={47} fontSize={7} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        {tt('İlk açılış: filmlerinin hangi seriden olduğu öğreniliyor')}
      </text>
      <text x={250} y={47} fontSize={6} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('205/297 · ~30 sn')}
      </text>
      <rect x={18} y={56} width={284} height={4} rx={2} className="fill-neutral-800" />
      <rect x={18} y={56} width={196} height={4} rx={2} fill={ACCENT} />
      <Line x={18} y={70} w={180} light />
      <Pin x={300} y={32} n={1} />
      {/* raflar bu sırada kullanılabilir */}
      {[0, 1].map((i) => (
        <g key={i}>
          <Box x={8} y={88 + i * 44} w={304} h={38} r={6} />
          {[0, 1, 2, 3, 4, 5].map((j) => (
            <rect key={j} x={16 + j * 48} y={94 + i * 44} width={40} height={26} rx={3} className="fill-neutral-800" />
          ))}
        </g>
      ))}
      <Pin x={300} y={92} n={2} />
    </Frame>
  )
}

// ---- v1.11 -----------------------------------------------------------------------------------

export function TarihSeciciVisual() {
  const cells = Array.from({ length: 30 }, (_, i) => i + 1)
  return (
    <Frame viewBox={VB}>
      <Box x={60} y={8} w={200} h={166} r={8} strong />
      {/* kutucuklar */}
      <rect x={70} y={16} width={86} height={13} rx={6.5} className="fill-neutral-800" />
      <text x={76} y={25} fontSize={6} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        03.06.24 → 09.06.24
      </text>
      <rect x={160} y={16} width={48} height={13} rx={6.5} className="fill-neutral-800" />
      <text x={166} y={25} fontSize={6} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        03.08.24
      </text>
      {/* anahtar */}
      <text x={196} y={42} fontSize={6} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('Bitiş tarihi')}
      </text>
      <rect x={232} y={36} width={16} height={8} rx={4} fill={ACCENT} />
      <circle cx={244} cy={40} r={3} fill="#fff" />
      <Pin x={254} y={32} n={1} />
      {/* takvim */}
      <text x={124} y={60} fontSize={7.5} fontWeight={700} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        {tt('Haziran 2024')}
      </text>
      <text x={76} y={60} fontSize={8} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        ‹
      </text>
      <text x={240} y={60} fontSize={8} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        ›
      </text>
      <Pin x={70} y={50} n={2} />
      {cells.map((d) => {
        const i = d + 4
        const x = 74 + (i % 7) * 25
        const y = 70 + Math.floor(i / 7) * 17
        const edge = d === 3 || d === 9
        const inRange = d > 3 && d < 9
        return (
          <g key={d}>
            {(edge || inRange) && <rect x={x - 2} y={y - 2} width={21} height={13} rx={3} fill={ACCENT} fillOpacity={edge ? 1 : 0.25} />}
            <text x={x + 8.5} y={y + 7.5} fontSize={6} textAnchor="middle" className={edge ? 'fill-white' : 'fill-neutral-300'} style={{ fontFamily: 'inherit' }}>
              {d}
            </text>
          </g>
        )
      })}
      <Pin x={254} y={84} n={3} />
    </Frame>
  )
}

// ---- v1.11.1 ---------------------------------------------------------------------------------

export function AcilisVisual() {
  return (
    <Frame viewBox={VB}>
      {/* eski: terminal */}
      <rect x={10} y={30} width={120} height={80} rx={4} fill="#0c0c0c" className="stroke-neutral-700" strokeWidth={0.8} />
      <rect x={10} y={30} width={120} height={9} rx={4} className="fill-neutral-800" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={16} y={46 + i * 9} width={[70, 90, 55, 80][i]} height={3} rx={1.5} className="fill-neutral-600" />
      ))}
      <line x1={14} y1={34} x2={126} y2={106} stroke="#f87171" strokeWidth={2} />
      <line x1={126} y1={34} x2={14} y2={106} stroke="#f87171" strokeWidth={2} />
      <text x={70} y={124} fontSize={7} textAnchor="middle" className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('eskiden')}
      </text>
      <text x={150} y={74} fontSize={14} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        →
      </text>
      {/* yeni: açılış penceresi */}
      <rect x={172} y={22} width={138} height={100} rx={10} fill="#0b0b0e" className="stroke-neutral-700" strokeWidth={0.8} />
      <path d="M241 36 L250 56 L246 56 L241 45 L236 56 L232 56 Z" fill={ACCENT} />
      <path d="M229 62 Q241 54 253 62" fill="none" stroke={ACCENT} strokeWidth={2.2} />
      <circle cx={241} cy={63} r={1.8} fill={ACCENT} />
      <text x={241} y={80} fontSize={9} fontWeight={800} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit' }}>
        {tt('ARGUS')}
      </text>
      <text x={241} y={93} fontSize={5.5} textAnchor="middle" className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('Arayüz hazırlanıyor…')}
      </text>
      <rect x={211} y={102} width={60} height={2} rx={1} className="fill-neutral-700" />
      <rect x={226} y={102} width={18} height={2} rx={1} fill={ACCENT} />
      <text x={241} y={138} fontSize={7} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {ttc('cizim', 'şimdi')}
      </text>
      <Pin x={306} y={26} n={1} />
      <Pin x={280} y={92} n={2} />
    </Frame>
  )
}

// ---- v1.11.2 ---------------------------------------------------------------------------------

export function UygulamaAyarVisual() {
  const Sw = ({ x, y, on }: { x: number; y: number; on: boolean }) => (
    <g>
      <rect x={x} y={y} width={18} height={10} rx={5} fill={on ? ACCENT : undefined} className={on ? undefined : 'fill-neutral-700'} />
      <circle cx={on ? x + 13 : x + 5} cy={y + 5} r={3.6} fill="#fff" />
    </g>
  )
  return (
    <Frame viewBox={VB}>
      {/* sol menü */}
      {[tt('Veritabanı'), tt('Ana Sayfa Ayarları'), tt('Uygulama Ayarları'), tt('Profil Ayarları')].map((t, i) => (
        <g key={t}>
          <rect x={8} y={14 + i * 24} width={92} height={20} rx={5} fill={i === 2 ? ACCENT : 'none'} fillOpacity={i === 2 ? 0.12 : 0} stroke={i === 2 ? ACCENT : undefined} strokeOpacity={0.5} strokeWidth={0.7} />
          <text x={16} y={27 + i * 24} fontSize={6.2} className={i === 2 ? 'fill-neutral-50' : 'fill-neutral-400'} style={{ fontFamily: 'inherit' }}>
            {t}
          </text>
        </g>
      ))}
      <NewTag x={70} y={63} />
      <Pin x={104} y={62} n={1} />
      {/* sağ panel */}
      <Box x={112} y={10} w={200} h={160} r={8} strong />
      <Label x={122} y={26} size={8}>
        {tt('Uygulama Ayarları')}
      </Label>
      {[
        [tt('Bilgisayar açılınca ARGUS\'u da aç'), true, 44],
        [tt('Pencereyi açmadan, tepside başlasın'), false, 70],
        [tt('Kapatınca tepsiye küçült'), true, 110],
      ].map(([t, on, y]) => (
        <g key={t as string}>
          <text x={122} y={(y as number) + 8} fontSize={6.2} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
            {t as string}
          </text>
          <Line x={122} y={(y as number) + 14} w={120} light />
          <Sw x={282} y={(y as number) + 1} on={on as boolean} />
        </g>
      ))}
      <Pin x={302} y={46} n={2} />
      <Pin x={302} y={112} n={3} />
      {/* tepsi */}
      <rect x={236} y={146} width={66} height={16} rx={3} className="fill-neutral-800" />
      <path d="M244 158 L248 150 L252 158" fill="none" stroke={ACCENT} strokeWidth={1.4} />
      <text x={258} y={157} fontSize={5.5} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('tepside')}
      </text>
    </Frame>
  )
}

// Koleksiyon: "+ Yeni raf", rafın sonundaki "+ Yapım ekle" ve "Görsel oluştur" (PNG).
export function KoleksiyonRafVisual() {
  return (
    <Frame viewBox={VB}>
      {/* araç çubuğu */}
      {[
        [tt('+ Yeni raf'), 20, true],
        [tt('Görsel oluştur'), 20 + Math.max(52, textW(tt('+ Yeni raf'), 6.2) + 12) + 6, true],
      ].map(([t, x, hi]) => (
        <g key={t as string}>
          <rect x={x as number} y={10} width={Math.max(t === tt('+ Yeni raf') ? 52 : 66, textW(t as string, 6.2) + 12)} height={14} rx={4} fill="none" stroke={hi ? ACCENT : undefined} strokeOpacity={0.8} strokeWidth={0.8} />
          <text x={(x as number) + 6} y={20} fontSize={6.2} fill="#7fdcff" style={{ fontFamily: 'inherit' }}>
            {t as string}
          </text>
        </g>
      ))}
      <Pin x={24} y={6} n={1} />
      <Pin x={146} y={6} n={3} />
      {/* raf */}
      <Box x={14} y={32} w={292} h={78} r={8} />
      <rect x={22} y={40} width={44} height={44} rx={6} className="fill-neutral-900" />
      <text x={44} y={69} fontSize={20} textAnchor="middle" className="fill-neutral-700" style={{ fontFamily: 'inherit' }}>
        {tt('G')}
      </text>
      <text x={22} y={96} fontSize={7} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        {tt('Ghibli')}
      </text>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={78 + i * 44} y={40} width={38} height={38} rx={5} className="fill-neutral-900 stroke-neutral-700" strokeWidth={0.6} />
      ))}
      <rect x={210} y={40} width={38} height={38} rx={5} fill="none" stroke={ACCENT} strokeOpacity={0.7} strokeDasharray="3 2" strokeWidth={0.9} />
      <text x={229} y={62} fontSize={12} textAnchor="middle" fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        +
      </text>
      <text x={229} y={88} fontSize={5.4} textAnchor="middle" fill="#7fdcff" style={{ fontFamily: 'inherit' }}>
        {tt('Yapım ekle')}
      </text>
      <Pin x={254} y={40} n={2} />
      {/* PNG önizlemesi */}
      <Box x={40} y={118} w={240} h={56} r={6} strong />
      <text x={50} y={132} fontSize={5} fill="#7fdcff" style={{ fontFamily: 'inherit' }}>
        {tt('ARGUS')}
      </text>
      <text x={50} y={146} fontSize={11} className="fill-neutral-50" style={{ fontFamily: 'inherit', fontWeight: 900 }}>
        {tt('Koleksiyon')}
      </text>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={140 + i * 22} y={126} width={18} height={18} rx={3} className="fill-neutral-800" />
      ))}
      <text x={236} y={166} fontSize={6} fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        {tt('↓ PNG')}
      </text>
    </Frame>
  )
}

// "Hangisi?" penceresi: TMDB'de aynı adlı birden fazla yapım — afiş, ad, yıl, Film/Dizi, "adı tutuyor".
export function HangisiVisual() {
  const items: [string, string, string, boolean][] = [
    ['Joker', '2019', tt('Film'), true],
    ['Joker', '2012', tt('Film'), true],
    ['Joker', '2021', tt('Dizi'), true],
    ['Joker: Folie à Deux', '2024', tt('Film'), false],
  ]
  return (
    <Frame viewBox={VB}>
      <Box x={40} y={8} w={240} h={164} r={8} strong />
      <Label x={52} y={24} size={9}>
        {tt('Hangisi?')}
      </Label>
      <Line x={52} y={31} w={150} light />
      {items.map(([t, y, k, exact], i) => {
        const top = 38 + i * 32
        return (
          <g key={i}>
            <rect x={50} y={top} width={220} height={28} rx={5} fill="none" stroke={i === 0 ? ACCENT : undefined} strokeOpacity={i === 0 ? 0.8 : 1} className={i === 0 ? undefined : 'stroke-neutral-700'} strokeWidth={0.7} />
            <rect x={55} y={top + 3} width={15} height={22} rx={2} className="fill-neutral-700" />
            <text x={76} y={top + 12} fontSize={6.6} className="fill-neutral-50" style={{ fontFamily: 'inherit' }}>
              {t}
            </text>
            <text x={76 + t.length * 3.4 + 4} y={top + 12} fontSize={5.4} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
              {y} · {k}
            </text>
            {exact && (
              <g>
                <rect x={214} y={top + 5} width={48} height={10} rx={2} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeOpacity={0.5} strokeWidth={0.5} />
                <text x={238} y={top + 12} fontSize={5} textAnchor="middle" fill="#7fdcff" style={{ fontFamily: 'inherit' }}>
                  {tt('adı tutuyor')}
                </text>
              </g>
            )}
            <Line x={76} y={top + 20} w={110} light />
          </g>
        )
      })}
      <Pin x={34} y={12} n={1} />
      <Pin x={276} y={44} n={2} />
      <Pin x={34} y={46} n={3} />
    </Frame>
  )
}

// Tabloda Güncelle'ye basılan satırın üstünden geçen mavi ışık hüzmesi; altta bitmiş, parlayan satır.
export function SatirGuncelleVisual() {
  const rows = ['Artemis Fowl', tt('Düşler Fabrikası'), 'Snowpiercer', tt('Narnia Günlükleri'), tt('Hayaller Diyarı')]
  return (
    <Frame viewBox={VB}>
      <defs>
        <linearGradient id="sg-beam" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={ACCENT} stopOpacity={0} />
          <stop offset="0.6" stopColor={ACCENT} stopOpacity={0.35} />
          <stop offset="0.85" stopColor="#7fdcff" stopOpacity={0.55} />
          <stop offset="1" stopColor={ACCENT} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Box x={20} y={12} w={280} h={140} r={8} strong />
      {rows.map((t, i) => {
        const y = 22 + i * 25
        return (
          <g key={t}>
            <line x1={20} x2={300} y1={y} y2={y} className="stroke-neutral-800" strokeWidth={0.6} />
            {i === 1 && (
              <g>
                <rect x={20} y={y} width={280} height={25} fill={ACCENT} fillOpacity={0.06} />
                <rect x={60} y={y} width={100} height={25} fill="url(#sg-beam)" />
                <line x1={20} x2={300} y1={y + 25} y2={y + 25} stroke={ACCENT} strokeOpacity={0.7} strokeWidth={0.6} />
              </g>
            )}
            {i === 3 && <rect x={20} y={y} width={280} height={25} fill={ACCENT} fillOpacity={0.16} />}
            <text x={40} y={y + 15} fontSize={7} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
              {t}
            </text>
            <Line x={170} y={y + 12} w={50} light />
            <Line x={236} y={y + 12} w={46} light />
          </g>
        )
      })}
      <path d="M168 59.5 L182 59.5 M178 56 L182 59.5 L178 63" fill="none" stroke={ACCENT} strokeWidth={1} />
      <Pin x={306} y={52} n={1} />
      <Pin x={306} y={102} n={2} />
    </Frame>
  )
}

// Satırı altı noktadan tutup sürükleyerek taşıma: sürüklenen satır soluk, bırakılacak yerde mavi çizgi.
export function SatirTasiVisual() {
  const rows = ['Artemis Fowl', tt('Düşler Fabrikası'), 'Snowpiercer', tt('Narnia Günlükleri'), tt('Hayaller Diyarı')]
  return (
    <Frame viewBox={VB}>
      <Box x={20} y={12} w={280} h={140} r={8} strong />
      {rows.map((t, i) => {
        const y = 22 + i * 25
        const dragged = i === 0
        return (
          <g key={t} opacity={dragged ? 0.35 : 1}>
            <line x1={20} x2={300} y1={y} y2={y} className="stroke-neutral-800" strokeWidth={0.6} />
            {[0, 1, 2].map((k) => (
              <g key={k}>
                <circle cx={38} cy={y + 8 + k * 3.5} r={0.9} className="fill-neutral-400" />
                <circle cx={41.5} cy={y + 8 + k * 3.5} r={0.9} className="fill-neutral-400" />
              </g>
            ))}
            <text x={54} y={y + 15} fontSize={7} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
              {t}
            </text>
            <Line x={170} y={y + 12} w={50} light />
            <Line x={236} y={y + 12} w={46} light />
          </g>
        )
      })}
      <Pin x={30} y={14} n={1} />
      {/* bırakılacak yer */}
      <line x1={20} x2={300} y1={122} y2={122} stroke={ACCENT} strokeWidth={2} />
      <Pin x={306} y={118} n={2} />
      {/* sürüklenen kopya */}
      <g transform="translate(60 128) rotate(-2)">
        <rect width={150} height={20} rx={4} className="fill-neutral-800" stroke={ACCENT} strokeOpacity={0.6} strokeWidth={0.7} />
        <text x={12} y={13} fontSize={7} className="fill-neutral-50" style={{ fontFamily: 'inherit' }}>
          {tt('Artemis Fowl')}
        </text>
      </g>
      <path d="M150 150 L150 162 L154 158" fill="none" className="stroke-neutral-400" strokeWidth={1} />
    </Frame>
  )
}

// Arşiv tablosu: mükerrer olabilecek satırların solunda kırmızı nokta; sol altta en üste / en alta düğmeleri.
export function TabloMukerrerVisual() {
  const rows = [tt('Başlangıç'), 'Dark', tt('Dune: Çöl Gezegeni'), tt('Başlangıç'), tt('Esaretin Bedeli'), 'Dark']
  const dup = new Set([0, 1, 3, 5])
  return (
    <Frame viewBox={VB}>
      <Box x={40} y={10} w={272} h={160} r={8} strong />
      <Line x={70} y={24} w={80} />
      <Line x={180} y={24} w={50} light />
      <Line x={250} y={24} w={40} light />
      {rows.map((t, i) => {
        const y = 36 + i * 21
        return (
          <g key={i}>
            <line x1={40} x2={312} y1={y} y2={y} className="stroke-neutral-800" strokeWidth={0.6} />
            {dup.has(i) && <circle cx={54} cy={y + 10.5} r={3} fill="#f43f5e" />}
            <text x={70} y={y + 13} fontSize={6.6} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
              {t}
            </text>
            <Line x={180} y={y + 10} w={44} light />
            <Line x={250} y={y + 10} w={36} light />
          </g>
        )
      })}
      <Pin x={46} y={40} n={1} />
      {/* sol alt: en üste / en alta */}
      {[118, 142].map((cy, i) => (
        <g key={cy}>
          <circle cx={20} cy={cy} r={9} className="fill-neutral-900" stroke={ACCENT} strokeOpacity={0.7} strokeWidth={0.8} />
          <path d={i === 0 ? `M16 ${cy + 1} L20 ${cy - 3} L24 ${cy + 1}` : `M16 ${cy - 1} L20 ${cy + 3} L24 ${cy - 1}`} fill="none" stroke={ACCENT} strokeWidth={1.2} />
        </g>
      ))}
      <Pin x={30} y={160} n={2} />
    </Frame>
  )
}

// Sağlık Kontrolü › Mükerrer kayıtlar: aynı içerik iki kez — en dolu olan "kalır", Birleştir diğerini ona
// aktarıp siler. Sağda: başlığa İngilizce ad yazılınca TMDB güncellemesi Türkçe adı getiriyor.
export function MukerrerVisual() {
  const row = (y: number, t: string, sub: string, keep: boolean) => (
    <g>
      <text x={22} y={y} fontSize={6.6} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        {t}
      </text>
      <text x={22} y={y + 9} fontSize={5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {sub}
      </text>
      <rect x={keep ? 150 : 142} y={y - 7} width={keep ? 20 : 28} height={11} rx={2} fill={keep ? '#10b981' : 'none'} fillOpacity={keep ? 0.15 : 0} className={keep ? undefined : 'stroke-neutral-600'} stroke={keep ? '#10b981' : undefined} strokeWidth={0.6} />
      <text x={keep ? 160 : 156} y={y + 0.6} fontSize={5} textAnchor="middle" fill={keep ? '#34d399' : undefined} className={keep ? undefined : 'fill-neutral-400'} style={{ fontFamily: 'inherit' }}>
        {keep ? tt('kalır') : tt('Bu kalsın')}
      </text>
    </g>
  )
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={10} w={172} h={160} r={8} strong />
      <Label x={18} y={26} size={8}>
        {tt('Mükerrer kayıtlar')}
      </Label>
      <NewTag x={100} y={19} />
      <Box x={14} y={36} w={160} h={78} r={5} />
      {row(50, tt('Dune: Çöl Gezegeni'), tt('Film · 2021 · İzlendi · puanlı · 18 alan dolu'), true)}
      {row(72, tt('Dune: Çöl Gezegeni'), tt('Film · 2021 · 14 alan dolu'), false)}
      <rect x={82} y={96} width={42} height={12} rx={6} className="stroke-neutral-600" fill="none" strokeWidth={0.6} />
      <text x={103} y={104} fontSize={5.2} textAnchor="middle" className="fill-neutral-400" style={{ fontFamily: 'inherit' }} {...fit(tt('Bunlar farklı'), 5.2, 38)}>
        {tt('Bunlar farklı')}
      </text>
      <rect x={128} y={96} width={40} height={12} rx={6} fill="none" stroke={ACCENT} strokeWidth={0.8} />
      <text x={148} y={104} fontSize={5.2} textAnchor="middle" fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        {tt('Birleştir')}
      </text>
      <Pin x={176} y={100} n={1} />
      <Line x={18} y={126} w={120} light />
      <Line x={18} y={136} w={96} light />
      <Line x={18} y={146} w={110} light />
      {/* sağ: İngilizce ad → Türkçe ad */}
      <Box x={192} y={34} w={120} h={24} r={5} />
      <text x={200} y={49} fontSize={7} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('Parasite')}
      </text>
      <path d="M252 62 L252 82" stroke={ACCENT} strokeWidth={1.2} />
      <path d="M248 78 L252 84 L256 78" fill="none" stroke={ACCENT} strokeWidth={1.2} />
      <text x={258} y={75} fontSize={5.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Güncelle')}
      </text>
      <Box x={192} y={88} w={120} h={34} r={5} strong />
      <text x={200} y={103} fontSize={7.5} className="fill-neutral-50" style={{ fontFamily: 'inherit' }}>
        {tt('Parazit')}
      </text>
      <text x={200} y={114} fontSize={5.2} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Orjinal Adı: Parasite')}
      </text>
      <Pin x={306} y={92} n={2} />
      <rect x={192} y={132} width={120} height={22} rx={5} fill="#f43f5e" fillOpacity={0.1} stroke="#f43f5e" strokeOpacity={0.5} strokeWidth={0.7} />
      <text x={200} y={146} fontSize={5.4} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {tt('Bu içerik arşivde zaten var')}
      </text>
      <Pin x={306} y={136} n={3} />
    </Frame>
  )
}

// ---- v1.13 ---------------------------------------------------------------------------------

export function SecimliGuncellemeVisual() {
  const radio = (x: number, y: number, on: boolean) => (
    <circle cx={x} cy={y} r={3} fill={on ? ACCENT : 'none'} fillOpacity={on ? 0.4 : 1} stroke={on ? ACCENT : '#525252'} strokeWidth={1.2} />
  )
  return (
    <Frame viewBox={VB}>
      {/* tablo: seçim çubuğu + satırlar */}
      <Box x={8} y={8} w={146} h={164} r={7} />
      <rect x={8} y={8} width={146} height={34} rx={7} className="fill-neutral-800" />
      <Label x={14} y={19} size={6.5}>{tt('2 kayıt seçili')}</Label>
      <MiniButton x={12} y={25} w={70} text={tt('Seçilenleri Güncelle')} accent />
      <MiniButton x={85} y={25} w={65} text={tt('Bölümlerini Yenile')} />
      <Pin x={146} y={52} n={1} />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={14} y={53 + i * 24} width={8} height={8} rx={2} fill={i < 2 ? ACCENT : 'none'} className={i < 2 ? '' : 'stroke-neutral-600'} strokeWidth={0.8} />
          <Poster x={27} y={50 + i * 24} w={11} />
          <Line x={44} y={54 + i * 24} w={60} />
          <Line x={44} y={61 + i * 24} w={36} light />
        </g>
      ))}
      {/* Genel Güncelleme menüsü */}
      <Box x={162} y={8} w={150} h={164} r={7} strong />
      <Label x={170} y={21} size={8}>{tt('Genel Güncelleme')}</Label>
      <rect x={168} y={27} width={138} height={18} rx={4} className="fill-neutral-900 stroke-neutral-700" strokeWidth={0.7} />
      {radio(176, 36, false)}
      <Label x={183} y={38.5} size={6.5}>{tt('Eksik bilgileri doldur')}</Label>
      <rect x={168} y={48} width={138} height={18} rx={4} fill={ACCENT} fillOpacity={0.1} stroke={ACCENT} strokeOpacity={0.6} strokeWidth={0.7} />
      {radio(176, 57, true)}
      <Label x={183} y={59.5} size={6.5}>{tt('Sadece bölümleri yenile')}</Label>
      <NewTag x={262} y={51} />
      <Pin x={300} y={76} n={2} />
      <Label x={170} y={82} size={6} muted>{tt('HANGİ KAYITLAR?')}</Label>
      {[
        [tt('Bütün arşiv'), '812'],
        [tt('Görünen (filtre/arama)'), '6'],
        [tt('Seçili kayıtlar'), '2'],
      ].map(([t, n], i) => (
        <g key={t}>
          <rect x={168} y={87 + i * 17} width={138} height={14} rx={4} className={i === 1 ? '' : 'fill-neutral-900 stroke-neutral-700'} fill={i === 1 ? ACCENT : undefined} fillOpacity={i === 1 ? 0.1 : undefined} stroke={i === 1 ? ACCENT : undefined} strokeOpacity={i === 1 ? 0.6 : undefined} strokeWidth={0.7} />
          {radio(176, 94 + i * 17, i === 1)}
          <Label x={183} y={96.5 + i * 17} size={6.5}>{t}</Label>
          <Label x={300} y={96.5 + i * 17} size={6} muted anchor="end">{n}</Label>
        </g>
      ))}
      <Pin x={156} y={112} n={3} />
      <rect x={168} y={143} width={138} height={18} rx={5} fill={ACCENT} />
      <text x={237} y={155} fontSize={7.5} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('Başlat')}
      </text>
    </Frame>
  )
}

// ---- v1.13.1 -------------------------------------------------------------------------------

// İzleme Tarihi seçicisinde "Sadece yıl" ve "Hatırlamıyorum"; tabloda nasıl göründükleri.
export function TarihBilinmiyorVisual() {
  const chip = (x: number, w: number, t: string) => (
    <g>
      <rect x={x} y={18} width={w} height={13} rx={6.5} className="fill-neutral-800" />
      <text x={x + 6} y={27} fontSize={6} fontStyle="italic" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {t}
      </text>
    </g>
  )
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={180} h={164} r={8} strong />
      {chip(16, 56, tt('2019 yılında'))}
      {chip(76, 66, tt('Tarih bilinmiyor'))}
      {/* küçük takvim (sade) */}
      <Box x={16} y={38} w={164} h={62} r={5} />
      {[0, 1, 2, 3].map((r) => (
        <Line key={r} x={26} y={50 + r * 13} w={144} light />
      ))}
      {(() => {
        // Düğmeler metinlerine göre yan yana (İngilizce daha uzun)
        let x = 16
        return [tt('Bugün'), tt('Dün'), tt('Sadece yıl'), tt('Hatırlamıyorum')].map((t, i) => {
          const w = Math.max([30, 22, 44, 56][i], textW(t, 6.5) + 6)
          const el = <MiniButton key={t} x={x} y={108} w={Math.min(w, 178 - x)} text={t} accent={i > 1} />
          x += w + 3
          return el
        })
      })()}
      <Pin x={180} y={104} n={1} />
      <rect x={16} y={128} width={40} height={14} rx={3} className="fill-neutral-900 stroke-neutral-600" strokeWidth={0.7} />
      <text x={22} y={138} fontSize={7} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        2019
      </text>
      <rect x={60} y={128} width={26} height={14} rx={3} fill={ACCENT} />
      <text x={73} y={138} fontSize={6.5} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('Ekle')}
      </text>
      <Label x={92} y={138} size={5.5} muted>{tt('günü bilinmiyor')}</Label>
      <Pin x={150} y={124} n={2} />
      {/* sağ: tablo hücreleri */}
      <Box x={198} y={34} w={114} h={110} r={6} />
      <Label x={206} y={48} size={6} muted>{tt('İZLEME TARİHİ')}</Label>
      {['12.08.2024', tt('2019 yılında'), tt('Tarih bilinmiyor')].map((t, i) => (
        <g key={t}>
          <Line x={206} y={58 + i * 26} w={98} light />
          <text x={206} y={72 + i * 26} fontSize={7} className={i ? 'fill-neutral-100' : 'fill-neutral-400'} style={{ fontFamily: 'inherit' }}>
            {t}
          </text>
        </g>
      ))}
      <Pin x={306} y={92} n={3} />
    </Frame>
  )
}

// Sağlık Kontrolü'nde durum ile izleme tarihi uyuşmayanlar, tek tıkla düzeltme.
export function SaglikTarihVisual() {
  const section = (y: number, title: string, n: string, rows: string[], action: string, bulk: string) => (
    <g>
      <Box x={14} y={y} w={292} h={70} r={5} />
      <Label x={22} y={y + 13} size={7}>{title}</Label>
      <rect x={258} y={y + 5} width={40} height={11} rx={5.5} fill="#f59e0b" fillOpacity={0.12} />
      <text x={278} y={y + 12.8} fontSize={5.5} textAnchor="middle" fill="#f59e0b" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {n}
      </text>
      <rect x={22} y={y + 20} width={bulk.length * 3.2 + 12} height={11} rx={5.5} fill="none" className="stroke-neutral-600" strokeDasharray="2 1.5" strokeWidth={0.6} />
      <text x={28} y={y + 27.8} fontSize={5.3} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {bulk}
      </text>
      {rows.map((t, i) => (
        <g key={t}>
          <text x={22} y={y + 45 + i * 13} fontSize={6.3} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
            {t}
          </text>
          <rect x={244} y={y + 38 + i * 13} width={54} height={10} rx={2} fill="none" stroke={ACCENT} strokeOpacity={0.6} strokeWidth={0.6} />
          <text x={271} y={y + 44.8 + i * 13} fontSize={5.2} textAnchor="middle" fill={ACCENT} style={{ fontFamily: 'inherit' }}>
            {action}
          </text>
        </g>
      ))}
    </g>
  )
  return (
    <Frame viewBox={VB}>
      <Box x={6} y={4} w={308} h={172} r={8} strong />
      {section(12, tt('İzlendi ama izleme tarihi yok'), tt('124 kayıt'), [tt('Esaretin Bedeli'), 'Matrix'], tt('Hatırlamıyorum'), tt('Hiçbirini hatırlamıyorum (124 kayıt)'))}
      <Pin x={10} y={14} n={1} />
      {section(92, tt('İzlenecek ama izleme tarihi var'), tt('5 kayıt'), ['JUNG_E', tt('Ölümlü Dünya')], tt('İzlendi yap'), tt('Hepsini İzlendi yap (5 kayıt)'))}
      <Pin x={10} y={94} n={2} />
    </Frame>
  )
}

// Detay penceresinde "Müzikler": Nook'un Hum'u izlerken bulduğu şarkılar, bölüm bölüm ve dakikasıyla.
export function MuziklerVisual() {
  const song = (y: number, at: string, title: string, artist: string, hover = false) => (
    <g>
      {hover && <rect x={14} y={y - 3} width={196} height={22} rx={4} className="fill-neutral-800" />}
      <text x={44} y={y + 10} fontSize={7} textAnchor="end" fill={ACCENT} style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {at}
      </text>
      <rect x={50} y={y} width={16} height={16} rx={3} className="fill-neutral-700" />
      <text x={72} y={y + 7} fontSize={6.5} className="fill-neutral-100" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {title}
      </text>
      <text x={72} y={y + 15} fontSize={5.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {artist}
      </text>
      {hover && (
        <>
          <MiniButton x={150} y={y + 2.5} w={26} text={tt('Spotify')} />
          <MiniButton x={179} y={y + 2.5} w={26} text={tt('YouTube')} />
        </>
      )}
    </g>
  )
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={210} h={164} r={8} strong />
      <Label x={16} y={26} size={10}>{tt('Müzikler')}</Label>
      <Label x={64} y={26} size={6} muted>{tt('4 şarkı')}</Label>
      <NewTag x={176} y={16} />
      <Label x={16} y={42} size={5.5} muted>{tt('1. SEZON 1. BÖLÜM · PİLOT')}</Label>
      {song(48, '5:12', 'Running Up That Hill', 'Kate Bush', true)}
      {song(72, '31:14', 'Should I Stay or…', 'The Clash')}
      <Label x={16} y={106} size={5.5} muted>{tt('1. SEZON 2. BÖLÜM')}</Label>
      {song(112, '10:40', 'Africa', 'Toto')}
      {song(136, '~49:10', 'Heroes', 'Peter Gabriel')}
      <Pin x={14} y={54} n={1} />
      <Pin x={208} y={44} n={2} />
      {/* sağ: Nook izlerken dinliyor */}
      <Box x={228} y={40} w={84} h={70} r={8} />
      <circle cx={270} cy={66} r={14} className="fill-neutral-700" />
      <circle cx={265} cy={63} r={2} className="fill-neutral-100" />
      <circle cx={275} cy={63} r={2} className="fill-neutral-100" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={252 + i * 8} y={86 - [4, 9, 6, 11, 5][i]} width={4} height={[4, 9, 6, 11, 5][i] * 2} rx={2} fill={ACCENT} fillOpacity={0.7} />
      ))}
      <Label x={270} y={104} size={5.5} anchor="middle" muted>{tt('izlerken dinliyor')}</Label>
      <Pin x={306} y={44} n={3} />
      <Label x={270} y={128} size={6} anchor="middle">{tt('Nook · Hum')}</Label>
      <Label x={270} y={138} size={5} anchor="middle" muted>{tt('şarkıyı bulup yazar')}</Label>
    </Frame>
  )
}

// Müzikler'e elle şarkı ekleme: + Müzik ekle → bölüm, dakika, ad, sanatçı → Ekle.
export function MuzikEkleVisual() {
  const field = (x: number, w: number, t: string, filled = true) => (
    <g>
      <rect x={x} y={70} width={w} height={16} rx={3} className="fill-neutral-800 stroke-neutral-600" strokeWidth={0.6} />
      <text x={x + 5} y={81} fontSize={6.5} className={filled ? 'fill-neutral-100' : 'fill-neutral-500'} style={{ fontFamily: 'inherit' }}>
        {t}
      </text>
    </g>
  )
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={304} h={164} r={8} strong />
      <Label x={18} y={28} size={10}>{tt('Müzikler')}</Label>
      <rect x={240} y={17} width={62} height={15} rx={7.5} fill="none" stroke={ACCENT} strokeWidth={1} />
      <text x={271} y={27} fontSize={6.5} textAnchor="middle" fill={ACCENT} style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('+ Müzik ekle')}
      </text>
      <Pin x={304} y={14} n={1} />
      <Box x={16} y={40} w={288} h={70} r={6} />
      <rect x={24} y={48} width={272} height={16} rx={3} className="fill-neutral-800 stroke-neutral-600" strokeWidth={0.6} />
      <text x={29} y={59} fontSize={6.5} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        {tt('1. Sezon 5. Bölüm · Işıklar Söndü')}
      </text>
      {field(24, 40, '42:05')}
      {field(68, 112, 'Take On Me')}
      {field(184, 112, 'a-ha')}
      <Pin x={22} y={66} n={2} />
      <rect x={266} y={92} width={30} height={13} rx={3} fill={ACCENT} />
      <text x={281} y={101} fontSize={6.5} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('Ekle')}
      </text>
      <Label x={24} y={102} size={5.5} muted>{tt('dakika boş bırakılabilir')}</Label>
      <Label x={18} y={128} size={5.5} muted>{tt('1. SEZON 5. BÖLÜM')}</Label>
      <text x={46} y={146} fontSize={7} textAnchor="end" fill={ACCENT} style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        42:05
      </text>
      <rect x={52} y={135} width={16} height={16} rx={3} className="fill-neutral-700" />
      <text x={74} y={142} fontSize={6.5} className="fill-neutral-100" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('Take On Me')}
      </text>
      <text x={74} y={150} fontSize={5.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('a-ha')}
      </text>
      <NewTag x={122} y={137} />
      <Pin x={160} y={140} n={3} />
    </Frame>
  )
}

// Dil seçimi: Ayarlar › Uygulama Ayarları › Dil · Language; arayüz, bildirimler ve TMDB bilgileri seçilen dilde.
export function DilVisual() {
  const btn = (x: number, t: string, on: boolean) => (
    <g>
      <rect x={x} y={56} width={52} height={15} rx={3} fill={on ? ACCENT : 'none'} className={on ? undefined : 'stroke-neutral-600'} strokeWidth={0.8} />
      <text x={x + 26} y={66.5} fontSize={7} textAnchor="middle" fill={on ? '#fff' : undefined} className={on ? undefined : 'fill-neutral-300'} style={{ fontFamily: 'inherit' }}>
        {t}
      </text>
    </g>
  )
  return (
    <Frame viewBox={VB}>
      <Box x={8} y={8} w={150} h={164} r={8} strong />
      <Label x={16} y={26} size={8.5}>Dil · Language</Label>
      <NewTag x={104} y={17} />
      <Label x={16} y={46} size={6} muted>{tt('Arayüz dili')}</Label>
      {btn(16, 'Türkçe', false)}
      {btn(72, 'English', true)}
      <Pin x={132} y={64} n={1} />
      {[0, 1, 2].map((i) => (
        <Line key={i} x={16} y={92 + i * 12} w={120 - i * 24} light />
      ))}
      {/* sağ: İngilizce arayüz */}
      <Box x={168} y={8} w={144} h={164} r={8} />
      <Label x={176} y={26} size={8}>Home · Calendar</Label>
      <rect x={176} y={36} width={128} height={44} rx={4} className="fill-neutral-800" />
      <text x={182} y={50} fontSize={7} className="fill-neutral-100" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        Season 1 Episode 5
      </text>
      <text x={182} y={61} fontSize={6} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        Watched · March 12, 2026
      </text>
      <rect x={182} y={66} width={44} height={9} rx={4.5} fill={ACCENT} fillOpacity={0.2} />
      <text x={204} y={72.5} fontSize={5.5} textAnchor="middle" fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        S1E5
      </text>
      <Pin x={300} y={40} n={2} />
      <rect x={176} y={90} width={128} height={30} rx={4} fill="none" className="stroke-neutral-700" />
      <text x={182} y={103} fontSize={6.5} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        New episode out — moved to
      </text>
      <text x={182} y={113} fontSize={6.5} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        Watching
      </text>
      <Pin x={300} y={98} n={3} />
      <Label x={176} y={140} size={6} muted>TMDB · Synopsis, Genre…</Label>
      <Label x={176} y={152} size={6} muted>Status · Category · Cast</Label>
    </Frame>
  )
}

// v1.15: Bir bölüme (ARGUS'tan ya da Nook'tan) yeni izleme tarihi girilince durum kendiliğinden İzleniyor olur.
export function OtomatikIzleniyorVisual() {
  const ep = (y: number, n: string, date: string, isNew = false) => (
    <g>
      <rect x={24} y={y} width={10} height={10} rx={2} fill={date ? ACCENT : 'none'} className={date ? undefined : 'stroke-neutral-600'} strokeWidth={0.8} />
      <text x={40} y={y + 8} fontSize={6.5} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {n}
      </text>
      <text x={150} y={y + 8} fontSize={6} textAnchor="end" fill={isNew ? ACCENT : undefined} className={isNew ? undefined : 'fill-neutral-500'} style={{ fontFamily: 'inherit', fontWeight: isNew ? 600 : 400 }}>
        {date}
      </text>
    </g>
  )
  const badge = (x: number, y: number, t: string, on: boolean) => (
    <g>
      <rect x={x} y={y} width={70} height={15} rx={7.5} fill={on ? ACCENT : 'none'} fillOpacity={on ? 0.2 : undefined} stroke={on ? ACCENT : undefined} className={on ? undefined : 'stroke-neutral-600'} strokeWidth={0.8} />
      <text x={x + 35} y={y + 10.5} fontSize={7} textAnchor="middle" fill={on ? ACCENT : undefined} className={on ? undefined : 'fill-neutral-400'} style={{ fontFamily: 'inherit', fontWeight: on ? 600 : 400 }}>
        {t}
      </text>
    </g>
  )
  return (
    <Frame viewBox={VB}>
      <ArrowDef id="pv-arrow-oi" />
      <Box x={8} y={8} w={152} h={164} r={8} strong />
      <Label x={18} y={28} size={8.5}>Avatar: Seven Havens</Label>
      <Label x={18} y={44} size={5.5} muted>{tt('1. SEZON')}</Label>
      {ep(54, tt('1. Bölüm'), '10.10')}
      {ep(70, tt('2. Bölüm'), '12.10')}
      {ep(86, tt('3. Bölüm'), tt('bugün'), true)}
      {ep(102, tt('4. Bölüm'), '')}
      <Pin x={154} y={88} n={1} />
      <Label x={18} y={140} size={5.5} muted>{tt('ARGUS ya da Nook')}</Label>
      <path d="M164 92 h40" stroke={ACCENT} strokeWidth={1.3} markerEnd="url(#pv-arrow-oi)" />
      <Box x={210} y={40} w={102} h={104} r={8} />
      <Label x={220} y={58} size={6} muted>{tt('Durum')}</Label>
      {badge(226, 68, tt('İzlenecek'), false)}
      <path d="M261 86 v14" stroke={ACCENT} strokeWidth={1.1} markerEnd="url(#pv-arrow-oi)" />
      {badge(226, 106, tt('İzleniyor'), true)}
      <NewTag x={240} y={126} text={tt('OTOMATİK')} />
      <Pin x={302} y={110} n={2} />
    </Frame>
  )
}

export function BolumNumarasiVisual() {
  const ep = (y: number, n: string, date: string, isNew = false) => (
    <g>
      <rect x={220} y={y} width={10} height={10} rx={2} fill={date ? ACCENT : 'none'} className={date ? undefined : 'stroke-neutral-600'} strokeWidth={0.8} />
      <text x={236} y={y + 8} fontSize={6.5} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {n}
      </text>
      <text x={304} y={y + 8} fontSize={6} textAnchor="end" fill={isNew ? ACCENT : undefined} className={isNew ? undefined : 'fill-neutral-500'} style={{ fontFamily: 'inherit', fontWeight: isNew ? 600 : 400 }}>
        {date}
      </text>
    </g>
  )
  return (
    <Frame viewBox={VB}>
      <ArrowDef id="pv-arrow-bn" />
      <Box x={8} y={50} w={150} h={70} r={8} />
      <Label x={18} y={68} size={5.5} muted>{tt('YouTube / tabii başlığı')}</Label>
      <Label x={18} y={86} size={7.5}>Mehmed: Fetihler Sultanı</Label>
      <text x={18} y={104} fontSize={8} fill={ACCENT} style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('87. Bölüm')}
      </text>
      <Pin x={148} y={60} n={1} />
      <path d="M162 86 h38" stroke={ACCENT} strokeWidth={1.3} markerEnd="url(#pv-arrow-bn)" />
      <Box x={206} y={30} w={106} h={120} r={8} strong />
      <Label x={216} y={48} size={5.5} muted>{tt('4. SEZON')}</Label>
      {ep(58, tt('3. Bölüm'), '01.10')}
      {ep(76, tt('4. Bölüm'), tt('bugün'), true)}
      {ep(94, tt('5. Bölüm'), '')}
      <NewTag x={222} y={124} text={tt('DÜZELTME')} />
      <Pin x={302} y={80} n={2} />
    </Frame>
  )
}

// ---- v1.17 ---------------------------------------------------------------------------------

// Ne İzlesem'in içinden açılan Filtreler paneli (yıl aralığıyla)
export function NeIzlesemFiltreVisual() {
  return (
    <Frame viewBox={VB}>
      <Poster x={22} y={46} w={52} />
      <Line x={86} y={56} w={80} />
      <Line x={86} y={68} w={60} light />
      <Line x={86} y={80} w={70} light />
      <MiniButton x={168} y={10} w={40} text={tt('Filtreler')} accent />
      <MiniButton x={212} y={10} w={46} text={tt('↻ Tekrar getir')} />
      <MiniButton x={262} y={10} w={50} text={tt('Kapat')} />
      <Pin x={188} y={8} n={1} />
      <Box x={196} y={28} w={116} h={142} r={6} strong />
      <Label x={204} y={42} size={6.5}>{tt('Nereden seçilsin')}</Label>
      <MiniButton x={204} y={48} w={46} text={tt('Arşivimden')} />
      <MiniButton x={254} y={48} w={50} text="TMDB" />
      <Label x={204} y={76} size={5.5} muted>{tt('Tür')}</Label>
      <Chip x={204} y={80} w={32} color={ACCENT} />
      <Chip x={240} y={80} w={28} color="#737373" />
      <Label x={204} y={108} size={5.5} muted>{tt('Yıl')}</Label>
      <Box x={204} y={112} w={34} h={14} r={3} />
      <Label x={221} y={122} size={6.5} anchor="middle">1990</Label>
      <Label x={243} y={122} size={6.5} muted>–</Label>
      <Box x={250} y={112} w={34} h={14} r={3} />
      <Label x={267} y={122} size={6.5} anchor="middle">1999</Label>
      <NewTag x={288} y={112} />
      <Pin x={302} y={104} n={2} />
      <MiniButton x={204} y={150} w={100} text={tt('Bu filtreyle getir')} accent />
    </Frame>
  )
}

// Yeni sıralamalar: popüler / en yüksek puanlı yanında gizli kalmışlar, yeni çıkanlar, her şeyden
export function NeIzlesemSiralamaVisual() {
  const opts: [string, boolean][] = [
    [tt('Popüler olanlar'), false],
    [tt('En yüksek puanlılar'), false],
    [tt('Gizli kalmışlar'), true],
    [tt('Yeni çıkanlar'), true],
    [tt('Her şeyden'), true],
  ]
  return (
    <Frame viewBox={VB}>
      <Box x={20} y={22} w={280} h={136} r={8} />
      <Label x={34} y={42} size={7} muted>{tt('Hangileri')}</Label>
      {opts.map(([t, isNew], i) => (
        <g key={t}>
          <MiniButton x={34 + (i % 3) * 88} y={52 + Math.floor(i / 3) * 24} w={82} text={t} accent={isNew} />
        </g>
      ))}
      <Pin x={290} y={56} n={1} />
      <Label x={34} y={118} size={6.5} muted>{tt('Son gelenler bir süre yine gelmez')}</Label>
      {[0, 1, 2, 3, 4].map((i) => (
        <Poster key={i} x={34 + i * 22} y={124} w={16} dim={i < 3} />
      ))}
      <path d="M34 140 l12 -12 M56 140 l12 -12 M78 140 l12 -12" stroke={ACCENT} strokeWidth={1} />
      <Pin x={150} y={132} n={2} />
    </Frame>
  )
}

// Seri film: kaçıncı film rozeti + serinin diğer filmleri; izlenmemiş ilk film önce gelir
export function SeriFilmVisual() {
  return (
    <Frame viewBox={VB}>
      <Poster x={14} y={14} w={46} />
      <Line x={70} y={22} w={90} />
      <rect x={70} y={32} width={62} height={11} rx={5.5} fill={ACCENT} fillOpacity={0.2} stroke={ACCENT} strokeOpacity={0.6} />
      <text x={101} y={40} fontSize={6} textAnchor="middle" fill={ACCENT} style={{ fontFamily: 'inherit', fontWeight: 600 }} {...fit(tt('Serinin 1. filmi'), 6, 58)}>
        {tt('Serinin 1. filmi')}
      </text>
      <Pin x={142} y={37} n={1} />
      <Label x={70} y={58} size={6} muted>{tt('2. film çıktı, 1. filmi izlemedin')}</Label>
      <Label x={14} y={104} size={7}>{tt('Serinin filmleri')}</Label>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={14 + i * 40} y={112} width={32} height={48} rx={3} className={i === 0 ? undefined : 'fill-neutral-700'} fill={i === 0 ? '#1f2937' : undefined} stroke={i === 0 ? ACCENT : 'none'} strokeWidth={1.4} />
          <text x={19 + i * 40} y={121} fontSize={6} className="fill-neutral-200" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
            {i + 1}
          </text>
        </g>
      ))}
      <Pin x={176} y={136} n={2} />
      <NewTag x={250} y={14} />
    </Frame>
  )
}

// İzledim: tarih + kriter kriter puan
export function DetayliPuanVisual() {
  const crit = [tt('Senaryo'), tt('Oyunculuk'), tt('Görsellik'), tt('Müzik')]
  return (
    <Frame viewBox={VB}>
      <Box x={60} y={12} w={200} h={156} r={8} strong />
      <Label x={72} y={30} size={6} muted>{tt('İzleme tarihi')}</Label>
      <Box x={72} y={35} w={176} h={13} r={3} />
      <Label x={78} y={44} size={6.5}>03.11.2026</Label>
      <Label x={72} y={64} size={6} muted>{tt('Puan')}</Label>
      <text x={248} y={64} fontSize={7} textAnchor="end" fill="#fbbf24" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
        ★ 8.1
      </text>
      {crit.map((c, i) => (
        <g key={c}>
          <Label x={72} y={78 + i * 18} size={6}>{c}</Label>
          <rect x={72} y={82 + i * 18} width={176} height={2.5} rx={1.2} className="fill-neutral-700" />
          <rect x={72} y={82 + i * 18} width={176 * [0.8, 0.9, 0.75, 0.8][i]} height={2.5} rx={1.2} fill={ACCENT} />
          <circle cx={72 + 176 * [0.8, 0.9, 0.75, 0.8][i]} cy={83.2 + i * 18} r={3} fill={ACCENT} />
        </g>
      ))}
      <Pin x={258} y={96} n={1} />
      <MiniButton x={72} y={152} w={120} text={tt('Kaydet')} accent />
      <NewTag x={226} y={20} />
    </Frame>
  )
}

// Takvim: özet kutucuğuna tıklayınca liste
export function TakvimOzetVisual() {
  return (
    <Frame viewBox={VB}>
      {[tt('3 film'), tt('12 bölüm'), tt('1 dizi bitirdin')].map((t, i) => (
        <g key={t}>
          <rect x={14 + i * 64} y={14} width={58} height={14} rx={7} fill={i === 0 ? ACCENT : 'none'} fillOpacity={i === 0 ? 0.2 : 1} stroke={i === 0 ? ACCENT : '#525252'} strokeWidth={0.8} />
          <text x={43 + i * 64} y={24} fontSize={6.5} textAnchor="middle" className="fill-neutral-200" style={{ fontFamily: 'inherit' }} {...fit(t, 6.5, 52)}>
            {t}
          </text>
        </g>
      ))}
      <Pin x={70} y={14} n={1} />
      <path d="M43 30 v14" stroke={ACCENT} strokeWidth={1.2} />
      <Box x={14} y={46} w={200} h={122} r={8} strong />
      <Label x={24} y={62} size={7}>{tt('Bu ay izlediğin filmler')}</Label>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Label x={24} y={78 + i * 30} size={5.5} muted>{['2', '14', '27'][i] + ' ' + tt('Kasım')}</Label>
          <rect x={24} y={82 + i * 30} width={180} height={18} rx={3} className="fill-neutral-800" />
          <rect x={27} y={84 + i * 30} width={9} height={14} rx={1.5} className="fill-neutral-600" />
          <Line x={42} y={89 + i * 30} w={80} />
        </g>
      ))}
      <Pin x={214} y={92} n={2} />
      <Label x={226} y={96} size={6} muted>{tt('tıkla → detay')}</Label>
    </Frame>
  )
}

// Takvim: vizyona girecek filmler
export function VizyonTakvimVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={196} y={10} width={112} height={15} rx={7.5} fill="#fbbf24" fillOpacity={0.12} stroke="#fbbf24" strokeOpacity={0.6} />
      <text x={252} y={20.5} fontSize={6.5} textAnchor="middle" fill="#fcd34d" style={{ fontFamily: 'inherit' }} {...fit('🎬 ' + tt('Vizyondakiler'), 6.5, 104)}>
        🎬 {tt('Vizyondakiler')}
      </text>
      <Pin x={194} y={12} n={1} />
      {[0, 1, 2, 3, 4, 5, 6].map((c) =>
        [0, 1].map((r) => <rect key={`${c}-${r}`} x={12 + c * 43} y={34 + r * 68} width={41} height={66} className="fill-neutral-900 stroke-neutral-800" strokeWidth={0.6} />),
      )}
      {[
        [1, 0],
        [2, 0],
        [2, 1],
        [4, 1],
      ].map(([c, r], i) => (
        <g key={i}>
          <rect x={15 + c * 43} y={48 + r * 68 + (i === 2 ? 0 : 0)} width={35} height={18} rx={2.5} fill="none" stroke="#fbbf24" strokeOpacity={0.7} strokeDasharray="2 1.5" strokeWidth={0.8} />
          <rect x={17 + c * 43} y={50 + r * 68} width={8} height={14} rx={1} className="fill-neutral-600" />
          <rect x={28 + c * 43} y={53 + r * 68} width={18} height={3} rx={1} className="fill-neutral-400" />
          <rect x={28 + c * 43} y={59 + r * 68} width={12} height={2.5} rx={1} fill="#fbbf24" fillOpacity={0.8} />
        </g>
      ))}
      <Pin x={150} y={58} n={2} />
    </Frame>
  )
}

// Zildeki yeni bildirimler: platforma geldi, vizyon tarihi değişti, seriye yeni film
export function TakipBildirimVisual() {
  const rows: [string, string, string, string][] = [
    ['📺', '#8b5cf6', tt('Bıçaklar Çekildi'), tt('Artık şu platformda: Netflix')],
    ['📅', '#f59e0b', tt('Açlık Oyunları'), tt('Vizyon tarihi ertelendi')],
    ['🎞', ACCENT, tt('Yıldız Savaşları serisi'), tt('Seriye yeni bir film eklendi')],
  ]
  return (
    <Frame viewBox={VB}>
      <Box x={70} y={14} w={180} h={152} r={8} strong />
      <Label x={82} y={32} size={7}>{tt('Bildirimler')}</Label>
      {rows.map(([icon, color, title, text], i) => (
        <g key={i}>
          <rect x={80} y={42 + i * 40} width={160} height={34} rx={5} className="fill-neutral-800" />
          <circle cx={95} cy={59 + i * 40} r={8} fill={color} fillOpacity={0.25} />
          <text x={95} y={62 + i * 40} fontSize={8} textAnchor="middle" style={{ fontFamily: 'inherit' }}>
            {icon}
          </text>
          <text x={108} y={55 + i * 40} fontSize={6.5} className="fill-neutral-100" style={{ fontFamily: 'inherit', fontWeight: 600 }} {...fit(title, 6.5, 126)}>
            {title}
          </text>
          <text x={108} y={66 + i * 40} fontSize={5.8} className="fill-neutral-400" style={{ fontFamily: 'inherit' }} {...fit(text, 5.8, 126)}>
            {text}
          </text>
        </g>
      ))}
      <Pin x={250} y={59} n={1} />
      <Pin x={250} y={99} n={2} />
      <Pin x={250} y={139} n={3} />
    </Frame>
  )
}

// Ne İzlesem: süre ve platformlarım
export function SurePlatformVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={40} y={16} w={240} h={148} r={8} />
      <Label x={54} y={36} size={6.5} muted>{tt('Ne kadar vaktin var')}</Label>
      <MiniButton x={54} y={42} w={50} text={tt('Fark etmez')} />
      <MiniButton x={108} y={42} w={50} text={tt('90 dk')} />
      <MiniButton x={162} y={42} w={50} text={tt('2 saat')} accent />
      <MiniButton x={216} y={42} w={50} text={tt('2,5 saat')} />
      <Pin x={272} y={40} n={1} />
      <Label x={54} y={80} size={6.5} muted>{tt('Sadece platformlarımda')}</Label>
      <rect x={256} y={73} width={10} height={10} rx={2} fill={ACCENT} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={54 + i * 54} y={90} width={48} height={16} rx={4} fill={i < 2 ? ACCENT : 'none'} fillOpacity={i < 2 ? 0.18 : 1} stroke={i < 2 ? ACCENT : '#525252'} strokeWidth={0.8} />
          <rect x={57 + i * 54} y={93} width={10} height={10} rx={2} className="fill-neutral-600" />
          <rect x={71 + i * 54} y={96.5} width={26} height={3} rx={1} className="fill-neutral-400" />
        </g>
      ))}
      <Pin x={272} y={98} n={2} />
      <MiniButton x={54} y={136} w={110} text={tt('Bu filtreyle getir')} accent />
      <NewTag x={226} y={136} />
    </Frame>
  )
}

// Ana sayfada "Unuttukların"
export function UnuttuklarinVisual() {
  return (
    <Frame viewBox={VB}>
      <Label x={14} y={30} size={8}>{tt('Unuttukların')}</Label>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={14 + i * 60} y={40} width={52} height={78} rx={4} className="fill-neutral-700" />
          <rect x={17 + i * 60} y={43} width={40} height={10} rx={2} fill={i < 2 ? '#fbbf24' : '#000'} fillOpacity={i < 2 ? 1 : 0.6} />
          <text x={37 + i * 60} y={50.5} fontSize={5} textAnchor="middle" fill={i < 2 ? '#0a0a0a' : '#e5e5e5'} style={{ fontFamily: 'inherit', fontWeight: 600 }} {...fit(i < 2 ? tt('3 aydır') : tt('8 aydır'), 5, 36)}>
            {i < 2 ? tt('3 aydır') : tt('8 aydır')}
          </text>
          <MiniButton x={14 + i * 60} y={124} w={25} text={i < 2 ? tt('Devam') : tt('Bak')} />
          <MiniButton x={41 + i * 60} y={124} w={25} text={i < 2 ? tt('Bırak') : tt('Gizle')} />
        </g>
      ))}
      <Pin x={66} y={44} n={1} />
      <Pin x={246} y={44} n={2} />
      <NewTag x={110} y={20} />
    </Frame>
  )
}

// İstatistikler: Puan zevkin
export function PuanZevkiVisual() {
  const crit: [string, number][] = [
    [tt('Senaryo'), 7.9],
    [tt('Oyunculuk'), 7.7],
    [tt('Görsellik'), 7.6],
    [tt('Müzik'), 7.0],
  ]
  return (
    <Frame viewBox={VB}>
      <Box x={10} y={14} w={300} h={152} r={8} />
      <Label x={22} y={32} size={7.5}>{tt('Puan zevkin')}</Label>
      {crit.map(([c, v], i) => (
        <g key={c}>
          <Label x={22} y={56 + i * 22} size={6}>{c}</Label>
          <rect x={72} y={50 + i * 22} width={80} height={8} rx={2} className="fill-neutral-800" />
          <rect x={72} y={50 + i * 22} width={v * 8} height={8} rx={2} fill={ACCENT} />
        </g>
      ))}
      <Pin x={160} y={66} n={1} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={178} y={48 + i * 26} width={6} height={6} rx={3} fill={ACCENT} />
          <Line x={190} y={50 + i * 26} w={100} />
          <Line x={190} y={58 + i * 26} w={70} light />
        </g>
      ))}
      <Pin x={300} y={52} n={2} />
      <NewTag x={250} y={20} />
    </Frame>
  )
}

// v1.18 — ARGUS telefonda: alt menü, afişler, Kim izliyor
function Phone({ x, children }: { x: number; children?: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={14} width={76} height={152} rx={12} className="fill-neutral-900 stroke-neutral-600" strokeWidth={1.5} />
      <rect x={x + 28} y={19} width={20} height={3} rx={1.5} className="fill-neutral-600" />
      {children}
    </g>
  )
}
function PhoneTabs({ x, active }: { x: number; active: number }) {
  return (
    <g>
      <rect x={x + 6} y={146} width={64} height={13} rx={6.5} className="fill-neutral-800 stroke-neutral-700" strokeWidth={1} />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={x + 14 + i * 12} cy={152.5} r={2.4} fill={i === active ? ACCENT : undefined} className={i === active ? '' : 'fill-neutral-600'} />
      ))}
    </g>
  )
}
export function TelefonUygulamaVisual() {
  return (
    <Frame viewBox={VB}>
      <Phone x={20}>
        <rect x={26} y={28} width={64} height={70} rx={6} className="fill-neutral-700" />
        <rect x={42} y={82} width={32} height={5} rx={2.5} className="fill-neutral-400" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={26 + i * 22} y={106} width={19} height={28} rx={3} className="fill-neutral-700" />
        ))}
        <PhoneTabs x={20} active={0} />
      </Phone>
      <Phone x={122}>
        <rect x={128} y={28} width={44} height={8} rx={4} className="fill-neutral-800 stroke-neutral-700" strokeWidth={1} />
        <circle cx={185} cy={32} r={4.5} className="fill-neutral-50" />
        {[0, 1, 2, 3].map((r) =>
          [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={128 + c * 22} y={42 + r * 26} width={19} height={23} rx={2.5} className="fill-neutral-700" />),
        )}
        <PhoneTabs x={122} active={1} />
      </Phone>
      <Phone x={224}>
        <rect x={224} y={14} width={76} height={92} rx={12} className="fill-neutral-700" />
        <rect x={246} y={84} width={32} height={6} rx={3} className="fill-neutral-400" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={232 + i * 21} y={114} width={17} height={17} rx={3} className={i === 0 ? 'fill-rose-400' : i === 1 ? 'fill-sky-400' : 'fill-neutral-600'} />
        ))}
      </Phone>
      <Pin x={30} y={150} n={1} />
      <Pin x={132} y={40} n={2} />
      <Pin x={234} y={26} n={3} />
      <NewTag x={8} y={6} />
    </Frame>
  )
}

// v1.18 — PC ile eşitleme
export function TelefonEsitlemeVisual() {
  return (
    <Frame viewBox={VB}>
      <Phone x={30}>
        <rect x={44} y={34} width={48} height={12} rx={6} fill="#78350f" />
        <Label x={68} y={42.5} size={6} anchor="middle">
          {tt('3 değişiklik')}
        </Label>
        {[0, 1, 2].map((i) => (
          <rect key={i} x={38 + i * 21} y={56} width={18} height={26} rx={3} className="fill-neutral-700" />
        ))}
      </Phone>
      <rect x={196} y={46} width={100} height={66} rx={6} className="fill-neutral-800 stroke-neutral-600" strokeWidth={1.5} />
      <rect x={236} y={112} width={20} height={14} className="fill-neutral-600" />
      <rect x={222} y={126} width={48} height={5} rx={2.5} className="fill-neutral-600" />
      <path d="M118 74h68m-8-6 8 6-8 6M186 98h-68m8-6-8 6 8 6" stroke={ACCENT} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M140 124a12 12 0 0 1 24 0M146 130a6 6 0 0 1 12 0" className="stroke-neutral-400" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Pin x={70} y={30} n={1} />
      <Pin x={152} y={66} n={2} />
    </Frame>
  )
}

// v1.18 — Telefona kurulum (PC'deki QR) ve kendini güncelleme
export function TelefonKurulumVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={14} y={22} w={170} h={136} r={8} />
      <Label x={26} y={42} size={8}>{tt('Ayarlar › Telefon')}</Label>
      <rect x={26} y={52} width={56} height={56} rx={4} fill="#ffffff" />
      {[0, 1, 2, 3, 4, 5].map((r) =>
        [0, 1, 2, 3, 4, 5].map((c) => ((r * 7 + c * 3) % 4 === 0 || (r < 2 && c < 2) || (r > 3 && c < 2) || (r < 2 && c > 3) ? <rect key={`${r}${c}`} x={30 + c * 8} y={56 + r * 8} width={7} height={7} fill="#000" /> : null)),
      )}
      <Line x={90} y={60} w={80} />
      <Line x={90} y={70} w={70} light />
      <Chip x={90} y={84} w={60} color="#262626" text={tt('APK\'yı indir')} />
      <Phone x={222}>
        <rect x={230} y={30} width={60} height={14} rx={7} fill="#062033" stroke={ACCENT} strokeWidth={1} />
        <Label x={260} y={39.5} size={6} anchor="middle">
          {tt('Güncelle')}
        </Label>
        {[0, 1, 2].map((i) => (
          <rect key={i} x={230 + i * 21} y={54} width={18} height={26} rx={3} className="fill-neutral-700" />
        ))}
      </Phone>
      <Pin x={54} y={80} n={1} />
      <Pin x={292} y={30} n={2} />
    </Frame>
  )
}

// ---- v1.19 -----------------------------------------------------------------------------------

const EVREN_RENK = ['#e23636', '#2b6cff', '#ffe81f', '#c9a227', '#946b2d']

export function EvrenlerListeVisual() {
  const names = [tt('Marvel'), tt('DC'), tt('Star Wars'), tt('Orta Dünya'), tt('Büyücülük')]
  const pct = [0.45, 0.35, 0.12, 0.6, 1]
  return (
    <Frame viewBox={VB}>
      <Label x={10} y={16} size={9}>
        {tt('Evrenler')}
      </Label>
      <NewTag x={Math.max(50, 14 + textW(tt('Evrenler'), 9))} y={7} />
      {names.map((n, i) => {
        const x = 8 + (i % 3) * 102
        const y = 26 + Math.floor(i / 3) * 74
        return (
          <g key={i}>
            <Box x={x} y={y} w={96} h={66} r={6} />
            <rect x={x} y={y} width={96} height={34} rx={6} fill={EVREN_RENK[i]} opacity={0.25} />
            {[0, 1, 2].map((j) => (
              <rect key={j} x={x + 52 + j * 14} y={y + 4} width={12} height={18} rx={1.5} className="fill-neutral-600" />
            ))}
            <text x={x + 6} y={y + 29} fontSize={7.5} fontWeight={800} className="fill-neutral-50" style={{ fontFamily: 'inherit' }} {...fit(n, 7.5, 84)}>
              {n}
            </text>
            <rect x={x + 6} y={y + 42} width={84} height={3} rx={1.5} className="fill-neutral-800" />
            <rect x={x + 6} y={y + 42} width={84 * pct[i]} height={3} rx={1.5} fill={EVREN_RENK[i]} />
            <text x={x + 6} y={y + 56} fontSize={5.8} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
              {tt('{0}/{1} izledin', Math.round(30 * pct[i]), 30)}
            </text>
          </g>
        )
      })}
      <Pin x={14} y={30} n={1} />
      <Box x={212} y={100} w={96} h={66} r={6} />
      <text x={260} y={130} fontSize={14} textAnchor="middle" fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        ＋
      </text>
      <text x={260} y={146} fontSize={6} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }} {...fit(tt('Kendi evrenini oluştur'), 6, 84)}>
        {tt('Kendi evrenini oluştur')}
      </text>
      <Pin x={300} y={104} n={2} />
    </Frame>
  )
}

export function EvrenIsaretVisual() {
  const marks = ['✓ 2019', '✓ 2019', '✓ 2024']
  return (
    <Frame viewBox={VB}>
      <Label x={10} y={16} size={9}>
        {tt('Marvel Sinematik Evreni')}
      </Label>
      <rect x={10} y={22} width={130} height={3} rx={1.5} className="fill-neutral-800" />
      <rect x={10} y={22} width={58} height={3} rx={1.5} fill="#e23636" />
      <MiniButton x={10} y={32} w={50} text={tt('Çıkış sırası')} />
      <MiniButton x={62} y={32} w={50} text={tt('Hikâye sırası')} accent />
      <MiniButton x={116} y={32} w={60} text={tt('Baştan izliyorum')} />
      <Pin x={60} y={30} n={1} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = 10 + i * 34
        const done = i < 3
        return (
          <g key={i}>
            <rect x={x} y={52} width={30} height={45} rx={3} className={i === 3 ? 'fill-neutral-600' : 'fill-neutral-700'} stroke={i === 3 ? '#e23636' : 'none'} strokeWidth={1.2} />
            <rect x={x + 2} y={54} width={8} height={7} rx={1.5} className="fill-neutral-950" />
            <text x={x + 6} y={59.5} fontSize={5} textAnchor="middle" className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
              {i + 1}
            </text>
            <rect x={x + 2} y={88} width={26} height={7} rx={1.5} fill={done ? '#10b981' : '#0a0a0a'} />
            <text x={x + 15} y={93.3} fontSize={4.6} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit' }} {...fit(done ? marks[i] : tt('✓ İzledim'), 4.6, 24)}>
              {done ? marks[i] : tt('✓ İzledim')}
            </text>
            <Line x={x} y={104} w={26} light />
          </g>
        )
      })}
      <Pin x={128} y={56} n={2} />
      <Box x={214} y={30} w={98} h={140} r={6} strong />
      <text x={220} y={42} fontSize={5.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('İzlediğin tarihler')}
      </text>
      <text x={220} y={52} fontSize={6.5} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        {tt('8 Haz 2019')}
      </text>
      <text x={300} y={52} fontSize={6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        ✕
      </text>
      <rect x={220} y={58} width={86} height={0.6} className="fill-neutral-700" />
      <text x={220} y={69} fontSize={5.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Tekrar izledim')}
      </text>
      {[tt('Bugün'), tt('Dün'), tt('Bir gün seç'), tt('Sadece yıl'), tt('Hatırlamıyorum')].map((t, i) => (
        <g key={i}>
          <rect x={220} y={74 + i * 17} width={86} height={13} rx={2.5} fill={i === 0 ? ACCENT : 'none'} className={i === 0 ? undefined : 'stroke-neutral-700'} strokeWidth={0.6} />
          <text x={225} y={83 + i * 17} fontSize={6.2} fill={i === 0 ? '#fff' : undefined} className={i === 0 ? undefined : 'fill-neutral-300'} style={{ fontFamily: 'inherit' }}>
            {t}
          </text>
        </g>
      ))}
      <Pin x={208} y={36} n={3} />
      <Box x={10} y={122} w={196} h={48} r={6} />
      <text x={18} y={137} fontSize={6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Arşiv · Takvim · İstatistikler')}
      </text>
      <text x={18} y={152} fontSize={7} className="fill-neutral-100" style={{ fontFamily: 'inherit' }} {...fit(tt('Demir Adam · İzlendi · bugün'), 7, 180)}>
        {tt('Demir Adam · İzlendi · bugün')}
      </text>
      <Pin x={200} y={126} n={4} />
    </Frame>
  )
}

// ---- v1.19.1 ---------------------------------------------------------------------------------

export function EvrenTurVisual() {
  return (
    <Frame viewBox={VB}>
      <text x={10} y={16} fontSize={6} fontWeight={700} fill={ACCENT} style={{ fontFamily: 'inherit' }}>
        {tt('İZLEME TURU · 1 KAS 2026')}
      </text>
      <rect x={10} y={22} width={180} height={5} rx={2.5} className="fill-neutral-800" />
      <rect x={10} y={22} width={34} height={5} rx={2.5} fill="#e23636" />
      <text x={10} y={39} fontSize={7} className="fill-neutral-100" style={{ fontFamily: 'inherit' }} {...fit(tt('63 yapımın 12 tanesini izledin · kalan 170 saat'), 7, 220)}>
        {tt('63 yapımın 12 tanesini izledin · kalan 170 saat')}
      </text>
      <Pin x={196} y={22} n={1} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const x = 10 + i * 43
        const kind = ['done', 'done', 'tv', 'missing', 'before', 'idle', 'missing'][i]
        return (
          <g key={i}>
            <rect x={x} y={52} width={38} height={57} rx={3} className={kind === 'missing' ? 'fill-neutral-900' : 'fill-neutral-700'} strokeDasharray={kind === 'missing' ? '2 1.5' : undefined} stroke={kind === 'missing' ? '#737373' : 'none'} strokeWidth={0.7} />
            {kind === 'tv' && (
              <g>
                <rect x={x + 3} y={92} width={32} height={2} rx={1} className="fill-neutral-900" />
                <rect x={x + 3} y={92} width={11} height={2} rx={1} fill="#e23636" />
              </g>
            )}
            <rect x={x + 2} y={97} width={34} height={9} rx={1.5} fill={kind === 'done' ? '#10b981' : '#0a0a0a'} />
            <text x={x + 19} y={103.5} fontSize={5} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit' }} {...fit(kind === 'done' ? tt('✓ 3 Kas') : kind === 'tv' ? tt('3/9 bölüm') : kind === 'missing' ? tt('+ Arşive ekle') : tt('✓ İzledim'), 5, 31)}>
              {kind === 'done' ? tt('✓ 3 Kas') : kind === 'tv' ? tt('3/9 bölüm') : kind === 'missing' ? tt('+ Arşive ekle') : tt('✓ İzledim')}
            </text>
            <Line x={x} y={116} w={30} light />
            {kind === 'before' && (
              <text x={x} y={128} fontSize={5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
                {tt('Önceden: 2019')}
              </text>
            )}
            {kind === 'missing' && (
              <text x={x} y={128} fontSize={5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
                {tt('arşivinde yok')}
              </text>
            )}
          </g>
        )
      })}
      <Pin x={96} y={56} n={2} />
      <Pin x={139} y={56} n={3} />
      <MiniButton x={10} y={146} w={120} text={tt('Arşivinde olmayanları ekle (31)')} />
      <MiniButton x={136} y={146} w={70} text={tt('Bölümleri aç')} accent />
    </Frame>
  )
}

// ---- v1.19.2 ---------------------------------------------------------------------------------

export function EvrenEskiVisual() {
  const rows = [
    { t: tt('The Incredible Hulk'), old: true, y: '2010' },
    { t: tt('Thor'), old: true, y: '' },
    { t: tt('Jessica Jones'), old: false, y: '' },
    { t: tt('Luke Cage'), old: false, y: '' },
  ]
  return (
    <Frame viewBox={VB}>
      <Label x={10} y={16} size={8.5}>
        {tt('Arşivinde olmayanları ekle')}
      </Label>
      {rows.map((r, i) => {
        const y = 26 + i * 28
        return (
          <g key={i}>
            <Box x={8} y={y} w={304} h={24} r={4} />
            <rect x={13} y={y + 3} width={12} height={18} rx={1.5} className="fill-neutral-700" />
            <text x={30} y={y + 15} fontSize={6.5} className="fill-neutral-100" style={{ fontFamily: 'inherit' }} {...fit(r.t, 6.5, 90)}>
              {r.t}
            </text>
            <rect x={140} y={y + 6} width={44} height={12} rx={2.5} className={r.old ? undefined : 'fill-neutral-700'} fill={r.old ? 'none' : undefined} />
            <text x={162} y={y + 14} fontSize={5.5} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
              {tt('İzlenecek')}
            </text>
            <rect x={186} y={y + 6} width={54} height={12} rx={2.5} fill={r.old ? '#e23636' : 'none'} opacity={r.old ? 0.45 : 1} />
            <text x={213} y={y + 14} fontSize={5.5} textAnchor="middle" className="fill-neutral-100" style={{ fontFamily: 'inherit' }} {...fit(tt('Eskiden izledim'), 5.5, 50)}>
              {tt('Eskiden izledim')}
            </text>
            {r.old && (
              <g>
                <rect x={246} y={y + 6} width={60} height={12} rx={2.5} fill="none" className="stroke-neutral-600" strokeWidth={0.6} />
                <text x={250} y={y + 14} fontSize={5.5} className={r.y ? 'fill-neutral-100' : 'fill-neutral-500'} style={{ fontFamily: 'inherit' }}>
                  {r.y || tt('Yıl (boş)')}
                </text>
              </g>
            )}
          </g>
        )
      })}
      <Pin x={208} y={28} n={1} />
      <Pin x={300} y={28} n={2} />
      <text x={10} y={150} fontSize={6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('2 İzlenecek · 2 eskiden izledim')}
      </text>
      <rect x={240} y={142} width={72} height={14} rx={3} fill="#e23636" />
      <text x={276} y={151.5} fontSize={6.5} textAnchor="middle" fill="#fff" fontWeight={700} style={{ fontFamily: 'inherit' }}>
        {tt('4 yapımı ekle')}
      </text>
      <Pin x={236} y={140} n={3} />
    </Frame>
  )
}

// ---- v1.19.3 ---------------------------------------------------------------------------------

export function EvrenHedefVisual() {
  const red = '#e23636'
  return (
    <Frame viewBox={VB}>
      <text x={10} y={18} fontSize={6} fontWeight={700} fill={red} style={{ fontFamily: 'inherit' }}>
        {tt('İZLEME TURU · 1 KAS · 6. GÜN')}
      </text>
      <text x={196} y={18} fontSize={6} fontWeight={700} className="fill-neutral-100" style={{ fontFamily: 'inherit' }} {...fit(tt('Hedef 16 Ara · 40 gün kaldı'), 6, 116)}>
        {tt('Hedef 16 Ara · 40 gün kaldı')}
      </text>
      <Pin x={300} y={8} n={1} />
      <rect x={10} y={24} width={300} height={5} rx={2.5} className="fill-neutral-800" />
      <rect x={10} y={24} width={60} height={5} rx={2.5} fill={red} />
      <text x={10} y={42} fontSize={6.5} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {tt('63 yapımın 12 tanesini izledin · kalan 170 saat')}
      </text>
      <text x={10} y={54} fontSize={5.8} className="fill-neutral-400" style={{ fontFamily: 'inherit' }} {...fit(tt('Günde yaklaşık 4 saat · Bu hızla 10 Ara gibi bitirirsin (hedeften önce)'), 5.8, 280)}>
        {tt('Günde yaklaşık 4 saat · Bu hızla 10 Ara gibi bitirirsin (hedeften önce)')}
      </text>
      <Pin x={296} y={46} n={2} />
      <Box x={10} y={66} w={190} h={106} r={6} strong />
      <text x={18} y={80} fontSize={5.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Başlangıç')}
      </text>
      <rect x={18} y={84} width={174} height={13} rx={2.5} fill="none" className="stroke-neutral-600" strokeWidth={0.6} />
      <text x={22} y={93} fontSize={6} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>01.11.2026</text>
      <text x={18} y={108} fontSize={5.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Hedef bitiş')}
      </text>
      <rect x={18} y={112} width={174} height={13} rx={2.5} fill="none" className="stroke-neutral-600" strokeWidth={0.6} />
      <text x={22} y={121} fontSize={6} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>16.12.2026</text>
      {[tt('Doomsday çıkana kadar'), tt('1 ay'), tt('3 ay')].map((t, i) => {
        const x = [18, 104, 132][i]
        const w = [82, 24, 24][i]
        return (
          <g key={i}>
            <rect x={x} y={131} width={w} height={11} rx={5.5} fill={i === 0 ? red : 'none'} opacity={i === 0 ? 0.5 : 1} className={i === 0 ? undefined : 'stroke-neutral-600'} strokeWidth={0.6} />
            <text x={x + w / 2} y={138.5} fontSize={5} textAnchor="middle" className="fill-neutral-100" style={{ fontFamily: 'inherit' }} {...fit(t, 5, w - 4)}>
              {t}
            </text>
          </g>
        )
      })}
      <rect x={18} y={150} width={174} height={14} rx={3} fill={red} />
      <text x={105} y={159.5} fontSize={6.5} textAnchor="middle" fill="#fff" fontWeight={700} style={{ fontFamily: 'inherit' }}>
        {tt('Kaydet')}
      </text>
      <Pin x={196} y={128} n={3} />
      <text x={214} y={84} fontSize={5.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Önceki turlar')}
      </text>
      <text x={214} y={96} fontSize={5.5} className="fill-neutral-300" style={{ fontFamily: 'inherit' }} {...fit(tt('2019 · 22/23 yapım · 95 gün'), 5.5, 98)}>
        {tt('2019 · 22/23 yapım · 95 gün')}
      </text>
    </Frame>
  )
}

export function EvrenEkleVisual() {
  const purple = '#a855f7'
  return (
    <Frame viewBox={VB}>
      {[0, 1, 2].map((i) => {
        const x = 10 + i * 34
        return (
          <g key={i}>
            <rect x={x} y={14} width={30} height={45} rx={3} className="fill-neutral-700" />
            {i === 0 && <circle cx={x + 25} cy={19} r={3.5} fill="#e23636" />}
            <Line x={x} y={66} w={26} light />
            <rect x={x} y={74} width={30} height={9} rx={2} fill={i === 0 ? '#e2363640' : 'none'} className={i === 0 ? undefined : 'stroke-neutral-600'} strokeWidth={0.6} />
            <text x={x + 15} y={80.5} fontSize={4.6} textAnchor="middle" className="fill-neutral-100" style={{ fontFamily: 'inherit' }} {...fit(i === 0 ? tt('✓ 3 Kas') : tt('✓ İzledim'), 4.6, 26)}>
              {i === 0 ? tt('✓ 3 Kas') : tt('✓ İzledim')}
            </text>
          </g>
        )
      })}
      <Pin x={108} y={74} n={1} />
      <Box x={10} y={94} w={302} h={80} r={6} strong />
      <rect x={16} y={100} width={180} height={11} rx={2.5} fill="none" className="stroke-neutral-600" strokeWidth={0.6} />
      <text x={20} y={107.5} fontSize={5.5} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>annabelle</text>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={16 + i * 36} y={115} width={32} height={40} rx={2.5} className="fill-neutral-700" stroke={i < 2 ? purple : 'none'} strokeWidth={1} />
          <rect x={16 + i * 36} y={159} width={32} height={8} rx={2} fill={i < 2 ? purple : 'none'} className={i < 2 ? undefined : 'stroke-neutral-600'} strokeWidth={0.6} />
          <text x={32 + i * 36} y={165} fontSize={4.6} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit' }}>
            {i < 2 ? tt('✓ Eklendi') : tt('+ Ekle')}
          </text>
        </g>
      ))}
      <rect x={202} y={98} width={0.6} height={72} className="fill-neutral-700" />
      <text x={208} y={107} fontSize={6} fontWeight={700} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        {tt('Sıra (3 yapım)')}
      </text>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={208} y={113 + i * 18} width={98} height={15} rx={3} className="fill-neutral-800" />
          <text x={213} y={123 + i * 18} fontSize={5.5} fontWeight={700} fill={purple} style={{ fontFamily: 'inherit' }}>
            {i + 1}
          </text>
          <Line x={222} y={119 + i * 18} w={50} light />
          <text x={282} y={123 + i * 18} fontSize={5.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
            ↑ ↓ ✕
          </text>
        </g>
      ))}
      <Pin x={196} y={96} n={2} />
    </Frame>
  )
}

// ---- v1.19.4 ---------------------------------------------------------------------------------

export function OnceVisual() {
  const red = '#e23636'
  const rows = [
    { lv: tt('Doğrudan gerekli'), items: [tt('WandaVision'), tt('Agatha')], y: 34 },
    { lv: tt('Onları anlamak için'), items: [tt('Endgame'), tt('Ultron Çağı')], y: 82 },
    { lv: tt('Daha geriye'), items: [tt('Sonsuzluk Savaşı'), tt('Kaptan Marvel')], y: 130 },
  ]
  return (
    <Frame viewBox={VB}>
      <Label x={10} y={16} size={8.5}>
        {tt('VisionQuest izlemeden önce')}
      </Label>
      <Pin x={150} y={6} n={1} />
      {rows.map((r, i) => (
        <g key={i}>
          <text x={10} y={r.y} fontSize={6.5} fontWeight={700} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
            {r.lv}
          </text>
          {r.items.map((t, j) => (
            <g key={j}>
              <rect x={10} y={r.y + 5 + j * 18} width={9} height={14} rx={1.5} className="fill-neutral-700" />
              <text x={24} y={r.y + 15 + j * 18} fontSize={6} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
                {t}
              </text>
              {j === 0 && i > 0 && (
                <g>
                  <rect x={150} y={r.y + 6 + j * 18} width={34} height={10} rx={5} fill={red} opacity={0.3} />
                  <text x={167} y={r.y + 13 + j * 18} fontSize={5} textAnchor="middle" className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
                    {tt('✓ izledin')}
                  </text>
                </g>
              )}
            </g>
          ))}
        </g>
      ))}
      <Pin x={196} y={28} n={2} />
      <rect x={210} y={140} width={102} height={18} rx={4} fill={red} />
      <text x={261} y={151.5} fontSize={6} textAnchor="middle" fill="#fff" fontWeight={700} style={{ fontFamily: 'inherit' }} {...fit(tt('Bu listeyle tur başlat'), 6, 96)}>
        {tt('Bu listeyle tur başlat')}
      </text>
      <rect x={210} y={118} width={102} height={16} rx={4} fill="none" className="stroke-neutral-600" strokeWidth={0.6} />
      <text x={261} y={128.5} fontSize={6} textAnchor="middle" className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {tt('Kısa tur')}
      </text>
      <Pin x={206} y={112} n={3} />
    </Frame>
  )
}

export function AbonelikVisual() {
  const ps = [
    { n: 'Netflix', c: '#e50914', w: 0.85, t: tt('102 yapım · 639 saat') },
    { n: 'Disney+', c: '#113ccf', w: 0.35, t: tt('54 yapım · 209 saat') },
    { n: 'HBO Max', c: '#5b2be0', w: 0.12, t: tt('14 yapım · 40 saat') },
  ]
  return (
    <Frame viewBox={VB}>
      <Label x={10} y={16} size={8.5}>
        {tt('Hangi aboneliği almalıyım?')}
      </Label>
      <Box x={8} y={24} w={304} h={40} r={6} strong />
      <rect x={16} y={30} width={28} height={28} rx={6} fill="#e50914" />
      <text x={30} y={49} fontSize={14} fontWeight={900} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit' }}>N</text>
      <text x={52} y={42} fontSize={8.5} fontWeight={800} className="fill-neutral-50" style={{ fontFamily: 'inherit' }}>
        {tt('Bu ay Netflix al')}
      </text>
      <text x={52} y={55} fontSize={5.5} className="fill-neutral-400" style={{ fontFamily: 'inherit' }} {...fit(tt('Netflix ve Disney+ birlikte: 153 yapım'), 5.5, 200)}>
        {tt('Netflix ve Disney+ birlikte: 153 yapım')}
      </text>
      <Pin x={300} y={26} n={1} />
      <Pin x={256} y={50} n={2} />
      {ps.map((p, i) => {
        const y = 72 + i * 34
        return (
          <g key={i}>
            <Box x={8} y={y} w={304} h={30} r={5} />
            <rect x={14} y={y + 6} width={18} height={18} rx={4} fill={p.c} />
            <text x={38} y={y + 13} fontSize={6.5} fontWeight={700} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>{p.n}</text>
            <text x={38} y={y + 22} fontSize={5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>{p.t}</text>
            <rect x={120} y={y + 13} width={110} height={3} rx={1.5} className="fill-neutral-800" />
            <rect x={120} y={y + 13} width={110 * p.w} height={3} rx={1.5} className="fill-neutral-300" />
            {[0, 1, 2, 3].map((j) => (
              <rect key={j} x={238 + j * 18} y={y + 5} width={14} height={20} rx={1.5} className="fill-neutral-700" />
            ))}
          </g>
        )
      })}
      <Pin x={232} y={70} n={3} />
    </Frame>
  )
}

export function AraVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={8} y={10} width={304} height={110} rx={7} fill="#f59e0b" opacity={0.06} stroke="#f59e0b" strokeOpacity={0.35} strokeWidth={0.8} />
      <text x={16} y={26} fontSize={8} fontWeight={800} className="fill-neutral-50" style={{ fontFamily: 'inherit' }}>
        {tt('Uzun ara verdin')}
      </text>
      <text x={16} y={38} fontSize={5.8} className="fill-neutral-300" style={{ fontFamily: 'inherit' }} {...fit(tt('Son bölümü 56 gün önce izledin. Kaldığın yer: 1. Sezon 6. Bölüm'), 5.8, 220)}>
        {tt('Son bölümü 56 gün önce izledin. Kaldığın yer: 1. Sezon 6. Bölüm')}
      </text>
      <Pin x={240} y={22} n={1} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={16} y={48 + i * 23} width={34} height={19} rx={2} className="fill-neutral-700" />
          <text x={56} y={55 + i * 23} fontSize={5.8} fontWeight={700} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
            {tt('1. Sezon {0}. Bölüm', 3 + i)}
          </text>
          <Line x={56} y={62 + i * 23} w={200} light />
        </g>
      ))}
      <Pin x={296} y={48} n={2} />
      <text x={10} y={140} fontSize={7} fontWeight={700} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        {tt('Bölümler')}
      </text>
      {[0, 1].map((i) => (
        <g key={i}>
          <rect x={10} y={148 + i * 14} width={10} height={10} rx={2} className="fill-neutral-700" />
          <Line x={26} y={153 + i * 14} w={180} light />
        </g>
      ))}
    </Frame>
  )
}

// v1.20: "Artık izlenebilir" haberleri zilde tek grup; tıklayınca hepsi ayrı ayrı
export function BildirimGrupVisual() {
  const subs: [string, string][] = [
    [tt('Bıçaklar Çekildi'), tt('Artık şu platformda: Netflix')],
    [tt('Açlık Oyunları'), tt('Artık şu platformda: Disney+')],
    ['Dune', tt('Artık şu platformda: HBO Max')],
  ]
  return (
    <Frame viewBox={VB}>
      <Box x={60} y={10} w={200} h={160} r={8} strong />
      <Label x={72} y={27} size={7}>{tt('Bildirimler')}</Label>
      <rect x={70} y={36} width={180} height={34} rx={5} className="fill-neutral-800" />
      <circle cx={85} cy={53} r={8} fill="#8b5cf6" fillOpacity={0.25} />
      <text x={85} y={56} fontSize={8} textAnchor="middle" style={{ fontFamily: 'inherit' }}>
        📺
      </text>
      <text x={98} y={50} fontSize={6.5} className="fill-neutral-100" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('{0} içerik artık izlenebilir', 3)}
      </text>
      <text x={98} y={61} fontSize={5.8} className="fill-neutral-400" style={{ fontFamily: 'inherit' }} {...fit(tt('Bıçaklar Çekildi, Açlık Oyunları, Dune'), 5.8, 130)}>
        {tt('Bıçaklar Çekildi, Açlık Oyunları, Dune')}
      </text>
      <text x={240} y={56} fontSize={8} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        ⌄
      </text>
      <Pin x={262} y={53} n={1} />
      {subs.map(([title, text], i) => (
        <g key={i}>
          <text x={98} y={86 + i * 26} fontSize={6.3} className="fill-neutral-200" style={{ fontFamily: 'inherit' }} {...fit(title, 6.3, 140)}>
            {title}
          </text>
          <text x={98} y={96 + i * 26} fontSize={5.6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }} {...fit(text, 5.6, 140)}>
            {text}
          </text>
        </g>
      ))}
      <Pin x={262} y={112} n={2} />
    </Frame>
  )
}

// v1.20: Takvim'de sezonlar alt satıra sarılır; arşiv tablosunda dizinin izleme tarihi = en son bölüm tarihi
export function SezonTarihVisual() {
  return (
    <Frame viewBox={VB}>
      <Label x={10} y={20} size={7}>{tt('Bu gün hangi bölümleri izledin?')}</Label>
      {Array.from({ length: 8 }, (_, i) => {
        const x = 10 + (i % 5) * 46
        const y = 30 + Math.floor(i / 5) * 20
        return (
          <g key={i}>
            <rect x={x} y={y} width={42} height={14} rx={7} className={i === 6 ? 'fill-neutral-800' : 'fill-none'} stroke={i === 6 ? ACCENT : '#525252'} strokeWidth={0.8} />
            <text x={x + 21} y={y + 9.5} fontSize={5.8} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
              {tt('{0}. sezon', i + 1)}
            </text>
          </g>
        )
      })}
      <Pin x={250} y={57} n={1} />
      <Box x={10} y={92} w={300} h={78} r={6} />
      <text x={20} y={106} fontSize={6} className="fill-neutral-500" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('Ad')}
      </text>
      <text x={190} y={106} fontSize={6} className="fill-neutral-500" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('İzleme Tarihi')}
      </text>
      {[
        ['Breaking Bad', '08.11.2026'],
        ['Dark', '02.11.2026'],
        ['Dune', '14.10.2026'],
      ].map(([name, d], i) => (
        <g key={i}>
          <line x1={14} x2={306} y1={112 + i * 19} y2={112 + i * 19} stroke="#404040" strokeWidth={0.5} />
          <text x={20} y={125 + i * 19} fontSize={6.3} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
            {name}
          </text>
          <text x={190} y={125 + i * 19} fontSize={6.3} className={i < 2 ? 'fill-neutral-50' : 'fill-neutral-400'} style={{ fontFamily: 'inherit' }}>
            {d}
          </text>
        </g>
      ))}
      <Pin x={262} y={122} n={2} />
    </Frame>
  )
}

// v1.20.1: sezonu izlendi yaparken tarih menüsü
export function SezonNeZamanVisual() {
  const opts = [tt('Bugün'), tt('Bir gün seç'), tt('Yılı (ör. 2019)'), tt('Ne zaman izlediğimi hatırlamıyorum')]
  return (
    <Frame viewBox={VB}>
      {[1, 2, 3].map((n, i) => (
        <g key={n}>
          <rect x={10 + i * 50} y={14} width={44} height={14} rx={7} className={i === 1 ? 'fill-neutral-800' : 'fill-none'} stroke={i === 1 ? ACCENT : '#525252'} strokeWidth={0.8} />
          <text x={32 + i * 50} y={23.5} fontSize={5.8} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
            {tt('{0}. sezon', n)}
          </text>
        </g>
      ))}
      <rect x={286} y={12} width={18} height={18} rx={4} className="fill-none" stroke={ACCENT} strokeWidth={0.9} />
      <path d="M290 21l3 3 6-6" fill="none" stroke={ACCENT} strokeWidth={1.2} strokeLinecap="round" />
      <Pin x={276} y={14} n={1} />
      <Box x={150} y={38} w={160} h={128} r={6} />
      <text x={160} y={54} fontSize={5.5} className="fill-neutral-500" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('NE ZAMAN İZLEDİN?')}
      </text>
      {opts.map((t, i) => (
        <g key={i}>
          <rect x={156} y={62 + i * 25} width={148} height={20} rx={4} className={i === 3 ? 'fill-neutral-800' : 'fill-none'} stroke={i === 3 ? ACCENT : '#404040'} strokeWidth={0.6} />
          <text x={162} y={74.5 + i * 25} fontSize={6.2} className="fill-neutral-200" style={{ fontFamily: 'inherit' }} {...fit(t, 6.2, 136)}>
            {t}
          </text>
        </g>
      ))}
      <Pin x={300} y={140} n={2} />
      <Label x={10} y={60} size={6.5}>{tt('Hatırlamıyorsan')}</Label>
      <Label x={10} y={72} size={6.5}>{tt('takvimde bir güne düşmez')}</Label>
    </Frame>
  )
}

// v1.21 — bilgisayarda Netflix'teki gibi "Kim izliyor?": arkada yapım görseli, sol altta logosu, ortada profiller
export function KimIzliyorPcVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={8} y={8} width={304} height={164} rx={5} className="fill-neutral-800" />
      <path d="M150 20 L230 20 L255 120 L130 120 Z" className="fill-neutral-700" opacity={0.7} />
      <rect x={8} y={100} width={304} height={72} rx={5} fill="#000" opacity={0.35} />
      <text x={18} y={21} fontSize={9} fill={ACCENT} style={{ fontFamily: 'inherit', fontWeight: 800 }}>
        ARGUS
      </text>
      <text x={160} y={108} fontSize={9} textAnchor="middle" className="fill-neutral-100" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
        {tt('Kim izliyor?')}
      </text>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={101 + i * 31} y={115} width={25} height={25} rx={3} className={i === 3 ? 'fill-none' : 'fill-neutral-500'} stroke={i === 3 ? '#a3a3a3' : 'none'} strokeDasharray={i === 3 ? '2 1.5' : undefined} strokeWidth={0.7} />
          <rect x={104 + i * 31} y={144} width={19} height={3} rx={1.5} className="fill-neutral-400" />
        </g>
      ))}
      <rect x={136} y={152} width={48} height={11} rx={5.5} className="fill-none" stroke="#e5e5e5" strokeWidth={0.7} />
      <text x={160} y={159.5} fontSize={5.2} textAnchor="middle" className="fill-neutral-100" style={{ fontFamily: 'inherit', fontWeight: 600 }} {...fit(tt('Profil Yönetimi'), 5.2, 42)}>
        {tt('Profil Yönetimi')}
      </text>
      <rect x={18} y={140} width={50} height={14} rx={2} fill={ACCENT} opacity={0.85} />
      <rect x={18} y={158} width={40} height={3.5} rx={1.5} className="fill-neutral-300" />
      <Pin x={150} y={30} n={1} />
      <Pin x={74} y={140} n={2} />
      <Pin x={226} y={120} n={3} />
    </Frame>
  )
}

// v1.21 — detay penceresi yapımın görselinin rengine bürünür
export function DetayRenkVisual() {
  return (
    <Frame viewBox={VB}>
      <defs>
        <linearGradient id="detayRenk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2a4a" />
          <stop offset="0.6" stopColor="#16223a" />
          <stop offset="1" stopColor="#171717" />
        </linearGradient>
      </defs>
      <rect x={40} y={10} width={240} height={160} rx={10} fill="url(#detayRenk)" stroke="#404040" strokeWidth={0.6} />
      <rect x={40} y={10} width={240} height={70} rx={10} fill="#2c4470" opacity={0.6} />
      <rect x={56} y={58} width={40} height={60} rx={4} className="fill-neutral-600" />
      <rect x={104} y={92} width={80} height={12} rx={2} className="fill-neutral-300" />
      <rect x={104} y={109} width={50} height={6} rx={3} fill="#f5b400" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={56} y={128 + i * 10} width={150 - i * 30} height={4} rx={2} className="fill-neutral-500" />
      ))}
      <rect x={216} y={126} width={52} height={34} rx={5} fill="none" stroke="#3b4c6e" strokeWidth={0.7} />
      <Pin x={270} y={28} n={1} />
      <Pin x={30} y={150} n={2} />
    </Frame>
  )
}

// v1.21 — yüklenirken iskelet kartlar, boş sayfada çizim + düğme
export function IskeletBosVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={10} y={14} w={145} h={152} r={6} />
      <rect x={20} y={24} width={125} height={50} rx={4} className="fill-neutral-800" />
      {[0, 1].map((r) =>
        [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={20 + c * 32} y={84 + r * 38} width={28} height={30} rx={3} className="fill-neutral-800" />),
      )}
      <Pin x={150} y={18} n={1} />
      <Box x={165} y={14} w={145} h={152} r={6} />
      <circle cx={237} cy={58} r={22} className="fill-neutral-800" />
      <path d="M232 49l14 9-14 9z" fill={ACCENT} />
      <rect x={197} y={90} width={80} height={7} rx={2} className="fill-neutral-300" />
      <rect x={187} y={103} width={100} height={4} rx={2} className="fill-neutral-600" />
      <rect x={202} y={111} width={70} height={4} rx={2} className="fill-neutral-600" />
      <MiniButton x={207} y={126} w={60} text={tt('İlk yapımını ekle')} accent />
      <Pin x={302} y={130} n={2} />
    </Frame>
  )
}

// v1.21 — "?" ile klavye kısayolları
export function KisayolVisual() {
  const rows: [string, string[]][] = [
    [tt('Arama'), ['/']],
    [tt('Açık pencereyi kapat'), ['Esc']],
    [tt('Profil seç'), ['1', '2', '3']],
    [tt('Bu listeyi aç / kapat'), ['?']],
  ]
  return (
    <Frame viewBox={VB}>
      <Box x={70} y={18} w={180} h={144} r={8} strong />
      <text x={84} y={38} fontSize={8} className="fill-neutral-100" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
        {tt('Klavye kısayolları')}
      </text>
      {rows.map(([label, keys], i) => (
        <g key={i}>
          <text x={84} y={62 + i * 26} fontSize={6.5} className="fill-neutral-300" style={{ fontFamily: 'inherit' }} {...fit(label, 6.5, 90)}>
            {label}
          </text>
          {keys.map((k, j) => (
            <g key={k}>
              <rect x={236 - (keys.length - j) * 17} y={52 + i * 26} width={14} height={14} rx={3} className="fill-neutral-800" stroke={i === 3 ? ACCENT : '#525252'} strokeWidth={0.7} />
              <text x={243 - (keys.length - j) * 17} y={61.5 + i * 26} fontSize={6} textAnchor="middle" className="fill-neutral-100" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
                {k}
              </text>
            </g>
          ))}
        </g>
      ))}
      <Pin x={262} y={132} n={1} />
    </Frame>
  )
}

// v1.21.1 — emojiler yerine ARGUS'un kendi dolgulu ikonları
export function IkonlarVisual() {
  const icons: IconName[] = ['star', 'play', 'pause', 'clapper', 'calendar', 'tv', 'film', 'volume', 'search', 'pencil', 'bulb', 'flame']
  return (
    <Frame viewBox={VB}>
      <text x={20} y={30} fontSize={7} className="fill-neutral-500" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('ÖNCE')}
      </text>
      <text x={20} y={56} fontSize={18} style={{ fontFamily: 'Segoe UI Emoji, Apple Color Emoji, sans-serif' }}>
        ⭐ ▶️ ⏸ 🎬 📅 📺
      </text>
      <path d="M150 74 l12 10 -12 10" fill="none" stroke={ACCENT} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <text x={20} y={104} fontSize={7} className="fill-neutral-500" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('ŞİMDİ')}
      </text>
      {icons.map((n, i) => (
        <g key={n} transform={`translate(${20 + (i % 6) * 48} ${112 + Math.floor(i / 6) * 30})`}>
          <rect width={40} height={24} rx={6} className="fill-neutral-800" />
          <svg x={10} y={2} width={20} height={20} style={{ color: i % 3 === 0 ? ACCENT : '#e5e5e5' }}>
            <Icon name={n} className="h-full w-full" style={{ verticalAlign: 'top' }} />
          </svg>
        </g>
      ))}
      <Pin x={300} y={110} n={1} />
    </Frame>
  )
}

// v1.21.1 — yeni yazı tipi, ince kaydırma çubuğu, klavye çerçevesi, tek tip düğmeler
export function ArayuzCilaVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={10} y={12} w={270} h={156} r={8} />
      <text x={24} y={52} fontSize={30} className="fill-neutral-100" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800 }}>
        Aa
      </text>
      <text x={24} y={68} fontSize={7} className="fill-neutral-400" style={{ fontFamily: 'Inter, sans-serif' }}>
        Inter · ğ ş ı İ ç ö ü
      </text>
      <Pin x={80} y={30} n={1} />
      <rect x={120} y={30} width={60} height={16} rx={4} fill="none" stroke={ACCENT} strokeWidth={1.2} />
      <text x={150} y={41} fontSize={6.5} textAnchor="middle" className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {tt('Diziler')}
      </text>
      <Pin x={188} y={30} n={2} />
      {[0, 1, 2].map((i) => (
        <MiniButton key={i} x={24 + i * 66} y={100} w={58} text={[tt('Kaydet'), tt('Vazgeç'), tt('Düzenle')][i]} accent={i === 0} />
      ))}
      <Pin x={226} y={98} n={3} />
      <rect x={24} y={128} width={240} height={26} rx={6} className="fill-neutral-800" />
      <rect x={24} y={128} width={240} height={26} rx={6} fill={ACCENT} opacity={0.12} />
      <Pin x={256} y={124} n={4} />
      <rect x={292} y={12} width={18} height={156} rx={4} className="fill-neutral-900" />
      <rect x={298} y={30} width={6} height={44} rx={3} className="fill-neutral-600" />
      <Pin x={300} y={86} n={5} />
    </Frame>
  )
}

// v1.21.2 — oynatılamayan fragman yerine sıradaki fragman ya da kapak görseli
export function FragmanYedekVisual() {
  return (
    <Frame viewBox={VB}>
      <text x={14} y={22} fontSize={7} className="fill-neutral-500" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('ÖNCE')}
      </text>
      <rect x={14} y={30} width={134} height={76} rx={6} className="fill-neutral-900" stroke="#525252" strokeWidth={0.7} />
      <circle cx={81} cy={58} r={8} fill="none" stroke="#a3a3a3" strokeWidth={1.4} />
      <path d="M81 53.5 v5.5 M81 62 v0.6" stroke="#a3a3a3" strokeWidth={1.6} strokeLinecap="round" />
      <text x={81} y={80} fontSize={6.5} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('Video kullanılamıyor')}
      </text>
      <path d="M150 68 l10 0 M156 63 l5 5 -5 5" fill="none" stroke={ACCENT} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <text x={170} y={22} fontSize={7} className="fill-neutral-500" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('ŞİMDİ')}
      </text>
      <Box x={170} y={30} w={136} h={76} r={6} strong />
      <path d="M232 58 l14 9 -14 9 z" fill={ACCENT} />
      <text x={238} y={98} fontSize={6} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('sıradaki fragman')}
      </text>
      <Pin x={300} y={36} n={1} />
      <rect x={170} y={116} width={136} height={54} rx={6} className="fill-neutral-800" />
      <rect x={170} y={116} width={136} height={54} rx={6} fill={ACCENT} opacity={0.1} />
      <text x={238} y={146} fontSize={6.5} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('yedek yoksa kapak görseli')}
      </text>
      <Pin x={300} y={122} n={2} />
    </Frame>
  )
}

// v1.21.3 — MCU'ya Marvel Television dizileri (S.H.I.E.L.D., Agent Carter…) yan yapım olarak eklendi
export function MarvelTvVisual() {
  const cards: [string, boolean][] = [
    ['Captain America', false],
    ['Agent Carter', true],
    ['Kış Askeri', false],
    ['S.H.I.E.L.D. 1', true],
    ['Ultron', false],
  ]
  return (
    <Frame viewBox={VB}>
      <text x={16} y={26} fontSize={7} className="fill-neutral-400" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('Hikâye sırası')}
      </text>
      {cards.map(([name, extra], i) => (
        <g key={i} transform={`translate(${16 + i * 60} 36)`}>
          <rect width={52} height={78} rx={5} className="fill-neutral-800" stroke={extra ? ACCENT : '#404040'} strokeWidth={extra ? 1.2 : 0.7} />
          {extra && (
            <g>
              <rect x={30} y={4} width={18} height={10} rx={2} fill="rgba(0,0,0,0.75)" />
              <text x={39} y={11.5} fontSize={5.5} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
                {tt('yan')}
              </text>
            </g>
          )}
          <text x={26} y={92} fontSize={5.5} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
            {name}
          </text>
        </g>
      ))}
      <Pin x={150} y={40} n={1} />
      <rect x={16} y={140} width={150} height={20} rx={10} className="fill-neutral-800" stroke={ACCENT} strokeWidth={0.8} />
      <text x={91} y={153} fontSize={6.5} textAnchor="middle" className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {tt('Yan yapımlar ({0})', 31)}
      </text>
      <Pin x={172} y={142} n={2} />
    </Frame>
  )
}

// v1.21.4 — "atlanabilir" işareti, yarıda kalan yapım turda sıradaki, detayda evren düğmesi ve tam çıkış tarihi
export function EvrenDetayVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={14} y={18} width={52} height={78} rx={5} className="fill-neutral-800" stroke={ACCENT} strokeWidth={1.4} />
      <rect x={18} y={84} width={26} height={9} rx={2} fill={ACCENT} />
      <text x={31} y={90.5} fontSize={5} textAnchor="middle" fill="#0a0a0a" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
        {tt('Sıradaki')}
      </text>
      <text x={14} y={106} fontSize={6} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('İzleniyor')}
      </text>
      <Pin x={70} y={22} n={1} />
      <rect x={86} y={18} width={52} height={78} rx={5} className="fill-neutral-800" stroke="#404040" strokeWidth={0.7} />
      <rect x={104} y={84} width={31} height={9} rx={2} fill="rgba(0,0,0,0.75)" />
      <text x={119.5} y={90.5} fontSize={5} textAnchor="middle" fill="#fcd34d" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('atlanabilir')}
      </text>
      <Pin x={142} y={22} n={2} />
      <Box x={160} y={18} w={150} h={144} r={8} strong />
      <rect x={172} y={30} width={40} height={58} rx={4} className="fill-neutral-700" />
      <rect x={220} y={56} width={70} height={8} rx={2} className="fill-neutral-600" />
      <rect x={220} y={72} width={52} height={12} rx={6} fill="none" stroke="#737373" strokeWidth={0.7} />
      <text x={246} y={80.5} fontSize={5.5} textAnchor="middle" className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {tt('12 Haziran 2008')}
      </text>
      <Pin x={274} y={70} n={3} />
      <rect x={220} y={90} width={34} height={12} rx={6} fill="none" stroke="#e23636" strokeWidth={0.9} />
      <circle cx={228} cy={96} r={2.6} fill="#e23636" />
      <text x={240} y={98.5} fontSize={5.5} textAnchor="middle" className="fill-neutral-100" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        MCU
      </text>
      <Pin x={258} y={88} n={4} />
      <rect x={172} y={112} width={126} height={6} rx={2} className="fill-neutral-700" />
      <rect x={172} y={124} width={100} height={6} rx={2} className="fill-neutral-700" />
    </Frame>
  )
}

// v1.21.5 — MCU'ya Sony Spider-Man, Fox Marvel ve One-Shot filmleri
export function MarvelFilmleriVisual() {
  const groups: [string, number, number][] = [
    [tt('Sony Spider-Man filmleri'), 5, 6],
    [tt('Fox Marvel filmleri (X-Men, Deadpool, Blade…)'), 7, 12],
    [tt('Marvel One-Shot kısa filmleri'), 0, 5],
  ]
  return (
    <Frame viewBox={VB}>
      {groups.map(([name, req, opt], g) => (
        <g key={g} transform={`translate(14 ${14 + g * 54})`}>
          <text x={0} y={8} fontSize={7} className="fill-neutral-200" style={{ fontFamily: 'inherit', fontWeight: 700 }} {...fit(name, 7, 230)}>
            {name}
          </text>
          {Array.from({ length: Math.min(req + opt, 9) }, (_, i) => {
            const skip = i >= req
            return (
              <g key={i} transform={`translate(${i * 32} 14)`}>
                <rect width={26} height={34} rx={3} className="fill-neutral-800" stroke={skip ? '#404040' : ACCENT} strokeWidth={skip ? 0.6 : 1} />
                {skip && <rect x={4} y={27} width={18} height={5} rx={1} fill="rgba(0,0,0,0.75)" />}
                {skip && <rect x={6} y={28.6} width={14} height={1.8} rx={0.9} fill="#fcd34d" />}
              </g>
            )
          })}
        </g>
      ))}
      <Pin x={300} y={30} n={1} />
      <Pin x={300} y={84} n={2} />
      <Pin x={300} y={138} n={3} />
    </Frame>
  )
}

// v1.22 — Evrenler her hafta TMDB'den kendiliğinden güncelleniyor
export function EvrenOtoVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={12} y={14} w={180} h={40} r={8} />
      <text x={24} y={31} fontSize={6.5} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('Her hafta TMDB\'den kendiliğinden')}
      </text>
      <text x={24} y={44} fontSize={6.5} fill={ACCENT} style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('Şimdi kontrol et')}
      </text>
      <Pin x={186} y={18} n={1} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${12 + i * 46} 66)`}>
          <rect width={38} height={56} rx={4} className="fill-neutral-800" stroke={i === 3 ? ACCENT : '#404040'} strokeWidth={i === 3 ? 1.3 : 0.6} strokeDasharray={i >= 2 ? '3 2' : undefined} />
        </g>
      ))}
      <text x={150} y={132} fontSize={6} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        Black Panther 3
      </text>
      <Pin x={194} y={70} n={2} />
      <Box x={214} y={14} w={96} h={60} r={8} strong />
      <circle cx={228} cy={30} r={6} fill={ACCENT} opacity={0.2} />
      <rect x={240} y={26} width={60} height={5} rx={2} className="fill-neutral-500" />
      <rect x={240} y={36} width={46} height={4} rx={2} className="fill-neutral-700" />
      <rect x={224} y={50} width={76} height={4} rx={2} className="fill-neutral-700" />
      <Pin x={304} y={18} n={3} />
      <Box x={214} y={86} w={96} h={40} r={8} />
      <text x={224} y={102} fontSize={6} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('Atla (izlemeden geç)')}
      </text>
      <text x={224} y={116} fontSize={6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Listeden çıkar (yanlış eklendi)')}
      </text>
      <Pin x={304} y={90} n={4} />
    </Frame>
  )
}

// v1.23 Aklımda: detayda "Aklımda tut", ana sayfada "Aklında kalanlar", Aklımda sayfasında süzgeçler
export function AklimdaVisual() {
  const VIOLET = '#a78bfa'
  return (
    <Frame viewBox={VB}>
      <Box x={12} y={14} w={150} h={112} r={8} />
      <rect x={12} y={14} width={150} height={44} rx={8} className="fill-neutral-800" />
      <rect x={22} y={64} width={70} height={7} rx={2} className="fill-neutral-400" />
      <rect x={22} y={80} width={46} height={14} rx={7} fill={VIOLET} opacity={0.25} stroke={VIOLET} strokeWidth={0.8} />
      <path d="M28 83.5h4c.4 0 .7.3.7.7v6.4l-2.7-1.8-2.7 1.8v-6.4c0-.4.3-.7.7-.7z" fill={VIOLET} />
      <text x={36} y={90} fontSize={6} fill={VIOLET} style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('Aklımda')}
      </text>
      <Pin x={66} y={78} n={1} />

      <text x={176} y={24} fontSize={7} className="fill-neutral-200" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
        {tt('Aklında kalanlar')}
      </text>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${176 + i * 44} 32)`}>
          <rect width={36} height={52} rx={4} className="fill-neutral-800" stroke={i === 0 ? VIOLET : '#404040'} strokeWidth={i === 0 ? 1.2 : 0.6} />
          <rect x={3} y={3} width={18} height={6} rx={1.5} fill={i === 1 ? '#fbbf24' : i === 2 ? '#8b5cf6' : ACCENT} />
          <rect x={0} y={57} width={30} height={3.5} rx={1.5} className="fill-neutral-500" />
          <rect x={0} y={64} width={24} height={3} rx={1.5} className="fill-neutral-700" />
        </g>
      ))}
      <Pin x={306} y={30} n={2} />

      <Box x={176} y={110} w={134} h={22} r={11} />
      {[tt('Hepsi'), tt('İzlenecek'), tt('Yarım kalan')].map((t, i) => (
        <text key={t} x={186 + i * 40} y={124} fontSize={5.6} fill={i === 0 ? ACCENT : undefined} className={i === 0 ? '' : 'fill-neutral-400'} style={{ fontFamily: 'inherit', fontWeight: i === 0 ? 600 : 400 }}>
          {t}
        </text>
      ))}
      <Pin x={306} y={112} n={3} />
    </Frame>
  )
}

// ---- v1.23.1 -------------------------------------------------------------------------------

export function KaldiginYerVisual() {
  return (
    <Frame viewBox={VB}>
      <Box x={12} y={22} w={150} h={96} r={8} />
      <text x={22} y={38} fontSize={7} className="fill-neutral-200" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
        {tt('İzleme')}
      </text>
      <text x={22} y={54} fontSize={5.6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('Kaldığın yer')}
      </text>
      <text x={22} y={67} fontSize={8} className="fill-neutral-100" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        1:12:30
      </text>
      <text x={58} y={67} fontSize={6.5} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        / 2:15:00
      </text>
      <rect x={22} y={73} width={130} height={3.5} rx={1.75} className="fill-neutral-800" />
      <rect x={22} y={73} width={70} height={3.5} rx={1.75} fill={ACCENT} />
      <Pin x={150} y={50} n={1} />
      <text x={22} y={94} fontSize={5.6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
        {tt('İzlediğin tarih')}
      </text>
      <rect x={22} y={99} width={62} height={12} rx={3} className="fill-neutral-800" />
      <text x={53} y={107.5} fontSize={6} textAnchor="middle" className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        09.11 → 12.11
      </text>

      <text x={184} y={40} fontSize={6.5} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('9 Kasım: yarıda kaldı')}
      </text>
      <text x={184} y={60} fontSize={6.5} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
        {tt('12 Kasım: devam, bitti')}
      </text>
      <rect x={184} y={76} width={110} height={16} rx={4} fill={ACCENT} opacity={0.2} stroke={ACCENT} strokeWidth={0.8} />
      <text x={239} y={87} fontSize={6.5} textAnchor="middle" fill={ACCENT} style={{ fontFamily: 'inherit', fontWeight: 600 }}>
        {tt('Tek izleme: 09.11 → 12.11')}
      </text>
      <Pin x={300} y={74} n={2} />
    </Frame>
  )
}

// ---- v1.23.2 -------------------------------------------------------------------------------

export function FazsizVisual() {
  const cards: { year: string; yan?: boolean; atla?: boolean }[] = [
    { year: '1998', yan: true, atla: true },
    { year: '2008' },
    { year: '2008' },
    { year: '2009', yan: true, atla: true },
    { year: '2010' },
    { year: '2012', yan: true },
  ]
  return (
    <Frame viewBox={VB}>
      {cards.map((c, i) => (
        <g key={i} transform={`translate(${14 + i * 50} 40)`}>
          <rect width={42} height={63} rx={4} className="fill-neutral-800" stroke={c.yan ? ACCENT : '#404040'} strokeWidth={c.yan ? 1 : 0.6} />
          {c.yan && (
            <g>
              <rect x={22} y={3} width={17} height={9} rx={2} fill="#000" opacity={0.75} />
              <text x={30.5} y={9.5} fontSize={5.5} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit', fontWeight: 600 }}>
                {tt('yan')}
              </text>
            </g>
          )}
          {c.atla && (
            <text x={21} y={58} fontSize={5} textAnchor="middle" fill="#fbbf24" style={{ fontFamily: 'inherit' }} {...fit(tt('atlanabilir'), 5, 38)}>
              {tt('atlanabilir')}
            </text>
          )}
          <text x={21} y={74} fontSize={6} textAnchor="middle" className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
            {c.year}
          </text>
        </g>
      ))}
      <text x={14} y={26} fontSize={7} className="fill-neutral-200" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
        {tt('Çıkış sırası · tek liste')}
      </text>
      <Pin x={306} y={36} n={1} />
      <Pin x={60} y={36} n={2} />
    </Frame>
  )
}

// v1.23.3 — arayüz cilası: vitrin süsleri ve "Kaldığın yerden"
export function VitrinSusVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={8} y={8} width={304} height={112} rx={6} className="fill-neutral-800" />
      <rect x={8} y={8} width={150} height={112} rx={6} className="fill-neutral-900" opacity={0.7} />
      <rect x={20} y={30} width={80} height={14} rx={2} className="fill-neutral-500" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={20} y={52 + i * 7} width={i === 2 ? 70 : 110} height={3.5} rx={1.5} className="fill-neutral-600" />
      ))}
      <MiniButton x={20} y={78} w={46} text={tt('Daha Fazla Bilgi')} accent />
      <MiniButton x={70} y={78} w={44} text={tt('Aklımda tut')} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={250 + i * 14} y={100} width={i === 1 ? 18 : 9} height={2.5} rx={1.2} fill={i === 1 ? '#fff' : '#525252'} />
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Poster key={i} x={20 + i * 46} y={110} w={40} />
      ))}
      <Pin x={118} y={58} n={1} />
      <Pin x={120} y={84} n={2} />
      <Pin x={290} y={92} n={3} />
      <Pin x={300} y={130} n={4} />
    </Frame>
  )
}

export function KaldiginYerdenVisual() {
  const pct = [0.62, 0.35, 0.8]
  return (
    <Frame viewBox={VB}>
      <text x={14} y={30} fontSize={8} className="fill-neutral-200" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
        {tt('Kaldığın yerden')}
      </text>
      {pct.map((p, i) => (
        <g key={i} transform={`translate(${14 + i * 100} 42)`}>
          <rect width={92} height={52} rx={4} className="fill-neutral-700" />
          <rect x={6} y={36} width={40} height={8} rx={1.5} className="fill-neutral-400" />
          <rect y={52} width={92} height={3} className="fill-neutral-800" />
          <rect y={52} width={92 * p} height={3} fill={ACCENT} />
          <rect x={0} y={60} width={50} height={4} rx={1.5} className="fill-neutral-500" />
          <rect x={64} y={60} width={28} height={4} rx={1.5} className="fill-neutral-600" />
        </g>
      ))}
      <circle cx={60} cy={68} r={9} fill="none" stroke="#fff" strokeWidth={1.2} />
      <path d="M57.5 64 v8 l6-4z" fill="#fff" />
      <Pin x={106} y={96} n={1} />
      <Pin x={74} y={56} n={2} />
    </Frame>
  )
}

// v1.23.3 — Takvim: günün kahramanı, tek satır vizyonlar, ısı şeridi
export function TakvimCilaVisual() {
  const heat = [0, 2, 0, 1, 3, 2, 1, 0, 2, 2, 1, 3, 4]
  const tones = ['#262626', '#0b3a6e', '#0b5ac0', '#0a85e8', '#00c0fa']
  return (
    <Frame viewBox={VB}>
      {Array.from({ length: 30 }, (_, i) => (
        <rect key={i} x={10 + i * 10} y={12} width={8.5} height={8.5} rx={1.5} fill={tones[heat[i] ?? 0]} stroke={i === 12 ? '#fff' : 'none'} strokeWidth={0.8} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} transform={`translate(${10 + i * 61} 32)`}>
          <rect width={57} height={110} rx={3} className={i === 3 ? 'fill-neutral-800' : 'fill-neutral-900'} stroke={i === 3 ? ACCENT : '#333'} strokeWidth={i === 3 ? 1 : 0.5} />
          <text x={5} y={11} fontSize={6.5} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
            {9 + i}
          </text>
        </g>
      ))}
      <rect x={14} y={48} width={49} height={28} rx={2} className="fill-neutral-600" />
      <rect x={14} y={79} width={36} height={4} rx={1.5} className="fill-neutral-400" />
      <rect x={75} y={48} width={49} height={14} rx={2} className="fill-neutral-700" />
      <rect x={75} y={65} width={49} height={14} rx={2} className="fill-neutral-700" />
      {[0, 1, 2].map((k) => (
        <rect key={k} x={136 + k * 5} y={50} width={7} height={10} rx={1} className="fill-neutral-500" stroke="#0a0a0a" strokeWidth={0.8} />
      ))}
      <text x={156} y={58} fontSize={6} fill="#fcd34d" style={{ fontFamily: 'inherit' }}>
        {tt('{0} vizyon', 4)}
      </text>
      <Pin x={300} y={16} n={1} />
      <Pin x={38} y={62} n={2} />
      <Pin x={176} y={56} n={3} />
      <Pin x={226} y={40} n={4} />
    </Frame>
  )
}

// v1.23.3 — İstatistikler: vurgulu ay, ortalama çizgisi, yıl ısı haritası, halka
export function IstatistikCilaVisual() {
  const vals = [11, 10, 3, 6, 6, 1, 1, 3, 5, 1, 4, 4]
  const tone = (v: number) => (v < 5 ? '#262626' : v < 7 ? '#0b3a6e' : v < 9 ? '#0b5ac0' : v < 10 ? '#0a85e8' : '#00c0fa')
  return (
    <Frame viewBox={VB}>
      {vals.map((v, i) => (
        <rect key={i} x={14 + i * 14} y={84 - v * 6} width={10} height={v * 6} rx={2} fill={i === 11 ? '#00c0fa' : '#2b6fd6'} opacity={i === 11 ? 1 : 0.75} />
      ))}
      <line x1={12} x2={182} y1={84 - 4.6 * 6} y2={84 - 4.6 * 6} stroke="#fff" strokeOpacity={0.4} strokeDasharray="3 2" />
      <line x1={12} x2={182} y1={84} y2={84} stroke="#404040" />
      {Array.from({ length: 7 * 12 }, (_, i) => (
        <rect key={i} x={14 + Math.floor(i / 7) * 8} y={104 + (i % 7) * 8} width={6.5} height={6.5} rx={1} fill={tone((i * 37) % 11)} />
      ))}
      <circle cx={250} cy={60} r={30} fill="none" stroke="#262626" strokeWidth={10} />
      <circle cx={250} cy={60} r={30} fill="none" stroke="#3987e5" strokeWidth={10} strokeDasharray={`${0.74 * 188} 188`} transform="rotate(-90 250 60)" />
      <circle cx={250} cy={60} r={30} fill="none" stroke="#d95926" strokeWidth={10} strokeDasharray={`${0.26 * 188} 188`} strokeDashoffset={-0.74 * 188} transform="rotate(-90 250 60)" />
      <Pin x={176} y={50} n={1} />
      <Pin x={190} y={52} n={2} />
      <Pin x={118} y={118} n={3} />
      <Pin x={290} y={30} n={4} />
    </Frame>
  )
}

// v1.23.3 — Evrenler ve Koleksiyon: halkalar, sıradaki, zaman çizgisi
export function EvrenCilaVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={8} y={8} width={148} height={78} rx={6} className="fill-neutral-900" stroke="#ef4444" strokeOpacity={0.6} />
      <rect x={8} y={8} width={148} height={34} rx={6} fill="#ef4444" opacity={0.25} />
      <circle cx={34} cy={62} r={14} fill="none" stroke="#262626" strokeWidth={4} />
      <circle cx={34} cy={62} r={14} fill="none" stroke="#ef4444" strokeWidth={4} strokeDasharray="30 88" transform="rotate(-90 34 62)" />
      <rect x={56} y={50} width={16} height={24} rx={2} className="fill-neutral-600" />
      <rect x={78} y={54} width={52} height={5} rx={1.5} className="fill-neutral-300" />
      <rect x={78} y={64} width={36} height={4} rx={1.5} className="fill-neutral-600" />
      <rect x={168} y={8} width={144} height={78} rx={6} className="fill-neutral-900" />
      <circle cx={204} cy={47} r={26} fill="none" stroke="#2a2410" strokeWidth={3} />
      <circle cx={204} cy={47} r={26} fill="none" stroke="#eab308" strokeWidth={3} strokeDasharray="128 163" transform="rotate(-90 204 47)" />
      <path d="M204 30 l14 26 h-28z" fill="none" stroke="#e8c35a" strokeWidth={1.5} />
      {[0, 1, 2].map((i) => (
        <Poster key={i} x={240 + i * 22} y={26} w={18} dim={i === 2} />
      ))}
      <line x1={14} x2={306} y1={130} y2={130} stroke="#404040" strokeWidth={2} />
      <line x1={14} x2={92} y1={130} y2={130} stroke="#ef4444" strokeWidth={2} />
      {Array.from({ length: 14 }, (_, i) => (
        <circle key={i} cx={20 + i * 21} cy={130} r={i === 4 ? 4.5 : 3} fill={i < 4 ? '#ef4444' : i === 4 ? '#fff' : '#525252'} />
      ))}
      {['2008', '2012', '2016', '2020', '2024'].map((y, i) => (
        <text key={y} x={20 + i * 70} y={148} fontSize={6} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
          {y}
        </text>
      ))}
      <Pin x={22} y={46} n={1} />
      <Pin x={128} y={48} n={2} />
      <Pin x={232} y={20} n={3} />
      <Pin x={110} y={118} n={4} />
    </Frame>
  )
}

// v1.23.3 — Arşiv tablosu: isteğe bağlı cilalı görünüm
export function TabloCilaVisual() {
  const rows: [number, string, string][] = [
    [10, '#22c55e', '#34d399'],
    [7.3, '#eab308', '#38bdf8'],
    [5.8, '#ef4444', '#a78bfa'],
  ]
  return (
    <Frame viewBox={VB}>
      <rect x={230} y={10} width={18} height={14} rx={3} fill={ACCENT} opacity={0.25} stroke={ACCENT} strokeWidth={0.8} />
      <path d="M239 13 l1.4 3 3 .4-2.2 2 .6 3-2.8-1.5-2.8 1.5.6-3-2.2-2 3-.4z" fill={ACCENT} />
      {rows.map(([s, c, g], i) => (
        <g key={i} transform={`translate(10 ${40 + i * 34})`}>
          <rect width={300} height={28} rx={3} className="fill-neutral-900" />
          <rect x={6} y={4} width={13} height={20} rx={2} className="fill-neutral-600" />
          <rect x={25} y={9} width={70} height={5} rx={1.5} className="fill-neutral-300" />
          <rect x={110} y={11} width={5} height={5} rx={1} fill={g} />
          <rect x={118} y={11.5} width={34} height={4} rx={1.5} className="fill-neutral-400" />
          <rect x={160} y={11} width={5} height={5} rx={1} fill="#fb923c" />
          <rect x={168} y={11.5} width={30} height={4} rx={1.5} className="fill-neutral-400" />
          <text x={214} y={16.5} fontSize={7} fontWeight={700} fill={c} style={{ fontFamily: 'inherit' }}>
            {s.toFixed(1)}
          </text>
          <rect x={232} y={12} width={44} height={3.5} rx={1.5} className="fill-neutral-800" />
          <rect x={232} y={12} width={4.4 * s} height={3.5} rx={1.5} fill={c} />
        </g>
      ))}
      <Pin x={262} y={16} n={1} />
      <Pin x={150} y={36} n={2} />
      <Pin x={290} y={36} n={3} />
    </Frame>
  )
}

// v1.23.4 — Ekstralar: Ayarlar'da tek yerden aç/kapa
export function EkstralarVisual() {
  const rows = [tt('Seçim animasyonu'), tt('Üç aday modu'), tt('Giriş animasyonu'), tt('Yeni profil menüsü'), tt('Gelişmiş arama'), tt('Başarımlar')]
  return (
    <Frame viewBox={VB}>
      <rect x={10} y={10} width={86} height={160} rx={6} className="fill-neutral-900" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={18} y={22 + i * 22} width={70} height={14} rx={3} className={i === 4 ? 'fill-neutral-700' : 'fill-neutral-800'} stroke={i === 4 ? ACCENT : 'none'} strokeWidth={0.8} />
      ))}
      <text x={26} y={120.5} fontSize={6.5} fill="#fff" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
        {tt('Ekstralar')}
      </text>
      {rows.map((r, i) => (
        <g key={r} transform={`translate(108 ${18 + i * 25})`}>
          <rect width={202} height={20} rx={4} className="fill-neutral-900" />
          <text x={8} y={13} fontSize={6.5} className="fill-neutral-300" style={{ fontFamily: 'inherit' }} {...fit(r, 6.5, 140)}>
            {r}
          </text>
          <rect x={176} y={5} width={18} height={10} rx={5} fill={i < 2 || i === 5 ? ACCENT : '#404040'} />
          <circle cx={i < 2 || i === 5 ? 189 : 181} cy={10} r={3.6} fill="#fff" />
        </g>
      ))}
      <Pin x={92} y={118} n={1} />
      <Pin x={300} y={14} n={2} />
    </Frame>
  )
}

// v1.23.4 — Ne İzlesem: çark ve slot, üç aday
export function NeIzlesemEkstraVisual() {
  return (
    <Frame viewBox={VB}>
      <circle cx={70} cy={90} r={56} fill="none" stroke={ACCENT} strokeOpacity={0.5} strokeWidth={1.5} />
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2
        return <rect key={i} x={70 + Math.cos(a) * 46 - 6} y={90 + Math.sin(a) * 46 - 9} width={12} height={18} rx={2} className="fill-neutral-600" />
      })}
      <circle cx={70} cy={90} r={14} className="fill-neutral-900" stroke={ACCENT} />
      <path d="M64 24 L76 24 L70 36 Z" fill={ACCENT} />
      <rect x={146} y={46} width={84} height={88} rx={8} className="fill-neutral-800" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={152 + i * 26} y={54} width={22} height={72} rx={3} className="fill-neutral-900" />
      ))}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={155 + i * 26} y={78} width={16} height={24} rx={2} className="fill-neutral-500" />
      ))}
      <line x1={148} x2={228} y1={90} y2={90} stroke={ACCENT} strokeWidth={1.2} />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${244 + i * 24} ${i === 1 ? 70 : 76})`}>
          <rect width={20} height={30} rx={2} className={i === 1 ? 'fill-neutral-400' : 'fill-neutral-700'} stroke={i === 1 ? ACCENT : 'none'} />
          {i !== 1 && <text x={10} y={-3} fontSize={7} textAnchor="middle" fill="#f87171">✕</text>}
        </g>
      ))}
      <Pin x={118} y={40} n={1} />
      <Pin x={234} y={44} n={2} />
      <Pin x={306} y={60} n={3} />
    </Frame>
  )
}

// v1.23.4 — Yeni profil menüsü ve yeni sayfalar
export function MenuEkstraVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={10} y={8} width={130} height={164} rx={8} className="fill-neutral-900" />
      <rect x={10} y={8} width={130} height={44} rx={8} className="fill-neutral-700" opacity={0.6} />
      <rect x={18} y={16} width={18} height={18} rx={4} className="fill-neutral-500" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={18 + i * 40} y={38} width={36} height={10} rx={2} className="fill-neutral-800" />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={20 + i * 30} y={58} width={22} height={18} rx={4} fill={['#0c4a6e', '#14532d', '#3b0764', '#78350f'][i]} />
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={20} y={86 + i * 13} width={i === 3 ? 70 : 90} height={6} rx={2} className="fill-neutral-700" />
      ))}
      <circle cx={128} cy={128} r={3} fill={ACCENT} />
      <g transform="translate(160 18)">
        <rect width={150} height={64} rx={6} className="fill-neutral-900" />
        <circle cx={32} cy={32} r={16} fill="#ef4444" opacity={0.6} />
        <circle cx={50} cy={32} r={16} fill="#8b5cf6" opacity={0.6} />
        <text x={41} y={35} fontSize={8} textAnchor="middle" fill="#fff" style={{ fontWeight: 800 }}>14</text>
        <text x={78} y={30} fontSize={7} className="fill-neutral-200" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
          {tt('Birlikte izle')}
        </text>
      </g>
      <g transform="translate(160 92)">
        <rect width={150} height={70} rx={6} className="fill-neutral-900" />
        {[0, 1, 2, 3].map((i) => (
          <path key={i} transform={`translate(${14 + i * 34} 14)`} d="M12 0 L24 7 L24 21 L12 28 L0 21 L0 7 Z" fill={['#f59e0b', '#22c55e', '#3b82f6', '#404040'][i]} />
        ))}
        <text x={14} y={60} fontSize={7} className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
          {tt('Başarımlar')}
        </text>
      </g>
      <Pin x={132} y={14} n={1} />
      <Pin x={134} y={64} n={2} />
      <Pin x={306} y={22} n={3} />
      <Pin x={306} y={96} n={4} />
    </Frame>
  )
}

// v1.23.5 — Ayarlar › Açılış: giriş animasyonu (Sırayla), Şimdi izle, ARGUS göz açılışı
export function GirisAnimVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={10} y={10} width={74} height={160} rx={6} className="fill-neutral-900" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={16} y={20 + i * 22} width={62} height={14} rx={3} className={i === 4 ? 'fill-neutral-700' : 'fill-neutral-800'} stroke={i === 4 ? ACCENT : 'none'} strokeWidth={0.8} />
      ))}
      <text x={22} y={118.5} fontSize={6.5} fill="#fff" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
        {tt('Açılış')}
      </text>
      <rect x={94} y={14} width={120} height={20} rx={4} className="fill-neutral-900" stroke={ACCENT} strokeWidth={0.8} />
      <text x={102} y={27} fontSize={6.5} className="fill-neutral-200" style={{ fontFamily: 'inherit' }} {...fit(tt('Sırayla (her açılışta sıradaki)'), 6.5, 104)}>
        {tt('Sırayla (her açılışta sıradaki)')}
      </text>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={94 + i * 30} y={42} width={26} height={11} rx={5.5} className="fill-neutral-800" stroke="#525252" strokeWidth={0.6} />
      ))}
      <g transform="translate(94 64)">
        <rect width={120} height={100} rx={6} fill="#000" />
        <path d="M18 50 Q60 14 102 50 Q60 86 18 50Z" fill="#06223f" stroke="#5fd8ff" strokeWidth={1} />
        <circle cx={60} cy={50} r={17} fill={ACCENT} />
        <circle cx={60} cy={50} r={7} fill="#000" />
        <circle cx={55} cy={45} r={2.5} fill="#fff" />
        {[0, 1].map((i) => (
          <circle key={i} cx={60} cy={50} r={28 + i * 12} fill="none" stroke={ACCENT} strokeOpacity={0.4 - i * 0.15} />
        ))}
      </g>
      <g transform="translate(226 64)">
        <rect width={86} height={100} rx={6} className="fill-neutral-900" />
        <rect x={12} y={14} width={62} height={34} rx={2} fill="#3d1d0a" />
        <path d="M43 98 L14 48 L72 48 Z" fill="#fde68a" opacity={0.18} />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={6 + i * 20} y={70} width={14} height={30} rx={7} className="fill-neutral-800" />
        ))}
      </g>
      <Pin x={208} y={16} n={1} />
      <Pin x={214} y={44} n={2} />
      <Pin x={208} y={70} n={3} />
      <Pin x={306} y={70} n={4} />
    </Frame>
  )
}

// v1.23.5 — Başarımlar madalyaları ve Sahneden bil'de gerçek sahne
export function BasarimSahneVisual() {
  const seal = Array.from({ length: 24 }, (_, i) => {
    const r = i % 2 ? 19 : 22
    const a = (i / 24) * Math.PI * 2
    return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`
  }).join(' ')
  const metals = ['#f0b07a', '#e2e8f0', '#fde68a', '#52525b']
  return (
    <Frame viewBox={VB}>
      <rect x={10} y={10} width={140} height={160} rx={8} className="fill-neutral-900" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${46 + (i % 2) * 68} ${50 + Math.floor(i / 2) * 76})`}>
          <polygon points={seal} fill={metals[i]} opacity={i === 3 ? 0.5 : 1} />
          <circle r={15} fill={['#3b82f6', '#ef4444', '#a78bfa', '#3f3f46'][i]} />
          <path d="M-5 -7 L7 0 L-5 7 Z" fill="#fff" opacity={i === 3 ? 0.35 : 1} />
          {[0, 1, 2].map((t) => (
            <rect key={t} x={-13 + t * 9} y={28} width={7} height={2.5} rx={1.2} fill={i < 3 && t <= i ? metals[t] : '#404040'} />
          ))}
        </g>
      ))}
      <g transform="translate(162 14)">
        <rect width={150} height={84} rx={6} fill="#0b1726" />
        <rect x={0} y={52} width={150} height={32} fill="#13283f" />
        <circle cx={110} cy={30} r={12} fill="#fde68a" opacity={0.5} />
        <path d="M20 84 L38 50 L52 84 Z" className="fill-neutral-700" />
        <rect x={0} y={80} width={110} height={4} fill={ACCENT} />
      </g>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={162 + (i % 2) * 77} y={106 + Math.floor(i / 2) * 32} width={73} height={26} rx={5} className="fill-neutral-900" stroke={i === 1 ? '#10b981' : '#404040'} strokeWidth={0.8} />
      ))}
      <Pin x={22} y={20} n={1} />
      <Pin x={138} y={150} n={2} />
      <Pin x={306} y={18} n={3} />
      <Pin x={306} y={110} n={4} />
    </Frame>
  )
}

// v1.23.5 — Detayda Aklımda tut + Paylaş yan yana, yıllık hedef İstatistikler'de
export function PaylasHedefVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={10} y={10} width={160} height={160} rx={8} className="fill-neutral-900" />
      <rect x={10} y={10} width={160} height={70} rx={8} className="fill-neutral-700" opacity={0.5} />
      <rect x={20} y={88} width={110} height={8} rx={2} className="fill-neutral-600" />
      <g transform="translate(20 106)">
        <rect width={62} height={16} rx={8} fill="none" stroke="#525252" />
        <text x={31} y={11} fontSize={6.5} textAnchor="middle" className="fill-neutral-300" style={{ fontFamily: 'inherit' }}>
          {tt('Aklımda tut')}
        </text>
        <rect x={68} width={48} height={16} rx={8} fill="none" stroke="#10b981" />
        <text x={92} y={11} fontSize={6.5} textAnchor="middle" fill="#a7f3d0" style={{ fontFamily: 'inherit' }}>
          {tt('Paylaş')}
        </text>
      </g>
      <g transform="translate(182 14)">
        <rect width={130} height={152} rx={8} className="fill-neutral-900" />
        <text x={12} y={18} fontSize={7} className="fill-neutral-200" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
          {tt('İstatistikler')}
        </text>
        <circle cx={40} cy={62} r={22} fill="none" stroke="#404040" strokeWidth={6} />
        <circle cx={40} cy={62} r={22} fill="none" stroke="#22c55e" strokeWidth={6} strokeDasharray="90 140" transform="rotate(-90 40 62)" strokeLinecap="round" />
        {[8, 14, 10, 18, 12, 6].map((h, i) => (
          <rect key={i} x={72 + i * 9} y={70 - h} width={6} height={h} rx={1} fill={ACCENT} opacity={0.7} />
        ))}
        {[0, 1, 2].map((i) => (
          <rect key={i} x={12 + i * 38} y={100} width={34} height={40} rx={4} className="fill-neutral-800" />
        ))}
      </g>
      <Pin x={92} y={100} n={1} />
      <Pin x={232} y={48} n={2} />
    </Frame>
  )
}

// v1.23.6 — süslü madalyalar ve rozete tıklayınca ilgili yapımlar
export function BasarimDetayVisual() {
  const seal = Array.from({ length: 28 }, (_, i) => {
    const r = i % 2 ? 17 : 19.5
    const a = (i / 28) * Math.PI * 2
    return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`
  }).join(' ')
  return (
    <Frame viewBox={VB}>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${34 + i * 46} 52)`}>
          {i === 2 && [0, 1, 2, 3, 4, 5, 6, 7].map((k) => <path key={k} d="M0 0 L-2 -30 L2 -30 Z" fill="#fde68a" opacity={0.35} transform={`rotate(${k * 45})`} />)}
          <path d="M-8 14 L-14 36 L-9 32 L-6 37 L-1 17 Z" fill={['#1e3a8a', '#7f1d1d', '#065f46'][i]} />
          <path d="M8 14 L14 36 L9 32 L6 37 L1 17 Z" fill={['#1e3a8a', '#7f1d1d', '#065f46'][i]} />
          {i >= 1 && [0, 1, 2, 3].map((k) => (
            <g key={k}>
              <ellipse cx={-21 + k * 2} cy={12 - k * 8} rx={3.5} ry={1.5} fill={i === 2 ? '#fde68a' : '#e2e8f0'} transform={`rotate(${-60 + k * 20} ${-21 + k * 2} ${12 - k * 8})`} />
              <ellipse cx={21 - k * 2} cy={12 - k * 8} rx={3.5} ry={1.5} fill={i === 2 ? '#fde68a' : '#e2e8f0'} transform={`rotate(${60 - k * 20} ${21 - k * 2} ${12 - k * 8})`} />
            </g>
          ))}
          <polygon points={seal} fill={['#f0b07a', '#e2e8f0', '#fde68a'][i]} />
          <circle r={13.5} fill={['#3b82f6', '#ef4444', '#34d399'][i]} />
          {i === 2 && <path d="M0 -27 l1.6 3.3 3.6.5-2.6 2.5.6 3.6L0 -18.4l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fde68a" />}
        </g>
      ))}
      <g transform="translate(160 14)">
        <rect width={152} height={152} rx={8} className="fill-neutral-900" stroke={ACCENT} strokeOpacity={0.5} />
        <circle cx={24} cy={26} r={13} fill="#fde68a" />
        <rect x={44} y={16} width={60} height={8} rx={2} className="fill-neutral-300" />
        <rect x={44} y={29} width={90} height={5} rx={2} className="fill-neutral-600" />
        {[0, 1, 2].map((k) => (
          <rect key={k} x={10 + k * 46} y={46} width={42} height={18} rx={3} className="fill-neutral-800" />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
          <rect key={k} x={10 + (k % 4) * 34} y={74 + Math.floor(k / 4) * 38} width={28} height={34} rx={3} className={k === 0 ? 'fill-neutral-400' : 'fill-neutral-700'} stroke={k === 0 ? ACCENT : 'none'} />
        ))}
      </g>
      <rect x={14} y={112} width={136} height={50} rx={6} className="fill-neutral-900" />
      <text x={22} y={130} fontSize={7} className="fill-neutral-200" style={{ fontFamily: 'inherit', fontWeight: 700 }}>
        {tt('Sinefil')}
      </text>
      <text x={22} y={144} fontSize={6} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('1000 yapım izle')}
      </text>
      <text x={22} y={155} fontSize={6} fill="#fcd34d" style={{ fontFamily: 'inherit' }}>
        {tt('Tamamlandı')}
      </text>
      <Pin x={22} y={18} n={1} />
      <Pin x={140} y={118} n={2} />
      <Pin x={306} y={18} n={3} />
      <Pin x={306} y={80} n={4} />
    </Frame>
  )
}

// v1.23.7 — İstatistikler'deki ısı haritası bölüm tiklerini de sayıyor
export function IsiHaritaBolumVisual() {
  const lit = (c: number, r: number) => (c >= 9 && c <= 13 ? (c * 7 + r) % 5 === 0 ? 2 : 4 : (c * 13 + r * 7) % 9 === 0 ? 2 : 0)
  const bg = ['#262626', '#0b3a6e', '#0b5ac0', '#0a85e8', '#00c0fa']
  return (
    <Frame viewBox={VB}>
      <rect x={10} y={30} width={300} height={110} rx={8} className="fill-neutral-900" />
      {Array.from({ length: 20 }, (_, c) =>
        Array.from({ length: 7 }, (_, r) => <rect key={c + '-' + r} x={22 + c * 14} y={44 + r * 12} width={11} height={10} rx={2} fill={bg[lit(c, r)]} />),
      )}
      <rect x={146} y={40} width={72} height={90} rx={4} fill="none" stroke={ACCENT} strokeWidth={1} strokeDasharray="3 2" />
      <rect x={180} y={10} width={120} height={16} rx={4} className="fill-neutral-800" />
      <text x={188} y={21} fontSize={6.5} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {tt('1 yapım · 6 bölüm')}
      </text>
      <Pin x={150} y={36} n={1} />
      <Pin x={296} y={10} n={2} />
    </Frame>
  )
}

// v1.23.8 — arşiv tablosu açılırken çöküyordu
export function TabloAcilisVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={20} y={20} width={280} height={140} rx={8} className="fill-neutral-900" />
      <rect x={34} y={32} width={110} height={10} rx={3} className="fill-neutral-300" />
      <rect x={34} y={48} width={160} height={6} rx={3} className="fill-neutral-600" />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <g key={k}>
          <rect x={34} y={66 + k * 15} width={252} height={11} rx={2} className={k % 2 ? 'fill-neutral-800' : 'fill-neutral-800/60'} />
          <rect x={40} y={68 + k * 15} width={8} height={7} rx={1} className="fill-neutral-500" />
          <rect x={54} y={69 + k * 15} width={70 + ((k * 23) % 50)} height={5} rx={2} className="fill-neutral-400" />
          <rect x={220} y={69 + k * 15} width={40} height={5} rx={2} fill={ACCENT} opacity={0.6} />
        </g>
      ))}
      <Pin x={26} y={26} n={1} />
    </Frame>
  )
}

// v1.23.9 — yeni paylaş kartı: biçimler ve temalar
export function PaylasKartVisual() {
  const card = (x: number, w: number, h: number, kind: number) => (
    <g transform={`translate(${x} ${150 - h})`}>
      <rect width={w} height={h} rx={5} fill={['#13222c', '#0b0f14', '#1b2a33', '#3b5560'][kind]} />
      {kind === 0 && <rect x={w * 0.2} y={h * 0.14} width={w * 0.6} height={h * 0.5} rx={3} className="fill-neutral-500" />}
      {kind === 1 && <rect width={w} height={h * 0.55} rx={5} className="fill-neutral-600" />}
      {kind === 2 && (
        <g>
          <rect x={w * 0.1} y={h * 0.1} width={w * 0.8} height={h * 0.78} rx={3} fill="#f4efe6" />
          <rect x={w * 0.1} y={h * 0.1} width={w * 0.8} height={h * 0.28} rx={3} className="fill-neutral-600" />
          <line x1={w * 0.14} x2={w * 0.86} y1={h * 0.7} y2={h * 0.7} stroke="#999" strokeDasharray="2 2" strokeWidth={0.8} />
        </g>
      )}
      {kind === 3 && <rect x={w * 0.5} y={h * 0.5} width={w * 0.45} height={h * 0.5} rx={3} className="fill-neutral-400" transform={`rotate(5 ${w * 0.7} ${h * 0.7})`} />}
      <rect x={w * 0.15} y={kind === 3 ? h * 0.14 : h * 0.72} width={w * 0.5} height={4} rx={2} fill={kind === 2 ? '#222' : '#e5e7eb'} />
      <rect x={w * 0.15} y={kind === 3 ? h * 0.24 : h * 0.8} width={w * 0.35} height={3} rx={1.5} fill={kind === 2 ? '#777' : '#6b7280'} />
    </g>
  )
  return (
    <Frame viewBox={VB}>
      {card(14, 54, 96, 0)}
      {card(76, 54, 96, 1)}
      {card(138, 54, 96, 2)}
      {card(200, 54, 96, 3)}
      <rect x={262} y={20} width={50} height={140} rx={6} className="fill-neutral-900" />
      {[0, 1, 2].map((k) => (
        <rect key={k} x={268 + k * 14} y={30} width={11} height={12} rx={2} className={k === 0 ? 'fill-sky-500/40' : 'fill-neutral-800'} />
      ))}
      {[0, 1, 2, 3].map((k) => (
        <rect key={k} x={268 + (k % 2) * 20} y={52 + Math.floor(k / 2) * 16} width={18} height={12} rx={2} className="fill-neutral-800" />
      ))}
      {[0, 1, 2, 3].map((k) => (
        <rect key={k} x={268} y={92 + k * 9} width={38} height={6} rx={3} className="fill-neutral-800" />
      ))}
      <rect x={268} y={136} width={38} height={10} rx={3} fill={ACCENT} />
      <Pin x={20} y={44} n={1} />
      <Pin x={268} y={26} n={2} />
      <Pin x={268} y={88} n={3} />
      <Pin x={306} y={134} n={4} />
    </Frame>
  )
}

// v1.23.9 — sade giriş animasyonları
export function GirisSadeVisual() {
  return (
    <Frame viewBox={VB}>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${12 + i * 102} 30)`}>
          <rect width={94} height={120} rx={6} fill="#04070a" />
          {i === 0 && <circle cx={47} cy={52} r={30} fill="#0369a1" opacity={0.25} />}
          {i === 1 && <rect x={6} y={51} width={82} height={1.5} fill="#7dd3fc" />}
          {i === 2 && [26, 20, 14].map((r) => <circle key={r} cx={47} cy={52} r={r} fill="none" stroke="#7dd3fc" strokeOpacity={0.5} strokeWidth={0.8} />)}
          <path d="M47 40 L56 60 L38 60 Z" fill={ACCENT} />
          <text x={47} y={84} textAnchor="middle" fontSize={7} fill="#e5e7eb" style={{ fontFamily: 'inherit', letterSpacing: '0.5em' }}>
            ARGUS
          </text>
          <text x={47} y={108} textAnchor="middle" fontSize={7} className="fill-neutral-500" style={{ fontFamily: 'inherit' }}>
            {[tt('İmza'), tt('Işık'), tt('Odak')][i]}
          </text>
        </g>
      ))}
      <Pin x={18} y={36} n={1} />
      <Pin x={120} y={36} n={2} />
      <Pin x={222} y={36} n={3} />
    </Frame>
  )
}

// v1.23.10 — profil menüsünde Flashback hizası
export function FlashbackHizaVisual() {
  return (
    <Frame viewBox={VB}>
      <rect x={90} y={14} width={140} height={152} rx={8} className="fill-neutral-900" />
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k}>
          <rect x={104} y={30 + k * 26} width={10} height={10} rx={2} className={k === 4 ? 'fill-sky-400' : 'fill-neutral-600'} />
          <rect x={122} y={32 + k * 26} width={k === 4 ? 46 : 56 + ((k * 13) % 30)} height={6} rx={3} className={k === 4 ? 'fill-neutral-200' : 'fill-neutral-400'} />
        </g>
      ))}
      <line x1={104} x2={104} y1={22} y2={150} stroke={ACCENT} strokeDasharray="3 2" strokeWidth={1} />
      <Pin x={96} y={130} n={1} />
    </Frame>
  )
}

// v1.23.11 — Koleksiyon › Biletlerim
export function BiletlerimVisual() {
  const ticket = (x: number, y: number, w: number, rot: number, tone: string) => (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect width={w} height={w / 2.4} rx={3} fill={tone} />
      <rect x={w * 0.73} width={w * 0.27} height={w / 2.4} rx={3} fill="#f2ece1" />
      <line x1={w * 0.73} x2={w * 0.73} y1={2} y2={w / 2.4 - 2} stroke="#8a8075" strokeDasharray="1.5 1.5" strokeWidth={0.6} />
      <rect x={w * 0.08} y={w * 0.13} width={w * 0.36} height={w * 0.05} rx={1} fill="#e5e7eb" />
      <rect x={w * 0.08} y={w * 0.27} width={w * 0.24} height={w * 0.03} rx={1} fill="#9ca3af" />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <rect key={k} x={w * 0.78 + k * w * 0.028} y={w * 0.3} width={w * 0.012} height={w * 0.07} fill="#1a1612" />
      ))}
    </g>
  )
  return (
    <Frame viewBox={VB}>
      <rect x={10} y={12} width={130} height={20} rx={5} className="fill-neutral-900" />
      <rect x={14} y={15} width={58} height={14} rx={4} className="fill-neutral-800" />
      <text x={22} y={25} fontSize={7} className="fill-neutral-400" style={{ fontFamily: 'inherit' }}>
        {tt('Raflar')}
      </text>
      <text x={80} y={25} fontSize={7} className="fill-neutral-100" style={{ fontFamily: 'inherit' }}>
        {tt('Biletlerim')}
      </text>
      <text x={12} y={52} fontSize={11} className="fill-neutral-200" style={{ fontFamily: 'inherit', fontWeight: 800 }}>
        2024
      </text>
      {ticket(12, 60, 66, -2, '#1e3a4a')}
      {ticket(86, 60, 66, 1.5, '#3b2a1e')}
      <text x={12} y={118} fontSize={11} className="fill-neutral-200" style={{ fontFamily: 'inherit', fontWeight: 800 }}>
        2023
      </text>
      {ticket(12, 126, 66, 1, '#2a1e3b')}
      <g transform="translate(178 38)">
        <rect width={132} height={55} rx={4} fill="#f2ece1" transform="skewY(-4)" />
        <rect x={8} y={8} width={60} height={6} rx={2} fill="#1a1612" transform="skewY(-4)" />
        {[0, 1, 2, 3].map((k) => (
          <rect key={k} x={8 + k * 30} y={22} width={22} height={4} rx={1} fill="#8a8075" transform="skewY(-4)" />
        ))}
        <path d="M66 70 a20 8 0 1 0 -6 -10" fill="none" stroke={ACCENT} strokeWidth={1.4} />
        <path d="M60 58 l0 4 l4 -1" fill="none" stroke={ACCENT} strokeWidth={1.4} />
      </g>
      <rect x={178} y={130} width={60} height={14} rx={7} className="fill-neutral-800" />
      <text x={186} y={140} fontSize={6.5} className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
        {tt('Sinemada izledim')}
      </text>
      <Pin x={136} y={14} n={1} />
      <Pin x={150} y={62} n={2} />
      <Pin x={306} y={36} n={3} />
      <Pin x={240} y={130} n={4} />
    </Frame>
  )
}
