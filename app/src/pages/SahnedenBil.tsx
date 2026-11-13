import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Row } from '../types'
import { titleText } from '../types'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useProfiles } from '../hooks/useProfiles'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { tt } from '../lib/i18n'
import PageSkeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'

// Sahneden bil (v1.23.4; v1.23.5'te gerçek sahnelerle yeniden yapıldı — kullanıcı "adı sahneden bil olacaksa gerçekten
// sahne göstereceksin" dedi). Arşivindeki (tercihen izlediğin) yapımların TMDB'deki yazısız film kareleri gelir
// (bkz. server POST /sahneler); hangi yapım olduğunu dört şıktan bulursun.
//   Kolay  : kare net ve bütün
//   Normal : karenin bir köşesine yakından başlar, 12 saniyede uzaklaşır
//   Zor    : yakından + bulanık + siyah beyaz başlar
// Erken bilen çok puan alır; "Başka sahne" aynı yapımın başka bir karesini gösterir ama puanı yarıya indirir; arka arkaya
// doğrular seri çarpanı verir. Rekorlar profil ve zorluk başına bu bilgisayarda tutulur.

const ROUNDS = 10
const TIME = 12
type Mode = 'kolay' | 'normal' | 'zor'
const recordKey = (pid: string, m: Mode) => `argus_sahne_rekor_${pid}${m === 'normal' ? '' : '_' + m}`

interface Item {
  row: Row
  title: string
  poster: string
  year: string
}
interface Question {
  ans: Item
  opts: Item[]
  scenes: string[]
  focus: { x: number; y: number }
}
interface Result {
  q: Question
  ok: boolean
  gained: number
}

function readRecord(pid: string, m: Mode) {
  try {
    return Number(localStorage.getItem(recordKey(pid, m)) ?? 0) || 0
  } catch {
    return 0
  }
}

export default function SahnedenBil() {
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const { profiles, activeProfileId } = useProfiles()
  const { pool, candidates } = useMemo(() => {
    if (!board) return { pool: [] as Item[], candidates: [] as string[] }
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    const poster = resolveRole(board, 'poster')
    const vizyon = resolveRole(board, 'vizyon')
    const durum = resolveRole(board, 'durum')
    const izlendi = resolveStatusOption(board, 'izlendi')
    if (!tp) return { pool: [], candidates: [] }
    const all = rows
      .map((r) => ({ row: r, title: titleText(tp, r.values[tp.id]), poster: poster ? String(r.values[poster.id] ?? '') : '', year: vizyon ? String(r.values[vizyon.id] ?? '').slice(0, 4) : '' }))
      .filter((x) => x.title)
    const seen = durum && izlendi ? all.filter((x) => x.row.values[durum.id] === izlendi) : []
    return { pool: all, candidates: (seen.length >= 15 ? seen : all).map((x) => x.row.id) }
  }, [board, rows])

  const [mode, setMode] = useState<Mode>(() => {
    try {
      const m = localStorage.getItem('argus_sahne_zorluk')
      return m === 'kolay' || m === 'zor' ? m : 'normal'
    } catch {
      return 'normal'
    }
  })
  const [phase, setPhase] = useState<'menu' | 'loading' | 'play' | 'done' | 'error'>('menu')
  const [error, setError] = useState('')
  const [qs, setQs] = useState<Question[]>([])
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [results, setResults] = useState<Result[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [sceneIdx, setSceneIdx] = useState(0)
  const [left, setLeft] = useState(TIME)
  const [reveal, setReveal] = useState(false) // kare uzaklaşmaya başladı mı
  const [record, setRecord] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAt = useRef(0)

  useEffect(() => () => stopTimer(), [])
  function stopTimer() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }

  async function start() {
    if (!activeProfileId) return
    try {
      localStorage.setItem('argus_sahne_zorluk', mode)
    } catch {
      /* önemsiz */
    }
    setPhase('loading')
    setError('')
    try {
      const res = await fetch(`/api/profiles/${activeProfileId}/sahneler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIds: candidates, n: ROUNDS }),
      })
      const data: { needsApiKey?: boolean; items: { rowId: string; scenes: string[] }[] } = await res.json()
      if (data.needsApiKey) throw new Error(tt('Sahneler TMDB\'den geliyor: Ayarlar › Veritabanı › API\'den TMDB anahtarını eklemelisin.'))
      const byId = new Map(pool.map((p) => [p.row.id, p]))
      const list: Question[] = data.items
        .filter((it) => byId.has(it.rowId))
        .map((it) => {
          const ans = byId.get(it.rowId)!
          const others = pool
            .filter((p) => p.row.id !== ans.row.id && p.title !== ans.title)
            .sort(() => Math.random() - 0.5)
            .slice(0, 3)
          return { ans, opts: [ans, ...others].sort(() => Math.random() - 0.5), scenes: it.scenes, focus: { x: 15 + Math.random() * 70, y: 20 + Math.random() * 60 } }
        })
      if (list.length < 3)
        throw new Error(tt('Yeterli sahne bulunamadı. Arşivindeki yapımlar TMDB ile eşleşince (detayda "TMDB\'den Doldur") sahneleri gelir.'))
      // ilk karelerin hepsi önceden yüklensin, oyun sırasında beklenmesin
      await Promise.all(list.map((q) => new Promise<void>((ok) => {
        const im = new Image()
        im.onload = im.onerror = () => ok()
        im.src = q.scenes[0]
        setTimeout(ok, 6000)
      })))
      setQs(list)
      setScore(0)
      setStreak(0)
      setResults([])
      setRecord(null)
      setRound(0)
      setPhase('play')
      begin()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt('Sahneler alınamadı.'))
      setPhase('error')
    }
  }

  function begin() {
    stopTimer()
    setChosen(null)
    setSceneIdx(0)
    setLeft(TIME)
    setReveal(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setReveal(true)))
    startedAt.current = performance.now()
    timer.current = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
  }

  const q = qs[round]
  useEffect(() => {
    if (phase === 'play' && left === 0 && q && !chosen) answer('')
  }, [left])

  function answer(id: string) {
    if (!q || chosen !== null) return
    stopTimer()
    setChosen(id || '-')
    const ok = id === q.ans.row.id
    const mult = 1 + Math.min(streak, 4) * 0.25
    const base = Math.max(1, left) * 10 * (mode === 'zor' ? 1.5 : mode === 'kolay' ? 0.7 : 1)
    const gained = ok ? Math.round((base * mult) / 2 ** sceneIdx) : 0
    if (ok) setScore((s) => s + gained)
    setStreak((s) => (ok ? s + 1 : 0))
    setResults((r) => [...r, { q, ok, gained }])
  }

  function nextRound() {
    if (round + 1 >= qs.length) {
      setPhase('done')
      if (activeProfileId) {
        const prev = readRecord(activeProfileId, mode)
        const final = score
        if (final > prev) {
          try {
            localStorage.setItem(recordKey(activeProfileId, mode), String(final))
          } catch {
            /* önemsiz */
          }
          setRecord(final)
        }
      }
      return
    }
    setRound((r) => r + 1)
    begin()
  }

  // Doğru/yanlış görününce Enter / boşluk sonraki soruya, 1-4 şık seçer
  useEffect(() => {
    if (phase !== 'play') return
    function onKey(e: KeyboardEvent) {
      if (chosen && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        nextRound()
      } else if (!chosen && q && /^[1-4]$/.test(e.key)) answer(q.opts[Number(e.key) - 1]?.row.id ?? '')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (loading || !board) return <PageSkeleton />
  if (pool.length < 4) return <EmptyState art="kayit" title={tt('Oynamak için yeterli yapım yok')} text={tt('Arşivinde en az 4 yapım olmalı.')} />

  const records = profiles.map((p) => ({ p, s: readRecord(p.id, mode) })).sort((a, b) => b.s - a.s)
  const scene = q?.scenes[Math.min(sceneIdx, q.scenes.length - 1)]
  const zoom = mode === 'kolay' ? 1 : mode === 'zor' ? 3.2 : 2.4
  const imgStyle = (): CSSProperties => {
    const done = chosen !== null
    const atStart = !reveal && !done
    return {
      transformOrigin: q ? `${q.focus.x}% ${q.focus.y}%` : 'center',
      transform: `scale(${atStart ? zoom : 1})`,
      filter: atStart && mode === 'zor' ? 'blur(14px) grayscale(1)' : 'none',
      transition: atStart ? 'none' : done ? 'transform .6s cubic-bezier(.2,.8,.2,1), filter .4s' : `transform ${TIME}s linear, filter ${TIME * 0.85}s ease-in`,
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <section className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-neutral-50 tracking-tight">{tt('Sahneden bil')}</h1>
          <p className="text-neutral-400 mt-1">{tt('Arşivindeki yapımlardan gerçek bir sahne gelir. Hangi yapım?')}</p>
        </div>
        {phase === 'play' && (
          <div className="ml-auto flex items-end gap-6">
            {streak >= 2 && (
              <span className="rounded-full bg-amber-500/15 border border-amber-400/40 px-3 py-1 text-sm font-bold text-amber-200" style={{ animation: 'argus-toast-in .25s ease-out' }}>
                {tt('{0} seri', streak)} · ×{(1 + Math.min(streak, 4) * 0.25).toString().replace('.', ',')}
              </span>
            )}
            <div className="text-right">
              <p className="text-xs text-neutral-500">{tt('Skor')}</p>
              <p className="text-3xl font-black text-neutral-50 tabular-nums">{score}</p>
            </div>
          </div>
        )}
      </section>

      {(phase === 'menu' || phase === 'error' || phase === 'loading') && (
        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8">
            <p className="text-sm font-semibold text-neutral-200 mb-3">{tt('Zorluk')}</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['kolay', tt('Kolay'), tt('Sahne net ve bütün')],
                  ['normal', tt('Normal'), tt('Yakından başlar, uzaklaşır')],
                  ['zor', tt('Zor'), tt('Yakından, bulanık, siyah beyaz')],
                ] as const
              ).map(([k, label, hint]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${mode === k ? 'border-[#00c0fa]/70 bg-[#00c0fa]/10' : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600'}`}
                >
                  <span className="block text-sm font-bold text-neutral-100">{label}</span>
                  <span className="block text-xs text-neutral-500 mt-0.5">{hint}</span>
                </button>
              ))}
            </div>
            <ul className="mt-5 space-y-1.5 text-sm text-neutral-400">
              <li>{tt('Ne kadar erken bilirsen o kadar puan; arka arkaya bildikçe çarpan büyür.')}</li>
              <li>{tt('"Başka sahne" aynı yapımdan başka bir kare açar ama o sorunun puanı yarıya iner.')}</li>
              <li>{tt('Klavyeden 1-4 ile seçebilir, Enter ile geçebilirsin.')}</li>
            </ul>
            {phase === 'error' && <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
            <button
              onClick={start}
              disabled={phase === 'loading'}
              className="mt-6 inline-flex items-center gap-2 text-base font-semibold rounded-full px-6 py-2.5 text-white disabled:opacity-70"
              style={{ background: 'linear-gradient(90deg,#015eea,#00c0fa)' }}
            >
              {phase === 'loading' ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  {tt('Sahneler hazırlanıyor…')}
                </>
              ) : (
                <>
                  <Icon name="play" className="h-4 w-4" />
                  {tt('Başla')} ({ROUNDS} {tt('soru')})
                </>
              )}
            </button>
          </div>
          <Records records={records} />
        </div>
      )}

      {phase === 'play' && q && scene && (
        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr] items-start">
          <div>
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black ring-1 ring-neutral-800">
              <img key={`${round}-${sceneIdx}`} src={scene} alt="" className="h-full w-full object-cover" style={imgStyle()} draggable={false} />
              <span className="absolute top-3 right-3 rounded-full bg-black/70 px-3 py-1 text-sm text-neutral-200 tabular-nums">
                {round + 1}/{qs.length}
              </span>
              {chosen && (
                <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-4 sm:p-5" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.92), transparent)', animation: 'argus-toast-in .3s ease-out' }}>
                  {q.ans.poster && <img src={q.ans.poster} alt="" className="h-24 w-16 rounded-lg object-cover ring-1 ring-white/20 shadow-lg" />}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold ${chosen === q.ans.row.id ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {chosen === q.ans.row.id ? tt('Doğru! +{0}', results[results.length - 1]?.gained ?? 0) : chosen === '-' ? tt('Süre bitti') : tt('Yanlış')}
                    </p>
                    <p className="text-2xl font-black text-white truncate">{q.ans.title}</p>
                    {q.ans.year && <p className="text-sm text-neutral-300">{q.ans.year}</p>}
                  </div>
                  <button onClick={nextRound} className="shrink-0 rounded-full bg-white px-5 py-2 text-sm font-bold text-black hover:bg-white/85 transition">
                    {round + 1 >= qs.length ? tt('Sonuçlar') : tt('Sonraki')}
                  </button>
                </div>
              )}
            </div>
            {/* kalan süre çubuğu */}
            <div className="mt-2 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div
                key={`${round}-${chosen ? 'x' : 'o'}`}
                className="h-full rounded-full"
                style={{
                  width: chosen ? `${(left / TIME) * 100}%` : '100%',
                  background: left <= 3 ? '#f43f5e' : 'linear-gradient(90deg,#015eea,#00c0fa)',
                  animation: chosen ? undefined : `ai-bar ${TIME}s linear forwards`,
                }}
              />
            </div>
            <style>{'@keyframes ai-bar { from { width: 100% } to { width: 0% } }'}</style>
          </div>
          <div className="grid gap-2.5">
            {q.opts.map((o, i) => {
              const right = chosen && o.row.id === q.ans.row.id
              const wrong = chosen === o.row.id && o.row.id !== q.ans.row.id
              return (
                <button
                  key={o.row.id}
                  onClick={() => answer(o.row.id)}
                  disabled={chosen !== null}
                  className={`flex items-center gap-3 text-left rounded-xl border px-4 py-3 font-semibold transition ${
                    right ? 'border-emerald-500 bg-emerald-500/15 text-emerald-100' : wrong ? 'border-rose-500 bg-rose-500/15 text-rose-100' : chosen ? 'border-neutral-800 bg-neutral-900 text-neutral-500' : 'border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-[#00c0fa]/60 hover:bg-neutral-800'
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xs text-neutral-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{o.title}</span>
                  {right && <Icon name="check" className="h-5 w-5 text-emerald-300" />}
                </button>
              )
            })}
            {!chosen && q.scenes.length > sceneIdx + 1 && (
              <button onClick={() => setSceneIdx((n) => n + 1)} className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 hover:border-neutral-500 hover:text-white transition">
                <Icon name="film" className="h-4 w-4" />
                {tt('Başka sahne (puan yarıya iner)')}
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8">
            <p className="text-neutral-400">{tt('Tur bitti!')}</p>
            <p className="text-6xl font-black text-neutral-50 my-1 tabular-nums">{score}</p>
            <p className="text-sm text-neutral-400">
              {tt('{0} sorudan {1} doğru', results.length, results.filter((r) => r.ok).length)}
              {record !== null && <span className="ml-2 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-200">{tt('Yeni rekor!')}</span>}
            </p>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {results.map((r, i) => (
                <div key={i} className="relative aspect-video overflow-hidden rounded-lg ring-1 ring-neutral-800" title={r.q.ans.title}>
                  <img src={r.q.scenes[0]} alt="" className="h-full w-full object-cover" />
                  <span className={`absolute bottom-1 right-1 h-5 w-5 rounded-full flex items-center justify-center text-white ${r.ok ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    {r.ok ? <Icon name="check" className="h-3 w-3" /> : <span className="text-[11px] font-bold leading-none">×</span>}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={start} className="mt-6 inline-flex items-center gap-2 text-base font-semibold rounded-full px-6 py-2.5 text-white" style={{ background: 'linear-gradient(90deg,#015eea,#00c0fa)' }}>
              <Icon name="repeat" className="h-4 w-4" />
              {tt('Tekrar oyna')}
            </button>
            <button onClick={() => setPhase('menu')} className="mt-6 ml-2 text-sm rounded-full px-4 py-2.5 border border-neutral-700 text-neutral-300 hover:text-white transition">
              {tt('Zorluğu değiştir')}
            </button>
          </div>
          <Records records={profiles.map((p) => ({ p, s: readRecord(p.id, mode) })).sort((a, b) => b.s - a.s)} />
        </div>
      )}
    </div>
  )
}

function Records({ records }: { records: { p: { id: string; username: string; photo?: string }; s: number }[] }) {
  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6">
      <p className="text-xs uppercase tracking-wider text-neutral-500 mb-3">{tt('Rekorlar (bu zorlukta)')}</p>
      <div className="space-y-1.5">
        {records.map(({ p, s }, i) => (
          <p key={p.id} className="flex items-center gap-3 rounded-xl bg-neutral-900 px-3 py-2 text-sm">
            <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-neutral-800">{p.photo && <img src={p.photo} alt="" className="h-full w-full object-cover" />}</span>
            <span className="flex-1 truncate text-neutral-200">{p.username}</span>
            {i === 0 && s > 0 && <Icon name="trophy" className="h-4 w-4 text-amber-300" />}
            <span className="tabular-nums font-semibold text-neutral-100">{s}</span>
          </p>
        ))}
      </div>
    </div>
  )
}
