import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Song } from '../lib/api'
import type { Season } from '../types'
import { useToast } from '../hooks/useToast'
import SectionTitle from './SectionTitle'

// Detay penceresindeki "Müzikler": içerikte hangi dakikada hangi şarkı çaldı. Kullanıcı "Nook'un Hum'u
// izlediğim dizilerin filmlerin içindeki müzikleri bulsun, hangi dakikada hangi müzik çaldığı detay
// penceresinde yazsın" dedi — şarkıları Nook izlerken bulup yazıyor (bkz. server/index.js songs). Hiç
// şarkı yoksa bölüm hiç görünmüyor. Pencere açıkken Nook yeni bir şarkı yazabilir: arada bir yenileniyor.

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
      <span title={song.approx ? 'Yaklaşık dakika' : undefined} className="w-14 shrink-0 text-right text-sm tabular-nums font-medium text-[#3fa9ff]">{song.atMs !== null ? `${song.approx ? '~' : ''}${formatAt(song.atMs)}` : '—'}</span>
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
          Spotify
        </a>
        <a
          href={`https://www.youtube.com/results?search_query=${query(song)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-400 hover:text-neutral-50 border border-neutral-700 hover:border-neutral-500 rounded-full px-2.5 py-1 transition"
        >
          YouTube
        </a>
        <button
          onClick={onDelete}
          title="Yanlış şarkı — sil"
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

  const load = useCallback(() => {
    api
      .getSongs(rowId)
      .then(setSongs)
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
        const label = s.season !== null ? `${s.season}. Sezon${s.episode !== null ? ` ${s.episode}. Bölüm` : ''}${name ? ` · ${name}` : ''}` : null
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
      notify(e instanceof Error ? e.message : 'Silinemedi.', 'danger')
      load()
    }
  }

  if (songs.length === 0) return null

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
      <SectionTitle title="Müzikler" count={`${songs.length} şarkı`} right={<span className="text-[11px] text-neutral-600">Nook'un Hum'u buldu</span>} />
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
          {showAll ? 'Daha az göster' : `Tümünü göster (${songs.length})`}
        </button>
      )}
    </section>
  )
}
