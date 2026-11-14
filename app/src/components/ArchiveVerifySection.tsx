import { useCallback, useEffect, useRef, useState } from 'react'
import type { Row } from '../types'
import { api, type VerifyIssue, type VerifyResult } from '../lib/api'
import { tt } from '../lib/i18n'

// Sağlık Kontrolü › "Eşleşmesi şüpheli kayıtlar" (v1.24). Kullanıcı "arşivdeki içerikleri düzgünce kontrol eden bir şey
// ekle; Türkçe adı başka orijinali başka olanlar, aktarımda yanlış çekilmişler oluyor" dedi. Her kaydın adları, yılı ve
// türü bağlı olduğu TMDB yapımıyla karşılaştırılır (sunucu: verifyBoard). Eski kayıtların TMDB adları ilk açılışta bir
// kez arka planda toplanır. Her kayıtta: Yeniden eşleştir (Hangisi? listesi), TMDB'deki adları yaz ya da Doğru.

const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true })

const ISSUE_TEXT: Record<VerifyIssue, string> = {
  ad: tt('Adı bağlı olduğu yapımla uyuşmuyor'),
  orj: tt('Orjinal adı başka bir yapımın'),
  trAd: tt('Türkçe adı TMDB\'dekinden farklı'),
  yil: tt('Yılı tutmuyor'),
  tur: tt('Film/dizi karışmış'),
}

export default function ArchiveVerifySection({
  boardId,
  rows,
  rowTitle,
  verifyIgnore,
  onOpenRow,
  onRematch,
  onWriteNames,
  onIgnore,
  onCount,
}: {
  boardId: string
  rows: Row[]
  rowTitle: (row: Row) => string
  verifyIgnore: string[]
  onOpenRow: (row: Row) => void
  // "Hangisi?" listesini açar, seçilen yapımla yeniden doldurur
  onRematch: (row: Row) => Promise<void>
  // Bağlantı doğru, adlar yanlış aktarılmış: TMDB'deki Türkçe ve orijinal adı yaz
  onWriteNames: (row: Row, names: { tr: string; orig: string }) => Promise<void>
  onIgnore: (rowId: string) => void
  // Üstteki özet çubuğu da saysın diye şüpheli kayıtların kimlikleri
  onCount?: (rowIds: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<VerifyResult | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const started = useRef(false)
  const timer = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api.getVerify(boardId)
      setData(r)
      // TMDB adı henüz bilinmeyen kayıtlar varsa bir kez arka planda topla, bitene kadar ara ara bak
      if (r.missing > 0 && !r.pending && !started.current) {
        started.current = true
        await api.startVerify(boardId).catch(() => undefined)
        timer.current = window.setTimeout(load, 1500)
      } else if (r.pending) timer.current = window.setTimeout(load, 2000)
    } catch {
      setData({ items: [], unlinked: 0, missing: 0, pending: null })
    }
  }, [boardId])
  useEffect(() => {
    void load()
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [load])

  const ignored = new Set(verifyIgnore)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const items = (data?.items ?? [])
    .filter((it) => !ignored.has(it.rowId) && byId.has(it.rowId))
    .map((it) => ({ ...it, rowObj: byId.get(it.rowId)!, label: rowTitle(byId.get(it.rowId)!) }))
    .sort((a, b) => collator.compare(a.label, b.label))
  const count = items.length
  const idsKey = items.map((it) => it.rowId).join(',')
  useEffect(() => {
    onCount?.(idsKey ? idsKey.split(',') : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])
  const loading = !data || Boolean(data.pending)

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try {
      await fn()
      await load()
    } finally {
      setBusy(null)
    }
  }

  const btn = 'text-[11px] rounded px-1.5 py-0.5 border transition disabled:opacity-40'
  return (
    <div className="border border-neutral-800 rounded-xl">
      <button onClick={() => setOpen((o) => !o)} disabled={loading || count === 0} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-default">
        <div>
          <h3 className="text-sm font-semibold text-neutral-50">{tt('Eşleşmesi şüpheli kayıtlar')}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            {tt('Her kaydın Türkçe adı, orjinal adı, yılı ve film/dizi bilgisi bağlı olduğu TMDB yapımıyla karşılaştırılır. Yanlış yapımla eşleşmişse "Yeniden eşleştir", yapım doğru ama adlar yanlış aktarılmışsa "TMDB\'deki adları yaz".')}
          </p>
          {data && data.unlinked > 0 && <p className="text-[11px] text-neutral-600 mt-1">{tt('{0} kayıt hiç TMDB ile eşleşmemiş; onlar kaydı açıp Güncelle ile eşleştirilebilir.', data.unlinked)}</p>}
        </div>
        <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 ${loading ? 'text-neutral-500' : count === 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-500 bg-amber-500/10'}`}>
          {!data
            ? tt('Kontrol ediliyor...')
            : data.pending
              ? tt('TMDB\'ye bakılıyor {0}/{1}', data.pending.done, data.pending.total)
              : count === 0
                ? tt('Sorun yok')
                : tt('{0} kayıt {1}', count, open ? '▴' : '▾')}
        </span>
      </button>
      {open && count > 0 && (
        <ul className="px-4 pb-4 space-y-1 max-h-[55vh] overflow-y-auto">
          {items.map((it) => {
            const t = it.tmdb
            const tmdbLine = [t.tr, t.orig && t.orig !== t.tr ? t.orig : '', t.yil, t.mediaType === 'tv' ? tt('Dizi') : tt('Film')].filter(Boolean).join(' · ')
            const rowLine = [it.row.title, it.row.orig && it.row.orig !== it.row.title ? it.row.orig : '', it.row.year].filter(Boolean).join(' · ')
            const nameIssue = it.issues.some((x) => x === 'ad' || x === 'orj' || x === 'trAd')
            return (
              <li key={it.rowId} className="rounded-lg hover:bg-neutral-800/70 px-2.5 py-2 transition">
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => onOpenRow(it.rowObj)} className="min-w-0 text-left text-sm text-neutral-200 hover:text-[#00c0fa] truncate">
                    {it.label}
                  </button>
                  <span className="flex flex-wrap justify-end gap-1 shrink-0">
                    {it.issues.map((x) => (
                      <span key={x} className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                        {ISSUE_TEXT[x]}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="mt-1 grid gap-0.5 text-[11px]">
                  <span className="text-neutral-400 truncate">
                    <span className="text-neutral-600">{tt('Arşivde:')}</span> {rowLine || '—'}
                  </span>
                  <span className="text-neutral-400 truncate">
                    <span className="text-neutral-600">{tt('Bağlı yapım (TMDB):')}</span> {tmdbLine}
                    {t.en && t.en !== t.tr && t.en !== t.orig ? <span className="text-neutral-600"> · {t.en}</span> : null}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <button disabled={busy !== null} onClick={() => run(it.rowId, () => onRematch(it.rowObj))} className={`${btn} border-[#00c0fa]/60 text-[#7fdcff] hover:bg-[#00c0fa]/10`}>
                    {tt('Yeniden eşleştir')}
                  </button>
                  {nameIssue && (
                    <button
                      disabled={busy !== null}
                      onClick={() => run(it.rowId, () => onWriteNames(it.rowObj, { tr: t.tr, orig: t.orig }))}
                      className={`${btn} border-neutral-700 text-neutral-300 hover:text-neutral-50 hover:border-neutral-500`}
                    >
                      {tt("TMDB'deki adları yaz")}
                    </button>
                  )}
                  <button
                    disabled={busy !== null}
                    onClick={() => onIgnore(it.rowId)}
                    title={tt('Bu kayıt doğru, bir daha gösterme')}
                    className={`${btn} border-dashed border-neutral-600 text-neutral-400 hover:text-neutral-50 hover:border-neutral-400`}
                  >
                    {tt('Doğru, dokunma')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
