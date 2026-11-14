import { useMemo, useState } from 'react'
import { useArchive } from './useArchive'
import { sfx, shuffle, type GameItem } from '../../lib/games'
import { tt, ttx } from '../../lib/i18n'
import PageSkeleton from '../../components/Skeleton'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import { FinishInfo, GameShell, useFinish, type Finish, PRIMARY_BTN, PRIMARY_BG } from '../../components/oyun/GameShell'

// G4 Oyuncu zinciri (v1.24): iki oyuncu verilir; arşivindeki yapımlar üzerinden birini öbürüne bağla: oyuncu → ortak
// yapım → oyuncu → … Bağlantılar arşivin Oyuncular sütunundan. En kısa yolu bulan çok puan alır; "Pes et" en kısa yolu
// gösterir. 5 tur.

const ROUNDS = 5
const MAX_STEPS = 6
type Actor = { id: string; name: string; image?: string }

function useGraph(pool: GameItem[]) {
  return useMemo(() => {
    const titlesOf = new Map<string, GameItem[]>()
    const actors = new Map<string, Actor>()
    for (const t of pool) {
      for (const a of t.actors) {
        actors.set(a.id, a)
        const l = titlesOf.get(a.id) ?? []
        l.push(t)
        titlesOf.set(a.id, l)
      }
    }
    return { titlesOf, actors }
  }, [pool])
}

// En kısa yol (oyuncu → yapım → oyuncu …); [oyuncu, yapım, oyuncu, …]
function shortest(g: ReturnType<typeof useGraph>, from: string, to: string): (Actor | GameItem)[] | null {
  const prev = new Map<string, { a: string; t: GameItem } | null>([[from, null]])
  const q = [from]
  while (q.length) {
    const cur = q.shift()!
    if (cur === to) break
    for (const t of g.titlesOf.get(cur) ?? []) {
      for (const a of t.actors) {
        if (prev.has(a.id)) continue
        prev.set(a.id, { a: cur, t })
        q.push(a.id)
      }
    }
  }
  if (!prev.has(to)) return null
  const path: (Actor | GameItem)[] = []
  let c: string | null = to
  while (c) {
    path.unshift(g.actors.get(c)!)
    const p = prev.get(c)
    if (!p) break
    path.unshift(p.t)
    c = p.a
  }
  return path
}

function dist(g: ReturnType<typeof useGraph>, from: string) {
  const d = new Map<string, number>([[from, 0]])
  const q = [from]
  while (q.length) {
    const cur = q.shift()!
    for (const t of g.titlesOf.get(cur) ?? []) for (const a of t.actors) if (!d.has(a.id)) (d.set(a.id, d.get(cur)! + 1), q.push(a.id))
  }
  return d
}

const isTitle = (x: Actor | GameItem): x is GameItem => 'row' in x

export default function OyuncuZinciri() {
  const { pool, loading } = useArchive()
  const g = useGraph(pool)
  const finish = useFinish('zincir')
  const [round, setRound] = useState(0)
  const [target, setTarget] = useState<{ a: Actor; b: Actor; best: number } | null>(null)
  const [chain, setChain] = useState<(Actor | GameItem)[]>([])
  const [score, setScore] = useState(0)
  const [state, setState] = useState<'play' | 'win' | 'lost'>('play')
  const [phase, setPhase] = useState<'menu' | 'play' | 'done'>('menu')
  const [fin, setFin] = useState<Finish | null>(null)

  // Fotoğraflı ve en az 2 yapımı olan oyuncular
  const starters = useMemo(() => [...g.actors.values()].filter((a) => a.image && (g.titlesOf.get(a.id)?.length ?? 0) >= 2), [g])

  function deal() {
    for (let tries = 0; tries < 60; tries++) {
      const a = shuffle(starters)[0]
      if (!a) break
      const d = dist(g, a.id)
      const byDist = (n: number) => starters.filter((b) => b.id !== a.id && d.get(b.id) === n)
      const pickFrom = byDist(2).length ? byDist(2) : byDist(3).length ? byDist(3) : []
      if (!pickFrom.length) continue
      const b = shuffle(pickFrom)[0]
      setTarget({ a, b, best: d.get(b.id)! })
      setChain([a])
      setState('play')
      return true
    }
    return false
  }
  function start() {
    setRound(0)
    setScore(0)
    setFin(null)
    if (deal()) setPhase('play')
  }
  const last = chain[chain.length - 1]
  const steps = chain.filter(isTitle).length
  const usedIds = new Set(chain.map((x) => (isTitle(x) ? 't:' + x.id : 'a:' + x.id)))

  function pickTitle(t: GameItem) {
    setChain((c) => [...c, t])
  }
  function pickActor(a: Actor) {
    const c = [...chain, a]
    setChain(c)
    if (target && a.id === target.b.id) {
      const used = c.filter(isTitle).length
      const gained = 100 + Math.max(0, (MAX_STEPS - used) * 20) + (used === target.best ? 50 : 0)
      setScore((s) => s + gained)
      setState('win')
      sfx.ok()
      if (used === target.best) sfx.streak()
    } else if (c.filter(isTitle).length >= MAX_STEPS) {
      setState('lost')
      sfx.bad()
    }
  }
  function undo() {
    if (chain.length > 1 && state === 'play') setChain((c) => c.slice(0, -1))
  }
  function giveUp() {
    setState('lost')
    sfx.bad()
  }
  function next() {
    if (round + 1 >= ROUNDS) {
      setPhase('done')
      finish(score).then(setFin)
      return
    }
    setRound((r) => r + 1)
    deal()
  }

  if (loading) return <PageSkeleton />
  if (starters.length < 6) return <EmptyState art="kayit" title={tt('Yeterli oyuncu bilgisi yok')} text={tt('Bu oyun arşivdeki Oyuncular sütunuyla oynanır; TMDB\'den Doldur ile oyuncular gelir.')} />

  const best = target && state === 'lost' ? shortest(g, target.a.id, target.b.id) : null
  const Node = ({ x, small }: { x: Actor | GameItem; small?: boolean }) =>
    isTitle(x) ? (
      <div className="text-center w-16 shrink-0">
        {x.poster ? <img src={x.poster} alt="" className="h-20 w-14 mx-auto rounded-lg object-cover" /> : <div className="h-20 w-14 mx-auto rounded-lg bg-neutral-800" />}
        <p className="text-[10px] font-semibold text-neutral-300 mt-1 line-clamp-2 leading-tight">{x.title}</p>
      </div>
    ) : (
      <div className="text-center w-16 shrink-0">
        {x.image ? <img src={x.image} alt="" className={`${small ? 'h-12 w-12' : 'h-14 w-14'} mx-auto rounded-full object-cover object-top border-2 border-neutral-700`} /> : <div className="h-14 w-14 mx-auto rounded-full bg-neutral-800" />}
        <p className="text-[10px] font-bold text-neutral-100 mt-1 line-clamp-2 leading-tight">{x.name}</p>
      </div>
    )

  return (
    <GameShell game="zincir" title={tt('Oyuncu zinciri')} subtitle={tt('İki oyuncuyu ortak yapımlar üzerinden birbirine bağla.')} score={phase === 'play' ? score : undefined}>
      {phase !== 'play' || !target ? (
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8 space-y-5 max-w-2xl">
          {phase === 'done' && (
            <div>
              <p className="text-neutral-400">{tt('Bitti!')}</p>
              <p className="text-6xl font-black text-neutral-50 tabular-nums">{score}</p>
            </div>
          )}
          <FinishInfo f={fin} />
          <p className="text-sm text-neutral-400">{ttx('{0} tur. Oyuncudan onun bir yapımına, oradan o yapımdaki başka bir oyuncuya geç; hedef oyuncuya ulaş. En fazla {1} yapım.', ROUNDS, MAX_STEPS)}</p>
          <button onClick={start} className={PRIMARY_BTN} style={PRIMARY_BG}>
            <Icon name="play" className="h-4 w-4" />
            {phase === 'done' ? tt('Tekrar oyna') : tt('Başla')}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
            <Node x={target.a} />
            <div className="flex-1 text-center">
              <p className="text-xs text-neutral-500">
                {tt('Tur')} {round + 1}/{ROUNDS}
              </p>
              <p className="text-sm text-neutral-300">{ttx('En kısa yol {0} yapım', target.best)}</p>
              <p className="text-xs text-neutral-500">{ttx('Kullandığın: {0}/{1}', steps, MAX_STEPS)}</p>
            </div>
            <div className="ring-2 ring-amber-400/70 rounded-2xl p-1">
              <Node x={target.b} />
            </div>
          </div>
          {/* zincir */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {chain.map((x, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-neutral-600 font-black">→</span>}
                <Node x={x} small />
              </div>
            ))}
          </div>
          {state === 'play' ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              {isTitle(last) ? (
                <>
                  <p className="text-sm font-semibold text-neutral-200 mb-3">{ttx('"{0}" yapımından bir oyuncu seç', last.title)}</p>
                  <div className="flex flex-wrap gap-3">
                    {last.actors
                      .filter((a) => !usedIds.has('a:' + a.id))
                      .map((a) => (
                        <button key={a.id} onClick={() => pickActor(a)} className={`rounded-xl p-1.5 hover:bg-neutral-800 transition ${a.id === target.b.id ? 'ring-2 ring-amber-400' : ''}`}>
                          <Node x={a} />
                        </button>
                      ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-neutral-200 mb-3">{ttx('{0} hangi yapımda oynadı? Birini seç', (last as Actor).name)}</p>
                  <div className="flex flex-wrap gap-3">
                    {(g.titlesOf.get(last.id) ?? [])
                      .filter((t) => !usedIds.has('t:' + t.id))
                      .map((t) => (
                        <button key={t.id} onClick={() => pickTitle(t)} className="rounded-xl p-1.5 hover:bg-neutral-800 transition">
                          <Node x={t} />
                        </button>
                      ))}
                  </div>
                </>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={undo} disabled={chain.length <= 1} className="text-sm rounded-full px-4 py-1.5 border border-neutral-700 text-neutral-300 disabled:opacity-40">
                  ↶ {tt('Geri al')}
                </button>
                <button onClick={giveUp} className="text-sm rounded-full px-4 py-1.5 border border-dashed border-neutral-700 text-neutral-400 hover:text-neutral-100">
                  {tt('Pes et')}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
              <p className={`font-bold ${state === 'win' ? 'text-emerald-300' : 'text-rose-300'}`}>
                {state === 'win' ? (steps === target.best ? tt('En kısa yoldan buldun! 🎯') : tt('Bağladın! ({0} yapımda)', steps)) : tt('Olmadı. En kısa yol şuydu:')}
              </p>
              {best && (
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {best.map((x, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-neutral-600 font-black">→</span>}
                      <Node x={x} small />
                    </div>
                  ))}
                </div>
              )}
              <button onClick={next} className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black">
                {round + 1 >= ROUNDS ? tt('Sonuçlar') : tt('Sonraki tur')}
              </button>
            </div>
          )}
        </div>
      )}
    </GameShell>
  )
}
