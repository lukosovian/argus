import { useMemo, useState } from 'react'
import { useProfiles } from '../../hooks/useProfiles'
import { useToast } from '../../hooks/useToast'
import { useStore } from '../../lib/useProfileStore'
import { fold } from '../../lib/games'
import { tt } from '../../lib/i18n'
import { splitPeople, useBiletler, type Bilet } from '../../lib/bilet'

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

export default function KiminleIzledin({ rowId, dates, label }: { rowId: string; dates: string[]; label: (d: string) => string }) {
  const { notify } = useToast()
  const { data, update } = useBirlikte()
  const [open, setOpen] = useState<string | null>(null)
  const [text, setText] = useState('')
  const keys = dates.length ? dates : ['genel']
  const mine = data?.[rowId] ?? {}
  // Öneriler: diğer profiller + biletlerdeki kişiler + başka kayıtlarda yazılmış isimler
  const suggestions = usePeopleSuggestions()

  async function save(key: string, names: string[]) {
    try {
      await update((cur) => {
        const row = { ...(cur[rowId] ?? {}) }
        if (names.length) row[key] = names
        else delete row[key]
        const next = { ...cur }
        if (Object.keys(row).length) next[rowId] = row
        else delete next[rowId]
        return next
      })
    } catch {
      notify(tt('Kaydedilemedi.'), 'danger')
    }
  }
  function add(key: string) {
    const parts = text
      .split(',')
      .map((s) => s.trim().slice(0, 40))
      .filter(Boolean)
    setText('')
    setOpen(null)
    if (!parts.length) return
    const cur = mine[key] ?? []
    const seen = new Set(cur.map(fold))
    const next = [...cur]
    for (const p of parts) {
      if (seen.has(fold(p))) continue
      seen.add(fold(p))
      next.push(p)
    }
    if (next.length !== cur.length) void save(key, next.slice(0, 12))
  }

  if (!data) return null
  return (
    <div>
      <p className="text-xs text-neutral-500 mb-1.5">{tt('Kiminle izledin?')}</p>
      <div className="space-y-1.5">
        {keys.map((k) => {
          const names = mine[k] ?? []
          return (
            <div key={k} className="flex flex-wrap items-center gap-1.5">
              {keys.length > 1 && <span className="text-[11px] text-neutral-500 tabular-nums mr-0.5">{label(k)}:</span>}
              {names.map((n) => (
                <span key={n} className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 border border-violet-400/30 px-2 py-0.5 text-xs text-violet-100">
                  {n}
                  <button onClick={() => void save(k, names.filter((x) => x !== n))} className="text-violet-300/70 hover:text-red-300" title={tt('Kaldır')} aria-label={tt('{0} kişisini kaldır', n)}>
                    ×
                  </button>
                </span>
              ))}
              {open === k ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    add(k)
                  }}
                  className="inline-flex"
                >
                  <input
                    autoFocus
                    list={`kiminle-${rowId}`}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={() => add(k)}
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
