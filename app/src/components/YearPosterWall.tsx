import { useState } from 'react'
import { useToast } from '../hooks/useToast'
import { whiteLogo } from '../lib/whiteLogo'
import { withLocative } from '../lib/turkce'
import { getLang, locale, monthNames, tt, ttx } from '../lib/i18n'
import { fontReady } from '../lib/fontReady'

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

// v1.24: indirilen görsel de Flashback'in "Bozuk Sinyal" temasında — koyu zemin, tarama çizgileri, renk kaymalı Anton başlık
async function drawWall(items: WallItem[], year: string, showNumbers: boolean): Promise<HTMLCanvasElement> {
  const cols = columnsFor(items.length)
  const rows = Math.ceil(items.length / cols)
  const cellH = CELL * 1.5
  const header = 230
  const footer = 80
  const W = PAD * 2 + cols * CELL + (cols - 1) * GAP
  const H = PAD + header + rows * cellH + (rows - 1) * GAP + footer
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif'
  const anton = `Anton, Impact, 'Arial Narrow', sans-serif`

  const [logo, images] = await Promise.all([
    whiteLogo(),
    Promise.all(items.map((it) => loadImage(it.poster))),
    fontReady(),
    document.fonts.load(`400 120px Anton`, 'FLASHBACK0123456789').catch(() => null),
  ])

  ctx.fillStyle = '#050507'
  ctx.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, r: number, col: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, col)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  glow(0, 0, Math.max(W, H) * 0.6, 'rgba(0,225,255,0.14)')
  glow(W, H, Math.max(W, H) * 0.6, 'rgba(255,45,138,0.14)')
  ctx.fillStyle = 'rgba(255,255,255,0.025)'
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)

  const glitch = (t: string, x: number, y: number, size: number) => {
    ctx.font = `400 ${size}px ${anton}`
    ctx.fillStyle = 'rgba(0,225,255,0.9)'
    ctx.fillText(t, x - 5, y)
    ctx.fillStyle = 'rgba(255,45,138,0.9)'
    ctx.fillText(t, x + 5, y)
    ctx.fillStyle = '#fff'
    ctx.fillText(t, x, y)
  }
  ctx.textBaseline = 'alphabetic'
  glitch(`FLASHBACK ${year}`, PAD, PAD + 110, 110)
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font = `500 30px ${font}`
  ctx.fillText(tt('{0} yapım · izleme sırasıyla', items.length), PAD, PAD + 170)

  const top = PAD + header
  items.forEach((it, i) => {
    const x = PAD + (i % cols) * (CELL + GAP)
    const y = top + Math.floor(i / cols) * (cellH + GAP)
    ctx.save()
    roundRect(ctx, x, y, CELL, cellH, 12)
    ctx.clip()
    ctx.fillStyle = '#1a1a22'
    ctx.fillRect(x, y, CELL, cellH)
    const img = images[i]
    if (img) {
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
      const label = String(i + 1)
      ctx.font = `400 30px ${anton}`
      const w = Math.max(40, ctx.measureText(label).width + 18)
      ctx.fillStyle = 'rgba(5,5,7,0.82)'
      roundRect(ctx, x + 8, y + cellH - 46, w, 38, 8)
      ctx.fill()
      ctx.fillStyle = '#00e1ff'
      ctx.fillText(label, x + 8 + 9 - 2, y + cellH - 16)
      ctx.fillStyle = '#ff2d8a'
      ctx.fillText(label, x + 8 + 9 + 2, y + cellH - 16)
      ctx.fillStyle = '#fff'
      ctx.fillText(label, x + 8 + 9, y + cellH - 16)
    }
    ctx.restore()
  })

  if (logo) {
    ctx.save()
    ctx.globalAlpha = 0.7
    ctx.drawImage(logo, W - PAD - 44, H - 64, 44, 44)
    ctx.restore()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = `600 22px ${font}`
  ctx.fillText('ARGUS', PAD, H - 32)
  return canvas
}

// Ekranda iki görünüm (v1.24): "Aylara göre" — her ay bir film şeridi, yanında ayın adı ve sayısı; "Duvar" — hepsi bir arada.
// Üstüne gelince afiş kalkar, kenarında renk kayması belirir, altında adı ve tarihi yazar.
const VIEW_KEY = 'argus_fb_duvar_gorunum'

function Poster({ it, n, showNumbers, onOpen, wide }: { it: WallItem; n: number; showNumbers: boolean; onOpen: () => void; wide?: boolean }) {
  const date = /^\d{4}-\d{2}-\d{2}/.test(it.date) ? new Date(`${it.date.slice(0, 10)}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long' }) : ''
  return (
    <button
      onClick={onOpen}
      title={`${n}. ${it.title}${date ? ` · ${date}` : ''}`}
      className={`group/p relative shrink-0 aspect-[2/3] rounded-md overflow-hidden bg-neutral-800 transition duration-200 hover:-translate-y-1 hover:z-10 hover:shadow-[-3px_0_0_#00e1ff,3px_0_0_#ff2d8a,0_14px_30px_rgba(0,0,0,.7)] ${wide ? 'w-[76px] sm:w-[92px]' : ''}`}
    >
      {it.poster ? (
        <img src={it.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 p-1 text-[9px] leading-tight text-neutral-300 text-left">{it.title}</span>
      )}
      {showNumbers && (
        <span className="absolute bottom-1 left-1 rounded bg-black/85 px-1.5 text-[13px] leading-5 fb-wordmark" style={{ letterSpacing: '0.02em' }}>
          {n}
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full group-hover/p:translate-y-0 transition bg-gradient-to-t from-black/95 to-black/40 px-1.5 py-1 text-left">
        <span className="block text-[10px] font-semibold text-white leading-tight line-clamp-2">{it.title}</span>
        {date && <span className="block text-[9px] text-white/60">{date}</span>}
      </span>
    </button>
  )
}

export default function YearPosterWall({ items, year, onOpen, onStory }: { items: WallItem[]; year: string; onOpen: (i: number) => void; onStory?: () => void }) {
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const [showNumbers, setShowNumbers] = useState(true)
  const [view, setView] = useState<'ay' | 'duvar'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'duvar' ? 'duvar' : 'ay'
    } catch {
      return 'ay'
    }
  })
  const pickView = (v: 'ay' | 'duvar') => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* önemsiz */
    }
  }
  if (!items.length) return null

  // Aylara böl (sıra numarası yılın tamamındaki sırası olarak kalır); sadece yılı bilinenler en sonda
  const months = monthNames()
  const groups: { label: string; list: { it: WallItem; i: number }[] }[] = []
  items.forEach((it, i) => {
    const m = /^\d{4}-\d{2}/.test(it.date) ? Number(it.date.slice(5, 7)) - 1 : 12
    const label = m < 12 ? months[m] : tt('Tarihsiz')
    let g = groups.find((x) => x.label === label)
    if (!g) {
      g = { label, list: [] }
      groups.push(g)
    }
    g.list.push({ it, i })
  })

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
      notify(tt('Görsel indirildi — İndirilenler klasörüne bakabilirsin.'))
    } catch {
      notify(tt('Görsel oluşturulamadı.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  const seg = (v: 'ay' | 'duvar', label: string) => (
    <button onClick={() => pickView(v)} className={`px-3 py-1 rounded-lg transition ${view === v ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white'}`}>
      {label}
    </button>
  )

  return (
    <section className="fb-card">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="fb-title text-2xl">{tt('İzleme sıran')}</p>
          <p className="text-xs text-neutral-400 mt-1">{ttx('{0} izlediğin {1} yapım, ilk izlediğinden sonuncusuna', getLang() === 'tr' ? withLocative(year) : String(year), items.length)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 rounded-xl bg-black/50 border border-white/10 p-1 text-sm">
            {seg('ay', tt('Aylara göre'))}
            {seg('duvar', tt('Duvar'))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer select-none">
            <input type="checkbox" checked={showNumbers} onChange={(e) => setShowNumbers(e.target.checked)} className="accent-[#ff2d8a]" />
            {tt('Sıra numaraları')}
          </label>
          {onStory && (
            <button onClick={onStory} className="text-sm rounded-full px-4 py-1.5 border border-white/20 text-neutral-200 hover:border-white/50 transition">
              {tt('Hikâye kartları')}
            </button>
          )}
          <button onClick={download} disabled={busy} className="text-sm font-bold rounded-full px-4 py-1.5 text-white transition disabled:opacity-50" style={{ background: 'linear-gradient(90deg,#00b8d9,#ff2d8a)' }}>
            {busy ? tt('Hazırlanıyor…') : tt('↓ Posterleri indir')}
          </button>
        </div>
      </div>

      {view === 'duvar' ? (
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
          {items.map((it, i) => (
            <Poster key={i} it={it} n={i + 1} showNumbers={showNumbers} onOpen={() => onOpen(i)} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.label} className="grid grid-cols-[64px_1fr] sm:grid-cols-[96px_1fr] gap-3 items-center">
              <div className="text-right">
                <p className="fb-title text-xl sm:text-2xl leading-none">{g.label.slice(0, 3)}</p>
                <p className="text-[11px] text-neutral-500 mt-1">{ttx('{0} yapım', g.list.length)}</p>
              </div>
              {/* film şeridi: üstte ve altta delikler, kareler yatay kayar */}
              <div className="relative rounded-lg bg-[#0d0d12] border border-white/5 overflow-hidden">
                <div className="h-2.5 mx-1 mt-1 opacity-60" style={{ background: 'repeating-linear-gradient(90deg, transparent 0 8px, #2a2a33 8px 18px, transparent 18px 24px)' }} />
                <div className="flex gap-1.5 overflow-x-auto px-2 py-1.5 [scrollbar-width:thin]">
                  {g.list.map(({ it, i }) => (
                    <Poster key={i} it={it} n={i + 1} showNumbers={showNumbers} onOpen={() => onOpen(i)} wide />
                  ))}
                </div>
                <div className="h-2.5 mx-1 mb-1 opacity-60" style={{ background: 'repeating-linear-gradient(90deg, transparent 0 8px, #2a2a33 8px 18px, transparent 18px 24px)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
