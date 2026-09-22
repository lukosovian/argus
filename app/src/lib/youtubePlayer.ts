// YouTube IFrame API'sini yükleyip paylaşan ortak yardımcı — hem vitrindeki büyük oynatıcı
// (ShowcaseBanner) hem de kart üzerine gelince oynayan küçük önizleme (HoverPreviewVideo)
// aynı script'i tekrar tekrar eklemeden bunu kullanıyor.
export interface YTPlayer {
  destroy: () => void
  mute: () => void
  unMute: () => void
  getIframe: () => HTMLIFrameElement
  setPlaybackQuality: (quality: string) => void
  setSize: (width: number, height: number) => void
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void
  playVideo: () => void
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          width: number
          height: number
          videoId: string
          playerVars: Record<string, number | string>
          events: {
            onReady?: () => void
            onStateChange?: (e: { data: number }) => void
          }
        },
      ) => YTPlayer
      PlayerState: { ENDED: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<void> | null = null
export function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
  return apiPromise
}
