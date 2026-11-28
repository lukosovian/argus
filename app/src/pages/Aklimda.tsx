import { useMemo, useState } from 'react'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useAklimda } from '../hooks/useAklimda'
import { useToast } from '../hooks/useToast'
import { api, type TmdbCard } from '../lib/api'
import { aklimdaEntries, daysAgoLabel, STATUS_TONE, type AklimdaEntry, type AklimdaStatus } from '../lib/aklimda'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { notifyDataChanged } from '../lib/dataEvents'
import { MOBILE } from '../lib/mobile/ui'
import { tt } from '../lib/i18n'
import type { Row } from '../types'
import { titleText } from '../types'
import { Link } from 'react-router-dom'
import PosterWallHero from '../components/PosterWallHero'
import RowDetailModal from '../components/RowDetailModal'
import TmdbPreviewModal from '../components/TmdbPreviewModal'
import { aklimdaCard } from '../components/AklimdaRow'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import Select from '../components/Select'
import { AKLIMDA_LIMITS } from '../hooks/useAklimda'

// Aklımda — kullanıcı "ARGUS'u açıyorum karşıma bir film çıkıyor, bunu izlesem mi diyorum ama not etmeyince aklımdan
// gidiyor" dedi. Detay penceresinde (ve TMDB önizlemesinde) "Aklımda tut" dediğin her şey burada. Arşivdeki
// durumuna göre süzülür; arşivde olmayanlar tek tıkla İzlenecek'e alınır. Kayıtlar: hooks/useAklimda.ts.

type Filter = 'hepsi' | AklimdaStatus

// Sıralama (v1.25): seçim bu tarayıcıda hatırlanır. "Puan" seçeneği yok — Aklımda'dakiler henüz izlenmediği için
// kendi puanın boş, arşivde TMDB/IMDb puanı da tutulmuyor.
type Sort = 'yeni' | 'eski' | 'sure' | 'ad'
const SORT_KEY = 'argus_aklimda_sirala'
const SORTS: { value: Sort; label: string }[] = [
  { value: 'yeni', label: tt('Eklenme: yeniden eskiye') },
  { value: 'eski', label: tt('Eklenme: eskiden yeniye') },
  { value: 'sure', label: tt('Süre: kısadan uzuna') },
  { value: 'ad', label: tt('Ad: A → Z') },
]
function readSort(): Sort {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return SORTS.some((x) => x.value === v) ? (v as Sort) : 'yeni'
  } catch {
    return 'yeni'
  }
}
// Bu kadar gündür bekleyen "unutulmak üzere" sayılır
const FORGET_DAYS = 60

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'hepsi', label: tt('Hepsi') },
  { id: 'izlenecek', label: tt('İzlenecek') },
  { id: 'yarim', label: tt('Yarım kalan') },
  { id: 'izlendi', label: tt('İzlendi') },
  { id: 'yok', label: tt('Arşivinde yok') },
]

export default function Aklimda() {
  const { settings, loading: settingsLoading } = useHomeSettings()
  const { board } = useBoard(settings.boardId ?? undefined)
  const { rows, loading } = useRows(settings.boardId ?? undefined)
  const akl = useAklimda()
  const { notify } = useToast()
  const [filter, setFilter] = useState<Filter>('hepsi')
  const [detail, setDetail] = useState<Row | null>(null)
  const [preview, setPreview] = useState<TmdbCard | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [sort, setSortState] = useState<Sort>(readSort)
  const setSort = (v: Sort) => {
    setSortState(v)
    try {
      localStorage.setItem(SORT_KEY, v)
    } catch {
      /* kapalı — sadece hatırlanmaz */
    }
  }

  const all = useMemo(() => aklimdaEntries(board ?? null, rows, akl.items), [board, rows, akl.items])
  const counts = useMemo(() => {
    const c: Record<string, number> = { hepsi: all.length }
    for (const e of all) c[e.status] = (c[e.status] ?? 0) + 1
    return c
  }, [all])
  const list = useMemo(() => {
    const base = filter === 'hepsi' ? all : all.filter((e) => e.status === filter)
    if (sort === 'yeni') return base
    if (sort === 'eski') return [...base].reverse()
    if (sort === 'ad') return [...base].sort((a, b) => a.title.localeCompare(b.title, 'tr', { sensitivity: 'base' }))
    // Süre: arşivdeki Süre sütunundan (dizide bölüm süresi); süresi bilinmeyenler en sonda
    const sure = board ? resolveRole(board, 'sure') : undefined
    const min = (e: AklimdaEntry) => {
      const v = sure && e.row ? e.row.values[sure.id] : undefined
      return typeof v === 'number' && v > 0 ? v : Infinity
    }
    // İkisinin de süresi bilinmiyorsa (Infinity - Infinity = NaN) sıra bozulmasın, eklenme sırası kalsın
    return [...base].sort((a, b) => (min(a) === min(b) ? 0 : min(a) - min(b)))
  }, [all, filter, sort, board])

  // Arşivinden öneriler (Arayüz Önerileri 3 · M1): arşivde İzlenecek durumunda olup Aklımda'da olmayan, afişi olan
  // yapımlar. Sıra gün boyu aynı kalır (her gün başka bir karışım), en fazla 12 tane.
  const suggestions = useMemo(() => {
    if (!board) return []
    const durum = resolveRole(board, 'durum')
    const izlenecek = resolveStatusOption(board, 'izlenecek')
    if (!durum || !izlenecek) return []
    const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
    const posterProp = resolveRole(board, 'poster')
    const coverProp = board.properties.find((p) => p.id === board.coverPropertyId)
    const day = new Date().toDateString()
    const hash = (s: string) => {
      let h = 2166136261
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
      return h >>> 0
    }
    return rows
      .filter((r) => r.values[durum.id] === izlenecek && !akl.items[r.id])
      .map((r) => ({
        row: r,
        title: titleProp ? titleText(titleProp, r.values[titleProp.id]) : '',
        poster: (posterProp && (r.values[posterProp.id] as string)) || (coverProp && (r.values[coverProp.id] as string)) || '',
        h: hash(r.id + day),
      }))
      .filter((x) => x.poster)
      .sort((a, b) => a.h - b.h)
      .slice(0, 12)
  }, [board, rows, akl.items])
  const [adding, setAdding] = useState<string | null>(null)
  async function addSuggestion(s: { row: Row; title: string }) {
    if (!board) return
    setAdding(s.row.id)
    try {
      await akl.addRow(board.id, s.row.id)
      notify(tt('"{0}" aklına eklendi.', s.title), 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : tt('Kaydedilemedi.'), 'danger')
    } finally {
      setAdding(null)
    }
  }
  // Başlığın arkasındaki afiş duvarı: önce Aklımda'dakiler, az ise önerilerle tamamlanır
  const heroPosters = useMemo(() => [...all.map((e) => e.poster), ...suggestions.map((s) => s.poster)].filter(Boolean).slice(0, 14), [all, suggestions])

  async function remove(e: AklimdaEntry) {
    try {
      await akl.remove(e.key)
      notify(tt('"{0}" aklından çıkarıldı.', e.title))
    } catch (err) {
      notify(err instanceof Error ? err.message : tt('Kaydedilemedi.'), 'danger')
    }
  }

  // Arşivde olmayanı İzlenecek olarak ekler (sunucu Aklımda kaydını yeni arşiv kaydına bağlar, not korunur);
  // arşivde olup durumu boş / başka olanı İzlenecek'e alır.
  async function toWatchlist(e: AklimdaEntry) {
    if (!board) return
    setBusy(e.key)
    try {
      if (e.item.tmdb) {
        await api.addFromTmdb(board.id, { tmdbId: e.item.tmdb.id, mediaType: e.item.tmdb.mediaType, status: 'izlenecek' })
      } else if (e.row) {
        const durum = resolveRole(board, 'durum')
        const opt = resolveStatusOption(board, 'izlenecek')
        if (!durum || !opt) throw new Error(tt('Arşivinde İzlenecek durumu bulunamadı.'))
        await api.updateRow(board.id, e.row.id, { values: { ...e.row.values, [durum.id]: opt }, createdAt: e.row.createdAt, updatedAt: Date.now() }, [durum.id])
      }
      notifyDataChanged(board.id)
      notify(tt('"{0}" izlenecekler listene eklendi.', e.title), 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : tt('Eklenemedi.'), 'danger')
    } finally {
      setBusy(null)
    }
  }

  // Arşiv seçilmemişse sonsuza dek "Yükleniyor…" kalmasın (Abonelik'teki gibi yönlendir)
  if (!settingsLoading && !settings.boardId) return <p className="text-center text-neutral-500 py-20">{tt('Önce bir arşiv seç (Ayarlar → Ana Sayfa).')}</p>
  if (!board || loading || !akl.loaded)
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <span className="h-4 w-4 rounded-full border-2 border-[#00c0fa] border-t-transparent animate-spin" />
          {tt('Yükleniyor…')}
        </div>
      </div>
    )

  return (
    <div className={`max-w-6xl mx-auto px-4 ${MOBILE ? 'pt-2 pb-8' : 'py-8'} space-y-6`}>
      {!MOBILE && (
        <PosterWallHero posters={heroPosters} tint="rgba(139,92,246,0.18)">
          <h1 className="text-4xl sm:text-5xl font-black text-neutral-50 tracking-tight flex items-center gap-3">
            <Icon name="bookmark" className="h-9 w-9 text-violet-300" />
            {tt('Aklımda')}
          </h1>
          <p className="text-neutral-300 mt-2 max-w-2xl">{tt('"Bunu izlesem mi?" dediğin her şey burada. Bir yapımın detayında "Aklımda tut"a basman yeter.')}</p>
        </PosterWallHero>
      )}

      {/* Sınır: liste dolunca yeni ekleme yapılmaz (bkz. useAklimda) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm text-neutral-200">
            {akl.limit > 0 ? tt('{0} / {1} yapım', akl.count, akl.limit) : tt('{0} yapım', akl.count)}
            {akl.full && <span className="ml-2 text-xs font-semibold text-amber-300">{tt('Dolu — yenisi için birini çıkar')}</span>}
          </p>
          {akl.limit > 0 &&
            (akl.limit <= 50 ? (
              // Sınır kadar küçük bölme: kaç yerin dolu olduğu tek bakışta (v1.23.3)
              <div className="mt-2 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${akl.limit}, minmax(0,1fr))` }}>
                {Array.from({ length: akl.limit }, (_, i) => (
                  <span key={i} className={`h-2 rounded-[3px] transition-colors ${i < akl.count ? (akl.full ? 'bg-amber-400' : 'bg-gradient-to-r from-violet-500 to-violet-400') : 'bg-neutral-800'}`} />
                ))}
              </div>
            ) : (
              <div className="mt-1.5 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${akl.full ? 'bg-amber-400' : 'bg-violet-400'}`} style={{ width: `${Math.min(100, (akl.count / akl.limit) * 100)}%` }} />
              </div>
            ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          {tt('En fazla')}
          <Select
            value={String(akl.limit)}
            onChange={(v) => akl.setLimit(Number(v)).catch((e) => notify(e instanceof Error ? e.message : tt('Kaydedilemedi.'), 'danger'))}
            options={[...new Set([...AKLIMDA_LIMITS.filter((n) => n > 0), akl.limit, 0])].filter((n) => n > 0).sort((a, b) => a - b).concat(0).map((n) => ({ value: String(n), label: n === 0 ? tt('Sınırsız') : tt('{0} yapım', n) }))}
            className="w-32"
          />
        </label>
      </div>

      {all.length === 0 ? (
        <EmptyState
          art="afis"
          icon="bookmark"
          poster={suggestions[0]?.poster}
          title={tt('Aklında henüz bir şey yok')}
          text={tt('Ana sayfada ya da arşivde bir yapımı açıp "Aklımda tut"a bas; Benzer İçerikler ve Ne İzlesem önerilerinde de var. Eklediklerin burada ve ana sayfada "Aklında kalanlar" satırında görünür.')}
        >
          {suggestions.length > 0 ? (
            <button
              onClick={() => addSuggestion(suggestions[Math.floor(Math.random() * suggestions.length)])}
              disabled={!!adding}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
            >
              <Icon name="dice" className="h-4 w-4" />
              {tt('İzleneceklerinden birini ekle')}
            </button>
          ) : (
            <Link to={`/board/${board.id}`} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition">
              <Icon name="table" className="h-4 w-4" />
              {tt('Arşivini aç')}
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.filter((f) => f.id === 'hepsi' || counts[f.id]).map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`text-xs rounded-full px-3 py-1.5 border transition ${filter === f.id ? 'border-[#00c0fa] text-[#7fdcff] bg-[#00c0fa]/15' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}
              >
                {f.label} <span className="opacity-60">{counts[f.id] ?? 0}</span>
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs text-neutral-400">
              {tt('Sırala')}
              <Select value={sort} onChange={(v) => setSort(v as Sort)} options={SORTS} className="w-52" />
            </label>
          </div>

          <div className={`grid gap-x-3 gap-y-5 ${MOBILE ? 'grid-cols-3' : 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]'}`}>
            {list.map((e) => {
              // Kaç gündür aklında: 30 günü geçince kırmızılaşır, karar vermen için dürter (v1.23.3, öneri M1)
              const days = Math.max(0, Math.floor((Date.now() - e.item.addedAt) / 864e5))
              const canAdd = e.status === 'yok' || e.status === 'diger'
              return (
              <div key={e.key} className="min-w-0 flex flex-col">
                <div className="group relative block w-full aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 shadow-lg shadow-black/40 transition duration-300 hover:-translate-y-1 hover:shadow-black/70 hover:ring-1 hover:ring-violet-400/50">
                  <button onClick={() => (e.row ? setDetail(e.row) : setPreview(aklimdaCard(e)))} className="absolute inset-0" title={e.title}>
                    {e.poster ? (
                      <img src={e.poster} alt={e.title} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-neutral-400">{e.title}</span>
                    )}
                  </button>
                  {(e.statusLabel || e.status === 'yok') && (
                    <span className={`pointer-events-none absolute top-1.5 left-1.5 text-[10px] font-semibold rounded px-1.5 py-0.5 ${STATUS_TONE[e.status]}`}>
                      {e.status === 'yok' ? tt('Arşivinde yok') : e.statusLabel}
                    </span>
                  )}
                  {days > FORGET_DAYS ? (
                    // 60 günü geçen: "unutulmak üzere" (v1.25)
                    <span
                      className="pointer-events-none absolute top-1.5 right-1.5 text-[10px] font-semibold rounded px-1.5 py-0.5 bg-amber-400/90 text-black"
                      title={tt('eklendi: {0}', daysAgoLabel(e.item.addedAt))}
                    >
                      {tt('unutulmak üzere · {0} gün', days)}
                    </span>
                  ) : (
                    <span
                      className={`pointer-events-none absolute top-1.5 right-1.5 text-[10px] font-semibold rounded px-1.5 py-0.5 bg-black/70 backdrop-blur-sm ${days > 30 ? 'text-rose-300' : 'text-neutral-200'}`}
                      title={tt('eklendi: {0}', daysAgoLabel(e.item.addedAt))}
                    >
                      {days === 0 ? tt('bugün') : tt('{0} gündür', days)}
                    </span>
                  )}
                  {/* Bilgisayarda düğmeler afişin üstüne gelince çıkar; telefonda altta kalır */}
                  {!MOBILE && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 p-2 pt-10 bg-gradient-to-t from-black/95 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      {canAdd && (
                        <button
                          onClick={() => toWatchlist(e)}
                          disabled={busy === e.key}
                          className="pointer-events-auto text-[11px] font-semibold rounded-md bg-violet-600 hover:bg-violet-500 text-white py-1.5 transition disabled:opacity-50"
                        >
                          {busy === e.key ? tt('Ekleniyor...') : tt('+ İzlenecek')}
                        </button>
                      )}
                      <button
                        onClick={() => remove(e)}
                        className="pointer-events-auto text-[11px] font-medium rounded-md bg-white/15 hover:bg-rose-500/80 text-white py-1.5 backdrop-blur-sm transition"
                      >
                        {tt('Aklımdan çıkar')}
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-neutral-200 mt-1.5 truncate" title={e.title}>
                  {e.title}
                  {e.year && <span className="text-neutral-500"> · {e.year}</span>}
                </p>
                {MOBILE && <div className="flex gap-1 mt-1.5">
                  {(e.status === 'yok' || e.status === 'diger') && (
                    <button
                      onClick={() => toWatchlist(e)}
                      disabled={busy === e.key}
                      className="flex-1 text-[11px] rounded-md border border-neutral-700 text-neutral-200 hover:border-[#00c0fa] hover:text-[#7fdcff] py-1 transition disabled:opacity-50"
                    >
                      {busy === e.key ? tt('Ekleniyor...') : tt('+ İzlenecek')}
                    </button>
                  )}
                  <button
                    onClick={() => remove(e)}
                    title={tt('Aklımdan çıkar')}
                    className="flex-1 text-[11px] rounded-md border border-neutral-700 text-neutral-400 hover:border-rose-500 hover:text-rose-300 py-1 transition"
                  >
                    {tt('Çıkar')}
                  </button>
                </div>}
              </div>
              )
            })}
          </div>
        </>
      )}

      {/* Arşivinden öneriler: soluk durur, üzerine gelince renklenir; "+" ile Aklımda'ya eklenir (M1) */}
      {suggestions.length > 0 && (
        <section className="pt-2">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
              <Icon name="sparkle" className="h-4 w-4 text-violet-300" />
              {tt('Arşivinden öneriler')}
            </h2>
            <span className="text-xs text-neutral-500">{akl.full ? tt('Aklın dolu — eklemek için birini çıkar') : tt('İzlenecek listenden')}</span>
          </div>
          <div className={`grid gap-3 ${MOBILE ? 'grid-cols-3' : 'grid-cols-4 sm:grid-cols-6'}`}>
            {suggestions.map((s) => (
              <div key={s.row.id} className="min-w-0">
                <div className="group relative aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800 shadow-md shadow-black/40">
                  <button onClick={() => setDetail(s.row)} className="absolute inset-0" title={s.title}>
                    <img
                      src={s.poster}
                      alt={s.title}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover [filter:grayscale(.6)_brightness(.45)] transition duration-300 group-hover:[filter:none] group-hover:scale-105"
                    />
                  </button>
                  <button
                    onClick={() => addSuggestion(s)}
                    disabled={akl.full || adding === s.row.id}
                    title={akl.full ? tt('Aklın dolu') : tt('Aklımda tut')}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center h-10 w-10 rounded-full border-[1.5px] border-white/50 bg-white/15 text-white backdrop-blur-sm transition hover:bg-violet-500 hover:border-violet-300 disabled:opacity-40 disabled:hover:bg-white/15"
                  >
                    <Icon name="plus" className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-[11px] text-neutral-400 mt-1 truncate" title={s.title}>
                  {s.title}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {detail && <RowDetailModal board={board} row={rows.find((r) => r.id === detail.id) ?? detail} onClose={() => setDetail(null)} />}
      {preview && <TmdbPreviewModal boardId={board.id} card={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
