// ARGUS'u başlatır (ARGUS.bat → "npm start"). Kullanıcı "hız artışı" istedi: ölçümde asıl yavaşlığın
// geliştirme modu (tarayıcının yüzlerce ayrı kod dosyasını her açılışta tek tek yükleyip çevirmesi)
// olduğu görüldü — arşiv tablosu açılışı ~2,8 sn → ~1,8 sn, detay penceresi 144 → 77 ms.
// Bu yüzden önce arayüz paketleniyor (~3 sn), sonra sunucu hem API'yi (4000) hem paketli arayüzü
// (5173) sunuyor. Paketleme herhangi bir sebeple başarısız olursa eskisi gibi geliştirme modunda açılır.
// Geliştirici bilgisayarında (.gelistirici) kod değiştikçe paket kendini yeniler (vite build --watch).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const devMachine = fs.existsSync(path.join(here, '..', '.gelistirici'))
const run = (cmd, env = {}) => spawn(cmd, { cwd: here, stdio: 'inherit', shell: true, env: { ...process.env, ...env } })

console.log('Arayüz hazırlanıyor...')
const build = spawnSync('npx vite build --logLevel warn', { cwd: here, stdio: 'inherit', shell: true })

if (build.status === 0) {
  run('node server/index.js', { ARGUS_SERVE_UI: '1' })
  if (devMachine) run('npx vite build --watch --logLevel warn')
} else {
  console.log('Paketleme başarısız oldu, geliştirme modunda açılıyor...')
  run('npx concurrently -n vite,sunucu -c blue,green "vite" "node server/index.js"')
}
