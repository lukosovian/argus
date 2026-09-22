import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

// Tabloların içindeki popover'lar (sütun ekle/düzenle menüsü) eskiden `absolute`
// konumlanıp tablonun sarmalayıcı `overflow-x-auto` kutusunun içinde kalıyordu —
// bu kutu dikeyde de scroll alanına dönüştüğü için popover tablonun alt sınırında
// kesiliyordu. Bunun yerine document.body'e portal ile taşıyıp `fixed` konumluyoruz.
export default function AnchoredMenu({
  anchorRef,
  align = 'left',
  width = 224,
  onClose,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>
  align?: 'left' | 'right'
  width?: number
  onClose: () => void
  children: ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    function updatePosition() {
      const rect = anchorRef?.current?.getBoundingClientRect()
      if (!rect) return
      const left = align === 'right' ? rect.right - width : rect.left
      const clampedLeft = Math.min(Math.max(8, left), window.innerWidth - width - 8)
      // If we already know the panel's real height (from a previous measurement pass),
      // flip it above the anchor when there isn't enough room below the viewport —
      // otherwise it would render partly or fully off-screen for anchors near the bottom.
      const panelHeight = panelRef.current?.offsetHeight ?? 0
      const spaceBelow = window.innerHeight - rect.bottom
      const openUpward = panelHeight > 0 && spaceBelow < panelHeight + 8 && rect.top > panelHeight + 8
      const top = openUpward ? rect.top - panelHeight - 4 : rect.bottom + 4
      setPos({ top: Math.max(8, top), left: clampedLeft })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [anchorRef, align, width])

  // First pass positions optimistically below the anchor (before the panel has a
  // measurable height). Once it's rendered, correct upward if it turned out to overflow.
  useLayoutEffect(() => {
    if (!pos || !panelRef.current || !anchorRef?.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const panelHeight = panelRef.current.offsetHeight
    const spaceBelow = window.innerHeight - rect.bottom
    if (spaceBelow < panelHeight + 8 && rect.top > panelHeight + 8) {
      const correctedTop = Math.max(8, rect.top - panelHeight - 4)
      setPos((p) => (p && Math.abs(p.top - correctedTop) > 1 ? { ...p, top: correctedTop } : p))
    }
  }, [pos, anchorRef])

  useLayoutEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef?.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [anchorRef, onClose])

  if (!pos) return null

  return createPortal(
    <div ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width, zIndex: 50 }}>
      {children}
    </div>,
    document.body,
  )
}
