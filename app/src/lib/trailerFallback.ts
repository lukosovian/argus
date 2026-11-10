// Oynatılamayan fragmanlar (YouTube "Video kullanılamıyor": gömme kapalı, bölge/yaş kısıtı, silinmiş).
// Kullanıcı "video kullanılamıyor yazıyor, güzel durmuyor; ikinci bir video varsa onu göstersin ya da
// hiç göstermesin" dedi: oynatıcı hata verince video gizlenir, aynı yapımın sıradaki fragmanı denenir;
// hiçbiri oynamazsa kapak görseli kalır. Bozuk bulunanlar bu cihazda hatırlanır, bir daha denenmez.
import { api } from './api'

export interface TrailerSource {
  rowId?: string
  mediaType?: 'movie' | 'tv'
  tmdbId?: number
}

const KEY = 'argus_kirik_fragman'
// bozuk video → yerine oynayan video ('' = yerine oynayan yok)
let broken: Record<string, string> = {}
try {
  broken = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}
} catch {
  broken = {}
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(broken))
  } catch {
    // depolama kapalıysa yalnızca bu oturumda hatırlanır
  }
}

// (Önbellek: sunucuyla eşitlenmez, bkz. uiPrefs.ts SKIP.)
// Daha önce bozuk bulunduysa yerine geçen videoyu (ya da null = gösterme) döndürür.
export function resolveTrailer(videoId: string | null): string | null {
  let id = videoId
  for (let i = 0; id && i < 10 && id in broken; i++) id = broken[id] || null
  return id
}

function isBroken(id: string) {
  return id in broken
}

const pending = new Map<string, Promise<string | null>>()

// `failedId` oynamadı: bozuk olarak işaretler ve aynı yapımın oynayabilecek başka bir fragmanını arar.
export function replaceTrailer(failedId: string, source?: TrailerSource): Promise<string | null> {
  if (!(failedId in broken)) {
    broken[failedId] = ''
    save()
  }
  if (!source || (!source.rowId && !source.tmdbId)) return Promise.resolve(null)
  const k = `${failedId}|${source.rowId ?? ''}|${source.mediaType ?? ''}|${source.tmdbId ?? ''}`
  let p = pending.get(k)
  if (!p) {
    p = api
      .trailerCandidates(source)
      .then(({ keys }) => keys.find((key) => key !== failedId && !isBroken(key)) ?? null)
      .catch(() => null)
      .then((next) => {
        pending.delete(k)
        if (next) {
          broken[failedId] = next
          save()
        }
        return next
      })
    pending.set(k, p)
  }
  return p
}
