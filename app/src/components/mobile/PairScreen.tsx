import { useEffect, useRef, useState } from 'react'
import { ArgusNative, type FoundServer } from '../../lib/mobile/native'
import { getConfig, pcRequest, saveConfig, syncNow } from '../../lib/mobile/connection'
import { wipeAll } from '../../lib/mobile/store'
import { parsePairLink, takePairLink, type PairLink } from '../../lib/mobile/nativeFeatures'
import { useEscape } from '../../hooks/useEscape'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'
import { tt } from '../../lib/i18n'

// ARGUS Android ilk açılış: aynı Wi-Fi'daki PC'yi bulur, PC'deki Ayarlar › Telefon'da çıkan kodla eşleşir,
// arşivin bir kopyasını telefona alır (bkz. lib/mobile/connection.ts, server/sync.js).
// onClose: uygulamanın içinden "yeniden bağlan" için açıldı (PC bu telefonu artık tanımıyor) — telefondaki kopya ve
// bekleyen değişiklikler korunur (aynı PC ise); vazgeçilebilir.
export default function PairScreen({ onClose }: { onClose?: () => void } = {}) {
  const [servers, setServers] = useState<FoundServer[] | null>(null)
  const [host, setHost] = useState('')
  const [manual, setManual] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState(() => tt('Telefonum'))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEscape(Boolean(onClose) && !busy, () => onClose?.())
  // Kare kod ve elle bağlanma aynı anda iki eşleşme başlatmasın
  const pairing = useRef(false)

  async function scan() {
    setServers(null)
    setError(null)
    const r = await ArgusNative.findServers({ hints: [], scan: true }).catch(() => ({ servers: [] as FoundServer[] }))
    setServers(r.servers)
    if (r.servers.length) setHost(r.servers[0].host)
  }
  useEffect(() => {
    scan()
  }, [])

  // A8: PC'deki kare kod (argus://pair?host=…&code=…). Telefonun kendi kamerasıyla okutulunca da buraya gelir.
  const [scanning, setScanning] = useState(false)
  function applyPairLink(p: PairLink) {
    setManual(p.host)
    setCode(p.code)
    pair(p)
  }
  useEffect(() => {
    const p = takePairLink()
    if (p) applyPairLink(p)
    const on = () => {
      const q = takePairLink()
      if (q) applyPairLink(q)
    }
    window.addEventListener('argus-pair-link', on)
    return () => window.removeEventListener('argus-pair-link', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function scanQr() {
    setError(null)
    setScanning(true)
    try {
      const r = await ArgusNative.scanQr()
      if (r.cancelled || !r.text) return
      const p = parsePairLink(r.text)
      if (p) applyPairLink(p)
      else setError(tt("Bu kare kod ARGUS'un eşleştirme kodu değil. PC'de Ayarlar › Telefon'da çıkan kodu okut."))
    } catch {
      setError(tt('Kamera açılamadı. Kodu aşağıya elle yazabilirsin.'))
    } finally {
      setScanning(false)
    }
  }

  async function pair(over?: PairLink) {
    if (pairing.current) return
    const target = (over?.host ?? (manual.trim() || host)).replace(/^https?:\/\//, '').replace(/:\d+$/, '')
    const code6 = over?.code ?? code
    if (!target || code6.length !== 6) return
    pairing.current = true
    setError(null)
    setBusy(tt('Bağlanılıyor...'))
    try {
      const r = await pcRequest('/api/sync/pair', { method: 'POST', host: target, token: '', body: JSON.stringify({ code: code6, name: name.trim() }), timeoutMs: 8000 })
      const d = r.data as { token?: string; deviceId?: string; serverId?: string; pcName?: string; error?: string }
      if (r.status !== 200 || !d?.token || !d.serverId) {
        setError(d?.error ?? tt('Bağlanılamadı.'))
        setBusy(null)
        pairing.current = false
        return
      }
      // Başka bir PC'ye bağlandıysa eski PC'nin kopyası (ve ona gidecek değişiklikler) burada kalmasın
      const prev = getConfig()
      if (prev && prev.serverId !== d.serverId) {
        await wipeAll().catch(() => {})
        await ArgusNative.clearMedia().catch(() => {})
      }
      await saveConfig({ host: target, token: d.token, serverId: d.serverId, pcName: d.pcName ?? '', deviceId: d.deviceId ?? '' })
      setBusy(tt('Arşivin telefona alınıyor... Bu ilk seferde biraz sürebilir.'))
      await syncNow({ full: true })
      location.reload()
    } catch {
      setError(tt('Bu adresteki bilgisayara ulaşılamadı. PC ile aynı Wi-Fi\'da mısın, ARGUS açık mı?'))
      setBusy(null)
      pairing.current = false
    }
  }

  return (
    <div className={`${onClose ? 'fixed inset-0 z-[210] overflow-y-auto justify-start' : 'min-h-screen justify-center'} bg-neutral-950 text-neutral-100 flex flex-col items-center px-6 py-10`} style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}>
      <img src="/logoblue.png" alt="" className="h-16 w-16 mb-4" />
      <h1 className="text-2xl font-bold text-neutral-50">{tt('ARGUS\'u bilgisayarına bağla')}</h1>
      <p className="mt-2 text-sm text-neutral-400 text-center max-w-sm">
        {tt('PC\'de ARGUS\'u aç, Ayarlar › Uygulama Ayarları › Telefon\'dan "Kod al"a bas. Telefon ile bilgisayar aynı Wi-Fi\'da olmalı.')}
      </p>

      <div className="mt-8 w-full max-w-sm space-y-5">
        <div>
          <button
            onClick={scanQr}
            disabled={Boolean(busy) || scanning}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#00c0fa]/50 bg-[#00c0fa]/10 py-3.5 text-sm font-semibold text-[#bdeeff] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
              <rect x="7" y="7" width="4" height="4" />
              <path d="M13 7h4v4M7 13h4v4M13 13h1M17 17v-1M13 17h1" />
            </svg>
            {tt('Kodu kamerayla okut')}
          </button>
          <p className="mt-2 text-center text-xs text-neutral-500">{tt("PC'deki kare kodu okut; bilgisayar ve kod kendiliğinden gelir. Ya da aşağıdan elle gir.")}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 mb-2">{tt('Bilgisayar')}</p>
          {servers === null ? (
            <p className="text-sm text-neutral-400 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">{tt('Ağda ARGUS aranıyor...')}</p>
          ) : servers.length ? (
            <div className="space-y-2">
              {servers.map((s) => (
                <button
                  key={s.host}
                  onClick={() => {
                    setHost(s.host)
                    setManual('')
                  }}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition ${host === s.host && !manual ? 'border-[#00c0fa]/50 bg-[#00c0fa]/10' : 'border-neutral-800 bg-neutral-900/60'}`}
                >
                  <span className="block text-sm text-neutral-50">{s.pcName || 'ARGUS'}</span>
                  <span className="block text-xs text-neutral-500">{s.host}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
              <p className="text-sm text-neutral-300">{tt('Bilgisayar bulunamadı.')}</p>
              <button onClick={scan} className="mt-1 text-xs text-[#3fa9ff]">
                {tt('Tekrar ara')}
              </button>
            </div>
          )}
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            inputMode="decimal"
            placeholder={tt('ya da PC\'de yazan adresi gir (ör. 192.168.1.5)')}
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-[#00c0fa]/50"
          />
        </div>

        <div>
          <p className="text-xs text-neutral-500 mb-2">{tt('PC\'de çıkan 6 haneli kod')}</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-neutral-50 placeholder:text-neutral-700 outline-none focus:border-[#00c0fa]/50"
          />
        </div>

        <div>
          <p className="text-xs text-neutral-500 mb-2">{tt('Bu telefonun adı (PC\'de böyle görünür)')}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]/50"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={() => pair()}
          disabled={Boolean(busy) || code.length !== 6 || !(manual.trim() || host)}
          className={`${PRIMARY_BUTTON} w-full rounded-xl py-3.5 text-sm`}
          style={primaryButtonStyle}
        >
          {busy ?? tt('Bağlan')}
        </button>
        {onClose && !busy && (
          <button onClick={onClose} className="w-full py-2 text-sm text-neutral-400">
            {tt('Vazgeç')}
          </button>
        )}
      </div>
    </div>
  )
}
