import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useProfiles } from '../hooks/useProfiles'
import { useAklimda } from '../hooks/useAklimda'
import { useToast } from '../hooks/useToast'
import { fold, sfx, shuffle, useGamePool, type GameItem } from '../lib/games'
import { tt, ttx } from '../lib/i18n'
import PageSkeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import RowDetailModal from '../components/RowDetailModal'
import { FinishInfo, GameShell, useFinish, type Finish } from '../components/oyun/GameShell'

// Sahneden bil (v1.23.4; v1.23.5'te gerçek sahnelerle yeniden yapıldı). Arşivindeki yapımların TMDB'deki yazısız film
// kareleri gelir (bkz. server POST /sahneler); hangi yapım olduğunu bulursun.
// v1.24 (kullanıcının oyun sunumundan seçtikleri):
//   S2 Oyunu sen ayarla: soru sayısı (5/10/20/sonsuz-3 can), süre (8/12/20/süresiz), şık (2/4/6/yazarak), soruların
//      hangi yapımlardan geleceği (izlediklerim, bütün arşiv, film, dizi, bir tür, yıl aralığı) ve zorluk efektleri.
//      Kolay/Normal/Zor bunların hazır karışımı; hazır ayardaki rekorlar eskisi gibi, özel ayarın rekoru ayrı.
//   S3 Jokerler (%50, yıl, tür, oyuncu) — her oyunda birer tane, o sorunun puanını düşürür.
//   S4 Yeni efektler: pikselden netleşme, parça parça açılma, anahtar deliği, ayna.
//   S5 Yazarak cevapla: şık yok, adını yazarsın (öneriler arşivinden), iki kat puan.
//   S6 Sonuç ekranı: sahneye tıklayınca detay, bilemediklerini Aklımda'ya ekle, son oyunların, kazanılan paketler.
//   S10 Sesler (kapalı başlar, sağ üstteki düğme).

type Fx = 'zoom' | 'blur' | 'gray' | 'pixel' | 'tiles' | 'keyhole' | 'mirror'
type PoolKind = 'izlenen' | 'hepsi' | 'film' | 'dizi' | 'tur' | 'yil'
interface Settings {
  rounds: number // 0 = sonsuz (3 can)
  time: number // 0 = süresiz
  opts: number // 0 = yazarak
  pool: PoolKind
  genre: string
  yearFrom: number
  yearTo: number
  fx: Fx[]
  jokers: boolean
}
type Preset = 'kolay' | 'normal' | 'zor'
const PRESETS: Record<Preset, Fx[]> = { kolay: [], normal: ['zoom'], zor: ['zoom', 'blur', 'gray'] }
const BASE: Settings = { rounds: 10, time: 12, opts: 4, pool: 'izlenen', genre: '', yearFrom: 1990, yearTo: new Date().getFullYear(), fx: ['zoom'], jokers: true }
const FX_LABEL: Record<Fx, string> = {
  zoom: tt('Yakınlaşma'),
  blur: tt('Bulanık'),
  gray: tt('Siyah beyaz'),
  pixel: tt('Pikselden netleşme'),
  tiles: tt('Parça parça'),
  keyhole: tt('Anahtar deliği'),
  mirror: tt('Ayna'),
}
const SETTINGS_KEY = 'argus_sahne_ayar'
const EMPTY_TIME = 15 // süresiz modda sahnenin açılma süresi

function presetOf(s: Settings): Preset | null {
  if (s.rounds !== 10 || s.time !== 12 || s.opts !== 4) return null
  const k = [...s.fx].sort().join()
  return (Object.keys(PRESETS) as Preset[]).find((p) => [...PRESETS[p]].sort().join() === k) ?? null
}
// Hazır ayarlarda eski rekor anahtarı (v1.23.5'ten kalan rekorlar kaybolmasın), özel ayarda ayrı anahtar
function recordKey(pid: string, s: Settings) {
  const p = presetOf(s)
  if (p) return `argus_sahne_rekor_${pid}${p === 'normal' ? '' : '_' + p}`
  return `argus_sahne_rekor_${pid}_ozel_${s.rounds}-${s.time}-${s.opts}-${[...s.fx].sort().join('.')}`
}
function readRecord(pid: string, s: Settings) {
  try {
    return Number(localStorage.getItem(recordKey(pid, s)) ?? 0) || 0
  } catch {
    return 0
  }
}

interface Question {
  ans: GameItem
  opts: GameItem[]
  scenes: string[]
  focus: { x: number; y: number }
  tiles: number[]
}
type Joker = '50' | 'yil' | 'tur' | 'oyuncu'
const JOKER_MULT: Record<Joker, number> = { '50': 0.6, yil: 0.8, tur: 0.8, oyuncu: 0.7 }
interface Result {
  q: Question
  ok: boolean
  gained: number
  scene: string
}

// ---- sahne + efektler ------------------------------------------------------------------------------
function Scene({ src, fx, p, done, focus, tiles }: { src: string; fx: Fx[]; p: number; done: boolean; focus: { x: number; y: number }; tiles: number[] }) {
  const show = done ? 1 : Math.min(1, Math.max(0, p))
  const has = (f: Fx) => fx.includes(f) && !done
  const canvas = useRef<HTMLCanvasElement>(null)
  const img = useRef<HTMLImageElement | null>(null)
  // Pikselden netleşme: küçük bir tuvale çizip büyütmek (kare kare netleşir)
  const pixN = Math.round(6 + Math.pow(show, 2.2) * 260)
  useEffect(() => {
    if (!has('pixel')) return
    const draw = () => {
      const c = canvas.current
      const im = img.current
      if (!c || !im || !im.complete) return
      c.width = pixN
      c.height = Math.max(2, Math.round((pixN * 9) / 16))
      c.getContext('2d')?.drawImage(im, 0, 0, c.width, c.height)
    }
    if (!img.current || img.current.src !== src) {
      const im = new Image()
      im.onload = draw
      im.src = src
      img.current = im
    } else draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, pixN, fx.join(), done])
  const style: CSSProperties = {
    transformOrigin: `${focus.x}% ${focus.y}%`,
    transform: `scale(${has('zoom') ? 1 + 1.6 * Math.pow(1 - show, 1.2) : 1}) ${has('mirror') ? 'scaleX(-1)' : ''}`,
    filter: `${has('blur') ? `blur(${(14 * Math.pow(1 - show, 1.3)).toFixed(1)}px)` : ''} ${has('gray') ? `grayscale(${(1 - show).toFixed(2)})` : ''}`.trim() || 'none',
    transition: done ? 'transform .6s cubic-bezier(.2,.8,.2,1), filter .4s' : 'transform .12s linear, filter .12s linear',
  }
  const hiddenTiles = has('tiles') ? Math.round(tiles.length * (1 - Math.min(1, show * 1.15))) : 0
  const hide = new Set(tiles.slice(0, hiddenTiles))
  const kx = focus.x + Math.cos(p * 9) * 22
  const ky = focus.y + Math.sin(p * 12) * 18
  const kr = 60 + Math.pow(show, 1.6) * 520
  return (
    <div className="absolute inset-0">
      {has('pixel') ? (
        <canvas ref={canvas} className="h-full w-full" style={{ ...style, imageRendering: 'pixelated' }} />
      ) : (
        <img src={src} alt="" className="h-full w-full object-cover" style={style} draggable={false} />
      )}
      {has('tiles') && (
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-5">
          {tiles.map((t) => (
            <i key={t} className="bg-[#0b0c12] border border-black/60 transition-opacity duration-300" style={{ opacity: hide.has(t) ? 1 : 0 }} />
          ))}
        </div>
      )}
      {has('keyhole') && <div className="absolute inset-0" style={{ background: `radial-gradient(circle at ${kx}% ${ky}%, transparent 0 ${kr}px, #000 ${kr + 8}px)` }} />}
    </div>
  )
}

export default function SahnedenBil() {
  const { settings: home } = useHomeSettings()
  const { board } = useBoard(home.boardId ?? undefined)
  const { rows, loading } = useRows(home.boardId ?? undefined)
  const { profiles, activeProfileId } = useProfiles()
  const all = useGamePool(board, rows)
  const ak = useAklimda()
  const { notify } = useToast()
  const finishGame = useFinish('sahne')

  const [set, setSet] = useState<Settings>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
      if (v && typeof v === 'object') return { ...BASE, ...v }
      // v1.23.5'teki zorluk seçimi
      const m = localStorage.getItem('argus_sahne_zorluk')
      return { ...BASE, fx: PRESETS[m === 'kolay' || m === 'zor' ? m : 'normal'] }
    } catch {
      return BASE
    }
  })
  const save = (s: Settings) => {
    setSet(s)
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
    } catch {
      /* önemsiz */
    }
  }
  const genres = useMemo(() => [...new Set(all.flatMap((x) => x.genres))].sort((a, b) => a.localeCompare(b, 'tr')), [all])
  // Soruların geleceği yapımlar (S2)
  const candidates = useMemo(() => {
    let l = all
    if (set.pool === 'izlenen') {
      const w = all.filter((x) => x.watched)
      l = w.length >= 15 ? w : all
    } else if (set.pool === 'film') l = all.filter((x) => !x.series)
    else if (set.pool === 'dizi') l = all.filter((x) => x.series)
    else if (set.pool === 'tur') l = all.filter((x) => x.genres.includes(set.genre))
    else if (set.pool === 'yil') l = all.filter((x) => x.year !== null && x.year >= set.yearFrom && x.year <= set.yearTo)
    return l
  }, [all, set.pool, set.genre, set.yearFrom, set.yearTo])

  const [phase, setPhase] = useState<'menu' | 'loading' | 'play' | 'done' | 'error'>('menu')
  const [error, setError] = useState('')
  const [qs, setQs] = useState<Question[]>([])
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [lives, setLives] = useState(3)
  const [results, setResults] = useState<Result[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [sceneIdx, setSceneIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [jokersLeft, setJokersLeft] = useState<Joker[]>([])
  const [jokersNow, setJokersNow] = useState<Joker[]>([])
  const [typed, setTyped] = useState('')
  const [fin, setFin] = useState<Finish | null>(null)
  const [detail, setDetail] = useState<GameItem | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const t0 = useRef(0)
  const lastTick = useRef(-1)

  useEffect(() => () => stopTimer(), [])
  function stopTimer() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }

  const dur = set.time || EMPTY_TIME
  const left = set.time ? Math.max(0, Math.ceil(set.time - elapsed)) : null

  async function start() {
    if (!activeProfileId) return
    if (candidates.length < 4) {
      setError(tt('Bu seçimde yeterli yapım yok (en az 4 gerekli). Soruların geleceği yeri değiştir.'))
      setPhase('error')
      return
    }
    setPhase('loading')
    setError('')
    try {
      const n = set.rounds || 40
      const res = await fetch(`/api/profiles/${activeProfileId}/sahneler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIds: candidates.map((c) => c.id), n }),
      })
      const data: { needsApiKey?: boolean; items: { rowId: string; scenes: string[] }[] } = await res.json()
      if (data.needsApiKey) throw new Error(tt('Sahneler TMDB\'den geliyor: Ayarlar › Veritabanı › API\'den TMDB anahtarını eklemelisin.'))
      const byId = new Map(all.map((p) => [p.id, p]))
      const optCount = set.opts || 4
      const list: Question[] = data.items
        .filter((it) => byId.has(it.rowId))
        .map((it) => {
          const ans = byId.get(it.rowId)!
          // Yanlış şıklar önce aynı havuzdan, yetmezse bütün arşivden
          const others = shuffle([...candidates, ...all].filter((p, i, a) => a.indexOf(p) === i && p.id !== ans.id && p.title !== ans.title)).slice(0, optCount - 1)
          return {
            ans,
            opts: shuffle([ans, ...others]),
            scenes: it.scenes,
            focus: { x: 15 + Math.random() * 70, y: 20 + Math.random() * 60 },
            tiles: shuffle(Array.from({ length: 40 }, (_, i) => i)),
          }
        })
      if (list.length < 3) throw new Error(tt('Yeterli sahne bulunamadı. Arşivindeki yapımlar TMDB ile eşleşince (detayda "TMDB\'den Doldur") sahneleri gelir.'))
      await Promise.all(
        list.slice(0, 12).map(
          (q) =>
            new Promise<void>((ok) => {
              const im = new Image()
              im.onload = im.onerror = () => ok()
              im.src = q.scenes[0]
              setTimeout(ok, 6000)
            }),
        ),
      )
      setQs(list)
      setScore(0)
      setStreak(0)
      setLives(3)
      setResults([])
      setFin(null)
      setJokersLeft(set.jokers ? ['50', 'yil', 'tur', 'oyuncu'] : [])
      setRound(0)
      setPhase('play')
      begin()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt('Sahneler alınamadı.'))
      setPhase('error')
    }
  }

  function begin() {
    stopTimer()
    setChosen(null)
    setSceneIdx(0)
    setElapsed(0)
    setJokersNow([])
    setTyped('')
    lastTick.current = -1
    t0.current = performance.now()
    timer.current = setInterval(() => setElapsed((performance.now() - t0.current) / 1000), 100)
  }

  const q = qs[round]
  // süre bitti / son 3 saniye tik tak
  useEffect(() => {
    if (phase !== 'play' || !q || chosen) return
    if (left !== null) {
      if (left <= 3 && left > 0 && lastTick.current !== left) {
        lastTick.current = left
        sfx.tick()
      }
      if (left === 0) answer('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed])

  function answer(id: string) {
    if (!q || chosen !== null) return
    stopTimer()
    setChosen(id || '-')
    const ok = id === q.ans.id
    const mult = 1 + Math.min(streak, 4) * 0.25
    const fxMult = set.fx.length === 0 ? 0.7 : 1 + 0.25 * (set.fx.length - 1)
    const optMult = set.opts === 0 ? 2 : set.opts === 2 ? 0.6 : set.opts === 6 ? 1.3 : 1
    const timeLeft = set.time ? Math.max(1, set.time - elapsed) : Math.max(1, EMPTY_TIME - elapsed)
    const jokerMult = jokersNow.reduce((m, j) => m * JOKER_MULT[j], 1)
    const gained = ok ? Math.round((timeLeft * 10 * fxMult * optMult * jokerMult * mult) / 2 ** sceneIdx) : 0
    if (ok) {
      setScore((s) => s + gained)
      sfx.ok()
      if (streak + 1 >= 3) sfx.streak()
    } else {
      sfx.bad()
      if (!set.rounds) setLives((l) => l - 1)
    }
    setStreak((s) => (ok ? s + 1 : 0))
    setResults((r) => [...r, { q, ok, gained, scene: q.scenes[Math.min(sceneIdx, q.scenes.length - 1)] }])
  }

  async function finish(final: number) {
    setPhase('done')
    const f = await finishGame(final, null, (pid, sc) => {
      const prev = readRecord(pid, set)
      if (sc <= prev) return false
      try {
        localStorage.setItem(recordKey(pid, set), String(sc))
      } catch {
        /* önemsiz */
      }
      return true
    })
    setFin(f)
  }

  function nextRound() {
    const out = !set.rounds && lives <= 0
    if (round + 1 >= qs.length || out) return void finish(score)
    setRound((r) => r + 1)
    begin()
  }

  function useJoker(j: Joker) {
    if (!q || chosen || !jokersLeft.includes(j)) return
    setJokersLeft((l) => l.filter((x) => x !== j))
    setJokersNow((l) => [...l, j])
  }
  // %50: yanlış şıkların yarısı silinir
  const removed = useMemo(() => {
    if (!q || !jokersNow.includes('50')) return new Set<string>()
    const wrong = q.opts.filter((o) => o.id !== q.ans.id)
    return new Set(wrong.slice(0, Math.floor(q.opts.length / 2)).map((o) => o.id))
  }, [q, jokersNow])

  // Yazarak cevap (S5): öneriler
  const suggestions = useMemo(() => {
    const t = fold(typed)
    if (!t || t.length < 2) return []
    return all.filter((x) => fold(x.title).includes(t) || (x.orig && fold(x.orig).includes(t))).slice(0, 6)
  }, [typed, all])

  useEffect(() => {
    if (phase !== 'play') return
    function onKey(e: KeyboardEvent) {
      if (chosen && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        nextRound()
      } else if (!chosen && q && set.opts && /^[1-6]$/.test(e.key) && !(e.target instanceof HTMLInputElement)) {
        const o = q.opts[Number(e.key) - 1]
        if (o && !removed.has(o.id)) answer(o.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (loading || !board) return <PageSkeleton />
  if (all.length < 4) return <EmptyState art="kayit" title={tt('Oynamak için yeterli yapım yok')} text={tt('Arşivinde en az 4 yapım olmalı.')} />

  const preset = presetOf(set)
  const records = profiles.map((p) => ({ p, s: readRecord(p.id, set) })).sort((a, b) => b.s - a.s)
  const scene = q?.scenes[Math.min(sceneIdx, q.scenes.length - 1)]
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${on ? 'border-[#00c0fa] bg-[#00c0fa]/12 text-white' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`
  const opt = <T,>(label: string, val: T, cur: T, onPick: (v: T) => void) => (
    <button key={label} onClick={() => onPick(val)} className={chip(val === cur)}>
      {label}
    </button>
  )

  return (
    <GameShell
      game="sahne"
      record={activeProfileId ? readRecord(activeProfileId, set) : 0}
      title={tt('Sahneden bil')}
      subtitle={tt('Arşivindeki yapımlardan gerçek bir sahne gelir. Hangi yapım?')}
      score={phase === 'play' ? score : undefined}
      right={
        phase === 'play' ? (
          <div className="flex items-end gap-3">
            {!set.rounds && <span className="text-lg">{'❤️'.repeat(Math.max(0, lives))}{'🖤'.repeat(Math.max(0, 3 - lives))}</span>}
            {streak >= 2 && (
              <span className="rounded-full bg-amber-500/15 border border-amber-400/40 px-3 py-1 text-sm font-bold text-amber-200">
                🔥 {tt('{0} seri', streak)} · ×{(1 + Math.min(streak, 4) * 0.25).toString().replace('.', ',')}
              </span>
            )}
          </div>
        ) : undefined
      }
    >
      {(phase === 'menu' || phase === 'error' || phase === 'loading') && (
        <div className="grid gap-5 md:grid-cols-[1.5fr_1fr] items-start">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-7 space-y-5">
            <div>
              <p className="text-xs font-bold tracking-wider text-neutral-500 mb-2">{tt('HAZIR AYARLAR')}</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['kolay', tt('Kolay'), tt('Sahne net ve bütün')],
                    ['normal', tt('Normal'), tt('Yakından başlar, uzaklaşır')],
                    ['zor', tt('Zor'), tt('Yakından, bulanık, siyah beyaz')],
                  ] as const
                ).map(([k, label, hint]) => (
                  <button
                    key={k}
                    onClick={() => save({ ...set, rounds: 10, time: 12, opts: 4, fx: PRESETS[k] })}
                    className={`rounded-2xl border px-3 py-3 text-left transition ${preset === k ? 'border-[#00c0fa]/70 bg-[#00c0fa]/10' : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600'}`}
                  >
                    <span className="block text-sm font-bold text-neutral-100">{label}</span>
                    <span className="block text-xs text-neutral-500 mt-0.5">{hint}</span>
                  </button>
                ))}
              </div>
              {!preset && <p className="text-xs text-[#7fdcff] mt-2">{tt('Özel ayar — rekoru ayrı tutulur.')}</p>}
            </div>
            <div>
              <p className="text-xs font-bold tracking-wider text-neutral-500 mb-2">{tt('SORU SAYISI')}</p>
              <div className="flex flex-wrap gap-2">
                {[5, 10, 20].map((n) => opt(String(n), n, set.rounds, (v) => save({ ...set, rounds: v })))}
                {opt(tt('Sonsuz (3 can)'), 0, set.rounds, (v) => save({ ...set, rounds: v }))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold tracking-wider text-neutral-500 mb-2">{tt('SÜRE')}</p>
              <div className="flex flex-wrap gap-2">
                {[8, 12, 20].map((n) => opt(tt('{0} sn', n), n, set.time, (v) => save({ ...set, time: v })))}
                {opt(tt('Süresiz'), 0, set.time, (v) => save({ ...set, time: v }))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold tracking-wider text-neutral-500 mb-2">{tt('ŞIK')}</p>
              <div className="flex flex-wrap gap-2">
                {[2, 4, 6].map((n) => opt(String(n), n, set.opts, (v) => save({ ...set, opts: v })))}
                {opt(tt('Yazarak (×2 puan)'), 0, set.opts, (v) => save({ ...set, opts: v }))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold tracking-wider text-neutral-500 mb-2">{tt('SORULAR NEREDEN')}</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['izlenen', tt('İzlediklerim')],
                    ['hepsi', tt('Bütün arşiv')],
                    ['film', tt('Sadece filmler')],
                    ['dizi', tt('Sadece diziler')],
                    ['tur', tt('Bir tür')],
                    ['yil', tt('Yıl aralığı')],
                  ] as const
                ).map(([k, l]) => opt(l, k as PoolKind, set.pool, (v) => save({ ...set, pool: v, genre: v === 'tur' && !set.genre ? genres[0] ?? '' : set.genre })))}
              </div>
              {set.pool === 'tur' && (
                <select value={set.genre} onChange={(e) => save({ ...set, genre: e.target.value })} className="mt-2 rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-1.5 text-sm text-neutral-100">
                  {genres.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              )}
              {set.pool === 'yil' && (
                <div className="mt-2 flex items-center gap-2 text-sm text-neutral-300">
                  <input type="number" value={set.yearFrom} onChange={(e) => save({ ...set, yearFrom: Number(e.target.value) || 1900 })} className="w-24 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1" />
                  –
                  <input type="number" value={set.yearTo} onChange={(e) => save({ ...set, yearTo: Number(e.target.value) || new Date().getFullYear() })} className="w-24 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1" />
                </div>
              )}
              <p className="text-xs text-neutral-500 mt-2">{ttx('Bu seçimde {0} yapım var.', candidates.length)}</p>
            </div>
            <div>
              <p className="text-xs font-bold tracking-wider text-neutral-500 mb-2">{tt('ZORLUK EFEKTLERİ')}</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(FX_LABEL) as Fx[]).map((f) => {
                  const on = set.fx.includes(f)
                  return (
                    <button key={f} onClick={() => save({ ...set, fx: on ? set.fx.filter((x) => x !== f) : [...set.fx, f] })} className={`${chip(on)} inline-flex items-center gap-2`}>
                      <span className={`relative h-4 w-7 rounded-full transition ${on ? 'bg-[#00c0fa]' : 'bg-neutral-700'}`}>
                        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
                      </span>
                      {FX_LABEL[f]}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => save({ ...set, jokers: !set.jokers })} className={`${chip(set.jokers)} inline-flex items-center gap-2`}>
                🃏 {set.jokers ? tt('Jokerler açık') : tt('Jokerler kapalı')}
              </button>
              <span className="text-xs text-neutral-500">{tt('%50, Yıl, Tür, Oyuncu — her oyunda birer tane, kullanınca o sorunun puanı düşer.')}</span>
            </div>
            {phase === 'error' && <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
            <button
              onClick={start}
              disabled={phase === 'loading'}
              className="inline-flex items-center gap-2 text-base font-semibold rounded-full px-6 py-2.5 text-white disabled:opacity-70"
              style={{ background: 'linear-gradient(90deg,#015eea,#00c0fa)' }}
            >
              {phase === 'loading' ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  {tt('Sahneler hazırlanıyor…')}
                </>
              ) : (
                <>
                  <Icon name="play" className="h-4 w-4" />
                  {tt('Başla')} {set.rounds ? `(${set.rounds} ${tt('soru')})` : `(${tt('3 can')})`}
                </>
              )}
            </button>
          </div>
          <Records records={records} />
        </div>
      )}

      {phase === 'play' && q && scene && (
        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr] items-start">
          <div>
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black ring-1 ring-neutral-800">
              <Scene key={`${round}-${sceneIdx}`} src={scene} fx={set.fx} p={elapsed / dur} done={chosen !== null} focus={q.focus} tiles={q.tiles} />
              <span className="absolute top-3 right-3 rounded-full bg-black/70 px-3 py-1 text-sm text-neutral-200 tabular-nums">
                {round + 1}
                {set.rounds ? `/${qs.length}` : ''}
              </span>
              {/* joker ipuçları */}
              <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%]">
                {jokersNow.includes('yil') && <span className="rounded-full bg-black/75 border border-white/20 px-2.5 py-1 text-xs font-bold text-white">📅 {q.ans.year ?? '?'}</span>}
                {jokersNow.includes('tur') && <span className="rounded-full bg-black/75 border border-white/20 px-2.5 py-1 text-xs font-bold text-white">🎭 {q.ans.genres.slice(0, 2).join(' · ') || '?'}</span>}
                {jokersNow.includes('oyuncu') && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/75 border border-white/20 pl-1 pr-2.5 py-0.5 text-xs font-bold text-white">
                    {q.ans.actors[0]?.image && <img src={q.ans.actors[0].image} alt="" className="h-6 w-6 rounded-full object-cover" />}
                    {q.ans.actors[0]?.name ?? '?'}
                  </span>
                )}
              </div>
              {chosen && (
                <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-4 sm:p-5" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.92), transparent)', animation: 'argus-toast-in .3s ease-out' }}>
                  {q.ans.poster && <img src={q.ans.poster} alt="" className="h-24 w-16 rounded-lg object-cover ring-1 ring-white/20 shadow-lg" />}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold ${chosen === q.ans.id ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {chosen === q.ans.id ? tt('Doğru! +{0}', results[results.length - 1]?.gained ?? 0) : chosen === '-' ? tt('Süre bitti') : tt('Yanlış')}
                    </p>
                    <p className="text-2xl font-black text-white truncate">{q.ans.title}</p>
                    {q.ans.year && <p className="text-sm text-neutral-300">{q.ans.year}</p>}
                  </div>
                  <button onClick={nextRound} className="shrink-0 rounded-full bg-white px-5 py-2 text-sm font-bold text-black hover:bg-white/85 transition">
                    {round + 1 >= qs.length || (!set.rounds && lives <= 0) ? tt('Sonuçlar') : tt('Sonraki')}
                  </button>
                </div>
              )}
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-100 linear"
                style={{ width: `${Math.max(0, 100 - (elapsed / dur) * 100)}%`, background: left !== null && left <= 3 ? '#f43f5e' : 'linear-gradient(90deg,#015eea,#00c0fa)' }}
              />
            </div>
          </div>
          <div className="grid gap-2.5">
            {set.opts ? (
              q.opts.map((o, i) => {
                const right = chosen && o.id === q.ans.id
                const wrong = chosen === o.id && o.id !== q.ans.id
                const gone = removed.has(o.id)
                return (
                  <button
                    key={o.id}
                    onClick={() => answer(o.id)}
                    disabled={chosen !== null || gone}
                    className={`flex items-center gap-3 text-left rounded-xl border px-4 py-3 font-semibold transition ${
                      right
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-100'
                        : wrong
                          ? 'border-rose-500 bg-rose-500/15 text-rose-100'
                          : gone
                            ? 'border-neutral-900 bg-neutral-950 text-neutral-700 line-through'
                            : chosen
                              ? 'border-neutral-800 bg-neutral-900 text-neutral-500'
                              : 'border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-[#00c0fa]/60 hover:bg-neutral-800'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xs text-neutral-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{o.title}</span>
                    {right && <Icon name="check" className="h-5 w-5 text-emerald-300" />}
                  </button>
                )
              })
            ) : (
              <div className="relative">
                <input
                  autoFocus
                  value={typed}
                  disabled={chosen !== null}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && suggestions[0] && answer(suggestions[0].id)}
                  placeholder={tt('Hangi yapım? Yazmaya başla…')}
                  className="w-full rounded-xl bg-neutral-900 border border-neutral-700 focus:border-[#00c0fa] px-4 py-3 text-base font-semibold text-neutral-100 outline-none"
                />
                {!chosen && suggestions.length > 0 && (
                  <div className="mt-1.5 rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden">
                    {suggestions.map((s) => (
                      <button key={s.id} onClick={() => answer(s.id)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-800">
                        {s.poster ? <img src={s.poster} alt="" className="h-10 w-7 rounded object-cover" /> : <span className="h-10 w-7 rounded bg-neutral-800" />}
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-neutral-100 truncate">{s.title}</span>
                          {s.orig && s.orig !== s.title && <span className="block text-xs text-neutral-500 truncate">{s.orig}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {!chosen && (
                  <button onClick={() => answer('')} className="mt-2 text-xs text-neutral-500 hover:text-neutral-200">
                    {tt('Bilmiyorum, geç')}
                  </button>
                )}
              </div>
            )}
            {!chosen && q.scenes.length > sceneIdx + 1 && (
              <button onClick={() => setSceneIdx((n) => n + 1)} className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 hover:border-neutral-500 hover:text-white transition">
                <Icon name="film" className="h-4 w-4" />
                {tt('Başka sahne (puan yarıya iner)')}
              </button>
            )}
            {set.jokers && (
              <div className="grid grid-cols-4 gap-1.5 mt-1">
                {(
                  [
                    ['50', '%50', '−%40'],
                    ['yil', tt('Yıl'), '−%20'],
                    ['tur', tt('Tür'), '−%20'],
                    ['oyuncu', tt('Oyuncu'), '−%30'],
                  ] as const
                ).map(([j, l, cost]) => {
                  const usable = jokersLeft.includes(j) && !chosen && !(j === '50' && !set.opts)
                  return (
                    <button key={j} disabled={!usable} onClick={() => useJoker(j)} className="rounded-xl border border-neutral-700 bg-neutral-900 px-1 py-2 text-xs font-bold text-neutral-100 hover:border-amber-400/60 disabled:opacity-30 transition">
                      {l}
                      <span className="block text-[10px] font-semibold text-neutral-500 mt-0.5">{cost}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="grid gap-5 md:grid-cols-[1.5fr_1fr] items-start">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8 space-y-5">
            <div>
              <p className="text-neutral-400">{tt('Tur bitti!')}</p>
              <p className="text-6xl font-black text-neutral-50 my-1 tabular-nums">{score}</p>
              <p className="text-sm text-neutral-400">{tt('{0} sorudan {1} doğru', results.length, results.filter((r) => r.ok).length)}</p>
            </div>
            <FinishInfo f={fin} />
            {/* S6: sahneler — tıklayınca detay, bilemediklerini Aklımda'ya ekle */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {results.map((r, i) => {
                const inAk = Boolean(ak.items[r.q.ans.id])
                return (
                  <div key={i} className="rounded-xl overflow-hidden ring-1 ring-neutral-800 bg-neutral-900">
                    <button onClick={() => setDetail(r.q.ans)} className="relative block w-full aspect-video" title={r.q.ans.title}>
                      <img src={r.scene} alt="" className="h-full w-full object-cover" />
                      <span className={`absolute bottom-1 right-1 h-5 w-5 rounded-full flex items-center justify-center text-white ${r.ok ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                        {r.ok ? <Icon name="check" className="h-3 w-3" /> : <span className="text-[11px] font-bold leading-none">×</span>}
                      </span>
                    </button>
                    <div className="px-2 py-1.5">
                      <p className="text-xs font-semibold text-neutral-100 truncate">{r.q.ans.title}</p>
                      {!r.ok && board && (
                        <button
                          disabled={inAk}
                          onClick={async () => {
                            try {
                              await ak.addRow(board.id, r.q.ans.id)
                              notify(tt('"{0}" Aklımda\'ya eklendi.', r.q.ans.title), 'success')
                            } catch (e) {
                              notify(e instanceof Error ? e.message : tt('Eklenemedi.'), 'danger')
                            }
                          }}
                          className="text-[11px] text-[#7fdcff] hover:underline disabled:text-neutral-500 disabled:no-underline"
                        >
                          {inAk ? tt('Aklımda ✓') : tt('+ Aklımda\'ya ekle')}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={start} className="inline-flex items-center gap-2 text-base font-semibold rounded-full px-6 py-2.5 text-white" style={{ background: 'linear-gradient(90deg,#015eea,#00c0fa)' }}>
                <Icon name="repeat" className="h-4 w-4" />
                {tt('Tekrar oyna')}
              </button>
              <button onClick={() => setPhase('menu')} className="text-sm rounded-full px-4 py-2.5 border border-neutral-700 text-neutral-300 hover:text-white transition">
                {tt('Ayarları değiştir')}
              </button>
            </div>
          </div>
          <Records records={profiles.map((p) => ({ p, s: readRecord(p.id, set) })).sort((a, b) => b.s - a.s)} />
        </div>
      )}
      {detail && board && <RowDetailModal board={board} row={detail.row} onClose={() => setDetail(null)} />}
    </GameShell>
  )
}

function Records({ records }: { records: { p: { id: string; username: string; photo?: string }; s: number }[] }) {
  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6">
      <p className="text-xs uppercase tracking-wider text-neutral-500 mb-3">{tt('Rekorlar (bu ayarda)')}</p>
      <div className="space-y-1.5">
        {records.map(({ p, s }, i) => (
          <p key={p.id} className="flex items-center gap-3 rounded-xl bg-neutral-900 px-3 py-2 text-sm">
            <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-neutral-800">{p.photo && <img src={p.photo} alt="" className="h-full w-full object-cover" />}</span>
            <span className="flex-1 truncate text-neutral-200">{p.username}</span>
            {i === 0 && s > 0 && <Icon name="trophy" className="h-4 w-4 text-amber-300" />}
            <span className="tabular-nums font-semibold text-neutral-100">{s}</span>
          </p>
        ))}
      </div>
    </div>
  )
}
