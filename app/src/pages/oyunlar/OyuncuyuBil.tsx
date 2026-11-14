import { useEffect, useMemo, useRef, useState } from 'react'
import { useArchive } from './useArchive'
import { sfx, shuffle, type GameItem } from '../../lib/games'
import { tt, ttx } from '../../lib/i18n'
import PageSkeleton from '../../components/Skeleton'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import { FinishInfo, GameShell, useFinish, type Finish, PRIMARY_BTN, PRIMARY_BG } from '../../components/oyun/GameShell'

// G5 Oyuncuyu bil (v1.24): arşivinde en çok karşına çıkan oyunculardan birinin fotoğrafı bulanık ve siyah beyaz gelir,
// 10 saniyede netleşir. Kim? Bilince (ya da bilemeyince) hangi yapımlarında izlediğin gösterilir.

const ROUNDS = 10
const TIME = 10
type Actor = { id: string; name: string; image: string; titles: GameItem[] }

export default function OyuncuyuBil() {
  const { pool, loading } = useArchive()
  const finish = useFinish('oyuncu')
  const actors = useMemo(() => {
    const m = new Map<string, Actor>()
    for (const t of pool)
      for (const a of t.actors) {
        if (!a.image) continue
        const x = m.get(a.id) ?? { id: a.id, name: a.name, image: a.image, titles: [] }
        x.titles.push(t)
        m.set(a.id, x)
      }
    const l = [...m.values()].sort((a, b) => b.titles.length - a.titles.length)
    // En çok yapımı olanlardan (bilinir olsunlar)
    return l.slice(0, Math.max(30, l.filter((a) => a.titles.length >= 2).length))
  }, [pool])
  const [qs, setQs] = useState<{ ans: Actor; opts: Actor[] }[]>([])
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState<'menu' | 'play' | 'done'>('menu')
  const [right, setRight] = useState(0)
  const [fin, setFin] = useState<Finish | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const t0 = useRef(0)
  useEffect(() => () => clearInterval(timer.current ?? undefined), [])

  function begin() {
    clearInterval(timer.current ?? undefined)
    setChosen(null)
    setElapsed(0)
    t0.current = performance.now()
    timer.current = setInterval(() => setElapsed((performance.now() - t0.current) / 1000), 100)
  }
  function start() {
    const picked = shuffle(actors).slice(0, ROUNDS)
    setQs(picked.map((ans) => ({ ans, opts: shuffle([ans, ...shuffle(actors.filter((a) => a.id !== ans.id)).slice(0, 3)]) })))
    setRound(0)
    setScore(0)
    setRight(0)
    setFin(null)
    setPhase('play')
    begin()
  }
  const q = qs[round]
  useEffect(() => {
    if (phase === 'play' && q && !chosen && elapsed >= TIME + 4) answer('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed])
  function answer(id: string) {
    if (!q || chosen) return
    clearInterval(timer.current ?? undefined)
    setChosen(id || '-')
    if (id === q.ans.id) {
      sfx.ok()
      setRight((r) => r + 1)
      setScore((s) => s + Math.round(Math.max(1, TIME + 4 - elapsed) * 10))
    } else sfx.bad()
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
  if (actors.length < 4) return <EmptyState art="kayit" title={tt('Yeterli oyuncu fotoğrafı yok')} text={tt('Oyuncular TMDB\'den Doldur ile fotoğraflarıyla gelir.')} />

  const p = Math.min(1, elapsed / TIME)
  return (
    <GameShell game="oyuncu" title={tt('Oyuncuyu bil')} subtitle={tt('Fotoğraf yavaşça netleşir. Kim?')} score={phase === 'play' ? score : undefined}>
      {phase !== 'play' ? (
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8 space-y-5 max-w-2xl">
          {phase === 'done' && (
            <div>
              <p className="text-neutral-400">{tt('Bitti!')}</p>
              <p className="text-6xl font-black text-neutral-50 tabular-nums">{score}</p>
              <p className="text-sm text-neutral-400">{tt('{0} sorudan {1} doğru', qs.length, right)}</p>
            </div>
          )}
          <FinishInfo f={fin} />
          <p className="text-sm text-neutral-400">{ttx('{0} oyuncu, arşivinde en çok karşına çıkanlardan.', ROUNDS)}</p>
          <button onClick={start} className={PRIMARY_BTN} style={PRIMARY_BG}>
            <Icon name="play" className="h-4 w-4" />
            {phase === 'done' ? tt('Tekrar oyna') : tt('Başla')}
          </button>
        </div>
      ) : (
        q && (
          <div className="grid gap-6 sm:grid-cols-[240px_1fr] items-start max-w-3xl">
            <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-neutral-900 ring-1 ring-neutral-800">
              <img
                src={q.ans.image}
                alt=""
                className="h-full w-full object-cover object-top"
                style={{ filter: chosen ? 'none' : `blur(${(18 * Math.pow(1 - p, 1.3)).toFixed(1)}px) grayscale(${(1 - p).toFixed(2)})`, transform: chosen ? 'none' : `scale(${1 + 0.15 * (1 - p)})`, transition: 'filter .15s linear, transform .15s linear' }}
              />
              <span className="absolute top-2 right-2 rounded-full bg-black/70 px-2.5 py-0.5 text-xs text-neutral-200">
                {round + 1}/{qs.length}
              </span>
            </div>
            <div className="space-y-2.5">
              {q.opts.map((o, i) => {
                const ok = chosen && o.id === q.ans.id
                const bad = chosen === o.id && o.id !== q.ans.id
                return (
                  <button
                    key={o.id}
                    onClick={() => answer(o.id)}
                    disabled={chosen !== null}
                    className={`w-full flex items-center gap-3 text-left rounded-xl border px-4 py-3 font-semibold transition ${
                      ok ? 'border-emerald-500 bg-emerald-500/15 text-emerald-100' : bad ? 'border-rose-500 bg-rose-500/15 text-rose-100' : chosen ? 'border-neutral-800 bg-neutral-900 text-neutral-500' : 'border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-[#00c0fa]/60'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xs text-neutral-400">{i + 1}</span>
                    {o.name}
                  </button>
                )
              })}
              {chosen && (
                <div className="pt-2 space-y-3">
                  <p className={`font-bold ${chosen === q.ans.id ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {chosen === q.ans.id ? tt('Doğru!') : chosen === '-' ? tt('Süre bitti') : tt('Yanlış')} · {q.ans.name}
                  </p>
                  <p className="text-xs text-neutral-500">{ttx('Arşivinde {0} yapımda var:', q.ans.titles.length)}</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {q.ans.titles.slice(0, 8).map((t) => (
                      <div key={t.id} className="w-14 shrink-0" title={t.title}>
                        {t.poster ? <img src={t.poster} alt="" className="h-20 w-14 rounded-md object-cover" /> : <div className="h-20 w-14 rounded-md bg-neutral-800" />}
                      </div>
                    ))}
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
