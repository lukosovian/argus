import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Board, Row } from '../types'
import { todayIso } from '../types'
import { resolveRole } from '../lib/roles'
import { rowsForFilter, shuffle } from '../lib/rowMeta'
import { hasActiveFilter } from '../lib/filters'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useToast } from '../hooks/useToast'
import { api, type TmdbCard } from '../lib/api'
import RowDetailModal from './RowDetailModal'
import TmdbPreviewModal from './TmdbPreviewModal'
import PickResult, { type SeriesSwap } from './PickResult'
import PickerPoolEditor, { DEFAULT_PICKER_TMDB, filterByYears } from './PickerPool'
import { tt } from '../lib/i18n'
import Icon from './Icon'

// İki üst üste binen "poster kartı" — biri düz, biri hafif çapraz (kullanıcı: "yan yana duran
// iki kart gibi olsun biri düz biri çapraz olarak"). Soldaki (düz) dolu, sağdaki (çapraz) boş
// — kullanıcı "soldaki kartın içi dolu olsun sağdakinin boş olsun" dedi. Çapraz olan SVG'de
// sonra çizildiği için düz olanın üstünde durur.
export function StackedCardsIcon() {
  return (
    <Icon name="cards" className="h-5 w-5" />
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

// Son kazananlar — kullanıcı "hep aynı şeyler geliyor" dedi. Son 60 kazanan bir sonraki seçimlerde (havuzda
// başka seçenek kaldıkça) kazanamıyor; TMDB modunda hiç getirilmiyor.
const RECENT_KEY = 'argus_pick_recent'
function recentPicks(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
function rememberPick(key: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...recentPicks().filter((k) => k !== key)].slice(0, 60)))
  } catch {
    /* önemsiz */
  }
}

// Seri filmler: kullanıcı "seri bir film gelirse ilk film gelsin izlemediysem" dedi. Kazanan bir serinin
// filmiyse ve serinin daha önceki (çıkmış) bir filmini izlemediyse, kazanan izlenmemiş en erken film olur.
// Seri bilgisi gelmezse (TMDB yavaş/yok) 2,5 sn sonra vazgeçilir, kazanan aynen kalır.
async function seriesStart(boardId: string, entry: { row?: Row; tmdb?: TmdbCard }) {
  if (entry.tmdb && entry.tmdb.mediaType !== 'movie') return null
  const ask = entry.row ? api.getCollection(boardId, entry.row.id) : api.getCollectionByTmdb(boardId, entry.tmdb!.tmdbId)
  const data = await Promise.race([ask.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2500))])
  const parts = data?.parts?.filter((p) => p.released) ?? []
  const at = parts.findIndex((p) => (entry.row ? p.rowId === entry.row.id : p.tmdbId === entry.tmdb!.tmdbId))
  if (at <= 0) return null
  const first = parts.findIndex((p) => !p.watched)
  if (first < 0 || first >= at) return null
  return { part: parts[first], index: first, pickedIndex: at }
}

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
// hideButton: telefonda düğme alttaki sekme çubuğunda (bkz. Navbar), burada sadece pencere/animasyon çizilir.
export default function RandomPickerButton({ hideButton = false }: { hideButton?: boolean }) {
  const { settings, saveSettings } = useHomeSettings()
  const { notify } = useToast()
  const [loading, setLoading] = useState(false)
  const [board, setBoard] = useState<Board | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'entering' | 'eliminating' | 'growing' | 'fading' | 'result'>('idle')
  // Kazanan: animasyon bitince detay penceresi yerine aynı mavi ışıklı ekranda sonuç gösteriliyor.
  const [result, setResult] = useState<Candidate | null>(null)
  const [swap, setSwap] = useState<SeriesSwap | null>(null)
  const [openRow, setOpenRow] = useState<Row | null>(null)
  const [openTmdb, setOpenTmdb] = useState<TmdbCard | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Hangi posterlerin görseli GERÇEKTEN yüklenip çözüldü — her poster kendi görseli hazır
  // olduğu anda "dağılma" animasyonuna başlıyor (bkz. aşağıdaki iki effect), sabit bir
  // zamanlayıcıyla değil. Bu hem "kartlar boş gelmesin" isteğini karşılıyor hem de 60 görselin
  // hepsini aynı anda indirip çözmeye çalışıp ana iş parçacığını tıkamasını (kullanıcının
  // bildirdiği donma) önlüyor — indirme/çözme işi doğal olarak zamana yayılıyor.
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  // Uygulamanın tepsi menüsündeki "Ne İzlesem?" (bkz. desktop/main.cjs openInApp)
  const clickRef = useRef<() => void>(() => {})
  useEffect(() => {
    const open = () => clickRef.current()
    window.addEventListener('argus-ne-izlesem', open)
    return () => window.removeEventListener('argus-ne-izlesem', open)
  }, [])

  async function handleClick(again = false) {
    if (loading || (phase !== 'idle' && !again)) return
    setResult(null)
    if (!settings.boardId) {
      notify(tt('Önce Ana Sayfa Ayarları\'ndan bir arşiv seçmelisin.'), 'danger')
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
        notify(tt('Arşiv bulunamadı.'), 'danger')
        return
      }
      const pref = current.randomPickerImageShape === 'dikey' || current.randomPickerImageShape === 'yatay' ? current.randomPickerImageShape : null
      const count = current.randomPickerCount ?? DEFAULT_SCATTER_COUNT

      type Entry = Omit<Candidate, 'left' | 'top' | 'rotate' | 'scale' | 'eliminateDelay'>
      let pool: Entry[]
      if (current.randomPickerSource === 'tmdb') {
        // TMDB modu: arşivde OLMAYAN (ve daha önce "bir daha gösterme" denmemiş) içerikler.
        // Her tıklamada farklı gelsin diye rastgele sayfalardan toplanıyor (random: true).
        const t = current.randomPickerTmdb ?? DEFAULT_PICKER_TMDB
        const mine = current.randomPickerOnlyMine ? (current.myPlatforms ?? []) : []
        const years = current.randomPickerYears
        const skip = recentPicks().filter((k) => k.startsWith('tmdb:')).map((k) => k.slice(5))
        const ask = (type: 'movie' | 'tv', n: number, genreIds: number[], excludeGenreIds: number[] = []) =>
          api
            .discoverTmdb(b.id, {
              type,
              genreIds,
              excludeGenreIds,
              count: n,
              sort: t.sort,
              random: true,
              yearFrom: years?.from,
              yearTo: years?.to,
              skip,
              maxMinutes: current.randomPickerMaxMinutes ?? null,
              platforms: mine,
            })
            .then((r) => r.items)
        const cards =
          t.type === 'mixed'
            ? shuffle((await Promise.all([ask('movie', Math.ceil(count / 2), []), ask('tv', Math.ceil(count / 2), [])])).flat())
            : await ask(t.type, count, t.genreIds, t.excludeGenreIds ?? [])
        pool = cards
          .map((c): Entry | null => {
            // Yatay istenirse TMDB'nin yatay görseli (backdrop), yoksa poster.
            const wantWide = pref === 'yatay'
            const url = wantWide ? c.backdrop || c.poster : c.poster || c.backdrop
            return url ? { key: `tmdb:${c.mediaType}:${c.tmdbId}`, tmdb: c, cover: url, landscape: url === c.backdrop } : null
          })
          .filter((e): e is Entry => e !== null)
        if (pool.length === 0) {
          notify(tt('Bu ayarlara uyan, arşivinde olmayan bir içerik bulunamadı.'), 'danger')
          return
        }
      } else {
        const filter = current.randomPickerFilter
        // Hiç filtre ayarlanmadıysa (propertyId yok) arşivin TAMAMI havuz olur — kullanıcının
        // "hiç bi ayar yapılmadıysa default olarak tüm içerikleri gösterebilsin" isteği.
        // Vizyon tarihi henüz gelmemiş (yayınlanmamış) yapımlar seçilmiyor — kullanıcı "izlenecek ama
        // çıktıktan sonra izleyebilirim" dedi. Vizyon tarihi boş olanlar havuzda kalıyor.
        const vizyonProp = resolveRole(b, 'vizyon')
        const today = todayIso()
        const released = allRows.filter((r) => {
          const v = vizyonProp ? r.values[vizyonProp.id] : null
          return !(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && v.slice(0, 10) > today)
        })
        let base = filterByYears(b, filter && hasActiveFilter(filter) ? rowsForFilter(filter, released) : released, current.randomPickerYears)
        // Süre: Süre sütunu dolu ve sınırdan uzun olanlar çıkar (dizilerde genelde boş, kalırlar)
        const maxMin = current.randomPickerMaxMinutes
        const sureProp = resolveRole(b, 'sure')
        if (maxMin && sureProp) base = base.filter((r) => !(typeof r.values[sureProp.id] === 'number' && (r.values[sureProp.id] as number) > maxMin))
        // Platformlarım: izlenmemiş kayıtların platformları arka planda günde bir öğreniliyor (bkz. server checkWatchlist)
        const mineIds = current.randomPickerOnlyMine ? (current.myPlatforms ?? []) : []
        if (mineIds.length) {
          const { ready, platforms } = await api.getRowPlatforms(b.id)
          base = base.filter((r) => platforms[r.id]?.some((id) => mineIds.includes(id)))
          if (base.length === 0 && !ready) {
            notify(tt('Platform bilgileri henüz toplanıyor (ARGUS açıldıktan birkaç dakika sonra hazır olur). Biraz sonra tekrar dene.'), 'danger')
            return
          }
        }
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
          notify(tt('Bu filtreye uyan, seçili görseli olan bir içerik bulunamadı.'), 'danger')
          return
        }
      }

      const recent = new Set(recentPicks())
      const notRecent = pool.filter((e) => !recent.has(e.key))
      const from = notRecent.length ? notRecent : pool
      let winner: Entry = from[Math.floor(Math.random() * from.length)]
      rememberPick(winner.key)
      let swap: SeriesSwap | null = null
      const start = await seriesStart(b.id, winner)
      if (start) {
        const row = start.part.rowId ? allRows.find((r) => r.id === start.part.rowId) : undefined
        const img = row ? pickImage(row, await classifyImageColumns(b, allRows), pref) : null
        const cover = img?.url || start.part.poster || ''
        if (cover && (row || !start.part.inArchive)) {
          swap = { pickedTitle: winner.tmdb?.title ?? '', pickedNumber: start.pickedIndex + 1, number: start.index + 1 }
          if (winner.row) {
            const tp = b.properties.find((p) => p.id === b.titlePropertyId)
            swap.pickedTitle = tp ? String(winner.row.values[tp.id] ?? '') : ''
          }
          winner = row
            ? { key: row.id, row, cover, landscape: Boolean(img?.landscape) }
            : { key: `tmdb:movie:${start.part.tmdbId}`, tmdb: start.part, cover, landscape: false }
        }
      }
      setSwap(swap)
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
      notify(e instanceof Error ? e.message : tt('Bir şeyler ters gitti.'), 'danger')
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
      setCandidates([])
      if (winner) {
        setResult(winner)
        setPhase('result')
      } else setPhase('idle')
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
    setResult(null)
    setFiltersOpen(false)
  }
  useEffect(() => {
    if (phase === 'idle' || openRow || openTmdb) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (filtersOpen) setFiltersOpen(false)
      else cancelPick()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, openRow, openTmdb, filtersOpen])

  const captionText =
    phase === 'entering' ? tt('Karıştırılıyor...') : phase === 'eliminating' ? tt('Eleniyor...') : phase === 'growing' ? tt('Bu nasıl?') : ''

  clickRef.current = () => {
    void handleClick()
  }

  return (
    <>
      {!hideButton && <button
        onClick={() => handleClick()}
        disabled={loading || phase !== 'idle'}
        title={tt('Ne İzlesem? — kararsızsan rastgele bir şey seçer')}
        className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-neutral-900 text-neutral-50 hover:text-[#00c0fa] transition disabled:opacity-50 shrink-0"
      >
        <StackedCardsIcon />
      </button>}

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
              {phase !== 'result' && (
              <div className="safe-shift absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm px-4 py-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#00c0fa] opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00c0fa]" />
                </span>
                <span className="text-sm font-medium text-neutral-100">{captionText || tt('Ne İzlesem?')}</span>
              </div>
              )}
              {/* Sağ üst: sonuç ekranında "Tekrar getir" (mavi çerçeve, üstüne gelince mavi dolu) ve
                  "Kapat" (kırmızı çerçeve, üstüne gelince kırmızı dolu, yazı siyah) — kullanıcı böyle istedi. */}
              <div className="safe-shift absolute top-6 right-6 z-40 flex items-center gap-2">
                {phase === 'result' && (
                  <button
                    onClick={() => setFiltersOpen((o) => !o)}
                    className={`text-sm font-medium rounded-full px-4 py-2 border transition ${
                      filtersOpen ? 'border-neutral-300 bg-neutral-100 text-black' : 'border-neutral-600 text-neutral-200 bg-neutral-900/80 hover:border-neutral-300'
                    }`}
                  >
                    {tt('Filtreler')}
                  </button>
                )}
                {phase === 'result' && (
                  <button
                    onClick={() => handleClick(true)}
                    disabled={loading}
                    className="text-sm font-medium rounded-full px-4 py-2 border border-[#00c0fa] text-[#00c0fa] bg-neutral-900/80 hover:bg-[#00c0fa] hover:text-black transition disabled:opacity-50"
                  >
                    {tt('↻ Tekrar getir')}
                  </button>
                )}
                <button
                  onClick={cancelPick}
                  className="group text-sm font-medium rounded-full px-4 py-2 border border-rose-500 text-rose-400 bg-neutral-900/80 hover:bg-rose-500 hover:text-black transition"
                >
                  {phase === 'result' ? tt('Kapat') : tt('Vazgeç')} <span className="max-md:hidden text-rose-400/60 group-hover:text-black/60 text-xs ml-1">{tt('Esc')}</span>
                </button>
              </div>
              {phase === 'result' && result && board && (
                <PickResult
                  key={result.key}
                  board={board}
                  row={result.row}
                  tmdb={result.tmdb}
                  cover={result.cover}
                  landscape={result.landscape}
                  swap={swap}
                  onAgain={() => handleClick(true)}
                  // Sonuç ekranı arkada açık kalıyor — pencere kapanınca aynı sonuca geri dönülür.
                  onOpenRow={(r) => setOpenRow(r)}
                  onOpenTmdb={(c) => setOpenTmdb(c)}
                />
              )}
              {/* Kullanıcı "Ne İzlesem'in filtrelemeleri Ne İzlesem'in içinden de yapılabilsin" dedi: sağda açılan
                  panel, Ayarlar'daki havuz ayarlarının aynısı; değişiklik hemen kaydedilir, "Bu filtreyle getir" yeniden seçer. */}
              {phase === 'result' && filtersOpen && (
                <div className="absolute top-20 right-6 bottom-6 z-40 w-[min(26rem,calc(100vw-3rem))] flex flex-col rounded-2xl border border-neutral-800 bg-neutral-950/95 backdrop-blur-md shadow-2xl shadow-black/60">
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <p className="text-sm font-semibold text-neutral-100">{tt('Nereden seçilsin')}</p>
                    <PickerPoolEditor board={board ?? undefined} settings={settings} onSave={saveSettings} />
                  </div>
                  <div className="p-3 border-t border-neutral-800">
                    <button
                      onClick={() => {
                        setFiltersOpen(false)
                        handleClick(true)
                      }}
                      disabled={loading}
                      className="w-full text-sm font-semibold rounded-full px-4 py-2 bg-[#00c0fa] text-black hover:brightness-110 transition disabled:opacity-50"
                    >
                      {tt('Bu filtreyle getir')}
                    </button>
                  </div>
                </div>
              )}
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

          {openRow && board && (
            <div className="relative z-[70]">
              <RowDetailModal board={board} row={openRow} onClose={() => setOpenRow(null)} />
            </div>
          )}
          {openTmdb && board && (
            <div className="relative z-[70]">
            <TmdbPreviewModal
              boardId={board.id}
              card={openTmdb}
              onClose={() => setOpenTmdb(null)}
              onPickAgain={() => {
                setOpenTmdb(null)
                handleClick(true)
              }}
            />
            </div>
          )}
        </>,
        document.body,
      )}
    </>
  )
}
