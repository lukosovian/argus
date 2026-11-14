import { useMemo, useState } from 'react'
import { useArchive } from './useArchive'
import { preferWatched, sfx, shuffle, type GameItem } from '../../lib/games'
import { tt, ttx } from '../../lib/i18n'
import PageSkeleton from '../../components/Skeleton'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import { FinishInfo, GameShell, useFinish, type Finish, PRIMARY_BTN, PRIMARY_BG } from '../../components/oyun/GameShell'

// G3 Zaman çizelgesi (v1.24): 5 yapımı çıkış yılına göre eskiden yeniye diz (sürükle ya da oklar). Kontrol edince doğru
// yerdekiler yeşil yanar, yıllar görünür. 5 tur; doğru yer başına 20 puan, hepsi doğruysa +50.

const ROUNDS = 5
const PER = 5

export default function ZamanCizelgesi() {
  const { pool, loading } = useArchive()
  const finish = useFinish('zaman')
  const items = useMemo(() => preferWatched(pool.filter((x) => x.year && x.poster), 15), [pool])
  const [round, setRound] = useState(0)
  const [list, setList] = useState<GameItem[]>([])
  const [checked, setChecked] = useState(false)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'menu' | 'play' | 'done'>('menu')
  const [drag, setDrag] = useState<number | null>(null)
  const [fin, setFin] = useState<Finish | null>(null)

  function deal() {
    // Yılları birbirinden farklı 5 yapım
    const out: GameItem[] = []
    const years = new Set<number>()
    for (const x of shuffle(items)) {
      if (years.has(x.year!)) continue
      years.add(x.year!)
      out.push(x)
      if (out.length === PER) break
    }
    setList(out)
    setChecked(false)
  }
  function start() {
    setRound(0)
    setScore(0)
    setFin(null)
    setPhase('play')
    deal()
  }
  const sorted = [...list].sort((a, b) => a.year! - b.year!)
  const correct = list.filter((x, i) => sorted[i].id === x.id).length
  function check() {
    setChecked(true)
    const gained = correct * 20 + (correct === PER ? 50 : 0)
    setScore((s) => s + gained)
    if (correct === PER) sfx.streak()
    else if (correct >= 3) sfx.ok()
    else sfx.bad()
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
  function move(i: number, j: number) {
    if (checked || j < 0 || j >= list.length) return
    const l = [...list]
    const [x] = l.splice(i, 1)
    l.splice(j, 0, x)
    setList(l)
  }

  if (loading) return <PageSkeleton />
  if (new Set(items.map((x) => x.year)).size < PER) return <EmptyState art="kayit" title={tt('Yeterli yapım yok')} text={tt('En az 5 farklı yılda çıkmış, afişi olan yapım gerekli.')} />

  return (
    <GameShell game="zaman" title={tt('Zaman çizelgesi')} subtitle={tt('Eskiden yeniye sırala.')} score={phase === 'play' ? score : undefined}>
      {phase !== 'play' ? (
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8 space-y-5 max-w-2xl">
          {phase === 'done' && (
            <div>
              <p className="text-neutral-400">{tt('Bitti!')}</p>
              <p className="text-6xl font-black text-neutral-50 tabular-nums">{score}</p>
            </div>
          )}
          <FinishInfo f={fin} />
          <p className="text-sm text-neutral-400">{ttx('{0} tur, her turda {1} yapım. Sürükleyerek ya da oklarla diz, sonra "Kontrol et".', ROUNDS, PER)}</p>
          <button onClick={start} className={PRIMARY_BTN} style={PRIMARY_BG}>
            <Icon name="play" className="h-4 w-4" />
            {phase === 'done' ? tt('Tekrar oyna') : tt('Başla')}
          </button>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-500 mb-2 px-1">
            <span>⬆ {tt('EN ESKİ')}</span>
            <span>
              {tt('Tur')} {round + 1}/{ROUNDS}
            </span>
          </div>
          <div className="space-y-2">
            {list.map((x, i) => {
              const ok = checked && sorted[i].id === x.id
              const bad = checked && !ok
              return (
                <div
                  key={x.id}
                  draggable={!checked}
                  onDragStart={() => setDrag(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (drag !== null) move(drag, i)
                    setDrag(null)
                  }}
                  className={`flex items-center gap-3 rounded-2xl border bg-neutral-900 px-3 py-2 transition ${ok ? 'border-emerald-500/70 bg-emerald-500/10' : bad ? 'border-rose-500/60 bg-rose-500/10' : 'border-neutral-800 cursor-grab active:cursor-grabbing hover:border-neutral-600'}`}
                >
                  <span className="w-5 text-center text-sm font-bold text-neutral-500">{i + 1}</span>
                  <img src={x.poster} alt="" className="h-16 w-11 rounded-md object-cover" />
                  <span className="flex-1 min-w-0 font-bold text-neutral-100 truncate">{x.title}</span>
                  <span className={`font-mono text-sm font-bold ${checked ? (ok ? 'text-emerald-300' : 'text-rose-300') : 'text-neutral-600'}`}>{checked ? x.year : '????'}</span>
                  {!checked && (
                    <span className="flex gap-1">
                      <button onClick={() => move(i, i - 1)} disabled={i === 0} className="h-8 w-8 rounded-lg border border-neutral-700 text-neutral-300 hover:border-neutral-500 disabled:opacity-30">
                        ↑
                      </button>
                      <button onClick={() => move(i, i + 1)} disabled={i === list.length - 1} className="h-8 w-8 rounded-lg border border-neutral-700 text-neutral-300 hover:border-neutral-500 disabled:opacity-30">
                        ↓
                      </button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-neutral-500 mt-2 px-1">
            <span>⬇ {tt('EN YENİ')}</span>
          </div>
          <div className="mt-4 flex items-center gap-3">
            {!checked ? (
              <button onClick={check} className={PRIMARY_BTN} style={PRIMARY_BG}>
                {tt('Kontrol et')}
              </button>
            ) : (
              <>
                <p className="flex-1 font-bold text-neutral-100">{correct === PER ? tt('Hepsi doğru! +{0}', correct * 20 + 50) : tt('{0}/{1} doğru yerde · +{2}', correct, PER, correct * 20)}</p>
                <button onClick={next} className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black">
                  {round + 1 >= ROUNDS ? tt('Sonuçlar') : tt('Sonraki tur')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </GameShell>
  )
}
