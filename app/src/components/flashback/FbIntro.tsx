import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FbMark } from './FbLogo'
import { tt, locale } from '../../lib/i18n'

// F1 "Geri Sarma" açılışı (v1.24): ekran VHS gibi titrer, köşede ◀◀ REW, tarih bugünden (geçmiş yılda 31 Aralık'tan)
// 1 Ocak'a hızla geri sayar, yılın afişleri geriye doğru akar. 1 Ocak'ta durur, logo belirir, sayfa açılır. Ses yok.
// Her yıl ilk açılışta bir kez (bkz. Flashback.tsx), sonra "Baştan sar" ile tekrar.

const RUN_MS = 2600
const HOLD_MS = 1100

export default function FbIntro({ year, posters, onDone }: { year: string; posters: string[]; onDone: () => void }) {
  const Y = Number(year)
  const now = new Date()
  const startDate = now.getFullYear() === Y ? now : new Date(Y, 11, 31)
  const start = startDate.getTime()
  const end = new Date(Y, 0, 1).getTime()
  const [t, setT] = useState(start)
  const [phase, setPhase] = useState<'run' | 'hold' | 'out'>('run')
  const done = useRef(false)
  const finish = () => {
    if (done.current) return
    done.current = true
    setPhase('out')
    setTimeout(onDone, 450)
  }

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onDone()
      return
    }
    const t0 = performance.now()
    let raf = 0
    const tick = (n: number) => {
      const p = Math.min(1, (n - t0) / RUN_MS)
      // yavaş başlar, hızlanır, sona doğru yavaşlar
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
      setT(start - (start - end) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setPhase('hold')
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (phase !== 'hold') return
    const h = setTimeout(finish, HOLD_MS)
    return () => clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])
  useEffect(() => {
    const k = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') && finish()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const d = new Date(t)
  const days = Math.round((start - t) / 864e5)
  const fly = posters.filter(Boolean).slice(0, 14)

  return createPortal(
    <div className="fb-rew" style={{ opacity: phase === 'out' ? 0 : 1 }}>
      <div className="fb-track" />
      {phase === 'run' && (
        <div className="fb-fly absolute inset-0 z-[1]">
          {fly.map((p, i) => (
            <img
              key={i}
              src={p}
              alt=""
              style={{ top: `${6 + ((i * 37) % 80)}%`, width: 70 + (i % 3) * 22, animationDelay: `${(i * 0.17) % 1.5}s`, animationDuration: `${1.1 + (i % 4) * 0.3}s` }}
            />
          ))}
        </div>
      )}
      <div className="absolute top-5 left-6 z-[4] font-mono font-bold text-white text-lg fb-rgb" style={{ fontFamily: "'Space Mono', ui-monospace, Consolas, monospace" }}>
        {phase === 'run' ? '◀◀ REW' : '■ STOP'}
      </div>
      <div className="absolute bottom-5 right-6 z-[4] font-mono font-bold text-neutral-300 text-sm" style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>
        SP {String(Math.floor(days / 60)).padStart(2, '0')}:{String(days % 60).padStart(2, '0')}:{String(Math.floor((t / 1000) % 60)).padStart(2, '0')}
      </div>
      <button onClick={finish} className="absolute bottom-5 left-6 z-[6] text-xs font-semibold rounded-full border border-white/25 text-white/80 hover:text-white hover:border-white/60 px-3 py-1.5">
        {tt('Atla ›')}
      </button>
      <div className="relative z-[4] text-center px-6">
        {phase === 'run' ? (
          <>
            <p className="fb-rgb font-bold text-white tabular-nums" style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 'clamp(34px, 7vw, 76px)' }}>
              {d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
            <p className="text-neutral-400 text-sm mt-2">{tt('yılın başına sarılıyor…')}</p>
          </>
        ) : (
          <div className="flex flex-col items-center" style={{ animation: 'fb-card-in .8s ease-out' }}>
            <FbMark className="h-40 w-40" anim="always" />
            <p className="fb-wordmark mt-4" style={{ fontSize: 'clamp(40px, 7vw, 72px)' }}>
              FLASHBACK {year}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
