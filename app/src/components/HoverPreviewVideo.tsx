import { useEffect, useRef, useState } from 'react'
import { loadYouTubeApi, type YTPlayer } from '../lib/youtubePlayer'
import { beginHoverVideo, endHoverVideo } from '../lib/videoGuard'

// Kart üzerine gelince kapak görseli yerine, sessiz başlayan (tarayıcıların otomatik oynatma
// kuralı gereği) ama küçük bir hoparlör düğmesiyle sesi açılabilen bir YouTube önizlemesi
// oynatır — kullanıcı "üzerine gelince açılan pencerede videoların sesi yok" dedi, ShowcaseBanner'
// daki büyük oynatıcıyla aynı fikir (zoom + ortalama ile kenar taşmasını kırpma, sessiz-başla +
// sesi aç düğmesi) ama kart küçük olduğu için daha basit.
export default function HoverPreviewVideo({ videoId, startSeconds }: { videoId: string; startSeconds: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [ready, setReady] = useState(false)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Bu bileşen zaten sadece hover sırasında mount ediliyor ({hovering && yt ? ... : null}) —
    // mount/unmount'un kendisi "bir önizleme videosu şu an aktif" sinyali olarak yeterli,
    // vitrindeki/detay penceresindeki büyük videonun aynı anda oynamaması için (bkz. videoGuard.ts).
    beginHoverVideo()
    const mount = document.createElement('div')
    container.appendChild(mount)
    const ZOOM = 1.15
    function sizeFor(rect: { width: number }) {
      const width = Math.max(1, Math.round(rect.width * ZOOM))
      const height = Math.round((width * 9) / 16)
      return { width, height }
    }
    let cancelled = false
    let ro: ResizeObserver | null = null
    const initial = sizeFor(container.getBoundingClientRect())
    loadYouTubeApi().then(() => {
      if (cancelled || !window.YT) return
      playerRef.current = new window.YT.Player(mount, {
        width: initial.width,
        height: initial.height,
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
          loop: 1,
          playlist: videoId,
        },
        events: {
          onReady: () => {
            if (cancelled) return
            const iframe = playerRef.current?.getIframe()
            if (iframe) {
              iframe.style.position = 'absolute'
              iframe.style.top = '50%'
              iframe.style.left = '50%'
              iframe.style.transform = 'translate(-50%, -50%)'
              iframe.style.pointerEvents = 'none'
            }
            // Kartın "dinlenme" boyutundan hover boyutuna büyümesi bir CSS geçişiyle
            // (transition-all duration-200) oluyor — oynatıcı bu geçiş tamamlanmadan
            // oluşturulduğunda yukarıdaki `initial` ölçüm hâlâ küçük boyuta ait kalabiliyor.
            // Container'ı gözlemleyip gerçek (nihai) boyuta göre yeniden boyutlandırıyoruz.
            ro = new ResizeObserver((entries) => {
              const entry = entries[0]
              if (!entry) return
              const { width, height } = sizeFor(entry.contentRect)
              playerRef.current?.setSize?.(width, height)
            })
            ro.observe(container)
            setReady(true)
          },
        },
      })
    })
    return () => {
      cancelled = true
      ro?.disconnect()
      playerRef.current?.destroy?.()
      playerRef.current = null
      mount.remove()
      endHoverVideo()
    }
  }, [videoId, startSeconds])

  function toggleMute(e: React.SyntheticEvent) {
    // Bu bileşen bir `<button>`ın (HomeCard/MoodCard'ın dış sarmalayıcısı) İÇİNDE render
    // ediliyor — buraya gerçek bir `<button>` daha koymak geçersiz (iç içe buton) olurdu, bu
    // yüzden tıklanabilir bir `<span role="button">` kullanılıyor; olayın dışarıdaki karta
    // tıklanmış gibi algılanıp detay penceresini açmaması için stopPropagation şart.
    e.stopPropagation()
    if (!playerRef.current) return
    if (muted) {
      playerRef.current.unMute()
      setMuted(false)
    } else {
      playerRef.current.mute()
      setMuted(true)
    }
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={containerRef} className="absolute inset-0 pointer-events-none" />
      {ready && (
        <span
          role="button"
          tabIndex={0}
          onClick={toggleMute}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleMute(e)}
          title={muted ? 'Sesi aç' : 'Sesi kapat'}
          className="absolute bottom-1.5 right-1.5 z-10 h-6 w-6 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white text-xs pointer-events-auto cursor-pointer transition"
        >
          {muted ? '🔇' : '🔊'}
        </span>
      )}
    </div>
  )
}
