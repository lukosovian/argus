import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useProfiles } from '../hooks/useProfiles'
import { useToast } from '../hooks/useToast'
import { useEscape } from '../hooks/useEscape'
import { api, type Evren, type EvrenItem, type EvrenPrefs, type EvrenSave, type EvrenSaveItem, type TmdbCard } from '../lib/api'
import { notifyDataChanged, onDataChanged } from '../lib/dataEvents'
import { todayIso, type Row } from '../types'
import RowDetailModal from '../components/RowDetailModal'
import TmdbPreviewModal from '../components/TmdbPreviewModal'
import AnchoredMenu from '../components/AnchoredMenu'
import { fmtDate, tt, ttx } from '../lib/i18n'
import EmptyState from '../components/EmptyState'
import PageSkeleton from '../components/Skeleton'

// Evrenler — kullanıcı "VisionQuest'i anlamak için önce şunları izle dedi, madem öyle Marvel'ı baştan izleyeyim;
// evrendeki filmleri dizileri sıralasın, ben oradan işaretleyeyim, izlenmiş olarak arşivime ve takvime düşsün"
// dedi. Hazır evrenler (Marvel, DC, Star Wars, Orta Dünya, Büyücülük Dünyası) çıkış ve hikâye sırasıyla gelir;
// sıralar resmî kaynaklardan doğrulandı (bkz. server/evrenler.js). İzlediklerin kendi sırasında tarihiyle durur.
// Sonra kullanıcı "dizide izledim deyince bütün bölümleri aynı tarihe atmasın; amacım baştan izleme turu başlatıp ne
// kadar izledim ne kadar kaldı takip etmek, arşivimde olmayanı ekleyebilmek" dedi: asıl kullanım "izleme turu"
// (prefs.maraton = turun başladığı gün). Turda o günden sonraki izlemeler sayılır; filmler buradan işaretlenir,
// dizilerin bölümleri detay penceresinden (ya da Nook'tan) tek tek, gerçek tarihleriyle. Arşivde olmayanlar
// İzlenecek olarak eklenir. Kendi evrenini de kurabilirsin (yapım ekle, sırala, "tarihe göre sırala").

const SWATCHES = ['#e23636', '#2b6cff', '#ffe81f', '#c9a227', '#946b2d', '#22c55e', '#a855f7', '#f97316', '#00c0fa', '#ec4899']

const endOf = (w: string) => (w === '?' ? '' : w.split('/').pop() ?? '')

// "YYYY-MM-DD" → gün sayısı (fark almak için) ve gün ekleme
function dayNum(iso: string) {
  return Math.round(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 864e5)
}
function addDays(iso: string, n: number) {
  return new Date((dayNum(iso) + n) * 864e5).toISOString().slice(0, 10)
}

function fmtWatch(w: string) {
  if (w === '?') return tt('tarihi bilinmiyor')
  const e = endOf(w)
  if (/^\d{4}$/.test(e)) return e
  const [y, m, d] = e.split('-').map(Number)
  return y && m && d ? fmtDate(y, m - 1, d, { short: true }) : e
}

function fmtRelease(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return y && m && d ? fmtDate(y, m - 1, d, { short: true }) : date
}

function kindLabel(it: EvrenItem) {
  if (it.season) return tt('{0}. Sezon', it.season)
  return it.type === 'tv' ? tt('Dizi') : tt('Film')
}

function hoursText(min: number) {
  const h = Math.round(min / 60)
  return h >= 1 ? tt('yaklaşık {0} saat', h) : tt('{0} dakika', min)
}

// Evren sayfasındaki vurgular evrenin kendi renginde (kullanıcı "MCU kırmızı, butonlar mavi güzel durmamış" dedi).
// Açık renklerin (Star Wars sarısı) üstüne koyu yazı.
function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return l > 0.6 ? '#0a0a0a' : '#ffffff'
}
const accentBtn = (c: string) => ({ background: c, color: onColor(c) })
const ACCENT_BTN = 'font-semibold transition hover:brightness-110 disabled:opacity-50'

type Mode = 'cikis' | 'hikaye'

function orderItems(u: Evren, mode: Mode, showExtra: boolean) {
  const items = u.items.filter((i) => showExtra || !i.extra)
  if (mode === 'hikaye') {
    const pos = new Map(u.story.map((k, i) => [k, i]))
    return [...items].sort((a, b) => (pos.get(a.key) ?? 9999) - (pos.get(b.key) ?? 9999))
  }
  return [...items].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
}

export default function Evrenler() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { settings } = useHomeSettings()
  const { activeProfileId } = useProfiles()
  const boardId = settings.boardId ?? undefined
  const { board } = useBoard(boardId)
  const { rows } = useRows(boardId)
  const [data, setData] = useState<{ universes: Evren[]; prefs: Record<string, EvrenPrefs> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; initial: EvrenSave; part: 'settings' | 'content' } | null>(null)

  const load = useCallback(() => {
    if (!boardId) return
    api
      .getEvrenler(boardId)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : tt('Sunucuya ulaşılamadı.')))
  }, [boardId])

  useEffect(() => {
    if (activeProfileId) load()
  }, [load, activeProfileId])
  useEffect(() => onDataChanged(() => load()), [load])

  async function savePrefs(uid: string, p: EvrenPrefs | null) {
    setData((d) => (d ? { ...d, prefs: { ...d.prefs, [uid]: p ? { ...(d.prefs[uid] ?? {}), ...p } : {} } } : d))
    await api.saveEvrenler({ prefs: { [uid]: p } }).catch(() => {})
  }

  if (!boardId) return <p className="text-center text-neutral-500 py-20">{tt('Önce bir arşiv seç (Ayarlar → Ana Sayfa).')}</p>
  if (error && !data) return <p className="text-center text-rose-400 py-20">{error}</p>
  if (!data || !board) return <PageSkeleton />

  const current = id ? data.universes.find((u) => u.id === id) : null

  function newUniverse() {
    setEditing({ id: 'k' + Math.random().toString(36).slice(2, 9), part: 'settings', initial: { name: '', color: SWATCHES[6], items: [], story: [] } })
  }

  return (
    <>
      {current ? (
        <UniverseView
          key={current.id}
          u={current}
          prefs={data.prefs[current.id] ?? {}}
          boardId={boardId}
          rows={rows}
          board={board}
          onPrefs={(p) => savePrefs(current.id, p)}
          onChanged={load}
          onEdit={(part) => setEditing({ id: current.id, part, initial: toSave(current) })}
          onCopy={() => {
            const nid = 'k' + Math.random().toString(36).slice(2, 9)
            setEditing({ id: nid, part: 'settings', initial: { ...toSave(current), name: tt('{0} (benim sıram)', current.name), from: current.id } })
          }}
        />
      ) : (
        <UniverseList universes={data.universes} prefs={data.prefs} onNew={newUniverse} />
      )}
      {id && !current && <p className="text-center text-neutral-500 py-20">{tt('Bu evren bulunamadı.')}</p>}
      {editing && (
        <UniverseEditor
          id={editing.id}
          part={editing.part}
          initial={editing.initial}
          boardId={boardId}
          isNew={!data.universes.some((u) => u.id === editing.id)}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null)
            load()
            if (saved === null) navigate('/evrenler')
            else navigate(`/evrenler/${editing.id}`)
          }}
        />
      )}
    </>
  )
}

function toSave(u: Evren): EvrenSave {
  return {
    name: u.name,
    short: u.short,
    color: u.color,
    from: u.from ?? undefined,
    groups: u.groups,
    story: u.story,
    items: u.items.map((i) => {
      const o: EvrenSaveItem = { key: i.key, type: i.type, title: i.title, date: i.date }
      if (i.tmdbId) o.tmdbId = i.tmdbId
      else if (i.rowId) o.rowId = i.rowId
      if (i.season) o.season = i.season
      if (i.poster) o.poster = i.poster
      if (i.minutes) o.minutes = i.minutes
      if (i.group) o.group = i.group
      if (i.extra) o.extra = true
      return o
    }),
  }
}

// Turda: film turdan sonra izlendiyse, dizi(sezon) turdan sonra bütün bölümleri izlendiyse bitmiş sayılır
function isDone(it: EvrenItem, tur?: string) {
  if (!tur) return it.watched
  return Boolean(it.tour?.done)
}
// Turda yarım kalan dizinin izlenen kısmı (kalan süre için)
function doneShare(it: EvrenItem, tur?: string) {
  if (isDone(it, tur)) return 1
  if (tur && it.tour?.total) return (it.tour.seen ?? 0) / it.tour.total
  return 0
}

// Arşivinde olmayanlar — bir dizinin sezonları arşivde tek kayıt olduğundan bir kez sayılır
function missingTitles(items: EvrenItem[]) {
  const seen = new Set<string>()
  return items.filter((i) => {
    if (i.rowId || !i.tmdbId) return false
    const k = i.type + i.tmdbId
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// Görünen yapımlar: yan yapımlar ayarı + kısa tur (turKeys) varsa sadece onlar
function inScope(i: EvrenItem, prefs: EvrenPrefs) {
  return (prefs.ek || !i.extra || (prefs.turKeys ?? []).includes(i.key)) && (!prefs.turKeys?.length || prefs.turKeys.includes(i.key))
}

function stats(u: Evren, prefs: EvrenPrefs) {
  const skip = new Set(prefs.atla ?? [])
  const items = u.items.filter((i) => inScope(i, prefs) && i.released && !skip.has(i.key))
  const done = items.filter((i) => isDone(i, prefs.maraton)).length
  const left = Math.round(items.reduce((t, i) => t + (i.minutes ?? 0) * (1 - doneShare(i, prefs.maraton)), 0))
  return {
    total: items.length,
    done,
    left,
    before: items.filter((i) => i.watched).length,
    // Turda izlenen süre (hıza göre tahmini bitiş için)
    watchedMin: Math.round(items.reduce((t, i) => t + (i.minutes ?? 0) * doneShare(i, prefs.maraton), 0)),
    missing: missingTitles(u.items.filter((i) => inScope(i, prefs))).length,
    upcoming: u.items.filter((i) => inScope(i, prefs) && !i.released).length,
    skipped: u.items.filter((i) => inScope(i, prefs) && skip.has(i.key)).length,
  }
}

// ---- Evren listesi ----------------------------------------------------------------------------

function UniverseList({ universes, prefs, onNew }: { universes: Evren[]; prefs: Record<string, EvrenPrefs>; onNew: () => void }) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <section
        className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-8 sm:px-10"
        style={{ background: 'radial-gradient(ellipse at 15% 0%, rgba(226,54,54,0.16), transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(43,108,255,0.16), transparent 60%), #0a0a0a' }}
      >
        <p className="text-sm font-semibold tracking-widest text-[#7fdcff]">{tt('ARGUS')}</p>
        <h1 className="text-4xl sm:text-5xl font-black text-neutral-50 tracking-tight mt-1">{tt('Evrenler')}</h1>
        <p className="text-neutral-300 mt-2 max-w-2xl">
          {tt('Sinematik evrenlerin bütün filmleri ve dizileri, çıkış ya da hikâye sırasıyla. Bir izleme turu başlat, ne kadarını izlediğini ve ne kadar kaldığını takip et; arşivinde olmayanları tek tıkla ekle.')}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {universes.map((u) => {
          const p = prefs[u.id] ?? {}
          const s = stats(u, p)
          const posters = orderItems(u, 'cikis', false).filter((i) => i.poster).slice(0, 5)
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0
          return (
            <Link
              key={u.id}
              to={`/evrenler/${u.id}`}
              className="group rounded-3xl border border-neutral-800 hover:border-neutral-600 bg-neutral-900/60 overflow-hidden transition"
            >
              <div className="relative h-36 overflow-hidden" style={{ background: `linear-gradient(135deg, ${u.color}55, #0a0a0a 75%)` }}>
                <div className="absolute inset-0 flex justify-end gap-1.5 pr-3 pt-3 opacity-80 group-hover:opacity-100 transition">
                  {posters.map((i, n) => (
                    <img key={i.key} src={i.poster!} alt="" loading="lazy" className="h-32 aspect-[2/3] object-cover rounded-md shadow-lg" style={{ transform: `translateY(${n % 2 ? 10 : 0}px)` }} />
                  ))}
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/90 via-neutral-950/50 to-transparent" />
                <div className="absolute left-4 bottom-3 right-4">
                  {u.short && <p className="text-xs font-black tracking-widest" style={{ color: u.color }}>{u.short}</p>}
                  <p className="text-xl font-black text-neutral-50 leading-tight">{u.name}</p>
                </div>
              </div>
              <div className="p-4 space-y-2">
                <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: u.color }} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-300">
                    {p.maraton ? ttx('Turda {0}/{1}', <b className="text-neutral-50">{s.done}</b>, s.total) : ttx('{0}/{1} izledin', <b className="text-neutral-50">{s.done}</b>, s.total)}
                  </span>
                  <span className="text-neutral-500 text-xs">{s.left ? tt('kalan {0}', hoursText(s.left)) : s.total ? tt('hepsini izledin') : ''}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {p.maraton && <span className="rounded-full px-2 py-0.5 text-neutral-50" style={{ background: `${u.color}33` }}>{tt('Tur sürüyor')}</span>}
                  {!u.builtin && <span className="rounded-full bg-neutral-800 text-neutral-400 px-2 py-0.5">{tt('Senin evrenin')}</span>}
                  {s.upcoming > 0 && <span className="rounded-full bg-neutral-800 text-neutral-400 px-2 py-0.5">{tt('{0} yakında', s.upcoming)}</span>}
                </div>
              </div>
            </Link>
          )
        })}
        <button
          onClick={onNew}
          className="rounded-3xl border-2 border-dashed border-neutral-800 hover:border-[#00c0fa]/60 text-neutral-500 hover:text-[#7fdcff] min-h-56 flex flex-col items-center justify-center gap-1 transition"
        >
          <span className="text-4xl leading-none">＋</span>
          <span className="font-semibold">{tt('Kendi evrenini oluştur')}</span>
          <span className="text-xs text-neutral-600 max-w-56 text-center">{tt('Bir yönetmenin filmleri, bir korku evreni… istediğin yapımları ekle, istediğin gibi sırala.')}</span>
        </button>
      </div>
    </div>
  )
}

// ---- Tek evren ----------------------------------------------------------------------------------

function UniverseView({
  u,
  prefs,
  boardId,
  rows,
  board,
  onPrefs,
  onChanged,
  onEdit,
  onCopy,
}: {
  u: Evren
  prefs: EvrenPrefs
  boardId: string
  rows: Row[]
  board: NonNullable<ReturnType<typeof useBoard>['board']>
  onPrefs: (p: EvrenPrefs | null) => void
  onChanged: () => void
  onEdit: (part: 'settings' | 'content') => void
  onCopy: () => void
}) {
  const { notify, confirm } = useToast()
  const tur = prefs.maraton
  const mode: Mode = prefs.sira ?? 'cikis'
  const showExtra = Boolean(prefs.ek)
  const extraCount = u.items.filter((i) => i.extra).length
  // Kısa tur ("Bunu izlemeden önce"den): sadece o yapımlar; "Bütün evreni göster" ile hepsi
  const subset = prefs.turKeys?.length ? prefs.turKeys : null
  const [showAll, setShowAll] = useState(false)
  const skip = useMemo(() => new Set(prefs.atla ?? []), [prefs.atla])
  const ordered = useMemo(() => {
    const list = orderItems(u, mode, showExtra || Boolean(subset))
    return subset && !showAll ? list.filter((i) => subset.includes(i.key)) : list.filter((i) => showExtra || !i.extra || subset?.includes(i.key))
  }, [u, mode, showExtra, subset, showAll])
  const s = stats(u, prefs)
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0
  const next = ordered.find((i) => i.released && !isDone(i, tur) && !skip.has(i.key) && (!subset || subset.includes(i.key)))
  const [prereq, setPrereq] = useState<string | null | false>(false)
  const hasDeps = Object.keys(u.deps ?? {}).length > 0
  const subsetTarget = subset && prefs.turHedefKey ? u.items.find((i) => i.key === prefs.turHedefKey) : null

  // Turda atla: izlemeden geç (kullanıcı "sıradaki şu diyor, izlemeden geçme de olsun" dedi)
  function setSkip(it: EvrenItem, on: boolean) {
    setMenu(null)
    const list = new Set(prefs.atla ?? [])
    if (on) list.add(it.key)
    else list.delete(it.key)
    onPrefs({ atla: [...list] })
    if (on) notify(tt('"{0}" atlandı, sıradakine geçildi.', it.archiveTitle || it.title))
  }

  function startSubset(keys: string[], target: string) {
    setPrereq(false)
    setShowAll(false)
    onPrefs({ maraton: tur ?? todayIso(), turKeys: keys, turHedefKey: target, atla: [] })
    const t = u.items.find((i) => i.key === target)
    notify(tt('Tur başladı: {0} öncesi, {1} yapım.', t ? t.archiveTitle || t.title : '', keys.length))
  }
  const [busy, setBusy] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ item: EvrenItem; el: HTMLElement } | null>(null)
  const [detail, setDetail] = useState<{ row: Row; episodes: boolean } | null>(null)
  // Arşive yeni eklenen dizinin kaydı satırlar yenilenince açılır
  const [openAfterAdd, setOpenAfterAdd] = useState<string | null>(null)
  const [preview, setPreview] = useState<TmdbCard | null>(null)
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)
  const [formStart, setFormStart] = useState('')
  const [formTarget, setFormTarget] = useState('')
  const [tourMenu, setTourMenu] = useState(false)
  const tourBtn = useRef<HTMLButtonElement>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const numbers = new Map(ordered.map((i, n) => [i.key, n + 1]))

  // Çıkış sırasında fazlara göre bölümler; hikâye sırasında tek liste
  const sections = useMemo(() => {
    if (mode === 'hikaye' || !u.groups.length) return [{ id: '', name: '', items: ordered }]
    const out = u.groups.map((g) => ({ id: g.id, name: g.name, items: ordered.filter((i) => i.group === g.id) }))
    const rest = ordered.filter((i) => !i.group || !u.groups.some((g) => g.id === i.group))
    if (rest.length) out.push({ id: '_', name: tt('Diğer'), items: rest })
    return out.filter((x) => x.items.length)
  }, [mode, u.groups, ordered])

  const pendingRow = openAfterAdd ? rows.find((r) => r.id === openAfterAdd) : null
  useEffect(() => {
    if (!pendingRow) return
    setOpenAfterAdd(null)
    openRow(pendingRow, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRow])

  function openRow(row: Row, episodes: boolean) {
    setDetail({ row, episodes })
    if (episodes) setTimeout(() => (document.getElementById('rd-ozet') ?? document.getElementById('rd-bolumler'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450)
  }

  // Film: izledim (arşivde yoksa izlendi olarak eklenir)
  async function mark(it: EvrenItem, date: string, remove = false) {
    setMenu(null)
    setBusy(it.key)
    try {
      const res = await api.markEvren(boardId, { uid: u.id, key: it.key, date, remove })
      notifyDataChanged(boardId)
      onChanged()
      if (remove) {
        notify(tt('"{0}" için bu izleme kaldırıldı.', it.title))
        return
      }
      const undo = await confirm({
        message: res.created ? tt('"{0}" arşivine eklendi ve izlendi olarak işaretlendi.', it.title) : tt('"{0}" izlendi olarak işaretlendi.', it.title),
        confirmLabel: tt('Geri al'),
        cancelLabel: tt('Tamam'),
        tone: 'info',
      })
      if (undo) {
        await api.markEvren(boardId, { uid: u.id, key: it.key, date, remove: true })
        notifyDataChanged(boardId)
        onChanged()
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('İşaretlenemedi.'), 'danger')
    } finally {
      setBusy(null)
    }
  }

  // Arşive İzlenecek olarak ekle; open: dizide eklenince bölümleri aç
  async function addToArchive(it: EvrenItem, open = false) {
    setMenu(null)
    setBusy(it.key)
    try {
      const res = await api.addEvren(boardId, { uid: u.id, key: it.key })
      notifyDataChanged(boardId)
      onChanged()
      if (open && res.rowId) setOpenAfterAdd(res.rowId)
      else notify(tt('"{0}" izlenecekler listene eklendi.', it.title))
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Eklenemedi.'), 'danger')
    } finally {
      setBusy(null)
    }
  }

  // Toplu ekleme: her yapım için İzlenecek ya da "eskiden izledim" (yıl / "?") seçilmiş liste
  async function addAllMissing(list: { item: EvrenItem; old: string | null }[]) {
    setBulkOpen(false)
    if (!list.length) return
    setBulk({ done: 0, total: list.length })
    let fail = 0
    for (let n = 0; n < list.length; n++) {
      const { item, old } = list[n]
      try {
        await api.addEvren(boardId, old ? { uid: u.id, key: item.key, status: 'izlendi', date: old } : { uid: u.id, key: item.key })
      } catch {
        fail++
      }
      setBulk({ done: n + 1, total: list.length })
    }
    setBulk(null)
    notifyDataChanged(boardId)
    onChanged()
    notify(fail ? tt('{0} yapım eklendi, {1} tanesi eklenemedi.', list.length - fail, fail) : tt('{0} yapım arşivine eklendi.', list.length), fail ? 'danger' : undefined)
  }

  // Tek bir yapımı "eskiden izledim" diye ekle (dizi ya da film; tarih yıl ya da "?")
  async function addOld(it: EvrenItem, date: string) {
    setMenu(null)
    setBusy(it.key)
    try {
      await api.addEvren(boardId, { uid: u.id, key: it.key, status: 'izlendi', date })
      notifyDataChanged(boardId)
      onChanged()
      notify(tt('"{0}" eskiden izlediklerin arasına eklendi.', it.title))
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Eklenemedi.'), 'danger')
    } finally {
      setBusy(null)
    }
  }

  // Afişe ya da "Bölümler"e basınca: arşivdeyse detay (dizide bölümler açık), değilse TMDB önizlemesi
  function open(it: EvrenItem) {
    const row = it.rowId ? rows.find((r) => r.id === it.rowId) : null
    if (row) return openRow(row, it.type === 'tv')
    if (it.tmdbId)
      setPreview({ tmdbId: it.tmdbId, mediaType: it.type, title: it.title, originalTitle: '', year: it.date.slice(0, 4), poster: it.poster, backdrop: null, overview: '', rating: null })
  }

  // Tur ayarları penceresi (başlat ya da düzenle): başlangıç ve isteğe bağlı hedef bitiş tarihi
  function openTourMenu() {
    setFormStart(tur ?? todayIso())
    setFormTarget(prefs.hedef ?? '')
    setTourMenu(true)
  }
  function saveTour() {
    if (!formStart) return
    const starting = !tur
    setTourMenu(false)
    onPrefs(starting ? ({ maraton: formStart, hedef: formTarget || null, atla: [], turKeys: null, turHedefKey: null } as unknown as EvrenPrefs) : ({ maraton: formStart, hedef: formTarget || null } as unknown as EvrenPrefs))
    if (starting) notify(tt('Tur başladı. {0} tarihinden sonra izlediklerin sayılıyor; önceki izlemelerin tarihleriyle görünmeye devam eder.', fmtWatch(formStart)))
  }
  async function endTour() {
    setTourMenu(false)
    const ok = await confirm({ message: tt('Turu bitirmek istiyor musun? İzlediklerin arşivinde kalır; tur "Önceki turlar"a kaydedilir.'), confirmLabel: tt('Bitir') })
    if (!ok || !tur) return
    const rec = { bas: tur, bit: todayIso(), done: s.done, total: s.total, ad: subsetTarget ? tt('{0} öncesi', subsetTarget.archiveTitle || subsetTarget.title) : undefined }
    onPrefs({ maraton: null, hedef: null, turKeys: null, turHedefKey: null, atla: null, gecmis: [...(prefs.gecmis ?? []), rec] } as unknown as EvrenPrefs)
  }

  // Tur hesapları: geçen gün, hedefe kalan gün, hıza göre tahmini bitiş, hedefe yetişmek için günlük süre
  const today = todayIso()
  const elapsed = tur ? dayNum(today) - dayNum(tur) + 1 : 0
  const daysLeft = tur && prefs.hedef ? dayNum(prefs.hedef) - dayNum(today) : null
  const perDay = daysLeft != null && daysLeft >= 0 && s.left > 0 ? s.left / (daysLeft + 1) : null
  const pace = elapsed >= 3 && s.watchedMin > 0 ? s.watchedMin / elapsed : null
  const eta = pace && s.left > 0 ? addDays(today, Math.ceil(s.left / pace)) : null
  const finished = Boolean(tur && s.total && s.done === s.total)
  // Hedef için hazır seçenekler: 1/3/6 ay sonrası ve evrende sıradaki çıkacak yapımın çıkış günü
  const nextRelease = u.items.filter((i) => !i.released && i.date && i.date > today && (showExtra || !i.extra)).sort((a, b) => a.date.localeCompare(b.date))[0]
  const quickTargets = [
    ...(nextRelease ? [{ label: tt('{0} çıkana kadar', nextRelease.archiveTitle || nextRelease.title), date: nextRelease.date }] : []),
    { label: tt('1 ay'), date: addDays(formStart || today, 30) },
    { label: tt('3 ay'), date: addDays(formStart || today, 91) },
    { label: tt('6 ay'), date: addDays(formStart || today, 182) },
  ]

  const modeBtn = (m: Mode, label: string) => (
    <button onClick={() => onPrefs({ sira: m })} className={`px-3 py-1 rounded-lg transition ${mode === m ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:text-neutral-100'}`}>
      {label}
    </button>
  )

  const nextAction = (it: EvrenItem) => {
    if (it.type === 'movie') return { label: tt('✓ İzledim'), run: () => mark(it, todayIso()) }
    if (!it.rowId) return { label: tt('+ Arşive ekle'), run: () => addToArchive(it, true) }
    return { label: tt('Bölümleri aç'), run: () => open(it) }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-7 sm:px-10" style={{ background: `radial-gradient(ellipse at 10% 0%, ${u.color}40, transparent 60%), #0a0a0a` }}>
        <Link to="/evrenler" className="text-sm text-neutral-400 hover:text-neutral-100">{tt('← Evrenler')}</Link>
        {u.short && <p className="text-sm font-black tracking-widest mt-3" style={{ color: u.color }}>{u.short}</p>}
        <h1 className="text-3xl sm:text-5xl font-black text-neutral-50 tracking-tight">{u.name}</h1>

        <div className="mt-4 max-w-xl space-y-1.5">
          {subset && (
            <p className="text-sm font-semibold text-neutral-100">
              {subsetTarget ? tt('Kısa tur: {0} öncesi ({1} yapım)', subsetTarget.archiveTitle || subsetTarget.title, subset.length) : tt('Kısa tur ({0} yapım)', subset.length)}
            </p>
          )}
          {tur && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: u.color }}>
                {tt('İzleme turu · {0} tarihinden beri · {1}. gün', fmtWatch(tur), elapsed)}
              </p>
              {prefs.hedef && daysLeft != null && (
                <p className={`text-xs font-semibold ${daysLeft < 0 ? 'text-amber-400' : 'text-neutral-200'}`}>
                  {daysLeft > 0 ? tt('Hedef {0} · {1} gün kaldı', fmtWatch(prefs.hedef), daysLeft) : daysLeft === 0 ? tt('Hedef bugün') : tt('Hedef {0} gün geçti', -daysLeft)}
                </p>
              )}
            </div>
          )}
          <div className="h-2.5 rounded-full bg-neutral-800 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: u.color }} />
          </div>
          <p className="text-sm text-neutral-200">
            {tur ? ttx('{0} yapımın {1} tanesini izledin', s.total, <b className="text-neutral-50">{s.done}</b>) : ttx('{0}/{1} izledin', <b className="text-neutral-50">{s.done}</b>, s.total)}
            <span className="text-neutral-500"> · %{pct}</span>
            {s.left > 0 && <span className="text-neutral-400"> · {tt('kalan {0}', hoursText(s.left))}</span>}
          </p>
          {tur && !finished && (perDay != null || eta) && (
            <p className="text-xs text-neutral-400">
              {perDay != null && tt('Hedefe yetişmek için günde {0}', hoursText(Math.ceil(perDay)))}
              {perDay != null && eta && ' · '}
              {eta && tt('Bu hızla {0} gibi bitirirsin', fmtWatch(eta))}
              {eta && prefs.hedef && (eta <= prefs.hedef ? <span style={{ color: u.color }}>{' '}{tt('(hedeften önce)')}</span> : <span className="text-amber-400">{' '}{tt('(hedefin {0} gün gerisinde)', dayNum(eta) - dayNum(prefs.hedef))}</span>)}
            </p>
          )}
          {s.upcoming > 0 && <p className="text-xs text-neutral-500">{tt('{0} yapım henüz çıkmadı, çıkınca listeye katılır.', s.upcoming)}</p>}
          {s.skipped > 0 && <p className="text-xs text-neutral-500">{tt('{0} yapımı atladın (sayılmıyor).', s.skipped)}</p>}
          {tur && s.left > 0 && (
            <Link to={`/abonelik?evren=${u.id}`} className="inline-block text-xs text-neutral-400 hover:text-neutral-100 underline underline-offset-2">
              {tt('Kalanlar hangi platformda?')}
            </Link>
          )}
          {finished && (
            <div className="rounded-xl p-3 text-sm text-neutral-50" style={{ background: `${u.color}26`, border: `1px solid ${u.color}80` }}>
              {tt('Turu bitirdin! {0} günde {1} yapım.', elapsed, s.total)}{' '}
              <button onClick={endTour} className="underline underline-offset-2 font-semibold">{tt('Turu kaydet ve kapat')}</button>
            </div>
          )}
          <div className="pt-2 flex flex-wrap gap-2">
            {tur ? (
              <>
                <button ref={tourBtn} onClick={openTourMenu} className="text-sm rounded-xl px-3 py-1.5 border border-neutral-700 text-neutral-200 hover:text-neutral-50 hover:border-neutral-500 transition">
                  {prefs.hedef ? tt('Turu düzenle') : tt('Hedef tarih koy')}
                </button>
                <button onClick={endTour} className="text-sm rounded-xl px-3 py-1.5 border border-neutral-800 text-neutral-400 hover:text-neutral-50 hover:border-neutral-600 transition">
                  {tt('Turu bitir')}
                </button>
              </>
            ) : (
              <button ref={tourBtn} onClick={openTourMenu} className={`${ACCENT_BTN} text-sm rounded-xl px-4 py-2`} style={accentBtn(u.color)}>
                {tt('Baştan izleme turu başlat')}
              </button>
            )}
          </div>
          {(prefs.gecmis ?? []).length > 0 && (
            <div className="pt-2">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">{tt('Önceki turlar')}</p>
              {[...(prefs.gecmis ?? [])].reverse().map((g, i) => (
                <p key={i} className="text-xs text-neutral-400">
                  {g.ad ? `${g.ad} · ` : ''}
                  {fmtWatch(g.bas)} – {fmtWatch(g.bit)} · {tt('{0}/{1} yapım', g.done, g.total)} · {tt('{0} gün', dayNum(g.bit) - dayNum(g.bas) + 1)}
                </p>
              ))}
            </div>
          )}
        </div>
        {tourMenu && (
          <AnchoredMenu anchorRef={tourBtn} width={320} onClose={() => setTourMenu(false)}>
            <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-3 space-y-3">
              {!tur && <p className="text-sm text-neutral-300">{tt('Sayaç sıfırdan başlar: o günden sonra izlediklerin sayılır. Daha önce izlediklerin tarihleriyle görünmeye devam eder.')}</p>}
              <label className="block space-y-1">
                <span className="text-xs text-neutral-500">{tt('Başlangıç')}</span>
                <input type="date" value={formStart} max={today} onChange={(e) => setFormStart(e.target.value)} className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-100 [color-scheme:dark]" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-neutral-500">{tt('Hedef bitiş (isteğe bağlı)')}</span>
                <input type="date" value={formTarget} min={formStart || today} onChange={(e) => setFormTarget(e.target.value)} className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-100 [color-scheme:dark]" />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {quickTargets.map((q) => (
                  <button key={q.label} onClick={() => setFormTarget(q.date)} className={`text-[11px] rounded-full px-2.5 py-1 border transition ${formTarget === q.date ? 'text-neutral-50' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`} style={formTarget === q.date ? { borderColor: u.color, background: `${u.color}33` } : undefined}>
                    {q.label}
                  </button>
                ))}
                {formTarget && (
                  <button onClick={() => setFormTarget('')} className="text-[11px] rounded-full px-2.5 py-1 text-neutral-500 hover:text-neutral-200">
                    {tt('Hedefsiz')}
                  </button>
                )}
              </div>
              <button disabled={!formStart} onClick={saveTour} className={`${ACCENT_BTN} w-full rounded-lg px-3 py-2 text-sm`} style={accentBtn(u.color)}>
                {tur ? tt('Kaydet') : tt('Turu başlat')}
              </button>
            </div>
          </AnchoredMenu>
        )}

        {next && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-black/40 border border-neutral-800 p-2.5 max-w-xl">
            {next.poster && <img src={next.poster} alt="" className="h-16 aspect-[2/3] object-cover rounded-md" />}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">{tt('Sıradaki')}</p>
              <p className="font-semibold text-neutral-50 truncate">{next.archiveTitle || next.title}</p>
              <p className="text-xs text-neutral-500">
                {kindLabel(next)} · {next.date.slice(0, 4)}
                {tur && next.tour?.total ? ` · ${tt('{0}/{1} bölüm', next.tour.seen ?? 0, next.tour.total)}` : ''}
                {!next.rowId ? ` · ${tt('arşivinde yok')}` : ''}
              </p>
            </div>
            <button onClick={() => setSkip(next, true)} className="text-sm rounded-xl px-3 py-2 border border-neutral-700 text-neutral-300 hover:text-neutral-50 hover:border-neutral-500 shrink-0" title={tt('İzlemeden geç, sayılmasın')}>
              {tt('Atla')}
            </button>
            <button disabled={busy === next.key} onClick={nextAction(next).run} className={`${ACCENT_BTN} rounded-xl px-3 py-2 text-sm shrink-0`} style={accentBtn(u.color)}>
              {busy === next.key ? '…' : nextAction(next).label}
            </button>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-2 rounded-xl bg-neutral-900 border border-neutral-800 p-1 text-sm">
          {modeBtn('cikis', tt('Çıkış sırası'))}
          {modeBtn('hikaye', u.builtin ? tt('Hikâye sırası') : tt('Benim sıram'))}
        </div>
        {hasDeps && (
          <button onClick={() => setPrereq(null)} className="text-sm rounded-xl px-3 py-1.5 border transition text-neutral-50" style={{ borderColor: u.color, background: `${u.color}22` }} title={tt('Bir yapımı anlamak için önce neleri izlemen gerektiğini çıkarır')}>
            {tt('Bunu izlemeden önce…')}
          </button>
        )}
        {subset && (
          <button onClick={() => setShowAll((v) => !v)} className="text-sm rounded-xl px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:text-neutral-50 hover:border-neutral-600 transition">
            {showAll ? tt('Sadece turdakiler') : tt('Bütün evreni göster')}
          </button>
        )}
        {extraCount > 0 && !subset && (
          <button
            onClick={() => onPrefs({ ek: !showExtra })}
            className={`text-sm rounded-xl px-3 py-1.5 border transition ${showExtra ? 'text-neutral-50' : 'border-neutral-800 text-neutral-400 hover:text-neutral-100'}`}
            style={showExtra ? { borderColor: u.color, background: `${u.color}22` } : undefined}
            title={tt('Ana hikâyeye şart olmayan yapımlar (ör. Netflix dizileri, kısa animasyonlar)')}
          >
            {tt('Yan yapımlar ({0})', extraCount)}
          </button>
        )}
        {s.missing > 0 && (
          <button disabled={Boolean(bulk)} onClick={() => setBulkOpen(true)} className="text-sm rounded-xl px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:text-neutral-50 hover:border-neutral-600 transition disabled:opacity-60">
            {bulk ? tt('Ekleniyor {0}/{1}…', bulk.done, bulk.total) : tt('Arşivinde olmayanları ekle ({0})', s.missing)}
          </button>
        )}
        <span className="flex-1" />
        {u.builtin ? (
          <button onClick={onCopy} className="text-sm rounded-xl px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:text-neutral-50 hover:border-neutral-600 transition" title={tt('Bu evrenin bir kopyasını oluştur, yapım ekle çıkar, sırasını değiştir')}>
            {tt('Kopyala ve düzenle')}
          </button>
        ) : (
          <>
            <button onClick={() => onEdit('content')} className={`${ACCENT_BTN} text-sm rounded-xl px-3 py-1.5`} style={accentBtn(u.color)}>
              {tt('+ Yapım ekle / sırala')}
            </button>
            <button onClick={() => onEdit('settings')} className="text-sm rounded-xl px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:text-neutral-50 hover:border-neutral-600 transition">
              {tt('Ad ve renk')}
            </button>
          </>
        )}
      </div>

      {!ordered.length && (
        <EmptyState art="evren" title={tt('Bu evrende henüz yapım yok.')}>
          {!u.builtin && (
            <button onClick={() => onEdit('content')} className={`${ACCENT_BTN} rounded-xl px-4 py-2 text-sm`} style={accentBtn(u.color)}>
              {tt('+ Yapım ekle')}
            </button>
          )}
        </EmptyState>
      )}

      {sections.map((sec) => (
        <section key={sec.id}>
          {sec.name && (
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="text-lg font-bold text-neutral-50">{sec.name}</h2>
              <span className="text-xs text-neutral-500">{tt('{0}/{1}', sec.items.filter((i) => isDone(i, tur)).length, sec.items.length)}</span>
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-x-3 gap-y-5">
            {sec.items.map((it) => (
              <Card
                key={it.key}
                it={it}
                n={numbers.get(it.key) ?? 0}
                color={u.color}
                tur={tur}
                isNext={next?.key === it.key}
                skipped={skip.has(it.key)}
                onUnskip={() => setSkip(it, false)}
                busy={busy === it.key}
                onOpen={() => open(it)}
                onMovie={(el) => (isDone(it, tur) ? setMenu({ item: it, el }) : mark(it, todayIso()))}
                onMenu={(el) => setMenu({ item: it, el })}
                onAdd={() => addToArchive(it, it.type === 'tv')}
              />
            ))}
          </div>
        </section>
      ))}

      {u.builtin && (
        <p className="text-xs text-neutral-600 text-center pt-4">
          {tt('Sıralar resmî kaynaklardan (Marvel\'ın Disney+ zaman çizelgesi, StarWars.com, Wikipedia) derlendi. Afiş ve süreler TMDB\'den.')}
        </p>
      )}

      {menu && (
        <MarkMenu
          item={menu.item}
          anchor={menu.el}
          tur={tur}
          color={u.color}
          onOld={!menu.item.rowId ? (d) => addOld(menu.item, d) : undefined}
          onSkip={!isDone(menu.item, tur) && !skip.has(menu.item.key) ? () => setSkip(menu.item, true) : undefined}
          onPrereq={u.deps?.[menu.item.key]?.need?.length ? () => { const k = menu.item.key; setMenu(null); setPrereq(k) } : undefined}
          onClose={() => setMenu(null)}
          onMark={(d, remove) => mark(menu.item, d, remove)}
          onAdd={!menu.item.rowId ? () => addToArchive(menu.item) : undefined}
          onOpen={() => {
            const it = menu.item
            setMenu(null)
            open(it)
          }}
        />
      )}
      {detail && (
        <RowDetailModal
          board={board}
          row={detail.row}
          editable={detail.episodes}
          onClose={() => {
            setDetail(null)
            onChanged()
          }}
        />
      )}
      {preview && <TmdbPreviewModal boardId={boardId} card={preview} onClose={() => setPreview(null)} onAdded={onChanged} />}
      {prereq !== false && <PrereqModal u={u} tur={tur} initial={prereq ?? undefined} onClose={() => setPrereq(false)} onStart={startSubset} />}
      {bulkOpen && <BulkAddModal items={missingTitles(ordered)} color={u.color} onClose={() => setBulkOpen(false)} onAdd={addAllMissing} />}
    </div>
  )
}

// Kapak + altında bilgiler ve düğmeler (kullanıcı "butonlar kapakların üzerinde olmasın, altında olsun, kapakları
// kapatıyo" dedi). Kapakta sadece sıra numarası, izlendi işareti ve "yan" etiketi kalır.
function Card({
  it,
  n,
  color,
  tur,
  isNext,
  busy,
  onOpen,
  onMovie,
  onMenu,
  onAdd,
  skipped,
  onUnskip,
}: {
  it: EvrenItem
  n: number
  color: string
  tur?: string
  isNext: boolean
  busy: boolean
  skipped: boolean
  onUnskip: () => void
  onOpen: () => void
  onMovie: (el: HTMLElement) => void
  onMenu: (el: HTMLElement) => void
  onAdd: () => void
}) {
  const done = isDone(it, tur)
  const last = it.watches[it.watches.length - 1]
  const lastInTour = tur ? [...it.watches].reverse().find((w) => w !== '?' && endOf(w) >= tur) : last
  const before = tur && it.watched && !done
  const epPart = tur && it.type === 'tv' && it.tour?.total && !done ? it.tour : null
  const btn = 'flex-1 min-w-0 truncate rounded-md text-[11px] font-semibold px-1.5 py-1.5 transition disabled:opacity-60'
  const idle = 'border border-neutral-700 text-neutral-200 hover:border-neutral-400 hover:text-neutral-50'
  const doneStyle = { background: `${color}26`, color: '#f5f5f5', border: `1px solid ${color}80` }
  const arrow = 'shrink-0 rounded-md border border-neutral-700 text-neutral-300 hover:border-neutral-400 hover:text-neutral-50 text-[11px] px-2 transition'
  return (
    <div className="min-w-0 flex flex-col">
      <div
        className={`relative aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 group ${isNext ? 'ring-2 ring-offset-2 ring-offset-neutral-950' : ''} ${!it.rowId ? 'outline outline-1 outline-dashed outline-neutral-700' : ''}`}
        style={isNext ? { ['--tw-ring-color' as string]: color } : undefined}
      >
        <button onClick={onOpen} className="block h-full w-full" title={it.archiveTitle || it.title}>
          {it.poster ? (
            <img src={it.poster} alt={it.title} loading="lazy" className={`h-full w-full object-cover group-hover:scale-105 transition ${!it.released || (skipped && !done) ? 'opacity-30 grayscale' : !it.rowId ? 'opacity-60' : ''}`} />
          ) : (
            <span className="flex h-full items-center justify-center p-2 text-center text-xs text-neutral-400">{it.title}</span>
          )}
        </button>
        <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-black/75 text-neutral-100 rounded px-1.5 py-0.5 pointer-events-none">{n}</span>
        {done && (
          <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-bold pointer-events-none shadow" style={accentBtn(color)}>
            ✓
          </span>
        )}
        {it.extra && !done && <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold bg-black/75 text-neutral-300 rounded px-1 py-0.5 pointer-events-none">{tt('yan')}</span>}
        {isNext && <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold rounded px-1.5 py-0.5 pointer-events-none" style={accentBtn(color)}>{tt('Sıradaki')}</span>}
      </div>
      {epPart && (
        <div className="mt-1 h-1 rounded-full bg-neutral-800 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${((epPart.seen ?? 0) / (epPart.total ?? 1)) * 100}%`, background: color }} />
        </div>
      )}
      <p className="text-xs text-neutral-200 mt-1.5 line-clamp-2 leading-tight">{it.archiveTitle || it.title}</p>
      <p className="text-[11px] text-neutral-500">
        {kindLabel(it)} · {it.released ? it.date.slice(0, 4) : it.date ? fmtRelease(it.date) : tt('tarih yok')}
      </p>
      {!it.rowId && <p className="text-[11px] text-neutral-500">{tt('arşivinde yok')}</p>}
      {!tur && it.progress && <p className="text-[11px] text-amber-400">{tt('{0}/{1} bölüm', it.progress.seen, it.progress.total)}</p>}
      {before && last && <p className="text-[11px] text-neutral-500">{tt('Önceden: {0}', fmtWatch(last))}</p>}
      {it.watches.length > 1 && done && <p className="text-[11px] text-neutral-500">{tt('{0} kez izledin', it.watches.length)}</p>}
      {!it.watched && it.status && !it.progress && it.rowId && !epPart && <p className="text-[11px] text-neutral-500">{it.status}</p>}
      <div className="mt-auto pt-2 flex gap-1">
        {skipped && !done ? (
          <button onClick={onUnskip} className="flex-1 rounded-md border border-dashed border-neutral-700 text-[11px] text-neutral-400 hover:text-neutral-100 py-1.5" title={tt('Atlamayı geri al')}>
            {tt('Atlandı · geri al')}
          </button>
        ) : !it.released && it.rowId ? (
          <span className="flex-1 text-center rounded-md border border-dashed border-neutral-800 text-[11px] text-neutral-500 py-1.5">{tt('Yakında')}</span>
        ) : it.type === 'movie' && it.released ? (
          <>
            <button disabled={busy} onClick={(e) => onMovie(e.currentTarget)} className={`${btn} ${done ? '' : idle}`} style={done ? doneStyle : undefined} title={done ? tt('İzleme tarihleri, tekrar izledim') : tt('Bugün izledim olarak işaretle')}>
              {busy ? '…' : done ? `✓ ${lastInTour ? fmtWatch(lastInTour) : tt('İzledin')}` : tt('✓ İzledim')}
            </button>
            {!done && (
              <button onClick={(e) => onMenu(e.currentTarget)} className={arrow} title={tt('Başka bir tarih seç')}>
                ▾
              </button>
            )}
          </>
        ) : !it.rowId ? (
          <>
            <button disabled={busy} onClick={onAdd} className={`${btn} ${idle}`} title={tt('İzlenecek olarak arşivine ekle')}>
              {busy ? '…' : tt('+ Arşive ekle')}
            </button>
            <button onClick={(e) => onMenu(e.currentTarget)} className={arrow} title={tt('Eskiden izlediysen')}>
              ▾
            </button>
          </>
        ) : (
          <>
            <button onClick={onOpen} className={`${btn} ${done ? '' : idle}`} style={done ? doneStyle : undefined} title={tt('Bölümleri tek tek işaretle')}>
              {done ? `✓ ${lastInTour ? fmtWatch(lastInTour) : tt('İzledin')}` : epPart ? tt('{0}/{1} bölüm', epPart.seen ?? 0, epPart.total ?? 0) : tt('Bölümler')}
            </button>
            {!done && (
              <button onClick={(e) => onMenu(e.currentTarget)} className={arrow} title={tt('Atla, bunu izlemeden önce')}>
                ▾
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Film için izleme tarihi seçimi: bugün / dün / bir gün / sadece yıl / hatırlamıyorum, ve önceki tarihleri kaldırma
function MarkMenu({
  item,
  anchor,
  tur,
  color,
  onClose,
  onMark,
  onAdd,
  onOld,
  onSkip,
  onPrereq,
  onOpen,
}: {
  item: EvrenItem
  anchor: HTMLElement
  tur?: string
  color: string
  onOld?: (date: string) => void
  onSkip?: () => void
  onPrereq?: () => void
  onClose: () => void
  onMark: (date: string, remove?: boolean) => void
  onAdd?: () => void
  onOpen: () => void
}) {
  const ref = useRef<HTMLElement | null>(anchor)
  const [day, setDay] = useState('')
  const [year, setYear] = useState('')
  const today = todayIso()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
  const again = item.watched
  // Eskiden izledim: arşivde yoksa onOld (dizide de çalışır), filmde arşivdeyse normal işaretleme
  const old = (d: string) => (onOld ? onOld(d) : onMark(d))
  const opt = 'w-full text-left px-3 py-1.5 rounded-lg text-sm text-neutral-200 hover:bg-neutral-800 transition'
  return (
    <AnchoredMenu anchorRef={ref} width={260} onClose={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-1.5 space-y-0.5 max-h-[80vh] overflow-y-auto">
        <p className="px-3 pt-1 pb-1.5 text-xs text-neutral-500 truncate">{item.archiveTitle || item.title}</p>
        {item.watches.length > 0 && (
          <div className="px-3 pb-2 mb-1 border-b border-neutral-800">
            <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">{tt('İzlediğin tarihler')}</p>
            {item.watches.map((w, i) => (
              <div key={i} className="flex items-center justify-between text-sm text-neutral-200">
                <span>
                  {fmtWatch(w)}
                  {tur && w !== '?' && endOf(w) >= tur && <span className="text-[10px] ml-1.5" style={{ color }}>{tt('bu tur')}</span>}
                </span>
                {!w.includes('/') && (
                  <button onClick={() => onMark(w, true)} className="text-xs text-neutral-500 hover:text-rose-400 px-1" title={tt('Bu izlemeyi kaldır')}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {item.type === 'movie' && (
          <>
            <p className="px-3 pt-1 text-[11px] uppercase tracking-wider text-neutral-500">{again ? tt('Tekrar izledim') : tt('İzledim')}</p>
            <button className={opt} onClick={() => onMark(today)}>{tt('Bugün')}</button>
            <button className={opt} onClick={() => onMark(yesterday)}>{tt('Dün')}</button>
            <div className="flex gap-1.5 px-3 py-1">
              <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className="min-w-0 flex-1 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-sm text-neutral-100 [color-scheme:dark]" />
              <button disabled={!day} onClick={() => onMark(day)} className="rounded-md bg-neutral-800 hover:bg-neutral-700 px-2 text-sm text-neutral-100 disabled:opacity-40">{tt('Ekle')}</button>
            </div>
          </>
        )}
        {(item.type === 'movie' || onOld) && (
          <>
            <p className="px-3 pt-2 text-[11px] uppercase tracking-wider text-neutral-500">{tt('Eskiden izledim')}</p>
            <p className="px-3 text-[11px] text-neutral-500">{tt('İzlendi olarak eklenir, takvimde bugüne düşmez, tura sayılmaz.')}</p>
            <div className="flex gap-1.5 px-3 py-1">
              <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder={tt('Yılı (ör. 2019)')} inputMode="numeric" className="min-w-0 flex-1 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-sm text-neutral-100" />
              <button disabled={!/^(19|20)\d\d$/.test(year)} onClick={() => old(year)} className="rounded-md bg-neutral-800 hover:bg-neutral-700 px-2 text-sm text-neutral-100 disabled:opacity-40">{tt('Ekle')}</button>
            </div>
            <button className={opt} onClick={() => old('?')}>{tt('Ne zaman izlediğimi hatırlamıyorum')}</button>
          </>
        )}
        <div className="border-t border-neutral-800 mt-1 pt-1">
          {onSkip && <button className={opt} onClick={onSkip}>{tt('Atla (izlemeden geç)')}</button>}
          {onPrereq && <button className={opt} onClick={onPrereq}>{tt('Bunu izlemeden önce neler var?')}</button>}
          {onAdd && <button className={opt} onClick={onAdd}>{item.type === 'movie' ? tt('İzlemedim, İzlenecek olarak ekle') : tt('İzlenecek olarak ekle')}</button>}
          <button className={opt} onClick={onOpen}>{tt('Detayı aç')}</button>
        </div>
      </div>
    </AnchoredMenu>
  )
}

// ---- Bunu izlemeden önce ---------------------------------------------------------------------------
// Kullanıcının asıl derdi: "VisionQuest'i anlamak için şunları, onları anlamak için de şunları izlemen gerek".
// Bir yapım seçilir; evrenin bağımlılıklarından (deps.need) zincir halinde gerekenler çıkarılır ve katman katman
// gösterilir: doğrudan gerekenler, onları anlamak için gerekenler, daha geriye gidenler. Ayrıca "izlersen iyi olur"
// (deps.good). İzlediklerin işaretli gelir; istersen bu listeyle (kısa ya da tam) bir tur başlatılır.

function prereqLayers(u: Evren, target: string) {
  const depth = new Map<string, number>()
  let frontier = [target]
  let level = 0
  while (frontier.length) {
    level++
    const next: string[] = []
    for (const k of frontier) {
      for (const n of u.deps[k]?.need ?? []) {
        if (n === target || depth.has(n)) continue
        depth.set(n, level)
        next.push(n)
      }
    }
    frontier = next
  }
  const need = new Set(depth.keys())
  const good = (u.deps[target]?.good ?? []).filter((k) => !need.has(k) && k !== target)
  return { depth, good }
}

function PrereqModal({
  u,
  tur,
  initial,
  onClose,
  onStart,
}: {
  u: Evren
  tur?: string
  initial?: string
  onClose: () => void
  onStart: (keys: string[], target: string) => void
}) {
  useEscape(true, onClose)
  const [target, setTarget] = useState<string | null>(initial ?? null)
  const [q, setQ] = useState('')
  const [rewatch, setRewatch] = useState(false)
  const [withGood, setWithGood] = useState(false)
  const byKey = new Map(u.items.map((i) => [i.key, i]))
  const pos = new Map(u.story.map((k, i) => [k, i]))
  const storySort = (a: string, b: string) => (pos.get(a) ?? 9999) - (pos.get(b) ?? 9999)
  const targets = orderItems(u, 'hikaye', true).filter((i) => (u.deps[i.key]?.need ?? []).length > 0)
  const shown = q.trim() ? targets.filter((i) => (i.archiveTitle || i.title).toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))) : targets

  const layers = target ? prereqLayers(u, target) : null
  const groups = layers
    ? [1, 2, 3].map((lv) => ({
        lv,
        keys: [...layers.depth.entries()].filter(([, d]) => (lv === 3 ? d >= 3 : d === lv)).map(([k]) => k).sort(storySort),
      }))
    : []
  const allNeed = layers ? [...layers.depth.keys()] : []
  const unwatched = (keys: string[]) => keys.filter((k) => !byKey.get(k)?.watched)
  const minutes = (keys: string[]) => keys.reduce((t, k) => t + (byKey.get(k)?.minutes ?? 0), 0)
  const pick = (keys: string[]) => (rewatch ? keys : unwatched(keys))
  const shortKeys = target ? [...pick(groups[0]?.keys ?? []), ...(withGood ? pick(layers?.good ?? []) : []), target] : []
  const fullKeys = target ? [...pick(allNeed), ...(withGood ? pick(layers?.good ?? []) : []), target] : []
  const t = target ? byKey.get(target) : null
  const levelName = (lv: number) => (lv === 1 ? tt('Doğrudan gerekli') : lv === 2 ? tt('Onları anlamak için') : tt('Daha geriye gidersen'))

  const Row = ({ k }: { k: string }) => {
    const it = byKey.get(k)
    if (!it) return null
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-10 w-7 shrink-0 rounded overflow-hidden bg-neutral-800">{it.poster && <img src={it.poster} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm truncate ${it.watched ? 'text-neutral-400' : 'text-neutral-100'}`}>{it.archiveTitle || it.title}</p>
          <p className="text-[11px] text-neutral-500">
            {kindLabel(it)} · {it.date.slice(0, 4)}
          </p>
        </div>
        {it.watched ? (
          <span className="text-[11px] shrink-0 rounded-full px-2 py-0.5" style={{ background: `${u.color}26`, color: '#e5e5e5' }}>
            {tt('✓ izledin')} {it.watches.length ? `· ${fmtWatch(it.watches[it.watches.length - 1])}` : ''}
          </span>
        ) : (
          <span className="text-[11px] text-neutral-500 shrink-0">{it.minutes ? hoursText(it.minutes) : ''}</span>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-start sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-3xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col rounded-none sm:rounded-3xl border border-neutral-800 bg-neutral-950" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 pb-3 border-b border-neutral-800">
          <div className="min-w-0">
            <p className="text-xs font-black tracking-widest" style={{ color: u.color }}>{u.short || u.name}</p>
            <h2 className="text-xl font-bold text-neutral-50 truncate">{t ? tt('{0} izlemeden önce', t.archiveTitle || t.title) : tt('Bunu izlemeden önce')}</h2>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-100 text-xl px-2">✕</button>
        </div>

        {!t ? (
          <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
            <p className="text-sm text-neutral-400">{tt('Neyi izlemek istiyorsun? Seç, onu anlamak için önce neleri izlemen gerektiğini katman katman çıkarayım.')}</p>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('Ara…')} className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500" />
            <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-4 sm:grid-cols-6 gap-3 content-start">
              {shown.map((i) => (
                <button key={i.key} onClick={() => setTarget(i.key)} className="text-left group">
                  <div className="aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 group-hover:ring-2" style={{ ['--tw-ring-color' as string]: u.color }}>
                    {i.poster && <img src={i.poster} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  </div>
                  <p className="text-[11px] text-neutral-200 mt-1 line-clamp-2 leading-tight">{i.archiveTitle || i.title}</p>
                  <p className="text-[10px] text-neutral-500">{kindLabel(i)}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
              <button onClick={() => setTarget(null)} className="text-xs text-neutral-500 hover:text-neutral-200">{tt('← Başka bir yapım seç')}</button>
              {!allNeed.length && <p className="text-sm text-neutral-400">{tt('Bunun için önceden izlenmesi gereken bir şey yok, doğrudan başlayabilirsin.')}</p>}
              {groups.filter((g) => g.keys.length).map((g) => (
                <section key={g.lv}>
                  <div className="flex items-baseline gap-2">
                    <h3 className="font-bold text-neutral-50">{levelName(g.lv)}</h3>
                    <span className="text-xs text-neutral-500">{tt('{0} yapım, {1} tanesini izlemedin', g.keys.length, unwatched(g.keys).length)}</span>
                  </div>
                  {g.lv === 2 && <p className="text-xs text-neutral-500">{tt('Yukarıdakilerin arka planı; hatırlıyorsan geçebilirsin.')}</p>}
                  <div className="mt-1 divide-y divide-neutral-900">
                    {g.keys.map((k) => (
                      <Row key={k} k={k} />
                    ))}
                  </div>
                </section>
              ))}
              {(layers?.good ?? []).length > 0 && (
                <section>
                  <h3 className="font-bold text-neutral-50">{tt('İzlersen iyi olur')}</h3>
                  <p className="text-xs text-neutral-500">{tt('Şart değil ama bağlantılar daha iyi oturur.')}</p>
                  <div className="mt-1 divide-y divide-neutral-900">
                    {[...(layers?.good ?? [])].sort(storySort).map((k) => (
                      <Row key={k} k={k} />
                    ))}
                  </div>
                </section>
              )}
            </div>
            <div className="p-4 border-t border-neutral-800 space-y-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-300">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={rewatch} onChange={(e) => setRewatch(e.target.checked)} />
                  {tt('İzlediklerimi de tekrar izleyeceğim')}
                </label>
                {(layers?.good ?? []).length > 0 && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={withGood} onChange={(e) => setWithGood(e.target.checked)} />
                    {tt('"İyi olur"ları da ekle')}
                  </label>
                )}
              </div>
              {tur && <p className="text-xs text-amber-400">{tt('Şu an süren tur bu listeyle değişir (başlangıç tarihi aynı kalır).')}</p>}
              <div className="flex flex-wrap gap-2 justify-end">
                {groups[1]?.keys.length || groups[2]?.keys.length ? (
                  <button onClick={() => onStart(shortKeys, target!)} className="text-sm rounded-xl px-4 py-2 border border-neutral-700 text-neutral-200 hover:border-neutral-500">
                    {tt('Kısa tur: {0} yapım · {1}', shortKeys.length, hoursText(minutes(shortKeys)))}
                  </button>
                ) : null}
                <button onClick={() => onStart(fullKeys, target!)} className={`${ACCENT_BTN} rounded-xl px-4 py-2 text-sm`} style={accentBtn(u.color)}>
                  {tt('Bu listeyle tur başlat: {0} yapım · {1}', fullKeys.length, hoursText(minutes(fullKeys)))}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---- Arşivinde olmayanları toplu ekle ------------------------------------------------------------
// Kullanıcı "aralarında daha önce izleyip arşive yazmayı unuttuklarım var" dedi: her yapım için İzlenecek ya da
// "Eskiden izledim" (yıl ya da hatırlamıyorum) seçilir, sonra hepsi birden eklenir.

function BulkAddModal({ items, color, onClose, onAdd }: { items: EvrenItem[]; color: string; onClose: () => void; onAdd: (list: { item: EvrenItem; old: string | null }[]) => void }) {
  useEscape(true, onClose)
  // key → null (İzlenecek) | "2019" | "?" | "" (eskiden izledim, yıl henüz yazılmadı → "?" sayılır)
  const [choice, setChoice] = useState<Record<string, string | null>>({})
  const oldCount = items.filter((i) => choice[i.key] != null).length
  const setAll = (v: string | null) => setChoice(Object.fromEntries(items.map((i) => [i.key, v])))
  const seg = (on: boolean) => `px-2.5 py-1 rounded-md text-xs transition ${on ? 'text-neutral-50' : 'text-neutral-400 hover:text-neutral-100'}`
  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-start sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-full sm:max-h-[90vh] flex flex-col rounded-none sm:rounded-3xl border border-neutral-800 bg-neutral-950" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 pb-3 space-y-2 border-b border-neutral-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-neutral-50">{tt('Arşivinde olmayanları ekle')}</h2>
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-100 text-xl px-2">✕</button>
          </div>
          <p className="text-sm text-neutral-400">{tt('Daha önce izleyip arşivine yazmadıkların varsa "Eskiden izledim" de. Onlar İzlendi olarak eklenir, takvimde bugüne düşmez ve tura sayılmaz. Gerisi İzlenecek olur.')}</p>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setAll(null)} className="rounded-lg border border-neutral-800 px-2.5 py-1 text-neutral-300 hover:text-neutral-50">{tt('Hepsi İzlenecek')}</button>
            <button onClick={() => setAll('')} className="rounded-lg border border-neutral-800 px-2.5 py-1 text-neutral-300 hover:text-neutral-50">{tt('Hepsini eskiden izledim')}</button>
          </div>
        </div>
        <ol className="flex-1 overflow-y-auto p-3 space-y-1">
          {items.map((it) => {
            const v = choice[it.key] ?? null
            const isOld = v != null
            return (
              <li key={it.key} className="flex flex-wrap items-center gap-2 rounded-xl bg-neutral-900/70 border border-neutral-800 px-2 py-1.5">
                <div className="h-11 w-8 shrink-0 rounded overflow-hidden bg-neutral-800">{it.poster && <img src={it.poster} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-100 truncate">{it.title}</p>
                  <p className="text-[11px] text-neutral-500">
                    {it.type === 'tv' ? tt('Dizi') : tt('Film')} · {it.date ? it.date.slice(0, 4) : tt('tarih yok')}
                  </p>
                </div>
                <div className="flex rounded-lg bg-neutral-950 border border-neutral-800 p-0.5">
                  <button onClick={() => setChoice((c) => ({ ...c, [it.key]: null }))} className={seg(!isOld)} style={!isOld ? { background: '#262626' } : undefined}>
                    {tt('İzlenecek')}
                  </button>
                  <button disabled={!it.released} onClick={() => setChoice((c) => ({ ...c, [it.key]: '' }))} className={`${seg(isOld)} disabled:opacity-30`} style={isOld ? { background: `${color}33` } : undefined}>
                    {tt('Eskiden izledim')}
                  </button>
                </div>
                {isOld && (
                  <input
                    value={v}
                    onChange={(e) => setChoice((c) => ({ ...c, [it.key]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    placeholder={tt('Yıl (bilmiyorsan boş)')}
                    inputMode="numeric"
                    className="w-36 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-xs text-neutral-100"
                  />
                )}
              </li>
            )
          })}
        </ol>
        <div className="p-4 border-t border-neutral-800 flex items-center gap-2">
          <p className="text-xs text-neutral-500 flex-1">{tt('{0} İzlenecek · {1} eskiden izledim', items.length - oldCount, oldCount)}</p>
          <button onClick={onClose} className="text-sm rounded-xl px-4 py-2 text-neutral-300 hover:bg-neutral-800">{tt('Vazgeç')}</button>
          <button
            onClick={() => onAdd(items.map((item) => {
              const v = choice[item.key]
              return { item, old: v == null ? null : /^(19|20)\d\d$/.test(v) ? v : '?' }
            }))}
            className={`${ACCENT_BTN} rounded-xl px-4 py-2 text-sm`}
            style={accentBtn(color)}
          >
            {tt('{0} yapımı ekle', items.length)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Kendi evrenini oluştur / düzenle ------------------------------------------------------------

type SearchCard = Awaited<ReturnType<typeof api.searchEvren>>['items'][number]

// Kullanıcı "kendi evrenime içerik ekleme kısmı evren adı ve renginin olduğu yerden bağımsız olsun" dedi: iki ayrı
// pencere. part="settings": ad, renk, silme (yeni evren / kopya da buradan). part="content": yapım ara ve ekle, sırala.
function UniverseEditor({
  id,
  part,
  initial,
  boardId,
  isNew,
  onClose,
  onSaved,
}: {
  id: string
  part: 'settings' | 'content'
  initial: EvrenSave
  boardId: string
  isNew: boolean
  onClose: () => void
  onSaved: (saved: EvrenSave | null) => void
}) {
  const { notify, confirm } = useToast()
  useEscape(true, onClose)
  const [name, setName] = useState(initial.name)
  const [color, setColor] = useState(initial.color)
  // items, story'deki sırayla tutulur (görülen sıra = "Benim sıram")
  const [items, setItems] = useState<EvrenSaveItem[]>(() => {
    const pos = new Map(initial.story.map((k, i) => [k, i]))
    return [...initial.items].sort((a, b) => (pos.get(a.key) ?? 9999) - (pos.get(b.key) ?? 9999))
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return notify(tt('Evrene bir ad ver.'), 'danger')
    setSaving(true)
    const data: EvrenSave = { ...initial, name: name.trim(), color, items, story: items.map((i) => i.key) }
    try {
      await api.saveEvrenler({ custom: { [id]: data } })
      onSaved(data)
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Kaydedilemedi.'), 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    const ok = await confirm({ message: tt('"{0}" evrenini silmek istiyor musun? Arşivindeki kayıtlara dokunulmaz.', name || tt('Bu evren')), confirmLabel: tt('Sil'), tone: 'danger' })
    if (!ok) return
    await api.saveEvrenler({ custom: { [id]: null }, prefs: { [id]: null } }).catch(() => {})
    onSaved(null)
  }

  const footer = (
    <div className="flex items-center gap-2 p-4 border-t border-neutral-800">
      {part === 'settings' && !isNew && (
        <button onClick={remove} className="text-sm rounded-xl px-3 py-2 text-rose-400 hover:bg-rose-500/10">
          {tt('Evreni sil')}
        </button>
      )}
      <span className="flex-1" />
      <button onClick={onClose} className="text-sm rounded-xl px-4 py-2 text-neutral-300 hover:bg-neutral-800">{tt('Vazgeç')}</button>
      <button disabled={saving} onClick={save} className={`${ACCENT_BTN} rounded-xl px-4 py-2 text-sm`} style={accentBtn(color)}>
        {saving ? tt('Kaydediliyor...') : isNew ? tt('Oluştur') : tt('Kaydet')}
      </button>
    </div>
  )

  if (part === 'settings') {
    return (
      <div className="fixed inset-0 z-[70] bg-black/70 flex items-start sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
        <div className="w-full max-w-md rounded-none sm:rounded-3xl border border-neutral-800 bg-neutral-950" onClick={(e) => e.stopPropagation()}>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-neutral-50">{isNew ? tt('Yeni evren') : tt('Evren ayarları')}</h2>
              <button onClick={onClose} className="text-neutral-500 hover:text-neutral-100 text-xl px-2">✕</button>
            </div>
            <div className="rounded-2xl border border-neutral-800 p-4" style={{ background: `linear-gradient(135deg, ${color}55, #0a0a0a 75%)` }}>
              <p className="text-xl font-black text-neutral-50 truncate">{name.trim() || tt('Evrenin adı')}</p>
              <p className="text-xs text-neutral-400">{tt('{0} yapım', items.length)}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-neutral-500">{tt('Ad')}</p>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder={tt('Evrenin adı (ör. Korku Seansı Evreni)')} className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-neutral-500">{tt('Renk')}</p>
              <div className="flex flex-wrap gap-2">
                {SWATCHES.map((c) => (
                  <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full border-2 transition ${color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />
                ))}
              </div>
            </div>
            {isNew && !items.length && <p className="text-xs text-neutral-500">{tt('Oluşturduktan sonra evrenin sayfasında "+ Yapım ekle / sırala" ile film ve dizi eklersin.')}</p>}
          </div>
          {footer}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-start sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-6xl h-full sm:h-[88vh] flex flex-col rounded-none sm:rounded-3xl border border-neutral-800 bg-neutral-950" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 pb-3">
          <div>
            <p className="text-xs font-black tracking-widest" style={{ color }}>{name}</p>
            <h2 className="text-xl font-bold text-neutral-50">{tt('Yapımlar')}</h2>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-100 text-xl px-2">✕</button>
        </div>
        <div className="flex-1 min-h-0 grid md:grid-cols-[1fr_340px] gap-0 border-t border-neutral-800">
          <ContentSearch boardId={boardId} color={color} items={items} onAdd={(it) => setItems((l) => (l.some((x) => x.key === it.key) ? l : [...l, it]))} onRemove={(key) => setItems((l) => l.filter((x) => x.key !== key))} />
          <OrderList items={items} setItems={setItems} color={color} />
        </div>
        {footer}
      </div>
    </div>
  )
}

// Sol taraf: ara, sonuçlar kapak ızgarası (düğmeler kapağın altında), dizide sezon seçimi
function ContentSearch({ boardId, color, items, onAdd, onRemove }: { boardId: string; color: string; items: EvrenSaveItem[]; onAdd: (it: EvrenSaveItem) => void; onRemove: (key: string) => void }) {
  const { notify } = useToast()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchCard[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [seasonsFor, setSeasonsFor] = useState<{ card: SearchCard; seasons: { season: number; date: string; episodes: number; poster: string | null }[]; runtime: number | null } | null>(null)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) return
    const t = setTimeout(() => {
      setSearching(true)
      api
        .searchEvren(boardId, query)
        .then((r) => {
          setResults(r.items)
          if (r.needsApiKey) notify(tt('Arama için Ayarlar → Veritabanı → API sekmesinden bir TMDB anahtarı girmelisin.'), 'danger')
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(t)
  }, [q, boardId, notify])

  const keyOf = (card: SearchCard, season?: number) => `${card.mediaType[0]}${card.tmdbId}${season ? 's' + season : ''}`
  const has = (key: string) => items.some((i) => i.key === key)

  function make(card: SearchCard, season?: { season: number; date: string; poster: string | null; episodes: number }, runtime?: number | null): EvrenSaveItem {
    const it: EvrenSaveItem = { key: keyOf(card, season?.season), type: card.mediaType, tmdbId: card.tmdbId, title: card.title || card.originalTitle, en: card.originalTitle, date: season?.date || card.date || '' }
    if (season) it.season = season.season
    const poster = season?.poster ? `https://image.tmdb.org/t/p/w342${season.poster}` : card.poster
    if (poster) it.poster = poster
    if (season && runtime) it.minutes = runtime * season.episodes
    return it
  }

  function toggle(card: SearchCard) {
    const key = keyOf(card)
    if (has(key)) onRemove(key)
    else onAdd(make(card))
  }

  async function pickSeasons(card: SearchCard) {
    if (seasonsFor?.card.tmdbId === card.tmdbId) return setSeasonsFor(null)
    const r = await api.getEvrenSeasons(card.tmdbId).catch(() => null)
    if (!r?.seasons.length) return onAdd(make(card))
    setSeasonsFor({ card, ...r })
  }

  const chip = (on: boolean) => `w-full text-[11px] rounded-md py-1 transition ${on ? 'font-semibold' : 'border border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-neutral-50'}`

  return (
    <div className="min-h-0 flex flex-col p-4 gap-3 overflow-hidden">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('Film ya da dizi ara…')} className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-neutral-500" />
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {q.trim().length < 2 && <p className="text-sm text-neutral-500 py-10 text-center">{tt('Eklemek istediğin film ya da diziyi ara. Dizilerde istersen tek tek sezon seçebilirsin.')}</p>}
        {searching && <p className="text-xs text-neutral-500">{tt('Aranıyor...')}</p>}
        {results && q.trim().length >= 2 && !searching && !results.length && <p className="text-sm text-neutral-500">{tt('Bir şey bulunamadı.')}</p>}
        {results && q.trim().length >= 2 && !searching && (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-x-3 gap-y-4">
            {results.map((c) => {
              const added = has(keyOf(c))
              const seasonCount = items.filter((i) => i.tmdbId === c.tmdbId && i.type === 'tv' && i.season).length
              return (
                <div key={c.mediaType + c.tmdbId} className="min-w-0">
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800" style={added || seasonCount ? { boxShadow: `0 0 0 2px ${color}` } : undefined}>
                    {c.poster ? <img src={c.poster} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center p-2 text-center text-xs text-neutral-400">{c.title}</span>}
                  </div>
                  <p className="text-xs text-neutral-200 mt-1.5 line-clamp-2 leading-tight">{c.title}</p>
                  <p className="text-[11px] text-neutral-500">
                    {c.mediaType === 'tv' ? tt('Dizi') : tt('Film')} · {c.year || '—'}
                    {c.inArchive ? ' · ' + tt('arşivinde') : ''}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    <button onClick={() => toggle(c)} className={chip(added)} style={added ? accentBtn(color) : undefined}>
                      {added ? tt('✓ Eklendi') : c.mediaType === 'tv' ? tt('+ Bütün dizi') : tt('+ Ekle')}
                    </button>
                    {c.mediaType === 'tv' && (
                      <button onClick={() => pickSeasons(c)} className={chip(false)}>
                        {seasonCount ? tt('{0} sezon seçili', seasonCount) : tt('Sezon seç')}
                      </button>
                    )}
                  </div>
                  {seasonsFor?.card.tmdbId === c.tmdbId && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {seasonsFor.seasons.map((s) => {
                        const k = keyOf(c, s.season)
                        const on = has(k)
                        return (
                          <button
                            key={s.season}
                            onClick={() => (on ? onRemove(k) : onAdd(make(c, s, seasonsFor.runtime)))}
                            className={`text-[11px] rounded-md px-2 py-0.5 transition ${on ? 'font-semibold' : 'border border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}
                            style={on ? accentBtn(color) : undefined}
                            title={s.date ? s.date.slice(0, 4) : ''}
                          >
                            {tt('S{0}', s.season)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Sağ taraf: evrendeki yapımlar, sırası (oklar), çıkar, çıkış tarihine göre sırala
function OrderList({ items, setItems, color }: { items: EvrenSaveItem[]; setItems: React.Dispatch<React.SetStateAction<EvrenSaveItem[]>>; color: string }) {
  function move(i: number, d: number) {
    setItems((list) => {
      const j = i + d
      if (j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  return (
    <div className="min-h-0 flex flex-col border-t md:border-t-0 md:border-l border-neutral-800 bg-neutral-900/30">
      <div className="flex items-center justify-between gap-2 p-4 pb-2">
        <p className="text-sm font-semibold text-neutral-200">{tt('Sıra ({0} yapım)', items.length)}</p>
        {items.length > 1 && (
          <button onClick={() => setItems((list) => [...list].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')))} className="text-xs rounded-lg border border-neutral-700 text-neutral-300 hover:text-neutral-50 hover:border-neutral-500 px-2.5 py-1">
            {tt('Çıkış tarihine göre sırala')}
          </button>
        )}
      </div>
      <ol className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-1">
        {!items.length && <p className="text-sm text-neutral-500 px-1 py-6">{tt('Henüz yapım yok. Soldan arayıp ekle; sırasını burada oklarla değiştirirsin.')}</p>}
        {items.map((it, i) => (
          <li key={it.key} className="flex items-center gap-2 rounded-xl bg-neutral-900 border border-neutral-800 px-2 py-1.5">
            <span className="w-5 text-right text-xs font-bold" style={{ color }}>{i + 1}</span>
            <div className="h-10 w-7 shrink-0 rounded overflow-hidden bg-neutral-800">{it.poster && <img src={it.poster} alt="" className="h-full w-full object-cover" />}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-100 truncate">{it.title}</p>
              <p className="text-[11px] text-neutral-500">
                {it.season ? tt('{0}. Sezon', it.season) : it.type === 'tv' ? tt('Dizi') : tt('Film')} · {it.date ? it.date.slice(0, 4) : tt('tarih yok')}
              </p>
            </div>
            <button onClick={() => move(i, -1)} disabled={i === 0} className="h-7 w-6 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30" title={tt('Yukarı')}>↑</button>
            <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="h-7 w-6 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30" title={tt('Aşağı')}>↓</button>
            <button onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} className="h-7 w-6 rounded-md text-neutral-500 hover:bg-rose-500/10 hover:text-rose-400" title={tt('Çıkar')}>✕</button>
          </li>
        ))}
      </ol>
    </div>
  )
}
