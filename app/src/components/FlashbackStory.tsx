import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '../hooks/useToast'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import { fmtDuration, TR_DAYS, TR_DAYS_SHORT, TR_MONTHS } from '../lib/flashback'
import { whiteLogo } from '../lib/whiteLogo'
import { useEscape } from '../hooks/useEscape'

// Flashback'in hikâye kartları — kullanıcı önce "en çarpıcı istatistikleri tek bir dikey (9:16) kart
// olarak" istedi, sonra "bir tane değil, Spotify / YouTube gibi farklı konularda birden fazla" dedi.
// Her konu kendi renkleriyle ayrı bir 1080x1920 tuvale çizilir; hikâye gibi ileri-geri gezilir, tek tek
// ya da hepsi birden PNG olarak indirilir. Verisi olmayan kart (ör. maraton yoksa) atlanır. Görseller
// /medya'dan (ARGUS'un kendi adresi) geldiği için tuval kirlenmiyor.

export interface StoryPoster {
  title: string
  poster: string
  score?: number | null
  year?: number | null
}
export interface StoryData {
  year: string
  titles: number
  activeDays: number
  films: number
  episodes: number
  seriesFinished: number
  totalMin: number
  filmMin: number
  seriesMin: number
  persona: { title: string; why: string; badges: { title: string; why: string }[] }
  months: number[]
  weekdays: number[]
  streak: { days: number; start: string; end: string }
  top: StoryPoster[]
  avg: number | null
  judge: string
  lowest: StoryPoster | null
  genres: { label: string; count: number }[]
  countries: { label: string; count: number }[]
  marathons: { name: string; line: string; kind: 'seri' | 'dizi'; posters: string[] }[]
  actors: { label: string; image?: string; count: number }[]
  decades: { label: string; count: number }[]
  newShare: number
  classicShare: number
  oldest: StoryPoster | null
  posters: string[]
}

const W = 1080
const H = 1920
const L = 90
type Ctx = CanvasRenderingContext2D
type Imgs = Map<string, HTMLImageElement | null>

// ---- çizim yardımcıları ------------------------------------------------------------------------

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

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function cover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ratio = w / h
  let sw = img.naturalWidth
  let sh = img.naturalHeight
  let sx = 0
  let sy = 0
  if (sw / sh > ratio) {
    sw = sh * ratio
    sx = (img.naturalWidth - sw) / 2
  } else {
    sh = sw / ratio
    sy = (img.naturalHeight - sh) / 4
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

function picture(ctx: Ctx, img: HTMLImageElement | null | undefined, x: number, y: number, w: number, h: number, r: number) {
  ctx.save()
  rr(ctx, x, y, w, h, r)
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(x, y, w, h)
  if (img) cover(ctx, img, x, y, w, h)
  ctx.restore()
}

function font(ctx: Ctx, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`
}

function fit(ctx: Ctx, text: string, maxW: number, weight: number, size: number) {
  let s = size
  font(ctx, weight, s)
  while (ctx.measureText(text).width > maxW && s > 18) {
    s -= 2
    font(ctx, weight, s)
  }
  return s
}

function text(ctx: Ctx, t: string, x: number, y: number, weight: number, size: number, color: string, maxW?: number) {
  ctx.fillStyle = color
  if (maxW) fit(ctx, t, maxW, weight, size)
  else font(ctx, weight, size)
  ctx.fillText(t, x, y)
}

// Satırlara böl (en fazla `lines` satır)
function wrap(ctx: Ctx, t: string, x: number, y: number, maxW: number, lineH: number, lines: number) {
  const words = t.split(' ')
  let line = ''
  let n = 0
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + n * lineH)
      line = w
      if (++n === lines) return n
    } else line = test
  }
  if (line) ctx.fillText(line, x, y + n * lineH)
  return n + 1
}

interface Theme {
  top: string
  mid: string
  bottom: string
  glow1: string
  glow2: string
  accent: string
}

function background(ctx: Ctx, th: Theme) {
  const bg = ctx.createLinearGradient(0, 0, W * 0.3, H)
  bg.addColorStop(0, th.top)
  bg.addColorStop(0.55, th.mid)
  bg.addColorStop(1, th.bottom)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, r: number, col: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, col)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  glow(W * 0.1, 160, 760, th.glow1)
  glow(W * 0.95, H - 180, 860, th.glow2)
  // film şeridi delikleri
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  for (let y = 30; y < H; y += 64) {
    rr(ctx, 18, y, 26, 36, 6)
    ctx.fill()
    rr(ctx, W - 44, y, 26, 36, 6)
    ctx.fill()
  }
}

function header(ctx: Ctx, th: Theme, year: string, kicker: string) {
  text(ctx, `ARGUS · FLASHBACK ${year}`, L, 140, 700, 30, th.accent)
  text(ctx, kicker, L, 270, 800, 64, '#ffffff', W - L * 2)
}

// Sol altta beyaz ARGUS "A" logosu (bkz. lib/whiteLogo.ts); yüklenemezse yazıyla
function footer(ctx: Ctx, n: number, total: number, logo: HTMLCanvasElement | null) {
  text(ctx, `${n} / ${total}`, W - L - 70, H - 70, 500, 26, 'rgba(255,255,255,0.35)')
  if (logo) {
    ctx.save()
    ctx.globalAlpha = 0.75
    ctx.drawImage(logo, L, H - 130, 72, 72)
    ctx.restore()
  } else text(ctx, 'argus', L, H - 70, 700, 28, 'rgba(255,255,255,0.35)')
}

function hBars(ctx: Ctx, items: { label: string; value: number }[], x: number, y: number, w: number, rowH: number, color: string, labelW = 0) {
  const max = Math.max(...items.map((i) => i.value), 1)
  items.forEach((it, i) => {
    const yy = y + i * rowH
    if (labelW) text(ctx, it.label, x, yy + rowH * 0.62, 600, Math.min(34, rowH * 0.5), 'rgba(255,255,255,0.8)', labelW - 20)
    const bx = x + labelW
    const bw = w - labelW - 70
    rr(ctx, bx, yy + rowH * 0.2, bw, rowH * 0.55, 10)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fill()
    rr(ctx, bx, yy + rowH * 0.2, Math.max(14, (it.value / max) * bw), rowH * 0.55, 10)
    ctx.fillStyle = color
    ctx.fill()
    text(ctx, String(it.value), bx + bw + 18, yy + rowH * 0.62, 700, Math.min(30, rowH * 0.45), 'rgba(255,255,255,0.7)')
  })
}

function vBars(ctx: Ctx, values: number[], labels: string[], x: number, y: number, w: number, h: number, color: string, highlight: number) {
  const max = Math.max(...values, 1)
  const gap = 10
  const bw = (w - gap * (values.length - 1)) / values.length
  values.forEach((v, i) => {
    const bh = Math.max(8, (v / max) * h)
    rr(ctx, x + i * (bw + gap), y + h - bh, bw, bh, 8)
    ctx.fillStyle = i === highlight ? color : 'rgba(255,255,255,0.14)'
    ctx.fill()
    ctx.textAlign = 'center'
    text(ctx, labels[i], x + i * (bw + gap) + bw / 2, y + h + 40, 500, 24, 'rgba(255,255,255,0.55)')
    ctx.textAlign = 'left'
  })
}

// ---- kartlar -----------------------------------------------------------------------------------

interface CardDef {
  id: string
  label: string
  theme: Theme
  show: (d: StoryData) => boolean
  images: (d: StoryData) => string[]
  draw: (ctx: Ctx, d: StoryData, img: Imgs) => void
}

const T = {
  blue: { top: '#02040c', mid: '#061433', bottom: '#12072a', glow1: 'rgba(0,192,250,0.24)', glow2: 'rgba(160,60,255,0.2)', accent: '#7fdcff' },
  teal: { top: '#01100f', mid: '#03302c', bottom: '#041a2a', glow1: 'rgba(45,212,191,0.28)', glow2: 'rgba(0,192,250,0.2)', accent: '#5eead4' },
  purple: { top: '#0d0418', mid: '#2a0c4a', bottom: '#3b0a2e', glow1: 'rgba(168,85,247,0.35)', glow2: 'rgba(236,72,153,0.28)', accent: '#e9d5ff' },
  amber: { top: '#150b02', mid: '#3a1d04', bottom: '#2a0d06', glow1: 'rgba(251,191,36,0.3)', glow2: 'rgba(239,68,68,0.22)', accent: '#fcd34d' },
  green: { top: '#03110a', mid: '#073a22', bottom: '#0c2a12', glow1: 'rgba(34,197,94,0.3)', glow2: 'rgba(163,230,53,0.2)', accent: '#86efac' },
  red: { top: '#140304', mid: '#3d0a10', bottom: '#2a0a02', glow1: 'rgba(239,68,68,0.32)', glow2: 'rgba(249,115,22,0.26)', accent: '#fca5a5' },
  pink: { top: '#15030e', mid: '#3d0a2c', bottom: '#1e0a3a', glow1: 'rgba(236,72,153,0.32)', glow2: 'rgba(129,140,248,0.24)', accent: '#f9a8d4' },
  sepia: { top: '#120c05', mid: '#33230f', bottom: '#1c1208', glow1: 'rgba(217,170,90,0.3)', glow2: 'rgba(180,120,60,0.22)', accent: '#f5d6a0' },
  indigo: { top: '#05061a', mid: '#12164a', bottom: '#0a1030', glow1: 'rgba(99,102,241,0.34)', glow2: 'rgba(56,189,248,0.22)', accent: '#c7d2fe' },
}

const CARDS: CardDef[] = [
  {
    id: 'ozet',
    label: 'Özet',
    theme: T.blue,
    show: () => true,
    images: (d) => d.posters.slice(0, 12),
    draw: (ctx, d, img) => {
      text(ctx, 'ARGUS', L, 150, 700, 34, T.blue.accent)
      text(ctx, 'FLASHBACK', L - 6, 290, 900, 140, '#ffffff')
      const yg = ctx.createLinearGradient(L, 300, L + 500, 450)
      yg.addColorStop(0, '#00c0fa')
      yg.addColorStop(1, '#8b5cf6')
      ctx.fillStyle = yg
      font(ctx, 900, 170)
      ctx.fillText(d.year, L - 6, 460)
      text(ctx, 'Bu yıl', L, 580, 500, 40, 'rgba(255,255,255,0.6)')
      text(ctx, `${d.titles} farklı yapım izledin`, L, 650, 800, 62, '#ffffff', W - L * 2)
      text(ctx, `${d.activeDays} gün ekran başındaydın`, L, 715, 500, 38, 'rgba(255,255,255,0.7)', W - L * 2)
      // poster mozaiği
      const cols = 4
      const gap = 16
      const pw = (W - L * 2 - gap * (cols - 1)) / cols
      const ph = pw * 1.5
      d.posters.slice(0, 12).forEach((p, i) => {
        const x = L + (i % cols) * (pw + gap)
        const y = 800 + Math.floor(i / cols) * (ph + gap)
        if (y + ph < H - 120) picture(ctx, img.get(p), x, y, pw, ph, 16)
      })
    },
  },
  {
    id: 'sure',
    label: 'Ekran süren',
    theme: T.teal,
    show: (d) => d.totalMin > 0,
    images: () => [],
    draw: (ctx, d) => {
      header(ctx, T.teal, d.year, 'Ekran başında geçen süre')
      const hours = Math.round(d.totalMin / 60)
      const days = Math.floor(hours / 24)
      const g = ctx.createLinearGradient(L, 400, L + 700, 760)
      g.addColorStop(0, '#5eead4')
      g.addColorStop(1, '#38bdf8')
      ctx.fillStyle = g
      font(ctx, 900, 420)
      ctx.fillText(String(days || hours), L - 16, 740)
      text(ctx, days ? 'gün' : 'saat', L, 830, 800, 90, '#ffffff')
      text(ctx, `Tam olarak ${fmtDuration(d.totalMin)} · ${hours} saat`, L, 900, 500, 36, 'rgba(255,255,255,0.7)', W - L * 2)
      // film / dizi dağılımı
      const bw = W - L * 2
      const fw = d.totalMin ? (d.filmMin / d.totalMin) * bw : 0
      rr(ctx, L, 990, bw, 56, 28)
      ctx.fillStyle = '#38bdf8'
      ctx.fill()
      ctx.save()
      rr(ctx, L, 990, bw, 56, 28)
      ctx.clip()
      ctx.fillStyle = '#5eead4'
      ctx.fillRect(L, 990, fw, 56)
      ctx.restore()
      text(ctx, `Film · ${Math.round(d.filmMin / 60)} saat`, L, 1110, 700, 36, '#5eead4')
      ctx.textAlign = 'right'
      text(ctx, `Dizi · ${Math.round(d.seriesMin / 60)} saat`, W - L, 1110, 700, 36, '#38bdf8')
      ctx.textAlign = 'left'
      // eğlenceli karşılaştırma
      const orbits = Math.round(d.totalMin / 92.7)
      rr(ctx, L, 1220, W - L * 2, 330, 36)
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.fill()
      text(ctx, 'Bu sürede Uluslararası Uzay İstasyonu', L + 50, 1310, 500, 36, 'rgba(255,255,255,0.75)', W - L * 2 - 100)
      text(ctx, `Dünya'nın etrafında`, L + 50, 1360, 500, 36, 'rgba(255,255,255,0.75)')
      text(ctx, `${orbits.toLocaleString('tr-TR')} tur`, L + 50, 1470, 900, 100, '#ffffff', W - L * 2 - 100)
      text(ctx, 'atardı.', L + 50, 1520, 500, 36, 'rgba(255,255,255,0.75)')
      text(ctx, `${d.films} film · ${d.episodes} bölüm`, L, 1680, 700, 44, 'rgba(255,255,255,0.85)')
    },
  },
  {
    id: 'unvan',
    label: 'Unvanın',
    theme: T.purple,
    show: (d) => Boolean(d.persona.title),
    images: () => [],
    draw: (ctx, d) => {
      header(ctx, T.purple, d.year, 'Bu yılın unvanı')
      ctx.fillStyle = '#ffffff'
      font(ctx, 900, 150)
      let size = 150
      while (size > 80 && d.persona.title.split(' ').some((w) => ctx.measureText(w).width > W - L * 2)) {
        size -= 8
        font(ctx, 900, size)
      }
      const lines = wrap(ctx, d.persona.title, L, 520, W - L * 2, size * 1.05, 3)
      let y = 520 + (lines - 1) * size * 1.05 + 110
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      font(ctx, 500, 40)
      y += wrap(ctx, d.persona.why ? `${d.persona.why}.` : '', L, y, W - L * 2, 52, 3) * 52 + 60
      d.persona.badges.slice(0, 3).forEach((b) => {
        rr(ctx, L, y, W - L * 2, 170, 32)
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(233,213,255,0.25)'
        ctx.lineWidth = 2
        ctx.stroke()
        text(ctx, b.title, L + 44, y + 75, 800, 50, '#ffffff', W - L * 2 - 88)
        text(ctx, b.why, L + 44, y + 130, 500, 32, 'rgba(255,255,255,0.6)', W - L * 2 - 88)
        y += 200
      })
    },
  },
  {
    id: 'favoriler',
    label: 'Favorilerin',
    theme: T.amber,
    show: (d) => d.top.length > 0,
    images: (d) => [...d.top.map((t) => t.poster), d.lowest?.poster ?? ''],
    draw: (ctx, d, img) => {
      header(ctx, T.amber, d.year, 'Yılın favorilerin')
      const f = d.top[0]
      const pw = 420
      const ph = 630
      picture(ctx, img.get(f.poster), L, 340, pw, ph, 28)
      rr(ctx, L + 20, 340 + ph - 90, 190, 70, 20)
      ctx.fillStyle = '#fbbf24'
      ctx.fill()
      text(ctx, `★ ${f.score?.toFixed(1)}`, L + 42, 340 + ph - 40, 900, 44, '#1c1002')
      text(ctx, '1', L + pw + 50, 470, 900, 160, T.amber.accent)
      ctx.fillStyle = '#ffffff'
      font(ctx, 800, 56)
      wrap(ctx, f.title, L + pw + 50, 580, W - L * 2 - pw - 50, 66, 4)
      // 2-5
      const rest = d.top.slice(1, 5)
      const gap = 20
      const sw = (W - L * 2 - gap * 3) / 4
      rest.forEach((t, i) => {
        const x = L + i * (sw + gap)
        picture(ctx, img.get(t.poster), x, 1030, sw, sw * 1.5, 18)
        text(ctx, `${i + 2}`, x + 14, 1030 + 56, 900, 48, '#ffffff')
        text(ctx, `★ ${t.score?.toFixed(1)}`, x, 1030 + sw * 1.5 + 44, 800, 32, '#fbbf24')
      })
      const y = 1030 + sw * 1.5 + 110
      if (d.avg !== null) {
        text(ctx, `Puan ortalaman ${d.avg.toFixed(1)} / 10`, L, y, 800, 46, '#ffffff', W - L * 2)
        text(ctx, d.judge, L, y + 55, 500, 36, T.amber.accent)
      }
      if (d.lowest && y + 330 < H - 100) {
        rr(ctx, L, y + 110, W - L * 2, 200, 28)
        ctx.fillStyle = 'rgba(244,63,94,0.14)'
        ctx.fill()
        picture(ctx, img.get(d.lowest.poster), L + 24, y + 128, 110, 164, 14)
        text(ctx, 'Yılın hayal kırıklığı', L + 160, y + 180, 600, 32, '#fda4af')
        text(ctx, d.lowest.title, L + 160, y + 235, 800, 44, '#ffffff', W - L * 2 - 330)
        ctx.textAlign = 'right'
        text(ctx, `★ ${d.lowest.score?.toFixed(1)}`, W - L - 30, y + 235, 900, 44, '#fb7185')
        ctx.textAlign = 'left'
      }
    },
  },
  {
    id: 'turler',
    label: 'Türlerin',
    theme: T.green,
    show: (d) => d.genres.length > 0,
    images: () => [],
    draw: (ctx, d) => {
      header(ctx, T.green, d.year, 'En çok izlediğin türler')
      d.genres.slice(0, 5).forEach((g, i) => {
        const y = 440 + i * 190
        text(ctx, String(i + 1), L, y + 40, 900, i === 0 ? 150 : 110, i === 0 ? T.green.accent : 'rgba(255,255,255,0.3)')
        text(ctx, g.label, L + 170, y, 800, i === 0 ? 76 : 60, '#ffffff', W - L * 2 - 170)
        text(ctx, `${g.count} yapım`, L + 172, y + 55, 500, 34, 'rgba(255,255,255,0.55)')
      })
      if (d.countries[0]) {
        rr(ctx, L, 1450, W - L * 2, 230, 32)
        ctx.fillStyle = 'rgba(255,255,255,0.07)'
        ctx.fill()
        text(ctx, 'En çok izlediğin ülke', L + 44, 1530, 500, 34, 'rgba(255,255,255,0.6)')
        text(ctx, d.countries[0].label, L + 44, 1620, 900, 72, '#ffffff', W - L * 2 - 300)
        ctx.textAlign = 'right'
        text(ctx, `${d.countries[0].count} yapım`, W - L - 44, 1620, 700, 40, T.green.accent)
        ctx.textAlign = 'left'
      }
    },
  },
  {
    id: 'maraton',
    label: 'Maratonların',
    theme: T.red,
    show: (d) => d.marathons.length > 0,
    images: (d) => d.marathons.slice(0, 3).flatMap((m) => m.posters.slice(0, 4)),
    draw: (ctx, d, img) => {
      header(ctx, T.red, d.year, 'Maratonların')
      d.marathons.slice(0, 3).forEach((m, i) => {
        const y = 380 + i * 460
        rr(ctx, L, y, W - L * 2, 420, 36)
        ctx.fillStyle = 'rgba(255,255,255,0.07)'
        ctx.fill()
        const ps = m.posters.slice(0, 4)
        ps.forEach((_, j) => {
          const k = ps.length - 1 - j // arkadakiler önce çizilsin
          picture(ctx, img.get(ps[k]), L + 40 + k * 70, y + 50, 210, 315, 18)
        })
        const tx = L + 40 + (ps.length - 1) * 70 + 250
        const tw = W - L - 40 - tx
        text(ctx, m.kind === 'seri' ? 'SERİYİ TÜKETTİN' : 'DİZİ MARATONU', tx, y + 120, 800, 28, T.red.accent)
        ctx.fillStyle = '#ffffff'
        font(ctx, 900, 58)
        const n = wrap(ctx, m.name, tx, y + 195, tw, 64, 2)
        text(ctx, m.line, tx, y + 195 + n * 64 + 10, 600, 38, 'rgba(255,255,255,0.75)', tw)
      })
    },
  },
  {
    id: 'oyuncular',
    label: 'Oyuncuların',
    theme: T.pink,
    show: (d) => d.actors.length > 0,
    images: (d) => d.actors.slice(0, 5).map((a) => a.image ?? ''),
    draw: (ctx, d, img) => {
      header(ctx, T.pink, d.year, 'En çok karşına çıkanlar')
      const a = d.actors[0]
      picture(ctx, img.get(a.image ?? ''), L, 340, 400, 600, 28)
      text(ctx, '1', L + 450, 470, 900, 160, T.pink.accent)
      ctx.fillStyle = '#ffffff'
      font(ctx, 800, 60)
      const n = wrap(ctx, a.label, L + 450, 590, W - L * 2 - 450, 68, 3)
      text(ctx, `${a.count} yapımda`, L + 452, 590 + n * 68 + 10, 500, 38, 'rgba(255,255,255,0.65)')
      d.actors.slice(1, 5).forEach((x, i) => {
        const y = 1010 + i * 190
        picture(ctx, img.get(x.image ?? ''), L, y, 120, 160, 16)
        text(ctx, String(i + 2), L + 160, y + 70, 900, 56, 'rgba(255,255,255,0.35)')
        text(ctx, x.label, L + 240, y + 70, 800, 50, '#ffffff', W - L * 2 - 240)
        text(ctx, `${x.count} yapım`, L + 242, y + 122, 500, 32, 'rgba(255,255,255,0.55)')
      })
    },
  },
  {
    id: 'nostalji',
    label: 'Nostalji radarı',
    theme: T.sepia,
    show: (d) => d.decades.length > 0,
    images: (d) => [d.oldest?.poster ?? ''],
    draw: (ctx, d, img) => {
      header(ctx, T.sepia, d.year, 'Nostalji radarı')
      text(ctx, 'İzlediklerinin çıkış yılları', L, 330, 500, 36, 'rgba(255,255,255,0.6)')
      const items = d.decades.slice(-7).map((x) => ({ label: x.label, value: x.count }))
      hBars(ctx, items, L, 380, W - L * 2, 96, '#e9b872', 200)
      let y = 380 + items.length * 96 + 60
      const half = (W - L * 2 - 24) / 2
      ;[
        [`%${Math.round(d.newShare * 100)}`, `yeni (${Number(d.year) - 1}–${d.year})`],
        [`%${Math.round(d.classicShare * 100)}`, '20 yıldan eski'],
      ].forEach(([v, l], i) => {
        rr(ctx, L + i * (half + 24), y, half, 190, 28)
        ctx.fillStyle = 'rgba(255,255,255,0.07)'
        ctx.fill()
        text(ctx, v, L + i * (half + 24) + 36, y + 105, 900, 80, '#ffffff')
        text(ctx, l, L + i * (half + 24) + 38, y + 155, 500, 30, 'rgba(255,255,255,0.6)', half - 70)
      })
      y += 250
      if (d.oldest && y + 330 < H - 100) {
        picture(ctx, img.get(d.oldest.poster), L, y, 220, 330, 22)
        text(ctx, 'En eski izlediğin', L + 260, y + 70, 500, 34, 'rgba(255,255,255,0.6)')
        ctx.fillStyle = '#ffffff'
        font(ctx, 800, 56)
        const n = wrap(ctx, d.oldest.title, L + 260, y + 150, W - L * 2 - 260, 64, 2)
        text(ctx, String(d.oldest.year ?? ''), L + 260, y + 150 + n * 64 + 40, 900, 80, T.sepia.accent)
      }
    },
  },
  {
    id: 'zaman',
    label: 'Zaman alışkanlıkların',
    theme: T.indigo,
    show: (d) => d.months.some((m) => m > 0),
    images: () => [],
    draw: (ctx, d) => {
      header(ctx, T.indigo, d.year, 'Zaman alışkanlıkların')
      const bm = d.months.indexOf(Math.max(...d.months))
      text(ctx, 'En yoğun ayın', L, 380, 500, 36, 'rgba(255,255,255,0.6)')
      text(ctx, TR_MONTHS[bm], L, 480, 900, 96, '#ffffff')
      vBars(ctx, d.months, TR_MONTHS.map((m) => m.slice(0, 1)), L, 530, W - L * 2, 260, '#818cf8', bm)
      const bd = d.weekdays.indexOf(Math.max(...d.weekdays))
      text(ctx, 'En çok izlediğin gün', L, 940, 500, 36, 'rgba(255,255,255,0.6)')
      text(ctx, `${TR_DAYS[bd]} günleri`, L, 1040, 900, 96, '#ffffff', W - L * 2)
      vBars(ctx, d.weekdays, TR_DAYS_SHORT, L, 1090, W - L * 2, 220, '#38bdf8', bd)
      rr(ctx, L, 1440, W - L * 2, 250, 32)
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.fill()
      text(ctx, 'En uzun serin', L + 44, 1515, 500, 34, 'rgba(255,255,255,0.6)')
      text(ctx, `${d.streak.days} gün üst üste`, L + 44, 1610, 900, 80, '#ffffff', W - L * 2 - 88)
      if (d.streak.days > 1) {
        const f = (s: string) => `${Number(s.slice(8))} ${TR_MONTHS[Number(s.slice(5, 7)) - 1]}`
        text(ctx, `${f(d.streak.start)} – ${f(d.streak.end)}`, L + 46, 1660, 500, 30, T.indigo.accent)
      }
    },
  },
]

async function drawCard(card: CardDef, d: StoryData, n: number, total: number): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const srcs = [...new Set(card.images(d).filter(Boolean))]
  const [logo, loaded] = await Promise.all([whiteLogo(), Promise.all(srcs.map(loadImage))])
  const img: Imgs = new Map(srcs.map((s, i) => [s, loaded[i]]))
  ctx.textBaseline = 'alphabetic'
  background(ctx, card.theme)
  card.draw(ctx, d, img)
  footer(ctx, n, total, logo)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  if (!blob) throw new Error('Kart oluşturulamadı.')
  return blob
}

// ---- görüntüleyici -----------------------------------------------------------------------------

export default function FlashbackStory({ data, onClose }: { data: StoryData; onClose: () => void }) {
  const { notify } = useToast()
  const cards = CARDS.filter((c) => c.show(data))
  const [urls, setUrls] = useState<(string | null)[]>(() => cards.map(() => null))
  const [i, setI] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const made: string[] = []
    ;(async () => {
      for (let k = 0; k < cards.length; k++) {
        try {
          const b = await drawCard(cards[k], data, k + 1, cards.length)
          if (!alive) return
          const u = URL.createObjectURL(b)
          made.push(u)
          setUrls((prev) => prev.map((x, j) => (j === k ? u : x)))
        } catch {
          /* bu kart çizilemedi — atla */
        }
      }
    })()
    return () => {
      alive = false
      made.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const go = useCallback((dir: number) => setI((x) => Math.min(cards.length - 1, Math.max(0, x + dir))), [cards.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, go])

  useEscape(true, onClose)

  function save(k: number) {
    const u = urls[k]
    if (!u) return
    const a = document.createElement('a')
    a.href = u
    a.download = `ARGUS Flashback ${data.year} - ${k + 1} ${cards[k].label}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function saveAll() {
    setBusy(true)
    for (let k = 0; k < cards.length; k++) {
      save(k)
      await new Promise((r) => setTimeout(r, 350))
    }
    setBusy(false)
    notify(`${cards.length} kart indirildi — İndirilenler klasörüne bakabilirsin.`)
  }

  const ready = urls.every(Boolean)

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/90 overflow-y-auto py-5 px-4" onClick={onClose}>
      <div className="mx-auto w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-neutral-100 font-semibold">
            {cards[i].label} <span className="text-neutral-500 font-normal text-sm">· {i + 1}/{cards.length}</span>
          </p>
          <button onClick={onClose} aria-label="Kapat" className="h-9 w-9 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-lg">
            ×
          </button>
        </div>
        {/* hikâye çubukları */}
        <div className="flex gap-1 mb-2">
          {cards.map((c, k) => (
            <button key={c.id} onClick={() => setI(k)} aria-label={c.label} className={`h-1 flex-1 rounded-full transition ${k <= i ? 'bg-white' : 'bg-white/25'}`} />
          ))}
        </div>
        <div className="relative aspect-[9/16] rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 flex items-center justify-center select-none">
          {urls[i] ? <img src={urls[i]!} alt={cards[i].label} className="h-full w-full object-contain" /> : <span className="text-sm text-neutral-500">Hazırlanıyor…</span>}
          {/* sol / sağ yarıya tıklayınca önceki / sonraki */}
          <button onClick={() => go(-1)} aria-label="Önceki kart" className="absolute inset-y-0 left-0 w-1/3 group">
            {i > 0 && <span className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center">‹</span>}
          </button>
          <button onClick={() => go(1)} aria-label="Sonraki kart" className="absolute inset-y-0 right-0 w-1/3 group">
            {i < cards.length - 1 && <span className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center">›</span>}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={() => save(i)} disabled={!urls[i]} style={primaryButtonStyle} className={`text-sm px-3 py-2.5 rounded-xl ${PRIMARY_BUTTON} disabled:opacity-50`}>
            ↓ Bu kartı indir
          </button>
          <button onClick={saveAll} disabled={!ready || busy} className="text-sm px-3 py-2.5 rounded-xl border border-neutral-700 text-neutral-200 hover:border-neutral-500 disabled:opacity-50">
            {busy ? 'İndiriliyor…' : ready ? `↓ Hepsini indir (${cards.length})` : 'Hazırlanıyor…'}
          </button>
        </div>
        <p className="text-[11px] text-neutral-500 text-center mt-2">← → tuşlarıyla ya da kartın sağına/soluna tıklayarak gez. 1080 × 1920, hikâyelere tam oturur.</p>
      </div>
    </div>,
    document.body,
  )
}
