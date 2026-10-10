import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5198, strictPort: true, proxy: { '/api': 'http://localhost:4124', '/medya': 'http://localhost:4124' } },
})
