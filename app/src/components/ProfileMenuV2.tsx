import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Board, HomeSettings, Profile, Row } from '../types'
import { todayIso } from '../types'
import { resolveRole } from '../lib/roles'
import type { ProfileStats } from '../lib/profileStats'
import { APP_VERSION } from '../lib/version'
import { tt } from '../lib/i18n'
import Icon, { type IconName } from './Icon'

// Yeni profil menüsü (v1.23.4, Ayarlar › Ekstralar › Yeni profil menüsü): son izlediğinin görseli üstünde profil ve
// bu ayın özeti, dört hızlı işlem, üç başlık altında bağlantılar (kısayollarıyla), yeni bir şey varsa mavi nokta,
// en altta diğer profiller (üstüne gelince son izledikleri).

export const YAMA_SEEN_KEY = 'argus_yama_gorulen'
export const EVREN_SEEN_KEY = 'argus_evren_gorulen'

type LinkDef = { to: string; icon: IconName; label: string; keys?: string; dot?: boolean; extra?: React.ReactNode }

const otherCache = new Map<string, string[]>()
async function recentPosters(pid: string): Promise<string[]> {
  if (otherCache.has(pid)) return otherCache.get(pid)!
  const j = async <T,>(u: string) => (await fetch(u)).json() as Promise<T>
  try {
    const home = await j<HomeSettings>(`/api/profiles/${pid}/home-settings`)
    const boards = await j<Board[]>(`/api/profiles/${pid}/boards`)
    const b = boards.find((x) => x.id === home?.boardId) ?? boards[0]
    if (!b) return []
    const rows = await j<Row[]>(`/api/profiles/${pid}/boards/${b.id}/rows`)
    const poster = resolveRole(b, 'poster')
    const out = [...rows]
      .sort((a, c) => (c.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .map((r) => (poster ? (r.values[poster.id] as string) : ''))
      .filter(Boolean)
      .slice(0, 4)
    otherCache.set(pid, out)
    return out
  } catch {
    return []
  }
}

function Other({ p, n, onSwitch }: { p: Profile; n: number; onSwitch: () => void }) {
  const [posters, setPosters] = useState<string[] | null>(null)
  return (
    <button
      onClick={onSwitch}
      onMouseEnter={() => posters === null && recentPosters(p.id).then(setPosters)}
      className="group relative flex-1 min-w-0 flex items-center gap-2 rounded-xl border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-800/40 p-2 text-left transition"
    >
      <span className="h-8 w-8 shrink-0 rounded-lg overflow-hidden bg-neutral-800 flex items-center justify-center text-xs text-neutral-400">
        {p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover" /> : p.username.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-neutral-100 truncate">{p.username}</span>
        {n <= 9 && <span className="block text-[10.5px] text-neutral-500">Alt+{n}</span>}
      </span>
      <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-10 w-56 rounded-xl border border-neutral-700 bg-neutral-900 p-2.5 text-xs text-neutral-400 shadow-2xl shadow-black/60 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition">
        {tt('{0} son baktıkları', p.username)}
        <span className="mt-1.5 flex gap-1.5">
          {posters === null ? <span className="text-neutral-600">…</span> : posters.length ? posters.map((s) => <img key={s} src={s} alt="" className="h-14 aspect-[2/3] rounded object-cover" />) : <span className="text-neutral-600">{tt('henüz bir şey yok')}</span>}
        </span>
      </span>
    </button>
  )
}

export default function ProfileMenuV2({
  active,
  others,
  stats,
  boardId,
  extraLinks,
  flashback,
  onSwitch,
  onClose,
  themeSwitch,
}: {
  active: Profile | null
  others: Profile[]
  stats: ProfileStats | null
  boardId: string | null
  extraLinks: LinkDef[]
  flashback: React.ReactNode
  onSwitch: (id: string) => void
  onClose: () => void
  themeSwitch: React.ReactNode
}) {
  const navigate = useNavigate()
  const [evrenNew, setEvrenNew] = useState(false)
  useEffect(() => {
    import('../lib/api').then(({ api }) =>
      api
        .evrenOtoStatus()
        .then((s) => setEvrenNew(s.added > Number(localStorage.getItem(EVREN_SEEN_KEY) ?? s.added)))
        .catch(() => {}),
    )
  }, [])
  const yamaNew = (() => {
    try {
      return localStorage.getItem(YAMA_SEEN_KEY) !== APP_VERSION
    } catch {
      return false
    }
  })()
  const go = (to: string) => {
    onClose()
    navigate(to)
  }
  const QA: { icon: IconName; label: string; color: string; run: () => void }[] = [
    { icon: 'cards', label: tt('Ne İzlesem'), color: '0,192,250', run: () => (onClose(), window.dispatchEvent(new Event('argus-ne-izlesem'))) },
    { icon: 'check', label: tt('Bugün izledim'), color: '34,197,94', run: () => go(`/takvim?ay=${todayIso().slice(0, 7)}&gun=${todayIso()}`) },
    { icon: 'table', label: tt('Yeni ekle'), color: '139,92,246', run: () => (boardId ? go(`/board/${boardId}?yeni=1`) : go('/arsivlerim')) },
    { icon: 'calendar', label: tt('Takvim'), color: '245,158,11', run: () => go('/takvim') },
  ]
  const groups: { title: string; links: LinkDef[] }[] = [
    {
      title: tt('Kütüphanem'),
      links: [
        ...(boardId ? [{ to: `/board/${boardId}`, icon: 'grid' as IconName, label: tt('Arşiv Tablosu'), keys: 'G A' }] : []),
        { to: '/aklimda', icon: 'bookmark', label: tt('Aklımda'), keys: 'G M' },
        { to: '/koleksiyon', icon: 'trophy', label: tt('Koleksiyon'), keys: 'G K' },
        { to: '/evrenler', icon: 'planet', label: tt('Evrenler'), keys: 'G E', dot: evrenNew },
      ],
    },
    {
      title: tt('Keşfet'),
      links: [{ to: '/istatistikler', icon: 'chart', label: tt('İstatistikler'), keys: 'G İ' }, { to: '/abonelik', icon: 'tv', label: tt('Abonelik önerisi') }, ...extraLinks],
    },
    {
      title: 'ARGUS',
      links: [
        { to: '/arsivlerim', icon: 'gear', label: tt('Ayarlar'), keys: 'Ctrl ,' },
        { to: '/yama-notlari', icon: 'sparkle', label: tt('Yama Notları'), dot: yamaNew, extra: <span className="text-[10px] font-medium text-[#00c0fa] bg-[#00c0fa]/10 rounded-full px-2 py-0.5">{APP_VERSION}</span> },
        { to: '/yardim', icon: 'help', label: tt('Yardım Merkezi'), keys: '?' },
      ],
    },
  ]
  return (
    <div className="max-h-[calc(100vh-5rem)] overflow-y-auto">
      <div className="relative overflow-hidden px-4 pt-4 pb-3">
        {stats?.lastImage && <img src={stats.lastImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 blur-[6px] scale-110" />}
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/30 to-neutral-900" />
        <div className="relative flex items-center gap-3">
          <span className="h-12 w-12 shrink-0 rounded-xl overflow-hidden bg-neutral-800 ring-2 ring-[#00c0fa]/60 flex items-center justify-center text-sm text-neutral-400">
            {active?.photo ? <img src={active.photo} alt="" className="h-full w-full object-cover" /> : active?.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block text-base font-bold text-neutral-50 truncate">{active?.username}</span>
            <span className="block text-xs text-neutral-400 truncate">{stats?.lastTitle ? tt('son izlediğin: {0}', stats.lastTitle) : tt('Şu an bu profildesin')}</span>
          </span>
        </div>
        {stats && (
          <div className="relative grid grid-cols-3 gap-1.5 mt-3">
            {[
              [stats.monthFilms, tt('film bu ay')],
              [stats.monthEpisodes, tt('bölüm bu ay')],
              [stats.streak ? `🔥 ${stats.streak}` : '0', tt('gün üst üste')],
            ].map(([v, l]) => (
              <span key={String(l)} className="rounded-lg border border-white/5 bg-white/[0.05] px-2 py-1.5">
                <b className="block text-base text-neutral-50">{v}</b>
                <span className="block text-[10.5px] text-neutral-500">{l}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1 px-2.5 py-2.5 border-y border-neutral-800">
        {QA.map((q) => (
          <button key={q.label} onClick={q.run} className="flex flex-col items-center gap-1.5 rounded-xl py-2 text-[11px] text-neutral-400 hover:text-neutral-50 hover:bg-neutral-800/60 transition">
            <span className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `rgba(${q.color},.15)`, color: `rgb(${q.color})` }}>
              <Icon name={q.icon} className="h-4 w-4" />
            </span>
            {q.label}
          </button>
        ))}
      </div>
      {groups.map((g) => (
        <div key={g.title} className="px-1.5 pt-1.5">
          <p className="px-2.5 pt-1 pb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-neutral-500">{g.title}</p>
          {g.links.map((l) => (
            <Link key={l.to} to={l.to} onClick={onClose} className="group flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-sm text-neutral-300 hover:text-neutral-50 hover:bg-neutral-800 transition">
              <span className="text-neutral-500 group-hover:text-[#00c0fa] transition">
                <Icon name={l.icon} className="h-[17px] w-[17px]" />
              </span>
              <span className="flex-1">{l.label}</span>
              {l.extra}
              {l.dot && <span className="h-2 w-2 rounded-full bg-[#00c0fa] shadow-[0_0_8px_#00c0fa]" />}
              {l.keys && <kbd className="font-mono text-[10px] text-neutral-500 border border-neutral-700 border-b-2 rounded px-1">{l.keys}</kbd>}
            </Link>
          ))}
        </div>
      ))}
      {flashback && <div className="px-1.5">{flashback}</div>}
      {others.length > 0 && (
        <div className="flex gap-2 px-3 pt-3 pb-1 mt-1.5 border-t border-neutral-800">
          {others.slice(0, 3).map((p, i) => (
            <Other key={p.id} p={p} n={i + 1} onSwitch={() => onSwitch(p.id)} />
          ))}
        </div>
      )}
      <div className="px-0 pb-1.5">{themeSwitch}</div>
    </div>
  )
}
