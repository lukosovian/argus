import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { loadYouTubeApi, type YTPlayer } from '../lib/youtubePlayer'
import { isHoverVideoActive, subscribeHoverVideo } from '../lib/videoGuard'

// Düz 2 durak (renk -> transparent) çizgisel gradyan göze hâlâ keskin/kesik gibi görünüyor —
// insan gözü doğrusal alfa geçişini "aniden başlayıp aniden biten" bir kesim gibi algılıyor.
// Bunun yerine ara duraklarla yumuşatılmış (ease-out benzeri) bir alfa eğrisi kullanıyoruz.
function softFadeGradient(hex: string, direction: 'to top' | 'to bottom') {
  const clean = hex.replace('#', '')
  const n = parseInt(clean, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const stops = [
    [0, 1],
    [0.2, 0.92],
    [0.45, 0.65],
    [0.7, 0.32],
    [1, 0],
  ]
  const css = stops.map(([pos, a]) => `rgba(${r},${g},${b},${a}) ${pos * 100}%`).join(', ')
  return `linear-gradient(${direction}, ${css})`
}

export default function ShowcaseBanner({
  imageUrl,
  videoId,
  startSeconds,
  title,
  titleImageUrl,
  aspect = '21/9',
  titleAlwaysVisible = false,
  onShowingVideoChange,
  bottomFadeColor,
}: {
  imageUrl: string
  videoId: string | null
  startSeconds: number
  title: string
  // Doluysa, alttaki başlık şeridinde metin yerine bu görsel (Netflix tarzı
  // başlık logosu) gösterilir; boşsa normal metin başlığa düşülür.
  titleImageUrl?: string
  aspect?: '21/9' | '16/9'
  titleAlwaysVisible?: boolean
  onShowingVideoChange?: (showingVideo: boolean) => void
  // Doluysa, en altta bu renge doğru yumuşak bir soluklaşma (fade) eklenir — hem görsel/videonun
  // altındaki içerik alanına sert bir kesikle değil yumuşak geçmesini sağlar, hem de video
  // oynarken YouTube'un kırpmaya rağmen sızan alt kontrol şeridini görsel olarak örter.
  // Sadece detay penceresi geçiyor (kendi panel rengiyle); vitrinde uygulanmaz.
  bottomFadeColor?: string
}) {
  const [ended, setEnded] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [ready, setReady] = useState(false)
  const [muted, setMuted] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)

  useEffect(() => {
    setEnded(false)
    setStopped(false)
    setReady(false)
    setMuted(true)
    if (!videoId || !containerRef.current) return
    // YouTube's IFrame API replaces the given element with its own iframe rather than
    // mounting inside it — if we hand it the React-managed ref directly, React later
    // tries to remove a node YouTube already swapped out, crashing with a DOM
    // "not a child of this node" error. So we hand it a plain element we create and own
    // ourselves, nested inside the stable React-managed container.
    const mount = document.createElement('div')
    containerRef.current.appendChild(mount)
    // The iframe YouTube creates ignores any CSS we put on `mount` (it's a full
    // replacement, not a child) — it only respects explicit pixel width/height passed
    // to the Player constructor, defaulting to a tiny 640x390 otherwise. We size it to a
    // real 16:9 video that overflows our wider 21:9 box, then re-center the actual
    // <iframe> element (available after creation) to crop top/bottom instead of
    // letterboxing with black bars on the sides.
    // Arkadaşının attığı yöntemle aynı fikir, ama en-boy oranını bozmadan: video kutusunu
    // gerçek boyutundan biraz büyük (uniform "zoom") render edip container'ın
    // overflow-hidden'ıyla dört yandan kırpıyoruz. Sadece yüksekliği şişirmek YouTube'u
    // gerçek en-boy oranını koruması için içeride siyah bar (letterbox) bırakmaya
    // zorluyordu — width ve height'ı BİRLİKTE büyütünce YouTube'a hâlâ gerçek, bozulmamış
    // bir 16:9 video kutusu vermiş oluyoruz, sadece görünenden büyük; taşan kısım kırpılıyor.
    const ZOOM = 1.12
    const rect = containerRef.current.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width * ZOOM))
    const height = Math.round((width * 9) / 16)
    let cancelled = false
    loadYouTubeApi().then(() => {
      if (cancelled || !window.YT) return
      playerRef.current = new window.YT.Player(mount, {
        width,
        height,
        videoId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          start: startSeconds,
          rel: 0,
          controls: 0,
          modestbranding: 1,
          showinfo: 0,
          iv_load_policy: 3,
          disablekb: 1,
          fs: 0,
          cc_load_policy: 0,
          vq: 'hd1080',
        },
        events: {
          onReady: () => {
            if (cancelled) return
            playerRef.current?.setPlaybackQuality?.('hd1080')
            const iframe = playerRef.current?.getIframe()
            if (iframe) {
              iframe.style.position = 'absolute'
              iframe.style.top = '50%'
              iframe.style.left = '50%'
              iframe.style.transform = 'translate(-50%, -50%)'
              // YouTube'un kendi iframe'i miras alınan pointer-events:none'ı ezip kendi inline
              // stiliyle geliyor olabiliyor — video oynarken imleç video üzerindeyken tekerlek
              // kaydırmasının sayfaya geçmesi (durmaması) için burada da açıkça none veriyoruz.
              iframe.style.pointerEvents = 'none'
            }
            setReady(true)
          },
          onStateChange: (e) => {
            if (window.YT && e.data === window.YT.PlayerState.ENDED) setEnded(true)
          },
        },
      })
    })
    return () => {
      cancelled = true
      playerRef.current?.destroy?.()
      playerRef.current = null
      mount.remove()
    }
  }, [videoId, startSeconds])

  function toggleMute() {
    if (!playerRef.current) return
    if (muted) {
      playerRef.current.unMute()
      setMuted(false)
    } else {
      playerRef.current.mute()
      setMuted(true)
    }
  }

  function replay() {
    playerRef.current?.seekTo?.(startSeconds, true)
    playerRef.current?.playVideo?.()
    setEnded(false)
    setStopped(false)
  }

  // Kullanıcı "vitrindeki video aşağı kaydırılınca oynatması dursun" dedi — ekranın dışına
  // kaydırılınca oynatıcıyı duraklatıyoruz, geri kaydırılınca (manuel durdurulmadıysa) devam ediyor.
  const [isIntersecting, setIsIntersecting] = useState(true)
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setIsIntersecting(entry.isIntersecting), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Bir karta gelince açılan önizleme videosuyla (bkz. HoverPreviewVideo/videoGuard.ts) aynı anda
  // oynamasın diye — kullanıcı "aynı anda iki tane olmasın" dedi.
  const hoverVideoActive = useSyncExternalStore(subscribeHoverVideo, isHoverVideoActive)

  // Yukarıdaki üç sebepten (görünürlük, kart önizlemesi, manuel durdur/bitti) TEK bir "şu an
  // oynamalı mı" değeri türetip, sadece bu değer GERÇEKTEN değiştiğinde play/pause çağırıyoruz —
  // ayrı ayrı effect'ler birbirinin play/pause çağrısını geçersiz kılabilirdi.
  const shouldPlay = ready && !stopped && !ended && !hoverVideoActive && isIntersecting
  const wasPlayingRef = useRef(shouldPlay)
  useEffect(() => {
    if (!playerRef.current) return
    if (shouldPlay && !wasPlayingRef.current) playerRef.current.playVideo?.()
    else if (!shouldPlay && wasPlayingRef.current) playerRef.current.pauseVideo?.()
    wasPlayingRef.current = shouldPlay
  }, [shouldPlay])

  const showImage = !videoId || ended || stopped

  useEffect(() => {
    onShowingVideoChange?.(!showImage && Boolean(videoId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showImage, videoId])

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full ${aspect === '16/9' ? 'aspect-video' : 'aspect-[21/9]'} rounded-xl overflow-hidden bg-neutral-900`}
    >
      <img
        src="/logoblue.png"
        alt=""
        className="absolute top-7 left-7 z-10 h-6 w-6 object-contain opacity-95 pointer-events-none"
      />
      {imageUrl ? (
        <img src={imageUrl} alt={title} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-600">{title}</div>
      )}
      {/* Video katmanı, "bitti"/"durduruldu" durumunda kaldırılmak (unmount) yerine sadece
          saydamlaştırılıyor — DOM'dan sökülürse YouTube'un iframe'i de gerçekten yok olur,
          "tekrar oynat" o zaman aynı oynatıcıyı devam ettiremez, sıfırdan bir tane daha
          kurmamız gerekirdi (videoId/startSeconds değişmediği için effect da yeniden çalışmaz). */}
      {videoId && (
        <div
          ref={containerRef}
          className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-300 ${
            showImage ? 'opacity-0' : 'opacity-100'
          }`}
        />
      )}
      {bottomFadeColor && (
        <div
          className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-[4]"
          style={{ background: softFadeGradient(bottomFadeColor, 'to top') }}
        />
      )}
      {(titleAlwaysVisible || showImage) && (title || titleImageUrl) && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-5 pointer-events-none z-[5]">
          {titleImageUrl ? (
            <img
              src={titleImageUrl}
              alt={title}
              className="h-20 w-auto max-w-[75%] object-contain"
              style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.8))' }}
            />
          ) : (
            <p className="text-white text-2xl font-bold uppercase tracking-wide" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
              {title}
            </p>
          )}
        </div>
      )}
      {!showImage && ready && (
        <div className="absolute bottom-4 right-4 flex gap-2 z-10">
          <button
            onClick={() => setStopped(true)}
            className="h-9 w-9 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white transition"
            title="Videoyu durdur, görsele geç"
          >
            ⏹
          </button>
          <button
            onClick={toggleMute}
            className="h-9 w-9 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white transition"
            title={muted ? 'Sesi aç' : 'Sesi kapat'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      )}
      {showImage && videoId && ready && (
        <div className="absolute bottom-4 right-4 z-10">
          <button
            onClick={replay}
            className="h-9 flex items-center gap-1.5 px-3 rounded-full bg-black/60 hover:bg-black/80 text-white text-sm font-medium transition"
            title="Videoyu tekrar oynat"
          >
            <span aria-hidden>↻</span> Tekrar oynat
          </button>
        </div>
      )}
    </div>
  )
}
