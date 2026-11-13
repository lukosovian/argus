import { useState } from 'react'
import type { Row } from '../types'
import { todayIso } from '../types'
import Checkbox from './Checkbox'
import { tt } from '../lib/i18n'

// Sağlık Kontrolü › "İzlendi ama bölümleri tarihsiz diziler" (v1.23.13). Kullanıcı "toplu seçim yaparak ya da tek
// tek seçip bölümlerini sezonlarını tarihleyebileyim, ne zaman izlediğimi hatırlamıyorum diyebileyim" dedi. Diziler
// seçilir (her dizide istersen sadece bazı sezonlar), sonra alttaki çubuktan tarih verilir. Sadece tarihi olmayan
// bölümlere yazılır; durum ve kaydın izleme tarihi değişmez (bkz. server › date-episodes).

const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true })

export type UndatedItem = { row: Row; label: string; seasons: { season: number; total: number; undated: number }[] }

export default function UndatedSeriesSection({
  items,
  loading,
  onOpenRow,
  onApply,
}: {
  items: UndatedItem[]
  loading: boolean
  onOpenRow: (row: Row) => void
  onApply: (items: { rowId: string; seasons?: number[] }[], date: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  // rowId → seçili sezonlar (boş küme tutulmaz: kayıt seçili değil)
  const [sel, setSel] = useState<Map<string, Set<number>>>(new Map())
  const [day, setDay] = useState('')
  const [year, setYear] = useState('')
  const [busy, setBusy] = useState(false)
  const sorted = [...items].sort((a, b) => collator.compare(a.label, b.label))
  const count = items.length
  const allSeasons = (it: UndatedItem) => new Set(it.seasons.map((s) => s.season))
  const selected = sorted.filter((it) => (sel.get(it.row.id)?.size ?? 0) > 0)
  const allOn = count > 0 && selected.length === count
  const toggleRow = (it: UndatedItem) =>
    setSel((m) => {
      const n = new Map(m)
      if ((n.get(it.row.id)?.size ?? 0) > 0) n.delete(it.row.id)
      else n.set(it.row.id, allSeasons(it))
      return n
    })
  const toggleSeason = (it: UndatedItem, season: number) =>
    setSel((m) => {
      const n = new Map(m)
      const cur = new Set(n.get(it.row.id) ?? [])
      if (cur.has(season)) cur.delete(season)
      else cur.add(season)
      if (cur.size) n.set(it.row.id, cur)
      else n.delete(it.row.id)
      return n
    })
  const epCount = selected.reduce((n, it) => n + it.seasons.filter((s) => sel.get(it.row.id)?.has(s.season)).reduce((k, s) => k + s.undated, 0), 0)

  async function apply(date: string) {
    if (!selected.length) return
    setBusy(true)
    try {
      await onApply(
        selected.map((it) => {
          const ss = sel.get(it.row.id)!
          return { rowId: it.row.id, seasons: ss.size === it.seasons.length ? undefined : [...ss] }
        }),
        date,
      )
      setSel(new Map())
      setDay('')
      setYear('')
    } finally {
      setBusy(false)
    }
  }

  const today = todayIso()
  const btn = 'text-xs rounded-full px-2.5 py-1 border transition disabled:opacity-40'
  return (
    <div className="border border-neutral-800 rounded-xl">
      <button onClick={() => setOpen((o) => !o)} disabled={loading || count === 0} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-default">
        <div>
          <h3 className="text-sm font-semibold text-neutral-50">{tt('İzlendi ama bölümleri tarihsiz diziler')}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            {tt('Dizi izlendi işaretli ama bazı bölümlerinin izleme tarihi yok. Seç, sonra tarih ver ya da "Hatırlamıyorum" de; kaydın durumu ve izleme tarihi değişmez.')}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 ${loading ? 'text-neutral-500' : count === 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-500 bg-amber-500/10'}`}>
          {loading ? tt('Kontrol ediliyor...') : count === 0 ? tt('Sorun yok') : tt('{0} kayıt {1}', count, open ? '▴' : '▾')}
        </span>
      </button>
      {open && count > 0 && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 px-2.5 mb-1.5">
            <Checkbox
              checked={allOn}
              indeterminate={!allOn && selected.length > 0}
              onChange={() => setSel(allOn ? new Map() : new Map(sorted.map((it) => [it.row.id, allSeasons(it)])))}
              label={tt('Hepsini seç')}
            />
            <span className="text-xs text-neutral-400">{tt('Hepsini seç')}</span>
          </div>
          <ul className="space-y-0.5 max-h-[45vh] overflow-y-auto">
            {sorted.map((it) => {
              const ss = sel.get(it.row.id)
              return (
                <li key={it.row.id} className="flex items-start gap-3 rounded-lg hover:bg-neutral-800 px-2.5 py-1.5 transition">
                  <Checkbox
                    checked={(ss?.size ?? 0) > 0}
                    indeterminate={Boolean(ss && ss.size > 0 && ss.size < it.seasons.length)}
                    onChange={() => toggleRow(it)}
                    label={it.label}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <button onClick={() => onOpenRow(it.row)} className="block max-w-full text-left text-sm text-neutral-300 hover:text-[#00c0fa] truncate">
                      {it.label}
                    </button>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {it.seasons.map((s) => {
                        const on = Boolean(ss?.has(s.season))
                        return (
                          <button
                            key={s.season}
                            onClick={() => toggleSeason(it, s.season)}
                            title={tt('{0}. sezonda {1} bölüm tarihsiz', s.season, s.undated)}
                            className={`text-[11px] rounded px-1.5 py-0.5 border transition ${on ? 'border-[#00c0fa]/70 bg-[#00c0fa]/10 text-[#7fdcff]' : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-neutral-100'}`}
                          >
                            {tt('S{0}', s.season)} · {s.undated === s.total ? tt('{0} bölüm', s.total) : `${s.undated}/${s.total}`}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className={`mt-3 rounded-xl border p-3 transition ${selected.length ? 'border-[#00c0fa]/40 bg-neutral-950/60' : 'border-neutral-800 opacity-60'}`}>
            <p className="text-xs text-neutral-400 mb-2">
              {selected.length ? tt('{0} dizide {1} bölüm için ne zaman izledin?', selected.length, epCount) : tt('Önce yukarıdan dizi ya da sezon seç.')}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                disabled={!selected.length || busy}
                onClick={() => apply('kayit')}
                title={tt('Kaydın kendi izleme tarihi kullanılır; tarih aralığıysa bölümler o günlere sırayla dağıtılır. Tarihi olmayan kayıtlarda "hatırlamıyorum" olur.')}
                className={`${btn} border-[#00c0fa]/60 text-[#7fdcff] hover:bg-[#00c0fa]/10`}
              >
                {tt('Kaydın izleme tarihinden')}
              </button>
              <span className="inline-flex items-center gap-1">
                <input
                  type="date"
                  value={day}
                  max={today}
                  onChange={(e) => setDay(e.target.value)}
                  className="rounded-md bg-neutral-950 border border-neutral-700 px-2 py-0.5 text-xs text-neutral-100 [color-scheme:dark]"
                />
                <button disabled={!selected.length || busy || !day} onClick={() => apply(day)} className={`${btn} border-neutral-700 text-neutral-300 hover:text-neutral-50 hover:border-neutral-500`}>
                  {tt('Bu gün')}
                </button>
              </span>
              <span className="inline-flex items-center gap-1">
                <input
                  value={year}
                  onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder={tt('Yıl')}
                  inputMode="numeric"
                  className="w-16 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-0.5 text-xs text-neutral-100"
                />
                <button disabled={!selected.length || busy || !/^(19|20)\d\d$/.test(year)} onClick={() => apply(year)} className={`${btn} border-neutral-700 text-neutral-300 hover:text-neutral-50 hover:border-neutral-500`}>
                  {tt('Bu yıl')}
                </button>
              </span>
              <button disabled={!selected.length || busy} onClick={() => apply('?')} className={`${btn} border-dashed border-neutral-600 text-neutral-300 hover:text-neutral-50 hover:border-neutral-400`}>
                {tt('Hatırlamıyorum')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
