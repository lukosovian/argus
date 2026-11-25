import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SavedView } from '../../types'
import { useToast } from '../../hooks/useToast'
import { useEscape } from '../../hooks/useEscape'
import { tt } from '../../lib/i18n'

// ARGUS Android › Arşiv: bilgisayarda kaydedilen görünümler ("Bu yıl izlediklerim", "Yarım kalanlar"…) telefonda da
// (v1.26). Netflix uygulamasındaki kategori çipleri gibi yana kayan çipler: dokununca uygulanır (seçiliyken bir daha
// dokununca filtre kalkar). Filtre/sıralama kurulmuşsa sonda "+ Kaydet" çipi; bir çipe basılı tutunca küçük sayfa:
// şu anki halle güncelle, adını değiştir, sil. Görünümler arşivin kendisinde durduğu için PC ile aynı.
export default function MobileViewChips({
  views,
  activeId,
  canSave,
  onApply,
  onClear,
  onSave,
  onRename,
  onOverwrite,
  onDelete,
}: {
  views: SavedView[]
  activeId: string | null
  // Şu an bir filtre/sıralama kurulu (kaydedilecek bir şey var)
  canSave: boolean
  onApply: (v: SavedView) => void
  onClear: () => void
  onSave: (name: string) => void
  onRename: (id: string, name: string) => void
  onOverwrite: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { confirm } = useToast()
  const [sheet, setSheet] = useState<{ mode: 'menu'; view: SavedView } | { mode: 'name'; view: SavedView | null } | null>(null)
  const [draft, setDraft] = useState('')
  const press = useRef<{ t: ReturnType<typeof setTimeout> | null; fired: boolean; x: number; y: number }>({ t: null, fired: false, x: 0, y: 0 })
  useEscape(Boolean(sheet), () => setSheet(null))
  useEffect(() => () => {
    if (press.current.t) clearTimeout(press.current.t)
  }, [])

  const showSave = canSave && !activeId
  if (views.length === 0 && !showSave) return null

  const startPress = (e: React.TouchEvent, v: SavedView) => {
    const p = press.current
    p.fired = false
    p.x = e.touches[0].clientX
    p.y = e.touches[0].clientY
    if (p.t) clearTimeout(p.t)
    p.t = setTimeout(() => {
      p.t = null
      p.fired = true
      navigator.vibrate?.(15)
      setSheet({ mode: 'menu', view: v })
    }, 450)
  }
  const movePress = (e: React.TouchEvent) => {
    const p = press.current
    if (p.t && (Math.abs(e.touches[0].clientX - p.x) > 10 || Math.abs(e.touches[0].clientY - p.y) > 10)) {
      clearTimeout(p.t)
      p.t = null
    }
  }
  const endPress = () => {
    const p = press.current
    if (p.t) clearTimeout(p.t)
    p.t = null
  }

  function openName(view: SavedView | null) {
    setDraft(view?.name ?? '')
    setSheet({ mode: 'name', view })
  }
  function commitName() {
    if (!sheet || sheet.mode !== 'name') return
    const name = draft.trim()
    if (!name) return
    if (sheet.view) onRename(sheet.view.id, name)
    else onSave(name)
    setSheet(null)
  }

  const chip = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition select-none ${
      active ? 'border-neutral-50 bg-neutral-50 text-neutral-950 font-semibold' : 'border-neutral-700 bg-neutral-900/70 text-neutral-200'
    }`

  return (
    <>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto no-scrollbar px-4" style={{ WebkitTouchCallout: 'none' }}>
        {views.map((v) => {
          const active = v.id === activeId
          return (
            <button
              key={v.id}
              onTouchStart={(e) => startPress(e, v)}
              onTouchMove={movePress}
              onTouchEnd={endPress}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => {
                if (press.current.fired) {
                  press.current.fired = false
                  return
                }
                if (active) onClear()
                else onApply(v)
              }}
              className={chip(active)}
            >
              {v.name}
            </button>
          )
        })}
        {showSave && (
          <button onClick={() => openName(null)} className="shrink-0 whitespace-nowrap rounded-full border border-dashed border-[#00c0fa]/60 px-3.5 py-1.5 text-sm text-[#bdeeff]">
            + {tt('Bu görünümü kaydet')}
          </button>
        )}
      </div>

      {sheet &&
        createPortal(
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-[96] flex flex-col justify-end bg-black/60" onClick={() => setSheet(null)}>
            <div
              className="rounded-t-3xl border-t border-white/10 bg-neutral-900 px-4 pt-3 shadow-2xl"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)', animation: 'argus-toast-in .2s ease-out' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-700" />
              {sheet.mode === 'menu' ? (
                <>
                  <p className="mb-2 px-1 text-[17px] font-bold text-neutral-50">{sheet.view.name}</p>
                  {[
                    {
                      label: tt('Şu anki filtre ve sıralamayla güncelle'),
                      on: () => {
                        onOverwrite(sheet.view.id)
                        setSheet(null)
                      },
                    },
                    { label: tt('Adını değiştir'), on: () => openName(sheet.view) },
                    {
                      label: tt('Sil'),
                      danger: true,
                      on: async () => {
                        const v = sheet.view
                        setSheet(null)
                        if (await confirm({ message: tt('"{0}" görünümü silinsin mi?', v.name), confirmLabel: tt('Sil'), tone: 'danger' })) onDelete(v.id)
                      },
                    },
                  ].map((a) => (
                    <button key={a.label} onClick={() => void a.on()} className={`block w-full rounded-xl px-3 py-3.5 text-left text-[15px] active:bg-neutral-800 ${a.danger ? 'text-red-400' : 'text-neutral-100'}`}>
                      {a.label}
                    </button>
                  ))}
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    commitName()
                  }}
                >
                  <p className="mb-3 px-1 text-[17px] font-bold text-neutral-50">{sheet.view ? tt('Görünümün adı') : tt('Bu görünümü kaydet')}</p>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={40}
                    placeholder={tt('Ör. Yarım kalanlar')}
                    className="h-12 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 text-[15px] text-neutral-100 outline-none focus:border-[#00c0fa]"
                  />
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setSheet(null)} className="h-11 flex-1 rounded-full border border-neutral-700 text-sm text-neutral-200">
                      {tt('Vazgeç')}
                    </button>
                    <button type="submit" disabled={!draft.trim()} className="h-11 flex-1 rounded-full bg-neutral-50 text-sm font-semibold text-neutral-950 disabled:opacity-50">
                      {tt('Kaydet')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
