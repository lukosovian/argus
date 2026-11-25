// "Son açtıkların" (v1.26, Y21): detay penceresi açılan son kayıtlar — arama kutusu boşken en üstte gelir.
// Kayıt id'leri her profilde ayrı olduğu için tek liste yeter; gösterirken o anki arşivin kayıtlarına göre süzülür.
const KEY = 'argus_son_acilanlar'
const MAX = 40
export const RECENT_OPENED_EVENT = 'argus-son-acilanlar'

export function recentOpened(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* kapalı/dolu — sadece hatırlanmaz */
  }
  window.dispatchEvent(new Event(RECENT_OPENED_EVENT))
}

export function rememberOpened(rowId: string) {
  if (!rowId) return
  const cur = recentOpened()
  if (cur[0] === rowId) return
  write([rowId, ...cur.filter((x) => x !== rowId)])
}

export function forgetOpened(rowId: string) {
  write(recentOpened().filter((x) => x !== rowId))
}

export function clearOpened() {
  write([])
}
