import { useMemo, useState } from 'react'
import { useProfiles } from '../../hooks/useProfiles'
import { useToast } from '../../hooks/useToast'
import { useStore } from '../../lib/useProfileStore'
import { fold } from '../../lib/games'
import { tt } from '../../lib/i18n'
import { biletPeopleByDay, saveBilet, splitPeople, useBiletler, type Bilet } from '../../lib/bilet'
import { entryEnd } from '../../lib/dateRange'
import Icon from '../Icon'

// "Birlikte izledik" (v1.25): bir yapımı kiminle izlediğin, her izleyiş için ayrı. Biletlerim'deki "Kiminle" alanı
// gibi serbest isim; öneri olarak ARGUS'taki diğer profiller, biletlerdeki kişiler ve daha önce yazdığın isimler gelir.
// Bilet kaydedilince biletteki kişiler o günün izlemesine buraya da eklenir (lib/bilet › linkBiletKiminle).
// Kayıt: profilin 'birlikte-izledik' deposu → { [rowId]: { [izleme tarihi ya da 'genel']: string[] } }.
// Birlikte izle sayfası seçili profille izlediklerini buradan sayar.

export type BirlikteStore = Record<string, Record<string, string[]>>
export const BIRLIKTE_STORE = 'birlikte-izledik'

export function useBirlikte(enabled = true) {
  return useStore<BirlikteStore>(BIRLIKTE_STORE, enabled)
}

// İsim önerileri (O1, v1.27): bilet formundaki "Kiminle" ile buradaki kutu aynı listeyi gösterir — diğer profiller,
// biletlerde yazılan kişiler ve "Kiminle izledin?" kayıtları (harf farkı önemsiz, tekrarsız).
export function namesFrom(profiles: { id: string; username?: string }[], activeProfileId: string | null | undefined, birlikte: BirlikteStore | null | undefined, biletler: Bilet[], extra: string[] = []) {
  const out = new Map<string, string>()
  const put = (n: string) => {
    const k = fold(n)
    if (k && !out.has(k)) out.set(k, n)
  }
  for (const p of profiles) if (p.id !== activeProfileId && p.username) put(p.username)
  for (const b of biletler) for (const n of splitPeople(b.withWho)) put(n)
  for (const byDate of Object.values(birlikte ?? {})) for (const names of Object.values(byDate ?? {})) for (const n of names ?? []) put(n)
  for (const n of extra) put(n)
  return [...out.values()]
}
export function usePeopleSuggestions(extra?: string[]) {
  const { profiles, activeProfileId } = useProfiles()
  const { data } = useBirlikte()
  const { data: biletler } = useBiletler()
  const key = JSON.stringify(extra ?? [])
  return useMemo(
    () => namesFrom(profiles, activeProfileId, data, Object.values(biletler?.items ?? {}), JSON.parse(key) as string[]),
    [profiles, activeProfileId, data, biletler, key],
  )
}

// İzleme kaydının günü: "2024-03-01", aralıkta bitiş günü ("… → 2024-03-05"); 'genel' günsüz
const dayOf = (k: string) => (k === 'genel' ? '' : entryEnd(k) || k.slice(0, 10))

// Biletle bağlantı: kullanıcı "bir bilete kimle izlediğimi girdiysem detay penceresindeki kısımda da göreyim,
// birbirine bağlı değil mi" dedi. Bu yapımın geçmiş biletlerindeki kişiler, aynı günün izlemesinde okunurken
// birleştirilir (eski biletler depoya hiç yazmamıştı — veriye dokunmadan görünür olur). Buradan bir isim
// eklenince o günün biletine de yazılır, biletten gelen bir ismi kaldırmak biletten de çıkarır.
export default function KiminleIzledin({ rowId, dates, label }: { rowId: string; dates: string[]; label: (d: string) => string }) {
  const { notify } = useToast()
  const { data, update } = useBirlikte()
  const { data: biletData } = useBiletler()
  const [open, setOpen] = useState<string | null>(null)
  const [text, setText] = useState('')
  const mine = useMemo(() => data?.[rowId] ?? {}, [data, rowId])
  const tickets = useMemo(() => biletPeopleByDay(biletData?.items, rowId), [biletData, rowId])
  // Gösterilen satırlar: izleme tarihleri (yoksa 'genel') + hiçbir izleme tarihine denk gelmeyen bilet günleri
  const keys = useMemo(() => {
    const base = dates.length ? dates : ['genel']
    const days = new Set(base.map(dayOf))
    const extra = [...new Set(tickets.filter((t) => t.names.length && !days.has(t.day)).map((t) => t.day))]
    const list = extra.length && !dates.length && !(mine.genel ?? []).length ? [] : base
    return [...list, ...extra]
  }, [dates, tickets, mine])
  // Öneriler: diğer profiller + biletlerdeki kişiler + başka kayıtlarda yazılmış isimler
  const suggestions = usePeopleSuggestions()

  // Bir satırın isimleri: kendi kaydı + (aralık/gün farkı) aynı güne yazılmış kayıt + o günün biletleri
  function namesOf(k: string) {
    const day = dayOf(k)
    const out: { name: string; ticket: boolean }[] = []
    const seen = new Set<string>()
    const put = (n: string, ticket: boolean) => {
      const f = fold(n)
      if (!f || seen.has(f)) return
      seen.add(f)
      out.push({ name: n, ticket })
    }
    for (const n of mine[k] ?? []) put(n, false)
    if (day && day !== k) for (const n of mine[day] ?? []) put(n, false)
    const tNames = new Set(tickets.filter((t) => day && t.day === day).flatMap((t) => t.names.map(fold)))
    for (const t of tickets) if (day && t.day === day) for (const n of t.names) put(n, false)
    return out.map((x) => ({ ...x, ticket: tNames.has(fold(x.name)) }))
  }

  async function saveStore(key: string, names: string[], alsoKey?: string, dropAlso?: string) {
    await update((cur) => {
      const row = { ...(cur[rowId] ?? {}) }
      if (names.length) row[key] = names
      else delete row[key]
      // Aynı güne başka anahtarla yazılmış (ör. biletten) isim de silinsin
      if (alsoKey && dropAlso && row[alsoKey]) {
        const left = row[alsoKey].filter((n) => fold(n) !== fold(dropAlso))
        if (left.length) row[alsoKey] = left
        else delete row[alsoKey]
      }
      const next = { ...cur }
      if (Object.keys(row).length) next[rowId] = row
      else delete next[rowId]
      return next
    })
  }
  // O günün biletlerinin "Kiminle" alanı (ad ekle / çıkar)
  async function writeTickets(day: string, fn: (names: string[]) => string[]) {
    for (const t of tickets) {
      if (t.day !== day) continue
      const next = fn(t.names)
      if (next.length === t.names.length && next.every((n, i) => n === t.names[i])) continue
      await saveBilet(t.id, { withWho: next.length ? next.join(', ') : null })
    }
  }
  async function remove(k: string, name: string) {
    const day = dayOf(k)
    const own = (mine[k] ?? []).filter((x) => fold(x) !== fold(name))
    const prevTickets = tickets.filter((t) => t.day === day).map((t) => ({ id: t.id, withWho: t.withWho }))
    const prevStore = { k: mine[k] ?? [], d: day && day !== k ? (mine[day] ?? []) : null }
    try {
      await saveStore(k, own, day && day !== k ? day : undefined, name)
      const fromTicket = day ? tickets.some((t) => t.day === day && t.names.some((n) => fold(n) === fold(name))) : false
      if (fromTicket) {
        await writeTickets(day, (ns) => ns.filter((n) => fold(n) !== fold(name)))
        notify(tt('{0} bu günün sinema biletinden de kaldırıldı.', name), 'info', {
          action: {
            label: tt('Geri al'),
            onClick: async () => {
              try {
                for (const t of prevTickets) await saveBilet(t.id, { withWho: t.withWho || null })
                await update((cur) => {
                  const row = { ...(cur[rowId] ?? {}) }
                  if (prevStore.k.length) row[k] = prevStore.k
                  if (prevStore.d && prevStore.d.length) row[day] = prevStore.d
                  return { ...cur, [rowId]: row }
                })
              } catch {
                notify(tt('Geri alınamadı'), 'danger')
              }
            },
          },
        })
      }
    } catch {
      notify(tt('Kaydedilemedi.'), 'danger')
    }
  }
  async function add(key: string) {
    const parts = text
      .split(',')
      .map((s) => s.trim().slice(0, 40))
      .filter(Boolean)
    setText('')
    setOpen(null)
    if (!parts.length) return
    const shown = namesOf(key).map((x) => fold(x.name))
    const cur = mine[key] ?? []
    const seen = new Set([...cur.map(fold), ...shown])
    const added: string[] = []
    for (const p of parts) {
      if (seen.has(fold(p))) continue
      seen.add(fold(p))
      added.push(p)
    }
    if (!added.length) return
    try {
      await saveStore(key, [...cur, ...added].slice(0, 12))
      // O günün bileti varsa kişiler bilete de yazılır
      const day = dayOf(key)
      if (day) await writeTickets(day, (ns) => [...ns, ...added.filter((a) => !ns.some((n) => fold(n) === fold(a)))].slice(0, 12))
    } catch {
      notify(tt('Kaydedilemedi.'), 'danger')
    }
  }

  if (!data) return null
  return (
    <div>
      <p className="text-xs text-neutral-500 mb-1.5">{tt('Kiminle izledin?')}</p>
      <div className="space-y-1.5">
        {keys.map((k) => {
          const names = namesOf(k)
          return (
            <div key={k} className="flex flex-wrap items-center gap-1.5">
              {keys.length > 1 && <span className="text-[11px] text-neutral-500 tabular-nums mr-0.5">{label(k)}:</span>}
              {names.map(({ name: n, ticket }) => (
                <span
                  key={n}
                  title={ticket ? tt('Sinema biletinde de yazılı') : undefined}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 border border-violet-400/30 px-2 py-0.5 text-xs text-violet-100"
                >
                  {ticket && <Icon name="ticket" className="h-3 w-3 text-violet-300/80" />}
                  {n}
                  <button onClick={() => void remove(k, n)} className="text-violet-300/70 hover:text-red-300" title={ticket ? tt('Kaldır (biletten de)') : tt('Kaldır')} aria-label={tt('{0} kişisini kaldır', n)}>
                    <Icon name="close" className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              {open === k ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void add(k)
                  }}
                  className="inline-flex"
                >
                  <input
                    autoFocus
                    list={`kiminle-${rowId}`}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={() => void add(k)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation()
                        setText('')
                        setOpen(null)
                      }
                    }}
                    placeholder={tt('ör. Ece, Can')}
                    className="w-36 rounded-full bg-neutral-950 border border-neutral-700 focus:border-[#00c0fa] px-2.5 py-0.5 text-xs text-neutral-100 outline-none"
                  />
                </form>
              ) : (
                <button onClick={() => setOpen(k)} className="rounded-full border border-dashed border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:text-neutral-100 hover:border-neutral-500">
                  {names.length ? '+' : tt('+ Kiminle?')}
                </button>
              )}
            </div>
          )
        })}
      </div>
      <datalist id={`kiminle-${rowId}`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}
