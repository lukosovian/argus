export type PropertyType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'date'
  // 'date' tek bir tarih tutar (native <input type="date">, tek seferlik) — "bu filmi tekrar
  // izledim" gibi aynı kayıt için birden fazla tarih biriktirmek istendiğinde (bkz. kullanıcı
  // isteği: "tarih girme kısmı tek seferli çalışıyo") select/multiselect ikilisiyle aynı desende
  // ayrı bir tip: değeri her zaman ISO ("YYYY-MM-DD") tarih dizisi (string[]).
  | 'multidate'
  | 'url'
  | 'image'
  | 'longtext'
  | 'rating'

// 'rating' tipindeki bir alanın değeri: kriter id'sinden 0-10 arası puana bir eşleme
// (ör. { "senaryoId": 8, "oyunculukId": 6 }) — gösterilen tek "puan" bunların ortalaması.
export type PropertyValue = string | number | boolean | string[] | null | Record<string, number>

export interface SelectOption {
  id: string
  label: string
  colorIndex: number
  // Örn. bir oyuncu seçeneğine sonradan fotoğraf eklenebilsin diye — herhangi bir
  // seçim/çoklu seçim seçeneğinde genel olarak kullanılabilir, sadece oyunculara özel değil.
  image?: string
  // Görselin altında gösterilecek kısa bir bilgi satırı (ör. bir oyuncu için doğum
  // tarihi/ülke) — image gibi genel amaçlı, herhangi bir seçenekte kullanılabilir.
  subtitle?: string
}

export interface RatingCriterion {
  id: string
  name: string
}

export interface PropertyDef {
  id: string
  name: string
  type: PropertyType
  options?: SelectOption[]
  // Sadece 'rating' tipinde: kullanıcının kendi tanımladığı puanlama kriterleri
  // (ör. Senaryo, Oyunculuk) — select seçenekleri gibi serbestçe eklenip/silinebilir.
  criteria?: RatingCriterion[]
  width?: number
}

export const DEFAULT_COLUMN_WIDTH = 180
export const MIN_COLUMN_WIDTH = 90

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  text: 'Metin',
  number: 'Sayı',
  select: 'Seçim',
  multiselect: 'Çoklu Seçim',
  checkbox: 'Onay Kutusu',
  date: 'Tarih',
  multidate: 'Çoklu Tarih (ör. tekrar izleme tarihleri)',
  url: 'Bağlantı / Fragman Linki',
  image: 'Görsel',
  longtext: 'Sinopsis / Açıklama',
  rating: 'Puan (kriterli, 10 üzerinden)',
}

export const OPTION_COLORS: { bg: string; text: string; border: string }[] = [
  { bg: 'bg-neutral-500/20', text: 'text-neutral-300', border: 'border-neutral-500/40' },
  { bg: 'bg-amber-700/20', text: 'text-amber-600', border: 'border-amber-700/40' },
  { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40' },
  { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40' },
  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40' },
  { bg: 'bg-sky-500/20', text: 'text-sky-400', border: 'border-sky-500/40' },
  { bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/40' },
  { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/40' },
  { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/40' },
]

export function defaultPropertyValue(type: PropertyType): PropertyValue {
  switch (type) {
    case 'checkbox':
      return false
    case 'multiselect':
    case 'multidate':
      return []
    case 'rating':
      return {}
    default:
      return ''
  }
}

// 'rating' alanının gösterilecek tek puanı: tanımlı kriterlerden değeri girilmiş
// olanların ortalaması. Hiçbiri girilmemişse null (henüz puanlanmamış demektir).
export function ratingAverage(value: PropertyValue, property: PropertyDef): number | null {
  if (property.type !== 'rating') return null
  const scores = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, number>) : {}
  const ids = (property.criteria ?? []).map((c) => c.id)
  const scored = ids.map((id) => scores[id]).filter((n): n is number => typeof n === 'number')
  if (scored.length === 0) return null
  return scored.reduce((a, b) => a + b, 0) / scored.length
}

export function makeId() {
  return Math.random().toString(36).slice(2, 10)
}

// Başlık sütunu her tipte olabilir (kullanıcı tipini değiştirebilir) — bu yüzden
// kart/tablo başlığı olarak göstermeden önce her zaman güvenli bir metne çeviriyoruz.
export function titleText(property: PropertyDef, v: PropertyValue): string {
  if (v === null || v === undefined || v === '') return ''
  if (property.type === 'select') {
    return property.options?.find((o) => o.id === v)?.label ?? ''
  }
  if (property.type === 'multiselect' && Array.isArray(v)) {
    return v
      .map((id) => property.options?.find((o) => o.id === id)?.label)
      .filter((l): l is string => Boolean(l))
      .join(', ')
  }
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır'
  return String(v)
}

// İstatistikler sayfasının hangi sütunu hangi grafik için kullanacağı — bkz. Istatistikler.tsx.
// Her anahtar bir PropertyDef id'si (`board.properties` içindeki), ya `null` (kullanıcı bu
// istatistiği bilerek kapattı) ya `undefined`/yok (henüz karar verilmedi, adına göre otomatik
// bulunmaya çalışılır — "Medya Arşivi" şablonundan gelen arşivlerde zaten hep bu isimlerle
// geliyor, sıfır ayar gerektirmez). Sadece kendi sütun adlarını kullanan (şablonsuz/kendi
// isimlendirmesiyle) bir arşivde kullanıcı bunu Istatistikler sayfasındaki "Sütunları Eşleştir"
// panelinden elle seçer — bkz. [[argus-feedback]]'teki "hardcoded alan yok" ilkesiyle nasıl
// uyumlu olduğuna dair not: varsayılan otomatik-bulma isteğe bağlı bir kolaylık, zorunlu bir
// şema değil.
export interface StatMapping {
  durumId?: string | null
  kategoriId?: string | null
  turId?: string | null
  ulkeId?: string | null
  vizyonId?: string | null
  sureId?: string | null
  puanId?: string | null
  oyuncularId?: string | null
}

export interface Board {
  id: string
  name: string
  titlePropertyId: string
  coverPropertyId: string | null
  // Netflix'teki gibi: bir "Görsel" tipi sütun burada seçiliyse, vitrinde ve kart
  // detayında düz metin başlık yerine bu görsel (logo/başlık görseli) gösterilir —
  // o kayıtta bu sütun boşsa yine metin başlığa düşülür.
  titleImagePropertyId: string | null
  properties: PropertyDef[]
  statMapping?: StatMapping
  createdAt: number
  updatedAt: number
}

export interface Row {
  id: string
  values: Record<string, PropertyValue>
  createdAt: number
  updatedAt: number
}

// Bir "şablon" — sadece sütun yapısı (Board ile aynı alanlar, ama satır/verisi yok). Ayarlar →
// Veritabanı → Şablonlar'da listelenir; kullanıcı kendi arşivlerinden ya da sıfırdan yeni
// şablonlar oluşturabilir (bkz. hooks/useTemplates.ts, server'da profile başına saklanır).
// Uygulamayla birlikte gelen tek hazır şablon ("Medya Arşivi") ayrı — sunucuda saklanmıyor,
// her zaman `builtinMediaTemplate()` ile üretiliyor, bkz. aşağıda.
export interface Template {
  id: string
  name: string
  note?: string
  titlePropertyId: string
  coverPropertyId: string | null
  titleImagePropertyId: string | null
  properties: PropertyDef[]
}

// TMDB'den çekilen "bu kayıtta bu oyuncu hangi rolde oynadı" bilgisi — board/row şemasının
// bir parçası değil (bir kaydın belirli bir oyuncuyla ilişkisi, tek başına oyuncunun ya da
// kaydın özelliği değil), bu yüzden ayrı bir dosyada tutulup kayıt id'sine göre okunuyor.
export interface CastEntry {
  optionId: string
  character: string
  // Sadece diziler için: TMDB'den — bu oyuncunun bu dizide oynadığı toplam bölüm sayısı.
  episodeCount?: number
}

export type CastMap = Record<string, CastEntry[]>

// TMDB'den çekilen sezon/bölüm verisi — cast.json ile aynı mantık: board/row şemasının
// parçası değil (bir kaydın kendi özelliği değil, TMDB'den türetilen ek veri), bu yüzden
// ayrı bir dosyada, kayıt id'sine göre tutuluyor. Sadece dizi tipi kayıtlarda dolu olur.
export interface Episode {
  episodeNumber: number
  name: string
  overview: string
  airDate: string
  stillUrl: string | null
}

export interface Season {
  seasonNumber: number
  name: string
  episodes: Episode[]
}

export type EpisodesMap = Record<string, Season[]>

// Kullanıcının bölüm bazında izleme kaydı — episodes.json'daki TMDB verisinin aksine bu
// TAMAMEN kullanıcı girdisi (RowDetailModal'daki bölüm tikleri): { [rowId]: { [bölümAnahtarı]:
// ISO tarih dizisi } }. Değer her zaman bir DİZİ — Çoklu Tarih (multidate) alanındaki aynı
// mantık: bir bölüm birden fazla tarihte işaretlenebilir (tekrar izleme), boş/yok = hiç
// izlenmemiş. Board/Row şemasının parçası değil (cast.json/episodes.json ile aynı sınıf,
// ayrı bir dosyada, kayıt id'sine göre tutuluyor — bkz. [[argus-feedback]]'teki
// hardcoded-alan-yok ilkesi: bu "İzleme Tarihi" adlı bir sütuna değil, bölüm YAPISINA bağlı).
export type WatchedMap = Record<string, Record<string, string[]>>

export function episodeKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}-${episodeNumber}`
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface Profile {
  id: string
  username: string
  photo: string
}

// Hazır avatar seçenekleri — kullanıcının medya/ klasörüne eklediği 24 karikatür ikon.
// Netflix'teki "kim izliyor" ekranındaki gibi kendi fotoğrafını yüklemek istemeyen biri
// için varsayılan bir seçenek listesi.
export const PRESET_AVATARS: string[] = Array.from({ length: 24 }, (_, i) => `/medya/profil${i + 1}.png`)

export type HomeLayout = 'yatay' | 'izgara'

export const HOME_LAYOUT_LABELS: Record<HomeLayout, string> = {
  yatay: 'Yatay',
  izgara: 'Dikey',
}

export interface HomeSection {
  id: string
  name: string
  propertyId: string | null
  optionIds: string[]
  pinnedToNav?: boolean
  // Eski kayıtlarda bu alan yok — yoksa true kabul edilir (önceki davranış: her sayfa gövdede de gösterilirdi).
  showInBody?: boolean
}

export interface ShowcaseFilter {
  propertyId: string | null
  optionIds: string[]
}

// "İzlenecekler" (Durum="İzlenecek") havuzundan, kullanıcının o anki ruh haline göre
// rastgele 10 kayıt gösteren KENDİ satırı olan bir "mod" — kullanıcının kendi tanımladığı,
// bir sütun+seçeneklere göre filtre (HomeSection'daki filtre mantığıyla birebir aynı,
// sadece ayrı bir yerde tutuluyor çünkü bu satırların havuzu her zaman Durum="İzlenecek"
// ile de kısıtlı — bkz. MoodRowSettings). Her mod ana sayfada solda kendi `image`'ı,
// sağında o moda uyan içeriklerle kendi satırını oluşturur (Netflix'in "Top 10" satırındaki
// büyük numara yerine burada modun görseli kullanılıyor).
export interface Mood {
  id: string
  name: string
  image: string
  propertyId: string | null
  optionIds: string[]
  // Ana sayfada gösterilsin mi — silmeden geçici olarak kapatabilmek için (bkz.
  // MoodRowEditor.tsx'teki ToggleSwitch). Eski kayıtlarda yok, yoksa true kabul edilir.
  enabled?: boolean
}

export interface MoodRowSettings {
  enabled: boolean
  // Diğer HomeRow başlıkları gibi ("Tümü", bir bölüm adı...) satırın üstünde görünür.
  title: string
  // Ana sayfadaki satır sırasında (1 = en üstte) kaçıncı sırada görüneceği — AnaSayfa.tsx bu
  // değere göre satırı Tümü + bölüm satırları dizisine ekliyor.
  position: number
  moods: Mood[]
  // Varsayılan 10 mod (bkz. BUILTIN_MOODS) bir kere eklendi mi — sadece moods.length===0 kontrolü
  // yetmezdi, kullanıcı hepsini bilerek silerse tekrar tekrar geri gelirdi. Eski kayıtlarda yok,
  // yoksa false kabul edilir (henüz hiç eklenmemiş, bkz. useHomeSettings.ts'teki tek seferlik ekleme).
  seeded?: boolean
}

// Kullanıcının kendi eklediği 10 mod + görselleri, uygulamayla birlikte gelen "varsayılan
// modlar" kataloğu — kullanıcı "benim eklediğim 10 tane modu ve görsellerini default olarak"
// dedi. Board'a özel propertyId/optionIds yerine TÜR ETİKETLERİ (taşınabilir) ile tanımlı —
// bkz. resolveBuiltinMoods, herhangi bir arşivin kendi "Tür" sütununa göre bunları anlık
// eşleştirir; eşleşmeyen etiket sessizce atlanır, hiç eşleşme yoksa o mod hiç oluşturulmaz
// (kullanıcının kendi şemasında "Tür" yoksa/başka isimliyse bozuk/boş bir mod eklenmez).
export interface BuiltinMoodTemplate {
  name: string
  image: string
  genreLabels: string[]
}

export const BUILTIN_MOODS: BuiltinMoodTemplate[] = [
  { name: 'Enerjik', image: '/medya/enerjik.png', genreLabels: ['Aksiyon', 'Macera', 'Süper Kahraman'] },
  { name: 'Neşeli', image: '/medya/neÅ\u009feli.png', genreLabels: ['Komedi', 'Animasyon', 'Sitcom'] },
  { name: 'Romantik', image: '/medya/romantik.png', genreLabels: ['Romantik', 'Romantik Komedi'] },
  { name: 'Hüzünlü', image: '/medya/hÃ¼zÃ¼nlÃ¼.png', genreLabels: ['Dram', 'Biyografi'] },
  { name: 'Gergin', image: '/medya/gergin.png', genreLabels: ['Gerilim', 'Korku'] },
  { name: 'Meraklı', image: '/medya/meraklÄ±.png', genreLabels: ['Casusluk', 'Gizem', 'Dedektif', 'Polisiye'] },
  { name: 'Hayalperest', image: '/medya/hayalperest.png', genreLabels: ['Bilim Kurgu', 'Fantastik'] },
  { name: 'Huzurlu', image: '/medya/huzurlu.png', genreLabels: ['Aile', 'Belgesel'] },
  { name: 'Nostaljik', image: '/medya/nostaljik.png', genreLabels: ['Tarihi', 'Tarih'] },
  { name: 'Öfkeli', image: '/medya/Ã¶fkeli.png', genreLabels: ['Suç'] },
]

// Bir board'a göre BUILTIN_MOODS'u gerçek Mood[] kayıtlarına çevirir — HER ZAMAN 10'unu da
// üretir (eşleşmeyeni atlamaz artık — ilk sürüm öyleydi, kullanıcı düzeltti: "sen hepsini
// getir uygun filtre olmadığı için görünmez falan de... adam bu modların gelebileceğini
// nerden bilecek"). Bir modun etiketlerinden hiçbiri o board'un GÜNCEL "Tür" seçenekleriyle
// eşleşmezse `optionIds` boş kalır ve `enabled: false` ile üretilir — silinmiş/kapatılmış
// değil, sadece henüz uygun bir filtresi yok; kullanıcı istediğinde düzenleyip kendi
// filtresini seçebilir (bkz. MoodRowEditor.tsx'teki "uygun tür bulunamadı" ipucu). Taze
// id'lerle üretilir; bundan sonra sıradan bir Mood kaydı gibi davranır, ayrı bir "yerleşik
// mod" izleme mekanizması yok.
export function resolveBuiltinMoods(board: Board): Mood[] {
  const turProp = board.properties.find((p) => p.name === 'Tür' && (p.type === 'multiselect' || p.type === 'select'))
  const labelToId = new Map((turProp?.options ?? []).map((o) => [o.label, o.id]))
  return BUILTIN_MOODS.map((tpl) => {
    const optionIds = tpl.genreLabels.map((l) => labelToId.get(l)).filter((id): id is string => Boolean(id))
    return {
      id: makeId(),
      name: tpl.name,
      image: tpl.image,
      propertyId: optionIds.length > 0 ? (turProp?.id ?? null) : null,
      optionIds,
      enabled: optionIds.length > 0,
    }
  })
}

// Ana sayfanın en altına, her girişte RASTGELE seçilmiş satırlar ekler — kullanıcı hiçbir şey
// tanımlamadan, arşivdeki seçim/çoklu-seçim sütunlarından (Tür, Ülke, Kategori...) o an rastgele
// seçilen bir değerin kendisi satırın başlığı olur (bkz. AnaSayfa.tsx'teki `buildAutoFillPool` —
// hangi sütun/değer seçileceği hardcode değil, arşivin o anki şemasına göre otomatik bulunuyor).
export interface AutoFillSettings {
  enabled: boolean
  count: number
}

export interface HomeSettings {
  boardId: string | null
  showcase: boolean
  layout: HomeLayout
  sections: HomeSection[]
  // Üst menüde ve ana sayfa gövdesinde gösterim sırası — birbirinden bağımsız.
  navOrder: string[]
  bodyOrder: string[]
  showcaseFilter: ShowcaseFilter
  // Kapak görseli olmayan kayıtları ana sayfada (vitrin dahil) gizler.
  hideWithoutCover?: boolean
  // Ana sayfanın en üstündeki (bölüm/filtre sayfası değilken görünen) "Tümü" satırını
  // gösterip göstermeme — eski kayıtlarda bu alan yok, yoksa true kabul edilir (önceki
  // davranış: her zaman gösteriliyordu). Bir bölüm/anlık filtre sayfasındayken (activeFilter)
  // bu ayardan etkilenmez, sadece varsayılan (bileşik) ana sayfa görünümünü kapatıp açar.
  showAllSection?: boolean
  // "Tümü" satırının kart sırası — 'karisik' (her girişte yeniden karışır, önceki tek/varsayılan
  // davranış) ya da 'sirali' (ekleme sırasına göre, hep aynı). Eski kayıtlarda yok, yoksa
  // 'karisik' kabul edilir.
  allSectionOrder?: 'karisik' | 'sirali'
  // Kart boyutu — hem Yatay hem Dikey görünüm tarzı için ortak (bkz. AnaSayfa.tsx'teki
  // CARD_WIDTHS, ikisi de aynı ayarı kullanır, sadece kendi yön bazlı piksel karşılığına
  // çevrilir). Eski kayıtlarda yok, yoksa 'orta' (eski sabit boyutlarla birebir aynı) kabul edilir.
  cardSize?: 'kucuk' | 'orta' | 'buyuk'
  // Kartların bilgi şeridini (Durum/Kategori/yıl) fareyle üzerine gelmeden de her zaman göster.
  // Eski kayıtlarda yok, yoksa false kabul edilir (önceki tek davranış: sadece hover'da).
  showInfoAlways?: boolean
  moodRow?: MoodRowSettings
  autoFill?: AutoFillSettings
  // Navbar'daki "Ne İzlesem?" butonu tıklandığında rastgele seçimin yapılacağı havuz — aynı
  // propertyId/optionIds şekli showcaseFilter ile birebir aynı (HomeSection'daki filtre
  // mantığıyla da aynı). propertyId boşsa (hiç ayar yapılmadıysa) arşivdeki HER kayıttan
  // rastgele seçilir — kullanıcı "neye göre ekrana getireceğini hiç bi ayar yapılmadıysa
  // default olarak tüm içerikleri gösterebilsin" dedi. Eski kayıtlarda yok, yoksa filtresiz kabul edilir.
  randomPickerFilter?: ShowcaseFilter
  // "Ne İzlesem?" animasyonunda ekranda aynı anda dağılan poster sayısı. Eski kayıtlarda yok,
  // yoksa 30 kabul edilir.
  randomPickerCount?: number
}

export const emptyHomeSettings: HomeSettings = {
  boardId: null,
  showcase: true,
  layout: 'yatay',
  sections: [],
  navOrder: [],
  bodyOrder: [],
  showcaseFilter: { propertyId: null, optionIds: [] },
  hideWithoutCover: false,
  showAllSection: true,
  allSectionOrder: 'karisik',
  cardSize: 'orta',
  showInfoAlways: false,
  moodRow: { enabled: false, title: 'Bunları da İzle', position: 1, moods: [], seeded: false },
  autoFill: { enabled: false, count: 4 },
  randomPickerFilter: { propertyId: null, optionIds: [] },
  randomPickerCount: 30,
}

export function makeTitleProperty(name = 'Ad'): PropertyDef {
  return { id: makeId(), name, type: 'text' }
}

// Hazır şablon: ARGUS'un kendi özelliklerinin (Ana Sayfa vitrini/logosu, Kim İzliyor, TMDB
// otomatik doldurma, İstatistikler, mod satırları...) hepsinin kullandığı TAM sütun seti —
// kullanıcının gerçek, aylarca kullanılmış arşiviyle birebir aynı yapı (isim+tip+kriter).
// Seçim/çoklu-seçim sütunlarının SEÇENEKLERİ bilerek boş bırakılıyor (Tür/Ülke/Oyuncular) —
// bunlar içerik ekledikçe TMDB eşleştirmesiyle zaten kendiliğinden oluşuyor; sadece Kategori ve
// Durum'un seçenekleri geliyor çünkü TMDB otomatik doldurma bunları KENDİSİ oluşturmuyor, sadece
// ADI eşleşen bir seçenek varsa dolduruyor (server/index.js). "hasodan" gibi kullanıcıya özel bir
// durum etiketi buraya taşınmıyor. Board oluşturulurken önerilir, tamamen isteğe bağlıdır —
// kullanıcı dilediği sütunu silebilir/yeniden adlandırabilir ya da boş başlayabilir.
export function mediaTemplateProperties(): {
  title: PropertyDef
  rest: PropertyDef[]
  coverPropertyId: string
  titleImagePropertyId: string
} {
  const title = makeTitleProperty('Türkçe Adı')
  const banner: PropertyDef = { id: makeId(), name: 'Banner', type: 'image' }
  const kapakAdi: PropertyDef = { id: makeId(), name: 'KAPAK ADI', type: 'image' }
  const rest: PropertyDef[] = [
    { id: makeId(), name: 'Orjinal Adı', type: 'text' },
    banner,
    {
      id: makeId(),
      name: 'Durum',
      type: 'select',
      options: [
        { id: makeId(), label: 'İzlendi', colorIndex: 0 },
        { id: makeId(), label: 'İzlenecek', colorIndex: 1 },
        { id: makeId(), label: 'Yarım', colorIndex: 2 },
        { id: makeId(), label: 'İzleniyor', colorIndex: 3 },
      ],
    },
    {
      id: makeId(),
      name: 'Kategori',
      type: 'select',
      options: [
        { id: makeId(), label: 'Film', colorIndex: 0 },
        { id: makeId(), label: 'Dizi', colorIndex: 1 },
        { id: makeId(), label: 'Yarışma', colorIndex: 2 },
        { id: makeId(), label: 'Kısa Film', colorIndex: 3 },
        { id: makeId(), label: 'Mini Dizi', colorIndex: 4 },
        { id: makeId(), label: 'Gösteri', colorIndex: 5 },
        { id: makeId(), label: 'Reality Show', colorIndex: 6 },
        { id: makeId(), label: 'Belgesel', colorIndex: 7 },
      ],
    },
    {
      id: makeId(),
      name: 'Puan',
      type: 'rating',
      criteria: [
        { id: makeId(), name: 'Senaryo' },
        { id: makeId(), name: 'Oyunculuk' },
        { id: makeId(), name: 'Görsellik' },
        { id: makeId(), name: 'Müzik' },
        { id: makeId(), name: 'Tekrar İzlenebilirlik' },
      ],
    },
    { id: makeId(), name: 'Tür', type: 'multiselect', options: [] },
    { id: makeId(), name: 'Vizyon Tarihi', type: 'date' },
    { id: makeId(), name: 'Yönetmen', type: 'text' },
    { id: makeId(), name: 'Ülke', type: 'multiselect', options: [] },
    { id: makeId(), name: 'İzleme Tarihi', type: 'text' },
    { id: makeId(), name: 'video', type: 'url' },
    { id: makeId(), name: 'sinopsis', type: 'longtext' },
    kapakAdi,
    { id: makeId(), name: 'Oyuncular', type: 'multiselect', options: [] },
    { id: makeId(), name: 'Poster', type: 'image' },
    { id: makeId(), name: 'Süre', type: 'number' },
    { id: makeId(), name: 'Yaş Sınırı', type: 'text' },
  ]
  return { title, rest, coverPropertyId: banner.id, titleImagePropertyId: kapakAdi.id }
}

// Boş bir arşiv — sadece tek bir başlık sütunuyla, hiç şablon kullanmadan sıfırdan başlamak
// istendiğinde ("Arşivler" sekmesinde "Boş arşiv" seçilince, ya da Şablonlar sekmesi hiç
// kullanılmadığında). Şablondan arşiv oluşturmak için bkz. aşağıdaki `instantiateTemplate`.
export function emptyBoard(name: string): Omit<Board, 'id'> {
  const title = makeTitleProperty()
  return {
    name,
    titlePropertyId: title.id,
    coverPropertyId: null,
    titleImagePropertyId: null,
    properties: [title],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// Uygulamayla birlikte "gelen", her zaman var olan, silinemeyen tek hazır şablon — kullanıcının
// aylarca kullandığı gerçek arşivin sütun yapısı (bkz. mediaTemplateProperties yukarıda).
// Sunucuda ayrıca saklanmaz, her çağrıldığında aynı yapı fakat taze id'lerle üretilir.
export function builtinMediaTemplate(): Template {
  const { title, rest, coverPropertyId, titleImagePropertyId } = mediaTemplateProperties()
  return {
    id: '__builtin_medya__',
    name: 'Medya Arşivi',
    note:
      'ARGUS\'un vitrin, "Kim İzliyor", İstatistikler ve TMDB\'den otomatik doldurma gibi bütün özelliklerinin ' +
      'kullandığı, hazır ve tam sütun setine sahip şablon budur.',
    titlePropertyId: title.id,
    coverPropertyId,
    titleImagePropertyId,
    properties: [title, ...rest],
  }
}

// Bir şablonun sütun tanımlarını yeni, taze id'lerle çoğaltır (sütunun kendisi, seçenekleri,
// puan kriterleri) — hem yeni bir arşiv oluştururken (aşağıdaki `instantiateTemplate`) hem de bir
// arşivin kendi yapısından yeni bir şablon oluştururken kullanılır. Taze id'ler sayesinde aynı
// şablondan/arşivden oluşturulan her kopyanın id'leri birbirinden tamamen bağımsız olur.
export function cloneProperties(properties: PropertyDef[]): { properties: PropertyDef[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>()
  const cloned = properties.map((p) => {
    const id = makeId()
    idMap.set(p.id, id)
    return {
      ...p,
      id,
      options: p.options?.map((o) => ({ ...o, id: makeId() })),
      criteria: p.criteria?.map((c) => ({ ...c, id: makeId() })),
    }
  })
  return { properties: cloned, idMap }
}

// Bir şablondan yeni bir arşiv oluşturur — sütunları (ve seçenek/kriter id'lerini) taze id'lerle
// çoğaltır, böylece aynı şablondan oluşturulan iki arşiv birbirini hiç etkilemez.
export function instantiateTemplate(template: Template, boardName: string): Omit<Board, 'id'> {
  const { properties, idMap } = cloneProperties(template.properties)
  return {
    name: boardName,
    titlePropertyId: idMap.get(template.titlePropertyId) ?? properties[0]?.id ?? makeId(),
    coverPropertyId: template.coverPropertyId ? (idMap.get(template.coverPropertyId) ?? null) : null,
    titleImagePropertyId: template.titleImagePropertyId ? (idMap.get(template.titleImagePropertyId) ?? null) : null,
    properties,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function emptyRow(): Omit<Row, 'id'> {
  return { values: {}, createdAt: Date.now(), updatedAt: Date.now() }
}
