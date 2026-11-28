import { useMemo } from 'react'
import type { Board } from '../../types'
import { resolveRole } from '../../lib/roles'
import { shuffle, type GameItem } from '../../lib/games'
import { tt } from '../../lib/i18n'

// O1 Oyun kartlarının üstü (Arayüz Önerileri 3): her kart oyunun kendisini gösterir, arşivdeki gerçek görsellerle —
// "Hangisi yüksek" iki afiş + VS, "Zaman çizelgesi" çizgi üstünde afişler ve yıllar, "Sinopsisten bil" adı karartılmış
// özet, "Sahneden bil" bulanık sahne + ?, "Oyuncuyu bil" bulanık oyuncu fotoğrafı, "Günün yapımı" gizli afiş + tahmin
// kareleri, "Oyuncu zinciri" iki oyuncu ve aralarındaki ortak yapım. Görseller sayfa her açıldığında rastgele seçilir.

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Özette yapımın adı geçen yerler kara bant olur
function masked(text: string, title: string) {
  const parts = title.trim().length > 1 ? text.split(new RegExp(`(${esc(title.trim())})`, 'gi')) : [text]
  return parts.map((p, i) =>
    i % 2 ? (
      <span key={i} className="rounded-sm bg-white/80 text-transparent select-none">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  )
}

const fade = <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/30 to-transparent pointer-events-none" />

export default function GameCardArt({ game, pool, board }: { game: string; pool: GameItem[]; board: Board | null | undefined }) {
  const pick = useMemo(() => {
    const withPoster = shuffle(pool.filter((x) => x.poster))
    const banner = board ? resolveRole(board, 'banner') : undefined
    const bannerOf = (x: GameItem) => (banner ? String(x.row.values[banner.id] ?? '') : '')
    // Oyuncular: en çok yapımda geçen, fotoğrafı olanlar
    const count = new Map<string, { name: string; image: string; n: number }>()
    for (const x of pool) for (const a of x.actors) if (a.image) count.set(a.id, { name: a.name, image: a.image, n: (count.get(a.id)?.n ?? 0) + 1 })
    const topActors = [...count.values()].sort((a, b) => b.n - a.n).slice(0, 12)
    const scene = shuffle(pool.filter((x) => bannerOf(x)))[0]
    const chain = shuffle(pool.filter((x) => x.poster && x.actors.filter((a) => a.image).length >= 2))[0]
    return {
      vs: withPoster.slice(0, 2),
      line: withPoster.filter((x) => x.year).slice(0, 4).sort((a, b) => (a.year ?? 0) - (b.year ?? 0)),
      syn: shuffle(pool.filter((x) => x.synopsis.length > 60))[0],
      scene: scene ? bannerOf(scene) : (withPoster[2]?.poster ?? ''),
      actor: shuffle(topActors)[0],
      daily: withPoster[3],
      chain: chain ? { item: chain, a: chain.actors.filter((a) => a.image)[0], b: chain.actors.filter((a) => a.image)[1] } : null,
    }
  }, [pool, board])

  if (game === 'yuksek' && pick.vs.length === 2)
    return (
      <div className="absolute inset-0 grid grid-cols-2">
        {pick.vs.map((x) => (
          <img key={x.id} src={x.poster} alt="" className="h-full w-full object-cover object-top group-hover:scale-105 transition duration-700" />
        ))}
        <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-black/80" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-amber-400 text-neutral-950 font-black text-sm flex items-center justify-center shadow-xl ring-4 ring-neutral-950/70">
          {tt('VS')}
        </span>
        {fade}
      </div>
    )

  if (game === 'zaman' && pick.line.length >= 3)
    return (
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#1b1530,#0b0b0f)' }}>
        <span className="absolute left-6 right-6 top-[78px] h-0.5 bg-violet-400/50" />
        <div className="absolute inset-x-6 top-3 flex justify-between">
          {pick.line.map((x) => (
            <div key={x.id} className="flex flex-col items-center gap-1">
              <img src={x.poster} alt="" className="h-[62px] w-[42px] rounded-md object-cover shadow-lg shadow-black/50 group-hover:-translate-y-1 transition" />
              <span className="h-2.5 w-2.5 rounded-full bg-violet-400 ring-2 ring-neutral-950" />
              <span className="text-[11px] font-bold tabular-nums" style={{ color: '#ddd6fe' }}>{x.year}</span>
            </div>
          ))}
        </div>
      </div>
    )

  if (game === 'sinopsis' && pick.syn) {
    const t = pick.syn.synopsis.length > 150 ? pick.syn.synopsis.slice(0, 150).replace(/\s+\S*$/, '') + '…' : pick.syn.synopsis
    return (
      <div className="absolute inset-0 px-5 pt-4" style={{ background: 'linear-gradient(135deg,#221b06,#0b0b0f)' }}>
        <p className="text-[12.5px] leading-snug text-white/75 line-clamp-4">
          <span className="rounded-sm bg-white/80 text-transparent select-none mr-1">{pick.syn.title}</span>
          {masked(t, pick.syn.title)}
        </p>
        <p className="absolute right-4 bottom-3 text-[11px] font-bold text-yellow-400">{tt('Bu hangi yapım?')}</p>
      </div>
    )
  }

  if (game === 'sahne' && pick.scene)
    return (
      <div className="absolute inset-0">
        <img src={pick.scene} alt="" className="absolute inset-0 h-full w-full object-cover blur-[6px] scale-110 group-hover:blur-[3px] transition duration-700" />
        {fade}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl font-black text-white/90 drop-shadow-[0_4px_12px_rgba(0,0,0,.7)]">?</span>
      </div>
    )

  if (game === 'oyuncu' && pick.actor)
    return (
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#2a0f18,#0b0b0f)' }}>
        <img src={pick.actor.image} alt="" className="absolute right-6 top-3 h-28 w-28 rounded-full object-cover blur-[7px] group-hover:blur-[4px] transition duration-700 ring-4 ring-rose-400/30" />
        <span className="absolute right-6 top-3 h-28 w-28 flex items-center justify-center text-5xl font-black text-white/90 drop-shadow-[0_4px_12px_rgba(0,0,0,.7)]">?</span>
      </div>
    )

  if (game === 'gunluk' && pick.daily) {
    // Örnek tahmin satırları: yeşil aynı, sarı yakın, gri yok
    const rowsC = ['xyxgx', 'gygxy', 'ggggg']
    const cl = { g: 'bg-emerald-500', y: 'bg-amber-400', x: 'bg-white/20' } as const
    return (
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#0a2030,#0b0b0f)' }}>
        <div className="absolute right-5 top-4 h-[104px] w-[70px] overflow-hidden rounded-lg ring-2 ring-sky-400/40">
          <img src={pick.daily.poster} alt="" className="h-full w-full object-cover blur-md scale-110" />
          <span className="absolute inset-0 flex items-center justify-center text-3xl font-black text-white/90">?</span>
        </div>
        <div className="absolute left-20 top-6 space-y-1.5">
          {rowsC.map((r, i) => (
            <div key={i} className="flex gap-1.5">
              {r.split('').map((c, j) => (
                <span key={j} className={`h-5 w-5 rounded ${cl[c as keyof typeof cl]} ${i === rowsC.length - 1 ? '' : 'opacity-80'}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (game === 'zincir' && pick.chain) {
    const face = (src: string) => <img src={src} alt="" className="h-16 w-16 rounded-full object-cover ring-4 ring-cyan-400/40 shadow-lg" />
    return (
      <div className="absolute inset-0 flex items-start justify-center gap-0 pt-5" style={{ background: 'linear-gradient(135deg,#062228,#0b0b0f)' }}>
        <div className="relative flex items-center">
          {face(pick.chain.a.image!)}
          <span className="h-0.5 w-8 bg-cyan-400/60" />
          <img src={pick.chain.item.poster} alt="" className="h-20 w-[54px] rounded-md object-cover shadow-lg shadow-black/50 group-hover:scale-105 transition" />
          <span className="h-0.5 w-8 bg-cyan-400/60" />
          {face(pick.chain.b.image!)}
        </div>
      </div>
    )
  }

  // Yeterli görsel yoksa: bulanık rastgele bir afiş (eski görünüm)
  const any = pick.vs[0]?.poster
  return any ? (
    <>
      <img src={any} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 blur-[1px] scale-110 group-hover:scale-125 transition duration-700" />
      {fade}
    </>
  ) : null
}
