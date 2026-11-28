import { tt } from '../lib/i18n'

// Kriter renkleri: kullanıcı "tüm kriterler aynı renkte olmasın" dedi. İlk on sabit, fazlası altın açıyla üretilir.
const PALETTE = ['#fbbf24', '#38bdf8', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171', '#a3e635', '#818cf8']
export function criterionColor(i: number) {
  return PALETTE[i] ?? `hsl(${Math.round((i * 137.5) % 360)} 75% 62%)`
}

// Detay penceresinde büyük görselin üstündeki puan halkası (D1): her kriter bir yay, ortada ortalama.
// Kriter sayısı serbest (Puan sütununun `criteria`sı).
export default function ScoreRing({ items, avg }: { items: { id: string; name: string; score: number; color: string }[]; avg: number }) {
  const size = 132
  const c = size / 2
  const R = 52
  const C = 2 * Math.PI * R
  const n = Math.max(1, items.length)
  const seg = C / n
  const gap = n > 1 ? Math.min(6, seg * 0.18) : 0
  const len = seg - gap
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-neutral-950/55 ring-1 ring-white/10 backdrop-blur-md px-4 py-3 shadow-xl shadow-black/40">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={tt('Puanın: {0}', avg.toFixed(1))}>
        {items.map((it, i) => {
          const rot = -90 + (i * 360) / n + ((gap / C) * 360) / 2
          const frac = Math.max(0, Math.min(1, it.score / 10))
          return (
            <g key={it.id} transform={`rotate(${rot} ${c} ${c})`}>
              <circle cx={c} cy={c} r={R} fill="none" stroke="currentColor" className="text-neutral-800" strokeWidth={11} strokeDasharray={`${len} ${C}`} />
              <circle cx={c} cy={c} r={R} fill="none" stroke={it.color} strokeWidth={11} strokeDasharray={`${len * frac} ${C}`}>
                <title>{`${it.name}: ${it.score}`}</title>
              </circle>
            </g>
          )
        })}
        <text x={c} y={c + 4} textAnchor="middle" fill="currentColor" className="text-neutral-50" fontSize={30} fontWeight={900}>
          {avg.toFixed(1)}
        </text>
        <text x={c} y={c + 24} textAnchor="middle" fill="currentColor" className="text-neutral-400" fontSize={10.5}>
          {tt('senin puanın')}
        </text>
      </svg>
      <div className="w-36 space-y-1.5 max-h-[132px] overflow-y-auto">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 text-[11px]">
            <span className="min-w-0 flex-1 truncate text-neutral-300" title={it.name}>{it.name}</span>
            <span className="h-1 w-10 shrink-0 rounded-full bg-neutral-800 overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${(Math.max(0, Math.min(10, it.score)) / 10) * 100}%`, background: it.color }} />
            </span>
            <span className="w-6 shrink-0 text-right tabular-nums font-semibold text-neutral-100">{it.score}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
