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
  // Profil değişince önceki profilin sayısıyla kıyaslanmasın (yanlış "yeni paket" bildirimi çıkıyordu)
  const prev = useRef<{ pid: string; seen: number | null } | null>(null)
  // Profil değişince eski profilin verisi yenisi gelene kadar duruyor: o arada sayılmasın
  const stale = useRef<{ pid: string; data: unknown } | null>(null)
  const total = stats ? stats.earned.bronz + stats.earned.gumus + stats.earned.altin : 0
  useEffect(() => {
    if (!ready || !data?.startedAt || !stats || !activeProfileId) return
    if (prev.current && prev.current.pid !== activeProfileId && stale.current?.pid !== activeProfileId) stale.current = { pid: activeProfileId, data }
    if (stale.current?.pid === activeProfileId && stale.current.data === data) return
    const key = `argus_odul_gorulen_${activeProfileId}`
    let seen = prev.current?.pid === activeProfileId ? prev.current.seen : null
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
    prev.current = { pid: activeProfileId, seen }
  }, [ready, total, stats, data, notify, activeProfileId])
  return null
}
