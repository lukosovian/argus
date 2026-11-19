// Express uygulaması ve ortak ara katmanlar (erişim kontrolü, gövde ayrıştırma, medya). Rota dosyaları bunu içe aktarıp kendini kaydeder.
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import fs from 'node:fs'
import { stt } from './lang.js'
import { checkRemote, isLoopback, opDedupeMiddleware } from './sync.js'
import { MEDYA_DIR } from './storage.js'

export const app = express()

// Express 4, async bir işleyicide çıkan hatayı yakalamıyor: istek cevapsız kalıyordu (ör. TMDB'ye ulaşılamayınca
// tmdb-genres, /api/features, evren-sezonlar, /api/mobile/qr). Bütün rotalar bu sarmalayıcıdan geçiyor —
// hata en alttaki hata işleyicisine gider, arayüze anlaşılır bir mesaj döner.
export function wrapAsync(h) {
  if (typeof h !== 'function' || h.length >= 4) return h
  return function (req, res, next) {
    const r = h(req, res, next)
    if (r && typeof r.then === 'function') r.catch(next)
  }
}
for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
  const orig = app[m].bind(app)
  app[m] = (p, ...handlers) => (handlers.length === 0 ? orig(p) : orig(p, ...handlers.map(wrapAsync)))
}
// Sadece ARGUS'un kendi arayüzü (bu bilgisayardaki localhost) erişebilsin. Eskiden herkese açıktı:
// ARGUS açıkken tarayıcıda açılan herhangi bir site arka planda kayıt silebilirdi; ağdaki başka bir
// cihaz da ulaşabilirdi.
export const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i
export const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i
// Telefon (ARGUS Android) eşleştirme anahtarıyla ağdan da bağlanabiliyor — bkz. sync.js. "Bu bilgisayar"
// sayılmak için isteğin gerçekten bu bilgisayardan gelmesi (soket adresi) de gerekiyor: Host başlığını
// ağdaki biri "localhost" diye yazabilirdi.
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (isLoopback(req) && LOCAL_HOST.test(req.headers.host || '') && (!origin || LOCAL_ORIGIN.test(origin))) return next()
  const ok = isLoopback(req) ? stt('Bu adresten ARGUS\'a erişilemez.') : checkRemote(req)
  if (ok === true) return next()
  return res.status(403).json({ error: ok })
})
app.use(cors({ origin: LOCAL_ORIGIN }))
app.use(compression())
app.use(express.json({ limit: '15mb' }))
app.use(opDedupeMiddleware)
// Kimlikler dosya yoluna giriyor — "../" gibi bir şeyle başka bir dosyaya ulaşılamasın.
export const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/
for (const p of ['profileId', 'boardId']) {
  app.param(p, (req, res, next, v) => (SAFE_ID.test(String(v)) ? next() : res.status(400).json({ error: 'id' })))
}
app.param('id', (req, res, next, v) => (req.path.startsWith('/api/profiles/') && !SAFE_ID.test(String(v)) ? res.status(400).json({ error: 'id' }) : next()))
// Eskiden (v1.14.4 öncesi) TMDB'nin SVG logoları da .png adıyla kaydediliyordu; tarayıcı PNG sanıp açamıyor,
// kırık görsel çıkıyordu (ör. Stranger Things). Böyle dosyalar içine bakılarak SVG olarak gönderiliyor —
// "Güncelle"ye basmadan da, veriye dokunmadan düzelsin. Sonuç dosyanın değişme zamanıyla birlikte saklanıyor.
export const svgSniff = new Map()
export function isSvgDisguised(filePath, mtimeMs) {
  const hit = svgSniff.get(filePath)
  if (hit && hit.mtimeMs === mtimeMs) return hit.svg
  let svg = false
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(256)
    const n = fs.readSync(fd, buf, 0, 256, 0)
    fs.closeSync(fd)
    svg = buf.subarray(0, n).toString('utf-8').trimStart().startsWith('<')
  } catch {
    svg = false
  }
  svgSniff.set(filePath, { mtimeMs, svg })
  return svg
}
app.use(
  '/medya',
  express.static(MEDYA_DIR, {
    setHeaders(res, filePath, stat) {
      if (/\.png$/i.test(filePath) && isSvgDisguised(filePath, stat.mtimeMs)) res.setHeader('Content-Type', 'image/svg+xml')
    },
  }),
)
