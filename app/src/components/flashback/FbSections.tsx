import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Board } from '../../types'
import type { Stats, TitleInfo } from '../../lib/flashback'
import { TR_MONTHS } from '../../lib/flashback'
import { api, type Bilet, type Song } from '../../lib/api'
import { averageColor, darkTone, type RGB } from '../../lib/imageColor'
import { resolveRole } from '../../lib/roles'
import { isName, STATUS_NAMES } from '../../lib/names'
import { useAklimda } from '../../hooks/useAklimda'
import { useHomeSettings } from '../../hooks/useHomeSettings'
import { useToast } from '../../hooks/useToast'
import { tt, ttx, locale, monthNames } from '../../lib/i18n'
import Icon from '../Icon'
import { FbMark } from './FbLogo'

// Flashback'in v1.24 bölümleri — kullanıcının sunumdan seçtikleri (F2, F4, F6, F8–F18). Hepsi "Bozuk Sinyal"
// temasında: koyu zemin, Anton başlıklar, camgöbeği/eflatun renk kayması (bkz. index.css › .fb-*).

const GENRE_COLORS = ['#ff2d8a', '#00e1ff', '#a78bfa', '#ffb020', '#22c55e', '#f97316', '#38bdf8']

// ---- F2: ekrana girince projektör ışığıyla açılan kutu ---------------------------------------------
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`fb-reveal ${inView ? 'fb-in' : ''} ${className}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  )
}

export function FbTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <p className="fb-title text-2xl">{children}</p>
      {sub && <p className="text-xs text-neutral-400 mt-1">{sub}</p>}
    </div>
  )
}

// ---- F4: yılın rengi — en çok izlenen yapımların afişlerinden ---------------------------------------
export function useYearColors(titles: TitleInfo[]) {
  const pick = useMemo(
    () =>
      [...titles]
        .filter((t) => t.poster)
        .sort((a, b) => b.episodes + (b.isSeries ? 0 : 3) - (a.episodes + (a.isSeries ? 0 : 3)) || (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 10),
    [titles],
  )
  const [colors, setColors] = useState<{ title: string; poster: string; rgb: RGB }[]>([])
  useEffect(() => {
    let alive = true
    Promise.all(pick.map((t) => averageColor(t.poster).then((rgb) => (rgb ? { title: t.title, poster: t.poster, rgb } : null)))).then((l) => {
      // En canlı renkler öne (gri, kahverengi afişler sayfayı soldurmasın)
      const sat = ([r, g, b]: RGB) => (Math.max(r, g, b) - Math.min(r, g, b)) / (Math.max(r, g, b) || 1)
      if (alive)
        setColors(
          l
            .filter((x): x is { title: string; poster: string; rgb: RGB } => Boolean(x))
            .sort((x, y) => sat(y.rgb) - sat(x.rgb))
            .slice(0, 6),
        )
    })
    return () => {
      alive = false
    }
  }, [pick])
  // İki baskın renk: ilki ve ondan tonu en farklı olan
  const hue = ([r, g, b]: RGB) => Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b)
  const a = colors[0]
  const b = a ? [...colors.slice(1)].sort((x, y) => Math.abs(hue(y.rgb) - hue(a.rgb)) - Math.abs(hue(x.rgb) - hue(a.rgb)))[0] : undefined
  return {
    swatches: colors.map((c) => ({ ...c, hex: darkTone(c.rgb, 0.52, 1) })),
    a: a ? darkTone(a.rgb, 0.45, 1) : null,
    b: b ? darkTone(b.rgb, 0.45, 1) : null,
  }
}

// ---- F6: unvan, holografik koleksiyon kartı ---------------------------------------------------------
export function PersonaCard({
  year,
  title,
  why,
  badges,
  poster,
  small = false,
}: {
  year: string
  title: string
  why: string
  badges: { title: string; why: string }[]
  poster?: string
  small?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const rarity = badges.length >= 3 ? tt('EFSANEVİ') : badges.length === 2 ? tt('EPİK') : badges.length === 1 ? tt('NADİR') : tt('SIRADAN')
  return (
    <div
      className="[perspective:900px]"
      onMouseMove={(e) => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width
        const y = (e.clientY - r.top) / r.height
        el.style.transform = `rotateY(${(x - 0.5) * 22}deg) rotateX(${(0.5 - y) * 22}deg)`
        el.style.setProperty('--hx', `${x * 100}%`)
        el.style.setProperty('--hy', `${y * 100}%`)
      }}
      onMouseLeave={() => ref.current && (ref.current.style.transform = '')}
    >
      <div
        ref={ref}
        className={`relative rounded-[20px] overflow-hidden border border-white/15 shadow-2xl shadow-black/70 transition-transform duration-100 ${small ? 'w-[190px] h-[270px]' : 'w-[240px] h-[340px]'}`}
        style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--fb-a, #1d4ed8) 55%, #0b0b12), #120a22 55%, color-mix(in srgb, var(--fb-b, #7c3aed) 40%, #05060a))' }}
      >
        <div className="absolute inset-0 opacity-60" style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 1px, transparent 1px 3px)' }} />
        <div className="fb-holo" />
        <div className={`absolute inset-0 flex flex-col ${small ? 'p-4' : 'p-5'}`}>
          <div className="flex items-center justify-between">
            <span className={`fb-wordmark whitespace-nowrap ${small ? 'text-[11px]' : 'text-[13px]'}`}>FLASHBACK {year}</span>
            <span className={`font-bold text-amber-200 whitespace-nowrap ${small ? 'text-[8px] tracking-[0.12em]' : 'text-[9px] tracking-[0.2em]'}`}>★ {rarity}</span>
          </div>
          <div className={`mx-auto rounded-full p-[3px] ${small ? 'mt-4 mb-3 h-20 w-20' : 'mt-6 mb-4 h-24 w-24'}`} style={{ background: 'conic-gradient(from 200deg,#00e1ff,#ff2d8a,#ffb020,#00e1ff)' }}>
            <div className="h-full w-full rounded-full overflow-hidden bg-[#0b0d16] flex items-center justify-center">
              {poster ? <img src={poster} alt="" className="h-full w-full object-cover" /> : <FbMark className="h-14 w-14" bg={false} />}
            </div>
          </div>
          <p className={`fb-title text-center leading-tight ${small ? 'text-xl' : 'text-[26px]'}`}>{title}</p>
          {why && <p className={`text-center text-white/70 mt-1.5 leading-snug ${small ? 'text-[10px] line-clamp-2' : 'text-[11px]'}`}>{why}</p>}
          <div className="mt-auto flex flex-wrap justify-center gap-1">
            {badges.slice(0, small ? 2 : 3).map((b) => (
              <span key={b.title} title={b.why} className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-white/10 border border-white/15">
                {b.title}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- F8: tür DNA'sı ----------------------------------------------------------------------------
export function GenreDna({ genres }: { genres: { label: string; count: number }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setOn(true), io.disconnect()), { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const total = genres.reduce((s, g) => s + g.count, 0) || 1
  const [a, b] = genres
  const sentence = !a
    ? ''
    : !b || a.count >= b.count * 1.8
      ? tt('Senin yılın açık ara {0}.', a.label.toLocaleLowerCase(locale()))
      : tt('Senin yılın yarı {0}, yarı {1}.', a.label.toLocaleLowerCase(locale()), b.label.toLocaleLowerCase(locale()))
  return (
    <div ref={ref}>
      <div className="flex h-12 rounded-xl overflow-hidden bg-white/5">
        {genres.map((g, i) => (
          <div key={g.label} title={`${g.label} · ${g.count}`} style={{ flex: on ? g.count : 0, background: GENRE_COLORS[i % GENRE_COLORS.length], transition: `flex 1.1s cubic-bezier(.2,.8,.2,1) ${i * 90}ms` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-neutral-300">
        {genres.map((g, i) => (
          <span key={g.label} className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-[3px] inline-block" style={{ background: GENRE_COLORS[i % GENRE_COLORS.length] }} />
            {g.label} <span className="text-neutral-500">%{Math.round((g.count / total) * 100)}</span>
          </span>
        ))}
      </div>
      {sentence && <p className="mt-5 text-2xl font-black tracking-tight leading-snug" style={{ background: 'linear-gradient(90deg,#fff,#ffd0e6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{sentence}</p>}
    </div>
  )
}

// ---- F9: favoriler podyumda ----------------------------------------------------------------------
export function Podium({ top, onOpen }: { top: TitleInfo[]; onOpen: (t: TitleInfo) => void }) {
  const [one, two, three, ...rest] = top
  const step = (t: TitleInfo | undefined, place: 1 | 2 | 3) => {
    if (!t) return <div className="w-[100px]" />
    const h = place === 1 ? 'h-28' : place === 2 ? 'h-20' : 'h-14'
    const bg = place === 1 ? 'linear-gradient(180deg,#ffd166,#a86c00)' : place === 2 ? 'linear-gradient(180deg,#e5e7eb,#6b7280)' : 'linear-gradient(180deg,#e6955a,#7a3f14)'
    return (
      <button onClick={() => onOpen(t)} className={`flex flex-col items-center text-left group ${place === 1 ? 'w-[118px] sm:w-[132px]' : 'w-[96px] sm:w-[110px]'}`}>
        <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-neutral-800 shadow-xl shadow-black/60 group-hover:-translate-y-1 transition">
          {t.poster && <img src={t.poster} alt="" className="h-full w-full object-cover" />}
        </div>
        <p className="mt-2 text-xs font-bold text-white text-center line-clamp-2 leading-tight min-h-[2rem]">{t.title}</p>
        <p className="text-[11px] font-bold text-amber-300 tabular-nums">
          <Icon name="star" className="h-[0.9em] w-[0.9em]" /> {t.score?.toFixed(1)}
        </p>
        <div className={`w-full mt-2 rounded-t-xl flex justify-center pt-1.5 font-black text-2xl text-black/70 ${h}`} style={{ background: bg }}>
          {place}
        </div>
      </button>
    )
  }
  return (
    <div>
      <div className="relative flex items-end justify-center gap-3 pt-6" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,220,140,.18), transparent 60%)' }}>
        {step(two, 2)}
        {step(one, 1)}
        {step(three, 3)}
      </div>
      {rest.length > 0 && (
        <div className="flex justify-center gap-3 mt-4">
          {rest.map((t, i) => (
            <button key={t.row.id} onClick={() => onOpen(t)} className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/25 pl-1 pr-3 py-1 text-left">
              {t.poster && <img src={t.poster} alt="" className="h-10 w-7 rounded object-cover" />}
              <span className="min-w-0">
                <span className="block text-[10px] text-neutral-500">{i + 4}.</span>
                <span className="block text-xs font-semibold text-neutral-100 max-w-[120px] truncate">{t.title}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- F10: yılın ısı haritası ---------------------------------------------------------------------
export function Heatmap({ year, dayCounts }: { year: string; dayCounts: Record<string, number> }) {
  const navigate = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  const Y = Number(year)
  const today = new Date()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayIso = iso(today)
  const cells: { d: string; n: number; future: boolean }[] = []
  const jan1 = new Date(Y, 0, 1)
  const lead = (jan1.getDay() + 6) % 7
  for (let d = new Date(jan1); d.getFullYear() === Y; d.setDate(d.getDate() + 1)) {
    const k = iso(d)
    cells.push({ d: k, n: dayCounts[k] ?? 0, future: k > todayIso })
  }
  const lvl = (n: number) => (n === 0 ? '' : n === 1 ? 'l1' : n === 2 ? 'l2' : n <= 4 ? 'l3' : 'l4')
  const color: Record<string, string> = { '': 'rgba(255,255,255,0.06)', l1: '#0b3a5a', l2: '#0a6aa0', l3: '#00a6e0', l4: '#7fe3ff' }
  const label = (k: string) => {
    const d = new Date(`${k}T12:00:00`)
    const n = dayCounts[k] ?? 0
    return `${d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', weekday: 'long' })}: ${n ? ttx('{0} izleme', n) : tt('boş')}`
  }
  return (
    <div>
      <div className="flex justify-between text-[10px] font-bold text-neutral-500 mb-2 tracking-wider">
        {monthNames('short').map((m) => (
          <span key={m}>{m.toLocaleUpperCase(locale())}</span>
        ))}
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ gridAutoColumns: '1fr' }} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: lead }, (_, i) => (
          <i key={`l${i}`} />
        ))}
        {cells.map((c) => (
          <button
            key={c.d}
            disabled={c.future}
            onMouseEnter={() => setHover(c.d)}
            onClick={() => navigate(`/takvim?ay=${c.d.slice(0, 7)}&gun=${c.d}`)}
            aria-label={label(c.d)}
            className="aspect-square rounded-[3px] disabled:cursor-default"
            style={c.future ? { outline: '1px dashed rgba(255,255,255,0.08)', outlineOffset: -1 } : { background: color[lvl(c.n)], boxShadow: lvl(c.n) === 'l4' ? '0 0 8px #00c0fa' : undefined }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <span className="text-sm text-neutral-300 min-h-[20px]">{hover ? label(hover) : tt('Bir günün üstüne gel; tıklayınca Takvim\'de o gün açılır.')}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          {tt('az')}
          {Object.values(color).map((c) => (
            <i key={c} className="h-3 w-3 rounded-[3px] inline-block" style={{ background: c }} />
          ))}
          {tt('çok')}
        </span>
      </div>
    </div>
  )
}

// ---- F11: önce tahmin et --------------------------------------------------------------------------
export function Guess({ year, real, what }: { year: string; real: number; what: string }) {
  const key = `argus_fb_tahmin_${year}_${what}`
  const read = () => {
    try {
      const v = localStorage.getItem(key)
      return v === null ? null : Number(v)
    } catch {
      return null
    }
  }
  const [done, setDone] = useState<number | null>(read)
  const max = Math.max(50, Math.ceil((real * 2) / 10) * 10)
  const [g, setG] = useState(Math.round(max / 3))
  const reveal = () => {
    setDone(g)
    try {
      localStorage.setItem(key, String(g))
    } catch {
      /* önemsiz */
    }
  }
  const diff = done === null ? 0 : Math.abs(done - real)
  const close = done !== null && diff <= Math.max(5, real * 0.08)
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-white">{tt('Sence {0} yılında kaç {1} izledin?', year, what)}</p>
      {done === null ? (
        <>
          <p className="fb-title text-6xl my-3 tabular-nums">{g}</p>
          <input type="range" min={0} max={max} value={g} onChange={(e) => setG(Number(e.target.value))} className="w-full max-w-md accent-[#ff2d8a]" />
          <div className="mt-4">
            <button onClick={reveal} className="rounded-full px-5 py-2 text-sm font-bold text-white" style={{ background: 'linear-gradient(90deg,#00b8d9,#ff2d8a)' }}>
              {tt('Göster')}
            </button>
          </div>
        </>
      ) : (
        <div style={{ animation: 'fb-card-in .7s ease-out' }}>
          <div className="flex items-end justify-center gap-6 my-4">
            <div>
              <p className="text-xs text-neutral-500">{tt('Tahminin')}</p>
              <p className="text-4xl font-black text-neutral-400 tabular-nums">{done}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">{tt('Gerçek')}</p>
              <p className="fb-title text-7xl tabular-nums">{real}</p>
            </div>
          </div>
          <p className="text-neutral-200">
            {close
              ? tt('🎯 Neredeyse tam! Kendini çok iyi tanıyorsun.')
              : done < real
                ? tt('Kendine haksızlık etme, {0} tane daha fazla izledin.', diff)
                : tt('Biraz abarttın, {0} tane daha az.', diff)}
          </p>
          <button onClick={() => setDone(null)} className="text-xs text-neutral-500 hover:text-neutral-200 mt-3">
            {tt('Tekrar tahmin et')}
          </button>
        </div>
      )}
    </div>
  )
}

// ---- F12: yılın film müzikleri (Nook'un bulduğu şarkılar) ------------------------------------------
type SongHit = { key: string; title: string; artist: string; cover: string | null; url: string | null; n: number; rowIds: string[] }
export function useYearSongs(year: string) {
  const [all, setAll] = useState<Record<string, Song[]> | null>(null)
  useEffect(() => {
    api
      .getAllSongs()
      .then(setAll)
      .catch(() => setAll({}))
  }, [])
  return useMemo(() => {
    if (!all) return null
    const m = new Map<string, SongHit>()
    const perRow = new Map<string, number>()
    for (const [rowId, list] of Object.entries(all)) {
      for (const s of list) {
        if (new Date(s.foundAt).getFullYear() !== Number(year)) continue
        perRow.set(rowId, (perRow.get(rowId) ?? 0) + 1)
        const h = m.get(s.key) ?? { key: s.key, title: s.title, artist: s.artist, cover: s.cover, url: s.url, n: 0, rowIds: [] }
        h.n++
        if (!h.rowIds.includes(rowId)) h.rowIds.push(rowId)
        m.set(s.key, h)
      }
    }
    const songs = [...m.values()].sort((a, b) => b.n - a.n)
    const topRow = [...perRow.entries()].sort((a, b) => b[1] - a[1])[0]
    return { songs, total: [...perRow.values()].reduce((a, b) => a + b, 0), topRow: topRow ? { rowId: topRow[0], n: topRow[1] } : null }
  }, [all, year])
}
export function Songs({ data, titleOf }: { data: NonNullable<ReturnType<typeof useYearSongs>>; titleOf: (rowId: string) => string }) {
  const [top, ...rest] = data.songs
  const open = (s: SongHit) => s.url && window.open(s.url, '_blank', 'noopener')
  return (
    <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center">
      <button onClick={() => open(top)} className="flex items-center gap-5 text-left group">
        <div className="relative h-36 w-36 shrink-0 rounded-full shadow-2xl shadow-black/70" style={{ background: 'repeating-radial-gradient(circle,#111 0 2px,#1b1b1b 2px 4px)', animation: 'fb-spin 6s linear infinite' }}>
          <div className="absolute inset-[30%] rounded-full overflow-hidden bg-[#ff2d8a]">{top.cover && <img src={top.cover} alt="" className="h-full w-full object-cover" />}</div>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.25em] text-neutral-400">{tt('YILIN ŞARKISI')}</p>
          <p className="text-2xl font-black text-white leading-tight mt-1 group-hover:underline">{top.title}</p>
          <p className="text-sm text-neutral-300">
            {top.artist}
            {top.rowIds[0] ? ` · ${titleOf(top.rowIds[0])}` : ''}
          </p>
          <div className="flex items-end gap-[3px] h-6 mt-2">
            {[0, 0.2, 0.4, 0.1, 0.3, 0.5].map((d, i) => (
              <i key={i} className="w-1 rounded-sm bg-[#ff2d8a]" style={{ animation: `fb-eq 1s ease-in-out ${d}s infinite` }} />
            ))}
          </div>
        </div>
      </button>
      <div className="min-w-0">
        <p className="text-sm text-neutral-400 mb-2">
          {ttx('Nook bu yıl izlerken {0} şarkı buldu.', data.total)}
          {data.topRow && <> {ttx('En çok şarkının çıktığı yapım: {0} ({1}).', titleOf(data.topRow.rowId), data.topRow.n)}</>}
        </p>
        <div className="space-y-1">
          {rest.slice(0, 4).map((s, i) => (
            <button key={s.key} onClick={() => open(s)} className="w-full flex items-center gap-3 rounded-xl hover:bg-white/5 px-2 py-1.5 text-left">
              <span className="w-4 text-xs text-neutral-500 tabular-nums">{i + 2}</span>
              {s.cover ? <img src={s.cover} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="h-9 w-9 rounded bg-white/10" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-100 truncate">{s.title}</span>
                <span className="block text-xs text-neutral-500 truncate">
                  {s.artist}
                  {s.rowIds[0] ? ` · ${titleOf(s.rowIds[0])}` : ''}
                </span>
              </span>
              {s.n > 1 && <span className="text-[11px] text-neutral-500">×{s.n}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- F13: geçen yılın sen'i ------------------------------------------------------------------------
export function Delta({ now, before }: { now: number; before: number | null }) {
  if (before === null) return null
  const d = now - before
  if (!d) return <span className="text-[11px] text-neutral-500">{tt('= geçen yıl kadar')}</span>
  return (
    <span className={`text-[11px] font-semibold ${d > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d)} {tt('geçen yıla göre')}
    </span>
  )
}
export function Compare({ year, cur, prev }: { year: string; cur: Stats; prev: Stats }) {
  const py = String(Number(year) - 1)
  const rows: { label: string; a: number | string; b: number | string; up: boolean | null }[] = [
    { label: tt('Yapım'), a: prev.order.length, b: cur.order.length, up: cur.order.length === prev.order.length ? null : cur.order.length > prev.order.length },
    { label: tt('Film'), a: prev.films, b: cur.films, up: cur.films === prev.films ? null : cur.films > prev.films },
    { label: tt('Bölüm'), a: prev.episodes, b: cur.episodes, up: cur.episodes === prev.episodes ? null : cur.episodes > prev.episodes },
    { label: tt('Ekran başında gün'), a: prev.activeDays, b: cur.activeDays, up: cur.activeDays === prev.activeDays ? null : cur.activeDays > prev.activeDays },
  ]
  if (cur.scores.avg !== null && prev.scores.avg !== null)
    rows.push({ label: tt('Puan ortalaman'), a: prev.scores.avg.toFixed(1), b: cur.scores.avg.toFixed(1), up: Math.abs(cur.scores.avg - prev.scores.avg) < 0.05 ? null : cur.scores.avg > prev.scores.avg })
  const ga = prev.topGenres[0]?.label
  const gb = cur.topGenres[0]?.label
  // Öne çıkan değişim cümlesi
  const ratio = (x: number, y: number) => (y ? x / y : x ? 9 : 1)
  const fr = ratio(cur.films, prev.films)
  const er = ratio(cur.episodes, prev.episodes)
  const line =
    fr <= 0.6 && er >= 0.9
      ? tt('Bu yıl filmlerin azaldı, yerini diziler aldı.')
      : er <= 0.6 && fr >= 0.9
        ? tt('Bu yıl dizileri bırakıp filmlere döndün.')
        : cur.order.length > prev.order.length * 1.2
          ? tt('Geçen yıldan çok daha fazla şey izledin.')
          : cur.order.length < prev.order.length * 0.8
            ? tt('Bu yıl biraz daha sakindin.')
            : tt('Geçen yılla neredeyse aynı tempodaydın.')
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-2 items-center">
        <span />
        <span className="text-xs font-bold text-neutral-500 text-right tracking-wider">{py}</span>
        <span className="fb-title text-lg text-right">{year}</span>
        {rows.map((r) => (
          <FragmentRow key={r.label} r={r} />
        ))}
        {ga && gb && (
          <>
            <span className="text-sm text-neutral-300">{tt('En çok izlediğin tür')}</span>
            <span className="text-sm text-neutral-500 text-right">{ga}</span>
            <span className="text-sm font-bold text-white text-right">{gb}</span>
          </>
        )}
      </div>
      <p className="mt-5 text-lg font-bold text-white">{line}</p>
    </div>
  )
}
function FragmentRow({ r }: { r: { label: string; a: number | string; b: number | string; up: boolean | null } }) {
  return (
    <>
      <span className="text-sm text-neutral-300">{r.label}</span>
      <span className="text-lg text-neutral-500 text-right tabular-nums">{r.a}</span>
      <span className="text-2xl font-black text-white text-right tabular-nums">
        {r.b} {r.up !== null && <span className={`text-sm ${r.up ? 'text-emerald-400' : 'text-rose-400'}`}>{r.up ? '▲' : '▼'}</span>}
      </span>
    </>
  )
}

// ---- F14: yılın vazgeçtiklerin (Yarım) -------------------------------------------------------------
export function droppedTitles(board: Board, titles: TitleInfo[]): TitleInfo[] {
  const durum = resolveRole(board, 'durum')
  const yarim = durum?.options?.find((o) => isName(o.label, STATUS_NAMES.yarim))?.id
  if (!durum || !yarim) return []
  return titles.filter((t) => t.row.values[durum.id] === yarim)
}
export function Dropped({ board, items, onOpen }: { board: Board; items: TitleInfo[]; onOpen: (t: TitleInfo) => void }) {
  const ak = useAklimda()
  const { notify } = useToast()
  const lines = [tt('Bazıları belki bir şansı daha hak ediyordur.'), tt('Herkesin yarıda bıraktığı birkaç şey olur.'), tt('Belki doğru zamanı değildi.')]
  const line = lines[items.length % lines.length]
  return (
    <div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {items.slice(0, 10).map((t) => {
          const inAk = Boolean(ak.items[t.row.id])
          return (
            <div key={t.row.id} className="w-[104px] shrink-0">
              <button onClick={() => onOpen(t)} className="relative block w-full aspect-[2/3] rounded-xl overflow-hidden bg-neutral-800">
                {t.poster && <img src={t.poster} alt="" className="h-full w-full object-cover grayscale brightness-75" />}
                <span className="absolute left-[-12%] right-[-12%] top-[44%] -rotate-[14deg] bg-[#ff2d55] text-white text-[10px] font-black tracking-[0.25em] text-center py-0.5">{tt('YARIM')}</span>
              </button>
              <p className="text-xs font-semibold text-neutral-200 mt-1.5 line-clamp-1">{t.title}</p>
              <button
                disabled={inAk}
                onClick={async () => {
                  try {
                    await ak.addRow(board.id, t.row.id)
                    notify(tt('"{0}" Aklımda\'ya eklendi.', t.title), 'success')
                  } catch (e) {
                    notify(e instanceof Error ? e.message : tt('Eklenemedi.'), 'danger')
                  }
                }}
                className="text-[11px] text-[#7fe9ff] hover:underline disabled:text-neutral-500 disabled:no-underline"
              >
                {inAk ? tt('Aklımda ✓') : tt('Bir şans daha ver')}
              </button>
            </div>
          )
        })}
      </div>
      <p className="text-neutral-300 mt-3">
        {ttx('Bu yıl {0} şeyi yarıda bıraktın.', items.length)} {line}
      </p>
    </div>
  )
}

// ---- F15: sinemada bu yıl (Biletlerim) ------------------------------------------------------------
export function useYearTickets(year: string) {
  const [items, setItems] = useState<Bilet[] | null>(null)
  useEffect(() => {
    api
      .getBiletler()
      .then((d) => setItems(Object.values(d.items ?? {}).filter((b) => (b.date ?? '').startsWith(year))))
      .catch(() => setItems([]))
  }, [year])
  return items
}
export function Tickets({ items }: { items: Bilet[] }) {
  const sorted = [...items].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const most = (key: 'cinema' | 'withWho') => {
    const m = new Map<string, number>()
    for (const b of items) {
      const v = (b[key] ?? '').trim()
      if (v) m.set(v, (m.get(v) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const cinema = most('cinema')
  const who = most('withWho')
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
      <div>
        <p className="fb-title text-6xl">{items.length}</p>
        <p className="text-neutral-200">{ttx('kez sinemaya gittin.')}</p>
        <div className="mt-3 space-y-1 text-sm text-neutral-400">
          {cinema && <p>{tt('En sık gittiğin salon: {0}', cinema)}</p>}
          {who && <p>{tt('En çok kiminle: {0}', who)}</p>}
        </div>
        <Link to="/koleksiyon?sekme=biletler" className="inline-block mt-3 text-sm text-[#7fe9ff] hover:underline">
          {tt('Biletlerim\'de gör ›')}
        </Link>
      </div>
      <div className="relative h-[190px] w-[300px] max-w-full mx-auto">
        {sorted.slice(-4).map((b, i, arr) => (
          <div
            key={i}
            className="absolute left-1/2 top-2 flex w-[270px] rounded-xl overflow-hidden shadow-2xl shadow-black/70"
            style={{ transform: `translateX(-50%) translateY(${i * 14}px) rotate(${(i - (arr.length - 1) / 2) * 5}deg)`, zIndex: i }}
          >
            {b.poster ? <img src={b.poster} alt="" className="w-[78px] object-cover" /> : <div className="w-[78px] bg-neutral-700" />}
            <div className="flex-1 bg-gradient-to-br from-[#f3e9d2] to-[#e2cd9c] text-[#3a2205] p-3 min-w-0">
              <p className="text-[9px] font-bold tracking-[0.2em]">ADMIT ONE</p>
              <p className="font-black text-base leading-tight truncate mt-1">{b.title}</p>
              <p className="text-[11px] mt-0.5 truncate">{[b.date && new Date(`${b.date}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long' }), b.cinema].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="w-10 bg-[#d6bd85] border-l-2 border-dashed border-[#8a6a2c] flex items-center justify-center">
              <span className="-rotate-90 text-[9px] font-bold tracking-widest text-[#3a2205] whitespace-nowrap">FLASHBACK</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- F16: yılın jeneriği ----------------------------------------------------------------------------
export function Credits({ year, stats, song }: { year: string; stats: Stats; song: { title: string; artist: string } | null }) {
  const blocks: { h: string; lines: string[] }[] = [
    { h: tt('BAŞROLLERDE'), lines: stats.topActors.map((a) => a.label) },
    { h: tt('YÖNETMENLER'), lines: stats.topDirectors.map((d) => d.label) },
    { h: tt('YILIN YAPIMLARI'), lines: stats.order.map((t) => t.title) },
    ...(song ? [{ h: tt('YILIN ŞARKISI'), lines: [`${song.title} — ${song.artist}`] }] : []),
  ].filter((b) => b.lines.length)
  const lineCount = blocks.reduce((n, b) => n + b.lines.length + 3, 8)
  return (
    <div className="fb-roll relative h-[440px] overflow-hidden rounded-2xl bg-black text-center">
      <div className="absolute inset-x-0 top-0 h-20 z-10 bg-gradient-to-b from-black to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-20 z-10 bg-gradient-to-t from-black to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 top-[440px] fb-roll-in" style={{ animation: `fb-roll ${Math.max(20, lineCount * 0.75)}s linear infinite` }}>
        <div className="pb-[440px]">
          <FbMark className="h-20 w-20 mx-auto" anim={false} />
          <p className="fb-wordmark text-4xl mt-3">FLASHBACK {year}</p>
          {blocks.map((b) => (
            <div key={b.h} className="mt-10">
              <p className="text-[11px] font-bold tracking-[0.35em] text-neutral-500 mb-3">{b.h}</p>
              {b.lines.map((l, i) => (
                <p key={i} className="text-[15px] leading-8 text-neutral-100">
                  {l}
                </p>
              ))}
            </div>
          ))}
          <p className="fb-wordmark text-3xl mt-16">{year} · ARGUS</p>
        </div>
      </div>
    </div>
  )
}

// ---- F17: kapanış mektubu ------------------------------------------------------------------------
export function Letter({ year, name, stats, song }: { year: string; name: string; stats: Stats; song: { title: string } | null }) {
  const now = new Date()
  const ongoing = now.getFullYear() === Number(year)
  const first = stats.order[0]
  const last = [...stats.order].sort((a, b) => (a.last < b.last ? 1 : -1))[0]
  const bm = stats.months.indexOf(Math.max(...stats.months))
  const mar = stats.marathons[0]
  const top = stats.scores.top[0]
  const low = stats.scores.lowest
  const parts: ReactNode[] = []
  if (first && last)
    parts.push(
      ongoing ? (
        <>{tt('{0} yılına', year)} <b>{first.title}</b> {tt('ile başladın; şimdilik en son')} <b>{last.title}</b> {tt('var.')}</>
      ) : (
        <>{tt('{0} yılına', year)} <b>{first.title}</b> {tt('ile başladın,')} <b>{last.title}</b> {tt('ile kapattın.')}</>
      ),
    )
  parts.push(
    <>
      {tt('Arada')} <b>{ttx('{0} yapım', stats.order.length)}</b> {tt('ve')} <b>{ttx('{0} gün', stats.activeDays)}</b> {tt('var.')}
    </>,
  )
  if (stats.months[bm] > 0) parts.push(<>{tt('En çok')} <b>{TR_MONTHS[bm]}</b> {tt('ayında ekran başındaydın.')}</>)
  if (mar) parts.push(<>{mar.kind === 'seri' ? tt('{0} serisini {1} günde bitirdin.', mar.name, mar.days) : tt('{0} maratonunu unutmak zor: {1} günde {2} bölüm.', mar.name, mar.days, mar.count)}</>)
  if (top) parts.push(<><b>{top.title}</b> {tt('sana {0} verdirdi', top.score?.toFixed(1))}{low ? <>, <b>{low.title}</b> {tt('pek veremedi.')}</> : '.'}</>)
  if (song) parts.push(<>{tt('Yılın şarkısı:')} <b>{song.title}</b>.</>)
  parts.push(<>{tt('Bu yılın unvanı:')} <b>{stats.persona.title}</b>.</>)
  return (
    <div className="max-w-2xl">
      <p className="text-[17px] leading-[1.85] text-[#ece6dc]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
        {tt('Sevgili {0},', name)}
        <br />
        {parts.map((p, i) => (
          <span key={i}>{p} </span>
        ))}
        <br />
        {ongoing ? tt('Yılın daha bitmedi; kalanı da güzel geçsin.') : tt('Seneye görüşürüz.')}
      </p>
      <p className="fb-wordmark text-3xl mt-5">ARGUS</p>
    </div>
  )
}

// ---- F18: gelecek yıl için hedef --------------------------------------------------------------------
export function NextGoal({ year, done }: { year: string; done: number }) {
  const { settings, saveSettings } = useHomeSettings()
  const { notify } = useToast()
  const next = String(Number(year) + 1)
  const saved = settings.yearGoalNext?.year === next ? settings.yearGoalNext.n : null
  const [n, setN] = useState(saved ?? Math.max(10, Math.ceil((done * 1.1) / 5) * 5))
  // Bu yıl için geçen yıldan konmuş bir hedef varsa: tuttu mu?
  const mine = settings.yearGoalNext?.year === year ? settings.yearGoalNext.n : null
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
      {mine !== null ? (
        <div>
          <p className="text-sm text-neutral-400">{tt('{0} hedefin', year)}</p>
          <p className="fb-title text-5xl">
            {done} / {mine}
          </p>
          <p className="text-neutral-200 mt-1">{done >= mine ? tt('Hedefini tuttun! 🎉') : tt('Hedefe {0} kaldı.', mine - done)}</p>
        </div>
      ) : (
        <div>
          <p className="text-neutral-300">{ttx('Bu yıl {0} yapım bitirdin (film ve dizi).', done)}</p>
          <p className="text-sm text-neutral-500 mt-1">{tt('Seneye bir hedef koy; İstatistikler\'deki hedef halkası {0} başında buna geçer, gelecek yılın Flashback\'inde tuttun mu diye bakılır.', next)}</p>
        </div>
      )}
      <div className="text-center">
        <p className="text-lg font-bold text-white">{tt('{0} yılında kaç yapım bitirmek istersin?', next)}</p>
        <div className="flex items-center justify-center gap-4 my-3">
          <button onClick={() => setN((x) => Math.max(5, x - 5))} className="h-11 w-11 rounded-xl border border-white/15 bg-white/5 text-xl hover:border-white/40">
            −
          </button>
          <span className="fb-title text-6xl w-28 tabular-nums">{n}</span>
          <button onClick={() => setN((x) => Math.min(2000, x + 5))} className="h-11 w-11 rounded-xl border border-white/15 bg-white/5 text-xl hover:border-white/40">
            +
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">{tt('Ayda yaklaşık {0}', (n / 12).toFixed(1).replace('.', ','))}</p>
        <button
          onClick={() => {
            saveSettings({ ...settings, yearGoalNext: { year: next, n } })
            notify(tt('{0} hedefin kaydedildi: {1} yapım.', next, n), 'success')
          }}
          className="rounded-full px-5 py-2 text-sm font-bold text-white"
          style={{ background: 'linear-gradient(90deg,#00b8d9,#ff2d8a)' }}
        >
          {saved === n ? tt('Kaydedildi ✓') : tt('Hedefi kaydet')}
        </button>
      </div>
    </div>
  )
}
