import { useEffect, useState } from 'react'
import { ArgusNative, type FoundServer } from '../../lib/mobile/native'
import { pcRequest, saveConfig, syncNow } from '../../lib/mobile/connection'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'
import { tt } from '../../lib/i18n'

// ARGUS Android ilk açılış: aynı Wi-Fi'daki PC'yi bulur, PC'deki Ayarlar › Telefon'da çıkan kodla eşleşir,
// arşivin bir kopyasını telefona alır (bkz. lib/mobile/connection.ts, server/sync.js).
export default function PairScreen() {
  const [servers, setServers] = useState<FoundServer[] | null>(null)
  const [host, setHost] = useState('')
  const [manual, setManual] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState(() => tt('Telefonum'))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  async function pair() {
    const target = (manual.trim() || host).replace(/^https?:\/\//, '').replace(/:\d+$/, '')
    if (!target || code.length !== 6) return
    setError(null)
    setBusy(tt('Bağlanılıyor...'))
    try {
      const r = await pcRequest('/api/sync/pair', { method: 'POST', host: target, token: '', body: JSON.stringify({ code, name: name.trim() }), timeoutMs: 8000 })
      const d = r.data as { token?: string; deviceId?: string; serverId?: string; pcName?: string; error?: string }
      if (r.status !== 200 || !d?.token || !d.serverId) {
        setError(d?.error ?? tt('Bağlanılamadı.'))
        setBusy(null)
        return
      }
      await saveConfig({ host: target, token: d.token, serverId: d.serverId, pcName: d.pcName ?? '', deviceId: d.deviceId ?? '' })
      setBusy(tt('Arşivin telefona alınıyor... Bu ilk seferde biraz sürebilir.'))
      await syncNow({ full: true })
      location.reload()
    } catch {
      setError(tt('Bu adresteki bilgisayara ulaşılamadı. PC ile aynı Wi-Fi\'da mısın, ARGUS açık mı?'))
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center px-6 py-10" style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}>
      <img src="/logoblue.png" alt="" className="h-16 w-16 mb-4" />
      <h1 className="text-2xl font-bold text-neutral-50">{tt('ARGUS\'u bilgisayarına bağla')}</h1>
      <p className="mt-2 text-sm text-neutral-400 text-center max-w-sm">
        {tt('PC\'de ARGUS\'u aç, Ayarlar › Uygulama Ayarları › Telefon\'dan "Kod al"a bas. Telefon ile bilgisayar aynı Wi-Fi\'da olmalı.')}
      </p>

      <div className="mt-8 w-full max-w-sm space-y-5">
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
                  className={`w-full text-left rounded-xl border px-4 py-3 transition ${host === s.host && !manual ? 'border-[#00c0fa]/50 bg-[#00c0fa]/10' : 'border-neutral-800 bg-neutral-900/60'}`}
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
          onClick={pair}
          disabled={Boolean(busy) || code.length !== 6 || !(manual.trim() || host)}
          className={`${PRIMARY_BUTTON} w-full rounded-xl py-3.5 text-sm`}
          style={primaryButtonStyle}
        >
          {busy ?? tt('Bağlan')}
        </button>
      </div>
    </div>
  )
}
