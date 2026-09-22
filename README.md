# ARGUS

Notion'daki mantığın aynısını taşıyan, kendi web tabanlı arşiv uygulaman: istediğin kadar **arşiv (veritabanı)**
oluşturabiliyorsun (Medya Arşivi, Kitaplarım, Oynadığım Oyunlar...), her arşivin **sütunlarını sen ekliyorsun**
(adını yazıp tipini seçiyorsun: Metin/Sayı/Seçim/Çoklu Seçim/Onay Kutusu/Tarih/URL/Görsel), ve her arşivi hem
**Galeri** hem **Tablo** görünümünde geziyorsun.

Tamamen yerel çalışır — giriş ekranı yok, internete ihtiyaç yok. Tüm veriler bu klasörün içindeki **`data/`**
klasöründe gerçek `.json` dosyaları olarak, tüm görsel/videolar **`medya/`** klasöründe gerçek dosyalar olarak
durur. `data/` ve `medya/` klasörlerini kopyalayarak yedek alabilirsin.

Kod `app/` klasöründe.

## Çalıştırmak

En kolayı: bu klasördeki **`ARGUS.bat`** dosyasına (ya da masaüstündeki ARGUS kısayoluna) çift tıkla. Hem siteyi
hem de verileri/medyayı yöneten yardımcı sunucuyu birlikte başlatır ve tarayıcıda `http://localhost:5173`
adresini açar. Sunucu küçültülmüş, görev çubuğunda duran bir pencerede çalışır — ekranda açık bir terminal durmaz.

Elle çalıştırmak istersen:

```powershell
cd app
npm install
npm run dev
```

## Güncellemeler

Bu klasör bir git deposu — `ARGUS.bat` her açılışta otomatik olarak en son sürümü çeker (`git pull`),
sen hiçbir şey yapmana gerek yok. Uygulama açıkken de arka planda periyodik olarak kontrol eder, yeni bir
güncelleme çıkarsa uygulama içinde bir bildirim gösterir — o güncelleme uygulamayı kapatıp yeniden açtığında
devreye girer (çalışırken kendi kendini değiştirmez). **Kendi verin (`data/`, `medya/`) bu güncellemelerden hiç
etkilenmez**, sadece kod (`app/` klasörü) güncellenir.

## Nasıl çalışıyor

Herkes kendi profiliyle girer ("Kim izliyor?" ekranı), her profilin arşivleri/ayarları birbirinden bağımsızdır.
Sağ üstteki profil resmine tıklayınca çıkan menüden **Ayarlar**'a gidilir — orada üç sekme: **Veritabanı**,
**Ana Sayfa Ayarları**, **Profil Ayarları**.

**Veritabanı** sekmesinin kendi dört alt-sekmesi var:

- **Arşivler** — "+ Yeni Arşiv" ile istediğin isimde bir arşiv aç; açılan seçim listesinden **Boş arşiv**, hazır
  **Medya Arşivi şablonu** (Kategori/Durum/Yönetmen/Tür/Ülke/Puan gibi sütunlarla) ya da kendi oluşturduğun bir
  şablon arasından seç. Ne seçersen seç, sütunları sonra istediğin gibi ekleyip/kaldırıp/yeniden adlandırabilirsin.
  **İlk oluşturduğun arşiv, ana sayfada hâlâ hiçbir arşiv seçili değilse otomatik olarak ana sayfa arşivi olur.**
- **Şablonlar** — hazır sütun setleriyle hızlıca arşiv açmak için. "+ Yeni Şablon" ile kendi şablonunu da
  oluşturabilirsin: ya var olan bir arşivin sütun yapısını kopyalayarak, ya da sıfırdan (isim + sütun listesi)
  tanımlayarak. Her şablonun kendi "Şablonu Kullan" butonu var (hangi sütunları dahil edeceğini seçip yeni bir
  arşiv oluşturur).
- **İçe Aktar** — bir CSV dosyasından (Notion'dan dışa aktardığın ya da başka bir yerden gelen, fark etmez) yeni
  bir arşiv oluşturur, detayları aşağıda.
- **API** — TMDB'den otomatik bilgi/poster/oyuncu doldurmak istersen (bir kaydın 🔄 butonu) kendi ücretsiz TMDB
  anahtarını buraya girersin. Girmezsen uygulamanın geri kalanı normal çalışır, sadece bu otomatik doldurma
  özelliği kullanılamaz — herkesin kendi anahtarını girmesi gerekir, tek bir gömülü anahtar artık yok.

Bir arşivin içinde **Galeri** ve **Tablo** aynı verinin iki görünümü. Tablo'da sağ üstteki **"+"** ile yeni
sütun eklersin (isim + tip seç), sütun başlığına çift tıklayınca yeniden adlandırma/silme çıkar. En alttaki
**"+ Yeni Kayıt"** satırına ya da galerideki **"+"** karesine tıklayınca kayıt formu açılır. Seçim/Çoklu Seçim
tipi sütunlarda değer girerken de anında yeni seçenek (etiket) ekleyebilirsin. Galerideki filtre: herhangi bir
Seçim/Çoklu Seçim sütununu seçip değerlerine göre daraltabilirsin (durum, tür, kategori — hangi sütunu böyle
kullanmak istersen). **Görsel/video ekleme**: bir "Görsel" sütununa değer girerken "bilgisayardan seç" ile dosya
seçersin, dosya otomatik olarak `medya/` klasörüne (orijinal haliyle, sıkıştırılmadan) kopyalanır. İstersen
`medya/` klasörüne Windows Gezgini'nden kendin de dosya atıp, "medya/ klasöründen seç" ile oradan seçebilirsin.

## İçe aktarma (Notion'dan ya da başka bir yerden)

1. Notion'dan geliyorsa: veritabanının **`...`** menüsü → **Export** → **CSV**, mümkünse "dosyaları/görselleri
   dahil et" seçeneğiyle dışa aktar (bu sana bir `.zip` verir: içinde CSV ve kapak görsellerin olur). Başka bir
   yerden geliyorsa herhangi bir CSV dosyası da çalışır.
2. Zip'i (varsa) bir klasöre çıkar.
3. ARGUS'ta **Ayarlar → Veritabanı → İçe Aktar**'a gir, önce CSV dosyasını yükle. İstersen "Medya Arşivi
   şablonuyla eşleştir" kutucuğunu işaretleyip CSV sütunlarını doğrudan o şablonun sütunlarıyla eşleştir.
4. Uygulama sütunları ve tiplerini otomatik tahmin eder (Seçim/Çoklu Seçim/Tarih/Sayı/Görsel/Metin) — hangi
   sütunun başlık (kart adı) olacağını seç, tahminleri istersen düzelt.
5. Görsel sütunun varsa, zip'i açtığın klasörü seç — dosya adları CSV'deki isimlerle eşleştirilip görseller
   otomatik olarak `medya/` klasörüne kopyalanır.
6. **İçe Aktar** — kendi sütun adlarınla, kendi verinle yepyeni bir arşiv oluşur.

## Klasör yapısı

- `data/` — tüm arşivler/kayıtlar/profil/ana sayfa ayarları, gerçek `.json` dosyaları olarak (uygulama ilk
  çalıştığında kendisi oluşturur)
- `medya/` — tüm görsel/video dosyaları (uygulama ilk çalıştığında kendisi oluşturur)
- `app/src/types.ts` — Board (arşiv) / PropertyDef (sütun) / Row (kayıt) veri modeli
- `app/server/index.js` — yerel sunucu: `data/` ve `medya/` klasörlerini okuyup yazan küçük Node programı
- `app/src/lib/api.ts` — tarayıcıdaki uygulamanın yerel sunucuyla konuştuğu tek nokta
- `app/src/hooks/useBoards.ts`, `useBoard.ts`, `useRows.ts` — yerel sunucudan okuma/yazma
- `app/src/pages/Boards.tsx` — arşiv listesi + oluşturma
- `app/src/pages/BoardView.tsx` — bir arşivin Galeri/Tablo görünümü, filtre, sütun/kayıt ekleme
- `app/src/pages/Import.tsx` — Notion CSV + görsel klasöründen otomatik arşiv oluşturma

## Not: sadece bu bilgisayardan çalışır

Bu haliyle ARGUS sadece bu bilgisayarda, `ARGUS.bat` çalışırken kullanılabilir — telefondan ya da başka
bir bilgisayardan erişilemez, çünkü veriler internete değil bu bilgisayardaki `data/`/`medya/` klasörlerine
yazılıyor. İleride başka cihazlardan da erişmek istersen bu mimarinin değişmesi gerekir (o zaman tekrar konuşuruz).
