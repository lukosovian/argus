import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api'
import { notifyDataChanged } from '../lib/dataEvents'
import { resolveRole } from '../lib/roles'
import { titleText, type Board, type PropertyValue, type Row } from '../types'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import PropertyValueInput from './PropertyValueInput'

// Puan hatırlatması — kullanıcı "izledikten sonra puan sorsun" dedi. Bir kayıt hangi yoldan olursa olsun
// (tablo, takvim, Ne İzlesem, dizinin bütün bölümleri bitince) İzlendi olup puanı boşsa sunucu haber
// veriyor (bkz. api.ts'teki X-Argus-Ask-Rating); burada sağ altta küçük bir kart açılır.
const MUTE_KEY = 'argus_rate_prompt_off'

export default function RatePrompt() {
  const [queue, setQueue] = useState<{ boardId: string; rowId: string }[]>([])
  const [ctx, setCtx] = useState<{ board: Board; row: Row } | null>(null)
  const [scores, setScores] = useState<PropertyValue>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onAsk = (e: Event) => {
      try {
        if (localStorage.getItem(MUTE_KEY)) return
      } catch {
        // yoksa sorulur
      }
      const d = (e as CustomEvent<{ boardId: string; rowId: string }>).detail
      if (!d?.boardId || !d?.rowId) return
      setQueue((q) => (q.some((x) => x.rowId === d.rowId) ? q : [...q, d]))
    }
    window.addEventListener('argus-ask-rating', onAsk)
    return () => window.removeEventListener('argus-ask-rating', onAsk)
  }, [])

  // Sıradaki kaydı yükle
  useEffect(() => {
    if (ctx || queue.length === 0) return
    const next = queue[0]
    let alive = true
    Promise.all([api.getBoards(), api.getRows(next.boardId)])
      .then(([boards, rows]) => {
        if (!alive) return
        const board = boards.find((b) => b.id === next.boardId)
        const row = rows.find((r) => r.id === next.rowId)
        const puan = board ? resolveRole(board, 'puan') : undefined
        if (!board || !row || !puan) {
          setQueue((q) => q.slice(1))
          return
        }
        setScores({})
        setCtx({ board, row })
      })
      .catch(() => setQueue((q) => q.slice(1)))
    return () => {
      alive = false
    }
  }, [queue, ctx])

  function close() {
    setCtx(null)
    setQueue((q) => q.slice(1))
  }

  async function save() {
    if (!ctx) return
    const puan = resolveRole(ctx.board, 'puan')
    if (!puan) return close()
    setBusy(true)
    try {
      const fresh = (await api.getRows(ctx.board.id)).find((r) => r.id === ctx.row.id) ?? ctx.row
      await api.updateRow(ctx.board.id, fresh.id, { values: { ...fresh.values, [puan.id]: scores }, createdAt: fresh.createdAt, updatedAt: Date.now() })
      notifyDataChanged(ctx.board.id)
      close()
    } finally {
      setBusy(false)
    }
  }

  if (!ctx) return null
  const puan = resolveRole(ctx.board, 'puan')!
  const tp = ctx.board.properties.find((p) => p.id === ctx.board.titlePropertyId)
  const title = (tp ? titleText(tp, ctx.row.values[tp.id]) : '') || 'Bu kayıt'
  const posterProp = resolveRole(ctx.board, 'poster')
  const poster = posterProp ? (ctx.row.values[posterProp.id] as string) : ''
  const hasScore = scores && typeof scores === 'object' && Object.keys(scores as object).length > 0

  return createPortal(
    <div className="fixed bottom-5 right-5 z-[90] w-[min(23rem,calc(100vw-2.5rem))] rounded-2xl border border-[#00c0fa]/30 bg-neutral-900/95 backdrop-blur-sm shadow-2xl shadow-black/50 p-4 space-y-3" style={{ animation: 'argus-toast-in .2s ease-out' }}>
      <div className="flex items-start gap-3">
        {poster && <img src={poster} alt="" className="h-16 w-11 rounded-md object-cover shrink-0 bg-neutral-800" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-50 truncate">{title}</p>
          <p className="text-xs text-neutral-400 mt-0.5">İzledin! Kaç puan verirsin?</p>
          {queue.length > 1 && <p className="text-[11px] text-neutral-600 mt-0.5">Sırada {queue.length - 1} tane daha</p>}
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto pr-1">
        <PropertyValueInput property={puan} value={scores} onChange={setScores} />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={busy || !hasScore} style={primaryButtonStyle} className={`text-sm px-4 py-1.5 rounded-lg ${PRIMARY_BUTTON} disabled:opacity-40`}>
          Kaydet
        </button>
        <button onClick={close} className="text-sm text-neutral-400 hover:text-neutral-100 px-2">
          Sonra
        </button>
        <button
          onClick={() => {
            try {
              localStorage.setItem(MUTE_KEY, '1')
            } catch {
              // saklanamasa da bu sefer kapanır
            }
            setQueue([])
            setCtx(null)
          }}
          className="ml-auto text-[11px] text-neutral-600 hover:text-neutral-300"
        >
          Bir daha sorma
        </button>
      </div>
    </div>,
    document.body,
  )
}
