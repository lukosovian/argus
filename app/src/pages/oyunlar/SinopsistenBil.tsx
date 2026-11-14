import { useEffect, useMemo, useRef, useState } from 'react'
import { useArchive } from './useArchive'
import { fold, preferWatched, sfx, shuffle, type GameItem } from '../../lib/games'
import { tt } from '../../lib/i18n'
import PageSkeleton from '../../components/Skeleton'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import { FinishInfo, GameShell, useFinish, type Finish, PRIMARY_BTN, PRIMARY_BG } from '../../components/oyun/GameShell'

// G2 Sinopsisten bil (v1.24): arşivdeki sinopsis gelir; yapımın adı, oyuncular ve özel isimler karartılır. Karartılan
// kelimeler süre geçtikçe tek tek açılır; ne kadar erken bilirsen o kadar puan. İnternet gerekmez.

const ROUNDS = 8
const TIME = 25

type Tok = { t: string; mask: boolean }
function tokenize(item: GameItem): Tok[] {
  const titleWords = new Set(
    [item.title, item.orig, ...item.actors.map((a) => a.name)]
      .join(' ')
      .split(/\s+/)
      .map(fold)
      .filter((w) => w.length >= 3),
  )
  const parts = item.synopsis.split(/(\p{L}[\p{L}\p{N}'’]*)/u)
  const out: Tok[] = []
  let sentenceStart = true
  let lastWord = ''
  for (const p of parts) {
    if (!p) continue
    if (/^\p{L}/u.test(p)) {
      const base = fold(p.split(/['’]/)[0])
      const proper = /^\p{Lu}/u.test(p) && !sentenceStart && base.length >= 2
      out.push({ t: p, mask: titleWords.has(base) || proper })
      sentenceStart = false
      lastWord = p
    } else {
      out.push({ t: p, mask: false })
      // "I. Süleyman", "Dr. Who" gibi kısaltmalardan sonra cümle başlamaz
      if (/[.!?…]/.test(p) && lastWord.length > 2) sentenceStart = true
    }
  }
  return out
}

interface Q {
  ans: GameItem
  opts: GameItem[]
  toks: Tok[]
  order: number[] // açılma sırası (maskeli token indeksleri)
}

export default function SinopsistenBil() {
  const { pool, loading } = useArchive()
  const finish = useFinish('sinopsis')
  const items = useMemo(() => preferWatched(pool.filter((x) => x.synopsis.length >= 80), 12), [pool])
  const [qs, setQs] = useState<Q[]>([])
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [phase, setPhase] = useState<'menu' | 'play' | 'done'>('menu')
  const [fin, setFin] = useState<Finish | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const t0 = useRef(0)

  useEffect(() => () => clearInterval(timer.current ?? undefined), [])
  function begin() {
    clearInterval(timer.current ?? undefined)
    setChosen(null)
    setElapsed(0)
    t0.current = performance.now()
    timer.current = setInterval(() => setElapsed((performance.now() - t0.current) / 1000), 200)
  }
  function start() {
    const picked = shuffle(items).slice(0, ROUNDS)
    setQs(
      picked.map((ans) => {
        const toks = tokenize(ans)
        const masked = toks.map((t, i) => (t.mask ? i : -1)).filter((i) => i >= 0)
        return { ans, opts: shuffle([ans, ...shuffle(items.filter((x) => x.id !== ans.id)).slice(0, 3)]), toks, order: shuffle(masked) }
      }),
    )
    setRound(0)
    setScore(0)
    setResults([])
    setFin(null)
    setPhase('play')
    begin()
  }
  const q = qs[round]
  useEffect(() => {
    if (phase === 'play' && q && !chosen && elapsed >= TIME) answer('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed])
  function answer(id: string) {
    if (!q || chosen) return
    clearInterval(timer.current ?? undefined)
    setChosen(id || '-')
    const ok = id === q.ans.id
    if (ok) {
      sfx.ok()
      setScore((s) => s + Math.round(Math.max(1, TIME - elapsed) * 10))
    } else sfx.bad()
    setResults((r) => [...r, ok])
  }
  function next() {
    if (round + 1 >= qs.length) {
      setPhase('done')
      finish(score).then(setFin)
      return
    }
    setRound((r) => r + 1)
    begin()
  }

  if (loading) return <PageSkeleton />
  if (items.length < 4) return <EmptyState art="kayit" title={tt('Yeterli sinopsis yok')} text={tt('En az 4 yapımında sinopsis olmalı (TMDB\'den Doldur ile gelir).')} />

  // Süre geçtikçe karartılan kelimeler açılır (son 5 saniyede hepsi değil, yarısı)
  const revealN = q ? Math.floor((Math.min(elapsed, TIME) / TIME) * q.order.length * 0.6) : 0
  const open = new Set(q ? q.order.slice(0, revealN) : [])

  return (
    <GameShell game="sinopsis" title={tt('Sinopsisten bil')} subtitle={tt('Ad ve isimler karartıldı. Hangi yapım?')} score={phase === 'play' ? score : undefined}>
      {phase !== 'play' ? (
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8 space-y-5 max-w-2xl">
          {phase === 'done' && (
            <div>
              <p className="text-neutral-400">{tt('Tur bitti!')}</p>
              <p className="text-6xl font-black text-neutral-50 tabular-nums">{score}</p>
              <p className="text-sm text-neutral-400">{tt('{0} sorudan {1} doğru', results.length, results.filter(Boolean).length)}</p>
            </div>
          )}
          <FinishInfo f={fin} />
          <p className="text-sm text-neutral-400">{tt('{0} soru. Karartılan kelimeler zamanla açılır; erken bilen çok puan alır.', ROUNDS)}</p>
          <button onClick={start} className={PRIMARY_BTN} style={PRIMARY_BG}>
            <Icon name="play" className="h-4 w-4" />
            {phase === 'done' ? tt('Tekrar oyna') : tt('Başla')}
          </button>
        </div>
      ) : (
        q && (
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] items-start">
            <div>
              <div className="rounded-2xl border border-neutral-800 bg-[#0d0e14] p-6">
                <p className="text-[17px] leading-[1.85] text-[#ece6dc]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
                  {q.toks.map((t, i) =>
                    t.mask && !chosen && !open.has(i) ? (
                      <span key={i} className="inline-block align-middle rounded bg-neutral-700/70 mx-[1px]" style={{ width: `${Math.max(2, t.t.length) * 0.55}em`, height: '1.05em' }} />
                    ) : (
                      <span key={i} className={t.mask ? 'font-bold text-white' : ''}>
                        {t.t}
                      </span>
                    ),
                  )}
                </p>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.max(0, 100 - (elapsed / TIME) * 100)}%`, background: 'linear-gradient(90deg,#015eea,#00c0fa)' }} />
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                {round + 1}/{qs.length}
              </p>
            </div>
            <div className="grid gap-2.5">
              {q.opts.map((o, i) => {
                const right = chosen && o.id === q.ans.id
                const wrong = chosen === o.id && o.id !== q.ans.id
                return (
                  <button
                    key={o.id}
                    onClick={() => answer(o.id)}
                    disabled={chosen !== null}
                    className={`flex items-center gap-3 text-left rounded-xl border px-4 py-3 font-semibold transition ${
                      right ? 'border-emerald-500 bg-emerald-500/15 text-emerald-100' : wrong ? 'border-rose-500 bg-rose-500/15 text-rose-100' : chosen ? 'border-neutral-800 bg-neutral-900 text-neutral-500' : 'border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-[#00c0fa]/60'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xs text-neutral-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{o.title}</span>
                  </button>
                )
              })}
              {chosen && (
                <div className="flex items-center gap-3 mt-2">
                  {q.ans.poster && <img src={q.ans.poster} alt="" className="h-20 w-14 rounded-lg object-cover" />}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${chosen === q.ans.id ? 'text-emerald-300' : 'text-rose-300'}`}>{chosen === q.ans.id ? tt('Doğru!') : chosen === '-' ? tt('Süre bitti') : tt('Yanlış')}</p>
                    <p className="font-bold text-white truncate">{q.ans.title}</p>
                  </div>
                  <button onClick={next} className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black">
                    {round + 1 >= qs.length ? tt('Sonuçlar') : tt('Sonraki')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </GameShell>
  )
}
