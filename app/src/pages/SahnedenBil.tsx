import { useEffect, useMemo, useRef, useState } from 'react'
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

// Sahneden bil (v1.23.4, Ayarlar › Ekstralar): arşivindeki bir yapımın görseli bulanık gelir, 10 saniyede netleşir; ne
// kadar erken bilirsen o kadar puan. 10 soruluk tur; profil rekorları bu bilgisayarda tutulur.

const ROUNDS = 10
const recordKey = (pid: string) => `argus_sahne_rekor_${pid}`

export default function SahnedenBil() {
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const { profiles, activeProfileId } = useProfiles()
  const pool = useMemo(() => {
    if (!board) return [] as { row: Row; img: string; title: string }[]
    const banner = resolveRole(board, 'banner')
    const durum = resolveRole(board, 'durum')
    const izlendi = resolveStatusOption(board, 'izlendi')
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    if (!banner || !tp) return []
    const all = rows.filter((r) => r.values[banner.id]).map((r) => ({ row: r, img: r.values[banner.id] as string, title: titleText(tp, r.values[tp.id]), seen: durum && izlendi && r.values[durum.id] === izlendi }))
    const seen = all.filter((x) => x.seen)
    return (seen.length >= 12 ? seen : all).filter((x) => x.title)
  }, [board, rows])

  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [q, setQ] = useState<{ ans: (typeof pool)[number]; opts: (typeof pool)[number][] } | null>(null)
  const [left, setLeft] = useState(10)
  const [chosen, setChosen] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [blur, setBlur] = useState(26)

  function next() {
    if (timer.current) clearInterval(timer.current)
    const ans = pool[Math.floor(Math.random() * pool.length)]
    const others = pool.filter((p) => p.row.id !== ans.row.id && p.title !== ans.title).sort(() => Math.random() - 0.5).slice(0, 3)
    setQ({ ans, opts: [ans, ...others].sort(() => Math.random() - 0.5) })
    setChosen(null)
    setLeft(10)
    setBlur(26)
    requestAnimationFrame(() => requestAnimationFrame(() => setBlur(0)))
    timer.current = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
  }
  useEffect(() => () => (timer.current ? clearInterval(timer.current) : undefined), [])
  useEffect(() => {
    if (left === 0 && q && !chosen) answer('')
  }, [left])

  function answer(id: string) {
    if (!q || chosen !== null) return
    if (timer.current) clearInterval(timer.current)
    setChosen(id || '-')
    setBlur(0)
    if (id === q.ans.row.id) setScore((s) => s + Math.max(1, left) * 10)
    setTimeout(() => {
      if (round + 1 >= ROUNDS) setRound(ROUNDS)
      else {
        setRound((r) => r + 1)
        next()
      }
    }, 1600)
  }
  const finished = round >= ROUNDS
  useEffect(() => {
    if (!finished || !activeProfileId) return
    try {
      if (score > Number(localStorage.getItem(recordKey(activeProfileId)) ?? 0)) localStorage.setItem(recordKey(activeProfileId), String(score))
    } catch {
      /* önemsiz */
    }
  }, [finished])

  if (loading || !board) return <PageSkeleton />
  if (pool.length < 4) return <EmptyState art="kayit" title={tt('Oynamak için yeterli görsel yok')} text={tt('Arşivinde yatay görseli (banner) olan en az 4 yapım olmalı.')} />
  const records = profiles.map((p) => ({ p, s: Number((() => { try { return localStorage.getItem(recordKey(p.id)) } catch { return null } })() ?? 0) })).sort((a, b) => b.s - a.s)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <section className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-sm font-semibold tracking-widest text-pink-300">{tt('ARGUS')}</p>
          <h1 className="text-4xl font-black text-neutral-50 tracking-tight">{tt('Sahneden bil')}</h1>
          <p className="text-neutral-400 mt-1">{tt('Görsel bulanık başlar, netleşir. Ne kadar erken bilirsen o kadar puan.')}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-neutral-500">{tt('Skor')}</p>
          <p className="text-3xl font-black text-neutral-50 tabular-nums">{score}</p>
        </div>
      </section>

      {!started || finished ? (
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-8 text-center">
          {finished && (
            <>
              <p className="text-neutral-400">{tt('Tur bitti!')}</p>
              <p className="text-5xl font-black text-neutral-50 my-2 tabular-nums">{score}</p>
            </>
          )}
          <button
            onClick={() => {
              setStarted(true)
              setScore(0)
              setRound(0)
              next()
            }}
            className="mt-3 text-base font-semibold rounded-full px-6 py-2.5 text-white"
            style={{ background: 'linear-gradient(90deg,#db2777,#f472b6)' }}
          >
            {finished ? tt('Tekrar oyna') : tt('Başla')} ({ROUNDS} {tt('soru')})
          </button>
          <div className="mt-8 max-w-xs mx-auto text-left">
            <p className="text-xs uppercase tracking-wider text-neutral-500 mb-2">{tt('Rekorlar')}</p>
            {records.map(({ p, s }, i) => (
              <p key={p.id} className="flex justify-between rounded-lg bg-neutral-900 px-3 py-1.5 mb-1 text-sm">
                <span className="text-neutral-300">
                  {i === 0 && s > 0 ? '🏆 ' : ''}
                  {p.username}
                </span>
                <span className="tabular-nums text-neutral-100">{s}</span>
              </p>
            ))}
          </div>
        </div>
      ) : (
        q && (
          <div className="grid gap-5 md:grid-cols-[1.5fr_1fr] items-center">
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
              <img key={q.ans.row.id} src={q.ans.img} alt="" className="h-full w-full object-cover" style={{ filter: `blur(${blur}px) saturate(${blur ? 0.7 : 1})`, transition: chosen ? 'filter .4s' : 'filter 10s linear' }} />
              <span className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1 text-sm font-bold text-white">⏱ {left}</span>
              <span className="absolute top-3 right-3 rounded-full bg-black/70 px-3 py-1 text-sm text-neutral-200">
                {round + 1}/{ROUNDS}
              </span>
            </div>
            <div className="grid gap-2.5">
              {q.opts.map((o) => {
                const right = chosen && o.row.id === q.ans.row.id
                const wrong = chosen === o.row.id && o.row.id !== q.ans.row.id
                return (
                  <button
                    key={o.row.id}
                    onClick={() => answer(o.row.id)}
                    className={`text-left rounded-xl border px-4 py-3 font-semibold transition ${right ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : wrong ? 'border-rose-500 bg-rose-500/15 text-rose-200' : 'border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-neutral-500'}`}
                  >
                    {o.title}
                  </button>
                )
              })}
            </div>
          </div>
        )
      )}
    </div>
  )
}
