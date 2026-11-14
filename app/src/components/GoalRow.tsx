import { useEffect, useState } from 'react'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useProfileStats } from '../lib/profileStats'
import { monthNames, tt } from '../lib/i18n'

// Yıllık hedef (v1.23.4; v1.23.5'ten beri ana sayfada değil İstatistikler'de — kullanıcı öyle istedi): dolan halka, hıza göre
// tahmin, ay ay çubuklar. Hedef burada, kartın içinden konur ve değiştirilir (0 = kapalı).
export default function GoalRow({ titleClass }: { titleClass?: string }) {
  const { settings, saveSettings } = useHomeSettings()
  // Flashback'te gelecek yıl için konan hedef, o yıl gelince geçerli olur (v1.24)
  const goal = settings.yearGoalNext && settings.yearGoalNext.year === String(new Date().getFullYear()) ? settings.yearGoalNext.n : (settings.yearGoal ?? 0)
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState('')
  const stats = useProfileStats(true)
  const [shown, setShown] = useState(0)
  const done = stats?.yearDone ?? 0
  useEffect(() => {
    const t = setTimeout(() => setShown(done), 80)
    return () => clearTimeout(t)
  }, [done])
  const save = () => {
    const n = Math.max(0, Math.min(2000, Math.round(Number(draft) || 0)))
    saveSettings({ ...settings, yearGoal: n, ...(settings.yearGoalNext?.year === String(new Date().getFullYear()) ? { yearGoalNext: undefined } : {}) })
    setEdit(false)
  }
  const editor = (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        max={2000}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => (e.key === 'Enter' ? save() : e.key === 'Escape' ? setEdit(false) : undefined)}
        className="w-20 rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]"
      />
      <button onClick={save} className="rounded-lg bg-[#00c0fa]/15 border border-[#00c0fa]/40 px-2.5 py-1 text-xs font-semibold text-[#7fdcff] hover:bg-[#00c0fa]/25 transition">
        {tt('Kaydet')}
      </button>
    </span>
  )
  const startEdit = () => {
    setDraft(String(goal || 50))
    setEdit(true)
  }
  if (!goal)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/30 px-5 py-4">
        <span className="text-sm text-neutral-300 flex-1 min-w-[200px]">{tt('{0} için bir izleme hedefi koy: kaç yapım bitirmek istiyorsun?', new Date().getFullYear())}</span>
        {edit ? editor : (
          <button onClick={startEdit} className="rounded-full border border-neutral-700 px-3.5 py-1.5 text-xs font-semibold text-neutral-200 hover:border-[#00c0fa]/60 transition">
            {tt('Hedef koy')}
          </button>
        )}
      </div>
    )
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
            {done >= goal ? tt('Hedefini tamamladın!') : ahead ? tt('Hedefin önündesin') : tt('Biraz gerideysin')}
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
        <span className="self-start text-xs">
          {edit ? editor : (
            <button onClick={startEdit} className="text-neutral-500 hover:text-neutral-200 transition">
              {tt('Hedefi değiştir')}
            </button>
          )}
        </span>
      </div>
    </div>
  )
}
