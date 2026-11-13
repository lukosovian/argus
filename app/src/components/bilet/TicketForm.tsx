import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../lib/api'
import { biletFromRow, newBiletId, saveBilet, type Bilet } from '../../lib/bilet'
import { useEscape } from '../../hooks/useEscape'
import { useToast } from '../../hooks/useToast'
import { tt } from '../../lib/i18n'
import { todayIso, type Board, type Row } from '../../types'
import { TicketBack, TicketFront, TICKET_RATIO, type BiletItem } from './Ticket'

// Bilet ekleme / düzenleme penceresi. Solda canlı önizleme (ön / arka), sağda bilgiler. Arşivden açıldıysa yapım hazır
// gelir; Biletlerim'den açıldıysa önce yapım seçilir (arşivden aranır ya da elle ad yazılır — ör. bir festival gösterimi).

const FORMATS = ['2D', '3D', 'IMAX', '4DX', 'Dolby', 'ScreenX']

export default function TicketForm({
  initial,
  id,
  board,
  rows,
  suggestions,
  onClose,
  onSaved,
}: {
  initial?: Bilet
  id?: string
  board?: Board | null
  rows?: Row[]
  suggestions?: { cinemas: string[]; people: string[] }
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { notify } = useToast()
  const [b, setB] = useState<Bilet>(() => initial ?? { title: '', date: todayIso() })
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [uploading, setUploading] = useState<'front' | 'back' | null>(null)
  const frontRef = useRef<HTMLInputElement>(null)
  const backRef = useRef<HTMLInputElement>(null)
  useEscape(true, onClose)
  const editing = Boolean(id)
  const set = (p: Partial<Bilet>) => setB((x) => ({ ...x, ...p }))

  const titleProp = board?.properties.find((p) => p.id === board.titlePropertyId)
  const matches = useMemo(() => {
    if (!board || !rows || !titleProp || q.trim().length < 2) return []
    const n = q.trim().toLocaleLowerCase('tr')
    const out: Row[] = []
    for (const r of rows) {
      const t = String(r.values[titleProp.id] ?? '').toLocaleLowerCase('tr')
      if (t.includes(n)) out.push(r)
      if (out.length >= 6) break
    }
    return out
  }, [board, rows, titleProp, q])

  async function upload(which: 'front' | 'back', file: File | undefined) {
    if (!file) return
    setUploading(which)
    try {
      const { filename } = await api.uploadMedya(file)
      set({ [which]: `/medya/${filename}` })
      setSide(which)
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Fotoğraf yüklenemedi.'), 'danger')
    } finally {
      setUploading(null)
    }
  }

  async function save() {
    if (!b.title.trim()) return notify(tt('Önce yapımı seç ya da adını yaz.'), 'danger')
    setBusy(true)
    const key = id ?? newBiletId()
    const out: Record<string, string | null> = {}
    for (const k of ['title', 'poster', 'cover', 'logo', 'year', 'rowId', 'boardId', 'date', 'time', 'cinema', 'hall', 'seat', 'format', 'withWho', 'price', 'note', 'front', 'back'] as const) {
      const v = b[k]
      out[k] = typeof v === 'string' && v.trim() ? v.trim() : null
    }
    try {
      await saveBilet(key, out)
      notify(editing ? tt('Bilet güncellendi.') : tt('Bilet koleksiyonuna eklendi.'), 'success')
      onSaved?.(key)
      onClose()
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Kaydedilemedi.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  const preview: BiletItem = { ...b, id: id ?? 'yeni', title: b.title || tt('Yapımın adı') }
  const field = 'mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]/70'
  const lbl = 'block text-[11px] font-semibold uppercase tracking-wider text-neutral-500'
  const PW = 560

  return createPortal(
    <div className="fixed inset-0 z-[86] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[calc(100vh-32px)] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 lg:flex-row" onClick={(e) => e.stopPropagation()}>
        {/* önizleme */}
        <div className="flex flex-col items-center justify-center gap-4 border-b border-neutral-800 p-6 lg:w-[620px] lg:border-b-0 lg:border-r" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(0,192,250,.08), transparent 70%)' }}>
          <div style={{ width: PW, maxWidth: '100%', aspectRatio: `${TICKET_RATIO}`, fontSize: PW / 48 }} className="drop-shadow-[0_20px_40px_rgba(0,0,0,.6)]">
            {side === 'front' ? <TicketFront b={preview} no={0} /> : <TicketBack b={preview} no={0} />}
          </div>
          <div className="grid grid-cols-2 rounded-xl border border-neutral-800 bg-neutral-900 p-1 text-xs">
            {(['front', 'back'] as const).map((s) => (
              <button key={s} onClick={() => setSide(s)} className={`rounded-lg px-4 py-1.5 transition ${side === s ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}>
                {s === 'front' ? tt('Ön yüz') : tt('Arka yüz')}
              </button>
            ))}
          </div>
        </div>

        {/* bilgiler */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <h3 className="text-lg font-semibold text-neutral-50">{editing ? tt('Bileti düzenle') : tt('Sinema bileti ekle')}</h3>
            <p className="text-xs text-neutral-500">{tt('Boş bıraktıkların bilette görünmez.')}</p>
          </div>

          {!initial?.rowId && !editing && (
            <div className="relative">
              <span className={lbl}>{tt('Yapım')}</span>
              <input
                value={b.rowId ? b.title : q || b.title}
                onChange={(e) => {
                  setQ(e.target.value)
                  set({ title: e.target.value, rowId: undefined, boardId: undefined, poster: undefined, cover: undefined, logo: undefined, year: undefined })
                }}
                placeholder={tt('Arşivinde ara ya da adını yaz')}
                className={field}
              />
              {matches.length > 0 && !b.rowId && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl">
                  {matches.map((r) => {
                    const base = biletFromRow(board!, r)
                    return (
                      <button
                        key={r.id}
                        onClick={() => {
                          set(base)
                          setQ('')
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"
                      >
                        {base.poster ? <img src={base.poster} alt="" className="h-9 w-6 rounded object-cover" /> : <span className="h-9 w-6 rounded bg-neutral-800" />}
                        <span className="flex-1 truncate">{base.title}</span>
                        <span className="text-xs text-neutral-500">{base.year}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={lbl}>{tt('Tarih')}</span>
              <input type="date" value={b.date ?? ''} onChange={(e) => set({ date: e.target.value })} className={field} style={{ colorScheme: 'dark' }} />
            </label>
            <label className="block">
              <span className={lbl}>{tt('Seans')}</span>
              <input type="time" value={b.time ?? ''} onChange={(e) => set({ time: e.target.value })} className={field} style={{ colorScheme: 'dark' }} />
            </label>
          </div>
          <label className="block">
            <span className={lbl}>{tt('Sinema')}</span>
            <input list="bilet-sinemalar" value={b.cinema ?? ''} onChange={(e) => set({ cinema: e.target.value })} placeholder={tt('ör. Cinemaximum Akasya')} className={field} />
            <datalist id="bilet-sinemalar">
              {suggestions?.cinemas.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={lbl}>{tt('Salon')}</span>
              <input value={b.hall ?? ''} onChange={(e) => set({ hall: e.target.value })} placeholder="5" className={field} />
            </label>
            <label className="block">
              <span className={lbl}>{tt('Koltuk')}</span>
              <input value={b.seat ?? ''} onChange={(e) => set({ seat: e.target.value })} placeholder="F12" className={field} />
            </label>
          </div>
          <div>
            <span className={lbl}>{tt('Format')}</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  onClick={() => set({ format: b.format === f ? undefined : f })}
                  className={`rounded-full border px-3 py-1 text-xs transition ${b.format === f ? 'border-[#00c0fa]/70 bg-[#00c0fa]/10 text-white' : 'border-neutral-800 text-neutral-400 hover:text-neutral-200'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={lbl}>{tt('Kiminle')}</span>
              <input list="bilet-kisiler" value={b.withWho ?? ''} onChange={(e) => set({ withWho: e.target.value })} placeholder={tt('ör. Ece, Can')} className={field} />
              <datalist id="bilet-kisiler">
                {suggestions?.people.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>
            <label className="block">
              <span className={lbl}>{tt('Fiyat')}</span>
              <input value={b.price ?? ''} onChange={(e) => set({ price: e.target.value })} placeholder="250 ₺" className={field} />
            </label>
          </div>
          <label className="block">
            <span className={lbl}>{tt('Not')}</span>
            <textarea value={b.note ?? ''} onChange={(e) => set({ note: e.target.value.slice(0, 200) })} onFocus={() => setSide('back')} rows={2} placeholder={tt('ör. Salon alkışlarla inledi.')} className={`${field} resize-none`} />
          </label>
          <div>
            <span className={lbl}>{tt('Gerçek biletin fotoğrafı (isteğe bağlı)')}</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(['front', 'back'] as const).map((w) => (
                <div key={w} className="flex items-center gap-2 rounded-lg border border-dashed border-neutral-800 px-3 py-2">
                  <button onClick={() => (w === 'front' ? frontRef : backRef).current?.click()} className="flex-1 truncate text-left text-xs text-neutral-300 hover:text-white">
                    {uploading === w ? tt('Yükleniyor…') : b[w] ? (w === 'front' ? tt('Ön yüz yüklendi') : tt('Arka yüz yüklendi')) : w === 'front' ? tt('+ Ön yüz') : tt('+ Arka yüz')}
                  </button>
                  {b[w] && (
                    <button onClick={() => set({ [w]: undefined })} className="text-xs text-neutral-500 hover:text-red-300" title={tt('Kaldır')}>
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <input ref={frontRef} type="file" accept="image/*" className="hidden" onChange={(e) => void upload('front', e.target.files?.[0])} />
            <input ref={backRef} type="file" accept="image/*" className="hidden" onChange={(e) => void upload('back', e.target.files?.[0])} />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => void save()} disabled={busy} className="flex-1 rounded-lg bg-[#00c0fa] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#33cdfb] disabled:opacity-60">
              {editing ? tt('Kaydet') : tt('Koleksiyona ekle')}
            </button>
            <button onClick={onClose} className="rounded-lg border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300 hover:text-white">
              {tt('Vazgeç')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
