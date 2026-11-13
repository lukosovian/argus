import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { OdulReward, OdulTier } from '../lib/api'
import { CATALOG, RARITY_COLORS, RARITY_NAMES, TIERS, rollPack, tierOf, useOduller, type ItemKind } from '../lib/oduller'
import { useToast } from '../hooks/useToast'
import { useEscape } from '../hooks/useEscape'
import { tt } from '../lib/i18n'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import PackOpening from '../components/odul/PackOpening'
import { CardBack, ItemArt, RewardCard } from '../components/odul/RewardCard'
import '../components/odul/odul.css'

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
function CardZoom({ reward, backKey, no, onClose }: { reward: OdulReward; backKey?: string; no?: number; onClose: () => void }) {
  useEscape(true, onClose)
  const ref = useRef<HTMLDivElement>(null)
  const [flip, setFlip] = useState(false)
  const w = Math.min(320, window.innerWidth - 64, (window.innerHeight - 120) / 1.48)
  return createPortal(
    <div
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
        <div ref={ref} className="oc-tilt relative" onClick={() => setFlip((f) => !f)}>
          <RewardCard reward={reward} w={w} backKey={backKey} shown={!flip} no={no}>
            <div className="oc-glare" />
          </RewardCard>
        </div>
        <p className="text-xs text-neutral-400">{tt('Çevirmek için karta tıkla')}</p>
      </div>
    </div>,
    document.body,
  )
}

export default function Oduller() {
  const { data, stats, available, pool, act, ready } = useOduller(true)
  const { notify } = useToast()
  const RN = RARITY_NAMES()
  const [opening, setOpening] = useState<{ id: string; tier: OdulTier; rewards: OdulReward[]; badges: ({ text: string; dup?: boolean } | null)[]; posters: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<number | 'parlak' | null>(null)
  const [zoom, setZoom] = useState<{ reward: OdulReward; no: number } | null>(null)

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
  const shownCards = cards.filter((c) => (filter === null ? true : filter === 'parlak' ? c.foil : c.r === filter))

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
      await act({ action: 'open', tier, opId: id, pity, rewards })
      const posters = [...pool].sort(() => Math.random() - 0.5).slice(0, 3).map((p) => p.poster)
      setOpening({ id, tier, rewards, badges, posters })
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Paket açılamadı'), 'danger')
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-300" title={tt('Kopyalardan biriken makarayla paket alabilirsin')}>
            🎞️ {tt('{0} makara', data.makara)}
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
                      🎞️ {t.price}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-neutral-600">{tt('10 paket üst üste epik çıkmazsa bir sonrakinde epik garanti.')}</p>
      </section>

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
        {shownCards.length ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
            {shownCards.map((c) => {
              const rw: OdulReward = { kind: 'card', rowId: c.rowId, r: c.r, title: c.title, poster: c.poster, year: c.year, rating: c.rating, foil: c.foil }
              return (
                <button key={c.rowId} className="relative text-left transition hover:-translate-y-1" onClick={() => setZoom({ reward: rw, no: numberOf.get(c.rowId) ?? 0 })}>
                  <AutoCard reward={rw} />
                  {c.n > 1 && <span className="absolute bottom-1.5 right-1.5 z-10 rounded-full bg-black/70 px-1.5 text-[10px] font-bold text-neutral-200">×{c.n}</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-800 py-10 text-center text-sm text-neutral-500">{cards.length ? tt('Bu nadirlikte kartın yok.') : tt('Henüz kart yok. İlk paketini aç!')}</div>
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
      {zoom && <CardZoom reward={zoom.reward} no={zoom.no} backKey={data.equip.back} onClose={() => setZoom(null)} />}
    </div>
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
