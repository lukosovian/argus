import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { api, type KoleksiyonInfo, type OdulData, type OdulReward, type OdulTier } from '../lib/api'
import { CATALOG, RARITY_COLORS, RARITY_NAMES, TIERS, rollPack, setTierFor, tierOf, useOduller, type ItemKind } from '../lib/oduller'
import { shelfSetMembers, type KoleksiyonShelf } from '../lib/koleksiyonRaflar'
import { useToast } from '../hooks/useToast'
import { PackConflict } from '../lib/useProfileStore'
import { shuffle } from '../lib/games'
import { shelvesFrom, useSetBonuses } from '../lib/odulSetler'
import { useEscape } from '../hooks/useEscape'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { tt } from '../lib/i18n'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import PackOpening, { HAPTIC_KEY, hapticsOn } from '../components/odul/PackOpening'
import { MOBILE } from '../lib/mobile/ui'
import { CardBack, ItemArt, RewardCard } from '../components/odul/RewardCard'
import '../components/odul/odul.css'
import RowDetailModal from '../components/RowDetailModal'
import { searchFold } from '../lib/search'
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import type { Row } from '../types'

// Koleksiyon › Ödüller (v1.24): kart paketleri, film kartı albümü, avatar çerçeveleri, kart arkaları ve bilet tasarımı.
// Kurallar ve oranlar lib/oduller.ts'te; kayıt server › oduller.

const MAKARA_OF = [1, 2, 5, 12]

function MiniPack({ tier, size = 64 }: { tier: OdulTier; size?: number }) {
  const t = tierOf(tier)
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[5px] shadow-[0_10px_24px_rgba(0,0,0,.5)]"
      style={{ width: size, height: size * 1.5, background: t.foil, WebkitMask: 'conic-gradient(from 135deg at top,#0000,#000 1deg 89deg,#0000 90deg) 50% 0/7px 51% repeat-x, conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50% 100%/7px 51% repeat-x' }}
    >
      <div className="absolute inset-0" style={{ background: 'linear-gradient(115deg,transparent 25%,rgba(255,80,200,.4) 40%,rgba(80,220,255,.4) 50%,transparent 65%)', mixBlendMode: 'color-dodge' }} />
      <div className="absolute left-0 right-0" style={{ top: size * 0.22, borderTop: '1.5px dashed rgba(255,255,255,.45)' }} />
      <div className="absolute inset-x-0 text-center font-black tracking-tight" style={{ top: size * 0.62, fontSize: size * 0.22, background: 'linear-gradient(90deg,#7fd8ff,#fff,#7fd8ff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
        ARGUS
      </div>
    </div>
  )
}

// Albümde büyütülen kart: fareyle eğilir, ışık kayar
// onOpenRow (O6): kartın yapımı arşivdeyse detayı açılır
function CardZoom({ reward, backKey, no, onClose, onOpenRow }: { reward: OdulReward; backKey?: string; no?: number; onClose: () => void; onOpenRow?: () => void }) {
  useEscape(true, onClose)
  const ref = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef)
  const [flip, setFlip] = useState(false)
  const w = Math.min(320, window.innerWidth - 64, (window.innerHeight - 120) / 1.48)
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={tt('Çevirmek için karta tıkla')}
      className="oc-zoom"
      onClick={onClose}
      onPointerMove={(e) => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const mx = (e.clientX - r.left) / r.width
        const my = (e.clientY - r.top) / r.height
        el.style.transform = `rotateY(${(mx - 0.5) * 18}deg) rotateX(${(0.5 - my) * 14}deg)`
        el.style.setProperty('--gx', `${mx * 100}%`)
        el.style.setProperty('--gy', `${my * 100}%`)
      }}
    >
      <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()} style={{ perspective: 1200 }}>
        <div
          ref={ref}
          className="oc-tilt relative"
          onClick={() => setFlip((f) => !f)}
          role="button"
          tabIndex={0}
          aria-label={tt('Çevirmek için karta tıkla')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setFlip((f) => !f)
            }
          }}
        >
          <RewardCard reward={reward} w={w} backKey={backKey} shown={!flip} no={no}>
            <div className="oc-glare" />
          </RewardCard>
        </div>
        <p className="text-xs text-neutral-400">{tt('Çevirmek için karta tıkla')}</p>
        {onOpenRow && (
          <button onClick={onOpenRow} className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-xs text-neutral-200 transition hover:bg-white/[0.12] hover:text-white">
            {tt('Yapımı aç')}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default function Oduller() {
  const { data, stats, available, pool, act, openPack, reload, ready, board, rows, setStore } = useOduller(true)
  const { notify } = useToast()
  const RN = RARITY_NAMES()
  const [opening, setOpening] = useState<{ id: string; tier: OdulTier; rewards: OdulReward[]; badges: ({ text: string; dup?: boolean } | null)[]; posters: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<number | 'parlak' | null>(null)
  const [zoom, setZoom] = useState<{ reward: OdulReward; no: number } | null>(null)
  const [detail, setDetail] = useState<Row | null>(null)
  // O7 (v1.27): albümde ad araması, sıralama ve eksik kartlar
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'yeni' | 'ad' | 'puan' | 'nadir'>('nadir')
  const [showMissing, setShowMissing] = useState(false)

  const cards = useMemo(
    () =>
      Object.entries(data?.cards ?? {})
        .map(([rowId, c]) => ({ rowId, ...c }))
        .sort((a, b) => b.r - a.r || Number(Boolean(b.foil)) - Number(Boolean(a.foil)) || a.at - b.at),
    [data],
  )
  const numberOf = useMemo(() => {
    const m = new Map<string, number>()
    Object.entries(data?.cards ?? {})
      .sort((a, b) => a[1].at - b[1].at)
      .forEach(([id], i) => m.set(id, i + 1))
    return m
  }, [data])
  // Seri seti (v1.25): yeni açılan kartlar bir rafı tamamladıysa bonus paket burada da hemen yazılsın
  const [kol, setKol] = useState<KoleksiyonInfo | null>(null)
  const boardId = board?.id
  useEffect(() => {
    if (!boardId) return
    let alive = true
    api
      .getKoleksiyon(boardId)
      .then((d) => alive && setKol(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [boardId])
  const kolShelves = useMemo(() => shelvesFrom(board, rows, kol), [board, rows, kol])
  useSetBonuses(kolShelves, data, true)
  const doneSets = Object.values(setStore?.sets ?? {}).sort((a, b) => b.at - a.at)

  const albumCards = useMemo(() => {
    const n = searchFold(q.trim())
    const list = cards.filter((c) => (filter === null ? true : filter === 'parlak' ? c.foil : c.r === filter) && (!n || searchFold(c.title).includes(n)))
    const byName = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, 'tr')
    if (sort === 'yeni') list.sort((a, b) => b.at - a.at)
    else if (sort === 'ad') list.sort(byName)
    else if (sort === 'puan') list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byName(a, b))
    return list
  }, [cards, filter, q, sort])
  // Eksik kartlar: kart havuzunda (izlenmiş, afişi olan yapımlar — lib/oduller › buildPool) olup henüz çıkmamış olanlar
  const missingAll = useMemo(() => pool.filter((p) => !data?.cards[p.rowId]), [pool, data])
  const missingCards = useMemo(() => {
    if (!showMissing || filter === 'parlak') return []
    const n = searchFold(q.trim())
    const list = missingAll.filter((p) => (filter === null || p.r === filter) && (!n || searchFold(p.title).includes(n)))
    const byName = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, 'tr')
    if (sort === 'puan') list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byName(a, b))
    else if (sort === 'nadir') list.sort((a, b) => b.r - a.r || byName(a, b))
    else list.sort(byName)
    return list
  }, [showMissing, missingAll, filter, q, sort])
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  async function open(tier: OdulTier) {
    if (!data || busy) return
    if (!pool.length) {
      notify(tt('Kart çıkması için arşivinde afişi olan, izlenmiş yapımlar olmalı.'), 'danger')
      return
    }
    setBusy(true)
    try {
      const { rewards, pity } = rollPack(tier, data, pool)
      const badges = rewards.map((r) => {
        if (r.kind === 'card') {
          const had = data.cards[r.rowId]
          if (!had) return { text: tt('YENİ') }
          if (r.foil && !had.foil) return { text: tt('PARLAK!') }
          return { text: tt('+{0} makara', MAKARA_OF[r.r]), dup: true }
        }
        return data.items[r.key] ? { text: tt('+{0} makara', MAKARA_OF[r.r]), dup: true } : { text: tt('YENİ') }
      })
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      await openPack({ tier, opId: id, pity, rewards })
      const posters = shuffle(pool).slice(0, 3).map((p) => p.poster)
      setOpening({ id, tier, rewards, badges, posters })
    } catch (e) {
      if (e instanceof PackConflict) {
        reload()
        notify(tt('Bu paket başka bir cihazda açıldı.'), 'danger')
      } else notify(e instanceof Error ? e.message : tt('Paket açılamadı'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  if (!ready || !data) return <div className="py-20 text-center text-sm text-neutral-500">{tt('Yükleniyor…')}</div>

  if (!data.startedAt)
    return (
      <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 px-6 py-12 text-center text-neutral-100">
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(176,101,255,.14), transparent 55%), radial-gradient(circle at 30% 80%, rgba(0,192,250,.1), transparent 50%)' }} />
        <div className="relative mx-auto mb-6 flex h-40 items-end justify-center">
          {(['bronz', 'gumus', 'altin'] as OdulTier[]).map((t, i) => (
            <div key={t} style={{ transform: `rotate(${(i - 1) * 12}deg) translateY(${i === 1 ? -14 : 0}px)`, margin: '0 -8px', zIndex: i === 1 ? 2 : 1 }}>
              <MiniPack tier={t} size={i === 1 ? 84 : 70} />
            </div>
          ))}
        </div>
        <h2 className="relative text-2xl font-bold">{tt('İzledikçe kart paketi kazan')}</h2>
        <p className="relative mx-auto mt-2 max-w-lg text-sm leading-relaxed text-neutral-400">
          {tt('Bölüm ve film bitirdikçe, sinemaya gittikçe paket kazanırsın. Paketi yırtıp açarsın; içinden izlediğin yapımların kartları, avatar çerçeveleri, kart arkaları ve yeni bir bilet tasarımı çıkar. Kartın nadirliği o yapıma verdiğin puandan gelir.')}
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await act({ action: 'start' })
            } catch (e) {
              // H14: bağlantı hatasında sessiz kalmasın; düğme tekrar denenebilir
              notify(e instanceof Error && e.message ? tt('Başlatılamadı: {0} — tekrar dene.', e.message) : tt('Başlatılamadı — bağlantını kontrol edip tekrar dene.'), 'danger')
            } finally {
              setBusy(false)
            }
          }}
          className={`relative mt-6 rounded-xl px-6 py-2.5 ${PRIMARY_BUTTON}`}
          style={primaryButtonStyle}
        >
          {tt('Başla — 3 hoş geldin paketi')}
        </button>
        <p className="relative mt-3 text-xs text-neutral-500">{tt('Sadece bugünden sonra izlediklerin sayılır.')}</p>
      </div>
    )

  // Bir sonraki pakete ne kadar kaldı
  const progress: Record<OdulTier, string> = {
    bronz: tt('Sonraki pakete {0} bölüm', 4 - ((stats?.eps ?? 0) % 4)),
    gumus: tt('Bir film bitir'),
    altin: tt('Sonraki pakete {0} film', 10 - ((stats?.films ?? 0) % 10)),
  }
  const totalCards = pool.length
  const kinds: ItemKind[] = ['frame', 'back', 'bilet']

  return (
    <div className="space-y-10 text-neutral-100">
      {/* paketlerim */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{tt('Paketlerim')}</h2>
            <p className="text-xs text-neutral-500">{tt('Her paketten 5 kart çıkar. Elindeki bir ödül tekrar çıkarsa makaraya döner.')}</p>
          </div>
          {MOBILE && <HapticToggle />}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-300" title={tt('Kopyalardan biriken makarayla paket alabilirsin')}>
            <Icon name="film" className="h-3.5 w-3.5" /> {tt('{0} makara', data.makara)}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {TIERS.map((t) => {
            const n = available[t.id]
            return (
              <div key={t.id} className="flex gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="relative">
                  <MiniPack tier={t.id} />
                  {n > 0 && <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#00c0fa] px-1.5 text-xs font-bold text-black shadow">{n}</span>}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <b className="text-sm">{t.label()}</b>
                  <span className="text-xs text-neutral-400">{t.rule()}</span>
                  <span className="mt-1 text-[11px] text-neutral-500">{progress[t.id]}</span>
                  <span className="mt-1 text-[10px] leading-snug text-neutral-600">
                    {t.odds
                      .map((o, i) => (o ? `${RN[i]} %${o}` : ''))
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    <button disabled={!n || busy} onClick={() => void open(t.id)} className={`rounded-lg px-4 py-1.5 text-sm ${PRIMARY_BUTTON}`} style={n ? primaryButtonStyle : { background: '#262626' }}>
                      {n ? tt('Aç') : tt('Paket yok')}
                    </button>
                    <button
                      disabled={data.makara < t.price || busy}
                      onClick={async () => {
                        try {
                          await act({ action: 'buy', tier: t.id })
                          notify(tt('{0} alındı', t.label()), 'success')
                        } catch (e) {
                          notify(e instanceof Error ? e.message : 'error', 'danger')
                        }
                      }}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition enabled:hover:border-neutral-500 disabled:opacity-40"
                      title={tt('{0} makarayla al', t.price)}
                    >
                      <Icon name="film" className="h-3.5 w-3.5 inline -mt-0.5 mr-0.5" />{t.price}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-neutral-600">{tt('10 paket üst üste epik çıkmazsa bir sonrakinde epik garanti.')}</p>
        <p className="mt-1 text-[11px] text-neutral-500">
          {tt("Seri seti: Koleksiyon'daki bir serinin (raf) bütün film kartlarını toplayınca bir kerelik paket — 3 filme kadar gümüş, daha uzun serilerde altın.")}
        </p>
      </section>

      {/* A18: setlerin — her rafın ilerlemesi, eksik kartlar soluk */}
      <SetStrip shelves={kolShelves} cards={data.cards} done={setStore?.sets ?? {}} doneCount={doneSets.length} />

      {/* film kartları */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{tt('Film kartları')}</h2>
            <p className="text-xs text-neutral-500">{tt('{0} / {1} kart toplandı · nadirlik verdiğin puandan gelir (7+ nadir, 8.5+ epik, 9.5+ efsanevi)', cards.length, totalCards)}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {([null, 3, 2, 1, 0, 'parlak'] as const).map((f) => (
              <button
                key={String(f)}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 transition ${filter === f ? 'border-white bg-white text-black' : 'border-neutral-700 text-neutral-400 hover:text-neutral-100'}`}
                style={typeof f === 'number' && filter !== f ? { color: RARITY_COLORS[f] } : undefined}
              >
                {f === null ? tt('Hepsi') : f === 'parlak' ? tt('Parlak') : RN[f]}
              </button>
            ))}
          </div>
        </div>
        {cards.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQ('')}
              placeholder={tt('Kartlarda ara…')}
              aria-label={tt('Kartlarda ara')}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-[#00c0fa] sm:w-56"
            />
            <div className="flex rounded-xl border border-neutral-800 bg-neutral-900 p-0.5 text-xs" role="group" aria-label={tt('Sırala')}>
              {(
                [
                  ['yeni', tt('Yeni gelen')],
                  ['ad', tt('Ada göre')],
                  ['puan', tt('Puana göre')],
                  ['nadir', tt('Nadirlik')],
                ] as const
              ).map(([k, label]) => (
                <button key={k} onClick={() => setSort(k)} aria-pressed={sort === k} className={`rounded-lg px-2.5 py-1 transition ${sort === k ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-100'}`}>
                  {label}
                </button>
              ))}
            </div>
            {missingAll.length > 0 && (
              <button
                onClick={() => setShowMissing((v) => !v)}
                aria-pressed={showMissing}
                className={`rounded-xl border px-3 py-1.5 text-xs transition ${showMissing ? 'border-[#00c0fa]/60 bg-[#00c0fa]/10 text-[#7fdcff]' : 'border-neutral-800 text-neutral-400 hover:text-neutral-100'}`}
              >
                {showMissing ? tt('Eksikleri gizle') : tt('Eksikleri göster ({0})', missingAll.length)}
              </button>
            )}
          </div>
        )}
        {albumCards.length || missingCards.length ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
            {albumCards.map((c) => {
              const rw: OdulReward = { kind: 'card', rowId: c.rowId, r: c.r, title: c.title, poster: c.poster, year: c.year, rating: c.rating, foil: c.foil }
              return (
                <button key={c.rowId} className="relative text-left transition hover:-translate-y-1" onClick={() => setZoom({ reward: rw, no: numberOf.get(c.rowId) ?? 0 })}>
                  <AutoCard reward={rw} />
                  {c.n > 1 && <span className="absolute bottom-1.5 right-1.5 z-10 rounded-full bg-black/70 px-1.5 text-[10px] font-bold text-neutral-200">×{c.n}</span>}
                </button>
              )
            })}
            {/* Eksik kartlar: soluk afiş (Setlerin şeridindeki gibi) + "henüz çıkmadı"; dokununca yapımın detayı */}
            {missingCards.map((p) => (
              <button
                key={p.rowId}
                onClick={() => {
                  const row = rowById.get(p.rowId)
                  if (row) setDetail(row)
                }}
                className="group relative overflow-hidden rounded-[10px] border border-dashed border-neutral-700 bg-neutral-950 text-left"
                style={{ aspectRatio: '1 / 1.48' }}
                title={p.title}
              >
                <img src={p.poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition group-hover:opacity-40" style={{ opacity: 0.22, filter: 'grayscale(1)' }} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-6">
                  <b className="block truncate text-[11px] text-neutral-300">{p.title}</b>
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: RARITY_COLORS[p.r] }}>
                    {RN[p.r]}
                  </span>
                  <span className="block text-[10px] text-neutral-500">{tt('henüz çıkmadı')}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          // H4: boş yer resimli ve tek düğmeli (ilk paket ya da süzgeci temizle)
          <div className="rounded-2xl border border-dashed border-neutral-800">
            <EmptyState art="afis" icon="cards" compact title={!cards.length ? tt('Henüz kart yok. İlk paketini aç!') : q.trim() ? tt('Bu ada uyan kart yok.') : tt('Bu nadirlikte kartın yok.')}>
              {!cards.length ? (
                (() => {
                  const t = TIERS.find((x) => available[x.id] > 0)
                  return t ? (
                    <button disabled={busy} onClick={() => void open(t.id)} className={`rounded-lg px-4 py-1.5 text-sm ${PRIMARY_BUTTON}`} style={primaryButtonStyle}>
                      {tt('{0} aç', t.label())}
                    </button>
                  ) : null
                })()
              ) : null}
            </EmptyState>
          </div>
        )}
      </section>

      {/* kozmetik ödüller */}
      {kinds.map((k) => (
        <section key={k}>
          <h2 className="text-lg font-semibold">{k === 'frame' ? tt('Avatar çerçeveleri') : k === 'back' ? tt('Kart arkaları') : tt('Bilet tasarımları')}</h2>
          <p className="mb-3 text-xs text-neutral-500">
            {k === 'frame' ? tt('Taktığın çerçeve sağ üstteki avatarında görünür.') : k === 'back' ? tt('Paketten çıkan kartların arka yüzü.') : tt('Biletlerim\'de bilet eklerken "Tasarım" bölümünde çıkar.')}
          </p>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))' }}>
            {(k === 'back' ? [{ key: 'back:klasik', kind: 'back' as ItemKind, r: 0, name: () => tt('Klasik') }, ...CATALOG.filter((c) => c.kind === k)] : CATALOG.filter((c) => c.kind === k)).map((c) => {
              const owned = c.key === 'back:klasik' || Boolean(data.items[c.key])
              const slot = k === 'frame' ? 'frame' : 'back'
              const on = k === 'back' ? (data.equip.back ?? 'back:klasik') === c.key : data.equip.frame === c.key
              return (
                <div key={c.key} className={`flex flex-col items-center gap-2 rounded-2xl border bg-neutral-900 p-3 text-center ${on ? 'border-[#00c0fa]/60' : 'border-neutral-800'}`} style={{ '--rc': RARITY_COLORS[c.r] } as CSSProperties}>
                  <div className={`flex h-24 items-center justify-center ${owned ? '' : 'od-locked'}`}>
                    {k === 'back' ? (
                      <div className="oc static" style={{ '--w': '62px' } as CSSProperties}>
                        <div className="oc-flip">
                          <CardBack backKey={c.key} />
                        </div>
                      </div>
                    ) : (
                      <ItemArt itemKey={c.key} w={k === 'bilet' ? 150 : 170} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <b className="block truncate text-xs">{owned ? c.name() : '???'}</b>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: RARITY_COLORS[c.r] }}>
                      {RN[c.r]}
                    </span>
                  </div>
                  {owned && k !== 'bilet' && (
                    <button
                      onClick={() => void act({ action: 'equip', slot, key: on || c.key === 'back:klasik' ? null : c.key })}
                      disabled={on && k === 'back'}
                      className={`w-full rounded-lg px-2 py-1 text-xs transition ${on ? 'bg-[#00c0fa]/15 text-[#7fd8ff]' : 'border border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}
                    >
                      {on ? (k === 'frame' ? tt('Takılı · çıkar') : tt('Kullanılıyor')) : k === 'frame' ? tt('Tak') : tt('Kullan')}
                    </button>
                  )}
                  {!owned && <span className="text-[10px] text-neutral-600">{tt('Paketten çıkar')}</span>}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {opening && (
        <PackOpening
          key={opening.id}
          tier={opening.tier}
          rewards={opening.rewards}
          badges={opening.badges}
          backKey={data.equip.back}
          posters={opening.posters}
          onClose={() => setOpening(null)}
          onAgain={available[opening.tier] > 0 ? () => void open(opening.tier) : null}
          againLabel={tt('Bir tane daha aç ({0})', available[opening.tier])}
        />
      )}
      {zoom && (
        <CardZoom
          reward={zoom.reward}
          no={zoom.no}
          backKey={data.equip.back}
          onClose={() => setZoom(null)}
          onOpenRow={
            zoom.reward.kind === 'card' && board && rowById.has(zoom.reward.rowId)
              ? () => {
                  const row = zoom.reward.kind === 'card' ? rowById.get(zoom.reward.rowId) : undefined
                  setZoom(null)
                  if (row) setDetail(row)
                }
              : undefined
          }
        />
      )}
      {detail && board && <RowDetailModal board={board} row={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

// A19: paket açarken titreşim (telefonda; bu cihazda hatırlanır)
function HapticToggle() {
  const [on, setOn] = useState(hapticsOn)
  return (
    <button
      onClick={() => {
        const v = !on
        setOn(v)
        try {
          localStorage.setItem(HAPTIC_KEY, v ? '1' : '0')
        } catch {
          /* önemsiz */
        }
        if (v) navigator.vibrate?.(20)
      }}
      className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${on ? 'border-[#00c0fa]/50 text-[#7fd8ff]' : 'border-neutral-700 text-neutral-500'}`}
      aria-pressed={on}
    >
      <Icon name="bell" className="h-3.5 w-3.5" /> {on ? tt('Titreşim açık') : tt('Titreşim kapalı')}
    </button>
  )
}

// A18: "Setlerin" şeridi. Her seri rafı: sembol, "3 / 5 kart", dolan çubuk; afişler küçük, eksik kartlar soluk.
// Soluk afişe dokununca hangi filmin eksik olduğu ve neden (henüz çıkmadı / izlenmemiş) yazılır.
function SetStrip({ shelves, cards, done, doneCount }: { shelves: KoleksiyonShelf[] | null; cards: OdulData['cards']; done: Record<string, { name: string }>; doneCount: number }) {
  const [pick, setPick] = useState<{ shelf: string; rowId: string } | null>(null)
  const sets = useMemo(() => {
    if (!shelves) return []
    return shelves
      .map((sh) => {
        const mem = shelfSetMembers(sh)
        if (!mem.length) return null
        const films = mem.map((id) => sh.items.find((it) => it.row.id === id)).filter((x): x is NonNullable<typeof x> => Boolean(x))
        const have = films.filter((f) => cards[f.row.id]).length
        return { key: sh.key, name: sh.name, symbol: sh.symbol, films, have, complete: Boolean(done[sh.key]) || have === films.length }
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => Number(a.complete) - Number(b.complete) || b.have / b.films.length - a.have / a.films.length || a.name.localeCompare(b.name, 'tr'))
  }, [shelves, cards, done])
  if (!shelves) return null
  if (!sets.length) return null
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{tt('Setlerin')}</h2>
          <p className="text-xs text-neutral-500">{tt('Bir serinin bütün film kartlarını topla, bir kerelik paket kazan. Soluk afişe dokun: hangi kart eksik?')}</p>
        </div>
        {doneCount > 0 && <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300 inline-flex items-center gap-1"><Icon name="sparkle" className="h-3 w-3" /> {tt('{0} set tamam', doneCount)}</span>}
      </div>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {sets.map((s) => {
          const sel = pick?.shelf === s.key ? s.films.find((f) => f.row.id === pick.rowId) : undefined
          return (
            <div key={s.key} className={`w-[260px] shrink-0 snap-start rounded-2xl border bg-neutral-900 p-3 ${s.complete ? 'border-amber-400/40' : 'border-neutral-800'}`}>
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-950 p-1.5">
                  {s.symbol ? <img src={s.symbol} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-lg text-neutral-600">◆</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{s.name}</b>
                  <span className={`text-[11px] ${s.complete ? 'font-semibold text-amber-300' : 'text-neutral-400'}`}>{s.complete ? <><Icon name="sparkle" className="h-3 w-3 inline -mt-0.5" /> {tt('Set tamam')}</> : tt('{0} / {1} kart', s.have, s.films.length)}</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: setTierFor(s.films.length) === 'altin' ? '#ffbf1f' : '#9aa4bf' }}>
                  {setTierFor(s.films.length) === 'altin' ? tt('Altın') : tt('Gümüş')}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div className="h-full rounded-full transition-all" style={{ width: `${(s.have / s.films.length) * 100}%`, background: s.complete ? 'linear-gradient(90deg,#c89211,#ffe48a)' : '#00c0fa' }} />
              </div>
              <div className="mt-2.5 flex gap-1.5 overflow-hidden">
                {s.films.slice(0, 8).map((f) => {
                  const got = Boolean(cards[f.row.id])
                  return (
                    <button
                      key={f.row.id}
                      onClick={() => setPick(pick?.rowId === f.row.id && pick.shelf === s.key ? null : { shelf: s.key, rowId: f.row.id })}
                      className={`relative aspect-[2/3] w-[26px] shrink-0 overflow-hidden rounded-[4px] border transition ${got ? 'border-transparent' : 'border-dashed border-neutral-600'} ${pick?.rowId === f.row.id && pick.shelf === s.key ? 'ring-2 ring-[#00c0fa]' : ''}`}
                      title={f.title}
                    >
                      <img src={f.poster} alt="" loading="lazy" className="h-full w-full object-cover" style={got ? undefined : { opacity: 0.22, filter: 'grayscale(1)' }} />
                    </button>
                  )
                })}
                {s.films.length > 8 && <span className="self-center text-[10px] text-neutral-500">+{s.films.length - 8}</span>}
              </div>
              {sel && (
                <p className="mt-2 text-[11px] leading-snug text-neutral-300">
                  {cards[sel.row.id] ? tt('{0} — kartın var.', sel.title) : tt('{0} — bu kart henüz çıkmadı. Paket açtıkça çıkabilir.', sel.title)}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// Albüm kartı: ızgara hücresinin genişliğini alır
function AutoCard({ reward }: { reward: OdulReward }) {
  const [w, setW] = useState(0)
  return (
    <div
      ref={(el) => {
        if (el && Math.abs(el.clientWidth - w) > 1) setW(el.clientWidth)
      }}
      className="w-full"
      style={{ aspectRatio: '1 / 1.48' }}
    >
      {w > 0 && <RewardCard reward={reward} w={w} still />}
    </div>
  )
}
