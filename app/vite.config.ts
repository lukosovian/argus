import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Geliştirici bilgisayarındaki "vite build --watch" (bkz. start.mjs) her yeniden paketlemede dist/'i
  // boşaltınca ARGUS o an açılırsa index.html bulunamıyordu (ENOENT). İzlerken klasör boşaltılmıyor.
  build: { emptyOutDir: !process.argv.includes('--watch') },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/medya': 'http://localhost:4000',
    },
  },
})
