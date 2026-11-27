import { TICKET_RATIO } from './Ticket'

// O3 (v1.27): bileti PNG olarak indir / panoya kopyala. Paylaşım görselleri (ShareCard, Koleksiyon "Görsel oluştur")
// tuvale elle çiziliyor; ama bilet dört tasarımlı, maskeli, karışım modlu bir HTML — tuvalde yeniden çizmek yerine
// ekrandaki biletin kopyası bir SVG'nin (foreignObject) içine konup tuvale basılır. Sayfanın stilleri ve Inter yazı
// tipi SVG'nin içine gömülür; görseller veri adresine çevrilir (yoksa SVG görseli dış dosyaları yükleyemez).
// Electron'da <a download> sormadan İndirilenler'e kaydeder (desktop/main.cjs › will-download).

async function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })
}

// Ekranda zaten yüklü görselden (aynı adres / izinli dış adres) ya da yeniden indirerek veri adresi
async function imgData(live: HTMLImageElement | undefined, src: string): Promise<string | null> {
  if (!src || src.startsWith('data:')) return src || null
  if (live?.complete && live.naturalWidth) {
    try {
      const c = document.createElement('canvas')
      c.width = live.naturalWidth
      c.height = live.naturalHeight
      c.getContext('2d')!.drawImage(live, 0, 0)
      return c.toDataURL('image/png')
    } catch {
      /* tuval kirlendi: indirerek dene */
    }
  }
  try {
    const r = await fetch(src, { mode: 'cors' })
    if (!r.ok) return null
    return await toDataUrl(await r.blob())
  } catch {
    return null
  }
}

let fontCss: Promise<string> | null = null
function interFontCss(): Promise<string> {
  fontCss ??= (async () => {
    const files = ['/fonts/inter-latin-wght-normal.woff2', '/fonts/inter-latin-ext-wght-normal.woff2']
    const out: string[] = []
    for (const f of files) {
      try {
        const r = await fetch(f)
        if (r.ok) out.push(`@font-face{font-family:'Inter';font-weight:100 900;src:url('${await toDataUrl(await r.blob())}') format('woff2');}`)
      } catch {
        /* yedek yazı tipi */
      }
    }
    return out.join('\n')
  })()
  return fontCss
}

// Sayfadaki bütün stil kuralları (Tailwind dahil); yazı tipi tanımları hariç — onlar gömülü haliyle eklenir
function pageCss(): string {
  const out: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const r of Array.from(rules)) if (!(r instanceof CSSFontFaceRule)) out.push(r.cssText)
  }
  return out.join('\n')
}

// face: ekrandaki biletin bir yüzünün kök öğesi (TicketFront / TicketBack). width: PNG'nin genişliği (CSS piksel); scale ile netlik.
export async function ticketPng(face: HTMLElement, width = 1200, scale = 2): Promise<Blob> {
  const height = Math.round(width / TICKET_RATIO)
  const clone = face.cloneNode(true) as HTMLElement
  // Fareyle oynatınca çıkan ışık katmanı görsele girmesin
  clone.querySelectorAll('.bilet-glare').forEach((el) => el.remove())
  const liveImgs = Array.from(face.querySelectorAll('img'))
  const imgs = Array.from(clone.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img, i) => {
      const d = await imgData(liveImgs[i], img.getAttribute('src') ?? '')
      img.removeAttribute('srcset')
      img.removeAttribute('loading')
      if (d) img.setAttribute('src', d)
      else img.remove()
    }),
  )
  // Satır içi stildeki dış görseller (url(...)) de veri adresine
  const styled = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('[style]'))]
  await Promise.all(
    styled.map(async (el) => {
      const st = el.getAttribute('style') ?? ''
      const urls = [...st.matchAll(/url\(["']?((?!data:)[^"')]+)["']?\)/g)].map((m) => m[1])
      let next = st
      for (const u of urls) {
        const d = await imgData(undefined, u)
        next = next.split(u).join(d ?? '')
      }
      if (next !== st) el.setAttribute('style', next)
    }),
  )
  const wrap = document.createElement('div')
  wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  wrap.setAttribute('style', `width:${width}px;height:${height}px;font-size:${width / 48}px;position:relative;font-family:'Inter',system-ui,sans-serif;font-feature-settings:'cv11','ss01';color:#fff;`)
  const style = document.createElement('style')
  style.textContent = `${await interFontCss()}\n${pageCss()}`
  wrap.appendChild(style)
  clone.style.width = '100%'
  clone.style.height = '100%'
  wrap.appendChild(clone)
  const xml = new XMLSerializer().serializeToString(wrap)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${xml}</foreignObject></svg>`
  const img = new Image()
  img.decoding = 'sync'
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('svg'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
  // İçteki görseller ilk çizimde bazen boş kalıyor: çözülmesi beklenir
  await img.decode().catch(() => {})
  const c = document.createElement('canvas')
  c.width = width * scale
  c.height = height * scale
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  if (!blob) throw new Error('png')
  return blob
}

export function ticketFileName(title: string, side: 'front' | 'back') {
  return `ARGUS Bilet - ${(title || 'bilet').replace(/[\\/:*?"<>|]/g, '').slice(0, 80)}${side === 'back' ? ' (arka)' : ''}.png`
}
