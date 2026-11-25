import { useEffect, useRef } from 'react'
import { markBiletWatched, useBiletler } from '../../lib/bilet'
import { useProfiles } from '../../hooks/useProfiles'
import { useToast } from '../../hooks/useToast'
import { tt } from '../../lib/i18n'
import { seansOver, seansTime } from './seans'

// Yaklaşan seans (Y26): önceden eklenen biletin seansı bitince (seans + ~2,5 saat) yapım izlendi işaretlenir ve o gün
// izleme tarihlerine yazılır; puanı boşsa sunucu puan sorusunu açtırır (RatePrompt). Her bilet bir kez ele alınır
// (bu cihazda hatırlanır); sadece seansından ÖNCE eklenmiş biletler (geçmiş tarihli bilet zaten kaydederken işlenir).
export default function SeansWatcher() {
  const { activeProfileId } = useProfiles()
  const { data } = useBiletler()
  const { notify } = useToast()
  const busy = useRef(false)
  useEffect(() => {
    if (!activeProfileId || !data) return
    const key = `argus_seans_islendi_${activeProfileId}`
    const check = async () => {
      if (busy.current) return
      busy.current = true
      try {
        let done: string[] = []
        try {
          done = JSON.parse(localStorage.getItem(key) ?? '[]')
        } catch {
          done = []
        }
        const now = new Date()
        for (const [id, b] of Object.entries(data.items)) {
          if (!b.rowId || done.includes(id) || !seansOver(b, now)) continue
          const at = seansTime(b)
          const created = Number((b as { createdAt?: number }).createdAt) || 0
          if (!at || !created || created >= at.getTime()) {
            done.push(id)
            continue
          }
          try {
            const w = await markBiletWatched(b)
            if (w) notify(tt('{0} seansın bitti, izlendi olarak işaretlendi. Nasıldı?', b.title), 'success')
            done.push(id)
          } catch {
            /* PC'ye ulaşılamadı: sonra yeniden denenir */
          }
        }
        try {
          localStorage.setItem(key, JSON.stringify(done.slice(-300)))
        } catch {
          /* önemsiz */
        }
      } finally {
        busy.current = false
      }
    }
    void check()
    const t = window.setInterval(() => void check(), 60000)
    return () => window.clearInterval(t)
  }, [activeProfileId, data, notify])
  return null
}
