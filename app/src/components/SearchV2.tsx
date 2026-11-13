import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Board, Row } from '../types'
import { titleText, ratingAverage } from '../types'
import { api, type ArchiveCard } from '../lib/api'
import { resolveRole } from '../lib/roles'
import { notifyDataChanged } from '../lib/dataEvents'
import { useToast } from '../hooks/useToast'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { todayIso } from '../types'
import { tt } from '../lib/i18n'
import Icon, { type IconName } from './Icon'

// Gelişmiş arama (v1.23.4, Ayarlar › Ekstralar › Gelişmiş arama): son aramalar, ">" ile komutlar, TMDB'den ekleme,
// "korku 2010 8+" gibi akıllı arama, Türkçe karakter esnekliği ("sehir" → "Şehir"), ok tuşları + Enter.

export const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const RECENT_KEY = 'argus_son_aramalar'
function recent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}
export function rememberSearch(q: string) {
  const t = q.trim()
  if (t.length < 2 || t.startsWith('>')) return
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([t, ...recent().filter((x) => fold(x) !== fold(t))].slice(0, 8)))
  } catch {
    /* önemsiz */
  }
}

type Item = { key: string; run: () => void }

export default function SearchV2Panel({
  board,
  rows,
  q,
  setQ,
  close,
  openRow,
  openTag,
}: {
  board: Board
  rows: Row[]
  q: string
  setQ: (q: string) => void
  close: () => void
  openRow: (id: string) => void
  openTag: (propId: string, optId: string) => void
}) {
  const navigate = useNavigate()
  const { notify } = useToast()
  const { settings } = useHomeSettings()
  const [sel, setSel] = useState(0)
  const [tmdb, setTmdb] = useState<ArchiveCard[]>([])
  const [added, setAdded] = useState<Set<number>>(new Set())
  const raw = q.trim()

  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const tur = resolveRole(board, 'tur')
  const vizyon = resolveRole(board, 'vizyon')
  const puan = resolveRole(board, 'puan')
  const poster = resolveRole(board, 'poster')
  const banner = resolveRole(board, 'banner')
  const kategori = resolveRole(board, 'kategori')

  // ---- komutlar
  const go = (to: string) => () => {
    close()
    navigate(to)
  }
  const COMMANDS: { icon: IconName; label: string; kind: string; run: () => void }[] = [
    { icon: 'cards', label: tt('Ne İzlesem?'), kind: tt('işlem'), run: () => (close(), window.dispatchEvent(new Event('argus-ne-izlesem'))) },
    { icon: 'check', label: tt('Bugün izlediğimi ekle'), kind: tt('işlem'), run: go(`/takvim?ay=${todayIso().slice(0, 7)}&gun=${todayIso()}`) },
    { icon: 'table', label: tt('Yeni kayıt ekle'), kind: tt('işlem'), run: go(`/board/${board.id}?yeni=1`) },
    { icon: 'home', label: tt('Ana Sayfa'), kind: tt('sayfa'), run: go('/') },
    { icon: 'grid', label: tt('Arşiv Tablosu'), kind: tt('sayfa'), run: go(`/board/${board.id}`) },
    { icon: 'calendar', label: tt('Takvim'), kind: tt('sayfa'), run: go('/takvim') },
    { icon: 'chart', label: tt('İstatistikler'), kind: tt('sayfa'), run: go('/istatistikler') },
    { icon: 'bookmark', label: tt('Aklımda'), kind: tt('sayfa'), run: go('/aklimda') },
    { icon: 'trophy', label: tt('Koleksiyon'), kind: tt('sayfa'), run: go('/koleksiyon') },
    { icon: 'planet', label: tt('Evrenler'), kind: tt('sayfa'), run: go('/evrenler') },
    { icon: 'tv', label: tt('Abonelik önerisi'), kind: tt('sayfa'), run: go('/abonelik') },
    { icon: 'gear', label: tt('Ayarlar'), kind: tt('sayfa'), run: go('/arsivlerim') },
    { icon: 'sparkle', label: tt('Ekstralar'), kind: tt('sayfa'), run: go('/arsivlerim?sekme=ekstralar') },
    { icon: 'help', label: tt('Yardım Merkezi'), kind: tt('sayfa'), run: go('/yardim') },
    { icon: 'sparkle', label: tt('Yama Notları'), kind: tt('sayfa'), run: go('/yama-notlari') },
  ]
  const cmdMode = raw.startsWith('>')
  const cmdQ = fold(raw.slice(1).trim())
  const cmds = cmdMode ? COMMANDS.filter((c) => fold(c.label).includes(cmdQ)) : !raw ? COMMANDS.slice(0, 3) : []

  // ---- akıllı sorgu
  const parsed = useMemo(() => {
    if (!raw || cmdMode) return { text: '', year: null as string | null, min: null as number | null, genre: null as { id: string; label: string } | null }
    let rest = fold(raw)
    let year: string | null = null
    let min: number | null = null
    rest = rest.replace(/\b(19|20)\d\d\b/, (m) => ((year = m), ' '))
    rest = rest.replace(/(\d+(?:[.,]\d)?)\+/, (_m, n) => ((min = Number(String(n).replace(',', '.'))), ' '))
    let genre: { id: string; label: string } | null = null
    for (const o of [...(tur?.options ?? [])].sort((a, b) => b.label.length - a.label.length)) {
      const f = fold(o.label)
      if (f.length > 2 && rest.includes(f)) {
        genre = { id: o.id, label: o.label }
        rest = rest.replace(f, ' ')
        break
      }
    }
    return { text: rest.replace(/\s+/g, ' ').trim(), year, min, genre }
  }, [raw, cmdMode, tur])
  const hasFilter = Boolean(parsed.year || parsed.min !== null || parsed.genre)

  const results = useMemo(() => {
    if (!raw || cmdMode) return []
    const out: { row: Row; score: number }[] = []
    for (const r of rows) {
      if (parsed.year && vizyon && !String(r.values[vizyon.id] ?? '').startsWith(parsed.year)) continue
      if (parsed.min !== null && puan && (ratingAverage(r.values[puan.id], puan) ?? -1) < parsed.min) continue
      if (parsed.genre && tur) {
        const v = r.values[tur.id]
        if (!(Array.isArray(v) ? (v as string[]) : [v]).includes(parsed.genre.id)) continue
      }
      if (!parsed.text) {
        out.push({ row: r, score: 0 })
        continue
      }
      const title = titleProp ? fold(titleText(titleProp, r.values[titleProp.id])) : ''
      if (title.startsWith(parsed.text)) out.push({ row: r, score: 0 })
      else if (title.includes(parsed.text)) out.push({ row: r, score: 1 })
      else {
        for (const p of board.properties) {
          const v = r.values[p.id]
          if (p.id === titleProp?.id || v == null || v === '') continue
          let hay = ''
          if (p.type === 'select') hay = p.options?.find((o) => o.id === v)?.label ?? ''
          else if (p.type === 'multiselect' && Array.isArray(v) && p.options && p.options.length < 3000) hay = (v as string[]).map((id) => p.options!.find((o) => o.id === id)?.label ?? '').join(' ')
          else if (typeof v === 'string' && (p.type === 'text' || p.type === 'longtext')) hay = v
          if (hay && fold(hay).includes(parsed.text)) {
            out.push({ row: r, score: 2 })
            break
          }
        }
      }
    }
    out.sort((a, b) => a.score - b.score)
    return out.slice(0, 40).map((x) => x.row)
  }, [raw, cmdMode, rows, parsed, board])

  // Kişi/etiket eşleşmeleri (oyuncu, tür, ülke…) — Türkçe karakter esnek
  const tags = useMemo(() => {
    if (!parsed.text || parsed.text.length < 2 || hasFilter) return []
    const out: { propId: string; propName: string; id: string; label: string; image?: string }[] = []
    for (const p of board.properties) {
      if (p.type !== 'select' && p.type !== 'multiselect') continue
      for (const o of p.options ?? []) if (fold(o.label).includes(parsed.text)) out.push({ propId: p.id, propName: p.name, id: o.id, label: o.label, image: o.image })
      if (out.length > 30) break
    }
    return out.sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image))).slice(0, 8)
  }, [parsed.text, hasFilter, board])

  // TMDB: arşivde azsa ya da hiç yoksa
  useEffect(() => {
    setTmdb([])
    if (!parsed.text || parsed.text.length < 2 || hasFilter) return
    let alive = true
    const t = setTimeout(() => {
      api
        .searchEvren(board.id, raw)
        .then((d) => alive && setTmdb(d.items.filter((c) => !c.inArchive).slice(0, 6)))
        .catch(() => {})
    }, 350)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [parsed.text, hasFilter, board.id])

  async function addTmdb(c: ArchiveCard) {
    try {
      await api.addFromTmdb(board.id, { tmdbId: c.tmdbId, mediaType: c.mediaType, status: 'izlenecek' })
      notifyDataChanged(board.id)
      setAdded((s) => new Set(s).add(c.tmdbId))
      notify(tt('"{0}" izlenecekler listene eklendi.', c.title), 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Eklenemedi.'), 'danger')
    }
  }

  // ---- klavye
  const items: Item[] = [
    ...cmds.map((c) => ({ key: 'c' + c.label, run: c.run })),
    ...tags.map((t) => ({ key: 't' + t.propId + t.id, run: () => (rememberSearch(raw), openTag(t.propId, t.id)) })),
    ...results.map((r) => ({ key: 'r' + r.id, run: () => (rememberSearch(raw), openRow(r.id)) })),
    ...tmdb.map((c) => ({ key: 'm' + c.tmdbId, run: () => addTmdb(c) })),
  ]
  const itemsRef = useRef(items)
  itemsRef.current = items
  const selRef = useRef(sel)
  selRef.current = sel
  useEffect(() => setSel(0), [raw])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const n = itemsRef.current.length
      if (e.key === 'ArrowDown' && n) {
        e.preventDefault()
        setSel((s) => Math.min(n - 1, s + 1))
      } else if (e.key === 'ArrowUp' && n) {
        e.preventDefault()
        setSel((s) => Math.max(0, s - 1))
      } else if (e.key === 'Enter' && n) {
        e.preventDefault()
        itemsRef.current[selRef.current]?.run()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  useEffect(() => {
    document.querySelector(`[data-sv2="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  let idx = 0
  const rowCls = (i: number) => `w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left transition ${i === sel ? 'bg-[#00c0fa]/12 shadow-[inset_2px_0_0_#00c0fa]' : 'hover:bg-neutral-900'}`
  const imgOf = (r: Row) => ((poster && (r.values[poster.id] as string)) || (banner && (r.values[banner.id] as string)) || '') as string
  const sub = (r: Row) =>
    [kategori?.options?.find((o) => o.id === r.values[kategori.id])?.label, vizyon ? String(r.values[vizyon.id] ?? '').slice(0, 4) : '', puan ? ratingAverage(r.values[puan.id], puan)?.toFixed(1) : '']
      .filter(Boolean)
      .join(' · ')
  const Sec = ({ children }: { children: React.ReactNode }) => <p className="px-3 pt-4 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">{children}</p>

  const rec = recent()
  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      {hasFilter && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {parsed.genre && <span className="text-xs rounded-full border border-[#00c0fa]/40 bg-[#00c0fa]/12 px-2.5 py-1 text-[#bdeeff]">🎭 {parsed.genre.label}</span>}
          {parsed.year && <span className="text-xs rounded-full border border-[#00c0fa]/40 bg-[#00c0fa]/12 px-2.5 py-1 text-[#bdeeff]">📅 {parsed.year}</span>}
          {parsed.min !== null && <span className="text-xs rounded-full border border-[#00c0fa]/40 bg-[#00c0fa]/12 px-2.5 py-1 text-[#bdeeff]">★ {parsed.min}+</span>}
        </div>
      )}
      {!raw && rec.length > 0 && (
        <>
          <Sec>{tt('Son aramaların')}</Sec>
          <div className="flex flex-wrap gap-2 px-3">
            {rec.map((r) => (
              <button key={r} onClick={() => setQ(r)} className="text-sm rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500 hover:text-neutral-50">
                ↺ {r}
              </button>
            ))}
          </div>
        </>
      )}
      {cmds.length > 0 && <Sec>{cmdMode ? tt('Komutlar') : tt('Hızlı')}</Sec>}
      {cmds.map((c) => {
        const i = idx++
        return (
          <button key={c.label} data-sv2={i} onMouseEnter={() => setSel(i)} onClick={c.run} className={rowCls(i)}>
            <span className="h-9 w-9 shrink-0 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-300">
              <Icon name={c.icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-100">{c.label}</span>
              <span className="block text-xs text-neutral-500">{c.kind}</span>
            </span>
            <span className="ml-auto text-xs text-neutral-600">↵</span>
          </button>
        )
      })}
      {!raw && <p className="px-3 pt-4 text-xs text-neutral-600">{tt('İpucu: ">" ile sayfalara git, "korku 2010 8+" gibi tür, yıl ve puanla ara.')}</p>}
      {tags.length > 0 && <Sec>{tt('Kişiler ve etiketler')}</Sec>}
      {tags.map((t) => {
        const i = idx++
        return (
          <button key={t.propId + t.id} data-sv2={i} onMouseEnter={() => setSel(i)} onClick={() => (rememberSearch(raw), openTag(t.propId, t.id))} className={rowCls(i)}>
            <span className="h-9 w-9 shrink-0 rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center text-xs text-neutral-500">{t.image ? <img src={t.image} alt="" className="h-full w-full object-cover" /> : t.label.slice(0, 1)}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-100 truncate">{t.label}</span>
              <span className="block text-xs text-neutral-500">{t.propName}</span>
            </span>
          </button>
        )
      })}
      {raw && !cmdMode && (
        <Sec>
          {tt('Arşivinde')} · {results.length >= 40 ? '40+' : results.length}
        </Sec>
      )}
      {results.map((r) => {
        const i = idx++
        const img = imgOf(r)
        return (
          <button key={r.id} data-sv2={i} onMouseEnter={() => setSel(i)} onClick={() => (rememberSearch(raw), openRow(r.id))} className={rowCls(i)}>
            <span className="h-12 w-8 shrink-0 rounded-md overflow-hidden bg-neutral-800">{img && <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-100 truncate">{titleProp ? titleText(titleProp, r.values[titleProp.id]) : ''}</span>
              <span className="block text-xs text-neutral-500">{sub(r)}</span>
            </span>
            <span className="ml-auto text-xs text-neutral-600">↵ {tt('aç')}</span>
          </button>
        )
      })}
      {raw && !cmdMode && results.length === 0 && tmdb.length === 0 && <p className="px-3 py-6 text-sm text-neutral-500">{tt('Bu aramaya uyan bir şey yok.')}</p>}
      {tmdb.length > 0 && <Sec>{tt("TMDB'de · arşivinde yok")}</Sec>}
      {tmdb.map((c) => {
        const i = idx++
        const done = added.has(c.tmdbId)
        return (
          <div key={c.tmdbId} data-sv2={i} onMouseEnter={() => setSel(i)} className={rowCls(i)}>
            <span className="h-12 w-8 shrink-0 rounded-md overflow-hidden bg-neutral-800">{c.poster && <img src={c.poster} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-100 truncate">{c.title}</span>
              <span className="block text-xs text-neutral-500">
                {[c.mediaType === 'tv' ? tt('Dizi') : tt('Film'), c.year, c.rating ? `★ ${c.rating}` : ''].filter(Boolean).join(' · ')}
              </span>
            </span>
            <button
              disabled={done || !settings.boardId}
              onClick={() => addTmdb(c)}
              className="ml-auto shrink-0 text-xs font-bold rounded-lg px-3 py-1.5 text-white disabled:opacity-60"
              style={{ background: done ? '#16a34a' : 'linear-gradient(90deg,#015eea,#00c0fa)' }}
            >
              {done ? tt('✓ Eklendi') : tt('+ İzleneceklere')}
            </button>
          </div>
        )
      })}
      <div className="flex gap-4 px-3 pt-5 text-[11px] text-neutral-600">
        <span>↑↓ {tt('gez')}</span>
        <span>↵ {tt('aç')}</span>
        <span>&gt; {tt('komut')}</span>
        <span>Esc {tt('kapat')}</span>
      </div>
    </div>
  )
}
