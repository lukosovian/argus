import { useEffect, useState } from 'react'
import { useProfiles } from '../../hooks/useProfiles'
import { useToast } from '../../hooks/useToast'
import { api } from '../../lib/api'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'
import HelpHint from '../HelpHint'

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

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-50 mb-2">API</h2>
      <p className="text-sm text-neutral-400 mb-5 max-w-xl">
        Bir kaydı TMDB'den otomatik doldurmak (poster, oyuncular, yönetmen, süre gibi bilgileri kendisi getirmek)
        istiyorsan buraya kendi TMDB anahtarını girmelisin. Girmezsen ARGUS'un geri kalanı normal çalışmaya devam
        eder, sadece bu otomatik doldurma özelliği kullanılamaz.
      </p>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 max-w-xl">
        <div className="flex items-center gap-1.5 mb-2">
          <label className="block text-sm text-neutral-300">TMDB API Anahtarı</label>
          <HelpHint>
            <p className="mb-2">
              <a
                href="https://www.themoviedb.org/signup"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline"
              >
                themoviedb.org
              </a>{' '}
              adresinde ücretsiz bir hesap aç.
            </p>
            <p className="mb-2">Hesap Ayarları → API sekmesine git, "API Anahtarı İste"ye bas (kişisel/bireysel kullanım seçilebilir).</p>
            <p>Sana verilen "API Anahtarı (v3 auth)" değerini kopyalayıp buraya yapıştır.</p>
          </HelpHint>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Yükleniyor...</p>
        ) : (
          <>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="TMDB API anahtarını buraya yapıştır"
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm mb-1 font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-neutral-600 mb-4">
              {saved ? 'Bir anahtar kayıtlı. ' : 'Henüz bir anahtar girilmemiş. '}
              Bu anahtar sadece bu bilgisayarda, bu profil için saklanır.
            </p>
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
    </div>
  )
}
