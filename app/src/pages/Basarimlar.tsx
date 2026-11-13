import { useEffect, useId, useMemo, useState } from 'react'
import type { WatchedMap } from '../types'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useProfiles } from '../hooks/useProfiles'
import { api } from '../lib/api'
import { computeAchievements, countDone, TIER_COLORS, TIER_NAMES, unlockedDatesKey, type Achievement } from '../lib/achievements'
import { fmtDate, tt } from '../lib/i18n'
import PageSkeleton from '../components/Skeleton'
import Icon from '../components/Icon'

// Başarımlar sayfası (Ayarlar › Profil Ayarları › Profil menüsündeki sayfalar). v1.23.5'te yenilendi — kullanıcı
// "başarımlar daha da güzelleşebilir" dedi: emojiler yerine madalyalar (dış halka seviyenin metali: bronz, gümüş, altın;
// içi rozetin kendi rengi ve ikonu), sıradaki seviyeye ilerleme halkası, "yakında" listesi ve süzgeç.

type Filter = 'hepsi' | 'kazanilan' | 'devam'

export default function Basarimlar() {
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const { activeProfileId } = useProfiles()
  const [watched, setWatched] = useState<WatchedMap>({})
  const [universesDone, setUniversesDone] = useState(0)
  const [filter, setFilter] = useState<Filter>('hepsi')
  useEffect(() => {
    api.getWatched().then(setWatched).catch(() => {})
    if (settings.boardId) api.getEvrenler(settings.boardId).then((d) => setUniversesDone(countDone(d.universes))).catch(() => {})
  }, [settings.boardId])
  const list = useMemo(() => (board ? computeAchievements(board, rows, watched, { universesDone }) : []), [board, rows, watched, universesDone])
  const dates = useMemo<Record<string, string>>(() => {
    try {
      return activeProfileId ? JSON.parse(localStorage.getItem(unlockedDatesKey(activeProfileId)) ?? '{}') : {}
    } catch {
      return {}
    }
  }, [activeProfileId, list])
  if (loading || !board) return <PageSkeleton kind="posters" />

  const levels = list.reduce((s, a) => s + a.level, 0)
  const maxLevels = list.length * 3
  const earned = list.filter((a) => a.level > 0).length
  const golds = list.filter((a) => a.level === 3).length
  const next = list
    .filter((a) => a.level < 3)
    .map((a) => ({ a, p: progressOf(a) }))
    .sort((x, y) => y.p - x.p)
    .slice(0, 3)
  const shown = list.filter((a) => (filter === 'kazanilan' ? a.level > 0 : filter === 'devam' ? a.level < 3 : true))
  const C = 2 * Math.PI * 52

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <section
        className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-7 sm:px-9"
        style={{ background: 'radial-gradient(ellipse at 10% 0%, rgba(250,204,21,.14), transparent 55%), radial-gradient(ellipse at 95% 110%, rgba(0,192,250,.12), transparent 60%), var(--color-neutral-950)' }}
      >
        <div className="flex flex-wrap items-center gap-8">
          <div className="relative h-36 w-36 shrink-0">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-neutral-800)" strokeWidth="9" />
              <circle cx="60" cy="60" r="52" fill="none" stroke="url(#bas-halka)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(levels / Math.max(1, maxLevels)) * C} ${C}`} style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.2,.8,.2,1)' }} />
              <defs>
                <linearGradient id="bas-halka">
                  <stop offset="0" stopColor="#f59e0b" />
                  <stop offset="1" stopColor="#fde68a" />
                </linearGradient>
              </defs>
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <b className="text-4xl font-black text-neutral-50 tabular-nums leading-none">{levels}</b>
              <span className="text-xs text-neutral-400 mt-1">/ {maxLevels} {tt('seviye')}</span>
            </span>
          </div>
          <div className="min-w-[220px] flex-1">
            <h1 className="text-4xl sm:text-5xl font-black text-neutral-50 tracking-tight">{tt('Başarımlar')}</h1>
            <p className="text-neutral-300 mt-2">{tt('{0} rozetin {1} tanesini açtın, {2} tanesi altın.', list.length, earned, golds)}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {[1, 2, 3].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/70 px-2.5 py-1 text-neutral-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: `linear-gradient(135deg,${TIER_COLORS[t][0]},${TIER_COLORS[t][1]})` }} />
                  {TIER_NAMES()[t]} · {list.filter((a) => a.level >= t).length}
                </span>
              ))}
            </div>
          </div>
          {next.length > 0 && (
            <div className="w-full lg:w-80 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{tt('Yakında')}</p>
              {next.map(({ a, p }) => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: `linear-gradient(135deg,${a.colors[0]},${a.colors[1]})` }}>
                    <Icon name={a.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2 text-sm">
                      <span className="truncate text-neutral-100">{a.title}</span>
                      <span className="tabular-nums text-neutral-500">
                        {Math.min(a.value, a.goal)}/{a.goal}
                      </span>
                    </span>
                    <span className="mt-1 block h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${p * 100}%`, background: `linear-gradient(90deg,${TIER_COLORS[a.level + 1][0]},${TIER_COLORS[a.level + 1][1]})` }} />
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900/70 p-1 w-fit">
        {(
          [
            ['hepsi', tt('Hepsi')],
            ['kazanilan', tt('Açtıklarım')],
            ['devam', tt('Devam edenler')],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={`text-sm rounded-lg px-3.5 py-1.5 transition ${filter === k ? 'bg-neutral-800 text-neutral-50 ring-1 ring-amber-400/40' : 'text-neutral-400 hover:text-neutral-100'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {shown.map((a, i) => (
          <BadgeCard key={a.id} a={a} index={i} date={a.level > 0 ? dates[`${a.id}:${a.level}`] : undefined} />
        ))}
      </div>
    </div>
  )
}

function progressOf(a: Achievement): number {
  if (a.level >= 3) return 1
  const from = a.level ? a.tiers[a.level - 1] : 0
  return Math.max(0, Math.min(1, (a.value - from) / Math.max(1, a.goal - from)))
}

function BadgeCard({ a, index, date }: { a: Achievement; index: number; date?: string }) {
  const p = progressOf(a)
  const max = a.level >= 3
  return (
    <div
      className="group relative flex flex-col items-center rounded-2xl border border-neutral-800 bg-neutral-900/50 px-3 pt-5 pb-4 text-center transition duration-300 hover:-translate-y-1 hover:border-neutral-700 hover:bg-neutral-900"
      style={{ animation: `pickIn .45s cubic-bezier(.2,.8,.2,1) ${index * 0.035}s both` }}
    >
      <Medal a={a} progress={p} />
      <p className="mt-3 text-sm font-bold text-neutral-100">{a.title}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: a.level ? TIER_COLORS[a.level][1] : 'var(--color-neutral-500)' }}>
        {TIER_NAMES()[a.level]}
      </p>
      <p className="mt-1.5 text-xs text-neutral-400 leading-snug min-h-[2.5em]">{max ? tt('En üst seviye!') : a.hint.replace('{0}', String(a.goal))}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {[1, 2, 3].map((t) => (
          <span key={t} className="h-1.5 w-6 rounded-full" style={{ background: a.level >= t ? `linear-gradient(90deg,${TIER_COLORS[t][0]},${TIER_COLORS[t][1]})` : 'var(--color-neutral-800)' }} />
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-neutral-500 tabular-nums">{max ? (date ? fmtDate(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) : a.value) : `${Math.min(a.value, a.goal)} / ${a.goal}`}</p>
    </div>
  )
}

// Madalya: tırtıllı dış halka seviyenin metalinden, içte rozetin renginde daire ve ikonu; kilitliyse soluk. Etrafında
// sıradaki seviyeye ilerleme halkası. Üstüne gelince ışık süzülür.
function Medal({ a, progress }: { a: Achievement; progress: number }) {
  const id = useId().replace(/:/g, '')
  const metal = TIER_COLORS[a.level]
  const seal = useMemo(() => {
    const pts: string[] = []
    for (let i = 0; i < 32; i++) {
      const r = i % 2 ? 41 : 45
      const an = (i / 32) * Math.PI * 2 - Math.PI / 2
      pts.push(`${(50 + Math.cos(an) * r).toFixed(2)},${(50 + Math.sin(an) * r).toFixed(2)}`)
    }
    return pts.join(' ')
  }, [])
  const C = 2 * Math.PI * 48.5
  const locked = a.level === 0
  return (
    <div className="relative h-24 w-24">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={metal[1]} />
            <stop offset=".5" stopColor={metal[0]} />
            <stop offset="1" stopColor={metal[1]} />
          </linearGradient>
          <linearGradient id={`c${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a.colors[1]} />
            <stop offset="1" stopColor={a.colors[0]} />
          </linearGradient>
          <clipPath id={`k${id}`}>
            <circle cx="50" cy="50" r="33" />
          </clipPath>
        </defs>
        {a.level < 3 && (
          <>
            <circle cx="50" cy="50" r="48.5" fill="none" stroke="var(--color-neutral-800)" strokeWidth="2.2" />
            <circle
              cx="50"
              cy="50"
              r="48.5"
              fill="none"
              stroke={`url(#m${id})`}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray={`${progress * C} ${C}`}
              transform="rotate(-90 50 50)"
              style={{ stroke: locked ? '#00c0fa' : undefined }}
            />
          </>
        )}
        <g style={{ filter: locked ? 'grayscale(1) brightness(.45)' : `drop-shadow(0 4px 10px ${a.colors[0]}88)` }}>
          <polygon points={seal} fill={`url(#m${id})`} />
          <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="1.5" />
          <circle cx="50" cy="50" r="33" fill={`url(#c${id})`} />
          <g clipPath={`url(#k${id})`}>
            <rect x="-60" y="0" width="30" height="100" fill="rgba(255,255,255,.35)" transform="skewX(-20)" className="transition-transform duration-700 ease-out group-hover:translate-x-[150px]" />
          </g>
          <circle cx="50" cy="50" r="33" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1" />
        </g>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-white" style={{ opacity: locked ? 0.35 : 1, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))' }}>
        <Icon name={a.icon} className="h-9 w-9" />
      </span>
      {a.level === 3 && <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center text-amber-950" style={{ background: 'linear-gradient(135deg,#fde68a,#f59e0b)' }}><Icon name="star" className="h-3 w-3" /></span>}
    </div>
  )
}

