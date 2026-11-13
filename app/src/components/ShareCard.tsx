import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProfiles } from '../hooks/useProfiles'
import { useEscape } from '../hooks/useEscape'
import { tt } from '../lib/i18n'

// Ekstralar › "Bunu izle!" kartı (v1.23.4): tek bir yapım için, hikâyeye uygun dikey (1080×1920) PNG — bulanık afiş
// zemini, afiş, ad, puan, tek cümlen ve profilin. İndirilenler klasörüne kaydedilir.

const W = 1080
const H = 1920

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

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/)) {
    const t = line ? line + ' ' + w : w
    if (ctx.measureText(t).width > maxW && line) {
      out.push(line)
      line = w
    } else line = t
  }
  if (line) out.push(line)
  return out
}

async function draw(cv: HTMLCanvasElement, o: { poster: string; title: string; score: number | null; quote: string; name: string; photo: string }) {
  const ctx = cv.getContext('2d')!
  const [p, av, logo] = await Promise.all([load(o.poster), load(o.photo), load('/logoblue.png')])
  ctx.fillStyle = '#0b0b0f'
  ctx.fillRect(0, 0, W, H)
  if (p) {
    ctx.save()
    ctx.filter = 'blur(60px) brightness(.5) saturate(1.4)'
    ctx.drawImage(p, -200, -200, W + 400, H + 400)
    ctx.restore()
  }
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, 'rgba(0,0,0,.15)')
  g.addColorStop(1, 'rgba(0,0,0,.65)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // üst: profil
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 44px Inter, sans-serif'
  const label = tt('{0} öneriyor', o.name)
  const lw = ctx.measureText(label).width
  const x0 = W / 2 - (lw + 90) / 2
  if (av) {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x0, 120, 72, 72, 20)
    ctx.clip()
    ctx.drawImage(av, x0, 120, 72, 72)
    ctx.restore()
  }
  ctx.fillStyle = '#e5e7eb'
  ctx.textAlign = 'left'
  ctx.fillText(label, x0 + 90, 157)
  ctx.textAlign = 'center'
  // afiş
  const pw = 640
  const ph = 960
  const py = 260
  if (p) {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.7)'
    ctx.shadowBlur = 80
    ctx.shadowOffsetY = 30
    ctx.beginPath()
    ctx.roundRect((W - pw) / 2, py, pw, ph, 36)
    ctx.fillStyle = '#000'
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.beginPath()
    ctx.roundRect((W - pw) / 2, py, pw, ph, 36)
    ctx.clip()
    ctx.drawImage(p, (W - pw) / 2, py, pw, ph)
    ctx.restore()
  }
  let y = py + ph + 110
  ctx.fillStyle = '#fff'
  ctx.font = '900 76px Inter, sans-serif'
  for (const l of wrap(ctx, o.title, W - 160).slice(0, 2)) {
    ctx.fillText(l, W / 2, y)
    y += 88
  }
  if (o.score !== null) {
    ctx.fillStyle = '#86efac'
    ctx.font = '800 54px Inter, sans-serif'
    ctx.fillText(`★ ${o.score.toFixed(1).replace('.', ',')} / 10`, W / 2, y + 10)
    y += 90
  }
  if (o.quote.trim()) {
    ctx.fillStyle = '#e5e7eb'
    ctx.font = 'italic 500 46px Inter, sans-serif'
    for (const l of wrap(ctx, `“${o.quote.trim()}”`, W - 200).slice(0, 3)) {
      ctx.fillText(l, W / 2, y + 20)
      y += 62
    }
  }
  if (logo) ctx.drawImage(logo, W / 2 - 110, H - 130, 56, 56)
  ctx.fillStyle = '#d4d4d8'
  ctx.font = '800 40px Inter, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('ARGUS', W / 2 - 40, H - 101)
}

export default function ShareCard({ poster, title, score, onClose }: { poster: string; title: string; score: number | null; onClose: () => void }) {
  const { activeProfile } = useProfiles()
  const [quote, setQuote] = useState('')
  const cv = useRef<HTMLCanvasElement>(null)
  useEscape(true, onClose)
  useEffect(() => {
    if (cv.current) void draw(cv.current, { poster, title, score, quote, name: activeProfile?.username ?? '', photo: activeProfile?.photo ?? '' })
  }, [poster, title, score, quote, activeProfile])
  function save() {
    cv.current?.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `ARGUS - ${title}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }, 'image/png')
  }
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="flex flex-wrap items-center justify-center gap-6" onClick={(e) => e.stopPropagation()}>
        <canvas ref={cv} width={W} height={H} className="h-[78vh] w-auto rounded-3xl shadow-2xl shadow-black" />
        <div className="w-72 space-y-3">
          <h3 className="text-xl font-bold text-neutral-50">{tt('"Bunu izle!" kartı')}</h3>
          <label className="block">
            <span className="text-xs text-neutral-400">{tt('Tek cümlen (isteğe bağlı)')}</span>
            <textarea value={quote} onChange={(e) => setQuote(e.target.value.slice(0, 120))} rows={3} className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[#00c0fa]" placeholder={tt('ör. Kaçırma!')} />
          </label>
          <button onClick={save} className="w-full text-sm font-semibold rounded-lg px-4 py-2.5 text-white" style={{ background: 'linear-gradient(90deg,#059669,#34d399)' }}>
            {tt('PNG olarak indir')}
          </button>
          <button onClick={onClose} className="w-full text-sm rounded-lg px-4 py-2 border border-neutral-700 text-neutral-300">
            {tt('Kapat')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
