import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Song } from '../lib/api'
import type { Season } from '../types'
import { useToast } from '../hooks/useToast'
import SectionTitle from './SectionTitle'
import Select from './Select'
import { tt } from '../lib/i18n'

// Detay penceresindeki "Müzikler": içerikte hangi dakikada hangi şarkı çaldı. Kullanıcı "Nook'un Hum'u
// izlediğim dizilerin filmlerin içindeki müzikleri bulsun, hangi dakikada hangi müzik çaldığı detay
// penceresinde yazsın" dedi — şarkıları Nook izlerken bulup yazıyor (bkz. server/index.js songs). Kullanıcı
// "argustan da manuel olarak ekleyebilmek istiyorum" dedi: "+ Müzik ekle" ile bölüm, dakika, ad, sanatçı
// yazılarak eklenir. Pencere açıkken Nook yeni bir şarkı yazabilir: arada bir yenileniyor.

const PREVIEW = 8
const POLL_MS = 15_000

// 754000 → "12:34", 4000000 → "1:06:40"
function formatAt(ms: number) {
  const t = Math.floor(ms / 1000)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// "12:34" / "1:02:03" / "12" (dakika) → ms; boş → null; yanlış yazıldıysa undefined
function parseAt(text: string): number | null | undefined {
  const t = text.trim()
  if (!t) return null
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(t)) return undefined
  const parts = t.split(':').map(Number)
  if (parts.slice(1).some((n) => n > 59)) return undefined
  const [h, m, s] = parts.length === 3 ? parts : parts.length === 2 ? [0, ...parts] : [0, parts[0], 0]
  return ((h * 60 + m) * 60 + s) * 1000
}

// Elle eklenen şarkının kimliği: aynı ad + sanatçı aynı bölümde iki kez eklenmesin
const manualKey = (title: string, artist: string) => `el:${`${artist}|${title}`.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()}`.slice(0, 64)

const epValue = (season: number, episode: number) => `${season}-${episode}`

const inputClass =
  'w-full rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-600 focus:border-neutral-500 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition'

function AddSongForm({
  rowId,
  seasons,
  defaultEp,
  onAdded,
  onClose,
}: {
  rowId: string
  seasons: Season[] | undefined
  defaultEp: string
  onAdded: () => void
  onClose: () => void
}) {
  const { notify } = useToast()
  const [ep, setEp] = useState(defaultEp)
  const [at, setAt] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [saving, setSaving] = useState(false)
  const epOptions = useMemo(
    () =>
      (seasons ?? [])
        .filter((s) => s.seasonNumber >= 1)
        .flatMap((s) =>
          s.episodes.map((e) => ({
            value: epValue(s.seasonNumber, e.episodeNumber),
            label: tt('{0}. Sezon {1}. Bölüm{2}', s.seasonNumber, e.episodeNumber, e.name ? ` · ${e.name}` : ''),
          })),
        ),
    [seasons],
  )
  const series = epOptions.length > 0

  async function submit() {
    const atMs = parseAt(at)
    if (atMs === undefined) return notify(tt('Dakikayı 12:34 ya da 1:02:03 gibi yaz.'), 'danger')
    if (!title.trim()) return notify(tt('Şarkının adını yaz.'), 'danger')
    if (series && !ep) return notify(tt('Hangi bölümde çaldığını seç.'), 'danger')
    const [season, episode] = series ? ep.split('-').map(Number) : [null, null]
    setSaving(true)
    try {
      const res = await api.addSong(rowId, { key: manualKey(title.trim(), artist.trim()), title: title.trim(), artist: artist.trim(), season, episode, atMs, manual: true })
      if (res.duplicate) notify(tt('Bu şarkı bu bölümde o dakikalarda zaten var.'))
      // Aynı bölüme art arda ekleyebilsin diye bölüm seçili kalır
      setAt('')
      setTitle('')
      setArtist('')
      onAdded()
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Eklenemedi.'), 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="mb-5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 space-y-2"
    >
      {series && <Select value={ep} onChange={setEp} options={epOptions} placeholder={tt('Hangi bölüm?')} />}
      <div className="grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <input value={at} onChange={(e) => setAt(e.target.value)} placeholder="12:34" inputMode="numeric" title={tt('Kaçıncı dakikada (boş bırakılabilir)')} className={`${inputClass} tabular-nums`} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tt('Şarkı adı')} autoFocus className={inputClass} />
        <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder={tt('Sanatçı')} className={inputClass} />
      </div>
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-neutral-500 mr-auto">{tt('Dakika boş bırakılabilir.')}</p>
        <button type="button" onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-100 px-3 py-1.5 transition">
          {tt('Kapat')}
        </button>
        <button type="submit" disabled={saving} className="text-sm font-medium text-white bg-[#3fa9ff] hover:bg-[#5bb6ff] disabled:opacity-50 rounded-lg px-4 py-1.5 transition">
          {saving ? tt('Ekleniyor...') : tt('Ekle')}
        </button>
      </div>
    </form>
  )
}

const query = (s: Song) => encodeURIComponent(`${s.artist} ${s.title}`)

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function SongRow({ song, onDelete }: { song: Song; onDelete: () => void }) {
  // Kapak yüklenemezse (bağlantı eskidiyse) nota simgesi
  const [broken, setBroken] = useState(false)
  return (
    <li className="group flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-neutral-800/60 transition">
      <span title={song.approx ? tt('Yaklaşık dakika') : undefined} className="w-14 shrink-0 text-right text-sm tabular-nums font-medium text-[#3fa9ff]">{song.atMs !== null ? `${song.approx ? '~' : ''}${formatAt(song.atMs)}` : '—'}</span>
      <span className="h-11 w-11 shrink-0 rounded-lg overflow-hidden bg-neutral-800 ring-1 ring-neutral-800 flex items-center justify-center text-neutral-500">
        {song.cover && !broken ? <img src={song.cover} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" /> : <NoteIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-neutral-100 font-medium truncate">{song.title}</span>
        <span className="block text-xs text-neutral-500 truncate">{song.artist}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
        <a
          href={`https://open.spotify.com/search/${query(song)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-400 hover:text-neutral-50 border border-neutral-700 hover:border-neutral-500 rounded-full px-2.5 py-1 transition"
        >
          {tt('Spotify')}
        </a>
        <a
          href={`https://www.youtube.com/results?search_query=${query(song)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-400 hover:text-neutral-50 border border-neutral-700 hover:border-neutral-500 rounded-full px-2.5 py-1 transition"
        >
          {tt('YouTube')}
        </a>
        <button
          onClick={onDelete}
          title={tt('Yanlış şarkı — sil')}
          className="h-7 w-7 rounded-full text-neutral-500 hover:text-red-300 hover:bg-red-500/10 flex items-center justify-center transition"
        >
          ×
        </button>
      </span>
    </li>
  )
}

export default function SongsSection({ rowId, seasons }: { rowId: string; seasons: Season[] | undefined }) {
  const { notify } = useToast()
  const [songs, setSongs] = useState<Song[]>([])
  const [showAll, setShowAll] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    api
      .getSongs(rowId)
      .then((list) => {
        setSongs(list)
        setLoaded(true)
      })
      .catch(() => {})
  }, [rowId])

  useEffect(() => {
    load()
    const t = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  // Dizide bölüm bölüm, bölüm içinde dakikaya göre
  const groups = useMemo(() => {
    const sorted = songs
      .slice()
      .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0) || (a.atMs ?? 0) - (b.atMs ?? 0))
    const out: { key: string; label: string | null; items: Song[] }[] = []
    for (const s of sorted) {
      const key = s.season !== null ? `${s.season}-${s.episode ?? ''}` : ''
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        const name = seasons?.find((x) => x.seasonNumber === s.season)?.episodes.find((e) => e.episodeNumber === s.episode)?.name
        const label = s.season !== null ? tt('{0}. Sezon{1}{2}', s.season, s.episode !== null ? tt(' {0}. Bölüm', s.episode) : '', name ? ` · ${name}` : '') : null
        g = { key, label, items: [] }
        out.push(g)
      }
      g.items.push(s)
    }
    return out
  }, [songs, seasons])

  async function remove(song: Song) {
    setSongs((prev) => prev.filter((s) => s.id !== song.id))
    try {
      await api.deleteSong(rowId, song.id)
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Silinemedi.'), 'danger')
      load()
    }
  }

  if (!loaded) return null

  // Formda önce seçili bölüm: en son şarkı eklenen bölüm, yoksa ilk bölüm
  const last = songs.reduce<Song | null>((a, b) => (b.season !== null && (!a || b.foundAt > a.foundAt) ? b : a), null)
  const firstSeason = seasons?.find((s) => s.seasonNumber >= 1 && s.episodes.length > 0)
  const defaultEp =
    last?.season != null && last.episode != null
      ? epValue(last.season, last.episode)
      : firstSeason
        ? epValue(firstSeason.seasonNumber, firstSeason.episodes[0].episodeNumber)
        : ''
  const addButton = !adding && (
    <button
      onClick={() => setAdding(true)}
      className="text-xs text-neutral-300 hover:text-neutral-50 border border-neutral-700 hover:border-neutral-500 rounded-full px-3 py-1 transition"
    >
      {tt('+ Müzik ekle')}
    </button>
  )

  // Önizlemede ilk PREVIEW şarkı (grupları bölmeden kısaltır)
  let left = showAll ? Infinity : PREVIEW
  const visible = groups
    .map((g) => {
      const items = g.items.slice(0, Math.max(0, left))
      left -= items.length
      return { ...g, items }
    })
    .filter((g) => g.items.length > 0)

  return (
    <section id="rd-muzikler">
      <SectionTitle title={tt('Müzikler')} count={songs.length ? tt('{0} şarkı', songs.length) : undefined} right={addButton} />
      {adding && <AddSongForm rowId={rowId} seasons={seasons} defaultEp={defaultEp} onAdded={load} onClose={() => setAdding(false)} />}
      {songs.length === 0 && !adding && (
        <p className="text-sm text-neutral-500">{tt('Henüz müzik yok. Nook izlerken çalan şarkıları bulup buraya yazar; sen de ekleyebilirsin.')}</p>
      )}
      <div className="space-y-5">
        {visible.map((g) => (
          <div key={g.key}>
            {g.label && <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">{g.label}</p>}
            <ul className="space-y-0.5">
              {g.items.map((s) => (
                <SongRow key={s.id} song={s} onDelete={() => remove(s)} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {songs.length > PREVIEW && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-5 w-full text-sm text-neutral-300 hover:text-neutral-50 border border-neutral-800 hover:border-neutral-600 rounded-xl py-2 transition"
        >
          {showAll ? tt('Daha az göster') : tt('Tümünü göster ({0})', songs.length)}
        </button>
      )}
    </section>
  )
}
