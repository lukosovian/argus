import { useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useToast } from './useToast'

// Uygulama açılışında bir kere, sonra periyodik olarak (uygulama açık kalsa bile) ARGUS
// klasörünün git deposunda yeni bir sürüm var mı diye sorar (bkz. server/index.js'teki
// /api/update-check) — kullanıcı "güncelleme de her açılışta baksın ve belli periyotlarla
// güncellesin uygulama açıksa bile" dedi. Bulunca sadece BİR KERE (oturum başına) sorar —
// "Şimdi Güncelle" ile kullanıcı beklemeden, uygulamayı kendi kapatıp açmadan güncelleyebilir
// (bkz. server/index.js'teki /api/apply-update) — kullanıcı "onun yanına şimdi güncelle gibi
// bi şey eklenemez mi" dedi. Reddederse (ya da hiç cevap vermezse) bir sonraki ARGUS.bat
// açılışında zaten kendiliğinden gelir, eski davranış hâlâ geçerli.
const CHECK_INTERVAL_MS = 30 * 60 * 1000
// Sunucu güncellemeyi çekip kendini kapatıp yerine yenisini başlatana kadar geçen süre — bu
// kadar bekleyip sayfayı kendiliğinden yeniliyoruz. npm install gerekmiyorsa genelde çok daha
// hızlı biter ama bağımlılık eklenmişse birkaç saniye daha sürebilir, o yüzden cömert tutuldu.
const RELOAD_DELAY_MS = 7000

export function useUpdateCheck() {
  const { notify, confirm } = useToast()
  const notifiedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const result = await api.checkUpdate()
        if (cancelled || !result.updateAvailable || notifiedRef.current) return
        notifiedRef.current = true
        const wantsUpdate = await confirm({
          message: 'Yeni bir ARGUS güncellemesi hazır. Şimdi güncellensin mi? (Az sonra kısa bir an bağlantı kesilip sayfa kendiliğinden yenilenecek.)',
          confirmLabel: 'Şimdi Güncelle',
          cancelLabel: 'Sonra',
        })
        if (cancelled || !wantsUpdate) return
        try {
          await api.applyUpdate()
        } catch {
          // Sunucu güncellemeyi çekip kendini kapatırken bağlantının kopması BEKLENEN bir
          // durum — asıl hata mı yoksa bu mu olduğunu ayırt edemiyoruz, o yüzden yine de
          // devam edip sayfayı yeniliyoruz (en kötü ihtimalle kullanıcı elle bir daha yeniler).
        }
        notify('Güncelleniyor, birazdan sayfa kendiliğinden yenilenecek...', 'info')
        setTimeout(() => {
          if (!cancelled) window.location.reload()
        }, RELOAD_DELAY_MS)
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
