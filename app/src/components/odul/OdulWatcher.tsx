import { useEffect, useRef } from 'react'
import { useOduller } from '../../lib/oduller'
import { useToast } from '../../hooks/useToast'
import { useProfiles } from '../../hooks/useProfiles'
import { tt } from '../../lib/i18n'

// Yeni paket kazanınca küçük bir bildirim (v1.24). Bu cihazda görülen en yüksek "kazanılan" sayısı saklanır; ARGUS
// kapalıyken (ör. telefonda izlerken) kazanılanlar da açılışta haber verilir. Makarayla alınan ya da açılan paket
// bildirim çıkarmaz (sadece izlemeden gelen sayıya bakılır).
export default function OdulWatcher() {
  const { stats, ready, data } = useOduller(true)
  const { activeProfileId } = useProfiles()
  const { notify } = useToast()
  const prev = useRef<number | null>(null)
  const total = stats ? stats.earned.bronz + stats.earned.gumus + stats.earned.altin : 0
  useEffect(() => {
    if (!ready || !data?.startedAt || !stats || !activeProfileId) return
    const key = `argus_odul_gorulen_${activeProfileId}`
    let seen = prev.current
    if (seen === null) {
      try {
        const v = localStorage.getItem(key)
        seen = v === null ? null : Number(v)
      } catch {
        seen = null
      }
    }
    if (seen !== null && total > seen) notify(tt("Yeni kart paketi kazandın! Koleksiyon › Ödüller'de seni bekliyor."), 'success')
    if (seen === null || total > seen) {
      try {
        localStorage.setItem(key, String(total))
      } catch {
        /* önemsiz */
      }
      seen = total
    }
    prev.current = seen
  }, [ready, total, stats, data?.startedAt, notify, activeProfileId])
  return null
}
