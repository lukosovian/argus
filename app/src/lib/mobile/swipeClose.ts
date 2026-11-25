// ARGUS Android › tam ekran pencereyi (detay penceresi) aşağı sürükleyerek kapatma (v1.26). Kullanıcı tek elle üstteki
// kapat düğmesine uzanmak zorunda kalmasın: pencerenin en üstündeyken aşağı çekince pencere parmakla birlikte küçülerek
// iner; yeterince çekilince kapanır, az çekilince yerine döner (Netflix uygulamasındaki gibi).
//
// scroller: kaydırılan dış kap (role="dialog"); içindeki ilk öğe hareket eden pencere. PC'de hiçbir şey yapmaz.
import { useEffect, useRef, type RefObject } from 'react'
import { MOBILE } from './ui'

const CLOSE_PX = 140

export function useSwipeDownClose(scroller: RefObject<HTMLElement | null>, onClose: () => void, enabled = true) {
  const cb = useRef(onClose)
  cb.current = onClose

  useEffect(() => {
    const el = scroller.current
    if (!MOBILE || !enabled || !el) return
    let startX = 0
    let startY = 0
    let t0 = 0
    let dy = 0
    let tracking = false
    let dragging = false
    const panel = () => el.firstElementChild as HTMLElement | null

    const paint = (d: number) => {
      const p = panel()
      if (!p) return
      const k = Math.min(d / window.innerHeight, 1)
      p.style.transition = 'none'
      p.style.transform = `translateY(${d}px) scale(${1 - k * 0.12})`
      p.style.transformOrigin = '50% 0'
      p.style.borderRadius = `${Math.min(d / 5, 24)}px`
      p.style.overflow = 'hidden'
      el.style.backgroundColor = `rgba(0,0,0,${(0.85 * (1 - Math.min(d / 500, 1) * 0.75)).toFixed(3)})`
    }
    const reset = () => {
      const p = panel()
      if (p) {
        p.style.transition = 'transform .25s cubic-bezier(.2,.8,.3,1), border-radius .25s'
        p.style.transform = ''
        p.style.borderRadius = ''
        const done = () => {
          p.style.transition = ''
          p.style.overflow = ''
          p.style.transformOrigin = ''
          p.removeEventListener('transitionend', done)
        }
        p.addEventListener('transitionend', done)
      }
      el.style.backgroundColor = ''
    }

    const onStart = (e: TouchEvent) => {
      tracking = false
      dragging = false
      if (e.touches.length !== 1 || el.scrollTop > 0) return
      const target = e.target as HTMLElement | null
      // Pencerenin içinde açılan başka bir pencere (paylaş kartı, bilet formu…) bu hareketi almaz
      if (target?.closest('[role="dialog"]') !== el) return
      // İçeride yukarı kaydırılmış bir alan varsa (uzun liste) önce o yukarı kayar
      for (let n: HTMLElement | null = target; n && n !== el; n = n.parentElement) {
        if (n.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return
        if (n.matches('input, textarea, select, [contenteditable="true"]')) return
      }
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      t0 = Date.now()
      dy = 0
      tracking = true
    }
    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const x = e.touches[0].clientX - startX
      const y = e.touches[0].clientY - startY
      if (!dragging) {
        if (Math.abs(x) < 8 && Math.abs(y) < 8) return
        // Yukarı ya da yana hareket: normal kaydırma (afiş şeritleri vb.)
        if (y <= 0 || Math.abs(x) > Math.abs(y) || el.scrollTop > 0) {
          tracking = false
          return
        }
        dragging = true
      }
      e.preventDefault()
      dy = Math.max(0, y)
      paint(dy)
    }
    const onEnd = () => {
      if (!tracking) return
      tracking = false
      if (!dragging) return
      dragging = false
      const speed = dy / Math.max(1, Date.now() - t0)
      if (dy > CLOSE_PX || (dy > 60 && speed > 0.7)) {
        const p = panel()
        if (p) {
          p.style.transition = 'transform .2s ease-in, opacity .2s ease-in'
          p.style.transform = `translateY(${window.innerHeight}px) scale(.85)`
          p.style.opacity = '0'
        }
        el.style.transition = 'background-color .2s'
        el.style.backgroundColor = 'rgba(0,0,0,0)'
        setTimeout(() => {
          cb.current()
          // Kapanmadıysa (ör. pencere kapanmayı reddetti) yerine dönsün
          setTimeout(() => {
            if (!el.isConnected) return
            const p2 = panel()
            if (p2) p2.style.opacity = ''
            el.style.transition = ''
            reset()
          }, 400)
        }, 170)
      } else reset()
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [scroller, enabled])
}
