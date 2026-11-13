import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type BiletGorsel } from '../../lib/api'
import { biletFromRow, newBiletId, saveBilet, type Bilet } from '../../lib/bilet'
import { useEscape } from '../../hooks/useEscape'
import { useToast } from '../../hooks/useToast'
import { tt } from '../../lib/i18n'
import { todayIso, type Board, type Row } from '../../types'
import { useExtras } from '../../lib/extras'
import { useOdulData } from '../../lib/oduller'
import { artOf, styleOf, TicketBack, TicketFront, TICKET_RATIO, TICKET_STYLES, type BiletItem } from './Ticket'

// Bilet ekleme / düzenleme penceresi. Solda canlı önizleme (ön / arka), sağda bilgiler. Arşivden açıldıysa yapım hazır
// gelir; Biletlerim'den açıldıysa önce yapım seçilir (arşivden aranır ya da elle ad yazılır — ör. bir festival gösterimi).

const FORMATS = ['2D', '3D', 'IMAX', '4DX', 'Dolby', 'ScreenX']
const TMDB_IMG = 'https://image.tmdb.org/t/p'
const SWATCH: Record<string, string> = {
  sinema: 'linear-gradient(90deg, #1d3a52 70%, #f2ece1 70%)',
  klasik: 'linear-gradient(90deg, #efe3c6 70%, #6e1d1d 70%)',
  altin: 'linear-gradient(90deg, #0c0b09 70%, #d9b56a 70%)',
  neon: 'linear-gradient(90deg, #ff3fd0, #5b2bff 45%, #3ff0ff 70%, #120a2e 70%)',
}

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
  // Neon tasarım ödül paketinden çıkınca seçilebilir (v1.24)
  const neonOwned = Boolean(useOdulData(useExtras().on('rewards'))?.items['bilet:neon'])
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [uploading, setUploading] = useState<'front' | 'back' | null>(null)
  const frontRef = useRef<HTMLInputElement>(null)
  const backRef = useRef<HTMLInputElement>(null)
  // v1.23.12: TMDB'den bilet görseli seçme ve görseli sürükleyerek konumlama
  const [imgs, setImgs] = useState<BiletGorsel[] | null>(null)
  const [imgTab, setImgTab] = useState<'sahne' | 'afis'>('sahne')
  const [imgBusy, setImgBusy] = useState(false)
  const [pending, setPending] = useState<BiletGorsel | null>(null)
  const drag = useRef<{ x: number; y: number; pos: [number, number]; w: number; h: number } | null>(null)
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

  const loadImgs = (q: { rowId?: string; title?: string; year?: string }) => {
    setImgBusy(true)
    api
      .biletGorselleri(q)
      .then((r) => setImgs(r.items))
      .catch(() => setImgs([]))
      .finally(() => setImgBusy(false))
  }
  useEffect(() => {
    if (b.rowId) loadImgs({ rowId: b.rowId })
    else setImgs(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.rowId])

  function pick(g: BiletGorsel | null) {
    setPending(g)
    set({ art: g ? `${TMDB_IMG}/${g.kind === 'afis' ? 'w780' : 'w1280'}${g.path}` : undefined, artPos: undefined, artZoom: undefined })
    setSide('front')
  }
  const art = artOf(b, styleOf(b) === 'klasik')
  const canMove = side === 'front' && !b.front && Boolean(art.src)
  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (!canMove) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    drag.current = { x: e.clientX, y: e.clientY, pos: art.pos, w: r.width, h: r.height }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function moveArt(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    const k = 150 / art.zoom
    const c = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10
    set({ artPos: `${c(d.pos[0] - ((e.clientX - d.x) / d.w) * k)} ${c(d.pos[1] - ((e.clientY - d.y) / d.h) * k)}` })
  }

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
    let art = b.art
    if (pending && art?.startsWith(TMDB_IMG)) {
      try {
        art = (await api.biletGorselIndir(pending.path, pending.kind)).url
      } catch {
        setBusy(false)
        return notify(tt('Görsel indirilemedi.'), 'danger')
      }
    }
    const full: Bilet = { ...b, art }
    for (const k of ['title', 'poster', 'cover', 'logo', 'year', 'rowId', 'boardId', 'date', 'time', 'cinema', 'hall', 'seat', 'format', 'withWho', 'price', 'note', 'front', 'back', 'art', 'artPos', 'artZoom', 'style'] as const) {
      const v = full[k]
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
          <div
            style={{ width: PW, maxWidth: '100%', aspectRatio: `${TICKET_RATIO}`, fontSize: PW / 48, touchAction: 'none' }}
            className={`select-none drop-shadow-[0_20px_40px_rgba(0,0,0,.6)] ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onPointerDown={down}
            onPointerMove={moveArt}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {side === 'front' ? <TicketFront b={preview} no={0} /> : <TicketBack b={preview} no={0} />}
          </div>
          <div className="grid grid-cols-2 rounded-xl border border-neutral-800 bg-neutral-900 p-1 text-xs">
            {(['front', 'back'] as const).map((s) => (
              <button key={s} onClick={() => setSide(s)} className={`rounded-lg px-4 py-1.5 transition ${side === s ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}>
                {s === 'front' ? tt('Ön yüz') : tt('Arka yüz')}
              </button>
            ))}
          </div>
          {canMove && (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-neutral-400">
              <span>{tt('Görseli sürükleyerek konumla')}</span>
              <label className="flex items-center gap-2">
                {tt('Yakınlaştır')}
                <input type="range" min={1} max={2.5} step={0.01} value={art.zoom} onChange={(e) => set({ artZoom: String(e.target.value) })} className="w-28 accent-[#00c0fa]" />
              </label>
              {(b.artPos || b.artZoom) && (
                <button onClick={() => set({ artPos: undefined, artZoom: undefined })} className="text-neutral-500 hover:text-white">
                  {tt('Sıfırla')}
                </button>
              )}
            </div>
          )}
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

          <div>
            <span className={lbl}>{tt('Tasarım')}</span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {TICKET_STYLES.filter((t) => t.id !== 'neon' || neonOwned || styleOf(b) === 'neon').map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    set({ style: t.id === 'sinema' ? undefined : t.id })
                    setSide('front')
                  }}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${styleOf(b) === t.id ? 'border-[#00c0fa]/70 bg-[#00c0fa]/10 text-white' : 'border-neutral-800 text-neutral-400 hover:text-neutral-200'}`}
                >
                  <span className="h-4 w-8 shrink-0 rounded-[3px] ring-1 ring-white/10" style={{ background: SWATCH[t.id] }} />
                  {t.label()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className={lbl}>{tt('Bilet görseli')}</span>
              {imgs && imgs.length > 0 && (
                <div className="flex gap-1 text-[11px]">
                  {(['sahne', 'afis'] as const).map((t) => (
                    <button key={t} onClick={() => setImgTab(t)} className={`rounded-md px-2 py-0.5 ${imgTab === t ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}>
                      {t === 'sahne' ? tt('Sahneler') : tt('Afişler')}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className={`mt-1.5 grid max-h-[180px] gap-1.5 overflow-y-auto pr-1 ${imgTab === 'afis' ? 'grid-cols-6' : 'grid-cols-4'}`}>
              <button
                onClick={() => pick(null)}
                className={`relative flex items-center justify-center overflow-hidden rounded-md border text-[10px] text-neutral-100 ${imgTab === 'afis' ? 'aspect-[2/3]' : 'aspect-video'} ${!b.art ? 'border-[#00c0fa]' : 'border-neutral-800 hover:border-neutral-600'}`}
                title={tt('Yapımın kendi görseli')}
              >
                {b.cover || b.poster ? <img src={(imgTab === 'afis' ? b.poster : b.cover) || b.cover || b.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" /> : null}
                <span className="relative font-semibold drop-shadow">{tt('Varsayılan')}</span>
              </button>
              {(imgs ?? [])
                .filter((g) => g.kind === imgTab)
                .map((g) => {
                  const on = Boolean(b.art && b.art.endsWith(g.path.slice(1)))
                  return (
                    <button
                      key={g.path}
                      onClick={() => pick(g)}
                      className={`relative overflow-hidden rounded-md border ${g.kind === 'afis' ? 'aspect-[2/3]' : 'aspect-video'} ${on ? 'border-[#00c0fa] ring-1 ring-[#00c0fa]' : 'border-neutral-800 hover:border-neutral-600'}`}
                    >
                      <img src={`${TMDB_IMG}/${g.kind === 'afis' ? 'w185' : 'w300'}${g.path}`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    </button>
                  )
                })}
              {imgBusy && <span className="col-span-3 self-center text-[11px] text-neutral-500">{tt('Görseller yükleniyor…')}</span>}
            </div>
            {!b.rowId && b.title.trim().length > 1 && !imgBusy && (
              <button onClick={() => loadImgs({ title: b.title, year: b.year })} className="mt-1.5 text-[11px] text-[#5fd6ff] hover:text-white">
                {tt("TMDB'de görsel ara")}
              </button>
            )}
            {imgs && imgs.length === 0 && !imgBusy && <p className="mt-1 text-[11px] text-neutral-500">{tt("TMDB'de görsel bulunamadı.")}</p>}
          </div>

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
