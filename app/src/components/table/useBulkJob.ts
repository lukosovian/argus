import { useCallback, useEffect, useRef, useState } from 'react'
import { bulkJobApi, type BulkJob } from '../../lib/api'
import { notifyDataChanged } from '../../lib/dataEvents'
import { beginBusy } from '../../lib/busy'
import { useProfiles } from '../../hooks/useProfiles'

// Sunucudaki Genel Güncelleme işini izler (bkz. lib/api.ts › bulkJobApi). Sayfa açılınca bir kez sorulur; iş
// sürüyorsa ~2 sn'de bir yeniden sorulur — pencere kapatılıp açılsa ya da sayfadan çıkıp gelinse de ilerleme
// görünür, çünkü iş sunucuda sürmeye devam ediyor. Her ~5 kayıtta ve bitince açık ekranlar yenilensin diye haber verir.
const POLL_MS = 2000
const NOTIFY_EVERY = 5

export function useBulkJob(onFinished?: (job: BulkJob) => void) {
  const { activeProfileId } = useProfiles()
  const [job, setJob] = useState<BulkJob | null>(null)
  // Yeni iş başlatılınca / durdurulunca hemen yeniden sorulsun diye
  const [kick, setKick] = useState(0)
  const seen = useRef<{ id: string; done: number; state: BulkJob['state'] } | null>(null)
  const finishedRef = useRef(onFinished)
  useEffect(() => {
    finishedRef.current = onFinished
  }, [onFinished])

  useEffect(() => {
    if (!activeProfileId) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let endBusy: (() => void) | null = null
    async function tick() {
      let next: BulkJob | null = null
      try {
        next = (await bulkJobApi.get()).job
      } catch {
        // sunucuya ulaşılamadı — bir süre sonra yine denensin (iş sürüyor olabilir)
        if (alive) timer = setTimeout(tick, POLL_MS * 3)
        return
      }
      if (!alive) return
      setJob(next)
      const prev = seen.current
      if (next && prev?.id === next.id) {
        if (next.done - prev.done >= NOTIFY_EVERY) {
          notifyDataChanged(next.boardId)
          prev.done = next.done
        }
        // Bitiş: bu oturumda "sürüyor" görülen iş bitti/durduruldu
        if (prev.state === 'running' && next.state !== 'running') {
          notifyDataChanged(next.boardId)
          finishedRef.current?.(next)
        }
        prev.state = next.state
      } else seen.current = next ? { id: next.id, done: next.done, state: next.state } : null
      // Sürerken "Şimdi Güncelle" sorusu bekletilsin (bkz. lib/busy.ts)
      if (next?.state === 'running') {
        if (!endBusy) endBusy = beginBusy()
        timer = setTimeout(tick, POLL_MS)
      } else if (endBusy) {
        endBusy()
        endBusy = null
      }
    }
    tick()
    return () => {
      alive = false
      clearTimeout(timer)
      endBusy?.()
    }
  }, [activeProfileId, kick])

  const refresh = useCallback(() => setKick((k) => k + 1), [])
  // Yeni başlatılan iş: çok kısa sürse de (ilk sorudan önce bitse de) bitişi yakalansın diye "sürüyor" diye işaretlenir.
  const track = useCallback((started: BulkJob) => {
    seen.current = { id: started.id, done: started.done, state: 'running' }
    setJob(started)
    setKick((k) => k + 1)
  }, [])
  return { job, refresh, track }
}
