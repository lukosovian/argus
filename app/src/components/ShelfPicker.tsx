import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'

// Koleksiyon'da bir rafa yapım ekleme / çıkarma — kullanıcı "serinin içine kendim film ekleyebilmeliyim" dedi.
// Koleksiyondaki bütün yapımlar aranabilir bir listede; işaretliler bu rafta. Başka raftaysa adı yazıyor
// (işaretlersen buraya taşınır).
export interface PickerItem {
  id: string
  title: string
  year: string
  isSeries: boolean
  thumb: string
  // şu an bulunduğu rafın adı ('' = rafsız)
  shelfName: string
  inShelf: boolean
}

export default function ShelfPicker({
  shelfName,
  items,
  additive = false,
  onSave,
  onClose,
}: {
  shelfName: string
  items: PickerItem[]
  // Elle açılmış (ek) raf: işaretlenen kendi rafında da kalır, taşınmaz
  additive?: boolean
  onSave: (selected: Set<string>) => Promise<void>
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(() => new Set(items.filter((i) => i.inShelf).map((i) => i.id)))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // İşaretliler üstte, sonra aramaya uyanlar (adı aramayla başlayanlar önce)
  const shown = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr')
    const list = items.filter((i) => !t || i.title.toLocaleLowerCase('tr').includes(t))
    const rank = (i: PickerItem) => (i.inShelf ? 0 : t && i.title.toLocaleLowerCase('tr').startsWith(t) ? 1 : 2)
    return [...list].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, 'tr')).slice(0, 200)
  }, [items, q])

  const changed = items.filter((i) => i.inShelf !== selected.has(i.id)).length

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/80 overflow-y-auto py-8 px-4" onClick={onClose}>
      <div className="relative w-full max-w-xl mx-auto bg-neutral-900 rounded-2xl border border-neutral-800 p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Kapat" className="absolute top-4 right-4 h-9 w-9 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-lg">
          ×
        </button>
        <h2 className="text-xl font-bold text-neutral-50 pr-10">{shelfName} rafı</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          {additive
            ? 'Bu rafta olmasını istediklerini işaretle. Kendi raflarında da durmaya devam ederler; işareti kaldırırsan sadece bu raftan çıkar.'
            : 'Bu rafta olmasını istediklerini işaretle. Başka bir raftaysa buraya taşınır; işareti kaldırırsan raftan çıkar.'}
        </p>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Koleksiyonda ara…"
          className="mt-4 w-full rounded-xl bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]"
        />
        <ul className="mt-3 max-h-[55vh] overflow-y-auto space-y-1 pr-1">
          {shown.map((i) => {
            const on = selected.has(i.id)
            return (
              <li key={i.id}>
                <button
                  onClick={() =>
                    setSelected((s) => {
                      const n = new Set(s)
                      if (n.has(i.id)) n.delete(i.id)
                      else n.add(i.id)
                      return n
                    })
                  }
                  className={`w-full flex items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition ${on ? 'border-[#00c0fa]/60 bg-[#00c0fa]/10' : 'border-neutral-800 hover:border-neutral-600'}`}
                >
                  <span className={`h-5 w-5 shrink-0 rounded-md border flex items-center justify-center text-xs ${on ? 'bg-[#00c0fa] border-[#00c0fa] text-white' : 'border-neutral-600'}`}>{on ? '✓' : ''}</span>
                  <span className="h-10 w-10 shrink-0 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center p-1 overflow-hidden">
                    {i.thumb ? <img src={i.thumb} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-100 truncate">{i.title}</span>
                    <span className="block text-[11px] text-neutral-500 truncate">
                      {[i.year, i.isSeries ? 'Dizi' : 'Film', i.shelfName && (additive || !i.inShelf) ? `${i.shelfName} rafında` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {!shown.length && <li className="text-sm text-neutral-500 text-center py-6">Bu aramaya uyan yapım yok.</li>}
        </ul>
        <div className="flex items-center justify-between gap-3 mt-5">
          <span className="text-xs text-neutral-500">{selected.size} yapım işaretli</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm rounded-lg px-4 py-2 text-neutral-300 hover:bg-neutral-800">
              Vazgeç
            </button>
            <button
              onClick={async () => {
                setBusy(true)
                try {
                  await onSave(selected)
                  onClose()
                } finally {
                  setBusy(false)
                }
              }}
              disabled={busy || changed === 0}
              style={primaryButtonStyle}
              className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON} disabled:opacity-50`}
            >
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
