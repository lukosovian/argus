import { useEffect, useMemo, useRef, useState } from 'react'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { tt } from '../lib/i18n'

// Profil fotoğrafı ekstraları (v1.23.4, Ayarlar › Ekstralar): avatar sekmeleri + "Sana uygun", kırpma/yakınlaştırma,
// arşivden (afiş ve oyuncu fotoğrafı) seçme.

const av = (n: number) => `/avatars/profil${n}.png`
const EMOTIONS = Array.from({ length: 12 }, (_, i) => i + 1)
const HEROES = Array.from({ length: 12 }, (_, i) => i + 13)
// Tür → kahraman avatarı (13 dedektif, 14 siber, 15 şövalye, 16 ninja, 17 büyücü, 18 korsan, 19 kara film,
// 20 uzay askeri, 21 asker, 22 vampir, 23 robot, 24 kovboy)
const GENRE_HERO: [string[], number][] = [
  [['korku', 'horror'], 22],
  [['fantastik', 'fantasy'], 17],
  [['bilim', 'science'], 14],
  [['savaş', 'war'], 21],
  [['western'], 24],
  [['macera', 'adventure'], 18],
  [['gizem', 'mystery', 'suç', 'crime'], 13],
  [['gerilim', 'thriller'], 19],
  [['aksiyon', 'action'], 16],
  [['tarih', 'history'], 15],
  [['animasyon', 'animation', 'aile', 'family'], 23],
]

function useTopGenreHero(enabled: boolean): { avatar: number; genre: string } | null {
  const { settings } = useHomeSettings()
  const id = enabled ? (settings.boardId ?? undefined) : undefined
  const { board } = useBoard(id)
  const { rows } = useRows(id)
  return useMemo(() => {
    if (!board || !rows.length) return null
    const tur = resolveRole(board, 'tur')
    const durum = resolveRole(board, 'durum')
    const izlendi = resolveStatusOption(board, 'izlendi')
    if (!tur) return null
    const count = new Map<string, number>()
    for (const r of rows) {
      if (durum && izlendi && r.values[durum.id] !== izlendi) continue
      const v = r.values[tur.id]
      for (const g of Array.isArray(v) ? (v as string[]) : []) count.set(g, (count.get(g) ?? 0) + 1)
    }
    const sorted = [...count.entries()].sort((a, b) => b[1] - a[1])
    for (const [gid] of sorted) {
      const label = tur.options?.find((o) => o.id === gid)?.label ?? ''
      const l = label.toLocaleLowerCase('tr')
      const hit = GENRE_HERO.find(([keys]) => keys.some((k) => l.includes(k)))
      if (hit) return { avatar: hit[1], genre: label }
    }
    return null
  }, [board, rows])
}

export function AvatarTabs({ photo, setPhoto }: { photo: string; setPhoto: (s: string) => void }) {
  const [tab, setTab] = useState<0 | 1>(() => (HEROES.some((n) => photo === av(n)) ? 1 : 0))
  const hero = useTopGenreHero(true)
  const list = tab === 0 ? EMOTIONS : hero ? [hero.avatar, ...HEROES.filter((n) => n !== hero.avatar)] : HEROES
  return (
    <div className="mb-6">
      <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-950/60 p-1 mb-3">
        {[tt('😊 Duygular'), tt('🦸 Kahramanlar')].map((l, i) => (
          <button key={l} onClick={() => setTab(i as 0 | 1)} className={`text-sm rounded-lg px-3 py-1.5 transition ${tab === i ? 'bg-neutral-800 text-neutral-50 ring-1 ring-[#00c0fa]/40' : 'text-neutral-400 hover:text-neutral-200'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-3">
        {list.map((n) => {
          const src = av(n)
          const fit = tab === 1 && hero?.avatar === n
          return (
            <button key={n} type="button" onClick={() => setPhoto(src)} title={fit ? tt('En çok {0} izliyorsun', hero!.genre) : undefined} className={`relative aspect-square rounded-xl border-2 transition hover:-translate-y-0.5 ${photo === src ? 'border-[#00c0fa]' : 'border-transparent hover:border-neutral-600'}`}>
              <img src={src} alt="" className="h-full w-full object-cover rounded-[10px]" />
              {fit && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#00c0fa] px-1.5 py-0.5 text-[9px] font-bold text-black">{tt('Sana uygun')}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Kırp ve yakınlaştır: kare çerçevede sürükle, tekerlek ya da kaydırıcıyla yakınlaştır; 256×256 JPEG verir
export function CropEditor({ src, onDone, onCancel }: { src: string; onDone: (dataUrl: string) => void; onCancel: () => void }) {
  const BOX = 260
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const i = new Image()
    i.onload = () => {
      setImg(i)
      setZoom(1)
      const base = BOX / Math.min(i.width, i.height)
      setPos({ x: (BOX - i.width * base) / 2, y: (BOX - i.height * base) / 4 })
    }
    i.src = src
  }, [src])
  const base = img ? BOX / Math.min(img.width, img.height) : 1
  const w = img ? img.width * base * zoom : BOX
  const h = img ? img.height * base * zoom : BOX
  const clamp = (p: { x: number; y: number }, ww = w, hh = h) => ({ x: Math.min(0, Math.max(BOX - ww, p.x)), y: Math.min(0, Math.max(BOX - hh, p.y)) })
  function setZ(z: number) {
    const nz = Math.min(4, Math.max(1, z))
    const nw = img ? img.width * base * nz : BOX
    const nh = img ? img.height * base * nz : BOX
    const cx = BOX / 2 - pos.x
    const cy = BOX / 2 - pos.y
    setPos(clamp({ x: BOX / 2 - (cx * nz) / zoom, y: BOX / 2 - (cy * nz) / zoom }, nw, nh))
    setZoom(nz)
  }
  function done() {
    if (!img) return
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const k = 256 / BOX
    c.getContext('2d')!.drawImage(img, pos.x * k, pos.y * k, w * k, h * k)
    onDone(c.toDataURL('image/jpeg', 0.88))
  }
  return (
    <div className="flex flex-col items-center gap-3 mb-6">
      <div
        className="relative overflow-hidden rounded-2xl bg-black cursor-grab active:cursor-grabbing select-none"
        style={{ width: BOX, height: BOX }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => drag.current && setPos(clamp({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }))}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => setZ(zoom - e.deltaY * 0.0015)}
      >
        {img && <img src={src} alt="" draggable={false} className="absolute max-w-none pointer-events-none" style={{ left: pos.x, top: pos.y, width: w, height: h }} />}
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-[#00c0fa]" />
      </div>
      <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZ(Number(e.target.value))} className="w-56 accent-[#00c0fa]" />
      <p className="text-xs text-neutral-500">{tt('Sürükleyerek yerini, kaydırarak yakınlığını ayarla')}</p>
      <div className="flex gap-2">
        <button onClick={done} className="text-sm font-semibold rounded-lg px-4 py-1.5 bg-[#00c0fa] text-black hover:brightness-110">
          {tt('Bunu kullan')}
        </button>
        <button onClick={onCancel} className="text-sm rounded-lg px-4 py-1.5 border border-neutral-700 text-neutral-300 hover:border-neutral-500">
          {tt('Vazgeç')}
        </button>
      </div>
    </div>
  )
}

// Arşivden seç: son izlediklerinin afişleri ve en çok karşına çıkan oyuncuların fotoğrafları
export function ArchivePick({ onPick }: { onPick: (src: string) => void }) {
  const { settings } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows } = useRows(settings.boardId ?? undefined)
  const [tab, setTab] = useState<0 | 1>(0)
  const { posters, people } = useMemo(() => {
    if (!board) return { posters: [] as string[], people: [] as { src: string; name: string }[] }
    const poster = resolveRole(board, 'poster')
    const cast = resolveRole(board, 'oyuncular')
    const sorted = [...rows].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    const posters = poster ? [...new Set(sorted.map((r) => r.values[poster.id] as string).filter(Boolean))].slice(0, 30) : []
    const count = new Map<string, number>()
    if (cast) for (const r of rows) for (const id of Array.isArray(r.values[cast.id]) ? (r.values[cast.id] as string[]) : []) count.set(id, (count.get(id) ?? 0) + 1)
    const people = (cast?.options ?? [])
      .filter((o) => o.image)
      .sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0))
      .slice(0, 30)
      .map((o) => ({ src: o.image!, name: o.label }))
    return { posters, people }
  }, [board, rows])
  const list = tab === 0 ? posters.map((src) => ({ src, name: '' })) : people
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2.5">
        <p className="text-sm text-neutral-400">{tt('ya da arşivinden seç')}</p>
        <div className="ml-auto inline-flex rounded-lg border border-neutral-800 p-0.5">
          {[tt('Afişler'), tt('Oyuncular')].map((l, i) => (
            <button key={l} onClick={() => setTab(i as 0 | 1)} className={`text-xs rounded-md px-2.5 py-1 ${tab === i ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-500'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {list.map((p) => (
          <button key={p.src} onClick={() => onPick(p.src)} title={p.name} className={`shrink-0 overflow-hidden border-2 border-transparent hover:border-[#00c0fa] transition ${tab === 0 ? 'h-20 aspect-[2/3] rounded-md' : 'h-16 w-16 rounded-full'}`}>
            <img src={p.src} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
        {!list.length && <p className="text-xs text-neutral-600">{tt('Burada gösterecek görsel yok.')}</p>}
      </div>
    </div>
  )
}
