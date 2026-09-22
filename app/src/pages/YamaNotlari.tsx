// pp menüsündeki "Yama Notları" ile açılan, ARGUS'un geçmiş güncellemelerini anlatan sayfa —
// kullanıcı "yama notları kısmını ekle... yama notlarını alta doğru sırala" dedi. Liste elle
// tutuluyor (otomatik bir kaynak yok) — yeni bir özellik/düzeltme eklendikçe en üste yeni bir
// ENTRIES kaydı eklenmesi yeterli, en yeni en üstte.
interface PatchEntry {
  date: string
  title: string
  items: string[]
}

const ENTRIES: PatchEntry[] = [
  {
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
    date: '20-21 Eylül 2026',
    title: 'Mod satırı, bölüm/sezon takibi',
    items: [
      '"Bunları da İzle" mod satırı — ruh haline göre öneri, 10 hazır mod ve görselleriyle geliyor, kendi modlarını da ekleyebiliyorsun.',
      'Dizilerde bölüm bazlı izleme takibi ve tekrar izleme tarihleri.',
      'Ana Sayfa Ayarları yeniden düzenlendi — görünüm tarzı (Yatay/Dikey), kart boyutu, vitrin, sayfalar hepsi tek yerde.',
    ],
  },
  {
    date: '14-15 Eylül 2026',
    title: 'TMDB entegrasyonu, puanlama',
    items: [
      'TMDB\'den otomatik doldurma (poster, oyuncular, tür, sinopsis, fragman, yaş sınırı) — kendi ücretsiz API anahtarınla.',
      'Kriter bazlı puanlama sistemi (Senaryo, Oyunculuk gibi kendi kriterlerini tanımlayabiliyorsun).',
      'Notion\'dan CSV ile içe aktarma.',
    ],
  },
  {
    date: '11 Eylül 2026',
    title: 'Bulutsuz, tamamen yerel',
    items: [
      'ARGUS tamamen bu bilgisayarda çalışacak şekilde yeniden kuruldu — internete ya da bir hesaba ihtiyaç yok, tüm veriler bu klasörde gerçek dosyalar olarak duruyor.',
      'Birden fazla profil desteği ("Kim izliyor?" ekranı) — her profilin kendi arşivleri/ayarları.',
    ],
  },
  {
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
      <div className="flex flex-col items-center text-center mb-12">
        <img src="/logoblue.png" alt="ARGUS" className="h-16 w-16 mb-4" />
        <h1 className="text-2xl md:text-3xl font-semibold text-neutral-50 mb-2">Yama Notları</h1>
        <p className="text-neutral-500 text-sm max-w-md">ARGUS'ta zaman içinde neler değişti, kısaca burada.</p>
      </div>

      <div className="space-y-10">
        {ENTRIES.map((entry) => (
          <div key={entry.date} className="border-l-2 border-neutral-800 pl-5">
            <p className="text-xs text-sky-400 font-medium mb-1">{entry.date}</p>
            <h2 className="text-base font-semibold text-neutral-100 mb-2">{entry.title}</h2>
            <ul className="space-y-1.5">
              {entry.items.map((item, i) => (
                <li key={i} className="text-sm text-neutral-400 leading-relaxed flex gap-2">
                  <span className="text-neutral-600 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-16 text-center border-t border-neutral-800 pt-8">
        <p className="text-sm text-neutral-500 max-w-md mx-auto">
          ARGUS şu an geliştirme aşamasında — değişiklikleri test edip bize geri bildirim verirseniz mutlu oluruz :)
        </p>
      </div>
    </div>
  )
}
