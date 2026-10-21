import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // إذا VITE_API_URL مضبوط → لا نحتاج Proxy (الفرونت يتصل بالباكنند مباشرة)
  // إذا VITE_API_URL فارغ → نستخدم Proxy لـ localhost:5000
  const useProxy = !env.VITE_API_URL

  return {
    plugins: [react()],
    server: {
      port: 5173,
      allowedHosts: true,
      ...(useProxy && {
        proxy: {
          '/api': {
            target: 'http://localhost:5000',
            changeOrigin: true,
            secure: false,
          }
        }
      })
    }
  }
})
