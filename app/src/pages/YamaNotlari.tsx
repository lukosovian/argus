// pp menüsündeki "Yama Notları" ile açılan, ARGUS'un geçmiş güncellemelerini anlatan sayfa —
// kullanıcı "yama notları kısmını ekle... yama notlarını alta doğru sırala" dedi. Liste elle
// tutuluyor (otomatik bir kaynak yok) — yeni bir özellik/düzeltme eklendikçe en üste yeni bir
// ENTRIES kaydı eklenmesi yeterli, en yeni en üstte. `version` alanı lib/version.ts'teki
// APP_VERSION ile elle senkron tutulur (kullanıcı "versiyon numarası ekleyelim güncellendiği
// anlaşılmıyo" dedi).
import { APP_VERSION } from '../lib/version'
interface PatchEntry {
  version: string
  date: string
  title: string
  items: string[]
}

const ENTRIES: PatchEntry[] = [
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
