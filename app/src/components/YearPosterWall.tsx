import { useState } from 'react'
import { useToast } from '../hooks/useToast'
import { whiteLogo } from '../lib/whiteLogo'

// Yıllık Özet'teki "izleme sıran" duvarı — kullanıcı "izleme sırama göre izlediğim şeylerin dikey
// posterlerini veren bir görsel oluştursun, istersem indirebileyim" dedi. Sayfada küçük önizleme var;
// "Görseli indir" aynı düzeni tuvale (canvas) büyük çizip PNG olarak indiriyor. Görseller /medya'dan,
// yani ARGUS'un kendi adresinden geldiği için tuval "kirlenmiyor", indirme engellenmiyor.
export interface WallItem {
  title: string
  poster: string
  date: string
}

const CELL = 200
const GAP = 10
const PAD = 48

function columnsFor(n: number) {
  if (n <= 4) return Math.max(n, 1)
  if (n <= 12) return 4
  return Math.min(12, Math.ceil(Math.sqrt(n / 1.1)))
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

async function drawWall(items: WallItem[], year: string, showNumbers: boolean): Promise<HTMLCanvasElement> {
  const cols = columnsFor(items.length)
  const rows = Math.ceil(items.length / cols)
  const cellH = CELL * 1.5
  const header = 190
  const footer = 70
  const W = PAD * 2 + cols * CELL + (cols - 1) * GAP
  const H = PAD + header + rows * cellH + (rows - 1) * GAP + footer
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif'

  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0a0a0a')
  bg.addColorStop(0.7, '#0a0f1c')
  bg.addColorStop(1, '#01285f')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#7fdcff'
  ctx.font = `600 26px ${font}`
  ctx.fillText('ARGUS · FLASHBACK', PAD, PAD + 30)
  ctx.fillStyle = '#fafafa'
  ctx.font = `900 96px ${font}`
  ctx.fillText(year, PAD, PAD + 125)
  ctx.fillStyle = '#a3a3a3'
  ctx.font = `400 28px ${font}`
  ctx.fillText(`${items.length} yapım · izleme sırasıyla`, PAD, PAD + 170)

  const [logo, images] = await Promise.all([whiteLogo(), Promise.all(items.map((it) => loadImage(it.poster)))])
  const top = PAD + header
  items.forEach((it, i) => {
    const x = PAD + (i % cols) * (CELL + GAP)
    const y = top + Math.floor(i / cols) * (cellH + GAP)
    ctx.save()
    roundRect(ctx, x, y, CELL, cellH, 12)
    ctx.clip()
    ctx.fillStyle = '#262626'
    ctx.fillRect(x, y, CELL, cellH)
    const img = images[i]
    if (img) {
      // object-cover: 2:3 alanı dolduracak şekilde ortadan kırp
      const ratio = CELL / cellH
      let sw = img.naturalWidth
      let sh = img.naturalHeight
      let sx = 0
      let sy = 0
      if (sw / sh > ratio) {
        sw = sh * ratio
        sx = (img.naturalWidth - sw) / 2
      } else {
        sh = sw / ratio
        sy = (img.naturalHeight - sh) / 2
      }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, CELL, cellH)
    } else {
      ctx.fillStyle = '#d4d4d4'
      ctx.font = `600 20px ${font}`
      const words = it.title.split(' ')
      let line = ''
      let ly = y + 40
      for (const w of words) {
        const t = line ? line + ' ' + w : w
        if (ctx.measureText(t).width > CELL - 28 && line) {
          ctx.fillText(line, x + 14, ly)
          line = w
          ly += 26
        } else line = t
      }
      if (line) ctx.fillText(line, x + 14, ly)
    }
    if (showNumbers) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)'
      ctx.beginPath()
      ctx.arc(x + 24, y + cellH - 24, 17, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `800 ${i + 1 >= 100 ? 13 : 16}px ${font}`
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), x + 24, y + cellH - 18)
      ctx.textAlign = 'left'
    }
    ctx.restore()
  })

  // Sol altta beyaz ARGUS "A" logosu (yüklenemezse yazıyla)
  if (logo) {
    ctx.save()
    ctx.globalAlpha = 0.7
    ctx.drawImage(logo, PAD, H - 58, 40, 40)
    ctx.restore()
  } else {
    ctx.fillStyle = '#525252'
    ctx.font = `400 22px ${font}`
    ctx.fillText('ARGUS', PAD, H - 30)
  }
  return canvas
}

export default function YearPosterWall({ items, year, onOpen, onStory }: { items: WallItem[]; year: string; onOpen: (i: number) => void; onStory?: () => void }) {
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const [showNumbers, setShowNumbers] = useState(true)
  if (!items.length) return null

  async function download() {
    setBusy(true)
    try {
      const canvas = await drawWall(items, year, showNumbers)
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
      if (!blob) throw new Error()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ARGUS Flashback ${year} - izlediklerim.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      notify('Görsel indirildi — İndirilenler klasörüne bakabilirsin.')
    } catch {
      notify('Görsel oluşturulamadı.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-lg font-bold text-neutral-50">İzleme sıran</p>
          <p className="text-xs text-neutral-500">{year}'te izlediğin {items.length} yapım, ilk izlediğinden sonuncusuna</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onStory && (
            <button onClick={onStory} className="text-sm rounded-full px-4 py-1.5 border border-neutral-700 text-neutral-200 hover:border-[#8b5cf6] hover:text-[#c4b5fd] transition">
              Hikâye kartları
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer select-none">
            <input type="checkbox" checked={showNumbers} onChange={(e) => setShowNumbers(e.target.checked)} className="accent-[#00c0fa]" />
            Sıra numaraları
          </label>
          <button
            onClick={download}
            disabled={busy}
            className="text-sm rounded-full px-4 py-1.5 border border-[#00c0fa] text-[#7fdcff] hover:bg-[#00c0fa] hover:text-neutral-950 transition disabled:opacity-50"
          >
            {busy ? 'Hazırlanıyor…' : '↓ Posterleri indir'}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
        {items.map((it, i) => (
          <button key={i} onClick={() => onOpen(i)} title={`${i + 1}. ${it.title}`} className="relative aspect-[2/3] rounded-md overflow-hidden bg-neutral-800 hover:ring-2 hover:ring-[#00c0fa] transition">
            {it.poster ? (
              <img src={it.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="absolute inset-0 p-1 text-[9px] leading-tight text-neutral-300 text-left">{it.title}</span>
            )}
            {showNumbers && <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold bg-black/70 text-white rounded px-1">{i + 1}</span>}
          </button>
        ))}
      </div>
    </section>
  )
}
