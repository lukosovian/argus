import { useCallback, useEffect, useState } from 'react'
import { api, type BackupInfo } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'
import { SettingsSection, choiceClass } from './SettingsUi'

// Yedekleme (bkz. server/backup.js): seçilen klasöre veri + görseller. OneDrive / Google Drive klasörü
// seçilirse yedek kendiliğinden buluta da gider. İş arka planda sürer, burada ilerlemesi görünür.
function fmtSnap(name: string): string {
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})$/)
  if (!m) return name
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]}`
}
function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

export default function BackupPanel() {
  const { notify, confirm } = useToast()
  const [info, setInfo] = useState<BackupInfo | null>(null)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => api.getBackup().then(setInfo).catch(() => {}), [])
  useEffect(() => {
    load()
  }, [load])
  // İş sürerken saniyede bir ilerlemeyi sor; bitince sonucu bildir.
  const running = Boolean(info?.job?.running)
  useEffect(() => {
    if (!running) return
    const id = setInterval(async () => {
      const next = await api.getBackup().catch(() => null)
      if (!next) return
      setInfo(next)
      if (next.job && !next.job.running) {
        if (next.job.error) notify(next.job.error, 'danger')
        else if (next.job.kind === 'restore') {
          notify('Yedek geri yüklendi, sayfa yenileniyor...')
          setTimeout(() => window.location.reload(), 1200)
        } else {
          const r = next.job.result as { mediaCopied?: number } | null
          notify(`Yedek alındı${r?.mediaCopied ? ` — ${r.mediaCopied} yeni görsel kopyalandı` : ''}.`, 'success')
        }
      }
    }, 1000)
    return () => clearInterval(id)
  }, [running, notify])

  async function save(patch: { target?: string; auto?: 'off' | 'daily' | 'weekly'; keep?: number }) {
    setBusy(true)
    try {
      await api.saveBackupSettings(patch)
      await load()
      if (patch.target !== undefined) notify('Yedek klasörü kaydedildi.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Kaydedilemedi.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function runNow() {
    try {
      await api.runBackup()
      await load()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Yedek başlatılamadı.', 'danger')
    }
  }

  async function restore(name: string) {
    const ok = await confirm({
      message: `${fmtSnap(name)} tarihli yedek geri yüklensin mi? Arşivlerin, ayarların ve geçmişin o ana döner. Şu anki verin silinmez, ARGUS klasöründe "data_geri_yukleme_oncesi" adıyla kenara alınır.`,
      confirmLabel: 'Geri yükle',
    })
    if (!ok) return
    try {
      await api.restoreBackup(name)
      await load()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Geri yüklenemedi.', 'danger')
    }
  }

  if (!info) return <p className="text-sm text-neutral-500">Yükleniyor...</p>
  const s = info.settings
  const job = info.job
  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0

  return (
    <div className="space-y-4">
      <SettingsSection
        title="Yedeklerin konacağı klasör"
        description="OneDrive ya da Google Drive klasörünü seçersen yedeklerin kendiliğinden buluta da gider; bilgisayarına bir şey olsa bile kaybolmaz."
      >
        <div className="space-y-3">
          {s.target ? (
            <p className="text-sm text-neutral-200 break-all">
              <span className="text-neutral-500">Şu an: </span>
              {s.target}
              {!info.targetExists && <span className="text-amber-400"> — bu klasör şu an bulunamıyor</span>}
            </p>
          ) : (
            <p className="text-sm text-amber-400">Henüz bir klasör seçilmedi.</p>
          )}
          {info.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {info.suggestions.map((sg) => (
                <button
                  key={sg.path}
                  disabled={busy}
                  onClick={() => save({ target: sg.path })}
                  className={`text-left text-xs rounded-xl border px-3 py-2 transition ${choiceClass(s.target === sg.path)}`}
                >
                  <span className="block font-medium">{sg.label}</span>
                  <span className="block text-[11px] text-neutral-500 break-all">{sg.path}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Başka bir klasör: ör. D:\Yedeklerim (Gezgin'de adres çubuğundan kopyalayıp yapıştır)"
              className="flex-1 min-w-0 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
            />
            <button
              disabled={busy || !custom.trim()}
              onClick={() => save({ target: custom.trim() }).then(() => setCustom(''))}
              className="shrink-0 text-sm rounded-lg border border-neutral-700 text-neutral-200 hover:border-neutral-500 px-3 disabled:opacity-40"
            >
              Kaydet
            </button>
          </div>
          <p className="text-[11px] text-neutral-600">Yedekler seçtiğin klasörün içinde "ARGUS Yedek" adlı bir klasöre konur.</p>
        </div>
      </SettingsSection>

      <SettingsSection title="Yedek al" description="Önce arşivlerin, ayarların ve geçmişin (birkaç saniye), sonra görseller kopyalanır. Görsellerde sadece yeniler kopyalandığı için sadece ilk yedek uzun sürer.">
        <div className="space-y-3">
          {job?.running ? (
            <div>
              <div className="flex items-baseline justify-between text-xs mb-1.5">
                <span className="text-neutral-300">
                  {job.kind === 'restore' ? 'Geri yükleniyor' : 'Yedek alınıyor'} ·{' '}
                  {job.phase === 'veri' ? 'arşivler ve ayarlar' : job.phase === 'medya' ? 'görseller' : 'hazırlanıyor'}
                </span>
                <span className="text-neutral-500 tabular-nums">
                  {job.done}/{job.total} · %{pct}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#00c0fa] to-[#015eea] transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] text-neutral-500 mt-1.5">Bu sırada ARGUS'u kullanmaya devam edebilirsin, iş arka planda sürüyor.</p>
            </div>
          ) : (
            <button
              onClick={runNow}
              disabled={!s.target || !info.targetExists}
              style={primaryButtonStyle}
              className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON} disabled:opacity-40`}
            >
              Şimdi yedek al
            </button>
          )}
          <p className="text-xs text-neutral-500">
            {s.lastAt ? <>Son yedek: <span className="text-neutral-300">{fmtTime(s.lastAt)}</span></> : 'Henüz yedek alınmadı.'}
            {s.lastError && <span className="text-rose-400"> · Son denemede hata: {s.lastError}</span>}
          </p>
          <div>
            <p className="text-xs text-neutral-400 mb-1.5">Otomatik yedek (ARGUS açıkken)</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['off', 'Kapalı'],
                  ['daily', 'Her gün'],
                  ['weekly', 'Her hafta'],
                ] as const
              ).map(([v, label]) => (
                <button key={v} disabled={busy} onClick={() => save({ auto: v })} className={`text-xs rounded-full border px-3.5 py-1.5 transition ${choiceClass(s.auto === v)}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            Kaç yedek saklansın
            <select
              value={s.keep}
              onChange={(e) => save({ keep: Number(e.target.value) })}
              className="rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-100 outline-none"
            >
              {[3, 5, 10, 20, 30].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="text-neutral-600">(eskiler silinir; görseller tek kopya tutulur)</span>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Yedekten geri yükle" description="Bir yedeği seçersen arşivlerin, ayarların ve geçmişin o ana döner; eksik görseller de yedekten geri gelir.">
        {info.snapshots.length === 0 ? (
          <p className="text-sm text-neutral-500">Bu klasörde henüz yedek yok.</p>
        ) : (
          <ul className="space-y-1.5">
            {info.snapshots.map((n, i) => (
              <li key={n} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 px-3 py-2">
                <span className="text-sm text-neutral-200">
                  {fmtSnap(n)}
                  {i === 0 && <span className="ml-2 text-[11px] text-emerald-400">en yeni</span>}
                </span>
                <button
                  disabled={running}
                  onClick={() => restore(n)}
                  className="text-xs rounded-full border border-neutral-700 text-neutral-300 hover:border-amber-500/60 hover:text-amber-300 px-3 py-1 transition disabled:opacity-40"
                >
                  Geri yükle
                </button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  )
}
