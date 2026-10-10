import { useEffect, useState } from 'react'
import { api, type ArchiveCard, type TmdbCard } from '../lib/api'
import { notifyDataChanged } from '../lib/dataEvents'
import { useToast } from '../hooks/useToast'
import SectionTitle from './SectionTitle'
import TmdbPreviewModal from './TmdbPreviewModal'
import { isoDate, tt } from '../lib/i18n'

// Detay penceresinde "Seri" — kullanıcı film serilerini (Harry Potter 1–8 gibi) takip etmek istedi:
// serinin kaçını izledin, sıradaki hangisi, arşivinde olmayanları tek tıkla İzlenecek'e ekle.
type Part = ArchiveCard & { released: boolean; releaseDate: string }

function cleanName(name: string) {
  return name.replace(/\s*\[seri\]\s*/i, '').replace(/\s+(serisi|koleksiyonu|collection)$/i, '').trim()
}

export default function CollectionSection({ boardId, rowId, onOpenRow }: { boardId: string; rowId: string; onOpenRow?: (rowId: string) => void }) {
  const { notify } = useToast()
  const [data, setData] = useState<{ collection: { name: string } | null; parts?: Part[] } | null>(null)
  const [preview, setPreview] = useState<TmdbCard | null>(null)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    Promise.resolve()
      .then(() => api.getCollection(boardId, rowId))
      .then((d) => alive && setData(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [boardId, rowId])

  if (!data?.collection || !data.parts?.length) return null
  const parts = data.parts
  const released = parts.filter((p) => p.released)
  const watched = released.filter((p) => p.watched).length
  const next = released.find((p) => !p.watched && p.rowId !== rowId)

  async function add(p: Part) {
    setBusy(p.tmdbId)
    try {
      const res = await api.addFromTmdb(boardId, { tmdbId: p.tmdbId, mediaType: 'movie', status: 'izlenecek' })
      notifyDataChanged(boardId)
      setAdded((s) => new Set(s).add(p.tmdbId))
      notify(tt('"{0}" izlenecekler listene eklendi.', res.title))
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Eklenemedi.'), 'danger')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section>
      <SectionTitle title={tt('{0} serisi', cleanName(data.collection.name))} count={tt('{0}/{1} izledin', watched, released.length)} />
      {next && (
        <p className="text-sm text-neutral-400 -mt-2 mb-3">
          {tt('Sıradaki:')}{' '}<span className="text-neutral-100 font-medium">{next.title}</span>
          {next.year && <span className="text-neutral-500"> ({next.year})</span>}
          {!next.inArchive && !added.has(next.tmdbId) && <span className="text-neutral-500">{' '}{tt('— arşivinde yok')}</span>}
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {parts.map((p, i) => {
          const isThis = p.rowId === rowId
          const inArch = p.inArchive || added.has(p.tmdbId)
          return (
            <div key={p.tmdbId} className={`w-28 shrink-0 ${isThis ? '' : ''}`}>
              <button
                onClick={() => (!inArch ? setPreview(p) : p.rowId && !isThis && onOpenRow?.(p.rowId))}
                className={`block w-full relative aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 ${isThis ? 'ring-2 ring-[#00c0fa]' : ''} ${isThis || (inArch && !(p.rowId && onOpenRow)) ? 'cursor-default' : 'group'}`}
              >
                {p.poster && <img src={p.poster} alt={p.title} loading="lazy" className={`h-full w-full object-cover group-hover:scale-105 transition ${!p.released ? 'opacity-50' : ''}`} />}
                <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-black/70 text-neutral-100 rounded px-1.5 py-0.5">{i + 1}</span>
                {p.watched ? (
                  <span className="absolute bottom-1.5 left-1.5 text-[10px] font-semibold bg-emerald-500 text-white rounded px-1.5 py-0.5">{tt('✓ İzledin')}</span>
                ) : isThis ? (
                  <span className="absolute bottom-1.5 left-1.5 text-[10px] font-semibold bg-[#00c0fa] text-white rounded px-1.5 py-0.5">{tt('Bu film')}</span>
                ) : p.status ? (
                  <span className="absolute bottom-1.5 left-1.5 text-[10px] font-semibold bg-black/70 text-neutral-100 rounded px-1.5 py-0.5">{p.status}</span>
                ) : null}
              </button>
              <p className="text-xs text-neutral-200 mt-1.5 line-clamp-2 leading-tight">{p.title}</p>
              <p className="text-[11px] text-neutral-500">{p.released ? p.year : tt('Yakında{0}', p.releaseDate ? ' · ' + (isoDate(p.releaseDate) ?? p.releaseDate) : '')}</p>
              {!inArch && (
                <button
                  onClick={() => add(p)}
                  disabled={busy === p.tmdbId}
                  className="mt-1 w-full text-[11px] rounded-md border border-neutral-700 text-neutral-300 hover:border-[#00c0fa] hover:text-[#7fdcff] py-1 transition disabled:opacity-50"
                >
                  {busy === p.tmdbId ? tt('Ekleniyor...') : tt('+ İzlenecek')}
                </button>
              )}
              {added.has(p.tmdbId) && <p className="text-[11px] text-emerald-400 mt-1">{tt('✓ Eklendi')}</p>}
            </div>
          )
        })}
      </div>
      {preview && <TmdbPreviewModal boardId={boardId} card={preview} onClose={() => setPreview(null)} onAdded={() => setAdded((s) => new Set(s).add(preview.tmdbId))} />}
    </section>
  )
}
