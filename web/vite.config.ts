import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// Backend (daptin) the dev server proxies to. Override with DAPTIN_URL.
const backend = process.env.DAPTIN_URL ?? 'http://127.0.0.1:6336'

// Proxied so the browser sees a single origin during development and the
// backend needs no CORS configuration.
const backendPaths = ['/api', '/action', '/jsmodel', '/aggregate', '/_config', '/ping', '/ready']

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      backendPaths.map((path) => [path, { target: backend, changeOrigin: true }]),
    ),
  },
})
