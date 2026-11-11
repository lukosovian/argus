import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Board, Row } from '../types'
import type { TmdbCard } from '../lib/api'
import { useAklimda } from '../hooks/useAklimda'
import { aklimdaEntries, STATUS_TONE, type AklimdaEntry } from '../lib/aklimda'
import { tt } from '../lib/i18n'
import TmdbPreviewModal from './TmdbPreviewModal'

// Ana sayfada "Aklında kalanlar" satırı — Aklımda'ya eklediğin en son 20 yapım. Boşsa görünmez.
export function aklimdaCard(e: AklimdaEntry): TmdbCard | null {
  const t = e.item.tmdb
  if (!t) return null
  return { tmdbId: t.id, mediaType: t.mediaType, title: t.title, originalTitle: '', year: t.year, poster: t.poster, overview: '', rating: null }
}

export default function AklimdaRow({ board, rows, onOpenDetail, titleClass }: { board: Board; rows: Row[]; onOpenDetail: (row: Row) => void; titleClass: string }) {
  const { items } = useAklimda()
  const [preview, setPreview] = useState<TmdbCard | null>(null)
  const list = aklimdaEntries(board, rows, items).slice(0, 20)
  if (list.length === 0) return null
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className={titleClass}>{tt('Aklında kalanlar')}</h2>
        <span className="text-xs text-neutral-500">{tt('bir ara bakarım dediklerin')}</span>
        <Link to="/aklimda" className="ml-auto text-xs text-neutral-400 hover:text-[#00c0fa] transition">
          {tt('Tümü')} →
        </Link>
      </div>
      <div className="no-scrollbar flex items-start gap-3 overflow-x-auto -mx-4 px-4 pt-1 pb-3">
        {list.map((e) => (
          <button
            key={e.key}
            onClick={() => (e.row ? onOpenDetail(e.row) : setPreview(aklimdaCard(e)))}
            title={e.title}
            className="w-[120px] shrink-0 text-left group"
          >
            <span className="relative block w-full aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 shadow-lg shadow-black/40">
              {e.poster ? (
                <img src={e.poster} alt={e.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-neutral-400">{e.title}</span>
              )}
              {(e.statusLabel || e.status === 'yok') && (
                <span className={`absolute top-1.5 left-1.5 text-[10px] font-semibold rounded px-1.5 py-0.5 ${STATUS_TONE[e.status]}`}>
                  {e.status === 'yok' ? tt('Arşivinde yok') : e.statusLabel}
                </span>
              )}
            </span>
            <span className="block text-xs text-neutral-200 mt-1.5 truncate">{e.title}</span>
          </button>
        ))}
      </div>
      {preview && <TmdbPreviewModal boardId={board.id} card={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
