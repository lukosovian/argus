import { useEffect, useRef } from 'react'

// Esc ile kapanma — yeni kullanıcı denemesinde birçok pencere (TMDB alanları, Bildirimler, Sırala, tablo
// rehberi, detay penceresi…) Esc'e tepki vermiyordu. Üst üste açık pencerelerde sadece EN SON açılan kapanır
// (yığın); açılır listeler (AnchoredMenu) Esc'i kendileri işleyip işaretliyorsa (preventDefault) hiçbiri kapanmaz.
const stack: number[] = []
let nextId = 1
let listening = false
const handlers = new Map<number, () => void>()

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || !stack.length) return
  const top = stack[stack.length - 1]
  e.preventDefault()
  handlers.get(top)?.()
}

export function useEscape(active: boolean, onEscape: () => void) {
  const fn = useRef(onEscape)
  fn.current = onEscape
  useEffect(() => {
    if (!active) return
    const id = nextId++
    handlers.set(id, () => fn.current())
    stack.push(id)
    if (!listening) {
      window.addEventListener('keydown', onKey)
      listening = true
    }
    return () => {
      handlers.delete(id)
      const i = stack.indexOf(id)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active])
}
