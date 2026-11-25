// Telefon cihazları (v1.26, G3) — eşleştirmenin kendisi sync.js'te. Burada:
//   - "Bütün telefonların bağlantısını kes": bütün anahtarlar geçersiz olur; telefonlar bir dahaki bağlanışta
//     "Bu cihaz ARGUS'a bağlı değil" görür ve yeniden eşleşmeleri gerekir (telefon kaybolduysa / değiştiyse).
//   - QR ile eşleştirme: PC'de kod gösterilirken telefonun "Kodu kamerayla okut" düğmesiyle okuyacağı QR
//     (argus://pair?host=<PC'nin ağ adresi>&port=<port>&code=<kod>). Telefon bunu okuyup var olan eşleştirmeyi çalıştırır.
// İkisi de sadece bu bilgisayardan (sync.js LOCAL_ONLY: /api/sync/devices, /api/sync/pair-code).
import path from 'node:path'
import QRCode from 'qrcode'
import { app } from '../app.js'
import { DATA_DIR, rawWriteJson, readJson } from '../storage.js'

const devicesFile = () => path.join(DATA_DIR, 'devices.json')

app.delete('/api/sync/devices', (req, res) => {
  const list = readJson(devicesFile(), [])
  rawWriteJson(devicesFile(), [])
  res.json({ ok: true, removed: Array.isArray(list) ? list.length : 0 })
})

app.get('/api/sync/pair-code/qr', async (req, res) => {
  const host = String(req.query.host ?? '').replace(/[^0-9.]/g, '')
  const code = String(req.query.code ?? '').replace(/\D/g, '').slice(0, 6)
  if (!host || code.length !== 6) return res.status(400).end()
  const port = Number(process.env.PORT) || 4000
  const svg = await QRCode.toString(`argus://pair?host=${host}&port=${port}&code=${code}`, {
    type: 'svg',
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })
  res.setHeader('Content-Type', 'image/svg+xml')
  res.setHeader('Cache-Control', 'no-store')
  res.send(svg)
})
