// Tablo kısayolları için ortak kontroller (bkz. BoardTable klavye gezintisi, BoardView "/" ve "N").

// Bir yazı kutusunun içindeyken kısayollar çalışmasın.
export function isTypingTarget(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

// Açık bir pencere (modal) var mı — Navbar'daki kısayollarla aynı ölçüt: aria-modal/dialog işaretliler ya da
// z-index'i 50 ve üstü olan tam ekran "fixed inset-0" katmanlar.
export function isModalOpen(): boolean {
  if (document.querySelector('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')) return true
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0'))) {
    if (!el.getClientRects().length) continue
    const cs = getComputedStyle(el)
    if (cs.pointerEvents === 'none' || cs.visibility === 'hidden') continue
    const z = Number(cs.zIndex)
    if (Number.isFinite(z) && z >= 50) return true
  }
  return false
}

// Araç çubuğu açılır menüleri (Filtre/Sırala…) "fixed inset-0 z-30" bir arka katman açıyor — onlar açıkken de
// tablo kısayolları susar.
export function isPopoverOpen(): boolean {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0'))) {
    if (!el.getClientRects().length) continue
    const cs = getComputedStyle(el)
    if (cs.pointerEvents === 'none' || cs.visibility === 'hidden') continue
    return true
  }
  return false
}
