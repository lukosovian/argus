import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Board, HomeSettings, Row } from '../types'
import { ratingAverage, titleText } from '../types'
import { useProfiles } from '../hooks/useProfiles'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useToast } from '../hooks/useToast'
import { resolveRole, resolveStatusOption, watchedStatusIds } from '../lib/roles'
import { fold } from '../lib/turkce'
import { tt } from '../lib/i18n'
import EmptyState from '../components/EmptyState'
import PageSkeleton from '../components/Skeleton'

// Birlikte izle + Zevk uyumu (v1.23.4, Ayarlar › Ekstralar). İki profilin arşivleri yapımın orijinal adı + çıkış yılıyla
// eşleştirilir: ikinizin de izlenecekleri, birinizin sevip diğerinin izlemedikleri, puan uyumu ve "Bunu ona öner".

type Side = { board: Board; rows: Row[] }
type Info = { row: Row; key: string; title: string; poster: string; todo: boolean; watched: boolean; score: number | null }

function index(s: Side): Map<string, Info> {
  const b = s.board
  const tp = b.properties.find((p) => p.id === b.titlePropertyId)
  const orig = resolveRole(b, 'orjinalAdi')
  const viz = resolveRole(b, 'vizyon')
  const poster = resolveRole(b, 'poster')
  const durum = resolveRole(b, 'durum')
  const puan = resolveRole(b, 'puan')
  const later = resolveStatusOption(b, 'izlenecek')
  const done = watchedStatusIds(b)
  const m = new Map<string, Info>()
  for (const r of s.rows) {
    const title = tp ? titleText(tp, r.values[tp.id]) : ''
    const name = (orig && typeof r.values[orig.id] === 'string' && (r.values[orig.id] as string)) || title
    if (!name) continue
    const key = fold(name).replace(/[^a-z0-9]/g, '') + ':' + (viz ? String(r.values[viz.id] ?? '').slice(0, 4) : '')
    m.set(key, {
      row: r,
      key,
      title,
      poster: poster ? ((r.values[poster.id] as string) ?? '') : '',
      todo: Boolean(durum && later && r.values[durum.id] === later),
      watched: Boolean(durum && done.has(r.values[durum.id] as string)),
      score: puan ? ratingAverage(r.values[puan.id], puan) : null,
    })
  }
  return m
}

async function loadOther(pid: string): Promise<Side | null> {
  const j = async <T,>(u: string) => (await fetch(u)).json() as Promise<T>
  try {
    const home = await j<HomeSettings>(`/api/profiles/${pid}/home-settings`)
    const boards = await j<Board[]>(`/api/profiles/${pid}/boards`)
    const board = boards.find((b) => b.id === home?.boardId) ?? boards[0]
    if (!board) return null
    return { board, rows: await j<Row[]>(`/api/profiles/${pid}/boards/${board.id}/rows`) }
  } catch {
    return null
  }
}

function Posters({ list, onOpen, action }: { list: Info[]; onOpen: (i: Info) => void; action?: (i: Info) => React.ReactNode }) {
  if (!list.length) return <p className="text-sm text-neutral-500">{tt('Burada bir şey yok.')}</p>
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
      {list.map((i) => (
        <div key={i.key} className="min-w-0">
          <button onClick={() => onOpen(i)} className="block w-full aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 shadow-lg shadow-black/40 hover:-translate-y-1 transition" title={i.title}>
            {i.poster && <img src={i.poster} alt={i.title} loading="lazy" className="h-full w-full object-cover" />}
          </button>
          <p className="mt-1.5 text-xs text-neutral-300 truncate">{i.title}</p>
          {action?.(i)}
        </div>
      ))}
    </div>
  )
}

export default function Birlikte() {
  const { profiles, activeProfile, activeProfileId } = useProfiles()
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const { notify } = useToast()
  const navigate = useNavigate()
  const others = profiles.filter((p) => p.id !== activeProfileId)
  const [otherId, setOtherId] = useState<string | null>(null)
  const oid = otherId ?? others[0]?.id ?? null
  const other = profiles.find((p) => p.id === oid) ?? null
  const [side, setSide] = useState<Side | null>(null)
  const [busy, setBusy] = useState(true)
  const [pick, setPick] = useState<Info | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!oid) return
    setBusy(true)
    loadOther(oid).then((s) => {
      setSide(s)
      setBusy(false)
    })
  }, [oid])

  const data = useMemo(() => {
    if (!board || !side) return null
    const mine = index({ board, rows })
    const theirs = index(side)
    const shared: Info[] = []
    const theyLoved: Info[] = []
    const both: { me: Info; them: Info }[] = []
    const recommend: { me: Info; them: Info }[] = []
    for (const [k, t] of theirs) {
      const m = mine.get(k)
      if (m && m.todo && t.todo) shared.push(m)
      if (t.watched && (t.score ?? 0) >= 8 && (!m || !m.watched)) theyLoved.push(m ?? t)
      if (m && m.score !== null && t.score !== null) both.push({ me: m, them: t })
      if (m && m.watched && (m.score ?? 0) >= 8 && !t.watched) recommend.push({ me: m, them: t })
    }
    const diff = both.map((b) => ({ ...b, d: Math.abs(b.me.score! - b.them.score!) }))
    const match = diff.length ? Math.round(100 - (diff.reduce((a, b) => a + b.d, 0) / diff.length) * 10) : null
    return {
      shared,
      theyLoved: theyLoved.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 18),
      match,
      agree: [...diff].sort((a, b) => a.d - b.d || b.me.score! - a.me.score!).slice(0, 5),
      disagree: [...diff].sort((a, b) => b.d - a.d).slice(0, 5),
      recommend: recommend.sort((a, b) => (b.me.score ?? 0) - (a.me.score ?? 0)).slice(0, 12),
      overlap: both.length,
    }
  }, [board, rows, side])

  async function suggest(it: { me: Info; them: Info }) {
    if (!oid || !side) return
    try {
      await fetch(`/api/profiles/${oid}/aklimda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: { [it.them.row.id]: { boardId: side.board.id, addedAt: Date.now() } } }),
      })
      setSent((s) => new Set(s).add(it.me.key))
      notify(tt('"{0}", {1} profilinin Aklımda listesine eklendi.', it.me.title, other?.username ?? ''), 'success')
    } catch {
      notify(tt('Kaydedilemedi.'), 'danger')
    }
  }

  function pickForUs() {
    if (!data?.shared.length) return
    let n = 0
    const total = 14 + Math.floor(Math.random() * 6)
    const step = () => {
      setPick(data.shared[Math.floor(Math.random() * data.shared.length)])
      if (++n < total) setTimeout(step, 60 + n * 14)
    }
    step()
  }

  if (!others.length) return <EmptyState art="kayit" title={tt('Başka profil yok')} text={tt('Birlikte izlemek için Ayarlar › Profil Ayarları\'ndan ikinci bir profil ekle.')} />
  if (loading || !board) return <PageSkeleton kind="posters" />
  const ext = settings.extras ?? {}
  const open = (i: Info) => navigate(`/?detay=${i.row.id}`)
  const avatar = (photo: string | undefined, name: string | undefined, ring: string) => (
    <span className="h-20 w-20 rounded-2xl overflow-hidden bg-neutral-800 flex items-center justify-center text-2xl text-neutral-400" style={{ boxShadow: `0 0 0 3px #0a0a0a, 0 0 0 5px ${ring}` }}>
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : name?.slice(0, 1)}
    </span>
  )
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-8 sm:px-10" style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(239,68,68,.16), transparent 55%), radial-gradient(ellipse at 85% 100%, rgba(139,92,246,.18), transparent 60%), var(--color-neutral-950)' }}>
        <p className="text-sm font-semibold tracking-widest text-[#7fdcff]">{tt('ARGUS')}</p>
        <h1 className="text-4xl sm:text-5xl font-black text-neutral-50 tracking-tight mt-1">{tt('Birlikte izle')}</h1>
        <div className="mt-6 flex flex-wrap items-center gap-6">
          {avatar(activeProfile?.photo, activeProfile?.username, '#ef4444')}
          <div className="text-center">
            <b className="block text-4xl font-black text-neutral-50 tabular-nums">{busy ? '…' : (data?.shared.length ?? 0)}</b>
            <span className="text-xs text-neutral-400">{tt('ikinizin de listesinde')}</span>
          </div>
          {avatar(other?.photo, other?.username, '#8b5cf6')}
          {others.length > 1 && (
            <div className="flex gap-1.5 ml-auto">
              {others.map((p) => (
                <button key={p.id} onClick={() => setOtherId(p.id)} className={`text-sm rounded-full px-3 py-1.5 border transition ${p.id === oid ? 'border-violet-400 bg-violet-500/15 text-neutral-50' : 'border-neutral-700 text-neutral-400 hover:text-neutral-100'}`}>
                  {p.username}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {busy || !data ? (
        <PageSkeleton kind="posters" />
      ) : (
        <>
          <section>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h2 className="text-xl font-bold text-neutral-50">{tt('İkinizin de izleyecekleri')}</h2>
              {data.shared.length > 0 && (
                <button onClick={pickForUs} className="ml-auto text-sm font-semibold rounded-full px-4 py-2 text-white" style={{ background: 'linear-gradient(90deg,#ef4444,#8b5cf6)' }}>
                  🎲 {tt('İkimiz için seç')}
                </button>
              )}
            </div>
            {pick && (
              <button onClick={() => open(pick)} className="mb-4 flex items-center gap-4 rounded-2xl border border-violet-400/40 bg-violet-500/10 p-3 pr-5 text-left">
                {pick.poster && <img src={pick.poster} alt="" className="h-24 aspect-[2/3] rounded-lg object-cover" />}
                <span>
                  <span className="block text-xs uppercase tracking-wider text-violet-300">{tt('Bu akşam ikiniz için')}</span>
                  <span className="block text-xl font-bold text-neutral-50">{pick.title}</span>
                  <span className="block text-xs text-neutral-400">{tt('detayı açmak için tıkla')}</span>
                </span>
              </button>
            )}
            <Posters list={data.shared} onOpen={open} />
          </section>
          <section>
            <h2 className="text-xl font-bold text-neutral-50 mb-3">{tt('{0} çok sevdi, sen izlemedin', other?.username ?? '')}</h2>
            <Posters list={data.theyLoved} onOpen={(i) => (rows.some((r) => r.id === i.row.id) ? open(i) : undefined)} action={(i) => i.score !== null && <p className="text-[11px] text-amber-400">★ {i.score.toFixed(1)}</p>} />
          </section>
          {ext.taste && (
            <section className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6">
              <h2 className="text-xl font-bold text-neutral-50">{tt('Zevk uyumu')}</h2>
              {data.match === null ? (
                <p className="text-sm text-neutral-500 mt-2">{tt('İkinizin de puan verdiği ortak bir yapım yok henüz.')}</p>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-8">
                  <div className="relative h-40 w-40">
                    <svg viewBox="0 0 170 170" className="h-full w-full -rotate-90">
                      <circle cx="85" cy="85" r="72" fill="none" stroke="var(--color-neutral-800)" strokeWidth="12" />
                      <circle cx="85" cy="85" r="72" fill="none" stroke="url(#uyum)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(452 * Math.max(0, data.match)) / 100} 452`} />
                      <defs>
                        <linearGradient id="uyum">
                          <stop offset="0" stopColor="#ef4444" />
                          <stop offset="1" stopColor="#8b5cf6" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <span className="absolute inset-0 flex flex-col items-center justify-center">
                      <b className="text-4xl font-black text-neutral-50">%{Math.max(0, data.match)}</b>
                      <span className="text-xs text-neutral-400">{tt('{0} ortak puan', data.overlap)}</span>
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 flex-1 min-w-[280px]">
                    {[
                      [tt('En çok anlaştıklarınız'), data.agree],
                      [tt('Hiç anlaşamadıklarınız'), data.disagree],
                    ].map(([t, l]) => (
                      <div key={t as string}>
                        <p className="text-xs uppercase tracking-wider text-neutral-500 mb-2">{t as string}</p>
                        {(l as typeof data.agree).map((x) => (
                          <p key={x.me.key} className="flex justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-1.5 mb-1 text-sm">
                            <span className="truncate text-neutral-200">{x.me.title}</span>
                            <span className="shrink-0 tabular-nums text-neutral-400">
                              {x.me.score!.toFixed(1)} / {x.them.score!.toFixed(1)}
                            </span>
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.recommend.length > 0 && (
                <>
                  <h3 className="text-base font-semibold text-neutral-100 mt-7 mb-3">{tt('Sevdiklerin, {0} henüz izlemedi', other?.username ?? '')}</h3>
                  <Posters
                    list={data.recommend.map((r) => r.me)}
                    onOpen={open}
                    action={(i) => {
                      const it = data.recommend.find((r) => r.me.key === i.key)!
                      return (
                        <button disabled={sent.has(i.key)} onClick={() => suggest(it)} className="mt-1 w-full text-[11px] rounded-md border border-violet-400/50 py-1 text-violet-200 hover:bg-violet-500/20 disabled:opacity-60">
                          {sent.has(i.key) ? tt('✓ Önerildi') : tt('Bunu ona öner')}
                        </button>
                      )
                    }}
                  />
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
