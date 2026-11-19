import { useRef, useState } from 'react'
import type { SavedView } from '../../types'
import { useToast } from '../../hooks/useToast'
import { useEscape } from '../../hooks/useEscape'
import AnchoredMenu from '../AnchoredMenu'
import { tt } from '../../lib/i18n'

// Kayıtlı tablo görünümleri (v1.25): filtre + sıralama + gizli sütunlar + gruplama bir adla saklanır, tablonun
// üstünde sekme gibi durur; tıklayınca o görünüm uygulanır. Arşivin kendisinde (board.views) saklandığı için
// her bilgisayarda/tarayıcıda aynı. Küçük "⋯" menüsünden adı değiştirilir, şu anki halle güncellenir ya da silinir.
export default function SavedViews({
  views,
  activeId,
  onApply,
  onSave,
  onRename,
  onOverwrite,
  onDelete,
}: {
  views: SavedView[]
  // Şu anki filtre/sıralama/sütunlar bir görünümle birebir aynıysa onun id'si
  activeId: string | null
  onApply: (view: SavedView) => void
  onSave: (name: string) => void
  onRename: (id: string, name: string) => void
  onOverwrite: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { confirm } = useToast()
  const [naming, setNaming] = useState<{ id: string | null; draft: string } | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const menuAnchor = useRef<HTMLButtonElement | null>(null)
  useEscape(Boolean(naming), () => setNaming(null))

  function commit() {
    if (!naming) return
    const name = naming.draft.trim()
    if (name) {
      if (naming.id) onRename(naming.id, name)
      else onSave(name)
    }
    setNaming(null)
  }

  const nameInput = (
    <input
      autoFocus
      value={naming?.draft ?? ''}
      onChange={(e) => setNaming((n) => (n ? { ...n, draft: e.target.value } : n))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      placeholder={tt('Görünüm adı')}
      className="shrink-0 w-40 bg-neutral-900 border border-[#00c0fa]/60 rounded-full px-3 py-1 text-sm text-neutral-100 outline-none"
    />
  )

  const pill = (active: boolean) =>
    `shrink-0 inline-flex items-center gap-1 text-sm rounded-full border pl-3 pr-1.5 py-1 transition ${
      active ? 'border-[#00c0fa]/50 bg-[#00c0fa]/10 text-neutral-50' : 'border-neutral-800 text-neutral-400 hover:text-neutral-100 hover:border-neutral-600'
    }`

  const menuView = views.find((v) => v.id === menuFor)
  const item = 'block w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-800'

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
      <span className="shrink-0 text-[11px] uppercase tracking-wider text-neutral-500 mr-1">{tt('Görünümler')}</span>
      {views.map((v) =>
        naming?.id === v.id ? (
          <span key={v.id}>{nameInput}</span>
        ) : (
          <span key={v.id} className={pill(activeId === v.id)}>
            <button onClick={() => onApply(v)} className="max-w-[12rem] truncate" title={tt('Bu görünümü uygula')}>
              {v.name}
            </button>
            <button
              onClick={(e) => {
                menuAnchor.current = e.currentTarget
                setMenuFor(menuFor === v.id ? null : v.id)
              }}
              aria-label={tt('Görünüm seçenekleri')}
              className="h-5 w-5 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800"
            >
              ⋯
            </button>
          </span>
        ),
      )}
      {naming && naming.id === null ? (
        nameInput
      ) : (
        <button
          onClick={() => setNaming({ id: null, draft: '' })}
          title={tt('Şu anki filtre, sıralama, gizli sütunlar ve gruplamayı bir adla kaydet')}
          className="shrink-0 text-sm rounded-full border border-dashed border-neutral-700 px-3 py-1 text-neutral-400 hover:text-[#00c0fa] hover:border-[#00c0fa]/60 transition"
        >
          {tt('+ Görünüm kaydet')}
        </button>
      )}
      {menuView && (
        <AnchoredMenu anchorRef={menuAnchor} onClose={() => setMenuFor(null)} width={210}>
          <div className="py-1 rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl overflow-hidden">
            <button
              className={`${item} text-neutral-200`}
              onClick={() => {
                setMenuFor(null)
                setNaming({ id: menuView.id, draft: menuView.name })
              }}
            >
              {tt('Adını değiştir')}
            </button>
            <button
              className={`${item} text-neutral-200`}
              onClick={() => {
                setMenuFor(null)
                onOverwrite(menuView.id)
              }}
            >
              {tt('Şu anki halle güncelle')}
            </button>
            <div className="my-1 border-t border-neutral-800" />
            <button
              className={`${item} text-rose-400 hover:bg-rose-500/10`}
              onClick={async () => {
                setMenuFor(null)
                if (!(await confirm({ message: tt('"{0}" görünümü silinsin mi? Kayıtlara bir şey olmaz.', menuView.name), confirmLabel: tt('Sil'), tone: 'danger' }))) return
                onDelete(menuView.id)
              }}
            >
              {tt('Sil')}
            </button>
          </div>
        </AnchoredMenu>
      )}
    </div>
  )
}
