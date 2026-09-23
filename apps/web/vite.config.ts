import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '')
  return {
    plugins: [vue(), tailwindcss()],
    server: {
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      // Same-origin in dev, like Caddy in prod: cookies just work.
      proxy: { '/api': `http://localhost:${env.API_PORT || 3000}` },
    },
    test: {
      environment: 'happy-dom',
    },
  }
})
