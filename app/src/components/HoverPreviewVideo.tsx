import { useEffect, useRef } from 'react'
import { loadYouTubeApi, type YTPlayer } from '../lib/youtubePlayer'
import { beginHoverVideo, endHoverVideo } from '../lib/videoGuard'

// Kart üzerine gelince kapak görseli yerine sessiz, kontrolsüz bir YouTube önizlemesi oynatır.
// ShowcaseBanner'daki büyük oynatıcıyla aynı fikir (zoom + ortalama ile kenar taşmasını kırpma)
// ama kart küçük olduğu için daha basit: sadece container'ı dolduran, tıklanamayan bir katman.
export default function HoverPreviewVideo({ videoId, startSeconds }: { videoId: string; startSeconds: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)

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

  return <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden" />
}
