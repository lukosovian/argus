import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { entryEnd } from '../lib/dateRange'
import { BRAND_TEXT } from '../lib/theme'
import { tt } from '../lib/i18n'

// Detaydaki "Kaldığın yer": kullanıcı "yarım kalan filmi devam ettirince tekrar izleme olarak yazmasın,
// kaldığım dakikayı detay penceresinde göstersin, ordan bakıp devam edeyim" dedi. Nook izlerken yazıyor
// (bkz. server/index.js progress), film bitince siliyor.

// 4350000 → "1:12:30"
function formatAt(ms: number) {
  const t = Math.floor(ms / 1000)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

type Progress = { atMs: number | null; durationMs: number | null; day: string }

export default function ResumePoint({ rowId, watchDates, formatDate }: { rowId: string; watchDates: string[]; formatDate: (v: string) => string }) {
  const [p, setP] = useState<Progress | null>(null)
  useEffect(() => {
    let alive = true
    api
      .getProgress(rowId)
      .then((v) => alive && setP(v))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [rowId])
  // Sonradan elle bitirildiyse (daha yeni bir izleme tarihi var) eski yer gösterilmez
  if (!p || watchDates.some((d) => entryEnd(d) > p.day)) return null
  const pct = p.atMs !== null && p.durationMs ? Math.min(100, (p.atMs / p.durationMs) * 100) : null
  const clear = () => {
    setP(null)
    api.clearProgress(rowId).catch(() => {})
  }
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1.5">
        <span className="text-neutral-500">{tt('Kaldığın yer')}</span>
        <button onClick={clear} title={tt('Kaldığın yeri sil')} className="text-neutral-600 hover:text-neutral-300 transition">
          ✕
        </button>
      </div>
      <p className="text-sm text-neutral-100 tabular-nums">
        {p.atMs !== null ? formatAt(p.atMs) : tt('Yarım kaldı')}
        {p.atMs !== null && p.durationMs ? <span className="text-neutral-500"> / {formatAt(p.durationMs)}</span> : null}
        <span className="text-neutral-500 text-xs"> · {formatDate(p.day)}</span>
      </p>
      {pct !== null && (
        <div className="h-1.5 mt-1.5 rounded-full bg-neutral-800 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BRAND_TEXT }} />
        </div>
      )}
    </div>
  )
}
