import { useState } from 'react'
import { todayIso } from '../../types'
import { useEscape } from '../../hooks/useEscape'
import { tt } from '../../lib/i18n'
import DateField from '../DateField'

// Seçim çubuğundaki "İzledim…" (v1.26, Y20): seçili kayıtların hepsine aynı izleme tarihini ekler (Bugün / Dün / bir
// gün / sadece yıl), durumları İzlendi olur. Asıl iş BoardView.markWatched'da (geri alınabilir).
function shift(days: number) {
  const t = new Date()
  t.setDate(t.getDate() - days)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export default function WatchedButton({ count, disabled, onPick }: { count: number; disabled?: boolean; onPick: (entry: string) => void }) {
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState('')
  const [year, setYear] = useState('')
  useEscape(open, () => setOpen(false))
  const thisYear = new Date().getFullYear()
  const yearOk = /^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= thisYear
  const pick = (entry: string) => {
    setOpen(false)
    setDay('')
    setYear('')
    onPick(entry)
  }
  const quick = 'rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:border-[#00c0fa] hover:text-[#7fdcff] transition'
  const input = 'min-w-0 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-[#00c0fa]'
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={tt('Seçili kayıtlara izleme tarihi ekle ve İzlendi yap')}
        className="flex items-center gap-1.5 text-sm text-emerald-300 hover:bg-emerald-500/10 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M5 12l5 5L20 7" />
        </svg>
        {tt('İzledim…')}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 z-40 w-72 rounded-xl border border-neutral-800 bg-neutral-900 p-3 shadow-lg space-y-3">
            <p className="text-[11px] text-neutral-500">{tt('Seçili {0} kaydın izleme tarihine eklenir, durumları İzlendi olur.', count)}</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => pick(todayIso())} className={quick}>
                {tt('Bugün')}
              </button>
              <button onClick={() => pick(shift(1))} className={quick}>
                {tt('Dün')}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <DateField value={day} max={todayIso()} onChange={setDay} className="flex-1" inputClassName="text-xs" ariaLabel={tt('Bir gün seç')} onEnter={() => day && pick(day)} />
              <button disabled={!day || day > todayIso()} onClick={() => pick(day)} className="rounded-md bg-[#00c0fa] px-2.5 py-1 text-xs font-medium text-neutral-950 disabled:opacity-40">
                {tt('Ekle')}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-neutral-400">{tt('Sadece yıl')}</span>
              <input
                inputMode="numeric"
                maxLength={4}
                value={year}
                placeholder={String(thisYear - 1)}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && yearOk && pick(year)}
                className={`${input} w-20`}
              />
              <button disabled={!yearOk} onClick={() => pick(year)} className="rounded-md bg-[#00c0fa] px-2.5 py-1 text-xs font-medium text-neutral-950 disabled:opacity-40">
                {tt('Ekle')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
