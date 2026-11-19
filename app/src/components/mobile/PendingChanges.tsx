import { useCallback, useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '../../hooks/useToast'
import { useEscape } from '../../hooks/useEscape'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { dropFailed, dropPending, getFailed, retryFailed, type FailedOp } from '../../lib/mobile/connection'
import { describeOp, failReason, type OpInfo } from '../../lib/mobile/describeOp'
import { queueAll, type QueuedOp } from '../../lib/mobile/store'
import { useMobileState } from './MobileStatusBar'
import { locale, tt } from '../../lib/i18n'

// ARGUS Android › "Bekleyen değişiklikler": PC'ye gönderilmeyi bekleyenler ve PC'nin uygulayamadıkları, sade dille.
// Üstteki bağlantı göstergesine ya da Ayarlar › PC bağlantısı'ndaki düğmeye dokununca açılır
// ('argus-bekleyenler-ac' olayı; ekranı MobileStatusBar tutuyor).

type PendingItem = { key: IDBValidKey; op: QueuedOp; info: OpInfo }
type FailedItem = { f: FailedOp; info: OpInfo }

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString(locale(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

async function fetchLists(): Promise<{ p: PendingItem[]; f: FailedItem[] }> {
  const [q, f] = await Promise.all([queueAll().catch(() => []), getFailed().catch(() => [])])
  return {
    p: await Promise.all(q.map(async ({ key, op }) => ({ key, op, info: await describeOp(op) }))),
    // En yenisi üstte
    f: await Promise.all(f.slice().reverse().map(async (x) => ({ f: x, info: await describeOp(x.op) }))),
  }
}

export default function PendingChanges({ onClose }: { onClose: () => void }) {
  const { notify, confirm } = useToast()
  const s = useMobileState()
  const [pending, setPending] = useState<PendingItem[] | null>(null)
  const [failed, setFailed] = useState<FailedItem[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    void fetchLists().then(({ p, f }) => {
      setPending(p)
      setFailed(f)
    })
  }, [])
  useEffect(() => {
    let alive = true
    fetchLists().then(({ p, f }) => {
      if (!alive) return
      setPending(p)
      setFailed(f)
    })
    return () => {
      alive = false
    }
  }, [s.pending, s.failed, s.lastSync])

  // Android geri tuşu / Esc
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef)
  useEscape(true, onClose)

  async function retry(items: FailedOp[]) {
    setBusy(true)
    try {
      await retryFailed(items)
      notify(s.status === 'offline' ? tt('Sıraya geri kondu; PC\'ye bağlanınca gönderilecek.') : tt('Yeniden gönderildi.'), 'success')
    } catch {
      notify(tt('Yeniden denenemedi.'), 'danger')
    } finally {
      setBusy(false)
      load()
    }
  }

  async function removeFailed(it: FailedItem) {
    if (!(await confirm({ message: tt('Bu değişiklik listeden silinsin mi? PC\'ye hiç gönderilmeyecek.'), confirmLabel: tt('Sil'), tone: 'danger' }))) return
    await dropFailed(it.f).catch(() => {})
    load()
  }

  async function removePending(it: PendingItem) {
    if (!(await confirm({ message: tt('Bu değişiklik PC\'ye gönderilmeden silinsin mi? Telefonda da PC\'deki hâline döner.'), confirmLabel: tt('Sil'), tone: 'danger' }))) return
    await dropPending(it.key, it.op).catch(() => {})
    load()
  }

  const row = 'rounded-xl border border-neutral-800 bg-neutral-900/70 px-3.5 py-3'
  const btn = 'rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-xs text-neutral-200 disabled:opacity-50'
  const title = (info: OpInfo) => (
    <p className="text-sm text-neutral-100">
      {info.kind}
      {info.title && <span className="text-neutral-400"> · {info.title}</span>}
    </p>
  )

  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={tt('Bekleyen değişiklikler')} className="fixed inset-0 z-[95] flex flex-col bg-neutral-950" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 36px)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 pb-3">
        <h2 className="text-lg font-semibold text-neutral-50">{tt('Bekleyen değişiklikler')}</h2>
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-300">
          {tt('Kapat')}
        </button>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{tt('PC\'ye gönderilmeyi bekleyenler')}</p>
          {s.status === 'offline' && pending && pending.length > 0 && (
            <p className="text-xs text-amber-300">{tt('PC ile aynı Wi-Fi\'a girince kendiliğinden gönderilir.')}</p>
          )}
          {pending?.length === 0 && <p className="text-sm text-neutral-500">{tt('Bekleyen değişiklik yok.')}</p>}
          {pending?.map((it) => (
            <div key={String(it.key)} className={`${row} flex items-start justify-between gap-3`}>
              <div className="min-w-0">
                {title(it.info)}
                <p className="text-xs text-neutral-500">{fmtTime(it.op.at)}</p>
              </div>
              <button onClick={() => void removePending(it)} disabled={s.status === 'syncing'} className="shrink-0 text-xs text-neutral-400 disabled:opacity-40">
                {tt('Sil')}
              </button>
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{tt('PC\'de uygulanamayanlar')}</p>
            {failed && failed.length > 1 && (
              <button onClick={() => void retry(failed.map((x) => x.f))} disabled={busy} className={btn}>
                {tt('Hepsini tekrar dene')}
              </button>
            )}
          </div>
          {failed?.length === 0 && <p className="text-sm text-neutral-500">{tt('Sorunlu değişiklik yok.')}</p>}
          {failed?.map((it) => (
            <div key={`${it.f.op.id}-${it.f.t}`} className={row}>
              {title(it.info)}
              <p className="text-xs text-neutral-500">
                {tt('Yapıldığı an: {0}', fmtTime(it.f.op.at))} · {tt('Denendiği an: {0}', fmtTime(it.f.t))}
              </p>
              <p className="mt-1 text-xs text-red-400">{failReason(it.f.status, it.f.error)}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => void retry([it.f])} disabled={busy} className={btn}>
                  {tt('Tekrar dene')}
                </button>
                <button onClick={() => void removeFailed(it)} disabled={busy} className={btn}>
                  {tt('Sil')}
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>,
    document.body,
  )
}
