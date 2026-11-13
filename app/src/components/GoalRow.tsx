import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfileStats } from '../lib/profileStats'
import { monthNames, tt } from '../lib/i18n'

// Yıllık hedef (v1.23.4, Ayarlar › Ekstralar › Yıllık hedef): ana sayfada dolan halka, hıza göre tahmin, ay ay çubuklar.
export default function GoalRow({ goal, titleClass }: { goal: number; titleClass?: string }) {
  const stats = useProfileStats(true)
  const [shown, setShown] = useState(0)
  const done = stats?.yearDone ?? 0
  useEffect(() => {
    const t = setTimeout(() => setShown(done), 80)
    return () => clearTimeout(t)
  }, [done])
  if (!stats) return null
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1).getTime()
  const end = new Date(now.getFullYear() + 1, 0, 1).getTime()
  const frac = (now.getTime() - start) / (end - start)
  const projected = Math.round(done / Math.max(frac, 0.02))
  const weeksLeft = Math.max(1, (end - now.getTime()) / (7 * 864e5))
  const need = Math.max(0, goal - done)
  const ahead = done >= goal * frac
  const C = 2 * Math.PI * 52
  const months = monthNames('short')
  const max = Math.max(1, ...stats.yearMonths)
  return (
    <div>
      <h2 className={`${titleClass ?? 'text-xl font-semibold text-neutral-200'} mb-2`}>{tt('{0} hedefin', now.getFullYear())}</h2>
      <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-neutral-800)" strokeWidth="10" />
            <circle cx="60" cy="60" r="52" fill="none" stroke="url(#hedef)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${Math.min(1, shown / goal) * C} ${C}`} style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(.2,.8,.2,1)' }} />
            <defs>
              <linearGradient id="hedef">
                <stop offset="0" stopColor="#22c55e" />
                <stop offset="1" stopColor="#00c0fa" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <b className="text-3xl font-black text-neutral-50 tabular-nums">{done}</b>
            <span className="text-xs text-neutral-400">/ {goal}</span>
          </span>
        </div>
        <div className="min-w-[220px] flex-1">
          <p className={`text-base font-bold ${done >= goal ? 'text-emerald-300' : ahead ? 'text-emerald-300' : 'text-amber-300'}`}>
            {done >= goal ? tt('Hedefini tamamladın! 🎉') : ahead ? tt('Hedefin önündesin') : tt('Biraz gerideysin')}
          </p>
          <p className="text-sm text-neutral-400 mt-1">
            {tt('Bu hızla yıl sonunda ~{0}.', projected)}
            {need > 0 && ' ' + tt('Kalan {0} için haftada {1} izlemen lazım.', need, (need / weeksLeft).toFixed(1).replace('.', ','))}
          </p>
          <div className="mt-3 flex items-end gap-1 h-12 max-w-md">
            {stats.yearMonths.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${months[i]}: ${v}`}>
                <div className="w-full rounded-t-[3px]" style={{ height: `${Math.max(v ? 8 : 3, (v / max) * 100)}%`, background: i <= now.getMonth() ? 'linear-gradient(180deg,#00c0fa,#015eea)' : 'var(--color-neutral-800)' }} />
              </div>
            ))}
          </div>
        </div>
        <Link to="/arsivlerim?sekme=ekstralar" className="text-xs text-neutral-500 hover:text-neutral-200 self-start">
          {tt('Hedefi değiştir')}
        </Link>
      </div>
    </div>
  )
}
