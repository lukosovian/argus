import { useEffect, useState } from 'react'
import type { Board, Row } from '../types'
import { titleText, todayIso, ratingAverage, RATING_OVERALL } from '../types'
import { api, type TmdbCard, type TmdbItem } from '../lib/api'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { formatRuntime, showcaseMeta } from '../lib/rowMeta'
import { notifyDataChanged } from '../lib/dataEvents'
import { useToast } from '../hooks/useToast'
import CollectionSection from './CollectionSection'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import { tt } from '../lib/i18n'
import { MOBILE } from '../lib/mobile/ui'
import Icon, { IconText, type IconName } from './Icon'

// Seride baştan başlatıldıysa (bkz. RandomPickerButton seriesStart): asıl çıkan film ve sıraları
export type SeriesSwap = { pickedTitle: string; pickedNumber: number; number: number }

// Kullanıcı "izlemediğim bir şey geldiğinde izledim deyince puan verme kısmı detaylı değil, detaylandır" dedi:
// tarih + arşivin puan kriterleri (Senaryo, Oyunculuk…) tek tek; kriter yoksa tek genel puan. Puanlanmayan
// kriter boş kalır, ortalama canlı gösterilir.
function DetailedWatchedForm({
  board,
  busy,
  onSave,
  onCancel,
}: {
  board: Board
  busy: boolean
  onSave: (date: string | null, scores: Record<string, number>) => void
  onCancel: () => void
}) {
  const criteria = resolveRole(board, 'puan')?.criteria ?? []
  const [date, setDate] = useState<string | null>(todayIso())
  const [scores, setScores] = useState<Record<string, number>>({})
  const keys = criteria.length ? criteria.map((c) => ({ id: c.id, name: c.name })) : [{ id: RATING_OVERALL, name: tt('Genel puan') }]
  const given = keys.map((k) => scores[k.id]).filter((n): n is number => typeof n === 'number')
  const avg = given.length ? given.reduce((a, b) => a + b, 0) / given.length : null
  const setAll = (n: number) => setScores(Object.fromEntries(keys.map((k) => [k.id, n])))
  return (
    <div className="w-full max-w-md mx-auto md:mx-0 text-left space-y-4 rounded-2xl bg-neutral-900/80 border border-neutral-700 p-4 backdrop-blur-sm">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">{tt('İzleme tarihi')}</span>
          {date === null ? (
            <button onClick={() => setDate(todayIso())} className="text-xs text-[#00c0fa] hover:underline">
              {tt('Tarih ekle')}
            </button>
          ) : (
            <button onClick={() => setDate(null)} className="text-xs text-neutral-500 hover:text-neutral-300">
              {tt('Hatırlamıyorum')}
            </button>
          )}
        </div>
        {date !== null && (
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value || null)}
            className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500"
          />
        )}
      </div>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">{tt('Puan')}</span>
          <span className="text-sm font-semibold text-amber-400 tabular-nums">{avg === null ? tt('Puansız') : <span className="inline-flex items-center gap-1"><Icon name="star" className="h-3.5 w-3.5" />{avg.toFixed(1)}</span>}</span>
        </div>
        {keys.map((k) => (
          <div key={k.id}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-neutral-300">{k.name}</span>
              <span className="flex items-center gap-1.5">
                <span className="font-semibold text-neutral-50 tabular-nums">{scores[k.id] ?? '—'}</span>
                {scores[k.id] !== undefined && (
                  <button
                    onClick={() => setScores(({ [k.id]: _drop, ...rest }) => rest)}
                    title={tt('Bu puanı kaldır')}
                    className="text-neutral-500 hover:text-rose-400 leading-none"
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={scores[k.id] ?? 0}
              onChange={(e) => setScores((s) => ({ ...s, [k.id]: Number(e.target.value) }))}
              className={`w-full accent-[#00c0fa] ${scores[k.id] === undefined ? 'opacity-40' : ''}`}
            />
          </div>
        ))}
        {criteria.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-neutral-500">{tt('Hepsine:')}</span>
            {[5, 6, 7, 8, 9, 10].map((n) => (
              <button key={n} onClick={() => setAll(n)} className="text-[11px] rounded-lg border border-neutral-700 hover:border-neutral-400 text-neutral-300 px-2 py-0.5">
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave(date, scores)}
          disabled={busy}
          style={primaryButtonStyle}
          className={`flex-1 text-sm px-4 py-2 rounded-full ${PRIMARY_BUTTON}`}
        >
          {busy ? tt('Kaydediliyor...') : tt('Kaydet')}
        </button>
        <button onClick={onCancel} disabled={busy} className="text-sm rounded-full border border-neutral-700 text-neutral-300 px-4 py-2 hover:border-neutral-400">
          {tt('Vazgeç')}
        </button>
      </div>
    </div>
  )
}

// "Şimdi başlarsan bitiş: 23:47" ve tek satırlık "neden bu?" (Ekstralar › Bitiş saati)
function EndTimeWhy({ board, row, tmdbRuntime, isSeries, allRows }: { board: Board; row?: Row; tmdbRuntime: number | null; isSeries?: boolean; allRows: Row[] }) {
  const sure = resolveRole(board, 'sure')
  const kategori = resolveRole(board, 'kategori')
  const tur = resolveRole(board, 'tur')
  const puan = resolveRole(board, 'puan')
  const yon = resolveRole(board, 'yonetmen')
  const series = isSeries ?? (row && kategori ? /dizi|series|tv/i.test(kategori.options?.find((o) => o.id === row.values[kategori.id])?.label ?? '') : false)
  const minutes = row && sure && typeof row.values[sure.id] === 'number' ? (row.values[sure.id] as number) : tmdbRuntime
  const total = series ? 2 * 45 : minutes
  const end = total ? new Date(Date.now() + total * 60000).toTimeString().slice(0, 5) : null
  const why: string[] = []
  if (row) {
    const days = Math.floor((Date.now() - row.createdAt) / 864e5)
    if (days >= 7) why.push(days >= 60 ? tt('{0} aydır listende', Math.floor(days / 30)) : tt('{0} gündür listende', days))
    const avgOf = (rs: Row[]) => {
      const v = rs.map((x) => (puan ? ratingAverage(x.values[puan.id], puan) : null)).filter((n): n is number => n !== null)
      return v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : null
    }
    if (tur) {
      const ids = Array.isArray(row.values[tur.id]) ? (row.values[tur.id] as string[]) : []
      let best: { label: string; avg: number } | null = null
      for (const id of ids) {
        const a = avgOf(allRows.filter((x) => x.id !== row.id && Array.isArray(x.values[tur.id]) && (x.values[tur.id] as string[]).includes(id)))
        const label = tur.options?.find((o) => o.id === id)?.label
        if (a !== null && label && (!best || a > best.avg)) best = { label, avg: a }
      }
      if (best && best.avg >= 7) why.push(tt("{0} türüne ortalama {1} veriyorsun", best.label, best.avg.toFixed(1).replace('.', ',')))
    }
    const d = yon && typeof row.values[yon.id] === 'string' ? (row.values[yon.id] as string).trim() : ''
    if (d && puan) {
      const liked = allRows.filter((x) => x.id !== row.id && x.values[yon!.id] === row.values[yon!.id] && (ratingAverage(x.values[puan.id], puan) ?? 0) >= 8.5).length
      if (liked >= 2) why.push(tt('{0} yapımını {1} kez çok beğendin', d, liked))
    }
  } else why.push(tt('arşivinde yok, TMDB\'den yeni bir öneri'))
  if (!end && !why.length) return null
  return (
    <div className="space-y-2">
      {end && (
        <p className="inline-flex items-center gap-2 rounded-xl border border-violet-400/40 bg-violet-500/15 px-3.5 py-2 text-sm text-violet-100">
          🌙 {series ? tt('2 bölüm izlersen bitiş:') : tt('Şimdi başlarsan bitiş:')} <b className="text-white">{end}</b>
        </p>
      )}
      {why.length > 0 && <p className="text-sm text-[#7fdcff]">{tt('Neden bu?')} · {why.join(' · ')}</p>}
      <p className="text-xs text-neutral-500">
        <kbd className="rounded border border-neutral-700 border-b-2 px-1.5 font-mono text-[11px]">{tt('Boşluk')}</kbd> {tt('tekrar getir')}
      </p>
    </div>
  )
}

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
  swap,
  onAgain,
  onOpenRow,
  onOpenTmdb,
  extrasEndTime = false,
  allRows = [],
}: {
  board: Board
  row?: Row
  tmdb?: TmdbCard
  cover: string
  landscape: boolean
  swap?: SeriesSwap | null
  onAgain: () => void
  onOpenRow: (row: Row) => void
  onOpenTmdb: (card: TmdbCard) => void
  // Ekstralar › Bitiş saati ve "neden bu?" (v1.23.4)
  extrasEndTime?: boolean
  allRows?: Row[]
}) {
  const { notify } = useToast()
  const [item, setItem] = useState<TmdbItem | null>(null)
  // Kullanıcı "Ne İzlesem'den gelen içeriğin sinopsisinin tamamını okuyabileyim" dedi: dokununca açılır/kapanır
  const [fullSynopsis, setFullSynopsis] = useState(false)
  const [current, setCurrent] = useState<Row | undefined>(row)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [watchedForm, setWatchedForm] = useState(false)
  // Arşivdeki kayıt için "Zaten izledim" / "Bitirdim": detaylı puan formu açık mı (açıksa hangi duruma geçecek)
  const [rowForm, setRowForm] = useState(false)
  const [position, setPosition] = useState<{ number: number; total: number } | null>(null)

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
        tmdb?.mediaType === 'tv' ? tt('Dizi') : tt('Film'),
        (item ?? tmdb)?.year ?? '',
        item?.runtime ? formatRuntime(item.runtime) : '',
        item?.seasons ? tt('{0} Sezon', item.seasons) : '',
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
      notify(e instanceof Error ? e.message : tt('Kaydedilemedi.'), 'danger')
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

  // Detaylı formdan: İzlendi + (varsa) tarih + kriter puanları
  function markWatched(date: string | null, scores: Record<string, number>) {
    if (!durumProp || !izlendiId) return
    patchRow((v) => {
      const next = { ...v, [durumProp.id]: izlendiId }
      if (date && tarihProp) {
        const cur = next[tarihProp.id]
        if (tarihProp.type === 'multidate') {
          const list = Array.isArray(cur) ? (cur as string[]) : typeof cur === 'string' && cur ? [cur] : []
          next[tarihProp.id] = list.includes(date) ? list : [...list, date]
        } else next[tarihProp.id] = date
      }
      if (puanProp && Object.keys(scores).length) next[puanProp.id] = scores
      return next
    }, tt('İzlendi olarak işaretlendi.'))
    setRowForm(false)
  }

  async function addFromTmdb(status: 'izlenecek' | 'izlendi', watchedDate?: string | null, scores?: Record<string, number>) {
    if (!tmdb) return
    setBusy(true)
    try {
      const res = await api.addFromTmdb(board.id, {
        tmdbId: tmdb.tmdbId,
        mediaType: tmdb.mediaType,
        status,
        watchedDate: watchedDate ?? undefined,
        rating: scores?.[RATING_OVERALL],
        scores: scores && !(RATING_OVERALL in scores) ? scores : undefined,
      })
      notifyDataChanged(board.id)
      setWatchedForm(false)
      const msg = status === 'izlendi' ? tt('"{0}" izlediklerine eklendi.', res.title) : tt('"{0}" izlenecekler listene eklendi.', res.title)
      setDone(msg)
      notify(msg)
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Eklenemedi.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function dismiss() {
    if (!tmdb) return
    try {
      await api.dismissTmdb({ tmdbId: tmdb.tmdbId, mediaType: tmdb.mediaType })
      notify(tt('"{0}" bir daha önerilmeyecek.', tmdb.title))
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
  const actions: { label: string; icon?: IconName; onClick: () => void; primary?: boolean }[] = []
  if (r && !done) {
    if (statusId && statusId === izlendiId) {
      question = tt('Bunu daha önce izlemişsin. Yine mi izliyorsun?')
      if (tarihProp) actions.push({ label: tt('↻ Bugün yine izledim'), primary: true, onClick: () => patchRow(addToday, tt('Bugünün tarihi izleme tarihlerine eklendi.')) })
    } else if (statusId && statusId === izleniyorId) {
      question = tt('Bunu izliyordun — kaldığın yerden devam mı?')
      if (izlendiId && durumProp)
        actions.push({
          label: tt('✓ Bitirdim'),
          primary: true,
          onClick: () => setRowForm(true),
        })
    } else {
      question = tt('Bu akşam bu olsun mu?')
      if (izleniyorId && durumProp)
        actions.push({
          label: tt('Başlıyorum'),
          icon: 'play',
          primary: true,
          onClick: () => patchRow((v) => ({ ...v, [durumProp.id]: izleniyorId }), tt('İzleniyor olarak işaretlendi.')),
        })
      if (izlendiId && durumProp)
        actions.push({
          label: tt('✓ Zaten izledim'),
          onClick: () => setRowForm(true),
        })
    }
  }

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto" style={MOBILE ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}>
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
              <img src={logo} alt={title} className={`${MOBILE ? 'max-h-14 max-w-[70%]' : 'max-h-24 sm:max-h-28 max-w-full'} w-auto object-contain mx-auto md:mx-0 md:object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)]`} />
            ) : (
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-50">{title}</h2>
            )}
            {logo && <p className="text-lg font-semibold text-neutral-200 -mt-1">{title}</p>}
            {swap && (
              <p className="text-sm text-[#7fdcff] max-w-2xl mx-auto md:mx-0">
                {tt('"{0}" çıktı ama o serinin {1}. filmi — {2}. filmi izlemediğin için seriye buradan başla.', swap.pickedTitle, swap.pickedNumber, swap.number)}
              </p>
            )}

            <div className="flex flex-wrap justify-center md:justify-start items-center gap-1.5">
              {score !== null && score !== undefined && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400 text-neutral-950"><Icon name="star" className="h-[0.95em] w-[0.95em]" /> {score.toFixed(1)}</span>
              )}
              {!r && (item ?? tmdb)?.rating ? (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400 text-neutral-950"><Icon name="star" className="h-[0.95em] w-[0.95em]" /> {(item ?? tmdb)!.rating}</span>
              ) : null}
              {position && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#00c0fa]/15 border border-[#00c0fa]/50 text-[#7fdcff]">
                  {tt('Serinin {0}. filmi', position.number)}
                </span>
              )}
              {statusOpt && <span className="text-xs px-2.5 py-1 rounded-full border border-[#00c0fa]/50 text-[#7fdcff] bg-[#00c0fa]/10">{statusOpt.label}</span>}
              {!r && (
                <span className="text-xs px-2.5 py-1 rounded-full border border-neutral-600 text-neutral-300 bg-black/20">
                  {inArchive ? tt('Arşivinde var') : tt('TMDB\'den öneri')}
                </span>
              )}
              {meta.map((m) => (
                <span key={m} className="text-xs px-2.5 py-1 rounded-full border border-neutral-600 text-neutral-200 bg-black/20">
                  <IconText text={m} />
                </span>
              ))}
            </div>
            {genres.length > 0 && <p className="text-sm text-neutral-400">{genres.slice(0, 4).join(' · ')}</p>}
            {extrasEndTime && <EndTimeWhy board={board} row={r} tmdbRuntime={item?.runtime ?? null} isSeries={r ? undefined : tmdb?.mediaType === 'tv'} allRows={allRows} />}
            {synopsis && (
              <button onClick={() => setFullSynopsis((v) => !v)} className="block text-left max-w-2xl mx-auto md:mx-0">
                <span className={`block text-neutral-300 leading-relaxed ${fullSynopsis ? '' : 'line-clamp-4'}`}>{synopsis}</span>
                {synopsis.length > 220 && <span className="block mt-1 text-sm font-semibold text-[#7fdcff]">{fullSynopsis ? tt('Daha az göster') : tt('Devamını oku')}</span>}
              </button>
            )}

            {/* Eylemler */}
            <div className="pt-2 space-y-3">
              {done ? (
                <p className="text-sm text-emerald-400">✓ {done}</p>
              ) : r && rowForm ? (
                <DetailedWatchedForm board={board} busy={busy} onCancel={() => setRowForm(false)} onSave={markWatched} />
              ) : r ? (
                <>
                  {question && <p className="text-sm text-neutral-400">{question}</p>}
                  <div className="flex flex-wrap justify-center md:justify-start gap-2">
                    {actions.map((a) =>
                      a.primary ? (
                        <button key={a.label} onClick={a.onClick} disabled={busy} style={primaryButtonStyle} className={`text-sm px-4 py-2 rounded-full inline-flex items-center gap-1.5 ${PRIMARY_BUTTON}`}>
                          {a.icon && <Icon name={a.icon} className="h-3.5 w-3.5" />}
                          {a.label}
                        </button>
                      ) : (
                        <button key={a.label} onClick={a.onClick} disabled={busy} className={`${secondary} inline-flex items-center gap-1.5`}>
                          {a.icon && <Icon name={a.icon} className="h-3.5 w-3.5" />}
                          {a.label}
                        </button>
                      ),
                    )}
                    <button onClick={() => onOpenRow(r)} className={secondary}>
                      {tt('Detayı aç')}
                    </button>
                  </div>
                </>
              ) : inArchive ? (
                <p className="text-sm text-emerald-400">{tt('✓ Zaten arşivinde')}</p>
              ) : watchedForm ? (
                <DetailedWatchedForm board={board} busy={busy} onCancel={() => setWatchedForm(false)} onSave={(date, scores) => addFromTmdb('izlendi', date, scores)} />
              ) : (
                <>
                  <p className="text-sm text-neutral-400">{tt('Arşivinde yok — ne yapalım?')}</p>
                  <div className="flex flex-wrap justify-center md:justify-start gap-2">
                    <button onClick={() => addFromTmdb('izlenecek')} disabled={busy} style={primaryButtonStyle} className={`text-sm px-4 py-2 rounded-full ${PRIMARY_BUTTON}`}>
                      {busy ? tt('Ekleniyor...') : tt('+ İzleneceklere ekle')}
                    </button>
                    <button onClick={() => setWatchedForm(true)} disabled={busy} className={secondary}>
                      {tt('✓ İzledim')}
                    </button>
                    <button onClick={dismiss} disabled={busy} className={`${secondary} hover:border-rose-500 hover:text-rose-300`}>
                      {tt('Bir daha gösterme')}
                    </button>
                    {tmdb && (
                      <button onClick={() => onOpenTmdb(tmdb)} className={secondary}>
                        {tt('Fragman · Nerede izlenir')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {/* Seri film: serinin diğer filmleri (kullanıcı "seri bir film gelirse altta diğer filmleri de göstersin") */}
        {(r || tmdb?.mediaType === 'movie') && (
          <div className="w-full max-w-5xl mt-10 text-left">
            <CollectionSection
              key={r?.id ?? tmdb?.tmdbId}
              boardId={board.id}
              rowId={r?.id}
              tmdbId={r ? undefined : tmdb?.tmdbId}
              onPosition={(number, total) => setPosition({ number, total })}
              onOpenRow={(id) => {
                api
                  .getRows(board.id)
                  .then((rows) => {
                    const found = rows.find((x) => x.id === id)
                    if (found) onOpenRow(found)
                  })
                  .catch(() => {})
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
