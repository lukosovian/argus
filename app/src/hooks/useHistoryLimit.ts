import { useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useToast } from './useToast'

// Arşiv geçmişi boyut sınırını (varsayılan 5 GB) aşınca sorar: "alanı artırayım mı, yoksa en
// eskilerden başlayarak sileyim mi?" — kullanıcı süre değil boyut sınırı istedi. Açılışta ve yarım
// saatte bir bakılır; cevap verilmezse geçmiş kaydedilmeye devam eder, bir sonraki kontrolde yine sorulur.
const CHECK_MS = 30 * 60 * 1000
const STEP = 5 * 1024 ** 3

export function useHistoryLimit() {
  const { notify, confirm } = useToast()
  const asking = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (asking.current) return
      try {
        const s = await api.getHistoryStatus()
        if (cancelled || !s.over) return
        asking.current = true
        const gb = (b: number) => `${Math.round(b / 1024 ** 3)} GB`
        // Soru kartları cevapsız kalınca kendiliğinden "hayır" sayılıyor — bu yüzden silme ayrı bir
        // soruda ve ancak açıkça "Eskileri sil" denirse yapılıyor; cevap verilmezse hiçbir şey silinmez.
        const more = await confirm({
          message: `Arşiv geçmişi ${gb(s.limitBytes)} sınırını aştı. Kaydetmeye devam etmek için alanı ${gb(s.limitBytes + STEP)} yapayım mı?`,
          confirmLabel: `Alanı ${gb(s.limitBytes + STEP)} yap`,
          cancelLabel: 'Hayır',
          tone: 'info',
        })
        if (more) {
          await api.setHistoryLimit(s.limitBytes + STEP)
          notify(`Arşiv geçmişi için alan ${gb(s.limitBytes + STEP)} yapıldı.`)
          return
        }
        const trim = await confirm({
          message: 'O zaman en eski geçmiş kayıtlarından başlayarak silip yer açayım mı? (Arşivinin kendisine dokunulmaz, sadece eski geçmiş silinir.)',
          confirmLabel: 'Eskileri sil',
          cancelLabel: 'Şimdilik bırak',
        })
        if (trim) {
          const r = await api.trimHistory()
          notify(`Geçmişin en eski ${r.removed} parçası silindi, yer açıldı.`)
        }
      } catch {
        // sunucu eski sürümdeyse ya da ulaşılamıyorsa sessizce geç
      } finally {
        asking.current = false
      }
    }
    check()
    const id = setInterval(check, CHECK_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [notify, confirm])
}
