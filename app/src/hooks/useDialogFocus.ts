import { useEffect, type RefObject } from 'react'

// Pencereler (modal/overlay) için klavye ve ekran okuyucu desteği:
//  - açılınca odak pencerenin içine taşınır (içeride autoFocus'lu bir alan zaten odaktaysa ona dokunulmaz),
//  - Tab / Shift+Tab pencerenin içinde döner (arkadaki sayfaya kaçmaz),
//  - kapanınca odak, pencere açılmadan önce odakta olan öğeye geri döner.
// Üst üste açık pencerelerde Tab'ı yalnızca EN SON açılan yakalar (useEscape'teki yığın mantığı gibi).
// Esc ile kapanma burada değil — useEscape'te kalıyor.
const stack: HTMLElement[] = []
let listening = false

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.tabIndex < 0 || el.closest('[inert]')) return false
    // Görünmeyenleri (display:none, gizli sekme vb.) atla
    return el.getClientRects().length > 0
  })
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Tab' || e.defaultPrevented || !stack.length) return
  const root = stack[stack.length - 1]
  const active = document.activeElement as HTMLElement | null
  // Pencereden açılan, body'e taşınmış açılır listeler (AnchoredMenu) kendi başına kalsın
  if (active && !root.contains(active) && active.closest('[data-popover]')) return
  const list = focusables(root)
  if (!list.length) {
    e.preventDefault()
    root.focus({ preventScroll: true })
    return
  }
  const first = list[0]
  const last = list[list.length - 1]
  const inside = !!active && root.contains(active)
  if (e.shiftKey) {
    if (!inside || active === first || active === root) {
      e.preventDefault()
      last.focus()
    }
  } else if (!inside || active === last) {
    e.preventDefault()
    first.focus()
  }
}

export function useDialogFocus(ref: RefObject<HTMLElement | null>, open = true) {
  useEffect(() => {
    if (!open) return
    const root = ref.current
    if (!root) return
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Kabın kendisi odak alabilsin (ekran okuyucu açılınca pencerenin adını okusun) ama Tab sırasına girmesin
    if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
    root.style.outline = 'none'
    stack.push(root)
    if (!listening) {
      document.addEventListener('keydown', onKey)
      listening = true
    }
    // Bir kare bekle: içerideki autoFocus'lu alanlar önce odağı alsın
    const raf = requestAnimationFrame(() => {
      if (!root.isConnected || root.contains(document.activeElement)) return
      const pick = root.querySelector<HTMLElement>('[data-autofocus]')
      ;(pick ?? root).focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(raf)
      const i = stack.lastIndexOf(root)
      if (i >= 0) stack.splice(i, 1)
      // Odak hâlâ pencerenin içindeyse (ya da kaybolduysa) eski yerine dön; kullanıcı başka yere geçtiyse dokunma
      const now = document.activeElement
      const lost = !now || now === document.body || root.contains(now) || !now.isConnected
      if (lost && prev && prev.isConnected && prev !== document.body) prev.focus({ preventScroll: true })
    }
  }, [open, ref])
}
