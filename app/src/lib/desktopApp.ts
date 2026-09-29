// ARGUS masaüstü uygulamasının (Electron, desktop/preload.cjs) sayfaya açtığı köprünün türleri.
// Sayfa tarayıcıda açıldıysa `window.argusApp` yoktur.
export interface AppSettings {
  baslangic: boolean
  gizliBasla: boolean
  tepsi: boolean
  buyukBasla: boolean
  bildirim: boolean
  zoom: number
  kisayol: boolean
  kisayolCalisiyor: boolean
  guncelleme: 'otomatik' | 'sor'
  exeVar: boolean
}

declare global {
  interface Window {
    argusApp?: {
      getSettings: () => Promise<AppSettings>
      setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
      reportProfile?: (id: string) => void
    }
  }
}
