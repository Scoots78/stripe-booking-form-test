import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Use esbuild (default) for minification to avoid requiring the optional `terser` dependency
    minify: 'esbuild',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@stripe/react-stripe-js', '@stripe/stripe-js', 'axios'],
  }
})
