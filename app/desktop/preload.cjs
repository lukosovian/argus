// ARGUS uygulamasının sayfaya açtığı küçük köprü: Ayarlar › Uygulama Ayarları bu makinenin uygulama
// ayarlarını (bilgisayar açılınca başlat, kapatınca tepsiye küçült…) buradan okuyup değiştirir.
// Sayfa tarayıcıda açıldıysa `window.argusApp` yoktur; panel o zaman sadece bilgi gösterir.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('argusApp', {
  getSettings: () => ipcRenderer.invoke('ayarlar:al'),
  setSettings: (patch) => ipcRenderer.invoke('ayarlar:yaz', patch),
  // Seçili profil — Windows bildirimleri bu profilin haberlerinden çıkar
  reportProfile: (id) => ipcRenderer.send('profil', id),
})
