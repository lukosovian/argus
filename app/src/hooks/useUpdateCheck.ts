import { useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useToast } from './useToast'

// Uygulama açılışında bir kere, sonra periyodik olarak (uygulama açık kalsa bile) ARGUS
// klasörünün git deposunda yeni bir sürüm var mı diye sorar (bkz. server/index.js'teki
// /api/update-check) — kullanıcı "güncelleme de her açılışta baksın ve belli periyotlarla
// güncellesin uygulama açıksa bile" dedi. Bulunca sadece BİR KERE (oturum başına) bildirim
// gösterir — gerçek güncelleme kod çalışırken uygulanmıyor (bu ortasında bir şey yapan
// kullanıcıyı keserdi), bir sonraki ARGUS.bat açılışında kendiliğinden gelir.
const CHECK_INTERVAL_MS = 30 * 60 * 1000

export function useUpdateCheck() {
  const { notify } = useToast()
  const notifiedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const result = await api.checkUpdate()
        if (!cancelled && result.updateAvailable && !notifiedRef.current) {
          notifiedRef.current = true
          notify('Yeni bir ARGUS güncellemesi hazır — uygulamayı kapatıp yeniden açtığında otomatik gelir.', 'info')
        }
      } catch {
        // Sessizce geç — internet yok, git kurulu değil ya da depo değil, hiçbiri kullanıcıya
        // gösterilecek bir hata değil.
      }
    }

    check()
    const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [notify])
}
