import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { useBoards } from '../../hooks/useBoards'
import { useHomeSettings } from '../../hooks/useHomeSettings'
import { api } from '../../lib/api'
import { notifyDataChanged } from '../../lib/dataEvents'
import { isWatchedStatus, resolveRole, resolveStatusOption } from '../../lib/roles'
import {
  buildNetflixPlan,
  mergeEpisodeMap,
  mergeMovieDates,
  normTitle,
  parseNetflixRows,
  type MovieGroup,
  type NetflixEntry,
  type NetflixPlan,
  type PlanContext,
  type SeriesGroup,
} from '../../lib/netflix'
import { formatEntry } from '../../lib/dateRange'
import { withQuietRating } from '../../lib/quietRating'
import { titleText, type PropertyValue, type Row } from '../../types'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'
import FileDrop from '../FileDrop'
import Select from '../Select'
import ToggleSwitch from '../ToggleSwitch'
import HelpHint from '../HelpHint'
import { fmtDate, tt, ttx } from '../../lib/i18n'

// İçe Aktar › Netflix (v1.26, Y17): Netflix'in "Görüntüleme etkinliği" dosyası sürükle-bırakılır; diziler ve filmler
// arşivdeki kayıtlarla eşleşir, bölümler izlendiği günle işaretlenir, filmlere izleme tarihi yazılır, arşivde olmayanlar
// istenirse TMDB'den eklenir. Önce önizleme — onaylamadan hiçbir şey yazılmaz; zaten girilmiş tarihler tekrar eklenmez.

function day(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return y && m && d ? fmtDate(y, m - 1, d, { short: true }) : iso
}

// Netflix CSV'si mi (sütunları Title + Date)
export function looksLikeNetflix(fields: string[]): boolean {
  const f = fields.map((x) => x.trim().toLowerCase())
  return f.length <= 3 && f.some((x) => /^(title|başlık|baslik)$/.test(x)) && f.some((x) => /^(date|tarih)$/.test(x))
}

const CARD = 'rounded-xl border border-neutral-800 bg-neutral-900 p-5'

type Step = 'pick' | 'loading' | 'preview' | 'running' | 'done'

export default function NetflixImportPanel({ initialFile }: { initialFile?: File | null }) {
  const { boards } = useBoards()
  const { settings } = useHomeSettings()
  const [boardId, setBoardId] = useState('')
  const board = boards.find((b) => b.id === boardId) ?? null
  useEffect(() => {
    if (boardId || boards.length === 0) return
    setBoardId(boards.find((b) => b.id === settings.boardId)?.id ?? boards[0].id)
  }, [boards, boardId, settings.boardId])

  const [step, setStep] = useState<Step>('pick')
  const [entries, setEntries] = useState<NetflixEntry[]>([])
  const [badRows, setBadRows] = useState(0)
  const [ctx, setCtx] = useState<PlanContext | null>(null)
  const [error, setError] = useState('')
  // Önizlemede kaldırılan (eşleşmiş) yapımlar ve eklenmesi istenen (arşivde olmayan) yapımlar
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [addNew, setAddNew] = useState<Set<string>>(new Set())
  const [replaceBulk, setReplaceBulk] = useState(true)
  const [markStatus, setMarkStatus] = useState(true)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ episodes: number; movies: number; added: number; failed: number } | null>(null)

  function readFile(file: File) {
    setError('')
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed = parseNetflixRows(res.data)
        if (!parsed) {
          setError(tt('Bu bir Netflix izleme geçmişi dosyası gibi görünmüyor — "Title" ve "Date" sütunları olmalı (NetflixViewingHistory.csv).'))
          return
        }
        if (parsed.entries.length === 0) {
          setError(tt('Dosyada okunabilen bir izleme bulunamadı.'))
          return
        }
        setEntries(parsed.entries)
        setBadRows(parsed.bad)
        setExcluded(new Set())
        setAddNew(new Set())
        setStep('loading')
      },
      error: () => setError(tt('Dosya okunamadı.')),
    })
  }
  useEffect(() => {
    if (initialFile) readFile(initialFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile])

  async function loadContext(): Promise<PlanContext | null> {
    if (!board) return null
    const [rows, episodes, watched, media] = await Promise.all([api.getRows(board.id), api.getEpisodes(), api.getWatched(), api.getTmdbMediaTypes().catch(() => ({}))])
    return { board, rows, episodes, watched, media }
  }

  // Dosya okununca (ya da arşiv değişince) arşiv yüklenip plan çıkarılır
  useEffect(() => {
    if ((step !== 'loading' && step !== 'preview') || !board || entries.length === 0) return
    let alive = true
    loadContext()
      .then((c) => {
        if (!alive || !c) return
        setCtx(c)
        setStep('preview')
      })
      .catch(() => alive && setError(tt('Arşiv okunamadı — ARGUS sunucusu açık mı?')))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, entries])

  const plan: NetflixPlan | null = useMemo(() => (ctx && entries.length ? buildNetflixPlan(entries, ctx) : null), [ctx, entries])

  const durumProp = board ? resolveRole(board, 'durum') : undefined
  const tarihProp = board ? resolveRole(board, 'izlemeTarihi') : undefined
  const titleProp = board?.properties.find((p) => p.id === board.titlePropertyId)
  const rowName = (r: Row | null) => (r && titleProp ? titleText(titleProp, r.values[titleProp.id]) : '')

  const matchedSeries = plan?.series.filter((s) => s.row) ?? []
  const matchedMovies = plan?.movies.filter((m) => m.row) ?? []
  const seriesWork = matchedSeries.filter((s) => s.hits.length > 0)
  const movieWork = matchedMovies.filter((m) => m.watches.length > 0 || (markStatus && durumProp && !isWatchedStatus(board!, m.row!.values[durumProp.id])))
  const nothingNew = [...matchedSeries.filter((s) => s.hits.length === 0), ...matchedMovies.filter((m) => !movieWork.includes(m))]
  const missing = [...(plan?.series.filter((s) => !s.row) ?? []), ...(plan?.movies.filter((m) => !m.row) ?? [])].sort((a, b) => b.lastDate.localeCompare(a.lastDate))
  const pickedSeries = seriesWork.filter((s) => !excluded.has(s.key))
  const pickedMovies = movieWork.filter((m) => !excluded.has(m.key))
  const episodeCount = pickedSeries.reduce((n, s) => n + s.newDates, 0)
  const bulkCount = pickedSeries.reduce((n, s) => n + s.bulk, 0)
  const movieDateCount = pickedMovies.reduce((n, m) => n + m.watches.length, 0)
  const nothingToDo = pickedSeries.length === 0 && pickedMovies.length === 0 && addNew.size === 0

  function toggle(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setter(next)
  }

  const run = () => withQuietRating(runImport)
  async function runImport() {
    if (!board || !plan) return
    setStep('running')
    setResult(null)
    // Toplu işte her İzlendi için puan sorusu açılmasın
    let failed = 0
    let added = 0
    let episodes = 0
    let movies = 0
    try {
      let c = await loadContext()
      if (!c) throw new Error(tt('Arşiv okunamadı.'))
      // 1) Arşivde olmayanlardan seçilenler: adıyla yeni kayıt, sonra TMDB'den doldurulur (dizilerin bölüm listesi de gelir)
      const forced = new Map<string, string>()
      const toAdd = missing.filter((g) => addNew.has(g.key))
      if (toAdd.length) {
        let hasKey = false
        try {
          hasKey = Boolean((await api.getApiKey()).tmdbApiKey?.trim())
        } catch {
          // bilinmiyorsa denenir
          hasKey = true
        }
        const kat = resolveRole(board, 'kategori')
        const katId = (want: 'film' | 'dizi') => kat?.options?.find((o) => (want === 'dizi' ? /^(dizi|series|tv series|mini dizi)$/i : /^(film|movie)$/i).test(o.label.trim()))?.id
        const izlendi = resolveStatusOption(board, 'izlendi')
        let i = 0
        for (const g of toAdd) {
          setProgress({ label: tt('Arşive ekleniyor: {0}', g.name), done: i++, total: toAdd.length })
          try {
            const values: Record<string, PropertyValue> = { [board.titlePropertyId]: g.name }
            const k = katId(g.kind === 'series' ? 'dizi' : 'film')
            if (kat && k) values[kat.id] = k
            if (g.kind === 'movie' && durumProp && izlendi && markStatus) values[durumProp.id] = izlendi
            const row = await api.createRow(board.id, { values, createdAt: Date.now(), updatedAt: Date.now() })
            forced.set(normTitle(g.name), row.id)
            added++
            if (hasKey) await api.fetchTmdb(board.id, row.id, [], false).catch(() => null)
          } catch {
            failed++
          }
        }
        c = await loadContext()
        if (!c) throw new Error(tt('Arşiv okunamadı.'))
        c.forced = forced
      }
      const fresh = buildNetflixPlan(entries, c)
      const newRowIds = new Set(forced.values())
      const wanted = (g: SeriesGroup | MovieGroup) => g.row && (newRowIds.has(g.row.id) || (!excluded.has(g.key) && (g.kind === 'series' ? seriesWork : movieWork).some((x) => x.key === g.key)))
      // 2) Dizi bölümleri
      const series = fresh.series.filter((s) => s.row && s.hits.length > 0 && wanted(s))
      let i = 0
      for (const s of series) {
        setProgress({ label: tt('Bölümler işaretleniyor: {0}', s.name), done: i++, total: series.length })
        try {
          const next = mergeEpisodeMap(c.watched[s.row!.id] ?? {}, s.hits, replaceBulk)
          await api.saveRowWatched(s.row!.id, next)
          episodes += s.newDates
        } catch {
          failed++
        }
      }
      // 3) Filmler: izleme tarihi (+ durum İzlendi)
      const izlendi = resolveStatusOption(board, 'izlendi')
      const films = fresh.movies.filter((m) => m.row && wanted(m))
      i = 0
      for (const m of films) {
        setProgress({ label: tt('Filmler yazılıyor: {0}', m.name), done: i++, total: films.length })
        const row = m.row!
        const patch: Record<string, PropertyValue> = {}
        if (tarihProp && m.watches.length) {
          if (tarihProp.type === 'multidate') {
            const r = mergeMovieDates(row.values[tarihProp.id], m.watches)
            if (r.value) patch[tarihProp.id] = r.value
          } else if (tarihProp.type === 'date') {
            const last = m.watches.map((w) => w.split('/').pop()!).sort().at(-1)!
            const cur = row.values[tarihProp.id]
            if (typeof cur !== 'string' || cur < last) patch[tarihProp.id] = last
          }
        }
        if (markStatus && durumProp && izlendi && !isWatchedStatus(board, row.values[durumProp.id])) patch[durumProp.id] = izlendi
        if (Object.keys(patch).length === 0) continue
        try {
          await api.updateRow(board.id, row.id, { values: { ...row.values, ...patch }, createdAt: row.createdAt, updatedAt: Date.now() }, Object.keys(patch))
          movies++
        } catch {
          failed++
        }
      }
      notifyDataChanged(board.id)
      setResult({ episodes, movies, added, failed })
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : tt('Aktarım yarıda kaldı.'))
      setStep('preview')
    } finally {
      setProgress(null)
    }
  }

  function reset() {
    setEntries([])
    setCtx(null)
    setStep('pick')
    setResult(null)
    setError('')
  }

  const card = CARD

  if (step === 'done' && result) {
    return (
      <div className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-6 text-center space-y-3">
        <p className="font-medium text-emerald-300">{tt('Netflix geçmişin arşive işlendi')}</p>
        <p className="text-sm text-neutral-300">
          {tt('{0} bölüm tarihi · {1} film · {2} yeni yapım', result.episodes, result.movies, result.added)}
          {result.failed > 0 && <span className="text-amber-400">{' · '}{tt('{0} kayıt yazılamadı', result.failed)}</span>}
        </p>
        <div className="flex justify-center gap-2">
          {board && (
            <Link to={`/board/${board.id}`} style={primaryButtonStyle} className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}>
              {tt('Arşivi Aç')}
            </Link>
          )}
          <button onClick={reset} className="text-sm px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:text-neutral-50">
            {tt('Başka dosya')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-sm text-neutral-300 flex items-center gap-1.5">
          {tt('Netflix izleme geçmişini arşivine işle')}
          <HelpHint>
            <p className="mb-2">{tt('Dosyayı Netflix\'ten şöyle indirirsin:')}</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>{tt('netflix.com\'da sağ üstte profil resmine tıkla › Hesap.')}</li>
              <li>{tt('Profiller bölümünde kendi profilini aç › Görüntüleme etkinliği.')}</li>
              <li>{tt('Sayfanın en altındaki "Tümünü indir"e bas — NetflixViewingHistory.csv iner.')}</li>
            </ol>
          </HelpHint>
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {tt('Diziler ve filmler arşivindeki kayıtlarla eşleşir; bölümler Netflix\'te izlediğin günle işaretlenir, filmlere izleme tarihi yazılır. Önce ne yapılacağını görürsün, onaylamadan hiçbir şey değişmez. Zaten girilmiş tarihler tekrar eklenmez.')}
        </p>
        {boards.length > 1 && (
          <div className="mt-4">
            <label className="block text-xs text-neutral-400 mb-1">{tt('Hangi arşive')}</label>
            <Select value={boardId} onChange={setBoardId} options={boards.map((b) => ({ value: b.id, label: b.name }))} />
          </div>
        )}
        {step === 'pick' && (
          <div className="mt-4">
            <FileDrop accept=".csv" title={tt('NetflixViewingHistory.csv dosyasını seç ya da buraya sürükle')} hint={tt('Netflix › Hesap › Profil › Görüntüleme etkinliği › Tümünü indir')} onFiles={(files) => files[0] && readFile(files[0])} />
          </div>
        )}
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      </div>

      {step === 'loading' && <p className="text-sm text-neutral-400 px-1">{tt('Arşivinle karşılaştırılıyor…')}</p>}

      {(step === 'preview' || step === 'running') && plan && board && (
        <>
          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-neutral-300">
                {ttx('Dosyada {0} izleme var', <span className="font-semibold text-neutral-50">{plan.total}</span>)}
                {badRows > 0 && <span className="text-neutral-500">{' '}{tt('({0} satır okunamadı)', badRows)}</span>}
              </p>
              <button onClick={reset} disabled={step === 'running'} className="text-sm text-neutral-500 underline hover:text-neutral-300 disabled:opacity-40">
                {tt('Vazgeç, farklı dosya seç')}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                [tt('Bölüm tarihi'), episodeCount, tt('{0} dizide', pickedSeries.length)],
                [tt('Film izlemesi'), movieDateCount, tt('{0} filmde', pickedMovies.length)],
                [tt('Zaten vardı'), matchedSeries.reduce((n, s) => n + s.already, 0) + matchedMovies.reduce((n, m) => n + m.already, 0), tt('tekrar eklenmez')],
                [tt('Arşivde yok'), missing.length, addNew.size ? tt('{0} tanesi eklenecek', addNew.size) : tt('istersen ekle')],
              ].map(([label, n, sub]) => (
                <div key={String(label)} className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5">
                  <p className="text-[11px] text-neutral-500">{label}</p>
                  <p className="text-xl font-semibold tabular-nums text-neutral-50">{n}</p>
                  <p className="text-[11px] text-neutral-500">{sub}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {bulkCount > 0 && (
                <label className="flex items-center justify-between gap-3 text-sm text-neutral-300">
                  <span>
                    {tt('Toplu girilmiş tarihleri düzelt')}
                    <span className="block text-[11px] text-neutral-500">{tt('{0} bölümde birçok bölüme aynı gün yazılmış; bunlar Netflix\'te izlediğin günle değişir.', bulkCount)}</span>
                  </span>
                  <ToggleSwitch checked={replaceBulk} onChange={setReplaceBulk} label={tt('Toplu girilmiş tarihleri düzelt')} />
                </label>
              )}
              {durumProp && (
                <label className="flex items-center justify-between gap-3 text-sm text-neutral-300">
                  <span>
                    {tt('Filmleri İzlendi yap')}
                    <span className="block text-[11px] text-neutral-500">{tt('Netflix yarım bıraktıklarını da yazar — yarım kalanları aşağıdan çıkarabilirsin.')}</span>
                  </span>
                  <ToggleSwitch checked={markStatus} onChange={setMarkStatus} label={tt('Filmleri İzlendi yap')} />
                </label>
              )}
              <p className="text-[11px] text-neutral-500">{tt('Dizilerin durumu bölümlere göre kendiliğinden güncellenir (hepsi bitince İzlendi).')}</p>
            </div>
          </div>

          {seriesWork.length > 0 && (
            <Section title={tt('Diziler')} count={seriesWork.length}>
              {seriesWork.map((s) => (
                <Item key={s.key} checked={!excluded.has(s.key)} onToggle={() => toggle(excluded, s.key, setExcluded)} title={s.name} sub={rowName(s.row) !== s.name ? `→ ${rowName(s.row)}` : ''}>
                  <span className="text-emerald-300">{tt('+{0} bölüm tarihi', s.newDates)}</span>
                  {s.already > 0 && <span>{tt('{0} zaten vardı', s.already)}</span>}
                  {s.bulk > 0 && replaceBulk && <span className="text-amber-300">{tt('{0} toplu tarih düzelir', s.bulk)}</span>}
                  {s.unmatched.length > 0 && <Unmatched names={s.unmatched} />}
                  <details className="w-full">
                    <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">{tt('Bölümleri göster')}</summary>
                    <ul className="mt-1 space-y-0.5 text-neutral-400">
                      {s.hits.map((h) => (
                        <li key={h.key}>
                          {h.label} — {h.newDates.map(day).join(', ')}
                        </li>
                      ))}
                    </ul>
                  </details>
                </Item>
              ))}
            </Section>
          )}

          {movieWork.length > 0 && (
            <Section title={tt('Filmler')} count={movieWork.length}>
              {movieWork.map((m) => {
                const st = durumProp ? m.row!.values[durumProp.id] : undefined
                const stLabel = durumProp?.options?.find((o) => o.id === st)?.label
                return (
                  <Item key={m.key} checked={!excluded.has(m.key)} onToggle={() => toggle(excluded, m.key, setExcluded)} title={m.name} sub={rowName(m.row) !== m.name ? `→ ${rowName(m.row)}` : ''}>
                    {m.watches.length > 0 ? <span className="text-emerald-300">{m.watches.map((w) => formatEntry(w, day)).join(', ')}</span> : <span>{tt('tarih zaten var')}</span>}
                    {m.already > 0 && <span>{tt('{0} izleme zaten vardı', m.already)}</span>}
                    {markStatus && durumProp && !isWatchedStatus(board, st) && <span className="text-amber-300">{stLabel ? tt('{0} → İzlendi', stLabel) : tt('→ İzlendi')}</span>}
                  </Item>
                )
              })}
            </Section>
          )}

          {missing.length > 0 && (
            <Section
              title={tt('Arşivde olmayanlar')}
              count={missing.length}
              action={
                <button
                  onClick={() => setAddNew(addNew.size === missing.length ? new Set() : new Set(missing.map((g) => g.key)))}
                  className="text-xs text-[#00c0fa] hover:underline"
                >
                  {addNew.size === missing.length ? tt('Hiçbirini ekleme') : tt('Hepsini ekle')}
                </button>
              }
              hint={tt('İşaretlediklerin TMDB\'den bilgileriyle arşive eklenir, sonra tarihleri yazılır.')}
            >
              {missing.map((g) => (
                <Item key={g.key} checked={addNew.has(g.key)} onToggle={() => toggle(addNew, g.key, setAddNew)} title={g.name} sub={g.kind === 'series' ? tt('Dizi') : tt('Film')}>
                  <span>{g.kind === 'series' ? tt('{0} bölüm izlemesi', g.entries) : tt('{0} izleme', (g as MovieGroup).watches.length || g.entries)}</span>
                  <span>{tt('son: {0}', day(g.lastDate))}</span>
                </Item>
              ))}
            </Section>
          )}

          {nothingNew.length > 0 && (
            <p className="px-1 text-xs text-neutral-500">{tt('{0} yapımda yeni bir şey yok (tarihleri zaten girilmiş).', nothingNew.length)}</p>
          )}

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/95 px-4 py-3 backdrop-blur">
            {step === 'running' && progress ? (
              <p className="text-sm text-neutral-300">
                {progress.label} <span className="tabular-nums text-neutral-500">({progress.done + 1}/{progress.total})</span>
              </p>
            ) : (
              <>
                <button onClick={run} disabled={nothingToDo || step === 'running'} style={primaryButtonStyle} className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}>
                  {tt('Onayla ve aktar')}
                </button>
                <p className="text-xs text-neutral-500">
                  {nothingToDo ? tt('Yazılacak yeni bir şey yok.') : tt('{0} bölüm, {1} film{2}', episodeCount, pickedMovies.length, addNew.size ? tt(', {0} yeni yapım', addNew.size) : '')}
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )

}

function Section({ title, count, children, action, hint }: { title: string; count: number; children: React.ReactNode; action?: React.ReactNode; hint?: string }) {
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-medium text-neutral-100">
          {title} <span className="text-neutral-500 tabular-nums">{count}</span>
        </p>
        {action}
      </div>
      {hint && <p className="text-[11px] text-neutral-500 mb-2">{hint}</p>}
      <div className="max-h-96 overflow-y-auto divide-y divide-neutral-800/70 pr-1">{children}</div>
    </div>
  )
}

function Item({ checked, onToggle, title, sub, children }: { checked: boolean; onToggle: () => void; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 py-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm truncate ${checked ? 'text-neutral-100' : 'text-neutral-500 line-through decoration-neutral-600'}`}>
          {title} {sub && <span className="text-xs text-neutral-500 no-underline">{sub}</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">{children}</span>
      </span>
    </label>
  )
}

function Unmatched({ names }: { names: string[] }) {
  return (
    <span className="text-neutral-500" title={names.join('\n')}>
      {tt('{0} bölüm eşleşmedi', names.length)}
    </span>
  )
}
