// Telefondaki kopyadan (PC kapalıyken de) ana ekran kutusu (Y11) ve telefon bildirimleri (Y12/Y25) için veri.
// api.* telefonda fetchShim'den geçer: PC'ye bağlıysa PC'den, değilse telefondaki kopyadan okur.
import { api } from '../api'
import type { Board, EpisodesMap, Row, WatchedMap } from '../../types'
import { episodeKey, titleText, todayIso } from '../../types'
import { resolveRole, resolveStatusOption, watchedStatusIds } from '../roles'
import { isName, STATUS_NAMES } from '../names'
import { tt, EP } from '../i18n'

export interface PhoneData {
  board: Board
  rows: Row[]
  episodes: EpisodesMap
  watched: WatchedMap
}

export async function loadPhoneData(): Promise<PhoneData | null> {
  const settings = await api.getHomeSettings().catch(() => null)
  const boards = await api.getBoards().catch(() => [] as Board[])
  const board = boards.find((b) => b.id === settings?.boardId) ?? boards[0]
  if (!board) return null
  const [rows, episodes, watched] = await Promise.all([
    api.getRows(board.id).catch(() => [] as Row[]),
    api.getEpisodes().catch(() => ({}) as EpisodesMap),
    api.getWatched().catch(() => ({}) as WatchedMap),
  ])
  return { board, rows, episodes, watched }
}

const title = (board: Board, row: Row) => {
  const p = board.properties.find((x) => x.id === board.titlePropertyId)
  return p ? titleText(p, row.values[p.id]) : ''
}
const poster = (board: Board, row: Row) => {
  for (const p of [resolveRole(board, 'poster'), board.properties.find((x) => x.id === board.coverPropertyId && x.type === 'image'), resolveRole(board, 'banner')]) {
    const v = p ? row.values[p.id] : null
    if (typeof v === 'string' && v) return v
  }
  return ''
}
const epLabel = (s: number, e: number) => `S${s} · ${EP()}${e}`
const dayLabel = (iso: string) => {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
export const detailPath = (row: Row) => `/?detay=${encodeURIComponent(row.id)}`

// Y11: "Sıradaki bölüm" — İzleniyor / Yarım olanlar, son dokunulan önce (Ana Sayfa'daki "Kaldığın yerden" ile aynı kural)
export function widgetItems(d: PhoneData): { title: string; sub: string; poster: string; yol: string }[] {
  const { board, rows, episodes, watched } = d
  const durum = resolveRole(board, 'durum')
  const live = resolveStatusOption(board, 'izleniyor')
  const half = durum?.options?.find((o) => isName(o.label, STATUS_NAMES.yarim))?.id
  if (!durum || (!live && !half)) return []
  const today = todayIso()
  const out: { title: string; sub: string; poster: string; yol: string; rank: number }[] = []
  for (const row of rows) {
    const v = row.values[durum.id]
    if (!((live && v === live) || (half && v === half))) continue
    const seasons = (episodes[row.id] ?? []).filter((s) => s.seasonNumber > 0)
    let sub = v === half ? tt('Yarım kaldı') : tt('İzleniyor')
    // Sırada izlenecek bölüm yoksa (hepsi izlendi) ama yeni bölüm yoldaysa onun tarihi; ikisi de yoksa listeye girmez
    let rank = 0
    if (seasons.length) {
      const w = watched[row.id] ?? {}
      let next: string | null = null
      let upcoming: string | null = null
      for (const s of seasons)
        for (const e of s.episodes) {
          const done = Boolean(w[episodeKey(s.seasonNumber, e.episodeNumber)]?.length)
          if (done) continue
          if (e.airDate && e.airDate > today) {
            if (!upcoming) upcoming = tt('Yeni bölüm {0}', dayLabel(e.airDate))
            continue
          }
          if (!next) next = tt('{0} sırada', epLabel(s.seasonNumber, e.episodeNumber))
        }
      if (next) sub = next
      else if (upcoming) {
        sub = upcoming
        rank = 1
      } else continue
    }
    out.push({ title: title(board, row), sub, poster: poster(board, row), yol: detailPath(row), rank: rank * 1e15 - (row.updatedAt ?? row.createdAt) })
  }
  return out
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)
    .map(({ rank: _r, ...x }) => x)
}

export interface PhoneEvent {
  key: string
  kind: 'yeniBolum' | 'vizyon' | 'gecmisYil'
  date: string // YYYY-MM-DD
  title: string
  body: string
  yol: string
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Y12: önümüzdeki günlerde yayınlanacak bölümler (İzleniyor / Sezon Finali'ndeki diziler) ve vizyona girecek,
// henüz izlenmemiş yapımlar. Y25: önümüzdeki günlerin "geçmiş yıllarda bugün" anıları.
export function upcomingEvents(d: PhoneData, days = 14): PhoneEvent[] {
  const { board, rows, episodes, watched } = d
  const today = todayIso()
  const last = addDays(today, days)
  const out: PhoneEvent[] = []
  const durum = resolveRole(board, 'durum')
  const follow = new Set([resolveStatusOption(board, 'izleniyor'), resolveStatusOption(board, 'sezonFinali')].filter(Boolean) as string[])
  const watchedIds = watchedStatusIds(board)

  for (const row of rows) {
    const status = durum ? row.values[durum.id] : null
    const name = title(board, row)
    if (!name) continue
    // Yeni bölüm
    if (typeof status === 'string' && follow.has(status)) {
      const byDay = new Map<string, { s: number; e: number }[]>()
      for (const s of episodes[row.id] ?? []) {
        if (s.seasonNumber <= 0) continue
        for (const e of s.episodes) if (e.airDate && e.airDate >= today && e.airDate <= last) byDay.set(e.airDate, [...(byDay.get(e.airDate) ?? []), { s: s.seasonNumber, e: e.episodeNumber }])
      }
      for (const [date, eps] of byDay) {
        eps.sort((a, b) => a.s - b.s || a.e - b.e)
        const first = eps[0]
        const label = eps.length > 1 ? `${epLabel(first.s, first.e)}–${eps[eps.length - 1].e}` : epLabel(first.s, first.e)
        out.push({ key: `b:${row.id}:${date}`, kind: 'yeniBolum', date, title: tt('Bugün yeni bölüm: {0}', name), body: eps.length > 1 ? tt('{0} yayında ({1} bölüm)', label, eps.length) : tt('{0} yayında', label), yol: detailPath(row) })
      }
    }
    // Vizyon günü
    const viz = resolveRole(board, 'vizyon')
    const vd = viz ? row.values[viz.id] : null
    const vdate = typeof vd === 'string' ? vd.slice(0, 10) : ''
    if (vdate && vdate >= today && vdate <= addDays(today, 60) && !(typeof status === 'string' && watchedIds.has(status))) {
      out.push({ key: `v:${row.id}:${vdate}`, kind: 'vizyon', date: vdate, title: tt('Bugün vizyonda: {0}', name), body: tt('Beklediğin yapım bugün çıkıyor.'), yol: detailPath(row) })
    }
  }

  // Geçmiş yıllarda bugün: önümüzdeki 7 günün her biri için en fazla bir bildirim
  const dateProp = resolveRole(board, 'izlemeTarihi')
  const byMd = new Map<string, { row: Row; year: number }[]>()
  for (const row of rows) {
    const dates: string[] = []
    if (dateProp) {
      const v = row.values[dateProp.id]
      for (const x of Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []) dates.push(...x.split('/'))
    }
    for (const ds of Object.values(watched[row.id] ?? {})) dates.push(...(ds ?? []))
    const seen = new Set<string>()
    for (const dt of dates) {
      if (!/^\d{4}-\d{2}-\d{2}/.test(dt)) continue
      const md = dt.slice(5, 10)
      const year = Number(dt.slice(0, 4))
      const k = md + ':' + year
      if (seen.has(k)) continue
      seen.add(k)
      byMd.set(md, [...(byMd.get(md) ?? []), { row, year }])
    }
  }
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i)
    const y = Number(date.slice(0, 4))
    const hits = (byMd.get(date.slice(5)) ?? []).filter((h) => h.year < y).sort((a, b) => a.year - b.year)
    if (!hits.length) continue
    const h = hits[0]
    const ago = y - h.year
    const more = new Set(hits.map((x) => x.row.id)).size - 1
    out.push({
      key: `g:${date}`,
      kind: 'gecmisYil',
      date,
      title: tt('Geçmiş yıllarda bugün'),
      body: more > 0 ? tt('{0} yıl önce bugün {1} izlemiştin (ve {2} yapım daha).', ago, title(board, h.row), more) : tt('{0} yıl önce bugün {1} izlemiştin.', ago, title(board, h.row)),
      yol: `/takvim?ay=${h.year}-${date.slice(5, 7)}&gun=${h.year}-${date.slice(5)}`,
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
