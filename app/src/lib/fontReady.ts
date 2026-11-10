// Paylaşım görselleri (Flashback hikâyesi, Koleksiyon, Yılın afiş duvarı) yazıyı tuvale çiziyor. Tarayıcı yazı
// tipini ancak ilk kullanıldığında yüklüyor; yüklenmeden çizilirse görselde yedek yazı tipi çıkar. Çizimden önce
// Inter'in iki dosyası da (Türkçe harfler ayrı dosyada) yüklensin.
export async function fontReady(): Promise<void> {
  try {
    await Promise.all([document.fonts.load("700 20px 'Inter'", 'Aa1'), document.fonts.load("700 20px 'Inter'", 'ğşİıçö')])
  } catch {
    // yüklenemezse yedek yazı tipiyle çizilir — sorun değil
  }
}
