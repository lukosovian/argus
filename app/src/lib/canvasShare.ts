import { fontReady } from './fontReady'
import { whiteLogo } from './whiteLogo'
import { tt } from './i18n'

// Takvim'in "Ayı paylaş" kartı ve Evrenler'in "Görsel olarak indir" listesi için ortak tuval yardımcıları (v1.25).
// Görseller crossOrigin=anonymous ile yüklenir (TMDB görselleri buna izin veriyor, /medya aynı adres); yine de bir
// görsel tuvali "kirletirse" (indirilemez hale getirirse) kart görselsiz yeniden çizilir.

export function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Görseli kutuyu dolduracak şekilde (kırparak) çizer
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

const fontFamily = () => getComputedStyle(document.body).fontFamily || 'Inter, system-ui, sans-serif'

function background(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = '#07080b'
  ctx.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, r: number, col: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, col)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  glow(W * 0.1, 0, Math.max(W, H) * 0.7, 'rgba(1,94,234,0.32)')
  glow(W, H, Math.max(W, H) * 0.6, 'rgba(0,192,250,0.18)')
}

// ARGUS yazısı + logo (marka geçişli)
function wordmark(ctx: CanvasRenderingContext2D, logo: HTMLCanvasElement | null, x: number, y: number, size: number) {
  const font = fontFamily()
  let tx = x
  if (logo) {
    ctx.drawImage(logo, x, y - size * 0.82, size, size)
    tx += size * 1.15
  }
  ctx.font = `800 ${size * 0.8}px ${font}`
  const g = ctx.createLinearGradient(tx, 0, tx + size * 3.4, 0)
  g.addColorStop(0, '#015eea')
  g.addColorStop(1, '#00c0fa')
  ctx.fillStyle = g
  ctx.fillText('ARGUS', tx, y)
}

// Tuvali PNG olarak indirir; tuval kirlendiyse (dış görsel) false döner
export async function downloadCanvas(canvas: HTMLCanvasElement, fileName: string): Promise<boolean> {
  let blob: Blob | null = null
  try {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  } catch {
    return false
  }
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return true
}

// Önce görsellerle, olmazsa görselsiz çizip indirir
export async function drawAndDownload(draw: (withImages: boolean) => Promise<HTMLCanvasElement>, fileName: string): Promise<boolean> {
  if (await downloadCanvas(await draw(true), fileName)) return true
  return downloadCanvas(await draw(false), fileName)
}

// ---- Takvim: ay özeti hikâye kartı (1080×1920) ---------------------------------------------------
export interface MonthCardData {
  title: string // "Kasım 2026"
  stats: { value: string; label: string }[]
  posters: { src: string; title: string }[]
}

export async function drawMonthCard(data: MonthCardData, withImages = true): Promise<HTMLCanvasElement> {
  const W = 1080
  const H = 1920
  const PAD = 90
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const posters = data.posters.slice(0, 6)
  const [logo, imgs] = await Promise.all([whiteLogo(), Promise.all(posters.map((p) => (withImages ? loadImage(p.src) : Promise.resolve(null)))), fontReady()])
  const font = fontFamily()
  background(ctx, W, H)
  ctx.textBaseline = 'alphabetic'

  wordmark(ctx, logo, PAD, PAD + 60, 64)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `600 34px ${font}`
  ctx.fillText(tt('Ayın özeti'), PAD, PAD + 170)
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 108px ${font}`
  ctx.fillText(fitText(ctx, data.title, W - PAD * 2), PAD, PAD + 290)

  // Sayılar: iki sütunlu kutucuklar
  const stats = data.stats.slice(0, 4)
  const gap = 28
  const boxW = (W - PAD * 2 - gap) / 2
  const boxH = 190
  stats.forEach((s, i) => {
    const x = PAD + (i % 2) * (boxW + gap)
    const y = PAD + 360 + Math.floor(i / 2) * (boxH + gap)
    roundRect(ctx, x, y, boxW, boxH, 28)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 2
    ctx.stroke()
    const g = ctx.createLinearGradient(x, 0, x + boxW, 0)
    g.addColorStop(0, '#015eea')
    g.addColorStop(1, '#00c0fa')
    ctx.fillStyle = g
    ctx.font = `900 88px ${font}`
    ctx.fillText(fitText(ctx, s.value, boxW - 60), x + 32, y + 105)
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = `600 32px ${font}`
    ctx.fillText(fitText(ctx, s.label, boxW - 60), x + 32, y + 155)
  })

  // Afişler: 3 sütun, en çok 2 satır
  const rowsTop = PAD + 360 + Math.ceil(stats.length / 2) * (boxH + gap) + 50
  if (posters.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = `700 30px ${font}`
    ctx.fillText(tt('Bu ay öne çıkanlar'), PAD, rowsTop)
    const cols = 3
    const pg = 26
    const pw = (W - PAD * 2 - pg * (cols - 1)) / cols
    const ph = pw * 1.5
    posters.forEach((p, i) => {
      const x = PAD + (i % cols) * (pw + pg)
      const y = rowsTop + 30 + Math.floor(i / cols) * (ph + pg)
      ctx.save()
      roundRect(ctx, x, y, pw, ph, 20)
      ctx.clip()
      ctx.fillStyle = '#1c1d22'
      ctx.fillRect(x, y, pw, ph)
      const img = imgs[i]
      if (img) drawCover(ctx, img, x, y, pw, ph)
      else {
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.font = `700 30px ${font}`
        ctx.fillText(fitText(ctx, p.title, pw - 30), x + 15, y + ph - 24)
      }
      ctx.restore()
    })
  }

  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = `600 26px ${font}`
  ctx.fillText(tt('ARGUS ile kaydedildi'), PAD, H - PAD + 20)
  return canvas
}

// ---- Evrenler: izleme sırası listesi (uzun PNG) ---------------------------------------------------
export interface OrderListData {
  title: string
  subtitle: string
  items: { title: string; year: string; done: boolean; poster: string | null }[]
}

export async function drawOrderList(data: OrderListData, withImages = true): Promise<HTMLCanvasElement> {
  const W = 1080
  const PAD = 70
  const ROW = 120
  const HEAD = 300
  const items = data.items.slice(0, 200)
  const H = HEAD + items.length * ROW + 140
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const [logo, imgs] = await Promise.all([whiteLogo(), Promise.all(items.map((it) => (withImages ? loadImage(it.poster) : Promise.resolve(null)))), fontReady()])
  const font = fontFamily()
  background(ctx, W, H)
  ctx.textBaseline = 'alphabetic'
  wordmark(ctx, logo, PAD, PAD + 50, 54)
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 72px ${font}`
  ctx.fillText(fitText(ctx, data.title, W - PAD * 2), PAD, PAD + 160)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `600 30px ${font}`
  ctx.fillText(fitText(ctx, data.subtitle, W - PAD * 2), PAD, PAD + 210)

  items.forEach((it, i) => {
    const y = HEAD + i * ROW
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.fillRect(PAD - 20, y, W - (PAD - 20) * 2, ROW)
    }
    // sıra numarası
    ctx.fillStyle = it.done ? '#00c0fa' : 'rgba(255,255,255,0.45)'
    ctx.font = `800 34px ${font}`
    ctx.textAlign = 'right'
    ctx.fillText(String(i + 1), PAD + 50, y + ROW / 2 + 12)
    ctx.textAlign = 'left'
    // afiş
    const px = PAD + 72
    const ph = ROW - 24
    const pw = ph / 1.5
    ctx.save()
    roundRect(ctx, px, y + 12, pw, ph, 8)
    ctx.clip()
    ctx.fillStyle = '#1c1d22'
    ctx.fillRect(px, y + 12, pw, ph)
    if (imgs[i]) drawCover(ctx, imgs[i]!, px, y + 12, pw, ph)
    ctx.restore()
    // ad + yıl
    const tx = px + pw + 26
    ctx.fillStyle = it.done ? 'rgba(255,255,255,0.75)' : '#ffffff'
    ctx.font = `700 36px ${font}`
    ctx.fillText(fitText(ctx, it.title, W - tx - PAD - 70), tx, y + ROW / 2 + 2)
    if (it.year) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.font = `500 26px ${font}`
      ctx.fillText(it.year, tx, y + ROW / 2 + 38)
    }
    // izlendi işareti
    if (it.done) {
      const cx = W - PAD - 24
      const cy = y + ROW / 2
      ctx.beginPath()
      ctx.arc(cx, cy, 24, 0, Math.PI * 2)
      ctx.fillStyle = '#00c0fa'
      ctx.fill()
      ctx.strokeStyle = '#06121a'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(cx - 11, cy + 1)
      ctx.lineTo(cx - 3, cy + 9)
      ctx.lineTo(cx + 12, cy - 8)
      ctx.stroke()
    }
  })
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = `600 24px ${font}`
  ctx.fillText(tt('ARGUS ile kaydedildi'), PAD, H - 60)
  return canvas
}
