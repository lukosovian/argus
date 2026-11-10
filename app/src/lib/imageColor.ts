// Bir görselin baskın rengini bulup ondan koyu ama canlı bir ton çıkarmak için ("Kim izliyor?" ekranının alt
// bölümü, detay penceresinin arka planı yapımın rengine bürünsün diye).

export type RGB = [number, number, number]

const cache = new Map<string, Promise<RGB | null>>()

// Görselin ortalama (baskın) rengi — küçültülmüş kopyasından. Aynı görsel için bir kez hesaplanır.
export function averageColor(src: string): Promise<RGB | null> {
  if (!src) return Promise.resolve(null)
  const hit = cache.get(src)
  if (hit) return hit
  const p = new Promise<RGB | null>((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 24
        c.height = 24
        const g = c.getContext('2d')!
        g.drawImage(img, 0, 0, 24, 24)
        const d = g.getImageData(0, 0, 24, 24).data
        let r = 0
        let gr = 0
        let b = 0
        let n = 0
        for (let i = 0; i < d.length; i += 4) {
          const lum = (d[i] + d[i + 1] + d[i + 2]) / 3
          if (lum < 18 || lum > 240) continue // simsiyah/bembeyaz kenarları sayma
          r += d[i]
          gr += d[i + 1]
          b += d[i + 2]
          n++
        }
        resolve(n ? [r / n, gr / n, b / n] : null)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
  cache.set(src, p)
  return p
}

function toHsl([r, g, b]: RGB): [number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return [h, s]
}

// Rengin koyu tonu: tonu (hue) korunur, doygunluk biraz artırılıp `maxSat`ta sınırlanır, açıklık sabit.
export function darkTone(rgb: RGB, lightness = 0.15, maxSat = 0.75): string {
  const [h, s0] = toHsl(rgb)
  const s = Math.min(maxSat, s0 * 1.6)
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(lightness, 1 - lightness)
  const f = (n: number) => lightness - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const hex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`
}
