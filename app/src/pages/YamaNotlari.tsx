// pp menüsündeki "Yama Notları" ile açılan, ARGUS'un geçmiş güncellemelerini anlatan sayfa —
// kullanıcı "yama notları kısmını ekle... yama notlarını alta doğru sırala" dedi. Liste elle
// tutuluyor (otomatik bir kaynak yok) — yeni bir özellik/düzeltme eklendikçe en üste yeni bir
// ENTRIES kaydı eklenmesi yeterli, en yeni en üstte. Numara kuralı (kullanıcı isteği): her yeni
// GÜN bir üst sürüm (v1.6 → v1.7), aynı gün içindeki sonraki güncellemeler o günün alt sürümü
// (v1.6 → v1.6.1 → v1.6.2). `version` alanı lib/version.ts'teki
// APP_VERSION ile elle senkron tutulur (kullanıcı "versiyon numarası ekleyelim güncellendiği
// anlaşılmıyo" dedi).
import { useEffect, useMemo, useState } from 'react'
import { APP_VERSION } from '../lib/version'
import { BRAND_GRADIENT, BRAND_TEXT } from '../lib/theme'
import {
  BenzerDetayVisual,
  DetayEkleriVisual,
  FiltreDonusVisual,
  GizliSutunVisual,
  GorevVisual,
  GorselSekliVisual,
  GuncelleVisual,
  KapatPuanVisual,
  KesfetVisual,
  NeIzlesemTmdbVisual,
  OnayYeriVisual,
  RehberVisual,
  SaglikVisual,
  SinemaVisual,
  YeniBolumlerVisual,
  OtomatikFiltreVisual,
  TakvimAyVisual,
  TakvimGunVisual,
  TakvimYilVisual,
  CokluFiltreVisual,
  NeIzlesemSonucVisual,
  GenelGuncellemeVisual,
  NeIzlesemPencereVisual,
  GecmisVisual,
  BildirimVisual,
  TarihAraligiVisual,
  OyuncuPencereVisual,
  KoleksiyonVisual,
  IlerlemeVisual,
  TarihSeciciVisual,
  AcilisVisual,
  UygulamaAyarVisual,
  MukerrerVisual,
  TabloMukerrerVisual,
  SatirTasiVisual,
  SatirGuncelleVisual,
  HangisiVisual,
  YedekVisual,
  SeriKisiVisual,
} from '../components/PatchVisuals'
interface PatchEntry {
  version: string
  date: string
  title: string
  items: string[]
  // Neyin değiştiğini/eklendiğini gösteren çizimler (bkz. components/PatchVisuals.tsx) —
  // kullanıcı "yama notları da wireframeler kullanabilir mi" dedi. İsteğe bağlı.
  visuals?: { caption: string; Visual: () => React.ReactNode }[]
}

const ENTRIES: PatchEntry[] = [
  {
    version: 'v1.11.8',
    date: '29 Eylül 2026',
    title: 'Yeni güncelleme sorusu kaçmıyor',
    items: [
      'ARGUS açıkken yeni sürüm artık 5 dakikada bir kontrol ediliyor (önceden yarım saatte bir), yeni bir sürüm çıkınca çok daha çabuk haberin oluyor.',
      '"Yeni bir ARGUS güncellemesi hazır" sorusu artık 12 saniye sonra kendiliğinden kaybolmuyor; cevap verene kadar sağ altta duruyor — ekrana bakmıyorken ya da ARGUS tepsideyken çıksa bile döndüğünde görüyorsun. "Sonra" dersen 2 saat sonra yine soruyor (önceden ARGUS kapanıp açılana kadar bir daha sormuyordu).',
    ],
  },
  {
    version: 'v1.11.7',
    date: '29 Eylül 2026',
    title: 'Güncelle, TMDB\'de birden fazla yapım çıkınca hangisi olduğunu soruyor',
    visuals: [{ caption: '1 aynı adlı birden fazla yapım çıkınca liste açılır · 2 adı yazdığınla birebir tutanlar üstte · 3 doğrusuna tıkla, bilgiler ondan gelsin', Visual: HangisiVisual }],
    items: [
      'Tabloda ya da detay penceresinde Güncelle\'ye basınca TMDB\'de adı tutan birden fazla yapım çıkarsa (ör. "Joker" 2019 filmi, 2012 filmi, 2021 dizisi…) artık kendisi birini seçmiyor: "Hangisi?" penceresi açılıyor, afişi, yılı, Film/Dizi olduğu ve kısa özetiyle listeliyor, sen doğrusunu seçiyorsun. Adı yazdığınla birebir tutanlar üstte ve "adı tutuyor" etiketli.',
      'Tek bir kesin eşleşme varsa sormadan dolduruyor. Kategori\'si (Film/Dizi) ya da vizyon yılı dolu kayıtlarda aday ona göre daraltılıyor, çoğu zaman sormaya gerek kalmıyor. Daha önce bir yapıma bağlanmış kayıtlar da sormadan aynı yapımdan güncelleniyor.',
      'Pencerede vazgeçersen hiçbir şey değişmiyor. Genel Güncelleme (bütün arşiv) yine sormadan kendisi seçiyor, yoksa yüzlerce kez sorardı.',
    ],
  },
  {
    version: 'v1.11.6',
    date: '29 Eylül 2026',
    title: 'Seçili satırların hepsini birden değiştirme, güncellenen satırda ışık hüzmesi, Güncelle adın yazımını düzeltiyor',
    visuals: [{ caption: '1 Güncelle\'ye basınca o satırın üstünden mavi bir ışık hüzmesi geçiyor · 2 bitince satır bir an maviye parlıyor', Visual: SatirGuncelleVisual }],
    items: [
      'Yeni: Tabloda birden fazla satır seçiliyken seçili satırlardan birinde bir hücreyi değiştirirsen değişiklik seçili hepsine uygulanıyor — ör. birkaç içeriği seçip birinin Durum\'unu İzlendi yapınca hepsi İzlendi oluyor. Tür, Oyuncular, İzleme Tarihi gibi çoklu değerlerde her kayda sadece eklediğin eklenip çıkardığın çıkarılıyor, diğer değerleri silinmiyor. Ad sütunu hariç. Seçim çubuğunda da bu yazıyor.',
      'Tabloda altı noktadan Güncelle\'ye basınca artık o satırda işlem yapıldığı görünüyor: TMDB\'den bilgiler gelene kadar satırın üstünden soldan sağa mavi bir ışık hüzmesi geçiyor, bitince satır bir an maviye parlayıp sönüyor (bir hata olduysa kırmızıya). Birkaç satırı aynı anda güncelleyebilirsin, her biri ayrı ayrı gösteriliyor.',
      'Düzeltme: Türkçe Adı\'na adı küçük harflerle (ya da Türkçe harf kullanmadan) yazıp Güncelle\'ye basınca film bulunuyordu ama ad öyle kalıyordu. Artık TMDB\'deki doğru yazımı geliyor: "esaretin bedeli" → "Esaretin Bedeli", "dunya varmis" → "Dünya Varmış". Kendi verdiğin farklı bir ad varsa yine dokunulmuyor.',
    ],
  },
  {
    version: 'v1.11.5',
    date: '29 Eylül 2026',
    title: 'Satırları sürükleyerek taşıma, satır düğmeleri en üste/en alta düğmelerinin altında kalmıyor',
    visuals: [{ caption: '1 altı noktadan tutup sürükle · 2 mavi çizginin olduğu yere bırakınca satır oraya taşınır', Visual: SatirTasiVisual }],
    items: [
      'Yeni: Arşiv tablosunda bir satırı altı noktadan tutup sürükleyerek yerini değiştirebiliyorsun. Sürüklerken bırakacağın yerde mavi bir çizgi çıkıyor; aşağı taşırken bıraktığın satırın altına, yukarı taşırken üstüne yerleşiyor. Altı noktaya tıklayınca menü eskisi gibi açılıyor.',
      'Taşımak, kaydın "Eklendi" tarihini değiştirmiyor. Sıralama ya da arama açıkken satır taşınamıyor (o sırada tablo başka bir düzende gösteriliyor), önce onları kapatman gerekiyor.',
      'Düzeltme: Sol alttaki en üste / en alta düğmeleri satırların seçim kutusunu, altı noktayı ve göz düğmesini kapatıyordu. Bu düğmeler ve "+ Yeni Ekle" biraz sağa alındı.',
    ],
  },
  {
    version: 'v1.11.4',
    date: '29 Eylül 2026',
    title: 'Tabloda mükerrer işareti ve en üste/en alta düğmeleri, Ne İzlesem yayınlanmamışları seçmiyor, bildirimler daha uzun kalıyor',
    visuals: [
      {
        caption: '1 mükerrer olabilecek kayıtların solunda kırmızı nokta · 2 sol altta en üste çık / en alta in düğmeleri',
        Visual: TabloMukerrerVisual,
      },
    ],
    items: [
      'Arşiv tablosunda mükerrer olabilecek kayıtların solunda (altı noktanın yerinde) küçük kırmızı bir nokta var. Üstüne gelince ne olduğu yazıyor; Sağlık Kontrolü\'nden birleştirebilirsin. Birleştirince ya da "Bunlar farklı" deyince nokta kayboluyor.',
      'Arşiv sayfasının sol altında "En üste çık" ve "En alta in" düğmeleri var — uzun tabloda tek tıkla başa ya da sona gidiliyor.',
      'Ne İzlesem? artık vizyon tarihi henüz gelmemiş (daha yayınlanmamış) yapımları seçmiyor; çıktıkları gün yine seçilebilir hale geliyorlar.',
      'Bildirimler daha uzun kalıyor: en az 7 saniye, uzun mesajlarda okuma süresine göre daha da uzun. Farenle bildirimin üstüne gelince hiç kapanmıyor, çekince birkaç saniye daha duruyor.',
    ],
  },
  {
    version: 'v1.11.3',
    date: '29 Eylül 2026',
    title: 'Mükerrer kayıtlar Sağlık Kontrolü\'nde, İngilizce ad yazınca Türkçe adı gelmesi',
    visuals: [
      {
        caption: '1 aynı içerik iki kez eklenmişse Sağlık Kontrolü\'nde gruplanır, en dolu olan kalır · 2 başlığa İngilizce ad yazıp Güncelle\'ye basınca Türkçe adı gelir · 3 zaten arşivde olan bir içeriği eklersen uyarır',
        Visual: MukerrerVisual,
      },
    ],
    items: [
      'Yeni: Sağlık Kontrolü\'nde "Mükerrer kayıtlar" bölümü — aynı içerik birden fazla kez eklenmişse (aynı TMDB yapımına bağlı ya da Türkçe/orijinal adları aynı) gruplar halinde listeleniyor. Her kaydın yanında türü, yılı, durumu, izleme sayısı, puanı ve kaç alanının dolu olduğu yazıyor; en dolu olan "kalır" diye işaretli.',
      '"Birleştir" ile bilgisi az olan kayıt siliniyor ama hiçbir şey kaybolmuyor: onda olup kalan kayıtta boş olan her şey (puan, izleme tarihleri, bölüm işaretleri, notlar...) kalan kayda aktarılıyor. Başka bir kaydın kalmasını istersen yanındaki "Bu kalsın". "Hepsini birleştir" tüm grupları tek seferde birleştiriyor.',
      'Aynı adlı ama gerçekten farklı yapımlar (ör. aynı adlı film ile dizi, eski ve yeni çekim) yılı ya da Film/Dizi bilgisi farklıysa mükerrer sayılmıyor; yine de yanlışlıkla gelen olursa "Bunlar farklı" ile bir daha gösterilmiyor.',
      'Mükerrer uyarısı güçlendi: Güncelle\'ye basınca bulunan yapım arşivde başka bir kayıtta zaten varsa "Bu içerik arşivde zaten var" uyarısı çıkıyor. Tabloda ad yazarken de artık Orjinal Adı sütunu da karşılaştırılıyor (birine Türkçe, diğerine İngilizce ad yazılmış olsa da yakalanıyor).',
      'Türkçe Adı\'na İngilizce ya da orijinal adı yazıp Güncelle\'ye basınca artık TMDB\'deki Türkçe adı geliyor (ör. "The Shawshank Redemption" → "Esaretin Bedeli"), orijinal adı da Orjinal Adı\'na yazılıyor. Kendi verdiğin farklı bir ad varsa dokunulmuyor.',
      'Sadece Orjinal Adı\'nı yazıp da arama yapabiliyorsun: Türkçe Adı boşken de Güncelle çıkıyor, Türkçe adı kendisi dolduruyor.',
      'TMDB araması daha isabetli: İngilizce adla aranınca adı birebir tutan en bilinen yapım seçiliyor (ör. "Parasite" artık yanlışlıkla başka bir yapımı değil "Parazit"i buluyor).',
    ],
  },
  {
    version: 'v1.11.2',
    date: '29 Eylül 2026',
    title: 'Uygulama Ayarları (açılış, tepsi, Windows bildirimleri, yazı boyutu, kısayol, güncelleme tercihi), kendi başlık çubuğu, görev çubuğuna sabitleme, fragman düzeltmesi',
    visuals: [{ caption: '1 Ayarlar › Uygulama Ayarları · 2 bilgisayar açılınca başlat, istersen pencere açmadan tepside · 3 × ARGUS\'u kapatmak yerine tepsiye küçültsün', Visual: UygulamaAyarVisual }],
    items: [
      'Yeni: Ayarlar › Uygulama Ayarları. "Bilgisayar açılınca ARGUS\'u da aç" ile Windows açılırken ARGUS da başlıyor; istersen "Pencereyi açmadan, tepside başlasın" ile pencere açılmadan saatin yanındaki simgelerde bekliyor.',
      '"Kapatınca tepsiye küçült" açıksa × ARGUS\'u kapatmıyor, saatin yanındaki simgelere küçültüyor; ARGUS arkada çalışmaya devam ediyor (otomatik yedekleme, yeni bölüm kontrolleri pencere kapalıyken de sürüyor). Simgeye tıklayınca açılıyor, sağ tıklayıp "ARGUS\'u kapat" ile tamamen kapanıyor.',
      'Uygulama Ayarları\'nda ayrıca: yeni bölüm ve sezon haberlerini Windows bildirimi olarak gösterme (ARGUS tepsideyken bile; tıklayınca o dizinin detayı açılıyor), yazı ve arayüz boyutu (%90 / %100 / %110 / %125 — Ctrl + / Ctrl − ile de, kalıcı), hep büyütülmüş pencereyle açılma, Ctrl + Alt + A ile ARGUS\'u her yerden öne getirme ve güncellemeler için "Kendiliğinden güncelle" ya da "Önce sor" (açılışta "Güncelle / Şimdilik atla" diye sorar).',
      'Tepsideki ARGUS simgesine sağ tıklayınca "Ne İzlesem?", "Takvim" ve "Bugün izlediğimi ekle" kısayolları var.',
      'Düzeltme: ARGUS penceresi büyütülünce (tam ekran yapılınca) oynayan fragman eski boyutunda kalıyor, arkasından yatay görsel görünüyordu; artık fragman da pencereyle birlikte büyüyüp küçülüyor.',
      'Görev çubuğuna sabitlerken artık "Electron" değil ARGUS sabitleniyor (ARGUS adı ve logosuyla; tıklayınca ARGUS açılıyor). Daha önce Electron diye sabitlediysen onu kaldırıp ARGUS açıkken yeniden sabitle. ARGUS artık Başlat menüsünde de var — "ARGUS" diye aratabilirsin.',
      "ARGUS penceresinin en üstündeki çubuk artık ARGUS'un kendisi: biraz daha kalın, solda logo ve sadece \"ARGUS\" yazıyor (\"ARGUS — Medya Arşivi\" gibi sayfa adları yazmıyor), ARGUS'un koyu renginde. Tutup sürükleyerek taşıyabilir, çift tıklayıp büyütebilirsin; küçült / büyüt / kapat düğmeleri yine sağda.",
    ],
  },
  {
    version: 'v1.11.1',
    date: '29 Eylül 2026',
    title: 'ARGUS artık kendi uygulaması, terminal yerine açılış penceresi',
    visuals: [{ caption: '1 masaüstündeki ARGUS simgesine basınca siyah terminal yerine logolu açılış penceresi · 2 o an ne yaptığını yazar, hazır olunca ARGUS kendi penceresinde açılır', Visual: AcilisVisual }],
    items: [
      'ARGUS artık tarayıcıda değil, kendi penceresinde açılan bir uygulama (Discord, Spotify gibi): kendi simgesi, sekme ve adres çubuğu yok. Pencereyi kapatınca ARGUS da tamamen kapanıyor. Pencerenin boyutunu ve yerini hatırlıyor.',
      'Klasörde artık bir ARGUS.exe var; masaüstündeki ARGUS simgesi de onu açıyor. Açarken hiç terminal penceresi görünmüyor; onun yerine logolu küçük bir açılış penceresi çıkıyor ve o an ne yaptığını yazıyor ("Güncellemeler kontrol ediliyor…", "Arayüz hazırlanıyor…"). Hazır olunca ARGUS penceresi açılıyor. "Şimdi Güncelle"den sonra da aynısı.',
      'ARGUS açıkken simgeye tekrar basarsan ikinci bir pencere açılmıyor, açık olan öne geliyor.',
      'Fragmanlar uygulamada da oynuyor; YouTube, TMDB gibi dış bağlantılar normal tarayıcında açılıyor. İndirdiğin görseller (Flashback kartları vb.) doğrudan İndirilenler klasörüne kaydediliyor. Kısayollar: F5 yenile, Ctrl + / Ctrl − yakınlaştır, Alt+← geri.',
      'Kapattığın sütunlar, tablo sıklığı, tema gibi tercihler artık ARGUS\'ta da saklanıyor; uygulamanın ilk açılışında tarayıcıdaki tercihlerin bir kez aktarılıyor (bu sırada tarayıcında kısa bir "ayarların aktarıldı" sekmesi açılır, kapatabilirsin).',
      'ARGUS klasörü sadeleşti: "ARGUS Durdur" kalktı (pencereyi kapatmak ARGUS\'u kapatıyor), güncelleme ve kurulumu arkada yapan dosyalar gizlendi — klasörde ARGUS.exe ile kendi dosyaların duruyor.',
      'Uygulama motoru bu güncellemeden sonraki ilk açılışta bir kereye mahsus indiriliyor (~100 MB), o açılış biraz uzun sürer. O ilk açılışta terminal de son bir kez görünür; masaüstündeki ARGUS kısayolu kendiliğinden ARGUS.exe\'ye geçer.',
      'Bir sorun olursa (ör. ilk kurulumda internet kesilirse) okuyabilmen için terminal eskisi gibi görünür hale geliyor.',
    ],
  },
  {
    version: 'v1.11',
    date: '29 Eylül 2026',
    visuals: [{ caption: '1 "Bitiş tarihi" anahtarı · 2 ay/yıl gezmek bir şey seçmez · 3 başlangıç → bitiş arası vurgulanır', Visual: TarihSeciciVisual }],
    title: 'Yeni tarih seçici, sezonu bitmemiş dizi kendiliğinden İzlendi olmuyor, "Geçmiş yıllarda bugün"den doğru güne gitme',
    items: [
      'İzleme tarihi (ve bölüm tarihleri) artık ARGUS\'un kendi küçük takvimiyle seçiliyor. Önceden geçmiş bir aya gidince o aydaki aynı gün kendiliğinden ekleniyordu; artık ay/yıl gezmek hiçbir şey seçmez, sadece güne tıklayınca eklenir. Ay adına tıklayınca yıl ve ay seçimi açılır (eski yıllara hızlı gitmek için); "Bugün" ve "Dün" kısayolları var.',
      'Başladığın ve bitirdiğin gün farklıysa "Bitiş tarihi" anahtarını aç: önce başladığın, sonra bitirdiğin güne tıkla, arası vurgulanır. Anahtar kapalıyken tek tıkla tek gün eklenir. Var olan bir tarihe tıklayınca takvim o tarihe gider; yeni güne tıklarsan değişir, "Vazgeç" dersen eskisi kalır.',
      'Ana sayfadaki "Geçmiş yıllarda bugün" satırında "Takvimde gör" bu yılın ayını açıyordu; artık o yılın o gününe gidiyor ve günün paneli açık geliyor (ör. "3 yıl önce" → 29 Eylül 2023). Her kartın altında da kendi yılına giden "takvimde gör" var.',
      "Bir dizinin çıkmış bütün bölümlerini işaretleyince durumu kendiliğinden İzlendi oluyordu — sezonun ortasında bile (ör. 8 bölümlük sezonun 7. bölümünü izleyince, son bölüm daha çıkmadan İzlendi olup puan soruyordu). Artık izlediğin sezonda henüz yayınlanmamış bölüm varsa dizi İzleniyor'da kalıyor; sezon finalini işaretleyince İzlendi oluyor. İleride yeni bir sezon açıklanmışsa eskisi gibi İzlendi olup yeni sezon haberini veriyor.",
    ],
  },
  {
    version: 'v1.10.2',
    date: '28 Eylül 2026',
    title: 'Takvim: son girdiğin yapım hızlı seçimde',
    items: [
      'Takvim\'de bir güne eklerken çıkan "Son izlediklerin — tek tıkla seç" listesi artık en son izleme verisi girdiğin yapımları gösteriyor. Önceden izleme tarihine göre sıralandığı için geçmiş bir tarih girdiğin yapım (ör. dün izlediğini bugün eklemek) listeye gelmiyordu; bölüm işaretlemeleri de artık sayılıyor.',
    ],
  },
  {
    version: 'v1.10.1',
    date: '28 Eylül 2026',
    title: 'Koleksiyon açılırken ne yaptığını gösteriyor',
    items: [
      'Koleksiyon ilk açılışta filmlerinin hangi seriden olduğunu TMDB\'den öğreniyor; artık bunu sayfanın üstünde ilerleme çubuğu ve kalan süreyle gösteriyor ("205/297 · yaklaşık 30 saniye kaldı"). Bu sırada raflar kendiliğinden tamamlanıyor, sayfayı kullanmaya devam edebilirsin.',
      'Koleksiyon bir sebeple açılamazsa (ör. ARGUS yeni güncellenmiş ama kapatılıp açılmamış) sonsuza kadar "Yükleniyor" demiyor: ne olduğunu söylüyor ve "Tekrar dene" düğmesi çıkıyor.',
    ],
    visuals: [{ caption: '1 ilk açılıştaki ilerleme ve kalan süre · 2 bu sırada raflar kullanılabilir', Visual: IlerlemeVisual }],
  },
  {
    version: 'v1.10',
    date: '28 Eylül 2026',
    title: 'Koleksiyon, oyuncu sayfasından arşivdeki yapımlara geçiş',
    items: [
      'Yeni: Koleksiyon (profil menüsünde, Takvim\'in altında). İzlediğin, izlemekte olduğun ya da yarım bıraktığın her yapım burada sergileniyor; aynı seriden olanlar kendi rafında toplanıyor (Star Trek dizileri ve filmleri, Harry Potter, Recep İvedik...). Raf adları Türkçe adlarından geliyor.',
      'Bir yapıma tıklayıp ona kendi sembolünü koyabilirsin (ör. Star Trek dizilerinin göğüslerindeki deltalar): bilgisayarından sürükle-bırak, kopyaladığın bir görseli Ctrl+V ile yapıştır ya da internetteki görselin adresini gir. Görselin düz beyaz/siyah bir arka planı varsa ARGUS onu temizleyip sembolü kırpıyor.',
      'Rafların büyük sembolüne tıklayınca rafın sembolünü ve adını değiştirebilirsin; bir yapımı başka bir rafa taşıyabilir ya da yeni bir raf açabilirsin. Bazı raflara (Star Trek, Harry Potter, Fantastik Canavarlar, Yüzüklerin Efendisi, TRON) hazır semboller kendiliğinden geliyor; aynı hazır sembolleri istediğin yapıma da koyabilirsin.',
      'Oyuncu ya da yönetmen sayfasında "Arşivinde" kısmındaki bir yapıma tıklayınca artık onun detay penceresi açılıyor; oradan başka bir oyuncuya, onun yapımlarına geçmeye devam edebilirsin; her kapattığında bir önceki pencereye dönüyorsun. Film serisi kısmında arşivindeki filmlere tıklayınca da aynısı oluyor.',
      'Oyuncu ya da yönetmen sayfasında "Devamını oku"ya basınca fotoğraf yazıyla birlikte aşağı doğru uzuyordu; artık fotoğraf yerinde ve boyunda kalıyor, sadece yazı uzuyor.',
    ],
    visuals: [{ caption: 'Koleksiyon — 1 rafın sembolü ve adı · 2 yapımların sembolleri (yoksa logosu) · 3 sembol ekleme penceresi', Visual: KoleksiyonVisual }],
  },
  {
    version: 'v1.9.5',
    date: '27 Eylül 2026',
    title: 'Daha hızlı ARGUS, yedekleme, puan hatırlatması, film serileri, oyuncu ve yönetmen sayfası',
    items: [
      'ARGUS artık daha hızlı: açılırken arayüz birkaç saniyede hazır hale getiriliyor ve sayfalar o hazır halden açılıyor. Arşiv tablosunun açılışındaki takılma yarıdan fazla azaldı, detay penceresi iki kat hızlı açılıyor. Tarayıcı da ARGUS hazır olunca açılıyor. Kayıtları kaydetmek de biraz hızlandı.',
      'Yeni: Yedekleme (Ayarlar › Veritabanı › Yedekleme). Bir klasör seçiyorsun — OneDrive ya da Google Drive klasörünü seçersen yedeklerin kendiliğinden buluta da gider. "Şimdi yedek al" ile ya da her gün / her hafta kendiliğinden: önce arşivlerin, ayarların ve geçmişin (birkaç saniye), sonra görsellerin sadece yenileri kopyalanır; ilk yedek uzun sürer, sonrakiler kısa. İş arka planda sürer, bu arada ARGUS\x27u kullanmaya devam edebilirsin. Aynı yerden bir yedeği geri yükleyebilirsin (şu anki verin silinmez, kenara alınır).',
      'Bir şeyi İzlendi yaptığında (tablodan, takvimden, Ne İzlesem\x27den ya da bir dizinin son bölümünü işaretleyince) puanı boşsa sağ altta küçük bir kart "Kaç puan verirsin?" diye soruyor. "Sonra" ya da "Bir daha sorma" diyebilirsin.',
      'Film serileri: detay penceresinde film bir serinin parçasıysa (Harry Potter, Transformers...) serinin bütün filmleri sırasıyla çıkıyor — kaçını izlediğin, sıradaki hangisi; arşivinde olmayanları tek tıkla İzlenecek\x27e ekleyebilirsin.',
      'Oyuncu ve yönetmen sayfası: detay penceresinde bir oyuncuya ya da Bilgiler\x27deki yönetmen adına tıklayınca hayatı, arşivindeki yapımları (izlediklerin işaretli) ve arşivinde olmayan en bilinen işleri geliyor; tek tıkla İzlenecek\x27e ekleyebilir ya da önizlemesine bakabilirsin.',
      'Arşiv tablosunda arama yapınca önce adı eşleşenler geliyor: "harry" yazınca en üstte Harry Potter filmleri, sonra adında değil de başka bir yerinde (oyuncu, özet...) geçenler.',
      'TMDB eşleştirmesi iyileşti: aynı adlı eski bir yapım (ör. "Transformers" ararken 1986 çizgi filmi) yanlışlıkla seçilmiyor.',
    ],
    visuals: [
      { caption: 'Yedekleme — 1 klasör seç (OneDrive / Google Drive buluta gider) · 2 arka planda ilerleme · 3 yedekten geri yükle', Visual: YedekVisual },
      { caption: '1 film serisi: kaçını izledin, eksikleri ekle · 2 oyuncu / yönetmen sayfası · 3 izledikten sonra puan kartı', Visual: SeriKisiVisual },
    ],
  },
  {
    version: 'v1.9.4',
    date: '27 Eylül 2026',
    title: 'Detay penceresinde oyuncular',
    items: [
      'Detay penceresinde aşağı kaydırmışken bir oyuncuya tıklayınca açılan pencere sayfanın en üstünde açılıyordu, fark edilmiyordu — artık ekranın ortasında açılıyor. Aynı sorun "Benzer İçerikler"den açılan önizlemede de düzeltildi.',
      'Detay penceresindeki oyuncu fotoğrafları artık yuvarlak değil, dikey (afiş gibi) kartlar; hepsi aynı hizada ve yüzler üstten hizalı.',
      'Oyuncu penceresinde doğum yerinin başında "us" gibi harfler görünüyordu (bayrak işareti), temizlendi.',
    ],
    visuals: [{ caption: '1 dikey oyuncu kartları · 2 oyuncu penceresi, nerede olursan ol ekranın ortasında', Visual: OyuncuPencereVisual }],
  },
  {
    version: 'v1.9.3',
    date: '27 Eylül 2026',
    title: 'İzleme tarihinde başlangıç → bitiş',
    items: [
      'İzleme Tarihi\x27ne artık bitiş günü de eklenebiliyor (Notion\x27daki "end date" gibi): dün başlayıp bugün bitirdiysen tarihin yanındaki → ile bitişini seç, "09.08.24 → 12.08.24" olarak görünür. Tabloda, detay penceresinde, sıralamada ve İstatistikler\x27de bitiş günü esas alınıyor.',
      'Takvimde aralıklı izlemeler başladığın gün "Başladın", bitirdiğin gün "Bitirdin" olarak görünüyor. Takvimden bir film eklerken son 30 gün içinde başlayıp bitirmediğin bir izlemesi varsa "Bu gün bitirdim" ya da "Yeni bir izleme" diye soruyor; bir diziyi "bu gün bitirdim" diye eklerken de tarih ilk izlediğin bölümün gününden başlıyor.',
      'Bir dizinin bütün bölümlerini işaretleyince yazılan İzleme Tarihi artık sadece son günü değil, ilk bölümü izlediğin günden son bölümü izlediğin güne kadar olan aralığı gösteriyor.',
      'Notion\x27dan aktarılan ve "başlangıç → bitiş" olan izleme tarihleri iki ayrı tarihe bölünmüştü (takvim bunları "tekrar izledin" sanıyordu); tek aralık olarak düzeltildi. Notion\x27dan yeni içe aktarmalarda da aralıklar doğru geliyor.',
    ],
    visuals: [{ caption: '1 tarihin yanındaki → ile bitiş günü · 2 takvimde Başladın / Bitirdin · 3 dizi bitince ilk → son bölüm günü', Visual: TarihAraligiVisual }],
  },
  {
    version: 'v1.9.2',
    date: '27 Eylül 2026',
    title: 'Bildirimler, bitince kendiliğinden İzlendi, yeni sezon haberleri',
    items: [
      'Üst menüde yeni bir zil var: bildirimler burada birikiyor, okunmamış sayısı zilin üstünde yazıyor. Bir bildirime tıklayınca o kaydın detayı açılıyor; "Hepsini okundu say" ve "Temizle" de var. Uygulama açıkken yeni bir bildirim gelirse köşede kısa bir kart olarak da görünüyor.',
      'Bir dizinin çıkmış bütün bölümlerini işaretleyince durumu kendiliğinden İzlendi oluyor ve son izlediğin bölümün tarihi İzleme Tarihi\x27ne ekleniyor. Bildirimde dizinin bitip bitmediği de yazıyor ("Dizi bitti" ya da "Yeni sezon çıkınca haber vereceğim"). Tersi de var: bitmiş bir dizide bir bölümün işaretini kaldırırsan durum İzleniyor\x27a geri dönüyor.',
      'İzlendi dizilerine yeni bölüm çıkınca durum kendiliğinden İzleniyor\x27a geçiyor ve bildirim geliyor. Yeni sezonun tarihi açıklanınca da bir kez haber veriliyor ("4. sezon 12 Mart\x27ta başlıyor").',
      'Detay penceresinde dizilerin yanında TMDB\x27ye göre durumu yazıyor: "Dizi bitti", "Dizi iptal edildi", "Yeni sezon bekleniyor" ya da tarih belliyse "4. sezon: 12 Mart". Final mi sezon finali mi diye düşünmene gerek kalmıyor.',
      'Telefonda üst menü biraz sıkılaştırıldı, sayfa adları daha rahat sığıyor.',
    ],
    visuals: [{ caption: '1 zil ve okunmamış sayısı · 2 bildirim listesi · 3 detayda dizinin durumu (bitti / yeni sezon)', Visual: BildirimVisual }],
  },
  {
    version: 'v1.9.1',
    date: '27 Eylül 2026',
    title: 'Arşiv geçmişi, kaydın ne zaman eklendiği; Ne İzlesem sonuç ekranı düzeltmeleri',
    items: [
      'Yeni: Arşiv geçmişi. ARGUS artık arşivindeki her eklemeyi, değişikliği ve silmeyi kendiliğinden kaydediyor. Tablodaki yeni "Geçmiş" (saat) düğmesinden gün gün ne değiştiğini görürsün: "3 eklendi · 5 değişti · 1 silindi", değişenlerde hangi alanın neyden neye döndüğü (ör. Durum: İzlenecek → İzlendi). Her birini tek tıkla geri alabilirsin — yanlışlıkla sildiğin bir kaydı "Geri getir"le geri getirirsin. Arşivin her günün başındaki hali de saklanıyor; "Arşivi bu hale döndür" ile bütün arşivi o güne döndürebilirsin (dönmeden önceki hal de saklanır, fikrini değiştirirsen geri gelirsin).',
      'Geçmiş için 5 GB yer ayrıldı. Dolarsa sana soruluyor: alanı 5 GB daha artırayım mı, yoksa en eski geçmişten başlayarak sileyim mi? Cevap vermezsen hiçbir şey silinmez. Geçmiş penceresindeki "⚙ Alan ayarları"ndan ne kadar yer kullanıldığını görür, sınırı değiştirir (1–50 GB ya da istediğin bir değer) ya da istediğin an en eskilerden silip yer açarsın.',
      'Tablodaki satırların altı nokta menüsünün altında artık o kaydın ne zaman eklendiği, en son ne zaman değiştiği ve son değişiklikleri yazıyor; "Tüm geçmişi" ile sadece o kaydın geçmişini açarsın. (Notion\x27dan aktardıklarında eklenme tarihi olarak aktarıldıkları gün görünür — Notion o bilgiyi vermiyor.)',
      'Ne İzlesem\x27in sonuç ekranında "Fragman · Nerede izlenir"e ya da "Detayı aç"a basınca bulunan sonuç kayboluyordu — artık pencere sonucun üstünde açılıyor, kapatınca aynı sonuca geri dönüyorsun.',
      '"↻ Tekrar getir" artık sağ üstte, "Kapat"ın solunda: mavi çerçeveli, üzerine gelince mavi doluyor. "Kapat" da kırmızı çerçeveli, üzerine gelince kırmızı doluyor. Alttaki ikinci "Kapat" kaldırıldı.',
    ],
    visuals: [
      { caption: 'Arşiv geçmişi — 1 altı nokta menüsünde eklenme ve değişiklik tarihleri · 2 her değişiklik geri alınabilir · 3 kullanılan alan; ⚙ Alan ayarları ile sınırı değiştir', Visual: GecmisVisual },
      { caption: '1 sağ üstte Tekrar getir (mavi) ve Kapat (kırmızı) · 2 fragman penceresi sonucun üstünde açılır, kapatınca sonuç yerinde', Visual: NeIzlesemPencereVisual },
    ],
  },
  {
    version: 'v1.9',
    date: '27 Eylül 2026',
    title: 'Yeni: Takvim · her yerde çoklu ve ters filtre, yeni Ne İzlesem sonuç ekranı, durdurup devam ettirilebilen Genel Güncelleme',
    items: [
      'Yeni Takvim sayfası (profil menüsü › Takvim): ay ay hangi gün ne izlediğini posterleriyle görürsün. Bir günde birden fazla şey varsa hepsi alt alta sıralanır, o günün kutusu uzar. Dizilerde bölüm bölüm görünür (ör. "8 bölüm · S1 · B1–B8"), diziyi bitirdiğin gün "bitirdin", tekrar izlediğin film "↻" ile işaretli. Üstte ayın özeti var: kaç film, kaç bölüm, kaç saat, kaç gün.',
      'Takvim ileriye de bakıyor: izlediğin dizilerin çıkacak bölümleri ve izleneceklerindeki filmlerin vizyon tarihleri kesik çizgiyle görünüyor.',
      'Takvimde bir günün numarasına tıklayınca yanda o gün açılıyor; oradan "Bu gün şunu izledim" diye arşivinde arayıp tarihi o güne ekleyebilirsin. Dizi seçersen sezon sezon hangi bölümleri izlediğini işaretliyorsun ("Bu sezonun hepsini seç" de var), istersen "diziyi bu gün bitirdim" diyorsun. Yanlış eklediğini ya da o güne ait bir kaydı yanındaki × ile o günden kaldırabilirsin — kaydın kendisi silinmez.',
      'Takvimde ekleme kutusunda yazmadan önce en son izlediğin 4 içerik "Son izlediklerin" olarak hazır duruyor, tek tıkla seçiliyor. Her içeriğin altında daha önce ne zaman izlediğin yazıyor (filmde kaç kez ve en son ne zaman, dizide en son hangi bölüm); bölüm listesinde de daha önce izlediğin bölümlerin yanında tarihi çıkıyor. Yine de eklenebiliyor — bir şeyi birkaç günde izlediysen her gün için ayrı ayrı ekleyebilirsin.',
      'Takvimden açılan detay penceresinde de tablodaki gibi bölüm işaretleyip tekrar izleme tarihi ekleyebiliyorsun; pencereyi kapatınca takvim hemen güncelleniyor.',
      'Takvimin Yıl görünümü: yılın bütün günleri renkli kutucuklarla (ne kadar koyu, o gün o kadar çok izleme), izleme yaptığın gün sayısı, en uzun serin, şu anki serin ve en yoğun ayın. Filtre de var (ör. sadece diziler ya da ✕ Animasyon). İstatistikler\x27deki aylık grafikte bir aya tıklayınca takvim o ayda açılıyor.',
      'Ana sayfada yeni "Geçmiş yıllarda bugün" satırı: önceki yıllarda bugün ne izlediğini gösteriyor ("1 yıl önce"). O gün için bir şey yoksa görünmüyor; Ana Sayfa Ayarları\x27ndan kapatılabilir ve kaçıncı satırda olacağı seçilebilir.',
      'Ne İzlesem\x27in sonuç ekranı yenilendi: animasyon bitince mavi ışıklı ekranda seçilen içeriğin posteri (ya da yatay görseli), yanında logosu, bilgileri, türleri ve kısa özeti çıkıyor; altta "↻ Tekrar getir". TMDB\x27den geldiyse "+ İzleneceklere ekle", "İzledim", "Bir daha gösterme"; arşivinden geldiyse durumuna göre soruyor: izlenecekse "Başlıyorum", izliyorsan "Bitirdim", izlediysen "Bugün yine izledim".',
      'Genel Güncelleme\x27yi durdurup sonra kaldığın yerden devam ettirebiliyorsun — sayfa yenilense ya da ARGUS kapanıp açılsa bile "▶ Devam et" düğmesi kalan kayıtlarla bekliyor.',
      'Genel Güncelleme sürerken tablonun üstünde ayrıntı kutusu var: ilerleme çubuğu, şu an hangi kaydın doldurulduğu, kaç güncellendi / kaç bulunamadı, tahmini kalan süre ve her kayıtta nelerin eklendiği (ör. "Film · eklendi: Poster, Banner, Tür").',
      'Dişli menüsü ("TMDB\x27den neler gelsin?") daha anlaşılır: her alanın ARGUS\x27ta ne işe yaradığı ve hangi sütununa yazacağı yazıyor. Sütunun adı farklıysa (ör. Sinopsis yerine "Özet") oradan o sütunu seçebilirsin; hiç yoksa aynı yerden yeni sütun eklersin. "Hepsini aç" düğmesi de var. Genel Güncelleme öncesi pencere de sütunu bulunamayan alan için "var olan şu sütuna mı yazayım, yeni mi açayım?" diye soruyor.',
      'Filtre olan her yerde artık birden fazla seçim ve "gelmesin" var: arşiv tablosu, vitrin, Ne İzlesem, Sayfalar ve Modlar. Bir sütunu açıp değere bir kez tıklarsan ✓ gelsin, iki kez tıklarsan ✕ gelmesin. Birden fazla sütunda seçim yapabilirsin (ör. Tür: ✓ Korku ✕ Komedi, Ülke: ✕ ABD) — hepsi birlikte uygulanır.',
      'Keşfet\x27te ve Ne İzlesem\x27in TMDB modunda da türler için ✓ gelsin / ✕ gelmesin seçilebiliyor.',
      'Sağlık Kontrolü\x27nde yeni "Sorulmayanlar" listesi: "bir daha sorma" dediğin alanları kayıt kayıt görüp ↺ ile tek tek ya da bir alanın hepsini birden yine sorulur yapabilirsin.',
      'Genel Güncelleme\x27den önce, tablonda bazı sütunlar yoksa (ör. Kapak Adı) ya da dişli menüsünden bazı alanları kapattıysan küçük bir pencere çıkıyor: hepsinin gelmesini öneriyor ve eksik sütunlar da gelsin mi diye soruyor. "Gelmesin" dediğin alan için tabloya boş sütun eklenmiyor. İçe aktarma bitince de bu öneri yazıyor.',
      'Genel Güncelleme sürerken "yeni güncelleme var" sorusu artık çıkmıyor, iş bitince soruluyor — önceden "Şimdi Güncelle"ye basılırsa sayfa yenilenip güncelleme yarıda kalıyordu. Kayıtlar da artık daha güvenli yazılıyor: yazma anında ARGUS kapanırsa dosya yarım kalmıyor.',
    ],
    visuals: [
      { caption: 'Takvim — 1 bir günde ne varsa alt alta, kutu uzar · 2 kesik çizgili: yaklaşan bölüm / vizyon', Visual: TakvimAyVisual },
      { caption: 'Gün paneli — 1 × ile o günden kaldır · 2 son izlediklerin, tek tık · 3 bölüm seç; ✓ olanları daha önce izlemişsin', Visual: TakvimGunVisual },
      { caption: 'Takvim, Yıl görünümü — 1 izleme günü, en uzun seri, şu anki seri, en yoğun ay', Visual: TakvimYilVisual },
      { caption: 'Çoklu ve ters filtre — 1 seçtiklerin üstte · 2 bir tık ✓, iki tık ✕ · 3 filtre olan her yerde', Visual: CokluFiltreVisual },
      { caption: 'Ne İzlesem sonucu — 1 poster ve mavi ışık · 2 logo, bilgiler, özet · 3 ekle / izledim; altta Tekrar getir', Visual: NeIzlesemSonucVisual },
      { caption: 'Genel Güncelleme — 1 o an ne yaptığı · 2 her alan hangi sütuna yazacak · 3 durdur, sonra devam et', Visual: GenelGuncellemeVisual },
    ],
  },
  {
    version: 'v1.8.2',
    date: '26 Eylül 2026',
    title: 'Otomatik satırlara gelsin / gelmesin filtresi, ülke etiketleri düzeldi',
    items: [
      'Ana Sayfa Ayarları → "En altta otomatik doldur" açıkken artık hangi satırların gelip hangilerinin gelmeyeceğini seçebiliyorsun: bir sütunu (Tür, Ülke...) açıp değerlere tıkla — bir kez tıklayınca ✓ gelsin, bir daha tıklayınca ✕ gelmesin. İkisinden de istediğin kadar seçebilirsin; bir sütunun tamamını da "Hiç gelmesin" ile kapatabilirsin.',
      'TMDB\x27den doldururken yeni eklenen ülke etiketlerinin başında bayrak işareti (bazı yerlerde "HR", "CH" gibi harf olarak görünüyordu) ve İngilizce ad ("Croatia") çıkıyordu. Artık diğer ülkeler gibi sade Türkçe ad yazılıyor; arşivindeki bu şekilde eklenmiş 6 ülke de düzeltildi (Hırvatistan, Porto Riko, İsviçre, Kenya, Yunanistan, Romanya).',
    ],
    visuals: [
      { caption: '1 ✓ gelsin / ✕ gelmesin · 2 bir sütunun tamamını kapat · 3 ülke adları Türkçe ve bayraksız', Visual: OtomatikFiltreVisual },
    ],
  },
  {
    version: 'v1.8.1',
    date: '26 Eylül 2026',
    title: 'Yenilenen arşiv tablosu, detay penceresi, menü ve arama; vitrin görünümleri, En İyi 10, İstatistikler, Ayarlar ve Yardım Merkezi',
    items: [
      'Ayarlar\x27ın iç sekmeleri yenileniyor: API anahtarı artık gizli görünüyor (göster düğmesiyle) ve bağlantı durumu yazıyor; İçe Aktar\x27da dosyayı sürükleyip bırakabiliyorsun; Şablonlar, Sayfalar, Modlar ve Ne İzlesem düzenlendi. Keşfet ve Sağlık Kontrolü pencereleri yenilendi; Sağlık Kontrolü\x27nde arşivin yüzde kaçının sağlıklı olduğu yazıyor. Tablo rehberi yeni araç çubuğuna göre güncellendi. Arama açıkken sağda çıkan ikinci kaydırma çubuğu kaldırıldı.',

      'Üst menü ve profil menüsü yenilendi: profil resmin yuvarlak, menüde profilin en üstte, diğer profillere tek tıkla geçiş, ikonlu satırlar ve Koyu/Açık tema düğmesi. Telefonda sayfa bağlantıları artık iki satıra kaymıyor.',
      'Arama yenilendi: klavyeden "/" ile açılıyor; aradığın isim bir oyuncuya, türe ya da ülkeye uyuyorsa onlar fotoğraflı olarak en üstte çıkıyor; sonuçlar "Adında geçenler" ve "Diğer eşleşmeler" diye ayrılıyor.',
      'Ne İzlesem animasyonunda hangi aşamada olduğu daha belirgin yazıyor; yarıda kesmek için "Vazgeç" düğmesi ve Esc tuşu var.',
      'Kayıt detayı penceresi baştan yenilendi: poster, Kapak Adı logosu ve renkli etiketler (puan, durum, kategori, yıl, süre) büyük görselin üzerine biniyor; altında solda özet, bölümler, yuvarlak fotoğraflı oyuncular (ızgara halinde, "Tümünü göster" ile hepsi) ve benzer içerikler, sağda kaydırırken yanında kalan bir bilgi sütunu: kriter kriter "Puanın", izleme tarihlerin ve kaç bölüm izlediğin, bilgiler ve Nerede İzlenir. Fragman düğmeleri artık üstte, Kapat\x27ın yanında.',
      'Sezon düğmelerinde o sezondan kaç bölüm izlediğin yazıyor (7/10), sezonun hepsi izlendiyse ✓.',
      'Arşiv tablosu yenilendi: üstte tek tıkla durum filtresi (Hepsi · İzlendi · İzlenecek · Yarım · İzleniyor, sayılarıyla), kaydın adının yanında küçük afiş, sağa kaydırınca solda sabit kalan ad sütunu, hücreye sığmayan etiket ve tarihler için "+2" gibi sayılar.',
      'Tabloda yeni "Rahat" görünüm (daha büyük satır ve afiş) — üç çizgili simgeyle Sıkı/Rahat arasında geçiliyor. Araç çubuğu gruplara ayrıldı, simgelerin üzerine gelince ne işe yaradıkları yazıyor; başlıkta kaç kayıt olduğu, filtre açıkken altta kaç tanesinin gösterildiği görünüyor.',
      'İstatistikler yenilendi: yeni özet kutucukları (izlenecek sayısı, bu yıl izlediklerin, izlenen oranı), yeni grafikler (son 12 ayda aylara göre izlediklerin, puan dağılımı), oyuncular fotoğraflı kartlarla; grafiklerin üzerine gelince tam sayılar çıkıyor ve açık temada da renkler düzgün.',
      'Vitrin için üç görünüm (Ana Sayfa Ayarları › Görünüm › Vitrin): Klasik (eskisi gibi), Sinema (ekranı kenardan kenara kaplar, menünün arkasına kadar uzanır) ve Slayt (fragman yok; birkaç içerik 8 saniyede bir sırayla değişir, alttaki noktalardan seçilir, fareyle üstüne gelince durur).',
      'Yeni satır: "Arşivindeki En İyi 10" — en yüksek puan verdiğin 10 içerik, yanlarında büyük sıra numaralarıyla. Ayarlar\'dan açılıp kapanıyor.',
      '"Yeni Bölümler" ve "En İyi 10" satırlarının ana sayfada kaçıncı sırada görüneceğini seçebiliyorsun.',
      'Satır başlıklarının büyüklüğü artık ayarlanabiliyor: Küçük, Orta, Büyük.',
      'Ana sayfa ayarlarının bazı durumlarda (sayfa yenilenirken ya da profil değiştirirken) boş ayarlarla üzerine yazılıp menü sayfalarının ve bölümlerin kaybolması düzeltildi.',
      'Yardım Merkezi yenilendi ve güncellendi: konular gruplara ayrıldı (Başlarken, Ana Sayfa, Arşiv, Keşfet ve İzle, Diğer), her konuda nereden ulaşılacağı ve kısa ipuçları var, üstte konu arama kutusu, en altta sık sorulan sorular. Keşfet, Sağlık Kontrolü, TMDB ile doldurma, Yeni Bölümler, En İyi 10, Nerede İzlenir, İstatistikler ve tema gibi eksik anlatılan her şey eklendi.',
      'Ayarlar ekranı yenilendi: soldaki menüde her bölümün ikonu ve kısa açıklaması var, içerik düzenli bir kartın içinde; telefonda menü üstte yatay duruyor. Hangi sekmede kaldığını da hatırlıyor.',
      'Ana Sayfa Ayarları › Görünüm artık Genel, Vitrin ve Satırlar diye başlıklı kartlara ayrılmış; alt sekmeler de daha kolay seçilen düğmeler oldu.',
      'Veritabanı\'ndaki arşiv kartları yenilendi; ana sayfada gösterilen arşivin yanında "Ana sayfada" yazıyor.',
      'Yama Notları ekranı yenilendi: üstte kurulu sürüm ve son güncelleme, altında tek tıkla istediğin sürüme atlayabildiğin bir şerit, güncellemeler de güne göre gruplu.',
      'En yeni sürümler açık, eskiler katlı geliyor — başlığa tıklayınca açılıyor, istersen "Hepsini aç".',
      'Çizimlere tıklayınca büyük hali açılıyor.',
      'v1.7, v1.7.1 ve v1.8 notlarına da neyin değiştiğini gösteren çizimler eklendi.',
    ],
    visuals: [{ caption: 'Sinema vitrini ve Arşivindeki En İyi 10', Visual: SinemaVisual }],
  },
  {
    version: 'v1.8',
    date: '25 Eylül 2026',
    title: 'Filtreden dönüş düzeltmesi, Güncelle',
    items: [
      'Tablodan bir içeriğin detayına girip oyuncu filtresine geçince, "Filtreyi Kaldır ve Geri Dön" artık tablonun başına değil, tam kaldığın yere dönüyor.',
      'Altı nokta menüsündeki ve detay penceresindeki TMDB düğmesi artık her kayıtta "Güncelle" yazıyor — önceden kayda göre bazen "TMDB\'den Doldur" bazen "Bölümleri Güncelle" yazıyordu ama hepsi aynı işi yapıyordu.',
    ],
    visuals: [
      { caption: "Altı nokta menüsünde her kayıtta \"Güncelle\"", Visual: GuncelleVisual },
    ],
  },
  {
    version: 'v1.7.1',
    date: '24 Eylül 2026',
    title: 'Onay soruları tıkladığın yerde',
    items: [
      '"Silmek istediğine emin misin?" gibi sorular artık ekranın sağ alt köşesinde değil, tıkladığın düğmenin hemen yanında çıkıyor.',
    ],
    visuals: [
      { caption: "Onay sorusu tıkladığın düğmenin yanında", Visual: OnayYeriVisual },
    ],
  },
  {
    version: 'v1.7',
    date: '24 Eylül 2026',
    title: 'Gizli sütunlar, Kapat düğmesi, Benzer İçerikler, puan kaldırma',
    items: [
      'Bazı sütunlar gizliyken başka bir sütunu sürükleyip yerini değiştirince gizli sütunlar tablodan kayboluyordu; TMDB araması da yerlerine boş yenilerini açıyordu. Artık gizli sütunlar olduğu yerde kalıyor.',
      'Tablodaki bir hücreyi düzenlerken (puan, tür, tarih…) açılan kutuda artık "Kapat" düğmesi var — kapatmak için boş bir yere tıklamana gerek yok.',
      'Detay penceresindeki "Benzer İçerikler"de bir afişe ya da ada tıklayınca o içeriğin detay penceresi açılıyor: görsel, fragman, özet, nerede izlenir ve ekleme düğmeleri.',
      'Veritabanındaki detay penceresinden bir oyuncuya (ya da türe, ülkeye) tıklayıp filtreye geçtiysen, "Filtreyi Kaldır ve Geri Dön" seni artık ana sayfaya değil, kaldığın yere — tabloya ve açık olan detay penceresine — geri götürüyor.',
      'Tablodaki puanı artık kaldırabiliyorsun: her kriterin yanındaki × ile tek tek, altta "Puanı kaldır" ile tamamen.',
      'Tabloda bir kaydı TMDB\'den doldurunca (ya da Genel Güncelleme sırasında) sayfa artık en başa sıçramıyor, kaldığın yerde kalıyor.',
    ],
    visuals: [
      { caption: "Gizli sütunlar sürüklemede kaybolmuyor", Visual: GizliSutunVisual },
      { caption: "Puan kutusu: × ile kaldır, Kapat düğmesi", Visual: KapatPuanVisual },
      { caption: "Benzer İçerikler'den detay penceresi", Visual: BenzerDetayVisual },
      { caption: "Filtreden kaldığın yere dönüş", Visual: FiltreDonusVisual },
    ],
  },
  {
    version: 'v1.6.4',
    date: '23 Eylül 2026',
    title: 'Yama notlarında çizimler',
    items: ['Yama notları artık neyin değiştiğini ya da eklendiğini küçük çizimlerle de gösteriyor.'],
  },
  {
    version: 'v1.6.3',
    date: '23 Eylül 2026',
    title: '"Şimdi Güncelle" düzeltmesi',
    items: [
      '"Şimdi Güncelle"ye basınca ARGUS artık gerçekten yeni sürümle yeniden başlıyor — önceden bazı yeni özellikler uygulamayı elle kapatıp açana kadar çalışmıyordu.',
      'Güncellemeden sonra fazladan bir tarayıcı sekmesi açılmıyor; sayfa, yeni sürüm hazır olunca kendiliğinden yenileniyor.',
    ],
  },
  {
    version: 'v1.6.2',
    date: '23 Eylül 2026',
    title: "Ne İzlesem TMDB'den de seçebiliyor",
    items: [
      "Ne İzlesem artık arşivinde olmayan içeriklerden de seçebiliyor: Ana Sayfa Ayarları → Ne İzlesem'de \"Nereden seçilsin\" kısmından TMDB'yi seç; film, dizi ya da karışık, tür ve popüler/en yüksek puanlı seçilebiliyor.",
      'Kazanan çıkınca arşivdeki detay penceresi gibi bir önizleme açılıyor: yatay görsel, Kapak Adı logosu, fragman, özet, türler ve Türkiye\'de nerede izlenebildiği; tek tıkla izleneceklere ekle, izlediysen tarih ve puanla kaydet ya da bir daha gösterme.',
      'Ne İzlesem\'in animasyonu ve açtığı pencere artık sayfa aşağı kaydırılmışken kaybolmuyor, tablonun arkasında da kalmıyor.',
      'Detay penceresindeki posterin boyu artık yanındaki yazının uzunluğuna göre değişmiyor, her kayıtta aynı boyda.',
      "Benzer İçerikler ve Keşfet kartlarındaki düğmeler artık hepsi aynı hizada — ad kısa ya da uzun olsun kaymıyor.",
      "Keşfet ve Ne İzlesem'de \"İzledim\" derken izleme tarihi artık zorunlu değil — hatırlamıyorsan \"Hatırlamıyorum\" deyip tarihsiz ekleyebilirsin.",
    ],
    visuals: [
      { caption: "Ne İzlesem: TMDB'den seçim ve önizleme", Visual: NeIzlesemTmdbVisual },
    ],
  },
  {
    version: 'v1.6.1',
    date: '23 Eylül 2026',
    title: 'Keşfet, Nerede İzlenir, Yeni Bölümler',
    items: [
      'Keşfet: arşiv tablosunun sağ üstündeki pusula. Film ya da dizi, tür, sayı ve sıralama seçip arşivinde olmayan içerikleri getiriyor; beğendiğini "İzlenecek" olarak ekliyorsun, izlediysen tarih ve puanla "İzledim" diyorsun, istemediğini gizliyorsun.',
      'Detay penceresinde "Nerede İzlenir": Türkiye\'de hangi platformda abonelikle, kiralık ya da satın alınarak izlenebildiği — her açılışta güncel bilgi.',
      'Detay penceresinde "Benzer İçerikler": tek tıkla izlenecekler listene ekleyebiliyorsun.',
      'Ana sayfada "Yeni Bölümler": izlemekte olduğun dizilerin yeni çıkan ve bu hafta çıkacak bölümleri en üstte. Ana Sayfa Ayarları\'ndan kapatılabilir.',
      'Sütunların artık bir "Görevi" var (Poster, Durum, Tür…): sütun adlarını istediğin gibi değiştirebilirsin, poster, istatistikler ya da TMDB doldurma bozulmaz.',
      'Sağlık Kontrolü\'nde gerçekten olmayan bir şey (ör. hiç fragmanı olmayan film) için "bir daha sorma" diyebiliyorsun.',
      'Ayarlarda yaptığın değişiklikler artık sayfayı yenilemeden her yerde hemen geçerli.',
      'Sütun menüsündeki açılır listelerden seçim yaparken menünün kapanması düzeltildi.',
      'Bir oyuncuya ya da etikete tıklayınca açılan listede bazen üstte vitrin de çıkması düzeltildi.',
      'Tablonun en altındaki satırlarda altı nokta menüsü artık ekrana sığmıyorsa yukarı doğru açılıyor, tüm seçenekler görünüyor.',
    ],
    visuals: [
      { caption: 'Keşfet: tablonun sağ üstündeki pusula', Visual: KesfetVisual },
      { caption: 'Detay penceresi: Nerede İzlenir ve Benzer İçerikler', Visual: DetayEkleriVisual },
      { caption: 'Ana sayfada Yeni Bölümler', Visual: YeniBolumlerVisual },
      { caption: 'Sütunların "Görevi"', Visual: GorevVisual },
    ],
  },
  {
    version: 'v1.6',
    date: '23 Eylül 2026',
    title: 'Ne İzlesem görsel seçimi, Sağlık Kontrolü, arama iyileştirmeleri',
    items: [
      '"Ne İzlesem?" ayarlarına görsel seçimi eklendi: Dikey (poster), Yatay (banner) ya da Otomatik (önce dikey, yoksa yatay). Kartlar seçilen görselin şekline göre dağılıyor.',
      '"Ne İzlesem?" artık ayarlarda yaptığın değişiklikleri sayfayı yenilemeden hemen kullanıyor.',
      'Açık temada vitrindeki bilgi satırı ve özet yazısı artık okunaklı (siyaha dönmüyor).',
      'Yeni Sağlık Kontrolü paneli: kapak görseli olmayan, eksik bilgili ya da görseli silinmiş kayıtları tek listede gösteriyor.',
      'Sağlık Kontrolü artık her kaydın yanında tam olarak neyinin eksik olduğunu yazıyor, "Yönetmen yok" gibi düğmelerle süzülebiliyor ve "Tümünü göster" ile listenin tamamı açılabiliyor.',
      'Aynı isimde bir kayıt zaten varsa başlığı yazarken uyarı çıkıyor.',
      'Arşiv içindeki arama artık Tür, Ülke, Oyuncular gibi etiketlerde de arıyor.',
      'TMDB güncellemesi, arşivde olmayan sütunları artık kendisi oluşturuyor.',
      'Arşiv tablosunun sağ üstüne "i" (rehber) butonu eklendi — tablonun nasıl kullanıldığını, hangi sütun tipinin ne için seçileceğini ve oyuncu eklemeyi çizimlerle anlatıyor.',
      'Sütun adları düzenlendi: "video", "sinopsis" ve "KAPAK ADI" artık "Video", "Sinopsis" ve "Kapak Adı" — hepsi aynı yazım düzeninde.',
    ],
    visuals: [
      { caption: 'Ne İzlesem: dikey / yatay görsel', Visual: GorselSekliVisual },
      { caption: 'Sağlık Kontrolü: neyin eksik olduğu', Visual: SaglikVisual },
      { caption: 'Tablo rehberi (i butonu)', Visual: RehberVisual },
    ],
  },
  {
    version: 'v1.5',
    date: '22 Eylül 2026',
    title: 'Versiyon numarası, tek tıkla güncelleme',
    items: [
      'Artık her sürümün bir numarası var (pp menüsünde görünür) — güncellendiğini anlamak kolaylaştı.',
      'Sağ altta "yeni güncelleme var" bildirimi çıkınca artık orada bekleyip uygulamayı yeniden açmana gerek yok, "Şimdi Güncelle"ye basman yeterli.',
    ],
  },
  {
    version: 'v1.4',
    date: '22 Eylül 2026',
    title: 'Toplu işlemler, açık tema, güvenlik',
    items: [
      'Açık (beyaz) tema eklendi — sağ üstteki profil menüsünden değiştirilebiliyor.',
      '"Ne İzlesem?" — arama kutusunun yanındaki butona tıklayınca arşivinden rastgele bir kayıt seçip detayını açıyor.',
      'Seçim/Çoklu Seçim sütunlarında toplu seçenek silme, herhangi bir sütunun değerini tüm kayıtlarda tek seferde temizleme.',
      'Var olan bir arşive sonradan toplu görsel ekleme (dosya adı kaydın başlığıyla eşleşince otomatik yükleniyor).',
      'TMDB güncellemesi artık "dolu alanların da üzerine yazılsın mı" diye sorabiliyor, hata mesajları daha açıklayıcı.',
      'Vitrindeki ve kart üzerine gelince açılan videoların oynatması artık birbirini engellemiyor, aşağı kaydırınca duruyor.',
      'Güvenlik: koda gömülü olan bir API anahtarı kaldırıldı.',
    ],
  },
  {
    version: 'v1.3',
    date: '20-21 Eylül 2026',
    title: 'Mod satırı, bölüm/sezon takibi',
    items: [
      '"Bunları da İzle" mod satırı — ruh haline göre öneri, 10 hazır mod ve görselleriyle geliyor, kendi modlarını da ekleyebiliyorsun.',
      'Dizilerde bölüm bazlı izleme takibi ve tekrar izleme tarihleri.',
      'Ana Sayfa Ayarları yeniden düzenlendi — görünüm tarzı (Yatay/Dikey), kart boyutu, vitrin, sayfalar hepsi tek yerde.',
    ],
  },
  {
    version: 'v1.2',
    date: '14-15 Eylül 2026',
    title: 'TMDB entegrasyonu, puanlama',
    items: [
      'TMDB\'den otomatik doldurma (poster, oyuncular, tür, sinopsis, fragman, yaş sınırı) — kendi ücretsiz API anahtarınla.',
      'Kriter bazlı puanlama sistemi (Senaryo, Oyunculuk gibi kendi kriterlerini tanımlayabiliyorsun).',
      'Notion\'dan CSV ile içe aktarma.',
    ],
  },
  {
    version: 'v1.1',
    date: '11 Eylül 2026',
    title: 'Bulutsuz, tamamen yerel',
    items: [
      'ARGUS tamamen bu bilgisayarda çalışacak şekilde yeniden kuruldu — internete ya da bir hesaba ihtiyaç yok, tüm veriler bu klasörde gerçek dosyalar olarak duruyor.',
      'Birden fazla profil desteği ("Kim izliyor?" ekranı) — her profilin kendi arşivleri/ayarları.',
    ],
  },
  {
    version: 'v1.0',
    date: 'Başlangıç',
    title: 'ARGUS\'un temelleri',
    items: [
      'Notion\'daki gibi kendi arşivlerini oluşturup istediğin sütunları ekleyebildiğin, Galeri/Tablo görünümlü bir uygulama.',
    ],
  },
]

// Kullanıcı "yama notları ekranı daha güzel olabilir" dedi. Düzen: üstte kurulu sürüm + kısa
// istatistikler, altında tek tıkla bir sürüme atlanan şerit, sonra GÜNE göre gruplanmış bir zaman
// çizelgesi (aynı güne birden çok sürüm düşebiliyor — bkz. numara kuralı). En yeni sürüm öne
// çıkarılıyor; liste uzadığı için sadece ilk birkaç sürüm açık başlıyor, gerisi başlığa tıklayınca
// açılıyor. Çizimlere tıklayınca büyük hali açılıyor.
const OPEN_BY_DEFAULT = 3

type Visual = NonNullable<PatchEntry['visuals']>[number]

function groupByDate(entries: PatchEntry[]) {
  const groups: { date: string; entries: PatchEntry[] }[] = []
  for (const e of entries) {
    const last = groups[groups.length - 1]
    if (last && last.date === e.date) last.entries.push(e)
    else groups.push({ date: e.date, entries: [e] })
  }
  return groups
}

// "24 Eylül 2026" → gün "24", geri kalanı "Eylül 2026"; "Başlangıç" gibi tarih olmayanlar olduğu gibi.
function splitDate(date: string) {
  const m = date.match(/^([\d–-]+)\s+(.+)$/)
  return m ? { day: m[1], rest: m[2] } : { day: '', rest: date }
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}

function StatTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 sm:px-4 py-2.5 sm:py-3 text-left min-w-0">
      <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-neutral-500 truncate">{label}</p>
      <p className="text-base sm:text-lg font-semibold mt-0.5 truncate" style={accent ? { color: BRAND_TEXT } : undefined}>
        <span className={accent ? undefined : 'text-neutral-100'}>{value}</span>
      </p>
    </div>
  )
}

function VisualZoom({ visual, onClose }: { visual: Visual; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const { Visual: V, caption } = visual
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <figure className="w-full max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-950 p-4" onClick={(e) => e.stopPropagation()}>
        <V />
        <figcaption className="flex items-center justify-between gap-3 mt-3">
          <span className="text-sm text-neutral-300">{caption}</span>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-50 transition">
            Kapat
          </button>
        </figcaption>
      </figure>
    </div>
  )
}

function EntryCard({
  entry,
  latest,
  open,
  onToggle,
  onZoom,
}: {
  entry: PatchEntry
  latest: boolean
  open: boolean
  onToggle: () => void
  onZoom: (v: Visual) => void
}) {
  const visuals = entry.visuals ?? []
  const summary = [`${entry.items.length} değişiklik`, visuals.length ? `${visuals.length} çizim` : ''].filter(Boolean).join(' · ')
  return (
    <article
      id={`surum-${entry.version}`}
      className={`scroll-mt-24 relative overflow-hidden rounded-2xl border transition ${
        latest ? 'border-[#00c0fa]/40 bg-[#00c0fa]/[0.05]' : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700'
      }`}
    >
      {latest && <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: BRAND_GRADIENT }} />}
      <button onClick={onToggle} className="w-full text-left px-5 py-4 flex items-start gap-3">
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${latest ? 'text-white' : 'bg-neutral-800 text-neutral-300'}`}
          style={latest ? { background: BRAND_GRADIENT } : undefined}
        >
          {entry.version}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-neutral-50">{entry.title}</span>
            {latest && (
              <span className="text-[10px] font-bold tracking-wide text-emerald-400 bg-emerald-400/10 border border-emerald-400/25 rounded-full px-2 py-0.5">
                YENİ
              </span>
            )}
          </span>
          {!open && <span className="block text-xs text-neutral-500 mt-1">{summary}</span>}
        </span>
        <span className="text-neutral-500 mt-1 shrink-0">
          <ChevronIcon open={open} />
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 -mt-1">
          <ul className="space-y-2">
            {entry.items.map((item, j) => (
              <li key={j} className="flex gap-3 text-sm text-neutral-300 leading-relaxed">
                <span
                  className="h-5 w-5 shrink-0 mt-px rounded-full flex items-center justify-center bg-[#00c0fa]/10"
                  style={{ color: BRAND_TEXT }}
                >
                  <CheckIcon />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {visuals.length > 0 && (
            <div className="grid gap-3 mt-5 sm:grid-cols-2">
              {visuals.map((v) => (
                <button
                  key={v.caption}
                  onClick={() => onZoom(v)}
                  className="group text-left rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 hover:border-[#00c0fa]/40 transition"
                >
                  <v.Visual />
                  <span className="flex items-center justify-between gap-2 mt-2 px-0.5">
                    <span className="text-xs text-neutral-400">{v.caption}</span>
                    <span className="text-neutral-600 group-hover:text-[#00c0fa] transition shrink-0">
                      <ZoomIcon />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

export default function YamaNotlari() {
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set(ENTRIES.slice(0, OPEN_BY_DEFAULT).map((e) => e.version)))
  const [zoom, setZoom] = useState<Visual | null>(null)
  const groups = useMemo(() => groupByDate(ENTRIES), [])
  const allOpen = openSet.size === ENTRIES.length
  const latest = ENTRIES[0]

  function toggle(version: string) {
    setOpenSet((prev) => {
      const next = new Set(prev)
      if (next.has(version)) next.delete(version)
      else next.add(version)
      return next
    })
  }

  function jumpTo(version: string) {
    setOpenSet((prev) => new Set(prev).add(version))
    requestAnimationFrame(() => document.getElementById(`surum-${version}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Üst kısım */}
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/60 px-6 pt-10 pb-6 mb-6">
        <div
          className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 h-64 w-[40rem] max-w-[140%] rounded-full blur-3xl opacity-20"
          style={{ background: BRAND_GRADIENT }}
        />
        <div className="relative flex flex-col items-center text-center">
          <img src="/logoblue.png" alt="ARGUS" className="h-14 w-14 mb-4 drop-shadow-[0_0_24px_rgba(0,192,250,0.35)]" />
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-50 tracking-tight">Yama Notları</h1>
          <p className="text-neutral-400 text-sm mt-2 max-w-md">ARGUS'ta zaman içinde neler değişti, neler eklendi — hepsi burada.</p>
        </div>
        <div className="relative grid grid-cols-3 gap-2 sm:gap-3 mt-8">
          <StatTile label="Sürüm" value={APP_VERSION} accent />
          <StatTile label="Güncelleme" value={String(ENTRIES.length)} />
          <StatTile label="En son" value={splitDate(latest.date).day ? `${splitDate(latest.date).day} ${splitDate(latest.date).rest.split(' ')[0]}` : latest.date} />
        </div>
      </section>

      {/* Sürüme atla */}
      <div className="sticky top-16 z-10 -mx-4 px-4 py-2 mb-6 bg-neutral-950/85 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto no-scrollbar">
            {ENTRIES.map((e, i) => (
              <button
                key={e.version}
                onClick={() => jumpTo(e.version)}
                className={`shrink-0 text-xs font-medium rounded-full px-3 py-1.5 border transition ${
                  i === 0
                    ? 'border-[#00c0fa]/40 text-[#00c0fa] bg-[#00c0fa]/10'
                    : 'border-neutral-800 text-neutral-400 hover:text-neutral-50 hover:border-neutral-600'
                }`}
              >
                {e.version}
              </button>
            ))}
          </div>
          <button
            onClick={() => setOpenSet(allOpen ? new Set([latest.version]) : new Set(ENTRIES.map((e) => e.version)))}
            className="shrink-0 text-xs text-neutral-400 hover:text-neutral-50 border border-neutral-800 hover:border-neutral-600 rounded-full px-3 py-1.5 transition"
          >
            {allOpen ? 'Hepsini kapat' : 'Hepsini aç'}
          </button>
        </div>
      </div>

      {/* Güne göre zaman çizelgesi */}
      <div className="space-y-10">
        {groups.map((g) => {
          const { day, rest } = splitDate(g.date)
          return (
            <section key={g.date} className="md:grid md:grid-cols-[112px_1fr] md:gap-6">
              <div className="md:sticky md:top-32 self-start mb-3 md:mb-0 flex md:block items-baseline gap-2">
                {day && <p className="text-2xl md:text-3xl font-bold text-neutral-100 leading-none">{day}</p>}
                <p className="text-xs text-neutral-500 md:mt-1">{rest}</p>
                <p className="text-[11px] text-neutral-600 md:mt-2">{g.entries.length > 1 ? `${g.entries.length} güncelleme` : ''}</p>
              </div>
              <div className="space-y-3">
                {g.entries.map((entry) => (
                  <EntryCard
                    key={entry.version}
                    entry={entry}
                    latest={entry === latest}
                    open={openSet.has(entry.version)}
                    onToggle={() => toggle(entry.version)}
                    onZoom={setZoom}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-12 text-center rounded-2xl border border-neutral-800 bg-neutral-900/40 px-6 py-8">
        <p className="text-sm text-neutral-400 max-w-md mx-auto">
          ARGUS şu an geliştirme aşamasında — değişiklikleri test edip bize geri bildirim verirseniz mutlu oluruz :)
        </p>
      </div>

      {zoom && <VisualZoom visual={zoom} onClose={() => setZoom(null)} />}
    </div>
  )
}
