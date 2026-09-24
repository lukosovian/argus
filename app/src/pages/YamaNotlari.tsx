// pp menüsündeki "Yama Notları" ile açılan, ARGUS'un geçmiş güncellemelerini anlatan sayfa —
// kullanıcı "yama notları kısmını ekle... yama notlarını alta doğru sırala" dedi. Liste elle
// tutuluyor (otomatik bir kaynak yok) — yeni bir özellik/düzeltme eklendikçe en üste yeni bir
// ENTRIES kaydı eklenmesi yeterli, en yeni en üstte. Numara kuralı (kullanıcı isteği): her yeni
// GÜN bir üst sürüm (v1.6 → v1.7), aynı gün içindeki sonraki güncellemeler o günün alt sürümü
// (v1.6 → v1.6.1 → v1.6.2). `version` alanı lib/version.ts'teki
// APP_VERSION ile elle senkron tutulur (kullanıcı "versiyon numarası ekleyelim güncellendiği
// anlaşılmıyo" dedi).
import { APP_VERSION } from '../lib/version'
import {
  DetayEkleriVisual,
  GorevVisual,
  GorselSekliVisual,
  KesfetVisual,
  NeIzlesemTmdbVisual,
  RehberVisual,
  SaglikVisual,
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
    version: 'v1.7.1',
    date: '24 Eylül 2026',
    title: 'Onay soruları tıkladığın yerde',
    items: [
      '"Silmek istediğine emin misin?" gibi sorular artık ekranın sağ alt köşesinde değil, tıkladığın düğmenin hemen yanında çıkıyor.',
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

export default function YamaNotlari() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex flex-col items-center text-center mb-14">
        <div className="relative mb-5">
          <div className="absolute inset-0 rounded-full bg-[#00c0fa]/20 blur-2xl" />
          <img src="/logoblue.png" alt="ARGUS" className="relative h-16 w-16" />
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold text-neutral-50 mb-2">Yama Notları</h1>
        <p className="text-neutral-500 text-sm max-w-md mb-3">ARGUS'ta zaman içinde neler değişti, kısaca burada.</p>
        <span className="text-xs text-[#00c0fa] bg-[#00c0fa]/10 border border-[#00c0fa]/25 rounded-full px-3 py-1 font-medium">
          Şu an kurulu sürüm: {APP_VERSION}
        </span>
      </div>

      <div className="space-y-0">
        {ENTRIES.map((entry, i) => {
          const isLatest = i === 0
          const isLast = i === ENTRIES.length - 1
          return (
            <div key={entry.version} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={`h-2.5 w-2.5 rounded-full shrink-0 mt-2 ${
                    isLatest ? 'bg-[#00c0fa] shadow-[0_0_0_4px_rgba(0,192,250,0.18)]' : 'bg-neutral-700'
                  }`}
                />
                {!isLast && <span className="w-px flex-1 bg-neutral-800 my-1" />}
              </div>
              <div
                className={`flex-1 min-w-0 rounded-xl border p-4 mb-5 ${
                  isLatest ? 'border-[#00c0fa]/25 bg-[#00c0fa]/[0.04]' : 'border-neutral-800 bg-neutral-900/40'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isLatest ? 'bg-[#00c0fa]/15 text-[#00c0fa]' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {entry.version}
                  </span>
                  <span className="text-xs text-neutral-600">{entry.date}</span>
                  {isLatest && (
                    <span className="text-[10px] text-emerald-400 font-medium ml-auto flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Güncel
                    </span>
                  )}
                </div>
                <h2 className="text-[15px] font-semibold text-neutral-100 mb-2.5">{entry.title}</h2>
                <ul className="space-y-1.5">
                  {entry.items.map((item, j) => (
                    <li key={j} className="text-sm text-neutral-400 leading-relaxed flex gap-2.5">
                      <span className="h-1 w-1 rounded-full bg-neutral-600 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                {entry.visuals && entry.visuals.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-3 mt-4">
                    {entry.visuals.map(({ caption, Visual }) => (
                      <figure key={caption} className="rounded-lg border border-neutral-800 bg-neutral-950 p-2.5">
                        <Visual />
                        <figcaption className="text-xs text-neutral-500 mt-1.5 px-0.5">{caption}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 text-center rounded-xl border border-neutral-800 bg-neutral-900/40 px-6 py-8">
        <p className="text-sm text-neutral-500 max-w-md mx-auto">
          ARGUS şu an geliştirme aşamasında — değişiklikleri test edip bize geri bildirim verirseniz mutlu oluruz :)
        </p>
      </div>
    </div>
  )
}
