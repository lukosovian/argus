import { useState } from 'react'
import { makeId, type Board, type HomeSection } from '../types'
import PropertyFilterPicker from './PropertyFilterPicker'
import ToggleSwitch from './ToggleSwitch'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'

// order dizisindeki sıraya göre diz; order'da olmayanlar (eski kayıtlar) kendi aralarındaki
// sıra korunarak sona eklenir.
export function sortByOrder(items: HomeSection[], order: string[]): HomeSection[] {
  return [...items].sort((a, b) => {
    const ai = order.indexOf(a.id)
    const bi = order.indexOf(b.id)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function SectionList({
  title,
  items,
  onMove,
  onDelete,
  onEdit,
}: {
  title: string
  items: HomeSection[]
  onMove: (id: string, dir: -1 | 1) => void
  onDelete: (id: string) => void
  onEdit: (section: HomeSection) => void
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
      <p className="text-sm font-semibold text-neutral-100">{title}</p>
      <p className="text-xs text-neutral-500 mb-3">{items.length ? `${items.length} sayfa · okla sırasını değiştir` : 'Henüz yok'}</p>
      <div className="space-y-1.5">
        {items.map((s, i) => (
          <div
            key={s.id}
            className="flex items-center gap-1.5 text-sm bg-neutral-800/70 border border-neutral-700/70 rounded-xl pl-3 pr-1.5 py-1.5 text-neutral-200 hover:border-neutral-600 transition"
          >
            <span className="h-5 w-5 shrink-0 rounded-md bg-[#00c0fa]/15 text-[#00c0fa] text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
            <button onClick={() => onEdit(s)} className="flex-1 truncate text-left hover:text-neutral-50 transition" title="Düzenle">
              {s.name}
            </button>
            <button
              onClick={() => onEdit(s)}
              className="h-6 w-6 flex items-center justify-center rounded text-neutral-500 hover:text-neutral-50 hover:bg-neutral-700 transition"
              title="Düzenle"
            >
              ✎
            </button>
            <button
              onClick={() => onMove(s.id, -1)}
              disabled={i === 0}
              className="h-6 w-6 flex items-center justify-center rounded text-neutral-500 hover:text-neutral-50 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
              title="Yukarı taşı"
            >
              ↑
            </button>
            <button
              onClick={() => onMove(s.id, 1)}
              disabled={i === items.length - 1}
              className="h-6 w-6 flex items-center justify-center rounded text-neutral-500 hover:text-neutral-50 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
              title="Aşağı taşı"
            >
              ↓
            </button>
            <button onClick={() => onDelete(s.id)} className="h-6 w-6 flex items-center justify-center rounded text-neutral-500 hover:text-rose-400 hover:bg-neutral-700 transition" title="Sil">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HomeSectionEditor({
  board,
  sections,
  navOrder,
  bodyOrder,
  onAdd,
  onUpdate,
  onDelete,
  onMoveNav,
  onMoveBody,
}: {
  board: Board | undefined
  sections: HomeSection[]
  navOrder: string[]
  bodyOrder: string[]
  onAdd: (section: HomeSection) => void
  onUpdate: (section: HomeSection) => void
  onDelete: (id: string) => void
  onMoveNav: (id: string, dir: -1 | 1) => void
  onMoveBody: (id: string, dir: -1 | 1) => void
}) {
  const [formOpen, setFormOpen] = useState(false)
  // Dolu olduğunda form "düzenleme" modunda — hem eklerken hem düzenlerken aynı form/state
  // kullanılıyor, tek fark gönderirken onAdd yerine onUpdate çağrılması.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [optionIds, setOptionIds] = useState<string[]>([])
  const [pinnedToNav, setPinnedToNav] = useState(false)
  const [showInBody, setShowInBody] = useState(false)

  function reset() {
    setFormOpen(false)
    setEditingId(null)
    setName('')
    setPropertyId('')
    setOptionIds([])
    setPinnedToNav(false)
    setShowInBody(false)
  }

  function startAdd() {
    reset()
    setFormOpen(true)
  }

  function startEdit(section: HomeSection) {
    setEditingId(section.id)
    setName(section.name)
    setPropertyId(section.propertyId ?? '')
    setOptionIds(section.optionIds)
    setPinnedToNav(section.pinnedToNav ?? false)
    setShowInBody(section.showInBody !== false)
    setFormOpen(true)
  }

  function handleSubmit() {
    if (!name.trim() || !propertyId || optionIds.length === 0) return
    if (!pinnedToNav && !showInBody) return
    if (editingId) {
      onUpdate({ id: editingId, name: name.trim(), propertyId, optionIds, pinnedToNav, showInBody })
    } else {
      onAdd({ id: makeId(), name: name.trim(), propertyId, optionIds, pinnedToNav, showInBody })
    }
    reset()
  }

  const navSections = sortByOrder(sections.filter((s) => s.pinnedToNav), navOrder)
  const bodySections = sortByOrder(sections.filter((s) => s.showInBody !== false), bodyOrder)

  if (!board) {
    return <p className="text-xs text-neutral-600">Sayfa eklemek için önce yukarıdan bir arşiv seç.</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-neutral-400 max-w-lg">
          Bir türe, duruma ya da kategoriye göre kendi listelerini oluştur: üst menüye ayrı bir sekme olarak ya da ana sayfanın
          gövdesine bir satır olarak eklenir.
        </p>
        {!formOpen && (
          <button onClick={startAdd} style={primaryButtonStyle} className={`shrink-0 text-sm px-3 py-1.5 rounded-lg ${PRIMARY_BUTTON}`}>
            + Sayfa Ekle
          </button>
        )}
      </div>

      {formOpen && (
        <div className="rounded-2xl border border-[#00c0fa]/30 bg-neutral-900/70 p-4 space-y-3 mb-4">
          <p className="text-sm font-semibold text-neutral-100">{editingId ? 'Sayfayı düzenle' : 'Yeni sayfa'}</p>
          <div>
            <label className="block text-[11px] text-neutral-400 mb-1">Sayfanın adı</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ör. Aksiyon Filmleri"
              className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-neutral-100 text-sm outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <label className="block text-[11px] text-neutral-400 mb-1">Neye göre filtrelensin</label>
            <PropertyFilterPicker
              board={board}
              propertyId={propertyId}
              optionIds={optionIds}
              onChange={(pid, opts) => {
                setPropertyId(pid)
                setOptionIds(opts)
              }}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-neutral-300">Üstte, "Ana Sayfa"nın yanına ayrı bir sekme olarak ekle</span>
              <ToggleSwitch checked={pinnedToNav} onChange={setPinnedToNav} label="Üstte sekme olarak ekle" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-neutral-300">Altta, ana sayfa gövdesinde bir satır olarak ekle</span>
              <ToggleSwitch checked={showInBody} onChange={setShowInBody} label="Altta satır olarak ekle" />
            </div>
            {!pinnedToNav && !showInBody && (
              <p className="text-[11px] text-amber-500">En az birini seçmelisin.</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || !propertyId || optionIds.length === 0 || (!pinnedToNav && !showInBody)}
              style={primaryButtonStyle}
              className={`text-xs rounded-md px-3 py-1.5 ${PRIMARY_BUTTON}`}
            >
              {editingId ? 'Kaydet' : 'Ekle'}
            </button>
            <button onClick={reset} className="text-xs text-neutral-400 hover:text-neutral-200 px-3 py-1.5">
              Vazgeç
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SectionList title="Üstte, menüde" items={navSections} onMove={onMoveNav} onDelete={onDelete} onEdit={startEdit} />
        <SectionList title="Altta, ana sayfa gövdesinde" items={bodySections} onMove={onMoveBody} onDelete={onDelete} onEdit={startEdit} />
      </div>
    </div>
  )
}
