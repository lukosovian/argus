import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Board, Row, WatchedMap } from '../types'
import { titleText } from '../types'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useProfiles } from '../hooks/useProfiles'
import { useEscape } from '../hooks/useEscape'
import { api } from '../lib/api'
import { computeAchievements, countDone, GROUP_NAMES, TIER_COLORS, TIER_NAMES, unlockedDatesKey, type Achievement, type AchievementGroup } from '../lib/achievements'
import { resolveRole } from '../lib/roles'
import { fmtDate, tt } from '../lib/i18n'
import PageSkeleton from '../components/Skeleton'
import Icon from '../components/Icon'
import AchievementMedal from '../components/AchievementMedal'
import RowDetailModal from '../components/RowDetailModal'

// Başarımlar sayfası (Ayarlar › Profil Ayarları › Profil menüsündeki sayfalar). v1.23.5: madalyalar ve seviyeler.
// v1.23.6 — kullanıcı "başarımların sayısını arttır, çizimleri güzelleştir, tıklayınca ilgili içerikleri göstersin, bitmiş
// başarımın açıklamasını göremiyorum" dedi: 29 rozet gruplar halinde, süslü madalyalar (bkz. AchievementMedal), her
// kartta ne için verildiği her zaman yazıyor, tıklayınca seviyeler ve rozete sayılan yapımların afişleri açılıyor.

type Filter = 'hepsi' | 'kazanilan' | 'devam'
const GROUPS: AchievementGroup[] = ['izleme', 'tur', 'kesif', 'puan', 'aliskanlik']

export default function Basarimlar() {
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const { activeProfileId } = useProfiles()
  const [watched, setWatched] = useState<WatchedMap>({})
  const [universesDone, setUniversesDone] = useState(0)
  const [filter, setFilter] = useState<Filter>('hepsi')
  const [openId, setOpenId] = useState<string | null>(null)
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
  const open = list.find((a) => a.id === openId) ?? null
  let idx = 0

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
                <button key={a.id} onClick={() => setOpenId(a.id)} className="flex w-full items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-left hover:border-neutral-600 transition">
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
                </button>
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

      {GROUPS.map((g) => {
        const items = shown.filter((a) => a.group === g)
        if (!items.length) return null
        return (
          <section key={g}>
            <h2 className="mb-3 flex items-baseline gap-2 text-lg font-bold text-neutral-100">
              {GROUP_NAMES()[g]}
              <span className="text-xs font-medium text-neutral-500">
                {items.filter((a) => a.level > 0).length}/{items.length}
              </span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {items.map((a) => (
                <BadgeCard key={a.id} a={a} index={idx++} date={a.level > 0 ? dates[`${a.id}:${a.level}`] : undefined} onOpen={() => setOpenId(a.id)} />
              ))}
            </div>
          </section>
        )
      })}

      {open && <BadgeDetail a={open} board={board} dates={dates} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function progressOf(a: Achievement): number {
  if (a.level >= 3) return 1
  const from = a.level ? a.tiers[a.level - 1] : 0
  return Math.max(0, Math.min(1, (a.value - from) / Math.max(1, a.goal - from)))
}

const fmt = (d: string) => fmtDate(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
const hintOf = (a: Achievement, tier: number) => a.hint.replace('{0}', String(a.tiers[tier]))

function BadgeCard({ a, index, date, onOpen }: { a: Achievement; index: number; date?: string; onOpen: () => void }) {
  const p = progressOf(a)
  const max = a.level >= 3
  return (
    <button
      onClick={onOpen}
      className="group relative flex flex-col items-center rounded-2xl border border-neutral-800 bg-neutral-900/50 px-3 pt-4 pb-4 text-center transition duration-300 hover:-translate-y-1 hover:border-neutral-600 hover:bg-neutral-900"
      style={{ animation: `pickIn .45s cubic-bezier(.2,.8,.2,1) ${Math.min(index, 30) * 0.03}s both` }}
    >
      <AchievementMedal a={a} progress={p} size={96} />
      <p className="mt-1 text-sm font-bold text-neutral-100">{a.title}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: a.level ? TIER_COLORS[a.level][1] : 'var(--color-neutral-500)' }}>
        {TIER_NAMES()[a.level]}
      </p>
      {/* ne için verildiği her zaman görünsün; bitmişse en üst seviyenin hedefi ve "Tamamlandı" */}
      <p className="mt-1.5 text-xs text-neutral-400 leading-snug min-h-[2.5em]">{hintOf(a, Math.min(a.level, 2))}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {[1, 2, 3].map((t) => (
          <span key={t} className="h-1.5 w-6 rounded-full" style={{ background: a.level >= t ? `linear-gradient(90deg,${TIER_COLORS[t][0]},${TIER_COLORS[t][1]})` : 'var(--color-neutral-800)' }} />
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-neutral-500 tabular-nums">
        {max ? (
          <span className="inline-flex items-center gap-1 text-amber-300/90">
            <Icon name="check" className="h-3 w-3" />
            {tt('Tamamlandı')}
            {date ? ` · ${fmt(date)}` : ''}
          </span>
        ) : (
          `${Math.min(a.value, a.goal)} / ${a.goal}`
        )}
      </p>
    </button>
  )
}

const PAGE = 48

function BadgeDetail({ a, board, dates, onClose }: { a: Achievement; board: Board; dates: Record<string, string>; onClose: () => void }) {
  const [detail, setDetail] = useState<Row | null>(null)
  const [limit, setLimit] = useState(PAGE)
  useEscape(!detail, onClose)
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  const poster = resolveRole(board, 'poster')
  const banner = resolveRole(board, 'banner')
  const img = (r: Row) => String((poster && r.values[poster.id]) || (banner && r.values[banner.id]) || '')
  return createPortal(
    <>
    {/* bir yapımın detayı açıkken rozet penceresi gizlenir (detay onun arkasında kalıyordu), kapanınca geri gelir */}
    <div className={`fixed inset-0 z-[70] ${detail ? 'hidden' : 'flex'} items-start justify-center overflow-y-auto bg-black/75 backdrop-blur-sm p-4 sm:p-8`} onClick={onClose}>
      <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ animation: 'argus-toast-in .25s ease-out' }}>
        <div className="relative px-6 pt-6 pb-5 sm:px-8" style={{ background: `radial-gradient(ellipse at 15% 0%, ${a.colors[0]}66, transparent 60%), radial-gradient(ellipse at 90% 0%, ${TIER_COLORS[a.level][0]}40, transparent 60%)` }}>
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-black/40 px-3 py-1 text-sm text-neutral-300 hover:text-white transition">
            {tt('Kapat')}
          </button>
          <div className="group flex flex-wrap items-center gap-6">
            <AchievementMedal a={a} progress={progressOf(a)} size={132} />
            <div className="min-w-[220px] flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: a.level ? TIER_COLORS[a.level][1] : 'var(--color-neutral-500)' }}>
                {TIER_NAMES()[a.level]}
              </p>
              <h2 className="text-3xl font-black text-neutral-50">{a.title}</h2>
              <p className="mt-1 text-sm text-neutral-300">{a.about}</p>
              <div className="mt-4 grid gap-1.5 sm:grid-cols-3">
                {[0, 1, 2].map((t) => {
                  const ok = a.level > t
                  const d = dates[`${a.id}:${t + 1}`]
                  return (
                    <div key={t} className={`rounded-xl border px-3 py-2 ${ok ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-800 bg-neutral-900/40'}`}>
                      <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: ok ? TIER_COLORS[t + 1][1] : 'var(--color-neutral-500)' }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: ok ? TIER_COLORS[t + 1][1] : 'var(--color-neutral-700)' }} />
                        {TIER_NAMES()[t + 1]}
                        {ok && <Icon name="check" className="h-3 w-3" />}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-300">{hintOf(a, t)}</p>
                      <p className="mt-0.5 text-[10px] text-neutral-500 tabular-nums">{ok ? (d ? fmt(d) : tt('Kazanıldı')) : `${Math.min(a.value, a.tiers[t])} / ${a.tiers[t]}`}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 pb-7 sm:px-8">
          <p className="mb-3 text-sm font-semibold text-neutral-200">
            {a.related.length ? tt('Bu rozete sayılanlar ({0})', a.related.length) : a.id === 'evren' ? tt('Evrenler sayfasından takip edebilirsin.') : tt('Henüz bu rozete sayılan bir yapım yok.')}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
            {a.related.slice(0, limit).map(({ row, note }) => (
              <button key={row.id + (note ?? '')} onClick={() => setDetail(row)} className="group/p text-left">
                <span className="block aspect-[2/3] overflow-hidden rounded-lg bg-neutral-800 ring-1 ring-neutral-800 transition group-hover/p:ring-[#00c0fa]/60">
                  {img(row) ? <img src={img(row)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover/p:scale-105" /> : null}
                </span>
                <span className="mt-1 block truncate text-xs text-neutral-300">{tp ? titleText(tp, row.values[tp.id]) : ''}</span>
                {note && <span className="block truncate text-[10px] text-neutral-500">{note}</span>}
              </button>
            ))}
          </div>
          {a.related.length > limit && (
            <button onClick={() => setLimit((l) => l + PAGE * 2)} className="mt-4 rounded-full border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:text-white transition">
              {tt('Daha fazla göster ({0})', a.related.length - limit)}
            </button>
          )}
        </div>
      </div>
    </div>
    {/* detay, rozet penceresinin dışında: içindeki tıklamalar rozet penceresini kapatmasın */}
    {detail && <RowDetailModal board={board} row={detail} onClose={() => setDetail(null)} />}
    </>,
    document.body,
  )
}
