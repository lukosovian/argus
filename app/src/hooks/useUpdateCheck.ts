import { useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useToast } from './useToast'
import { isBusy } from '../lib/busy'
import { tt } from '../lib/i18n'

// Uygulama açılışında bir kere, sonra periyodik olarak (uygulama açık kalsa bile) ARGUS
// klasörünün git deposunda yeni bir sürüm var mı diye sorar (bkz. server/index.js'teki
// /api/update-check) — kullanıcı "güncelleme de her açılışta baksın ve belli periyotlarla
// güncellesin uygulama açıksa bile" dedi. Bulunca sadece BİR KERE (oturum başına) sorar —
// "Şimdi Güncelle" ile kullanıcı beklemeden, uygulamayı kendi kapatıp açmadan güncelleyebilir
// (bkz. server/index.js'teki /api/apply-update) — kullanıcı "onun yanına şimdi güncelle gibi
// bi şey eklenemez mi" dedi. Reddederse (ya da hiç cevap vermezse) bir sonraki ARGUS.bat
// açılışında zaten kendiliğinden gelir, eski davranış hâlâ geçerli.
// Kullanıcı "arkadaş uygulamayı kullanırken ona güncelle bildirimi gitmedi" dedi: kontrol 30 dakikada
// birdi ve soru 12 sn'de kendiliğinden kapanıp oturum boyunca bir daha sorulmuyordu (ekrana bakmıyorsa
// ya da ARGUS tepsideyse hiç görmüyordu). Artık 5 dakikada bir bakılıyor, soru cevaplanana kadar
// ekranda kalıyor; "Sonra" denirse 2 saat sonra yine soruluyor.
const CHECK_INTERVAL_MS = 5 * 60 * 1000
const ASK_AGAIN_MS = 2 * 60 * 60 * 1000
const BUSY_RETRY_MS = 30 * 1000
// Güncellemeden sonra sayfayı ne zaman yenileyeceğimiz: eskiden sabit 7 saniye bekleniyordu —
// yeni ARGUS o sürede ayağa kalkmadıysa (ör. yeni bir paket kurulması gerektiyse) sayfa
// "bağlanılamıyor" hatasıyla açılıyordu. Artık eski sunucunun kapanması için kısa bir süre
// bekleyip, sonra yenisi gerçekten cevap verene kadar sorup ancak o zaman yeniliyoruz.
const OLD_SERVER_GRACE_MS = 3500
const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 120_000

async function waitForServer(): Promise<void> {
  await new Promise((r) => setTimeout(r, OLD_SERVER_GRACE_MS))
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch('/api/profiles', { cache: 'no-store' })
      if (res.ok) return
    } catch {
      // henüz ayakta değil
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

export function useUpdateCheck() {
  const { notify, confirm } = useToast()
  // Soru ekrandayken yenisi açılmasın; "Sonra" denince bir süre sorulmasın.
  const askingRef = useRef(false)
  const snoozedUntilRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        if (askingRef.current || Date.now() < snoozedUntilRef.current) return
        const result = await api.checkUpdate()
        if (cancelled || !result.updateAvailable || askingRef.current) return
        // Genel Güncelleme gibi uzun bir iş sürüyorsa şimdi sorma — iş bitince (aşağıdaki kısa
        // aralıklı kontrolde) sorulur.
        if (isBusy()) {
          setTimeout(check, BUSY_RETRY_MS)
          return
        }
        askingRef.current = true
        const wantsUpdate = await confirm({
          message: tt('Yeni bir ARGUS güncellemesi hazır. Şimdi güncellensin mi? (Az sonra kısa bir an bağlantı kesilip sayfa kendiliğinden yenilenecek.)'),
          confirmLabel: tt('Şimdi Güncelle'),
          cancelLabel: tt('Sonra'),
          tone: 'info',
          persist: true,
        })
        askingRef.current = false
        if (!wantsUpdate) snoozedUntilRef.current = Date.now() + ASK_AGAIN_MS
        if (cancelled || !wantsUpdate) return
        try {
          await api.applyUpdate()
        } catch {
          // Sunucu güncellemeyi çekip kendini kapatırken bağlantının kopması BEKLENEN bir
          // durum — asıl hata mı yoksa bu mu olduğunu ayırt edemiyoruz, o yüzden yine de
          // devam edip sayfayı yeniliyoruz (en kötü ihtimalle kullanıcı elle bir daha yeniler).
        }
        notify(tt('Güncelleniyor, birazdan sayfa kendiliğinden yenilenecek...'), 'info')
        await waitForServer()
        window.location.reload()
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
  }, [notify, confirm])
}
