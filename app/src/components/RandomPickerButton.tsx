import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Board, Row } from '../types'
import { rowsForFilter, shuffle } from '../lib/rowMeta'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useToast } from '../hooks/useToast'
import { api, type TmdbCard } from '../lib/api'
import RowDetailModal from './RowDetailModal'
import TmdbPreviewModal from './TmdbPreviewModal'

// İki üst üste binen "poster kartı" — biri düz, biri hafif çapraz (kullanıcı: "yan yana duran
// iki kart gibi olsun biri düz biri çapraz olarak"). Soldaki (düz) dolu, sağdaki (çapraz) boş
// — kullanıcı "soldaki kartın içi dolu olsun sağdakinin boş olsun" dedi. Çapraz olan SVG'de
// sonra çizildiği için düz olanın üstünde durur.
function StackedCardsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="3" width="10" height="16" rx="2" fill="currentColor" stroke="none" />
      <rect x="11" y="5" width="10" height="16" rx="2" transform="rotate(16 16 13)" />
    </svg>
  )
}

// Eski kayıtlarda settings.randomPickerCount yoksa (Ayarlar'daki sayı girilmemişse) kullanılan
// varsayılan — Ayarlar'daki asıl varsayılanla (types.ts'teki emptyHomeSettings) aynı.
const DEFAULT_SCATTER_COUNT = 30

// Animasyon dört fazdan oluşuyor (kullanıcı: "ekrana gelip dağılırlar tek tek yok olurlar en
// sona gelen ortaya gelir ve büyür belli miktar büyüyünce fade out la yok olur ve detay
// penceresi açılır"): ENTER (posterler ortadan patlayıp dağılır) → ELIMINATE (kazanan hariç
// hepsi teker teker, gecikmeli sırayla küçülüp kaybolur) → GROW (kalan tek poster ortaya gelip
// büyür) → FADE (büyüdükten sonra soluklaşıp kaybolur) → detay penceresi açılır.
const ENTER_TRANSITION_MS = 1300
// Bir posterin "dağılma" animasyonu, kendi görseli GERÇEKTEN yüklenip çözülene kadar hiç
// başlamıyor artık — kullanıcı "kartlar gelirken boş gelmesin" dedi, eski sürümde sabit rastgele
// bir gecikmeyle geliyordu ve görsel henüz hazır olmadan kutu boş görünebiliyordu. Yine de tek
// bir görsel takılırsa tüm animasyon sonsuza dek beklemesin diye bir üst sınır var.
const ENTER_FALLBACK_MS = 3500
const ENTER_HOLD_MS = 450

const ELIMINATE_ITEM_MS = 320
// Toplam eleme süresi, poster sayısına göre esniyor (çok posterde her biri tek tek beklerse
// tüm animasyon dakikalarca sürerdi) — yine de en az/en çok sınırla makul bir aralıkta kalıyor.
function eliminatePhaseMs(nonWinnerCount: number) {
  return Math.max(1800, Math.min(4800, nonWinnerCount * 75))
}

const GROW_MS = 900
const FADE_MS = 650

// Görsel sütunlarının şekli (dikey/yatay) sütun adına bakılarak değil, o sütundaki gerçek bir
// görselin en/boy oranına bakılarak anlaşılıyor — sütun adı ne olursa olsun çalışsın diye.
// Başlık logosu sütunu (KAPAK ADI, bkz. board.titleImagePropertyId) hiç hesaba katılmıyor.
// Sonuç görsel adresine göre önbellekleniyor, her tıklamada yeniden indirilmesin.
const shapeCache = new Map<string, 'dikey' | 'yatay'>()
function probeShape(url: string): Promise<'dikey' | 'yatay' | null> {
  const cached = shapeCache.get(url)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const shape = img.naturalWidth > img.naturalHeight ? 'yatay' : 'dikey'
      shapeCache.set(url, shape)
      resolve(shape)
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

type ImageColumn = { id: string; shape: 'dikey' | 'yatay' }

async function classifyImageColumns(board: Board, rows: Row[]): Promise<ImageColumn[]> {
  const props = board.properties.filter((p) => p.type === 'image' && p.id !== board.titleImagePropertyId)
  const result: ImageColumn[] = []
  for (const p of props) {
    // İlk birkaç dolu değeri dene — tek bir bozuk dosya yüzünden sütun tanınmaz kalmasın.
    const samples = rows.map((r) => r.values[p.id] as string).filter(Boolean).slice(0, 3)
    for (const url of samples) {
      const shape = await probeShape(url)
      if (shape) {
        result.push({ id: p.id, shape })
        break
      }
    }
  }
  return result
}

// Ayardaki tercihe göre bir satırın görselini seçer: 'dikey' sadece dikey sütunlardan, 'yatay'
// sadece yatay sütunlardan; ayar yapılmadıysa önce dikey, o boşsa yatay görsel kullanılır.
function pickImage(row: Row, columns: ImageColumn[], pref: 'dikey' | 'yatay' | null): { url: string; landscape: boolean } | null {
  const order: ('dikey' | 'yatay')[] = pref ? [pref] : ['dikey', 'yatay']
  for (const shape of order) {
    for (const col of columns) {
      if (col.shape !== shape) continue
      const v = row.values[col.id] as string
      if (v) return { url: v, landscape: shape === 'yatay' }
    }
  }
  return null
}

// Bir aday ya arşivdeki bir kayıt (row) ya da arşivde OLMAYAN bir TMDB içeriği (tmdb) —
// "Nereden seçilsin" ayarına göre (bkz. HomeSettings.randomPickerSource).
type Candidate = {
  key: string
  row?: Row
  tmdb?: TmdbCard
  cover: string
  landscape: boolean
  left: number
  top: number
  rotate: number
  scale: number
  eliminateDelay: number
}

// Navbar'daki "Ne İzlesem?" butonu — arama kutusunun sağında. Tıklanınca Ana Sayfa
// Ayarları'ndaki arşivden (ve orada ayrıca tanımlanabilen "Ne İzlesem?" filtresinden, hiç
// ayarlanmadıysa arşivin TAMAMINDAN) rastgele bir kayıt seçer; posterler ekrana dağılıp teker
// teker kaybolur, kazanan ortada büyüyüp soluklaşınca o kaydın detay penceresi açılır. Board/
// satır verisi Navbar her sayfada asılı kaldığı için hook olarak değil, sadece tıklanınca
// (api.ts üzerinden) tek seferlik çekiliyor — her sayfa geçişinde arka planda gereksiz bir
// arşiv isteği atılmasın diye.
export default function RandomPickerButton() {
  const { settings } = useHomeSettings()
  const { notify } = useToast()
  const [loading, setLoading] = useState(false)
  const [board, setBoard] = useState<Board | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'entering' | 'eliminating' | 'growing' | 'fading'>('idle')
  const [openRow, setOpenRow] = useState<Row | null>(null)
  const [openTmdb, setOpenTmdb] = useState<TmdbCard | null>(null)
  // Hangi posterlerin görseli GERÇEKTEN yüklenip çözüldü — her poster kendi görseli hazır
  // olduğu anda "dağılma" animasyonuna başlıyor (bkz. aşağıdaki iki effect), sabit bir
  // zamanlayıcıyla değil. Bu hem "kartlar boş gelmesin" isteğini karşılıyor hem de 60 görselin
  // hepsini aynı anda indirip çözmeye çalışıp ana iş parçacığını tıkamasını (kullanıcının
  // bildirdiği donma) önlüyor — indirme/çözme işi doğal olarak zamana yayılıyor.
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  async function handleClick() {
    if (loading || phase !== 'idle') return
    if (!settings.boardId) {
      notify('Önce Ana Sayfa Ayarları\'ndan bir arşiv seçmelisin.', 'danger')
      return
    }
    setLoading(true)
    try {
      // Ayarlar Navbar'daki bu butonun hook'u açıldığında bir kez yükleniyor — Ana Sayfa
      // Ayarları'nda sonradan yapılan değişiklikler buraya yansımıyordu (seçilen görsel şekli
      // hiç uygulanmıyordu). Bu yüzden her tıklamada en güncel ayarı sunucudan okuyoruz.
      const [boards, allRows, fresh] = await Promise.all([
        api.getBoards(),
        api.getRows(settings.boardId),
        api.getHomeSettings(),
      ])
      const current = { ...settings, ...(fresh ?? {}) }
      const b = boards.find((x) => x.id === current.boardId)
      if (!b) {
        notify('Arşiv bulunamadı.', 'danger')
        return
      }
      const pref = current.randomPickerImageShape === 'dikey' || current.randomPickerImageShape === 'yatay' ? current.randomPickerImageShape : null
      const count = current.randomPickerCount ?? DEFAULT_SCATTER_COUNT

      type Entry = Omit<Candidate, 'left' | 'top' | 'rotate' | 'scale' | 'eliminateDelay'>
      let pool: Entry[]
      if (current.randomPickerSource === 'tmdb') {
        // TMDB modu: arşivde OLMAYAN (ve daha önce "bir daha gösterme" denmemiş) içerikler.
        // Her tıklamada farklı gelsin diye rastgele sayfalardan toplanıyor (random: true).
        const t = current.randomPickerTmdb ?? { type: 'movie', genreIds: [], sort: 'popular' }
        const ask = (type: 'movie' | 'tv', n: number, genreIds: number[]) =>
          api.discoverTmdb(b.id, { type, genreIds, count: n, sort: t.sort, random: true }).then((r) => r.items)
        const cards =
          t.type === 'mixed'
            ? shuffle((await Promise.all([ask('movie', Math.ceil(count / 2), []), ask('tv', Math.ceil(count / 2), [])])).flat())
            : await ask(t.type, count, t.genreIds)
        pool = cards
          .map((c): Entry | null => {
            // Yatay istenirse TMDB'nin yatay görseli (backdrop), yoksa poster.
            const wantWide = pref === 'yatay'
            const url = wantWide ? c.backdrop || c.poster : c.poster || c.backdrop
            return url ? { key: `tmdb:${c.mediaType}:${c.tmdbId}`, tmdb: c, cover: url, landscape: url === c.backdrop } : null
          })
          .filter((e): e is Entry => e !== null)
        if (pool.length === 0) {
          notify('Bu ayarlara uyan, arşivinde olmayan bir içerik bulunamadı.', 'danger')
          return
        }
      } else {
        const filter = current.randomPickerFilter
        // Hiç filtre ayarlanmadıysa (propertyId yok) arşivin TAMAMI havuz olur — kullanıcının
        // "hiç bi ayar yapılmadıysa default olarak tüm içerikleri gösterebilsin" isteği.
        const base = filter?.propertyId && filter.optionIds.length > 0 ? rowsForFilter(filter, allRows) : allRows
        // Poster olmadan dağılma animasyonu boş kutulara döner — bu yüzden sadece seçili şekilde
        // bir görseli olan kayıtlar havuza giriyor.
        const columns = await classifyImageColumns(b, allRows)
        pool = base
          .map((r): Entry | null => {
            const img = pickImage(r, columns, pref)
            return img ? { key: r.id, row: r, cover: img.url, landscape: img.landscape } : null
          })
          .filter((e): e is Entry => e !== null)
        if (pool.length === 0) {
          notify('Bu filtreye uyan, seçili görseli olan bir içerik bulunamadı.', 'danger')
          return
        }
      }

      const winner = pool[Math.floor(Math.random() * pool.length)]
      const rest = shuffle(pool.filter((e) => e.key !== winner.key)).slice(0, count - 1)
      // `rest`in sırası zaten karışık — bu sıra aynı zamanda "kimin ne zaman kaybolacağını" da
      // belirliyor, ayrıca bir eleme sırası üretmeye gerek yok.
      const nonWinnerCount = rest.length
      const eliminateWindow = eliminatePhaseMs(nonWinnerCount)
      const laidOut: Candidate[] = [winner, ...rest].map((entry, i) => ({
        ...entry,
        left: 12 + Math.random() * 76,
        top: 16 + Math.random() * 62,
        rotate: -22 + Math.random() * 44,
        scale: 0.85 + Math.random() * 0.35,
        // i=0 kazanan (eliminateDelay hiç kullanılmıyor) — geri kalanlar havuzdaki sırasına
        // göre eşit aralıklarla, pencerenin sonuna doğru teker teker kayboluyor.
        eliminateDelay: i === 0 || nonWinnerCount <= 1 ? 0 : ((i - 1) / (nonWinnerCount - 1)) * (eliminateWindow - ELIMINATE_ITEM_MS),
      }))
      setBoard(b)
      setCandidates(laidOut)
      setWinnerId(winner.key)
      setPhase('entering')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Bir şeyler ters gitti.', 'danger')
    } finally {
      setLoading(false)
    }
  }

  // Her posterin görselini ayrı ayrı önceden indirip ÇÖZÜYORUZ (decode) — bir poster ancak
  // kendi görseli gerçekten hazır olunca `revealed`e giriyor ve dağılma animasyonuna başlıyor
  // (bkz. styleFor). `decode()` doğası gereği asenkron olduğu için indirme/çözme işi görsel
  // sayısı kadar (60'a kadar) paralel iş yerine doğal olarak zamana yayılıyor — tek bir görsel
  // takılırsa da ENTER_FALLBACK_MS sonunda tümü zorla "hazır" sayılıp animasyon devam ediyor.
  useEffect(() => {
    if (phase !== 'entering') return
    setRevealed(new Set())
    let cancelled = false
    const markReady = (id: string) => {
      if (cancelled) return
      setRevealed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    }
    candidates.forEach((c) => {
      const url = c.cover
      if (!url) {
        markReady(c.key)
        return
      }
      const img = new Image()
      img.src = url
      if (typeof img.decode === 'function') {
        img.decode().then(() => markReady(c.key)).catch(() => markReady(c.key))
      } else {
        img.onload = () => markReady(c.key)
        img.onerror = () => markReady(c.key)
      }
    })
    const fallback = setTimeout(() => {
      if (!cancelled) setRevealed(new Set(candidates.map((c) => c.key)))
    }, ENTER_FALLBACK_MS)
    return () => {
      cancelled = true
      clearTimeout(fallback)
    }
  }, [phase, candidates])

  // Herkes (bkz. yukarıdaki effect) hazır olunca kısa bir bekleme payı ver, sonra sıradaki faza
  // geç — kazanandan başka aday yoksa eleme fazı tamamen atlanır.
  useEffect(() => {
    if (phase !== 'entering') return
    if (candidates.length === 0 || revealed.size < candidates.length) return
    const hasOthers = candidates.length > 1
    const t = setTimeout(() => setPhase(hasOthers ? 'eliminating' : 'growing'), ENTER_HOLD_MS)
    return () => clearTimeout(t)
  }, [phase, revealed, candidates.length])

  useEffect(() => {
    if (phase !== 'eliminating') return
    const nonWinnerCount = Math.max(0, candidates.length - 1)
    const t = setTimeout(() => setPhase('growing'), eliminatePhaseMs(nonWinnerCount))
    return () => clearTimeout(t)
  }, [phase, candidates.length])

  useEffect(() => {
    if (phase !== 'growing') return
    const t = setTimeout(() => setPhase('fading'), GROW_MS)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase !== 'fading') return
    const t = setTimeout(() => {
      const winner = candidates.find((c) => c.key === winnerId)
      setPhase('idle')
      setCandidates([])
      if (winner?.row) setOpenRow(winner.row)
      else if (winner?.tmdb) setOpenTmdb(winner.tmdb)
    }, FADE_MS)
    return () => clearTimeout(t)
  }, [phase, candidates, winnerId])

  // `left`/`top` gibi konum özellikleri yerine (bunlar her karede sayfa düzenini yeniden
  // hesaplatır — özellikle 40-60 poster aynı anda animasyonlanınca donmaya/karelerin
  // düşmesine yol açan asıl sebep buydu) konumlandırma da TAMAMEN `transform: translate(...vw,
  // ...vh)` ile yapılıyor; öğe her zaman `left:0; top:0`'da duruyor. transform + opacity
  // tarayıcının kompozit katmanında (GPU) çalışır, düzen/boyama tetiklemez.
  function styleFor(c: Candidate, isWinner: boolean): CSSProperties {
    if (phase === 'growing' || phase === 'fading') {
      if (!isWinner) return { transform: 'translate(-9999px, -9999px)', opacity: 0, transitionDuration: '0ms' }
      // Sadece DEĞİŞEN özellik gerçekten animasyonlanır (opacity büyürken, transform solurken
      // aynı kalıyor) — bu yüzden `transitionDuration` iki fazda da tek bir değer olsa da
      // (ikisinin toplamı) görsel olarak "önce büyü, sonra sol" sırası korunuyor.
      return {
        transform: 'translate(50vw, 50vh) translate(-50%, -50%) scale(2.1) rotate(0deg)',
        opacity: phase === 'fading' ? 0 : 1,
        transitionDuration: phase === 'growing' ? `${GROW_MS}ms` : `${FADE_MS}ms`,
        transitionDelay: '0ms',
        zIndex: 10,
      }
    }
    if (phase === 'eliminating' && !isWinner) {
      return {
        transform: `translate(${c.left}vw, ${c.top}vh) translate(-50%, -50%) scale(0.35) rotate(${c.rotate}deg)`,
        opacity: 0,
        transitionDuration: `${ELIMINATE_ITEM_MS}ms`,
        transitionDelay: `${c.eliminateDelay}ms`,
        zIndex: 1,
      }
    }
    // Kendi görseli henüz hazır değilse (bkz. `revealed`) ortada, görünmez ve hareketsiz
    // bekliyor — görsel hazır olduğu anda aşağıdaki dağılmış hedefe doğru animasyonla kayıyor.
    if (phase === 'entering' && !revealed.has(c.key)) {
      return {
        transform: 'translate(50vw, 50vh) translate(-50%, -50%) scale(0.15) rotate(0deg)',
        opacity: 0,
        transitionDuration: '0ms',
        zIndex: isWinner ? 5 : 1,
      }
    }
    // 'entering' (kendi görseli hazır olduktan sonra), ya da 'eliminating' sırasındaki kazanan
    // — ikisinde de dağılmış dinlenme konumunda sabit duruyor.
    return {
      transform: `translate(${c.left}vw, ${c.top}vh) translate(-50%, -50%) scale(${c.scale}) rotate(${c.rotate}deg)`,
      opacity: 1,
      transitionDuration: `${ENTER_TRANSITION_MS}ms`,
      transitionDelay: '0ms',
      zIndex: isWinner ? 5 : 1,
    }
  }

  // Animasyonu yarıda kesmek için "Vazgeç" düğmesi ve Esc tuşu (hiçbir şey açılmadan kapanır).
  function cancelPick() {
    setPhase('idle')
    setCandidates([])
  }
  useEffect(() => {
    if (phase === 'idle') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') cancelPick()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const captionText =
    phase === 'entering' ? 'Karıştırılıyor...' : phase === 'eliminating' ? 'Eleniyor...' : phase === 'growing' ? 'Bu nasıl?' : ''

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading || phase !== 'idle'}
        title="Ne İzlesem? — kararsızsan rastgele bir şey seçer"
        className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-neutral-900 text-neutral-50 hover:text-[#00c0fa] transition disabled:opacity-50 shrink-0"
      >
        <StackedCardsIcon />
      </button>

      {/* Animasyon ve açılan pencereler document.body'ye çiziliyor: bu buton üst menünün
          (<header>) içinde ve üst menü aşağı kaydırılınca bulanıklık efekti (backdrop-blur) alıyor
          — bu efekt, içindeki "tam ekran" (position: fixed) öğeleri menünün kendi 64 piksellik
          alanına hapsediyor. Kullanıcı "detay penceresi aşağı kaydırınca yok oluyo, üste gidince
          geliyo" ve "animasyon tablonun arkasında kalıyo" dedi — ikisinin sebebi buydu (aynı
          sorun GlobalSearch'te de bu yüzden portal ile çözülmüştü). */}
      {createPortal(
        <>
          {phase !== 'idle' && (
            <div className="fixed inset-0 z-[60] bg-neutral-950/95 overflow-hidden">
              {/* Ortada marka renginde hafif bir parıltı — posterler onun üstünde dağılıyor. */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[70vmin] w-[70vmin] rounded-full blur-3xl opacity-20"
                style={{ background: 'radial-gradient(circle, #00c0fa 0%, #015eea 45%, transparent 70%)' }}
              />
              <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm px-4 py-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#00c0fa] opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00c0fa]" />
                </span>
                <span className="text-sm font-medium text-neutral-100">{captionText || 'Ne İzlesem?'}</span>
              </div>
              <button
                onClick={cancelPick}
                className="absolute top-6 right-6 z-20 text-sm text-neutral-400 hover:text-neutral-50 border border-neutral-800 hover:border-neutral-600 bg-neutral-900/80 rounded-full px-4 py-2 transition"
              >
                Vazgeç <span className="text-neutral-600 text-xs ml-1">Esc</span>
              </button>
              {candidates.map((c) => {
                const isWinner = c.key === winnerId
                const cover = c.cover
                // 'entering' fazında kendi sırası gelmeden (bkz. yukarıdaki `revealed` effect'i)
                // görseli hiç mount etme — sonraki fazlarda (eliminating/growing/fading) zaten
                // görülmüş olduğu için normal render ediliyor.
                const showImage = phase !== 'entering' || revealed.has(c.key)
                return (
                  <div
                    key={c.key}
                    className={`absolute left-0 top-0 ${c.landscape ? 'aspect-video w-44 sm:w-52' : 'aspect-[2/3] w-28 sm:w-32'} rounded-lg overflow-hidden shadow-2xl shadow-black/50 transition-all ease-out bg-neutral-800`}
                    style={styleFor(c, isWinner)}
                  >
                    {cover && showImage && <img src={cover} alt="" decoding="async" className="h-full w-full object-cover" />}
                  </div>
                )
              })}
            </div>
          )}

          {openRow && board && <RowDetailModal board={board} row={openRow} onClose={() => setOpenRow(null)} />}
          {openTmdb && board && (
            <TmdbPreviewModal
              boardId={board.id}
              card={openTmdb}
              onClose={() => setOpenTmdb(null)}
              onPickAgain={() => {
                setOpenTmdb(null)
                handleClick()
              }}
            />
          )}
        </>,
        document.body,
      )}
    </>
  )
}
