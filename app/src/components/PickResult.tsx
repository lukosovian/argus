import { useEffect, useState } from 'react'
import type { Board, Row } from '../types'
import { titleText, todayIso, ratingAverage } from '../types'
import { api, type TmdbCard, type TmdbItem } from '../lib/api'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { formatRuntime, showcaseMeta } from '../lib/rowMeta'
import { notifyDataChanged } from '../lib/dataEvents'
import { useToast } from '../hooks/useToast'
import { WatchedForm } from './DiscoverModal'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'

// Ne İzlesem'in sonuç ekranı — kullanıcı "içerik seçildikten sonra poster ya da yatay görseli
// gelsin, yanında kapak adı, kısa sinopsis, bilgiler; arkada mavi ışık vuran ekranda; altında
// tekrar getir; TMDB'den geldiyse izledim/izlenecek eklenebilsin, arşivden geldiyse ona göre
// sorular gelsin" dedi. Eskiden kazanan doğrudan detay penceresinde açılıyordu.
export default function PickResult({
  board,
  row,
  tmdb,
  cover,
  landscape,
  onAgain,
  onClose,
  onOpenRow,
  onOpenTmdb,
}: {
  board: Board
  row?: Row
  tmdb?: TmdbCard
  cover: string
  landscape: boolean
  onAgain: () => void
  onClose: () => void
  onOpenRow: (row: Row) => void
  onOpenTmdb: (card: TmdbCard) => void
}) {
  const { notify } = useToast()
  const [item, setItem] = useState<TmdbItem | null>(null)
  const [current, setCurrent] = useState<Row | undefined>(row)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [watchedForm, setWatchedForm] = useState(false)

  useEffect(() => {
    if (!tmdb) return
    let cancelled = false
    api
      .getTmdbItem(board.id, tmdb.mediaType, tmdb.tmdbId)
      .then((d) => !cancelled && setItem(d))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [board.id, tmdb])

  // --- Arşivden gelen kayıt
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const sinopsisProp = resolveRole(board, 'sinopsis')
  const durumProp = resolveRole(board, 'durum')
  const tarihProp = resolveRole(board, 'izlemeTarihi')
  const puanProp = resolveRole(board, 'puan')
  const turProp = resolveRole(board, 'tur')

  const r = current
  const title = r ? (titleProp ? titleText(titleProp, r.values[titleProp.id]) : '') : (item ?? tmdb)?.title ?? ''
  const logo = r
    ? board.titleImagePropertyId
      ? ((r.values[board.titleImagePropertyId] as string) || null)
      : null
    : (item?.logo ?? null)
  const synopsis = r ? (sinopsisProp ? ((r.values[sinopsisProp.id] as string) ?? '') : '') : ((item ?? tmdb)?.overview ?? '')
  const statusId = r && durumProp ? (r.values[durumProp.id] as string) : ''
  const statusOpt = durumProp?.options?.find((o) => o.id === statusId)
  const izleniyorId = resolveStatusOption(board, 'izleniyor')
  const izlendiId = resolveStatusOption(board, 'izlendi')

  const score = r && puanProp ? ratingAverage(r.values[puanProp.id], puanProp) : null
  const genres = r
    ? turProp
      ? ((Array.isArray(r.values[turProp.id]) ? (r.values[turProp.id] as string[]) : [])
          .map((id) => turProp.options?.find((o) => o.id === id)?.label)
          .filter(Boolean) as string[])
      : []
    : (item?.genres ?? [])
  const meta = r
    ? showcaseMeta(board, r).filter((b) => !genres.includes(b))
    : [
        tmdb?.mediaType === 'tv' ? 'Dizi' : 'Film',
        (item ?? tmdb)?.year ?? '',
        item?.runtime ? formatRuntime(item.runtime) : '',
        item?.seasons ? `${item.seasons} Sezon` : '',
      ].filter(Boolean)

  // Arşivdeki kaydı güncelle: önce en güncel halini al ki arada yapılan değişiklikler ezilmesin.
  async function patchRow(patch: (values: Row['values']) => Row['values'], message: string) {
    if (!r) return
    setBusy(true)
    try {
      const fresh = (await api.getRows(board.id)).find((x) => x.id === r.id) ?? r
      const saved = await api.updateRow(board.id, r.id, {
        values: patch({ ...fresh.values }),
        createdAt: fresh.createdAt,
        updatedAt: Date.now(),
      })
      setCurrent(saved)
      notifyDataChanged(board.id)
      setDone(message)
      notify(message)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Kaydedilemedi.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  function addToday(values: Row['values']): Row['values'] {
    if (!tarihProp) return values
    const today = todayIso()
    const v = values[tarihProp.id]
    if (tarihProp.type === 'multidate') {
      const list = Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []
      values[tarihProp.id] = list.includes(today) ? list : [...list, today]
    } else {
      values[tarihProp.id] = today
    }
    return values
  }

  async function addFromTmdb(status: 'izlenecek' | 'izlendi', watchedDate?: string | null, rating?: number | null) {
    if (!tmdb) return
    setBusy(true)
    try {
      const res = await api.addFromTmdb(board.id, {
        tmdbId: tmdb.tmdbId,
        mediaType: tmdb.mediaType,
        status,
        watchedDate: watchedDate ?? undefined,
        rating: rating ?? undefined,
      })
      notifyDataChanged(board.id)
      setWatchedForm(false)
      const msg = status === 'izlendi' ? `"${res.title}" izlediklerine eklendi.` : `"${res.title}" izlenecekler listene eklendi.`
      setDone(msg)
      notify(msg)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Eklenemedi.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function dismiss() {
    if (!tmdb) return
    try {
      await api.dismissTmdb({ tmdbId: tmdb.tmdbId, mediaType: tmdb.mediaType })
      notify(`"${tmdb.title}" bir daha önerilmeyecek.`)
    } catch {
      // kaydedilemese de devam
    }
    onAgain()
  }

  const inArchive = Boolean(tmdb?.inArchive || item?.inArchive)
  const secondary =
    'text-sm rounded-full border border-neutral-700 hover:border-neutral-400 text-neutral-200 hover:text-white bg-neutral-900/60 backdrop-blur-sm px-4 py-2 transition disabled:opacity-50'

  // Arşivden gelen kayıt için duruma göre soru ve düğmeler.
  let question = ''
  const actions: { label: string; onClick: () => void; primary?: boolean }[] = []
  if (r && !done) {
    if (statusId && statusId === izlendiId) {
      question = 'Bunu daha önce izlemişsin. Yine mi izliyorsun?'
      if (tarihProp) actions.push({ label: '↻ Bugün yine izledim', primary: true, onClick: () => patchRow(addToday, 'Bugünün tarihi izleme tarihlerine eklendi.') })
    } else if (statusId && statusId === izleniyorId) {
      question = 'Bunu izliyordun — kaldığın yerden devam mı?'
      if (izlendiId && durumProp)
        actions.push({
          label: '✓ Bitirdim',
          primary: true,
          onClick: () => patchRow((v) => addToday({ ...v, [durumProp.id]: izlendiId }), 'İzlendi olarak işaretlendi.'),
        })
    } else {
      question = 'Bu akşam bu olsun mu?'
      if (izleniyorId && durumProp)
        actions.push({
          label: '▶ Başlıyorum',
          primary: true,
          onClick: () => patchRow((v) => ({ ...v, [durumProp.id]: izleniyorId }), 'İzleniyor olarak işaretlendi.'),
        })
      if (izlendiId && durumProp)
        actions.push({
          label: '✓ Zaten izledim',
          onClick: () => patchRow((v) => addToday({ ...v, [durumProp.id]: izlendiId }), 'İzlendi olarak işaretlendi.'),
        })
    }
  }

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center px-4 sm:px-8 py-20 animate-[pickIn_.5s_ease-out]">
        <div className={`w-full ${landscape ? 'max-w-6xl' : 'max-w-5xl'} flex flex-col md:flex-row items-center md:items-stretch gap-6 md:gap-10`}>
          {/* Görsel, arkasında mavi ışık */}
          <div className="relative shrink-0">
            <div
              aria-hidden
              className="absolute -inset-8 rounded-[2rem] blur-3xl opacity-60"
              style={{ background: 'radial-gradient(circle, #00c0fa 0%, #015eea 50%, transparent 75%)' }}
            />
            <img
              src={cover}
              alt={title}
              className={`relative rounded-2xl object-cover shadow-2xl shadow-black/70 ring-1 ring-white/15 ${
                landscape ? 'w-[88vw] md:w-[460px] aspect-video' : 'w-48 sm:w-60 md:w-72 aspect-[2/3]'
              }`}
            />
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center text-center md:text-left space-y-4">
            {logo ? (
              <img src={logo} alt={title} className="max-h-24 sm:max-h-28 max-w-full w-auto object-contain mx-auto md:mx-0 md:object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)]" />
            ) : (
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-50">{title}</h2>
            )}
            {logo && <p className="text-lg font-semibold text-neutral-200 -mt-1">{title}</p>}

            <div className="flex flex-wrap justify-center md:justify-start items-center gap-1.5">
              {score !== null && score !== undefined && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400 text-neutral-950">★ {score.toFixed(1)}</span>
              )}
              {!r && (item ?? tmdb)?.rating ? (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400 text-neutral-950">★ {(item ?? tmdb)!.rating}</span>
              ) : null}
              {statusOpt && <span className="text-xs px-2.5 py-1 rounded-full border border-[#00c0fa]/50 text-[#7fdcff] bg-[#00c0fa]/10">{statusOpt.label}</span>}
              {!r && (
                <span className="text-xs px-2.5 py-1 rounded-full border border-neutral-600 text-neutral-300 bg-black/20">
                  {inArchive ? 'Arşivinde var' : "TMDB'den öneri"}
                </span>
              )}
              {meta.map((m) => (
                <span key={m} className="text-xs px-2.5 py-1 rounded-full border border-neutral-600 text-neutral-200 bg-black/20">
                  {m}
                </span>
              ))}
            </div>
            {genres.length > 0 && <p className="text-sm text-neutral-400">{genres.slice(0, 4).join(' · ')}</p>}
            {synopsis && <p className="text-neutral-300 leading-relaxed line-clamp-4 max-w-2xl mx-auto md:mx-0">{synopsis}</p>}

            {/* Eylemler */}
            <div className="pt-2 space-y-3">
              {done ? (
                <p className="text-sm text-emerald-400">✓ {done}</p>
              ) : r ? (
                <>
                  {question && <p className="text-sm text-neutral-400">{question}</p>}
                  <div className="flex flex-wrap justify-center md:justify-start gap-2">
                    {actions.map((a) =>
                      a.primary ? (
                        <button key={a.label} onClick={a.onClick} disabled={busy} style={primaryButtonStyle} className={`text-sm px-4 py-2 rounded-full ${PRIMARY_BUTTON}`}>
                          {a.label}
                        </button>
                      ) : (
                        <button key={a.label} onClick={a.onClick} disabled={busy} className={secondary}>
                          {a.label}
                        </button>
                      ),
                    )}
                    <button onClick={() => onOpenRow(r)} className={secondary}>
                      Detayı aç
                    </button>
                  </div>
                </>
              ) : inArchive ? (
                <p className="text-sm text-emerald-400">✓ Zaten arşivinde</p>
              ) : watchedForm ? (
                <div className="max-w-xs mx-auto md:mx-0 text-left">
                  <WatchedForm busy={busy} onCancel={() => setWatchedForm(false)} onSave={(date, rating) => addFromTmdb('izlendi', date, rating)} />
                </div>
              ) : (
                <>
                  <p className="text-sm text-neutral-400">Arşivinde yok — ne yapalım?</p>
                  <div className="flex flex-wrap justify-center md:justify-start gap-2">
                    <button onClick={() => addFromTmdb('izlenecek')} disabled={busy} style={primaryButtonStyle} className={`text-sm px-4 py-2 rounded-full ${PRIMARY_BUTTON}`}>
                      {busy ? 'Ekleniyor...' : '+ İzleneceklere ekle'}
                    </button>
                    <button onClick={() => setWatchedForm(true)} disabled={busy} className={secondary}>
                      ✓ İzledim
                    </button>
                    <button onClick={dismiss} disabled={busy} className={`${secondary} hover:border-rose-500 hover:text-rose-300`}>
                      Bir daha gösterme
                    </button>
                    {tmdb && (
                      <button onClick={() => onOpenTmdb(tmdb)} className={secondary}>
                        Fragman · Nerede izlenir
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Altta: tekrar getir */}
        <div className="mt-12 flex items-center gap-3">
          <button
            onClick={onAgain}
            className="inline-flex items-center gap-2 text-sm font-semibold text-white rounded-full px-6 py-3 bg-gradient-to-r from-[#00c0fa] to-[#015eea] shadow-lg shadow-[#00c0fa]/30 hover:shadow-[#00c0fa]/50 hover:scale-[1.03] transition"
          >
            ↻ Tekrar getir
          </button>
          <button onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-50 px-4 py-3 transition">
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
