import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'flag-icons/css/flag-icons.min.css'
import './index.css'
import { initUiPrefs } from './lib/uiPrefs'
import { initLang, tt } from './lib/i18n'

// Arayüz tercihleri sunucudan yüklenmeden çizilmesin (kapatılan sütunlar vb. doğru gelsin) — bkz. lib/uiPrefs.ts.
// Dil de ondan sonra belirlenir; uygulama ancak o zaman yüklenir (modüllerdeki sabit listeler doğru dilde kurulsun).
initUiPrefs()
  .catch(() => {})
  .then(() => initLang())
  .finally(async () => {
  const { default: App } = await import('./App.tsx')
  const root = createRoot(document.getElementById('root')!)
  // ARGUS uygulamasının ilk açılışında, tarayıcıdaki eski tercihler buradan bir kez aktarılır (bkz. desktop/main.cjs)
  if (new URLSearchParams(location.search).has('ayar-tasi')) {
    root.render(
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#e5e5e5', fontFamily: 'inherit', padding: 24, textAlign: 'center' }}>
        <div>
          <img src="/logoblue.png" alt="" style={{ width: 64, height: 64, margin: '0 auto 16px' }} />
          <p style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{tt('ARGUS artık kendi uygulamasında açılıyor')}</p>
          <p style={{ marginTop: 8, color: '#a3a3a3' }}>{tt('Tarayıcıdaki ayarların (kapattığın sütunlar, tema…) uygulamaya aktarıldı. Bu sekmeyi kapatabilirsin.')}</p>
        </div>
      </div>,
    )
    return
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
