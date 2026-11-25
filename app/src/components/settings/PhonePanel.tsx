import { useCallback, useEffect, useRef, useState } from 'react'
import { api, careApi, type SyncDevicesInfo } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'
import { SettingsSection } from './SettingsUi'
import { locale, tt } from '../../lib/i18n'

// Ayarlar › Uygulama Ayarları › Telefon — kullanıcı "telefondan değiştirdiğim şeyi telefon hafızasında tutsun,
// aynı ağda olunca PC'ye bunlar değişti desin" dedi (ARGUS Android uygulaması, bkz. server/sync.js).
// Burada eşleştirme kodu alınır ve bağlı telefonlar görülüp kaldırılır.
function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString(locale(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}
// v1.26 (G3): bu kadar gündür bağlanmayan telefon için kaldırma önerisi (sunucu da zile aynı öneriyi düşer, bkz.
// server/jobs/reminders.js checkStaleDevices)
const STALE_DAYS = 60
const daysSince = (ms: number) => Math.floor((Date.now() - ms) / 864e5)
// Telefonun bu bilgisayara ulaşacağı ağ adresi: ev ağı (192.168.x / 10.x) önce
const lanHost = (addresses: string[]) => addresses.find((a) => a.startsWith('192.168.') || a.startsWith('10.')) ?? addresses[0]

export default function PhonePanel() {
  const { notify, confirm } = useToast()
  const [info, setInfo] = useState<SyncDevicesInfo | null>(null)
  // Zildeki "Eski telefon … kaldırayım mı?" bildiriminden gelince (?telefon=1) bu bölüm görünür olsun
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [fromNotice] = useState(() => new URLSearchParams(window.location.search).has('telefon'))
  useEffect(() => {
    if (fromNotice && info) boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [fromNotice, info])
  const [now, setNow] = useState(() => Date.now())
  const known = useRef<Set<string> | null>(null)
  const [apk, setApk] = useState<{ available: boolean; version?: string; size?: number } | null>(null)
  useEffect(() => {
    api.getMobileInfo().then(setApk).catch(() => {})
  }, [])

  const load = useCallback(
    () =>
      api
        .getSyncDevices()
        .then((next) => {
          // Kod gösterilirken yeni bir telefon eşleştiyse haber ver
          if (known.current) {
            const fresh = next.devices.find((d) => !known.current!.has(d.id))
            if (fresh) notify(tt('{0} bağlandı.', fresh.name), 'success')
          }
          known.current = new Set(next.devices.map((d) => d.id))
          setInfo(next)
        })
        .catch(() => {}),
    [notify],
  )
  useEffect(() => {
    load()
  }, [load])

  const pairing = info?.pairing && info.pairing.expiresAt > now ? info.pairing : null
  // Kod ekrandayken eşleşmeyi yakalamak için birkaç saniyede bir sor; geri sayım için saniyede bir yenile.
  useEffect(() => {
    if (!pairing) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(load, 2500)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [pairing, load])

  async function newCode() {
    try {
      await api.newPairCode()
      setNow(Date.now())
      await load()
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Kod alınamadı.'), 'danger')
    }
  }

  async function remove(id: string, name: string) {
    if (!(await confirm({ message: tt('{0} kaldırılsın mı? Telefon bir daha bağlanmak için yeniden eşleştirilmeli.', name), confirmLabel: tt('Kaldır'), tone: 'danger' }))) return
    try {
      await api.removeSyncDevice(id)
      await load()
      notify(tt('{0} kaldırıldı.', name))
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Kaldırılamadı.'), 'danger')
    }
  }

  // Bütün telefonların bağlantısını kes (telefon kaybolduysa / değiştiyse): telefonlar yeniden eşleşmeli
  async function removeAll() {
    const n = info?.devices.length ?? 0
    if (!n) return
    if (
      !(await confirm({
        message: tt("Bağlı {0} telefonun hepsinin bağlantısı kesilsin mi? Telefonlar bir daha bağlanmak için yeniden eşleştirilmeli. Telefonlarda PC'ye gitmemiş değişiklik varsa onlar gelmez.", n),
        confirmLabel: tt('Hepsinin bağlantısını kes'),
        tone: 'danger',
      }))
    )
      return
    try {
      const r = await careApi.removeAllSyncDevices()
      await load()
      notify(tt('{0} telefonun bağlantısı kesildi.', r.removed))
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Kaldırılamadı.'), 'danger')
    }
  }

  const left = pairing ? Math.max(0, Math.ceil((pairing.expiresAt - now) / 1000)) : 0
  const host = info?.addresses.length ? lanHost(info.addresses) : null

  return (
    <SettingsSection
      title={tt('Telefon')}
      description={tt("Telefondaki ARGUS, bu bilgisayarla aynı Wi-Fi'a girince değişiklikleri kendiliğinden eşitler. PC kapalıyken de telefonda kullanabilirsin.")}
    >
      <div className="space-y-3">
        {pairing ? (
          <div className="rounded-xl border border-[#00c0fa]/30 bg-[#00c0fa]/[0.06] p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            {/* v1.26: kodu yazmak yerine telefonda "Kodu kamerayla okut" ile bu QR okutulabilir (argus://pair?host&port&code) */}
            {host && <img src={careApi.pairQrUrl(host, pairing.code)} alt="" className="h-32 w-32 shrink-0 rounded-lg bg-white p-1.5 self-center sm:self-auto" />}
            <div className="min-w-0">
              <p className="text-xs text-neutral-400">
                {host ? tt('Telefondaki ARGUS\'ta "Kodu kamerayla okut"a basıp bu QR kodu okut ya da kodu yaz:') : tt("Telefondaki ARGUS'ta bu kodu yaz:")}
              </p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-neutral-50">{pairing.code}</p>
              <p className="mt-2 text-xs text-neutral-500">
                {tt('{0}:{1} içinde geçerli.', Math.floor(left / 60), String(left % 60).padStart(2, '0'))}{' '}
                {info?.addresses.length ? tt('Telefon bilgisayarı bulamazsa bu adresi yaz: {0}', info.addresses.join(' · ')) : null}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-neutral-100">{tt('Telefon bağla')}</p>
              <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                {tt("Telefonda ARGUS'u aç, bu bilgisayar aynı Wi-Fi'dayken çıkan kodu orada yaz.")}
              </p>
            </div>
            <button onClick={newCode} className={`${PRIMARY_BUTTON} shrink-0 rounded-lg text-xs px-3 py-1.5`} style={primaryButtonStyle}>
              {tt('Kod al')}
            </button>
          </div>
        )}
      </div>
      {/* Telefona kurulum: QR kodu telefonun kamerasıyla okut, APK iner; ya da buradan indirip telefona at */}
      {apk?.available && (
        <div className="flex items-start gap-4">
          {info?.addresses[0] && (
            <img
              src={`/api/mobile/qr?host=${encodeURIComponent(info.addresses.find((a) => a.startsWith('192.168.') || a.startsWith('10.')) ?? info.addresses[0])}`}
              alt=""
              className="h-28 w-28 shrink-0 rounded-lg bg-white p-1.5"
            />
          )}
          <div className="min-w-0">
            <p className="text-sm text-neutral-100">{tt("Telefona ARGUS'u kur")}</p>
            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
              {tt("Android telefonun kamerasıyla QR kodu okut (telefon bu bilgisayarla aynı Wi-Fi'da olmalı), inen dosyayı aç ve kur. Ya da dosyayı indirip telefona gönder.")}
            </p>
            <a href="/api/mobile/apk" download="ARGUS.apk" className="inline-block mt-2 text-xs rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-neutral-200 hover:border-neutral-500">
              {tt("APK'yı indir ({0}, {1} MB)", apk.version ?? '', Math.round((apk.size ?? 0) / 1024 / 1024))}
            </a>
            <p className="text-[11px] text-neutral-600 mt-2">{tt("Sonraki sürümleri telefon kendisi kurar: PC'deki ARGUS güncellenince telefonda \"Güncelle\" çıkar.")}</p>
          </div>
        </div>
      )}
      {info && info.devices.length > 0 && (
        <div ref={boxRef} className="space-y-2">
          <p className="text-xs text-neutral-500">{tt('Bağlı telefonlar')}</p>
          {info.devices.map((d) => {
            const days = daysSince(d.lastSeen || d.pairedAt)
            const stale = days >= STALE_DAYS
            return (
              <div
                key={d.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${stale ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-neutral-800 bg-neutral-900/60'}`}
              >
                <div className="min-w-0">
                  <p className="text-sm text-neutral-100 truncate">{d.name}</p>
                  <p className="text-[11px] text-neutral-500">
                    {tt('Son görülme: {0}', fmtTime(d.lastSeen))}
                    {d.pairedAt ? <span className="text-neutral-600">{' · '}{tt('eşleşme: {0}', fmtTime(d.pairedAt))}</span> : null}
                  </p>
                  {stale && <p className="text-[11px] text-amber-300 mt-0.5">{tt('{0} gündür bağlanmadı. Kaybolduysa ya da artık kullanmıyorsan kaldırmanı öneririz.', days)}</p>}
                </div>
                <button
                  onClick={() => remove(d.id, d.name)}
                  className={
                    stale
                      ? 'text-xs rounded-lg border border-amber-500/50 text-amber-200 hover:bg-amber-500/10 px-2.5 py-1 transition shrink-0'
                      : 'text-xs text-neutral-400 hover:text-red-400 transition shrink-0'
                  }
                >
                  {tt('Kaldır')}
                </button>
              </div>
            )
          })}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-neutral-600 leading-relaxed">{tt('Kaldırılan telefon bir daha bağlanmaya çalışınca "bağlı değil" görür, PC\'deki verine ulaşamaz.')}</p>
            <button onClick={removeAll} className="shrink-0 text-xs rounded-lg border border-neutral-700 text-neutral-300 hover:border-red-500/60 hover:text-red-300 px-3 py-1.5 transition">
              {tt('Bütün telefonların bağlantısını kes')}
            </button>
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
