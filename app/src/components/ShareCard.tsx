import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProfiles } from '../hooks/useProfiles'
import { useEscape } from '../hooks/useEscape'
import { useToast } from '../hooks/useToast'
import { averageColor, darkTone, type RGB } from '../lib/imageColor'
import { tt } from '../lib/i18n'

// Detay penceresi › Paylaş (v1.23.4; v1.23.9'da baştan yazıldı — kullanıcı "paylaş kısmını daha güzel yapalım, farklı
// seçenekler de eklenir" dedi). Tek bir yapım için paylaşılabilir PNG:
//   Biçim : Hikâye 1080×1920 · Gönderi 1080×1350 · Yatay 1920×1080
//   Tema  : Afiş (bulanık afiş zemini, ortada afiş) · Sahne (yapımın geniş görseli, logosu) · Bilet (sinema bileti)
//           · Sade (yapımın renginde düz zemin, büyük yazı)
//   Göster: puanın, tek cümlen, profilin, yıl·süre·tür, izleme tarihin; üst yazı "… öneriyor" / "… izledi" / yok
// Renkler afişin baskın renginden gelir. İndir ya da panoya kopyala. Seçimler bu bilgisayarda hatırlanır.

export type ShareData = {
  poster: string
  cover: string
  logo: string
  title: string
  score: number | null
  year: string
  runtime: string
  genres: string[]
  watchedOn: string
}
type Fmt = 'hikaye' | 'gonderi' | 'yatay'
type Theme = 'afis' | 'sahne' | 'bilet' | 'sade'
type Head = 'oneri' | 'izledi' | 'yok'
type Show = { score: boolean; quote: boolean; profile: boolean; meta: boolean; date: boolean }
type Opts = { fmt: Fmt; theme: Theme; head: Head; show: Show; quote: string; name: string; photo: string }

const SIZES: Record<Fmt, [number, number]> = { hikaye: [1080, 1920], gonderi: [1080, 1350], yatay: [1920, 1080] }
const PREF = 'argus_paylas'
const FONT = 'Inter, system-ui, sans-serif'

type Imgs = { poster: HTMLImageElement | null; cover: HTMLImageElement | null; logo: HTMLImageElement | null; avatar: HTMLImageElement | null; brand: HTMLImageElement | null }

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    if (!src) return res(null)
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => res(i)
    i.onerror = () => res(null)
    i.src = src
  })
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const t = line ? line + ' ' + w : w
    if (ctx.measureText(t).width > maxW && line) {
      out.push(line)
      line = w
    } else line = t
  }
  if (line) out.push(line)
  if (out.length > max) {
    const cut = out.slice(0, max)
    let l = cut[max - 1]
    while (l.length > 1 && ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1)
    cut[max - 1] = l.replace(/[\s,.;:]+$/, '') + '…'
    return cut
  }
  return out
}

// görseli kutuyu dolduracak şekilde (kırparak) çizer
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, fy = 0.5) {
  const s = Math.max(w / img.width, h / img.height)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) * fy, sw, sh, x, y, w, h)
}
// kutuya sığdırarak (kırpmadan)
function contain(img: HTMLImageElement, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height)
  return [img.width * s, img.height * s] as const
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}

const fmtScore = (n: number) => n.toFixed(1).replace('.', ',').replace(',0', '')

function headText(o: Opts) {
  if (o.head === 'yok' || !o.show.profile || !o.name) return ''
  return o.head === 'izledi' ? tt('{0} izledi', o.name) : tt('{0} öneriyor', o.name)
}
function metaText(d: ShareData) {
  return [d.year, d.runtime, d.genres.slice(0, 2).join(', ')].filter(Boolean).join('   ·   ')
}

type Palette = { bg: string; deep: string; accent: string; soft: string }
function palette(rgb: RGB | null): Palette {
  const c: RGB = rgb ?? [20, 80, 140]
  return { bg: darkTone(c, 0.12, 0.6), deep: darkTone(c, 0.06, 0.6), accent: darkTone(c, 0.68, 0.85), soft: darkTone(c, 0.22, 0.5) }
}

// --- ortak parçalar ---
function header(ctx: CanvasRenderingContext2D, im: Imgs, o: Opts, x: number, y: number, align: 'center' | 'left', color = '#e8ecf1', size = 38) {
  const t = headText(o)
  if (!t) return
  ctx.font = `600 ${size}px ${FONT}`
  const av = im.avatar ? size * 1.7 : 0
  const gap = av ? size * 0.5 : 0
  const tw = ctx.measureText(t).width
  const x0 = align === 'center' ? x - (av + gap + tw) / 2 : x
  if (im.avatar) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(x0 + av / 2, y, av / 2, 0, Math.PI * 2)
    ctx.clip()
    cover(ctx, im.avatar, x0, y - av / 2, av, av)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,.25)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x0 + av / 2, y, av / 2, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(t, x0 + av + gap, y + 1)
}

function brand(ctx: CanvasRenderingContext2D, im: Imgs, x: number, y: number, align: 'center' | 'left' | 'right', color = 'rgba(255,255,255,.75)', size = 30) {
  ctx.font = `700 ${size}px ${FONT}`
  const spacing = size * 0.28
  const word = 'ARGUS'
  let tw = 0
  for (const ch of word) tw += ctx.measureText(ch).width + spacing
  tw -= spacing
  const lg = im.brand ? size * 1.5 : 0
  const gap = lg ? size * 0.45 : 0
  const total = lg + gap + tw
  const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  if (im.brand) ctx.drawImage(im.brand, x0, y - lg / 2, lg, lg)
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  let cx = x0 + lg + gap
  for (const ch of word) {
    ctx.fillText(ch, cx, y + 1)
    cx += ctx.measureText(ch).width + spacing
  }
}

function scorePill(ctx: CanvasRenderingContext2D, score: number, x: number, y: number, align: 'center' | 'left', pal: Palette, size = 40, dark = false) {
  ctx.font = `800 ${size}px ${FONT}`
  const main = fmtScore(score)
  ctx.font = `800 ${size}px ${FONT}`
  const mw = ctx.measureText(main).width
  ctx.font = `600 ${size * 0.6}px ${FONT}`
  const sw = ctx.measureText(' / 10').width
  const pad = size * 0.55
  const st = size * 0.95
  const w = pad + st + size * 0.35 + mw + sw + pad
  const h = size * 1.7
  const x0 = align === 'center' ? x - w / 2 : x
  ctx.fillStyle = dark ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.1)'
  ctx.beginPath()
  ctx.roundRect(x0, y - h / 2, w, h, h / 2)
  ctx.fill()
  ctx.strokeStyle = dark ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.16)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = dark ? '#b45309' : '#fcd34d'
  star(ctx, x0 + pad + st / 2, y, st / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = dark ? '#111' : '#fff'
  ctx.font = `800 ${size}px ${FONT}`
  ctx.fillText(main, x0 + pad + st + size * 0.35, y + 2)
  ctx.fillStyle = dark ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.6)'
  ctx.font = `600 ${size * 0.6}px ${FONT}`
  ctx.fillText(' / 10', x0 + pad + st + size * 0.35 + mw, y + 4)
  void pal
  return h
}

// başlık, bilgiler, puan, cümle ve tarih — alt alta; çizilen son y'yi döner
function textStack(
  ctx: CanvasRenderingContext2D,
  d: ShareData,
  o: Opts,
  pal: Palette,
  x: number,
  y: number,
  w: number,
  align: 'center' | 'left',
  s: { title: number; lines: number; meta: number; quote: number; quoteLines: number },
  dark = false,
) {
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = dark ? '#111' : '#fff'
  ctx.font = `800 ${s.title}px ${FONT}`
  for (const l of wrap(ctx, d.title, w, s.lines)) {
    y += s.title * 1.02
    ctx.fillText(l, x, y)
  }
  const meta = o.show.meta ? metaText(d) : ''
  if (meta) {
    y += s.meta * 1.9
    ctx.font = `500 ${s.meta}px ${FONT}`
    ctx.fillStyle = dark ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.62)'
    ctx.textAlign = align
    ctx.fillText(meta, x, y)
  }
  if (o.show.score && d.score !== null) {
    y += s.meta * 1.4
    const h = scorePill(ctx, d.score, x, y + s.meta * 1.05, align, pal, s.meta * 1.15, dark)
    y += h
  }
  const q = o.show.quote ? o.quote.trim() : ''
  if (q) {
    y += s.quote * 1.1
    ctx.font = `italic 500 ${s.quote}px ${FONT}`
    ctx.fillStyle = dark ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)'
    ctx.textAlign = align
    for (const l of wrap(ctx, `“${q}”`, w, s.quoteLines)) {
      y += s.quote * 1.32
      ctx.fillText(l, x, y)
    }
  }
  if (o.show.date && d.watchedOn) {
    y += s.meta * 1.8
    ctx.font = `600 ${s.meta * 0.8}px ${FONT}`
    ctx.fillStyle = dark ? 'rgba(0,0,0,.45)' : pal.accent
    ctx.textAlign = align
    ctx.fillText(tt('İzledim · {0}', d.watchedOn).toLocaleUpperCase('tr'), x, y)
  }
  return y
}

function shadowed(ctx: CanvasRenderingContext2D, fn: () => void, blur = 70, oy = 28, a = 0.6) {
  ctx.save()
  ctx.shadowColor = `rgba(0,0,0,${a})`
  ctx.shadowBlur = blur
  ctx.shadowOffsetY = oy
  fn()
  ctx.restore()
}
function posterCard(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  shadowed(ctx, () => {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fillStyle = '#000'
    ctx.fill()
  })
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.clip()
  cover(ctx, img, x, y, w, h)
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,.14)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(x + 1, y + 1, w - 2, h - 2, r)
  ctx.stroke()
}
function vignette(ctx: CanvasRenderingContext2D, W: number, H: number, a = 0.55) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${a})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}
function blurredBg(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, W: number, H: number, pal: Palette, alpha = 0.6) {
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  if (img) {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.filter = 'blur(70px) saturate(1.3)'
    cover(ctx, img, -150, -150, W + 300, H + 300)
    ctx.restore()
  }
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, 'rgba(0,0,0,.25)')
  g.addColorStop(1, 'rgba(0,0,0,.6)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

// --- temalar ---
function drawAfis(ctx: CanvasRenderingContext2D, W: number, H: number, d: ShareData, o: Opts, im: Imgs, pal: Palette) {
  blurredBg(ctx, im.poster, W, H, pal)
  vignette(ctx, W, H, 0.45)
  if (o.fmt === 'yatay') {
    const ph = 820
    const pw = ph * (2 / 3)
    const px = 150
    const py = (H - ph) / 2
    if (im.poster) posterCard(ctx, im.poster, px, py, pw, ph, 26)
    const tx = px + pw + 110
    const tw = W - tx - 140
    header(ctx, im, o, tx, py + 40, 'left')
    textStack(ctx, d, o, pal, tx, py + (headText(o) ? 110 : 40), tw, 'left', { title: 84, lines: 3, meta: 34, quote: 42, quoteLines: 3 })
    brand(ctx, im, W - 140, H - 90, 'right')
    return
  }
  const tall = o.fmt === 'hikaye'
  const pw = tall ? 680 : 470
  const ph = pw * 1.5
  const py = tall ? 280 : 170
  header(ctx, im, o, W / 2, tall ? 160 : 90, 'center')
  if (im.poster) posterCard(ctx, im.poster, (W - pw) / 2, py, pw, ph, 30)
  textStack(ctx, d, o, pal, W / 2, py + ph + (tall ? 60 : 30), W - 180, 'center', tall ? { title: 72, lines: 2, meta: 32, quote: 42, quoteLines: 3 } : { title: 58, lines: 1, meta: 28, quote: 34, quoteLines: 2 })
  brand(ctx, im, W / 2, H - (tall ? 90 : 60), 'center', 'rgba(255,255,255,.7)', tall ? 30 : 26)
}

function drawSahne(ctx: CanvasRenderingContext2D, W: number, H: number, d: ShareData, o: Opts, im: Imgs, pal: Palette) {
  const bgImg = im.cover ?? im.poster
  ctx.fillStyle = pal.deep
  ctx.fillRect(0, 0, W, H)
  const wide = o.fmt === 'yatay'
  const ih = wide ? H : o.fmt === 'hikaye' ? 1500 : 900
  if (bgImg) cover(ctx, bgImg, 0, 0, W, ih, 0.3)
  // görselin altını zemine erit
  const g = ctx.createLinearGradient(0, ih * (wide ? 0.25 : 0.4), 0, ih)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, pal.deep)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, ih + 2)
  if (wide) {
    const lg = ctx.createLinearGradient(0, 0, W * 0.75, 0)
    lg.addColorStop(0, 'rgba(0,0,0,.82)')
    lg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = lg
    ctx.fillRect(0, 0, W, H)
  }
  const tg = ctx.createLinearGradient(0, 0, 0, 260)
  tg.addColorStop(0, 'rgba(0,0,0,.55)')
  tg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = tg
  ctx.fillRect(0, 0, W, 260)
  const x = wide ? 130 : 90
  const tw = wide ? 900 : W - 180
  header(ctx, im, o, x, wide ? 110 : 120, 'left')
  brand(ctx, im, W - (wide ? 130 : 90), wide ? 110 : 120, 'right', 'rgba(255,255,255,.8)', 28)
  // yapımın logosu varsa adı onunla
  const st = wide ? { title: 80, lines: 2, meta: 32, quote: 40, quoteLines: 3 } : o.fmt === 'hikaye' ? { title: 80, lines: 2, meta: 32, quote: 42, quoteLines: 4 } : { title: 64, lines: 2, meta: 28, quote: 34, quoteLines: 2 }
  // yazı bloğunun yüksekliğini önce boş bir tuvalde ölç, alttan hizala
  const scratch = document.createElement('canvas').getContext('2d')!
  const bottom = H - (wide ? 110 : o.fmt === 'hikaye' ? 190 : 90)
  if (im.logo) {
    const [lw, lh] = contain(im.logo, tw * 0.85, wide ? 200 : 240)
    const top = bottom - (textStack(scratch, { ...d, title: '' }, o, pal, x, 0, tw, 'left', st) + 10)
    shadowed(ctx, () => ctx.drawImage(im.logo!, x, top - lh, lw, lh), 30, 6, 0.6)
    textStack(ctx, { ...d, title: '' }, o, pal, x, top + 10, tw, 'left', st)
  } else {
    const top = bottom - textStack(scratch, d, o, pal, x, 0, tw, 'left', st)
    textStack(ctx, d, o, pal, x, top, tw, 'left', st)
  }
}

function drawBilet(ctx: CanvasRenderingContext2D, W: number, H: number, d: ShareData, o: Opts, im: Imgs, pal: Palette) {
  blurredBg(ctx, im.poster, W, H, pal, 0.45)
  vignette(ctx, W, H, 0.5)
  const paper = '#f4efe6'
  const ink = '#14110d'
  const wide = o.fmt === 'yatay'
  // bileti ayrı tuvalde çizip yarım daire kesikleri delerek koy
  const cw = wide ? 1640 : o.fmt === 'hikaye' ? 820 : 760
  const chh = wide ? 720 : o.fmt === 'hikaye' ? 1480 : 1150
  const t = document.createElement('canvas')
  t.width = cw
  t.height = chh
  const c = t.getContext('2d')!
  c.fillStyle = paper
  c.beginPath()
  c.roundRect(0, 0, cw, chh, 28)
  c.fill()
  const stub = wide ? 360 : o.fmt === 'hikaye' ? 300 : 240
  const imgH = wide ? chh : o.fmt === 'hikaye' ? 540 : 400
  const img = im.cover ?? im.poster
  if (img) {
    c.save()
    c.beginPath()
    if (wide) c.roundRect(0, 0, 480, chh, [28, 0, 0, 28])
    else c.roundRect(0, 0, cw, imgH, [28, 28, 0, 0])
    c.clip()
    if (wide) cover(c, im.poster ?? img, 0, 0, 480, chh)
    else cover(c, img, 0, 0, cw, imgH, 0.35)
    c.restore()
  }
  // kesik çizgi ve delikler
  c.globalCompositeOperation = 'destination-out'
  const R = 34
  if (wide) {
    c.beginPath()
    c.arc(cw - stub, 0, R, 0, Math.PI * 2)
    c.arc(cw - stub, chh, R, 0, Math.PI * 2)
    c.fill()
  } else {
    c.beginPath()
    c.arc(0, chh - stub, R, 0, Math.PI * 2)
    c.arc(cw, chh - stub, R, 0, Math.PI * 2)
    c.fill()
  }
  c.globalCompositeOperation = 'source-over'
  c.strokeStyle = 'rgba(20,17,13,.28)'
  c.lineWidth = 3
  c.setLineDash([14, 12])
  c.beginPath()
  if (wide) {
    c.moveTo(cw - stub, R + 10)
    c.lineTo(cw - stub, chh - R - 10)
  } else {
    c.moveTo(R + 10, chh - stub)
    c.lineTo(cw - R - 10, chh - stub)
  }
  c.stroke()
  c.setLineDash([])
  // gövde
  const bx = wide ? 480 + 70 : 64
  const bw = wide ? cw - stub - 480 - 140 : cw - 128
  let y = wide ? 70 : imgH + 50
  c.fillStyle = 'rgba(20,17,13,.5)'
  c.font = `700 ${wide ? 24 : 24}px ${FONT}`
  c.textAlign = 'left'
  c.textBaseline = 'alphabetic'
  const label = (o.head === 'izledi' ? tt('İzlendi') : tt('Bunu izle')).toLocaleUpperCase('tr')
  spaced(c, label, bx, y + 24, 5)
  y += 34
  c.fillStyle = ink
  c.font = `800 ${wide ? 66 : 60}px ${FONT}`
  for (const l of wrap(c, d.title, bw, 2)) {
    y += wide ? 72 : 66
    c.fillText(l, bx, y)
  }
  // alanlar
  const fields: [string, string][] = []
  if (o.show.meta && d.year) fields.push([tt('Yıl'), d.year])
  if (o.show.meta && d.runtime) fields.push([tt('Süre'), d.runtime])
  if (o.show.score && d.score !== null) fields.push([tt('Puan'), `${fmtScore(d.score)} / 10`])
  if (o.show.date && d.watchedOn) fields.push([tt('Tarih'), d.watchedOn])
  if (o.show.meta && d.genres.length) fields.push([tt('Tür'), d.genres.slice(0, 2).join(', ')])
  y += 44
  const cols = wide ? 3 : 2
  const fw = bw / cols
  fields.slice(0, wide ? 6 : 6).forEach(([k, v], i) => {
    const fx = bx + (i % cols) * fw
    const fy = y + Math.floor(i / cols) * 96
    c.fillStyle = 'rgba(20,17,13,.45)'
    c.font = `700 20px ${FONT}`
    spaced(c, k.toLocaleUpperCase('tr'), fx, fy + 20, 3)
    c.fillStyle = ink
    c.font = `700 32px ${FONT}`
    c.fillText(wrap(c, v, fw - 20, 1)[0] ?? '', fx, fy + 62)
  })
  y += Math.ceil(Math.min(fields.length, 6) / cols) * 96
  const q = o.show.quote ? o.quote.trim() : ''
  const limit = wide ? chh - 70 : chh - stub - 40
  if (q && y + 60 < limit) {
    c.fillStyle = 'rgba(20,17,13,.8)'
    c.font = `italic 500 ${wide ? 34 : 34}px ${FONT}`
    for (const l of wrap(c, `“${q}”`, bw, Math.max(1, Math.floor((limit - y - 10) / 46)))) {
      y += 46
      c.fillText(l, bx, y)
    }
  }
  // koçan: barkod, isim, marka
  const sx = wide ? cw - stub : 0
  const sy = wide ? 0 : chh - stub
  const sw = wide ? stub : cw
  const sh = wide ? chh : stub
  const bars = barcode(d.title)
  const barW = wide ? sw - 120 : sw - 260
  const barH = wide ? 120 : 90
  const bx0 = sx + (sw - barW) / 2
  const by0 = wide ? sy + sh - barH - 150 : sy + sh - barH - 60
  let xx = bx0
  c.fillStyle = ink
  for (const b of bars) {
    const bwid = (b % 3) + 1
    if (xx + bwid * 3 > bx0 + barW) break
    if (b % 2 === 0) c.fillRect(xx, by0, bwid * 3, barH)
    xx += bwid * 3 + 4
  }
  c.fillStyle = 'rgba(20,17,13,.6)'
  c.font = `600 26px ${FONT}`
  c.textAlign = 'center'
  const who = o.show.profile && o.name ? o.name : 'ARGUS'
  c.fillText(who, sx + sw / 2, wide ? sy + 120 : sy + 70)
  c.font = `700 22px ${FONT}`
  c.fillStyle = 'rgba(20,17,13,.38)'
  const code = 'NO ' + String(Math.abs(hash(d.title)) % 1000000).padStart(6, '0')
  c.fillText(code, sx + sw / 2, wide ? by0 + barH + 50 : by0 + barH + 38)
  if (wide && im.brand) c.drawImage(im.brand, sx + sw / 2 - 40, sy + 180, 80, 80)
  // tuvale yerleştir
  const tx = (W - cw) / 2
  const ty = wide ? (H - chh) / 2 : o.fmt === 'hikaye' ? 210 : 100
  shadowed(ctx, () => ctx.drawImage(t, tx, ty), 80, 34, 0.65)
  if (!wide) brand(ctx, im, W / 2, ty + chh + (H - ty - chh) / 2, 'center', 'rgba(255,255,255,.7)', 28)
  header(ctx, im, o, W / 2, ty / 2, 'center')
}
function spaced(c: CanvasRenderingContext2D, s: string, x: number, y: number, sp: number) {
  let cx = x
  for (const ch of s) {
    c.fillText(ch, cx, y)
    cx += c.measureText(ch).width + sp
  }
}
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h
}
function barcode(s: string) {
  let h = hash(s || 'argus') >>> 0
  return Array.from({ length: 80 }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    h = (h ^ (h >>> 13)) >>> 0
    return h % 6
  })
}

function drawSade(ctx: CanvasRenderingContext2D, W: number, H: number, d: ShareData, o: Opts, im: Imgs, pal: Palette) {
  ctx.fillStyle = pal.soft
  ctx.fillRect(0, 0, W, H)
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, 'rgba(255,255,255,.06)')
  g.addColorStop(1, 'rgba(0,0,0,.35)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const wide = o.fmt === 'yatay'
  const x = wide ? 130 : 90
  // afiş sağ altta, kenardan taşarak
  if (im.poster) {
    const pw = wide ? 640 : o.fmt === 'hikaye' ? 700 : 520
    const ph = pw * 1.5
    const px = W - pw + (wide ? -120 : 110)
    const py = wide ? 150 : H - ph * (o.fmt === 'hikaye' ? 0.82 : 0.72)
    ctx.save()
    ctx.translate(px + pw / 2, py + ph / 2)
    ctx.rotate(wide ? 0.035 : 0.06)
    posterCard(ctx, im.poster, -pw / 2, -ph / 2, pw, ph, 24)
    ctx.restore()
  }
  header(ctx, im, o, x, wide ? 120 : 130, 'left', 'rgba(255,255,255,.85)', 34)
  const tw = wide ? 900 : W - 180
  const top = wide ? 210 : 230
  // büyük başlık
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const size = wide ? 112 : o.fmt === 'hikaye' ? 120 : 96
  ctx.font = `900 ${size}px ${FONT}`
  let y = top
  for (const l of wrap(ctx, d.title, tw, 3)) {
    y += size * 0.98
    ctx.fillText(l, x, y)
  }
  ctx.fillStyle = pal.accent
  ctx.fillRect(x, y + 40, 110, 8)
  textStack(ctx, { ...d, title: '' }, o, pal, x, y + 40, wide ? 760 : o.fmt === 'hikaye' ? 640 : 520, 'left', wide ? { title: 0, lines: 0, meta: 32, quote: 40, quoteLines: 4 } : { title: 0, lines: 0, meta: 32, quote: 40, quoteLines: o.fmt === 'hikaye' ? 5 : 2 })
  brand(ctx, im, x, H - (wide ? 100 : 100), 'left', 'rgba(255,255,255,.8)', 28)
}

async function render(cv: HTMLCanvasElement, d: ShareData, o: Opts, im: Imgs, pal: Palette) {
  const [W, H] = SIZES[o.fmt]
  if (cv.width !== W) cv.width = W
  if (cv.height !== H) cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, W, H)
  ctx.save()
  if (o.theme === 'afis') drawAfis(ctx, W, H, d, o, im, pal)
  else if (o.theme === 'sahne') drawSahne(ctx, W, H, d, o, im, pal)
  else if (o.theme === 'bilet') drawBilet(ctx, W, H, d, o, im, pal)
  else drawSade(ctx, W, H, d, o, im, pal)
  ctx.restore()
}

type Saved = { fmt: Fmt; theme: Theme; head: Head; show: Show }
const DEFAULTS: Saved = { fmt: 'hikaye', theme: 'afis', head: 'oneri', show: { score: true, quote: true, profile: true, meta: true, date: false } }
function readSaved(): Saved {
  try {
    const j = JSON.parse(localStorage.getItem(PREF) ?? 'null')
    if (j && typeof j === 'object') return { ...DEFAULTS, ...j, show: { ...DEFAULTS.show, ...(j.show ?? {}) } }
  } catch {
    /* varsayılanlar */
  }
  return DEFAULTS
}

const FMTS: { v: Fmt; label: string; w: number; h: number }[] = [
  { v: 'hikaye', label: tt('Hikâye'), w: 9, h: 16 },
  { v: 'gonderi', label: tt('Gönderi'), w: 4, h: 5 },
  { v: 'yatay', label: tt('Yatay'), w: 16, h: 9 },
]
const THEMES: { v: Theme; label: string; hint: string }[] = [
  { v: 'afis', label: tt('Afiş'), hint: tt('Afişin ortada, zemin onun renginde') },
  { v: 'sahne', label: tt('Sahne'), hint: tt('Yapımın geniş görseli ve logosu') },
  { v: 'bilet', label: tt('Bilet'), hint: tt('Sinema bileti gibi') },
  { v: 'sade', label: tt('Sade'), hint: tt('Düz renk, büyük yazı') },
]
const HEADS: { v: Head; label: string }[] = [
  { v: 'oneri', label: tt('Öneriyorum') },
  { v: 'izledi', label: tt('İzledim') },
  { v: 'yok', label: tt('Yok') },
]

export default function ShareCard({ data, onClose }: { data: ShareData; onClose: () => void }) {
  const { activeProfile } = useProfiles()
  const { notify } = useToast()
  const [saved, setSaved] = useState<Saved>(readSaved)
  const [quote, setQuote] = useState('')
  const [im, setIm] = useState<Imgs | null>(null)
  const [pal, setPal] = useState<Palette>(() => palette(null))
  const cv = useRef<HTMLCanvasElement>(null)
  useEscape(true, onClose)
  const name = activeProfile?.username ?? ''
  const photo = activeProfile?.photo ?? ''

  useEffect(() => {
    let alive = true
    void Promise.all([load(data.poster), load(data.cover), load(data.logo), load(photo), load('/logoblue.png'), averageColor(data.poster || data.cover)]).then(([poster, cov, logo, avatar, brandImg, rgb]) => {
      if (!alive) return
      setIm({ poster, cover: cov, logo, avatar, brand: brandImg })
      setPal(palette(rgb))
    })
    return () => {
      alive = false
    }
  }, [data.poster, data.cover, data.logo, photo])

  useEffect(() => {
    try {
      localStorage.setItem(PREF, JSON.stringify(saved))
    } catch {
      /* hatırlanmasa da olur */
    }
  }, [saved])

  useEffect(() => {
    if (!cv.current || !im) return
    const run = () => cv.current && void render(cv.current, data, { ...saved, quote, name, photo }, im, pal)
    run()
    // Inter yüklenince bir daha çiz (ilk çizim yedek yazı tipiyle olmuş olabilir)
    void document.fonts?.ready.then(run)
  }, [data, saved, quote, name, photo, im, pal])

  const fileName = `ARGUS - ${data.title.replace(/[\\/:*?"<>|]/g, '')}.png`
  function blob(): Promise<Blob | null> {
    return new Promise((res) => (cv.current ? cv.current.toBlob(res, 'image/png') : res(null)))
  }
  async function download() {
    const b = await blob()
    if (!b) return notify(tt('Kart hazırlanamadı.'), 'danger')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    notify(tt('Kart İndirilenler klasörüne kaydedildi.'), 'success')
  }
  async function copy() {
    try {
      const b = await blob()
      if (!b) throw new Error('blob')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })])
      notify(tt('Kart panoya kopyalandı, bir sohbete yapıştırabilirsin.'), 'success')
    } catch {
      notify(tt('Panoya kopyalanamadı, indirmeyi dene.'), 'danger')
    }
  }
  async function share() {
    const b = await blob()
    if (!b) return
    const file = new File([b], fileName, { type: 'image/png' })
    try {
      await navigator.share({ files: [file], title: data.title })
    } catch {
      /* vazgeçildi */
    }
  }
  const canShare = typeof navigator.canShare === 'function' && (() => {
    try {
      return navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] })
    } catch {
      return false
    }
  })()

  const set = (p: Partial<Saved>) => setSaved((s) => ({ ...s, ...p }))
  const toggle = (k: keyof Show) => setSaved((s) => ({ ...s, show: { ...s.show, [k]: !s.show[k] } }))
  const [W, H] = SIZES[saved.fmt]
  const seg = (on: boolean) =>
    `rounded-lg px-3 py-2 text-xs font-medium transition border ${on ? 'border-[#00c0fa]/70 bg-[#00c0fa]/10 text-white' : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'}`
  const SHOWS: { k: keyof Show; label: string; off?: boolean }[] = [
    { k: 'score', label: tt('Puanım'), off: data.score === null },
    { k: 'meta', label: tt('Yıl, süre, tür') },
    { k: 'date', label: tt('İzleme tarihim'), off: !data.watchedOn },
    { k: 'profile', label: tt('Profilim') },
    { k: 'quote', label: tt('Tek cümlem') },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-6" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-[1400px] items-center justify-center gap-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-1 items-center justify-center" style={{ height: 'calc(100vh - 48px)' }}>
          <canvas
            ref={cv}
            width={W}
            height={H}
            className="rounded-2xl shadow-2xl shadow-black/80 ring-1 ring-white/10 transition-opacity"
            style={{ maxHeight: '100%', maxWidth: '100%', aspectRatio: `${W} / ${H}`, opacity: im ? 1 : 0 }}
          />
        </div>
        <div className="w-80 shrink-0 max-h-[calc(100vh-48px)] overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950/90 p-5 space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-neutral-50">{tt('Paylaş')}</h3>
            <p className="mt-0.5 text-xs text-neutral-500 truncate">{data.title}</p>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{tt('Biçim')}</p>
            <div className="grid grid-cols-3 gap-2">
              {FMTS.map((f) => (
                <button key={f.v} onClick={() => set({ fmt: f.v })} className={`${seg(saved.fmt === f.v)} flex flex-col items-center gap-1.5`}>
                  <span className="flex h-7 items-center">
                    <span className="block rounded-[3px] border-[1.5px] border-current" style={{ width: f.w > f.h ? 26 : (26 * f.w) / f.h, height: f.w > f.h ? (26 * f.h) / f.w : 26 }} />
                  </span>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{tt('Tema')}</p>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => (
                <button key={t.v} onClick={() => set({ theme: t.v })} title={t.hint} className={`${seg(saved.theme === t.v)} text-left`}>
                  <span className="block text-[13px]">{t.label}</span>
                  <span className="block text-[10.5px] font-normal text-neutral-500 leading-snug mt-0.5">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{tt('Üst yazı')}</p>
            <div className="flex gap-2">
              {HEADS.map((h) => (
                <button key={h.v} onClick={() => set({ head: h.v })} className={`${seg(saved.head === h.v)} flex-1`}>
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{tt('Kartta görünsün')}</p>
            <div className="flex flex-wrap gap-1.5">
              {SHOWS.filter((s) => !s.off).map((s) => (
                <button
                  key={s.k}
                  onClick={() => toggle(s.k)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${saved.show[s.k] ? 'border-[#00c0fa]/60 bg-[#00c0fa]/10 text-white' : 'border-neutral-800 text-neutral-500 hover:text-neutral-300'}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${saved.show[s.k] ? 'bg-[#00c0fa]' : 'bg-neutral-700'}`} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {saved.show.quote && (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{tt('Tek cümlen')}</span>
              <textarea
                value={quote}
                onChange={(e) => setQuote(e.target.value.slice(0, 140))}
                rows={3}
                className="mt-2 w-full resize-none rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]/70"
                placeholder={tt('ör. Sonu aklından çıkmayacak.')}
              />
              <span className="mt-1 block text-right text-[10px] text-neutral-600">{quote.length}/140</span>
            </label>
          )}

          <div className="space-y-2 pt-1">
            <button onClick={() => void download()} className="w-full rounded-lg bg-[#00c0fa] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#33cdfb] transition">
              {tt('PNG olarak indir')}
            </button>
            <div className="flex gap-2">
              <button onClick={() => void copy()} className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 transition">
                {tt('Panoya kopyala')}
              </button>
              {canShare && (
                <button onClick={() => void share()} className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 transition">
                  {tt('Gönder…')}
                </button>
              )}
            </div>
            <button onClick={onClose} className="w-full rounded-lg px-4 py-2 text-sm text-neutral-500 hover:text-neutral-300 transition">
              {tt('Kapat')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
