import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchFold } from '../lib/search'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useRows } from '../hooks/useRows'
import { useProfiles } from '../hooks/useProfiles'
import { useToast } from '../hooks/useToast'
import { api, type KoleksiyonInfo, type KoleksiyonPatch } from '../lib/api'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { titleText, type Row } from '../types'
import RowDetailModal from '../components/RowDetailModal'
import SymbolEditor from '../components/SymbolEditor'
import BackgroundProgress from '../components/BackgroundProgress'
import ShelfPicker from '../components/ShelfPicker'
import KoleksiyonImage, { type ImageItem, type ImageShelf } from '../components/KoleksiyonImage'
import { autoShelf } from '../lib/shelves'
import { DEFAULT_SHELF_SYMBOLS, SHELF_PREFS_STORE, arrangeShelves, buildKoleksiyonItems, buildShelves, moveShelf, shelfSetMembers, type KoleksiyonItem, type ShelfPrefs } from '../lib/koleksiyonRaflar'
import { useStore } from '../lib/useProfileStore'
import { useOdulData } from '../lib/oduller'
import { useSetBonuses } from '../lib/odulSetler'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import { averageColor } from '../lib/imageColor'
import { tt, ttx } from '../lib/i18n'
import Icon from '../components/Icon'
import PosterWallHero from '../components/PosterWallHero'
import EmptyState from '../components/EmptyState'
import { useSearchParams } from 'react-router-dom'
import Biletlerim from './Biletlerim'
import Oduller from './Oduller'
import { useExtras } from '../lib/extras'
import { PersonaCard } from '../components/flashback/FbSections'
import { FbMark } from '../components/flashback/FbLogo'
import type { FbCard } from '../lib/api'

// Koleksiyon — kullanıcı "izlediklerimden sembolleri (Star Trek'teki göğüs deltaları gibi) bir yerde
// sergileyeyim" dedi. İzlediğin, izlemekte olduğun ya da yarım bıraktığın her yapım kendiliğinden gelir (sembolü yoksa
// logosuyla); aynı seriden olanlar bir rafta toplanır (filmler TMDB serisiyle, diğerleri adının ":"
// öncesiyle). Bir yapıma ya da rafa kendi sembolünü koyabilir, rafların adını ve bir yapımın rafını
// değiştirebilirsin (koleksiyon.json). Bazı raflara ARGUS'la gelen hazır semboller kendiliğinden konur.
// Kullanıcı sonra "kendim raf ekleyebilmeliyim, serinin içine kendim film ekleyebilmeliyim" dedi: "+ Yeni raf"
// ile boş bir raf açılır (koleksiyon.json'da manual), her rafın sonundaki "+ Yapım ekle" ile yapımlar seçilir.
// Elle açılan raf "ek" raftır: kullanıcı "eklediğim raftaki içerik kendi rafında da dursun, oraya ekleyince
// oradan kalkmasın" dedi — içindekiler (shelves[].rows) kendi serilerinin rafında / tek başına olanlarda da
// görünür. Kendiliğinden oluşan serilerde "Yapım ekle" ise taşır (bir film tek bir seriye ait).
// "Görsel oluştur" koleksiyonun PNG görselini çizer (bkz. KoleksiyonImage).

type Item = KoleksiyonItem

type Editing = { kind: 'item'; item: Item } | { kind: 'shelf'; key: string; name: string; symbol: string | null; fallback: string | null }

const SPOT = 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.09), transparent 70%), #0a0a0a'
// R1 (Arayüz Önerileri 3): raf tahtasının kalınlığı ve afişlerin altında yansımaya kalan yer
const PLANK_H = 14
const SHELF_GAP = 46
const BOOK_STYLE: React.CSSProperties = {
  boxShadow: '0 -4px 22px rgba(0,0,0,0.4), 6px 0 14px rgba(0,0,0,0.5)',
  WebkitBoxReflect: `below ${PLANK_H}px linear-gradient(transparent 70%, rgba(255,255,255,0.16))`,
}

function Raflar() {
  const { settings } = useHomeSettings()
  const { activeProfileId } = useProfiles()
  const { notify } = useToast()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const [info, setInfo] = useState<KoleksiyonInfo | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [detail, setDetail] = useState<Row | null>(null)
  const [kind, setKind] = useState<'hepsi' | 'film' | 'dizi'>('hepsi')
  // Ana sayfadaki Seri vitrininden "Seriyi aç" ile gelince (?raf=<anahtar>) o rafa kaydır ve kısa süre vurgula
  const [rafSp] = useSearchParams()
  const rafParam = rafSp.get('raf')
  const [flashRaf, setFlashRaf] = useState<string | null>(null)
  const [onlySymbols, setOnlySymbols] = useState(false)
  const [q, setQ] = useState('')
  // "+ Yapım ekle" penceresi, "+ Yeni raf" adı, koleksiyon görseli (açılınca o anki raflar donduruluyor)
  const [picking, setPicking] = useState<{ key: string; name: string } | null>(null)
  const [newShelf, setNewShelf] = useState<string | null>(null)
  const newShelfRef = useRef<HTMLDivElement>(null)
  useDialogFocus(newShelfRef, newShelf !== null)
  const [image, setImage] = useState<{ shelves: ImageShelf[]; loose: ImageItem[]; stats: string; filtered: boolean } | null>(null)
  // Sunucuya ulaşılamazsa sonsuza kadar "Yükleniyor" demesin (ör. ARGUS güncellendi ama sunucusu eski)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!board) return
    api
      .getKoleksiyon(board.id)
      .then((d) => {
        setInfo(d)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : tt('Sunucuya ulaşılamadı.')))
  }, [board])

  useEffect(() => {
    if (activeProfileId) load()
  }, [load, activeProfileId])

  // Seri bilgileri arka planda öğreniliyorsa bitene kadar arada bir yenile
  useEffect(() => {
    if (!info?.pending) return
    const t = setTimeout(load, 4000)
    return () => clearTimeout(t)
  }, [info, load])

  const items = useMemo<Item[]>(() => (board && info ? buildKoleksiyonItems(board, rows, info) : []), [board, rows, info])
  // H3: başlığın arkasında son izlediklerinin afişleri
  const heroPosters = useMemo(() => [...items].sort((a, b) => b.lastWatched.localeCompare(a.lastWatched)).map((it) => it.poster).filter(Boolean).slice(0, 14), [items])

  // Raflar: en az 2 yapımı olanlar, elle oluşturulanlar ya da adı / sembolü değiştirilenler (bkz. lib/koleksiyonRaflar)
  const { shelves, loose } = useMemo(() => buildShelves(items, info), [items, info])
  // O4 (v1.27): rafların sırası, sabitlenenler ve gizlenenler profil deposunda. Gizlenen rafın yapımları "Tek başına
  // olanlar"a düşer. Seri seti / ödül hesapları gizlenenleri de sayar (shelves değişmiyor).
  const { data: shelfPrefs, update: updateShelfPrefs } = useStore<ShelfPrefs>(SHELF_PREFS_STORE)
  const [showHidden, setShowHidden] = useState(false)
  const arranged = useMemo(() => arrangeShelves(shelves, shelfPrefs), [shelves, shelfPrefs])
  const looseAll = useMemo(() => {
    if (!arranged.hidden.length) return loose
    const onVisible = new Set(arranged.shown.filter((s) => !s.manual).flatMap((s) => s.items.map((it) => it.row.id)))
    const add = arranged.hidden.filter((s) => !s.manual).flatMap((s) => s.items).filter((it) => !onVisible.has(it.row.id))
    return [...loose, ...add].sort((a, b) => b.lastWatched.localeCompare(a.lastWatched))
  }, [loose, arranged])
  async function setShelfPrefs(fn: (p: ShelfPrefs) => ShelfPrefs, msg?: string, undo?: (p: ShelfPrefs) => ShelfPrefs) {
    try {
      await updateShelfPrefs(fn)
      if (msg) notify(msg, 'success', undo ? { action: { label: tt('Geri al'), onClick: () => setShelfPrefs(undo) } } : undefined)
    } catch {
      notify(tt('Kaydedilemedi.'), 'danger')
    }
  }

  // Seri seti (v1.25): Ödüller açıksa, bir rafın bütün film kartları toplanınca bir kerelik paket ve "Set tamam" rozeti
  const rewardsOn = useExtras().on('rewards')
  const odul = useOdulData(rewardsOn)
  const doneSets = useSetBonuses(info ? shelves : null, odul, rewardsOn)

  // Her rafta henüz izlemediğin (İzlenecek'teki) yapımlar: sembolün çevresindeki halka "kaçını izledin"i gösterir
  // (v1.23.3, öneri K1). Raf anahtarı koleksiyondakilerle aynı yolla bulunuyor.
  // R1: rafta gri afiş olarak da duruyorlar
  const laterByShelf = useMemo(() => {
    const out = new Map<string, { row: Row; title: string; poster: string }[]>()
    if (!board || !info) return out
    const durum = resolveRole(board, 'durum')
    const later = resolveStatusOption(board, 'izlenecek')
    if (!durum || !later) return out
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    const orig = resolveRole(board, 'orjinalAdi')
    const kategori = resolveRole(board, 'kategori')
    const posterProp = resolveRole(board, 'poster')
    for (const r of rows) {
      if (r.values[durum.id] !== later) continue
      const title = tp ? titleText(tp, r.values[tp.id]) : ''
      const original = (orig && typeof r.values[orig.id] === 'string' ? (r.values[orig.id] as string) : '') || title
      if (!original) continue
      const col = info.laterCollections?.[r.id]
      const isSeries = info.mediaTypes[r.id] ? info.mediaTypes[r.id] === 'tv' : /dizi/i.test(kategori?.options?.find((o) => o.id === r.values[kategori.id])?.label ?? '')
      const k = autoShelf(col?.name ?? original, isSeries, Boolean(col)).key
      const poster = posterProp && typeof r.values[posterProp.id] === 'string' ? (r.values[posterProp.id] as string) : ''
      if (k) out.set(k, [...(out.get(k) ?? []), { row: r, title, poster }])
    }
    return out
  }, [board, rows, info])

  // Rafın ışığı sembolün renginden (Star Trek altın, Harry Potter gümüş…)
  const [tints, setTints] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    for (const s of shelves)
      if (s.symbol && !tints[s.symbol])
        averageColor(s.symbol).then((c) => {
          if (alive && c) setTints((t) => ({ ...t, [s.symbol as string]: `${c[0]},${c[1]},${c[2]}` }))
        })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelves])

  const match = (it: Item) =>
    (kind === 'hepsi' || (kind === 'dizi') === it.isSeries) &&
    (!onlySymbols || Boolean(it.symbol)) &&
    (!q.trim() || searchFold(it.title).includes(searchFold(q.trim())))
  const noFilter = kind === 'hepsi' && !onlySymbols && !q.trim()
  const filteredShelves = arranged.shown
    .map((s) => ({ ...s, shown: s.items.filter(match) }))
    .filter((s) => s.shown.length > 0 || (onlySymbols && s.custom && !q.trim()) || (noFilter && s.items.length === 0))
  const filteredLoose = looseAll.filter(match)
  const rafReady = filteredShelves.some((x) => x.key === rafParam)
  useEffect(() => {
    if (!rafParam || !rafReady) return
    const el = document.getElementById(`raf-${rafParam}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashRaf(rafParam)
    const t = setTimeout(() => setFlashRaf(null), 2200)
    return () => clearTimeout(t)
  }, [rafParam, rafReady])
  const symbolCount = items.filter((it) => it.symbol).length

  // "+ Yapım ekle" penceresinde işaretlenenler bu rafa; işareti kaldırılanlar raftan çıkar (kendiliğinden
  // bulunan rafı buysa "rafsız" olur, değilse kendi rafına döner).
  async function saveShelfItems(key: string, selected: Set<string>) {
    const patch: KoleksiyonPatch = { items: {} }
    if (info?.data.shelves[key]?.manual) {
      // Ek raf: sadece listesi değişir; eski usul (v1.12) buraya "taşınmış" kayıtlar kendi raflarına döner
      patch.shelves = { [key]: { rows: [...selected] } }
      for (const [id, v] of Object.entries(info.data.items)) if (v.shelf === key) patch.items![id] = { shelf: null }
      await save(patch)
      notify(tt('Raf güncellendi.'))
      return
    }
    for (const it of items) {
      const was = it.key === key
      const now = selected.has(it.row.id)
      if (was === now) continue
      patch.items![it.row.id] = { shelf: now ? key : it.autoKey === key ? '' : null }
    }
    await save(patch)
    notify(tt('Raf güncellendi.'))
  }

  async function createShelf(name: string) {
    const key = `el-${Date.now().toString(36)}`
    await save({ shelves: { [key]: { name, manual: true } } })
    setNewShelf(null)
    // Açılır açılmaz içine yapım seçilsin
    setPicking({ key, name })
  }

  const pickingManual = Boolean(picking && info?.data.shelves[picking.key]?.manual)

  function openImage() {
    const toImg = (it: Item): ImageItem => ({ title: it.title, year: it.year, isSeries: it.isSeries, symbol: it.symbol, logo: it.logo })
    setImage({
      shelves: filteredShelves.filter((s) => s.shown.length).map((s) => ({ name: s.name, symbol: s.symbol, items: s.shown.map(toImg) })),
      loose: filteredLoose.map(toImg),
      stats: [tt('{0} yapım', items.length), tt('{0} raf', shelves.filter((s) => s.items.length).length), symbolCount ? tt('{0} sembol', symbolCount) : ''].filter(Boolean).join(' · '),
      filtered: !noFilter,
    })
  }

  async function save(patch: KoleksiyonPatch) {
    try {
      const data = await api.saveKoleksiyon(patch)
      setInfo((i) => (i ? { ...i, data } : i))
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Kaydedilemedi.'), 'danger')
      throw e
    }
  }

  if (error && !info)
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-lg font-semibold text-neutral-100">{tt('Koleksiyon açılamadı')}</p>
        <p className="text-sm text-neutral-400 mt-2">{error}</p>
        <p className="text-sm text-neutral-500 mt-3">{tt('ARGUS yeni güncellendiyse sunucusu eski kalmış olabilir: ARGUS\'u kapatıp yeniden açmayı dene.')}</p>
        <button onClick={load} className="mt-5 text-sm rounded-lg px-4 py-2 border border-neutral-700 text-neutral-200 hover:border-[#00c0fa]">
          {tt('Tekrar dene')}
        </button>
      </div>
    )
  if (!board || loading || !info)
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <span className="h-4 w-4 rounded-full border-2 border-[#00c0fa] border-t-transparent animate-spin" />
          {tt('Koleksiyonun hazırlanıyor…')}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 rounded-3xl border border-neutral-800 argus-parilti" />
        ))}
      </div>
    )

  const Exhibit = ({ it, big = false }: { it: Item; big?: boolean }) => (
    <button onClick={() => setEditing({ kind: 'item', item: it })} className={`group text-left shrink-0 ${big ? 'w-36 sm:w-40' : 'w-full'}`} title={tt('{0} — sembolünü değiştirmek için tıkla', it.title)}>
      <div className="relative aspect-square rounded-2xl border border-neutral-800 group-hover:border-neutral-600 flex items-center justify-center p-4 overflow-hidden transition" style={{ background: SPOT }}>
        {it.symbol ? (
          <img src={it.symbol} alt="" loading="lazy" className="max-h-full max-w-full object-contain drop-shadow-[0_0_16px_rgba(255,255,255,0.16)] group-hover:scale-105 transition" />
        ) : it.logo ? (
          <img src={it.logo} alt="" loading="lazy" className="max-h-[70%] max-w-full object-contain opacity-90 group-hover:scale-105 transition" />
        ) : (
          <span className="text-sm font-bold text-neutral-300 text-center leading-tight line-clamp-4">{it.title}</span>
        )}
        <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/70 text-neutral-200 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><Icon name="pencil" className="h-3 w-3" /></span>
      </div>
      <p className="text-xs text-neutral-200 mt-1.5 line-clamp-1">{it.title}</p>
      <p className="text-[11px] text-neutral-500">{[it.year, it.isSeries ? tt('Dizi') : tt('Film')].filter(Boolean).join(' · ')}</p>
    </button>
  )

  // R1: rafta ayakta duran afiş. Afişi yoksa eski sembol/logo kutusu; kendi sembolü varsa köşede küçük rozet.
  const Book = ({ it }: { it: Item }) => (
    <button
      onClick={() => setEditing({ kind: 'item', item: it })}
      className="group/b relative shrink-0 w-24 sm:w-28 text-left origin-bottom transition-transform duration-300 hover:-translate-y-2.5 hover:-rotate-1"
      title={tt('{0} — sembolünü değiştirmek için tıkla', it.title)}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-t-[4px] rounded-b-[2px] bg-neutral-900" style={{ ...BOOK_STYLE, ...(it.poster ? {} : { background: SPOT }) }}>
        {it.poster ? (
          <img src={it.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : it.symbol || it.logo ? (
          <span className="absolute inset-0 flex items-center justify-center p-3">
            <img src={(it.symbol || it.logo) as string} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
          </span>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs font-bold text-neutral-300 line-clamp-4">{it.title}</span>
        )}
        {it.poster && it.symbol && (
          <span className="absolute bottom-1.5 left-1.5 h-8 w-8 rounded-full bg-black/75 p-1 ring-1 ring-white/15 backdrop-blur-sm">
            <img src={it.symbol} alt="" className="h-full w-full object-contain" />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1.5 pt-6 text-[11px] font-semibold leading-tight text-white opacity-0 transition group-hover/b:opacity-100 line-clamp-2">
          {it.title}
          {it.year && <span className="font-normal text-neutral-300"> · {it.year}</span>}
        </span>
        <span className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/70 text-neutral-200 flex items-center justify-center opacity-0 group-hover/b:opacity-100 transition">
          <Icon name="pencil" className="h-3 w-3" />
        </span>
      </div>
    </button>
  )

  const shelfOptions = [
    { value: '__auto', label: tt('Kendiliğinden bulunan raf') },
    { value: '', label: tt('Rafsız') },
    ...shelves.filter((s) => !s.manual).map((s) => ({ value: s.key, label: s.name })),
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <PosterWallHero posters={heroPosters} tint="rgba(0,192,250,0.14)">
        <p className="text-sm font-semibold tracking-widest text-[#7fdcff]">{tt('ARGUS')}</p>
        <h1 className="text-4xl sm:text-5xl font-black text-neutral-50 tracking-tight mt-1">{tt('Koleksiyon')}</h1>
        <p className="text-neutral-300 mt-2 max-w-2xl">
          {tt('İzlediğin, izlemekte olduğun ya da yarım bıraktığın')}{' '}<span className="font-bold text-neutral-50">{items.length}</span>{' '}{tt('yapım,')}{' '}<span className="font-bold text-neutral-50">{shelves.length}</span>{' '}{tt('rafta ve tek başına sergileniyor')}
          {symbolCount ? (
            <>
              ; <span className="font-bold text-neutral-50">{symbolCount}</span>{' '}{tt('tanesinin kendi sembolü var')}
            </>
          ) : null}
          {tt('. Bir yapıma ya da rafın büyük sembolüne tıklayıp sembolünü koyabilirsin.')}
        </p>
      </PosterWallHero>

      {info.pending && (
        <BackgroundProgress
          title={tt('İlk açılış: filmlerinin hangi seriden olduğu TMDB\'den öğreniliyor')}
          done={info.pending.done}
          total={info.pending.total}
          note={tt('Raflar bu sırada kendiliğinden tamamlanıyor, sayfayı kullanmaya devam edebilirsin. Bu sadece ilk seferde (ve yeni eklediğin filmler için) olur.')}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-3 rounded-xl bg-neutral-900 border border-neutral-800 p-1 text-sm">
          {(['hepsi', 'film', 'dizi'] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`px-3 py-1 rounded-lg transition ${kind === k ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:text-neutral-100'}`}>
              {k === 'hepsi' ? tt('Hepsi') : k === 'film' ? tt('Filmler') : tt('Diziler')}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOnlySymbols((v) => !v)}
          className={`text-sm rounded-lg px-3 py-1.5 border transition ${onlySymbols ? 'border-[#00c0fa] text-[#7fdcff] bg-[#00c0fa]/10' : 'border-neutral-800 text-neutral-400 hover:text-neutral-100'}`}
        >
          {tt('Sadece sembolü olanlar')}
        </button>
        <button onClick={() => setNewShelf('')} className="text-sm rounded-lg px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:text-neutral-50 hover:border-neutral-600 transition">
          {tt('+ Yeni raf')}
        </button>
        <button onClick={openImage} className="text-sm rounded-lg px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:text-neutral-50 hover:border-neutral-600 transition">
          {tt('Görsel oluştur')}
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tt('Koleksiyonda ara…')}
          className="ml-auto w-full sm:w-56 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]"
        />
      </div>

      {filteredShelves.map((s) => {
        const tint = s.symbol ? tints[s.symbol] : undefined
        const later = s.manual ? [] : (laterByShelf.get(s.key) ?? [])
        const missing = later.length
        const total = s.items.length + missing
        const ratio = total ? s.items.length / total : 0
        const ringColor = tint ? `rgb(${tint})` : '#00c0fa'
        return (
        <section
          key={s.key}
          id={`raf-${s.key}`}
          className={`relative overflow-hidden rounded-3xl border transition-shadow duration-500 ${flashRaf === s.key ? 'border-[#00c0fa] shadow-[0_0_0_3px_rgba(0,192,250,0.35)]' : 'border-neutral-800'} bg-neutral-900/50 p-4 sm:p-5 flex flex-col sm:flex-row gap-5`}
          style={tint ? { background: `radial-gradient(ellipse at 8% 50%, rgba(${tint},0.13), transparent 55%), color-mix(in srgb, var(--color-neutral-900) 50%, transparent)` } : undefined}
        >
          <button
            onClick={() => setEditing({ kind: 'shelf', key: s.key, name: s.name, symbol: info.data.shelves[s.key]?.image ?? null, fallback: DEFAULT_SHELF_SYMBOLS[s.key] ?? null })}
            className="group shrink-0 w-32 sm:w-48 text-left"
            title={tt('Rafın sembolünü ve adını değiştir')}
          >
            {/* R1: sembol kendi renginde parlar */}
            <div
              className="relative aspect-square rounded-2xl border border-neutral-800 group-hover:border-neutral-600 flex items-center justify-center p-9 sm:p-11 transition"
              style={{
                background: tint ? `radial-gradient(circle at 50% 45%, rgba(${tint},0.22), #0a0a0a 72%)` : SPOT,
                ...(tint ? { borderColor: `rgba(${tint},0.45)`, boxShadow: `0 0 34px rgba(${tint},0.28), inset 0 0 26px rgba(${tint},0.18)` } : {}),
              }}
            >
              {/* İlerleme halkası: bu raftaki serinin kaçını izledin (İzlenecek'tekiler eksik sayılır) */}
              {s.items.length > 0 && (
                <svg className="pointer-events-none absolute inset-2 sm:inset-3 -rotate-90" viewBox="0 0 100 100" aria-hidden>
                  <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="3"
                    strokeLinecap="round"
                    pathLength={100}
                    strokeDasharray={`${Math.max(ratio * 100, 1)} 100`}
                    style={{ filter: `drop-shadow(0 0 5px ${ringColor})` }}
                  />
                </svg>
              )}
              {s.symbol ? (
                <img
                  src={s.symbol}
                  alt=""
                  className="relative max-h-full max-w-full object-contain group-hover:scale-105 transition"
                  style={{ filter: `drop-shadow(0 0 22px ${tint ? `rgba(${tint},0.45)` : 'rgba(255,255,255,0.2)'})` }}
                />
              ) : (
                <span className="text-center">
                  <Icon name="plus" className="mx-auto h-8 w-8 text-neutral-700" />
                  <span className="block text-xs text-neutral-500 mt-1">{tt('Rafa sembol ekle')}</span>
                </span>
              )}
              <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/70 text-neutral-200 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><Icon name="pencil" className="h-3 w-3" /></span>
            </div>
            <p className="text-lg font-bold text-neutral-50 mt-2 leading-tight">{s.name}</p>
            {doneSets.has(s.key) && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300" title={tt('Bu serinin bütün film kartlarını topladın')}>
                <Icon name="sparkle" className="h-3 w-3" /> {tt('Set tamam')}
              </span>
            )}
            {/* A18: Ödüller açıksa set ilerlemesi ("3 / 5 kart") */}
            {rewardsOn && odul?.startedAt && !doneSets.has(s.key) && (() => {
              const mem = shelfSetMembers(s)
              if (!mem.length) return null
              const have = mem.filter((id) => odul.cards[id]).length
              return (
                <span className="mt-1 flex items-center gap-2 text-[11px] text-neutral-400" title={tt('Bu serinin film kartlarından kaçını topladın (hepsini toplayınca paket kazanırsın)')}>
                  <span className="h-1 w-14 overflow-hidden rounded-full bg-neutral-800">
                    <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(have / mem.length) * 100}%` }} />
                  </span>
                  {tt('{0} / {1} kart', have, mem.length)}
                </span>
              )
            })()}
            <p className="text-xs" style={{ color: tint ? `rgb(${tint})` : undefined }}>
              {missing > 0 ? tt('{0} yapımın {1} tanesini izledin', total, s.items.length) : ttx('{0} yapım', s.items.length)}
            </p>
          </button>
          {/* R1: afişler ışıklı ahşap rafın üstünde ayakta; altta hafif yansıma. İzlemediklerin (İzlenecek) gri. */}
          <div className="relative min-w-0 flex-1 self-end">
            <div className="flex items-end gap-3 overflow-x-auto overflow-y-hidden px-1 pt-4" style={{ paddingBottom: SHELF_GAP }}>
              {s.shown.map((it) => (
                <Book key={it.row.id} it={it} />
              ))}
              {noFilter &&
                later.map((l) => (
                  <button
                    key={l.row.id}
                    onClick={() => setDetail(l.row)}
                    className="group/b relative shrink-0 w-24 sm:w-28 origin-bottom transition-transform duration-300 hover:-translate-y-2.5 hover:-rotate-1"
                    title={tt('{0} — henüz izlemedin', l.title)}
                  >
                    <div className="relative aspect-[2/3] overflow-hidden rounded-t-[4px] rounded-b-[2px] bg-neutral-900" style={BOOK_STYLE}>
                      {l.poster ? (
                        <img src={l.poster} alt="" loading="lazy" className="h-full w-full object-cover grayscale brightness-[.35] transition duration-300 group-hover/b:brightness-[.6]" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-[11px] font-semibold text-neutral-600 line-clamp-4">{l.title}</span>
                      )}
                    </div>
                  </button>
                ))}
              <button
                onClick={() => setPicking({ key: s.key, name: s.name })}
                className="group/b shrink-0 w-24 sm:w-28 text-left"
                title={tt('Bu rafa yapım ekle ya da çıkar')}
              >
                <div className="aspect-[2/3] rounded-t-[4px] border-2 border-dashed border-neutral-700/80 group-hover/b:border-[#00c0fa]/60 flex flex-col items-center justify-center text-neutral-500 group-hover/b:text-[#7fdcff] transition">
                  <Icon name="plus" className="h-7 w-7" />
                  <span className="text-xs mt-1.5">{tt('Yapım ekle')}</span>
                </div>
              </button>
            </div>
            {/* rafın üstüne vuran sıcak ışık + ahşap tahta */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 h-12" style={{ bottom: SHELF_GAP, background: `linear-gradient(0deg, ${tint ? `rgba(${tint},0.10)` : 'rgba(255,200,120,0.10)'}, transparent)` }} />
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-2 rounded-[3px]"
              style={{
                bottom: SHELF_GAP - PLANK_H,
                height: PLANK_H,
                background: 'linear-gradient(180deg,#4a3522,#2a1d12 55%,#1d140c)',
                boxShadow: 'inset 0 1px 0 rgba(255,220,170,0.28), 0 10px 26px rgba(0,0,0,0.75)',
              }}
            />
          </div>
        </section>
        )
      })}

      {filteredLoose.length > 0 && (
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-5">
          <p className="text-lg font-bold text-neutral-50">{tt('Tek başına olanlar')}</p>
          <p className="text-xs text-neutral-500 mb-4">{ttx('Son izlediğin önce · {0} yapım', filteredLoose.length)}</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {filteredLoose.map((it) => (
              <Exhibit key={it.row.id} it={it} />
            ))}
          </div>
        </section>
      )}

      {!filteredShelves.length && !filteredLoose.length &&
        (noFilter ? (
          <EmptyState art="afis" icon="layers" title={tt('Koleksiyonun henüz boş')} text={tt('İzlediğin, izlemekte olduğun ya da yarım bıraktığın yapımlar burada kendiliğinden raflara dizilir.')}>
            <button onClick={() => setNewShelf('')} className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-100 hover:border-[#00c0fa] transition">
              <Icon name="plus" className="h-4 w-4" />
              {tt('Yeni raf')}
            </button>
          </EmptyState>
        ) : (
          <EmptyState art="ara" compact title={tt('Bu seçime uyan bir şey yok.')}>
            <button
              onClick={() => {
                setKind('hepsi')
                setOnlySymbols(false)
                setQ('')
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-100 hover:border-[#00c0fa] transition"
            >
              <Icon name="close" className="h-4 w-4" />
              {tt('Süzgeci temizle')}
            </button>
          </EmptyState>
        ))}

      {/* O4: gizlenen raflar — geri getirmek için */}
      {arranged.hidden.length > 0 && (
        <section className="rounded-2xl border border-neutral-800/70 px-4 py-3">
          <button onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden} className="flex w-full items-center gap-2 text-sm text-neutral-400 hover:text-neutral-100">
            <span className={`transition ${showHidden ? 'rotate-90' : ''}`}>›</span>
            {tt('Gizlenen raflar ({0})', arranged.hidden.length)}
          </button>
          {showHidden && (
            <div className="mt-3 flex flex-wrap gap-2">
              {arranged.hidden.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 py-1 pl-3 pr-1 text-sm text-neutral-300">
                  {s.symbol && <img src={s.symbol} alt="" className="h-5 w-5 object-contain" />}
                  {s.name}
                  <span className="text-xs text-neutral-500">{ttx('{0} yapım', s.items.length)}</span>
                  <button
                    onClick={() => void setShelfPrefs((p) => ({ ...p, hidden: (p.hidden ?? []).filter((k) => k !== s.key) }), tt('"{0}" rafı geri geldi.', s.name))}
                    className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-100 hover:bg-neutral-700"
                  >
                    {tt('Geri getir')}
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {editing?.kind === 'item' && (
        <SymbolEditor
          heading={editing.item.title}
          subheading={tt('Koleksiyondaki sembolü')}
          current={editing.item.symbol}
          fallback={editing.item.logo || null}
          shelf={{
            // Eski usul ek rafa "taşınmış" kayıtlarda asıl raf kendiliğinden bulunan
            value: (() => {
              const o = info.data.items[editing.item.row.id]?.shelf
              return o === undefined || info.data.shelves[o]?.manual ? '__auto' : o
            })(),
            options: shelfOptions,
          }}
          onOpenDetail={() => {
            setDetail(editing.item.row)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
          onSave={async ({ image, shelf }) => {
            const id = editing.item.row.id
            const patch: KoleksiyonPatch = { items: { [id]: {} } }
            if (image !== undefined) patch.items![id]!.image = image
            if (shelf !== undefined) {
              if (shelf === '__auto') patch.items![id]!.shelf = null
              else if (shelfOptions.some((o) => o.value === shelf)) patch.items![id]!.shelf = shelf
              else {
                // Yeni raf: elle açılan ek raf olur, yapım kendi rafında da kalır
                const key = `el-${Date.now().toString(36)}`
                patch.shelves = { [key]: { name: shelf, manual: true, rows: [id] } }
              }
            }
            await save(patch)
            notify(tt('Koleksiyon güncellendi.'))
          }}
        />
      )}
      {editing?.kind === 'shelf' && (
        <SymbolEditor
          heading={tt('{0} rafı', editing.name)}
          subheading={tt('Rafın büyük sembolü ve adı')}
          current={editing.symbol}
          fallback={editing.fallback}
          name={{ value: info.data.shelves[editing.key]?.name ?? '', placeholder: shelves.find((s) => s.key === editing.key)?.autoName ?? editing.name }}
          onClose={() => setEditing(null)}
          onDelete={
            info.data.shelves[editing.key]?.manual
              ? {
                  label: tt('Rafı kaldır'),
                  run: async () => {
                    const key = editing.key
                    const patch: KoleksiyonPatch = { shelves: { [key]: null }, items: {} }
                    for (const [id, v] of Object.entries(info.data.items)) if (v.shelf === key) patch.items![id] = { shelf: null }
                    await save(patch)
                    notify(tt('Raf kaldırıldı; içindekiler kendi raflarına döndü.'))
                  },
                }
              : undefined
          }
          extra={(() => {
            // O4: rafın sayfadaki yeri — sabitle, bir basamak taşı, (kendiliğinden oluşan rafı) gizle
            const key = editing.key
            const pins = shelfPrefs?.pinned ?? []
            const pinned = pins.includes(key)
            const group = arranged.shown.filter((s) => pins.includes(s.key) === pinned)
            const gi = group.findIndex((s) => s.key === key)
            const isManual = Boolean(info.data.shelves[key]?.manual)
            const b = 'text-sm rounded-lg px-3 py-1.5 border border-neutral-700 text-neutral-200 hover:border-neutral-500 hover:text-white transition disabled:opacity-40 disabled:pointer-events-none'
            return (
              <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <p className="text-xs text-neutral-400 mb-2">{tt('Rafın yeri')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={b}
                    onClick={() =>
                      void setShelfPrefs(
                        (p) => ({ ...p, pinned: pinned ? (p.pinned ?? []).filter((k) => k !== key) : [key, ...(p.pinned ?? []).filter((k) => k !== key)] }),
                        pinned ? tt('Sabitleme kaldırıldı.') : tt('Raf en üste sabitlendi.'),
                      )
                    }
                  >
                    <Icon name="pin" className="h-3.5 w-3.5 inline -mt-0.5 mr-1" />
                    {pinned ? tt('Sabitlemeyi kaldır') : tt('En üste sabitle')}
                  </button>
                  <button className={b} disabled={gi <= 0} onClick={() => void setShelfPrefs((p) => moveShelf(arranged.shown, p, key, -1))}>
                    ↑ {tt('Yukarı taşı')}
                  </button>
                  <button className={b} disabled={gi < 0 || gi >= group.length - 1} onClick={() => void setShelfPrefs((p) => moveShelf(arranged.shown, p, key, 1))}>
                    ↓ {tt('Aşağı taşı')}
                  </button>
                  {!isManual && (
                    <button
                      className={`${b} ml-auto`}
                      onClick={() => {
                        const name = editing.name
                        setEditing(null)
                        void setShelfPrefs(
                          (p) => ({ ...p, hidden: [...new Set([...(p.hidden ?? []), key])] }),
                          tt('"{0}" rafı gizlendi; yapımları tek başına olanlarda.', name),
                          (p) => ({ ...p, hidden: (p.hidden ?? []).filter((k) => k !== key) }),
                        )
                      }}
                    >
                      {tt('Bu rafı gizle')}
                    </button>
                  )}
                </div>
              </div>
            )
          })()}
          onSave={async ({ image, name }) => {
            const patch: KoleksiyonPatch = { shelves: { [editing.key]: {} } }
            if (image !== undefined) patch.shelves![editing.key]!.image = image
            if (name !== undefined) patch.shelves![editing.key]!.name = name || null
            await save(patch)
            notify(tt('Raf güncellendi.'))
          }}
        />
      )}
      {picking && (
        <ShelfPicker
          shelfName={picking.name}
          items={items.map((it) => ({
            id: it.row.id,
            title: it.title,
            year: it.year,
            isSeries: it.isSeries,
            thumb: it.symbol || it.logo || it.poster,
            shelfName: shelves.find((s) => s.key === it.key)?.name ?? '',
            inShelf: pickingManual ? it.extra.includes(picking.key) : it.key === picking.key,
          }))}
          additive={pickingManual}
          onSave={(sel) => saveShelfItems(picking.key, sel)}
          onClose={() => setPicking(null)}
        />
      )}
      {newShelf !== null && (
        <div ref={newShelfRef} role="dialog" aria-modal="true" aria-label={tt('Yeni raf')} className="fixed inset-0 z-[70] bg-black/80 flex items-start justify-center px-4 py-24" onClick={() => setNewShelf(null)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              if (newShelf.trim()) createShelf(newShelf.trim()).catch(() => {})
            }}
            className="w-full max-w-md bg-neutral-900 rounded-2xl border border-neutral-800 p-5"
          >
            <h2 className="text-lg font-bold text-neutral-50">{tt('Yeni raf')}</h2>
            <p className="text-sm text-neutral-500 mt-0.5">{tt('Bir seri ya da kendi grubun (ör. Marvel, Ghibli, Noel filmleri). Sonra içine yapımları seçeceksin.')}</p>
            <input
              autoFocus
              value={newShelf}
              onChange={(e) => setNewShelf(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setNewShelf(null)}
              placeholder={tt('Rafın adı')}
              className="mt-4 w-full rounded-xl bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setNewShelf(null)} className="text-sm rounded-lg px-4 py-2 text-neutral-300 hover:bg-neutral-800">
                {tt('Vazgeç')}
              </button>
              <button type="submit" disabled={!newShelf.trim()} style={primaryButtonStyle} className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON} disabled:opacity-50`}>
                {tt('Oluştur ve yapım seç')}
              </button>
            </div>
          </form>
        </div>
      )}
      {image && <KoleksiyonImage shelves={image.shelves} loose={image.loose} stats={image.stats} filtered={image.filtered} onClose={() => setImage(null)} />}
      {detail && <RowDetailModal board={board} row={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

// Flashback kartları (v1.24): her yılın Flashback unvanı holografik bir kart olarak burada birikir
function FlashbackKartlari({ cards }: { cards: Record<string, FbCard> }) {
  const years = Object.keys(cards).sort().reverse()
  return (
    <div className="fb-page rounded-3xl bg-[#050507] border border-white/10 p-6 sm:p-8">
      <div className="flex items-center gap-4 mb-6">
        <FbMark className="h-14 w-14" anim="always" />
        <div>
          <p className="fb-wordmark text-3xl">FLASHBACK</p>
          <p className="text-sm text-neutral-400 mt-1">{tt('Her yılın unvan kartı; Flashback\'te o yılı açınca buraya düşer. Fareyle oynatınca parlar.')}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        {years.map((y) => {
          const c = cards[y]
          return (
            <div key={y} className="flex flex-col items-center gap-2">
              <PersonaCard year={y} title={c.title} why={c.why} badges={c.badges} poster={c.poster || undefined} small />
              <p className="text-xs text-neutral-400">{ttx('{0} yapım · {1} film · {2} bölüm', c.titles, c.films, c.episodes)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Koleksiyon'un iki bölümü (v1.23.11): Raflar (semboller) ve Biletlerim (sinema biletleri). ?sekme=biletler
export default function Koleksiyon() {
  const [sp, setSp] = useSearchParams()
  // Ödüller sekmesi (v1.24) sadece Ekstralar'dan açılınca
  const rewards = useExtras().on('rewards')
  // Flashback sekmesi sadece en az bir yılın kartı varsa
  const [fbCards, setFbCards] = useState<Record<string, FbCard>>({})
  // ?sekme=flashback ile gelince kartlar yüklenmeden Raflar açılıp sonra sıçramasın
  const [fbLoaded, setFbLoaded] = useState(false)
  // profil değişince o profilin kartları gelsin
  const { activeProfileId } = useProfiles()
  useEffect(() => {
    if (!activeProfileId) return
    setFbCards({})
    api
      .getFbCards()
      .then(setFbCards)
      .catch(() => {})
      .finally(() => setFbLoaded(true))
  }, [activeProfileId])
  const hasFb = Object.keys(fbCards).length > 0
  const q = sp.get('sekme')
  const tab = q === 'biletler' ? 'biletler' : q === 'oduller' && rewards ? 'oduller' : q === 'flashback' && hasFb ? 'flashback' : 'raflar'
  const pick = (t: 'raflar' | 'biletler' | 'oduller' | 'flashback') => {
    const n = new URLSearchParams(sp)
    if (t !== 'raflar') n.set('sekme', t)
    else n.delete('sekme')
    setSp(n, { replace: true })
  }
  if (q === 'flashback' && !fbLoaded)
    return (
      <div className="max-w-6xl mx-auto px-4 py-10 flex items-center gap-3 text-sm text-neutral-400">
        <span className="h-4 w-4 rounded-full border-2 border-[#00c0fa] border-t-transparent animate-spin" />
        {tt('Yükleniyor…')}
      </div>
    )
  return (
    <div>
      <div className="max-w-6xl mx-auto px-4 pt-6 -mb-2">
        <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-900 p-1 text-sm">
          {([
            ['raflar', tt('Raflar'), 'trophy'],
            ['biletler', tt('Biletlerim'), 'ticket'],
            ...(rewards ? ([['oduller', tt('Ödüller'), 'cards']] as const) : []),
            ...(hasFb ? ([['flashback', 'Flashback', 'clock']] as const) : []),
          ] as const).map(([k, label, icon]) => (
            <button
              key={k}
              onClick={() => pick(k)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-1.5 transition ${tab === k ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:text-neutral-100'}`}
            >
              <Icon name={icon} className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'raflar' ? (
        <Raflar />
      ) : tab === 'flashback' ? (
        <div className="max-w-6xl mx-auto px-4 py-8">
          <FlashbackKartlari cards={fbCards} />
        </div>
      ) : tab === 'oduller' ? (
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Oduller />
        </div>
      ) : (
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Biletlerim />
        </div>
      )}
    </div>
  )
}
