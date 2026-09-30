import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '../hooks/useToast'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import { whiteLogo } from '../lib/whiteLogo'
import { useEscape } from '../hooks/useEscape'

// Koleksiyon'un paylaşılabilir görseli — kullanıcı "koleksiyonun görsel tablosunu oluşturma ekle, Flashback'teki
// gibi PNG görselini alacağım" dedi. Raflar (sembolü, adı ve yapımlarıyla) ve istenirse tek başına olanlar,
// sayfadaki gibi koyu, üstten ışıklı vitrinler halinde tek bir uzun PNG'ye çizilir (1600 px genişlik).
// Görseller /medya ve /semboller'den (ARGUS'un kendi adresi) geldiği için tuval kirlenmiyor.

export interface ImageItem {
  title: string
  year: string
  isSeries: boolean
  symbol: string | null
  logo: string
}
export interface ImageShelf {
  name: string
  symbol: string | null
  items: ImageItem[]
}

const W = 1600
const PAD = 70
const TILE = 150
const GAP = 18
const CAPTION = 56
const SHELF_SYMBOL = 200
// Chrome'da tuval en fazla ~32000 px yüksekliğinde olabiliyor
const MAX_H = 30000

type Ctx = CanvasRenderingContext2D

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const family = () => getComputedStyle(document.body).fontFamily || 'sans-serif'
function font(ctx: Ctx, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${family()}`
}
function ellipsis(ctx: Ctx, t: string, maxW: number) {
  if (ctx.measureText(t).width <= maxW) return t
  let s = t
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1)
  return s.trimEnd() + '…'
}
function wrapLines(ctx: Ctx, t: string, maxW: number, lines: number) {
  const out: string[] = []
  let line = ''
  for (const w of t.split(' ')) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line)
      line = w
      if (out.length === lines) break
    } else line = test
  }
  if (out.length < lines && line) out.push(line)
  if (out.length === lines && t.length > out.join(' ').length) out[lines - 1] = ellipsis(ctx, out[lines - 1] + '…', maxW)
  return out
}

// Görseli kutunun içine en/boy oranını bozmadan sığdır
function contain(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * s
  const dh = img.naturalHeight * s
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

// Sayfadaki vitrin kutusu: koyu, üstten ışıklı
function spot(ctx: Ctx, x: number, y: number, s: number, r: number) {
  ctx.save()
  rr(ctx, x, y, s, s, r)
  ctx.clip()
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(x, y, s, s)
  const g = ctx.createRadialGradient(x + s / 2, y, 0, x + s / 2, y, s * 0.9)
  g.addColorStop(0, 'rgba(255,255,255,0.10)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(x, y, s, s)
  ctx.restore()
  rr(ctx, x, y, s, s, r)
  ctx.strokeStyle = 'rgba(255,255,255,0.09)'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function tile(ctx: Ctx, it: ImageItem, x: number, y: number, imgs: Map<string, HTMLImageElement | null>) {
  spot(ctx, x, y, TILE, 18)
  const sym = it.symbol ? imgs.get(it.symbol) : null
  const logo = !sym && it.logo ? imgs.get(it.logo) : null
  if (sym) {
    ctx.save()
    ctx.shadowColor = 'rgba(255,255,255,0.18)'
    ctx.shadowBlur = 18
    contain(ctx, sym, x + 20, y + 20, TILE - 40, TILE - 40)
    ctx.restore()
  } else if (logo) {
    ctx.globalAlpha = 0.92
    contain(ctx, logo, x + 16, y + TILE * 0.15, TILE - 32, TILE * 0.7)
    ctx.globalAlpha = 1
  } else {
    font(ctx, 700, 19)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.textAlign = 'center'
    const lines = wrapLines(ctx, it.title, TILE - 24, 4)
    lines.forEach((l, i) => ctx.fillText(l, x + TILE / 2, y + TILE / 2 - (lines.length - 1) * 12 + i * 24 + 6))
    ctx.textAlign = 'left'
  }
  font(ctx, 500, 17)
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.fillText(ellipsis(ctx, it.title, TILE), x, y + TILE + 24)
  font(ctx, 400, 14)
  ctx.fillStyle = 'rgba(255,255,255,0.42)'
  ctx.fillText([it.year, it.isSeries ? 'Dizi' : 'Film'].filter(Boolean).join(' · '), x, y + TILE + 44)
}

function glassShelf(ctx: Ctx, x: number, y: number, w: number) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.16)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  rr(ctx, x, y, w, 6, 3)
  ctx.fill()
}

function layout(shelves: ImageShelf[], loose: ImageItem[]) {
  const innerW = W - PAD * 2 - 40
  const rowW = innerW - SHELF_SYMBOL - 40
  const perRow = Math.max(1, Math.floor((rowW + GAP) / (TILE + GAP)))
  const shelfH = shelves.map((s) => {
    const rows = Math.max(1, Math.ceil(s.items.length / perRow))
    return Math.max(SHELF_SYMBOL + 90, rows * (TILE + CAPTION + 24)) + 60
  })
  const loosePer = Math.max(1, Math.floor((innerW + GAP) / (TILE + GAP)))
  const looseH = loose.length ? 110 + Math.ceil(loose.length / loosePer) * (TILE + CAPTION + 14) + 30 : 0
  const header = 380
  const footer = 150
  const total = header + shelfH.reduce((a, b) => a + b + 28, 0) + (looseH ? looseH + 28 : 0) + footer
  return { perRow, loosePer, shelfH, looseH, header, total }
}

async function draw(shelves: ImageShelf[], loose: ImageItem[], stats: string): Promise<{ blob: Blob; cut: number }> {
  // Çok uzun olursa tek başına olanlardan kırpılır (tuval sınırı)
  let l = layout(shelves, loose)
  let looseShown = loose
  while (l.total > MAX_H && looseShown.length > 0) {
    looseShown = looseShown.slice(0, Math.max(0, looseShown.length - l.loosePer * 4))
    l = layout(shelves, looseShown)
  }
  const H = Math.min(l.total, MAX_H)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const srcs = [...new Set([...shelves.flatMap((s) => [s.symbol, ...s.items.flatMap((i) => [i.symbol, i.logo])]), ...looseShown.flatMap((i) => [i.symbol, i.logo])].filter((x): x is string => Boolean(x)))]
  const [logo, loaded] = await Promise.all([whiteLogo(), Promise.all(srcs.map(loadImage))])
  const imgs = new Map(srcs.map((s, i) => [s, loaded[i]]))

  // arka plan
  ctx.fillStyle = '#070709'
  ctx.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, r: number, col: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, col)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, Math.max(0, y - r), W, r * 2)
  }
  glow(W * 0.15, 0, 900, 'rgba(0,192,250,0.16)')
  glow(W * 0.95, 420, 800, 'rgba(120,60,200,0.13)')
  ctx.textBaseline = 'alphabetic'

  // başlık
  font(ctx, 700, 26)
  ctx.fillStyle = '#7fdcff'
  ctx.fillText('A R G U S', PAD, 120)
  font(ctx, 900, 118)
  ctx.fillStyle = '#ffffff'
  ctx.fillText('Koleksiyon', PAD - 4, 240)
  font(ctx, 500, 30)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText(stats, PAD, 305)

  let y = l.header
  const innerX = PAD + 20
  shelves.forEach((s, si) => {
    const h = l.shelfH[si]
    rr(ctx, PAD, y, W - PAD * 2, h, 34)
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // rafın büyük sembolü + adı
    const sx = innerX + 10
    const sy = y + 30
    spot(ctx, sx, sy, SHELF_SYMBOL, 26)
    const sym = s.symbol ? imgs.get(s.symbol) : null
    if (sym) {
      ctx.save()
      ctx.shadowColor = 'rgba(255,255,255,0.2)'
      ctx.shadowBlur = 24
      contain(ctx, sym, sx + 30, sy + 30, SHELF_SYMBOL - 60, SHELF_SYMBOL - 60)
      ctx.restore()
    } else {
      font(ctx, 900, 90)
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.textAlign = 'center'
      ctx.fillText(s.name.slice(0, 1).toLocaleUpperCase('tr'), sx + SHELF_SYMBOL / 2, sy + SHELF_SYMBOL / 2 + 32)
      ctx.textAlign = 'left'
    }
    font(ctx, 800, 30)
    ctx.fillStyle = '#ffffff'
    const nameLines = wrapLines(ctx, s.name, SHELF_SYMBOL + 10, 2)
    nameLines.forEach((ln, i) => ctx.fillText(ln, sx, sy + SHELF_SYMBOL + 40 + i * 34))
    font(ctx, 400, 18)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText(`${s.items.length} yapım`, sx, sy + SHELF_SYMBOL + 40 + nameLines.length * 34)
    // yapımlar
    const tx = sx + SHELF_SYMBOL + 40
    s.items.forEach((it, i) => {
      const row = Math.floor(i / l.perRow)
      const col = i % l.perRow
      const ty = y + 30 + row * (TILE + CAPTION + 24)
      tile(ctx, it, tx + col * (TILE + GAP), ty, imgs)
      if (col === 0) glassShelf(ctx, tx - 10, ty + TILE + CAPTION + 4, Math.min(s.items.length - row * l.perRow, l.perRow) * (TILE + GAP) + 20)
    })
    y += h + 28
  })

  if (l.looseH) {
    rr(ctx, PAD, y, W - PAD * 2, l.looseH, 34)
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.stroke()
    font(ctx, 800, 30)
    ctx.fillStyle = '#ffffff'
    ctx.fillText('Tek başına olanlar', innerX + 10, y + 60)
    font(ctx, 400, 18)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText(`${looseShown.length} yapım`, innerX + 10, y + 88)
    looseShown.forEach((it, i) => {
      const row = Math.floor(i / l.loosePer)
      const col = i % l.loosePer
      tile(ctx, it, innerX + 10 + col * (TILE + GAP), y + 110 + row * (TILE + CAPTION + 14), imgs)
    })
    y += l.looseH + 28
  }

  // alt bilgi
  if (logo) {
    ctx.globalAlpha = 0.75
    ctx.drawImage(logo, PAD, H - 118, 60, 60)
    ctx.globalAlpha = 1
  }
  font(ctx, 500, 20)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  const d = new Date()
  ctx.fillText(`${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`, W - PAD - 110, H - 78)

  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  if (!blob) throw new Error('Görsel oluşturulamadı.')
  return { blob, cut: loose.length - looseShown.length }
}

export default function KoleksiyonImage({
  shelves,
  loose,
  stats,
  filtered,
  onClose,
}: {
  shelves: ImageShelf[]
  loose: ImageItem[]
  stats: string
  // Sayfada Film/Dizi, sembol ya da arama süzgeci açık mı (görsel de ona göre)
  filtered: boolean
  onClose: () => void
}) {
  const { notify } = useToast()
  const [withLoose, setWithLoose] = useState(loose.length <= 120)
  const [url, setUrl] = useState<string | null>(null)
  const [cut, setCut] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    let made: string | null = null
    setUrl(null)
    setError(null)
    draw(shelves, withLoose ? loose : [], stats)
      .then(({ blob, cut }) => {
        if (!alive) return
        made = URL.createObjectURL(blob)
        setUrl(made)
        setCut(cut)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Görsel oluşturulamadı.'))
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [shelves, loose, stats, withLoose])

  // Esc: sadece en üstteki pencere kapanır (bkz. hooks/useEscape)
  useEscape(true, onClose)

  function download() {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `ARGUS Koleksiyon.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    notify('Koleksiyon görseli indirildi — İndirilenler klasörüne bakabilirsin.')
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/90 overflow-y-auto py-5 px-4" onClick={onClose}>
      <div className="mx-auto w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-neutral-100 font-semibold">Koleksiyon görseli</p>
            <p className="text-xs text-neutral-500">
              {shelves.length} raf{withLoose ? ` + ${loose.length - cut} tek başına yapım` : ''}
              {filtered ? ' · sayfadaki süzgeç (Film/Dizi, sembol, arama) görsele de uygulandı' : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Kapat" className="h-9 w-9 shrink-0 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-lg">
            ×
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {loose.length > 0 && (
            <button
              onClick={() => setWithLoose((v) => !v)}
              className={`text-sm rounded-xl px-3 py-1.5 border transition ${withLoose ? 'border-[#00c0fa] text-[#7fdcff] bg-[#00c0fa]/10' : 'border-neutral-700 text-neutral-400 hover:text-neutral-100'}`}
            >
              Tek başına olanlar da olsun ({loose.length})
            </button>
          )}
          <button onClick={download} disabled={!url} style={primaryButtonStyle} className={`ml-auto text-sm px-4 py-2 rounded-xl ${PRIMARY_BUTTON} disabled:opacity-50`}>
            ↓ PNG olarak indir
          </button>
        </div>
        {cut > 0 && <p className="text-xs text-amber-400 mb-2">Görsel çok uzun olduğu için tek başına olanlardan son {cut} tanesi sığmadı.</p>}
        <div className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 min-h-40 flex items-center justify-center">
          {error ? (
            <p className="text-sm text-red-400 p-6">{error}</p>
          ) : url ? (
            <img src={url} alt="Koleksiyon görseli" className="w-full h-auto" />
          ) : (
            <span className="flex items-center gap-2 text-sm text-neutral-400 p-10">
              <span className="h-4 w-4 rounded-full border-2 border-[#00c0fa] border-t-transparent animate-spin" /> Hazırlanıyor…
            </span>
          )}
        </div>
        <p className="text-[11px] text-neutral-500 text-center mt-2">1600 px genişliğinde, rafların hepsi tek görselde.</p>
      </div>
    </div>,
    document.body,
  )
}
