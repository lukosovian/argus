import { useCallback, useEffect, useRef, useState } from 'react'
import { careApi, type DiskInfo, type MediaCleanupInfo } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { SettingsSection } from './SettingsUi'
import { tt } from '../../lib/i18n'
import { LineSkeleton } from '../Skeleton'

// Disk ve alan (v1.26, Y8 + Y9; bkz. server/routes/care.js): diskte kalan yer, kullanılmayan görseller (hiçbir kayıtta,
// geçmişte ya da ayarda adı geçmeyen) ve arşiv geçmişinin kapladığı yer — ne kadar yer açılacağı yazarak tek tuşla temizlik.
// Temizlenen görseller 30 gün çöp klasöründe bekler, "Geri getir" ile geri konur.

export function fmtBytes(n: number | null | undefined): string {
  if (!n || n < 0) return tt('{0} MB', 0)
  if (n >= 1024 ** 3) return tt('{0} GB', (n / 1024 ** 3).toFixed(1))
  if (n >= 1024 ** 2) return tt('{0} MB', Math.round(n / 1024 ** 2))
  return tt('{0} KB', Math.max(1, Math.round(n / 1024)))
}

// Kullanılmayan görseller satırı — hem burada hem Sağlık Kontrolü'nde kullanılıyor
export function MediaCleanupRow({ compact = false, onChanged }: { compact?: boolean; onChanged?: () => void }) {
  const { notify, confirm } = useToast()
  const [info, setInfo] = useState<MediaCleanupInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const alive = useRef(true)
  const load = useCallback((refresh = false) => {
    setError(false)
    return careApi
      .mediaCleanup(refresh)
      .then((r) => alive.current && setInfo(r))
      .catch(() => alive.current && setError(true))
  }, [])
  useEffect(() => {
    alive.current = true
    load()
    return () => {
      alive.current = false
    }
  }, [load])

  async function clean() {
    if (!info?.count) return
    const ok = await confirm({
      message: tt('Hiçbir kayıtta kullanılmayan {0} görsel ({1}) temizlensin mi? Hemen silinmezler: {2} gün çöp klasöründe bekler, istersen geri getirirsin. Geri getirilebilecek (silinmiş) kayıtların görselleri korunur.', info.count, fmtBytes(info.bytes), info.trash.days),
      confirmLabel: tt('Temizle'),
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await careApi.cleanMedia()
      setInfo(r)
      notify(tt('{0} görsel temizlendi, {1} yer açıldı.', r.moved, fmtBytes(r.freed)), 'success')
      onChanged?.()
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Temizlenemedi.'), 'danger')
    } finally {
      setBusy(false)
    }
  }
  async function undo() {
    setBusy(true)
    try {
      const r = await careApi.undoMediaClean(info?.trash.last?.id)
      setInfo(r)
      notify(tt('{0} görsel geri getirildi.', r.restored), 'success')
      onChanged?.()
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Geri getirilemedi.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="text-xs text-neutral-500">{tt('Görseller taranamadı.')}</p>
  if (!info)
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span className="h-3 w-3 rounded-full border-2 border-neutral-600 border-t-transparent animate-spin" />
        {tt('Görseller taranıyor…')}
      </div>
    )
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-neutral-100">{info.count ? tt('Kullanılmayan {0} görsel ({1})', info.count, fmtBytes(info.bytes)) : tt('Kullanılmayan görsel yok')}</p>
          {!compact && (
            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
              {tt('Medya klasöründe {0} görsel, toplam {1}. Silinen kayıtlardan ya da değişen afişlerden kalanlar burada birikir.', info.total, fmtBytes(info.totalBytes))}
            </p>
          )}
        </div>
        {info.count > 0 && (
          <button
            onClick={clean}
            disabled={busy}
            className="shrink-0 text-xs rounded-lg border border-[#00c0fa]/50 text-[#7fdcff] hover:bg-[#00c0fa]/10 px-3 py-1.5 transition disabled:opacity-40"
          >
            {busy ? tt('Temizleniyor…') : tt('Temizle ({0} açılır)', fmtBytes(info.bytes))}
          </button>
        )}
      </div>
      {info.trash.last && (
        <div className="flex items-center justify-between gap-3 text-[11px] text-neutral-500">
          <span>{tt('Çöp klasöründe {0} görsel ({1}) — {2} gün sonra kendiliğinden silinir.', info.trash.count, fmtBytes(info.trash.bytes), info.trash.days)}</span>
          <button onClick={undo} disabled={busy} className="shrink-0 text-neutral-400 hover:text-neutral-100 underline-offset-2 hover:underline disabled:opacity-40">
            {tt('Son temizliği geri getir')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function StorageCare() {
  const { notify, confirm } = useToast()
  const [disk, setDisk] = useState<DiskInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const load = useCallback(() => careApi.disk().then(setDisk).catch(() => {}), [])
  useEffect(() => {
    load()
  }, [load])
  // Zildeki "Diskin dolmak üzere" bildiriminden gelince (?alan=1) bu bölüme kaydır
  useEffect(() => {
    if (disk && new URLSearchParams(window.location.search).has('alan')) boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [disk])

  async function trimHistory() {
    if (!disk) return
    const ok = await confirm({
      message: tt('Arşiv geçmişinin en eski yarısı silinsin mi (yaklaşık {0})? Son günlerin geçmişi ve geri alma kalır; çok eski günlere dönme ve çok eski değişiklikleri görme imkânı gider.', fmtBytes(disk.history.bytes / 2)),
      confirmLabel: tt('Eski geçmişi sil'),
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await careApi.trimHistoryHalf()
      notify(tt('Eski geçmiş silindi, {0} yer açıldı.', fmtBytes(r.freed)), 'success')
      await load()
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Silinemedi.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={boxRef}>
      <SettingsSection title={tt('Disk ve alan')} description={tt('ARGUS\'un bu bilgisayarda kapladığı yer. Diskte 2 GB\'tan az yer kalınca zile uyarı düşer.')}>
        {!disk ? (
          <LineSkeleton lines={2} />
        ) : (
          <div className="space-y-4">
            {disk.free !== null && disk.total ? (
              <div>
                <div className="flex items-baseline justify-between text-xs mb-1.5">
                  <span className={disk.low ? 'text-amber-300 font-medium' : 'text-neutral-300'}>
                    {disk.low ? tt('Diskin dolmak üzere — sadece {0} boş', fmtBytes(disk.free)) : tt('Diskte {0} boş yer var', fmtBytes(disk.free))}
                  </span>
                  <span className="text-neutral-500 tabular-nums">{tt('{0} / {1}', fmtBytes(disk.total - disk.free), fmtBytes(disk.total))}</span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${disk.low ? 'bg-amber-400' : 'bg-gradient-to-r from-[#00c0fa] to-[#015eea]'}`}
                    style={{ width: `${Math.min(100, Math.round(((disk.total - disk.free) / disk.total) * 100))}%` }}
                  />
                </div>
              </div>
            ) : null}
            <MediaCleanupRow onChanged={load} />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-neutral-100">{tt('Arşiv geçmişi: {0}', fmtBytes(disk.history.bytes))}</p>
                <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{tt('Sınır {0}; aşınca ARGUS en eskilerden siler ya da sorar.', fmtBytes(disk.history.limitBytes))}</p>
              </div>
              {disk.history.bytes > 50 * 1024 ** 2 && (
                <button
                  onClick={trimHistory}
                  disabled={busy}
                  className="shrink-0 text-xs rounded-lg border border-neutral-700 text-neutral-300 hover:border-amber-500/60 hover:text-amber-200 px-3 py-1.5 transition disabled:opacity-40"
                >
                  {tt('Eski geçmişi sil (~{0} açılır)', fmtBytes(disk.history.bytes / 2))}
                </button>
              )}
            </div>
          </div>
        )}
      </SettingsSection>
    </div>
  )
}
