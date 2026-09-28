import { useRef } from 'react'
import { BRAND_GRADIENT } from '../lib/theme'

// Arka planda süren bir iş (ör. film serilerinin ya da bölüm sürelerinin TMDB'den ilk kez öğrenilmesi)
// için görünür ilerleme — kullanıcı "sadece yükleniyor yazmasın, ilk seferde yükleme yaptığının bilgisi
// ve ilerlemesi ekranda olsun ki kullanıcı dondu sanmasın" dedi. Kalan süre, ekran açıkken ölçülen
// gerçek hızdan tahmin edilir (TMDB'nin hızı değişkenlik gösteriyor).
function remainingText(seconds: number | null) {
  if (seconds === null) return 'süre hesaplanıyor…'
  if (seconds < 10) return 'birkaç saniye kaldı'
  if (seconds < 60) return `yaklaşık ${Math.round(seconds / 10) * 10} saniye kaldı`
  return `yaklaşık ${Math.ceil(seconds / 60)} dakika kaldı`
}

export default function BackgroundProgress({ title, done, total, note }: { title: string; done: number; total: number; note?: string }) {
  const first = useRef<{ done: number; t: number } | null>(null)
  if (!first.current || done < first.current.done) first.current = { done, t: Date.now() }
  const elapsed = (Date.now() - first.current.t) / 1000
  const rate = elapsed >= 2 && done > first.current.done ? (done - first.current.done) / elapsed : null
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="rounded-2xl border border-[#00c0fa]/30 bg-[#00c0fa]/[0.06] px-4 py-3" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-[#00c0fa] border-t-transparent animate-spin" />
        <p className="flex-1 min-w-0 text-sm text-neutral-100">{title}</p>
        <p className="text-xs text-neutral-400 tabular-nums shrink-0">
          {done}/{total} · {remainingText(rate ? (total - done) / rate : null)}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-neutral-800 mt-2.5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, pct)}%`, background: BRAND_GRADIENT }} />
      </div>
      {note && <p className="text-[11px] text-neutral-500 mt-2">{note}</p>}
    </div>
  )
}
