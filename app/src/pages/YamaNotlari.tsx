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
