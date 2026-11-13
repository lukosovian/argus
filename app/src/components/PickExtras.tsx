import { useEffect, useMemo, useState } from 'react'
import type { Board, Row } from '../types'
import { titleText } from '../types'
import { resolveRole } from '../lib/roles'
import { normalizeAgeRating } from '../lib/ageRating'
import { tt } from '../lib/i18n'

// Ne İzlesem ekstraları (v1.23.4, Ayarlar › Ekstralar): "üç aday" ekranı ve "bu akşam" soruları.

// ---------- Bu akşam soruları ----------
export type WizardAnswers = { who: string | null; time: string | null; mood: string | null }

const WHO = [
  { id: 'yalniz', label: tt('Yalnız') },
  { id: 'sevgili', label: tt('Sevgilimle') },
  { id: 'arkadas', label: tt('Arkadaşlarla') },
  { id: 'aile', label: tt('Ailecek') },
]
const TIME = [
  { id: 'kisa', label: tt('1,5 saat'), max: 100 },
  { id: 'orta', label: tt('2,5 saat'), max: 150 },
  { id: 'gece', label: tt('Bütün gece'), max: null },
  { id: 'bolum', label: tt('Bir bölümlük'), max: null },
]
// Ruh hali → tür adlarında aranacak parçalar (TR ve EN tür adları)
const MOOD: { id: string; label: string; genres: string[] }[] = [
  { id: 'gul', label: tt('Gülmek'), genres: ['komedi', 'comedy'] },
  { id: 'agla', label: tt('Ağlamak'), genres: ['dram', 'drama', 'romant'] },
  { id: 'geril', label: tt('Gerilmek'), genres: ['gerilim', 'korku', 'thriller', 'horror', 'gizem', 'mystery', 'suç', 'crime'] },
  { id: 'dusun', label: tt('Düşünmek'), genres: ['bilim', 'science', 'belgesel', 'documentary', 'gizem', 'mystery', 'tarih', 'history'] },
  { id: 'kafa', label: tt('Kafa dağıtmak'), genres: ['aksiyon', 'action', 'macera', 'adventure', 'animasyon', 'animation', 'komedi', 'comedy'] },
  { id: 'buyu', label: tt('Büyülenmek'), genres: ['fantastik', 'fantasy', 'bilim', 'science', 'animasyon', 'animation', 'aile', 'family'] },
]

export function applyWizard(board: Board, rows: Row[], a: WizardAnswers): Row[] {
  const tur = resolveRole(board, 'tur')
  const sure = resolveRole(board, 'sure')
  const kategori = resolveRole(board, 'kategori')
  const yas = resolveRole(board, 'yas')
  const isSeries = (r: Row) => /dizi|series|tv/i.test(kategori?.options?.find((o) => o.id === r.values[kategori.id])?.label ?? '')
  let out = rows
  const t = TIME.find((x) => x.id === a.time)
  if (t?.id === 'bolum') out = out.filter(isSeries)
  else if (t?.max && sure) out = out.filter((r) => !(typeof r.values[sure.id] === 'number' && (r.values[sure.id] as number) > t.max!) && !isSeries(r))
  const m = MOOD.find((x) => x.id === a.mood)
  if (m && tur) {
    const labels = new Map((tur.options ?? []).map((o) => [o.id, o.label.toLocaleLowerCase('tr')]))
    out = out.filter((r) => {
      const v = r.values[tur.id]
      const ids = Array.isArray(v) ? (v as string[]) : typeof v === 'string' ? [v] : []
      return ids.some((id) => m.genres.some((g) => labels.get(id)?.includes(g)))
    })
  }
  if (a.who === 'aile' && yas) out = out.filter((r) => !['16', '18'].includes(normalizeAgeRating(String(r.values[yas.id] ?? ''))?.id ?? ''))
  return out
}

export function PickWizard({ board, rows, covers, onGo, onCancel }: { board: Board; rows: Row[]; covers: (r: Row) => string; onGo: (a: WizardAnswers) => void; onCancel: () => void }) {
  const [a, setA] = useState<WizardAnswers>({ who: null, time: null, mood: null })
  const pool = useMemo(() => applyWizard(board, rows, a), [board, rows, a])
  const sample = useMemo(() => [...pool].sort(() => Math.random() - 0.5).filter((r) => covers(r)).slice(0, 7), [pool])
  const q = (key: keyof WizardAnswers, title: string, n: number, opts: { id: string; label: string }[]) => (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
      <p className="text-sm font-semibold text-neutral-100 mb-3">
        <span className="text-neutral-500 font-normal mr-1.5">{n}/3</span>
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => setA((p) => ({ ...p, [key]: p[key] === o.id ? null : o.id }))}
            className={`text-sm rounded-full px-3.5 py-1.5 border transition ${a[key] === o.id ? 'border-[#00c0fa]/70 bg-[#00c0fa]/15 text-[#bdeeff]' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-20 animate-[pickIn_.4s_ease-out]">
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-50 mb-2">{tt('Bu akşam ne olsun?')}</h2>
        <p className="text-neutral-400 mb-8">{tt('İstediğini cevapla, gerisini boş bırak.')}</p>
        <div className="w-full max-w-5xl grid gap-4 md:grid-cols-3">
          {q('who', tt('Kiminle?'), 1, WHO)}
          {q('time', tt('Ne kadar vaktin var?'), 2, TIME)}
          {q('mood', tt('Nasıl hissetmek istiyorsun?'), 3, MOOD)}
        </div>
        <div className="w-full max-w-5xl mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-[#00c0fa]/30 bg-[#00c0fa]/[0.06] px-5 py-4">
          <span className="text-3xl font-black tabular-nums text-neutral-50">{pool.length}</span>
          <span className="text-sm text-neutral-300">{tt('aday')}</span>
          <span className="flex ml-2">
            {sample.map((r) => (
              <img key={r.id} src={covers(r)} alt="" className="h-14 aspect-[2/3] object-cover rounded-md -ml-3 first:ml-0 ring-2 ring-neutral-950" />
            ))}
          </span>
          <span className="ml-auto flex gap-2">
            <button onClick={onCancel} className="text-sm rounded-full border border-neutral-700 px-4 py-2 text-neutral-300 hover:border-neutral-400">
              {tt('Vazgeç')}
            </button>
            <button disabled={!pool.length} onClick={() => onGo(a)} className="text-sm font-semibold rounded-full px-5 py-2 bg-[#00c0fa] text-black hover:brightness-110 disabled:opacity-40">
              {tt('Seç')} →
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------- Üç aday ----------
export function PickTrio<T extends { key: string; cover: string; title: string }>({ items, onFinal }: { items: T[]; onFinal: (it: T) => void }) {
  const [out, setOut] = useState<Set<string>>(new Set())
  const left = items.filter((i) => !out.has(i.key))
  useEffect(() => {
    if (left.length !== 1) return
    const t = setTimeout(() => onFinal(left[0]), 900)
    return () => clearTimeout(t)
  }, [left.length])
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-4 animate-[pickIn_.4s_ease-out]">
      <h2 className="text-3xl font-black tracking-tight text-neutral-50 mb-1">{left.length === 1 ? tt('Bu akşam bu!') : tt('Üç aday')}</h2>
      <p className="text-neutral-400 mb-8">{left.length === 1 ? '' : tt('İstemediğini ✕ ile ele, son kalan seçilir.')}</p>
      <div className="flex items-end justify-center gap-6">
        {items.map((it) => {
          const gone = out.has(it.key)
          const final = left.length === 1 && !gone
          return (
            <div
              key={it.key}
              className="group relative transition-all duration-500"
              style={{ width: gone ? 0 : 200, opacity: gone ? 0 : 1, transform: gone ? 'translateY(40px) scale(.8) rotate(-6deg)' : final ? 'scale(1.15)' : 'none', margin: gone ? '0 -12px' : undefined }}
            >
              {!final && (
                <button
                  onClick={() => setOut((s) => new Set(s).add(it.key))}
                  title={tt('Ele')}
                  className="absolute top-2 right-2 z-10 h-9 w-9 rounded-full bg-black/70 border border-rose-500 text-rose-300 opacity-0 group-hover:opacity-100 transition hover:bg-rose-500 hover:text-black"
                >
                  ✕
                </button>
              )}
              <div className="aspect-[2/3] rounded-xl overflow-hidden bg-neutral-800 shadow-2xl shadow-black/70" style={final ? { boxShadow: '0 0 0 3px #00c0fa, 0 0 60px rgba(0,192,250,.6)' } : undefined}>
                <img src={it.cover} alt="" className="h-full w-full object-cover" />
              </div>
              <p className="mt-3 text-center text-sm font-semibold text-neutral-100 truncate">{it.title}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const rowTitle = (board: Board, r?: Row) => {
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  return r && tp ? titleText(tp, r.values[tp.id]) : ''
}
