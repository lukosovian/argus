import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Profile } from '../types'
import { tt } from '../lib/i18n'

// PIN kilidi (v1.23.4): kilitli profile geçerken 4 haneli PIN sorulur (bkz. useProfiles). Klavyeden de yazılabilir.
export default function PinPad({ profile, onOk, onCancel }: { profile: Profile; onOk: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  function press(k: string) {
    if (k === '⌫') return setPin((p) => p.slice(0, -1))
    setPin((p) => (p.length < 4 ? p + k : p))
  }
  useEffect(() => {
    if (pin.length !== 4) return
    const t = setTimeout(() => {
      if (pin === profile.pin) onOk()
      else {
        setErr(true)
        setTimeout(() => setErr(false), 450)
      }
      setPin('')
    }, 180)
    return () => clearTimeout(t)
  }, [pin])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('⌫')
      else if (e.key === 'Escape') onCancel()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center" onClick={onCancel}>
      <div className="flex flex-col items-center" onClick={(e) => e.stopPropagation()} style={{ animation: 'argus-toast-in .25s ease-out' }}>
        <div className="relative h-24 w-24 rounded-2xl overflow-hidden bg-neutral-800">
          {profile.photo ? <img src={profile.photo} alt="" className="h-full w-full object-cover" /> : <span className="h-full w-full flex items-center justify-center text-3xl text-neutral-400">{profile.username.slice(0, 1).toUpperCase()}</span>}
        </div>
        <p className="mt-3 text-lg font-semibold text-neutral-50">{profile.username}</p>
        <p className="text-sm text-neutral-400">🔒 {tt('PIN gir')}</p>
        <div className="flex gap-3 mt-4" style={err ? { animation: 'argus-salla .4s' } : undefined}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-4 w-4 rounded-full border-2 transition ${i < pin.length ? 'bg-[#00c0fa] border-[#00c0fa] shadow-[0_0_10px_#00c0fa]' : err ? 'border-rose-500' : 'border-neutral-600'}`} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
            k ? (
              <button key={i} onClick={() => press(k)} className="h-14 w-16 rounded-xl border border-neutral-700 bg-neutral-900 text-xl font-bold text-neutral-100 hover:border-neutral-500 active:bg-neutral-800">
                {k}
              </button>
            ) : (
              <span key={i} />
            ),
          )}
        </div>
        <button onClick={onCancel} className="mt-5 text-sm text-neutral-500 hover:text-neutral-300">
          {tt('Vazgeç')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
