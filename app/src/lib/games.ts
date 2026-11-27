import { useEffect, useMemo, useState } from 'react'
import type { Board, Row } from '../types'
import { ratingAverage, titleText } from '../types'
import { resolveRole, watchedStatusIds } from './roles'
import { api, type OdulTier } from './api'
import { readStore, writeStore } from './profileStore'

// Oyun salonu (v1.24): kullanıcının oyun sunumundan seçtikleri. Bütün oyunlar arşivdeki kayıtlardan oynanır; bu dosya
// ortak parçaları tutar: oyun havuzu (her kaydın adı, afişi, yılı, puanı, süresi, türleri, ülkeleri, yönetmeni,
// oyuncuları, sinopsisi), rekorlar (profil + oyun başına, profil deposunda), sesler (kapalı başlar) ve Ödüller'e paket.

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
    // Latin dışı (Kiril, Japonca, Arapça…) adlar da silinmesin — eskiden boş kalıp önerilerde hiç çıkmıyordu
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Dört şıklı oyunlar için yanlış şıklar: adı (fold) doğru cevapla aynı olanlar (kopya kayıt, yeniden çevrim)
// ve birbirinin aynısı olanlar şık olmasın — yoksa iki "doğru" görünen şık çıkıyordu.
export function wrongOptions<T>(list: T[], ans: T, name: (x: T) => string, n = 3, rand = Math.random): T[] {
  const used = new Set([fold(name(ans))])
  const out: T[] = []
  for (const x of shuffle(list, rand)) {
    const k = fold(name(x))
    if (!k || used.has(k)) continue
    used.add(k)
    out.push(x)
    if (out.length >= n) break
  }
  return out
}

// ---- rekorlar, son skorlar, günlük oyun: profil deposunda (H7, v1.27) --------------------------------------
// Eskiden sadece bu bilgisayarın localStorage'ındaydı (telefona gitmiyor, yedeğe girmiyordu). Şimdi profilin
// 'oyunlar' deposunda (/api/profiles/<id>/store/oyunlar). Oyun içinde anında okunabilsin diye bellekte tutulur,
// yazma arka planda (biraz bekletip) yapılır. Telefonda depo isteği çevrimdışı da çalışır (fetchShim önbelleği).
// İlk açılışta localStorage'daki eski kayıtlar depoya katılır (en yüksek rekor kazanır), yazılınca silinir.
type DailyMap = Record<string, unknown>
interface GameData {
  rekor: Record<string, number>
  gecmis: Record<string, number[]>
  gunluk: Record<string, DailyMap>
}
const GAME_STORE = 'oyunlar'
const GAME_EVT = 'argus-oyun-verisi'
const LEGACY = { rekor: 'argus_oyun_rekor_', gecmis: 'argus_oyun_gecmis_', gunluk: 'argus_oyun_gunluk_' } as const
const mem = new Map<string, GameData>()
const loaded = new Set<string>()
const loadingP = new Map<string, Promise<void>>()
const failedAt = new Map<string, number>()
// Bu cihazda değişen ama henüz depoya yazılmamış parçalar (birleştirirken bunlar kazanır)
const dirty = new Map<string, { gecmis: Set<string>; gunluk: Set<string> }>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let gameVer = 0

const emptyData = (): GameData => ({ rekor: {}, gecmis: {}, gunluk: {} })
const isObj = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

function cleanData(x: unknown): GameData {
  const d = emptyData()
  if (!isObj(x)) return d
  if (isObj(x.rekor)) for (const [k, v] of Object.entries(x.rekor)) if (Number(v) > 0) d.rekor[k] = Number(v)
  if (isObj(x.gecmis)) for (const [k, v] of Object.entries(x.gecmis)) if (Array.isArray(v)) d.gecmis[k] = v.map(Number).filter(Number.isFinite).slice(-10)
  if (isObj(x.gunluk)) for (const [k, v] of Object.entries(x.gunluk)) if (isObj(v)) d.gunluk[k] = { ...v }
  return d
}

function legacyKeys(pid: string): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && Object.values(LEGACY).some((p) => k.startsWith(`${p}${pid}_`))) out.push(k)
    }
  } catch {
    /* localStorage yok */
  }
  return out
}
function legacyData(pid: string): GameData {
  const d = emptyData()
  for (const k of legacyKeys(pid)) {
    try {
      const raw = localStorage.getItem(k) ?? ''
      if (k.startsWith(`${LEGACY.rekor}${pid}_`)) d.rekor[k.slice(`${LEGACY.rekor}${pid}_`.length)] = Number(raw) || 0
      else if (k.startsWith(`${LEGACY.gecmis}${pid}_`)) d.gecmis[k.slice(`${LEGACY.gecmis}${pid}_`.length)] = JSON.parse(raw)
      else d.gunluk[k.slice(`${LEGACY.gunluk}${pid}_`.length)] = JSON.parse(raw)
    } catch {
      /* bozuk eski kayıt atlanır */
    }
  }
  return cleanData(d)
}

// Günlük oyunda bir günün ne kadar ilerlediği: bitmiş gün ve çok tahmin daha "ileri"
const dayRank = (x: unknown) => (isObj(x) ? (x.done ? 1000 : 0) + (Array.isArray(x.guesses) ? x.guesses.length : 0) : -1)

// Depodaki (base) ile bu cihazdakini (local) birleştirir: rekorda en yüksek; bu cihazda değişen geçmiş ve günler
// bu cihazdan; ötekilerde günlük için daha ileri olan, geçmiş için depodaki.
function mergeData(base: GameData, local: GameData, d?: { gecmis: Set<string>; gunluk: Set<string> }): GameData {
  const out = cleanData(base)
  for (const [k, v] of Object.entries(local.rekor)) out.rekor[k] = Math.max(out.rekor[k] ?? 0, v)
  for (const [k, v] of Object.entries(local.gecmis)) if (d?.gecmis.has(k) || !out.gecmis[k]) out.gecmis[k] = v
  for (const [g, days] of Object.entries(local.gunluk)) {
    const o = (out.gunluk[g] = { ...(out.gunluk[g] ?? {}) })
    for (const [day, v] of Object.entries(days)) if (d?.gunluk.has(`${g}|${day}`) || dayRank(v) > dayRank(o[day])) o[day] = v
  }
  return out
}

function bump() {
  gameVer++
  window.dispatchEvent(new Event(GAME_EVT))
}

function loadGame(pid: string): Promise<void> {
  const running = loadingP.get(pid)
  if (running) return running
  const p = readStore<GameData>(pid, GAME_STORE)
    .then((server) => {
      const base = cleanData(server)
      const before = JSON.stringify(mem.get(pid) ?? null)
      const merged = mergeData(base, mem.get(pid) ?? emptyData(), dirty.get(pid))
      mem.set(pid, merged)
      loaded.add(pid)
      // Eski localStorage kaydı ya da yazılmamış değişiklik varsa depoya yazılır
      if (legacyKeys(pid).length || JSON.stringify(merged) !== JSON.stringify(base)) scheduleWrite(pid, 0)
      if (JSON.stringify(merged) !== before) bump()
    })
    .catch(() => {
      // sunucuya ulaşılamadı: bellekteki (eski localStorage) veriyle devam; her çizimde yeniden istenmesin, 30 sn sonra
      failedAt.set(pid, Date.now())
    })
    .finally(() => loadingP.delete(pid))
  loadingP.set(pid, p)
  return p
}

function gameData(pid: string): GameData {
  let d = mem.get(pid)
  if (!d) {
    d = legacyData(pid)
    mem.set(pid, d)
  }
  if (!loaded.has(pid) && Date.now() - (failedAt.get(pid) ?? 0) > 30000) void loadGame(pid)
  return d
}

function markDirty(pid: string, kind: 'gecmis' | 'gunluk', key: string) {
  const d = dirty.get(pid) ?? { gecmis: new Set<string>(), gunluk: new Set<string>() }
  d[kind].add(key)
  dirty.set(pid, d)
}

function scheduleWrite(pid: string, wait = 600) {
  clearTimeout(timers.get(pid))
  timers.set(
    pid,
    setTimeout(() => void flushGame(pid), wait),
  )
}

async function flushGame(pid: string) {
  timers.delete(pid)
  const local = mem.get(pid)
  if (!local) return
  const d = dirty.get(pid)
  dirty.delete(pid)
  try {
    // Yazmadan önce depodaki en güncel hal okunur (telefonda / başka cihazda oynananlar silinmesin)
    const base = cleanData(await readStore<GameData>(pid, GAME_STORE))
    const merged = mergeData(base, local, d)
    await writeStore(pid, GAME_STORE, merged)
    loaded.add(pid)
    // Yazma sürerken yeni bir değişiklik olduysa (dirty yeniden doldu) o da korunur
    const now = mem.get(pid) ?? emptyData()
    const next = mergeData(merged, now, dirty.get(pid))
    const changed = JSON.stringify(next) !== JSON.stringify(now)
    mem.set(pid, next)
    // Depoya geçti: eski localStorage kayıtları artık gerekmez
    for (const k of legacyKeys(pid)) {
      try {
        localStorage.removeItem(k)
      } catch {
        /* önemsiz */
      }
    }
    if (changed) bump()
  } catch {
    // Yazılamadı: değişiklikler kaybolmasın, biraz sonra yeniden denenir
    if (d) for (const kind of ['gecmis', 'gunluk'] as const) for (const k of d[kind]) markDirty(pid, kind, k)
    scheduleWrite(pid, 15000)
  }
}

// Ekranlar depo yüklenince / değişince yeniden çizilsin diye; verilen profillerin verisini de yükletir
export function useGameData(pids: (string | null | undefined)[]) {
  const [v, setV] = useState(gameVer)
  const key = pids.filter(Boolean).join(',')
  useEffect(() => {
    const ids = key.split(',').filter(Boolean)
    const h = () => setV(gameVer)
    window.addEventListener(GAME_EVT, h)
    // İlk kez okunuyorsa yüklenir; zaten yüklüyse başka cihazdan gelenler için bir kez daha okunur
    for (const p of ids) {
      if (loaded.has(p)) void loadGame(p)
      else gameData(p)
    }
    return () => window.removeEventListener(GAME_EVT, h)
  }, [key])
  return v
}

export function readRecord(pid: string, game: string): number {
  return gameData(pid).rekor[game] ?? 0
}
// Rekor kırıldıysa true
export function saveRecord(pid: string, game: string, score: number): boolean {
  const d = gameData(pid)
  if (score <= (d.rekor[game] ?? 0)) return false
  d.rekor[game] = score
  scheduleWrite(pid)
  return true
}
// Son oyunların skorları (sonuç ekranındaki grafik için)
export function pushHistory(pid: string, game: string, score: number): number[] {
  const d = gameData(pid)
  const h = [...(d.gecmis[game] ?? []), score].slice(-10)
  d.gecmis[game] = h
  markDirty(pid, 'gecmis', game)
  scheduleWrite(pid)
  return h
}

// ---- günlük oyun durumu (Günün yapımı) ---------------------------------------------------------------
export function readDaily<T>(pid: string, game: string): Record<string, T> {
  return { ...(gameData(pid).gunluk[game] ?? {}) } as Record<string, T>
}
export function writeDaily<T>(pid: string, game: string, data: Record<string, T>) {
  const d = gameData(pid)
  const prev = d.gunluk[game] ?? {}
  for (const day of Object.keys(data)) if (JSON.stringify(prev[day]) !== JSON.stringify(data[day])) markDirty(pid, 'gunluk', `${game}|${day}`)
  d.gunluk[game] = { ...data }
  scheduleWrite(pid)
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
