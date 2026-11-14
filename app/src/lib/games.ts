import { useMemo } from 'react'
import type { Board, Row } from '../types'
import { ratingAverage, titleText } from '../types'
import { resolveRole, watchedStatusIds } from './roles'
import { api, type OdulTier } from './api'

// Oyun salonu (v1.24): kullanıcının oyun sunumundan seçtikleri. Bütün oyunlar arşivdeki kayıtlardan oynanır; bu dosya
// ortak parçaları tutar: oyun havuzu (her kaydın adı, afişi, yılı, puanı, süresi, türleri, ülkeleri, yönetmeni,
// oyuncuları, sinopsisi), rekorlar (profil + oyun başına, bu bilgisayarda), sesler (kapalı başlar) ve Ödüller'e paket.

export interface GameItem {
  row: Row
  id: string
  title: string
  orig: string
  poster: string
  year: number | null
  score: number | null
  runtime: number | null
  series: boolean
  genres: string[]
  countries: string[]
  director: string
  actors: { id: string; name: string; image?: string }[]
  synopsis: string
  watched: boolean
}

const labels = (prop: ReturnType<typeof resolveRole>, v: unknown): string[] => {
  if (!prop) return []
  const ids = Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []
  return ids.map((id) => prop.options?.find((o) => o.id === id)?.label ?? '').filter(Boolean)
}

export function buildGamePool(board: Board, rows: Row[]): GameItem[] {
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  if (!tp) return []
  const r = (k: Parameters<typeof resolveRole>[1]) => resolveRole(board, k)
  const poster = r('poster')
  const vizyon = r('vizyon')
  const puan = r('puan')
  const sure = r('sure')
  const kat = r('kategori')
  const tur = r('tur')
  const ulke = r('ulke')
  const yon = r('yonetmen')
  const oy = r('oyuncular')
  const sin = r('sinopsis')
  const orig = r('orjinalAdi')
  const durum = r('durum')
  const done = watchedStatusIds(board)
  return rows
    .map((row): GameItem => {
      const v = row.values
      const y = vizyon ? Number(String(v[vizyon.id] ?? '').slice(0, 4)) : NaN
      const actorIds = oy && Array.isArray(v[oy.id]) ? (v[oy.id] as string[]) : []
      const dv = yon ? v[yon.id] : null
      return {
        row,
        id: row.id,
        title: titleText(tp, v[tp.id]),
        orig: orig && typeof v[orig.id] === 'string' ? (v[orig.id] as string) : '',
        poster: poster ? String(v[poster.id] ?? '') : '',
        year: Number.isFinite(y) && y > 1880 ? y : null,
        score: puan ? ratingAverage(v[puan.id], puan) : null,
        runtime: sure && typeof v[sure.id] === 'number' ? (v[sure.id] as number) : null,
        series: /dizi|series|tv/i.test(labels(kat, v[kat?.id ?? ''])[0] ?? ''),
        genres: labels(tur, tur ? v[tur.id] : null),
        countries: labels(ulke, ulke ? v[ulke.id] : null),
        director: yon?.type === 'text' ? String(dv ?? '') : labels(yon, dv).join(', '),
        actors: actorIds
          .map((id) => {
            const o = oy?.options?.find((x) => x.id === id)
            return o ? { id, name: o.label, image: o.image } : null
          })
          .filter(<T,>(x: T | null): x is T => Boolean(x)),
        synopsis: sin && typeof v[sin.id] === 'string' ? (v[sin.id] as string) : '',
        watched: Boolean(durum && done.has(v[durum.id] as string)),
      }
    })
    .filter((x) => x.title)
}

export function useGamePool(board: Board | null | undefined, rows: Row[]) {
  return useMemo(() => (board ? buildGamePool(board, rows) : []), [board, rows])
}

// İzlediklerin yeterliyse onlar, değilse bütün arşiv
export function preferWatched(pool: GameItem[], min = 15) {
  const w = pool.filter((x) => x.watched)
  return w.length >= min ? w : pool
}

export function shuffle<T>(a: T[], rand = Math.random): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

// Günün oyunları için tarihe bağlı tohumlu rastgele (aynı gün herkese aynı)
export function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ---- rekorlar --------------------------------------------------------------------------------------
const recKey = (pid: string, game: string) => `argus_oyun_rekor_${pid}_${game}`
export function readRecord(pid: string, game: string): number {
  try {
    return Number(localStorage.getItem(recKey(pid, game)) ?? 0) || 0
  } catch {
    return 0
  }
}
// Rekor kırıldıysa true
export function saveRecord(pid: string, game: string, score: number): boolean {
  const prev = readRecord(pid, game)
  if (score <= prev) return false
  try {
    localStorage.setItem(recKey(pid, game), String(score))
  } catch {
    /* önemsiz */
  }
  return true
}
// Son oyunların skorları (sonuç ekranındaki grafik için)
const histKey = (pid: string, game: string) => `argus_oyun_gecmis_${pid}_${game}`
export function pushHistory(pid: string, game: string, score: number): number[] {
  let h: number[] = []
  try {
    h = JSON.parse(localStorage.getItem(histKey(pid, game)) ?? '[]')
  } catch {
    h = []
  }
  h = [...h, score].slice(-10)
  try {
    localStorage.setItem(histKey(pid, game), JSON.stringify(h))
  } catch {
    /* önemsiz */
  }
  return h
}

// ---- günlük oyun durumu (Günün yapımı) ---------------------------------------------------------------
export function readDaily<T>(pid: string, game: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(`argus_oyun_gunluk_${pid}_${game}`) ?? '{}')
  } catch {
    return {}
  }
}
export function writeDaily<T>(pid: string, game: string, data: Record<string, T>) {
  try {
    localStorage.setItem(`argus_oyun_gunluk_${pid}_${game}`, JSON.stringify(data))
  } catch {
    /* önemsiz */
  }
}

// ---- sesler (S10): Web Audio ile kısa sesler; ayar kapalıysa hiç çalmaz ---------------------------------
export type SoundMode = 'kapali' | 'sonuc' | 'hepsi'
const SOUND_KEY = 'argus_oyun_ses'
export function soundMode(): SoundMode {
  try {
    const v = localStorage.getItem(SOUND_KEY)
    return v === 'sonuc' || v === 'hepsi' ? v : 'kapali'
  } catch {
    return 'kapali'
  }
}
export function setSoundMode(m: SoundMode) {
  try {
    localStorage.setItem(SOUND_KEY, m)
  } catch {
    /* önemsiz */
  }
}
let ctx: AudioContext | null = null
function tone(freqs: number[], dur = 0.12, type: OscillatorType = 'sine', gap = 0.09, vol = 0.12) {
  try {
    ctx = ctx ?? new AudioContext()
    const t0 = ctx.currentTime
    freqs.forEach((f, i) => {
      const o = ctx!.createOscillator()
      const g = ctx!.createGain()
      o.type = type
      o.frequency.value = f
      g.gain.setValueAtTime(vol, t0 + i * gap)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * gap + dur)
      o.connect(g).connect(ctx!.destination)
      o.start(t0 + i * gap)
      o.stop(t0 + i * gap + dur + 0.02)
    })
  } catch {
    /* ses çalınamadı */
  }
}
export const sfx = {
  ok: () => soundMode() !== 'kapali' && tone([660, 880], 0.14),
  bad: () => soundMode() !== 'kapali' && tone([220, 165], 0.18, 'square', 0.12, 0.06),
  tick: () => soundMode() === 'hepsi' && tone([1200], 0.04, 'square', 0, 0.04),
  streak: () => soundMode() === 'hepsi' && tone([523, 659, 784, 1047], 0.12, 'triangle', 0.07),
  end: () => soundMode() !== 'kapali' && tone([392, 523, 659], 0.22, 'triangle', 0.12),
}

// ---- Ödüller'e paket (O2) ----------------------------------------------------------------------------
// Oyunu bitirmek bronz (günde en çok 3), rekor kırmak gümüş (oyun başına günde 1), günlük oyunda 7 gün seri altın.
// Sunucu aynı anahtarı ikinci kez saymaz. Ödüller açık değilse (ya da başlatılmamışsa) bir şey olmaz.
export async function gameReward(key: string, tier: OdulTier): Promise<boolean> {
  try {
    const r = await api.odulGame(key, tier)
    if (r.granted) window.dispatchEvent(new Event('argus-oduller-degisti'))
    return Boolean(r.granted)
  } catch {
    return false
  }
}
