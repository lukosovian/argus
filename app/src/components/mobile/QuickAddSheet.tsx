import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api, type AklimdaTmdb } from '../../lib/api'
import { notifyDataChanged } from '../../lib/dataEvents'
import { todayIso } from '../../types'
import { navigateTo, registerQuickAdd } from '../../lib/mobile/nativeFeatures'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'
import { tt } from '../../lib/i18n'

// Y13 + Y15: telefonda hızlı ekleme. Başka bir uygulamada Paylaş › ARGUS seçilince (Netflix / IMDb / TMDB bağlantısı ya
// da yapımın adı) ya da simgedeki "Bugün izlediğimi ekle" kısayolundan açılır: TMDB'de aranır, seçilen yapım
// Aklımda'ya (PC yokken de — sıraya girer) ya da arşive (İzlenecek / bugün izledim — PC'ye bağlıyken) eklenir.
// Uygulamanın geri kalanından bağımsız, kendi kökünde çizilir (bkz. lib/mobile/nativeFeatures.ts).

const TMDB = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p/w342'

interface Hit {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
  year: string
  poster: string | null
  overview: string
}

type TmdbRaw = { id: number; media_type?: string; title?: string; name?: string; release_date?: string; first_air_date?: string; poster_path?: string | null; overview?: string }
const toHit = (r: TmdbRaw, mt?: 'movie' | 'tv'): Hit | null => {
  const mediaType = (mt ?? r.media_type) as 'movie' | 'tv'
  if (mediaType !== 'movie' && mediaType !== 'tv') return null
  return { id: r.id, mediaType, title: r.title ?? r.name ?? '', year: (r.release_date ?? r.first_air_date ?? '').slice(0, 4), poster: r.poster_path ? IMG + r.poster_path : null, overview: r.overview ?? '' }
}

// Paylaşılan metinden ne aranacağı: TMDB / IMDb bağlantısı doğrudan, Netflix'te (bağlantıdan yapım bulunamıyor) metindeki ad
export function parseShared(text: string): { tmdb?: { mediaType: 'movie' | 'tv'; id: number }; imdb?: string; query: string } {
  const t = text.trim()
  const tm = /themoviedb\.org\/(movie|tv)\/(\d+)/i.exec(t)
  if (tm) return { tmdb: { mediaType: tm[1].toLowerCase() as 'movie' | 'tv', id: Number(tm[2]) }, query: '' }
  const im = /\b(tt\d{6,10})\b/.exec(t)
  if (im) return { imdb: im[1], query: '' }
  let q = t
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/["“”«»]/g, '"')
  // "… "Ad" …" biçiminde tırnak içindeki ad
  const quoted = /"([^"]{2,80})"/.exec(q)
  if (quoted) q = quoted[1]
  q = q
    .replace(/\b(watch|izle|on netflix|netflix'te|netflix’te|netflix|imdb|tmdb|check out|şuna bak|izlemelisin|bak)\b/gi, ' ')
    .replace(/[|•·\-–—:]+\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { query: q.slice(0, 100) }
}

function QuickAddSheet({ text, today, onClose }: { text: string; today: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<Hit | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ text: string; yol: string } | null>(null)
  const keyRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function apiKey(): Promise<string> {
    if (keyRef.current) return keyRef.current
    const k = (await api.getApiKey().catch(() => ({ tmdbApiKey: '' }))).tmdbApiKey
    if (!k) throw new Error(tt('TMDB anahtarı bulunamadı. PC\'deki ARGUS\'ta Ayarlar › TMDB\'den ekleyip telefonu eşitle.'))
    keyRef.current = k
    return k
  }
  async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const u = new URL(TMDB + path)
    u.searchParams.set('api_key', await apiKey())
    u.searchParams.set('language', 'tr-TR')
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    const r = await fetch(u.href)
    if (!r.ok) throw new Error(`TMDB ${r.status}`)
    return (await r.json()) as T
  }

  async function search(query: string) {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setPick(null)
    try {
      const d = await tmdb<{ results: TmdbRaw[] }>('/search/multi', { query: query.trim(), include_adult: 'false' })
      const list = d.results.map((r) => toHit(r)).filter((x): x is Hit => Boolean(x)).slice(0, 12)
      setHits(list)
      if (list.length === 1) setPick(list[0])
    } catch (e) {
      setError(e instanceof TypeError ? tt('İnternete bağlanılamadı.') : (e as Error).message)
      setHits([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const s = parseShared(text)
    ;(async () => {
      if (s.tmdb || s.imdb) {
        setLoading(true)
        try {
          let hit: Hit | null = null
          if (s.tmdb) hit = toHit(await tmdb<TmdbRaw>(`/${s.tmdb.mediaType}/${s.tmdb.id}`), s.tmdb.mediaType)
          else {
            const f = await tmdb<{ movie_results: TmdbRaw[]; tv_results: TmdbRaw[] }>(`/find/${s.imdb}`, { external_source: 'imdb_id' })
            hit = (f.movie_results[0] && toHit(f.movie_results[0], 'movie')) || (f.tv_results[0] && toHit(f.tv_results[0], 'tv')) || null
          }
          if (hit) {
            setHits([hit])
            setPick(hit)
            setQ(hit.title)
          } else {
            setHits([])
            setError(tt('Bu bağlantıdaki yapım bulunamadı. Adını yazıp ara.'))
          }
        } catch (e) {
          setError(e instanceof TypeError ? tt('İnternete bağlanılamadı.') : (e as Error).message)
          setHits([])
        } finally {
          setLoading(false)
        }
      } else if (s.query) {
        setQ(s.query)
        search(s.query)
      } else setTimeout(() => inputRef.current?.focus(), 250)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  async function addAklimda(h: Hit) {
    setBusy(true)
    setError(null)
    try {
      const cur = await api.getAklimda().catch(() => null)
      const key = `tmdb:${h.mediaType}:${h.id}`
      const limit = cur?.limit ?? 20
      const count = Object.keys(cur?.items ?? {}).length
      if (!cur?.items?.[key] && limit > 0 && count >= limit) throw new Error(tt('Aklın dolu ({0}/{1}). Yenisini eklemek için önce Aklımda sayfasından birini çıkar ya da sınırı artır.', count, limit))
      const tmdb: AklimdaTmdb = { id: h.id, mediaType: h.mediaType, title: h.title, poster: h.poster, year: h.year }
      await api.saveAklimda({ items: { [key]: { tmdb, addedAt: Date.now() } } })
      notifyDataChanged()
      setDone({ text: tt('{0} Aklımda\'ya eklendi.', h.title), yol: '/aklimda' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function addArchive(h: Hit, watched: boolean) {
    setBusy(true)
    setError(null)
    try {
      const settings = await api.getHomeSettings().catch(() => null)
      const boardId = settings?.boardId ?? (await api.getBoards())[0]?.id
      if (!boardId) throw new Error(tt('Önce bir arşiv oluşturman lazım.'))
      const r = await api.addFromTmdb(boardId, { tmdbId: h.id, mediaType: h.mediaType, status: watched ? 'izlendi' : 'izlenecek', ...(watched ? { watchedDate: todayIso() } : {}) })
      notifyDataChanged(boardId)
      setDone({ text: watched ? tt('{0} bugün izlendi olarak arşive eklendi.', r.title || h.title) : tt('{0} İzlenecek olarak arşive eklendi.', r.title || h.title), yol: `/?detay=${encodeURIComponent(r.rowId)}` })
    } catch (e) {
      const m = (e as Error).message
      setError(/PC/.test(m) ? tt('Arşive eklemek için PC\'ye bağlı olmalısın. Şimdilik Aklımda\'ya ekleyebilirsin — PC\'ye bağlanınca oraya gider.') : m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[220] flex flex-col justify-end bg-black/70" onClick={onClose}>
      <div
        className="max-h-[88vh] overflow-y-auto rounded-t-2xl bg-[#181818] px-4 pt-2 text-neutral-100 shadow-2xl"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', animation: 'argus-toast-in .2s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-600" />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{today ? tt('Bugün izlediğini ekle') : tt('ARGUS\'a ekle')}</h2>
          <button onClick={onClose} className="px-2 py-1 text-sm text-neutral-400">
            {tt('Kapat')}
          </button>
        </div>

        {done ? (
          <div className="py-8 text-center">
            <p className="text-3xl">✓</p>
            <p className="mt-2 text-sm text-neutral-200">{done.text}</p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                onClick={() => {
                  onClose()
                  navigateTo(done.yol)
                }}
                className={`${PRIMARY_BUTTON} rounded-lg px-4 py-2 text-sm`}
                style={primaryButtonStyle}
              >
                {tt('Aç')}
              </button>
              <button onClick={onClose} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300">
                {tt('Tamam')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                search(q)
              }}
            >
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tt('Film ya da dizi adı')}
                enterKeyHint="search"
                className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-[#00c0fa]/60"
              />
              <button type="submit" disabled={!q.trim() || loading} className="rounded-lg bg-neutral-800 px-4 text-sm text-neutral-100 disabled:opacity-50">
                {tt('Ara')}
              </button>
            </form>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            {loading && <p className="mt-4 text-sm text-neutral-400">{tt('TMDB\'de aranıyor...')}</p>}
            {!loading && hits && hits.length === 0 && !error && <p className="mt-4 text-sm text-neutral-400">{tt('Sonuç yok. Adı farklı yazmayı dene.')}</p>}

            {pick ? (
              <div className="mt-4">
                <div className="flex gap-3">
                  <div className="h-[150px] w-[100px] shrink-0 overflow-hidden rounded-md bg-neutral-800">{pick.poster && <img src={pick.poster} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-white">{pick.title}</p>
                    <p className="text-xs text-neutral-400">
                      {pick.year} · {pick.mediaType === 'tv' ? tt('Dizi') : tt('Film')}
                    </p>
                    <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-neutral-300">{pick.overview}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  {today ? (
                    <button disabled={busy} onClick={() => addArchive(pick, true)} className={`${PRIMARY_BUTTON} rounded-lg py-3 text-sm`} style={primaryButtonStyle}>
                      {tt('Bugün izledim')}
                    </button>
                  ) : (
                    <button disabled={busy} onClick={() => addAklimda(pick)} className={`${PRIMARY_BUTTON} rounded-lg py-3 text-sm`} style={primaryButtonStyle}>
                      {tt('Aklımda\'ya ekle')}
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button disabled={busy} onClick={() => addArchive(pick, false)} className="rounded-lg border border-neutral-700 bg-neutral-800/60 py-2.5 text-sm text-neutral-100 disabled:opacity-50">
                      {tt('+ İzlenecek')}
                    </button>
                    {today ? (
                      <button disabled={busy} onClick={() => addAklimda(pick)} className="rounded-lg border border-neutral-700 bg-neutral-800/60 py-2.5 text-sm text-neutral-100 disabled:opacity-50">
                        {tt('Aklımda\'ya ekle')}
                      </button>
                    ) : (
                      <button disabled={busy} onClick={() => addArchive(pick, true)} className="rounded-lg border border-neutral-700 bg-neutral-800/60 py-2.5 text-sm text-neutral-100 disabled:opacity-50">
                        {tt('Bugün izledim')}
                      </button>
                    )}
                  </div>
                  {hits && hits.length > 1 && (
                    <button onClick={() => setPick(null)} className="py-1 text-xs text-neutral-400">
                      {tt('‹ Başka bir sonuç seç')}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              hits &&
              hits.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2 pb-2">
                  {hits.map((h) => (
                    <button key={h.mediaType + h.id} onClick={() => setPick(h)} className="text-left">
                      <span className="block aspect-[2/3] overflow-hidden rounded-md bg-neutral-800">{h.poster ? <img src={h.poster} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center p-1 text-center text-[11px] text-neutral-400">{h.title}</span>}</span>
                      <span className="mt-1 block truncate text-[11px] text-neutral-200">{h.title}</span>
                      <span className="block text-[10px] text-neutral-500">
                        {h.year} · {h.mediaType === 'tv' ? tt('Dizi') : tt('Film')}
                      </span>
                    </button>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}

function QuickAddRoot() {
  const [req, setReq] = useState<{ text: string; today: boolean; n: number } | null>(null)
  useEffect(() => {
    let n = 0
    registerQuickAdd((o) => setReq({ text: o.text, today: Boolean(o.today), n: ++n }))
    return () => registerQuickAdd(null)
  }, [])
  useEffect(() => {
    if (!req) return
    // Android geri tuşu pencereyi kapatsın (bkz. lib/mobile/backButton — Escape gibi davranır)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setReq(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req])
  if (!req) return null
  return <QuickAddSheet key={req.n} text={req.text} today={req.today} onClose={() => setReq(null)} />
}

let mounted = false
export function mountQuickAdd() {
  if (mounted) return
  mounted = true
  const el = document.createElement('div')
  el.id = 'argus-hizli-ekle'
  document.body.appendChild(el)
  createRoot(el).render(<QuickAddRoot />)
}
