import { useEffect, useState } from 'react'
import { useProfiles } from '../hooks/useProfiles'
import { useToast } from '../hooks/useToast'
import { tt } from '../lib/i18n'

// Ekstralar › Oyuncu ve yönetmen takibi (v1.23.4): kişi sayfasında "Takip et". Sunucu günde bir, takip edilenlerin yeni
// duyurulan ya da vizyona giren filmlerini/dizilerini kontrol edip zile bildirim düşer (bkz. server checkFollows).
export default function FollowButton({ personId, name, role }: { personId: number; name: string; role: 'acting' | 'directing' }) {
  const { activeProfileId } = useProfiles()
  const { notify } = useToast()
  const [on, setOn] = useState<boolean | null>(null)
  const url = `/api/profiles/${activeProfileId}/takip`
  useEffect(() => {
    fetch(url)
      .then((r) => r.json())
      .then((d: Record<string, unknown>) => setOn(Boolean(d[String(personId)])))
      .catch(() => setOn(false))
  }, [personId])
  async function toggle() {
    const next = !on
    setOn(next)
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: personId, name, role, on: next }) })
      if (next) notify(tt('{0} takipte: yeni filmi duyurulunca haber vereceğim.', name), 'success')
    } catch {
      setOn(!next)
      notify(tt('Kaydedilemedi.'), 'danger')
    }
  }
  if (on === null) return null
  return (
    <button
      onClick={toggle}
      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${on ? 'border-transparent text-white' : 'border-neutral-600 text-neutral-200 hover:border-neutral-400'}`}
      style={on ? { background: 'linear-gradient(90deg,#7c3aed,#c084fc)' } : undefined}
    >
      {on ? tt('✓ Takipte') : tt('+ Takip et')}
    </button>
  )
}
