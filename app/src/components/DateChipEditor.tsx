import { useState } from 'react'
import { makeEntry, parseEntry } from '../lib/dateRange'

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const TR_DAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']

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
          title="Ay / yıl seç"
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
}: {
  dates: string[]
  onChange: (dates: string[]) => void
  autoFocus?: boolean
  allowRange?: boolean
}) {
  // Düzenlenen öğe (listede durur, yeni güne tıklanınca onun yerine geçer)
  const [editing, setEditing] = useState<string | null>(null)
  const [rangeOn, setRangeOn] = useState(false)
  // Bitiş modunda seçilen başlangıç (ikinci tıklama bitişi seçer)
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [calKey, setCalKey] = useState(0)

  const sorted = [...dates].sort()
  const initial = editing ? parseEntry(editing).start : (sorted[sorted.length - 1]?.split('/').pop() ?? todayIso())

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
                <button type="button" onClick={() => (active ? cancel() : startEdit(d))} title="Bu tarihi düzenle" className="hover:text-neutral-50 transition">
                  {fmt(e.start)}
                  {e.end && (
                    <>
                      <span className="text-neutral-500"> → </span>
                      {fmt(e.end)}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (active) cancel()
                    onChange(dates.filter((x) => x !== d))
                  }}
                  title="Bu tarihi sil"
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
            ? `${fmt(parseEntry(editing).start)}${parseEntry(editing).end ? ' → ' + fmt(parseEntry(editing).end!) : ''} düzenleniyor — yeni güne tıkla`
            : pendingStart
              ? `Başlangıç ${fmt(pendingStart)} — şimdi bitirdiğin güne tıkla`
              : rangeOn
                ? 'Önce başladığın güne tıkla'
                : 'Eklemek için bir güne tıkla'}
        </p>
        {allowRange && (
          <label className="flex items-center gap-1.5 shrink-0 cursor-pointer text-[11px] text-neutral-300">
            <span>Bitiş tarihi</span>
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

      <div className="flex items-center gap-1.5">
        {!rangeOn &&
          [
            ['Bugün', 0],
            ['Dün', 1],
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
        {(editing || pendingStart) && (
          <button type="button" onClick={cancel} className="ml-auto text-[11px] text-neutral-400 hover:text-neutral-100">
            Vazgeç
          </button>
        )}
      </div>
    </div>
  )
}
