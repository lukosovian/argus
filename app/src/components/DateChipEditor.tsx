import { useState } from 'react'
import { formatEntry, isFullDate, isUnknownDate, makeEntry, parseEntry, UNKNOWN_DATE } from '../lib/dateRange'
import { tt, monthNames, dayNames } from '../lib/i18n'

const TR_MONTHS = monthNames()
const TR_DAYS = dayNames('two')

function fmt(iso: string): string {
  const [y, m, day] = iso.split('-')
  return y && m && day ? `${day}.${m}.${y}` : iso
}
function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function todayIso() {
  const t = new Date()
  return iso(t.getFullYear(), t.getMonth(), t.getDate())
}

// Küçük takvim — tarayıcının kendi tarih seçicisi yerine. Kullanıcı "geride bir aya gidiyorum, o ayda
// bugünün gününü de seçiyor" dedi: Chrome'un seçicisinde ay/yıl değiştirmek de değeri değiştiriyordu ve
// biz her değişikliği hemen ekliyorduk. Burada ay/yıl gezmek hiçbir şey seçmez; sadece güne tıklamak seçer.
// Başlığa (ay adına) tıklayınca yıl → ay seçimi açılır (eski yıllara hızlı gitmek için).
function MiniCalendar({
  selected,
  rangeStart,
  onPick,
  initial,
}: {
  selected: { start: string; end?: string | null } | null
  rangeStart: string | null
  onPick: (d: string) => void
  initial: string
}) {
  const [cursor, setCursor] = useState(() => ({ y: Number(initial.slice(0, 4)), m: Number(initial.slice(5, 7)) - 1 }))
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days')
  const [hover, setHover] = useState<string | null>(null)
  const today = todayIso()
  const first = new Date(cursor.y, cursor.m, 1)
  const lead = (first.getDay() + 6) % 7
  const daysIn = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const shift = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
  }
  // Vurgulanacak aralık: kayıtlı seçim ya da (bitiş seçilirken) başlangıç → fareyle üzerine gelinen gün
  const lo = rangeStart ? (hover && hover < rangeStart ? hover : rangeStart) : selected?.start
  const hi = rangeStart ? (hover && hover > rangeStart ? hover : rangeStart) : (selected?.end ?? selected?.start)
  const nav = 'h-7 w-7 rounded-md text-neutral-400 hover:text-neutral-50 hover:bg-neutral-800 transition'
  const yearsFrom = Math.floor(cursor.y / 12) * 12

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-2 select-none">
      <div className="flex items-center justify-between mb-1.5">
        <button type="button" className={nav} onClick={() => (mode === 'days' ? shift(-1) : mode === 'months' ? setCursor({ ...cursor, y: cursor.y - 1 }) : setCursor({ ...cursor, y: cursor.y - 12 }))}>
          ‹
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'days' ? 'months' : mode === 'months' ? 'years' : 'days')}
          className="text-sm font-semibold text-neutral-100 hover:text-[#00c0fa] px-2 py-0.5 rounded transition"
          title={tt('Ay / yıl seç')}
        >
          {mode === 'days' ? `${TR_MONTHS[cursor.m]} ${cursor.y}` : mode === 'months' ? cursor.y : `${yearsFrom} – ${yearsFrom + 11}`}
        </button>
        <button type="button" className={nav} onClick={() => (mode === 'days' ? shift(1) : mode === 'months' ? setCursor({ ...cursor, y: cursor.y + 1 }) : setCursor({ ...cursor, y: cursor.y + 12 }))}>
          ›
        </button>
      </div>

      {mode === 'years' && (
        <div className="grid grid-cols-4 gap-1">
          {Array.from({ length: 12 }, (_, i) => yearsFrom + i).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                setCursor({ ...cursor, y })
                setMode('months')
              }}
              className={`py-2 rounded-md text-sm transition ${y === cursor.y ? 'bg-[#00c0fa]/15 text-[#7fdcff]' : 'text-neutral-300 hover:bg-neutral-800'}`}
            >
              {y}
            </button>
          ))}
        </div>
      )}
      {mode === 'months' && (
        <div className="grid grid-cols-3 gap-1">
          {TR_MONTHS.map((name, m) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setCursor({ ...cursor, m })
                setMode('days')
              }}
              className={`py-2 rounded-md text-sm transition ${m === cursor.m ? 'bg-[#00c0fa]/15 text-[#7fdcff]' : 'text-neutral-300 hover:bg-neutral-800'}`}
            >
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
      )}
      {mode === 'days' && (
        <div className="grid grid-cols-7 gap-0.5 text-center" onMouseLeave={() => setHover(null)}>
          {TR_DAYS.map((d) => (
            <span key={d} className="text-[10px] text-neutral-500 py-0.5">
              {d}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length: daysIn }, (_, i) => {
            const d = iso(cursor.y, cursor.m, i + 1)
            const edge = d === lo || d === hi
            const inRange = lo && hi && d > lo && d < hi
            return (
              <button
                key={d}
                type="button"
                onClick={() => onPick(d)}
                onMouseEnter={() => setHover(d)}
                className={`h-7 rounded-md text-xs tabular-nums transition ${
                  edge
                    ? 'bg-[#00c0fa] text-white font-semibold'
                    : inRange
                      ? 'bg-[#00c0fa]/20 text-neutral-100'
                      : d === today
                        ? 'text-[#7fdcff] ring-1 ring-[#00c0fa]/50 hover:bg-neutral-800'
                        : d > today
                          ? 'text-neutral-600 hover:bg-neutral-800'
                          : 'text-neutral-200 hover:bg-neutral-800'
                }`}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Çoklu Tarih (multidate) alanının ve bölüm bazlı izleme tiklerinin (SeasonsBrowser) ikisinin de
// kullandığı ortak düzenleyici: tarih kutucukları (kaldırılabilir, tıklayınca düzenlenir) + küçük takvim.
// `allowRange`: İzleme Tarihi gibi alanlarda "Bitiş tarihi" anahtarı çıkar — açıkken önce başladığın,
// sonra bitirdiğin güne tıklanır ("başladım → bitirdim", Notion'daki end date; bkz. lib/dateRange.ts).
// Bölüm tiklerinde yok. Seçim bir güne tıklar tıklamaz kaydedilir (ayrı "Ekle" yok): bu bileşen dışarı
// tıklayınca kapanan bir açılır pencerenin içinde de kullanılıyor.
export default function DateChipEditor({
  dates,
  onChange,
  allowRange = false,
  allowApprox = false,
}: {
  dates: string[]
  onChange: (dates: string[]) => void
  autoFocus?: boolean
  allowRange?: boolean
  // "Sadece yıl" ve "Hatırlamıyorum" düğmeleri (İzleme Tarihi gibi alanlarda; bkz. lib/dateRange.ts)
  allowApprox?: boolean
}) {
  // Düzenlenen öğe (listede durur, yeni güne tıklanınca onun yerine geçer)
  const [editing, setEditing] = useState<string | null>(null)
  const [rangeOn, setRangeOn] = useState(false)
  // Bitiş modunda seçilen başlangıç (ikinci tıklama bitişi seçer)
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [calKey, setCalKey] = useState(0)
  // "Sadece yıl" kutusu açık mı, içindeki yıl
  const [yearOpen, setYearOpen] = useState(false)
  const [yearText, setYearText] = useState('')

  const sorted = [...dates].sort()
  const lastFull = sorted.filter(isFullDate).pop()?.split('/').pop()
  const editingYear = editing && !isFullDate(editing) && !isUnknownDate(editing) ? `${editing}-01-01` : null
  const initial = editing && isFullDate(editing) ? parseEntry(editing).start : (editingYear ?? lastFull ?? todayIso())
  const thisYear = new Date().getFullYear()
  const yearNum = Number(yearText)
  const yearValid = /^\d{4}$/.test(yearText) && yearNum >= 1900 && yearNum <= thisYear

  function saveYear() {
    if (!yearValid) return
    save(String(yearNum))
    setYearOpen(false)
  }

  function save(entry: string) {
    const rest = dates.filter((x) => x !== editing && x !== entry)
    onChange([...rest, entry].sort())
    setEditing(null)
    setPendingStart(null)
  }

  function pick(d: string) {
    if (allowRange && rangeOn) {
      if (!pendingStart) {
        setPendingStart(d)
        return
      }
      const [a, b] = pendingStart <= d ? [pendingStart, d] : [d, pendingStart]
      save(makeEntry(a, b))
      return
    }
    save(d)
  }

  function startEdit(d: string) {
    setEditing(d)
    setPendingStart(null)
    setRangeOn(Boolean(parseEntry(d).end))
    setCalKey((k) => k + 1) // takvim o tarihin ayına gitsin
  }

  function cancel() {
    setEditing(null)
    setPendingStart(null)
  }

  const quick = (offset: number) => {
    const t = new Date()
    t.setDate(t.getDate() - offset)
    return iso(t.getFullYear(), t.getMonth(), t.getDate())
  }

  return (
    <div className="space-y-2">
      {sorted.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sorted.map((d) => {
            const e = parseEntry(d)
            const active = editing === d
            return (
              <span
                key={d}
                className={`inline-flex items-center gap-1 text-xs border rounded-full pl-2.5 pr-1.5 py-1 text-neutral-300 ${
                  active ? 'bg-[#00c0fa]/10 border-[#00c0fa]/60' : 'bg-neutral-800 border-neutral-700'
                }`}
              >
                <button type="button" onClick={() => (active ? cancel() : startEdit(d))} title={tt('Bu tarihi düzenle')} className="hover:text-neutral-50 transition">
                  {!isFullDate(d) ? (
                    <span className="italic">{formatEntry(d, fmt)}</span>
                  ) : (
                    <>
                      {fmt(e.start)}
                      {e.end && (
                        <>
                          <span className="text-neutral-500"> → </span>
                          {fmt(e.end)}
                        </>
                      )}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (active) cancel()
                    onChange(dates.filter((x) => x !== d))
                  }}
                  title={tt('Bu tarihi sil')}
                  className="h-4 w-4 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-50 hover:bg-neutral-700 transition"
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-neutral-400 min-w-0">
          {editing
            ? !isFullDate(editing)
              ? tt('{0} — hatırladıysan güne tıkla', formatEntry(editing, fmt))
              : tt('{0}{1} düzenleniyor — yeni güne tıkla', fmt(parseEntry(editing).start), parseEntry(editing).end ? ' → ' + fmt(parseEntry(editing).end!) : '')
            : pendingStart
              ? tt('Başlangıç {0} — şimdi bitirdiğin güne tıkla', fmt(pendingStart))
              : rangeOn
                ? tt('Önce başladığın güne tıkla')
                : tt('Eklemek için bir güne tıkla')}
        </p>
        {allowRange && (
          <label className="flex items-center gap-1.5 shrink-0 cursor-pointer text-[11px] text-neutral-300">
            <span>{tt('Bitiş tarihi')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={rangeOn}
              onClick={() => {
                setRangeOn((v) => !v)
                setPendingStart(null)
              }}
              className={`relative h-4 w-7 rounded-full transition ${rangeOn ? 'bg-[#00c0fa]' : 'bg-neutral-700'}`}
            >
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${rangeOn ? 'left-3.5' : 'left-0.5'}`} />
            </button>
          </label>
        )}
      </div>

      <MiniCalendar
        key={calKey}
        initial={initial}
        selected={editing ? parseEntry(editing) : null}
        rangeStart={pendingStart}
        onPick={pick}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {!rangeOn &&
          [
            [tt('Bugün'), 0],
            [tt('Dün'), 1],
          ].map(([label, off]) => (
            <button
              key={label}
              type="button"
              onClick={() => pick(quick(off as number))}
              className="text-[11px] rounded-md border border-neutral-700 px-2 py-1 text-neutral-300 hover:border-[#00c0fa] hover:text-[#7fdcff] transition"
            >
              {label}
            </button>
          ))}
        {allowApprox && !rangeOn && (
          <>
            <button
              type="button"
              onClick={() => {
                setYearOpen((v) => !v)
                setYearText(editingYear ? editingYear.slice(0, 4) : '')
              }}
              title={tt('Gününü hatırlamıyorsan sadece yılını yaz')}
              className={`whitespace-nowrap text-[11px] rounded-md border px-2 py-1 transition ${
                yearOpen ? 'border-[#00c0fa] text-[#7fdcff]' : 'border-neutral-700 text-neutral-300 hover:border-[#00c0fa] hover:text-[#7fdcff]'
              }`}
            >
              {tt('Sadece yıl')}
            </button>
            {!dates.includes(UNKNOWN_DATE) && (
              <button
                type="button"
                onClick={() => save(UNKNOWN_DATE)}
                title={tt('Ne zaman izlediğini hiç hatırlamıyorsan — İzlendi sayılır, takvime ve yıllık sayımlara girmez')}
                className="whitespace-nowrap text-[11px] rounded-md border border-neutral-700 px-2 py-1 text-neutral-300 hover:border-[#00c0fa] hover:text-[#7fdcff] transition"
              >
                {tt('Hatırlamıyorum')}
              </button>
            )}
          </>
        )}
        {(editing || pendingStart) && (
          <button type="button" onClick={cancel} className="ml-auto text-[11px] text-neutral-400 hover:text-neutral-100">
            {tt('Vazgeç')}
          </button>
        )}
      </div>

      {allowApprox && yearOpen && !rangeOn && (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            inputMode="numeric"
            maxLength={4}
            value={yearText}
            onChange={(e) => setYearText(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                saveYear()
              }
            }}
            placeholder={tt('ör. {0}', thisYear - 5)}
            className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-[#00c0fa]"
          />
          <button
            type="button"
            disabled={!yearValid}
            onClick={saveYear}
            className="text-[11px] rounded-md bg-[#00c0fa] px-2.5 py-1 font-medium text-neutral-950 disabled:opacity-40 transition"
          >
            {tt('Ekle')}
          </button>
          <span className="text-[11px] text-neutral-500">{tt('Günü bilinmiyor, sadece yılı yazılır')}</span>
        </div>
      )}
    </div>
  )
}
