import { useEffect, useState, type CSSProperties } from 'react'
import type { Board, Row } from '../types'
import { rowsForFilter, shuffle } from '../lib/rowMeta'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import RowDetailModal from './RowDetailModal'

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

// Bir satırın posteri olarak önce arşivin "kapak" diye işaretlediği sütuna bakılır, o boşsa
// (ya da hiç kapak sütunu seçilmemişse) arşivdeki DİĞER tüm görsel sütunları sırayla denenir —
// kullanıcının arkadaşının arşivinde kapak sütunu hiç seçilmemiş ama Banner sütunu doluydu,
// eskiden bu durumda havuz tamamen boş sayılıyordu.
function resolveCoverImage(board: Board, row: Row): string {
  const imageProps = board.properties.filter((p) => p.type === 'image')
  const coverProp = imageProps.find((p) => p.id === board.coverPropertyId)
  if (coverProp) {
    const v = row.values[coverProp.id]
    if (v) return v as string
  }
  for (const p of imageProps) {
    const v = row.values[p.id]
    if (v) return v as string
  }
  return ''
}

type Candidate = {
  row: Row
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
      const [boards, allRows] = await Promise.all([api.getBoards(), api.getRows(settings.boardId)])
      const b = boards.find((x) => x.id === settings.boardId)
      if (!b) {
        notify('Arşiv bulunamadı.', 'danger')
        return
      }
      const filter = settings.randomPickerFilter
      // Hiç filtre ayarlanmadıysa (propertyId yok) arşivin TAMAMI havuz olur — kullanıcının
      // "hiç bi ayar yapılmadıysa default olarak tüm içerikleri gösterebilsin" isteği.
      const base = filter?.propertyId && filter.optionIds.length > 0 ? rowsForFilter(filter, allRows) : allRows
      // Poster olmadan dağılma animasyonu boş kutulara döner — bu yüzden sadece herhangi bir
      // görsel sütununda değeri olan kayıtlar havuza giriyor (sadece "kapak" olarak işaretli
      // sütuna değil — arşivde kapak hiç seçilmemiş ama başka bir görsel sütunu (ör. Banner)
      // dolu olabilir).
      const pool = base.filter((r) => Boolean(resolveCoverImage(b, r)))
      if (pool.length === 0) {
        notify('Bu filtreye uyan, kapak görseli olan bir içerik bulunamadı.', 'danger')
        return
      }
      const winner = pool[Math.floor(Math.random() * pool.length)]
      const count = settings.randomPickerCount ?? DEFAULT_SCATTER_COUNT
      const rest = shuffle(pool.filter((r) => r.id !== winner.id)).slice(0, count - 1)
      // `rest`in sırası zaten karışık — bu sıra aynı zamanda "kimin ne zaman kaybolacağını" da
      // belirliyor, ayrıca bir eleme sırası üretmeye gerek yok.
      const nonWinnerCount = rest.length
      const eliminateWindow = eliminatePhaseMs(nonWinnerCount)
      const laidOut: Candidate[] = [winner, ...rest].map((row, i) => ({
        row,
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
      setWinnerId(winner.id)
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
      const url = board ? resolveCoverImage(board, c.row) : ''
      if (!url) {
        markReady(c.row.id)
        return
      }
      const img = new Image()
      img.src = url
      if (typeof img.decode === 'function') {
        img.decode().then(() => markReady(c.row.id)).catch(() => markReady(c.row.id))
      } else {
        img.onload = () => markReady(c.row.id)
        img.onerror = () => markReady(c.row.id)
      }
    })
    const fallback = setTimeout(() => {
      if (!cancelled) setRevealed(new Set(candidates.map((c) => c.row.id)))
    }, ENTER_FALLBACK_MS)
    return () => {
      cancelled = true
      clearTimeout(fallback)
    }
  }, [phase, candidates, board])

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
      const winner = candidates.find((c) => c.row.id === winnerId)
      setPhase('idle')
      setCandidates([])
      if (winner) setOpenRow(winner.row)
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
    if (phase === 'entering' && !revealed.has(c.row.id)) {
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

  const captionText =
    phase === 'entering' ? 'Karıştırılıyor...' : phase === 'eliminating' ? 'Eleniyor...' : phase === 'growing' ? 'Bu nasıl?' : ''

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading || phase !== 'idle'}
        title="Ne İzlesem?"
        className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-neutral-900 text-neutral-50 hover:text-[#00c0fa] transition disabled:opacity-50 shrink-0"
      >
        <StackedCardsIcon />
      </button>

      {phase !== 'idle' && (
        <div className="fixed inset-0 z-[60] bg-neutral-950/95 overflow-hidden">
          {captionText && (
            <p className="absolute top-8 left-1/2 -translate-x-1/2 text-neutral-400 text-sm tracking-wide">{captionText}</p>
          )}
          {candidates.map((c) => {
            const isWinner = c.row.id === winnerId
            const cover = board ? resolveCoverImage(board, c.row) : ''
            // 'entering' fazında kendi sırası gelmeden (bkz. yukarıdaki `revealed` effect'i)
            // görseli hiç mount etme — sonraki fazlarda (eliminating/growing/fading) zaten
            // görülmüş olduğu için normal render ediliyor.
            const showImage = phase !== 'entering' || revealed.has(c.row.id)
            return (
              <div
                key={c.row.id}
                className="absolute left-0 top-0 aspect-[2/3] w-28 sm:w-32 rounded-lg overflow-hidden shadow-2xl shadow-black/50 transition-all ease-out bg-neutral-800"
                style={styleFor(c, isWinner)}
              >
                {cover && showImage && <img src={cover} alt="" decoding="async" className="h-full w-full object-cover" />}
              </div>
            )
          })}
        </div>
      )}

      {openRow && board && <RowDetailModal board={board} row={openRow} onClose={() => setOpenRow(null)} />}
    </>
  )
}
