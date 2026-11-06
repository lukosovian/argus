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
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import { fmtDate, tt, ttx } from '../lib/i18n'

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
  const [editing, setEditing] = useState<{ id: string; initial: EvrenSave } | null>(null)

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
  if (!data || !board) return <p className="text-center text-neutral-500 py-20">{tt('Yükleniyor...')}</p>

  const current = id ? data.universes.find((u) => u.id === id) : null

  function newUniverse() {
    setEditing({ id: 'k' + Math.random().toString(36).slice(2, 9), initial: { name: '', color: SWATCHES[6], items: [], story: [] } })
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
          onEdit={() => setEditing({ id: current.id, initial: toSave(current) })}
          onCopy={() => {
            const nid = 'k' + Math.random().toString(36).slice(2, 9)
            setEditing({ id: nid, initial: { ...toSave(current), name: tt('{0} (benim sıram)', current.name), from: current.id } })
          }}
        />
      ) : (
        <UniverseList universes={data.universes} prefs={data.prefs} onNew={newUniverse} />
      )}
      {id && !current && <p className="text-center text-neutral-500 py-20">{tt('Bu evren bulunamadı.')}</p>}
      {editing && (
        <UniverseEditor
          id={editing.id}
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

function stats(u: Evren, prefs: EvrenPrefs) {
  const items = u.items.filter((i) => (prefs.ek || !i.extra) && i.released)
  const done = items.filter((i) => isDone(i, prefs.maraton)).length
  const left = Math.round(items.reduce((t, i) => t + (i.minutes ?? 0) * (1 - doneShare(i, prefs.maraton)), 0))
  return {
    total: items.length,
    done,
    left,
    before: items.filter((i) => i.watched).length,
    missing: missingTitles(u.items.filter((i) => prefs.ek || !i.extra)).length,
    upcoming: u.items.filter((i) => (prefs.ek || !i.extra) && !i.released).length,
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
  onEdit: () => void
  onCopy: () => void
}) {
  const { notify, confirm } = useToast()
  const tur = prefs.maraton
  const mode: Mode = prefs.sira ?? 'cikis'
  const showExtra = Boolean(prefs.ek)
  const extraCount = u.items.filter((i) => i.extra).length
  const ordered = useMemo(() => orderItems(u, mode, showExtra), [u, mode, showExtra])
  const s = stats(u, prefs)
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0
  const next = ordered.find((i) => i.released && !isDone(i, tur))
  const [busy, setBusy] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ item: EvrenItem; el: HTMLElement } | null>(null)
  const [detail, setDetail] = useState<{ row: Row; episodes: boolean } | null>(null)
  // Arşive yeni eklenen dizinin kaydı satırlar yenilenince açılır
  const [openAfterAdd, setOpenAfterAdd] = useState<string | null>(null)
  const [preview, setPreview] = useState<TmdbCard | null>(null)
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)
  const [startDay, setStartDay] = useState('')
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
    if (episodes) setTimeout(() => document.getElementById('rd-bolumler')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450)
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

  function startTour(day: string) {
    setTourMenu(false)
    onPrefs({ maraton: day })
    notify(tt('Tur başladı. {0} tarihinden sonra izlediklerin sayılıyor; önceki izlemelerin tarihleriyle görünmeye devam eder.', fmtWatch(day)))
  }
  async function endTour() {
    const ok = await confirm({ message: tt('Turu bitirmek istiyor musun? İzlediklerin arşivinde kalır, sadece sayaç kapanır.'), confirmLabel: tt('Bitir') })
    if (ok) onPrefs({ maraton: null as unknown as string })
  }

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
          {tur && <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: u.color }}>{tt('İzleme turu · {0} tarihinden beri', fmtWatch(tur))}</p>}
          <div className="h-2.5 rounded-full bg-neutral-800 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: u.color }} />
          </div>
          <p className="text-sm text-neutral-200">
            {tur ? ttx('{0} yapımın {1} tanesini izledin', s.total, <b className="text-neutral-50">{s.done}</b>) : ttx('{0}/{1} izledin', <b className="text-neutral-50">{s.done}</b>, s.total)}
            <span className="text-neutral-500"> · %{pct}</span>
            {s.left > 0 && <span className="text-neutral-400"> · {tt('kalan {0}', hoursText(s.left))}</span>}
          </p>
          {s.upcoming > 0 && <p className="text-xs text-neutral-500">{tt('{0} yapım henüz çıkmadı, çıkınca listeye katılır.', s.upcoming)}</p>}
          <div className="pt-2">
            {tur ? (
              <button onClick={endTour} className="text-sm rounded-xl px-3 py-1.5 border border-neutral-700 text-neutral-300 hover:text-neutral-50 hover:border-neutral-500 transition">
                {tt('Turu bitir')}
              </button>
            ) : (
              <button ref={tourBtn} onClick={() => setTourMenu(true)} className={`${ACCENT_BTN} text-sm rounded-xl px-4 py-2`} style={accentBtn(u.color)}>
                {tt('Baştan izleme turu başlat')}
              </button>
            )}
          </div>
        </div>
        {tourMenu && (
          <AnchoredMenu anchorRef={tourBtn} width={300} onClose={() => setTourMenu(false)}>
            <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-3 space-y-2.5">
              <p className="text-sm text-neutral-300">{tt('Sayaç sıfırdan başlar: o günden sonra izlediklerin sayılır. Daha önce izlediklerin tarihleriyle görünmeye devam eder.')}</p>
              <button onClick={() => startTour(todayIso())} className={`${ACCENT_BTN} w-full rounded-lg px-3 py-2 text-sm`} style={accentBtn(u.color)}>
                {tt('Bugün başlat')}
              </button>
              <p className="text-xs text-neutral-500">{tt('Çoktan başladıysan başladığın gün:')}</p>
              <div className="flex gap-1.5">
                <input type="date" value={startDay} max={todayIso()} onChange={(e) => setStartDay(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-100 [color-scheme:dark]" />
                <button disabled={!startDay} onClick={() => startTour(startDay)} className="rounded-lg bg-neutral-800 hover:bg-neutral-700 px-3 text-sm text-neutral-100 disabled:opacity-40">
                  {tt('Başlat')}
                </button>
              </div>
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
        {extraCount > 0 && (
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
          <button onClick={onEdit} className="text-sm rounded-xl px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:text-neutral-50 hover:border-neutral-600 transition">
            {tt('Düzenle')}
          </button>
        )}
      </div>

      {!ordered.length && (
        <div className="text-center py-14 text-neutral-500">
          <p>{tt('Bu evrende henüz yapım yok.')}</p>
          {!u.builtin && (
            <button onClick={onEdit} className={`${ACCENT_BTN} rounded-xl px-4 py-2 text-sm mt-3`} style={accentBtn(u.color)}>
              {tt('+ Yapım ekle')}
            </button>
          )}
        </div>
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
      {bulkOpen && <BulkAddModal items={missingTitles(ordered)} color={u.color} onClose={() => setBulkOpen(false)} onAdd={addAllMissing} />}
    </div>
  )
}

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
}: {
  it: EvrenItem
  n: number
  color: string
  tur?: string
  isNext: boolean
  busy: boolean
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
  const btn = 'flex-1 min-w-0 truncate rounded-md text-[11px] font-semibold px-1.5 py-1 transition'
  const idle = 'bg-black/75 text-neutral-100 hover:bg-neutral-100 hover:text-neutral-950'
  return (
    <div className="min-w-0">
      <div className={`relative aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 group ${isNext ? 'ring-2 ring-offset-2 ring-offset-neutral-950' : ''} ${!it.rowId ? 'outline outline-1 outline-dashed outline-neutral-700' : ''}`} style={isNext ? { ['--tw-ring-color' as string]: color } : undefined}>
        <button onClick={onOpen} className="block h-full w-full" title={it.archiveTitle || it.title}>
          {it.poster ? (
            <img src={it.poster} alt={it.title} loading="lazy" className={`h-full w-full object-cover group-hover:scale-105 transition ${!it.released ? 'opacity-40' : !it.rowId ? 'opacity-60' : done ? '' : 'opacity-90'}`} />
          ) : (
            <span className="flex h-full items-center justify-center p-2 text-center text-xs text-neutral-400">{it.title}</span>
          )}
        </button>
        <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-black/75 text-neutral-100 rounded px-1.5 py-0.5 pointer-events-none">{n}</span>
        {it.extra && <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold bg-black/75 text-neutral-300 rounded px-1 py-0.5 pointer-events-none">{tt('yan')}</span>}
        {isNext && <span className="absolute bottom-10 left-1.5 text-[10px] font-bold text-neutral-950 rounded px-1.5 py-0.5 pointer-events-none" style={{ background: color }}>{tt('Sıradaki')}</span>}
        {epPart && (
          <div className="absolute bottom-9 left-1.5 right-1.5 h-1 rounded-full bg-black/60 overflow-hidden pointer-events-none">
            <div className="h-full" style={{ width: `${((epPart.seen ?? 0) / (epPart.total ?? 1)) * 100}%`, background: color }} />
          </div>
        )}
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex gap-1">
          {!it.released && it.rowId ? (
            <span className="flex-1 text-center rounded-md bg-black/75 text-[10px] text-neutral-300 py-1 pointer-events-none">{tt('Yakında')}</span>
          ) : it.type === 'movie' && it.released ? (
            <>
              <button disabled={busy} onClick={(e) => onMovie(e.currentTarget)} className={`${btn} ${done ? 'bg-emerald-500 text-white' : idle}`} title={done ? tt('İzleme tarihleri, tekrar izledim') : tt('Bugün izledim olarak işaretle')}>
                {busy ? '…' : done ? `✓ ${lastInTour ? fmtWatch(lastInTour) : tt('İzledin')}` : tt('✓ İzledim')}
              </button>
              {!done && (
                <button onClick={(e) => onMenu(e.currentTarget)} className="shrink-0 rounded-md bg-black/75 text-neutral-200 hover:bg-neutral-100 hover:text-neutral-950 text-[11px] px-1.5 transition" title={tt('Başka bir tarih seç')}>
                  ▾
                </button>
              )}
            </>
          ) : !it.rowId ? (
            <>
              <button disabled={busy} onClick={onAdd} className={`${btn} ${idle}`} title={tt('İzlenecek olarak arşivine ekle')}>
                {busy ? '…' : tt('+ Arşive ekle')}
              </button>
              <button onClick={(e) => onMenu(e.currentTarget)} className="shrink-0 rounded-md bg-black/75 text-neutral-200 hover:bg-neutral-100 hover:text-neutral-950 text-[11px] px-1.5 transition" title={tt('Eskiden izlediysen')}>
                ▾
              </button>
            </>
          ) : (
            <button onClick={onOpen} className={`${btn} ${done ? 'bg-emerald-500 text-white' : idle}`} title={tt('Bölümleri tek tek işaretle')}>
              {done ? `✓ ${lastInTour ? fmtWatch(lastInTour) : tt('İzledin')}` : epPart ? tt('{0}/{1} bölüm', epPart.seen ?? 0, epPart.total ?? 0) : tt('Bölümler')}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-neutral-200 mt-1.5 line-clamp-2 leading-tight">{it.archiveTitle || it.title}</p>
      <p className="text-[11px] text-neutral-500">
        {kindLabel(it)} · {it.released ? it.date.slice(0, 4) : it.date ? fmtRelease(it.date) : tt('tarih yok')}
      </p>
      {!it.rowId && <p className="text-[11px] text-neutral-500">{tt('arşivinde yok')}</p>}
      {!tur && it.progress && <p className="text-[11px] text-amber-400">{tt('{0}/{1} bölüm', it.progress.seen, it.progress.total)}</p>}
      {before && last && <p className="text-[11px] text-neutral-500">{tt('Önceden: {0}', fmtWatch(last))}</p>}
      {it.watches.length > 1 && done && <p className="text-[11px] text-neutral-500">{tt('{0} kez izledin', it.watches.length)}</p>}
      {!it.watched && it.status && !it.progress && it.rowId && !epPart && <p className="text-[11px] text-neutral-500">{it.status}</p>}
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
  onOpen,
}: {
  item: EvrenItem
  anchor: HTMLElement
  tur?: string
  color: string
  onOld?: (date: string) => void
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
          {onAdd && <button className={opt} onClick={onAdd}>{item.type === 'movie' ? tt('İzlemedim, İzlenecek olarak ekle') : tt('İzlenecek olarak ekle')}</button>}
          <button className={opt} onClick={onOpen}>{tt('Detayı aç')}</button>
        </div>
      </div>
    </AnchoredMenu>
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

function UniverseEditor({ id, initial, boardId, isNew, onClose, onSaved }: { id: string; initial: EvrenSave; boardId: string; isNew: boolean; onClose: () => void; onSaved: (saved: EvrenSave | null) => void }) {
  const { notify, confirm } = useToast()
  useEscape(true, onClose)
  const [name, setName] = useState(initial.name)
  const [color, setColor] = useState(initial.color)
  // items, story'deki sırayla tutulur (düzenleyicide görülen sıra = "Benim sıram")
  const [items, setItems] = useState<EvrenSaveItem[]>(() => {
    const pos = new Map(initial.story.map((k, i) => [k, i]))
    return [...initial.items].sort((a, b) => (pos.get(a.key) ?? 9999) - (pos.get(b.key) ?? 9999))
  })
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchCard[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [seasonsFor, setSeasonsFor] = useState<{ card: SearchCard; seasons: { season: number; date: string; episodes: number; poster: string | null }[]; runtime: number | null } | null>(null)
  const [saving, setSaving] = useState(false)

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

  const has = (tmdbId: number, type: string, season?: number) => items.some((i) => i.tmdbId === tmdbId && i.type === type && (i.season ?? 0) === (season ?? 0))

  function add(card: SearchCard, season?: { season: number; date: string; poster: string | null; episodes: number }, runtime?: number | null) {
    if (has(card.tmdbId, card.mediaType, season?.season)) return
    const it: EvrenSaveItem = {
      key: `${card.mediaType[0]}${card.tmdbId}${season ? 's' + season.season : ''}`,
      type: card.mediaType,
      tmdbId: card.tmdbId,
      title: card.title || card.originalTitle,
      en: card.originalTitle,
      date: season?.date || card.date || '',
    }
    if (season) it.season = season.season
    const poster = season?.poster ? `https://image.tmdb.org/t/p/w342${season.poster}` : card.poster
    if (poster) it.poster = poster
    if (season && runtime) it.minutes = runtime * season.episodes
    setItems((list) => [...list, it])
  }

  async function pickSeasons(card: SearchCard) {
    const r = await api.getEvrenSeasons(card.tmdbId).catch(() => null)
    if (!r?.seasons.length) return add(card)
    setSeasonsFor({ card, ...r })
  }

  function move(i: number, d: number) {
    setItems((list) => {
      const j = i + d
      if (j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function sortByDate() {
    setItems((list) => [...list].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')))
  }

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

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-start sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-full sm:max-h-[90vh] overflow-y-auto rounded-none sm:rounded-3xl border border-neutral-800 bg-neutral-950 p-5 sm:p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-neutral-50">{isNew ? tt('Yeni evren') : tt('Evreni düzenle')}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-100 text-xl px-2">✕</button>
        </div>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tt('Evrenin adı (ör. Korku Seansı Evreni)')} className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 text-neutral-100 outline-none focus:border-[#00c0fa]" />
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((c) => (
              <button key={c} onClick={() => setColor(c)} className={`h-7 w-7 rounded-full border-2 transition ${color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('Film ya da dizi ara ve ekle…')} className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]" />
          {searching && <p className="text-xs text-neutral-500">{tt('Aranıyor...')}</p>}
          {results && q.trim().length >= 2 && !searching && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {!results.length && <p className="text-sm text-neutral-500">{tt('Bir şey bulunamadı.')}</p>}
              {results.map((c) => {
                const added = has(c.tmdbId, c.mediaType)
                return (
                  <div key={c.mediaType + c.tmdbId} className="w-24 shrink-0">
                    <div className="aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800">{c.poster && <img src={c.poster} alt="" className="h-full w-full object-cover" />}</div>
                    <p className="text-[11px] text-neutral-200 mt-1 line-clamp-2 leading-tight">{c.title}</p>
                    <p className="text-[10px] text-neutral-500">{c.mediaType === 'tv' ? tt('Dizi') : tt('Film')} · {c.year}{c.inArchive ? ' · ' + tt('arşivinde') : ''}</p>
                    <button disabled={added} onClick={() => add(c)} className="mt-1 w-full text-[11px] rounded-md border border-neutral-700 text-neutral-300 hover:border-[#00c0fa] hover:text-[#7fdcff] py-1 disabled:opacity-40">
                      {added ? tt('✓ Eklendi') : c.mediaType === 'tv' ? tt('+ Bütün dizi') : tt('+ Ekle')}
                    </button>
                    {c.mediaType === 'tv' && (
                      <button onClick={() => pickSeasons(c)} className="mt-1 w-full text-[11px] rounded-md border border-neutral-800 text-neutral-400 hover:text-neutral-100 py-1">
                        {tt('Sezon seç')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {seasonsFor && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-neutral-200">{tt('{0} — hangi sezonlar?', seasonsFor.card.title)}</p>
                <button onClick={() => setSeasonsFor(null)} className="text-neutral-500 hover:text-neutral-100 text-sm">✕</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {seasonsFor.seasons.map((s) => {
                  const added = has(seasonsFor.card.tmdbId, 'tv', s.season)
                  return (
                    <button key={s.season} disabled={added} onClick={() => add(seasonsFor.card, s, seasonsFor.runtime)} className="text-xs rounded-lg border border-neutral-700 text-neutral-200 hover:border-[#00c0fa] px-2.5 py-1.5 disabled:opacity-40">
                      {tt('{0}. Sezon', s.season)} {s.date ? `· ${s.date.slice(0, 4)}` : ''} {added ? '✓' : '+'}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-200">{tt('Sıra ({0} yapım)', items.length)}</p>
            {items.length > 1 && (
              <button onClick={sortByDate} className="text-xs rounded-lg border border-neutral-800 text-neutral-300 hover:text-neutral-50 hover:border-neutral-600 px-2.5 py-1">
                {tt('Çıkış tarihine göre sırala')}
              </button>
            )}
          </div>
          {!items.length && <p className="text-sm text-neutral-500">{tt('Yukarıdan arayıp yapım ekle. Okları kullanarak sırasını değiştirebilirsin.')}</p>}
          <ol className="space-y-1">
            {items.map((it, i) => (
              <li key={it.key} className="flex items-center gap-2 rounded-xl bg-neutral-900/70 border border-neutral-800 px-2 py-1.5">
                <span className="w-6 text-right text-xs text-neutral-500">{i + 1}</span>
                <div className="h-10 w-7 shrink-0 rounded overflow-hidden bg-neutral-800">{it.poster && <img src={it.poster} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-100 truncate">{it.title}</p>
                  <p className="text-[11px] text-neutral-500">
                    {it.season ? tt('{0}. Sezon', it.season) : it.type === 'tv' ? tt('Dizi') : tt('Film')} · {it.date ? it.date.slice(0, 4) : tt('tarih yok')}
                  </p>
                </div>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="h-7 w-7 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30" title={tt('Yukarı')}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="h-7 w-7 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30" title={tt('Aşağı')}>↓</button>
                <button onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} className="h-7 w-7 rounded-md text-neutral-500 hover:bg-rose-500/10 hover:text-rose-400" title={tt('Çıkar')}>✕</button>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
          {!isNew && (
            <button onClick={remove} className="text-sm rounded-xl px-3 py-2 text-rose-400 hover:bg-rose-500/10">
              {tt('Evreni sil')}
            </button>
          )}
          <span className="flex-1" />
          <button onClick={onClose} className="text-sm rounded-xl px-4 py-2 text-neutral-300 hover:bg-neutral-800">{tt('Vazgeç')}</button>
          <button disabled={saving} onClick={save} className={`${PRIMARY_BUTTON} rounded-xl px-4 py-2 text-sm`} style={primaryButtonStyle}>
            {saving ? tt('Kaydediliyor...') : tt('Kaydet')}
          </button>
        </div>
      </div>
    </div>
  )
}
