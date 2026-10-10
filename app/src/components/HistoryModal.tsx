import { useEffect, useState } from 'react'
import type { Board, Row } from '../types'
import { api } from '../lib/api'
import { formatDayKey, formatStamp, formatValue, propName, type HistoryDay, type HistoryEntry } from '../lib/history'
import { useToast } from '../hooks/useToast'
import { BRAND_GRADIENT } from '../lib/theme'
import { HistoryIcon } from './toolbarIcons'
import { useEscape } from '../hooks/useEscape'
import { tt, ttx } from '../lib/i18n'

// Arşiv geçmişi penceresi — kullanıcı Notion'daki sayfa geçmişi gibi bir şey istedi. Solda gün gün ne
// değiştiği (eklenen / değişen / silinen sayısı), sağda o günün değişiklikleri; her biri tek tek geri
// alınabiliyor (silineni geri getir, değişikliği geri al), bir gün de bütünüyle geri yüklenebiliyor.
// `row` verilirse sadece o kaydın geçmişi (altı nokta menüsündeki "Tüm geçmişi").
function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(b / 1024))} KB`
}

const TYPE_LOOK: Record<HistoryEntry['type'], { label: string; cls: string; undo: string }> = {
  create: { label: tt('Eklendi'), cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', undo: tt('Eklemeyi geri al') },
  update: { label: tt('Değişti'), cls: 'text-[#7fdcff] bg-[#00c0fa]/10 border-[#00c0fa]/30', undo: 'Geri al' },
  delete: { label: tt('Silindi'), cls: 'text-rose-300 bg-rose-500/10 border-rose-500/30', undo: tt('Geri getir') },
}

export default function HistoryModal({
  board,
  row,
  onClose,
  onChanged,
}: {
  board: Board
  row?: Row | null
  onClose: () => void
  onChanged: () => void
}) {
  const { notify, confirm } = useToast()
  const [days, setDays] = useState<HistoryDay[] | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [status, setStatus] = useState<{ bytes: number; limitBytes: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [onlyRow, setOnlyRow] = useState<Row | null>(row ?? null)
  const [reload, setReload] = useState(0)
  // Alan ayarları (sınırı değiştir, yer aç) — kullanıcı "boyut sınırını değiştirebileceğim bir yer" istedi.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customGb, setCustomGb] = useState('')
  // Bir günde binlerce değişiklik olabiliyor (ör. toplu TMDB doldurma) — parça parça göster.
  const [limit, setLimit] = useState(150)
  useEffect(() => setLimit(150), [day, onlyRow])

  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const rowTitle = onlyRow && titleProp ? String(onlyRow.values[titleProp.id] ?? '') : ''

  useEffect(() => {
    api.getHistoryStatus().then(setStatus).catch(() => {})
    if (onlyRow) {
      setEntries(null)
      api
        .getRowHistory(board.id, onlyRow.id)
        .then((r) => setEntries(r.entries))
        .catch(() => setEntries([]))
      return
    }
    api
      .getHistoryDays(board.id)
      .then((r) => {
        setDays(r.days)
        setDay((d) => d ?? r.days[0]?.day ?? null)
      })
      .catch(() => setDays([]))
  }, [board.id, onlyRow, reload])

  useEffect(() => {
    if (onlyRow || !day) return
    setEntries(null)
    api
      .getHistoryDay(board.id, day)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]))
  }, [board.id, day, onlyRow, reload])

  // Esc: sadece en üstteki pencere kapanır (bkz. hooks/useEscape)
  useEscape(true, onClose)

  async function undo(e: HistoryEntry) {
    setBusy(e.id)
    try {
      await api.undoHistory(board.id, e.id)
      notify(e.type === 'delete' ? tt('"{0}" geri getirildi.', e.title || tt('Kayıt')) : e.type === 'create' ? tt('"{0}" kaldırıldı.', e.title || tt('Kayıt')) : tt('Değişiklik geri alındı.'))
      onChanged()
      setReload((n) => n + 1)
    } catch (err) {
      notify(err instanceof Error ? err.message : tt('Geri alınamadı.'), 'danger')
    } finally {
      setBusy(null)
    }
  }

  async function restoreDay(key: string) {
    const ok = await confirm({
      message: tt('Arşiv {0} {1}haline dönsün mü? Şu anki hali de geçmişe kaydedilir, istersen buradan tekrar geri dönebilirsin.', formatDayKey(key), key.includes('_') ? '' : tt('gününün başındaki ')),
      confirmLabel: tt('Geri dön'),
    })
    if (!ok) return
    setBusy(key)
    try {
      const r = await api.restoreHistoryDay(board.id, key)
      notify(tt('Arşiv geri yüklendi — {0} kayıt.', r.count))
      onChanged()
      setReload((n) => n + 1)
    } catch (err) {
      notify(err instanceof Error ? err.message : tt('Geri yüklenemedi.'), 'danger')
    } finally {
      setBusy(null)
    }
  }

  const GB = 1024 ** 3
  async function changeLimit(gb: number) {
    if (!status || !Number.isFinite(gb) || gb < 0.1) return
    const next = Math.round(gb * GB)
    if (next === status.limitBytes) return
    if (status.bytes > next * 0.9) {
      const ok = await confirm({
        message: tt('Geçmiş şu an {0} yer kaplıyor; yeni sınır {1}. En eski geçmişten başlayarak silip yer açayım mı? (Arşivinin kendisine dokunulmaz.)', formatBytes(status.bytes), formatBytes(next)),
        confirmLabel: tt('Sil ve sınırı ayarla'),
      })
      if (!ok) return
      await api.setHistoryLimit(next)
      const r = await api.trimHistory()
      notify(tt('Sınır {0} yapıldı, en eski {1} parça silindi.', formatBytes(next), r.removed))
    } else {
      await api.setHistoryLimit(next)
      notify(tt('Geçmiş için ayrılan alan {0} yapıldı.', formatBytes(next)))
    }
    setCustomGb('')
    setReload((n) => n + 1)
  }

  async function freeSpace() {
    if (!status) return
    const ok = await confirm({
      message: tt('En eski geçmişten başlayarak, kullanılan alan {0} altına inene kadar silinsin mi?', formatBytes(status.limitBytes * 0.9)),
      confirmLabel: tt('Eskileri sil'),
    })
    if (!ok) return
    const r = await api.trimHistory()
    notify(r.removed ? tt('En eski {0} parça silindi.', r.removed) : tt('Silinecek bir şey yoktu, geçmiş zaten sınırın altında.'))
    setReload((n) => n + 1)
  }

  const selectedDay = days?.find((d) => d.day === day)

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-sm flex items-start justify-center px-4 py-8 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-2xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-white" style={{ background: BRAND_GRADIENT }}>
              <HistoryIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-neutral-50 truncate">{onlyRow ? tt('"{0}" geçmişi', rowTitle || tt('Kayıt')) : tt('Arşiv Geçmişi')}</h2>
              {status && (
                <p className="text-xs text-neutral-500">
                  {ttx('Geçmiş için kullanılan alan: {0} / {1}', formatBytes(status.bytes), formatBytes(status.limitBytes))}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className={`h-8 text-xs rounded-lg border px-2.5 transition ${
              settingsOpen ? 'border-[#00c0fa]/60 text-[#7fdcff] bg-[#00c0fa]/10' : 'border-neutral-700 text-neutral-400 hover:text-neutral-50 hover:border-neutral-500'
            }`}
          >
            {tt('⚙ Alan ayarları')}
          </button>
          <button
            onClick={onClose}
            aria-label={tt('Kapat')}
            className="h-8 w-8 shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-500 flex items-center justify-center text-neutral-400 hover:text-neutral-50 text-lg leading-none transition"
          >
            ×
          </button>
          </div>
        </div>
        {settingsOpen && status && (
          <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 space-y-3">
            <div>
              <div className="flex items-baseline justify-between text-xs mb-1.5">
                <span className="text-neutral-400">{tt('Kullanılan alan')}</span>
                <span className="text-neutral-200 tabular-nums">
                  {formatBytes(status.bytes)} / {formatBytes(status.limitBytes)} · %{Math.min(100, Math.round((status.bytes / status.limitBytes) * 100))}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${status.bytes > status.limitBytes * 0.9 ? 'bg-amber-400' : 'bg-[#00c0fa]'}`}
                  style={{ width: `${Math.max(1, Math.min(100, (status.bytes / status.limitBytes) * 100))}%` }}
                />
              </div>
            </div>
            <div>
              <p className="text-xs text-neutral-400 mb-1.5">{tt('Geçmiş için ayrılan alan')}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {[1, 2, 5, 10, 20, 50].map((gb) => {
                  const on = Math.abs(status.limitBytes - gb * GB) < GB * 0.01
                  return (
                    <button
                      key={gb}
                      onClick={() => changeLimit(gb)}
                      className={`text-xs rounded-full border px-3 py-1.5 transition ${
                        on ? 'border-[#00c0fa] text-[#7fdcff] bg-[#00c0fa]/10' : 'border-neutral-700 text-neutral-400 hover:text-neutral-100 hover:border-neutral-500'
                      }`}
                    >
                      {ttx('{0} GB', gb)}
                    </button>
                  )
                })}
                <span className="inline-flex items-center gap-1 text-xs text-neutral-500 ml-1">
                  {tt('ya da')}
                  <input
                    value={customGb}
                    onChange={(e) => setCustomGb(e.target.value.replace(/[^0-9.,]/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && changeLimit(Number(customGb.replace(',', '.')))}
                    placeholder={tt('örn. 8')}
                    className="w-16 rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-100 outline-none focus:border-neutral-500"
                  />
                  {tt('GB')}
                  {customGb && (
                    <button onClick={() => changeLimit(Number(customGb.replace(',', '.')))} className="text-[#00c0fa] hover:underline ml-1">
                      {tt('Ayarla')}
                    </button>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-neutral-600 mt-1.5">
                {tt('Dolunca sana sorulur: alanı artırmak mı, en eski geçmişi silmek mi. Arşivinin kendisi bu alana dahil değil.')}
              </p>
            </div>
            <button
              onClick={freeSpace}
              className="text-xs rounded-full border border-neutral-700 text-neutral-400 hover:text-rose-300 hover:border-rose-500/50 px-3 py-1.5 transition"
            >
              {tt('Şimdi yer aç (en eskilerden sil)')}
            </button>
          </div>
        )}
        <p className="text-sm text-neutral-500 mt-2 mb-4">
          {onlyRow ? (
            <>
              {tt('Bu kaydın bütün değişiklikleri, yeniden eskiye.')}{' '}
              <button onClick={() => setOnlyRow(null)} className="text-[#00c0fa] hover:underline">
                {tt('Tüm arşivin geçmişi ›')}
              </button>
            </>
          ) : (
            tt('ARGUS arşivindeki her eklemeyi, değişikliği ve silmeyi kendiliğinden kaydeder. Bir değişikliği tek tek geri alabilir ya da arşivi bir günün başındaki haline döndürebilirsin.')
          )}
        </p>

        <div className={onlyRow ? '' : 'grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4'}>
          {!onlyRow && (
            <div className="md:max-h-[60vh] md:overflow-y-auto space-y-1 md:pr-1">
              {days === null && <p className="text-sm text-neutral-500">{tt('Yükleniyor...')}</p>}
              {days?.length === 0 && <p className="text-sm text-neutral-500">{tt('Henüz kayıtlı bir değişiklik yok. Bundan sonra yaptıkların burada görünecek.')}</p>}
              {days?.map((d) => (
                <button
                  key={d.day}
                  onClick={() => setDay(d.day)}
                  className={`w-full text-left rounded-xl border px-3 py-2 transition ${
                    day === d.day ? 'border-[#00c0fa]/50 bg-[#00c0fa]/10' : 'border-neutral-800 hover:border-neutral-600'
                  }`}
                >
                  <p className="text-sm text-neutral-100 truncate">{formatDayKey(d.day)}</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {[d.created && tt('{0} eklendi', d.created), d.updated && tt('{0} değişti', d.updated), d.deleted && tt('{0} silindi', d.deleted)].filter(Boolean).join(' · ') ||
                      tt('kayıtlı hal')}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div className="min-w-0">
            {!onlyRow && selectedDay?.snapshot && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2.5 mb-3">
                <p className="text-xs text-neutral-400">
                  {selectedDay.day.includes('_') ? tt('Geri dönmeden hemen önceki hal kayıtlı.') : tt('Bu günün başındaki hali kayıtlı.')}
                </p>
                <button
                  onClick={() => restoreDay(selectedDay.day)}
                  disabled={busy !== null}
                  className="text-xs rounded-full border border-amber-500/50 text-amber-300 hover:bg-amber-500/10 px-3 py-1.5 transition disabled:opacity-50"
                >
                  {tt('Arşivi bu hale döndür')}
                </button>
              </div>
            )}
            {entries && entries.some((e) => e.note === 'backup') && (
              <p className="text-[11px] text-neutral-500 mb-2">
                {tt('Bu değişiklikler geçmiş özelliği gelmeden önce aldığım yedeklerden çıkarıldı — saatler yaklaşık, arada birden fazla adımda yapılanlar tek değişiklik gibi görünebilir.')}
              </p>
            )}
            {entries === null ? (
              <p className="text-sm text-neutral-500">{tt('Yükleniyor...')}</p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-neutral-500">{onlyRow ? tt('Bu kayıt için kayıtlı bir değişiklik yok.') : tt('Bu gün için değişiklik yok.')}</p>
            ) : (
              <ul className="space-y-2 md:max-h-[60vh] md:overflow-y-auto md:pr-1">
                {entries.slice(0, limit).map((e) => {
                  const look = TYPE_LOOK[e.type]
                  return (
                    <li key={e.id} className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`shrink-0 text-[10px] font-medium rounded-full border px-2 py-0.5 ${look.cls}`}>
                          {e.note === 'undo' ? (e.type === 'create' ? tt('Geri getirildi') : e.type === 'update' ? tt('Geri alındı') : tt('Kaldırıldı')) : look.label}
                          {e.note === 'restore' ? tt(' · güne dönüş') : ''}
                        </span>
                        <span className="flex-1 min-w-0 text-sm text-neutral-100 truncate">{onlyRow ? formatStamp(e.t) : e.title || tt('İsimsiz')}</span>
                        {!onlyRow && (
                          <span className="shrink-0 text-[11px] text-neutral-500 tabular-nums" title={e.note === 'backup' ? tt('Yedeklerden çıkarıldı, saat yaklaşık') : undefined}>
                            {e.note === 'backup' ? '~' : ''}
                            {formatStamp(e.t).split(' ').pop()}
                          </span>
                        )}
                        <button
                          onClick={() => undo(e)}
                          disabled={busy !== null}
                          className="shrink-0 text-xs text-neutral-400 hover:text-neutral-50 border border-neutral-700 hover:border-neutral-500 rounded-full px-2.5 py-1 transition disabled:opacity-50"
                        >
                          {busy === e.id ? '...' : look.undo}
                        </button>
                      </div>
                      {e.type === 'update' && (e.changes?.length ?? 0) > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {e.changes!.slice(0, 8).map((c) => (
                            <p key={c.prop} className="text-xs text-neutral-500 truncate">
                              <span className="text-neutral-400">{propName(board, c.prop)}:</span> {formatValue(board, c.prop, c.from)}{' '}
                              <span className="text-neutral-600">→</span> <span className="text-neutral-300">{formatValue(board, c.prop, c.to)}</span>
                            </p>
                          ))}
                          {e.changes!.length > 8 && <p className="text-xs text-neutral-600">{ttx('+{0} alan daha', e.changes!.length - 8)}</p>}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {entries && entries.length > limit && (
              <button onClick={() => setLimit((n) => n + 300)} className="mt-2 w-full text-sm text-neutral-300 border border-neutral-800 hover:border-neutral-600 rounded-xl py-2 transition">
                {ttx('Daha fazla göster ({0} kaldı)', entries.length - limit)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
