// Ne İzlesem › "Bu hafta önerme" (v1.26, Y23): arşivdeki bir yapım 7 gün seçiciye girmez, süre dolunca kendiliğinden
// geri döner. { kayıtId: bitiş zamanı (ms) } — kayıt id'leri her profilde ayrı olduğu için tek liste yeter.
const KEY = 'argus_pick_snooze'
export const SNOOZE_DAYS = 7

function read(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {}
  } catch {
    return {}
  }
}

// Süresi dolmamış ertelemeler (dolanlar bu arada temizlenir)
export function snoozedIds(now = Date.now()): Set<string> {
  const all = read()
  const live = Object.entries(all).filter(([, until]) => typeof until === 'number' && until > now)
  if (live.length !== Object.keys(all).length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(live)))
    } catch {
      /* önemsiz */
    }
  }
  return new Set(live.map(([id]) => id))
}

export function snoozePick(rowId: string, days = SNOOZE_DAYS) {
  const all = read()
  all[rowId] = Date.now() + days * 864e5
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* önemsiz */
  }
}

export function unsnoozePick(rowId: string) {
  const all = read()
  delete all[rowId]
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* önemsiz */
  }
}
