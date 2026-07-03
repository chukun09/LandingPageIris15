import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../wwwroot',
    emptyOutDir: false, // Do not delete wwwroot/uploads directory
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5062',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5062',
        changeOrigin: true,
      }
    }
  }
})
