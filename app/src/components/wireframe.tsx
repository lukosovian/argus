// Çizim (wireframe) yapı taşları — hem tablo rehberi (TableGuideModal) hem Yama Notları'ndaki
// görseller (PatchVisuals) bunları kullanıyor. Renkler sabit değil, `fill-neutral-*`/
// `stroke-neutral-*` class'larıyla veriliyor: açık temada neutral skalası ters çevrildiği için
// (bkz. index.css) aynı çizim iki temada da kendiliğinden doğru görünüyor. Vurgu rengi (#00c0fa)
// iki temada da okunur olduğu için sabit.

export const ACCENT = '#00c0fa'

// ---- Wireframe yapı taşları -------------------------------------------------------------

export function Frame({ viewBox, children }: { viewBox: string; children: React.ReactNode }) {
  return (
    <svg viewBox={viewBox} className="w-full h-auto" role="img" aria-hidden>
      {children}
    </svg>
  )
}

export function Box({ x, y, w, h, r = 4, strong = false, dashed = false }: { x: number; y: number; w: number; h: number; r?: number; strong?: boolean; dashed?: boolean }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={r}
      className={strong ? 'fill-neutral-800 stroke-neutral-600' : 'fill-neutral-900 stroke-neutral-700'}
      strokeWidth={1}
      strokeDasharray={dashed ? '4 3' : undefined}
    />
  )
}

// Metin yerine geçen gri çubuk — gerçek yazı gibi dikkat dağıtmadan "burada yazı var" der.
export function Line({ x, y, w, light = false }: { x: number; y: number; w: number; light?: boolean }) {
  return <rect x={x} y={y} width={w} height={5} rx={2.5} className={light ? 'fill-neutral-700' : 'fill-neutral-600'} />
}

export function Label({ x, y, children, size = 10, anchor = 'start', muted = false }: { x: number; y: number; children: React.ReactNode; size?: number; anchor?: 'start' | 'middle' | 'end'; muted?: boolean }) {
  return (
    <text x={x} y={y} fontSize={size} textAnchor={anchor} className={muted ? 'fill-neutral-500' : 'fill-neutral-300'} style={{ fontFamily: 'inherit' }}>
      {children}
    </text>
  )
}

// Numaralı işaret — açıklama listesindeki aynı numarayla eşleşir.
export function Pin({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={8} fill={ACCENT} />
      <text x={x} y={y + 3.5} fontSize={10} fontWeight={700} textAnchor="middle" fill="#fff" style={{ fontFamily: 'inherit' }}>
        {n}
      </text>
    </g>
  )
}

export function Chip({ x, y, w, color, text }: { x: number; y: number; w: number; color: string; text?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={14} rx={7} fill={color} fillOpacity={0.22} stroke={color} strokeOpacity={0.6} />
      {text && (
        <text x={x + w / 2} y={y + 10} fontSize={8} textAnchor="middle" className="fill-neutral-200" style={{ fontFamily: 'inherit' }}>
          {text}
        </text>
      )}
    </g>
  )
}

export function Highlight({ x, y, w, h, r = 5 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeDasharray="4 3" />
}
