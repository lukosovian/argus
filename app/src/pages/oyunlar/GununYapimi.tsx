import { useMemo, useState } from 'react'
import { useArchive } from './useArchive'
import { useProfiles } from '../../hooks/useProfiles'
import { fold, preferWatched, readDaily, seeded, sfx, today, writeDaily, type GameItem } from '../../lib/games'
import { tt, ttx } from '../../lib/i18n'
import PageSkeleton from '../../components/Skeleton'
import EmptyState from '../../components/EmptyState'
import { FinishInfo, GameShell, useFinish, type Finish } from '../../components/oyun/GameShell'

// G6 Günün yapımı (v1.24): her gün arşivinden gizli bir yapım. Bir tahmin yazarsın; her sütun ipucu verir: yıl (daha
// yeni / eski, 3 yıl yakınsa sarı), tür ve ülke (aynı / ortak / yok), film mi dizi mi, yönetmen ve oyuncu ortaklığı.
// 8 hakta bul. Günde bir oyun; bildiğin günler seri yapar, 7 günlük seri Ödüller'e Altın paket.

const MAX = 8
type Day = { guesses: string[]; done: boolean; won: boolean }
type Cell = { text: string; c: 'g' | 'y' | 'x' }

function compare(g: GameItem, s: GameItem): Cell[] {
  const year: Cell =
    g.year === null || s.year === null
      ? { text: '?', c: 'x' }
      : g.year === s.year
        ? { text: `${g.year} ✓`, c: 'g' }
        : { text: `${g.year} ${s.year > g.year ? '↑' : '↓'}`, c: Math.abs(g.year - s.year) <= 3 ? 'y' : 'x' }
  const set = (a: string[], b: string[]): Cell => {
    const common = a.filter((x) => b.includes(x))
    if (a.length && a.length === b.length && common.length === a.length) return { text: a.slice(0, 2).join(', '), c: 'g' }
    if (common.length) return { text: common.slice(0, 2).join(', '), c: 'y' }
    return { text: a.slice(0, 2).join(', ') || '—', c: 'x' }
  }
  const dirG = fold(g.director)
  const shared = g.actors.find((a) => s.actors.some((b) => b.id === a.id))
  return [
    year,
    set(g.genres, s.genres),
    set(g.countries, s.countries),
    { text: g.series ? tt('Dizi') : tt('Film'), c: g.series === s.series ? 'g' : 'x' },
    { text: g.director || '—', c: dirG && dirG === fold(s.director) ? 'g' : 'x' },
    { text: shared ? shared.name : '—', c: shared ? 'g' : 'x' },
  ]
}

const CELL_CLASS: Record<Cell['c'], string> = {
  g: 'bg-emerald-500/30 border-emerald-500/50 text-white',
  y: 'bg-amber-500/25 border-amber-400/50 text-amber-50',
  x: 'bg-neutral-800/70 border-neutral-700 text-neutral-400',
}

export default function GununYapimi() {
  const { pool, loading } = useArchive()
  const { activeProfileId } = useProfiles()
  const finish = useFinish('gunluk')
  const day = today()
  const cands = useMemo(() => preferWatched(pool.filter((x) => x.year && x.genres.length && x.poster), 20), [pool])
  const secret = useMemo(() => {
    if (!cands.length) return null
    const sorted = [...cands].sort((a, b) => a.id.localeCompare(b.id))
    return sorted[Math.floor(seeded(`gunun-yapimi:${day}`)() * sorted.length)]
  }, [cands, day])
  const [all, setAll] = useState<Record<string, Day>>(() => (activeProfileId ? readDaily<Day>(activeProfileId, 'gunluk') : {}))
  const st: Day = all[day] ?? { guesses: [], done: false, won: false }
  const [q, setQ] = useState('')
  const [fin, setFin] = useState<Finish | null>(null)
  const byId = useMemo(() => new Map(pool.map((x) => [x.id, x])), [pool])
  const sugg = useMemo(() => {
    const t = fold(q)
    if (t.length < 2) return []
    return pool.filter((x) => !st.guesses.includes(x.id) && (fold(x.title).includes(t) || (x.orig && fold(x.orig).includes(t)))).slice(0, 6)
  }, [q, pool, st.guesses])

  // Seri: bugünden (bitmişse) ya da dünden geriye üst üste bilinen günler
  const streak = useMemo(() => {
    let n = 0
    const d = new Date()
    if (!all[day]?.won) d.setDate(d.getDate() - 1)
    for (;;) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!all[k]?.won) break
      n++
      d.setDate(d.getDate() - 1)
    }
    return n
  }, [all, day])

  function guess(x: GameItem) {
    if (!secret || st.done || !activeProfileId) return
    const guesses = [...st.guesses, x.id]
    const won = x.id === secret.id
    const done = won || guesses.length >= MAX
    const next = { ...all, [day]: { guesses, done, won } }
    setAll(next)
    writeDaily(activeProfileId, 'gunluk', next)
    setQ('')
    if (won) sfx.streak()
    else if (done) sfx.bad()
    else sfx.tick()
    if (done) {
      const score = won ? (MAX + 1 - guesses.length) * 100 : 0
      // Seri 7'nin katına ulaştıysa Altın paket
      let s = 0
      const d = new Date()
      for (;;) {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        if (!next[k]?.won) break
        s++
        d.setDate(d.getDate() - 1)
      }
      finish(score, won && s > 0 && s % 7 === 0 ? { key: `seri7:${day}`, tier: 'altin' } : null).then(setFin)
    }
  }

  if (loading) return <PageSkeleton />
  if (!secret) return <EmptyState art="kayit" title={tt('Yeterli yapım yok')} text={tt('Yılı, türü ve afişi dolu yapımlar gerekli.')} />

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - 13 + i)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { k, d: d.getDate(), s: all[k] }
  })
  const heads = [tt('Yıl'), tt('Tür'), tt('Ülke'), tt('Film/Dizi'), tt('Yönetmen'), tt('Ortak oyuncu')]

  return (
    <GameShell
      game="gunluk"
      title={tt('Günün yapımı')}
      subtitle={tt('Arşivinden gizli bir yapım. 8 tahminde bul; her tahmin ipucu verir.')}
      right={<span className="rounded-full bg-amber-500/15 border border-amber-400/40 px-3 py-1 text-sm font-bold text-amber-200">🔥 {ttx('{0} gün seri', streak)}</span>}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_260px] items-start">
        <div className="space-y-4">
          {!st.done ? (
            <div className="relative">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sugg[0] && guess(sugg[0])}
                placeholder={tt('Tahminini yaz… ({0} hakkın kaldı)', MAX - st.guesses.length)}
                className="w-full rounded-xl bg-neutral-900 border border-neutral-700 focus:border-[#00c0fa] px-4 py-3 text-base font-semibold text-neutral-100 outline-none"
              />
              {sugg.length > 0 && (
                <div className="absolute z-10 inset-x-0 mt-1.5 rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden shadow-2xl">
                  {sugg.map((s) => (
                    <button key={s.id} onClick={() => guess(s)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-800">
                      {s.poster ? <img src={s.poster} alt="" className="h-10 w-7 rounded object-cover" /> : <span className="h-10 w-7 rounded bg-neutral-800" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-neutral-100 truncate">{s.title}</span>
                        <span className="block text-xs text-neutral-500">{s.year}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={`flex items-center gap-4 rounded-2xl border p-4 ${st.won ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-rose-500/40 bg-rose-500/10'}`}>
              {secret.poster && <img src={secret.poster} alt="" className="h-24 w-16 rounded-lg object-cover" />}
              <div className="flex-1 min-w-0">
                <p className={`font-bold ${st.won ? 'text-emerald-300' : 'text-rose-300'}`}>{st.won ? ttx('{0} tahminde buldun! 🎉', st.guesses.length) : tt('Bugün olmadı. Gizli yapım:')}</p>
                <p className="text-2xl font-black text-white truncate">{secret.title}</p>
                <p className="text-sm text-neutral-400">{tt('Yarın yeni bir yapım gelecek.')}</p>
              </div>
            </div>
          )}
          <FinishInfo f={fin} />
          <div className="overflow-x-auto">
            <div className="min-w-[640px] space-y-1.5">
              <div className="grid grid-cols-[1.6fr_repeat(6,1fr)] gap-1.5 text-[10px] font-bold tracking-wider text-neutral-500 px-1">
                <span>{tt('TAHMİN')}</span>
                {heads.map((h) => (
                  <span key={h} className="text-center">
                    {h.toLocaleUpperCase('tr')}
                  </span>
                ))}
              </div>
              {[...st.guesses].reverse().map((id) => {
                const g = byId.get(id)
                if (!g) return null
                const cells = compare(g, secret)
                return (
                  <div key={id} className="grid grid-cols-[1.6fr_repeat(6,1fr)] gap-1.5" style={{ animation: 'argus-toast-in .3s ease-out' }}>
                    <div className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${id === secret.id ? CELL_CLASS.g : 'border-neutral-700 bg-neutral-900'}`}>
                      {g.poster && <img src={g.poster} alt="" className="h-9 w-6 rounded object-cover" />}
                      <span className="text-xs font-bold text-neutral-100 line-clamp-2">{g.title}</span>
                    </div>
                    {cells.map((c, i) => (
                      <div key={i} className={`flex items-center justify-center rounded-lg border px-1 py-1.5 text-[11px] font-semibold text-center leading-tight ${CELL_CLASS[c.c]}`}>
                        {c.text}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
          <p className="text-xs text-neutral-500">{tt('Yeşil: aynı · Sarı: yakın / ortak var · Ok: gizli yapım daha yeni (↑) ya da daha eski (↓).')}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="text-xs font-bold tracking-wider text-neutral-500 mb-3">{tt('SON 14 GÜN')}</p>
          <div className="grid grid-cols-7 gap-1.5">
            {last14.map((x) => (
              <span
                key={x.k}
                title={x.k}
                className={`aspect-square rounded-lg flex items-center justify-center text-[11px] font-bold ${x.s?.won ? 'bg-emerald-500/25 text-emerald-200' : x.s?.done ? 'bg-rose-500/20 text-rose-200' : 'bg-neutral-800 text-neutral-500'} ${x.k === day ? 'ring-2 ring-[#00c0fa]' : ''}`}
              >
                {x.d}
              </span>
            ))}
          </div>
          <p className="text-xs text-neutral-500 mt-3">{tt('7 gün üst üste bilince (Ödüller açıksa) Altın paket.')}</p>
        </div>
      </div>
    </GameShell>
  )
}
