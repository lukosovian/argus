import { tt } from './i18n'
// Vitrin'e eklenen sembollerin (internetten bulunan görsellerin) çoğunun düz beyaz/siyah bir arka
// planı oluyor; koyu vitrinde kutu gibi duruyor. Kenarlardan başlayıp kenar rengine yakın bölgeyi
// (taşma dolgusu — ortadaki aynı renkli kısımlara dokunmadan) şeffaf yapıyor, sonra boş kenarları
// kırpıyor. Sonuç PNG.

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(tt('Görsel açılamadı.')))
    img.src = src
  })
}

function drawToCanvas(img: HTMLImageElement, max = 1200) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas, ctx, w, h }
}

// Kenar pikselleri tek renk mi (temizlenecek bir arka plan var mı)? Zaten şeffafsa false.
export function hasFlatBackground(img: HTMLImageElement): boolean {
  const { ctx, w, h } = drawToCanvas(img, 300)
  const d = ctx.getImageData(0, 0, w, h).data
  const samples: number[][] = []
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 40))) samples.push(px(d, x, 0, w), px(d, x, h - 1, w))
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 40))) samples.push(px(d, 0, y, w), px(d, w - 1, y, w))
  if (samples.filter((s) => s[3] < 20).length > samples.length * 0.5) return false
  const bg = median(samples)
  return samples.filter((s) => dist(s, bg) < 40).length > samples.length * 0.8
}

function px(d: Uint8ClampedArray, x: number, y: number, w: number) {
  const i = (y * w + x) * 4
  return [d[i], d[i + 1], d[i + 2], d[i + 3]]
}
function median(list: number[][]) {
  return [0, 1, 2].map((c) => list.map((s) => s[c]).sort((a, b) => a - b)[Math.floor(list.length / 2)])
}
function dist(a: number[], b: number[]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export async function cleanupSymbol(img: HTMLImageElement, removeBackground: boolean): Promise<Blob> {
  const { canvas, ctx, w, h } = drawToCanvas(img)
  const data = ctx.getImageData(0, 0, w, h)
  const d = data.data
  if (removeBackground) {
    const border: number[][] = []
    for (let x = 0; x < w; x++) border.push(px(d, x, 0, w), px(d, x, h - 1, w))
    for (let y = 0; y < h; y++) border.push(px(d, 0, y, w), px(d, w - 1, y, w))
    const bg = median(border)
    const TOL = 42
    const SOFT = 70
    const seen = new Uint8Array(w * h)
    const queue = new Int32Array(w * h)
    let head = 0
    let tail = 0
    const push = (x: number, y: number) => {
      const p = y * w + x
      if (seen[p]) return
      seen[p] = 1
      queue[tail++] = p
    }
    for (let x = 0; x < w; x++) {
      push(x, 0)
      push(x, h - 1)
    }
    for (let y = 0; y < h; y++) {
      push(0, y)
      push(w - 1, y)
    }
    while (head < tail) {
      const p = queue[head++]
      const i = p * 4
      const dd = Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2])
      if (dd > SOFT) continue
      // Tam arka plan rengi tamamen, geçiş bölgesi (kenar yumuşatması) kısmen şeffaf
      d[i + 3] = dd <= TOL ? 0 : Math.min(d[i + 3], Math.round(((dd - TOL) / (SOFT - TOL)) * 255))
      if (dd > TOL) continue
      const x = p % w
      const y = (p - x) / w
      if (x > 0) push(x - 1, y)
      if (x < w - 1) push(x + 1, y)
      if (y > 0) push(x, y - 1)
      if (y < h - 1) push(x, y + 1)
    }
    ctx.putImageData(data, 0, 0)
  }
  // Boş (şeffaf) kenarları kırp
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 12) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
  let out = canvas
  if (maxX >= 0 && (minX > 0 || minY > 0 || maxX < w - 1 || maxY < h - 1)) {
    const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04)
    const cw = maxX - minX + 1 + pad * 2
    const ch = maxY - minY + 1 + pad * 2
    out = document.createElement('canvas')
    out.width = cw
    out.height = ch
    out.getContext('2d')!.drawImage(canvas, minX, minY, maxX - minX + 1, maxY - minY + 1, pad, pad, maxX - minX + 1, maxY - minY + 1)
  }
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
  if (!blob) throw new Error(tt('Görsel hazırlanamadı.'))
  return blob
}
