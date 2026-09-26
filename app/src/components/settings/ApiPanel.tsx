import { useEffect, useState } from 'react'
import { useProfiles } from '../../hooks/useProfiles'
import { useToast } from '../../hooks/useToast'
import { api } from '../../lib/api'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'

// "API" sekmesi — TMDB API anahtarını profil başına burada saklıyoruz (bkz. server/index.js'teki
// /api-key uçları). Bu anahtar, bir kaydın 🔄 (TMDB'den doldur) butonuna basıldığında ya da
// arşivdeki "Genel Güncelleme" ile kullanılır: film/dizi bilgisi (poster, banner, ülke,
// yönetmen, sinopsis, oyuncular, süre, yaş sınırı, fragman, dizilerde sezon/bölüm) TMDB'den
// otomatik çekilip doldurulur. Artık herkes kendi anahtarını girmek zorunda — uygulama artık
// tek bir kişiye gömülü bir anahtarla çalışmıyor (bkz. server/index.js'teki göç notu).
export default function ApiPanel() {
  const { activeProfileId } = useProfiles()
  const { notify } = useToast()
  const [loading, setLoading] = useState(true)
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!activeProfileId) return
    setLoading(true)
    api
      .getApiKey()
      .then(({ tmdbApiKey }) => {
        setKey(tmdbApiKey)
        setSaved(tmdbApiKey)
      })
      .finally(() => setLoading(false))
  }, [activeProfileId])

  async function handleSave() {
    setBusy(true)
    try {
      await api.saveApiKey(key.trim())
      setSaved(key.trim())
      notify(key.trim() ? 'API anahtarı kaydedildi.' : 'API anahtarı kaldırıldı.', 'success')
    } finally {
      setBusy(false)
    }
  }

  const dirty = key.trim() !== saved

  // Anahtar ekranda açıkça durmasın — varsayılan gizli, göz simgesiyle görülebilir.
  const [reveal, setReveal] = useState(false)

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-neutral-400 flex-1 min-w-[16rem]">
          Bir kaydı TMDB'den otomatik doldurmak (poster, oyuncular, yönetmen, süre gibi bilgileri kendisi getirmek) için kendi
          ücretsiz TMDB anahtarını gir. Girmezsen ARGUS'un geri kalanı normal çalışır, sadece otomatik doldurma kullanılamaz.
        </p>
        {!loading && (
          <span
            className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 border ${
              saved ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25' : 'text-amber-400 bg-amber-400/10 border-amber-400/25'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${saved ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {saved ? 'Bağlı' : 'Anahtar yok'}
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
        <label className="block text-sm font-medium text-neutral-200 mb-2">TMDB API Anahtarı</label>
        {loading ? (
          <p className="text-sm text-neutral-500">Yükleniyor...</p>
        ) : (
          <>
            <div className="relative">
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                type={reveal ? 'text' : 'password'}
                placeholder="TMDB API anahtarını buraya yapıştır"
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 pl-3 pr-20 py-2.5 text-neutral-100 outline-none focus:border-[#00c0fa]/60 text-sm font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-50 px-2 py-1 rounded-md hover:bg-neutral-700 transition"
              >
                {reveal ? 'Gizle' : 'Göster'}
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-1.5 mb-4">Bu anahtar sadece bu bilgisayarda, bu profil için saklanır.</p>
            <button
              onClick={handleSave}
              disabled={!dirty || busy}
              style={primaryButtonStyle}
              className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}
            >
              {busy ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
        <p className="text-sm font-medium text-neutral-200 mb-3">Anahtar nasıl alınır?</p>
        <ol className="space-y-2.5">
          {[
            <>
              <a href="https://www.themoviedb.org/signup" target="_blank" rel="noreferrer" className="text-[#00c0fa] hover:underline">
                themoviedb.org
              </a>{' '}
              adresinde ücretsiz bir hesap aç.
            </>,
            <>Hesap Ayarları › API sekmesine git, "API Anahtarı İste"ye bas (kişisel kullanım seçilebilir).</>,
            <>Sana verilen "API Anahtarı (v3 auth)" değerini kopyalayıp yukarıdaki kutuya yapıştır ve Kaydet'e bas.</>,
          ].map((t, i) => (
            <li key={i} className="flex gap-3 text-sm text-neutral-400">
              <span className="h-5 w-5 shrink-0 rounded-full bg-[#00c0fa]/15 text-[#00c0fa] text-[11px] font-bold flex items-center justify-center mt-px">
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
