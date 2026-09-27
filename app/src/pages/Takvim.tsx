import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useBoards } from '../hooks/useBoards'
import { useBoard } from '../hooks/useBoard'
import { useRows } from '../hooks/useRows'
import { useToast } from '../hooks/useToast'
import { useProfiles } from '../hooks/useProfiles'
import { api } from '../lib/api'
import { notifyDataChanged, onDataChanged } from '../lib/dataEvents'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { rowMatchesConditions, type FilterCondition } from '../lib/filters'
import { episodeKey, titleText, type Board, type EpisodesMap, type Row, type WatchedMap } from '../types'
import { BRAND_GRADIENT, BRAND_TEXT, PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import Select from '../components/Select'
import MultiFilterEditor from '../components/MultiFilterEditor'
import RowDetailModal from '../components/RowDetailModal'

// Takvim — kullanıcı "Notion'daki gibi takvim; günlerde ne izlemişsin görelim, ay ay" dedi ve şu
// özellikleri onayladı: dizilerde bölüm bölüm kayıt, ileriye bakma (çıkacak bölümler ve vizyonlar),
// takvimden ekleme, yıl görünümü + en uzun seri, filtre, tekrar izleme işareti. Bir günde birden fazla
// içerik varsa "+2" yerine hepsi alt alta görünüyor, o günün kutusu uzuyor (Notion'daki gibi).
// Veriler: İzleme Tarihi sütunu (görevinden), bölüm tikleri (watched.json), bölüm yayın tarihleri
// (episodes.json), Vizyon Tarihi.

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const TR_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
// "2025-03-12" → "12.03.25"
function shortDate(s: string): string {
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${(y ?? '').slice(2)}`
}
function dayLabel(s: string): string {
  const d = parseYmd(s)
  const wd = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][d.getDay()]
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${wd}`
}

type EventKind = 'watch' | 'episodes' | 'upcoming' | 'release'
interface CalEvent {
  key: string
  date: string
  row: Row
  kind: EventKind
  sub: string
  rewatch?: boolean
  episodeCount?: number
  finished?: boolean
}

// "S1B3" / "S1 · B1–B8" gibi kısa bölüm etiketi.
function episodesLabel(eps: [number, number][], names?: Map<string, string>): string {
  const sorted = [...eps].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length === 1) {
    const [s, e] = sorted[0]
    const n = names?.get(`${s}-${e}`)
    return `S${s}B${e}${n ? ` · ${n}` : ''}`
  }
  const [s1, e1] = sorted[0]
  const [s2, e2] = sorted[sorted.length - 1]
  const range = s1 === s2 ? `S${s1} · B${e1}–B${e2}` : `S${s1}B${e1} – S${s2}B${e2}`
  return `${sorted.length} bölüm · ${range}`
}

function buildEvents(board: Board, rows: Row[], watched: WatchedMap, episodes: EpisodesMap, today: string): CalEvent[] {
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const durumProp = resolveRole(board, 'durum')
  const vizyonProp = resolveRole(board, 'vizyon')
  const kategoriProp = resolveRole(board, 'kategori')
  const izleniyorId = resolveStatusOption(board, 'izleniyor')
  const izlenecekId = resolveStatusOption(board, 'izlenecek')
  const byKey = new Map<string, CalEvent>()
  const out: CalEvent[] = []

  for (const row of rows) {
    // 1) İzleme tarihleri (tekrar izlemeler işaretli)
    if (dateProp) {
      const v = row.values[dateProp.id]
      const dates = (Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []).filter(Boolean).slice().sort()
      // Dizilerde birden fazla tarih genelde başlama/bitirme ya da sezonlar — tekrar izleme sayılmıyor.
      const series = (episodes[row.id]?.length ?? 0) > 0 || /dizi/i.test(kategoriProp?.options?.find((o) => o.id === row.values[kategoriProp.id])?.label ?? '')
      dates.forEach((d, i) => {
        const rewatch = i > 0 && !series
        const ev: CalEvent = { key: `w:${row.id}:${d}:${i}`, date: d, row, kind: 'watch', sub: rewatch ? 'Tekrar izledin' : '', rewatch }
        if (!byKey.has(`${d}|${row.id}`)) byKey.set(`${d}|${row.id}`, ev)
        out.push(ev)
      })
    }

    // 2) Bölüm bölüm izlenenler (aynı gün aynı dizi tek satır)
    const seen = watched[row.id]
    if (seen) {
      const names = new Map<string, string>()
      for (const s of episodes[row.id] ?? []) for (const e of s.episodes) names.set(`${s.seasonNumber}-${e.episodeNumber}`, e.name)
      const perDay = new Map<string, [number, number][]>()
      for (const [k, ds] of Object.entries(seen)) {
        const [s, e] = k.split('-').map(Number)
        for (const d of ds ?? []) {
          if (!d) continue
          const list = perDay.get(d) ?? []
          list.push([s, e])
          perDay.set(d, list)
        }
      }
      for (const [d, eps] of perDay) {
        const label = episodesLabel(eps, names)
        const existing = byKey.get(`${d}|${row.id}`)
        if (existing && existing.kind === 'watch') {
          // Aynı gün hem bölüm izlenmiş hem izleme tarihi girilmiş: dizi o gün bitmiş.
          existing.sub = `${label} · bitirdin`
          existing.episodeCount = eps.length
          existing.finished = true
        } else {
          const ev: CalEvent = { key: `e:${row.id}:${d}`, date: d, row, kind: 'episodes', sub: label, episodeCount: eps.length }
          byKey.set(`${d}|${row.id}`, ev)
          out.push(ev)
        }
      }
    }

    // 3) İleriye bakma: izlediğin dizilerin çıkacak bölümleri
    const statusId = durumProp ? (row.values[durumProp.id] as string) : ''
    const tracking = (izleniyorId && statusId === izleniyorId) || (seen && Object.values(seen).some((d) => d?.length))
    if (tracking && episodes[row.id]) {
      const perDay = new Map<string, [number, number][]>()
      for (const s of episodes[row.id]) {
        if (s.seasonNumber === 0) continue
        for (const e of s.episodes) {
          if (!e.airDate || e.airDate < today) continue
          const list = perDay.get(e.airDate) ?? []
          list.push([s.seasonNumber, e.episodeNumber])
          perDay.set(e.airDate, list)
        }
      }
      for (const [d, eps] of perDay) out.push({ key: `u:${row.id}:${d}`, date: d, row, kind: 'upcoming', sub: `Yeni: ${episodesLabel(eps)}` })
    }

    // 4) İzleneceklerin vizyon tarihleri (bugünden sonrası)
    if (vizyonProp && izlenecekId && statusId === izlenecekId) {
      const v = row.values[vizyonProp.id]
      if (typeof v === 'string' && v >= today) out.push({ key: `r:${row.id}`, date: v, row, kind: 'release', sub: 'Vizyona giriyor' })
    }
  }
  return out
}

const KIND_ORDER: Record<EventKind, number> = { watch: 0, episodes: 1, upcoming: 2, release: 3 }

export default function Takvim() {
  const { settings, loading: settingsLoading } = useHomeSettings()
  const { boards, loading: boardsLoading } = useBoards()
  const { notify, confirm } = useToast()
  const { activeProfileId } = useProfiles()
  const [params, setParams] = useSearchParams()
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)

  useEffect(() => {
    if (selectedBoardId || boardsLoading) return
    if (settings.boardId && boards.some((b) => b.id === settings.boardId)) setSelectedBoardId(settings.boardId)
    else if (boards.length > 0) setSelectedBoardId(boards[0].id)
  }, [boardsLoading, boards, settings.boardId, selectedBoardId])

  const { board, loading: boardLoading } = useBoard(selectedBoardId ?? undefined)
  const { rows, loading: rowsLoading, saveRow } = useRows(selectedBoardId ?? undefined)
  const [watched, setWatched] = useState<WatchedMap>({})
  const [episodes, setEpisodes] = useState<EpisodesMap>({})

  useEffect(() => {
    // Profil henüz seçilmediyse (ör. sayfa doğrudan açıldıysa) istek atma — api o durumda hemen hata fırlatıyor.
    if (!activeProfileId) return
    const load = () => {
      Promise.resolve()
        .then(() => api.getWatched())
        .then(setWatched)
        .catch(() => {})
      Promise.resolve()
        .then(() => api.getEpisodes())
        .then(setEpisodes)
        .catch(() => {})
    }
    load()
    return onDataChanged(() => load())
  }, [selectedBoardId, activeProfileId])

  const today = ymd(new Date())
  const view: 'ay' | 'yil' = params.get('gorunum') === 'yil' ? 'yil' : 'ay'
  const monthParam = params.get('ay')
  const cursor = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? parseYmd(`${monthParam}-01`) : parseYmd(today.slice(0, 7) + '-01')
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  function go(next: { ay?: string; gorunum?: 'ay' | 'yil' }) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next.ay) p.set('ay', next.ay)
        if (next.gorunum) {
          if (next.gorunum === 'yil') p.set('gorunum', 'yil')
          else p.delete('gorunum')
        }
        return p
      },
      { replace: true },
    )
  }
  const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`
  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1)
    go({ ay: monthKey(d.getFullYear(), d.getMonth()) })
  }

  const [conditions, setConditions] = useState<FilterCondition[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<Row | null>(null)

  const filteredRows = useMemo(() => (conditions.length ? rows.filter((r) => rowMatchesConditions(r, conditions)) : rows), [rows, conditions])
  const events = useMemo(
    () => (board ? buildEvents(board, filteredRows, watched, episodes, today) : []),
    [board, filteredRows, watched, episodes, today],
  )
  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>()
    for (const ev of events) {
      const list = m.get(ev.date) ?? []
      list.push(ev)
      m.set(ev.date, list)
    }
    for (const list of m.values()) list.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    return m
  }, [events])

  // Hızlı seçim: en son izlediğin 4 farklı içerik (bugüne kadar, yeniden eskiye).
  const recentRows = (() => {
    const seen = new Set<string>()
    const out: Row[] = []
    const past = events.filter((e) => (e.kind === 'watch' || e.kind === 'episodes') && e.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1))
    for (const e of past) {
      if (seen.has(e.row.id)) continue
      seen.add(e.row.id)
      out.push(e.row)
      if (out.length === 4) break
    }
    return out
  })()

  if (settingsLoading || boardsLoading) return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>
  if (boards.length === 0) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-neutral-500 text-sm mb-4">Takvim için önce bir arşivin olması lazım.</p>
        <Link to="/arsivlerim" style={primaryButtonStyle} className={`inline-block text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}>
          Arşiv Oluştur
        </Link>
      </div>
    )
  }
  if (boardLoading || rowsLoading || !board) return <p className="text-neutral-500 text-sm p-6">Yükleniyor...</p>

  const hasDateProp = Boolean(resolveRole(board, 'izlemeTarihi'))

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-5">
      {/* Işık efekti kendi kırpılan katmanında — kutunun kendisi kırpmıyor ki Filtre paneli dışarı taşıp açılabilsin. */}
      <section className="relative z-20 rounded-3xl border border-neutral-800 bg-neutral-900/60 px-5 py-6 md:px-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div className="absolute -top-28 -right-20 h-64 w-[36rem] max-w-[140%] rounded-full blur-3xl opacity-20" style={{ background: BRAND_GRADIENT }} />
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-50 tracking-tight">Takvim</h1>
            <p className="text-sm text-neutral-400 mt-1.5">
              <span style={{ color: BRAND_TEXT }}>{board.name}</span> — ne zaman ne izledin, sırada neler var.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {boards.length > 1 && (
              <div className="min-w-44">
                <label className="block text-xs text-neutral-500 mb-1">Hangi arşiv?</label>
                <Select value={selectedBoardId ?? ''} onChange={setSelectedBoardId} options={boards.map((b) => ({ value: b.id, label: b.name }))} />
              </div>
            )}
            <div className="relative">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className={`h-10 text-sm rounded-xl border px-3.5 transition ${
                  conditions.length ? 'border-[#00c0fa]/60 text-[#7fdcff] bg-[#00c0fa]/10' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
                }`}
              >
                Filtre{conditions.length ? ` · ${conditions.length}` : ''}
              </button>
              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setFilterOpen(false)} />
                  <div className="absolute left-0 sm:left-auto sm:right-0 top-12 z-40 w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-xl p-3 shadow-lg">
                    <MultiFilterEditor
                      board={board}
                      conditions={conditions}
                      onChange={setConditions}
                      compact
                      emptyText="Takvimde sadece istediklerin görünsün: bir tık ✓ gelsin, iki tık ✕ gelmesin."
                    />
                  </div>
                </>
              )}
            </div>
            <div className="h-10 grid grid-cols-2 rounded-xl bg-neutral-950/60 border border-neutral-800 p-1 text-sm">
              {(['ay', 'yil'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => go({ gorunum: v })}
                  className={`px-3 rounded-lg transition ${view === v ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:text-neutral-100'}`}
                >
                  {v === 'ay' ? 'Ay' : 'Yıl'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {!hasDateProp && (
        <p className="text-sm text-amber-400 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          Bu arşivde "İzleme Tarihi" görevinde bir sütun yok — takvimde sadece bölüm işaretlerin ve ileriye dönük tarihler görünür. Tablodaki
          sütun menüsünden bir tarih sütununa "İzleme Tarihi" görevini verebilirsin.
        </p>
      )}

      {view === 'ay' ? (
        <MonthView
          board={board}
          year={year}
          month={month}
          today={today}
          byDay={byDay}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          onToday={() => go({ ay: today.slice(0, 7) })}
          onOpenDay={setOpenDay}
          onOpenRow={setDetailRow}
        />
      ) : (
        <YearView
          year={year}
          today={today}
          byDay={byDay}
          onYear={(y) => go({ ay: `${y}-${String(month + 1).padStart(2, '0')}` })}
          onPickDay={(d) => {
            go({ ay: d.slice(0, 7), gorunum: 'ay' })
            setOpenDay(d)
          }}
        />
      )}

      {openDay && (
        <DayPanel
          board={board}
          rows={rows}
          date={openDay}
          today={today}
          events={byDay.get(openDay) ?? []}
          onClose={() => setOpenDay(null)}
          onOpenRow={setDetailRow}
          episodes={episodes}
          watched={watched}
          recent={recentRows}
          onAdd={async (row, opts) => {
            const day = openDay
            const eps = opts.episodes ?? []
            // Bölümler: o kaydın bölüm haritasına bu günün tarihi eklenir.
            if (eps.length > 0) {
              const current = (await api.getWatched())[row.id] ?? {}
              const next = { ...current }
              for (const [s, e] of eps) {
                const k = episodeKey(s, e)
                const list = next[k] ?? []
                if (!list.includes(day)) next[k] = [...list, day].sort()
              }
              await api.saveRowWatched(row.id, next)
            }
            // İzleme tarihi (film ya da "diziyi bitirdim") ve durum.
            const fresh = (await api.getRows(board.id)).find((r) => r.id === row.id) ?? row
            const values = { ...fresh.values }
            let changed = false
            const dateProp = resolveRole(board, 'izlemeTarihi')
            if (opts.addDate && dateProp) {
              const v = values[dateProp.id]
              if (dateProp.type === 'multidate') {
                const list = Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []
                values[dateProp.id] = list.includes(day) ? list : [...list, day].sort()
              } else values[dateProp.id] = day
              changed = true
            }
            const durumProp = resolveRole(board, 'durum')
            if (opts.status && durumProp) {
              const statusId = resolveStatusOption(board, opts.status)
              if (statusId) {
                values[durumProp.id] = statusId
                changed = true
              }
            }
            if (changed) await saveRow({ values, createdAt: fresh.createdAt, updatedAt: Date.now() }, fresh.id)
            setWatched(await api.getWatched())
            notifyDataChanged(board.id)
            const tp = board.properties.find((p) => p.id === board.titlePropertyId)
            const name = tp ? titleText(tp, row.values[tp.id]) : 'Kayıt'
            notify(`"${name}"${eps.length ? ` (${eps.length} bölüm)` : ''} ${dayLabel(day).split(',')[0]} tarihine eklendi.`)
          }}
          onRemove={async (ev) => {
            const day = ev.date
            const tp = board.properties.find((p) => p.id === board.titlePropertyId)
            const name = tp ? titleText(tp, ev.row.values[tp.id]) : 'Kayıt'
            const ok = await confirm({
              message: `"${name}" ${dayLabel(day).split(',')[0]} tarihinden kaldırılsın mı?${ev.episodeCount ? ` O gün işaretlediğin ${ev.episodeCount} bölümün işareti de kalkar.` : ''} Kaydın kendisi silinmez.`,
              confirmLabel: 'Kaldır',
            })
            if (!ok) return
            // O günün bölüm işaretleri
            if (ev.episodeCount) {
              const current = (await api.getWatched())[ev.row.id] ?? {}
              const next: Record<string, string[]> = {}
              for (const [k, ds] of Object.entries(current)) {
                const left = (ds ?? []).filter((d) => d !== day)
                if (left.length) next[k] = left
              }
              await api.saveRowWatched(ev.row.id, next)
            }
            // İzleme tarihinden o günü bir kez çıkar
            if (ev.kind === 'watch') {
              const dateProp = resolveRole(board, 'izlemeTarihi')
              const fresh = (await api.getRows(board.id)).find((r) => r.id === ev.row.id) ?? ev.row
              if (dateProp) {
                const values = { ...fresh.values }
                const v = values[dateProp.id]
                if (Array.isArray(v)) {
                  const list = [...(v as string[])]
                  const i = list.indexOf(day)
                  if (i >= 0) list.splice(i, 1)
                  values[dateProp.id] = list
                } else if (v === day) values[dateProp.id] = dateProp.type === 'multidate' ? [] : ''
                await saveRow({ values, createdAt: fresh.createdAt, updatedAt: Date.now() }, fresh.id)
              }
            }
            setWatched(await api.getWatched())
            notifyDataChanged(board.id)
            notify(`"${name}" bu günden kaldırıldı.`)
          }}
        />
      )}
      {detailRow && (
        <RowDetailModal
          board={board}
          row={detailRow}
          editable
          onClose={() => {
            setDetailRow(null)
            // Detayda bölüm işaretlendiyse ya da tekrar izleme eklendiyse takvim de güncellensin.
            Promise.resolve()
              .then(() => api.getWatched())
              .then(setWatched)
              .catch(() => {})
            notifyDataChanged(board.id)
          }}
        />
      )}
    </div>
  )
}

// ---- Ortak parçalar --------------------------------------------------------------------------

function rowLook(board: Board) {
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const posterProp = resolveRole(board, 'poster')
  const bannerProp = resolveRole(board, 'banner')
  const kategoriProp = resolveRole(board, 'kategori')
  const sureProp = resolveRole(board, 'sure')
  return {
    title: (row: Row) => (titleProp ? titleText(titleProp, row.values[titleProp.id]) : '') || 'İsimsiz',
    poster: (row: Row) =>
      ((posterProp && (row.values[posterProp.id] as string)) || (bannerProp && (row.values[bannerProp.id] as string)) || '') as string,
    kategori: (row: Row) => (kategoriProp ? kategoriProp.options?.find((o) => o.id === row.values[kategoriProp.id])?.label ?? '' : ''),
    minutes: (row: Row) => (sureProp && typeof row.values[sureProp.id] === 'number' ? (row.values[sureProp.id] as number) : 0),
  }
}

function EventItem({ ev, look, onClick, big = false }: { ev: CalEvent; look: ReturnType<typeof rowLook>; onClick: () => void; big?: boolean }) {
  const future = ev.kind === 'upcoming' || ev.kind === 'release'
  const poster = look.poster(ev.row)
  const sub = ev.sub || look.kategori(ev.row)
  return (
    <button
      onClick={onClick}
      title={`${look.title(ev.row)}${sub ? ' — ' + sub : ''}`}
      className={`w-full flex items-center gap-2 rounded-lg text-left transition min-w-0 ${big ? 'p-2' : 'p-1'} ${
        future
          ? 'border border-dashed border-neutral-700 hover:border-[#00c0fa]/60 opacity-75 hover:opacity-100'
          : 'bg-neutral-800/60 hover:bg-neutral-800 border border-transparent hover:border-neutral-600'
      }`}
    >
      <span className={`relative shrink-0 rounded overflow-hidden bg-neutral-800 ${big ? 'h-16 w-11' : 'h-9 w-6'}`}>
        {poster && <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium text-neutral-100 ${big ? 'text-sm' : 'text-[11px] leading-tight'}`}>{look.title(ev.row)}</span>
        {sub && (
          <span
            className={`block truncate ${big ? 'text-xs mt-0.5' : 'text-[10px] leading-tight'} ${
              ev.rewatch ? 'text-amber-400' : future ? 'text-[#7fdcff]' : ev.finished ? 'text-emerald-400' : 'text-neutral-500'
            }`}
          >
            {ev.rewatch ? '↻ ' : ''}
            {sub}
          </span>
        )}
      </span>
    </button>
  )
}

// ---- Ay görünümü -----------------------------------------------------------------------------

function MonthView({
  board,
  year,
  month,
  today,
  byDay,
  onPrev,
  onNext,
  onToday,
  onOpenDay,
  onOpenRow,
}: {
  board: Board
  year: number
  month: number
  today: string
  byDay: Map<string, CalEvent[]>
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onOpenDay: (d: string) => void
  onOpenRow: (r: Row) => void
}) {
  const look = rowLook(board)
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7))
  const last = new Date(year, month + 1, 0)
  const end = new Date(year, month + 1, 0 + ((7 - last.getDay()) % 7))
  const days: string[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(ymd(d))
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`

  // Ay özeti (sadece bu ayın geçmiş kayıtları)
  const monthEvents = [...byDay.entries()].filter(([d]) => d.startsWith(monthPrefix)).flatMap(([, l]) => l)
  const past = monthEvents.filter((e) => e.kind === 'watch' || e.kind === 'episodes')
  const isSeries = (r: Row) => /dizi/i.test(look.kategori(r))
  const films = past.filter((e) => e.kind === 'watch' && !isSeries(e.row))
  const episodeCount = past.reduce((n, e) => n + (e.episodeCount ?? 0), 0)
  const finishedSeries = past.filter((e) => e.kind === 'watch' && isSeries(e.row)).length
  const filmMinutes = films.reduce((n, e) => n + look.minutes(e.row), 0)
  const activeDays = new Set(past.map((e) => e.date)).size
  const upcoming = monthEvents.filter((e) => e.kind === 'upcoming' || e.kind === 'release').length

  const agendaDays = days.filter((d) => d.startsWith(monthPrefix) && (byDay.get(d)?.length ?? 0) > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={onPrev} aria-label="Önceki ay" className="h-9 w-9 rounded-lg border border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-neutral-50 transition">
            ‹
          </button>
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-50 min-w-[10rem] text-center">
            {TR_MONTHS[month]} {year}
          </h2>
          <button onClick={onNext} aria-label="Sonraki ay" className="h-9 w-9 rounded-lg border border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-neutral-50 transition">
            ›
          </button>
          {!today.startsWith(monthPrefix) && (
            <button onClick={onToday} className="ml-1 text-sm text-[#00c0fa] hover:underline">
              Bugün
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <SummaryPill value={films.length} label="film" />
          <SummaryPill value={episodeCount} label="bölüm" />
          {finishedSeries > 0 && <SummaryPill value={finishedSeries} label="dizi bitirdin" />}
          {filmMinutes > 0 && <SummaryPill value={Math.round(filmMinutes / 60)} label="saat film" />}
          <SummaryPill value={activeDays} label="gün izleme" />
          {upcoming > 0 && <SummaryPill value={upcoming} label="yaklaşan" accent />}
        </div>
      </div>

      {/* Masaüstü: Notion gibi ızgara — günün kutusu içindekilere göre uzuyor */}
      <div className="hidden md:block rounded-2xl border border-neutral-800 overflow-hidden">
        <div className="grid grid-cols-7 bg-neutral-900/80 border-b border-neutral-800">
          {TR_DAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-xs font-medium text-neutral-500">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = d.startsWith(monthPrefix)
            const list = byDay.get(d) ?? []
            const isToday = d === today
            return (
              <div
                key={d}
                className={`group min-h-[7.5rem] p-1.5 border-neutral-800 ${i % 7 !== 6 ? 'border-r' : ''} ${i < days.length - 7 ? 'border-b' : ''} ${
                  inMonth ? 'bg-neutral-950/30' : 'bg-neutral-950/70'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => onOpenDay(d)}
                    className={`h-6 min-w-6 px-1.5 rounded-full text-xs tabular-nums transition ${
                      isToday ? 'bg-[#00c0fa] text-white font-semibold' : inMonth ? 'text-neutral-300 hover:bg-neutral-800' : 'text-neutral-600 hover:bg-neutral-800'
                    }`}
                  >
                    {parseYmd(d).getDate()}
                  </button>
                  <button
                    onClick={() => onOpenDay(d)}
                    title="Bu güne ekle / günü aç"
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 rounded-md text-neutral-500 hover:text-neutral-50 hover:bg-neutral-800 transition"
                  >
                    +
                  </button>
                </div>
                <div className={`space-y-1 ${inMonth ? '' : 'opacity-50'}`}>
                  {list.map((ev) => (
                    <EventItem key={ev.key} ev={ev} look={look} onClick={() => onOpenRow(ev.row)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Telefon: gün gün liste */}
      <div className="md:hidden space-y-3">
        {agendaDays.length === 0 && <p className="text-sm text-neutral-500 text-center py-8">Bu ay için kayıt yok.</p>}
        {agendaDays.map((d) => (
          <div key={d} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3">
            <button onClick={() => onOpenDay(d)} className={`text-sm font-semibold mb-2 ${d === today ? 'text-[#00c0fa]' : 'text-neutral-200'}`}>
              {dayLabel(d)}
            </button>
            <div className="space-y-1.5">
              {(byDay.get(d) ?? []).map((ev) => (
                <EventItem key={ev.key} ev={ev} look={look} onClick={() => onOpenRow(ev.row)} big />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-600 flex flex-wrap gap-x-4 gap-y-1">
        <span>Kesik çizgili: yaklaşan (yeni bölüm / vizyon)</span>
        <span className="text-amber-500/80">↻ tekrar izleme</span>
        <span className="text-emerald-500/80">bitirdin: o gün diziyi bitirdin</span>
        <span>Bir güne eklemek için günün numarasına tıkla.</span>
      </p>
    </div>
  )
}

function SummaryPill({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  return (
    <span className={`rounded-full border px-3 py-1.5 ${accent ? 'border-[#00c0fa]/40 bg-[#00c0fa]/10 text-[#7fdcff]' : 'border-neutral-800 bg-neutral-900/60 text-neutral-400'}`}>
      <span className={`font-semibold tabular-nums ${accent ? '' : 'text-neutral-100'}`}>{value}</span> {label}
    </span>
  )
}

// ---- Yıl görünümü ----------------------------------------------------------------------------

function YearView({
  year,
  today,
  byDay,
  onYear,
  onPickDay,
}: {
  year: number
  today: string
  byDay: Map<string, CalEvent[]>
  onYear: (y: number) => void
  onPickDay: (d: string) => void
}) {
  // Günün yoğunluğu: izlenen içerik + bölüm sayısı (yaklaşanlar sayılmaz).
  const weight = (d: string) =>
    (byDay.get(d) ?? []).reduce((n, e) => (e.kind === 'watch' ? n + 1 : e.kind === 'episodes' ? n + (e.episodeCount ?? 1) : n), 0)

  const yearDays: string[] = []
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) yearDays.push(ymd(d))
  const weights = new Map(yearDays.map((d) => [d, weight(d)]))
  const max = Math.max(1, ...weights.values())
  const active = yearDays.filter((d) => (weights.get(d) ?? 0) > 0)

  // En uzun seri (art arda izleme yapılan günler)
  let best = 0
  let bestEnd = ''
  let run = 0
  for (const d of yearDays) {
    if ((weights.get(d) ?? 0) > 0) {
      run++
      if (run > best) {
        best = run
        bestEnd = d
      }
    } else run = 0
  }
  // Bugüne kadarki güncel seri
  let current = 0
  for (let d = parseYmd(today); ; d.setDate(d.getDate() - 1)) {
    const k = ymd(d)
    if (weight(k) > 0) current++
    else if (k !== today) break
    if (current > 400) break
  }
  const busiest = active.reduce((a, d) => ((weights.get(d) ?? 0) > (weights.get(a) ?? 0) ? d : a), active[0] ?? '')
  const monthTotals = TR_MONTHS.map((_, m) => yearDays.filter((d) => parseYmd(d).getMonth() === m).reduce((n, d) => n + (weights.get(d) ?? 0), 0))
  const busiestMonth = monthTotals.indexOf(Math.max(...monthTotals))
  const total = monthTotals.reduce((a, b) => a + b, 0)

  const level = (w: number) => (w === 0 ? 0 : Math.min(4, Math.ceil((w / max) * 4)))
  const levelBg = ['bg-neutral-800/70', 'bg-[#00c0fa]/25', 'bg-[#00c0fa]/45', 'bg-[#00c0fa]/70', 'bg-[#00c0fa]']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => onYear(year - 1)} className="h-9 w-9 rounded-lg border border-neutral-800 text-neutral-300 hover:border-neutral-600 transition">
            ‹
          </button>
          <h2 className="text-2xl font-semibold text-neutral-50 w-20 text-center tabular-nums">{year}</h2>
          <button onClick={() => onYear(year + 1)} className="h-9 w-9 rounded-lg border border-neutral-800 text-neutral-300 hover:border-neutral-600 transition">
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <YearTile label="İzleme yaptığın gün" value={String(active.length)} />
        <YearTile label="Toplam izleme" value={String(total)} sub="içerik + bölüm" />
        <YearTile label="En uzun seri" value={best ? `${best} gün` : '—'} sub={best > 1 ? `${dayLabel(bestEnd).split(',')[0]}'de bitti` : undefined} />
        <YearTile label="Şu anki seri" value={current ? `${current} gün` : '—'} sub={current ? 'devam ediyor 🔥' : 'bugün bir şey izle'} />
        <YearTile
          label="En yoğun"
          value={total ? TR_MONTHS[busiestMonth] : '—'}
          sub={busiest ? `en dolu gün: ${dayLabel(busiest).split(',')[0]}` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {TR_MONTHS.map((name, m) => {
          const first = new Date(year, m, 1)
          const lead = (first.getDay() + 6) % 7
          const count = new Date(year, m + 1, 0).getDate()
          return (
            <div key={name} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-semibold text-neutral-100">{name}</p>
                <p className="text-[11px] text-neutral-500 tabular-nums">{monthTotals[m] || ''}</p>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: lead }, (_, i) => (
                  <span key={`b${i}`} />
                ))}
                {Array.from({ length: count }, (_, i) => {
                  const d = ymd(new Date(year, m, i + 1))
                  const w = weights.get(d) ?? 0
                  return (
                    <button
                      key={d}
                      onClick={() => onPickDay(d)}
                      title={`${dayLabel(d)}${w ? ` — ${w} izleme` : ''}`}
                      className={`aspect-square rounded-[4px] ${levelBg[level(w)]} ${d === today ? 'ring-2 ring-[#00c0fa] ring-offset-1 ring-offset-neutral-900' : ''} hover:ring-1 hover:ring-neutral-400 transition`}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
        Az
        {levelBg.map((c, i) => (
          <span key={i} className={`h-3 w-3 rounded-[3px] ${c}`} />
        ))}
        Çok · Bir güne tıklayınca o ayın takviminde açılır.
      </div>
    </div>
  )
}

function YearTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-xl font-semibold text-neutral-50 mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}


// ---- Gün paneli (sağdan açılır) + takvimden ekleme / kaldırma ----------------------------------

type AddOptions = { episodes?: [number, number][]; addDate: boolean; status?: 'izleniyor' | 'izlendi' }

function DayPanel({
  board,
  rows,
  date,
  today,
  events,
  episodes,
  watched,
  recent,
  onClose,
  onOpenRow,
  onAdd,
  onRemove,
}: {
  board: Board
  rows: Row[]
  date: string
  today: string
  events: CalEvent[]
  episodes: EpisodesMap
  watched: WatchedMap
  // Hızlı seçim için en son izlenenler
  recent: Row[]
  onClose: () => void
  onOpenRow: (r: Row) => void
  onAdd: (row: Row, opts: AddOptions) => Promise<void>
  onRemove: (ev: CalEvent) => Promise<void>
}) {
  const look = rowLook(board)
  const [q, setQ] = useState('')
  const [markStatus, setMarkStatus] = useState(true)
  const [busy, setBusy] = useState(false)
  // Dizi seçilince bölüm seçme adımı
  const [picked, setPicked] = useState<Row | null>(null)
  const [season, setSeason] = useState<number | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [finished, setFinished] = useState(false)

  const dateProp = resolveRole(board, 'izlemeTarihi')
  const hasDurum = Boolean(resolveRole(board, 'durum') && resolveStatusOption(board, 'izlendi'))
  const canAdd = date <= today
  const norm = (s: string) => s.toLocaleLowerCase('tr')
  const results = q.trim() ? rows.filter((r) => norm(look.title(r)).includes(norm(q.trim()))).slice(0, 8) : []
  const seasonsOf = (r: Row) => (episodes[r.id] ?? []).filter((s) => s.seasonNumber > 0 && s.episodes.length > 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (picked) setPicked(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, picked])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  function pick(r: Row) {
    const seasons = seasonsOf(r)
    if (seasons.length === 0) {
      // Film (ya da bölüm bilgisi olmayan kayıt): doğrudan izleme tarihi.
      if (!dateProp) return
      run(async () => {
        await onAdd(r, { addDate: true, status: markStatus && hasDurum ? 'izlendi' : undefined })
        setQ('')
      })
      return
    }
    setPicked(r)
    setSeason(seasons[0].seasonNumber)
    setChosen(new Set())
    setFinished(false)
  }

  // Arama/hızlı seçim satırının altındaki bilgi: filmde kaç kez ve en son ne zaman, dizide en son
  // izlenen bölüm. Daha önce izlenmiş olsa da yine eklenebilir (bir şeyi birkaç günde izlemek olur).
  function watchInfo(r: Row): string {
    const series = seasonsOf(r).length > 0
    if (series) {
      let last: { d: string; k: string } | null = null
      for (const [k, ds] of Object.entries(watched[r.id] ?? {})) for (const d of ds ?? []) if (!last || d > last.d) last = { d, k }
      if (!last) return 'Dizi · henüz bölüm işaretlemedin'
      const [sn, en] = last.k.split('-')
      return `Dizi · en son S${sn}B${en} (${shortDate(last.d)})`
    }
    const v = dateProp ? r.values[dateProp.id] : undefined
    const dates = (Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []).filter(Boolean).sort()
    if (dates.length === 0) return 'Henüz izlemedin'
    const onDay = dates.includes(date) ? ' · bu gün zaten ekli' : ''
    return `${dates.length === 1 ? 'İzledin' : `${dates.length} kez izledin`}, en son ${shortDate(dates[dates.length - 1])}${onDay}`
  }

  function rowButton(r: Row) {
    const series = seasonsOf(r).length > 0
    return (
      <button
        key={r.id}
        disabled={busy || (!series && !dateProp)}
        onClick={() => pick(r)}
        className="w-full flex items-center gap-2 rounded-lg p-1.5 hover:bg-neutral-800 text-left transition disabled:opacity-50"
      >
        <span className="h-10 w-7 rounded overflow-hidden bg-neutral-800 shrink-0">
          {look.poster(r) && <img src={look.poster(r)} alt="" className="h-full w-full object-cover" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-neutral-200 truncate">{look.title(r)}</span>
          <span className="block text-[11px] text-neutral-500 truncate">{watchInfo(r)}</span>
        </span>
        <span className="text-xs text-[#00c0fa] shrink-0">{series ? 'Bölüm seç ›' : '+ Ekle'}</span>
      </button>
    )
  }

  const pickedSeasons = picked ? seasonsOf(picked) : []
  const currentSeason = pickedSeasons.find((s) => s.seasonNumber === season)
  const epKey = (s: number, e: number) => `${s}-${e}`
  const toggleEp = (k: string) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  const seasonKeys = currentSeason ? currentSeason.episodes.map((e) => epKey(currentSeason.seasonNumber, e.episodeNumber)) : []
  const allSeasonChosen = seasonKeys.length > 0 && seasonKeys.every((k) => chosen.has(k))

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="h-full w-full sm:w-[440px] bg-neutral-900 border-l border-neutral-800 overflow-y-auto p-5 space-y-5 animate-[argus-toast-in_.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-neutral-500">{date === today ? 'Bugün' : date > today ? 'İleride' : 'Geçmiş'}</p>
            <h2 className="text-lg font-semibold text-neutral-50">{dayLabel(date)}</h2>
          </div>
          <button onClick={onClose} aria-label="Kapat" className="h-8 w-8 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-500 text-neutral-400 hover:text-neutral-50">
            ×
          </button>
        </div>

        {events.length > 0 ? (
          <div className="space-y-1.5">
            {events.map((ev) => {
              const removable = ev.kind === 'watch' || ev.kind === 'episodes'
              return (
                <div key={ev.key} className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    <EventItem ev={ev} look={look} onClick={() => onOpenRow(ev.row)} big />
                  </div>
                  {removable && (
                    <button
                      disabled={busy}
                      onClick={() => run(() => onRemove(ev))}
                      title="Bu günden kaldır"
                      aria-label="Bu günden kaldır"
                      className="h-9 w-9 shrink-0 rounded-lg border border-neutral-800 text-neutral-500 hover:text-rose-400 hover:border-rose-500/50 transition disabled:opacity-50"
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Bu gün için bir şey yok.</p>
        )}

        {canAdd && !picked && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 space-y-2.5">
            <p className="text-sm font-medium text-neutral-100">Bu gün şunu izledim</p>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Arşivinde ara..."
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
            />
            {hasDurum && (
              <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                <input type="checkbox" checked={markStatus} onChange={(e) => setMarkStatus(e.target.checked)} />
                Durumunu da güncelle (film: İzlendi · dizi: İzleniyor, bitirdiysen İzlendi)
              </label>
            )}
            {!q.trim() && recent.length > 0 && (
              <div>
                <p className="text-[11px] text-neutral-500 mb-1">Son izlediklerin — tek tıkla seç</p>
                <div className="space-y-1">{recent.map(rowButton)}</div>
              </div>
            )}
            {results.length > 0 && <div className="space-y-1">{results.map(rowButton)}</div>}
            {q.trim() && results.length === 0 && <p className="text-xs text-neutral-500">Arşivinde bulunamadı.</p>}
          </div>
        )}

        {canAdd && picked && (
          <div className="rounded-xl border border-[#00c0fa]/30 bg-neutral-950/40 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-12 w-8 rounded overflow-hidden bg-neutral-800 shrink-0">
                {look.poster(picked) && <img src={look.poster(picked)} alt="" className="h-full w-full object-cover" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-100 truncate">{look.title(picked)}</p>
                <p className="text-xs text-neutral-500">Bu gün hangi bölümleri izledin? ✓ olanları daha önce de izlemişsin, yine eklenebilir.</p>
              </div>
              <button onClick={() => setPicked(null)} className="text-xs text-neutral-500 hover:text-neutral-100">
                ‹ Geri
              </button>
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {pickedSeasons.map((s) => {
                const n = s.episodes.filter((e) => chosen.has(epKey(s.seasonNumber, e.episodeNumber))).length
                return (
                  <button
                    key={s.seasonNumber}
                    onClick={() => setSeason(s.seasonNumber)}
                    className={`shrink-0 text-xs rounded-full border px-3 py-1.5 transition ${
                      season === s.seasonNumber ? 'border-[#00c0fa] text-[#7fdcff] bg-[#00c0fa]/10' : 'border-neutral-700 text-neutral-400 hover:text-neutral-100'
                    }`}
                  >
                    {s.seasonNumber}. sezon{n ? ` · ${n}` : ''}
                  </button>
                )
              })}
            </div>

            {currentSeason && (
              <div>
                <button
                  onClick={() =>
                    setChosen((prev) => {
                      const next = new Set(prev)
                      for (const k of seasonKeys) {
                        if (allSeasonChosen) next.delete(k)
                        else next.add(k)
                      }
                      return next
                    })
                  }
                  className="text-xs text-[#00c0fa] hover:underline mb-1.5"
                >
                  {allSeasonChosen ? 'Bu sezonun seçimini kaldır' : 'Bu sezonun hepsini seç'}
                </button>
                <div className="max-h-64 overflow-y-auto space-y-0.5 pr-1">
                  {currentSeason.episodes.map((e) => {
                    const k = epKey(currentSeason.seasonNumber, e.episodeNumber)
                    const future = Boolean(e.airDate && e.airDate > date)
                    return (
                      <label
                        key={k}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-neutral-800 ${future ? 'opacity-50' : ''}`}
                      >
                        <input type="checkbox" checked={chosen.has(k)} onChange={() => toggleEp(k)} />
                        <span className="text-neutral-500 tabular-nums w-8 shrink-0">B{e.episodeNumber}</span>
                        <span className="text-neutral-200 truncate flex-1">{e.name}</span>
                        {future && <span className="text-[10px] text-neutral-500 shrink-0">henüz çıkmamıştı</span>}
                        {(() => {
                          const ds = (watched[picked!.id]?.[k] ?? []).slice().sort()
                          if (ds.length === 0) return null
                          const today0 = ds.includes(date)
                          return (
                            <span
                              className={`text-[10px] shrink-0 ${today0 ? 'text-[#7fdcff]' : 'text-emerald-400'}`}
                              title={`İzlediğin tarihler: ${ds.map(shortDate).join(', ')}`}
                            >
                              {today0 ? 'bu gün işaretli' : `✓ ${shortDate(ds[ds.length - 1])}${ds.length > 1 ? ` +${ds.length - 1}` : ''}`}
                            </span>
                          )
                        })()}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {dateProp && (
              <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                <input type="checkbox" checked={finished} onChange={(e) => setFinished(e.target.checked)} />
                Diziyi bu gün bitirdim (izleme tarihi olarak da eklensin)
              </label>
            )}

            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setPicked(null)} className="text-sm text-neutral-400 hover:text-neutral-100 px-3 py-1.5">
                Vazgeç
              </button>
              <button
                disabled={busy || (chosen.size === 0 && !finished)}
                onClick={() =>
                  run(async () => {
                    const eps = [...chosen].map((k) => k.split('-').map(Number) as [number, number])
                    await onAdd(picked, {
                      episodes: eps,
                      addDate: finished,
                      status: markStatus && hasDurum ? (finished ? 'izlendi' : 'izleniyor') : undefined,
                    })
                    setPicked(null)
                    setQ('')
                  })
                }
                style={primaryButtonStyle}
                className={`text-sm px-4 py-1.5 rounded-lg ${PRIMARY_BUTTON}`}
              >
                {chosen.size ? `${chosen.size} bölümü ekle` : 'Ekle'}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
