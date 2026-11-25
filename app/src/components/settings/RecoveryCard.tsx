import { useCallback, useEffect, useState } from 'react'
import { careApi, type RecoveryItem } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'
import { locale, tt } from '../../lib/i18n'
import { notifyDataChanged } from '../../lib/dataEvents'

// Bozuk dosyayı kurtarma kartı (v1.26, G1; bkz. server/recover.js). Bir veri dosyası birkaç dakika boyunca okunamazsa
// ARGUS o dosyanın en son sağlam halini (arşiv geçmişindeki günlük kopya ya da son yedek) bulur; burada "… haline geri
// getirilebilir — getireyim mi?" diye sorulur. Bozuk dosya silinmez, yanına kenara alınır. Sorun yoksa kart görünmez.
function fmt(ms: number) {
  return new Date(ms).toLocaleString(locale(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

export default function RecoveryCard() {
  const { notify, confirm } = useToast()
  const [items, setItems] = useState<RecoveryItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => careApi.recoveries().then((r) => setItems(r.items)).catch(() => {}), [])
  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  async function recover(it: RecoveryItem) {
    if (!it.candidate) return
    const ok = await confirm({
      message: tt('{0}, {1} haline geri getirilsin mi? O andan sonra yapılan değişiklikler bu dosyada olmaz. Bozuk dosya silinmez, yanına kenara alınır.', it.what, fmt(it.candidate.at)),
      confirmLabel: tt('Geri getir'),
    })
    if (!ok) return
    setBusy(it.file)
    try {
      await careApi.recover(it.file)
      notify(tt('{0} {1} haline geri getirildi.', it.what, fmt(it.candidate.at)), 'success')
      notifyDataChanged()
      await load()
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Geri getirilemedi.'), 'danger')
    } finally {
      setBusy(null)
    }
  }

  if (!items.length) return null
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.file} className="rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4">
          <p className="text-sm font-semibold text-amber-200">{tt('Bir dosya bozulmuş: {0}', it.what)}</p>
          <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
            {it.candidate
              ? tt('ARGUS bu dosyayı okuyamıyor; verin korunuyor ama bu bölümde kaydetme durdu. {0} haline geri getirilebilir ({1}).', fmt(it.candidate.at), it.candidate.source === 'yedek' ? tt('son yedekten') : tt('arşiv geçmişindeki günlük kopyadan'))
              : tt('ARGUS bu dosyayı okuyamıyor ve sağlam bir kopyasını bulamadı. Aşağıdan bir yedeği geri yükleyebilirsin.')}
          </p>
          {it.candidate && (
            <button
              onClick={() => recover(it)}
              disabled={busy !== null}
              style={primaryButtonStyle}
              className={`mt-3 text-sm px-4 py-1.5 rounded-lg ${PRIMARY_BUTTON} disabled:opacity-40`}
            >
              {busy === it.file ? tt('Geri getiriliyor…') : tt('Getir')}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
