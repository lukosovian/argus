import { useEffect, useMemo, useState } from 'react'
import { api, type WatchProviders } from '../../lib/api'
import { useRows } from '../../hooks/useRows'
import { useBoard } from '../../hooks/useBoard'
import { useToast } from '../../hooks/useToast'
import { tt, getLang } from '../../lib/i18n'
import { readStore, writeStore } from '../../lib/profileStore'
import { dayIso, minutesInWindow } from '../../lib/watchWindow'
import type { WatchedMap } from '../../types'

// Abonelik maliyeti (Abonelik sayfası): her abone olunan platform için aylık ücret girilir, son 30 günde o
// platformdaki yapımlardan ne kadar izlendiği bulunur, "saat başı kaç ₺" hesaplanır. Ücretler profilin
// 'abonelik' deposunda ({ prices: { [platformId]: ücret } }) saklanır.
// Bir yapımın platformu: izlenmemiş kayıtlarda sunucunun takip ettiği liste (row-platforms), izlenmişlerde
// kaydın TMDB platform bilgisi (tmdb-extras) — o da bu tarayıcıda 7 gün saklanır ki her açılışta sorulmasın.

interface AbonelikStore {
  prices?: Record<string, number>
}
type Platform = { id: number; name: string; logo: string | null }

const PROV_TTL = 7 * 24 * 3600e3
const MAX_LOOKUPS = 40
const provCacheKey = (profileId: string) => `argus_abonelik_platform_${profileId}`

function readProvCache(profileId: string): Record<string, { names: string[]; at: number }> {
  try {
    const raw = localStorage.getItem(provCacheKey(profileId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}
function writeProvCache(profileId: string, cache: Record<string, { names: string[]; at: number }>) {
  try {
    localStorage.setItem(provCacheKey(profileId), JSON.stringify(cache))
  } catch {
    /* dolu/kapalı — sadece yeniden sorulur */
  }
}

// TMDB platform adı → platform listesindeki kimlik ("Netflix basic with Ads" de Netflix sayılır)
function idsForNames(names: string[], platforms: Platform[]): number[] {
  const out = new Set<number>()
  for (const n of names) {
    const low = n.toLocaleLowerCase('tr')
    const p = platforms.find((x) => x.name.toLocaleLowerCase('tr') === low) ?? platforms.find((x) => low.startsWith(x.name.toLocaleLowerCase('tr')))
    if (p) out.add(p.id)
  }
  return [...out]
}

const fmtMoney = (n: number) => n.toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: n < 10 ? 1 : 0 })
const fmtHours = (min: number) => (min / 60).toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: min < 600 ? 1 : 0 })

export default function SubscriptionCost({ boardId, profileId, myPlatforms }: { boardId: string; profileId: string; myPlatforms: number[] }) {
  const { notify } = useToast()
  const { rows, loading: rowsLoading } = useRows(boardId)
  const { board } = useBoard(boardId)
  const [watched, setWatched] = useState<WatchedMap | null>(null)
  const [platforms, setPlatforms] = useState<Platform[] | null>(null)
  const [rowPlatforms, setRowPlatforms] = useState<Record<string, number[]> | null>(null)
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [extraNames, setExtraNames] = useState<Record<string, string[]>>(() => {
    const c = readProvCache(profileId)
    return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.names]))
  })
  const [lookupBusy, setLookupBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([api.getWatched().catch(() => ({}) as WatchedMap), api.getPlatforms(), api.getRowPlatforms(boardId).catch(() => ({ ready: false, platforms: {} }))])
      .then(([w, p, rp]) => {
        if (!alive) return
        setWatched(w)
        setPlatforms(p.items ?? [])
        setRowPlatforms(rp.platforms ?? {})
      })
      .catch(() => alive && setFailed(true))
    readStore<AbonelikStore>(profileId, 'abonelik')
      .then((s) => alive && setPrices(s.prices && typeof s.prices === 'object' ? s.prices : {}))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [boardId, profileId])

  // Son 30 gün (bugün dahil)
  const win = useMemo(() => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 29)
    return { from: dayIso(from), to: dayIso(to) }
  }, [])

  // Son 30 günde izlenen yapımlar ve süreleri
  const recent = useMemo(() => {
    if (!board || !watched) return []
    const out: { rowId: string; minutes: number }[] = []
    for (const r of rows) {
      const m = minutesInWindow(board, r, watched, win)
      if (m.minutes > 0) out.push({ rowId: r.id, minutes: m.minutes })
    }
    return out
  }, [board, rows, watched, win])

  // Platformu bilinmeyen (izlenmiş) yapımların platformunu TMDB'den sor (en çok 40, aynı anda 3)
  const missing = useMemo(() => (rowPlatforms ? recent.filter((x) => !rowPlatforms[x.rowId] && !extraNames[x.rowId]).map((x) => x.rowId) : []), [recent, rowPlatforms, extraNames])
  const missingKey = missing.join(',')
  useEffect(() => {
    if (!missing.length) return
    let alive = true
    setLookupBusy(true)
    const queue = missing.slice(0, MAX_LOOKUPS)
    const found: Record<string, string[]> = {}
    const worker = async () => {
      while (alive && queue.length) {
        const rowId = queue.shift()!
        try {
          const ex = await api.getTmdbExtras(boardId, rowId)
          if (ex.needsApiKey) return
          const prov: WatchProviders | null | undefined = ex.providers
          found[rowId] = (prov?.flatrate ?? []).map((p) => p.name)
        } catch {
          found[rowId] = []
        }
      }
    }
    Promise.all([worker(), worker(), worker()]).then(() => {
      if (!alive) return
      const cache = readProvCache(profileId)
      const now = Date.now()
      for (const [k, v] of Object.entries(found)) cache[k] = { names: v, at: now }
      // Süresi geçenler atılır
      for (const [k, v] of Object.entries(cache)) if (now - v.at > PROV_TTL) delete cache[k]
      writeProvCache(profileId, cache)
      setExtraNames((prev) => ({ ...prev, ...found }))
      setLookupBusy(false)
    })
    return () => {
      alive = false
      setLookupBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, boardId, profileId])

  const perPlatform = useMemo(() => {
    const map = new Map<number, { minutes: number; titles: number }>()
    let unknownMinutes = 0
    if (!platforms || !rowPlatforms) return { map, unknownMinutes }
    for (const x of recent) {
      const ids = rowPlatforms[x.rowId] ?? (extraNames[x.rowId] ? idsForNames(extraNames[x.rowId], platforms) : [])
      const mine = ids.filter((id) => myPlatforms.includes(id))
      if (!mine.length) {
        unknownMinutes += x.minutes
        continue
      }
      for (const id of mine) {
        const cur = map.get(id) ?? { minutes: 0, titles: 0 }
        cur.minutes += x.minutes
        cur.titles++
        map.set(id, cur)
      }
    }
    return { map, unknownMinutes }
  }, [recent, rowPlatforms, extraNames, platforms, myPlatforms])

  function savePrice(id: number, raw: string) {
    const n = Number(raw.replace(',', '.'))
    const next = { ...prices }
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) delete next[id]
    else next[id] = Math.round(n * 100) / 100
    if (JSON.stringify(next) === JSON.stringify(prices)) return
    setPrices(next)
    writeStore<AbonelikStore>(profileId, 'abonelik', { prices: next }).catch(() => notify(tt('Ücret kaydedilemedi. Sunucu çalışıyor mu?'), 'danger'))
  }

  const loading = rowsLoading || !board || !watched || !platforms || !rowPlatforms
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
      <p className="text-sm font-semibold text-neutral-50">{tt('Aboneliklerin sana kaça geliyor?')}</p>
      <p className="text-xs text-neutral-500">{tt('Aylık ücreti yaz; son 30 günde o platformdaki yapımlardan ne kadar izlediğine göre saat başı maliyeti hesaplanır.')}</p>
      {failed ? (
        <p className="mt-3 text-sm text-rose-400">{tt('Platform bilgisi alınamadı. TMDB anahtarını ve bağlantını kontrol et.')}</p>
      ) : loading ? (
        <p className="mt-3 text-sm text-neutral-500">{tt('Hesaplanıyor...')}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {myPlatforms.map((id) => {
            const p = platforms.find((x) => x.id === id)
            const stat = perPlatform.map.get(id)
            const price = prices[id]
            const minutes = stat?.minutes ?? 0
            const draft = drafts[id] ?? (price ? String(price).replace('.', getLang() === 'tr' ? ',' : '.') : '')
            return (
              <div key={id} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                {p?.logo ? <img src={p.logo} alt="" loading="lazy" decoding="async" className="h-8 w-8 rounded-lg" /> : <span className="h-8 w-8 rounded-lg bg-neutral-800" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-100 truncate">{p?.name ?? tt('Platform #{0}', id)}</p>
                  <p className="text-xs text-neutral-500">
                    {minutes > 0 ? tt('Son 30 günde {0} saat · {1} yapım', fmtHours(minutes), stat?.titles ?? 0) : lookupBusy ? tt('Platformlar kontrol ediliyor...') : tt('Son 30 günde burada izlediğin bir şey görünmüyor')}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                  <input
                    inputMode="decimal"
                    value={draft}
                    placeholder={tt('ücret')}
                    onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                    onBlur={(e) => {
                      savePrice(id, e.target.value)
                      setDrafts((d) => {
                        const n = { ...d }
                        delete n[id]
                        return n
                      })
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className="w-20 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-right text-sm text-neutral-100 tabular-nums focus:outline-none focus:border-[#00c0fa]"
                    aria-label={tt('{0} aylık ücreti', p?.name ?? '')}
                  />
                  {tt('₺/ay')}
                </label>
                <span className="w-full sm:w-36 text-right text-sm tabular-nums">
                  {!price ? (
                    <span className="text-neutral-600">{tt('ücret girilmedi')}</span>
                  ) : minutes < 30 ? (
                    <span className="text-amber-400">{tt('neredeyse hiç izlemedin')}</span>
                  ) : (
                    <span className="font-semibold text-neutral-50">{tt('saat başı {0} ₺', fmtMoney(price / (minutes / 60)))}</span>
                  )}
                </span>
              </div>
            )
          })}
          {recent.length === 0 ? (
            <p className="text-xs text-neutral-500">{tt('Son 30 günde tarihli bir izleme yok. İzleme tarihi ya da bölüm tiki girdikçe burası dolar.')}</p>
          ) : perPlatform.unknownMinutes > 0 ? (
            <p className="text-xs text-neutral-500">{tt('Son 30 günde izlediğin yaklaşık {0} saat, aboneliklerinden birinde görünmüyor (başka platform, sinema ya da TMDB eşleşmesi yok).', fmtHours(perPlatform.unknownMinutes))}</p>
          ) : null}
          <p className="text-[11px] text-neutral-600">{tt('Bir yapım birden fazla aboneliğinde varsa hepsine sayılır. Süreler yaklaşık: filmde film süresi, dizide işaretlenen bölüm × bölüm süresi.')}</p>
        </div>
      )}
    </section>
  )
}
