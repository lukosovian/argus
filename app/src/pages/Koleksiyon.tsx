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

// Koleksiyon — kullanıcı "izlediklerimden sembolleri (Star Trek'teki göğüs deltaları gibi) bir yerde
// sergileyeyim" dedi. İzlediğin, izlemekte olduğun ya da yarım bıraktığın her yapım kendiliğinden gelir (sembolü yoksa
// logosuyla); aynı seriden olanlar bir rafta toplanır (filmler TMDB serisiyle, diğerleri adının ":"
// öncesiyle). Bir yapıma ya da rafa kendi sembolünü koyabilir, rafların adını ve bir yapımın rafını
// değiştirebilirsin (koleksiyon.json). Bazı raflara ARGUS'la gelen hazır semboller kendiliğinden konur.

// Raf anahtarı: "Star Trek: Discovery" / "Star Trek: The Kelvin Timeline Collection" → "star trek".
// split=false: ":" sonrası atılmaz (bkz. items'taki tek kelimelik dizi adı notu).
function cleanSeriesName(s: string, split = true) {
  const base = s
    .replace(/\s*[([][^)\]]*[)\]]\s*$/, '')
    .replace(/\s*\b(koleksiyonu|koleksiyon|collection|serisi|series)\b\s*$/i, '')
    .trim()
  return (split ? base.split(/:|\s[-–]\s/)[0] : base).trim()
}
function shelfKey(s: string, split = true) {
  return cleanSeriesName(s, split)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('en')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9ğüşıöç ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TRAILING = /^(ve|and|the|of|ile|a|an|[-–:&,.]|\d+|ii|iii|iv|bölüm|episode|part|kısım|chapter)$/i
function commonTitle(titles: string[]): string | null {
  if (titles.length < 2) return null
  const split = titles.map((t) => t.replace(/[:]/g, ' : ').split(/\s+/).filter(Boolean))
  const out: string[] = []
  for (let i = 0; i < split[0].length; i++) {
    const w = split[0][i]
    if (split.every((ws) => ws[i]?.toLocaleLowerCase('tr') === w.toLocaleLowerCase('tr'))) out.push(w)
    else break
  }
  while (out.length && TRAILING.test(out[out.length - 1])) out.pop()
  const name = out.join(' ').replace(/\s:\s?/g, ': ').trim()
  return name.length >= 3 ? name : null
}

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

  const load = useCallback(() => {
    if (!board) return
    api
      .getKoleksiyon(board.id)
      .then(setInfo)
      .catch(() => {})
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
    return rows
      .filter((r) => durum && r.values[durum.id] && r.values[durum.id] !== later)
      .map((r) => {
        const title = (tp ? titleText(tp, r.values[tp.id]) : '') || 'İsimsiz'
        const original = str(r, orig?.id) || title
        const col = info.collections[r.id]
        const source = col?.name ?? original
        const isSeries = info.mediaTypes[r.id] ? info.mediaTypes[r.id] === 'tv' : /dizi/i.test(kategori?.options?.find((o) => o.id === r.values[kategori.id])?.label ?? '')
        // Tek kelimelik ön ekli dizi adları başka bir seriye karışmasın: "Avatar: The Last Airbender"
        // Cameron'ın Avatar filmlerinin rafına düşmesin (iki kelime ve üstü, ör. "Star Trek: ..." birleşir).
        const split = !(isSeries && !col && !/\s/.test(cleanSeriesName(source)))
        const autoKey = shelfKey(source, split)
        const override = info.data.items[r.id]?.shelf
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
          key: override !== undefined ? override : autoKey,
          autoKey,
          autoName: cleanSeriesName(source, split),
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
        const symbol = data?.shelves[key]?.image ?? DEFAULT_SHELF_SYMBOLS[key] ?? null
        return {
          key,
          name: data?.shelves[key]?.name || auto,
          autoName: auto,
          seriesName: series,
          symbol,
          custom: Boolean(data?.shelves[key]?.image),
          items: [...g].sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999')),
        }
      })
      .sort((a, b) => Number(Boolean(b.symbol)) - Number(Boolean(a.symbol)) || b.items.length - a.items.length || a.name.localeCompare(b.name, 'tr'))
    // Aynı adı alan raflar (ör. Avatar filmleri ve "Avatar: The Last Airbender" dizileri) serinin kendi adıyla ayrılsın
    const seen = new Map<string, number>()
    for (const sh of list) seen.set(sh.name, (seen.get(sh.name) ?? 0) + 1)
    for (const sh of list) if ((seen.get(sh.name) ?? 0) > 1 && !data?.shelves[sh.key]?.name && sh.seriesName !== sh.name) sh.name = sh.autoName = sh.seriesName
    const onShelf = new Set(list.flatMap((s) => s.items.map((it) => it.row.id)))
    const rest = items.filter((it) => !onShelf.has(it.row.id)).sort((a, b) => b.lastWatched.localeCompare(a.lastWatched))
    return { shelves: list, loose: rest }
  }, [items, info])

  const match = (it: Item) =>
    (kind === 'hepsi' || (kind === 'dizi') === it.isSeries) &&
    (!onlySymbols || Boolean(it.symbol)) &&
    (!q.trim() || it.title.toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr')))
  const filteredShelves = shelves
    .map((s) => ({ ...s, shown: s.items.filter(match) }))
    .filter((s) => s.shown.length > 0 || (onlySymbols && s.custom && !q.trim()))
  const filteredLoose = loose.filter(match)
  const symbolCount = items.filter((it) => it.symbol).length

  async function save(patch: KoleksiyonPatch) {
    try {
      const data = await api.saveKoleksiyon(patch)
      setInfo((i) => (i ? { ...i, data } : i))
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Kaydedilemedi.', 'danger')
      throw e
    }
  }

  if (!board || loading || !info) return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>

  const Exhibit = ({ it, big = false }: { it: Item; big?: boolean }) => (
    <button onClick={() => setEditing({ kind: 'item', item: it })} className={`group text-left shrink-0 ${big ? 'w-36 sm:w-40' : 'w-full'}`} title={`${it.title} — sembolünü değiştirmek için tıkla`}>
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
      <p className="text-[11px] text-neutral-500">{[it.year, it.isSeries ? 'Dizi' : 'Film'].filter(Boolean).join(' · ')}</p>
    </button>
  )

  const shelfOptions = [
    { value: '__auto', label: 'Kendiliğinden bulunan raf' },
    { value: '', label: 'Rafsız' },
    ...shelves.map((s) => ({ value: s.key, label: s.name })),
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-8 sm:px-10" style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(0,192,250,0.14), transparent 60%), radial-gradient(ellipse at 90% 100%, rgba(120,60,200,0.12), transparent 60%), #0a0a0a' }}>
        <p className="text-sm font-semibold tracking-widest text-[#7fdcff]">ARGUS</p>
        <h1 className="text-4xl sm:text-5xl font-black text-neutral-50 tracking-tight mt-1">Koleksiyon</h1>
        <p className="text-neutral-300 mt-2 max-w-2xl">
          İzlediğin <span className="font-bold text-neutral-50">{items.length}</span> yapım, <span className="font-bold text-neutral-50">{shelves.length}</span> rafta ve tek başına sergileniyor
          {symbolCount ? (
            <>
              ; <span className="font-bold text-neutral-50">{symbolCount}</span> tanesinin kendi sembolü var
            </>
          ) : null}
          . Bir yapıma ya da rafın büyük sembolüne tıklayıp sembolünü koyabilirsin.
        </p>
        {info.pending && (
          <p className="text-xs text-neutral-500 mt-3">
            Film serileri öğreniliyor ({info.pending.done}/{info.pending.total}) — raflar birazdan tamamlanır.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-3 rounded-xl bg-neutral-900 border border-neutral-800 p-1 text-sm">
          {(['hepsi', 'film', 'dizi'] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`px-3 py-1 rounded-lg transition ${kind === k ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:text-neutral-100'}`}>
              {k === 'hepsi' ? 'Hepsi' : k === 'film' ? 'Filmler' : 'Diziler'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOnlySymbols((v) => !v)}
          className={`text-sm rounded-xl px-3 py-1.5 border transition ${onlySymbols ? 'border-[#00c0fa] text-[#7fdcff] bg-[#00c0fa]/10' : 'border-neutral-800 text-neutral-400 hover:text-neutral-100'}`}
        >
          Sadece sembolü olanlar
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Koleksiyonda ara…"
          className="ml-auto w-full sm:w-56 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]"
        />
      </div>

      {filteredShelves.map((s) => (
        <section key={s.key} className="rounded-3xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-5 flex flex-col sm:flex-row gap-5">
          <button
            onClick={() => setEditing({ kind: 'shelf', key: s.key, name: s.name, symbol: info.data.shelves[s.key]?.image ?? null, fallback: DEFAULT_SHELF_SYMBOLS[s.key] ?? null })}
            className="group shrink-0 w-32 sm:w-48 text-left"
            title="Rafın sembolünü ve adını değiştir"
          >
            <div className="relative aspect-square rounded-2xl border border-neutral-800 group-hover:border-neutral-600 flex items-center justify-center p-6 transition" style={{ background: SPOT }}>
              {s.symbol ? (
                <img src={s.symbol} alt="" className="max-h-full max-w-full object-contain drop-shadow-[0_0_22px_rgba(255,255,255,0.2)] group-hover:scale-105 transition" />
              ) : (
                <span className="text-center">
                  <span className="block text-3xl text-neutral-700">＋</span>
                  <span className="block text-xs text-neutral-500 mt-1">Rafa sembol ekle</span>
                </span>
              )}
              <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/70 text-neutral-200 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">✎</span>
            </div>
            <p className="text-lg font-bold text-neutral-50 mt-2 leading-tight">{s.name}</p>
            <p className="text-xs text-neutral-500">{s.items.length} yapım</p>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex gap-3 overflow-x-auto pb-3">
              {s.shown.map((it) => (
                <Exhibit key={it.row.id} it={it} big />
              ))}
            </div>
            {/* cam raf */}
            <div className="h-1.5 rounded-full bg-gradient-to-r from-transparent via-white/15 to-transparent shadow-[0_6px_14px_rgba(0,0,0,0.6)]" />
          </div>
        </section>
      ))}

      {filteredLoose.length > 0 && (
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-5">
          <p className="text-lg font-bold text-neutral-50">Tek başına olanlar</p>
          <p className="text-xs text-neutral-500 mb-4">Son izlediğin önce · {filteredLoose.length} yapım</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {filteredLoose.map((it) => (
              <Exhibit key={it.row.id} it={it} />
            ))}
          </div>
        </section>
      )}

      {!filteredShelves.length && !filteredLoose.length && <p className="text-sm text-neutral-500 text-center py-10">Bu seçime uyan bir şey yok.</p>}

      {editing?.kind === 'item' && (
        <SymbolEditor
          heading={editing.item.title}
          subheading="Koleksiyondaki sembolü"
          current={editing.item.symbol}
          fallback={editing.item.logo || null}
          shelf={{ value: info.data.items[editing.item.row.id]?.shelf ?? '__auto', options: shelfOptions }}
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
                // Yeni raf: adıyla anahtar oluşturulur, yazıldığı gibi görünsün diye adı da kaydedilir
                const key = shelfKey(shelf) || `raf-${Date.now().toString(36)}`
                patch.items![id]!.shelf = key
                patch.shelves = { [key]: { name: shelf } }
              }
            }
            await save(patch)
            notify('Koleksiyon güncellendi.')
          }}
        />
      )}
      {editing?.kind === 'shelf' && (
        <SymbolEditor
          heading={`${editing.name} rafı`}
          subheading="Rafın büyük sembolü ve adı"
          current={editing.symbol}
          fallback={editing.fallback}
          name={{ value: info.data.shelves[editing.key]?.name ?? '', placeholder: shelves.find((s) => s.key === editing.key)?.autoName ?? editing.name }}
          onClose={() => setEditing(null)}
          onSave={async ({ image, name }) => {
            const patch: KoleksiyonPatch = { shelves: { [editing.key]: {} } }
            if (image !== undefined) patch.shelves![editing.key]!.image = image
            if (name !== undefined) patch.shelves![editing.key]!.name = name || null
            await save(patch)
            notify('Raf güncellendi.')
          }}
        />
      )}
      {detail && <RowDetailModal board={board} row={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
