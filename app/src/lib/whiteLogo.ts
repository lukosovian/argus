// Hikâye kartlarının ve poster duvarının köşesindeki beyaz ARGUS "A" logosu. Logonun sadece mavi hali
// var (public/logoblue.png; logow.png eski "α" logo) — tuvalde beyaza boyanıyor.
let cached: Promise<HTMLCanvasElement | null> | null = null

export function whiteLogo(): Promise<HTMLCanvasElement | null> {
  if (!cached)
    cached = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        ctx.globalCompositeOperation = 'source-in'
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, c.width, c.height)
        resolve(c)
      }
      img.onerror = () => {
        cached = null
        resolve(null)
      }
      img.src = '/logoblue.png'
    })
  return cached
}
