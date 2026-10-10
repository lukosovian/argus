import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useProfiles } from '../hooks/useProfiles'
import { useToast } from '../hooks/useToast'
import { api, type KoleksiyonInfo, type KoleksiyonPatch } from '../lib/api'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { entryEnd, toEntries } from '../lib/dateRange'
import { titleText, type Row } from '../types'
import RowDetailModal from '../components/RowDetailModal'
import SymbolEditor from '../components/SymbolEditor'
import BackgroundProgress from '../components/BackgroundProgress'
import ShelfPicker from '../components/ShelfPicker'
import KoleksiyonImage, { type ImageItem, type ImageShelf } from '../components/KoleksiyonImage'
import { autoShelf, commonTitle } from '../lib/shelves'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import { tt, ttx } from '../lib/i18n'

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

// ARGUS'la gelen, bazı raflara kendiliğinden konan semboller (değiştirilebilir)
const DEFAULT_SHELF_SYMBOLS: Record<string, string> = {
  'star trek': '/semboller/delta.svg',
  'harry potter': '/semboller/olum-yadigarlari.svg',
  'fantastic beasts': '/semboller/olum-yadigarlari.svg',
  'lord of the rings': '/semboller/tek-yuzuk.svg',
  hobbit: '/semboller/tek-yuzuk.svg',
  tron: '/semboller/tron.svg',
}

interface Item {
  row: Row
  title: string
  logo: string
  poster: string
  year: string
  isSeries: boolean
  lastWatched: string
  symbol: string | null
  key: string // bulunduğu raf ('' = rafsız)
  autoKey: string
  autoName: string
  // Ayrıca içinde durduğu, elle açılmış raflar (bkz. KoleksiyonData.shelves[].rows)
  extra: string[]
}

type Editing = { kind: 'item'; item: Item } | { kind: 'shelf'; key: string; name: string; symbol: string | null; fallback: string | null }

const SPOT = 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.09), transparent 70%), #0a0a0a'

export default function Koleksiyon() {
  const { settings } = useHomeSettings()
  const { activeProfileId } = useProfiles()
  const { notify } = useToast()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const [info, setInfo] = useState<KoleksiyonInfo | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [detail, setDetail] = useState<Row | null>(null)
  const [kind, setKind] = useState<'hepsi' | 'film' | 'dizi'>('hepsi')
  const [onlySymbols, setOnlySymbols] = useState(false)
  const [q, setQ] = useState('')
  // "+ Yapım ekle" penceresi, "+ Yeni raf" adı, koleksiyon görseli (açılınca o anki raflar donduruluyor)
  const [picking, setPicking] = useState<{ key: string; name: string } | null>(null)
  const [newShelf, setNewShelf] = useState<string | null>(null)
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

  const items = useMemo<Item[]>(() => {
    if (!board || !info) return []
    const durum = resolveRole(board, 'durum')
    // İzlenecek dışındaki her durum (İzlendi, İzleniyor, Yarım…) — sunucudaki koleksiyonRows ile aynı
    const later = resolveStatusOption(board, 'izlenecek')
    const tp = board.properties.find((p) => p.id === board.titlePropertyId)
    const orig = resolveRole(board, 'orjinalAdi')
    const poster = resolveRole(board, 'poster')
    const kategori = resolveRole(board, 'kategori')
    const vizyon = resolveRole(board, 'vizyon')
    const dateProp = resolveRole(board, 'izlemeTarihi')
    const str = (r: Row, id?: string) => (id && typeof r.values[id] === 'string' ? (r.values[id] as string) : '')
    const manual = Object.entries(info.data.shelves).filter(([, v]) => v.manual)
    return rows
      .filter((r) => durum && r.values[durum.id] && r.values[durum.id] !== later)
      .map((r) => {
        const title = (tp ? titleText(tp, r.values[tp.id]) : '') || tt('İsimsiz')
        const original = str(r, orig?.id) || title
        const col = info.collections[r.id]
        const source = col?.name ?? original
        const isSeries = info.mediaTypes[r.id] ? info.mediaTypes[r.id] === 'tv' : /dizi/i.test(kategori?.options?.find((o) => o.id === r.values[kategori.id])?.label ?? '')
        const auto = autoShelf(source, isSeries, Boolean(col))
        const autoKey = auto.key
        const override = info.data.items[r.id]?.shelf
        // Elle açılmış bir rafa "taşınmış" eski kayıtlar da (v1.12) ek raf sayılır, kendi raflarında kalır
        const overrideManual = Boolean(override && info.data.shelves[override]?.manual)
        const extra = manual.filter(([k, v]) => v.rows?.includes(r.id) || (overrideManual && override === k)).map(([k]) => k)
        const dates = dateProp ? toEntries(r.values[dateProp.id]).map(entryEnd).sort() : []
        return {
          row: r,
          title,
          logo: str(r, board.titleImagePropertyId ?? undefined),
          poster: str(r, poster?.id),
          year: str(r, vizyon?.id).slice(0, 4),
          isSeries,
          lastWatched: dates[dates.length - 1] ?? '',
          symbol: info.data.items[r.id]?.image ?? null,
          key: override !== undefined && !overrideManual ? override : autoKey,
          autoKey,
          autoName: auto.name,
          extra,
        }
      })
  }, [board, rows, info])

  // Raflar: en az 2 yapımı olanlar, elle oluşturulanlar ya da adı / sembolü değiştirilenler
  const { shelves, loose } = useMemo(() => {
    const groups = new Map<string, Item[]>()
    for (const it of items) {
      if (!it.key) continue
      const g = groups.get(it.key) ?? []
      g.push(it)
      groups.set(it.key, g)
    }
    const data = info?.data
    const list = [...groups.entries()]
      .filter(([key, g]) => g.length >= 2 || data?.shelves[key] || g.some((it) => data?.items[it.row.id]?.shelf === key))
      .map(([key, g]) => {
        const names = new Map<string, number>()
        for (const it of g) if (it.autoKey === key) names.set(it.autoName, (names.get(it.autoName) ?? 0) + 1)
        // Türkçe adları ortak bir başlangıçla başlıyorsa raf adı o olsun ("Recep İvedik 2" … → "Recep İvedik",
        // "Yüzüklerin Efendisi: İki Kule" … → "Yüzüklerin Efendisi"); yoksa serinin (İngilizce) adı.
        const series = [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? g[0].autoName
        const auto = commonTitle(g.map((it) => it.title)) ?? series
        const symbol: string | null = data?.shelves[key]?.image ?? DEFAULT_SHELF_SYMBOLS[key] ?? null
        return {
          key,
          name: data?.shelves[key]?.name || auto,
          autoName: auto,
          seriesName: series,
          symbol: symbol as string | null,
          custom: Boolean(data?.shelves[key]?.image),
          manual: Boolean(data?.shelves[key]?.manual),
          items: [...g].sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999')),
        }
      })
    // Elle açılmış raflar: içindekiler ayrıca kendi yerlerinde de duruyor. Boşken de görünür (içine
    // "+ Yapım ekle" ile yapım koyulsun).
    for (const [key, v] of Object.entries(data?.shelves ?? {})) {
      if (!v.manual || groups.has(key)) continue
      const name = v.name || tt('Yeni raf')
      const members = items.filter((it) => it.extra.includes(key)).sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999'))
      list.push({ key, name, autoName: name, seriesName: name, symbol: v.image ?? null, custom: Boolean(v.image), manual: true, items: members })
    }
    list
      .sort((a, b) => Number(Boolean(b.symbol)) - Number(Boolean(a.symbol)) || b.items.length - a.items.length || a.name.localeCompare(b.name, 'tr'))
    // Aynı adı alan raflar (ör. Avatar filmleri ve "Avatar: The Last Airbender" dizileri) serinin kendi adıyla ayrılsın
    const seen = new Map<string, number>()
    for (const sh of list) seen.set(sh.name, (seen.get(sh.name) ?? 0) + 1)
    for (const sh of list) if ((seen.get(sh.name) ?? 0) > 1 && !data?.shelves[sh.key]?.name && sh.seriesName !== sh.name) sh.name = sh.autoName = sh.seriesName
    // Elle açılan raflardakiler kendi yerlerinden (tek başına olanlar dahil) kalkmıyor
    const onShelf = new Set(list.filter((s) => !s.manual).flatMap((s) => s.items.map((it) => it.row.id)))
    const rest = items.filter((it) => !onShelf.has(it.row.id)).sort((a, b) => b.lastWatched.localeCompare(a.lastWatched))
    return { shelves: list, loose: rest }
  }, [items, info])

  const match = (it: Item) =>
    (kind === 'hepsi' || (kind === 'dizi') === it.isSeries) &&
    (!onlySymbols || Boolean(it.symbol)) &&
    (!q.trim() || it.title.toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr')))
  const noFilter = kind === 'hepsi' && !onlySymbols && !q.trim()
  const filteredShelves = shelves
    .map((s) => ({ ...s, shown: s.items.filter(match) }))
    .filter((s) => s.shown.length > 0 || (onlySymbols && s.custom && !q.trim()) || (noFilter && s.items.length === 0))
  const filteredLoose = loose.filter(match)
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
        <button onClick={load} className="mt-5 text-sm rounded-xl px-4 py-2 border border-neutral-700 text-neutral-200 hover:border-[#00c0fa]">
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
          <div key={i} className="h-48 rounded-3xl border border-neutral-800 bg-neutral-900/40 animate-pulse" />
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
        <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/70 text-neutral-200 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">✎</span>
      </div>
      <p className="text-xs text-neutral-200 mt-1.5 line-clamp-1">{it.title}</p>
      <p className="text-[11px] text-neutral-500">{[it.year, it.isSeries ? tt('Dizi') : tt('Film')].filter(Boolean).join(' · ')}</p>
    </button>
  )

  const shelfOptions = [
    { value: '__auto', label: tt('Kendiliğinden bulunan raf') },
    { value: '', label: tt('Rafsız') },
    ...shelves.filter((s) => !s.manual).map((s) => ({ value: s.key, label: s.name })),
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-8 sm:px-10" style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(0,192,250,0.14), transparent 60%), radial-gradient(ellipse at 90% 100%, rgba(120,60,200,0.12), transparent 60%), #0a0a0a' }}>
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
      </section>

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
          className={`text-sm rounded-xl px-3 py-1.5 border transition ${onlySymbols ? 'border-[#00c0fa] text-[#7fdcff] bg-[#00c0fa]/10' : 'border-neutral-800 text-neutral-400 hover:text-neutral-100'}`}
        >
          {tt('Sadece sembolü olanlar')}
        </button>
        <button onClick={() => setNewShelf('')} className="text-sm rounded-xl px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:text-neutral-50 hover:border-neutral-600 transition">
          {tt('+ Yeni raf')}
        </button>
        <button onClick={openImage} className="text-sm rounded-xl px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:text-neutral-50 hover:border-neutral-600 transition">
          {tt('Görsel oluştur')}
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tt('Koleksiyonda ara…')}
          className="ml-auto w-full sm:w-56 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]"
        />
      </div>

      {filteredShelves.map((s) => (
        <section key={s.key} className="rounded-3xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-5 flex flex-col sm:flex-row gap-5">
          <button
            onClick={() => setEditing({ kind: 'shelf', key: s.key, name: s.name, symbol: info.data.shelves[s.key]?.image ?? null, fallback: DEFAULT_SHELF_SYMBOLS[s.key] ?? null })}
            className="group shrink-0 w-32 sm:w-48 text-left"
            title={tt('Rafın sembolünü ve adını değiştir')}
          >
            <div className="relative aspect-square rounded-2xl border border-neutral-800 group-hover:border-neutral-600 flex items-center justify-center p-6 transition" style={{ background: SPOT }}>
              {s.symbol ? (
                <img src={s.symbol} alt="" className="max-h-full max-w-full object-contain drop-shadow-[0_0_22px_rgba(255,255,255,0.2)] group-hover:scale-105 transition" />
              ) : (
                <span className="text-center">
                  <span className="block text-3xl text-neutral-700">＋</span>
                  <span className="block text-xs text-neutral-500 mt-1">{tt('Rafa sembol ekle')}</span>
                </span>
              )}
              <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/70 text-neutral-200 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">✎</span>
            </div>
            <p className="text-lg font-bold text-neutral-50 mt-2 leading-tight">{s.name}</p>
            <p className="text-xs text-neutral-500">{ttx('{0} yapım', s.items.length)}</p>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex gap-3 overflow-x-auto pb-3">
              {s.shown.map((it) => (
                <Exhibit key={it.row.id} it={it} big />
              ))}
              <button
                onClick={() => setPicking({ key: s.key, name: s.name })}
                className="shrink-0 w-36 sm:w-40 text-left group"
                title={tt('Bu rafa yapım ekle ya da çıkar')}
              >
                <div className="aspect-square rounded-2xl border-2 border-dashed border-neutral-800 group-hover:border-[#00c0fa]/60 flex flex-col items-center justify-center text-neutral-500 group-hover:text-[#7fdcff] transition">
                  <span className="text-3xl leading-none">＋</span>
                  <span className="text-xs mt-1.5">{tt('Yapım ekle')}</span>
                </div>
              </button>
            </div>
            {/* cam raf */}
            <div className="h-1.5 rounded-full bg-gradient-to-r from-transparent via-white/15 to-transparent shadow-[0_6px_14px_rgba(0,0,0,0.6)]" />
          </div>
        </section>
      ))}

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

      {!filteredShelves.length && !filteredLoose.length && <p className="text-sm text-neutral-500 text-center py-10">{tt('Bu seçime uyan bir şey yok.')}</p>}

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
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-start justify-center px-4 py-24" onClick={() => setNewShelf(null)}>
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
